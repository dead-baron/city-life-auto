// Self-defense, and the stars that stopped coming (the owner, 11-25 03:23: "Wanted level stops after a great deal of crime
// on a character made that day"): reproduced - every cop who had shot at you, and every civilian who had fought back,
// counted as self-defense, so killing them added nothing. Now (law.js immune): never against the police, never once
// you're wanted, never when you started it; a clean character a stranger attacks first may still defend themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import * as law from '../server/systems/law.js';
import * as combat from '../server/systems/combat.js';
import { spawnNpc } from '../server/systems/npc.js';
import { T } from '../shared/constants.js';

const w = makeWorld(), m = w.map;
let at = null;
for (let ty = m.y0 + 200; ty < m.y0 + m.h - 30 && !at; ty += 5) for (let tx = m.x0 + 200; tx < m.x0 + m.w - 30; tx += 5) if (m.tileAt(tx, ty) === T.SIDEWALK) { at = { x: tx * 32 + 16, y: ty * 32 + 16 }; break; }
// people about, facing the spot (they see it and some call it in)
const crowd = (ped) => { const ws = []; for (let k = 0; k < 4; k++) { const n = spawnNpc(w, 'casual', ped.x + 60 + k * 20, ped.y + 10, 'civ'); n.a = Math.PI; ws.push(n); } return ws; };
const clear = (l) => { for (const n of l) w.remove(n); };

test('killing a cop who shot at you first is no self-defense: the stars keep coming', () => {
  const { p } = joinPlayer(w); teleport(w, p.ped, at.x, at.y);
  law.addHeat(w, p, 50, at.x, at.y);
  const s0 = p.wanted;
  const cop = spawnNpc(w, 'cop', p.ped.x + 40, p.ped.y, 'cop');
  combat.damage(w, p.ped, 1, cop, 'gun', 0);
  const ws = crowd(p.ped);
  combat.damage(w, cop, 9999, p.ped, 'gun', 0);
  assert.ok(cop.dead);
  assert.ok(p.wanted > s0, `more stars (${s0} -> ${p.wanted})`);
  clear(ws);
});

test('someone you attacked who fights back: killing them is still murder', () => {
  const { p } = joinPlayer(w); teleport(w, p.ped, at.x + 400, at.y);
  const civ = spawnNpc(w, 'casual', p.ped.x + 30, p.ped.y, 'civ');
  const ws = crowd(p.ped);
  combat.damage(w, civ, 1, p.ped, 'gun', 0);   // (you start it)
  w.time += 6;
  const h0 = p.heat;
  combat.damage(w, p.ped, 1, civ, 'melee', 0);   // (they hit back)
  combat.damage(w, civ, 9999, p.ped, 'gun', 0);
  assert.ok(p.heat > h0, 'heat for the killing');
  clear(ws);
});

test('a clean character a stranger attacks first may defend themselves', () => {
  const { p } = joinPlayer(w); teleport(w, p.ped, at.x + 800, at.y);
  const mugger = spawnNpc(w, 'casual', p.ped.x + 30, p.ped.y, 'civ');
  const ws = crowd(p.ped);
  combat.damage(w, p.ped, 1, mugger, 'melee', 0);   // (they start it)
  combat.damage(w, mugger, 9999, p.ped, 'gun', 0);
  assert.equal(p.heat, 0, 'self-defense');
  assert.equal(p.wanted, 0);
  clear(ws);
});
