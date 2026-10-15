// Crop dusting (the owner, 2026-10-14: "the farm should have a small farm runway or two for crop dusters for the crop
// duster missions"). Taken from the phone's job list (Flying): the co-op's crop duster (shared/vehicles.js duster) is
// issued at the nearest farm strip - an airstrip of World v3b's farm valley (a nature site of kind 'airstrip' marked
// `duster`: shared/world3-airstrips.js), else the nearest airstrip, else the airport's apron. A contract is DUST.fields
// crop patches near the strip (shared/rules.js DUST; found from the built map's crop tiles, never coordinates): fly over
// them low and fast enough - airborne, no higher than DUST.alt over the ground - and the spray goes down under the wing
// (the clients draw the mist: the damage word's top byte, bit 6 - net.js); the pieces of crop under the swath are
// sprayed. A patch is done at DUST.cover of its crop pieces (DUST.pay each), the lot pays DUST.bonus more if the plane
// came through it with no more than DUST.hurtHp lost, and then the plane's to go back to its strip (jobs.js returnTruck:
// the work truck's return bonus). A farm row (farming.js) sprayed while it's sown grows DUST.boost of the way at once.
//   update(world, dt)       the contracts (world.js SYSTEMS)
//   start(world, p)         sign on -> error | null
//   target(world, p, j)     the job tracker's target (phone.js jobTarget)
//   stripFor(world, x, y)   the strip a contract would start from (the phone's list), or null
//   patchesOf(m)            [{ x, y, w, h (px), cx, cy, subs: [bool crop] }] the crop patches (once per map)
import { K, T, TILE } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/mapcore.js';
import { airfields, findPadSpot, floorAt, FLY } from '../../shared/flight.js';
import { DUST } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';
import { rowAt, ROW } from './farming.js';

const rng = mulberry32(6464);
const SPRAY_BIT = 64;   // (the damage word's top byte: bit 7 is the police searchlight's - policeair.js)

// ---- the crop patches (once per map; nothing added to the map) ----------------------------------------------------------
const PATCHES = new WeakMap();
export function patchesOf(m) {
  let L = PATCHES.get(m);
  if (L) return L;
  L = [];
  const C = DUST.cell, S = DUST.subs, sub = C / S;
  const x0 = m.x0 || 0, y0 = m.y0 || 0;
  for (let cy = Math.floor(y0 / C); (cy + 1) * C <= y0 + m.h; cy++) {
    for (let cx = Math.floor(x0 / C); (cx + 1) * C <= x0 + m.w; cx++) {
      let crop = 0;
      const subs = new Array(S * S).fill(false);
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        let n = 0;
        for (let ty = cy * C + sy * sub; ty < cy * C + (sy + 1) * sub; ty++) {
          const row = m.row(ty);
          for (let tx = cx * C + sx * sub; tx < cx * C + (sx + 1) * sub; tx++) if (m.inside(tx, ty) && m.tiles[row + m.col(tx)] === T.FIELD) n++;
        }
        if (n >= sub * sub * 0.5) { subs[sy * S + sx] = true; crop++; }
      }
      if (crop < S * S * DUST.minCrop) continue;
      const x = cx * C * TILE, y = cy * C * TILE, w = C * TILE;
      L.push({ x, y, w, h: w, cx: x + w / 2, cy: y + w / 2, subs, crop });
    }
  }
  PATCHES.set(m, L);
  return L;
}

// ---- the strip a contract starts from ---------------------------------------------------------------------------------
const FARM_STRIP = (s) => s.kind === 'airstrip' && s.duster;
export function stripFor(world, x, y) {
  const m = world.map, P = patchesOf(m);
  if (!P.length) return null;
  const d2 = (q) => (q.x - x) ** 2 + (q.y - y) ** 2;
  const cand = [];
  for (const s of m.natureSites || []) if (s.kind === 'airstrip') cand.push({ x: s.x, y: s.y, name: s.name, farm: FARM_STRIP(s), strip: s.strip || null });
  if (!cand.length) for (const a of airfields(m).aprons) cand.push({ x: a.x, y: a.y, name: a.name, farm: false, strip: null });
  // a strip with crops in reach; the farm strips first, then the nearest
  const ok = cand.filter((c) => P.some((q) => Math.hypot(q.cx - c.x, q.cy - c.y) < DUST.range));
  if (!ok.length) return null;
  const farm = ok.filter((c) => c.farm);
  return (farm.length ? farm : ok).reduce((a, b) => (d2(b) < d2(a) ? b : a));
}
// the compass word for where b lies from a
function compass(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, ns = dy < -Math.abs(dx) * 0.4 ? 'north' : dy > Math.abs(dx) * 0.4 ? 'south' : '', ew = dx > Math.abs(dy) * 0.4 ? 'east' : dx < -Math.abs(dy) * 0.4 ? 'west' : '';
  return ns + ew || 'by';
}

