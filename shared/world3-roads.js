// World v3, stage 3, step 1 (docs/WORLD-V3.md 8.7): the skeleton's roads laid in the whole-world build
// (shared/world3-world.js: its `lines` hook calls layRoads once, its `tunnels` hook roadTunnels once). The skeleton's
// lines (shared/world3-skeleton.js) are in v3 frame tiles; they are laid as they are (no placement), in px:
// - the highways (HIGHWAYS: the highway kind, two lanes each way): at grade in the country, up on the elevated deck
//   (lvl 1, with a highway-wide ramp of RAMP tiles at each end) where they run over a built place's land and over an
//   arterial they cross in the country (the skeleton's 'overpass', skeletonCrossings) - and at grade within IC_GROUND
//   tiles of an interchange (INTERCHANGES), so the highways meeting there join; in their tunnels too (a bore is at
//   ground level). The Bay Ring and the Bay Bridge (`existing`: the places' own ring roads carry them) are laid only
//   off the places' land (their bridges, the mainland's stretches), and run IN tiles into the land to meet its streets.
// - the arterials (ARTERIALS but the canal's, which joinPlace lays: the arterial kind, sidewalks by district): their
//   bridges are the generator's (a road over water is a bridge deck), the footbridges the narrow lanes 8.4 used
//   ('minor', marked foot), the lift bridges as road bridges listed in `lifts`. An arterial crossing over a highway's
//   tunnel stops either side of the bore (the bore's rock walls are there; a cut end doesn't snap onto the highway).
// - the tunnels (the highways' and the arterials' `tunnels`, the Harbor Tunnel's under the water) are handed to
//   shared/tunnels.js as stretches of the built edges (roadTunnels); the three highways that run off the frame end in a
//   tunnel whose mouth at the edge is closed (CLOSURES).
// The ends meet the places' streets by the generator's own repair (a dead end within reach joins the nearest road).
// Generator-only: nothing live imports it (the page never builds the v3 world).
import { TILE } from './constants.js';
import { HIGHWAYS, ARTERIALS, INTERCHANGES, CLOSURES, LANDMARKS, MAIN_LINE, RADIUS, linePath, pointAt, nearestOnPath, stretchRanges, inRanges, skeletonLines, skeletonCrossings } from './world3-skeleton.js';

const RAMP = 24;        // tiles: a highway's climb from the ground to the deck
const OVER = 16;        // tiles of deck either side of an arterial a highway passes over
const IC_GROUND = 40;   // tiles round an interchange where the highways are at grade (they join there)
const SAMPLE = 2;       // tiles between the samples that decide a highway's level
const PLACE_PAD = 6;    // tiles: a highway this close to a built place's land is up on the deck
const IN = 10;          // tiles an `existing` line runs on into a place's land (to meet its streets)
const GAP = 7;          // tiles either side of a highway's bore where an arterial over it stops
const MAINLAND = 47;    // the land layer's mainland districts start here (DISTRICTS3); below, the built places'
const END_T = 40;       // tiles: an arterial crossing a highway this near its end meets it there (a T, at grade)
const BORE_END = 16;    // tiles: an arterial ending this near a highway's bore stops GAP short of it (a dead end)
const REACH = 160;      // tiles: how far an arterial's loose end is carried on, over land, to the nearest road
const DEST = 40;        // tiles: an end this near a landmark (the Granite Lookout, Red Rock Dam) is the landmark's: not carried
const SNAP = 25;        // tiles: a highway ending at an interchange ends on the other highway's path (its corner's arc)

// the path of a skeleton line in tiles: { pts, s, at, length } (linePath at its kind's radius)
const pathOf = (l, kind) => linePath(l, RADIUS[kind]);

