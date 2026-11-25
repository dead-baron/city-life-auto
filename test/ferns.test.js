// The fern kit (client/art2/ferns.js; the redwood overhaul, 2026-11-24 - the owner: "I'd really love to improve the
// ferns and make a lot of variety of ferns"). Nine kinds of fern (eleven entries with the small sword fern and the
// bracken gone gold), each made at the art pixel, each seed its own plant, each kind a build of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FERNS, fernArt } from '../client/art2/ferns.js';
import { F_LEAF } from '../client/art2/gbuf.js';

const box = (G) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { n, w: x1 - x0 + 1, h: y1 - y0 + 1, x0, x1, y0, y1 }; };
const sig = (G) => { let h = 0; for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3]) h = (Math.imul(h, 31) + i) | 0; return h; };
const seeds = Array.from({ length: 12 }, (_, v) => 1000 + v * 37);

test('the kit: nine kinds and more, each drawn at the art pixel, standing on its foot inside its picture', () => {
  const names = Object.keys(FERNS);
  assert.ok(names.length >= 11, `kinds (${names.length})`);
  for (const k of names) for (const s of seeds) {
    const G = fernArt(k, s), b = box(G);
    assert.equal(G.ap2, 2, `${k}: at the art pixel`);
    assert.ok(b.n >= 60, `${k} ${s}: it draws (${b.n} px)`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= G.w - 2 && b.y1 <= G.h - 2, `${k} ${s}: cut by its canvas (${b.x0}, ${b.y0} .. ${b.x1}, ${b.y1} of ${G.w} x ${G.h})`);
    const ax = G.ax / 2, ay = G.ay / 2;
    assert.ok(ax > b.x0 && ax < b.x1 && ay > b.y0 && ay <= b.y1 + 6, `${k} ${s}: its foot (${ax}, ${ay}) under the plant`);
    // the one outline rule: a dark tone of the neighbouring colour, never black
    let black = 0, leaf = 0;
    for (let i = 0; i < G.w * G.h; i++) { if (!G.col[i * 4 + 3]) continue; if (G.col[i * 4] < 14 && G.col[i * 4 + 1] < 14 && G.col[i * 4 + 2] < 14) black++; if (G.flag[i] & F_LEAF) leaf++; }
    assert.equal(black, 0, `${k} ${s}: ${black} black pixels`);
    assert.ok(leaf / b.n > 0.35, `${k} ${s}: mostly leaf (${leaf} of ${b.n})`);
  }
});

test('variety: twelve seeds give twelve plants of a kind, differing in build', () => {
  for (const k of Object.keys(FERNS)) {
    const Gs = seeds.map((s) => fernArt(k, s)), sigs = new Set(Gs.map(sig)), bs = Gs.map(box);
    assert.equal(sigs.size, 12, `${k}: ${sigs.size} different pictures of 12`);
    const ws = bs.map((b) => b.w), hs = bs.map((b) => b.h), ns = bs.map((b) => b.n);
    assert.ok(Math.max(...ws) - Math.min(...ws) >= 3 || Math.max(...hs) - Math.min(...hs) >= 3, `${k}: its plants all one size (${Math.min(...ws)}-${Math.max(...ws)} x ${Math.min(...hs)}-${Math.max(...hs)})`);
    assert.ok(Math.max(...ns) / Math.min(...ns) >= 1.12, `${k}: as full every time (${Math.min(...ns)}-${Math.max(...ns)} px)`);
  }
});

test('each kind is a build of its own: tall or flat, big or small, its own green', () => {
  const mean = (k, f) => seeds.reduce((a, s) => a + f(fernArt(k, s)), 0) / seeds.length;
  const asp = (k) => mean(k, (G) => { const b = box(G); return b.h / b.w; }), wide = (k) => mean(k, (G) => box(G).w * 2);
  assert.ok(asp('lady') > asp('sword') * 1.15, `the lady fern stands taller than the sword fern (${asp('lady').toFixed(2)} against ${asp('sword').toFixed(2)})`);
  assert.ok(asp('fiddle') > asp('sword') * 1.2, 'fiddleheads stand up');
  assert.ok(wide('chain') > wide('sword') * 1.25 && wide('clump') > wide('sword') * 1.25, `the chain fern and the clump are the big ones (${wide('chain') | 0}, ${wide('clump') | 0} against ${wide('sword') | 0} px)`);
  assert.ok(wide('swordS') < wide('sword') * 0.8 && wide('licorice') < wide('sword') * 0.8, 'the small sword fern and the licorice fern are the small ones');
  // gold bracken is gold: more red than green on the whole; the green ferns the other way
  const rg = (k) => mean(k, (G) => { let r = 0, g = 0; for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3] && (G.flag[i] & F_LEAF)) { r += G.col[i * 4]; g += G.col[i * 4 + 1]; } return r / g; });
  assert.ok(rg('brackenGold') > 1.05, `gold bracken (${rg('brackenGold').toFixed(2)})`);
  for (const k of ['sword', 'lady', 'maidenhair', 'bracken', 'deer', 'chain', 'fiddle']) assert.ok(rg(k) < 0.9, `${k} is green (${rg(k).toFixed(2)})`);
  // the maidenhair's stems are dark and thin: non-leaf pixels in it, none in a sword fern beyond its outline
  const stem = (k) => mean(k, (G) => { let n = 0; for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3] === 255 && !(G.flag[i] & F_LEAF) && G.col[i * 4 + 1] < 60) n++; return n; });
  assert.ok(stem('maidenhair') > 20, `maidenhair's black stems (${stem('maidenhair') | 0} px)`);
});
