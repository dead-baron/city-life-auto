// Felling trees (task #358; the sizes, tools and the fall: shared/felling.js). Stand at a tree with a cutting tool in
// the bag and hold the action button: the best tool you carry cuts (the hatchet only small trees, the axe up to the
// big redwoods, the felling axe and the chainsaw anything - the chainsaw fastest, loud, on its fuel). Let go and the cut
// stays in the tree a while. Cut through, the tree falls away from you over a second or so, hurting or killing whoever
// it lands on by its size (a hard hat takes some of it: lights.headGuard), and breaks into log bundles: crates
// (cargo.js) to carry, load onto a pickup or a flatbed, and sell at the hardware store. Felling in town or a park is
// vandalism (a little heat); out in the wilds it's free. A felled tree's stump grows back after TREE_REGROW_S when
// nobody is near. Only the felled trees are kept (world.felled: prop index -> { at, q, s }); everyone hears of a fall
// ('treefall', then 'treecrash' where it lands) and of the regrowth ('treeup'), and a player joining gets the list as
// [index, angle code, ...] (felledList).
// The wood's other uses (home upgrades, civilian missions, gang hideouts): LOG_USES below is the hook - the bundles are
// ordinary crates with .logs, so a system that wants wood takes them like any delivery (jobs.deliveryZoneFor).
import { K } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { treeSize, treeName, TREE_SIZES, FELL_TOOLS, fellTime, bestTool, fallAngle, underFall, logSpots, angleCode, codeAngle } from '../../shared/felling.js';
import { CHAINSAW_FUEL_S, TREE_REGROW_S, TREE_REGROW_NEAR, LOG_BUNDLE_PRICE, LOGS_LIFE_S } from '../../shared/rules.js';
import { wildStyle } from './wildlife.js';
import * as law from './law.js';
import * as combat from './combat.js';
import * as lights from './lights.js';
import { store } from '../store.js';

export const FALL_S = 1.2;          // the topple, from the crack to the crash
const REACH = 30;                   // px beyond the trunk you can cut from
const CUT_KEEP_S = 120;             // a half-made cut stays in the tree this long
const CELL = 128;
export const LOG_USES = ['sell'];   // (hook: 'home', 'mission', 'hideout' when those take wood)

// every tree on the map in a grid (made once per map)
function trees(map) {
  if (map._treeGrid) return map._treeGrid;
  const g = new Map();
  map.props.forEach((p, i) => {
    if (!treeSize(p)) return;
    const k = Math.floor(p.y / CELL) * 4096 + Math.floor(p.x / CELL);
    let l = g.get(k); if (!l) g.set(k, (l = [])); l.push(i);
  });
  Object.defineProperty(map, '_treeGrid', { value: g, enumerable: false, configurable: true });
  return g;
}
const trunkR = (map, i) => { const e = map.propSolid.get(i); return e ? e.r : 8; };
export const isFelled = (world, i) => !!(world.felled && world.felled.has(i));

// the standing tree you're at (facing it, or right against it): { i, p, d } or null
export function treeAt(world, x, y, a = null) {
  const map = world.map, g = trees(map);
  let best = null;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let j = cy - 1; j <= cy + 1; j++) for (let k = cx - 1; k <= cx + 1; k++) {
    for (const i of g.get(j * 4096 + k) || []) {
      const p = map.props[i];
      if (!p || p.broken || isFelled(world, i)) continue;
      const d = Math.hypot(p.x - x, p.y - y), r = trunkR(map, i) + REACH;
      if (d > r) continue;
      if (a !== null && d > trunkR(map, i) + 10) { let da = Math.atan2(p.y - y, p.x - x) - a; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > 1.3) continue; }
      if (!best || d < best.d) best = { i, p, d };
    }
  }
  return best;
}

// the prompt at a tree (players.findInteraction): only when you carry a cutting tool
export function interaction(world, p) {
  const ped = p.ped, inv = p.profile.inventory;
  if (!ped || ped.dead || ped.vehId || ped.carrying) return null;
  if (ped.chop) {
    const c = ped.chop, pct = Math.min(99, Math.floor((cutOf(world, c.i) / c.need) * 100));
    return { label: `${c.tool === 'chainsaw' ? 'Sawing' : 'Chopping'} the ${c.name}... ${pct}% (keep holding)`, run: () => {}, prog: pct / 100 };
  }
  if (!['hatchet', 'axe', 'fellaxe', 'chainsaw'].some((t) => (inv[t] || 0) > 0)) return null;
  const t = treeAt(world, ped.x, ped.y, ped.a);
  if (!t) return null;
  const size = treeSize(t.p), tool = bestTool(inv, size), name = treeName(t.p);
  if (!tool) {
    const need = size >= 4 ? 'a felling axe or a chainsaw' : 'an axe, a felling axe or a chainsaw';
    return { label: `Too big for your ${FELL_TOOLS[['chainsaw', 'fellaxe', 'axe', 'hatchet'].find((x) => (inv[x] || 0) > 0)].name.toLowerCase()} - a ${name} takes ${need}`, passive: true, run: () => {} };
  }
  const secs = Math.max(1, Math.round((TREE_SIZES[size].work - cutOf(world, t.i)) / FELL_TOOLS[tool].rate));
  return { label: `Hold to fell the ${name} (${FELL_TOOLS[tool].name.toLowerCase()}, ~${secs}s)${wildStyle(world.map, t.p.x, t.p.y) ? '' : ' - vandalism in town'}`, run: () => start(world, p, t.i, tool) };
}

