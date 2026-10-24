// The see-through outline (client/art2/game/engine.js x-ray: the parts of your own sprite hidden by something taller,
// drawn over the frame) and what you ride (the owner, b1c: "Player is showing a white outline in some vehicles like boats
// or shopping cart or on trains ... we dont need that to happen in vehicles", "on a dirtbike this time"): the rider drawn
// over a bike, a cart, an open boat or a horse stood taller than it, so its outline showed through them. Nothing ridden
// in the open is x-rayed, nor its rider; your own car still shows through what hides it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, T } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';

const { World2 } = await import('../client/art2/game/host.js');
function harness(kind) {
  const def = VEHICLES[kind], drawn = [];
  const v = { id: 5, kind: K.VEH, d: { m: def.i, vr: 0 }, flags: 0, hp: 100, rx: 1000, ry: 1000, ra: 0, buf: [{ x: 1000, y: 1000 }], extra: 0 };
  const rider = { id: 7, kind: K.PED, parent: 5, d: { app: {} }, flags: 0, extra: 0 };
  const h = Object.create(World2.prototype);
  Object.assign(h, {
    E: { hasSprite: () => true, drawSprite: (key, x, y, z, o) => { drawn.push({ key, xray: !!o.xray }); return true; } },
    A: { vehicleKey: () => 'veh', vehState: () => ({}), animalKey: (k, p) => `animal|${p}`, ANIMAL_FRAMES: { idle: 1, walk: 4, run: 4, graze: 2 }, wakeKey: () => 'wake' },
    Pd: { pedKey: () => 'rider' }, tier: { N: 16 }, map: { tileAtPx: () => T.ROAD },
    api: { SEAT_BIKE: [[0, 0], [-12, 0]], pedPose: () => 'ride' }, S: { ents: new Map([[5, v], [7, rider]]), myPedId: 7 },
    n: { drawn: 0 }, opts: {}, sprPrio: -1, adapted: new Map(),
  });
  h._z0 = () => 0; h._ask = () => {};
  h._veh(v, 1, true);
  return drawn;
}

test('riding in the open - a dirt bike, a shopping cart, a speedboat, a horse: no outline through it or its rider; your car keeps its', () => {
  for (const kind of ['dirtbike', 'cart', 'speedboat', 'horse']) {
    const d = harness(kind);
    assert.ok(d.some((q) => q.key === 'rider'), `${kind}: its rider drawn`);
    assert.ok(d.every((q) => !q.xray), `${kind}: nothing of it x-rayed (${JSON.stringify(d)})`);
  }
  const car = harness('sedan');
  assert.ok(car.some((q) => q.key === 'veh' && q.xray), 'your own car: still seen through what hides it');
});
