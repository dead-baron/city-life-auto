// Lost pets, the owner's batch 4 notes (server/systems/pets.js): a pet slips out of a real home; posters go up on the
// poles and walls by the home and along its way (never in the road); read one and its last-seen area is marked - the
// pet is somewhere in it, off the road, sniffing about; take its collar and the way home is marked; hand it back at the
// door for a reward that grows with the walk; or let it go, and it sniffs about where you left it, the posters still up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { PET_REWARD, PET_AREA_R, PET_SAMARITAN } from '../shared/rules.js';
import * as pets from '../server/systems/pets.js';
import * as events from '../server/systems/events.js';
import { mulberry32 } from '../shared/rng.js';

const POLES = new Set(['lamp', 'upole', 'sigpole', 'post', 'mapboard', 'busstop', 'fingerpost', 'roadsign']);
function lostNear(w, p) {
  for (const h of w.map.homes) {
    if (!h || h.kind !== 'house') continue;
    teleport(w, p.ped, h.x, h.y);
    const pet = pets.spawnLost(w, p);
    if (pet) return pet;
  }
  return null;
}
function setup(seed = 11) {
  pets.setRng(mulberry32(seed));
  const w = makeWorld();
  w.nextPetAt = 1e9;
  const a = joinPlayer(w, { cash: 0 });
  const pet = lostNear(w, a.p);
  assert.ok(pet, 'a pet went missing');
  return { w, a, pet, pp: pet.pet };
}
const list = (w, p) => events.forPlayer(w, p) || [];
const offRoad = (m, x, y) => { const t = m.tileAtPx(x, y); return t !== T.ROAD || m.roadRank[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))] === 1; };
const inArea = (pp, e) => Math.hypot(e.x - pp.area.x, e.y - pp.area.y) <= pp.area.r;
// walk somewhere a step at a time, the pet at your heel
function walkTo(w, ped, x, y, stop = 50) {
  for (let k = 0; k < 400; k++) {
    const dx = x - ped.x, dy = y - ped.y, d = Math.hypot(dx, dy);
    if (d < stop) return;
    teleport(w, ped, ped.x + dx / d * Math.min(40, d - stop + 1), ped.y + dy / d * Math.min(40, d - stop + 1));
    run(w, 0.4);
  }
}

test('the posters go up by the owner\'s home and along the way - on poles, noticeboards or walls, never in the road', () => {
  for (const seed of [11, 12, 13]) {
    const { w, pp } = setup(seed);
    const m = w.map, H = pp.house;
    assert.ok(pp.posters.length >= 2, `${pp.posters.length} posters`);
    assert.ok(Math.hypot(pp.posters[0].x - H.x, pp.posters[0].y - H.y) < 260, 'one by the home');
    const L = Math.hypot(pp.area.x - H.x, pp.area.y - H.y);
    for (const q of pp.posters) {
      assert.notEqual(m.tileAtPx(q.x, q.y), T.ROAD, 'not in the road');
      const pole = m.props.some((r) => POLES.has(r.t) && Math.abs(r.x - q.x) < 1 && Math.abs(r.y - q.y) < 1);
      const wall = m.tileAtPx(q.x, q.y) === T.SIDEWALK && m.tileAtPx(q.x, q.y - TILE) === T.BUILDING;
      assert.ok(pole || wall, `on a pole or a wall (${q.on})`);
      // along the way: no further off the line from the home to the area than a street or two
      const t = Math.max(0, Math.min(1, ((q.x - H.x) * (pp.area.x - H.x) + (q.y - H.y) * (pp.area.y - H.y)) / (L * L)));
      const off = Math.hypot(q.x - (H.x + (pp.area.x - H.x) * t), q.y - (H.y + (pp.area.y - H.y) * t));
      assert.ok(off < 260, `along the way (${off | 0} px off it)`);
    }
    for (let i = 0; i < pp.posters.length; i++) for (let j = i + 1; j < pp.posters.length; j++) assert.ok(Math.hypot(pp.posters[i].x - pp.posters[j].x, pp.posters[i].y - pp.posters[j].y) >= 119, 'spread out');
  }
});

