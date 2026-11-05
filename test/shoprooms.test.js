// The shops you walk into fitted out by their trade (shared/shoprooms.js; the owner, batch 4: "keep developing the
// interiors of buildings so they're more unique and interesting on the inside"): every listed kind of place has a plan
// of its own; a building's fit-out is the same every time and buildings of a kind differ; the door, the counter's spot
// and the way between stay clear in every size of room; the art draws every plan (client/art2/shopart.js) and rides in
// the cut-away's recipe; customers stand where the plan says (server/systems/activities.js 'shoppers').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { shopRoom, planOf, barPlan, coverage, PLANS, BAR_PLANS, SHOP_PLAN, TRADE_PLAN } from '../shared/shoprooms.js';
import { spotsOf } from '../server/systems/activities.js';

const BODY = 10;
// a made-up walk-in: w tiles wide, d rows deep (the counter where shared/map.js puts it), the door at the given column
function room(kind, w, d, doorAt = 0.5, tx = 40, ty = 30, trade = null, name = '') {
  const x0 = tx + 1, x1 = x0 + w - 1, y0 = ty + 1, y1 = y0 + d - 1, counterRow = y0 + Math.max(1, Math.min(3, Math.floor(d * 0.3)));
  const dc = Math.max(x0 + 1, Math.min(x1, Math.round(x0 + (w - 1) * doorAt)));
  const u = { poi: 0, kind: trade ? 'delivery' : kind, x0, x1, counterRow, clerk: { x: (x0 + x1 + 1) / 2 * TILE, y: (counterRow - 0.5) * TILE, a: Math.PI / 2 }, door: { tx: dc - 1, ty: y1 + 1, w: 2 }, ...(trade ? { trade } : null) };
  const b = { id: tx * 7 + ty, tx, ty, tw: w + 2, th: d + 2, name, walkIn: { south: true, units: [u], x0, x1, y0, y1 } };
  return { b, u };
}
// can a body walk from just inside the door to the counter's spot, round everything that stands on the floor? (a
// fine walk over the room's floor in front of the counter; blocked: a tile the map says no to, or a piece that isn't flat)
function reaches(R, blockedTile) {
  const st = 4, solid = R.pieces.filter((p) => !p.flat);
  const free = (x, y) => {
    if (x - BODY < R.X0 || x + BODY > R.X1 || y - BODY < R.Ya || y + BODY > R.Yb) return false;
    if (blockedTile && [[-BODY, -BODY], [BODY - 0.01, -BODY], [-BODY, BODY - 0.01], [BODY - 0.01, BODY - 0.01]].some(([dx, dy]) => blockedTile(x + dx, y + dy))) return false;
    return !solid.some((p) => x + BODY > p.x0 && x - BODY < p.x1 && y + BODY > p.y0 && y - BODY < p.y1);
  };
  const sx = Math.round(R.dc / st), sy = Math.round((R.Yb - BODY - 1) / st), gx = R.spot.x, gy = Math.min(R.spot.y, R.Yb - BODY - 1);
  if (!free(sx * st, sy * st)) return 'the door blocked';
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  while (q.length) {
    const [i, j] = q.pop();
    if (Math.hypot(i * st - gx, j * st - gy) <= st) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (i + di) + ',' + (j + dj);
      if (seen.has(k) || !free((i + di) * st, (j + dj) * st)) continue;
      seen.add(k); q.push([i + di, j + dj]);
    }
  }
  return 'no way from the door to the counter';
}
// a plan's kind of place (the bars by their names: IN5's three)
const BAR_NAME = { lounge: 'Velvet Lounge', tavern: 'The Oak & Mug', sportsbar: 'The Local' };
function specOf(plan) {
  if (BAR_PLANS.includes(plan)) return { kind: null, trade: 'bar', name: BAR_NAME[plan] };
  const kind = Object.keys(SHOP_PLAN).find((k) => SHOP_PLAN[k] === plan);
  return { kind, trade: kind ? null : Object.keys(TRADE_PLAN).find((t) => TRADE_PLAN[t] === plan), name: '' };
}
const SIZES = [[3, 3], [4, 5], [5, 6], [6, 7], [7, 7], [8, 9], [10, 7], [12, 9], [14, 6], [16, 10], [24, 10]];

