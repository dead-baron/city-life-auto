// Fighting back against helicopters (the owner, 10-16: "A way to fight back against helicopters (a SAM launcher, or
// aiming up), without making them weak"): the SAM launcher locks on to the aircraft you aim at (where it's drawn, up the
// screen by its height) and its missile chases it - two hits for a police helicopter; a bazooka's rocket into an aircraft
// up in the air hits it too (before, its blast went off on the ground under it and missed). Aimed at nothing, the
// missile flies straight and bursts in the air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { FLY } from '../shared/flight.js';
import { SHOPS, WEAPONS } from '../shared/items.js';
import * as combat from '../server/systems/combat.js';

function openGround(m, r = 12) {
  const ok = (t) => t === T.ROAD || t === T.PLAZA || t === T.LOT || t === T.GRASS || t === T.SIDEWALK;
  for (let ty = m.y0 + 60; ty < m.y0 + m.h - 60; ty += 5) for (let tx = m.x0 + 60; tx < m.x0 + m.w - 60; tx += 5) {
    let all = true;
    for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r && all; dx++) if (!ok(m.tiles[m.idx(tx + dx, ty + dy)])) all = false;
    if (all) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
// a police helicopter hovering (held up: nobody's flying it), drifting east at vx
function hover(w, at, alt, vx = 0) {
  const v = w.spawnVehicle('policeheli', at.x + 200, at.y - 40, 0, { npcOwned: true });
  const keep = () => { if (!v.removed && !v.wreckAt) { v.alt = alt; v.vz = 0; v.vx = vx; v.vy = 0; v.spool = 1; } };
  keep();
  return { v, keep };
}
const aimAt = (ped, v) => Math.atan2(v.y - v.alt * FLY.LIFT - ped.y, v.x - ped.x);

test('the SAM launcher: aimed at a helicopter up in the air it locks on, and the missile chases it down', () => {
  assert.ok(SHOPS.smuggler.buy.some((o) => o.id === 'sam') && WEAPONS.sam.illegal, 'the Smuggler\'s Den');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  const { v, keep } = hover(w, at, 420, 260);
  const hp0 = v.hp;
  p.profile.weapons.sam = 2; p.ped.weapon = 'sam'; p.ped.mag.sam = 1;
  assert.ok(combat.tryAttack(w, p.ped, aimAt(p.ped, v)), 'fired');
  const m = [...w.entities.values()].find((e) => e.kind === K.PROJ);
  assert.ok(m && m.homing === v.id, 'locked on');
  let n = 0; while (!m.removed && n++ < 20 * 5) { keep(); w.step(); }
  assert.ok(m.removed, 'it got there');
  assert.ok(v.hp <= hp0 - WEAPONS.sam.dmg * 0.9 || v.wreckAt, `hit (${hp0} -> ${v.hp})`);
  assert.ok(v.def.hp / WEAPONS.sam.dmg <= 2, 'two bring a police helicopter down');
  // aimed at nothing: no lock, a burst in the air at the end of its range, the helicopter untouched
  const hp1 = v.hp;
  p.ped.mag.sam = 1; p.ped.nextAttack = 0;
  combat.tryAttack(w, p.ped, aimAt(p.ped, v) + Math.PI);
  const m2 = [...w.entities.values()].find((e) => e.kind === K.PROJ && !e.removed);
  assert.ok(m2 && !m2.homing, 'no lock');
  n = 0; while (!m2.removed && n++ < 20 * 5) { keep(); w.step(); }
  assert.ok(m2.removed && v.hp === hp1, 'gone off on its own, the helicopter untouched');
});

test('a bazooka rocket into a helicopter up in the air: it hits it, where it\'s drawn', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  const { v, keep } = hover(w, at, 300);
  const hp0 = v.hp;
  p.profile.weapons.rocket = 2; p.ped.weapon = 'rocket'; p.ped.mag.rocket = 1;
  combat.tryAttack(w, p.ped, aimAt(p.ped, v));
  const r = [...w.entities.values()].find((e) => e.kind === K.PROJ);
  let n = 0; while (!r.removed && n++ < 20 * 3) { keep(); w.step(); }
  assert.ok(v.hp < hp0, `hit (${hp0} -> ${v.hp})`);
});
