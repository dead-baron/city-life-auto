// The statics preview (tools/art2/statics-chunk.html): generate the city, bake the ground of a block of chunks,
// composite every static sprite that reaches them with the depth rule (screen y = Y - Z; at a pixel the taller
// surface is the nearer; flat ground lets things standing on a kerb keep their feet), collect the static lights
// and light the block with the art2 Lighter, once per preset. window.done = true when finished, window.info =
// timings. Pure page code (the providers are the game modules).
import { generateCity } from '../../shared/map.js';
import { T, TILE, MAP_W, MAP_H } from '../../shared/constants.js';
import { GBuf, hash, F_GROUND, F_WATER, F_WET } from '../../client/art2/gbuf.js';
import { groundPixel } from '../../client/art2/ground.js';
import { Lighter, PRESETS } from '../../client/art2/light.js';
import { staticItems, makeStatic, staticLights } from '../../client/art2/game/statics.js';

const CH = 768, q = new URLSearchParams(location.search);
const cx0 = +(q.get('cx') ?? 35), cy0 = +(q.get('cy') ?? 23), [gw, gh] = (q.get('grid') || '1').split('x').map(Number).concat([NaN]).map((v, i, a) => (i === 1 && isNaN(v) ? a[0] : v));
const presets = (q.get('p') || 'both') === 'both' ? ['golden', 'night'] : [q.get('p')];
const say = (t) => { document.getElementById('t').textContent = t; };
const info = {};

// plain ground by tile type, when the ground baker is missing (or ?ground=0)
const KIND = { [T.GRASS]: 'grass', [T.SIDEWALK]: 'sidewalk', [T.ROAD]: 'asphalt', [T.PLAZA]: 'paver', [T.BUILDING]: 'plaza', [T.WATER]: 'water', [T.DEEP]: 'waterDeep', [T.SAND]: 'sand',
  [T.DOCK]: 'dock', [T.DIRT]: 'dirt', [T.FIELD]: 'wheat', [T.BRIDGE]: 'asphalt', [T.LOT]: 'yard', [T.FLOOR]: 'woodFloor', [T.COUNTER]: 'woodFloor', [T.WALL]: 'rock' };
function plainGround(M, cx, cy) {
  const G = new GBuf(CH, CH); G.ax = 0; G.ay = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const X = cx * CH + x, Y = cy * CH + y, tx = Math.min(MAP_W - 1, X / TILE | 0), ty = Math.min(MAP_H - 1, Y / TILE | 0), t = M.tiles[ty * MAP_W + tx];
    const k = KIND[t] || 'grass', p = groundPixel(k, X, Y, 3), wet = t === T.WATER || t === T.DEEP;
    G.put(x, y, p.c, p.n || [0, 0, 1], 0, null, F_GROUND | (wet ? F_WATER : F_WET));
  }
  return G;
}
// depth-tested composite (ground pixels let anything within 4 px of their height through)
function comp(G, s, sx, sy, z0) {
  const x0 = Math.max(0, -sx), y0 = Math.max(0, -sy), x1 = Math.min(s.w, G.w - sx), y1 = Math.min(s.h, G.h - sy);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const si = y * s.w + x, sj = si * 4, a = s.col[sj + 3];
    if (!a) continue;
    const di = (y + sy) * G.w + x + sx, dj = di * 4, hz = s.z[si] + z0, top = G.z[di];
    if (hz < ((G.flag[di] & F_GROUND) ? top - 4 : top)) continue;
    if (a < 255) { const k = a / 255; for (let c = 0; c < 3; c++) G.col[dj + c] += (s.col[sj + c] - G.col[dj + c]) * k; continue; }
    for (let c = 0; c < 4; c++) { G.col[dj + c] = s.col[sj + c]; G.nrm[dj + c] = s.nrm[sj + c]; G.emi[dj + c] = s.emi[sj + c]; }
    G.z[di] = hz; G.flag[di] = s.flag[si];
  }
}

