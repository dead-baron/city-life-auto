// The near-black census: World v3 built as the server builds it, the chunks over each asked rectangle baked by the
// page's own bake, every pixel lit as the game lights it at noon (lightgame.js PRESETS_GAME.noon, no cast shadows) -
// the share that comes out near-black (under 50 of 255), and a picture with those pixels in magenta, so what is
// still painted too dark can be found by eye and by number; beside it the same picture unmarked (-lit.png) (the owner, 11-25: the darkness on trees and plants).
//   node tools/nature/darkscan.mjs [--find regex] --rect x0,y0,x1,y1 | --place "Name[:w,h]" [--out f.png] [...]
// (rect in frame tiles; --place: w x h tiles round a named place's middle; --find lists the places whose name matches). Heavy: under flock /tmp/cla-heavy.lock.
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = process.env.ROOT ? process.env.ROOT.replace(/\/?$/, '/') : fileURLToPath(new URL('../..', import.meta.url)), imp = (f) => import(pathToFileURL(join(ROOT, f)).href);
const shots = []; let sites = false, find = null, who = false;
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i], v = process.argv[i + 1]; if (a === '--rect') shots.push({ rect: v.split(',').map(Number), out: null }); else if (a === '--out' && shots.length) shots[shots.length - 1].out = v; else if (a === '--sites') sites = true; else if (a === '--s' && shots.length) shots[shots.length - 1].s = +v; else if (a === '--who') who = true; else if (a === '--find') find = new RegExp(v, 'i'); else if (a === '--place') shots.push({ place: v, out: null }); else if (a === '--prop') shots.push({ prop: v, out: null }); else if (a === '--seabridge') shots.push({ seabridge: +v || 0, out: null }); }
if (process.env.CRAG) globalThis.__CRAG = +process.env.CRAG;   // (a look on trial: the mountain crags - 1 walls and ledges, 2 taller, 3 snow on the high benches)
const { buildWorld3 } = await imp('server/world3.js');
const { TILE, CHUNK_TILES } = await imp('shared/constants.js');
const { map: M } = await buildWorld3(1337, { log: () => {} });
const PL = (M.landmarks || []).map((l) => ({ name: l.name || l.type, type: l.type, x0: l.x / TILE, y0: l.y / TILE, x1: (l.x + (l.w || 0)) / TILE, y1: (l.y + (l.h || 0)) / TILE }));   // (the map's landmarks, in tiles)
if (find) console.log(PL.filter((p) => find.test(p.name) || find.test(p.type || '')).map((p) => `${p.name} @ ${Math.round((p.x0 + p.x1) / 2)},${Math.round((p.y0 + p.y1) / 2)} (${p.x1 - p.x0} x ${p.y1 - p.y0})`).join('\n') || 'no place matches', '| places:', PL.length);
for (const sh of shots) if (sh.place) { const [nm, sz = '40,30'] = sh.place.split(':'), p = PL.find((q) => q.name === nm) || PL.find((q) => q.type === nm) || PL.find((q) => (q.name || '').includes(nm)), [w, h] = sz.split(',').map(Number); if (!p) throw new Error('no place ' + nm); const cx = Math.round((p.x0 + p.x1) / 2), cy = Math.round((p.y0 + p.y1) / 2); sh.rect = [cx - (w >> 1), cy - (h >> 1), cx + (w >> 1), cy + (h >> 1)]; }
// (--seabridge n: the middle of the n-th longest north-south run of bridge tiles with open water either side)
if (shots.some((q) => q.seabridge !== undefined)) { const { T } = await imp('shared/constants.js'), runs = [], wetAt = (x, y) => { if (!M.inside(x, y)) return false; const t = M.tiles[M.idx(x, y)]; return t === T.WATER || t === T.DEEP; };
  const over = (x, y) => { let a = x, b = x; while (b - a < 40 && M.inside(a - 1, y) && M.tiles[M.idx(a - 1, y)] === T.BRIDGE) a--; while (b - a < 40 && M.inside(b + 1, y) && M.tiles[M.idx(b + 1, y)] === T.BRIDGE) b++; return wetAt(a - 2, y) && wetAt(b + 2, y) && x === ((a + b) >> 1); };
  for (let x = M.x0; x < M.x0 + M.w; x++) { let run = 0; for (let y = M.y0; y <= M.y0 + M.h; y++) { const on = y < M.y0 + M.h && M.tiles[M.idx(x, y)] === T.BRIDGE && over(x, y); if (on) run++; else { if (run >= 20) runs.push([run, x, y - run]); run = 0; } } }
  runs.sort((a, b) => b[0] - a[0]); console.log('sea bridges (north-south runs, tiles long @ x, y0): ' + runs.slice(0, 8).map((r) => `${r[0]} @ ${r[1]},${r[2]}`).join('; '));
  for (const sh of shots) if (sh.seabridge !== undefined) { const r = runs[Math.min(sh.seabridge, runs.length - 1)]; if (!r) throw new Error('no sea bridge'); const cy = r[2] + (r[0] >> 1); sh.rect = [r[1] - 22, cy - 15, r[1] + 22, cy + 15]; } }
