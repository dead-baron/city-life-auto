// A hideout of your own (docs/PROGRESSION.md, the crime career's 'hideout' rank; the numbers: shared/rules.js HIDEOUT). A
// hideout is biz.js's criminal hideout (the grow room, the Syndicate's guards at the door) - what this adds:
//   - one per player or crew: buying one needs the rank (careers.js hasUnlock 'hideout') and no hideout of your own or a
//     crewmate's (crews.js) already - Deacon Marsh's chain gives one at any rank (contacts.js giveBiz -> biz.grant);
//   - the crew's: a crewmate's hideout is yours too - its stash at the office's menu, lying low in its yard, the guards
//     leave you be (biz.js guardHideouts already);
//   - a stash at the door: HIDEOUT.cars cars (driven up to the office, at the wheel: vehicleInteraction) and HIDEOUT.crates
//     crates (carried in, taken out at the office's menu) - kept on the owner's business entry (profile.biz[site].stash
//     { cars [{ model, paint, variant, tint }], crates [{ t, v, s, l }] }), so a season's reset of property takes it too;
//   - lying low: wanted, in its yard (HIDEOUT.lieLowR of the door) the heat cools HIDEOUT.coolX times as fast while no
//     officer can see you (p.lieLowX - law.js update multiplies the cooling by it);
//   - upkeep like any business (upkeep.js props: a hideout is one).
import { K } from '../../shared/constants.js';
import { HIDEOUT } from '../../shared/rules.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { store } from '../store.js';
import { moved } from '../movemark.js';
import * as biz from './biz.js';
import * as crews from './crews.js';
import * as careers from './careers.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const TIER_WORD = ['crate', 'wood box', 'steel barrel', 'iron vault', 'carbon-gold case'];
const DOOR_R = 220;   // px: at the wheel this near the office to drive a car into the stash

// your own hideout, else a crewmate's: { s (the site), e (its entry), pid (the owner) } | null
export function ownOf(world, prof) {
  const o = biz.ownedBy(world, prof).find((q) => q.s.t === 'hideout');
  return o ? { s: o.s, e: o.e, pid: prof.pid } : null;
}
export function hideoutFor(world, p) {
  const own = ownOf(world, p.profile);
  if (own) return own;
  const c = crews.crewOf(p.pid);
  if (c) for (const pid of c.members) { if (pid === p.pid) continue; const prof = store.get(pid), h = prof && ownOf(world, prof); if (h) return h; }
  return null;
}
const stashOf = (e) => { const S = (e.stash ||= { cars: [], crates: [] }); S.cars ||= []; S.crates ||= []; return S; };
const rankName = () => { const R = careers.CAREERS.crime.ranks; for (let i = 0; i < R.length; i++) if ((R[i].unlock || []).some((u) => u.k === 'hideout')) return R[i].name; return 'a high rank'; };

// buying one (biz.js buyRefusal): why not, or null
export function canBuy(world, p) {
  if (!careers.hasUnlock(p, 'hideout')) return `A hideout comes at ${rankName()} (crime).`;
  const h = hideoutFor(world, p);
  if (h) return h.pid === p.pid ? `You have a hideout already: ${h.s.name}.` : `Your crew has a hideout already: ${h.s.name}.`;
  return null;
}

// the office's menu rows (yours, or a crewmate's): the stash
export function rows(world, p, s, opts) {
  const h = hideoutFor(world, p);
  if (!h || h.s.id !== s.id) return;
  const S = stashOf(h.e), ped = p.ped, crate = ped && ped.carrying ? world.get(ped.carrying) : null;
  S.cars.forEach((c, i) => opts.push({ id: `hdo:c:${i}`, label: `The stash: take out the ${(VEHICLES[c.model] || {}).name || 'car'}`, note: 'parked out front' }));
  S.crates.forEach((c, i) => opts.push({ id: `hdo:t:${i}`, label: `The stash: take out the ${TIER_WORD[c.t] || 'crate'}`, note: money(c.v), dis: !!(ped && ped.carrying) }));
  if (crate && crate.kind === K.CRATE && !crate.job) opts.push({ id: 'hdo:p', label: `The stash: put the ${TIER_WORD[crate.tier] || 'crate'} away`, note: `${S.crates.length}/${HIDEOUT.crates}`, dis: S.crates.length >= HIDEOUT.crates });
  if (!S.cars.length && !S.crates.length && !crate) opts.push({ id: 'hdo:i', label: `The stash: empty - up to ${HIDEOUT.cars} cars and ${HIDEOUT.crates} crates`, note: 'drive a car up to the door; carry a crate in', dis: true });
}

