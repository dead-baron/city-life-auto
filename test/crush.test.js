// Crops flattened (the owner, 10-06 / 10-15: "crops ... part round people and flatten under tyres"): on the art v2
// page a vehicle rolling through a field leaves a swath of flattened crop under each rear wheel and someone walking
// through one a trodden track (client/main.js vehVisual / pedVisual -> render/fx.js crush, drawn by
// client/art2/game/host.js _decals from client/art2/fx.js dCrush). The marks keep a ring of their own, so a tractor
// working a field never pushes the blood and the skid marks out of the decals'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX } from '../client/render/fx.js';
import { fxFrames } from '../client/art2/fx.js';
import { FX_FOR_V1, fxKey } from '../client/art2/game/actors.js';

test('the crush marks: a wheel swath and a trodden track at eight angles, pale straw and dark creases, see-through', () => {
  const fr = fxFrames('dCrush');
  assert.equal(fr.length, 16);
  const px = (g) => { let n = 0, a = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) { n++; a += g.col[i]; } return [n, n ? a / n : 0]; };
  for (let k = 0; k < 8; k++) {
    const [nb, ab] = px(fr[k]), [ns] = px(fr[8 + k]);
    assert.ok(nb > 40 && ns > 10 && nb > ns * 2, `angle ${k}: the swath (${nb} px) wider and longer than the track (${ns} px)`);
    assert.ok(ab < 200, 'see-through: the crop shows under it');
  }
  // straw: warm and pale, with darker creases
  const g = fr[0];
  let pale = 0, dark = 0;
  for (let i = 0; i < g.col.length; i += 4) if (g.col[i + 3]) { if (g.col[i] > 170 && g.col[i] > g.col[i + 2] + 40) pale++; else if (g.col[i] < 110) dark++; }
  assert.ok(pale > 10 && dark > 5, `pale stalks (${pale}) and creases (${dark})`);
  assert.equal(FX_FOR_V1.decal[7].name, 'dCrush');
  assert.ok(fxKey('dCrush', 3).includes('dCrush'));
});

test('their own ring: a field of marks never pushes the decals out', () => {
  const fx = new FX();
  fx.decal(1, 10, 10, 0, 6, '#7a0d12', 0, 0.9);
  for (let i = 0; i < 2000; i++) fx.crush(i * 12, 50, 0.3, i & 1, 1, 0.8);
  assert.ok(fx.d.some((d) => d.on && d.type === 1), 'the blood still there');
  const on = fx.c.filter((c) => c.on);
  assert.ok(on.length > 500 && on.every((c) => c.small === 0 || c.small === 1), `${on.length} marks kept`);
  assert.ok(on.some((c) => c.x === 1999 * 12), 'the newest kept, the oldest gone first');
});
