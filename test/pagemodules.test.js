// The page's modules parse and link (2026-10-18: a clash of two `BOARD`s in client/main.js - a SyntaxError in the page's
// own script - left the title screen dead on every device while every other test passed, since none of them load the
// page). Every module under client/, shared/ and server/ (the practice worker runs the server in the page) is parsed as
// the browser parses it, and the whole graph linked: each static import's file exists and exports the names imported
// from it. Nothing is run (the page's modules want a DOM).
// The check runs in a child node with --experimental-vm-modules (node:vm SourceTextModule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const CHILD = `
import vm from 'node:vm';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
const root = process.argv[1], files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'node_modules') walk(p); } else if (n.endsWith('.js')) files.push(p); } };
walk(join(root, 'client')); walk(join(root, 'shared')); walk(join(root, 'server'));
const ctx = vm.createContext({}), mods = new Map(), bad = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // (a classic script - a worker's importScripts, the service worker - is left to the browser)
  if (!/^\\s*(import|export)\\b/m.test(src)) continue;
  try { mods.set(f, new vm.SourceTextModule(src, { identifier: relative(root, f), context: ctx })); }
  catch (e) { bad.push(relative(root, f) + ': ' + e.message); }
}
const builtins = new Map();
const linker = async (spec, from) => {
  if (spec.startsWith('node:') || !spec.startsWith('.')) {   // (a node built-in: the server's, the practice worker never reaches it)
    if (!builtins.has(spec)) { const real = await import(spec), names = Object.keys(real); builtins.set(spec, new vm.SyntheticModule(names, function () { for (const k of names) this.setExport(k, real[k]); }, { context: ctx, identifier: spec })); }
    return builtins.get(spec);
  }
  const f = resolve(dirname(join(root, from.identifier)), spec.split('?')[0]);
  const m = mods.get(f);
  if (!m) throw new Error(from.identifier + ' imports ' + spec + ': no such module');
  return m;
};
for (const [f, m] of mods) {
  if (m.status !== 'unlinked') continue;   // (linked already, as another's import)
  try { await m.link(linker); }
  catch (e) { bad.push(relative(root, f) + ': ' + e.message); }
}
console.log(JSON.stringify({ n: mods.size, bad: [...new Set(bad)] }));
`;

test("the page's modules parse and link (no syntax errors, no missing imports)", () => {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '--input-type=module', '-e', CHILD, ROOT], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const line = (r.stdout || '').trim().split('\n').pop();
  assert.ok(line && line.startsWith('{'), `the check ran: ${r.stderr}`);
  const out = JSON.parse(line);
  assert.ok(out.n > 150, `${out.n} modules checked`);
  assert.deepEqual(out.bad, [], out.bad.join('\n'));
});
