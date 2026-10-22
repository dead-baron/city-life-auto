// Art v2 aircraft (client/art2/aircraft.js, H66): the block models build - the four helicopters and the light plane at
// each bank, the rotor's blades and its blurred disc - and render to sprites at a heading; the searchlight's spot decodes
// from the wire; the module stays out of the page's and the renderer's code (loaded the first time an aircraft is near).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const AM = await import('../client/art2/aircraft.js');
const { lightByte } = await import('../server/systems/policeair.js');

const solid = (m) => { let n = 0; for (let i = 0; i < m.v.length; i++) if (m.v[i]) n++; return n; };

test('the helicopters and the plane build as block models, the plane banking', () => {
  for (const t of ['heli', 'policeheli', 'rescueheli', 'gunship']) {
    const m = AM.bodyModel(t);
    assert.ok(solid(m) > 20000, `${t}: a body (${solid(m)} voxels)`);
  }
  const level = AM.bodyModel('plane', { bank: 0 }), banked = AM.bodyModel('plane', { bank: 0.6 });
  assert.ok(solid(level) > 10000, 'the plane');
  // banked right: the right wing tip (+y) lower than the left
  const top = (m, y) => { for (let z = m.h - 1; z >= 0; z--) for (let x = 0; x < m.w; x++) if (m.get(x, y, z)) return z; return -1; };
  const tips = (m) => { let lo = m.d, hi = -1; for (let y = 0; y < m.d; y++) for (let z = 0; z < m.h && (y < lo || y > hi); z++) for (let x = 0; x < m.w; x++) if (m.get(x, y, z)) { lo = Math.min(lo, y); hi = Math.max(hi, y); break; } return [lo + 2, hi - 2]; };
  const [l0, r0] = tips(level), [l1, r1] = tips(banked);
  assert.equal(top(level, l0), top(level, r0), 'level: the tips at one height');
  assert.ok(top(banked, l1) > top(banked, r1) + 20, 'banked right: the right wing down, the left up');
  // the whole plane rolls, not the wings alone (the owner, 10-16: "Plane wings tilt without the body: bank them
  // together"): the fin, standing up off the fuselage at the tail, leans over with it
  const fin = (m) => { let fz = -1, fy = 0; for (let z = 0; z < m.h; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < 14; x++) if (m.get(x, y, z) && z > fz) { fz = z; fy = y; } return fy - m.d / 2; };
  assert.ok(Math.abs(fin(level)) <= 2, `level: the fin upright (${fin(level)})`);
  assert.ok(fin(banked) > 8 && fin(AM.bodyModel('plane', { bank: -0.6 })) < -8, `banked: the fin leans over with the wings (${fin(banked)})`);
  assert.ok(r1 - l1 < r0 - l0 - 10, 'banked: the wings seen foreshortened from above, as they turn');
});

test('they render to sprites at a heading; the rotor\'s blades and its disc', () => {
  const g = AM.bodySprite('policeheli', 3, 32, 2, 2);
  assert.ok(g.w > 20 && g.h > 20, `a sprite (${g.w}x${g.h})`);
  let lit = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) lit++;
  assert.ok(lit > 300, `drawn (${lit} px)`);
  const b = AM.rotorSprite(76, false, '#e8402e', 2, 32, 2), d = AM.rotorSprite(76, true, '#e8402e', 0, 32, 2);
  assert.ok(b.w >= 60 && d.w >= 70, `the rotor across its span (${b.w}, ${d.w}: 76 px a blade, 2 px a pixel)`);
  const p = AM.bodySprite('plane', 0, 32, 4, 2);
  assert.ok(p.w > 40, 'the plane');
});

test('the searchlight\'s spot from the wire', () => {
  const v = { rx: 1000, ry: 500, parent: (lightByte(150, -110) << 24) >>> 0 };
  const q = AM.spotOf(v, 10);
  assert.ok(Math.hypot(q.x - 1150, q.y - 390) < 60, `near the suspect (${Math.round(q.x)}, ${Math.round(q.y)})`);
  assert.equal(AM.spotOf({ rx: 0, ry: 0, parent: 5 }), null, 'off');
});

test('loaded lazily: neither the page nor the renderer imports it statically', () => {
  const host = readFileSync(new URL('../client/art2/game/host.js', import.meta.url), 'utf8'), main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.ok(!/^import[^;]*art2\/aircraft\.js/m.test(main) && !/^import[^;]*\.\.\/aircraft\.js/m.test(host), 'no static import');
  assert.ok(/import\('\.\.\/aircraft\.js'\)/.test(host), 'the host loads it when an aircraft is near');
});

test('in the game a model is made over frames, a stage a frame - the overlay stands in until it is ready (H69: the first one\'s hitch)', async () => {
  const frame = () => new Promise((r) => setTimeout(r, 30));
  const got = [];
  for (let i = 0; i < 6 && !got.at(-1); i++) { got.push(AM.bodySprite('rescueheli', 5, 32, 2, 2, true)); got.push(AM.bodySprite('rescueheli', 5, 32, 2, 2, true)); await frame(); }
  const firstAt = got.findIndex((g) => g);
  assert.ok(firstAt >= 4, `not at once: three stages first (ready at call ${firstAt})`);
  for (let i = 1; i < firstAt; i += 2) assert.equal(got[i], null, 'one stage a frame: the second call in a frame waits');
  assert.ok(got[firstAt].w > 10 && got[firstAt].h > 10, 'then the sprite');
  assert.ok(AM.bodySprite('rescueheli', 9, 32, 2, 2, true), 'its other headings straight away (the model is kept)');
});
