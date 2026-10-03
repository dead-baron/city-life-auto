// Writes version.json: a content hash of everything the browser loads plus the file list.
// client/boot.js compares it with the last version this browser ran; when it changed, every file is
// re-fetched with cache: 'reload' before the game starts, so a push to GitHub Pages is live
// immediately instead of after the 10-minute HTTP cache expires. Run before committing:
//   node tools/stamp-version.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['client', 'shared', 'server', 'assets'];
const SKIP = /(^|\/)(node_modules|data|logs|fonts\/OFL)/;
const files = [];
const walk = (d) => {
  for (const n of readdirSync(join(ROOT, d))) {
    const p = join(d, n);
    if (SKIP.test(p)) continue;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p);
    else if (/\.(js|css|json|png|webp|woff)$/.test(n)) files.push(relative(ROOT, join(ROOT, p)));
  }
};
for (const d of DIRS) walk(d);
files.sort();
const h = createHash('sha1');
for (const f of files) { h.update(f); h.update(readFileSync(join(ROOT, f))); }
const version = h.digest('hex').slice(0, 12);
writeFileSync(join(ROOT, 'version.json'), JSON.stringify({ version, built: new Date().toISOString(), files }, null, 0) + '\n');
console.log('version', version, files.length, 'files');
