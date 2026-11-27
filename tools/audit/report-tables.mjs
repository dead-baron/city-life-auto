// The audit report's tables from docs/audit/hits.json (no world build): per check its count, its hits by district and
// 20 locations spread over the districts (round robin, the busiest district first).
//   node tools/audit/report-tables.mjs > docs/audit/parts/tables.md
import fs from 'node:fs';

const H = JSON.parse(fs.readFileSync(new URL('../../docs/audit/hits.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const out = [];
for (const [check, c] of Object.entries(H.counts)) {
  if (!c.n || (only.length && !only.includes(check))) continue;
  const l = H.hits.filter((h) => h.check === check), by = new Map();
  for (const h of l) { const k = h.district || '(sea)'; if (!by.has(k)) by.set(k, []); by.get(k).push(h); }
  const ds = [...by.entries()].sort((a, b) => b[1].length - a[1].length), pick = [];
  for (let i = 0; pick.length < 20 && pick.length < l.length; i++) for (const [, hs] of ds) if (hs[i] && pick.length < 20) pick.push(hs[i]);
  out.push(`#### ${check} - ${c.n}\nBy district: ${ds.map(([d, hs]) => `${d} ${hs.length}`).join(', ')}\n`);
  out.push('| District | Tile | What |\n|---|---|---|');
  for (const h of pick) out.push(`| ${h.district || '(sea)'} | ${h.x}, ${h.y} | ${h.note.replace(/\|/g, '/')} |`);
  out.push('');
}
console.log(out.join('\n'));