test('reading a poster: its name, what it looks like, where it was last seen (marked as an area) and the owner\'s address', () => {
  const { w, a, pet, pp } = setup();
  const q = pp.posters[pp.posters.length - 1];
  teleport(w, a.p.ped, q.x + 4000, q.y);
  run(w, 0.2);
  assert.ok(!list(w, a.p).some((e) => e.k === 'poster'), 'no posters on the page from across town');
  assert.ok(!list(w, a.p).some((e) => e.k === 'petarea'), 'nor the area, before you have read one');
  teleport(w, a.p.ped, q.x + 20, q.y + 10);
  run(w, 0.2);
  const seen = list(w, a.p).filter((e) => e.k === 'poster');
  assert.ok(seen.some((e) => e.x === q.x && e.y === q.y && e.w === pp.kind && e.a === pp.art), 'the poster is on the page, to draw');
  const act = players.findInteraction(w, a.p);
  assert.ok(act && /Read the "Lost/.test(act.label), act && act.label);
  a.p.toasts.length = 0;
  act.run();
  const msg = a.p.toasts.map((t) => t.text).join(' ');
  assert.ok(msg.includes(pp.name) && msg.includes(pp.look) && msg.includes(pp.house.name) && /Last seen in/.test(msg), msg);
  const area = list(w, a.p).find((e) => e.k === 'petarea');
  assert.ok(area && area.r === PET_AREA_R && area.x === pp.area.x && area.y === pp.area.y, 'the area marked');
  teleport(w, a.p.ped, q.x + 5000, q.y);
  run(w, 0.2);
  assert.ok(list(w, a.p).some((e) => e.k === 'petarea'), 'marked wherever you are');
  // somebody who hasn't read one doesn't get the area
  const b = joinPlayer(w);
  teleport(w, b.p.ped, q.x, q.y);
  run(w, 0.2);
  assert.ok(!list(w, b.p).some((e) => e.k === 'petarea'));
  void pet;
});

test('the pet is somewhere in its last-seen area, off the road, and stays there sniffing about', () => {
  for (const seed of [11, 14]) {
    const { w, a, pet, pp } = setup(seed);
    teleport(w, a.p.ped, pp.area.x + 5000, pp.area.y);
    assert.ok(inArea(pp, pet), 'in the area');
    assert.ok(pets.petGround(w.map, pet.x, pet.y) && offRoad(w.map, pet.x, pet.y), 'in a yard, a park, an alley - not the road');
    const x0 = pet.x, y0 = pet.y;
    let moved = 0;
    for (let k = 0; k < 60; k++) {
      run(w, 1);
      assert.ok(inArea(pp, pet), 'still in the area');
      assert.ok(offRoad(w.map, pet.x, pet.y), 'never onto the road');
      moved = Math.max(moved, Math.hypot(pet.x - x0, pet.y - y0));
    }
    assert.ok(moved > 5, 'it sniffs about');
  }
});

test('found: it follows you, the way home is marked, and handed back at the door it pays more the further it was', () => {
  const { w, a, pet, pp } = setup();
  const owner = w.get(pp.owner);
  assert.ok(Math.hypot(owner.x - pp.house.x, owner.y - pp.house.y) < 10, 'the owner waits at their door');
  pp.read.add(a.p.pid);
  teleport(w, a.p.ped, pet.x + 20, pet.y);
  run(w, 0.1);
  const act = players.findInteraction(w, a.p);
  assert.ok(act && /collar/.test(act.label) && act.label.includes(pp.house.name), act && act.label);
  act.run();
  assert.equal(pp.follow, a.p.ped.id);
  const mine = list(w, a.p);
  const way = mine.find((e) => e.k === 'petret');
  assert.ok(way && Math.hypot(way.x - pp.house.x, way.y - pp.house.y) < 20 && way.e === owner.id, 'the way to its door');
  assert.ok(!mine.some((e) => e.k === 'petarea'), 'no need for the area now');
  walkTo(w, a.p.ped, owner.x, owner.y);
  assert.equal(pp.follow, a.p.ped.id, 'still at heel');
  assert.ok(Math.hypot(pet.x - a.p.ped.x, pet.y - a.p.ped.y) < 200, 'it kept up');
  const give = players.findInteraction(w, a.p);
  assert.ok(give && /Give .* back/.test(give.label), give && give.label);
  const pay = pets.rewardFor(pet), d = Math.hypot(pp.foundX - pp.house.x, pp.foundY - pp.house.y);
  assert.equal(pay, Math.min(PET_REWARD.max, Math.round(PET_REWARD.base + PET_REWARD.perM * d / TILE)));
  assert.ok(pay > 220 + 150, `much better than it was ($${pay})`);
  give.run();
  assert.equal(a.prof.cash, pay);
  assert.equal(a.prof.samaritan, PET_SAMARITAN);
  assert.ok(!pets.lostPets(w).includes(pet), 'home');
  assert.ok(!list(w, a.p).some((e) => e.k === 'poster' || e.k === 'petarea' || e.k === 'petret'), 'the posters come down');
  // a nearer find pays less
  const near = { pet: { ...pp, foundX: pp.house.x + 900, foundY: pp.house.y } }, far = { pet: { ...pp, foundX: pp.house.x + 2000, foundY: pp.house.y } };
  assert.ok(pets.rewardFor(near) < pets.rewardFor(far));
});

test('let it go: it stops following and sniffs about where you left it - the posters stay up; you can take it again', () => {
  const { w, a, pet, pp } = setup();
  pp.read.add(a.p.pid);
  teleport(w, a.p.ped, pet.x + 20, pet.y);
  run(w, 0.1);
  players.findInteraction(w, a.p).run();
  // walk a way with it, somewhere nothing else is to do
  walkTo(w, a.p.ped, (pet.x + pp.house.x) / 2, (pet.y + pp.house.y) / 2);
  assert.equal(pp.follow, a.p.ped.id);
  const go = pets.letGo(w, a.p);
  assert.ok(go && /Let .* go/.test(go.label), go && go.label);
  const act = players.findInteraction(w, a.p);
  assert.ok(act, 'there is something to do');
  go.run();
  assert.equal(pp.follow, 0, 'off your collar');
  const at = { x: pet.x, y: pet.y };
  assert.ok(inArea(pp, at), 'the area it was seen in is where you left it');
  assert.ok(pp.posters.length && pets.lostPets(w).includes(pet), 'still lost, the posters up');
  const area = list(w, a.p).find((e) => e.k === 'petarea');
  assert.ok(area && area.x === pp.area.x, 'the area marked for those who read about it');
  teleport(w, a.p.ped, pet.x + 600, pet.y);
  run(w, 20);
  assert.equal(pp.follow, 0, 'it doesn\'t follow you');
  assert.ok(Math.hypot(pet.x - at.x, pet.y - at.y) < PET_AREA_R * 1.3, 'sniffing about round there');
  teleport(w, a.p.ped, pet.x + 20, pet.y);
  run(w, 0.1);
  const again = players.findInteraction(w, a.p);
  assert.ok(again && /collar/.test(again.label), 'and you can take it again');
});

test('lose it (drive off): it slips away and stays round there', () => {
  const { w, a, pet, pp } = setup();
  teleport(w, a.p.ped, pet.x + 20, pet.y);
  run(w, 0.1);
  players.findInteraction(w, a.p).run();
  teleport(w, a.p.ped, pet.x + 3000, pet.y);
  run(w, 0.5);
  assert.equal(pp.follow, 0, 'slipped away');
  assert.ok(inArea(pp, pet), 'its area round where it is');
});

test('only a few at once; nobody brings it home - it finds its own way back and the posters come down', () => {
  const { w, a, pet, pp } = setup();
  const more = [];
  for (const h of w.map.homes) { if (more.length >= 4) break; if (h && h.kind === 'house') { teleport(w, a.p.ped, h.x, h.y); const q = pets.spawnLost(w, a.p); if (q) more.push(q); } }
  w.nextPetAt = 0;
  const before = pets.lostPets(w).length;
  run(w, 3);
  assert.ok(pets.lostPets(w).length <= Math.max(before, 3), 'no more than a few at once by itself');
  teleport(w, a.p.ped, pet.x + 8000, pet.y + 8000);
  pp.born = w.time - 1e5;
  run(w, 0.2);
  assert.ok(!pets.lostPets(w).includes(pet) && pet.removed, 'gone home by itself');
});
