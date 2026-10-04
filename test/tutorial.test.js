// The city tour must stay true to the game. These tests fail when the map, the rules or the
// controls change in a way the tutorial (shared/tutorial.js) doesn't cover yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCity, ISLANDS, DISTRICTS } from '../shared/map.js';
import * as rules from '../shared/rules.js';
import { ACTIONS, KB, PAD, TOUCH } from '../shared/controls.js';
import { CHAPTERS, STEPS, resolveTarget, resolveRoute, fillNames, actionsIn, placesIn, stepExtra } from '../shared/tutorial.js';

const map = generateCity(1337);
const src = readFileSync(new URL('../shared/tutorial.js', import.meta.url), 'utf8');

test('every tutorial step points at a real place on the current map', () => {
  for (const st of STEPS) {
    assert.ok(CHAPTERS.some((c) => c.id === st.ch), `${st.title}: unknown chapter ${st.ch}`);
    const t = resolveTarget(map, st.at);
    assert.ok(t && Number.isFinite(t.x) && Number.isFinite(t.y) && t.w > 0 && t.h > 0, `${st.title}: target ${JSON.stringify(st.at)} not found on the map`);
    for (const m of t.marks) assert.ok(Number.isFinite(m.x) && m.label, `${st.title}: bad marker`);
    if (st.route) {
      const r = resolveRoute(map, st.route);
      assert.ok(r && r.pts.length >= 2 && r.len > 300, `${st.title}: no road route ${JSON.stringify(st.route)}`);
    }
  }
});

test('place names in the text resolve, and no raw tokens leak', () => {
  for (const st of STEPS) {
    for (const k of placesIn(st.text)) if (k !== 'turfs') assert.ok(map.pois.some((p) => p.kind === k), `${st.title}: {{${k}}} is not a place on the map`);
    const out = fillNames(map, st.text);
    assert.ok(!/\{\{/.test(out), `${st.title}: unresolved place token in "${out}"`);
    assert.ok(!/undefined|NaN/.test(out + stepExtra(map, st)), `${st.title}: undefined value in text`);
  }
});

test('every control in the tutorial exists, and every control is taught', () => {
  const used = new Set(STEPS.flatMap((s) => actionsIn(s.text)));
  for (const a of used) assert.ok(KB[a] && PAD[a] && TOUCH[a], `[[${a}]] has no binding on every device`);
  for (const a of ACTIONS) assert.ok(used.has(a), `control "${a}" is never explained in the tutorial`);
});

test('every kind of place in the city is covered by the tour', () => {
  const covered = new Set();
  for (const st of STEPS) {
    for (const k of placesIn(st.text)) covered.add(k);
    for (const key of ['poi', 'pois']) if (st.at && st.at[key]) covered.add(st.at[key]);
    if (st.route) for (const end of [st.route.from, st.route.to]) if (end.poi) covered.add(end.poi);
    if (st.at && st.at.homes) covered.add('home');
  }
  const kinds = new Set(map.pois.map((p) => p.kind));
  for (const k of kinds) assert.ok(covered.has(k), `place type "${k}" (${map.pois.find((p) => p.kind === k).label}) is not in the tutorial`);
});

test('every island and gang turf is shown', () => {
  for (const k of Object.keys(ISLANDS)) assert.ok(STEPS.some((s) => s.at && s.at.island === k), `island ${ISLANDS[k].name} has no tutorial stop`);
  assert.ok(DISTRICTS.some((d) => d.turf) ? STEPS.some((s) => s.at && s.at.turf) : true, 'gang turf has no tutorial stop');
  assert.ok(map.cameras.length && STEPS.some((s) => s.at && s.at.cameras), 'traffic cameras have no tutorial stop');
  assert.ok(map.dropSites.length && STEPS.some((s) => s.at && s.at.dropSites), 'contraband drop sites have no tutorial stop');
});

test('every gameplay rule is explained (numbers come from shared/rules.js)', () => {
  // rules that are deliberately not player-facing
  const internal = new Set(['BAIL_SPEED', 'BAIL_HURT_PER_PX', 'TRAIN_ACCEL', 'TRAIN_BRAKE', 'LIMP_SPEED']);
  for (const name of Object.keys(rules)) {
    if (internal.has(name)) continue;
    assert.ok(new RegExp(`\\$\\{[^}]*\\b${name}\\b`).test(src), `rule ${name} is not used in the tutorial text`);
  }
});

test('every world event type is explained', async () => {
  const { EVENT_KINDS } = await import('../shared/worldevents.js');
  const all = STEPS.map((s) => s.text).join(' ').toLowerCase() + src.toLowerCase();
  for (const [k, e] of Object.entries(EVENT_KINDS)) assert.ok(all.includes(`event_kinds.${k}`) || all.includes(e.label.toLowerCase()), `event "${e.label}" is not in the tutorial`);
});
