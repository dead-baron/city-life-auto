// The audit's probe (run through tools/audit/harness.mjs): the shape of a built map - its fields, the props' and the
// places' kinds - to write the audit's lint rows against.
const js = (v, n) => { try { return String(JSON.stringify(v)).slice(0, n); } catch { return '(circular)'; } };
const shape = (v) => {
  if (v === null || v === undefined) return String(v);
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}[${v.length}]`;
  if (Array.isArray(v)) return `Array[${v.length}] first=${js(v.find((x) => x), 300)}`;
  if (v instanceof Map) { const e = v.entries().next().value; return `Map[${v.size}] first=${js(e, 200)}`; }
  if (v instanceof Set) return `Set[${v.size}]`;
  if (typeof v === 'function') return 'function';
  if (typeof v === 'object') return `Object keys=${Object.keys(v).slice(0, 30).join(',')} ${js(v, 200)}`;
  return js(v, 100);
};
export default function probe(M) {
  const out = [];
  for (const k of Object.keys(M)) out.push(`${k}: ${shape(M[k])}`);
  const count = (arr, f) => { const c = {}; for (const x of arr) if (x) { const k = f(x); c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  out.push('\nPROP KINDS: ' + count(M.props, (p) => p.t).map(([k, n]) => `${k}:${n}`).join(' '));
  out.push('\nPOI KINDS: ' + count(M.pois, (p) => p.kind).map(([k, n]) => `${k}:${n}`).join(' '));
  out.push('\nBUILDING KINDS: ' + count(M.buildings, (b) => b.kind).map(([k, n]) => `${k}:${n}`).join(' '));
  for (const b of M.buildings.filter((b) => b && b.door && b.name).slice(0, 3)) out.push('\nBUILDING: ' + js(b, 900));
  for (const p of M.pois.filter((p) => p && p.b !== undefined).slice(0, 3)) out.push('\nPOI: ' + js(p, 600));
  return out.join('\n');
}
