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
import { cropOf } from '../../shared/fieldcrop.js';

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
  restore(out);
  return out;
}
// The fields are kept with the profiles (store.kept.fields) so a restart doesn't put every row back to its first state
// (H69): each row's state, growth and the stretches of its job done, under the fields' layout - a changed world
// (other fields, other rows) starts them afresh.
const layoutOf = (F) => F.map((fd) => `${fd.f.x},${fd.f.y},${fd.f.w},${fd.f.h},${fd.n}`).join(';');
function restore(F) {
  const k = store.kept.fields;
  if (!k || k.sig !== layoutOf(F) || !Array.isArray(k.rows)) return;
  F.forEach((fd, i) => (k.rows[i] || []).forEach((q, r) => {
    const row = fd.rows[r];
    if (!row || !Array.isArray(q)) return;
    const [s, g, m] = q;
    if (s >= ROW.STUBBLE && s <= ROW.RIPE) { row.s = s; row.g = Math.max(0, Math.min(1, (g | 0) / 1000)); row.m = (m | 0) & row.ok; }
  }));
}
export function keep(world) {
  const F = world.fields;
  if (!F || !F.length) return;
  store.kept.fields = { sig: layoutOf(F), rows: F.map((fd) => fd.rows.map((row) => [row.s, Math.round(row.g * 1000), row.m])) };
  store.touch();
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
export const npcWork = (world, v) => work(world, null, v);
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
    if (world.tick % 1200 === 13) keep(world);   // (kept a minute at a time: the growing, the stretches worked)
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

// one tick of a tractor over the field: the segment under it done for its row's job; the row's job done once enough is.
// A combine: the stretches under its header (two rows wide, at its front) harvested - it only harvests.
// (p null: a combine an NPC drives - the cinematic mode's, server/systems/cinefollow.js: the rows done, nobody paid)
export function work(world, p, v) {
  if (v.model !== 'combine') return workAt(world, p, v.x, v.y, null, v);
  const c = Math.cos(v.a), s = Math.sin(v.a), f = v.def.L / 2 - 12;
  let job = null;
  for (const off of [-FARM.rowW / 2, FARM.rowW / 2]) job = workAt(world, p, v.x + c * f - s * off, v.y + s * f + c * off, 'harvest', v) || job;
  return job;
}
// what's in a machine's grain tank (the owner, 10-23: "Hard to tell what is being harvested with the harvester"): the
// crop of the field (shared/fieldcrop.js - the one its ground is drawn with) and how much, filled a stretch at a time
// as the rows are cut; a different crop starts it afresh. { name, unit, n } on the vehicle (v.tank); shown in the
// job's line and with each row done.
function fill(world, p, v, F) {
  const C = cropOf(F.i, world.map.seed);
  if (!v.tank || v.tank.name !== C.name) {
    v.tank = { name: C.name, unit: C.unit, n: 0 };
    if (p) world.notify(p, `Harvesting ${C.name}: the header cuts two rows at once and the grain fills the tank as you go.`, 'info');
  }
  v.tank.n += C.per;
  return v.tank;
}
export const tankText = (t) => (t ? `${Math.round(t.n)} ${t.unit} of ${t.name}` : '');
function workAt(world, p, x, y, only, v = null) {
  const at = rowAt(world, x, y);
  if (!at) return null;
  const { F, r, k, row } = at, job = jobOf(row);
  if (!job || (only && job !== only) || !(row.ok & (1 << k)) || row.m & (1 << k)) return null;
  row.m |= 1 << k;
  F.dirty = true;
  if (job === 'harvest' && v) fill(world, p, v, F);
  if (bits(row.m & row.ok) < Math.ceil(row.okN * FARM.cover)) return null;
  return finishRow(world, p, F, r, job, v);
}
function finishRow(world, p, F, r, job, v = null) {
  const row = F.rows[r];
  row.s = job === 'plough' ? ROW.PLOUGHED : job === 'sow' ? ROW.SOWN : ROW.STUBBLE;
  row.g = 0; row.m = 0;
  F.dirty = true;
  const j = p && p.job;
  if (!p) { keep(world); return job; }
  // (harvested: the crop, and what's in the tank now - "Row of wheat harvested (the tank: 54 bu of wheat)")
  const what = job === 'harvest' ? `Row of ${cropOf(F.i, world.map.seed).name} harvested` : `Row ${VERB[job]}`, tank = job === 'harvest' && v && v.tank ? ` - the tank: ${tankText(v.tank)}` : '';
  if (j && j.type === 'fieldwork') {
    const pay = FARM.pay[job];
    p.profile.cash += pay;
    j.done++;
    world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y });
    if (j.done >= j.rows) {
      p.profile.cash += FARM.bonus;
      p.profile.stats.deliveries = (p.profile.stats.deliveries || 0) + 1;
      world.notify(p, `${what}: +$${pay}${tank}. That's the ${j.rows} rows - the co-op adds a $${FARM.bonus} bonus. Good work!`, 'good');
      jobs.jobDone(world, p);
    } else world.notify(p, `${what}: +$${pay} (${j.done}/${j.rows})${tank}.`, 'good');
  } else world.notify(p, `${what}${tank}. (Take the farm-work contract at the co-op to be paid by the row.)`, 'info');
  p.meDirty = true;
  keep(world);
  return job;
}

