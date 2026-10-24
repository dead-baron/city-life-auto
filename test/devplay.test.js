// The debug menu's buttons for the 2026-10-18 batch (server/devplay.js, client/devcats.js; the owner: "make sure all these
// new features are accessible in the debug menu for easy testing"): skateboarding, the shopping carts, fishing, World v3's
// places by name. Every button's command does what it says on the test map (or says why it can't).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run, straightRoad, playLine } from './helpers.js';
import { K, TILE } from '../shared/constants.js';
import * as FS from '../shared/fish.js';
import { DEV_SECTIONS } from '../client/devcats.js';
import { command } from '../server/dev.js';
import { CART_DELAY_S } from '../server/devplay.js';
import * as fishing from '../server/systems/fishing.js';
import { store } from '../server/store.js';

const W = makeWorld();
const ROAD = straightRoad(W.map, 900);
const fresh = () => { const j = joinPlayer(W); teleport(W, j.p.ped, ROAD.x + 300, ROAD.y); j.p.ped.a = 0; return j; };
const last = (p) => (p.toasts.length ? p.toasts[p.toasts.length - 1].text : '');   // (what it just said: before the next step sends it)

test('the debug menu lists the new sections and every command they send is one the server knows', () => {
  const ids = DEV_SECTIONS.map((s) => s.id);
  for (const id of ['new', 'skate', 'cart', 'fish', 'fishes']) assert.ok(ids.includes(id), `a ${id} section`);
  const fishes = DEV_SECTIONS.find((s) => s.id === 'fishes').items;
  assert.equal(fishes.length, FS.FISH.length, 'a button for every kind of fish');
  // every item's command reaches a handler (no "what?" back)
  for (const id of ['new', 'skate', 'cart', 'fish']) for (const [label, c, extra] of DEV_SECTIONS.find((s) => s.id === id).items) {
    assert.ok(typeof c === 'string' && c.length, `${label}: a command`);
    if (c === 'skate' || c === 'cart' || c === 'fish') assert.ok(extra && extra.k, `${label}: says which`);
  }
});

test('skateboarding from the debug menu: a board and on it, the special, a rail and a ramp lined up', () => {
  const { p } = fresh();
  command(W, p, 'skate', { k: 'on' });
  assert.ok(p.ped.board && p.profile.inventory.skateboard > 0, 'on a board');
  command(W, p, 'skate', { k: 'special' });
  assert.ok(p.sk && p.sk.spUntil > W.time, 'SPECIAL on');
  const hasRail = W.map.props.some((q) => q && ['ledge', 'flatbar', 'planter_fl', 'planter_g', 'bench_a', 'bench_b', 'bench_m', 'pbench'].includes(q.t));
  command(W, p, 'skate', { k: 'rail' });
  if (hasRail) assert.ok(p.ped.board, 'lined up on a rail, still on the board');
  command(W, p, 'skate', { k: 'spot' });
  if ((W.map.skateSpots || []).length) assert.ok(p.ped.board, 'at the skate spot on the board');
  else assert.match(last(p), /skate spot/, 'no skate spot on this map: it says so');
});

test('shopping carts from the debug menu: you and a friend, two loaded carts head on, tipped over, crushed', () => {
  const { p } = fresh();
  command(W, p, 'cart', { k: 'pair' });
  const v = W.get(p.ped.vehId);
  assert.ok(v && v.def.cart && v.seats[0] === p.ped.id && v.seats[1], 'at the handle, someone in the basket');
  const friend = W.get(v.seats[1]);
  assert.ok(friend && friend.npc, 'a friend in the basket');
  p.ped.vehId = 0; p.ped.seat = -1; v.seats[0] = 0; teleport(W, p.ped, ROAD.x + 300, ROAD.y);
  W.remove(friend); W.remove(v);
  // head on: they meet within a second or two, and everyone flies
  command(W, p, 'cart', { k: 'headon' });
  const carts = W.query(p.ped.x + 170, p.ped.y, 260, K.VEH).filter((e) => e.def && e.def.cart);
  assert.equal(carts.length, 2, 'two carts');
  const riders = carts.flatMap((c) => c.seats.filter(Boolean));
  assert.equal(riders.length, 4, 'loaded');
  run(W, CART_DELAY_S - 0.5);
  for (const c of carts) assert.ok(Math.hypot(c.vx, c.vy) < 1 && c.seats.filter(Boolean).length === 2, 'held still a few seconds: time to close the menu and watch');
  run(W, 2.5);
  for (const id of riders) { const q = W.get(id); assert.ok(!q || !q.vehId, 'everyone thrown'); }
  for (const c of carts) W.remove(c);
  command(W, p, 'cart', { k: 'tipped' });
  assert.ok(W.query(p.ped.x, p.ped.y, 120, K.VEH).some((e) => e.def && e.def.cart && e.tipped && e.flat), 'a tipped cart');
  command(W, p, 'cart', { k: 'crushed' });
  assert.ok(W.query(p.ped.x, p.ped.y, 120, K.VEH).some((e) => e.def && e.def.cart && e.wreckAt), 'a crushed cart');
});

