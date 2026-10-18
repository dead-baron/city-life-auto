// Fishing (task #277; the owner's fishing concepts FC01-FC22, 2026-10-18; the fish, the rods, the baits and the fight
// itself: shared/fish.js). Face the water with a rod and press the action button by it:
//   - hold it and the cast's power swings up and down; let go and the line flies out that far (a long cast reaches
//     deeper water, where the rare ones are);
//   - the bobber sits; a nibble or two; then it dives - strike (press) before it's gone, not before it goes;
//   - the fight: hold to raise your bar, let go and it sinks; keep the fish inside it and the catch meter fills, let it
//     out and the meter drains. Full: it's yours - into your cooler, with its weight; empty: it's off.
// What bites is the water (habitatAt: a pond, a lake, a river or a creek, the marshes, the shallows, a pier's pilings,
// the reef, open water from a boat, the deep after dark, the cave's pool), the hour, your rod (the one made for that
// water: each holds fish up to a weight, a heavier one snaps the line) and your bait (one goes per fish hooked). Each
// water has its legendary catch, at its own spot (shared/fish.js LEGEND). Your cooler (prof.creel) sells at a fish
// market, a bait shop or a charter desk; your log (prof.fishLog) keeps what you've caught and your best of each; the
// records board (store.kept.fishRecords) keeps the biggest of each kind anyone's landed.
//   The fight is stepped one input at a time (input), exactly as the page predicts it (client/fishing.js): the button
// held, the button pressed - so a strike lands when the page says it does, wherever the server's clock is. The state
// rides the snapshot's spare slots (net.js: fishOut), the fight's parameters the me record (meInfo: fixed when the line
// goes out, so the page can play the fight itself).
//   spotFor(world, ped)              the water in front of you (or over a boat's side), or null
//   canFish(p)                       a rod to fish with
//   begin(world, p, spot)            the action button pressed by the water: the cast's charge starts
//   input(world, p, ped, inp, pressed, dt) -> true while fishing (the action button is the fishing's)
//   tick(world)                      the line's own clock: a boat driven off, a fight left too long
//   cancel(world, p, msg)            reel in
//   interaction(world, p)            the prompt while fishing
//   meInfo(p) / creelInfo(prof)      the me record's fishing and cooler
//   shopOptions(p, kind, opts)       a fish market's, a bait shop's, a charter desk's menu: sell the catch, choose a bait
//   sellCatch(world, p, kind)        the cooler sold
//   habitatAt(world, x, y, o)        the water there: { water, spot }
import { TILE, T } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { DISTRICTS } from '../../shared/mapcore.js';
import { undergroundOf, ugMapOf, caveOf, UG } from '../../shared/underground.js';
import * as FS from '../../shared/fish.js';
import { ITEMS } from '../../shared/items.js';
import { FISHING, DEEPSEA_PAY } from '../../shared/rules.js';
import { store } from '../store.js';

const { PH } = FS;
const wet = (t) => t === T.WATER || t === T.DEEP;
// the warm southern seas (the reef: Pelican Key, Coral Cay, Paradise Cay, the Sandpiper coast and bay) and the salt marsh
// (the Egret Coast and Egret Point)
const REEF_D = new Set([14, 44, 45, 52, 59]);
const SALT_MARSH_D = new Set([53, 65]);
const PARK_STYLES = new Set(['park', 'luxury', 'civic', 'arts']);

