// Farm work (H61; the owner, 2026-10-11: "Have we added farm jobs and gardening mechanics yet?"). The farms' fields
// (map.fields: Dry Creek's round the co-op, Cedar Farms') are kept on the server in rows FARM.rowW px wide along each
// field's length, every row going round: stubble -> ploughed -> sown -> growing (FARM.growDays in-game days) -> ripe ->
// harvested (stubble again). Driving a tractor down a row does the job that row needs - plough it, sow it, harvest it -
// once FARM.cover of its length (FARM.segs pieces, those on the field's own tiles) has been driven over; the job done
// shows behind the tractor as it goes. On the farm-work contract (the co-op's counter, the phone's job list: startWork,
// the tractor issued like a work truck - jobs.js workTruck) each row pays FARM.pay[job] and FARM.rows of them finish it
// (+FARM.bonus). The page only draws the rows' state: the 'fields' message (render/farmart.js), the fields near you.
import { TILE, T, DAY_LOOP_S } from '../../shared/constants.js';
import { FARM } from '../../shared/rules.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';

const DAY = DAY_LOOP_S;
export const ROW = { STUBBLE: 0, PLOUGHED: 1, SOWN: 2, RIPE: 3 };
const JOB_OF = ['plough', 'sow', null, 'harvest'];
const VERB = { plough: 'ploughed', sow: 'sown', harvest: 'harvested' };
export const WORKERS = new Set(['tractor', 'combine']);   // (what works a row: the tractor; a combine if there's ever one)
const SEND_TICKS = 20;

// ---- the fields' rows --------------------------------------------------------------------------------------------
// world.fields[i] = { f (the map's rect), v (rows run north-south), n (rows), len (a row's length px), rows: [{ s, g (0..1
// growing), m (the segments done of its job: bits), ok (its segments on field tiles: bits), okN }] }
export function fieldsOf(world) {
  if (world.fields) return world.fields;
  const map = world.map, out = [];
  (map.fields || []).forEach((f, fi) => {
    const v = f.h >= f.w, cross = v ? f.w : f.h, len = v ? f.h : f.w, n = Math.floor(cross / FARM.rowW);
    const start = [ROW.RIPE, ROW.STUBBLE, ROW.SOWN, ROW.PLOUGHED][fi % 4];
    const rows = [];
    for (let r = 0; r < n; r++) {
      let ok = 0, okN = 0;
      for (let k = 0; k < FARM.segs; k++) {
        const c = segCentre(f, v, r, k);
        const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
        if (map.inside(tx, ty) && map.tiles[map.idx(tx, ty)] === T.FIELD) { ok |= 1 << k; okN++; }
      }
      rows.push({ s: start, g: start === ROW.SOWN ? ((r * 37 + fi * 11) % 70) / 100 : 0, m: 0, ok, okN });
    }
    out.push({ i: fi, f, v, n, len, rows });
  });
  world.fields = out;
  return out;
}
function segCentre(f, v, r, k) {
  const a = (r + 0.5) * FARM.rowW, b = ((k + 0.5) / FARM.segs) * (v ? f.h : f.w);
  return v ? { x: f.x + a, y: f.y + b } : { x: f.x + b, y: f.y + a };
}
// the row and segment under (x, y): { F, r, k, row } or null
export function rowAt(world, x, y) {
  for (const F of fieldsOf(world)) {
    const f = F.f;
    if (x < f.x || y < f.y || x >= f.x + f.w || y >= f.y + f.h) continue;
    const r = Math.floor((F.v ? x - f.x : y - f.y) / FARM.rowW), k = Math.floor(((F.v ? y - f.y : x - f.x) / F.len) * FARM.segs);
    if (r < 0 || r >= F.n || k < 0 || k >= FARM.segs) return null;
    const row = F.rows[r];
    return row.okN >= 3 ? { F, r, k, row } : null;
  }
  return null;
}
export const jobOf = (row) => JOB_OF[row.s] || null;
const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
// a row's middle and its two ends (the job tracker's mark: the start of the next row to work)
export function rowEnds(F, r) {
  const f = F.f, a = F.v ? f.x + (r + 0.5) * FARM.rowW : f.y + (r + 0.5) * FARM.rowW;
  return F.v ? [{ x: a, y: f.y + 16 }, { x: a, y: f.y + f.h - 16 }] : [{ x: f.x + 16, y: a }, { x: f.x + f.w - 16, y: a }];
}

// ---- the tractor down a row ---------------------------------------------------------------------------------------
export function update(world) {
  const F = fieldsOf(world);
  if (!F.length) return;
  // the sown rows grow (every 2 s)
  if (world.tick % 40 === 13) {
    const dt = world.time - (world.fieldsAt ?? world.time);
    world.fieldsAt = world.time;
    if (dt > 0) for (const fd of F) for (const row of fd.rows) if (row.s === ROW.SOWN) { row.g = Math.min(1, row.g + dt / (FARM.growDays * DAY)); if (row.g >= 1) { row.s = ROW.RIPE; row.g = 0; row.m = 0; fd.dirty = true; } }
  }
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (ped && !ped.dead && ped.vehId && ped.seat === 0) {
      const v = world.get(ped.vehId);
      if (v && WORKERS.has(v.model) && !v.wreckAt && Math.hypot(v.vx, v.vy) > 15) work(world, p, v);
    }
    if (p.job && p.job.type === 'fieldwork') track(world, p);
    if (world.tick % SEND_TICKS === 3) sendNear(world, p);
  }
}