// lay the skeleton's highways and arterials into the build's lines (px). L: the land layer (buildLand3's layers).
export function layRoads(lines, m, L) {
  const W = m.w, H = m.h;
  const clampX = (x) => Math.max(0.5, Math.min(W - 0.5, x)), clampY = (y) => Math.max(0.5, Math.min(H - 0.5, y));
  const idx = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  const placeAt = (x, y) => { const i = idx(x, y); return i >= 0 && m.land[i] && L.dist[i] < MAINLAND; };
  const placeNear = (x, y, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (placeAt(x + dx, y + dy)) return true; return false; };
  const out = { highways: [], arterials: [], tunnels: [], lifts: [], foot: [], gaps: [], overpasses: [], tees: [], carried: [], loose: [], snapped: [], pieces: 0 };
  const SK = skeletonLines(), CX = skeletonCrossings(SK);
  // the highways' bores (where an arterial over them stops) and the overpasses (an arterial in the country)
  const bores = [];
  for (const l of SK) if (l.kind === 'hwy') for (const [a, b] of l.tunnels) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    l.path.pts.forEach(([x, y], j) => { if (l.path.s[j] < a - 20 || l.path.s[j] > b + 20) return; box[0] = Math.min(box[0], x - 4); box[1] = Math.min(box[1], y - 4); box[2] = Math.max(box[2], x + 4); box[3] = Math.max(box[3], y + 4); });
    bores.push({ name: l.name, path: l.path, a, b, box });
  }
  const overAt = new Map();   // highway name -> [s along it]
  for (const c of CX.crossings) {
    if (c.kind !== 'overpass' && c.kind !== 'flyover') continue;
    const h = c.ka === 'hwy' ? c.a : c.b, o = c.ka === 'hwy' ? c.b : c.a;
    const P = SK.find((l) => l.name === h && l.kind === 'hwy'), Q = SK.find((l) => l.name === o);
    if (!P) continue;
    // (an arterial that ends at the highway - a T the skeleton draws a few tiles past it - meets it at grade)
    if (Q && Q.kind === 'art') { const so = nearS(Q.path, c.x, c.y); if (so < END_T || so > Q.path.length - END_T) { out.tees.push(`${o} at ${h}`); continue; } }
    const s = nearS(P.path, c.x, c.y);
    if (!overAt.has(h)) overAt.set(h, []);
    overAt.get(h).push(s);
    out.overpasses.push(`${c.a} x ${c.b}`);
  }
  const px = (p) => ({ x: clampX(p[0]) * TILE, y: clampY(p[1]) * TILE });
  // the path's own points between s0 and s1, with the ends exact
  const sub = (path, s0, s1) => {
    const q = [px(pointAt(path, s0))];
    for (let j = 0; j < path.pts.length; j++) if (path.s[j] > s0 + 0.5 && path.s[j] < s1 - 0.5) q.push(px(path.pts[j]));
    q.push(px(pointAt(path, s1)));
    return q;
  };

  // 1. the highways
  const paths = new Map(HIGHWAYS.map((h) => [h.name, pathOf(h, 'hwy')]));
  // (a highway that ends at an interchange ends on the other highway there: the other's corner is an arc of 250 m that
  // passes up to a few tiles off the control point - Westport Junction, where the Highland Highway meets the Coast)
  const endAt = (H0, p) => {
    if (!INTERCHANGES.some((ic) => Math.hypot(ic.at[0] - p[0], ic.at[1] - p[1]) < 2)) return null;
    let best = null;
    for (const [name, P2] of paths) {
      if (name === H0.name) continue;
      const q = nearestOnPath(P2, p[0], p[1]);
      if (q.d > 0.5 && q.d < SNAP && (!best || q.d < best.d)) best = { d: q.d, p: pointAt(P2, q.s) };
    }
    return best && best.p;
  };
  const ends = [];   // (the loose ends carryEnds looks at: { l, end, kind })
  const sites = interchangeSites(paths, out);   // (the interchanges built as diamonds: the through highway on the deck)
  for (const H0 of HIGHWAYS) {
    const path = paths.get(H0.name), Ls = path.length, tun = stretchRanges(path, H0.tunnels);
    const e0 = endAt(H0, H0.pts[0]), e1 = endAt(H0, H0.pts[H0.pts.length - 1]);
    if (e0 || e1) out.snapped.push(H0.name);
    const n = Math.ceil(Ls / SAMPLE) + 1, S = (k) => Math.min(Ls, k * SAMPLE);
    const keep = new Uint8Array(n).fill(1), want = new Uint8Array(n), ground = new Uint8Array(n);
    const overs = overAt.get(H0.name) || [];
    const mine = sites.filter((st) => st.U === H0.name);
    for (let k = 0; k < n; k++) {
      const s = S(k), [x, y] = pointAt(path, s);
      if (tun.some(([a, b]) => s >= a - 2 && s <= b + 2)) ground[k] = 1;
      // (at an interchange it passes through, the highway is up on the deck over the other: its ramps come down)
      if (mine.some((st) => s >= st.d0 && s <= st.d1)) want[k] = 1;
      else if (!mine.some((st) => s >= st.d0 - RAMP - 2 && s <= st.d1 + RAMP + 2) && INTERCHANGES.some((ic) => Math.hypot(ic.at[0] - x, ic.at[1] - y) < IC_GROUND)) ground[k] = 1;
      if (H0.existing) {
        // (the places' own ring roads carry it: laid off their land, IN tiles into it to meet their streets)
        if (placeAt(x, y)) { const i = idx(x, y); if (m.distSea[i] > IN * 4) keep[k] = 0; }
      } else if (placeNear(x, y, PLACE_PAD)) want[k] = 1;
      if (overs.some((o) => Math.abs(o - s) <= OVER)) want[k] = 1;
    }
    // up runs (the deck) with room for a ramp at each end clear of the ground (the interchanges, the bores) and the
    // line's ends; runs closer than two ramps merge
    const runs = [];
    for (let k = 0; k < n;) {
      if (!want[k] || ground[k] || !keep[k]) { k++; continue; }
      let j = k;
      while (j + 1 < n && want[j + 1] && !ground[j + 1] && keep[j + 1]) j++;
      runs.push([S(k), S(j)]);
      k = j + 1;
    }
    const clear = (a, b) => { for (let k = Math.max(0, Math.floor(a / SAMPLE)); k <= Math.min(n - 1, Math.ceil(b / SAMPLE)); k++) if (ground[k] || !keep[k]) return false; return a >= 0 && b <= Ls; };
    const ups = [];
    for (let [u0, u1] of runs) {
      // (shrink a run until its ramps are clear)
      while (u0 < u1 && !clear(u0 - RAMP, u0)) u0 += SAMPLE;
      while (u1 > u0 && !clear(u1, u1 + RAMP)) u1 -= SAMPLE;
      if (u1 - u0 < 4) continue;
      const last = ups[ups.length - 1];
      if (last && u0 - RAMP <= last[1] + RAMP && clear(last[1], u0)) last[1] = u1; else ups.push([u0, u1]);
    }
    // the pieces: kept stretches split at the ramps
    const cuts = [];   // [s0, s1, lvl]
    let k0 = -1;
    const kept = [];
    for (let k = 0; k <= n; k++) {
      if (k < n && keep[k]) { if (k0 < 0) k0 = k; continue; }
      if (k0 >= 0) { const a = S(k0), b = S(k - 1); if (b - a >= 4) kept.push([a, b]); k0 = -1; }
    }
    // (an `existing` line keeps only the stretches that leave the places' land: a scrap of it by a harbour inside a
    // place is the place's own streets' to carry)
    if (H0.existing) for (let j = kept.length; j--;) {
      const [a, b] = kept[j];
      let off = false;
      for (let s = a; s <= b && !off; s += SAMPLE) { const [x, y] = pointAt(path, s); off = !placeAt(x, y); }
      if (!off) kept.splice(j, 1);
    }
    for (const [a, b] of kept) {
      let s = a;
      for (const [u0, u1] of ups) {
        if (u1 < a || u0 > b) continue;
        if (u0 - RAMP > s) cuts.push([s, u0 - RAMP, 0]);
        cuts.push([u0 - RAMP, u0, 'up'], [u0, u1, 1], [u1, u1 + RAMP, 'down']);
        s = u1 + RAMP;
      }
      if (b - s >= 1) cuts.push([s, b, 0]);
    }
    // (an `existing` line's run onto a place's land, from a cut end to the shore, is an avenue: it meets the place's
    // streets as one - a highway's end there would push the streets near it back, 8.4's cut highway the same)
    const shore = (a, b, dir) => { for (let t = dir > 0 ? a : b; dir > 0 ? t <= b : t >= a; t += dir * SAMPLE) { const [x, y] = pointAt(path, t); if (!placeAt(x, y)) return t; } return dir > 0 ? b : a; };
    const pieces = [];
    for (const [s0, s1, lv] of cuts) {
      if (!H0.existing || lv !== 0 || (s0 <= 0 && s1 >= Ls)) { pieces.push([s0, s1, lv, 'hwy']); continue; }
      let a = s0, b = s1;
      if (s0 > 0) { const t = shore(s0, s1, 1); if (t - s0 >= 2) { pieces.push([s0, t, 0, 'ave']); a = t; } }
      let tail = null;
      if (s1 < Ls) { const t = shore(a, s1, -1); if (s1 - t >= 2) { tail = [t, s1, 0, 'ave']; b = t; } }
      if (b - a >= 1) pieces.push([a, b, 0, 'hwy']);
      if (tail) pieces.push(tail);
    }
    for (const [s0, s1, lv, kind] of pieces) {
      const pts = sub(path, s0, s1);
      if (s0 <= 0 && e0) pts[0] = px(e0);
      if (s1 >= Ls && e1) pts[pts.length - 1] = px(e1);
      const l = lv === 'up' || lv === 'down' ? { pts, kind: 'hwy', lvl: 'ramp', z0: lv === 'up' ? 0 : 1, z1: lv === 'up' ? 1 : 0, name: H0.name } : { pts, kind, lvl: lv, name: H0.name };
      lines.push(l);
      out.pieces++;
      // (and its end on the place's land is carried on into its streets if it meets none)
      if (kind === 'ave') { if (s0 > 0 && !pieces.some((q) => q[1] === s0)) ends.push({ l, end: 0, kind: 'ave' }); if (s1 < Ls && !pieces.some((q) => q[0] === s1)) ends.push({ l, end: 1, kind: 'ave' }); }
    }
    out.highways.push({ name: H0.name, length: Math.round(Ls), laid: Math.round(kept.reduce((t, [a, b]) => t + b - a, 0)), deck: ups.map(([a, b]) => [Math.round(a), Math.round(b)]), kept: kept.map(([a, b]) => [Math.round(a), Math.round(b)]) });
    for (const [a, b] of tun) {
      const closed = CLOSURES.find((c) => c.line === H0.name && Math.hypot(...pointAt(path, b).map((v, i) => v - c.at[i])) < 4);
      out.tunnels.push({ name: H0.name, kind: 'hwy', pts: sub(path, a, b), closed: !!closed, closure: closed ? closed.name : null });
    }
  }

  // 2. the arterials (the canal's are joinPlace's)
  for (const A of ARTERIALS) {
    if (/^Canal /.test(A.name)) continue;
    const path = pathOf(A, 'art'), Ls = path.length, tun = stretchRanges(path, A.tunnels);
    // where it passes over a highway's bore: stop GAP tiles either side (its own tunnel is under, not over)
    const gaps = [];
    for (const B of bores) {
      for (let s = 0; s <= Ls; s += 1) {
        const [x, y] = pointAt(path, s);
        if (x < B.box[0] || y < B.box[1] || x > B.box[2] || y > B.box[3]) continue;
        const q = nearS(B.path, x, y, true);
        if (q.d < 1.5 && q.s >= B.a && q.s <= B.b && !tun.some(([a, b]) => s >= a && s <= b)) { gaps.push([s - GAP, s + GAP]); out.gaps.push(`${A.name} over ${B.name}'s tunnel`); break; }
      }
    }
    // (an end at a highway's bore - Kestrel Road ends on the North Highway inside its tunnel - stops short of it)
    let e0 = 0, e1 = Ls;
    for (const B of bores) for (const [s, sgn] of [[0, 1], [Ls, -1]]) {
      const [x, y] = pointAt(path, s), q = nearS(B.path, x, y, true);
      if (q.d < BORE_END && q.s >= B.a - 4 && q.s <= B.b + 4) { if (sgn > 0) e0 = Math.max(e0, BORE_END + GAP - q.d); else e1 = Math.min(e1, Ls - (BORE_END + GAP - q.d)); out.gaps.push(`${A.name}'s end at ${B.name}'s tunnel`); gaps.push(null); }
    }
    const parts = [];
    let s = e0;
    for (const g of gaps.filter(Boolean).sort((p, q) => p[0] - q[0])) { if (g[0] - s >= 4) parts.push([s, g[0]]); s = g[1]; }
    if (e1 - s >= 4) parts.push([s, e1]);
    for (const [s0, s1] of parts) {
      const l = { pts: sub(path, s0, s1), kind: A.foot ? 'minor' : 'art', lvl: 0, name: A.name };
      if (A.foot) l.foot = true;
      if (gaps.length) l.culdesac = true;   // (its cut ends stay dead ends: the bore's rock is there)
      lines.push(l);
      out.pieces++;
      if (!gaps.length) ends.push({ l, end: 0, kind: l.kind }, { l, end: 1, kind: l.kind });
    }
    out.arterials.push({ name: A.name, length: Math.round(Ls), foot: !!A.foot, lift: !!A.lift, gaps: gaps.length });
    if (A.foot) out.foot.push(A.name);
    if (A.lift) out.lifts.push(A.name);
    for (const [a, b] of tun) out.tunnels.push({ name: A.name, kind: 'art', pts: sub(path, a, b), closed: false, closure: null });
  }
  layInterchanges(lines, sites, paths, out);
  carryEnds(lines, m, ends, bores, out);
  m.w3tunnels = out.tunnels;   // (roadTunnels reads them once the network is built)
  return out;
}

