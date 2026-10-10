// The food places you walk into (IN8; shared/foodrooms.js): the coffee walk-ins fitted out as a diner, a fast-food place
// or a restaurant by their lot; the art in both renderers builds; people sit eating at the tables and the cook works the
// line (server/systems/activities.js 'diners'); and the faults the B takes left: a street lamp through the hospital's
// ambulance canopy, the HOSPITAL plaque on each section of a big hospital, the classic renderer's old lobby paintings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { foodLayout, foodSeats, foodStyle } from '../shared/foodrooms.js';
import { spotsOf, fill } from '../server/systems/activities.js';
import { _descriptor } from '../server/net.js';

const w = makeWorld();
const m = w.map;
const food = [];
for (const b of m.buildings) if (b && b.walkIn) for (const u of b.walkIn.units) if (u.kind === 'coffee') food.push({ b, u, L: foodLayout(b, u, TILE) });
const open = (x, y) => !PED_BLOCK[m.tileAtPx(x, y)];
const inUnit = (L, x, y) => x > L.X0 && x < L.X1 && y > L.Ya && y < L.Yb;

test('every food place is fitted out by its lot: the diner, the fast-food place, the restaurant', () => {
  assert.ok(food.length >= 6, `the coffee walk-ins (${food.length})`);
  const styles = new Set(food.filter((f) => f.L).map((f) => f.L.style));
  for (const s of ['diner', 'fastfood', 'restaurant']) assert.ok(styles.has(s), `a ${s} on the map`);
  assert.equal(foodStyle('diner'), 'diner'); assert.equal(foodStyle('greenbistro'), 'restaurant'); assert.equal(foodStyle('redawning'), 'restaurant'); assert.equal(foodStyle('shops1'), 'fastfood');
  for (const { b, L } of food) {
    if (!L) continue;
    const name = `${b.kind} #${b.id}`;
    const things = [...L.booths, ...L.tables, ...(L.queue ? [L.queue] : []), ...(L.drinks ? [L.drinks] : []), ...(L.jukebox ? [L.jukebox] : [])];
    if (L.host) assert.ok((L.host.x1 <= L.dx || L.host.x0 >= L.dx + L.dw) && L.host.y1 <= L.Yb, `${name}: the host stand beside the way in, not in it`);
    for (const q of things) {
      assert.ok(q.x0 >= L.X0 && q.x1 <= L.X1 && q.y0 >= L.Ya && q.y1 <= L.Yb, `${name}: in the room, in front of the counter`);
      assert.ok(!(q.y1 > L.Yb - 44 && q.x1 > L.dx - 8 && q.x0 < L.dx + L.dw + 8), `${name}: the way in from the door kept clear`);
      for (let y = q.y0 + 1; y < q.y1; y += 6) for (let x = q.x0 + 1; x < q.x1; x += 6) assert.equal(m.tileAtPx(x, y), T.FLOOR, `${name}: on the shop floor`);
    }
    for (const g of foodSeats(L)) for (const s of g) assert.ok(inUnit(L, s.x, s.y) && open(s.x, s.y), `${name}: a seat on the floor`);
    for (const s of L.stools) assert.ok(open(s.x, s.y) && s.y > L.cy + TILE, `${name}: the stools in front of the counter`);
    if (L.style === 'diner') assert.ok(L.booths.length >= 2 && L.stools.length >= 3, `${name}: booths and stools`);
    if (L.style === 'restaurant') assert.ok(L.tables.length >= 1 && L.tables.every((t) => t.cloth) && L.host, `${name}: tables with cloths, the host stand`);
    if (L.style === 'fastfood' && L.Yb - L.Ya > 100) assert.ok(L.queue && L.drinks && L.tables.length >= 1, `${name}: the queue lane, the drinks machine, tables`);
    if (L.cook) { assert.ok(L.cook.y < L.cy && L.cook.y > b.walkIn.y0 * TILE && open(L.cook.x, L.cook.y), `${name}: the cook behind the counter`); }
  }
});

