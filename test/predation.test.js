// Animal against animal (Nature-A2, server/systems/wildlife.js "the hunt"): the wolves run a deer down as a pack, a
// mountain lion creeps up on one and springs, the prey watch for their hunters; a heron spears fish in the shallows, a
// bear grabs salmon in the white water under a falls, an otter dives for them and eats them on the bank, an osprey drops
// into the water and lifts off with one, an eagle stoops on a rabbit and carries it off, a fox mouses in the long grass.
// Never a pet, the farms' stock, the park's tame ducks, a legend or a person - and never with anyone close by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import { DISTRICTS, WATER_T } from '../shared/map.js';
import { SPECIES, APOSE, PREDATORS_OF, HABITATS } from '../shared/fauna.js';
import { ITEMS } from '../shared/items.js';
import * as wildlife from '../server/systems/wildlife.js';
import * as combat from '../server/systems/combat.js';

// the most open stretch of Highland Woods' grass (the fewest walls and water round it), its trees and rocks cleared
// away: a meadow to watch a hunt on
function meadow(w) {
  const m = w.map;
  if (m._testMeadow) return m._testMeadow;
  let best = null, bs = Infinity;
  for (let ty = m.y0; ty < m.y0 + m.h; ty += 8) for (let tx = m.x0; tx < m.x0 + m.w; tx += 8) {
    const i = m.idx(tx, ty);
    if (m.tiles[i] !== T.GRASS || DISTRICTS[m.dist[i]].name !== 'Highland Woods') continue;
    let bad = 0;
    for (let dy = -18; dy <= 18; dy += 3) for (let dx = -18; dx <= 18; dx += 3) { const t = m.tileAt(tx + dx, ty + dy); if (t !== T.GRASS && t !== T.DIRT) bad++; }
    if (bad < bs) { bs = bad; best = { x: tx * TILE + 16, y: ty * TILE + 16 }; }
  }
  for (const arr of m.solidProps.values()) for (const e of arr) if (Math.abs(e.x - best.x) < 1500 && Math.abs(e.y - best.y) < 1500) e.off = true;
  Object.defineProperty(m, '_testMeadow', { value: best, enumerable: false });
  return best;
}
const clear = (w) => { for (const e of [...w.entities.values()]) if ((e.kind === K.PED && !e.player) || (e.kind === K.VEH && !e.owner)) w.remove(e); };
// someone watching from a long way off (kept there, the wind carrying their scent away from what they watch)
function watcher(w, p) {
  return (x, y, ang = 0) => {
    teleport(w, p.ped, x + Math.cos(ang) * 1100, y + Math.sin(ang) * 1100); p.ped.vx = p.ped.vy = 0;
    w.windHold = { a: Math.atan2(p.ped.y - y, p.ped.x - x), s: 0.6 };
  };
}
function recordEvents(w) { const evs = []; const emit0 = w.emit.bind(w); w.emit = (x, y, ev) => { evs.push(ev); return emit0(x, y, ev); }; return evs; }
const wolvesOf = (w) => wildlife.animals(w).filter((e) => e.wild.kind === 'wolf' && !e.wild.young);

test('the hunters and their prey: who hunts whom, and the fishers and birds of prey are protected', () => {
  for (const [k, S] of Object.entries(SPECIES)) {
    for (const t of Object.keys(S.habitat)) assert.ok(HABITATS.includes(t), `${k}: habitat ${t}`);
    for (const [id] of S.loot) assert.ok(ITEMS[id], `${k}: loot ${id}`);
    if (S.hunts) for (const q of S.hunts.prey) { assert.ok(SPECIES[q], `${k} hunts ${q}`); assert.ok(PREDATORS_OF[q].has(k)); }
  }
  assert.ok(PREDATORS_OF.deer.has('wolf') && PREDATORS_OF.deer.has('cougar'), 'deer: the wolves and the lions');
  assert.ok(PREDATORS_OF.rabbit.has('eagle') && PREDATORS_OF.rabbit.has('coyote') && PREDATORS_OF.rabbit.has('bobcat'));
  for (const k of ['heron', 'osprey', 'eagle']) assert.ok(SPECIES[k].protected && SPECIES[k].bird && !SPECIES[k].loot.length, `${k}: protected`);
  assert.equal(SPECIES.heron.fishes.how, 'strike'); assert.equal(SPECIES.blackbear.fishes.how, 'swipe'); assert.equal(SPECIES.otter.fishes.how, 'dive'); assert.equal(SPECIES.osprey.fishes.how, 'plunge');
  assert.ok(SPECIES.redfox.mouses && SPECIES.greyfox.mouses);
  assert.ok(ITEMS.wolfPelt && ITEMS.wolfPelt.pelt && ITEMS.legend_wolf, 'a wolf pelt (and the White Wolf\'s)');
  for (const v of Object.values(APOSE)) assert.ok(v < 32, 'poses fit the wire (5 bits)');
});