// 3. an arterial's end that meets no road (within 1.5 tiles of another line on the ground) is carried on to the nearest
// road within REACH tiles, by a straight run over land that doesn't pass a highway's bore: the West Sea Road to the
// Redwood Coast Road and to Gull Harbor's streets, the Toll Point Bridge to Cedar Isle's and Toll Point's.
function carryEnds(lines, m, ends, bores, out) {
  const W = m.w, H = m.h, R = REACH * TILE;
  const ground = lines.filter((l) => l.lvl === 0 && l.pts.length >= 2);
  const dry = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE / 2)));
    for (let j = 1; j < n; j++) {
      const tx = Math.floor((a.x + (b.x - a.x) * j / n) / TILE), ty = Math.floor((a.y + (b.y - a.y) * j / n) / TILE);
      if (!(tx >= 0 && ty >= 0 && tx < W && ty < H) || !m.land[ty * W + tx]) return false;
    }
    return true;
  };
  const inBore = (p) => bores.some((B) => { const q = nearS(B.path, p.x / TILE, p.y / TILE, true); return q.d < BORE_END && q.s >= B.a - 4 && q.s <= B.b + 4; });
  for (const { l, end, kind } of ends) {
    {
      const p = end ? l.pts[l.pts.length - 1] : l.pts[0];
      if (LANDMARKS.some((k) => Math.hypot(k.at[0] * TILE - p.x, k.at[1] * TILE - p.y) < DEST * TILE)) continue;   // (a spur to a landmark)
      let met = false;
      for (const o of ground) {
        if (o === l) continue;
        for (let k = 0; k + 1 < o.pts.length; k++) {
          const a = o.pts[k], b = o.pts[k + 1];
          if (Math.min(a.x, b.x) - R > p.x || Math.max(a.x, b.x) + R < p.x || Math.min(a.y, b.y) - R > p.y || Math.max(a.y, b.y) + R < p.y) continue;
          const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
          let w = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2; w = w < 0 ? 0 : w > 1 ? 1 : w;
          const q = { x: a.x + dx * w, y: a.y + dy * w }, d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 1.5 * TILE && o.name !== l.name) { met = true; break; }   // (near enough for the network to join them)
        }
        if (met) break;
      }
      if (met) continue;
      // (the nearest that a dry, bore-free run reaches: try them nearest first)
      const cands = [];
      for (const o of ground) {
        if (o === l || o.name === l.name) continue;
        for (let k = 0; k + 1 < o.pts.length; k++) {
          const a = o.pts[k], b = o.pts[k + 1];
          if (Math.min(a.x, b.x) - R > p.x || Math.max(a.x, b.x) + R < p.x || Math.min(a.y, b.y) - R > p.y || Math.max(a.y, b.y) + R < p.y) continue;
          const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
          let w = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2; w = w < 0 ? 0 : w > 1 ? 1 : w;
          const q = { x: a.x + dx * w, y: a.y + dy * w }, d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < R && d > 2) cands.push({ d, q, o });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      const pick = cands.find((c) => dry(p, c.q) && !inBore(c.q));
      if (!pick) { out.loose.push(`${l.name} (${end ? 'end' : 'start'})`); continue; }
      lines.push({ pts: end ? [{ x: p.x, y: p.y }, pick.q] : [pick.q, { x: p.x, y: p.y }], kind, lvl: 0, name: l.name, ...(l.foot ? { foot: true } : {}) });
      out.carried.push(`${l.name} (${end ? 'end' : 'start'}, ${Math.round(pick.d / TILE)} tiles to ${pick.o.name || pick.o.kind})`);
    }
  }
}