// a stash choice (biz.js onMenu: 'hdo:...'): null, or why not
export function run(world, p, s, optId) {
  const h = hideoutFor(world, p), ped = p.ped;
  if (!h || h.s.id !== s.id || !ped) return 'Not your crew\'s hideout.';
  const S = stashOf(h.e), parts = String(optId).split(':');
  if (parts[1] === 'c') {
    const i = Number(parts[2]), c = S.cars[i];
    if (!c || !VEHICLES[c.model]) return 'Not in the stash.';
    const at = spotNear(world, s, VEHICLES[c.model]);
    S.cars.splice(i, 1);
    const v = world.spawnVehicle(c.model, at.x, at.y, at.a, { paint: c.paint, variant: c.variant, npcOwned: false });
    if (c.tint !== undefined) v.tint = c.tint;
    (v.stolenBy ||= new Set()).add(p.pid);   // (yours to drive off in: no theft)
    store.touch(); p.meDirty = true;
    world.notify(p, `The ${v.def.name} is out of the stash, parked out front.`, 'good');
    return null;
  }
  if (parts[1] === 't') {
    const i = Number(parts[2]), c = S.crates[i];
    if (!c) return 'Not in the stash.';
    if (ped.dead || ped.vehId || ped.carrying) return 'Your hands have to be free.';
    S.crates.splice(i, 1);
    const crate = world.spawnCrate(c.t, ped.x, ped.y, { contraband: !!c.s, label: c.l, value: c.v, owner: p.pid });
    crate.extract = { src: 'stash', stolen: !!c.s, ev: null, from: { x: ped.x, y: ped.y }, by: p.pid };
    crate.state = 'carried'; crate.parent = ped.id; crate.z = 10;
    ped.carrying = crate.id;
    store.touch(); p.meDirty = true;
    world.notify(p, `You've got the ${TIER_WORD[c.t] || 'crate'} - it pays once it's delivered.`, 'info');
    return null;
  }
  if (parts[1] === 'p') {
    const crate = ped.carrying ? world.get(ped.carrying) : null;
    if (!crate || crate.kind !== K.CRATE) return 'You\'re not carrying a crate.';
    if (crate.job) return 'That\'s somebody\'s delivery - it doesn\'t go in the stash.';
    if (S.crates.length >= HIDEOUT.crates) return `The stash is full (${HIDEOUT.crates} crates).`;
    S.crates.push({ t: crate.tier, v: crate.value || 0, s: crate.contraband || (crate.extract && crate.extract.stolen) ? 1 : 0, l: crate.label || '' });
    const live = world.extractLive && world.extractLive.get(crate.id);
    if (live) live.done = 'stash';   // (put away, not lost: extract.js)
    if (crate.extract) crate.extract.done = 'stash';
    ped.carrying = 0;
    world.remove(crate);
    store.touch(); p.meDirty = true;
    world.notify(p, `The ${TIER_WORD[crate.tier] || 'crate'} is in the stash (${S.crates.length}/${HIDEOUT.crates}).`, 'good');
    return null;
  }
  return 'Not here.';
}

