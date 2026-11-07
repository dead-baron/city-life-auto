// Under a bridge's deck (the owner's 11-06 report: swimming under a bridge, "the player shows through the deck's
// center" - its median - and "blood from a hit in the water is drawn on top of the bridge deck").
//   - the deck hides what is under it: every pixel of a highway bridge's deck over the water - the median too - stands
//     tall enough that a swimmer or a boat held under it (host.js o.under: UNDER_Z) and the blood clouding the water
//     under it (waterlife.js FISH_Z) are drawn under it; blood from a fight up on the deck still lands on its top
//     (the median was baked at 2-4 px, the deck at 6: groundbake.js markings)
//   - blood from someone afloat under the deck goes into the water, not onto the deck's top, and nothing else lands
//     there (render/fx.js decal, main.js fx.water: 2 under a deck); with nobody under it, blood on the deck is a stain
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCity } from '../shared/map.js';
import { T, TILE } from '../shared/constants.js';
import { bakeGround } from '../client/art2/game/groundbake.js';
import { F_GROUND } from '../client/art2/gbuf.js';
import { FX, afloatUnder } from '../client/render/fx.js';

const num = (file, name) => +new RegExp(`\\b${name} = (-?[\\d.]+)`).exec(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))[1];
const GSINK = num('client/art2/game/engine.js', 'GSINK'), DECAL_H = num('client/art2/game/engine.js', 'DECAL_H');
const UNDER_Z = num('client/art2/game/host.js', 'UNDER_Z'), FISH_Z = num('client/art2/game/waterlife.js', 'FISH_Z');

test('a highway bridge\'s deck, its median too, hides a swimmer and the blood in the water under it', () => {
  const m = generateCity(1337), CH = 768;
  // a highway bridge with a median: an edge of kind hwy whose middle is a bridge tile with bridge all round it
  const inner = (tx, ty) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!m.inside(tx + i, ty + j) || m.tiles[m.idx(tx + i, ty + j)] !== T.BRIDGE) return false; return true; };
  let at = null;
  for (const e of m.edges) {
    if (e.kind !== 'hwy' || !(e.median > 8)) continue;
    for (let k = 1; k < e.pts.length && !at; k++) {
      const a = e.pts[k - 1], b = e.pts[k], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 32);
      for (let j = 1; j < n && !at; j++) { const x = a.x + (b.x - a.x) * j / n, y = a.y + (b.y - a.y) * j / n; if (inner(Math.floor(x / TILE), Math.floor(y / TILE))) at = [x, y]; }
    }
    if (at) break;
  }
  assert.ok(at, 'a highway bridge with a median');
  const cx = Math.floor(at[0] / CH), cy = Math.floor(at[1] / CH), G = bakeGround(m, cx, cy, { quality: 2 });
  let n = 0, low = 0, minZ = 1e9;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const i = y * CH + x;
    if (!(G.flag[i] & F_GROUND) || !G.col[i * 4 + 3]) continue;
    const z = G.z[i], X = cx * CH + x, Y = cy * CH + y + z;   // (screen y = Y - Z)
    if (!inner(Math.floor(X / TILE), Math.floor(Y / TILE))) continue;
    n++; minZ = Math.min(minZ, z);
    if (z - GSINK <= UNDER_Z) low++;
  }
  assert.ok(n > 2000, `the deck's pixels (${n})`);
  assert.equal(low, 0, `${low} of the deck's ${n} pixels let a swimmer under it through (lowest ${minZ} px)`);
  assert.ok(minZ - GSINK > DECAL_H + FISH_Z, 'the blood in the water under it is under the deck');
  assert.ok(DECAL_H > minZ - GSINK, 'a stain from a fight up on the deck lands on its top');
});

test('blood from someone afloat under a deck clouds the water under it; up on the deck it stains the deck', () => {
  const BR = { x0: 0, x1: 320 };   // a deck from x 0 to 320 px, water either side
  const tile = (x) => (x >= BR.x0 && x < BR.x1 ? T.BRIDGE : T.WATER);
  const ents = [];
  const fx = new FX();
  fx.water = (x, y) => (tile(x) === T.WATER ? 1 : afloatUnder(ents, x, y, (e) => !!e.swim) ? 2 : 0);
  const stains = () => fx.d.filter((d) => d.on).length, clouds = () => (fx.bc || []).filter((o) => o && o.on).length;
  // a fight on the deck: nobody in the water near - a stain on the deck
  ents.push({ rx: 160, ry: 100, swim: false });
  fx.blood(160, 100, 0, 6, 0, () => 0.5);
  assert.equal(stains(), 1); assert.equal(clouds(), 0);
  // a swimmer hit under the deck: a cloud in the water (drawn under the deck), no stain on its top
  ents.length = 0; ents.push({ rx: 160, ry: 400, swim: true });
  fx.blood(160, 400, 0, 6, 0, () => 0.5);
  fx.bulletHit(160, 400, 1, 0, () => 0.5);
  fx.drip(160, 400, 0, () => 0.5);
  assert.equal(stains(), 1, 'nothing new on the deck');
  assert.ok(clouds() >= 3, `clouds in the water (${clouds()})`);
  // and nothing else lands on the deck from under it (a scorch from a boat burning under the bridge)
  fx.decal(3, 160, 400, 0, 12, '#111', 0, 0.7);
  assert.equal(stains(), 1);
});
