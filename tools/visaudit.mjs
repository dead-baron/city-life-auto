// The visibility audit (the owner, 11-06: "Just want to make sure things that are supposed to be visible are visible" -
// a station's name board under the roofs of the houses south of it, an arrival platform's board behind its canopy, a
// sign half under the highway, the park's chess table behind a tree). For everything meant to be seen - every place's
// door and sign, the stations' name boards and platforms, the route boards, the activities' tables and machines, the
// ATMs and vending machines, the standing signs - its pixels on screen under the game's projection, and what the bake
// draws over them: the same static items (client/art2/game/statics.js staticItems), their own sprites (makeStatic) at
// the bake's art grid, the bake's depth rule (chunkbake.js compositeDepth: the taller pixel wins, ties go to the later),
// buildings last; and a train standing at the platform (live, drawn over the chunk: it wins ties).
//   visTargets(M)            -> [{ kind, id, name, x, y, ... }]   what is meant to be seen
//   visAudit(M, opt)         -> { rows: [{ kind, id, name, x, y, cover, by }], counts: { kind: [n, hidden] } }   (opt.all: the
//                               rows of what is seen too, ok: true; opt.kinds: only these kinds)
//      cover: the share of its pixels drawn over; by: what covers most of them ('building', 'tree' (a map's), 'tree*' (the
//      bake's own greenery), 'deck', 'train',
//      'rail', 'prop:<kind>', 'item:<key prefix>'); a row is hidden at cover >= opt.cover (0.4).
// Run: node --max-old-space-size=4096 tools/visaudit.mjs [--json out.json]   (builds World v3: under the heavy lock)
import { staticItems, makeStatic } from '../client/art2/game/statics.js';
import { TILE, T } from '../shared/constants.js';
import { railAt } from '../shared/mapcore.js';
import { TRAIN_LEN } from '../shared/mapcore.js';
import { pathToFileURL } from 'node:url';

const CH = 768, AG = 2;                  // the chunk, the art grid (the game bakes at 1 art px = 2 world px)
const TRAIN_W = 76, TRAIN_H = 64;        // (actors.js TRAIN_DIMS: a coach)
const isBld = (it) => !!(it.fade || (it.recipe && it.recipe.t === 'b' && !it.recipe.frame));
const RAIL_KEYS = /^(pcan|bn:|lp:|stb:|rboard|sth:|sbr:|els:|fbr:|elsign|elp:|el:|ptl:|xs:)/;
// what the activities and interactions are played at (server/systems/activities.js ANCHOR, chess.js, the arcades,
// the fishing piers, the hoops and the lanes): props meant to be found
// (a street's mailboxes, lamps and benches are dressing: not in it)
export const SPOT_PROPS = new Set(['cafetable', 'picnic', 'fishtable', 'pierrail', 'rods', 'arcade', 'arcademachine', 'pinball', 'claw', 'hoop', 'shower', 'payphone', 'vend_cola', 'vend', 'atm', 'mapboard', 'firepit', 'campfire', 'grill', 'busstop', 'shelter', 'taxisign', 'textsign', 'jobboard', 'noticeboard', 'telescope']);

const catOf = (M, it) => {
  if (it.train) return 'train';
  const r = it.recipe || {};
  if (r.t === 'f') return it.pi !== undefined ? 'tree' : 'tree*';   // (tree*: the bake's own greenery, not the map's)
  if (isBld(it)) return 'building';
  if (it.deck || r.t === 'deck' || r.t === 'el' || /^(dk:|el:|deck)/.test(it.key)) return 'deck';
  if (RAIL_KEYS.test(it.key)) return 'rail';
  if (it.pi !== undefined && M.props[it.pi]) return 'prop:' + M.props[it.pi].t;
  return 'item:' + String(it.key).split(/[:]/)[0];
};