// ---- signing on ------------------------------------------------------------------------------------------------------------
export function start(world, p) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const m = world.map, ped = p.ped;
  const S = stripFor(world, ped.x, ped.y);
  if (!S) return 'No dusting work around here.';
  // the contract: DUST.fields patches in reach of the strip, picked among the nearest, spread apart
  const near = patchesOf(m).filter((q) => Math.hypot(q.cx - S.x, q.cy - S.y) < DUST.range).sort((a, b) => Math.hypot(a.cx - S.x, a.cy - S.y) - Math.hypot(b.cx - S.x, b.cy - S.y));
  const pool = near.slice(0, Math.max(DUST.fields * 4, 8));
  const picked = [];
  const gap = DUST.spread * DUST.cell * TILE;
  for (let tries = 0; tries < 60 && picked.length < DUST.fields && pool.length; tries++) {
    const q = pool[Math.floor(rng() * pool.length)];
    if (picked.includes(q) || picked.some((o) => Math.hypot(o.cx - q.cx, o.cy - q.cy) < gap)) continue;
    picked.push(q);
  }
  for (const q of pool) { if (picked.length >= DUST.fields) break; if (!picked.includes(q)) picked.push(q); }
  if (!picked.length) return 'No dusting work around here.';
  // the plane: on the strip's near end, its nose down the strip (else on the apron)
  let sx = S.x, sy = S.y, a = -Math.PI / 2;
  if (S.strip) {
    const r = S.strip, ew = r.w >= r.h;
    a = ew ? 0 : -Math.PI / 2;
    sx = ew ? r.x + 3 * TILE : r.x + r.w / 2;
    sy = ew ? r.y + r.h / 2 : r.y + r.h - 3 * TILE;
  }
  const avoid = world.query(sx, sy, 900, K.VEH).map((q) => ({ x: q.x - 110, y: q.y - 110, w: 220, h: 220 }));
  const spot = (S.strip ? { x: sx, y: sy } : null) && !world.query(sx, sy, 90, K.VEH).length ? { x: sx, y: sy } : findPadSpot(m, sx, sy, 64, 900, avoid) || findPadSpot(m, sx, sy, 48, 1400);
  if (!spot) return 'No room to park the duster there.';
  const v = world.spawnVehicle('duster', spot.x, spot.y, a, { npcOwned: false });
  v.alt = 0; v.parked = false; v.npcOwned = false;
  v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;   // (the co-op's: yours to fly, not theft)
  v.returnTo = { x: Math.round(spot.x), y: Math.round(spot.y), label: S.name };
  const fields = picked.map((q, k) => ({ x: q.x, y: q.y, w: q.w, h: q.h, cx: q.cx, cy: q.cy, subs: q.subs, crop: q.crop, done: false, hit: new Array(q.subs.length).fill(false), n: 0, name: `Field ${k + 1}, ${compass(S, { x: q.cx, y: q.cy })} of the strip` }));
  p.job = { type: 'dusting', truck: v.id, strip: { x: S.x, y: S.y, name: S.name }, fields, paid: 0, hp0: v.hp, hurt: 0, boosted: new Set(), expires: world.time + DUST.contractS, text: '' };
  p.job.text = textOf(p.job);
  const where = DISTRICTS[m.dist[m.idx(Math.floor(fields[0].cx / TILE), Math.floor(fields[0].cy / TILE))]];
  world.notify(p, `Crop dusting: the co-op's ${v.def.name} is on ${S.name} (the green ring). ${fields.length} fields to spray${where ? ` in ${where.name}` : ''} - fly over them low (under ${Math.round(DUST.alt / TILE)} m) and the spray goes down. $${DUST.pay} a field, $${DUST.bonus} for the lot with the plane in one piece.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
function textOf(j) {
  const left = j.fields.filter((f) => !f.done).length, f = j.fields.find((q) => !q.done);
  if (!f) return 'Crop dusting: all sprayed';
  const pct = Math.round((100 * f.n) / Math.max(1, f.crop * DUST.cover));
  return `Crop dusting: ${f.name} - ${Math.min(99, pct)}% (${left} to go)`;
}

// ---- every tick ------------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  for (const p of world.players.values()) if (p.job && p.job.type === 'dusting') step(world, p, dt);
  // a duster nobody is dusting with stops spraying
  if (world.tick % 20 === 9) for (const v of world.entities.values()) if (v.kind === K.VEH && v.def && v.def.spray && v.lightB && !sprayer(world, v)) v.lightB = 0;
}
function sprayer(world, v) {
  const id = v.seats[0], ped = id && world.get(id);
  const p = ped && ped.player ? ped.player : null;
  return p && p.job && p.job.type === 'dusting' && p.job.truck === v.id ? p : null;
}
function step(world, p, dt) {
  const j = p.job, v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) { jobs.failJob(world, p, 'The crop duster is lost. The co-op takes the contract back.'); return; }
  if (v.hp < j.hp0 - 0.5) { j.hurt += j.hp0 - v.hp; j.hp0 = v.hp; }
  const ped = p.ped;
  const flying = ped && !ped.dead && ped.vehId === v.id && ped.seat === 0;
  const over = (v.alt || 0) - floorAt(world.map, v.x, v.y), spd = Math.hypot(v.vx, v.vy);
  const spraying = flying && over > FLY.AIRBORNE && over <= DUST.alt && spd >= DUST.minSpd;
  const want = spraying ? SPRAY_BIT : 0;
  if ((v.lightB | 0) !== want) v.lightB = want;
  if (!spraying) return;
  // the swath: points across the wing behind the plane's middle
  const c = Math.cos(v.a), s = Math.sin(v.a), half = ((v.def.span || v.def.W) * DUST.swath) / 2;
  let changed = false;
  for (let k = -2; k <= 2; k++) {
    const o = (k / 2) * half, x = v.x - c * 20 - s * o, y = v.y - s * 20 + c * o;
    for (const f of j.fields) {
      if (f.done || x < f.x || y < f.y || x >= f.x + f.w || y >= f.y + f.h) continue;
      const S = DUST.subs, i = Math.floor(((y - f.y) / f.h) * S) * S + Math.floor(((x - f.x) / f.w) * S);
      if (f.subs[i] && !f.hit[i]) { f.hit[i] = true; f.n++; changed = true; }
    }
    // a farm row sown: sprayed, it grows on at once (once a row a contract)
    const ra = rowAt(world, x, y);
    if (ra && ra.row.s === ROW.SOWN) {
      const key = ra.F.i * 1000 + ra.r;
      if (!j.boosted.has(key)) { j.boosted.add(key); ra.row.g = Math.min(0.99, ra.row.g + DUST.boost); ra.F.dirty = true; }
    }
  }
  if (!changed) return;
  for (const f of j.fields) {
    if (f.done || f.n < f.crop * DUST.cover) continue;
    f.done = true;
    p.profile.cash += DUST.pay; j.paid += DUST.pay;
    world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y });
    const left = j.fields.filter((q) => !q.done).length;
    world.notify(p, `${f.name} sprayed. +$${DUST.pay}${left ? ` - ${left} to go.` : '.'}`, 'good');
  }
  j.text = textOf(j);
  p.meDirty = true;
  if (j.fields.every((f) => f.done)) finish(world, p);
}
function finish(world, p) {
  const j = p.job, v = world.get(j.truck);
  const whole = j.hurt <= DUST.hurtHp;
  if (whole) { p.profile.cash += DUST.bonus; j.paid += DUST.bonus; }
  p.profile.samaritan = (p.profile.samaritan || 0) + 1;
  if (v) v.lightB = 0;
  world.notify(p, whole
    ? `Contract done: every field sprayed. +$${DUST.bonus} bonus - $${j.paid} in all. Take the duster back to ${j.strip.name}.`
    : `Contract done: every field sprayed - $${j.paid}. No bonus: the co-op saw the dents. Take the duster back to ${j.strip.name}.`, 'good');
  jobs.jobDone(world, p);
  store.touch();
}

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------------
export function target(world, p, j) {
  const f = j.fields.find((q) => !q.done);
  if (!f) return { text: j.text, x: Math.round(j.strip.x), y: Math.round(j.strip.y), stage: 'go' };
  // the nearest piece of crop still to spray in this field
  const S = DUST.subs, v = world.get(j.truck), at = v || p.ped || { x: f.cx, y: f.cy };
  let best = null, bd = Infinity;
  for (let i = 0; i < f.subs.length; i++) {
    if (!f.subs[i] || f.hit[i]) continue;
    const x = f.x + ((i % S) + 0.5) * (f.w / S), y = f.y + (Math.floor(i / S) + 0.5) * (f.h / S), d = Math.hypot(x - at.x, y - at.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  const t = best || { x: f.cx, y: f.cy };
  return { text: j.text, x: Math.round(t.x), y: Math.round(t.y), stage: 'go' };
}