const cutOf = (world, i) => { const c = world.cuts && world.cuts.get(i); return c ? c.work : 0; };
export function start(world, p, i, tool) {
  const ped = p.ped, tree = world.map.props[i], size = treeSize(tree);
  if (!ped || ped.dead || ped.vehId || !tree || isFelled(world, i) || fellTime(tool, size) === Infinity || (p.profile.inventory[tool] || 0) <= 0) return false;
  if (FELL_TOOLS[tool].fuel && sawFuel(p) <= 0 && !refuel(world, p)) { world.notify(p, 'The chainsaw is out of fuel - fuel cans at gas stations and hardware stores.', 'warn'); return false; }
  ped.chop = { i, tool, need: TREE_SIZES[size].work, name: treeName(tree), at: world.time, x: ped.x, y: ped.y, beat: 0 };
  ped.a = Math.atan2(tree.y - ped.y, tree.x - ped.x);
  ped.vx = 0; ped.vy = 0;
  ped.appVer = (ped.appVer || 0) + 1;   // (the chopping pose rides in the descriptor: net.js ch)
  lights.sync(world, p);                // (both hands on the axe: a hand light goes dark)
  p.meDirty = true;
  return true;
}
export function stop(world, ped) {
  if (!ped.chop) return;
  ped.chop = null;
  ped.appVer = (ped.appVer || 0) + 1;
  if (ped.player) { ped.player.meDirty = true; lights.sync(world, ped.player); }
}
const sawFuel = (p) => p.profile.sawFuel ?? CHAINSAW_FUEL_S;
function refuel(world, p) {
  const inv = p.profile.inventory;
  if ((inv.sawfuel || 0) <= 0) return false;
  inv.sawfuel--;
  p.profile.sawFuel = CHAINSAW_FUEL_S;
  world.notify(p, 'You fill the chainsaw from a can of fuel.', 'info');
  return true;
}

// the cut goes through: the tree tips over away from the cutter
export function fell(world, i, by = null, a = null) {
  const map = world.map, tree = map.props[i], size = treeSize(tree);
  if (!tree || !size || isFelled(world, i)) return false;
  const ang = a ?? (by ? fallAngle(tree, by.x, by.y) : 0), q = angleCode(ang);
  world.felled ||= new Map();
  world.felled.set(i, { at: world.time, q, s: size });
  if (world.cuts) world.cuts.delete(i);
  const e = map.propSolid.get(i);
  if (e) e.off = true;
  world.broadcast({ e: 'treefall', i, q, s: size, x: Math.round(tree.x), y: Math.round(tree.y) });
  (world.falling ||= []).push({ i, a: codeAngle(q), s: size, land: world.time + FALL_S, by: by ? by.id : 0 });
  // in town or a park it's vandalism: a little heat
  if (by && by.player && !wildStyle(map, tree.x, tree.y)) law.crime(world, by, 'treeFelling', null, tree.x, tree.y);
  if (by && by.player) { const st = by.player.profile.stats; st.felled = (st.felled || 0) + 1; store.touch(); }
  return true;
}
// it lands: whoever is under it is hurt by its size, and it breaks into log bundles
function land(world, f) {
  const tree = world.map.props[f.i], S = TREE_SIZES[f.s], by = f.by ? world.get(f.by) : null;
  const tip = [tree.x + Math.cos(f.a) * S.len, tree.y + Math.sin(f.a) * S.len];
  world.broadcast({ e: 'treecrash', i: f.i, s: f.s, x: Math.round(tip[0]), y: Math.round(tip[1]) });
  const mx = tree.x + Math.cos(f.a) * S.len / 2, my = tree.y + Math.sin(f.a) * S.len / 2;
  for (const ped of world.query(mx, my, S.len / 2 + S.wide + 20, K.PED)) {
    if (ped.dead || ped.vehId || ped.hidden) continue;
    const k = underFall(tree, f.a, f.s, ped.x, ped.y);
    if (!k) continue;
    const dmg = S.dmg * k * lights.headGuard(ped);
    ped.downUntil = Math.max(ped.downUntil || 0, world.time + 1.4);
    combat.damage(world, ped, dmg, by && by !== ped ? by : null, 'tree', f.a);
    if (ped.player) world.notify(ped.player, ped.dead ? 'A falling tree crushed you.' : `A falling tree caught you${ped.hardhat ? ' - the hard hat took some of it' : ''}.`, 'bad');
  }
  for (const [x, y] of logSpots(tree, f.a, f.s)) {
    const c = world.spawnCrate(1, x, y, { label: 'Log Bundle', value: LOG_BUNDLE_PRICE, contraband: false, expires: world.time + LOGS_LIFE_S });
    c.logs = true;
  }
}

