// World v3, stage 2, step 2 (docs/WORLD-V3.md 8.4): the crossings of a place built at its gulf place on the v3 land
// (generateCity(seed, { island, frame, place, land })). Its streets are laid by today's plan and placed; the water the
// v3 land gives it is not today's, so (shared/world3-islands.js calls this from its `lines` hook, before the network
// is built; the lines are placed, in px):
// 1. an avenue that bridges water today (metro.js AVES_X `bridge`: Bridge and Northbridge Avenues) and stops at both
//    shores of the place's water (the canal, the inlet that is today's river mouth, sea on the v3 land) gets its bridge
//    back: its pieces either side are joined over the water;
// 2. the skeleton's canal bridges (world3-skeleton.js ARTERIALS 'Canal ...') are laid as road bridges, each end carried
//    on along its line to the first street it meets; one an avenue's bridge already carries (its middle within
//    CARRIED tiles of the avenue's crossing) is that avenue's;
// 3. a road that runs off the place over the sea (today's bridges to places that are elsewhere in v3: the Bay Bridge,
//    Cedar Avenue's bridge) is cut where the land is deep enough for its turnaround, short of the shore;
// 4. the skeleton's crossings to other places that touch this one are listed (the next builds lay them).
// Generator-only: nothing live imports it (the page never builds a place).
import { TILE } from './constants.js';
import { ARTERIALS, CANAL } from './world3-skeleton.js';
import { AVES_X } from './metro.js';
import { segX, project } from './geom.js';

const CARRIED = 30;      // tiles: a skeleton canal bridge this close to an avenue's crossing is that avenue's
const REACH = 60;        // tiles: how far a canal bridge's end is carried on along its line to meet a street
const MAX_GAP = 160;     // tiles: the longest gap over water an avenue is bridged across
const END_SEA = 6 * 4;   // a cut road ends this far from the sea (chamfer quarter tiles: 6 tiles), room for its turnaround
const SLIDE = 80;        // tiles: how far a canal bridge may move along the canal to stand on land at both ends

