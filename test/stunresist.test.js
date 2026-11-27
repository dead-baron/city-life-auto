// Pepper spray and the taser against players (the owner, 11-25: "no keeping a player down for good - full effect the first
// time or two, then little for a while. NPCs matter less"; shared/rules.js STUN_RESIST, server combat.js stunFor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import * as combat from '../server/systems/combat.js';
import { spawnNpc } from '../server/systems/npc.js';
import { WEAPONS } from '../shared/items.js';
import { STUN_RESIST } from '../shared/rules.js';
import { T } from '../shared/constants.js';

const w = makeWorld(), m = w.map;
let at = null;
for (let ty = m.y0 + 200; ty < m.y0 + m.h - 30 && !at; ty += 5) for (let tx = m.x0 + 200; tx < m.x0 + m.w - 30; tx += 5) if (m.tileAt(tx, ty) === T.SIDEWALK && m.tileAt(tx + 2, ty) === T.SIDEWALK) { at = { x: tx * 32 + 16, y: ty * 32 + 16 }; break; }

test('a player is sprayed down in full once or twice, then only briefly; an NPC every time', () => {
  const { p: a } = joinPlayer(w), { p: b } = joinPlayer(w);
  teleport(w, a.ped, at.x, at.y); teleport(w, b.ped, at.x + 40, at.y);
  a.ped.weapon = 'pepper'; a.ped.a = 0;
  const S = WEAPONS.pepper.stun, len = [];
  for (let i = 0; i < 4; i++) {
    b.ped.stunUntil = 0; b.ped.hp = b.ped.maxHp; b.ped.spawnSafeUntil = 0;
    a.ped.nextAttack = 0; a.ped.mag.pepper = 6; a.ped.protectUntil = 0; b.ped.protectUntil = 0;
    combat.tryAttack(w, a.ped, 0);
    len.push(+(b.ped.stunUntil - w.time).toFixed(2));
    w.time += 5;
  }
  assert.ok(len[0] > S * 0.9 && len[STUN_RESIST.full - 1] > S * 0.9, `the first ${STUN_RESIST.full} in full: ${len}`);
  assert.ok(len[STUN_RESIST.full] < S * 0.5, `then briefly: ${len}`);
  w.time += STUN_RESIST.windowS + 1;
  b.ped.stunUntil = 0; a.ped.nextAttack = 0; a.ped.mag.pepper = 6;
  combat.tryAttack(w, a.ped, 0);
  assert.ok(b.ped.stunUntil - w.time > S * 0.9, 'a while later, in full again');
  const n = spawnNpc(w, 'casual', at.x + 40, at.y + 200, 'civ');
  teleport(w, a.ped, at.x, at.y + 200);
  for (let i = 0; i < 4; i++) { n.stunUntil = 0; a.ped.nextAttack = 0; a.ped.mag.pepper = 6; combat.tryAttack(w, a.ped, 0); assert.ok(n.stunUntil - w.time > S * 0.9, 'an NPC: in full'); w.time += 5; }
});
