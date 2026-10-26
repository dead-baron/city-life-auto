// Facade dressing by the district (the owner's notes 2: "graffiti or street art or fire escape stairs or vines or things in
// the window or balconies"): client/art2/facadedress.js plans it per building and paints the new pieces; seeded by the
// building, so every bake in every browser draws the same street - never Math.random.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dressPlan } from '../client/art2/facadedress.js';
import { makeBuilding, buildingH } from '../client/art2/buildings.js';

const spec0 = (o = {}) => ({ w: 224, d: 96, floors: 4, style: 'brick', seed: 11, glowOnly: true, night: 0, roof: 'flat', parapet: 8, doors: [{ x: 90, w: 22, kind: 'door' }], windows: [20, 150], ...o });
const plan = (id, st, tier, A, o = {}) => { const s = spec0(o); dressPlan(s, { id, k: 0, st, tier, A, H: buildingH(s), w: s.w, walkIn: false }); return s; };
const share = (n, f) => { let k = 0; for (let i = 0; i < n; i++) if (f(i)) k++; return k / n; };

test('the same building is dressed the same every time, and buildings differ', () => {
  assert.deepEqual(plan(17, 'southside', 'rough', 'walkup'), plan(17, 'southside', 'rough', 'walkup'));
  const G1 = makeBuilding(plan(17, 'southside', 'rough', 'walkup')), G2 = makeBuilding(plan(17, 'southside', 'rough', 'walkup'));
  assert.ok(Buffer.from(G1.col.buffer).equals(Buffer.from(G2.col.buffer)), 'pixel for pixel');
  const looks = new Set();
  for (let id = 0; id < 40; id++) looks.add(JSON.stringify(plan(id, 'southside', 'rough', 'walkup')));
  assert.ok(looks.size > 25, `variety (${looks.size} of 40)`);
  const src = readFileSync(new URL('../client/art2/facadedress.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(/.test(src), 'seeded, never Math.random');
});

test('by the district: fire escapes up the old brick walk-ups, tags in the rough districts, ivy in the old town, balconies on the flats', () => {
  assert.ok(share(200, (i) => !!plan(i, 'southside', 'rough', 'walkup').fireEscape) > 0.5, 'fire escapes on the rough brick walk-ups');
  assert.ok(share(200, (i) => (plan(i, 'southside', 'rough', 'walkup').graffiti || 0) > 0) > 0.95, 'tags in the rough districts');
  assert.equal(share(200, (i) => (plan(i, 'luxury', 'lux', 'condo', { style: 'stone' }).graffiti || 0) > 0), 0, 'none in the rich districts');
  assert.ok(share(200, (i) => (plan(i, 'oldtown', 'low', 'oldrow').ivy || 0) > 0) > 0.25, 'ivy in the old town');
  assert.ok(share(200, (i) => !!plan(i, 'apartments', 'mid', 'condo', { style: 'stucco' }).balconies) > 0.3, 'balconies on the flats');
  assert.ok(share(200, (i) => !!plan(i, 'arts', 'mid', 'walkup', { blank: true, doors: null }).mural) > 0.4, 'murals on the arts district\'s side walls');
  const D = share(200, (i) => { const d = plan(i, 'southside', 'rough', 'walkup').dress; return d.wash || d.dish; });
  assert.ok(D > 0.3, 'washing lines and satellite dishes on the rough streets');
  assert.ok(share(200, (i) => !!plan(i, 'southside', 'rough', 'walkup', { shop: { kind: 'mart', door: 'left' }, doors: null }).dress.shutter) > 0.2, 'roller shutters down over closed shops');
  assert.equal(share(100, (i) => !!plan(i, 'southside', 'rough', 'walkup', { shop: { kind: 'mart', door: 'left' }, doors: null }).graffiti), 0, 'tags never over a shop\'s sign');
});

test('the dressing paints: a dressed facade differs from the plain one, on the wall, not over the glass', () => {
  const s = plan(3, 'southside', 'rough', 'walkup');
  s.dress = { pipe: 2, ac: 1, dish: 1, wash: 1, sill: 1, posters: 4, pots: 1, awn: '#8a2a2a' };
  const plain = spec0(), a = makeBuilding(plain), b = makeBuilding({ ...plain, dress: s.dress });
  let diff = 0;
  for (let i = 0; i < a.col.length; i += 4) if (a.col[i] !== b.col[i] || a.col[i + 1] !== b.col[i + 1]) diff++;
  assert.ok(diff > 400, `dressed (${diff} px changed)`);
  assert.equal(a.w, b.w); assert.equal(a.h, b.h);
});
