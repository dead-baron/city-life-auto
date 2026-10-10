// The plasma blade's colour (task #411): "Let's have it come in a lot of different colors. You can have the blue color pop
// up for now, but there should be an option to change its color." A cosmetic kept with the character on the server (the
// client only asks), shown to everyone in the ped's descriptor, drawn in it by both renderers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, teleport, fakeConn, store } from './helpers.js';
import { WEAPONS, BLADE_COLORS, bladeColor } from '../shared/items.js';
import { _descriptor } from '../server/net.js';
import { createSession } from '../server/session.js';
import * as looks from '../server/systems/looks.js';
import * as players from '../server/systems/players.js';
import * as combat from '../server/systems/combat.js';
import * as npc from '../server/systems/npc.js';

test('the blade colours: blue first (the default), several more, each a blade and a core colour', () => {
  assert.equal(BLADE_COLORS[0].id, 'blue');
  assert.equal(BLADE_COLORS[0].c, '#3c86ff', 'the blue it always had');
  assert.ok(BLADE_COLORS.length >= 6, 'a lot of colours');
  assert.equal(new Set(BLADE_COLORS.map((b) => b.id)).size, BLADE_COLORS.length, 'each its own');
  for (const b of BLADE_COLORS) assert.match(`${b.c} ${b.core}`, /^#[0-9a-f]{6} #[0-9a-f]{6}$/, b.id);
  assert.equal(bladeColor(99), BLADE_COLORS[0], 'anything else is blue');
});

test('the server keeps the colour you pick, checks it, and everyone sees it', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  assert.equal(players.buildMe(w, p).blade, 0, 'blue until you pick one');
  assert.equal(_descriptor(p.ped).bc, undefined, 'blue is left out of the descriptor');
  const v0 = p.ped.appVer || 0;
  assert.equal(looks.handle(w, p, { t: 'look', a: 'blade', c: 3 }), null, 'nothing to send back: the me message carries it');
  assert.equal(prof.blade, 3, 'kept with the character');
  assert.equal(p.ped.blade, 3);
  assert.ok((p.ped.appVer || 0) > v0, 'the descriptor goes out again to everyone who sees them');
  assert.equal(_descriptor(p.ped).bc, 3, 'everyone sees it');
  assert.equal(players.buildMe(w, p).blade, 3, 'your own HUD and Settings too');
  // anything but a colour on the list is ignored
  for (const bad of [BLADE_COLORS.length, -1, 1.5, '2', null, true, undefined, {}, 1e9]) {
    looks.handle(w, p, { t: 'look', a: 'blade', c: bad });
    assert.equal(prof.blade, 3, `ignored: ${JSON.stringify(bad)}`);
  }
  // back to blue: nothing kept, nothing sent
  looks.handle(w, p, { t: 'look', a: 'blade', c: 0 });
  assert.equal(prof.blade, undefined);
  assert.equal(_descriptor(p.ped).bc, undefined);
  // it lasts: a new body (a respawn, the next login) wears it
  looks.setBlade(w, p, 7);
  players.spawnPlayerPed(w, p, false);
  assert.equal(p.ped.blade, 7);
  assert.equal(_descriptor(p.ped).bc, 7);
});

test('through a session: the look message sets it for that player only', () => {
  const w = makeWorld();
  const a = store.create('b1ade0' + Date.now().toString(16).padStart(18, '0'));
  const b = joinPlayer(w);
  const conn = fakeConn();
  const s = createSession(w, conn, { seed: 1337, dev: false, maxPlayers: 10, login: () => ({ profile: a, token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello', token: null }), false);
  const sent = conn.sent.length;
  s.onMessage(JSON.stringify({ t: 'look', a: 'blade', c: 5, pid: b.p.pid }), false);
  assert.equal(a.blade, 5);
  assert.equal(b.prof.blade, undefined, 'never anyone else\'s');
  assert.equal(conn.sent.length, sent, 'no reply of its own');
});

test('the sear of a plasma blade says whose it was (the client colours it by the blade)', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = w.map.natureSites.find((q) => q.name === 'Giants Loop');
  teleport(w, p.ped, at.x + 200, at.y - 300);
  p.profile.weapons.plasma = 0; p.ped.weapon = 'plasma'; p.ped.a = 0;
  const v = npc.spawnNpc(w, 'casual', p.ped.x + 22, p.ped.y);
  v.npc.state = 'idle'; v.hp = v.maxHp = 500;
  w.events.length = 0;
  combat.tryAttack(w, p.ped, 0);
  const sz = w.events.map((q) => q.ev).find((ev) => ev.e === 'sizzle');
  assert.ok(sz, 'seared');
  assert.equal(sz.id, p.ped.id);
  assert.ok(WEAPONS.plasma.plasma);
});

test('both renderers draw the blade in its colour, and its light and arcs follow it', () => {
  const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(src('client/render/peds.js'), /case 28: \{ const B = bladeColor\(bc\)/, 'the classic renderer');
  assert.match(src('client/art2/game/peds.js'), /if \(opt\.bc && k === 'energyBlade'\) recolorBlade\(G, opt\.bc\)/, 'art v2: the sprite');
  assert.match(src('client/art2/game/peds.js'), /'\|bc' \+ opt\.bc/, 'art v2: its own sprite key');
  const host = src('client/art2/game/host.js');
  assert.match(host, /bladeOpt\(p, wpn\)/, 'art v2 asks for the coloured sprite');
  assert.match(host, /BLADE_LIGHT\[\(p\.d && p\.d\.bc\) \| 0\]/, 'art v2: the light in the hand');
  const main = src('client/main.js');
  assert.match(main, /bc \? BLADE_FX\[bc\]\.light : LIGHT\.blue/, 'the classic light in the hand');
  assert.match(main, /BLADE_FX\[\(a\.d && a\.d\.bc\) \| 0\]/, 'the swing\'s arc');
  // (art v2 recolours in peds.js, left out of the art hash: no browser's baked chunks are thrown away for it)
  assert.doesNotMatch(src('client/art2/items.js'), /BLADE_COLORS/);
});