// ---- sprites, compact: { x0, y0 (screen px of the top-left, the item placed), w, h, z: Int16Array (-32768 = empty) } --
function compact(G) {
  const S = G.ap2 || 1, w = G.w * S, h = G.h * S, z = new Int16Array(w * h).fill(-32768);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const i = y * G.w + x;
    if (G.col[i * 4 + 3] !== 255) continue;   // (a soft edge blends: it covers nothing)
    const v = G.z[i] * S;
    for (let v2 = 0; v2 < S; v2++) for (let u = 0; u < S; u++) z[(y * S + v2) * w + x * S + u] = v;
  }
  return { w, h, ax: G.ax, ay: G.ay, z };
}
class Cache {
  constructor(max) { this.max = max; this.bytes = 0; this.m = new Map(); }
  get(k, make) {
    let v = this.m.get(k);
    if (v !== undefined) { this.m.delete(k); this.m.set(k, v); return v; }
    v = make(); this.m.set(k, v); this.bytes += v ? v.z.length * 2 + 64 : 64;
    while (this.bytes > this.max && this.m.size > 1) { const k0 = this.m.keys().next().value, o = this.m.get(k0); this.bytes -= o ? o.z.length * 2 + 64 : 64; this.m.delete(k0); }
    return v;
  }
}
const place = (it, s) => ({ sx: Math.round((it.x - s.ax) / AG) * AG, sy: Math.round((it.y - (it.z0 || 0) - s.ay) / AG) * AG });
const rectOf = (it) => { const e = it.ext || [0, 0, 0, 0], z0 = it.z0 || 0; return [it.x - e[0], it.y - z0 - e[1], it.x + e[2], it.y - z0 + e[3]]; };

// ---- a train standing at a platform: a box W wide, H tall, along the track at the station (live: wins ties) ---------
function trainSprite(R, st) {
  const half = TRAIN_LEN / 2, pts = [];
  for (let s = -half; s <= half; s += 2) pts.push(railAt(R, st.s + s));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x - 40); x1 = Math.max(x1, p.x + 40); y0 = Math.min(y0, p.y - 40 - TRAIN_H); y1 = Math.max(y1, p.y + 40); }
  x0 = Math.floor(x0); y0 = Math.floor(y0);
  const w = Math.ceil(x1) - x0 + 1, h = Math.ceil(y1) - y0 + 1, z = new Int16Array(w * h).fill(-32768);
  const set = (X, Y, Z) => { const px = Math.round(X) - x0, py = Math.round(Y - Z) - y0; if (px < 0 || py < 0 || px >= w || py >= h) return; const i = py * w + px; if (z[i] < Z) z[i] = Z; };
  for (const p of pts) {
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    for (let v = -TRAIN_W / 2; v <= TRAIN_W / 2; v += 1) {
      const X = p.x + nx * v, Y = p.y + ny * v;
      set(X, Y, TRAIN_H);
      if (Math.abs(v) >= TRAIN_W / 2 - 1) for (let Z = 0; Z < TRAIN_H; Z++) set(X, Y, Z);   // (its sides)
    }
  }
  return { train: true, key: 'train', x: 0, y: 0, spr: { w, h, ax: 0, ay: 0, z }, sx: x0, sy: y0 };
}

