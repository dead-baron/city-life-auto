// A function that declares a local with the name of a module-level helper it also calls before that line throws
// ("Cannot access 'row' before initialization"): the local shadows the helper for the whole function. That broke the
// character creator's Customize pages (2026-10-13: client/creator.js renderPage's `const row`). This finds the pattern
// in the page's and the server's code: a top-level function that uses NAME and later declares a const/let NAME, where
// NAME is also a module-level const or function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
function jsFiles(dir) {
  const out = [];
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = join(dir, n), s = statSync(join(ROOT, p));
    if (s.isDirectory()) out.push(...jsFiles(p));
    else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}
const strip = (line) => line.replace(/\/\/.*$/, '').replace(/`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');

test('no function uses a module-level helper and then declares a local of the same name', () => {
  const found = [];
  for (const f of [...jsFiles('client'), ...jsFiles('server'), ...jsFiles('shared')]) {
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    const top = new Set();
    for (const l of lines) {
      const m = /^(?:export\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/.exec(l);
      if (m) top.add(m[1]);
    }
    for (let i = 0; i < lines.length; i++) {
      if (!/^(?:export\s+)?(?:async\s+)?function\s/.test(lines[i])) continue;
      let end = i + 1;
      while (end < lines.length && !/^}/.test(lines[end])) end++;
      const body = lines.slice(i + 1, end).map(strip);
      body.forEach((l, k) => {
        const m = /^\s+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(l);
        if (!m || !top.has(m[1])) return;
        const re = new RegExp(`(^|[^\\w$.])${m[1].replace(/\$/g, '\\$')}\\s*\\(`);
        const used = body.slice(0, k).findIndex((b) => re.test(b));
        if (used >= 0) found.push(`${f}:${i + 2 + k}: ${m[1]} (called on line ${i + 2 + used})`);
      });
      i = end;
    }
  }
  assert.deepEqual(found, [], 'a local shadowing a helper the function already used:\n' + found.join('\n'));
});
