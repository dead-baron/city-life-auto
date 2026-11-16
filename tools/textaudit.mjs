// The lettering on a front, whole and clear (the placement lint's textClipped; the owner, 11-15: First Pixel Bank's
// portico BANK read BAN, then ANK - a lit window's glow behind its letters). textAudit(spec) draws the facade as the
// bake does (client/art2/buildings.js, listening through tapText) and says, for each lettered board or inscription,
// whether it ran off the facade's edge, was painted over by something drawn after it, or - stone lettering, unlit -
// has a glow showing through: [{ k, t, why }] (none: []).
import { makeBuilding, tapText } from '../client/art2/buildings.js';

export function textAudit(spec) {
  const L = [];
  tapText((G, k, t, x0, y0, x1, y1, lit = false) => {
    const out = x0 < 0 || y0 < 0 || x1 > G.w || y1 > G.h, X0 = Math.max(0, x0), Y0 = Math.max(0, y0), X1 = Math.min(G.w, x1), Y1 = Math.min(G.h, y1);
    const col = [];
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const j = (y * G.w + x) * 4; col.push(G.col[j], G.col[j + 1], G.col[j + 2]); }
    L.push({ G, k, t, X0, Y0, X1, Y1, out, col, lit });
  });
  try { makeBuilding(spec); } finally { tapText(null); }
  const bad = [];
  for (const e of L) {
    const { G } = e;
    let over = 0, shine = 0, n = 0, i = 0;
    for (let y = e.Y0; y < e.Y1; y++) for (let x = e.X0; x < e.X1; x++, i++) {
      const j = (y * G.w + x) * 4;
      n++;
      if (G.col[j] !== e.col[i * 3] || G.col[j + 1] !== e.col[i * 3 + 1] || G.col[j + 2] !== e.col[i * 3 + 2]) over++;
      if (!e.lit && G.emi[j + 3] > 0) shine++;
    }
    const why = e.out ? 'off the edge of its front' : over > n * 0.02 ? `${Math.round(100 * over / n)}% painted over` : shine > n * 0.02 ? `a glow through ${Math.round(100 * shine / n)}% of it` : null;
    if (why) bad.push({ k: e.k, t: e.t, why });
  }
  return bad;
}
