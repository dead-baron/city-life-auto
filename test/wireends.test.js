// "Phone wires that end at nothing" (the owner's note; a world change that waited for his word - on branch
// phone-wires-1128 until he says to fold it into the world batch). A pole's wire runs to the pole before it ({ wx, wy });
// later passes moved or dropped 10 of those poles (of 1,397 wires, by the data, 11-28) and the wire ended in the air.
// shared/world3-tidy.js wireEnds3: re-aimed at the nearest pole in reach, or the pole stands without a wire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireEnds3, looseWires, WIRE_REACH } from '../shared/world3-tidy.js';

const pole = (x, y, to) => ({ t: 'upole', x, y, ...(to ? { wx: to[0], wy: to[1] } : null) });
test('a wire to a pole that still stands is left; one whose pole moved is re-aimed; one whose pole is gone is taken off', () => {
  const m = { props: [
    pole(100, 100), pole(400, 100, [100, 100]),            // a sound pair
    pole(1000, 100), pole(1300, 100, [1040, 130]),         // its pole was moved 40 px
    pole(3000, 100, [2700, 100]),                          // its pole was dropped: nothing within reach
    null, { t: 'lamp', x: 2700, y: 100 },                  // (a lamp is no pole)
    pole(5000, 100, [5000, 100]),                          // (never its own)
  ] };
  assert.equal(looseWires(m).length, 3);
  const r = wireEnds3(m);
  assert.deepEqual(r, { poles: 6, wired: 4, loose: 3, reaimed: 1, cut: 2 });
  assert.deepEqual([m.props[1].wx, m.props[1].wy], [100, 100], 'untouched');
  assert.deepEqual([m.props[3].wx, m.props[3].wy], [1000, 100], 're-aimed at where the pole stands now');
  assert.equal(m.props[4].wx, undefined, 'no wire to nowhere');
  assert.equal(m.props[7].wx, undefined);
  assert.equal(looseWires(m).length, 0);
  assert.ok(WIRE_REACH >= 96 && WIRE_REACH <= 240);
});

test('the world\'s build runs it after every pass that moves or drops a prop', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../shared/world3-world.js', import.meta.url), 'utf8');
  const at = src.indexOf('m.world3.wireEnds = wireEnds3(m)');
  assert.ok(at > 0);
  for (const late of ['clearDoorSteps3(m', 'plazaFill3(m', 'clearWalks3(m', 'tidyProps3(m']) { const i = src.indexOf(late); assert.ok(i < 0 || i < at, `${late} runs before it`); }
});