// ---- a car into the stash, at the wheel by the door -----------------------------------------------------------------------
const keepable = (p, v) => v.owner !== p.pid && !v.def.police && !v.rentedBy && !v.workTruck && !v.cruiserOf && !v.starter && (v.def.kind === 'car' || v.def.kind === 'bike') && !v.def.horse && !v.def.board && !v.def.surfboard;
export function vehicleInteraction(world, p) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!v || ped.seat !== 0 || v.wreckAt) return null;
  const h = hideoutFor(world, p);
  if (!h || Math.hypot(v.x - h.s.x, v.y - h.s.y) > DOOR_R || !keepable(p, v)) return null;
  const S = stashOf(h.e);
  if (Math.hypot(v.vx, v.vy) > 60) return { label: 'Slow down to put it in the hideout', run: () => {} };
  return { label: `Put the ${v.def.name} in the hideout (${S.cars.length}/${HIDEOUT.cars})`, run: () => intoStash(world, p, v) };
}
export function intoStash(world, p, v) {
  const h = hideoutFor(world, p);
  if (!h) return 'No hideout.';
  const S = stashOf(h.e);
  let why = null;
  if ((p.wanted || 0) > 0 && world.time - (p.seenAt ?? -99) < 3) why = 'Not with the police watching - lose them first.';
  else if (S.cars.length >= HIDEOUT.cars) why = `The hideout's full (${S.cars.length}/${HIDEOUT.cars} cars).`;
  else if (v.seats.some((q, i) => i > 0 && q)) why = 'Your passengers have to get out first.';
  if (why) { world.notify(p, why, 'warn'); return why; }
  S.cars.push({ model: v.model, paint: v.paint, variant: v.variant, ...(v.tint !== undefined ? { tint: v.tint } : {}) });
  const name = v.def.name, ped = p.ped;
  for (const cid of v.cargo || []) if (cid) { const c = world.get(cid); if (c) { c.state = 'ground'; c.parent = 0; c.x = v.x; c.y = v.y; } }
  ped.vehId = 0; ped.seat = -1; ped.x = h.s.x; ped.y = h.s.y + 12;
  moved(ped); world.place(ped);
  if (p.activeVehicle === v.id) p.activeVehicle = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  world.remove(v);
  store.touch(); p.meDirty = true;
  world.notify(p, `The ${name} is in the hideout (${S.cars.length}/${HIDEOUT.cars}). Out of sight.`, 'good');
  return null;
}
// a road spot by the place, clear of other cars
function spotNear(world, q, def) {
  const nodes = (world.map.nodes || []).filter((n) => n.lvl === 0 || n.lvl === undefined);
  let best = null, bd = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.x - q.x, n.y - q.y);
    if (d < bd && d < 600 && !world.query(n.x, n.y, def.L, K.VEH).length) { bd = d; best = n; }
  }
  return best ? { x: best.x, y: best.y, a: Math.atan2(q.y - best.y, q.x - best.x) + Math.PI / 2 } : { x: q.x, y: q.y + 80, a: 0 };
}

// ---- lying low ------------------------------------------------------------------------------------------------------------
// wanted, in your crew's hideout's yard: the heat cools HIDEOUT.coolX as fast (law.js); said once a wanted spell
export function lieLow(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || !(p.wanted > 0) || p.custody) { p.lieLowX = 0; if (!(p.wanted > 0)) p.lieLowSaid = 0; return 0; }
  const h = hideoutFor(world, p), at = ped.vehId ? world.get(ped.vehId) || ped : ped;
  const inYard = !!h && Math.hypot(at.x - h.s.x, at.y - h.s.y) <= HIDEOUT.lieLowR;
  p.lieLowX = inYard ? HIDEOUT.coolX : 0;
  if (inYard && !p.lieLowSaid) { p.lieLowSaid = 1; world.notify(p, `Lying low at ${h.s.name} - out of sight here, the heat cools ${HIDEOUT.coolX} times as fast.`, 'good'); }
  return p.lieLowX;
}
export function update(world) {
  if (world.tick % 10 !== 6) return;
  for (const p of world.players.values()) {
    if (!(p.wanted > 0) && !p.lieLowX) continue;
    try { lieLow(world, p); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[hideout]', e); }
  }
}

biz.setHideoutHooks({ canBuy, rows, run });
