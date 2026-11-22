// The audit's lint run (tools/audit/harness.mjs, or on its own: node --max-old-space-size=3072 tools/audit/run-lint.mjs):
// the whole placement lint on World v3, each row's count, and every hit written to docs/audit/hits.json
// ({ check, x, y, district, note } - x, y in tiles) for the fix pass.
import fs from 'node:fs';
import { TILE } from '../../shared/constants.js';

export default async function runLint(M) {
  const { lint, LINT_ALLOW } = await import(new URL('../placementlint.mjs', import.meta.url).href + `?t=${Date.now()}`);
  const t0 = Date.now(), L = lint(M), hits = [], counts = {};
  for (const [check, l] of Object.entries(L.rows)) {
    counts[check] = { n: l.length, allowed: LINT_ALLOW[check] || 0 };
    for (const r of l) { const D = M.districtAt(r.x, r.y); hits.push({ check, x: Math.round(r.x / TILE), y: Math.round(r.y / TILE), district: D ? D.name : '', note: `${r.what}${r.why ? ` (${r.why})` : ''}` }); }
  }
  fs.writeFileSync(new URL('../../docs/audit/hits.json', import.meta.url), JSON.stringify({ built: 'World v3, seed 1337', date: '2026-11-19', counts, hits }, null, 0).replace(/\},\{"check"/g, '},\n{"check"'));
  return `${Date.now() - t0} ms\n${Object.entries(counts).map(([k, c]) => `${k}: ${c.n} (allowed ${c.allowed})`).join('\n')}\n${JSON.stringify(L.seen)}`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const { buildWorld3 } = await import('../../server/world3.js');
  const { map } = await buildWorld3(1337, { log: () => {} });
  console.log(await runLint(map));
}