// ---- where -------------------------------------------------------------------------------------------------------
const inPool = (m, x, y) => (m.pools || []).some((r) => (r.ring ? Math.abs(Math.hypot((x - r.ring.cx) / r.ring.rx, (y - r.ring.cy) / r.ring.ry) - 1) * Math.min(r.ring.rx, r.ring.ry) < r.ring.hw + 16 : x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h));
const mapFor = (world, ped) => (ped.ug ? ugMapOf(world.map) || world.map : world.map);
// The water just in front of you (the way you face, a little either side): { x, y, a } - never a swimming pool, a lido
// or the water park. From a boat sitting still: over its side.
export function spotFor(world, ped) {
  const v = ped.vehId ? world.get(ped.vehId) : null;
  if (v) {
    if (v.def.kind !== 'boat' || Math.hypot(v.vx, v.vy) > 40) return null;
    const a = v.a + Math.PI / 2, d = v.def.W / 2 + 20;
    return { x: v.x + Math.cos(a) * d, y: v.y + Math.sin(a) * d, a, boat: v.id };
  }
  const m = mapFor(world, ped);
  for (const off of [0, 0.6, -0.6, Math.PI / 2, -Math.PI / 2]) {
    const a = ped.a + off;
    for (const d of [30, 48]) {
      const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
      if (!wet(m.tileAtPx(x, y)) || (!ped.ug && inPool(m, x, y))) continue;
      return { x, y, a };
    }
  }
  return null;
}
// Far enough out at sea for the big ones: no land within ~12 tiles.
export function offshoreAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) if (!wet(map.tileAt(tx + dx, ty + dy))) return false;
  return true;
}
const districtOf = (m, tx, ty) => (m.inside(tx, ty) ? m.dist[m.idx(tx, ty)] : -1);
// the district of the nearest land (out to r tiles), or -1
function landNear(m, tx, ty, r) {
  for (let k = 1; k <= r; k++) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
    const t = m.tileAt(tx + dx, ty + dy);
    if (!wet(t) && t !== T.BRIDGE && t !== T.WALL) return districtOf(m, tx + dx, ty + dy);
  }
  return -1;
}
const near = (m, tx, ty, r, t) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (m.tileAt(tx + dx, ty + dy) === t) return true; return false; };
function inMarsh(m, x, y) {
  for (const q of m.natureSites || []) if (q.kind === 'marsh' && Math.hypot(q.x - x, q.y - y) < 900) return true;
  for (const q of m.landmarks || []) if (q.type === 'marsh' && x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.h) return true;
  return false;
}
function lakeSize(m, tx, ty) { let n = 0; for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) if (m.inside(tx + dx, ty + dy) && m.lake && m.lake[m.idx(tx + dx, ty + dy)]) n++; return n; }
function narrow(m, tx, ty) { let n = 0; for (let k = -4; k <= 4; k++) { if (wet(m.tileAt(tx + k, ty))) n++; if (wet(m.tileAt(tx, ty + k))) n++; } return n < 11; }
function belowFalls(m, x, y) { for (const s of m.natureSites || []) { const f = s.falls; if (f && Number.isFinite(f.x) && Math.abs(x - f.x) < 220 && y > f.y - 40 && y < f.y + 420) return true; } return false; }
// The water at (x, y) px: { water (shared/fish.js WATERS), spot (a legendary's place, or null) }. o: { ug (underground),
// boat (fishing from one), night }
export function habitatAt(world, x, y, o = {}) {
  const map = world.map;
  if (o.ug) {
    const L = undergroundOf(map), K = L && caveOf(L, x, y), pool = K && K.ch && K.ch.pool;
    return { water: 'cave', spot: pool && Math.hypot(pool.x - x, pool.y - y) < (pool.r || 120) + 40 ? 'cave' : null };
  }
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const i = map.inside(tx, ty) ? map.idx(tx, ty) : -1;
  const d = i >= 0 ? map.dist[i] : -1;
  if (i >= 0 && map.lake && map.lake[i]) {   // a lake or a pond (fresh, still)
    if (inMarsh(map, x, y)) return { water: 'swamp', spot: null };
    if (lakeSize(map, tx, ty) >= 18) return { water: 'lake', spot: map.tileAt(tx, ty) === T.DEEP ? 'drop' : null };
    const ld = landNear(map, tx, ty, 6), D = DISTRICTS[ld >= 0 ? ld : d];
    return { water: 'pond', spot: D && (PARK_STYLES.has(D.style) || ld === 12) ? 'lily' : null };
  }
  if (i >= 0 && map.river && map.river[i]) {   // a river, a creek; the marsh's tidal creeks
    if (SALT_MARSH_D.has(d) || inMarsh(map, x, y)) return { water: 'swamp', spot: SALT_MARSH_D.has(d) ? 'mangrove' : null };
    const spot = near(map, tx, ty, 4, T.BRIDGE) ? 'bridge' : belowFalls(map, x, y) ? 'falls' : null;
    return { water: narrow(map, tx, ty) ? 'creek' : 'river', spot };
  }
  // the sea
  if (o.boat && offshoreAt(map, x, y)) return o.night ? { water: 'deep', spot: 'night' } : { water: 'offshore', spot: 'blue' };
  if (near(map, tx, ty, 2, T.DOCK)) return { water: 'pier', spot: 'pilings' };
  const ld = landNear(map, tx, ty, 8);
  if (SALT_MARSH_D.has(ld) || SALT_MARSH_D.has(d)) return { water: 'swamp', spot: 'mangrove' };
  if (REEF_D.has(ld) || REEF_D.has(d)) return { water: 'reef', spot: null };
  if (ld < 0 && !o.boat && offshoreAt(map, x, y)) return o.night ? { water: 'deep', spot: 'night' } : { water: 'offshore', spot: 'blue' };
  return { water: 'shore', spot: null };
}
// the hour as the fish see it
export function whenOf(world) {
  const c = world.clock || {}, mn = c.minutes || 0;
  if ((mn > 330 && mn < 470) || (mn > 1080 && mn < 1230)) return 'dusk';
  return c.isNight ? 'night' : 'day';
}

