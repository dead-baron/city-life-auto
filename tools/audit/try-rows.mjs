// The audit's try-out (tools/audit/harness.mjs): runs the world rows and prints each row's count, its first hits and how long
// it took - to tune the rows before they go in the placement lint.
import { auditRows } from './worldrows.mjs';
export default async function tryRows(M) {
  const rows = {}, seen = {}, t0 = Date.now();
  const mod = await import(new URL('./worldrows.mjs', import.meta.url).href + `?t=${Date.now()}`);
  void auditRows;
  mod.auditRows(M, rows, seen);
  const out = [`${Date.now() - t0} ms`, JSON.stringify(seen)];
  for (const [k, l] of Object.entries(rows)) {
    out.push(`\n${k}: ${l.length}`);
    const by = {}; for (const r of l) { const d = M.districtAt(r.x, r.y).name; by[d] = (by[d] || 0) + 1; }
    out.push('  by district: ' + Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, n]) => `${d} ${n}`).join(', '));
    const kinds = {}; for (const r of l) { const k = String(r.what).replace(/[\d.]+/g, '#').slice(0, 40); kinds[k] = (kinds[k] || 0) + 1; }
    out.push('  by what: ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, n]) => `${d} ${n}`).join(', '));
    for (const r of l.slice(0, 6)) out.push(`  ${r.what} at ${Math.round(r.x / 32)}, ${Math.round(r.y / 32)}${r.why ? ` (${r.why})` : ''}`);
  }
  return out.join('\n');
}
