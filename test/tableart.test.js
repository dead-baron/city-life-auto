// The games on the tables as art (11-27; the owner, 11-17, of the Rusty Spur: "Pool balls look like placeholders -
// redraw as SNES pixel balls (numbers, stripes, shading, a cue ball)", the shot's banner "covers the table", and the
// balls and cards "float over the scene instead of sitting on the table: draw them in the table's own world space ...
// under people's heads / over the felt, not as a screen overlay").
//   client/pool.js       ballPixels: the frame's balls, pixel by pixel, each with its number
//   client/poolview.js   ballG, scene: a bar's table's balls as sprites in the art v2 scene (host.js tableSpr)
//   client/casinoview.js Pieces, scene: the cards, chips, wheels and reels the same way
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, feltPt } from '../shared/pool.js';
import { ART_PX } from '../client/art2/gbuf.js';

const { _test: PT } = await import('../client/pool.js');
const { PoolView, ballG, BALL_Z } = await import('../client/poolview.js');
const { Pieces, pieceCol, CasinoView } = await import('../client/casinoview.js');

const key = (px) => px.map(([x, y, c]) => `${x},${y}:${c.join('.')}`).join(' ');
const at = (px, x, y) => { let c = null; for (const q of px) if (q[0] === x && q[1] === y) c = q[2]; return c; };   // (the last put wins, as on the canvas)
const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

test('the frame\'s balls: sixteen pixel balls, each its own, 9 px across, lit from the top left, numbered', () => {
  const seen = new Set();
  for (let n = 0; n <= 15; n++) {
    const px = PT.ballPixels(n, true), xs = px.map((q) => q[0]), ys = px.map((q) => q[1]);
    assert.equal(Math.min(...xs), 1, `ball ${n}`); assert.equal(Math.max(...xs), 9); assert.equal(Math.min(...ys), 1); assert.equal(Math.max(...ys), 9);
    assert.ok(!seen.has(key(px)), `ball ${n} is drawn as another is`); seen.add(key(px));
    assert.ok(lum(at(px, 2, 4)) > lum(at(px, 8, 6)) + 12, `ball ${n}: lit from the top left (${lum(at(px, 2, 4)) | 0} / ${lum(at(px, 8, 6)) | 0})`);
    assert.deepEqual(at(px, 3, 2), [255, 255, 250], `ball ${n}: the glint`);
    const down = PT.ballPixels(n, false);
    assert.notEqual(key(down), key(px), `ball ${n}: face down is another picture (a rolling ball turns)`);
    if (n === 0) continue;
    // its number: pixels the face-down ball doesn't have, at least a digit's worth, in the middle
    let ink = 0; for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) if (at(px, x, y).join() !== at(down, x, y).join()) ink++;
    assert.ok(ink >= 5, `ball ${n}: a number on it (${ink} px)`);
  }
  // a solid: the number dark in a white spot; a stripe: white caps over and under a band of its colour
  const three = PT.ballPixels(3), eleven = PT.ballPixels(11);
  assert.ok(lum(at(three, 3, 5)) > 200, 'a solid\'s white spot');
  { const top = at(eleven, 5, 1), bot = at(eleven, 5, 9); assert.ok(lum(top) > 170 && Math.abs(top[0] - top[2]) < 45 && lum(bot) > 170 && bot[2] > 120, `a stripe's white caps (${top} / ${bot})`); }
  assert.ok(at(eleven, 1, 5)[0] > at(eleven, 1, 5)[2] + 40, 'the 11\'s band is red');
  assert.ok(lum(at(PT.ballPixels(0), 5, 5)) > 190 && lum(at(PT.ballPixels(8, false), 5, 5)) < 60, 'a white cue ball, a black eight');
  assert.deepEqual(at(PT.ballPixels(0, false), 5, 5), [204, 52, 50], 'the cue ball\'s red spot, seen as it rolls');
});

test('the shot\'s words are off the table: a line in the strip under it, no banner across the felt while a frame is played', () => {
  const src = readFileSync(new URL('../client/pool.js', import.meta.url), 'utf8');
  assert.ok(!/banner\(g, W, [^)]*T\.y1/.test(src), 'no banner placed against the table\'s foot');
  assert.match(src, /function line\(g, s, col[^)]*\) \{[\s\S]{0,200}H - 9/, 'the line under the table');
});

// a host that records what it is asked to draw
const fakeHost = () => ({ calls: [], made: new Map(), tableSpr(key, make, x, y, z, tint = null, alpha = 1) { if (!this.made.has(key)) this.made.set(key, make()); this.calls.push({ key, x, y, z, tint, alpha }); return true; } });