test('each kind of place has a plan of its own', () => {
  const want = { convenience: 'corner', gasstation: 'fuel', grocery: 'grocery', gunshop: 'gunshop', hardware: 'hardware', pawn: 'pawn', fence: 'fence', bank: 'bank', courthouse: 'court', pharmacy: 'pharmacy', barber: 'barber', clothing: 'boutique', sports: 'sports', tackle: 'tackle', fishmarket: 'fishmarket', club: 'club', roadhouse: 'saloon' };
  for (const [k, p] of Object.entries(want)) assert.equal(planOf({ kind: k }), p, `${k}: its plan`);
  for (const [t, p] of Object.entries({ mart: 'corner', bar: 'bar', liquor: 'liquor', lobby: 'office', records: 'records' })) assert.equal(planOf({ kind: 'delivery', trade: t }), p, `the ${t} trade: its plan`);
  for (const t of ['laundry', 'books', 'clothes', 'florist', 'salon', 'arcade']) assert.equal(planOf({ kind: 'delivery', trade: t }), null, `${t}: keeps its own fit-out`);
  for (const k of ['coffee', 'hospital', 'police', 'bowling', 'cinema']) assert.equal(planOf({ kind: k }), null, `${k}: keeps its own fit-out`);
  for (const p of [...Object.values(SHOP_PLAN), ...Object.values(TRADE_PLAN)]) assert.ok(PLANS.includes(p) || p === 'bar', p);
  // IN5's three bars by their names; a name that says none of them, by the building - all three turn up
  for (const [n, p] of [['Velvet', 'lounge'], ['The Blue Note Lounge', 'lounge'], ['The Oak & Mug', 'tavern'], ['Rose & Crown Pub', 'tavern'], ['The Local', 'sportsbar'], ['Dugout Sports Bar', 'sportsbar']]) assert.equal(barPlan(n.toUpperCase()), p, n);
  assert.deepEqual(new Set(Array.from({ length: 24 }, (_, i) => barPlan('MIDNIGHT BAR', i * 8))), new Set(BAR_PLANS), 'unnamed bars come in all three');
  // each plan furnished in a fair-sized room: its floor and walls, the back wall dressed, things on the floor - and no two
  // plans the same
  const sig = new Map();
  for (const plan of PLANS) {
    const { kind, trade, name } = specOf(plan);
    const { b, u } = room(kind, 12, 9, 0.75, 40, 30, trade, name);
    const R = shopRoom(b, u, TILE);
    assert.ok(R && R.plan === plan, `${plan}: laid out`);
    assert.ok(R.floor && R.wall, `${plan}: its own floor and walls`);
    assert.ok(R.onWall.length >= 1, `${plan}: the back wall dressed`);
    assert.ok(R.pieces.length >= 2, `${plan}: furnished (${R.pieces.length})`);
    const s = [R.onWall.map((w) => w.t).sort().join(), R.pieces.map((p) => p.t + (p.k || '')).sort().join(), R.counter.k].join('|');
    for (const [q, s2] of sig) assert.notEqual(s, s2, `${plan} looks just like ${q}`);
    sig.set(plan, s);
  }
});

test('a building is fitted the same every time; buildings of a kind differ', () => {
  const looks = new Set();
  for (let i = 0; i < 40; i++) {
    const { b, u } = room('convenience', 8, 8, (i % 3) / 2, 20 + i * 13, 40 + i * 7);
    const R = shopRoom(b, u, TILE), R2 = shopRoom(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(u)), TILE);
    assert.deepEqual(R, R2, 'the same building, the same fit-out');
    looks.add(JSON.stringify([R.floor, R.wall, R.onWall.map((w) => w.text || w.t), R.pieces.map((p) => p.k || p.t)]));
  }
  assert.ok(looks.size >= 20, `forty corner stores, ${looks.size} looks`);
  for (const plan of ['gunshop', 'pawn', 'tavern', 'barber', 'bank']) {
    const { kind, trade, name } = specOf(plan), seen = new Set();
    for (let i = 0; i < 12; i++) { const { b, u } = room(kind, 10, 8, 0.5, 30 + i * 11, 50 + i * 5, trade, name); const R = shopRoom(b, u, TILE); seen.add(JSON.stringify([R.floor, R.wall, R.onWall.map((w) => w.text || w.t), R.pieces.map((p) => p.t + p.x0)])); }
    assert.ok(seen.size >= 4, `${plan}: ${seen.size} looks in twelve`);
  }
});