test('people sit eating at the tables, the cook works the line; on the wire as sitting', () => {
  const S = spotsOf(m), di = S.list.filter((s) => s.k === 'diners');
  assert.equal(di.length, food.filter((f) => f.L && foodSeats(f.L).length).length, 'a spot in each food place with tables');
  w.acts = new Map(); w.actRest = new Map();
  for (const s of di) {
    const g = fill(w, s, { seen: true });
    assert.ok(g && g.ids.length >= 1, 'filled');
    const ps = g.ids.map((i) => w.get(i)).filter(Boolean), sat = ps.filter((e) => e.gt === 'sit');
    assert.ok(sat.length >= 1, 'someone sat eating');
    for (const e of sat) { assert.ok(inUnit(s.food, e.x, e.y), 'sat in the room'); assert.equal(_descriptor(e).gt, 'sit'); }
    if (s.food.cook) assert.ok(ps.some((e) => !e.gt && e.y < s.food.cy), 'the cook at the kitchen line');
  }
});

test('the art builds: every food place cut away (art v2); the hospital front - one plaque, the canopy clear of the lamps', async () => {
  const { staticItems, makeStatic } = await import('../client/art2/game/statics.js');
  const CH = 768;
  for (const { b } of food) {
    const bi = m.buildings.indexOf(b), cx = Math.floor((b.tx + b.tw / 2) * TILE / CH), cy = Math.floor((b.ty + b.th / 2) * TILE / CH);
    let cuts = 0;
    for (const it of staticItems(m, cx, cy, { cutaway: bi })) if (it.recipe && it.recipe.t === 'cut' && it.b === bi) { const G = makeStatic(it.recipe); assert.ok(G && G.w > 0); cuts++; if (it.recipe.units.some((u) => u.kind === 'coffee')) assert.ok(it.recipe.units.some((u) => u.food), 'the fit-out rides in the recipe'); }
    assert.ok(cuts >= 1, `${b.kind} #${b.id}: cut away`);
  }
  for (const b of m.buildings.filter((q) => q && q.walkIn && q.walkIn.units.some((u) => u.kind === 'hospital'))) {
    const bi = m.buildings.indexOf(b), cx0 = Math.floor(b.tx * TILE / CH), cx1 = Math.floor((b.tx + b.tw) * TILE / CH), cy = Math.floor((b.ty + b.th) * TILE / CH);
    const seen = new Map();
    for (let cx = cx0; cx <= cx1; cx++) for (const it of staticItems(m, cx, cy, {})) seen.set(it.key + '@' + it.x + ',' + it.y, it);
    const mine = [...seen.values()].filter((it) => it.b === bi && it.recipe && it.recipe.spec), plaques = mine.flatMap((it) => (it.recipe.spec.plaques || []).filter((p) => p.text === 'HOSPITAL'));
    assert.equal(plaques.length, 1, `hospital #${b.id}: one HOSPITAL plaque (${mine.length} sections)`);
    const can = [...seen.values()].find((it) => it.recipe && it.recipe.t === 'v' && /hcan:er/.test(it.key) && it.x > b.tx * TILE && it.x < (b.tx + b.tw) * TILE);
    if (!can) continue;
    for (const p of m.props) if (p && p.t === 'lamp') assert.ok(!(Math.abs(p.x - can.x) < 64 && Math.abs(p.y - can.y) < 34), `hospital #${b.id}: no lamp stands through the canopy`);
  }
});

test('the classic renderer draws the fit-outs: the food places, and the hospital and police lobbies in place of the old paintings', async () => {
  const { roomArt } = await import('../client/render/roomart.js');
  let n = 0;
  const g = { set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; }, fillRect() { n++; }, beginPath() {}, arc() {}, fill() { n++; } };
  for (const b of m.buildings) if (b && b.walkIn) for (const u of b.walkIn.units) {
    const want = (u.kind === 'coffee' && foodLayout(b, u, TILE)) || u.kind === 'hospital' || u.kind === 'police';
    const n0 = n, drew = roomArt(g, m, b, u, b.tx * TILE, b.ty * TILE, TILE);
    assert.equal(!!drew, !!want, `${u.kind} in ${b.kind} #${b.id}: drawn here (or left to the plain fit-out)`);
    if (drew) assert.ok(n - n0 > 30, `${u.kind} #${b.id}: furnished`);
  }
});
