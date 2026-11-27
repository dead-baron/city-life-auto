// The player-only page (docs/PRIVATE-REPO.md): what a browser needs to play, and nothing else - the page, its code
// (client/, shared/), its art and sounds (assets/), the About page - copied into a folder: the public repository GitHub
// Pages serves once the development repository is private (deploy/publish-play.sh puts each new build there). Never
// the server, the tools, the tests, the docs or the deploy scripts.
//   node tools/build-play.mjs <folder>     (the folder's own .git is kept; everything else in it is made to match)
// It checks itself: every import in the copied code resolves to a file in the build, or it fails and copies nothing
// more. Zero dependencies.
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// what goes: whole folders, single files - and what stays out of them
export const PLAY_DIRS = ['client', 'shared', 'assets', 'about'];
export const PLAY_FILES = ['index.html', 'version.json', 'manifest.webmanifest', 'sw.js'];
const SKIP = new Set(['client/practice-worker.js']);   // (the paused offline practice: it runs the server's code - CLAUDE.md)
const LICENSE = `Copyright (c) 2026 Dead Baron. All rights reserved.

City Life Auto - its code, art, music, writing and design - may not be copied, modified, redistributed or hosted
elsewhere without written permission. You're welcome to play it at https://deadbaron.com/city-life-auto/.

Fonts, icons and other parts made by others keep their own licenses (assets/fonts, assets/icons, assets/prompts).
`;
const README = `# City Life Auto

This repository only holds the published game page: play at https://deadbaron.com/city-life-auto/.
Built automatically - please don't open pull requests here. Copyright (c) 2026 Dead Baron, all rights reserved (LICENSE).
`;

// every file of the build, relative to the repository ('/'-separated)
export function playFiles(root = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const rel = d + '/' + e.name;
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(rel);
      else if (e.isFile() && !SKIP.has(rel)) out.push(rel);
    }
  };
  for (const d of PLAY_DIRS) if (existsSync(join(root, d))) walk(d);
  for (const f of PLAY_FILES) if (existsSync(join(root, f))) out.push(f);
  return out.sort();
}

// the imports in a JS file that point at files (relative ones; bare names and URLs aren't files of ours)
const IMPORT_RE = /(?:\bimport\s*(?:[\w*${}\s,]+?\s*from\s*)?|\bexport\s*[\w*${}\s,]+?\s*from\s*|\bimport\s*\(\s*|new\s+URL\s*\(\s*|new\s+Worker\s*\(\s*(?:new\s+URL\s*\(\s*)?)(['"])(\.{1,2}\/[^'"]+)\1/g;
export function missingImports(files, root = ROOT) {
  const have = new Set(files), missing = [];
  for (const f of files) {
    if (!f.endsWith('.js') && !f.endsWith('.mjs')) continue;
    const src = readFileSync(join(root, f), 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      if (m[2].endsWith('/')) continue;   // (a folder: a base URL to resolve against)
      const target = relative(root, resolve(join(root, dirname(f)), m[2].split('?')[0].split('#')[0])).split(sep).join('/');
      if (!have.has(target) && !SKIP.has(target)) missing.push(`${f} -> ${m[2]}`);   // (the paused practice worker: named, never started)
    }
  }
  return missing;
}

// the build into `out`: files copied only where they changed, ones no longer in it removed; its LICENSE and README
export function buildPlay(out, root = ROOT) {
  const files = playFiles(root), bad = missingImports(files, root);
  if (bad.length) throw new Error(`the page would load what isn't in the build:\n  ${bad.slice(0, 20).join('\n  ')}`);
  mkdirSync(out, { recursive: true });
  const keep = new Set([...files, 'LICENSE', 'README.md']);
  let copied = 0, removed = 0;
  const clear = (d) => {
    for (const e of readdirSync(join(out, d), { withFileTypes: true })) {
      const rel = d ? d + '/' + e.name : e.name;
      if (!d && e.name === '.git') continue;
      if (e.isDirectory()) { clear(rel); if (!readdirSync(join(out, rel)).length) rmSync(join(out, rel), { recursive: true }); }
      else if (!keep.has(rel)) { rmSync(join(out, rel)); removed++; }
    }
  };
  clear('');
  for (const f of files) {
    const src = join(root, f), dst = join(out, f);
    if (existsSync(dst) && statSync(dst).size === statSync(src).size && readFileSync(dst).equals(readFileSync(src))) continue;
    mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); copied++;
  }
  writeFileSync(join(out, 'LICENSE'), LICENSE); writeFileSync(join(out, 'README.md'), README);
  return { files: files.length, copied, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node tools/build-play.mjs <folder>'); process.exit(2); }
  const r = buildPlay(resolve(out));
  console.log(`build-play: ${r.files} files (${r.copied} copied, ${r.removed} removed) -> ${out}`);
}
