// A shop's sign names what's behind it (shared/world3-signfix.js; the audit's frontNames): an old sign left over a clinic
// takes the clinic's name, a CLINIC board over a donut shop the shop's; a sign that names its place, an airport's
// DEPARTURES, a RENTALS board stay. The whole world's count: test/placementlint.test.js (frontNames 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { frontNames3, signWrong } from '../shared/world3-signfix.js';

const bld = (id, sign, signs = []) => ({ id, tx: 10 * id, ty: 0, tw: 6, th: 4, name: 'Building', art: { shop: { sign: { text: sign } } }, signs });
const poi = (b, kind, label) => ({ b: b.id, kind, label, x: (b.tx + 3) * TILE, y: 4 * TILE });

test('the wrong signs renamed after their places; the right ones left', () => {
  const a = bld(1, 'FRAME & MAT'), b = bld(2, 'SUNRISE DONUTS', [{ x: 23 * TILE, text: 'HILLS ANIMAL CLINIC' }]), c = bld(3, 'DEPARTURES ARRIVALS'), d = bld(4, 'MARIO PIZZA', [{ x: 43 * TILE, text: 'RENTALS' }]);
  const m = { buildings: [null, a, b, c, d], pois: [poi(a, 'hospital', 'Arts District Clinic'), poi(b, 'coffee', 'Sunrise Donuts'), poi(c, 'airport', 'Westport International'), poi(d, 'coffee', 'Mario Pizza')] };
  assert.equal(frontNames3(m), 2);
  assert.equal(a.art.shop.sign.text, 'ARTS DISTRICT CLINIC');
  assert.equal(b.signs[0].text, 'SUNRISE DONUTS');
  assert.equal(c.art.shop.sign.text, 'DEPARTURES ARRIVALS', 'an airport\'s own signs');
  assert.equal(d.signs[0].text, 'RENTALS', 'a board that names no trade');
  assert.equal(signWrong('MARIO PIZZA', [m.pois[3]], d), null);
});