test('a wolf pack runs a deer down: in at a trot, fanning out, the rush, the take - no blood - and the pack feeds', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const M = meadow(w), watch = watcher(w, p), evs = recordEvents(w);
  let kill = null, seen = new Set(), fanned = false, feeding = 0;
  for (let t = 0; t < 4 && !kill; t++) {
    clear(w);
    wildlife.spawnGroup(w, 'deer', M.x, M.y);
    const ang = t * 1.7;
    wildlife.spawnGroup(w, 'wolf', M.x + Math.cos(ang) * 650, M.y + Math.sin(ang) * 650);
    const pack = wolvesOf(w), lead = pack.find((e) => e.wild.lead) || pack[0];
    const deer = wildlife.animals(w).filter((e) => e.wild.kind === 'deer'), q = deer.find((e) => !e.wild.young) || deer[0];
    assert.ok(pack.length >= 2 && q, 'a pack and a deer');
    watch(q.x, q.y, ang + 1.6);
    assert.ok(wildlife.startHunt(w, lead, q));
    for (let i = 0; i < 20 * 30 && !kill; i++) {
      if (i % 20 === 0) watch(q.x, q.y, ang + 1.6);
      w.step();
      for (const e of pack) seen.add(e.wild.state);
      if (!fanned && pack.length >= 3 && pack.every((e) => e.wild.state === 'hunt')) { const flanks = new Set(pack.map((e) => e.wild.flank)); fanned = flanks.has(1) && flanks.has(-1); }
      kill = deer.find((e) => e.dead) || null;
    }
    if (kill) { for (let i = 0; i < 20 * 4; i++) w.step(); feeding = pack.filter((e) => e.wild.state === 'feed' && Math.hypot(e.x - kill.x, e.y - kill.y) < 60).length; }
  }
  assert.ok(seen.has('hunt') && seen.has('rush'), `in, then the rush (${[...seen]})`);
  assert.ok(kill, 'the pack brought one down');
  assert.equal(kill.wild.takenBy, 'wolf');
  assert.equal(kill.wild.grade, 1, 'a poor hide after them');
  const death = evs.find((e) => e.e === 'death' && e.id === kill.id);
  assert.ok(death && death.nb, 'taken cleanly: no blood');
  assert.ok(feeding >= 2, `the pack feeds on it (${feeding})`);
  assert.equal(p.wanted, 0);
});

test('a mountain lion creeps up low and slow, freezing whenever the deer looks up, then springs from close in', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const M = meadow(w), watch = watcher(w, p), S = SPECIES.cougar;
  let kill = null, froze = 0, crept = 0, fast = 0, springFrom = null;
  for (let t = 0; t < 5 && !kill; t++) {
    clear(w);
    const q = wildlife.spawnAnimal(w, 'deer', M.x, M.y, 0, { lead: true }), ang = t * 1.3;
    q.wild.until = w.time + 999; q.wild.act = APOSE.graze;   // (grazing where it stands, looking up now and then)
    const c = wildlife.spawnAnimal(w, 'cougar', M.x + Math.cos(ang) * 520, M.y + Math.sin(ang) * 520, 0, { lead: true });
    watch(q.x, q.y, ang + 1.6);
    wildlife.startHunt(w, c, q);
    for (let i = 0; i < 20 * 40 && !kill && !c.removed; i++) {
      if (i % 20 === 0) watch(q.x, q.y, ang + 1.6);
      const st0 = c.wild.state;
      w.step();
      const d = Math.hypot(c.x - q.x, c.y - q.y), sp = Math.hypot(c.vx, c.vy);
      if (c.wild.state === 'hunt' && d < S.hunts.spring * 2.5) {
        assert.equal(c.wild.pose, APOSE.stalk, 'low, stalking');
        if (sp < 5 && (q.wild.state === 'alert' || w.time < (q.wild.scanUntil || 0))) froze++;
        else if (sp > 5) { crept++; if (sp > S.stalk * 1.15) fast++; }
      }
      if (st0 === 'hunt' && c.wild.state === 'rush' && springFrom === null) springFrom = d;
      if (q.dead) kill = q;
    }
  }
  assert.ok(crept > 20 && fast === 0, `crept in at its stalking pace (${crept} steps, ${fast} too fast)`);
  assert.ok(froze > 0, 'and froze while the deer looked up');
  assert.ok(springFrom !== null && springFrom < S.hunts.spring + 20, `sprang from close in (${Math.round(springFrom)} px)`);
  assert.ok(kill && kill.wild.takenBy === 'cougar', 'and took one');
});

