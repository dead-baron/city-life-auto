// The mail carrier (b8a; the owner's notes part 2: "Mail man/package delivery job"). At the post office (the Midtown Post
// Office; a city without one, its freight depot - officesOf) or from the phone's Jobs app: a round of the homes of one
// neighbourhood - letters to their mailboxes at the kerb (or through the door where a home has none) and parcels to the
// doorstep. The van round (MAILJOB.van stops a neighbourhood off, parcels of them parcels): a Delivery Van is issued,
// the parcels in the back as crates - carry each from the van to its door; post the letters from the van's window,
// stopped by the box. The walking round (MAILJOB.walk stops by the post office): letters only, a bag over the shoulder.
// Paid by the stop (letter, parcel), the bonus for the whole round; the van's return bonus after (jobs.js).
//   update(world, dt)                 the rounds (world.js SYSTEMS)
//   start(world, p, office, mode)     sign on ('van' | 'walk') -> error | null
//   interaction(world, p)             on foot: post the letters at a stop; at the post office: the round's card
//   vanInteraction(world, p)          stopped in the van by a mailbox stop: post them from the window
//   parcelZone(world, p, crate)       carrying a parcel at its door: leave it on the doorstep
//   target(world, p, j)               the job tracker's target: the nearest stop not done
//   devMail(world, p, mode)           dev: a round from where you stand
import { MAILJOB } from '../../shared/rules.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';

const cache = (m, k, f) => m[k] || Object.defineProperty(m, k, { value: f(), enumerable: false })[k];
export const officesOf = (m) => cache(m, '_postOffices', () => { const L = m.pois.filter((q) => /post office/i.test(q.label || '')); return L.length ? L : m.pois.filter((q) => q.kind === 'warehouse').slice(0, 1); });
const homesOf = (m) => cache(m, '_mailHomes', () => { const seen = new Set(), out = []; for (const q of m.pois) { if (q.kind !== 'home') continue; const k = `${Math.round(q.x / 48)},${Math.round(q.y / 48)}`; if (!seen.has(k)) { seen.add(k); out.push(q); } } return out; });
const boxesOf = (m) => cache(m, '_mailBoxes', () => { const g = new Map(); for (const q of m.props) if (q.t === 'mailbox') { const k = `${Math.floor(q.x / 256)},${Math.floor(q.y / 256)}`; (g.get(k) || g.set(k, []).get(k)).push(q); } return g; });
function boxNear(m, x, y, r = 150) {
  const g = boxesOf(m);
  let best = null, bd = r;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const q of g.get(`${Math.floor(x / 256) + dx},${Math.floor(y / 256) + dy}`) || []) { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q; } }
  return best;
}
export const officeFor = (world, p) => { const L = officesOf(world.map); if (!L.length) return null; if (!p.ped) return L[0]; return L.reduce((a, b) => (Math.hypot(b.x - p.ped.x, b.y - p.ped.y) < Math.hypot(a.x - p.ped.x, a.y - p.ped.y) ? b : a)); };
const streetOf = (world, q) => { const d = world.map.districtAt(q.x, q.y); return d ? d.name : 'town'; };

// the stops of a round from the office: [{ x, y, box, parcel, name, done }] in the order to walk or drive them
export function routeFor(world, office, mode) {
  const m = world.map, H = homesOf(m), n = mode === 'van' ? MAILJOB.van : MAILJOB.walk;
  let pool;
  if (mode === 'van') {
    const far = H.filter((q) => { const d = Math.hypot(q.x - office.x, q.y - office.y); return d >= MAILJOB.hood[0] && d <= MAILJOB.hood[1]; });
    const hub = (far.length ? far : H)[Math.floor(world.rand() * (far.length || H.length))];
    if (!hub) return null;
    for (const k of [1, 1.5, 2]) { pool = H.filter((q) => Math.hypot(q.x - hub.x, q.y - hub.y) <= MAILJOB.routeR * k); if (pool.length >= n * 2) break; }   // (a spread-out neighbourhood: a little further round)
  } else for (const k of [1, 1.6, 2.5]) { pool = H.filter((q) => Math.hypot(q.x - office.x, q.y - office.y) <= MAILJOB.walkR * k); if (pool.length >= n) break; }
  if (mode !== 'van' && pool.length < 3) pool = H.slice().sort((a, b) => Math.hypot(a.x - office.x, a.y - office.y) - Math.hypot(b.x - office.x, b.y - office.y)).slice(0, n * 2);   // (no homes round the office: the nearest there are)
  if (pool.length < 3) return null;
  const picked = [];
  const sh = pool.slice();
  for (let i = sh.length - 1; i > 0; i--) { const k = Math.floor(world.rand() * (i + 1)); [sh[i], sh[k]] = [sh[k], sh[i]]; }
  for (const q of sh) {
    if (picked.length >= n) break;
    if (picked.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 90)) continue;
    picked.push(q);
  }
  // nearest next, from the office
  const out = [];
  let at = office;
  while (picked.length) {
    let bi = 0;
    for (let i = 1; i < picked.length; i++) if (Math.hypot(picked[i].x - at.x, picked[i].y - at.y) < Math.hypot(picked[bi].x - at.x, picked[bi].y - at.y)) bi = i;
    const q = picked.splice(bi, 1)[0], box = boxNear(m, q.x, q.y);
    out.push({ x: Math.round(box ? box.x : q.x), y: Math.round(box ? box.y : q.y), hx: Math.round(q.x), hy: Math.round(q.y), box: !!box, parcel: false, done: false, name: streetOf(world, q) });
    at = q;
  }
  if (mode === 'van') {   // the parcels: to the doors of the round's furthest-on homes
    for (let i = out.length - 1, k = 0; i >= 0 && k < MAILJOB.parcels; i -= 2, k++) { const s = out[i]; s.parcel = true; s.x = s.hx; s.y = s.hy; s.box = false; }
  }
  return out;
}

