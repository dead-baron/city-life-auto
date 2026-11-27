// The audit's third probe (tools/audit/harness.mjs): plants by tile, the marsh's boardwalk, the towns, the rail's bridges.
import { TILE, T } from '../../shared/constants.js';
const js = (v, n = 600) => { try { return String(JSON.stringify(v)).slice(0, n); } catch { return '(circular)'; } };
export default function probe3(M) {
  const out = [], TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return M.inside(tx, ty) ? M.tiles[M.idx(tx, ty)] : -1; };
  const c = {};
  for (const p of M.props) if (p && /^(tree_|palm_|shrub_|bush_|hedge|planter|redwood|topiary|potted)/.test(p.t)) { const t = TN[tileAt(p.x, p.y)]; if (t === 'SIDEWALK' || t === 'ROAD' || t === 'LOT' || t === 'BRIDGE' || t === 'PLAZA') { const k = `${p.t}@${t}`; c[k] = (c[k] || 0) + 1; } }
  out.push('plants on paving: ' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' '));
  const tr = M.props.filter((p) => p && p.t === 'tree_a' && TN[tileAt(p.x, p.y)] === 'SIDEWALK').slice(0, 3);
  out.push('tree_a on sidewalk e.g. ' + js(tr));
  out.push('\nmarsh: ' + js(M.world3.marsh, 1500));
  out.push('\ntowns: ' + js(M.world3.towns, 1200));
  out.push('\nbeach: ' + js(M.world3.beach, 600));
  // the rail's bridge points: what's under them
  const u = {};
  for (const r of M.rails) for (const q of r.pts) if (q.bridge || q.deck) { const k = `${q.bridge ? 'bridge' : 'deck'}@${TN[tileAt(q.x, q.y)]}`; u[k] = (u[k] || 0) + 1; }
  out.push('\nrail bridge/deck pts over: ' + js(u));
  const w = {};
  for (const r of M.rails) for (const q of r.pts) { const t = TN[tileAt(q.x, q.y)]; if (t === 'WATER' || t === 'DEEP' || t === 'BRIDGE') { const k = `${t}${q.tunnel ? '/tun' : ''}${q.under ? '/under' : ''}${q.subway ? '/sub' : ''}`; w[k] = (w[k] || 0) + 1; } }
  out.push('rail pts on water/bridge tiles: ' + js(w));
  const styles = {}; for (let ty = M.y0; ty < M.y0 + M.h; ty += 16) for (let tx = M.x0; tx < M.x0 + M.w; tx += 16) { const D = M.districtAt(tx * TILE, ty * TILE); if (D) styles[D.style] = (styles[D.style] || new Set()).add(D.name); }
  out.push('\nstyles: ' + Object.entries(styles).map(([s, n]) => `${s}: ${[...n].join('/')}`).join(' | '));
  out.push('\nfestoon k: ' + js(M.props.filter((p) => p && p.t === 'festoon').reduce((o, p) => ((o[p.k || 'bulbs'] = (o[p.k || 'bulbs'] || 0) + 1), o), {})));
  return out.join('\n');
}
