// The street's small kit (11-27, the shared kit's audit #5):
//   the phone box   reads as one - the owner, 11-23: "white rectangles everywhere": a blue lit header with a white
//                   handset, the payphone seen through the glass (client/art2/props-kit.js phoneBooth)
//   the ATM booth   a cash machine no wall takes stands in a booth of its own - the owner, 11-22: "Booth works for
//                   atms" (props-kit.js atmBooth; statics.js atmOnItsOwn: the bake's and the lint's one answer)
//   the awning      is open over a cash machine set in a shop's front - the owner, 11-22, N18 (buildings.js storefront,
//                   statics.js frontAtms: shop.avoid's 'atm' spans)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStatic, atmOnItsOwn, ATM_BOOTH, frontAtms } from '../client/art2/game/statics.js';
import { makeBuilding } from '../client/art2/buildings.js';
import { T, TILE } from '../shared/constants.js';

const prop = (m, a = [1]) => makeStatic({ t: 'v', m, a, hd: 0, pv: null });
// a sprite's pixels as [x, y, r, g, b, glow]
const pixels = (G) => { const o = []; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const j = (y * G.w + x) * 4; if (G.col[j + 3] > 127) o.push([x, y, G.col[j], G.col[j + 1], G.col[j + 2], G.emi[j + 3]]); } return o; };
const whiteLit = (p) => p[5] > 200 && p[2] > 215 && p[3] > 215 && p[4] > 215;
const blueLit = (p) => p[5] > 90 && p[4] > p[2] + 40 && p[4] > 70;

test('the phone box reads as one: a blue lit header with a white handset, the dark payphone and a yellow directory behind the glass', () => {
  const G = prop('phoneBooth'), P = pixels(G);
  const head = P.filter(blueLit), mark = P.filter(whiteLit);
  assert.ok(head.length > 60, `a lit blue header (${head.length} px)`);
  assert.ok(mark.length >= 40 && mark.length < head.length * 2, `the white handset on it (${mark.length} px)`);
  const my = mark.map((p) => p[1]), hy = head.map((p) => p[1]);
  assert.ok(Math.min(...my) >= Math.min(...hy) - 1 && Math.max(...my) <= Math.max(...hy) + 1, 'inside the header');
  // the handset's shape: its top row full, an opening under its middle
  const y0 = Math.min(...my), top = mark.filter((p) => p[1] === y0).length, y2 = Math.max(...my), bot = mark.filter((p) => p[1] === y2).map((p) => p[0]).sort((a, b) => a - b);
  let gap = 0; for (let i = 1; i < bot.length; i++) gap = Math.max(gap, bot[i] - bot[i - 1]);
  assert.ok(top >= 10 && gap >= 6, `an arch: ${top} px across the top, ${gap} px open under its middle`);
  const below = P.filter((p) => p[1] > Math.max(...hy) + 2);
  assert.ok(below.filter((p) => p[2] < 60 && p[3] < 62 && p[4] < 70).length > 120, 'the payphone\'s dark case and handset show through the door');
  assert.ok(below.filter((p) => p[2] > 190 && p[3] > 150 && p[4] < 110).length > 8, 'the yellow directory');
  assert.ok(G.h > 60 && G.w >= 20);
});

test('the ATM booth: a lit header that says ATM, the machine\'s lit screen showing under it, a roof', () => {
  const G = prop('atmBooth'), P = pixels(G);
  const word = P.filter(whiteLit), head = P.filter(blueLit), scr = P.filter((p) => p[5] > 200 && p[4] > 220 && p[2] < 180);
  assert.ok(word.length >= 80 && word.length <= 140, `A, T, M in white, lit (${word.length} px of 2 x 2 blocks)`);
  const wx = word.map((p) => p[0]), wy = word.map((p) => p[1]);
  assert.ok(Math.max(...wx) - Math.min(...wx) >= 20 && Math.max(...wy) - Math.min(...wy) === 9, 'three letters, five art pixels tall');
  assert.ok(head.length > 150, 'on a lit blue header');
  assert.ok(scr.length > 40 && Math.min(...scr.map((p) => p[1])) > Math.max(...wy), `the screen shows, below the header (${scr.length} px)`);
  assert.ok(G.w >= 40 && G.h > prop('atmWall').h, 'taller and wider than the piece of wall it replaces');
});

test('which ATM gets the booth: one with no wall behind it, never one in a room or set into a front', () => {
  const W = 12, H = 12, tiles = new Uint8Array(W * H).fill(T.SIDEWALK ?? 0);
  const M = { tiles, inside: (x, y) => x >= 0 && y >= 0 && x < W && y < H, idx: (x, y) => y * W + x };
  for (let x = 2; x < 7; x++) tiles[M.idx(x, 3)] = T.BUILDING;   // a building's wall along row 3 (y 96..128)
  const at = (x, y, o = {}) => ({ t: 'atmw', x, y, ...o });
  assert.equal(atmOnItsOwn(M, at(4.5 * TILE, 4 * TILE + 5)), false, 'set into the wall: its back on the building');
  assert.equal(atmOnItsOwn(M, at(4.5 * TILE, 7 * TILE)), true, 'out on the pavement');
  assert.equal(atmOnItsOwn(M, at(6.9 * TILE, 4 * TILE + 5)), true, 'half off the wall\'s end: not set in it');
  assert.equal(atmOnItsOwn(M, at(9 * TILE, 7 * TILE, { inside: 3 })), false, 'in a room');
  assert.ok(Math.abs(ATM_BOOTH.south) <= 12);
});

