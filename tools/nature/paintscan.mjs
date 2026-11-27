// How every plant kind the world plants is painted, by number: for each of statics.js FLORA_SPECIES (three shapes),
// the share of its pixels painted darker than the floor (leaves under 46 of 255, the style anchor R1-D's darkest
// green; bark, stems and stone under 50), the share that comes out near-black lit as the game lights it at noon
// (under 50), and how wide its painted tones run (the 5th to the 95th percentile of its leaves). ROOT env: another
// checkout to read (the live one, for a before).  node tools/nature/paintscan.mjs out.json
import { writeFileSync } from 'node:fs';
const R = process.env.ROOT || new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const { makeStatic, FLORA_SPECIES } = await import(R + '/client/art2/game/statics.js');
const { F_LEAF } = await import(R + '/client/art2/gbuf.js');
const { PRESETS_GAME } = await import(R + '/client/art2/game/lightgame.js');
const P = PRESETS_GAME.noon, sl = Math.hypot(...P.sunDir), sun = P.sunDir.map((v) => v / sl);
const lum = (c, j) => c[j] * 0.3 + c[j + 1] * 0.59 + c[j + 2] * 0.11;
function lit(G, i) { const j = i * 4, n = [G.nrm[j] / 127.5 - 1, G.nrm[j + 1] / 127.5 - 1, G.nrm[j + 2] / 127.5 - 1], l = Math.hypot(...n) || 1, d = Math.max(0, (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / l), kk = n[2] / l * 0.5 + 0.5; let o = 0; const w = [0.3, 0.59, 0.11];
  for (let c = 0; c < 3; c++) { let v = Math.pow(G.col[j + c] / 255, 2.2) * (P.ambGround[c] + (P.ambSky[c] - P.ambGround[c]) * kk + P.sunCol[c] * d); v = v / (1 + v * 0.18); o += Math.pow(v, 1 / 2.2) * 255 * w[c]; } return o; }
const out = {}; let N = 0, D = 0, PD = 0;
for (const sp of FLORA_SPECIES) {
  let n = 0, low = 0, dark = 0; const L = [];
  for (let v = 0; v < 3; v++) { const G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k: 1.2 }); if (!G || !G.w) continue;
    for (let i = 0; i < G.w * G.h; i++) { if (!G.col[i * 4 + 3]) continue; const leaf = G.flag[i] & F_LEAF, l = lum(G.col, i * 4); n++; if (l < (leaf ? 46 : 50) - 3) low++; if (lit(G, i) < 50) dark++; if (leaf) L.push(l); } }
  if (!n) continue;
  L.sort((a, b) => a - b);
  out[sp] = { n, low: +(low / n * 100).toFixed(1), dark: +(dark / n * 100).toFixed(1), p5: L.length ? Math.round(L[Math.floor(L.length * 0.05)]) : 0, p50: L.length ? Math.round(L[L.length >> 1]) : 0, p95: L.length ? Math.round(L[Math.floor(L.length * 0.95)]) : 0 };
  N += n; D += dark; PD += low;
}
const ks = Object.keys(out);
console.log(`${ks.length} kinds: painted under the floor ${(PD / N * 100).toFixed(1)}% of all pixels, near-black at noon ${(D / N * 100).toFixed(1)}%; kinds with over 5% painted under the floor: ${ks.filter((k) => out[k].low > 5).length}, over 15% near-black at noon: ${ks.filter((k) => out[k].dark > 15).length}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out));
