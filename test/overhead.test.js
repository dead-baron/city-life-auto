// Overhead labels hang from the top of the head (the owner, 11-22: "Names of players show over the player right now,
// they should show slightly above the player"; "Character types ... like Brute or Tough, they cover the NPC right now";
// "it doesnt need to stay on for long"). A fixed offset from the feet in screen px (`py - 26 / z`) sat on the head or
// the chest depending on the zoom; every mark over a person is measured from the head's top (SKULL_HEAD) instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
const body = (name) => { const a = main.indexOf(`function ${name}(`); assert.ok(a > 0, name); const b = main.indexOf('\nfunction ', a + 10); return main.slice(a, b); };

test('the marks over a person are measured from the head, not the feet', () => {
  const L = body('drawWorldLabels');
  assert.match(L, /const hd = p\.flags & PF\.INVEH \? py - 22 \/ z : py - SKULL_HEAD/, 'the head\'s top (in a vehicle: tagY\'s spot)');
  // no label placed by a bare offset from the feet in screen px (py - N / z) - only from hd
  assert.equal((L.replace('py - 22 / z : py - SKULL_HEAD', '').match(/\bpy - \d+ \/ z/g) || []).length, 0, 'nothing hung from the feet: ' + (L.match(/\bpy - \d+ \/ z/g) || []).join(', '));
  assert.match(L, /const y = hd - 4 \/ z;/, 'the name just over the head');
  assert.match(L, /const y = hd - 9 \/ z, bd =/, 'the brawl bar just over the head');
  assert.match(L, /drawSkull\(p\.rx, hd - tagUp/, 'the bounty skull over the name');
  const M = body('drawSuspectMarks');
  assert.match(M, /e\.ry - SKULL_HEAD/, 'an officer\'s chevron over the suspect\'s head');
});

test('BRUTE / TOUGH shows for the first seconds of a fight, then goes', () => {
  assert.match(main, /const TAG_S = 3, FIGHT_GAP_S = 6;/);
  const L = body('drawWorldLabels');
  assert.match(L, /if \(bd >= 2 && ta > 0\)/, 'drawn only while its time lasts');
  // the same clock the page runs: a fight's first hit at 0, the tag gone after TAG_S, back after a pause
  const TAG_S = 3, GAP = 6, p = {};
  const shown = (t) => { if (!p.tagAt || t - (p.tagSeen || 0) > GAP) p.tagAt = t; p.tagSeen = t; return TAG_S - (t - p.tagAt) > 0; };
  assert.equal(shown(0.01), true); assert.equal(shown(1), true); assert.equal(shown(3.5), false); assert.equal(shown(5), false);
  assert.equal(shown(12), true, 'a new fight after a pause shows it again');
});

test('bubbles and balloons over another player sit over their name tag', () => {
  assert.match(main, /headOf: \(eid\) => \{[^\n]*e\.d\.pl && e\.d\.n && e\.id !== S\.myPedId\) q\.y -= /, 'headOf lifts over the name');
});

// The event highlight (the owner, 11-22): on the person it's about as they move, framing them rather than covering them,
// full from afar and faded up close, the chevron only from afar.
test('the event highlight stays on its person and fades as you near it', () => {
  const ev = readFileSync(new URL('../server/systems/events.js', import.meta.url), 'utf8');
  assert.match(ev, /if \(who\) o\.e = who;/, 'the server says who an event is about');
  assert.match(ev, /e\.kind === 'snatch' \? \(e\.dropAt \? 0 : e\.thief\)/, 'a snatch: the thief while he runs with it');
  const A = body('drawEventArrows'), F = body('evFrame');
  assert.match(F, /S\.ents\.get\(id\)/, 'the frame round the entity where the page draws it now');
  assert.match(F, /if \(ev\.e\) return null;/, 'nothing over an empty spot');
  assert.match(A, /EV_NEAR_A \+ \(1 - EV_NEAR_A\) \* near/, 'faded up close');
  assert.match(A, /if \(near > 0\.35\)/, 'the chevron from afar only');
});
