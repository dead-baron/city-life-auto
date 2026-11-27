// No merge conflict markers in anything that ships or documents it (11-23: a merge's markers went to main in docs/DEVLOG.md
// with a script that committed on through a conflict). Every text file under the checkout's own folders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const DIRS = ['client', 'server', 'shared', 'docs', 'tools', 'test', 'deploy'], TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.md', '.sh', '.py', '.txt']);
function* files(dir) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n), st = statSync(p);
    if (st.isDirectory()) yield* files(p); else if (TEXT.has(extname(n)) && st.size < 8 << 20) yield p;
  }
}

test('no merge conflict markers anywhere', () => {
  const bad = [];
  const look = (p) => { const s = readFileSync(p, 'utf8'); if (/^(<{7}|>{7}) /m.test(s) || /^<{7}$|^>{7}$/m.test(s)) bad.push(p.slice(ROOT.length)); };
  for (const d of DIRS) { try { for (const p of files(join(ROOT, d))) look(p); } catch { /* a folder this checkout hasn't */ } }
  for (const f of ['index.html', 'version.json', 'README.md', 'CLAUDE.md']) { try { look(join(ROOT, f)); } catch { /* none */ } }
  assert.deepEqual(bad, []);
});