test('in every size of room the door and the counter stay in reach, nothing stands in the way or off the floor', () => {
  let n = 0;
  for (const plan of PLANS) {
    const { kind, trade, name } = specOf(plan);
    for (const [w, d] of SIZES) for (const at of [0, 0.5, 1]) for (const tx of [10, 77]) {
      const { b, u } = room(kind, w, d, at, tx, 30 + w, trade, name || (tx > 50 ? 'Quick Inn' : 'Clear View Optics'));
      const R = shopRoom(b, u, TILE), name = `${plan} ${w}x${d} door ${at}`;
      const ok = reaches(R);
      assert.equal(ok, true, `${name}: ${ok}`);
      for (const p of R.pieces) {
        assert.ok(p.x0 >= R.X0 && p.x1 <= R.X1 && p.y0 >= R.Ya && p.y1 <= R.Yb, `${name}: a ${p.t} off the shop floor`);
        if (p.flat || p.t === 'stool') continue;
        for (const k of R.clear) assert.ok(!(p.x0 < k[2] && p.x1 > k[0] && p.y0 < k[3] && p.y1 > k[1]), `${name}: a ${p.t} in the way`);
      }
      for (const q of R.people) {
        assert.ok(q.x > R.X0 && q.x < R.X1 && q.y > R.Ya && q.y < R.Yb, `${name}: a customer off the floor`);
        if (q.gt !== 'sit') for (const p of R.pieces) if (!p.flat && p.t !== 'stool') assert.ok(!(q.x > p.x0 + 2 && q.x < p.x1 - 2 && q.y > p.y0 + 2 && q.y < p.y1 - 2), `${name}: a customer stood in a ${p.t}`);
      }
      n++;
    }
  }
  assert.ok(n > 500);
});

// wave D (the 11-03 concept audit, gap 6): the floors dressed like the concepts' - islands, racks, rugs - not pieces
// hugging the walls round an empty floor. Over the floor that may be dressed (all but the kept-clear ways), every plan in
// a 10 x 8 room dresses at least 30% whichever side its door is on, and none fills it solid; the fill target is 35-50%
test('the floors dressed: no plan under 30% of its floor in a 10 x 8 room, none walled up solid', () => {
  const all = [];
  for (const plan of PLANS) {
    const { kind, trade, name } = specOf(plan);
    for (const at of [0, 0.25, 0.5, 0.75, 1]) for (const [tx, ty] of [[10, 40], [77, 52], [130, 21]]) {
      const { b, u } = room(kind, 10, 8, at, tx, ty, trade, name), R = shopRoom(b, u, TILE), cv = coverage(R);
      assert.ok(cv >= 0.3, `${plan} door at ${at} (#${b.id}): ${(cv * 100).toFixed(0)}% of its floor dressed`);
      assert.ok(cv <= 0.8, `${plan} door at ${at}: ${(cv * 100).toFixed(0)}% - walled up`);
      all.push(cv);
    }
  }
  const mean = all.reduce((s, v) => s + v, 0) / all.length;
  assert.ok(mean >= 0.35 && mean <= 0.5, `the mean fill ${(mean * 100).toFixed(0)}% (the target 35-50%)`);
});