export function start(world, p, office = null, mode = 'van') {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  office = office || officeFor(world, p);
  if (!office) return 'No post office here.';
  const stops = routeFor(world, office, mode);
  if (!stops) return 'No round going out from here right now.';
  const parcels = stops.filter((s) => s.parcel).length;
  p.job = { type: 'mail', mode, stops, done: 0, crates: [], truck: 0, earned: 0, office: { x: office.x, y: office.y, name: office.label }, expires: world.time + MAILJOB.limitS * stops.length + 120, text: '' };
  if (mode === 'van') {
    const v = jobs.workTruck(world, p, office.cargoPad || { x: office.x, y: office.y + 40 }, 'van', office);
    if (!v) { p.job = null; return 'No room to park the van there.'; }
    v.paint = 2; v.descVer = (v.descVer || 0) + 1;   // (the post office's white)
    stops.forEach((s, i) => {
      if (!s.parcel) return;
      const slot = v.cargo.findIndex((c, k) => !c && k < v.def.slots.length);
      if (slot < 0) { s.parcel = false; return; }
      const c = world.spawnCrate(1, v.x, v.y, { owner: p.pid, label: 'Parcel', value: 20, contraband: false, job: { type: 'mail', pid: p.pid, stop: i } });
      c.state = 'loaded'; c.parent = v.id; c.slot = slot; c.a = v.a; v.cargo[slot] = c.id;
      p.job.crates.push(c.id); s.crate = c.id;
    });
  }
  setText(world, p);
  world.notify(p, mode === 'van'
    ? `Mail round: ${stops.length} stops round ${stops[0].name}. The van is the green ring - post the letters from its window stopped by each mailbox; carry the ${parcels} parcel${parcels === 1 ? '' : 's'} from the back to the door.`
    : `Walking round: ${stops.length} stops near ${office.label}. Walk up to each mailbox (or door) and post the letters.`, 'good', `Mail round: ${stops.length} stops`);
  p.meDirty = true;
  return null;
}

const left = (j) => j.stops.filter((s) => !s.done);
function setText(world, p) {
  const j = p.job, L = left(j), at = p.ped || j.office;
  const s = L.length ? L.reduce((a, b) => (Math.hypot(b.x - at.x, b.y - at.y) < Math.hypot(a.x - at.x, a.y - at.y) ? b : a)) : null;
  const t = !s ? 'Mail: round done' : s.parcel ? `Mail: a parcel to the door in ${s.name} (${j.done}/${j.stops.length})` : `Mail: letters to the ${s.box ? 'mailbox' : 'door'} in ${s.name} (${j.done}/${j.stops.length})`;
  if (t !== j.text) { j.text = t; p.meDirty = true; }
}
function deliver(world, p, s, crate = null) {
  const j = p.job, pay = s.parcel ? MAILJOB.parcel : MAILJOB.letter;
  s.done = true; j.done++; j.earned += pay;
  p.profile.cash += pay;
  if (crate) { if (p.ped && p.ped.carrying === crate.id) p.ped.carrying = 0; world.remove(crate); j.crates = j.crates.filter((id) => id !== crate.id); }
  world.emit(s.x, s.y, { e: 'mailbox', x: s.x, y: s.y, k: s.parcel ? 1 : 0 });
  world.emit(s.x, s.y, { e: 'cash', x: s.x, y: s.y, n: pay });
  p.profile.samaritan = (p.profile.samaritan || 0) + 1;
  if (left(j).length) { setText(world, p); world.notify(p, `${s.parcel ? 'Parcel left on the doorstep' : 'Letters posted'}: +$${pay}. ${left(j).length} to go.`, 'good'); store.touch(); return; }
  p.profile.cash += MAILJOB.bonus;
  world.notify(p, `Round done: ${j.stops.length} stops, $${j.earned} + a $${MAILJOB.bonus} bonus from the post office.`, 'good');
  jobs.jobDone(world, p);
  store.touch();
}

