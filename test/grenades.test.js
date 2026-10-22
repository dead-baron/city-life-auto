// Grenades (task #303 - server/systems/grenades.js): thrown the way you aim, out in an arc; they bounce, roll to a stop and
// go off when the fuse burns down. From the black market (and the Smuggler's Den). A grenade in flight is a ball on the
// wire (t 5); one in your hand shows as empty hands (its index is past the wire's five bits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { SHOPS, WEAPONS } from '../shared/items.js';
import { GRENADE } from '../shared/rules.js';
import * as combat from '../server/systems/combat.js';
import * as net from '../server/net.js';

function openGround(m, ok = (t) => t === T.ROAD || t === T.PLAZA || t === T.LOT || t === T.GRASS || t === T.SIDEWALK, r = 14) {
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 5) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 5) {
    let all = true;
    for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r && all; dx++) if (!ok(m.tiles[m.idx(tx + dx, ty + dy)])) all = false;
    if (all) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
const nades = (w) => [...w.entities.values()].filter((e) => e.kind === K.BALL && e.ballKind === 'grenade');
function armed(w, n = 3) {
  const { p } = joinPlayer(w);
  p.profile.weapons.grenade = n; p.ped.weapon = 'grenade'; p.ped.mag.grenade = 1; p.ped.nextAttack = 0;
  return p;
}

test('grenades: on the black market\'s shelves; thrown out in an arc, rolled to a stop, then a blast where it lies', () => {
  assert.ok(SHOPS.fence.buy.some((o) => o.id === 'grenade') && SHOPS.smuggler.buy.some((o) => o.id === 'grenade'), 'for sale');
  assert.ok(WEAPONS.grenade.illegal, 'illegal');
  const w = makeWorld();
  const p = armed(w);
  const at = openGround(w.map);
  assert.ok(at, 'open ground');
  teleport(w, p.ped, at.x, at.y);
  assert.ok(combat.tryAttack(w, p.ped, 0), 'thrown');
  const g = nades(w)[0];
  assert.ok(g, 'a grenade in the air');
  assert.equal(p.profile.weapons.grenade, 2, 'one fewer');
  // in flight: up and over, then down
  let top = 0;
  for (let i = 0; i < 8; i++) { w.step(); top = Math.max(top, g.z); }
  assert.ok(top > 30, `an arc (${top.toFixed(0)} px up)`);
  // the next one comes to hand by itself
  run(w, 0.6);
  assert.equal(p.ped.mag.grenade, 1, 'the next in hand');
  // rolled to a stop a way off, then the fuse
  run(w, GRENADE.fuse - 1.4);
  assert.ok(!g.removed && Math.hypot(g.vx, g.vy) < 40, 'at rest, or nearly');
  const d = g.x - at.x;
  assert.ok(d > 100 && d < 420, `thrown ${d.toFixed(0)} px`);
  const { p: q } = joinPlayer(w);   // (someone standing by it as it goes off)
  teleport(w, q.ped, g.x + 30, g.y);
  const victim = q.ped, hp0 = victim.hp;
  run(w, 1);
  assert.ok(g.removed, 'gone off');
  assert.ok(victim.dead || victim.hp < hp0, `it hurt whoever was by it (grenade at ${(g.x - at.x).toFixed(0)}, victim at ${(victim.x - at.x).toFixed(0)},${(victim.y - at.y).toFixed(0)})`);
});

test('a grenade off a wall: it never ends up inside a building; on the wire a ball, in hand empty hands', () => {
  const w = makeWorld();
  const p = armed(w);
  // a spot with a building a little way east
  const m = w.map;
  let at = null;
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40 && !at; ty += 3) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40 && !at; tx += 3) {
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) if (PED_BLOCK[m.tiles[m.idx(tx + k, ty)]]) ok = false;
    if (ok && m.tiles[m.idx(tx + 5, ty)] === T.BUILDING && m.tiles[m.idx(tx + 5, ty - 1)] === T.BUILDING && m.tiles[m.idx(tx + 5, ty + 1)] === T.BUILDING) at = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  assert.ok(at, 'a wall to throw at');
  teleport(w, p.ped, at.x, at.y);
  combat.tryAttack(w, p.ped, 0);
  const g = nades(w)[0];
  const desc = net.descriptor(g);
  assert.equal(desc.t, 5, 'a grenade ball on the wire');
  const [, , , extra] = net._fields(w, p.ped);
  assert.equal(extra & 31, 0, 'in hand: empty hands');
  assert.equal((extra >> 5) & 3, 0, 'not blinking');
  for (let i = 0; i < 30; i++) { w.step(); assert.ok(g.removed || !PED_BLOCK[m.tileAtPx(g.x, g.y)], 'never in the wall'); }
  assert.ok(g.removed || g.x < at.x + 5 * TILE, 'bounced back off it');
});

test('no grenades down in the subway (the ball would be the street\'s): nothing thrown, none used', () => {
  const w = makeWorld();
  const p = armed(w);
  p.ped.sub = true;
  assert.equal(combat.tryAttack(w, p.ped, 0), false);
  assert.equal(nades(w).length, 0, 'nothing thrown');
  assert.equal(p.profile.weapons.grenade, 3, 'none used');
});
