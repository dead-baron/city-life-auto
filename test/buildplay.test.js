// The player-only page (docs/PRIVATE-REPO.md, the owner's go 11-27): what a browser needs and nothing else - and the
// game server no longer hands anyone its own code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playFiles, missingImports, buildPlay } from '../tools/build-play.mjs';

test('the build holds the page, its code and its art - never the server, tools, tests, docs or deploy scripts', () => {
  const files = playFiles();
  for (const f of ['index.html', 'version.json', 'client/main.js', 'client/boot.js', 'shared/mapcore.js', 'shared/map.js', 'about/index.html']) assert.ok(files.includes(f), f);
  assert.ok(files.some((f) => f.startsWith('assets/')), 'the art and sound');
  for (const f of files) assert.ok(!/^(server|tools|test|docs|deploy|scratchpad|data)\//.test(f) && !/^(CLAUDE|README)\.md$|^package\.json$/.test(f), `not for players: ${f}`);
  assert.ok(!files.includes('client/practice-worker.js'), 'the paused practice worker (it runs the server\'s code) stays out');
  assert.deepEqual(missingImports(files), [], 'everything the page imports is in the build');
});
test('built into a folder: copied, then only what changed; what left the build removed; its LICENSE and README', () => {
  const out = mkdtempSync(join(tmpdir(), 'play-'));
  try {
    const a = buildPlay(out);
    assert.equal(a.copied, a.files);
    assert.ok(existsSync(join(out, 'LICENSE')) && /All rights reserved/.test(readFileSync(join(out, 'LICENSE'), 'utf8')));
    writeFileSync(join(out, 'stale.js'), '//');
    const b = buildPlay(out);
    assert.equal(b.copied, 0, 'nothing changed: nothing copied');
    assert.equal(b.removed, 1); assert.ok(!existsSync(join(out, 'stale.js')), 'a file no longer in the build is gone');
  } finally { rmSync(out, { recursive: true, force: true }); }
});
test('the game server serves the page\'s files only - not server/', () => {
  const src = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const roots = src.match(/const STATIC_ROOTS = (\[[^\]]*\])/);
  assert.ok(roots, 'STATIC_ROOTS');
  assert.deepEqual(JSON.parse(roots[1].replace(/'/g, '"')), ['client/', 'shared/', 'assets/']);
});