// one tick of a tractor over the field: the segment under it done for its row's job; the row's job done once enough is
export function work(world, p, v) {
  const at = rowAt(world, v.x, v.y);
  if (!at) return null;
  const { F, r, k, row } = at, job = jobOf(row);
  if (!job || !(row.ok & (1 << k)) || row.m & (1 << k)) return null;
  row.m |= 1 << k;
  F.dirty = true;
  if (bits(row.m & row.ok) < Math.ceil(row.okN * FARM.cover)) return null;
  return finishRow(world, p, F, r, job);
}
function finishRow(world, p, F, r, job) {
  const row = F.rows[r];
  row.s = job === 'plough' ? ROW.PLOUGHED : job === 'sow' ? ROW.SOWN : ROW.STUBBLE;
  row.g = 0; row.m = 0;
  F.dirty = true;
  const j = p.job;
  if (j && j.type === 'fieldwork') {
    const pay = FARM.pay[job];
    p.profile.cash += pay;
    j.done++;
    world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y });
    if (j.done >= j.rows) {
      p.profile.cash += FARM.bonus;
      p.profile.stats.deliveries = (p.profile.stats.deliveries || 0) + 1;
      world.notify(p, `Row ${VERB[job]}: +$${pay}. That's the ${j.rows} rows - the co-op adds a $${FARM.bonus} bonus. Good work!`, 'good');
      jobs.jobDone(world, p);
    } else world.notify(p, `Row ${VERB[job]}: +$${pay} (${j.done}/${j.rows}).`, 'good');
  } else world.notify(p, `Row ${VERB[job]}. (Take the farm-work contract at the co-op to be paid by the row.)`, 'info');
  p.meDirty = true;
  store.touch();
  return job;
}

// ---- the farm-work contract ---------------------------------------------------------------------------------------
// the field nearest (x, y) with rows that need a job, and its row nearest to there that does
function nextRow(world, x, y, only = -1) {
  let best = null, bd = Infinity;
  for (const F of fieldsOf(world)) {
    if (only >= 0 && F.i !== only) continue;
    F.rows.forEach((row, r) => {
      if (row.okN < 3 || !jobOf(row)) return;
      for (const e of rowEnds(F, r)) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = { F, r, e }; } }
    });
  }
  return best;
}
export function startWork(world, p, poi) {
  if (!poi) return 'No farm near.';
  if (p.job) return 'You already have a job - finish it first.';
  const at = nextRow(world, poi.x, poi.y);
  if (!at) return 'The fields are all growing - nothing to plough, sow or harvest just now. Try again later.';
  p.job = { type: 'fieldwork', field: at.F.i, rows: FARM.rows, done: 0, expires: world.time + FARM.contractS, tx: at.e.x, ty: at.e.y, text: '', pickupText: '' };
  track(world, p);
  const pad = poi.cargoPad || { x: poi.x, y: poi.y + 60 };
  const v = jobs.workTruck(world, p, pad, 'tractor', poi);
  world.notify(p, `Farm work! ${FARM.rows} rows of the field by ${poi.label}: drive the co-op tractor down a row and it does what the row needs - plough the stubble, sow the ploughed, harvest the ripe. $${FARM.pay.plough}-$${FARM.pay.harvest} a row.${v ? ' The tractor is parked by the yard (the green ring).' : ''}`, 'good');
  p.meDirty = true;
  return null;
}
// the tracker's text and mark: the next row to work in the contract's field (or the nearest one anywhere)
function track(world, p) {
  const j = p.job, ped = p.ped;
  if (world.tick % 10 !== 0 && j.text) return;
  const from = ped ? (ped.vehId ? world.get(ped.vehId) || ped : ped) : { x: j.tx, y: j.ty };
  const at = nextRow(world, from.x, from.y, j.field) || nextRow(world, from.x, from.y);
  const text = at ? `Farm work ${j.done}/${j.rows}: ${jobOf(at.F.rows[at.r])} a row (the marker: its end)` : `Farm work ${j.done}/${j.rows}: the fields are all growing - wait for the next to ripen`;
  if (at) { j.tx = at.e.x; j.ty = at.e.y; }
  if (text !== j.text) { j.text = text; j.pickupText = text; p.meDirty = true; }
}

// ---- what the page draws -------------------------------------------------------------------------------------------
// { t: 'fields', f: [{ i, x, y, w, h, v, rw, segs, r: [state, growth %, done bits, field bits, ...4 a row] }] } - the
// fields within FARM.near of you, sent when one of them changed
function sendNear(world, p) {
  const ped = p.ped;
  if (!p.conn || !ped) return;
  const near = ped.hidden ? [] : fieldsOf(world).filter((F) => ped.x > F.f.x - FARM.near && ped.x < F.f.x + F.f.w + FARM.near && ped.y > F.f.y - FARM.near && ped.y < F.f.y + F.f.h + FARM.near);
  for (const F of near) if (F.dirty) { F.dirty = false; F.ver = (F.ver || 0) + 1; }
  const ver = near.map((F) => `${F.i}:${F.ver || 0}`).join(',');
  if (ver === (p.fieldsSig || '')) return;
  p.fieldsSig = ver;
  p.conn.sendJSON({ t: 'fields', f: near.map((F) => ({ i: F.i, x: F.f.x, y: F.f.y, w: F.f.w, h: F.f.h, v: F.v ? 1 : 0, rw: FARM.rowW, segs: FARM.segs, r: F.rows.flatMap((row) => [row.s, Math.round(row.g * 100), row.m, row.ok]) })) });
}
