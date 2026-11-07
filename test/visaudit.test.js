// What's meant to be seen is seen (the owner, 11-06: "Another train station with the sign hidden, lets make sure we're
// checking for hidden signs or activities or things that have gotten hidden behind stuff like we've seen for the chess
// board or station signs"). tools/visaudit.mjs: everything meant to be seen - the places' doors and signs, the stations'
// name boards, platforms and route boards, the chess tables and the activities' spots, the ATMs, the standing signs -
// its pixels on screen as the bake draws them, and what is drawn over them (the bake's own sprites and depth rule; a train
// standing at the platform).
//   - every station's name board, every platform, every chess table and every standing sign the owner named is seen
//   - by kind, no more hidden than the allowed exceptions (each explained below)
//   - no tree's crown over a door, a sign, a chess table, an ATM or a bus stop (shared/world3-greens.js sightlines3)
// Builds World v3: run under the heavy lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { visAudit } from '../tools/visaudit.mjs';
import { sightBlocked } from '../shared/world3-greens.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const A = visAudit(M);
const hid = (k) => A.rows.filter((r) => r.kind === k);
const say = (l) => l.slice(0, 8).map((r) => `${r.name} (${r.x}, ${r.y}) ${Math.round(r.cover * 100)}% under ${r.by}`).join('; ');

// The exceptions left, by kind (11-07): what's hidden there is hidden by design or by the city's layout, not by a prop.
//   place-front    a door with another building's roof over it - a back-to-back lot, a door onto a passage between
//                  two buildings; under the El or a highway's deck
//   atm            a cash machine painted on a wall facing a narrow gap, or on a station's forecourt under its canopy
//   spot:busstop   a stop on the south kerb of an east-west street: the buildings behind it (south) are drawn up over
//                  the pavement in front of them (the engine fades a building you stand behind)
//   spot:picnic    back yards' tables behind their houses; a rest stop's under its pergola
//   spot:campfire  the wild camps' fire rings under their own trees and logs
//   place-spot, spot:*  the odd one under an awning, a pergola or a cliff
const ALLOW = {
  'place-front': 230, 'place-door-n': 4, 'place-spot': 14, atm: 38, vending: 0, 'station-board': 0, 'route-board': 1, platform: 0, chess: 0, sign: 2,
  'spot:busstop': 70, 'spot:picnic': 26, 'spot:campfire': 10, 'spot:mapboard': 3, 'spot:shower': 4, 'spot:pierrail': 1, 'spot:vend_cola': 1,
};

test('the stations\' name boards and platforms, the chess tables and the standing signs are seen', () => {
  assert.ok((A.counts['station-board'] || [0])[0] >= 18, `the stations' name boards (${(A.counts['station-board'] || [0])[0]})`);
  assert.deepEqual(hid('station-board'), [], `name boards hidden: ${say(hid('station-board'))}`);
  assert.deepEqual(hid('platform'), [], `platforms hidden: ${say(hid('platform'))}`);
  assert.ok((A.counts.chess || [0])[0] >= 10, 'the chess tables');
  assert.deepEqual(hid('chess'), [], `chess tables hidden: ${say(hid('chess'))}`);
  for (const name of ['GULF FUEL TERMINAL', 'TAXI', 'MARKET SQUARE', 'STERLING PLAZA', 'THE RUSTY ANCHOR', 'YARDS FREIGHT', 'FIRE LOOKOUT', 'LINDEN WALK', 'DOG RUN', 'BIKE RENTAL'])
    assert.equal(hid('sign').filter((r) => r.name === name).length, 0, `${name} hidden: ${say(hid('sign').filter((r) => r.name === name))}`);
});

test('by kind, no more hidden than the allowed exceptions', () => {
  const over = [];
  for (const [k, [n, h]] of Object.entries(A.counts)) if (h > (ALLOW[k] ?? 0)) over.push(`${k}: ${h} of ${n} hidden (allowed ${ALLOW[k] ?? 0}) - ${say(hid(k))}`);
  assert.deepEqual(over, []);
});

test('no tree\'s crown over a door, a sign, a chess table, an ATM or a bus stop', () => {
  const b = sightBlocked(M);
  assert.equal(b.length, 0, b.slice(0, 6).map(({ p, q }) => `${p.t} (${Math.round(p.x)}, ${Math.round(p.y)}) over (${Math.round(q.x)}, ${Math.round(q.y)})`).join('; '));
});
