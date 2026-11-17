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
import { NEON, NEON_PICS, NY } from '../shared/world3-neon.js';
import { NP } from '../client/art2/neonpics.js';
import * as arcade from '../server/systems/arcade.js';
import * as players from '../server/systems/players.js';
import { spotsOf, fill } from '../server/systems/activities.js';
import { PINKMILE } from '../shared/world3-pinkmile.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const [X0, Y0, X1, Y1] = NEON.rect;
const inRect = (x, y) => x >= X0 * TILE && x < X1 * TILE && y >= Y0 * TILE && y < Y1 * TILE;
const bldNear = (x, y, r) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (M.inside(tx + dx, ty + dy) && M.bld[M.idx(tx + dx, ty + dy)] >= 0) return true; return false; };
const propNear = (re, x, y, d) => M.props.some((q) => re.test(q.t) && Math.hypot(q.x - x, q.y - y) < d);

test('every string of lights in the Neon Strip is made fast at both ends: a post of its own, a building\'s wall, a lamp - no longer than a real one', () => {
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
  assert.ok(kinds.wall >= 60 && kinds.pole >= 80, `made fast to walls and posts (${JSON.stringify(kinds)})`);
  // (the craft pass, 11-14: no more strings looped palm to palm down the boulevard - the palms' own fairy lights wound
  // up their trunks: the art's 'palmlights', p.lit)
  const lit = M.props.filter((p) => p.t === 'palm_a' && p.lit && inRect(p.x, p.y));
  assert.ok(lit.length >= 40, `palms lit up their trunks (${lit.length})`);
  assert.equal(fests.filter((f) => (f.ends || []).includes('palm')).length, 0, 'no string looped palm to palm');
  // and no string longer than a real one hangs: a long run is cut into spans on posts (shared/world3-craft.js canopy)
  const long = fests.filter((f) => Math.hypot(f.tx || 0, f.ty || 0) > 12 * TILE).map((f) => `${Math.round(f.x / TILE)},${Math.round(f.y / TILE)}`);
  assert.deepEqual(long, [], 'a string longer than twelve tiles');
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

test('the lantern alleys and the Glow Arcade: walkways through the blocks from street to street, lanterns or the arcade\'s lit arches over them, their mouths open', () => {
  for (const [x, name, y0, y1] of [[3066, 'Glow Arcade', 2208, 2244], [3250, 'Red Lantern Row', 2257, 2293]]) {
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
    // (the Glow Arcade - the rebuild, 11-16, WC421's covered arcade: a lit arch over the walk every two tiles)
    const over = name === 'Glow Arcade' ? M.props.filter((p) => p.t === 'arcrib' && Math.abs(p.x - (x + 2.5) * TILE) < 2 && p.y > y0 * TILE && p.y < y1 * TILE)
      : M.props.filter((p) => p.t === 'festoon' && p.k === 'lantern' && p.x >= x * TILE - 4 && p.x <= (x + 5) * TILE + 4 && p.y > y0 * TILE && p.y < y1 * TILE && Math.abs((p.tx || 0) - 5 * TILE) < 2);
    assert.ok(over.length >= (name === 'Glow Arcade' ? 14 : 6), `${name}: lanterns or arches across it (${over.length})`);
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
  assert.ok(L.pieces.some((q) => q.use === 'prizes' && Math.max(q.tw, q.th) >= 3), 'the long prize counter');
  // its building: the biggest arcade front on the strip, its signs the owner's game pad and GAME ZONE
  const b = M.buildings[poi.b];
  assert.ok(b.tw >= 24, `its front ${b.tw} tiles`);
  assert.equal(b.art.neon.pic, 'gamepad');
  assert.ok((b.art.kit || []).some(([k]) => k === 'npic|gamezone'), 'GAME ZONE on its roof');
});

test('still playable: no solid prop on the Strip\'s streets (the boulevard\'s median - its palms, its fountain and lamps - and the alleys\' bins aside), every front\'s door onto the street', () => {
  const trees = new Set(M.props.filter((q) => /^(palm|tree)/.test(q.t)).map((q) => Math.round(q.x) + ',' + Math.round(q.y)));
  const bad = [];
  for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) {
    if (!M.inside(tx, ty)) continue;
    const i = M.idx(tx, ty), t = M.tiles[i];
    if (t !== T.ROAD || (M.roadRank && M.roadRank[i] === 1)) continue;   // (an alley's asphalt has its bins and crates along its walls: map.js dressAlleys)
    const median = Math.abs(ty + 0.5 - (NY.blvd + 0.5)) < 1.6;   // (the boulevard's planted median: its set pieces stand on it - the craft pass's fountain and its lamps, WC238)
    for (const e of M.solidProps.get(i) || []) if (e.r > 4 && !median && !trees.has(Math.round(e.x) + ',' + Math.round(e.y))) bad.push(`${tx},${ty} r ${e.r}`);
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

// The district craft pass (the owner, 11-14: "Big open spaces ... way too big and open and the lights don't act like
// lanterns ... alive with interesting things and details and NPCs"): the open spaces given a purpose and edges, their
// people (shared/world3-craft.js: terraces, knots on the corners, stallholders - server/systems/activities.js)
test('the craft pass: Lantern Lane four rows of stalls, Harbor Lights laid out, the terraces, corners and stalls peopled - the Strip and the Pink Mile', () => {
  const inR = (r, x, y) => x >= r[0] * TILE && x < r[2] * TILE && y >= r[1] * TILE && y < r[3] * TILE;
  const PM = PINKMILE.rect, count = (list, r) => (list || []).filter((q) => inR(r, q.x, q.y)).length;
  // Lantern Lane: no longer a 20-tile plaza with stalls along its edges - four rows, the lanterns over two aisles
  const lane = M.props.filter((p) => p.t === 'mstall' && p.x > 2983 * TILE && p.x < 3154 * TILE && p.y > 2141 * TILE && p.y < 2160 * TILE);
  const rows = new Set(lane.map((p) => Math.round(p.y / 8)));
  assert.ok(lane.length >= 60 && rows.size === 4, `the night market's stalls (${lane.length}) in four rows (${rows.size})`);
  // Harbor Lights: the stage's crowd, the market street, the food trucks' tables, the wheel, the car park
  const HL = [3478, 2214, 3640, 2296];
  for (const [t, n] of [['mstall', 36], ['picnic', 6], ['foodcart', 5], ['ferris', 1], ['carousel', 1], ['vidboard', 1]]) assert.ok(M.props.filter((p) => p.t === t && inR(HL, p.x, p.y)).length >= n, `Harbor Lights: ${t}`);
  assert.ok((M.partySpots || []).some((q) => inR(HL, q.x, q.y) && M.tileAtPx(q.x, q.y) === T.PLAZA), 'the crowd at the stage stands on its forecourt');
  // the people's places, in both districts
  for (const [name, r, t, h, v] of [['the Neon Strip', NEON.rect, 40, 40, 60], ['the Pink Mile', PM, 20, 15, 0]]) {
    assert.ok(count(M.terraceSpots, r) >= t, `${name}: terrace tables (${count(M.terraceSpots, r)})`);
    assert.ok(count(M.hangSpots, r) >= h, `${name}: knots of people (${count(M.hangSpots, r)})`);
    assert.ok(count(M.vendorSpots, r) >= v, `${name}: stallholders (${count(M.vendorSpots, r)})`);
    assert.ok(M.props.filter((p) => p.t === 'palm_a' && p.lit && inR(r, p.x, p.y)).length >= 20, `${name}: the palms lit up their trunks`);
    assert.equal(M.props.filter((p) => p.t === 'festoon' && inR(r, p.x, p.y) && !(p.ends && p.ends.length === 2)).length, 0, `${name}: every string made fast at both ends`);
  }
  // the activities find them and fill them: two sat at a table, a knot stood talking, a stallholder facing the aisle
  const S = spotsOf(M), w = new World(M, { npcBudget: 400, throwErrors: true });
  for (const k of ['terrace', 'hang', 'vendor']) {
    const near = S.list.filter((q) => q.k === k && inR(NEON.rect, q.x, q.y));
    assert.ok(near.length >= 10, `${k} spots on the Strip (${near.length})`);
    const g = near.map((q) => fill(w, q, { seen: true })).find(Boolean);
    assert.ok(g && g.ids.length >= 1, `a ${k} spot fills`);
    const ped = w.get(g.ids[0]);
    assert.equal(ped.npc.act.k, k);
    if (k === 'terrace') assert.equal(ped.gt, 'sit', 'sat at the table');
    if (k === 'hang') assert.ok(g.ids.length >= 2 && ped.npc.act.chat, 'friends talking');
  }
});

// The rebuild (the owner, 11-16: "Not sure it's turning out like the concepts - just seemed like a large open area with
// one sign of the girl with the eye patch ... Not sure it's looking very cyberpunk neon night life kind of vibe"): the
// open lots filled with lit fronts laid last (no other number moves), WC421's landmarks, WC422's lanterns across the lane
test('the rebuild: the open lots filled with lit fronts at the end of the list, the hotels\' pools, the screen, the fair, the lanes', () => {
  const inR = (r, x, y) => x >= r[0] * TILE && x < r[2] * TILE && y >= r[1] * TILE && y < r[3] * TILE;
  // the fronts laid last: after every building of the hand plans, the towers' parts and the opened-up blocks - none
  // with a home (no home's number moves)
  const late = M.buildings.map((b, i) => [b, i]).filter(([b]) => b && b.hand && b.name && inRect((b.tx + 0.5) * TILE, (b.ty + 0.5) * TILE) && b.id >= M.buildings.findIndex((q) => q && q.openOf !== undefined));
  const names = new Set(late.map(([b]) => b.name));
  for (const n of ['Marina Bay Hotel', 'Skyline Suites Hotel', 'Golden Koi Casino', 'Lucky Harbor Casino', 'Hi Score Arcade', 'Lucky Seven Bar', 'Tiki Tide Bar']) assert.ok(names.has(n), `${n} laid last`);
  assert.ok(late.length >= 18, `the late fronts (${late.length})`);
  for (const [b] of late) assert.ok(b.home === undefined, `${b.name}: no home`);
  // the hotel towers' pools on their roofs; the video billboard on Lantern Hall's roof over the plaza
  const pools = M.buildings.filter((b) => b && (b.art?.kit || []).some(([k]) => k === 'rpool'));
  assert.ok(pools.length >= 4, `rooftop pools (${pools.length})`);
  assert.ok(pools.every((b) => (b.art.spec?.floors || 0) >= 5 || b.kind === 'hotel'), 'on the hotels');
  const hall = M.buildings.find((b) => b && b.name === 'Lantern Hall');
  assert.ok(hall && hall.art.kit.some(([k]) => k === 'vid'), 'the video billboard on Lantern Hall');
  // Harbor Lights: no lawn of any size left on the headland's middle, no car park
  const HL = [3482, 2222, 3606, 2292];
  let grass = 0, lot = 0, all = 0;
  for (let ty = HL[1]; ty < HL[3]; ty++) for (let tx = HL[0]; tx < HL[2]; tx++) { const t = M.tiles[M.idx(tx, ty)]; all++; if (t === T.GRASS) grass++; if (t === T.LOT) lot++; }
  assert.ok(grass < all * 0.12, `Harbor Lights' lawn ${grass} of ${all} tiles`);
  assert.ok(lot < all * 0.12, `Harbor Lights' asphalt ${lot} of ${all} tiles`);
  assert.ok(M.props.some((p) => p.t === 'carousel' && inR(HL, p.x, p.y)), 'the carousel');
  // Lantern Lane (WC422): the lanterns across it wall to wall at every stall - four runs end to end
  const across = M.props.filter((p) => p.t === 'festoon' && p.k === 'lantern' && p.x > 2983 * TILE && p.x < 3154 * TILE && p.y >= 2140 * TILE && p.y < 2161 * TILE && Math.abs(p.tx || 0) <= 8);
  assert.ok(across.length >= 140, `the lanterns across Lantern Lane (${across.length})`);
  assert.ok(across.filter((p) => (p.ends || []).includes('wall')).length >= 30, 'made fast to the north row\'s walls');
  // the crossroads: the taxis waiting, the Violet Room's door on the corner
  assert.ok(M.parking.filter((p) => p.model === 'taxi' && inR([3150, 2205, 3180, 2216], p.x, p.y)).length >= 3, 'the taxi rank');
  const vr = M.buildings.find((b) => b && b.name === 'The Violet Room');
  assert.ok(vr.door.tx >= vr.tx + vr.tw - 3, 'the Violet Room\'s door on the corner');
});