test('an awning is open over a cash machine set in the front, and whole where there is none', () => {
  const mk = (avoid) => makeBuilding({ w: 256, d: 96, floors: 2, style: 'brick', seed: 5, night: 0, shop: { kind: 'mart', door: 'left', sign: null, awning: ['#a02a2a', '#f0e8d8'], avoid } });
  const A = mk([[120, 162, 'atm']]), B = mk(null), C = mk([[120, 162, 'planter']]);
  let cut = 0, same = 0, planter = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const j = (y * A.w + x) * 4, d = A.col[j] !== B.col[j] || A.col[j + 1] !== B.col[j + 1] || A.col[j + 2] !== B.col[j + 2]; if (d) { if (x >= 118 && x < 164) cut++; else same++; } if (C.col[j] !== B.col[j]) planter++; }
  assert.ok(cut > 300, `the cloth is gone over the machine (${cut} px)`);
  assert.equal(same, 0, 'and nowhere else');
  // (a planter stood there moves the OPEN sign only, never the awning - but the OPEN may move, so only the awning's rows are asked)
  let awnRows = 0; for (let y = A.h - 52; y < A.h - 30; y++) for (let x = 118; x < 164; x++) { const j = (y * A.w + x) * 4; if (C.col[j] !== B.col[j]) awnRows++; }
  assert.equal(awnRows, 0, 'a planter in front opens no awning');
  // the bake's spans say which is which
  const M = { props: [{ t: 'atmw', x: 5 * TILE, y: 10 * TILE + 5 }, { t: 'planter_box', x: 8 * TILE, y: 10 * TILE + 20 }] };
  const sp = frontAtms(M, 2, 10, 10);
  assert.deepEqual(sp.map((q) => q[2]).sort(), ['atm', 'planter']);
});

// A taller neighbour over the room you are in (the shared kit's audit #5; the lint's interiorOverlap: 24 rooms): the
// page fades it while you're inside (art2 host.js overRoom, _fades).
test('in a walk-in, a building south of it whose picture lies over the floor fades - not its neighbours, not what stands behind', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../client/art2/game/host.js', import.meta.url), 'utf8');
  // (host.js needs a browser: its rule is read out of the file and run here)
  const m = /export const ROOM_OVER = (\d+);\s*export function overRoom\(r, b\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m, 'overRoom is there');
  const overRoom = new Function('TILE', 'ROOM_OVER', `return function (r, b) {${m[2]}\n}`)(TILE, +m[1]);
  const b = { id: 7, tx: 10, ty: 10, tw: 6, th: 4, walkIn: {} }, X0 = 320, Y0 = 320, X1 = 512, Y1 = 448;
  // [index, x0, top, x1, bottom, foot]
  assert.equal(overRoom([8, 300, 380, 520, 560, 560], b), true, 'a tall block across the street to the south: its wall drawn up over the floor');
  assert.equal(overRoom([8, 300, 470, 520, 560, 560], b), false, 'a low one to the south: its picture ends short of the room');
  assert.equal(overRoom([8, 300, 200, 520, 330, 330], b), false, 'the building behind (north): it stands behind the room');
  assert.equal(overRoom([8, 520, 300, 700, 460, 460], b), false, 'the neighbour beside it: no part over the floor');
  assert.equal(overRoom([8, 500, 300, 700, 460, 460], b), false, 'a neighbour whose eaves lap 12 px over the side: too little to fade for');
  assert.equal(overRoom([7, 300, 200, 520, 460, 448], b), false, 'never the room\'s own building (the cut-away has it)');
  const room = { id: 7, tx: 10, ty: 10, tw: 6, th: 4, walkIn: { x0: 10, x1: 15, y0: 6, y1: 13 } };   // (a room deeper than its front's footprint)
  assert.equal(overRoom([8, 300, 200, 520, 330, 330], room), true, 'measured on the room\'s own tiles: a block standing in the room\'s depth is over its floor');
  assert.match(src, /if \(ib\) \{[\s\S]{0,500}overRoom\(r, ib\)\) this\._roomB\.set\(r\[0\], 1\);[\s\S]{0,200}want\.set\(b, 1\)/, '_fades asks for them while you are in');
  void X0; void Y0; void X1; void Y1;
});