// on foot by a letters stop
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return null;
  const j = p.job;
  if (j && j.type === 'mail') {
    for (const s of j.stops) {
      if (s.done || s.parcel || Math.hypot(s.x - ped.x, s.y - ped.y) > (s.box ? MAILJOB.postR : MAILJOB.doorR)) continue;
      return { label: s.box ? `Post the letters in the mailbox (+$${MAILJOB.letter})` : `Put the letters through the door (+$${MAILJOB.letter})`, run: () => deliver(world, p, s) };
    }
    return null;
  }
  if (j || ped.carrying) return null;
  const o = officesOf(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < 160);
  if (!o) return null;
  return { label: `Take a mail round at ${o.label}`, card: { id: 'mail', where: o.label, start: () => start(world, p, o, 'van'), alt: { id: 'mailwalk', start: () => start(world, p, o, 'walk') } }, run: () => { const err = start(world, p, o, 'van'); if (err) world.notify(p, err, 'bad'); } };
}
// stopped in the round's van by a mailbox: posted from the window
export function vanInteraction(world, p) {
  const ped = p.ped, j = p.job, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!j || j.type !== 'mail' || !v || v.id !== j.truck || ped.seat !== 0 || Math.hypot(v.vx, v.vy) > 20) return null;
  for (const s of j.stops) if (!s.done && !s.parcel && s.box && Math.hypot(s.x - v.x, s.y - v.y) < MAILJOB.vanR + v.def.W / 2) return { label: `Post the letters from the window (+$${MAILJOB.letter})`, run: () => deliver(world, p, s) };
  return null;
}
// carrying the round's parcel at its door
export function parcelZone(world, p, crate) {
  const j = p.job, ped = p.ped;
  if (!j || j.type !== 'mail' || !crate || !crate.job || crate.job.type !== 'mail' || crate.job.pid !== p.pid) return null;
  const s = j.stops[crate.job.stop];
  if (!s || s.done || Math.hypot(s.x - ped.x, s.y - ped.y) > MAILJOB.doorR) {
    const other = j.stops.find((q) => q.parcel && !q.done && Math.hypot(q.x - ped.x, q.y - ped.y) < MAILJOB.doorR);   // (any of the round's parcels does for any of its doors: they're all the round's)
    if (!other) return null;
    return { label: `Leave the parcel on the doorstep (+$${MAILJOB.parcel})`, run: () => deliver(world, p, other, crate) };
  }
  return { label: `Leave the parcel on the doorstep (+$${MAILJOB.parcel})`, run: () => deliver(world, p, s, crate) };
}

export function update(world) {
  if (world.tick % 10 !== 5) return;
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'mail') continue;
    if (j.mode === 'van') { const v = world.get(j.truck); if (!v || v.removed || v.wreckAt) { jobs.failJob(world, p, 'The van is wrecked. The round is off.'); continue; } }
    // a parcel lost (stolen, fallen in the water): its stop's off the round
    for (const s of j.stops) if (s.parcel && !s.done && s.crate) { const c = world.get(s.crate); if (!c || c.removed || (c.job && c.job.pid !== p.pid) || !c.job) { s.done = true; s.lost = true; j.done++; world.notify(p, 'A parcel\'s gone missing - that stop\'s off the round.', 'warn'); } }
    if (!left(j).length) { world.notify(p, `Round over: $${j.earned}.`, 'info'); jobs.jobDone(world, p); continue; }
    setText(world, p);
  }
}

export function target(world, p, j) {
  const L = left(j), at = p.ped || j.office;
  if (!L.length) return { text: j.text, x: j.office.x, y: j.office.y, stage: 'go' };
  const s = L.reduce((a, b) => (Math.hypot(b.x - at.x, b.y - at.y) < Math.hypot(a.x - at.x, a.y - at.y) ? b : a));
  return { text: j.text, x: s.x, y: s.y, stage: s.parcel ? 'parcel' : 'go', marks: L.map((q) => [q.x, q.y, q.parcel ? 'p' : 'm']) };
}

// dev ('mailjob'): a round from the office nearest you, the van beside you
export function devMail(world, p, mode = 'van') {
  if (!p.ped || p.ped.dead) return 'On your feet first.';
  if (p.job) jobs.failJob(world, p, '[dev] job dropped');
  const o = officeFor(world, p);
  if (!o) return 'no post office';
  return start(world, p, { ...o, x: p.ped.x, y: p.ped.y, cargoPad: { x: p.ped.x + 60, y: p.ped.y } }, mode === 'walk' ? 'walk' : 'van');
}