test('the bank as IN3: a compass rose in the marble, the tellers behind glass, the roped queue, the vault door, the manager\'s office', () => {
  const { b, u } = room('bank', 14, 9, 0.5, 40, 30);
  const R = shopRoom(b, u, TILE), has = (t) => R.pieces.some((p) => p.t === t);
  assert.equal(R.counter.k, 'teller');
  assert.ok(['marble', 'stone'].includes(R.floor[0]), `marble or stone, not a diner's checks (${R.floor[0]})`);
  for (const t of ['rose', 'posts', 'office']) assert.ok(has(t), `a ${t}`);
  assert.ok(R.onWall.some((w) => w.t === 'vault'), 'the vault door on the back wall');
  for (let i = 0; i < 20; i++) { const q = room('bank', 8 + (i % 6), 7 + (i % 3), (i % 5) / 4, 20 + i * 9, 40 + i * 3), B = shopRoom(q.b, q.u, TILE); assert.ok(['marble', 'stone'].includes(B.floor[0]), 'no bank on checks'); }
});

test('the bars as IN5\'s three, the saloon as MC4', () => {
  const look = (plan, w = 12, d = 9) => { const { kind, trade, name } = specOf(plan), { b, u } = room(kind, w, d, 0.5, 40, 30, trade, name); return shopRoom(b, u, TILE); };
  const L = look('lounge'), T = look('tavern'), S = look('sportsbar'), M = look('saloon');
  assert.ok(L.pieces.some((p) => p.t === 'velvet') && L.pieces.some((p) => p.t === 'tableset' && p.candle), 'the lounge: velvet booths, candlelit tables');
  assert.ok(T.onWall.some((w) => w.t === 'fireplace') && T.pieces.some((p) => p.t === 'longtable'), 'the tavern: the fireplace, long tables');
  assert.ok(S.onWall.filter((w) => w.t === 'screen').length >= 2 && S.onWall.some((w) => w.t === 'dartboard') && S.pieces.some((p) => p.t === 'pool'), 'the sports bar: the TV wall, the dartboard, the pool table');
  assert.ok(M.onWall.some((w) => w.t === 'skull') && M.pieces.some((p) => p.t === 'armwrestle') && M.pieces.some((p) => p.t === 'pool'), 'the saloon: the bull skull, arm wrestling, pool');
  assert.notEqual(L.floor[0] + L.wall[1], T.floor[0] + T.wall[1]);
});

const w = makeWorld(), m = w.map;
const rooms = [];
for (const b of m.buildings) if (b && b.walkIn) for (const u of b.walkIn.units) { const R = shopRoom(b, u, TILE, m); if (R) rooms.push({ b, u, R }); }

test('the city\'s shops: fitted by their trade, the way to the counter, the ATM and its spot clear', () => {
  assert.ok(rooms.length > 60, `shops fitted (${rooms.length})`);
  const plans = new Set(rooms.map((q) => q.R.plan));
  for (const p of ['corner', 'gunshop', 'bank', 'club', 'barber', 'boutique', 'pawn', 'hardware', 'pharmacy']) assert.ok(plans.has(p), `a ${p} in the city`);
  const blockedTile = (x, y) => !!PED_BLOCK[m.tileAtPx(x, y)];
  for (const { b, u, R } of rooms) {
    const name = `${R.plan} in ${b.kind} #${b.id}`, poi = m.pois[u.poi];
    assert.ok(Math.abs(poi.x - R.spot.x) < 1 && Math.abs(poi.y - R.spot.y) < 1, `${name}: the counter's spot is the place's`);
    const ok = reaches(R, blockedTile);
    assert.equal(ok, true, `${name}: ${ok}`);
    for (const a of m.pois) if (a.kind === 'atm' && a.b === b.id && a.x >= R.X0 && a.x < R.X1) {
      for (const p of R.pieces) if (!p.flat) assert.ok(!(p.x0 < a.x + 16 && p.x1 > a.x - 16 && p.y0 < a.y + 14 && p.y1 > a.y - 40), `${name}: a ${p.t} on the ATM`);
    }
  }
});

