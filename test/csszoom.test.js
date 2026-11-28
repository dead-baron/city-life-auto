// A desktop's panels are scaled with CSS zoom (client/style.css --zk: the hub's frames, the pause menu, the debug
// panel, the map's bar and legend, the title screens), and inside a zoomed box a pointer's offsetX / offsetY (and
// layerX / layerY) don't match the canvas's own pixels - a zoom of 1.5 put a click half again off (the respawn map, 11-17).
// So no page code reads them: a click on a canvas is placed from clientX / clientY against getBoundingClientRect, as a
// share of its width and height (pool.js, deathscreen.js, devtp.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : (f.endsWith('.js') ? [p] : []);
});

test('pointer positions never come from offsetX / layerX (wrong inside a CSS-zoomed panel)', () => {
  const bad = [];
  for (const f of files(new URL('../client', import.meta.url).pathname)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\.(offsetX|offsetY|layerX|layerY)\b/.test(code)) bad.push(`${f.split('/client/')[1]}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], `read clientX/Y against getBoundingClientRect instead: ${bad.join(', ')}`);
});