async function main() {
  const t0 = performance.now();
  const M = generateCity(1337);
  info.city = Math.round(performance.now() - t0);
  let ground = null;
  if (q.get('ground') !== '0') try { ground = await import('../../client/art2/game/groundbake.js'); } catch (e) { info.groundErr = String(e.message || e); }
  // &list=cx,cy;cx,cy... renders each chunk on its own (one city generation for a survey)
  const blocks = q.get('list') ? q.get('list').split(';').map((s) => s.split(',').map(Number)).map(([a, b]) => [a, b, 1, 1]) : [[cx0, cy0, gw, gh]];
  for (const [bx, by, bw, bh] of blocks) await block(M, ground, bx, by, bw, bh);
  say(`chunks ${blocks.map((b) => b.slice(0, 2).join(',')).join(' ')} - ${JSON.stringify(info)}`);
  window.info = JSON.stringify(info);
  window.done = true;
}
async function block(M, ground, cx0, cy0, gw, gh) {
  const W = gw * CH, H = gh * CH, G = new GBuf(W, H);
  say(`ground ${gw}x${gh} chunks...`);
  const t1 = performance.now();
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let g = null;
    if (ground) try { g = ground.bakeGround(M, cx0 + i, cy0 + j, { quality: +(q.get('q') ?? 2) }); } catch (e) { info.groundErr = String(e.stack || e).slice(0, 300); }
    if (!g) g = plainGround(M, cx0 + i, cy0 + j);
    for (let y = 0; y < CH; y++) { const s = y * CH, d = (j * CH + y) * W + i * CH; G.col.set(g.col.subarray(s * 4, (s + CH) * 4), d * 4); G.nrm.set(g.nrm.subarray(s * 4, (s + CH) * 4), d * 4); G.emi.set(g.emi.subarray(s * 4, (s + CH) * 4), d * 4); G.z.set(g.z.subarray(s, s + CH), d); G.flag.set(g.flag.subarray(s, s + CH), d); }
  }
  info['g' + cx0 + '_' + cy0] = Math.round(performance.now() - t1);
  say('statics...');
  const t2 = performance.now(), cache = new Map(), seen = new Set(), items = [], opt = q.get('cut') ? { cutaway: +q.get('cut') } : {};
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) for (const it of staticItems(M, cx0 + i, cy0 + j, opt)) { const k = it.key + '@' + it.x + ',' + it.y; if (!seen.has(k)) { seen.add(k); items.push(it); } }
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  let gen = 0;
  for (const it of items) {
    let s = cache.get(it.key);
    if (!s) { const ta = performance.now(); s = makeStatic(it.recipe); gen += performance.now() - ta; cache.set(it.key, s); }
    comp(G, s, Math.round(it.x - s.ax) - cx0 * CH, Math.round(it.y - (it.z0 || 0) - s.ay) - cy0 * CH, it.z0 || 0);
  }
  info['s' + cx0 + '_' + cy0] = [Math.round(performance.now() - t2), Math.round(gen), cache.size, items.length];
  let lights = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) lights.push(...staticLights(M, cx0 + i, cy0 + j));
  info.lights = lights.length;
  if (q.get('dbg')) lights.push({ x: cx0 * CH + 384, y: cy0 * CH + 384, z: 100, r: 400, col: [1, 0.3, 0.3], k: 4, night: 0 });
  const wrap = document.getElementById('wrap');
  for (const p of presets) {
    const P = PRESETS[p], night = p === 'night' || p === 'rain';
    const L = lights.filter((l) => night || !l.night || P.lampsOn > 0).map((l) => ({ x: l.x - cx0 * CH, y: l.y - cy0 * CH, z: l.z, r: l.r * (night ? 1 : 0.7), col: l.col, k: l.k * (night ? 1 : p === 'golden' ? 0.32 : 0.05) }))
      .filter((l) => l.x > -300 && l.y > -300 && l.x < W + 300 && l.y < H + 500).sort((a, b) => b.k * b.r - a.k * a.r).slice(0, 64);
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; cv.title = `${cx0},${cy0} ${p}`; wrap.appendChild(cv);
    const Lt = new Lighter(cv); Lt.setScene(G); Lt.render(P, L, 1.0);
  }
}
main().catch((e) => { say('ERROR ' + (e.stack || e)); window.info = 'ERROR ' + (e.stack || e); window.done = true; });