test('the art draws every plan, and the fit-out rides in the cut-away', async () => {
  const { drawShop, shopFloorPx, shopWallPx } = await import('../client/art2/shopart.js');
  for (const plan of PLANS) {
    const { kind, trade, name } = specOf(plan);
    const { b, u } = room(kind, 12, 9, 0.75, 40, 30, trade, name);
    const R = shopRoom(b, u, TILE), ox = b.tx * TILE, oy = b.ty * TILE;
    let n = 0, lit = 0;
    const px = (x, Y, z, c, nn, f, e) => { assert.ok(Array.isArray(c) && c.length >= 3 && c.every((v) => v >= 0 && v <= 255), `${plan}: a colour`); n++; if (e) lit++; };
    const cu = { x0: u.x0 * TILE - ox, x1: (u.x1 + 1) * TILE - ox, fx0: u.x0 * TILE - ox, fx1: (u.x1 + 1) * TILE - ox, cy: u.counterRow * TILE - oy };
    drawShop(R, cu, { inY0: (b.walkIn.y0 - b.ty) * TILE, inY1: (b.walkIn.y1 - b.ty + 1) * TILE, H: 90 }, px, ox, oy);
    assert.ok(n > 4000, `${plan}: drawn (${n} px)`);
    if (plan !== 'court') assert.ok(lit > 20, `${plan}: something glows (${lit})`);
    if (R.floor) for (let k = 0; k < 50; k++) { const c = shopFloorPx(R, k * 37, k * 53); assert.ok(c.length === 3 && c.every((v) => v >= 0 && v <= 255)); }
    if (R.wall) for (let k = 0; k < 50; k++) { const c = shopWallPx(R, k * 37, k); assert.ok(c.length === 3 && c.every((v) => v >= 0 && v <= 255)); }
  }
  const { staticItems, makeStatic } = await import('../client/art2/game/statics.js');
  const CH = 768, picked = new Map();
  for (const q of rooms) if (!picked.has(q.R.plan)) picked.set(q.R.plan, q);
  for (const { b, R } of picked.values()) {
    const bi = m.buildings.indexOf(b), cx = Math.floor((b.tx + b.tw / 2) * TILE / CH), cy = Math.floor((b.ty + b.th / 2) * TILE / CH);
    let shop = 0;
    for (const it of staticItems(m, cx, cy, { cutaway: bi })) if (it.recipe && it.recipe.t === 'cut' && it.b === bi) { if (it.recipe.units.some((u) => u.shop)) shop++; const G = makeStatic(it.recipe); assert.ok(G && G.w > 0); }
    assert.ok(shop >= 1, `${R.plan} #${b.id}: the fit-out in the recipe`);
  }
});

test('customers in the shops: browsing, waiting at the counter, sat in the chair', () => {
  const S = spotsOf(m).list.filter((s) => s.k === 'shoppers');
  assert.ok(S.length > 20, `shops with customers (${S.length})`);
  const blockedTile = (x, y) => !!PED_BLOCK[m.tileAtPx(x, y)];
  for (const s of S) for (const q of s.shop.people) assert.ok(!blockedTile(q.x, q.y), `${s.shop.plan}: a customer stood in a wall`);
});

test('homes of a kind differ: each its own scheme of paper, planks and siding, by its id', async () => {
  const { HomeArt, schemeOf } = await import('../client/render/homeart2.js');
  const { layout } = await import('../shared/homelayout.js');
  const s = new Set();
  for (let id = 1; id <= 30; id++) s.add(schemeOf(id));
  assert.ok(s.size >= 4, `thirty homes, ${s.size} schemes`);
  assert.equal(schemeOf(0), 0, 'no id: the plain scheme');
  const L = layout('house', 1), look = [];
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const A = new HomeArt(L, 2, null, id);
    A.work(1e9);
    assert.ok(A.floor && A.items.length > 10, `home #${id}: built`);
    const f = A.floorBase || A.floor, G = f.G || f;
    let h = 0;
    if (G && G.col) for (let i = 0; i < G.col.length; i += 97) h = (h * 31 + G.col[i]) | 0;
    look.push(h);
  }
  assert.ok(new Set(look).size >= 3, 'their floors differ');
});
