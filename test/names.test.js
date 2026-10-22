// Player names (the owner's M9 note: "a username" - shared/names.js, players.js rename): what a name may be, unique,
// not too often, over your head at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { cleanName, NAME } from '../shared/names.js';
import * as players from '../server/systems/players.js';
import * as crews from '../server/systems/crews.js';

test('what a name may be', () => {
  assert.equal(cleanName('  Big   Al ').name, 'Big Al', 'spaces tidied');
  for (const ok of ['Steve', 'Mr.Pink', 'Rosa_M', 'Essex', 'Draper', 'Peacock']) assert.ok(cleanName(ok).name, ok);
  for (const no of ['Al', 'x'.repeat(NAME.max + 1), '9lives', 'Guest1234', 'Admin', 'sh1thead', 'Bad<b>']) assert.ok(cleanName(no).err, no);
});

test('a name of your own: unique, not too often, over your head at once', () => {
  const w = makeWorld();
  const A = joinPlayer(w), B = joinPlayer(w);
  const v = A.p.ped.appVer || 0;
  assert.ok(players.rename(w, A.p, 'Steve'));
  assert.equal(A.prof.name, 'Steve'); assert.equal(A.p.name, 'Steve');
  assert.ok((A.p.ped.appVer || 0) > v, 'the descriptor sent again');
  assert.ok(!players.rename(w, B.p, 'steve'), 'taken (any case)');
  assert.ok(players.rename(w, B.p, 'Rosa'));
  assert.ok(!players.rename(w, A.p, 'Stephen'), 'not again so soon');
  A.prof.nameAt -= NAME.gapS * 1000;
  assert.ok(players.rename(w, A.p, 'Stephen'));
  assert.ok(!players.rename(w, A.p, 'Hitler99') && A.prof.name === 'Stephen');
  // a crew's list keeps up
  crews.invite(w, A.p, B.p); crews.accept(w, B.p);
  assert.ok(crews.panel(w, B.p).crew.members.some((m) => m.n === 'Stephen'));
});