// the distance along a path nearest (x, y) (tiles); with full, { s, d }
function nearS(path, x, y, full = false) {
  let best = Infinity, bs = 0;
  const P = path.pts, S = path.s;
  for (let j = 1; j < P.length; j++) {
    const ax = P[j - 1][0], ay = P[j - 1][1], dx = P[j][0] - ax, dy = P[j][1] - ay, L2 = dx * dx + dy * dy;
    let w = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    const qx = ax + dx * w - x, qy = ay + dy * w - y, d = qx * qx + qy * qy;
    if (d < best) { best = d; bs = S[j - 1] + (S[j] - S[j - 1]) * w; }
  }
  return full ? { s: bs, d: Math.sqrt(best) } : bs;
}

// The tunnels as stretches of the built edges (shared/tunnels.js specs: { edge, s0, s1, closed }): each skeleton
// tunnel's stretch, on the ground edges of its line that run along it; a closure's mouth (the frame's edge) closed.
export function roadTunnels(m) {
  const specs = [];
  // (the roads' last pass, run before the tunnels are made: a highway's own climb to the deck is the highway, not a slip
  // ramp beside a street - no painted gore between it and the road it goes on from)
  if (m.gores) m.gores = m.gores.filter((g) => m.edges[g.ramp].kind !== 'hwy');
  const near = (P, x, y) => { let best = Infinity; for (let j = 1; j < P.length; j++) { const a = P[j - 1], b = P[j], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1; let w = ((x - a.x) * dx + (y - a.y) * dy) / l2; w = w < 0 ? 0 : w > 1 ? 1 : w; const d = Math.hypot(a.x + dx * w - x, a.y + dy * w - y); if (d < best) best = d; } return best; };
  for (const t of m.w3tunnels || []) {
    const end = t.pts[t.pts.length - 1];
    for (const e of m.edges) {
      if (e.name !== t.name || e.lvl !== 0) continue;
      // (the edge's arc positions, every 32 px: the run of them along the stretch)
      let s = 0, s0 = -1, s1 = -1;
      for (let k = 0; k + 1 < e.pts.length; k++) {
        const a = e.pts[k], b = e.pts[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(len / 32));
        for (let j = 0; j <= n; j++) {
          const x = a.x + (b.x - a.x) * j / n, y = a.y + (b.y - a.y) * j / n, at = s + len * j / n;
          if (near(t.pts, x, y) < 2 * TILE) { if (s0 < 0) s0 = at; s1 = at; }
        }
        s += len;
      }
      if (s0 < 0 || s1 - s0 < 8 * TILE) continue;   // (a sliver at a junction by a mouth)
      const pa = pointOn(e.pts, s0), pb = pointOn(e.pts, s1), da = Math.hypot(pa.x - end.x, pa.y - end.y), db = Math.hypot(pb.x - end.x, pb.y - end.y);
      const closed = t.closed && Math.min(da, db) < 6 * TILE ? (db < da ? 'b' : 'a') : null;
      specs.push({ edge: e.id, s0, s1, closed });
    }
  }
  return specs;
}
function pointOn(P, s) {
  let acc = 0;
  for (let k = 0; k + 1 < P.length; k++) {
    const a = P[k], b = P[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= s) { const f = len ? (s - acc) / len : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
    acc += len;
  }
  return P[P.length - 1];
}

// 4. The interchanges (docs/WORLD-V3.md 8.11): where a highway passes through an interchange's point and other roads end
// there (INTERCHANGES; and an arterial's end on a highway's control point), the through highway goes up on the deck
// over them and the roads below run on under it, joined at grade; each carriageway of the through highway gets an
// off-ramp before them and an on-ramp after them on its own right, down to (up from) the road below D_OFF tiles out
// from the highway (a diamond, as the Metro Ring's: shared/citylayout.js diamondRamp). A road that ends there (a T: a
// trumpet's or a fork's) runs on under the deck as a stub to the far side's ramps. The engine has two levels, so a
// cloverleaf's loops and a stack's third and fourth levels are diamonds here (the ramps' feet are junctions below).
const D_OFF = 12;       // tiles from the through highway's centre line to where its ramps meet the road below
const RUN_OUT = 10;     // tiles of level run-out at a ramp's foot
const CURVE = 30;       // tiles of a ramp's curve off the deck (its climb or descent)
const DECK_PART = 20;   // tiles of a ramp along the deck (the taper and the auxiliary lane)
const TAPER = 8;        // tiles of the taper from the outer lane out to the auxiliary lane
const EXT = RUN_OUT + CURVE + DECK_PART;
const LANE_PX = 135.5, AUX_PX = 216.5;   // px right of a highway's centre line: its outer lane, the auxiliary lane beside it
const RAIL_CLEAR = 8;    // tiles: the main line's track (either way, 1.5 tiles off its path) and bed clear of a ramp
const ROAD_CLEAR = 7;    // tiles: another road's centre line clear of a ramp's low half (the ramp's and an arterial's half-widths and room)
const RAIL = MAIN_LINE.map((R) => { const path = linePath(R, R.r || RADIUS.main); return { path, tun: stretchRanges(path, R.tunnels) }; });
const tangentAt = (P, s) => { const a = pointAt(P, Math.max(0, s - 2)), b = pointAt(P, Math.min(P.length, s + 2)), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

// the interchanges to build: { name, kind, U (the through highway), s (along it), C (tiles), arms: [{ name, kind, side,
// S (the ramps' foot on it), stub }], d0, d1 (the through highway's deck run) }; those that can't be built are listed
// in out.interchanges with why
function interchangeSites(paths, out) {
  out.interchanges = [];
  const sites = [];
  const near = (p, q, d = 2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < d;
  for (const U of HIGHWAYS) {
    if (U.existing) continue;
    const P = paths.get(U.name);
    for (let i = 1; i + 1 < U.pts.length; i++) {
      const C0 = U.pts[i], ic = INTERCHANGES.find((c) => near(c.at, C0));
      if (ic && ic.kind === 'ramps') continue;
      const q = nearestOnPath(P, C0[0], C0[1]), s = q.s, C = pointAt(P, s);
      // the roads that end there: the highways (their ends are put on this one's path: SNAP) and the arterials whose
      // end is on it
      const lowers = [];
      for (const H of HIGHWAYS) if (H !== U) for (const end of [0, 1]) if (near(end ? H.pts[H.pts.length - 1] : H.pts[0], C0)) lowers.push({ name: H.name, kind: 'hwy', path: paths.get(H.name), end, base: C });
      for (const A of ARTERIALS) for (const end of [0, 1]) {
        const E = end ? A.pts[A.pts.length - 1] : A.pts[0];
        if (near(E, C0) && near(E, C, 4)) lowers.push({ name: A.name, kind: A.foot ? 'minor' : 'art', path: pathOf(A, 'art'), end, base: E });
      }
      if (!lowers.length) continue;
      const name = ic ? ic.name : `${U.name} x ${lowers.map((l) => l.name).join(' / ')}`;
      const r = [-tangentAt(P, s)[1], tangentAt(P, s)[0]];
      // each road's arm: the point D_OFF tiles out from the highway along its last straight (as laid: to the base)
      const arms = [];
      const outAt = (b, d) => { for (let u = 1; u < 160; u += 0.5) { const p = [b[0] + d[0] * u, b[1] + d[1] * u]; if (nearestOnPath(P, p[0], p[1]).d >= D_OFF) return p; } return null; };
      for (const lo of lowers) {
        const pts = lo.path.pts, Q = lo.end ? pts[pts.length - 2] : pts[1], b = lo.base, l = Math.hypot(Q[0] - b[0], Q[1] - b[1]) || 1;
        const dir = [(Q[0] - b[0]) / l, (Q[1] - b[1]) / l], S = outAt(b, dir);
        if (!S) continue;
        arms.push({ name: lo.name, kind: lo.kind, side: (S[0] - C[0]) * r[0] + (S[1] - C[1]) * r[1] > 0 ? 1 : -1, S, dir, base: b });
      }
      // (a T: the road runs on under the deck as a stub to the far side's ramps)
      for (const side of [1, -1]) {
        if (!arms.length || arms.some((a) => a.side === side)) continue;
        const a0 = arms[0], d = [-a0.dir[0], -a0.dir[1]], S = outAt(a0.base, d);
        if (S) arms.push({ name: a0.name, kind: a0.kind, side, S, dir: d, base: a0.base, stub: true });
      }
      if (!arms.some((a) => a.side === 1) || !arms.some((a) => a.side === -1)) { out.interchanges.push({ name, U: U.name, built: false, why: 'no road on one side' }); continue; }
      const sS = arms.map((a) => nearestOnPath(P, a.S[0], a.S[1]).s);
      const d0 = Math.min(...sS) - EXT - 4, d1 = Math.max(...sS) + EXT + 4;
      const tun = stretchRanges(P, U.tunnels);
      if (d0 - RAMP < 4 || d1 + RAMP > P.length - 4 || tun.some(([a, b]) => b > d0 - RAMP - 8 && a < d1 + RAMP + 8)) { out.interchanges.push({ name, U: U.name, built: false, why: 'the through highway is in its tunnel there (no room for the deck)' }); continue; }
      // (the main line keeps clear of the ramps: where it runs through an interchange - Westport's, Sandpiper's - its
      // track would cross them at grade, so that one is left at grade for now)
      const ramps = rampLines(P, arms);
      const rail = ramps.some((rp) => rp.pts.some(([x, y]) => RAIL.some((R) => { const v = nearestOnPath(R.path, x, y); return v.d < RAIL_CLEAR && !inRanges(R.tun, v.s, 4); })));
      if (rail) { out.interchanges.push({ name, U: U.name, built: false, why: 'the main line runs through it (its track would cross the ramps)' }); continue; }
      // (nor does another road: a ramp's low half crosses nothing on the ground but the road it meets - the Summit Road
      // runs through the Gorge Junction)
      const others = [...HIGHWAYS.filter((H) => H !== U && !lowers.some((l) => l.name === H.name)).map((H) => ({ name: H.name, path: paths.get(H.name), tun: stretchRanges(paths.get(H.name), H.tunnels) })),
        ...ARTERIALS.filter((A) => !lowers.some((l) => l.name === A.name)).map((A) => { const path = pathOf(A, 'art'); return { name: A.name, path, tun: stretchRanges(path, A.tunnels) }; })];
      const hit = others.find((o) => ramps.some((rp) => { const mid = (rp.zr[0] + rp.zr[1]) / 2, n = rp.pts.length; return rp.pts.some(([x, y], j) => { const f = j / (n - 1); if (rp.off ? f < mid : f > mid) return false; const v = nearestOnPath(o.path, x, y); return v.d < ROAD_CLEAR && !inRanges(o.tun, v.s, 4); }); }));
      if (hit) { out.interchanges.push({ name, U: U.name, built: false, why: `${hit.name} runs through it (it would cross the ramps at grade)` }); continue; }
      sites.push({ name, kind: ic ? ic.kind : 'diamond', U: U.name, s, C, arms, d0, d1, ramps, lowers: lowers.map((l) => l.name) });
    }
  }
  return sites;
}

// each carriageway's two ramps on its own right (tiles): { pts, off, dir, to, foot, zr } - the off-ramp from the deck
// before the road below down to it, the on-ramp from it up to the deck after it
function rampLines(P, arms) {
  const cubic = (p0, c1, c2, p1, n) => { const o = []; for (let k = 1; k < n; k++) { const t = k / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; o.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]]); } return o; };
  const len = (Q) => { let l = 0; for (let k = 1; k < Q.length; k++) l += Math.hypot(Q[k][0] - Q[k - 1][0], Q[k][1] - Q[k - 1][1]); return l; };
  // (off tiles to the right of the carriageway running dir along the path)
  const beside = (s, dir, off) => { const p = pointAt(P, s), t = tangentAt(P, s); return [p[0] - t[1] * dir * off, p[1] + t[0] * dir * off]; };
  const out = [];
  for (const dir of [1, -1]) {
    const arm = arms.find((a) => a.side === dir);   // (each carriageway's ramps on its own right)
    const sS = nearestOnPath(P, arm.S[0], arm.S[1]).s, T = tangentAt(P, sS).map((v) => v * dir);
    for (const off of [true, false]) {
      const sg = off ? -1 : 1;   // (the off-ramp upstream of the road below, the on-ramp downstream)
      // along the deck: the taper (the outer lane out to the auxiliary lane) and the auxiliary lane
      const deck = [];
      for (let q = EXT; q >= RUN_OUT + CURVE - 0.01; q -= 2) { const u = Math.min(1, (EXT - q) / TAPER), e = u * u * (3 - 2 * u); deck.push(beside(sS + sg * dir * q, dir, (LANE_PX + (AUX_PX - LANE_PX) * e) / TILE)); }
      const P2 = deck[deck.length - 1], F = [arm.S[0] + sg * T[0] * RUN_OUT, arm.S[1] + sg * T[1] * RUN_OUT];
      const k = Math.hypot(F[0] - P2[0], F[1] - P2[1]) * 0.42;
      const raw = off
        ? deck.concat(cubic(P2, [P2[0] + T[0] * k, P2[1] + T[1] * k], [F[0] - T[0] * k, F[1] - T[1] * k], F, 16), [F, arm.S])
        : [arm.S, F].concat(cubic(F, [F[0] + T[0] * k, F[1] + T[1] * k], [P2[0] - T[0] * k, P2[1] - T[1] * k], P2, 16), deck.slice().reverse());
      const pts = raw.filter((p, j) => j === 0 || Math.hypot(p[0] - raw[j - 1][0], p[1] - raw[j - 1][1]) > 0.05);
      const L = len(pts), dl = len(deck);
      out.push({ pts, off, dir, to: arm.name, foot: arm.S, zr: off ? [dl / L, (L - RUN_OUT) / L] : [RUN_OUT / L, (L - dl) / L] });
    }
  }
  return out;
}