export function joinPlace(lines, m, own, canal = false) {   // (canal: the place has the canal - its bridges are laid)
  const W = m.w, H = m.h;
  const tile = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1; };
  const isLand = (x, y) => { const i = tile(x, y); return i >= 0 && !!own[i]; };
  const out = { bridged: [], canal: [], carried: [], moved: [], cut: [], dropped: [], crossings: [] };
  // 1. the avenues' bridges back
  const aveBridges = [];
  for (const a of AVES_X.filter((q) => q.bridge)) {
    const pieces = lines.filter((l) => l.name === a.name && l.kind === 'ave' && l.lvl === 0 && l.pts.length >= 2 && l.pts.every((p) => Math.abs(p.x - l.pts[0].x) < 1))
      .map((l) => ({ l, y0: Math.min(...l.pts.map((p) => p.y)), y1: Math.max(...l.pts.map((p) => p.y)) })).sort((p, q) => p.y0 - q.y0);
    for (let k = 0; k + 1 < pieces.length; k++) {
      const p = pieces[k], q = pieces[k + 1], x = p.l.pts[0].x;
      if (Math.abs(q.l.pts[0].x - x) > 1 || q.y0 <= p.y1 || q.y0 - p.y1 > MAX_GAP * TILE) continue;
      let wet = 0;
      for (let y = p.y1; y <= q.y0; y += TILE / 2) if (!isLand(x, y)) wet++;
      if (!wet) continue;   // (a gap on land - the park, the highway's band - is the plan's own)
      const l = { pts: [{ x, y: p.y1 }, { x, y: q.y0 }], kind: 'ave', lvl: 0, name: a.name, vx: p.l.vx };
      lines.push(l); aveBridges.push(l);
      out.bridged.push(`${a.name} (${Math.round(p.y1 / TILE)}-${Math.round(q.y0 / TILE)})`);
    }
  }
  // (the avenues over water, today's bridges and those just laid: where they cross the place's water)
  const aveWet = [];
  for (const l of lines) {
    if (l.kind !== 'ave' || l.lvl !== 0 || !AVES_X.some((a) => a.bridge && a.name === l.name)) continue;
    for (let k = 0; k + 1 < l.pts.length; k++) {
      const a = l.pts[k], b = l.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE / 2)));
      for (let j = 0; j <= n; j++) { const x = a.x + (b.x - a.x) * j / n, y = a.y + (b.y - a.y) * j / n; if (!isLand(x, y) && tile(x, y) >= 0) aveWet.push([x, y, l.name]); }
    }
  }
  // 2. the canal's bridges
  const streets = () => lines.filter((l) => l.lvl === 0 && l.pts.length >= 2 && !['hwy', 'ramp'].includes(l.kind));
  for (const A of canal ? ARTERIALS.filter((q) => /^Canal /.test(q.name)) : []) {
    let P = A.pts.map(([x, y]) => ({ x: x * TILE, y: y * TILE }));
    // (one whose ends aren't both on the land - Canal Bridge 6 lies along the canal's east mouth, where the land
    // layer's smoothed corners leave only water - moves along the canal, towards its middle, until they are: SLIDE)
    const cm = CANAL.pts[CANAL.pts.length >> 1];
    for (let s = 0; s <= SLIDE; s += 2) {
      const c = { x: (P[0].x + P[P.length - 1].x) / 2, y: (P[0].y + P[P.length - 1].y) / 2 }, d = Math.hypot(cm[0] * TILE - c.x, cm[1] * TILE - c.y) || 1;
      const Q = P.map((p) => ({ x: p.x + (cm[0] * TILE - c.x) / d * s * TILE, y: p.y + (cm[1] * TILE - c.y) / d * s * TILE }));
      const onLand = (p) => { const i = tile(p.x, p.y); return i >= 0 && !!own[i] && m.distSea[i] >= 4 * 4; };
      if (onLand(Q[0]) && onLand(Q[Q.length - 1])) { if (s) out.moved.push(`${A.name} (${s} tiles along the canal)`); P = Q; break; }
    }
    const mid = { x: (P[0].x + P[P.length - 1].x) / 2, y: (P[0].y + P[P.length - 1].y) / 2 };
    const by = aveWet.find(([x, y]) => Math.hypot(x - mid.x, y - mid.y) < CARRIED * TILE);
    if (by) { out.carried.push(`${A.name} (by ${by[2]})`); continue; }
    // each end carried on along the bridge's line to the first street it crosses
    const S = streets();
    const reach = (p, q) => {   // from p, away from q
      const len = Math.hypot(p.x - q.x, p.y - q.y) || 1, ux = (p.x - q.x) / len, uy = (p.y - q.y) / len;
      let a = p;
      for (let s = TILE; s <= REACH * TILE; s += TILE) {
        const b = { x: p.x + ux * s, y: p.y + uy * s };
        let best = null;
        for (const l of S) for (let k = 0; k + 1 < l.pts.length; k++) {
          const x = segX(a, b, l.pts[k], l.pts[k + 1]);
          if (x && (!best || Math.hypot(x.x - a.x, x.y - a.y) < Math.hypot(best.x - a.x, best.y - a.y))) best = x;
        }
        if (best) return { x: best.x, y: best.y, met: true };
        a = b;
      }
      // (none on its line: the nearest street within REACH / 2, by a short approach)
      let near = null;
      for (const l of S) { const pr = project(l.pts, p); if (pr && pr.d < REACH / 2 * TILE && (!near || pr.d < near.d)) near = pr; }
      return near ? { x: near.x, y: near.y, met: true, via: true } : { x: p.x, y: p.y, met: false };
    };
    const e0 = reach(P[0], P[P.length - 1]), e1 = reach(P[P.length - 1], P[0]);
    const pts = [{ x: e0.x, y: e0.y }, ...P.slice(1, -1), { x: e1.x, y: e1.y }];
    if (Math.hypot(e0.x - P[0].x, e0.y - P[0].y) > 2) pts.splice(1, 0, P[0]);
    if (Math.hypot(e1.x - P[P.length - 1].x, e1.y - P[P.length - 1].y) > 2) pts.splice(pts.length - 1, 0, P[P.length - 1]);
    // (a footbridge is a narrow lane for now: the network has no kind for people only - for the owner)
    lines.push({ pts, kind: A.foot ? 'minor' : 'art', lvl: 0, name: A.name, foot: !!A.foot });
    out.canal.push(`${A.name}${e0.met && e1.met ? '' : ' (an end meets no street)'}`);
  }
  // 3. roads off the place over the sea: cut where the land is deep enough for a turnaround
  const deep = (p) => { const i = tile(p.x, p.y); return i >= 0 && !!own[i] && m.distSea[i] >= END_SEA; };
  for (let k = lines.length; k--;) {
    const l = lines[k];
    if (l.lvl !== 0 || l.pts.length < 2 || l.closed) continue;
    // (a wet end another line goes on from - an avenue's bridge just joined - is mid-bridge, not a road's end)
    const joined = (p) => lines.some((o) => o !== l && o.pts.length && [o.pts[0], o.pts[o.pts.length - 1]].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 4));
    // (and a highway clipped at the shore by its own plan - the Desert Highway, which ran on into today's desert - is
    // cut back to room for a turnaround too)
    const wetEnd = (p) => !joined(p) && (!isLand(p.x, p.y) || (l.kind === 'hwy' && !deep(p)));
    if (!wetEnd(l.pts[0]) && !wetEnd(l.pts[l.pts.length - 1])) continue;
    // (densify, then walk in from each wet end to the first point on deep land)
    const D = [];
    for (let j = 0; j + 1 < l.pts.length; j++) {
      const a = l.pts[j], b = l.pts[j + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE / 2)));
      for (let t = 0; t < n; t++) D.push({ x: a.x + (b.x - a.x) * t / n, y: a.y + (b.y - a.y) * t / n, k: j, o: t === 0 });
    }
    D.push({ x: l.pts[l.pts.length - 1].x, y: l.pts[l.pts.length - 1].y, k: l.pts.length - 1, o: true });
    let i0 = 0, i1 = D.length - 1;
    if (wetEnd(D[0])) while (i0 < D.length && !deep(D[i0])) i0++;
    if (wetEnd(D[D.length - 1])) while (i1 >= 0 && !deep(D[i1])) i1--;
    const name = l.name || l.kind;
    if (i1 - i0 < 16) { lines.splice(k, 1); out.dropped.push(name); continue; }   // (all of it over the sea, or a stub)
    // the kept points: the line's own corners between, the cut ends exact
    const keep = [{ x: D[i0].x, y: D[i0].y }];
    for (let j = i0 + 1; j < i1; j++) if (D[j].o) keep.push({ x: D[j].x, y: D[j].y });
    keep.push({ x: D[i1].x, y: D[i1].y });
    l.pts = keep;
    if (l.kind === 'hwy') l.kind = 'ave';   // (a highway's piece on land, cut: an avenue that ends in a turnaround)
    out.cut.push(name);
  }
  // 4. the skeleton's crossings to other places that touch this one (where they meet its land)
  for (const A of ARTERIALS) {
    if (/^Canal /.test(A.name)) continue;
    const on = A.pts.find(([x, y]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const i = tile((x + dx) * TILE, (y + dy) * TILE); if (i >= 0 && own[i]) return true; } return false; });
    if (on) out.crossings.push({ name: A.name, at: on, foot: !!A.foot });
  }
  return out;
}