// carrying a bundle at the hardware store: sell it (players.findInteraction, before the other deliveries)
export function sellZone(world, p, crate) {
  if (!crate || !crate.logs) return null;
  const ped = p.ped, shop = world.map.pois.find((q) => q.kind === 'hardware' && Math.hypot(q.x - ped.x, q.y - ped.y) < 90);
  if (!shop) return null;
  return { label: `Sell the logs to ${shop.label || 'the hardware store'} (+$${crate.value})`, run: () => sellLogs(world, p, crate) };
}
export function sellLogs(world, p, crate) {
  const ped = p.ped;
  if (!crate || !crate.logs || ped.carrying !== crate.id) return false;
  ped.carrying = 0;
  world.remove(crate);
  p.profile.cash += crate.value;
  world.emit(ped.x, ped.y, { e: 'cash', x: ped.x, y: ped.y });
  world.notify(p, `Sold a bundle of logs: +$${crate.value}.`, 'good');
  p.meDirty = true;
  store.touch();
  return true;
}

// for a player joining: the felled trees as [prop index, angle code, ...]
export function felledList(world) {
  const out = [];
  for (const [i, f] of world.felled || []) out.push(i, f.q);
  return out;
}

export function update(world, dt) {
  const now = world.time;
  // the cutting: keep holding the button, stay put, don't get hit
  for (const p of world.players.values()) {
    const ped = p.ped, c = ped && ped.chop;
    if (!c) continue;
    const tree = world.map.props[c.i];
    const held = (p.prevBits || 0) & IN.ACTION;
    if (!held || ped.dead || ped.vehId || ped.carrying || !tree || isFelled(world, c.i) || (p.profile.inventory[c.tool] || 0) <= 0
      || Math.hypot(ped.x - c.x, ped.y - c.y) > 10 || (ped.lastHitAt || -99) > c.at || now < (ped.downUntil || 0)) { stop(world, ped); continue; }
    const T = FELL_TOOLS[c.tool];
    if (T.fuel) {
      const f = sawFuel(p) - dt;
      p.profile.sawFuel = Math.max(0, f);
      if (f <= 0 && !refuel(world, p)) { world.notify(p, 'The chainsaw sputters out: no fuel. Fuel cans at gas stations and hardware stores.', 'warn'); stop(world, ped); continue; }
    }
    world.cuts ||= new Map();
    const cut = world.cuts.get(c.i) || { work: 0, at: now };
    cut.work += T.rate * dt; cut.at = now;
    world.cuts.set(c.i, cut);
    // the strokes (and the saw's whine), heard round about
    c.beat -= dt;
    if (c.beat <= 0) {
      c.beat = T.fuel ? 0.5 : 0.62;
      world.emit(tree.x, tree.y, { e: T.fuel ? 'saw' : 'chop', x: Math.round(tree.x), y: Math.round(tree.y), id: ped.id });
      ped.attackAnimUntil = now + 0.3;
    }
    if (world.tick % 5 === 0) p.meDirty = true;
    if (cut.work >= c.need) { stop(world, ped); fell(world, c.i, ped); }
  }
  // the falls: each lands FALL_S after the crack
  if (world.falling && world.falling.length) {
    const left = [];
    for (const f of world.falling) { if (now >= f.land) land(world, f); else left.push(f); }
    world.falling = left;
  }
  if (world.tick % 40 !== 13) return;
  // half-made cuts heal over; stumps grow back when nobody's near
  if (world.cuts) for (const [i, c] of world.cuts) if (now - c.at > CUT_KEEP_S) world.cuts.delete(i);
  if (world.felled && world.felled.size) {
    for (const [i, f] of [...world.felled]) {
      if (now - f.at < TREE_REGROW_S) continue;
      const tree = world.map.props[i];
      let near = false;
      for (const q of world.players.values()) if (q.ped && Math.abs(q.ped.x - tree.x) < TREE_REGROW_NEAR && Math.abs(q.ped.y - tree.y) < TREE_REGROW_NEAR && Math.hypot(q.ped.x - tree.x, q.ped.y - tree.y) < TREE_REGROW_NEAR) { near = true; break; }
      if (near) continue;
      regrow(world, i);
    }
  }
}
export function regrow(world, i) {
  if (!world.felled || !world.felled.delete(i)) return false;
  const e = world.map.propSolid.get(i);
  if (e) e.off = false;
  world.broadcast({ e: 'treeup', i });
  return true;
}