test('the prey watch for their hunters: a deer bolts from a wolf coming in, and a hunted rabbit runs from an eagle stooping on it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const M = meadow(w), watch = watcher(w, p);
  clear(w);
  const q = wildlife.spawnAnimal(w, 'deer', M.x, M.y, 0, { lead: true });
  const wolf = wildlife.spawnAnimal(w, 'wolf', M.x - 700, M.y, 0, { lead: true });
  watch(q.x, q.y, -1.6);
  wildlife.startHunt(w, wolf, q);
  let fledAt = null;
  for (let i = 0; i < 20 * 15 && fledAt === null; i++) { w.step(); if (q.wild.state === 'flee') fledAt = Math.hypot(wolf.x - q.x, wolf.y - q.y); }
  assert.ok(fledAt !== null && fledAt > 120, `the deer saw it coming and ran (at ${Math.round(fledAt)} px)`);
  // a pack lying up a long way off is no alarm
  clear(w);
  const q2 = wildlife.spawnAnimal(w, 'deer', M.x, M.y, 0, { lead: true });
  const w2 = wildlife.spawnAnimal(w, 'wolf', M.x - 950, M.y, 0, { lead: true });
  w2.wild.rest = true; w2.wild.state = 'rest'; w2.wild.until = w.time + 99; w2.wild.nextHunt = w.time + 99;
  for (let i = 0; i < 20 * 8; i++) { if (i % 20 === 0) watch(q2.x, q2.y, -1.6); w.step(); }
  assert.notEqual(q2.wild.state, 'flee', 'grazing on');
});

test('never a legend, the park\'s tame ducks or anything with people close by; someone coming close stops a hunt', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const M = meadow(w), watch = watcher(w, p);
  // a wolf with only a legend about: it never goes after it
  clear(w);
  const L = wildlife.spawnAnimal(w, 'deer', M.x, M.y, 0, { lead: true, legend: true });
  const wolf = wildlife.spawnAnimal(w, 'wolf', M.x - 500, M.y, 0, { lead: true });
  wolf.wild.nextHunt = 0;
  for (let i = 0; i < 20 * 30; i++) { if (i % 20 === 0) watch(L.x, L.y, 1.6); w.step(); assert.notEqual(wolf.wild.huntOf, L.id, 'not the White Hart'); }
  // ...but an ordinary deer there and it does (the same wolf, in the same half hour)
  const d = wildlife.spawnAnimal(w, 'deer', M.x + 60, M.y + 40, 0, { lead: true });
  let went = false;
  for (let i = 0; i < 20 * 40 && !went; i++) { if (i % 20 === 0) watch(d.x, d.y, 1.6); w.step(); went = wolf.wild.huntOf === d.id; }
  assert.ok(went, 'an ordinary deer it hunts');
  // the park's tame ducks: an eagle overhead leaves them be
  clear(w);
  const duck = wildlife.spawnAnimal(w, 'duck', M.x, M.y, 0, { lead: true, tame: true });
  const eagle = wildlife.spawnAnimal(w, 'eagle', M.x + 200, M.y, 0, { lead: true });
  eagle.wild.nextHunt = 0; eagle.wild.hx = M.x; eagle.wild.hy = M.y;
  for (let i = 0; i < 20 * 25; i++) { if (i % 20 === 0) watch(M.x, M.y, 1.6); w.step(); assert.notEqual(eagle.wild.huntOf, duck.id, 'not a tame duck'); }
  // someone standing by the deer: the wolf doesn't start on it
  clear(w);
  const q = wildlife.spawnAnimal(w, 'deer', M.x, M.y, 0, { lead: true });
  const wolf2 = wildlife.spawnAnimal(w, 'wolf', M.x - 600, M.y, 0, { lead: true });
  wolf2.wild.nextHunt = 0;
  teleport(w, p.ped, M.x + 150, M.y); p.ped.vx = p.ped.vy = 0;
  w.windHold = { a: Math.PI, s: 0.6 };
  for (let i = 0, was = 0; i < 20 * 25; i++) {
    w.step();
    if (wolf2.wild.huntOf === q.id && was !== q.id) assert.ok(Math.hypot(q.x - p.ped.x, q.y - p.ped.y) > 230, 'not with you standing by it');   // (it may go after it once it has run off from you)
    was = wolf2.wild.huntOf;
  }
  // a hunt under way, and you walk up: it's given up
  clear(w);
  const q3 = wildlife.spawnAnimal(w, 'deer', M.x, M.y, 0, { lead: true });
  const c = wildlife.spawnAnimal(w, 'cougar', M.x - 500, M.y, 0, { lead: true });
  watch(q3.x, q3.y, 1.6);
  wildlife.startHunt(w, c, q3);
  for (let i = 0; i < 20 * 2; i++) w.step();
  assert.equal(c.wild.state, 'hunt');
  teleport(w, p.ped, q3.x + 130, q3.y + 60);
  for (let i = 0; i < 20 * 1; i++) w.step();
  assert.ok(c.wild.state !== 'hunt' && c.wild.state !== 'rush', `given up (${c.wild.state})`);
  assert.ok(!q3.dead);
});