// ---- by hand at harvest time: on foot in a ripe row, pick the stretch you're on; every FARM.handPer stretches fill a
// crate (a Produce Box: carry it to the farm stand or the grocery - jobs.js deliveryZoneFor)
export function handInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || ped.hidden) return null;
  const at = rowAt(world, ped.x, ped.y);
  if (!at || at.row.s !== ROW.RIPE || !(at.row.ok & (1 << at.k))) return null;
  if (at.row.m & (1 << at.k)) return { label: 'Picked here - move along the row', run: () => {} };
  return { label: `Pick the crop by hand (${(p.handPicked || 0)}/${FARM.handPer} for a crate)`, run: () => handPick(world, p) };
}
export function handPick(world, p) {
  const ped = p.ped, at = ped && rowAt(world, ped.x, ped.y);
  if (!at || at.row.s !== ROW.RIPE || at.row.m & (1 << at.k) || !(at.row.ok & (1 << at.k))) return null;
  const { F, r, k, row } = at;
  row.m |= 1 << k;
  F.dirty = true;
  p.handPicked = (p.handPicked || 0) + 1;
  let crate = null;
  if (p.handPicked >= FARM.handPer) {
    p.handPicked = 0;
    crate = world.spawnCrate(1, ped.x + 14, ped.y + 10, { owner: p.pid, label: 'Produce Box', value: FARM.handBox, contraband: false });
    crate.hand = true;
    world.notify(p, `A crate of the crop, picked by hand. Carry it to the farm stand or the grocery for $${FARM.handBox}.`, 'good');
  } else world.notify(p, `You pick along the row (${p.handPicked}/${FARM.handPer} for a crate).`, 'info');
  if (bits(row.m & row.ok) >= Math.ceil(row.okN * FARM.cover)) finishRow(world, p, F, r, 'harvest');
  p.meDirty = true;
  return crate;
}

// ---- the farm-work contract ---------------------------------------------------------------------------------------
// the field nearest (x, y) with rows that need a job (that job: a combine only harvests), and its row nearest to there
function nextRow(world, x, y, only = -1, job = null) {
  let best = null, bd = Infinity;
  for (const F of fieldsOf(world)) {
    if (only >= 0 && F.i !== only) continue;
    F.rows.forEach((row, r) => {
      if (row.okN < 3 || !jobOf(row) || (job && jobOf(row) !== job)) return;
      for (const e of rowEnds(F, r)) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = { F, r, e }; } }
    });
  }
  return best;
}
export function startWork(world, p, poi, model = 'tractor') {
  if (!poi) return 'No farm near.';
  if (p.job) return 'You already have a job - finish it first.';
  const only = model === 'combine' ? 'harvest' : null;
  const at = nextRow(world, poi.x, poi.y, -1, only);
  if (!at) return only ? 'Nothing is ripe for the combine just now - try the tractor, or come back later.' : 'The fields are all growing - nothing to plough, sow or harvest just now. Try again later.';
  p.job = { type: 'fieldwork', field: at.F.i, rows: FARM.rows, done: 0, expires: world.time + FARM.contractS, tx: at.e.x, ty: at.e.y, text: '', pickupText: '', only };
  track(world, p);
  const pad = poi.cargoPad || { x: poi.x, y: poi.y + 60 };
  const v = jobs.workTruck(world, p, pad, model, poi);
  if (v) v.paint = 0;   // (the co-op's machines are red)
  if (only) world.notify(p, `Harvest! ${FARM.rows} rows of the ripe crop by ${poi.label} with the co-op's combine: its header takes two rows at once as you drive down them. $${FARM.pay.harvest} a row.${v ? ' The combine is parked by the yard (the green ring).' : ''}`, 'good', 'Harvest: drive the combine down the rows');
  else world.notify(p, `Farm work! ${FARM.rows} rows of the field by ${poi.label}: drive the co-op tractor down a row and it does what the row needs - plough the stubble, sow the ploughed, harvest the ripe. $${FARM.pay.plough}-$${FARM.pay.harvest} a row.${v ? ' The tractor is parked by the yard (the green ring).' : ''}`, 'good', 'Farm work: drive the tractor down the rows');
  p.meDirty = true;
  return null;
}
// a ripe row in the fields (the co-op's counter offers the combine then)
export const anyRipe = (world) => fieldsOf(world).some((F) => F.rows.some((row) => row.s === ROW.RIPE && row.okN >= 3));
// the tracker's text and mark: the next row to work in the contract's field (or the nearest one anywhere)
function track(world, p) {
  const j = p.job, ped = p.ped;
  if (world.tick % 10 !== 0 && j.text) return;
  const from = ped ? (ped.vehId ? world.get(ped.vehId) || ped : ped) : { x: j.tx, y: j.ty };
  const at = nextRow(world, from.x, from.y, j.field, j.only) || nextRow(world, from.x, from.y, -1, j.only);
  const veh = ped && ped.vehId ? world.get(ped.vehId) : null, tank = veh && veh.tank ? ` - ${tankText(veh.tank)} cut` : '';
  const text = at ? `Farm work ${j.done}/${j.rows}: ${jobOf(at.F.rows[at.r])} a row (the marker: its end)${tank}` : `Farm work ${j.done}/${j.rows}: the fields are all growing - wait for the next to ripen${tank}`;
  if (at) { j.tx = at.e.x; j.ty = at.e.y; }
  if (text !== j.text) { j.text = text; j.pickupText = text; p.meDirty = true; }
}