// (--prop type@x0,y0,x1,y1[:w,h]: where the most props of a type stand together inside a box of tiles)
for (const sh of shots) if (sh.prop) { const [spec, sz = '60,44'] = sh.prop.split(':'), [type, box] = spec.split('@'), B = box.split(',').map(Number), [w, h] = sz.split(',').map(Number), cnt = new Map(); let best = null, bn = 0;
  for (const p of M.props) { if (!p || (p.t || p.type) !== type) continue; const tx = p.x / TILE, ty = p.y / TILE; if (tx < B[0] || ty < B[1] || tx > B[2] || ty > B[3]) continue; const k = Math.floor(tx / 24) + ',' + Math.floor(ty / 24), n = (cnt.get(k) || 0) + 1; cnt.set(k, n); if (n > bn) { bn = n; best = k; } }
  if (!best) throw new Error('no prop ' + type); const [gx, gy] = best.split(',').map(Number), cx = gx * 24 + 12, cy = gy * 24 + 12; sh.rect = [cx - (w >> 1), cy - (h >> 1), cx + (w >> 1), cy + (h >> 1)]; console.log(`${type}: ${bn} together round tile ${cx},${cy} (${[...cnt.values()].reduce((a, b) => a + b, 0)} in the box)`); }
const { bakeChunk, loadProviders, SpriteCache, providers } = await imp('client/art2/game/chunkbake.js');
const ST = await imp('client/art2/game/statics.js');
const { F_WATER, F_LEAF } = await imp('client/art2/gbuf.js');
const { PRESETS_GAME } = await imp('client/art2/game/lightgame.js');
await loadProviders();
const P = PRESETS_GAME.noon, sl = Math.hypot(...P.sunDir), sun = P.sunDir.map((v) => v / sl);
const cache = new SpriteCache(300e6), opt = { quality: 1, seed: 1337, lowMem: false, artPx: 2, scratch: false }, CHP = CHUNK_TILES * TILE;
const GAM = new Float32Array(256); for (let i = 0; i < 256; i++) GAM[i] = Math.pow(i / 255, 2.2);
for (const sh of shots) {
  const [x0, y0, x1, y1] = sh.rect.map((v) => v * TILE), S = sh.s || 2, GW = Math.ceil((x1 - x0) / S), GH = Math.ceil((y1 - y0) / S), img = Buffer.alloc(GW * GH * 3), plain = Buffer.alloc(GW * GH * 3);
  let n = 0, dark = 0, leafN = 0, leafD = 0, upN = 0, upD = 0, black = 0;
  for (let cy = Math.floor(y0 / CHP); cy <= Math.floor((y1 - 1) / CHP); cy++) for (let cx = Math.floor(x0 / CHP); cx <= Math.floor((x1 - 1) / CHP); cx++) {
    const g = bakeChunk(M, cx, cy, opt, cache, providers).g, ox = cx * CHP, oy = cy * CHP;
    for (let wy = Math.max(y0, oy); wy < Math.min(y1, oy + CHP); wy += S) for (let wx = Math.max(x0, ox); wx < Math.min(x1, ox + CHP); wx += S) {
      const i = (wy - oy) * CHP + wx - ox, j = i * 4, o = (((wy - y0) / S | 0) * GW + ((wx - x0) / S | 0)) * 3;
      let nx = 0, ny = 0, nz = 1;
      if (g.nrm[j + 3]) { nx = g.nrm[j] / 127.5 - 1; ny = g.nrm[j + 1] / 127.5 - 1; nz = g.nrm[j + 2] / 127.5 - 1; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      const d = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]), kk = nz * 0.5 + 0.5; let L = 0; const c3 = [0, 0, 0];
      for (let c = 0; c < 3; c++) { let v = GAM[g.col[j + c]] * (P.ambGround[c] + (P.ambSky[c] - P.ambGround[c]) * kk + P.sunCol[c] * d); v = v / (1 + v * 0.18); c3[c] = Math.pow(v, 1 / 2.2) * 255; }
      L = c3[0] * 0.3 + c3[1] * 0.59 + c3[2] * 0.11;
      const water = g.flag[i] & F_WATER, isDark = !water && L < 50;
      plain[o] = Math.min(255, c3[0]); plain[o + 1] = Math.min(255, c3[1]); plain[o + 2] = Math.min(255, c3[2]);
      if (!water) { n++; if (isDark) dark++; if (L < 35) black++; if (g.flag[i] & F_LEAF) { leafN++; if (isDark) leafD++; } if (g.z && g.z[i] > 6) { upN++; if (isDark) upD++; } }
      if (isDark) { img[o] = 255; img[o + 1] = 0; img[o + 2] = 255; } else { img[o] = Math.min(255, c3[0]); img[o + 1] = Math.min(255, c3[1]); img[o + 2] = Math.min(255, c3[2]); }
    }
  }
  if (who) {   // (which art the dark is in: every static item of the rectangle's chunks, by kind - its pixels that come out under 50 at noon)
    const T = new Map(), seen = new Map();
    for (let cy = Math.floor(y0 / CHP); cy <= Math.floor((y1 - 1) / CHP); cy++) for (let cx = Math.floor(x0 / CHP); cx <= Math.floor((x1 - 1) / CHP); cx++) for (const it of ST.staticItems(M, cx, cy, opt)) {
      const r = it.recipe; if (!r || it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
      const fam = r.t + ':' + (r.sp || r.m || r.style || r.k || r.kind || r.n || r.name || (r.spec && (r.spec.kind || r.spec.type)) || '');
      let m = seen.get(it.key);
      if (!m) { m = [0, 0, 0]; let G = null; try { G = ST.makeStatic(r); if (G && G.render) G = G.render(0); } catch { G = null; }
        if (G && G.w) for (let i = 0; i < G.w * G.h; i++) { const j = i * 4; if (!G.col[j + 3]) continue; let nx = 0, ny = 0, nz = 1; if (G.nrm[j + 3]) { nx = G.nrm[j] / 127.5 - 1; ny = G.nrm[j + 1] / 127.5 - 1; nz = G.nrm[j + 2] / 127.5 - 1; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
          const d = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]), kk = nz * 0.5 + 0.5; let L = 0; const w = [0.3, 0.59, 0.11];
          for (let c = 0; c < 3; c++) { let v = GAM[G.col[j + c]] * (P.ambGround[c] + (P.ambSky[c] - P.ambGround[c]) * kk + P.sunCol[c] * d); v = v / (1 + v * 0.18); L += Math.pow(v, 1 / 2.2) * 255 * w[c]; }
          m[0]++; if (L < 50) m[1]++; if (L < 35) m[2]++; }
        seen.set(it.key, m); }
      const t = T.get(fam) || [0, 0, 0, 0]; t[0] += m[0]; t[1] += m[1]; t[2] += m[2]; t[3]++; T.set(fam, t);
    }
    console.log('  by kind (items, under 50, under 35): ' + [...T].filter(([, t]) => t[1] > 200).sort((a, b) => b[1][1] - a[1][1]).slice(0, 14).map(([k, t]) => `${k} x${t[3]} ${(t[1] / t[0] * 100).toFixed(0)}%/${(t[2] / t[0] * 100).toFixed(0)}% (${Math.round(t[1] / 1000)}k px)`).join(', '));
  }
  const pc = (a, b) => (b ? (a / b * 100).toFixed(1) : '-') + '%';
  console.log(`tiles ${sh.rect.join(',')}: under 50 of 255 ${pc(dark, n)} of the land's pixels, under 35 ${pc(black, n)} (the style anchor R1-D: 10.6% and 3.7%; leaves ${pc(leafD, leafN)}, what stands up ${pc(upD, upN)}, the ground ${pc(dark - upD, n - upN)})`);
  if (sh.out) for (const [f, b] of [[sh.out, img], [sh.out.replace(/\.png$/, '-lit.png'), plain]]) { const tmp = f + '.rgb'; writeFileSync(tmp, b); spawnSync('python3', ['-c', `from PIL import Image\nImage.frombytes('RGB', (${GW}, ${GH}), open(${JSON.stringify(tmp)}, 'rb').read()).save(${JSON.stringify(f)})`], { stdio: 'inherit' }); rmSync(tmp, { force: true }); }
}