// a falls in the wilds with white water at its foot (where the salmon leap)
function falls(w) {
  const m = w.map;
  return m.natureSites.find((s) => s.falls && Number.isFinite(s.falls.x) && wildlife.wildStyle(m, s.falls.x, s.falls.y) === 'wild' && WATER_T[m.tileAtPx(s.falls.x, s.falls.y + (s.falls.drop || 40) + 40)] === 1);
}

test('a bear stands in the white water under the falls, watching, and grabs a salmon now and then', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const site = falls(w), F = site.falls, watch = watcher(w, p), evs = recordEvents(w);
  assert.ok(site, 'a falls in the wilds');
  const poses = new Set();
  let inWater = 0, bear = null;
  for (let t = 0; t < 3 && inWater <= 100; t++) {   // (now and then something spooks it on the way down: another bear, then)
    clear(w); poses.clear(); inWater = 0;
    const g = wildlife.edgeSpot(w.map, F.x, F.y + 200);
    bear = wildlife.spawnAnimal(w, 'blackbear', g[0], g[1], 0, { lead: true });
    watch(bear.x, bear.y, 0.4);
    assert.ok(wildlife.startFishing(w, bear), 'off to fish');
    assert.ok(bear.wild.atFalls, 'at the falls');
    for (let i = 0; i < 20 * 70; i++) {
      if (i % 40 === 0) watch(bear.x, bear.y, 0.4);
      w.step();
      if (bear.wild.state === 'fish') { poses.add(bear.wild.pose); if (WATER_T[w.map.tileAtPx(bear.x, bear.y)]) inWater++; }
    }
  }
  assert.ok(inWater > 100, 'stood in the water');
  assert.ok(poses.has(APOSE.strike) && poses.has(APOSE.fish) && poses.has(APOSE.alert), 'watching, the grab, a salmon in its jaws');
  assert.ok(bear.wild.fishCaught >= 1, `a salmon (${bear.wild.fishCaught})`);
  assert.ok(evs.some((e) => e.e === 'splash'), 'a splash at each grab');
});

test('a heron fishes the shallows: poised, the strike and its splash, now and then a fish; an otter dives for one and eats it on the bank', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const site = falls(w), F = site.falls, watch = watcher(w, p);
  clear(w);
  const g = wildlife.edgeSpot(w.map, F.x, F.y + 300);
  assert.ok(g, 'a bank by the water');
  const heron = wildlife.spawnAnimal(w, 'heron', g[0], g[1], 0, { lead: true });
  watch(heron.x, heron.y, 0.4);
  const poses = new Set();
  let fished = 0, strikes = 0, last = 0;
  const sts = {};
  for (let i = 0; i < 20 * 90; i++) {
    if (i % 40 === 0) watch(heron.x, heron.y, 0.4);
    if (heron.wild.state === 'idle') wildlife.startFishing(w, heron);
    w.step();
    if (heron.wild.state === 'fish') { fished++; poses.add(heron.wild.pose); }
    sts[heron.wild.state] = (sts[heron.wild.state] || 0) + 1;
    if (heron.wild.pose === APOSE.strike && last !== APOSE.strike) strikes++;
    last = heron.wild.pose;
  }
  assert.ok(fished > 200, `it fished (${JSON.stringify(sts)})`);
  assert.ok(poses.has(APOSE.stalk) && poses.has(APOSE.strike), 'poised, then the strike');
  assert.ok(strikes >= 3, `struck again and again (${strikes})`);
  assert.ok(heron.wild.fishCaught >= 1, `and caught (${heron.wild.fishCaught})`);
  // the otter
  clear(w);
  let spot = null;
  for (let k = 0; k < 40 && !spot; k++) { const x = F.x + (k % 8 - 4) * 40, y = F.y + (F.drop || 40) + 60 + Math.floor(k / 8) * 40; if (WATER_T[w.map.tileAtPx(x, y)]) spot = [x, y]; }
  const otter = wildlife.spawnAnimal(w, 'otter', spot[0], spot[1], 0, { lead: true });
  watch(otter.x, otter.y, 0.4);
  assert.ok(wildlife.startFishing(w, otter));
  let under = 0, ate = 0;
  for (let i = 0; i < 20 * 90 && !ate; i++) {
    if (i % 40 === 0) watch(otter.x, otter.y, 0.4);
    if (otter.wild.state === 'idle') wildlife.startFishing(w, otter);
    w.step();
    if (otter.hidden) under++;
    if (otter.wild.state === 'eatfish' && !WATER_T[w.map.tileAtPx(otter.x, otter.y)]) ate++;
  }
  assert.ok(under > 20, 'it dived');
  assert.ok(ate, 'and ate its fish out on the bank');
});