test('a bar table\'s balls are sprites in the scene: on the felt at its height, two art pixels each, pocketed ones gone; the overlay then leaves them alone', () => {
  for (let n = 0; n <= 15; n++) {
    const G = ballG(n);
    assert.equal(G.w, 2); assert.equal(G.h, 2); assert.equal(G.ap, ART_PX); assert.equal(G.ax, 1); assert.equal(G.ay, 1);
    for (let i = 0; i < 4; i++) { assert.equal(G.col[i * 4 + 3], 255); assert.equal(G.z[i], BALL_Z); }
    assert.ok(lum(G.col.subarray(0, 3)) > lum(G.col.subarray(12, 15)) + 15, `ball ${n}: lit from the top left`);
  }
  assert.ok(lum(ballG(11).col.subarray(4, 7)) > 200 && ballG(11).col[8] > ballG(11).col[10] + 40, 'a stripe: white over its colour');
  assert.ok(lum(ballG(8).col.subarray(8, 11)) < 40 && lum(ballG(0).col.subarray(8, 11)) > 180, 'the eight black, the cue ball white');
  const B = {}, S = { map: { buildings: [B] }, ents: new Map() }, V = new PoolView(S), f = [1000, 2000, 1090, 2048, 30];
  V.event({ e: 'ptab', k: 't1', f, bi: 0, r: 1, b: [0, 60, 80, 3, 100, 60, 11, 150, 90] });
  V.tabs.get('t1').balls[1].in = true;   // (the 3 is down)
  const F = { sp: { x: 1040, y: 2060 } }, host = fakeHost();
  V.scene(host, F);
  assert.equal(host.calls.length, 0, 'nothing before the page has said which room you are in');
  let over = 0; const g = { save() {}, restore() {}, beginPath() {}, arc() { over++; }, fill() {}, fillRect() { over++; }, clip() {} };
  V.draw(g, F, { walkInAt: () => B });   // (the page's overlay: art v2 drew a moment ago - nothing from it)
  assert.equal(over, 0, 'the overlay draws no ball while the scene has them');
  V.scene(host, F);
  assert.deepEqual(host.calls.map((c) => c.key), ['pb|0', 'pb|11']);
  const p = feltPt(f, 150, 90), c = host.calls[1];
  assert.ok(Math.abs(c.x - p.x) < 1e-9 && Math.abs(c.y - p.y) < 1e-9 && c.z === 30, 'at its place on the felt, at the felt\'s height');
  assert.ok(c.x > 1000 && c.x < 1090 && c.y > 2000 && c.y < 2048 && T.x0 < 150);
  V.scene(host, { sp: { x: 0, y: 0 } }); 
  const V2 = new PoolView(S); V2.event({ e: 'ptab', k: 't1', f, bi: 0, r: 1, b: [0, 60, 80] });
  V2.draw(g, F, { walkInAt: () => B });
  assert.ok(over > 0, 'the classic view (no scene): the overlay draws them as before');
});

test('the casino\'s pieces: each little rectangle a flat piece of art pixels at its height - on a table, or in a machine\'s face', () => {
  assert.deepEqual(pieceCol('#ff8000').map((v) => +v.toFixed(3)), [1, 0.502, 0, 1]);
  assert.deepEqual(pieceCol('rgba(255,230,120,.8)').map((v) => +v.toFixed(3)), [1, 0.902, 0.471, 0.8]);
  const host = fakeHost(), g = new Pieces(host);
  g.z = 21; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(100, 200, 3, 4);
  assert.equal(host.calls.length, 0, 'the overlay\'s drop shadow is not a piece (the scene casts its own)');
  g.fillStyle = '#f4f2ea'; g.fillRect(100, 200, 3, 4);            // a card: 3 x 4 px -> 2 x 2 art pixels
  g.fillStyle = '#d02a30'; g.fillRect(101, 201, 1, 2);            // its suit, over it
  const [card, suit] = host.calls;
  assert.equal(card.key, 'tq|2|2'); assert.equal(suit.key, 'tq|1|1');
  assert.equal(card.y - card.z, 200, 'shown where the overlay drew it (the engine draws at y - z)'); assert.equal(suit.y - suit.z, 201);
  assert.ok(Math.abs(card.z - 21) < 1e-9 && suit.z > card.z && suit.z < card.z + 0.5, 'on the table, the later piece over the earlier');
  assert.equal(host.made.get('tq|2|2').w, 2); assert.equal(host.made.get('tq|2|2').ax, 0);
  // a slot machine's reel: in its face (the face's foot at world y 500), a pixel in front of it
  g.face = 500; g.fillStyle = '#f2d21b'; g.fillRect(300, 470, 2, 5);
  const reel = host.calls[2];
  assert.equal(reel.key, 'tq|1|3'); assert.equal(reel.y - reel.z, 470); assert.ok(reel.z > 500 - 470 && reel.z < 500 - 470 + 2, 'higher than the face behind it at that row');
  g.face = null; g.z = 40; g.fillStyle = 'rgba(255,230,120,.8)'; g.fillRect(296, 450, 10, 4);
  assert.equal(host.calls[3].alpha, 0.8); assert.equal(host.calls[3].key, 'tq|5|2');
  // the view: scene paints through Pieces once the page has told it the room; draw then holds off
  const V = new CasinoView({ map: { buildings: [] }, ents: new Map() });
  let painted = 0; V.paint = () => { painted++; };
  V.scene(host, {}); assert.equal(painted, 0);
  V.draw({}, {}, { walkInAt: () => null }); assert.equal(painted, 0, 'the scene ran a moment ago: the overlay holds off');
  V.scene(host, {}); assert.equal(painted, 1);
});