// ---- the gear -------------------------------------------------------------------------------------------------------
const hasRod = (prof) => (id) => (id === 'rod' ? prof.weapons.rod !== undefined : (prof.inventory[id] || 0) > 0);
export function canFish(p) { return FS.ROD_IDS.some(hasRod(p.profile)); }
function baitFor(prof, water, when) {
  const have = (id) => prof.inventory[id] || 0, night = when === 'night';
  const ok = (id) => id && FS.BAITS[id] && have(id) > 0 && (!FS.BAITS[id].night || night);
  return ok(prof.bait) ? prof.bait : FS.bestBait(have, water, { night });
}
const creelOf = (prof) => (prof.creel ||= []);

// ---- the line --------------------------------------------------------------------------------------------------------
export function begin(world, p, spot) {
  const ped = p.ped, prof = p.profile;
  if (!canFish(p)) { world.notify(p, 'You need a fishing rod - a bait shop or a sports store sells them.', 'warn'); return; }
  if (creelOf(prof).length >= FISHING.creel) { world.notify(p, `Your cooler's full (${FISHING.creel} fish) - sell your catch at a fish market or a bait shop.`, 'warn'); return; }
  ped.a = spot.a;
  const when = whenOf(world), hab = habitatAt(world, spot.x, spot.y, { ug: ped.ug === UG.CAVE, boat: !!spot.boat, night: when === 'night' });
  const rod = FS.rodFor(hasRod(prof), hab.water) || 'rod';
  ped.fishing = { F: FS.newFight(), P: null, a: spot.a, sx: spot.x, sy: spot.y, x: spot.x, y: spot.y, boat: spot.boat || 0, rod, seq: p.lastInput ? p.lastInput.seq : -1, at: world.time, held: ped.weapon };
  ped.weapon = 'rod';   // (the rod in your hands: the 'fish' pose holds it out - client/art2/game/peds.js)
  p.meDirty = true;
}
// One input's step: the button held and pressed. true: fishing took the action button.
export function input(world, p, ped, inp, pressed, dt) {
  const L = ped.fishing;
  if (!L || !L.F) return false;
  if (inp.seq !== undefined) { if (inp.seq === L.seq) return true; L.seq = inp.seq; }   // (a stand-in for a late input: not a step)
  const F = L.F, ph0 = F.ph;
  // walking off: reel in (not with a fish on: you can't move then anyway)
  if ((ph0 === PH.CHARGE || ph0 === PH.WAIT) && Math.hypot(inp.mx || 0, inp.my || 0) > 0.3 && !L.boat) { cancel(world, p, null); return false; }
  const nib0 = ph0 === PH.WAIT && L.P ? FS.nibbles(L.P).filter((s) => s <= F.t).length : 0;
  FS.fightStep(F, L.P, !!(inp.bits & IN.ACTION), !!(pressed & IN.ACTION), dt);
  if (ph0 === PH.CHARGE && F.ph === PH.WAIT) cast(world, p, ped, L);
  else if (ph0 === PH.WAIT && F.ph === PH.WAIT && L.P && FS.nibbles(L.P).filter((s) => s <= F.t).length > nib0) world.emit(L.x, L.y, { e: 'nibble', id: ped.id, x: Math.round(L.x), y: Math.round(L.y) });
  else if (ph0 === PH.WAIT && F.ph === PH.BITE) world.emit(L.x, L.y, { e: 'bite', id: ped.id, x: Math.round(L.x), y: Math.round(L.y) });
  else if (ph0 === PH.BITE && F.ph === PH.FIGHT) hooked(world, p, ped, L);
  if (F.ph === PH.DONE) finish(world, p, ped, L, ph0);
  return true;
}
// Let go: the line flies out (the power: how far, out along the way you face, as far as the water goes), and what's
// down there is settled - the fish, its weight, how it will fight
function cast(world, p, ped, L) {
  const prof = p.profile, m = mapFor(world, ped), F = L.F;
  const when = whenOf(world), boat = L.boat ? world.get(L.boat) : null;
  const rodId = L.rod, R = FS.RODS[rodId];
  const [bx, by] = FS.landing(L.sx, L.sy, L.a, F.power, R.cast, (x, y) => wet(m.tileAtPx(x, y)) && (ped.ug || !inPool(m, x, y)));
  L.x = bx; L.y = by;
  const hab = habitatAt(world, bx, by, { ug: ped.ug === UG.CAVE, boat: !!boat, night: when === 'night' });
  const bait = baitFor(prof, hab.water, when);
  const rand = world.rand;
  const f = FS.pickFish(hab, { when, bait, rodLb: R.lb, far: F.power }, rand) || FS.FISH_BY_ID.bluegill;
  const lb = FS.weighFish(f, rand), seed = Math.floor(rand() * 4294967296) >>> 0;
  L.P = FS.fightParams(f, lb, rodId, hab.water, seed, { bait });
  L.fish = f.id; L.lb = lb; L.bait = bait; L.hab = hab;
  world.emit(bx, by, { e: 'cast', id: ped.id, x: Math.round(bx), y: Math.round(by), fx: Math.round(ped.x), fy: Math.round(ped.y) });
  p.meDirty = true;
}
function hooked(world, p, ped, L) {
  const prof = p.profile;
  if (L.bait && (prof.inventory[L.bait] || 0) > 0) { prof.inventory[L.bait]--; if (prof.bait === L.bait && !prof.inventory[L.bait]) prof.bait = null; }
  world.emit(L.x, L.y, { e: 'hook', id: ped.id, x: Math.round(L.x), y: Math.round(L.y), leg: FS.FISH_BY_ID[L.fish].rare === 5 ? 1 : 0 });
  p.meDirty = true;
}
function finish(world, p, ped, L, ph0) {
  const out = L.F.out, f = FS.FISH_BY_ID[L.fish];
  if (out === 1) land(world, p, ped, f, L.lb, L.hab);
  else if (out === 2) { world.emit(L.x, L.y, { e: 'flost', id: ped.id, x: Math.round(L.x), y: Math.round(L.y) }); world.notify(p, f.rare === 5 ? `It's gone... something enormous was on that line.` : 'It got away!', 'info'); }
  else if (out === 4) { world.emit(L.x, L.y, { e: 'flost', id: ped.id, x: Math.round(L.x), y: Math.round(L.y), snap: 1 }); world.notify(p, `The line snapped - that was too heavy for your ${FS.RODS[L.rod].name}. A heavier rod would hold it.`, 'warn'); }
  else if (ph0 === PH.BITE) world.notify(p, 'Missed it - strike the moment the bobber goes under.', 'info');
  else if (ph0 === PH.WAIT) world.notify(p, L.P ? 'You reeled in - wait for the bobber to go right under before you strike.' : 'You reeled in.', 'info');
  end(p, ped);
}
function end(p, ped) {
  const L = ped.fishing, W = p.profile.weapons;
  ped.fishing = null;
  if (L && W.rod === undefined) ped.weapon = L.held && W[L.held] !== undefined ? L.held : 'fists';   // (a rod from the bag goes back in it)
  p.meDirty = true;
}
// Landed: into the cooler, the log, the records board; the charter's count; the catch card on your screen
function land(world, p, ped, f, lb, hab) {
  const prof = p.profile, v = FS.fishValue(f, lb);
  creelOf(prof).push([f.id, lb]);
  const log = (prof.fishLog ||= {}), had = log[f.id], first = !had, best = !had || lb > had[1];
  log[f.id] = [(had ? had[0] : 0) + 1, best ? lb : had[1]];
  prof.stats.fish = (prof.stats.fish || 0) + 1;
  const recs = (store.kept.fishRecords ||= {}), rec = recs[f.id], world1 = !rec || lb > rec[0];
  if (world1) recs[f.id] = [lb, p.name || 'someone'];
  const kinds = Object.keys(log).length;
  world.emit(ped.x, ped.y, { e: 'catch', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), f: f.i, lb });
  if (p.conn) p.conn.sendJSON({ t: 'fish', f: f.i, lb, v, nw: first ? 1 : 0, pb: best && !first ? 1 : 0, wr: world1 ? 1 : 0, n: kinds, of: FS.FISH.length, w: FS.WATER_NAME[hab.water] });
  world.notify(p, `${f.name}, ${lb} lb${first ? ' - new to your log!' : best ? ' - your best yet!' : ''} Into the cooler (${creelOf(prof).length}/${FISHING.creel}).`, 'good');
  if (f.rare === 5) world.broadcast({ e: 'toast', text: `${p.name || 'Someone'} has landed ${f.name} - ${lb} lb!`, tone: 'good' });
  if ((hab.water === 'offshore' || hab.water === 'deep') && p.job && p.job.type === 'deepsea') {
    p.job.got++;
    if (p.job.got >= p.job.need) { prof.bank += p.job.pay || DEEPSEA_PAY; prof.samaritan += 2; world.notify(p, `Charter complete! +$${p.job.pay || DEEPSEA_PAY} to your bank. Sell the catch at the charter desk or the fish market.`, 'good'); p.job = null; }
    else p.job.text = `Deep-sea charter: ${p.job.got}/${p.job.need} offshore fish`;
  }
  p.meDirty = true;
  store.touch();
}
export function cancel(world, p, msg) {
  if (!p.ped || !p.ped.fishing || !p.ped.fishing.F) return;
  end(p, p.ped);
  if (msg) world.notify(p, msg, 'info');
}
// The line's own clock (jobs.update): a boat driven off pulls it in; a cast never let go, or a fight left, ends
export function tick(world) {
  for (const p of world.players.values()) {
    const ped = p.ped, L = ped && ped.fishing;
    if (!L || !L.F) continue;
    if (L.boat) { const v = world.get(L.boat); if (!v || ped.vehId !== L.boat || Math.hypot(v.vx, v.vy) > 60) { cancel(world, p, 'You pulled your line in.'); continue; } }
    else if (ped.vehId || ped.dead || ped.board) { cancel(world, p, null); continue; }
    if (world.time - L.at > FISHING.maxS) cancel(world, p, 'You reeled in your line.');
  }
}
export function interaction(world, p) {
  const L = p.ped && p.ped.fishing;
  if (!L || !L.F) return null;
  const label = L.F.ph === PH.CHARGE ? 'Let go to cast' : L.F.ph === PH.WAIT ? 'Waiting for a bite... (strike when it goes under)' : L.F.ph === PH.BITE ? 'STRIKE!' : 'Hold to reel, let go to ease off';
  return { label, run: () => {} };
}

