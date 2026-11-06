// What a returning page waits for after a deploy (client/bootplan.js, used by client/boot.js): only the code it runs;
// the pictures, fonts and server/ go to the background; a new stylesheet alone is swapped in place, not a reload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updatePlan } from '../client/bootplan.js';

const meta = (files) => ({ version: 'new', files: Object.keys(files), hashes: Object.values(files) });
const OLD = { 'index.html': 'a', 'client/boot.js': 'a', 'client/bootplan.js': 'a', 'client/style.css': 'a', 'client/main.js': 'a', 'shared/map.js': 'a', 'server/world.js': 'a', 'assets/logo.png': 'a', 'assets/fonts/X.woff': 'a', 'assets/map/meta.json': 'a', 'assets/atlas0.png': 'a', 'manifest.webmanifest': 'a' };

test('only the changed code is waited for; pictures, fonts and server files go to the background', () => {
  const p = updatePlan(meta({ ...OLD, 'client/main.js': 'b', 'shared/map.js': 'b', 'server/world.js': 'b', 'assets/logo.png': 'b', 'assets/fonts/X.woff': 'b', 'assets/map/meta.json': 'b' }), OLD);
  assert.deepEqual(p.now, ['client/main.js', 'shared/map.js']);
  assert.deepEqual(p.later.sort(), ['assets/fonts/X.woff', 'assets/logo.png', 'assets/map/meta.json', 'server/world.js']);
  assert.equal(p.reload, false);
  assert.equal(p.css, false);
});

test('a new stylesheet alone is swapped in place; a new page or loader reloads', () => {
  const css = updatePlan(meta({ ...OLD, 'client/style.css': 'b', 'client/main.js': 'b' }), OLD);
  assert.equal(css.reload, false);
  assert.equal(css.css, true);
  assert.deepEqual(css.now, ['client/main.js'], 'the swap fetches the stylesheet itself');
  for (const f of ['index.html', 'client/boot.js', 'client/bootplan.js']) {
    const p = updatePlan(meta({ ...OLD, [f]: 'b', 'client/style.css': 'b' }), OLD);
    assert.equal(p.reload, true, f);
    assert.equal(p.css, false, f);
    assert.ok(p.now.includes('client/style.css'), 'reloading: the stylesheet is fetched before');
  }
  assert.equal(updatePlan(meta({ ...OLD, 'manifest.webmanifest': 'b' }), OLD).reload, false, 'the manifest needs no reload');
});

test('not knowing what this browser had: everything again, and a reload; the classic sheets only for ?art=1', () => {
  const p = updatePlan(meta(OLD), null);
  assert.equal(p.reload, true);
  assert.equal(p.diff, false);
  assert.ok(p.now.includes('client/main.js') && p.later.includes('assets/logo.png'));
  assert.ok(!p.later.includes('assets/atlas0.png'));
  assert.ok(updatePlan(meta(OLD), null, true).later.includes('assets/atlas0.png'));
  assert.deepEqual(updatePlan(meta(OLD), OLD).now, [], 'nothing changed: nothing fetched');
});

test('boot.js uses the plan: waits for plan.now, reloads on plan.reload, swaps the stylesheet', () => {
  const src = readFileSync(new URL('../client/boot.js', import.meta.url), 'utf8');
  assert.match(src, /const \{ updatePlan \} = await import\('\.\/bootplan\.js'\);/, 'loaded only for a new build (the page\'s code budget: tools/perf.mjs)');
  assert.match(src, /const list = plan\.now;/);
  assert.match(src, /plan\.reload/);
  assert.match(src, /plan\.css/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="modulepreload" href="client\/bootplan\.js">/, 'fetched beside boot.js, not after it');
});
