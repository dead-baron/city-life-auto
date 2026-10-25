// The Neon Strip overhauled (the owner's notes part 2, 2026-10-25: "really bump up and overhaul the vibe and design so it
// looks much more inline with the cyberpunk neon nightlife vibe from the concepts", "lantern (or hanging lights) don't
// connect to anything", "way more neon signs with cool designs all around the neon district", "a really awesome arcade
// in the neon district"): every string of lights made fast at both ends, the picture signs many and spread round, the
// lantern alleys, the flagship arcade - and the district still walkable (shared/world3-neon.js; the art:
// client/art2/neonpics.js, neonsigns.js, game/statics.js 'festoon').
// (One v3 build, about 100 s and 2 GB: the heavy lock.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { World } from '../server/world.js';
import { joinPlayer, teleport } from './helpers.js';
import { TILE, T } from '../shared/constants.js';
import { NEON, NEON_PICS } from '../shared/world3-neon.js';
import { NP } from '../client/art2/neonpics.js';
import * as arcade from '../server/systems/arcade.js';
import * as players from '../server/systems/players.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const [X0, Y0, X1, Y1] = NEON.rect;
const inRect = (x, y) => x >= X0 * TILE && x < X1 * TILE && y >= Y0 * TILE && y < Y1 * TILE;
const bldNear = (x, y, r) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (M.inside(tx + dx, ty + dy) && M.bld[M.idx(tx + dx, ty + dy)] >= 0) return true; return false; };
const propNear = (re, x, y, d) => M.props.some((q) => re.test(q.t) && Math.hypot(q.x - x, q.y - y) < d);

test('every string of lights in the Neon Strip is made fast at both ends: a post of its own, a building\'s wall, a palm, a lamp', () => {
  const fests = M.props.filter((p) => p.t === 'festoon' && inRect(p.x, p.y));
  assert.ok(fests.length >= 150, `the strings (${fests.length})`);
  const bad = [], kinds = {};
  for (const f of fests) {
    const ends = f.ends || [];
    [[f.x, f.y], [f.x + (f.tx || 0), f.y + (f.ty || 0)]].forEach(([x, y], i) => {
      const a = ends[i] || 'nothing';
      kinds[a] = (kinds[a] || 0) + 1;
      const ok = a === 'pole' || (a === 'wall' && bldNear(x, y, 1)) || ((a === 'palm' || a === 'tree') && propNear(/^(palm|tree)/, x, y, 40)) || (a === 'lamp' && propNear(/^lamp$/, x, y, 40));
      if (!ok) bad.push(`${a} end at ${Math.round(x / TILE)},${Math.round(y / TILE)}`);
    });
  }
  assert.deepEqual(bad, [], 'an end hanging in the air');
  assert.ok(kinds.wall >= 60 && kinds.pole >= 20 && kinds.palm >= 40, `made fast to walls, posts and palms (${JSON.stringify(kinds)})`);
  // the lanterns: red paper lanterns strung wall to wall over the alleys, the walkways and the passages
  const lanterns = fests.filter((f) => f.k === 'lantern');
  assert.ok(lanterns.length >= 60, `the lantern strings (${lanterns.length})`);
  assert.ok(lanterns.filter((f) => f.ends[0] === 'wall' && f.ends[1] === 'wall').length >= 40, 'lanterns from wall to wall');
});

