// Modules in an import cycle that hand each other a function as they load must work whichever loads first (H69): the
// homes.js menu builder (fixed at wave 26's merge) and police.js's car-arrest hook (streetlife.js sets it as it loads)
// threw "Cannot access ... before initialization" when they were the first one loaded. Each here is loaded first, alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FIRST = ['server/systems/police.js', 'server/systems/homes.js', 'server/systems/station.js', 'server/systems/streetlife.js', 'server/systems/homeinside.js', 'server/systems/economy.js'];

test('the modules that hand each other functions load whichever is first', () => {
  const env = { ...process.env, CLA_DATA_DIR: mkdtempSync(join(tmpdir(), 'cla-load-')) };
  for (const f of FIRST) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import('./${f}');`], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, `${f} loaded first: ${(r.stderr || '').split('\n').filter((l) => /Error/.test(l)).join(' ')}`);
  }
});