// ---- what is meant to be seen -------------------------------------------------------------------------------------
// item targets: { kind, id, name, x, y, match(it), pix: 'board' | 'all' }; virtual: { kind, id, name, x, y, pts: [[sx, sy, z]], skip(it) }
export function visTargets(M) {
  const out = [];
  // the places: a door on the south face - the top of the doorway and the sign over it (z 16..56, 32 px wide: a low
  // hedge or a bed of flowers in front of it hides nothing that matters) - else the step outside
  for (const p of M.pois || []) {
    if (!p || p.x === undefined) continue;
    const b = p.b !== undefined ? M.buildings[p.b] : null, pts = [];
    const south = b && p.y >= (b.ty + b.th) * TILE - 4;
    if (south) { const Y = (b.ty + b.th) * TILE; for (let x = -16; x <= 16; x += 2) for (let z = 16; z <= 56; z += 2) pts.push([Math.round(p.x + x), Y - z, z]); }
    else for (let x = -6; x <= 6; x += 2) for (let z = 2; z <= 26; z += 2) pts.push([Math.round(p.x + x), Math.round(p.y) - z, z]);
    const kind = p.kind === 'atm' || p.kind === 'vending' ? p.kind : south ? 'place-front' : b ? 'place-door-n' : 'place-spot';
    // (a front is part of its building: drawn with the buildings, after everything else, in order; a spot is someone
    // standing there - drawn over the chunk, winning ties)
    // (a door on the north face is behind its own building, by design - the building fades round you there: only what
    // else stands over its step counts; a station's own house, canopies and furniture are its own)
    out.push({ kind, id: `poi${p.id}`, name: p.label || p.kind, x: p.x, y: south ? (b.ty + b.th) * TILE : p.y, pts, b: p.b, foot: b ? [b.tx * TILE - 8, b.ty * TILE - 8, (b.tx + b.tw) * TILE + 8, (b.ty + b.th) * TILE + 40] : null, noBld: kind === 'place-door-n', rail: p.kind === 'station', tie: south ? 'bld' : 'win' });
  }
  // the stations: each name board (and the El's), the route boards; the platforms (their paving, z 6: ground sinks 4)
  out.push({ kind: 'station-board', items: (it) => /^(stb:|elsign:)/.test(it.key), pix: 'board', train: true });
  out.push({ kind: 'route-board', items: (it) => it.key === 'rboard', pix: 'all', train: true });
  for (const R of [...(M.rails || [M.rail]), ...(M.arrivals || [])]) {
    if (!R || !R.stations) continue;
    for (const st of R.stations) {
      if (st.under || st.el) continue;
      const half = st.half || 112, inner = st.inner || 40, outer = st.outer || 104, sd = st.side || 1, pts = [];
      for (let s = -half + 8; s <= half - 8; s += 8) {
        const q = railAt(R, st.s + s);
        for (let o = inner + 4; o <= outer - 4; o += 8) { const X = q.x - Math.sin(q.a) * sd * o, Y = q.y + Math.cos(q.a) * sd * o; pts.push([Math.round(X), Math.round(Y - 6), 2]); }
      }
      const c = railAt(R, st.s);
      out.push({ kind: 'platform', id: `pl:${st.name}:${sd}`, name: `${st.name} (${Math.cos(c.a) * sd > 0 ? 'south' : 'north'})`, x: c.x, y: c.y, pts, rail: true, tie: 'lose', R, st });
    }
  }
  // the props meant to be found: the activities' tables, the arcades, the signs, the machines
  M.props.forEach((p, pi) => {
    if (!p || !SPOT_PROPS.has(p.t)) return;
    if (p.t === 'cafetable' && !p.chess) return;
    out.push({ kind: p.t === 'cafetable' ? 'chess' : p.t === 'textsign' ? 'sign' : 'spot:' + p.t, id: `pr${pi}`, name: p.text || p.t, x: p.x, y: p.y, pi, items: (it) => it.pi === pi, pix: p.t === 'textsign' ? 'board' : 'all' });
  });
  return out;
}

// the pixels of an item target's sprite: [[sx, sy, z]] (a board: its face, not its posts)
function itemPts(it, s, pix) {
  const { sx, sy } = place(it, s), z0 = it.z0 || 0, zb = pix === 'board' && it.recipe ? (it.recipe.z || 0) : -1, pts = [];
  for (let y = 0; y < s.h; y += 2) for (let x = 0; x < s.w; x += 2) { const z = s.z[y * s.w + x]; if (z > -32768 && z >= zb) pts.push([sx + x, sy + y, z + z0]); }
  return pts;
}