// The owner, 11-17, of the Rusty Spur's wall: 'The "RIDE DRINK REPEAT" sign reads as drink-driving - replace with
// another biker-bar line ... Check other signs for the same.' The world's props and fronts are the lint's (drinkSign);
// the rooms' wall signs are written in shared/shoprooms.js: no line there pairs drink with riding or driving.
test('no wall sign in a room pairs drink with riding or driving', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../shared/shoprooms.js', import.meta.url), 'utf8'), bad = [];
  for (const m of src.matchAll(/'([A-Z][A-Z0-9 &'.-]{2,40})'/g)) if (/DRINK|BOOZE|BEER|SHOTS|WHISKEY/.test(m[1]) && /\bRIDE|DRIVE|ROAD|THROTTLE|MOTOR/.test(m[1])) bad.push(m[1]);
  assert.deepEqual(bad, []);
  assert.match(src, /'LIVE TO RIDE'/);
});

test('a hammock\'s bed is a person\'s length whatever the span: ropes go the rest of the way (the owner, 11-23: "hammocks too long")', async () => {
  const { HAMMOCK_BED } = await import('../client/art2/props-town.js');
  const span = (len) => { const P = pixels(prop('hammock', [len])), cloth = P.filter((p) => p[2] > 190 && p[3] > 120 && p[3] < 200 && p[4] < 110), rope = P.filter((p) => p[2] > 170 && p[3] > 160 && p[4] > 120 && Math.abs(p[2] - p[3]) < 40), wood = P.filter((p) => p[2] < 110 && p[3] < 80 && p[4] < 70); return { cloth: cloth.length ? Math.max(...cloth.map((p) => p[0])) - Math.min(...cloth.map((p) => p[0])) + 1 : 0, rope: rope.length, wood: wood.length }; };
  const a = span(40), b = span(60), c = span(120);
  assert.ok(a.cloth >= 28 && a.cloth <= 34 && a.wood > 60, `a 40 px one between its own posts (${JSON.stringify(a)})`);
  assert.ok(b.cloth >= HAMMOCK_BED - 3 && b.cloth <= HAMMOCK_BED + 2, `60 px: the bed its full length (${b.cloth})`);
  assert.ok(c.cloth <= HAMMOCK_BED + 2 && c.cloth >= HAMMOCK_BED - 3, `120 px between palms: the bed no longer (${c.cloth} px of cloth)`);
  assert.ok(c.rope > 80 && c.wood < a.wood, `ropes for the rest, no posts of its own (${JSON.stringify(c)})`);
});

// A tower across the street drawn up over the shops facing it (found 11-27: the Grand Neon Hotel over the Bench & Bar):
// faded, it showed the ground before any building - the shop a bare lot from its own kerb. The under layer keeps a
// building's picture over its own footprint where another building is on top (chunkbake.js underKeep).
test('a faded tower shows the shop under its picture, not a bare lot: the under layer keeps each building over its own footprint', async () => {
  const { underKeep, compositeDepth } = await import('../client/art2/game/chunkbake.js');
  const { GBuf } = await import('../client/art2/gbuf.js');
  const W = 64, H = 64, G = new GBuf(W, H); G.z.fill(0);
  for (let i = 0; i < W * H; i++) { G.col[i * 4] = 90; G.col[i * 4 + 1] = 90; G.col[i * 4 + 2] = 90; G.col[i * 4 + 3] = 255; }
  const spr = (w, h, col, z) => { const s = new GBuf(w, h); for (let i = 0; i < w * h; i++) { s.col[i * 4] = col[0]; s.col[i * 4 + 1] = col[1]; s.col[i * 4 + 2] = col[2]; s.col[i * 4 + 3] = 255; s.z[i] = z; } return s; };
  // a lamp in front of the shop (not a building), then the snapshot, then the shop (rows 10..30) and the tower over all
  const lamp = spr(2, 6, [250, 240, 100], 30); compositeDepth(G, lamp, 30, 22, 0);
  const under = G.col.slice(), uz = G.z.slice(), bid = new Uint8Array(W * H);
  const shop = spr(20, 26, [200, 60, 40], 12), tower = spr(40, 60, [60, 60, 70], 200);
  compositeDepth(G, shop, 20, 4, 0, bid, 1); compositeDepth(G, tower, 10, 0, 0, bid, 2);
  const n = underKeep(under, uz, bid, W, H, [[shop, 20, 4, 0, 1, [20, 14, 40, 30]], [tower, 10, 0, 0, 2, [10, 40, 50, 60]]]);
  const at = (x, y) => [...under.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];
  assert.ok(n > 200, `the shop's footprint part kept (${n} px)`);
  assert.deepEqual(at(25, 20), [200, 60, 40], 'under the tower, inside the shop\'s footprint: the shop');
  assert.deepEqual(at(25, 8), [90, 90, 90], 'the shop\'s picture north of its footprint: the ground, as it fades by itself');
  assert.deepEqual(at(30, 24), [250, 240, 100], 'what stood in front of it and taller stays in front');
  assert.deepEqual(at(15, 20), [90, 90, 90], 'beside the shop: the street');
  assert.deepEqual(at(25, 50), [90, 90, 90], 'the tower\'s own footprint: nothing of it in the under layer (it is on top there, and stays)');
  // the bake calls it
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../client/art2/game/chunkbake.js', import.meta.url), 'utf8'), /underKeep\(under, uz, bid, CHUNK, CHUNK, kept\)/);
});
