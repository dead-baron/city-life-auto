// The owner's 11-23 notes (docs/tasks/PREBETA-NOTES-2026-11-23.md), the cinematic groundwork C1-C3: a clean picture when a
// shot comes up, the people round it in first, the page's own sounds quiet while it plays, marks on the unreviewed shots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('C1: the shot comes up clean - the X and the bar put away as the black lifts; held at least 2 s', () => {
  const d = read('client/director.js');
  assert.match(d, /if \(m\.held === 0 && sct\.held\) \{ sct\.held = false; wokeAt = -1e9; fadeTo\(0\); \}/);
  assert.match(d, /HOLD_MIN = 2000/);
  assert.match(d, /body\.cine-shot:not\(\.cine-woke\) #cine-x/, 'the X off while a shot plays unless woken');
});

test('C2: the page\'s own unplaced sounds quiet during a shot; the world fills round the camera (view.js cineEyes)', () => {
  assert.match(read('client/sound/index.js'), /document\.body\.classList\.contains\('cine-shot'\)\) return;/);
  for (const f of ['traffic', 'npc', 'wildlife', 'activities', 'boats']) assert.match(read(`server/systems/${f}.js`), /cineEyes\(world\)/, `${f}: round the camera too`);
});

test('C3: marks on the unreviewed shots - keep, cut, bug; a cut one leaves the reel; copied out to send', async () => {
  const d = read('client/director.js');
  assert.match(d, /const REV_KEY = 'cla\.cine\.review'/);
  assert.match(d, /R\[q\.id\] !== 'cut'/, 'a cut shot leaves the reel');
  assert.match(d, /Copy marks/);
  assert.match(d, /\['keep', 'cut', 'bug'\]\.map/, 'the marks in the bar while it plays');
});
