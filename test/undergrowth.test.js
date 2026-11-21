// The undergrowth and what stands in it (client/art2/game/statics.js addGreenery, coverItems): the wild's ferns, drifts
// and tufts and the towns' beds are made per tile on the page, round the map's props. One world build, as the server
// builds it.
//  - Nothing grows through a fence (the owner, 2026-11-21: plants "across sidewalks or through fences" - the lupines
//    through a pasture's rail fence). A fence is a line, and only its first tile was kept clear. Every fence, wall and
//    hedge line is laid by fenceLine, which hands each piece to the greenery.
//  - A rock never stands alone on bare ground (concepts NR1-A, NS1-B): a wild boulder and a fallen log keep only their
//    own tiles clear, loose stones lie at a rock's foot, ferns and mushrooms along a log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { TILE } from '../shared/constants.js';
import { staticItems, STATIC_CHUNK } from '../client/art2/game/statics.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const CH = STATIC_CHUNK;

// a fence piece in a chunk's list: its line on the ground (fenceLine's keys: fk:rail:<len>:<ns>, fn:<kind>:<len>:<ns>:..,
// cw:<len>, hg:<len>:<ns>)
const lineOf = (it) => {
  const m = /^(?:fk:rail|fn:[a-z]+):(\d+):([01])/.exec(it.key) || /^hg:(\d+):([01])/.exec(it.key);
  if (!m) return null;
  const l = +m[1] / 2, ns = m[2] === '1';
  return ns ? [it.x, it.y - l, it.x, it.y + l] : [it.x - l, it.y, it.x + l, it.y];
};
const tilesOf = ([x0, y0, x1, y1], into) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
  for (let j = 0; j <= n; j++) into.add(Math.floor((x0 + (x1 - x0) * j / n) / TILE) + ',' + Math.floor((y0 + (y1 - y0) * j / n) / TILE));
};
// what the greenery grows by rule (the wild's undergrowth, the towns' drifts, the parks' beds): statics.js marks it.
// A tree a hand or the map set beside a wall is that placer's business (the placement lint's rows).
const isCover = (it) => it.cv === 1;

test('no undergrowth, drift or bed stands in a tile a fence runs through: pastures, farms, yards', () => {
  // where the fences are: the pastures and farms of the countryside, and the fences the map itself carries
  const spots = [];
  for (const s of M.natureSites || []) if (/pasture|farm|ranch|orchard|vineyard|camp/.test(s.k || '')) spots.push([s.x, s.y]);
  let n = 0;
  for (const p of M.props) if (p && (p.t === 'fenceline' || p.t === 'yfence' || p.t === 'chainfence') && n++ % 40 === 0) spots.push([p.x, p.y]);
  assert.ok(spots.length > 20, `places with fences to look at (${spots.length})`);
  const seen = new Set();
  let fences = 0, cover = 0;
  const bad = [];
  for (const [sx, sy] of spots.slice(0, 160)) {
    const cx0 = Math.floor(sx / CH), cy0 = Math.floor(sy / CH);
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      const k = cx + ',' + cy;
      if (seen.has(k)) continue;
      seen.add(k);
      const items = staticItems(M, cx, cy), on = new Set();
      for (const it of items) { const L = lineOf(it); if (L) { tilesOf(L, on); fences++; } }
      if (!on.size) continue;
      for (const it of items) {
        if (!isCover(it)) continue;
        cover++;
        if (on.has(Math.floor(it.x / TILE) + ',' + Math.floor(it.y / TILE))) bad.push(`${it.recipe.sp} at tile ${Math.floor(it.x / TILE)},${Math.floor(it.y / TILE)}`);
      }
    }
  }
  assert.ok(fences > 200, `fence pieces looked at (${fences})`);
  assert.ok(cover > 500, `plants looked at beside them (${cover})`);
  assert.equal(bad.length, 0, `${bad.length} of ${cover} plants in a fence's own tiles: ${bad.slice(0, 12).join('; ')}`);
});

test('a wild rock does not stand alone, nor a fallen log: stones and undergrowth at their feet', () => {
  const near = (items, p, r) => items.filter((it) => isCover(it) && Math.abs(it.x - p.x) < r && Math.abs(it.y - p.y) < r);
  const look = (t, every, wild) => {
    const out = [];
    let n = 0;
    M.props.forEach((p, pi) => {
      if (!p || p.t !== t || n++ % every || out.length >= 150) return;
      const items = staticItems(M, Math.floor(p.x / CH), Math.floor(p.y / CH)), own = items.find((it) => it.pi === pi);
      if (!own || (wild && !/^rk:/.test(own.key))) return;   // (rk: a wild rock; a town's boulder is the town's)
      out.push(near(items, p, 72));
    });
    return out;
  };
  const rocks = look('boulder', 23, true), logs = look('log', 5, false);
  assert.ok(rocks.length >= 60, `wild rocks looked at (${rocks.length})`);
  const share = (L, f) => L.filter(f).length / L.length;
  const withAny = share(rocks, (q) => q.length > 0), withStones = share(rocks, (q) => q.some((it) => /^stones/.test(it.recipe.sp)));
  assert.ok(withAny > 0.6, `rocks with something at the foot: ${(withAny * 100).toFixed(0)}%`);
  assert.ok(withStones > 0.3, `rocks with loose stones beside them: ${(withStones * 100).toFixed(0)}%`);
  if (logs.length >= 20) {
    const by = share(logs, (q) => q.length > 0), shrooms = share(logs, (q) => q.some((it) => it.recipe.sp === 'toadstools'));
    assert.ok(by > 0.6, `logs with undergrowth along them: ${(by * 100).toFixed(0)}%`);
    assert.ok(shrooms > 0.15, `logs with mushrooms: ${(shrooms * 100).toFixed(0)}%`);
  }
  console.log(`# rocks ${rocks.length}: any ${(withAny * 100).toFixed(0)}%, stones ${(withStones * 100).toFixed(0)}%; logs ${logs.length}`);
});
