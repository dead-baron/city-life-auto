// node ba.mjs out.json preset "sp:seed:k,..." : world plants (statics.js makeStatic {t:'f'}) at the art pixel, lit as
// the game lights them. ROOT env = the tree to draw from.
import { writeFileSync } from 'node:fs';
const R = process.env.ROOT || new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const [out, preset, list] = process.argv.slice(2);
if (process.env.TONE) globalThis.__FLORA_TONE = +process.env.TONE;
if (process.env.SIDE) globalThis.__SIDE = +process.env.SIDE;
const ST = await import(R + '/client/art2/game/statics.js');
const PK = await import(R + '/client/art2/game/chunkpack.js');
const LG = await import(R + '/client/art2/game/lightgame.js'); const P = LG.PRESETS_GAME[preset];
const { F_LEAF } = await import(R + '/client/art2/gbuf.js');
const sl = Math.hypot(...P.sunDir), sun = P.sunDir.map((v) => v / sl);
const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// (LEAF_WRAP / LEAF_SKY env: try the leaf light's numbers; default the game's - lightgame.js LEAF_LIGHT)
const LEAF_WRAP = +(process.env.LEAF_WRAP ?? (LG.LEAF_LIGHT ? LG.LEAF_LIGHT.wrap : 0)), LEAF_SKY = +(process.env.LEAF_SKY ?? (LG.LEAF_LIGHT ? LG.LEAF_LIGHT.sky : 0));
function light(w, h, col, nrmAt, flagAt) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = i * 4;
    if (col[j + 3] < 128) continue;
    const n = nrmAt(i);
    const fl0 = flagAt(i), LW = (fl0 & F_LEAF) ? LEAF_WRAP : 0;   // (lightgame.js shade: light wraps round a leafy mass)
    let d = Math.max(0, (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2] + LW) / (1 + LW));
    if (P.bands > 0.5) { const q = Math.floor(d * P.bands + 0.5 + (B[(y & 3) * 4 + (x & 3)] / 16 - 0.5 + 1 / 32) * 0.6) / P.bands; d += (Math.min(1, Math.max(0, q)) - d) * P.bandMix; }
    const fl = fl0, kk = (fl & F_LEAF) ? Math.max(n[2] * 0.5 + 0.5, LEAF_SKY) : n[2] * 0.5 + 0.5, c3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      let L = P.ambGround[c] + (P.ambSky[c] - P.ambGround[c]) * kk + P.sunCol[c] * d;
      if (fl & F_LEAF) L += P.sunCol[c] * P.leafGlow * Math.pow(Math.max(0, n[0] * sun[0] + n[1] * sun[1]), 2);
      let v = Math.pow(col[j + c] / 255, 2.2) * L; v = v / (1 + v * 0.18); v = Math.pow(v, 1 / 2.2);
      c3[c] = ((v - 0.5) * (P.contrast || 1.1) + 0.5) * 255 * (P.gain ? P.gain[c] : 1);
    }
    const l = c3[0] * 0.3 + c3[1] * 0.55 + c3[2] * 0.15;
    for (let c = 0; c < 3; c++) px[j + c] = Math.max(0, Math.min(255, l + (c3[c] - l) * (P.sat || 1.2)));
    px[j + 3] = 255;
  }
  return px;
}
if (process.env.FALL) { const W = await import(R + '/client/art2/water.js'); if (W.FALL_LOOK) W.FALL_LOOK.v = +process.env.FALL; }
const res = [];
const { readFileSync } = await import('node:fs');
const items = list.startsWith('@') ? JSON.parse(readFileSync(list.slice(1), 'utf8')) : list.split(',').map((item) => { const [sp, seed = '1', k = '1.35', c = '0'] = item.split(':'); return { name: sp, r: { t: 'f', sp, s: +seed, k: +k, c: +c } }; });
for (const { name: sp, r } of items) {
  // (an item { name, mod, fn, a } draws a maker that is not a world plant yet: mod's export fn called with a)
  const G = r && r.mod ? (await import(R + '/' + r.mod))[r.fn](...(r.a || [])) : ST.makeStatic(r);
  if (!G || !G.w) { console.log('nothing for', sp); continue; }
  let w, h, px;
  if (G.ap2) {
    const nrmAt = (i) => { const j = i * 4; if (G.nrm[j + 3] < 128) return [0, 0, 1]; const a = G.nrm[j] / 127.5 - 1, b = G.nrm[j + 1] / 127.5 - 1, c = G.nrm[j + 2] / 127.5 - 1, l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l]; };
    w = G.w; h = G.h; px = light(w, h, G.col, nrmAt, (i) => G.flag[i]);
  } else {
    const o = PK.packPlanes(G, 2).o;
    const nrmAt = (i) => { const j = i * 4; let ex = o.p1[j + 3] / 127 - 1, ey = o.p2[j + 3] / 127 - 1, nz = 1 - Math.abs(ex) - Math.abs(ey); const t = Math.max(-nz, 0); ex += ex >= 0 ? -t : t; ey += ey >= 0 ? -t : t; const l = Math.hypot(ex, ey, nz) || 1; return [ex / l, ey / l, nz / l]; };
    w = o.w; h = o.h; px = light(w, h, o.p0, nrmAt, (i) => o.p1[i * 4 + 2]);
  }
  res.push({ name: sp, w, h, px: px.toString('base64') });
}
writeFileSync(out, JSON.stringify(res));
console.log(res.map((r) => r.name + ' ' + r.w + 'x' + r.h).join(', '));