// ---- what the page sees ----------------------------------------------------------------------------------------------
export function meInfo(p) {
  const L = p.ped && p.ped.fishing;
  if (!L || !L.F) return null;
  const o = { sx: Math.round(L.sx), sy: Math.round(L.sy), a: L.a, cast: FS.RODS[L.rod].cast, rod: FS.RODS[L.rod].name, boat: L.boat ? 1 : 0 };
  if (L.P) { const { snap, ...P } = L.P; void snap; Object.assign(o, { x: Math.round(L.x), y: Math.round(L.y), P, leg: FS.FISH_BY_ID[L.fish].rare === 5 ? 1 : 0, bait: L.bait ? ITEMS[L.bait].name : null }); }
  return o;
}
export function creelInfo(prof) {
  const c = prof.creel;
  if (!c || !c.length) return null;
  let v = 0; for (const [id, lb] of c) { const f = FS.FISH_BY_ID[id]; if (f) v += FS.fishValue(f, lb); }
  return { n: c.length, v, max: FISHING.creel };
}

// ---- the shops -------------------------------------------------------------------------------------------------------
const SELL = { fishmarket: 1, tackle: FISHING.baitShopCut, charter: FISHING.baitShopCut };
export function shopOptions(p, kind, opts) {
  if (!(kind in SELL)) return null;
  const prof = p.profile, c = creelOf(prof);
  if (c.length) {
    let v = 0; for (const [id, lb] of c) { const f = FS.FISH_BY_ID[id]; if (f) v += FS.fishValue(f, lb); }
    const best = c.reduce((a, q) => { const f = FS.FISH_BY_ID[q[0]]; return f && (!a || f.rare > a[0].rare || (f.rare === a[0].rare && FS.fishValue(f, q[1]) > FS.fishValue(a[0], a[1]))) ? [f, q[1]] : a; }, null);
    opts.unshift({ id: 'creel', label: `Sell your catch (${c.length} fish${best ? `: ${best[0].name}, ${best[1]} lb${c.length > 1 ? '...' : ''}` : ''})`, price: -Math.round(v * SELL[kind]), note: kind === 'fishmarket' ? 'best prices' : '' });
  }
  for (const id of FS.BAIT_IDS) if ((prof.inventory[id] || 0) > 0 && ITEMS[id]) opts.push({ id: `bait:${id}`, label: `Fish with ${ITEMS[id].name}`, note: prof.bait === id ? 'selected' : `have ${prof.inventory[id]}`, dis: prof.bait === id });
  if (prof.bait && (prof.inventory[prof.bait] || 0) > 0) opts.push({ id: 'bait:auto', label: 'Let me pick the bait for the water', note: '' });
  const log = prof.fishLog || {}, kinds = Object.keys(log).length;
  const board = kind === 'fishmarket' ? records().slice(0, 3).map(([f, lb, who]) => `${f.name} ${lb} lb (${who})`).join(', ') : '';
  return `Your log: ${kinds} of ${FS.FISH.length} kinds caught.${recordLine(prof)}${board ? ` The records board: ${board}.` : ''} Bait decides what bites; each rod is made for its waters and holds fish up to a weight.`;
}
function recordLine(prof) {
  const log = prof.fishLog || {};
  let best = null;
  for (const [id, [, lb]] of Object.entries(log)) { const f = FS.FISH_BY_ID[id]; if (f && (!best || f.rare > best[0].rare || (f.rare === best[0].rare && lb > best[1]))) best = [f, lb]; }
  return best ? ` Your best: ${best[0].name}, ${best[1]} lb.` : '';
}
export function sellCatch(world, p, kind) {
  const prof = p.profile, c = creelOf(prof);
  if (!c.length) return 'Your cooler is empty.';
  let v = 0; for (const [id, lb] of c) { const f = FS.FISH_BY_ID[id]; if (f) v += FS.fishValue(f, lb); }
  v = Math.round(v * (SELL[kind] ?? FISHING.baitShopCut));
  const n = c.length;
  prof.creel = [];
  prof.bank += v;
  world.notify(p, `Sold ${n} fish for $${v.toLocaleString()} (to your bank).`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
// the records board (the biggest of each kind anyone's landed): [[fish, lb, angler]], rarest first
export function records() {
  const recs = store.kept.fishRecords || {};
  return Object.entries(recs).map(([id, [lb, who]]) => [FS.FISH_BY_ID[id], lb, who]).filter((r) => r[0]).sort((a, b) => b[0].rare - a[0].rare || b[1] - a[1]);
}