test('the picture signs: many designs, the owner\'s, spread over the district - never the same one twice on a front or next door', () => {
  const fronts = [];
  for (const b of M.buildings) {
    if (!b || !b.art || !b.art.neon || !inRect((b.tx + 0.5) * TILE, (b.ty + 0.5) * TILE)) continue;
    const N = b.art.neon, keys = [N.pic, ...(N.pics || [])].filter(Boolean);
    fronts.push({ b, keys, roof: (b.art.kit || []).filter(([k]) => k.startsWith('npic|')).map(([k]) => k.slice(5)) });
  }
  assert.ok(fronts.length >= 200, `the fronts dressed (${fronts.length})`);
  const all = fronts.flatMap((f) => [...f.keys, ...f.roof]), count = {};
  for (const k of all) count[k] = (count[k] || 0) + 1;
  for (const k of Object.keys(count)) assert.ok(NP[k] || k === 'lucy', `${k}: a picture the art has`);
  for (const k of NEON_PICS) assert.ok(NP[k], `${k} (the plan's deck): a picture the art has`);
  const kinds = Object.keys(count);
  assert.ok(kinds.length >= 24, `the designs on show (${kinds.length})`);
  for (const k of ['panther', 'tiger', 'karaokev', 'ramen', 'sushi', 'barv', 'hotelv', 'gamepad', 'maneki', 'dragon', 'clubv', 'nightlifev', 'cocktailv', 'noodles', 'citymart', 'club', 'matsuri']) assert.ok(count[k], `${k} somewhere`);
  const most = Math.max(...Object.values(count));
  assert.ok(most <= all.length * 0.1, `spread round: the commonest ${most} of ${all.length}`);
  assert.ok(all.length >= fronts.length * 1.5, `signs stacked up the fronts (${all.length} on ${fronts.length})`);
  // the tiger over STREETWEAR and the panther, the owner's two
  assert.ok(fronts.some((f) => f.b.name === 'Afterglow' && f.keys[0] === 'tiger'), 'the striding tiger over the streetwear shop');
  assert.ok(fronts.some((f) => f.b.name === 'The Midnight' && f.keys[0] === 'panther'), 'the panther over The Midnight');
  // on a front, no design twice; along a row, no two fronts side by side with the same main sign
  for (const f of fronts) assert.equal(new Set(f.keys).size, f.keys.length, `${f.b.name}: ${f.keys.join(', ')}`);
  const rows = new Map();
  for (const f of fronts) { const k = f.b.ty + f.b.th; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(f); }
  let pairs = 0;
  for (const list of rows.values()) {
    list.sort((a, c) => a.b.tx - c.b.tx);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], c = list[i];
      if (c.b.tx - (a.b.tx + a.b.tw) > 6 || !a.keys[0] || !c.keys[0]) continue;
      pairs++;
      assert.notEqual(a.keys[0], c.keys[0], `${a.b.name} and ${c.b.name} side by side: both ${a.keys[0]}`);
    }
  }
  assert.ok(pairs >= 80, `the neighbours compared (${pairs})`);
});

test('the lantern alleys: walkways through the blocks from street to street, lanterns over them, their mouths open', () => {
  for (const [x, name, y0, y1] of [[3066, 'Lantern Alley', 2208, 2244], [3250, 'Red Lantern Row', 2257, 2293]]) {
    // (a column of paving 5 wide from street to street, buildings either side along most of it, never built over)
    let paved = 0, walled = 0, built = 0;
    for (let y = y0; y < y1; y++) {
      const t = (dx) => M.tiles[M.idx(x + dx, y)];
      if ([0, 1, 2, 3, 4].every((dx) => t(dx) === T.PLAZA)) paved++;
      if ([0, 1, 2, 3, 4].some((dx) => M.bld[M.idx(x + dx, y)] >= 0)) built++;
      if (M.bld[M.idx(x - 1, y)] >= 0 && M.bld[M.idx(x + 5, y)] >= 0) walled++;
    }
    assert.equal(built, 0, `${name}: nothing built on it`);
    assert.ok(paved >= 25 && walled >= 14, `${name}: paved (${paved} rows) between walls (${walled})`);
    const over = M.props.filter((p) => p.t === 'festoon' && p.k === 'lantern' && p.x >= x * TILE - 4 && p.x <= (x + 5) * TILE + 4 && p.y > y0 * TILE && p.y < y1 * TILE && Math.abs((p.tx || 0) - 5 * TILE) < 2);
    assert.ok(over.length >= 6, `${name}: lanterns strung across it (${over.length})`);
    // nothing solid across it: a way through every row (three tiles of it clear at least)
    for (let y = y0; y < y1; y++) {
      if (![0, 1, 2, 3, 4].every((dx) => M.tiles[M.idx(x + dx, y)] === T.PLAZA)) continue;
      let clear = 0;
      for (let dx = 0; dx < 5; dx++) { const solid = (M.solidProps.get(M.idx(x + dx, y)) || []).some((e) => e.r > 6); if (!solid) clear++; }
      assert.ok(clear >= 3, `${name}: row ${y} open (${clear} of 5 clear)`);
    }
  }
});