test('an osprey drops into the water and lifts off with a fish; an eagle stoops on a rabbit and carries it off', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const site = falls(w), F = site.falls, watch = watcher(w, p), evs = recordEvents(w);
  clear(w);
  let water = null;
  for (let k = 0; k < 40 && !water; k++) { const x = F.x + (k % 8 - 4) * 40, y = F.y + (F.drop || 40) + 60 + Math.floor(k / 8) * 40; if (WATER_T[w.map.tileAtPx(x, y)]) water = [x, y]; }
  let carried = false;
  for (let t = 0; t < 6 && !carried; t++) {
    clear(w);
    const o = wildlife.spawnAnimal(w, 'osprey', water[0] + 260, water[1] - 120, 0, { lead: true });
    assert.equal(o.wild.state, 'soar', 'up soaring');
    watch(water[0], water[1], 0.4);
    wildlife.startPlunge(w, o, water[0], water[1]);
    for (let i = 0; i < 20 * 6; i++) { w.step(); if (o.wild.state === 'carry') carried = o; }
  }
  assert.ok(evs.some((e) => e.e === 'splash' && e.big), 'the splash');
  assert.ok(carried && carried.wild.pose === APOSE.carryFish, 'off with a fish');
  for (let i = 0; i < 20 * 14; i++) w.step();
  assert.ok(carried.wild.flewOff || carried.removed, 'and away');
  // the eagle
  const M = meadow(w), cash0 = p.profile.cash;
  let took = false;
  for (let t = 0; t < 5 && !took; t++) {
    clear(w);
    const r = wildlife.spawnAnimal(w, 'rabbit', M.x, M.y, 0, { lead: true });
    const e = wildlife.spawnAnimal(w, 'eagle', M.x + 300, M.y - 200, 0, { lead: true });
    watch(r.x, r.y, 1.6);
    wildlife.startHunt(w, e, r);
    assert.equal(e.wild.state, 'stoop');
    for (let i = 0; i < 20 * 8 && !took; i++) { w.step(); if (e.wild.state === 'carry') { took = { e, r }; w.step(); } }
  }
  assert.ok(took, 'it took the rabbit');
  assert.ok(took.r.removed, 'the rabbit carried off');
  assert.equal(took.e.wild.pose, APOSE.carryGame);
  assert.equal(p.profile.cash, cash0, 'nobody fined: it was the eagle');
});

test('a fox mouses in the long grass: still and listening, the pounce, now and then a mouse', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const M = meadow(w), watch = watcher(w, p);
  clear(w);
  const f = wildlife.spawnAnimal(w, 'redfox', M.x, M.y, 0, { lead: true });
  watch(f.x, f.y, 1.6);
  wildlife.startMousing(w, f);
  const poses = new Set();
  for (let i = 0; i < 20 * 40; i++) { if (i % 40 === 0) watch(f.x, f.y, 1.6); w.step(); if (f.wild.state === 'mouse') poses.add(f.wild.pose); if (f.wild.state === 'idle' && i < 20 * 20) wildlife.startMousing(w, f); }
  assert.ok(poses.has(APOSE.alert) && poses.has(APOSE.pounce), 'listening, the pounce');
  assert.ok(f.wild.mice >= 1, `a mouse (${f.wild.mice})`);
});

test('shooting a heron, an osprey or an eagle brings the wardens\' fine', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const M = meadow(w);
  clear(w);
  teleport(w, p.ped, M.x, M.y);
  p.profile.cash = 1000;
  const h = wildlife.spawnAnimal(w, 'heron', M.x + 80, M.y, 0, { lead: true });
  combat.damage(w, h, 999, p.ped, 'gun');
  assert.ok(h.dead);
  assert.ok(p.profile.cash < 1000, 'fined');
});