// ---- what the page draws -------------------------------------------------------------------------------------------
// { t: 'fields', f: [{ i, x, y, w, h, v, rw, segs, r: [state, growth %, done bits, field bits, ...4 a row] }] } - the
// fields within FARM.near of you, sent when one of them changed
function sendNear(world, p) {
  const ped = p.ped;
  if (!p.conn || !ped) return;
  const at = (p.cineF && p.cineF.fid && p.cineF.eye) || ped;   // (the cinematic mode following someone: round them - cinefollow.js)
  const near = at.hidden ? [] : fieldsOf(world).filter((F) => at.x > F.f.x - FARM.near && at.x < F.f.x + F.f.w + FARM.near && at.y > F.f.y - FARM.near && at.y < F.f.y + F.f.h + FARM.near);
  for (const F of near) if (F.dirty) { F.dirty = false; F.ver = (F.ver || 0) + 1; }
  const ver = near.map((F) => `${F.i}:${F.ver || 0}`).join(',');
  if (ver === (p.fieldsSig || '')) return;
  p.fieldsSig = ver;
  p.conn.sendJSON({ t: 'fields', f: near.map((F) => ({ i: F.i, x: F.f.x, y: F.f.y, w: F.f.w, h: F.f.h, v: F.v ? 1 : 0, rw: FARM.rowW, segs: FARM.segs, r: F.rows.flatMap((row) => [row.s, Math.round(row.g * 100), row.m, row.ok]) })) });
}

// ---- dev ('farm'): at the fields by the co-op in a tractor, the rows beside you in every state (stubble, ploughed,
// sown, sprouting, growing, tall, ripe, some half done)
export function devFarm(world, p, msg = {}) {
  const ped = p.ped;
  if (!ped) return 'no body';
  // (the field nearest you - the owner, 10-16: "Tractor option spawns you away from a field: put it by one": it took the
  // first farm's nearest and set you at a row's end, which on World v3's fields cut by a wandering edge could be off
  // the crop in the trees)
  const at = nextRow(world, ped.x, ped.y);
  if (!at) return 'no fields';
  const F = at.F, looks = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0.2, 0], [2, 0.5, 0], [2, 0.85, 0], [3, 0, 0], [0, 0, 0x1f], [1, 0, 0x0f], [3, 0, 0x3f]];
  F.rows.forEach((row, r) => { const [s, g, m] = looks[r % looks.length]; row.s = s; row.g = g; row.m = m & row.ok; });
  F.dirty = true;
  // on the crop itself: the first piece of a row that's field, at its row's end of it
  const onCrop = (r) => { const row = F.rows[r]; for (let k = 0; k < FARM.segs; k++) if (row.ok & (1 << k)) return segCentre(F.f, F.v, r, k); return null; };
  let a = onCrop(at.r) || onCrop(Math.min(F.n - 1, 1)) || rowEnds(F, at.r)[0];
  if (msg.k === 'combine' && F.n > 2) {   // (the combine: two ripe rows, its header over both)
    const r1 = Math.min(Math.max(at.r, 0), F.n - 2), r2 = r1 + 1;
    for (const r of [r1, r2]) { F.rows[r].s = ROW.RIPE; F.rows[r].m = 0; }
    let k0 = -1;
    for (let k = 0; k < FARM.segs && k0 < 0; k++) if ((F.rows[r1].ok & (1 << k)) && (F.rows[r2].ok & (1 << k))) k0 = k;   // (a piece both rows have crop on)
    const a1 = k0 >= 0 ? segCentre(F.f, F.v, r1, k0) : rowEnds(F, r1)[0], a2 = k0 >= 0 ? segCentre(F.f, F.v, r2, k0) : rowEnds(F, r2)[0];
    a = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
  }
  if (ped.vehId) { const old = world.get(ped.vehId); if (old) old.seats[old.seats.indexOf(ped.id)] = 0; ped.vehId = 0; ped.seat = -1; }
  const v = world.spawnVehicle(msg.k === 'combine' ? 'combine' : 'tractor', a.x, a.y, F.v ? Math.PI / 2 : 0, { npcOwned: false, paint: 0 });
  v.despawnable = false;
  ped.x = v.x; ped.y = v.y; ped.vehId = v.id; ped.seat = 0; v.seats[0] = ped.id; v.lastDriver = ped.id; p.lastVehicle = v.id;
  world.place(ped);
  p.fieldsSig = null;
  world.notify(p, '[dev] A tractor at the fields; the rows beside you in every state. Drive down one to work it.', 'info');
  return null;
}
