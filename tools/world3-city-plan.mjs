// World v3b's city plan, built alone (docs/WORLD-V3.md part 9): the land of the new frame from the traced outlines
// (shared/world3-layout.js: MAINLAND3, ISLANDS3, less LAKES3 and STREAMS3), the districts painted on it
// (shared/world3-city.js paintCity3) and the streets planned (planCity3, off the traced highways and the main line).
// Writes the plan as JSON for tools/world3b/cityplan.py, which draws docs/world-v3b/city-plan.png:
//   node tools/world3-city-plan.mjs [out.json]   (default: /tmp/world3-city-plan.json)
//   python3 tools/world3b/cityplan.py out.json docs/world-v3b/city-plan.png
import { writeFileSync } from 'node:fs';
import { MAINLAND3, ISLANDS3, LAKES3, STREAMS3, HIGHWAYS3, MAIN_LOOP3, SUBWAYS3, FERRIES3, MAIN_STATIONS3 } from '../shared/world3-layout.js';
import { paintCity3, planCity3, avoidOf, CITY3, CITY_PARKS, CITY_AIRPORT, CITY_SPOTS, AVE_X, AVE_Y } from '../shared/world3-city.js';
import { DISTRICTS } from '../shared/mapcore.js';

export const FRAME = [6552, 4032];

// the land layer of the new frame: 1 on land, the lakes and the streams cut (L.land), dist 255 where nothing painted
export function testLand() {
  const [W, H] = FRAME, land = new Uint8Array(W * H);
  const fill = (poly, v) => {
    let y0 = H, y1 = 0;
    for (const [, y] of poly) { y0 = Math.min(y0, Math.floor(y)); y1 = Math.max(y1, Math.ceil(y)); }
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      const xs = [], yc = y + 0.5;
      for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
        const [ax, ay] = poly[k], [bx, by] = poly[j];
        if ((ay <= yc) === (by <= yc)) continue;
        xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let j = 0; j + 1 < xs.length; j += 2) for (let x = Math.max(0, Math.ceil(xs[j] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[j + 1] - 0.5)); x++) land[y * W + x] = v;
    }
  };
  fill(MAINLAND3, 1);
  for (const I of ISLANDS3) fill(I.poly, 1);
  for (const l of LAKES3) fill(l.poly, 0);
  for (const s of STREAMS3) {
    const r = s.width / 2;
    for (let j = 1; j < s.pts.length; j++) {
      const [ax, ay] = s.pts[j - 1], [bx, by] = s.pts[j], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      for (let y = Math.floor(Math.min(ay, by) - r); y <= Math.ceil(Math.max(ay, by) + r); y++) for (let x = Math.floor(Math.min(ax, bx) - r); x <= Math.ceil(Math.max(ax, bx) + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2)), ex = x + 0.5 - ax - t * dx, ey = y + 0.5 - ay - t * dy;
        if (ex * ex + ey * ey <= r * r) land[y * W + x] = 0;
      }
    }
  }
  return { w: W, h: H, layers: { land, dist: new Uint8Array(W * H).fill(255), zone: new Uint8Array(W * H) } };
}

export function buildPlan() {
  const T = testLand(), { w: W, h: H, layers: L } = T;
  const painted = paintCity3(L, W, H);
  const land = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!L.land[y * W + x];
  const dist = (x, y) => (x >= 0 && y >= 0 && x < W && y < H && L.land[y * W + x] ? L.dist[y * W + x] : -1);
  const plan = planCity3(land, dist, avoidOf(null));
  return { W, H, L, painted, plan };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || '/tmp/world3-city-plan.json';
  const t0 = Date.now();
  const { W, H, L, painted, plan } = buildPlan();
  // the district raster at 2 tiles a pixel over the city's box (land 254, sea 253)
  const box = [1100, 1400, 4600, 3660], S = 2;
  const RW = (box[2] - box[0]) / S, RH = (box[3] - box[1]) / S, ras = Buffer.alloc(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const i = (box[1] + y * S) * W + box[0] + x * S;
    ras[y * RW + x] = !L.land[i] ? 253 : L.dist[i] === 255 ? 254 : L.dist[i];
  }
  const names = {};
  for (const c of CITY3) names[c.d] = { name: DISTRICTS[c.d].name, style: DISTRICTS[c.d].style, at: c.rects[0] };
  writeFileSync(out, JSON.stringify({ box, S, RW, RH, ras: ras.toString('base64'), names, painted, plan, parks: CITY_PARKS, airport: CITY_AIRPORT, spots: CITY_SPOTS,
    aveX: AVE_X, aveY: AVE_Y, highways: HIGHWAYS3, loop: MAIN_LOOP3, subways: SUBWAYS3, ferries: FERRIES3, stations: MAIN_STATIONS3 }));
  const len = [...plan.h, ...plan.v].reduce((s, r) => s + r.b - r.a, 0);
  console.log(`plan: ${plan.h.length} east-west runs, ${plan.v.length} north-south, ${plan.alleys.length} alleys, ${len} tiles of street; ${Date.now() - t0} ms`);
  for (const p of painted) console.log(`  ${p.d} ${p.name}: ${p.tiles} tiles`);
}
