// The muzzle flash at the barrel's end (the owner, 11-23: "gun shot flashes aren't coming from the barrel of the gun, they
// are coming from the middle of my character"): client/main.js MUZZLE - how far out along the aim and how high the flash
// and tracer start, by how the gun is held - matches where the people renderer's aiming pose puts the barrel's end
// (client/art2/people.js, the held item's farthest pixel facing east), within a few pixels; the flash is drawn at that
// height (client/art2/game/host.js f.z).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { person, setPolish } from '../client/art2/people.js';
import { POLISH } from '../client/art2/peoplepolish.js';
import * as LK from '../shared/look.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const M = JSON.parse(src('client/main.js').match(/const MUZZLE = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":'));

test('the flash starts at the barrel: MUZZLE matches the aiming pose, and the flash is drawn at its height', () => {
  const L = LK.emptyLook('m'); L.hair.style = 2; L.outfit.top = LK.item('Plain tee'); L.outfit.bottoms = LK.item('Jeans'); L.outfit.shoes = LK.item('Sneakers');
  const A = LK.lookArt(LK.validLook(L));
  setPolish(POLISH);
  try {
    for (const [held, k] of [['pistol', 'hand'], ['rifle', 'long'], ['shotgun', 'long'], ['rocketLauncher', 'tube']]) {
      const g = person(A, 2, 'aim', 0, { held, info: 1, tight: true });   // (facing east)
      let tip = null;
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.info.grp[y * g.w + x] === 11 && (!tip || x > tip.x)) tip = { x, y };
      assert.ok(tip, `${held}: drawn`);
      const reach = tip.x - g.ax, up = g.ay - tip.y, [r, z] = M[k];
      assert.ok(Math.abs(reach - r) <= 6 && Math.abs(up - z) <= 6, `${held}: the barrel's end ${reach} out, ${up} up; MUZZLE.${k} [${r}, ${z}]`);
    }
  } finally { setPolish(null); }
  assert.match(src('client/main.js'), /S\.flashes\.push\(\{ x: x1, y: y1, z: win \? 18 : mz\[1\]/, 'the flash at that height');
  assert.match(src('client/art2/game/host.js'), /this\.E\.drawSprite\(k, f\.x, f\.y, f\.z \?\? 18, o\)/, 'drawn there');
});
