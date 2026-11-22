// Render the fixed places (tools/regress/places.json) as the game bakes them, into one folder - before a world or art
// change, then after, then `python3 tools/regress/diff.py BEFORE AFTER` lists the places that changed (package 5; the
// owner, 11-21: "issues that broke when another fixed"). One world build for all of them (tools/area-shot.mjs).
//   node tools/regress/shots.mjs OUTDIR [--night] [--only id,id]   (heavy: under flock /tmp/cla-heavy.lock, ~10 min)
import { readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [out, ...rest] = process.argv.slice(2);
if (!out) { console.log('usage: node tools/regress/shots.mjs OUTDIR [--night] [--only id,id]'); process.exit(1); }
const night = rest.includes('--night'), oi = rest.indexOf('--only'), only = oi >= 0 ? new Set(rest[oi + 1].split(',')) : null;
const { places } = JSON.parse(readFileSync(join(ROOT, 'tools/regress/places.json'), 'utf8'));
mkdirSync(out, { recursive: true });
const args = [join(ROOT, 'tools/area-shot.mjs')];
for (const p of places) {
  if (only && !only.has(p.id)) continue;
  args.push('--rect', p.rect.join(','), '--s', '4', '--out', join(out, `${p.id}.png`));
  if (night) args.push('--night');
}
const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=3072' } });
process.exit(r.status || 0);