test('the flagship arcade: the Neon Strip\'s Pixel Arcade - its door onto the biggest floor, eighteen cabinets and the long counter', async () => {
  const flag = M.pois.filter((p) => p.flagship);
  assert.equal(flag.length, 1, 'one flagship');
  const poi = flag[0];
  assert.equal(poi.label, 'Pixel Arcade');
  assert.ok(inRect(poi.x, poi.y), 'in the Neon Strip');
  assert.ok(arcade.isArcade({ map: M }, poi));
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const { p, conn } = joinPlayer(w, { cash: 50 });
  teleport(w, p.ped, poi.x, poi.y);
  const it = players.findInteraction(w, p);
  assert.ok(it && /Pixel Arcade - the arcade/.test(it.label), it && it.label);
  it.run();
  const h = arcade.hallOf(w, poi), L = arcade.hallLayout(h);
  assert.equal(p.ped.home.id, h.id);
  assert.equal([...conn.sent].reverse().find((m) => m && m.t === 'home').plan, 'arcadeflag', 'the page draws the flagship\'s floor');
  const cabs = L.pieces.filter((q) => q.ch === 'j').length;
  const others = M.pois.filter((q) => arcade.isArcade({ map: M }, q) && !q.flagship).map((q) => arcade.hallLayout(arcade.hallOf(w, q)).pieces.filter((z) => z.ch === 'j').length);
  assert.ok(others.length >= 7 && cabs > Math.max(...others), `more cabinets (${cabs}) than any other arcade (${Math.max(...others)})`);
  assert.ok(L.pieces.some((q) => q.use === 'prizes' && q.th >= 3), 'the long prize counter');
  // its building: the biggest arcade front on the strip, its signs the owner's game pad and GAME ZONE
  const b = M.buildings[poi.b];
  assert.ok(b.tw >= 24, `its front ${b.tw} tiles`);
  assert.equal(b.art.neon.pic, 'gamepad');
  assert.ok((b.art.kit || []).some(([k]) => k === 'npic|gamezone'), 'GAME ZONE on its roof');
});

test('still playable: no solid prop on the Strip\'s streets (the boulevard\'s median palms and the alleys\' bins aside), every front\'s door onto the street', () => {
  const trees = new Set(M.props.filter((q) => /^(palm|tree)/.test(q.t)).map((q) => Math.round(q.x) + ',' + Math.round(q.y)));
  const bad = [];
  for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) {
    if (!M.inside(tx, ty)) continue;
    const i = M.idx(tx, ty), t = M.tiles[i];
    if (t !== T.ROAD || (M.roadRank && M.roadRank[i] === 1)) continue;   // (an alley's asphalt has its bins and crates along its walls: map.js dressAlleys)
    for (const e of M.solidProps.get(i) || []) if (e.r > 4 && !trees.has(Math.round(e.x) + ',' + Math.round(e.y))) bad.push(`${tx},${ty} r ${e.r}`);
  }
  assert.deepEqual(bad.slice(0, 10), [], 'solid props on the roads');
  let doors = 0;
  for (const b of M.buildings) {
    if (!b || !b.door || !inRect((b.tx + 0.5) * TILE, (b.ty + 0.5) * TILE)) continue;
    doors++;
    const t = M.tiles[M.idx(b.door.tx, b.door.ty)];
    assert.ok(t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.ROAD || t === T.GRASS, `${b.name}: its door onto the street (tile ${t})`);
  }
  assert.ok(doors >= 150, `the doors (${doors})`);
});