// ---- the audit ----------------------------------------------------------------------------------------------------
export function visAudit(M, opt = {}) {
  const cover = opt.cover ?? 0.4, cache = new Cache(opt.cacheBytes ?? 700e6), lists = new Map(), log = opt.log || (() => {});
  const chunkItems = (cx, cy) => {
    const k = cy * 4096 + cx;
    let l = lists.get(k);
    if (!l) { l = staticItems(M, cx, cy); lists.set(k, l); if (lists.size > 64) lists.delete(lists.keys().next().value); }
    return l;
  };
  const spr = (it) => cache.get(it.key, () => { try { const G = makeStatic(it.recipe); return G && G.w ? compact(G) : null; } catch { return null; } });
  // every item whose picture overlaps rect r, once
  const itemsIn = (r) => {
    const seen = new Set(), out = [];
    for (let cy = Math.floor(r[1] / CH); cy <= Math.floor(r[3] / CH); cy++) for (let cx = Math.floor(r[0] / CH); cx <= Math.floor(r[2] / CH); cx++) {
      for (const it of chunkItems(cx, cy)) {
        const id = `${it.key}@${it.x},${it.y},${it.z0 || 0}`;
        if (seen.has(id)) continue;
        const q = rectOf(it);
        if (q[2] < r[0] || q[0] > r[2] || q[3] < r[1] || q[1] > r[3]) continue;
        seen.add(id); out.push(it);
      }
    }
    return out;
  };
  const trains = new Map();
  const trainFor = (R, st) => { const k = `${st.x},${st.y}`; if (!trains.has(k)) trains.set(k, trainSprite(R, st)); return trains.get(k); };
  const stationAt = (x, y) => {   // the station (and its line) a board or route board stands at
    let best = null, bd = 400;
    for (const R of [...(M.rails || [M.rail]), ...(M.arrivals || [])]) for (const st of (R && R.stations) || []) { if (st.under || st.el) continue; const d = Math.hypot(st.x - x, st.y - y); if (d < bd) { bd = d; best = [R, st]; } }
    return best;
  };
  // resolve the item targets: walk the chunks the targets' anchors are in
  const T0 = visTargets(M), targets = [];
  if (opt.kinds) for (let i = T0.length - 1; i >= 0; i--) if (!opt.kinds.some((k) => T0[i].kind.startsWith(k))) T0.splice(i, 1);
  const itemKinds = T0.filter((t) => t.items && t.pi === undefined);
  const propT = new Map(); for (const t of T0) if (t.pi !== undefined) propT.set(t.pi, t);
  for (const t of T0) if (!t.items) targets.push(t);
  // global items (boards): every chunk that has any; props: the chunk their anchor is in
  const want = new Set();
  for (const t of propT.values()) for (const dy of [-300, 0]) want.add(Math.floor((t.y + dy) / CH) * 4096 + Math.floor(t.x / CH));   // (an item is listed in the chunks its picture is in)
  for (const R of [...(M.rails || [M.rail]), ...(M.arrivals || [])]) for (const st of (R && R.stations) || []) want.add(Math.floor(st.y / CH) * 4096 + Math.floor(st.x / CH));
  if (M.el) for (let x = M.el.x0; x < M.el.x3 + CH; x += CH) for (const dy of [-400, -200, 0, 200]) want.add(Math.floor((M.el.y + dy) / CH) * 4096 + Math.floor(x / CH));
  for (const h of M.railHubs || []) want.add(Math.floor(h.y / CH) * 4096 + Math.floor(h.x / CH));
  const got = new Set();
  for (const k of [...want].sort((a, b) => a - b)) {
    const cx = k % 4096, cy = Math.floor(k / 4096);
    for (const it of staticItems(M, cx, cy)) {
      const id = `${it.key}@${it.x},${it.y},${it.z0 || 0}`;
      if (got.has(id)) continue;
      const pt = it.pi !== undefined ? propT.get(it.pi) : null;
      if (pt && pt.items(it) && !pt.it) { pt.it = it; got.add(id); continue; }
      for (const t of itemKinds) if (t.items(it)) { got.add(id); targets.push({ kind: t.kind, id: `${it.key}@${Math.round(it.x)},${Math.round(it.y)}`, name: it.recipe && it.recipe.text ? it.recipe.text : it.key, x: it.x, y: it.y, it, pix: t.pix, train: t.train }); break; }
    }
  }
  for (const t of propT.values()) if (t.it) targets.push(t);
  // in chunk order (the caches)
  targets.sort((a, b) => (Math.floor(a.y / CH) - Math.floor(b.y / CH)) || (Math.floor(a.x / CH) - Math.floor(b.x / CH)) || a.x - b.x);
  const rows = [], counts = {};
  let n = 0;
  for (const t of targets) {
    if (++n % 500 === 0) log(`  ${n} / ${targets.length}`);
    let pts = t.pts, self = null;
    if (t.it) { const s = spr(t.it); if (!s) continue; pts = itemPts(t.it, s, t.pix); self = t.it; }
    if (!pts || !pts.length) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const r = [x0, y0, x1, y1];
    // what draws over its pixels: the taller pixel there, a tie to whatever's drawn later (buildings last, then y, x)
    const ord = (it) => [isBld(it) ? 1 : 0, it.y, it.x];
    const later = (a, b) => { const p = ord(a), q = ord(b); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; };
    const occ = [];
    // its own: itself; its building and what stands on its footprint or at its door (a hotel's canopy, a market's stalls,
    // a farm's barn - not a tree); a station's own furniture
    const own = (it) => {
      if (it === self || (self && it.key === self.key && it.x === self.x && it.y === self.y) || (t.b !== undefined && it.b === t.b)) return true;
      const c = catOf(M, it);
      if (t.rail && (c === 'rail' || c === 'deck')) return true;   // (a station's footbridge is a deck: shared/levels.js)
      if (t.noBld && c === 'building') return true;
      return !!t.foot && !c.startsWith('tree') && c !== 'deck' && it.x >= t.foot[0] && it.x <= t.foot[2] && it.y >= t.foot[1] && it.y <= t.foot[3];
    };
    for (const it of itemsIn(r)) {
      if (own(it)) continue;
      const s = spr(it); if (!s) continue;
      const { sx, sy } = place(it, s);
      occ.push({ it, s, sx, sy, z0: it.z0 || 0, after: self ? later(it, self) >= 0 : t.tie === 'bld' ? isBld(it) && it.y > t.y : t.tie === 'lose' });
    }
    if (t.train) { const st = stationAt(t.x, t.y); if (st) { const tr = trainFor(st[0], st[1]); occ.push({ it: tr, s: tr.spr, sx: tr.sx, sy: tr.sy, z0: 0, after: true, live: true }); } }
    const by = new Map(), keys = opt.keys ? new Map() : null;
    let hid = 0;
    for (const [px, py, pz] of pts) {
      let win = null;
      for (const o of occ) {
        const lx = px - o.sx, ly = py - o.sy;
        if (lx < 0 || ly < 0 || lx >= o.s.w || ly >= o.s.h) continue;
        const z = o.s.z[ly * o.s.w + lx];
        if (z === -32768) continue;
        const hz = z + o.z0;
        if (hz > pz || (hz === pz && o.after)) { win = o; break; }
      }
      if (win) { hid++; const c = catOf(M, win.it); by.set(c, (by.get(c) || 0) + 1); if (opt.keys) keys.set(win.it.key, (keys.get(win.it.key) || 0) + 1); }
    }
    const cv = hid / pts.length, top = [...by].sort((a, b) => b[1] - a[1])[0];
    const k = t.kind, row = { kind: k, id: t.id, name: t.name, x: Math.round(t.x), y: Math.round(t.y), cover: +cv.toFixed(2), by: top ? top[0] : null };
    if (keys && keys.size) row.key = [...keys].sort((a, b) => b[1] - a[1])[0][0];
    (counts[k] ||= [0, 0])[0]++;
    if (cv >= cover) { counts[k][1]++; rows.push(row); } else if (opt.all) rows.push({ ...row, ok: true });
  }
  return { rows, counts, n: targets.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { buildWorld3 } = await import('../server/world3.js');
  const { writeFileSync } = await import('node:fs');
  const t0 = Date.now();
  const { map: M } = await buildWorld3(1337, { log: () => {} });
  console.log(`World v3 built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const t1 = Date.now();
  const A = visAudit(M, { log: console.log });
  console.log(`audited ${A.n} things in ${((Date.now() - t1) / 1000).toFixed(0)} s`);
  for (const [k, [n, h]] of Object.entries(A.counts).sort()) console.log(`  ${k.padEnd(18)} ${String(n).padStart(5)}  hidden ${h}`);
  const byK = {};
  for (const r of A.rows) (byK[`${r.kind} / ${r.by}`] ||= []).push(r);
  for (const [k, l] of Object.entries(byK).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k}: ${l.length}  e.g. ${l.slice(0, 3).map((r) => `${r.name} (${r.x},${r.y}) ${Math.round(r.cover * 100)}%`).join('; ')}`);
  const j = process.argv.indexOf('--json');
  if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(A, null, 1));
}
