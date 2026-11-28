// What the signs say: none puts drinking beside riding or driving (the owner's Rusty Spur notes, 11-17 - "RIDE DRINK
// REPEAT" read as drink-driving; now "LIVE TO RIDE"). Every sign's words in the world's rooms and fronts, as written in
// the code that lays them: a quoted line in capitals with a drinking word and a riding or driving word in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DRINK = /\b(DRINK|DRINKS|BEER|BOOZE|SHOTS?|WHISKEY|TEQUILA|TIPSY|DRUNK|BREW|BREWS)\b/;
const ROAD = /\b(RIDE|RIDES|RIDING|DRIVE|DRIVES|DRIVING|ROAD|THROTTLE|SPEED|WHEELS?)\b/;

test('no sign puts drinking beside riding or driving', () => {
  const bad = [];
  for (const dir of ['shared', 'client/art2', 'client/art2/game']) {
    const root = new URL('../' + dir + '/', import.meta.url).pathname;
    for (const f of readdirSync(root).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(/'([A-Z0-9 &!.,-]{4,40})'/g)) if (DRINK.test(m[1]) && ROAD.test(m[1])) bad.push(`${dir}/${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