test('fishing from the debug menu: the kit, the waters, a boat at sea, the next bite rigged, an easy fight, the cooler, the log, the board', () => {
  const { p, prof } = fresh();
  command(W, p, 'fish', { k: 'kit' });
  assert.ok(prof.weapons.rod !== undefined && FS.ROD_IDS.every((id) => id === 'rod' || prof.inventory[id] > 0) && FS.BAIT_IDS.every((id) => prof.inventory[id] >= 20), 'every rod and bait');
  // the waters this map has: by each, facing it, a cast ready
  for (const w of ['river', 'lake', 'shore', 'pier']) {
    command(W, p, 'fish', { k: 'go', w });
    const spot = fishing.spotFor(W, p.ped);
    assert.ok(spot, `by ${w}: facing the water`);
    const at = fishing.habitatAt(W, spot.x, spot.y);
    assert.ok(at, `${w}: water there`);
  }
  // the next bite: at once, and the fish chosen; an easy fight
  command(W, p, 'fish', { k: 'go', w: 'river' });
  command(W, p, 'fish', { k: 'bite', f: 'now' });
  command(W, p, 'fish', { k: 'bite', f: 'salmon' });
  command(W, p, 'fish', { k: 'easy' });
  fishing.begin(W, p, fishing.spotFor(W, p.ped));
  const L = playLine(W, p, { hold: 6 });
  assert.equal(L.fish, 'salmon', 'the fish chosen');
  assert.ok(L.P.bite <= 1 && L.P.diff === 5 && !L.P.snap, 'at once, an easy fight, a line that holds');
  assert.equal(L.F.out, 1, 'landed');
  command(W, p, 'fish', { k: 'bite', f: 'legend' });
  assert.equal(p.devFish.next, 'legend');
  // the cooler, the log, the board
  command(W, p, 'fish', { k: 'cooler' });
  assert.ok(prof.creel.length >= 10, 'ten fish in the cooler');
  assert.ok(store.kept.fishRecords && Object.keys(store.kept.fishRecords).length, 'a record on the board');
  command(W, p, 'fish', { k: 'clear' });
  assert.ok(!prof.creel.length && !Object.keys(prof.fishLog).length, 'log and cooler emptied');
  command(W, p, 'fish', { k: 'records' });
  assert.equal(Object.keys(store.kept.fishRecords).length, 0, 'the board wiped');
  // out at sea in a boat, still: fishing over the side
  command(W, p, 'fish', { k: 'boat' });
  const b = W.get(p.ped.vehId);
  assert.ok(b && b.def.kind === 'boat' && fishing.spotFor(W, p.ped), 'in a boat, a cast over the side');
  // the cave's still pool
  p.ped.vehId = 0; p.ped.seat = -1; b.seats[0] = 0; W.remove(b);
  command(W, p, 'fish', { k: 'cave' });
  if (p.ped.ug) assert.ok(fishing.spotFor(W, p.ped), 'at the cave pool, facing the water');
});

test("places by name (World v3's handcrafted districts, the landmarks): there, or it says it isn't on this map", () => {
  const { p } = fresh();
  const lm = (W.map.landmarks || []).find((l) => l.name);
  if (lm) {
    command(W, p, 'place', { n: lm.name });
    assert.ok(Math.hypot(p.ped.x - (lm.x + (lm.w || 0) / 2), p.ped.y - (lm.y + (lm.h || 0) / 2)) < 160 * TILE, `at ${lm.name}`);
  }
  command(W, p, 'place', { n: 'Nowhere Such' });
  assert.match(last(p), /No "Nowhere Such"/);
});

// (the owner, 10-23: "Debug spawning airplanes you can fly in lets you spawn infinite airplanes ... let's not let players
// spawn infinite debug items like planes or shopping cart crashes"): one of a kind at a time - a new one takes the last away
test('the debug menu\'s vehicles and crashes, one at a time: a new plane takes your last plane away, a new crash the last one\'s carts', () => {
  const { p } = fresh();
  const planes = () => [...W.entities.values()].filter((e) => e.kind === K.VEH && e.model === 'plane' && !e.removed && e.issuedTo === p.pid);
  command(W, p, 'car', { m: 'plane' });
  const first = planes();
  assert.equal(first.length, 1, 'a plane');
  for (let k = 0; k < 4; k++) command(W, p, 'car', { m: 'plane' });
  assert.equal(planes().length, 1, 'still just the one');
  assert.ok(first[0].removed, 'the first taken away');
  command(W, p, 'car', { m: 'sedan' });
  assert.equal(planes().length, 1, 'a car of yours doesn\'t take your plane');
  // one you're aboard stays yours (nobody's put out of it)
  command(W, p, 'car', { m: 'speedboat', in: 1 });
  const boat = W.get(p.ped.vehId);
  command(W, p, 'car', { m: 'speedboat' });
  assert.ok(!boat.removed && p.ped.vehId === boat.id, 'the boat you\'re in stays');
  p.ped.vehId = 0; p.ped.seat = -1; boat.seats[0] = 0; teleport(W, p.ped, ROAD.x + 300, ROAD.y);
  // the cart crash: a second one takes the first one's carts and riders away
  const id0 = W.nextId;
  command(W, p, 'cart', { k: 'headon' });
  const a = [...W.entities.values()].filter((e) => e.kind === K.VEH && e.def.cart && e.id >= id0), ra = a.flatMap((c) => c.seats.filter(Boolean));
  assert.equal(a.length, 2);
  command(W, p, 'cart', { k: 'headon' });
  assert.ok(a.every((c) => c.removed) && ra.every((id) => !W.get(id)), 'the last crash\'s carts and riders gone');
  const carts = [...W.entities.values()].filter((e) => e.kind === K.VEH && e.def.cart && !e.removed && e.id >= id0);
  assert.equal(carts.length, 2, 'just the new pair');
});
