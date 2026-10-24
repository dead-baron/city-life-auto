// The wanted ladder (the owner's notes, 10-22: "getting a 5 star wanted level is really aggressive/sensitive ... so you
// don't get 4 or 5 stars so easily"): 1-3 stars come as they did; 4 and 5 take a lot more - higher thresholds
// (shared/rules.js STAR_HEAT) and, above 3 stars, a crime's heat counting for only part of itself (rules.js HEAT_TOP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { STAR_HEAT, starsForHeat } from '../shared/rules.js';
import { HEAT_TOP } from '../shared/rules.js';
import * as law from '../server/systems/law.js';

// how many of `type` (called in, no witnesses needed) to reach each star
function ladder(type, n = 12) {
  const w = makeWorld(), { p } = joinPlayer(w);
  const at = [];
  for (let i = 1; i <= n; i++) { law.crime(w, p.ped, type, null, p.ped.x, p.ped.y, { silentCheck: false }); if (at[p.wanted] === undefined) at[p.wanted] = i; }
  for (let s = 5; s > 0; s--) if (at[s] !== undefined) for (let k = s - 1; k > 0; k--) if (at[k] === undefined || at[k] > at[s]) at[k] = at[s];
  return at;
}

test('the wanted ladder: 1-3 stars as before, 4 and 5 stars take a lot more', () => {
  assert.deepEqual(STAR_HEAT.slice(0, 4), [0, 10, 30, 60], '1-3 stars: the thresholds they had');
  assert.ok(STAR_HEAT[4] >= 110 && STAR_HEAT[5] >= 200, `4 and 5 higher (was 100 and 160): ${STAR_HEAT}`);
  assert.ok(HEAT_TOP.from === 3 && HEAT_TOP.mult > 0.3 && HEAT_TOP.mult < 1);
  // heatAfter: at full rate up to 3 stars' heat, slower past it
  assert.equal(law.heatAfter(0, 45), 45);
  assert.equal(law.heatAfter(50, 20), 60 + 10 * HEAT_TOP.mult);
  assert.equal(law.heatAfter(100, 10), 100 + 10 * HEAT_TOP.mult);
  assert.equal(law.heatAfter(100, -5), 95);
  const murder = ladder('murder'), cop = ladder('copMurder'), assault = ladder('assault');
  assert.deepEqual([murder[2], murder[3]], [1, 2], 'murder: 2 stars at once, 3 with a second (as before)');
  assert.ok(murder[4] >= 4 && murder[5] >= 7, `murders to 4 / 5 stars: ${murder[4]} / ${murder[5]} (was 3 / 4)`);
  assert.equal(cop[3], 1, 'killing an officer: 3 stars at once (as before)');
  assert.ok(cop[4] >= 2 && cop[5] >= 4, `police killings to 4 / 5 stars: ${cop[4]} / ${cop[5]} (was 2 / 2)`);
  assert.deepEqual([assault[1], assault[2], assault[3]], [1, 2, 4], 'assaults: 1, 2, 3 stars as before');
  assert.ok(assault[5] >= 12 || assault[5] === undefined, 'assaults alone: a long way to 5 stars');
});

test('an alarm or the dev menu putting you at so many stars still does (addHeat without damping)', () => {
  const w = makeWorld(), { p } = joinPlayer(w);
  for (const s of [5, 4, 3]) {
    law.clearWanted(w, p);
    law.addHeat(w, p, STAR_HEAT[s] - p.heat + 1, p.ped.x, p.ped.y);
    assert.equal(p.wanted, s);
  }
  assert.equal(starsForHeat(STAR_HEAT[5] + 60), 5, 'the cap is well into 5 stars');
});

test("the live thresholds are rules.js's: nothing reads constants.js's old copy (kept so the world's hashes stay put)", async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname, bad = [];
  const walk = (d) => { for (const n of readdirSync(join(root, d))) { const f = join(d, n); if (statSync(join(root, f)).isDirectory()) { if (!/node_modules|data/.test(n)) walk(f); } else if (f.endsWith('.js') && f !== join('shared', 'constants.js')) { const s = readFileSync(join(root, f), 'utf8'); for (const m of s.matchAll(/import \{([^}]*)\} from '[^']*constants\.js'/g)) if (/\b(STAR_HEAT|starsForHeat)\b/.test(m[1])) bad.push(f); } } };
  for (const d of ['server', 'shared', 'client', 'test', 'tools']) walk(d);
  assert.deepEqual(bad, []);
});
