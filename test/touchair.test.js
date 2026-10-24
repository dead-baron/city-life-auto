// At the controls of an aircraft on a touch screen (H69): the climb and descend buttons clear of FIRE and the brake -
// the climb button sat under FIRE's lower half (the phone playtest: tapping just above ▲ fired).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../client/style.css', import.meta.url), 'utf8');
const BASE = css.match(/#tbtns button \{[^}]*\}/)[0];
const px = (r, k) => { const m = new RegExp(`(?:^|[ ;{])${k}: (?:max\\()?(\\d+)px`).exec(r); return m ? Number(m[1]) : null; };   // (max(10px, the safe area): its 10)
// a #tbtns button's box from its own rules: right offset (past the safe area), bottom, width, height
function box(cls) {
  const rules = [...css.matchAll(new RegExp(`(?:^|\\n)#tbtns \\.${cls}[ ,][^{]*\\{[^}]*\\}`, 'g'))].map((m) => m[0]);
  const pos = rules.filter((r) => /right: calc/.test(r)).pop(), sized = rules.filter((r) => /width:/.test(r)).pop() || BASE;
  assert.ok(pos, cls);
  const right = Number(/\+ (\d+)px\)/.exec(pos)[1]), bottom = px(pos, 'bottom');
  return { cls, x0: right, x1: right + px(sized, 'width'), y0: bottom, y1: bottom + px(sized, 'height') };
}
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('in the air the climb and descend buttons overlap neither FIRE, the brake nor each other', () => {
  const up = box('climb'), down = box('descend');
  for (const b of [box('fire'), box('dive'), down]) assert.ok(!overlap(up, b), `climb clear of ${b.cls} (${JSON.stringify(up)} vs ${JSON.stringify(b)})`);
  for (const b of [box('fire'), box('dive')]) assert.ok(!overlap(down, b), `descend clear of ${b.cls}`);
  assert.match(css, /body\.in-air #tbtns \.horn, body\.in-air #tbtns \.reload \{ display: none; \}/, 'what shares the climb button\'s place is put away up there');
  assert.match(css, /body\.in-air #tbtns \.dive \{ display: none; \}/, 'BRAKE put away in the air (its place is DOWN\'s on a phone held upright)');
});