// the interchanges planned from the skeleton alone (no build): { sites, listed } - for the tests and the tools
export function interchangePlan() {
  const out = {}, paths = new Map(HIGHWAYS.map((h) => [h.name, pathOf(h, 'hwy')]));
  const sites = interchangeSites(paths, out);
  return { sites, listed: out.interchanges };
}

// lay each site's stubs and ramps (one call from layRoads, after the highways and arterials)
function layInterchanges(lines, sites, paths, out) {
  const px = (p) => ({ x: p[0] * TILE, y: p[1] * TILE });
  for (const st of sites) {
    for (const a of st.arms) if (a.stub) lines.push({ pts: [px(a.base), px(a.S)], kind: a.kind, lvl: 0, name: a.name });
    for (const r of st.ramps) lines.push({ pts: r.pts.map(px), kind: 'ramp', lvl: 'ramp', z0: r.off ? 1 : 0, z1: r.off ? 0 : 1, zr: r.zr, name: r.off ? `Exit to ${r.to}` : `On-ramp to ${st.U}` });
    out.interchanges.push({ name: st.name, kind: st.kind, U: st.U, lowers: st.lowers, built: true, at: st.C.map(Math.round), deck: [Math.round(st.d0), Math.round(st.d1)], stubs: st.arms.filter((a) => a.stub).map((a) => a.name), ramps: st.ramps.map((r) => ({ dir: r.dir, off: r.off, to: r.to, foot: r.foot.map(Math.round) })) });
  }
}
