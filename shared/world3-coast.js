// The coasts by hand, part 1: the tidepools (the nature program, 2026-10-20; the handcraft research's 4.9 and the
// concepts N8, N8-B, N8-D, NR1-C and Nature-A1's fifth panel: "low-tide basalt pools - starfish, urchins, crabs - a
// sea stack with gulls, a seal rock, a blowhole"; "where the giant redwoods come down to the sea").
// - North Cape: below the light's cliff the beach was a strip of sand with a few puddles. Now a shelf of black basalt
//   runs out from it into the sea, ragged along its edge, the surf breaking on it; pools of clear sea water lie in it,
//   barnacled rocks round them, sea stars, urchins and anemones in them, crabs on the rock; two of the pools hold a
//   golden star (shared/foraging.js). At its seaward lip a blowhole (the sea spouts up through it with the bigger
//   waves: server/systems/props.js); off the point a seal rock with its seals.
// - Redwood Cove: the woods' coast ran ruler-straight, one beach from end to end. Now a cove is bitten back into the
//   woods, its sand curving round under the giants, driftwood up the beach, a footpath down to it from the cove's
//   trail; at its north horn a tidepool shelf like North Cape's (its golden stars too).
// The pools' water (reserve 64 on land water, no lake flag) draws still and clear (client/art2/game/groundbake.js: land
// water, a pond's look), holds the tidepool's life (client/art2/game/waterlife.js) and fishes as the shore's (server/systems/fishing.js habitatAt: spot 'tidepool'); the shelf's rock is sand with
// reserve 128 | 64 (the rock shore's look). For the whole-world build only (shared/world3-world.js's done hook, after
// Granite Peaks'). Deterministic: arithmetic, integer hashes, and Math's functions only inside generateCity.
import { TILE, T } from './constants.js';

const RES = 32, KEEP = 4, ROCK = 128 | 64, POOLW = 64, BEACH = 36;
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const COAST3 = {
  // (tiles) rows: the stretch of shore; from: a column inland to look west from for the sea; out: how far the shelf
  // reaches into the sea at most; back: how far it takes in the beach; pools: how many to dig (at most); stars: golden
  // stars in that many of them
  cape: { name: 'North Cape tide pools', rows: [821, 854], from: 500, out: 6, back: 4, pools: 14, stars: 2, blowhole: true, seals: true, point: 'south' },
  cove: {
    name: 'Redwood Cove', rows: [1060, 1101], from: 514, depth: 15, beach: 8,
    horn: { name: 'Redwood Cove tide pools', rows: [1044, 1066], from: 514, out: 7, back: 4, pools: 9, stars: 2, point: 'west' },
    path: { from: [521, 1100], r: 12 },   // (the cove's trail's end, from its track: shared/naturesites.js redwoodCove)
  },
  capeTop: { rows: [806, 854], from: 486, span: 30 },   // (part 2) North Cape's cliff path: the rows, the column to look east from for the cliff band
  rubble: [[440, 800, 520, 860], [640, 2440, 730, 2700]],   // (part 2) the cliff bands whose bare rock between the basalt faces draws as rubble: North Cape's, the Redwood Coast Road's coves'
  pool: { gap: 1.5 },   // the pools: this many tiles of rock between two (each one of POOL_SHAPES: small - the tidepool's life, not the sea's fish: client/art2/game/waterlife.js)
};
// the pools' shapes (tile offsets from a corner): two tiles across at least each way, so the water shows as a pool
const POOL_SHAPES = [
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
  [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
];
const KEEP_PROPS = /^(seastack|sealrock|seal|gull|campfire|cliffwall|stairs|lighthouse|cottage|pbench)$/;
const LIFE = ['starfish', 'starfish', 'urchin', 'anemone', 'urchin', 'anemone'];

export function coastByHand3(m, H3) {
  const out = { cape: null, cove: null };
  if (!H3 || !H3.addProp || !m.land) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const sea = (x, y) => { if (!inF(x, y)) return false; const i = idx(x, y), t = m.tiles[i]; return (t === T.WATER || t === T.DEEP) && !m.land[i] && !(m.lake && m.lake[i]) && !(m.river && m.river[i]); };
  const shoreX = (y, from) => { for (let x = from; x > from - 120; x--) if (sea(x, y)) return x + 1; return null; };
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const changed = new Set();   // (tiles turned to sea, rock or new sand: what stood on them goes)
  const stacks = m.props.filter((p) => p && p.t === 'seastack').map((p) => [p.x / TILE, p.y / TILE]);
  const setLand = (i, from) => { m.land[i] = 1; if (m.lake) m.lake[i] = 0; if (m.river) m.river[i] = 0; if (from >= 0) { m.dist[i] = m.dist[from]; if (m.zone) m.zone[i] = m.zone[from]; } };

  // a tidepool shelf along the shore's rows: the rock out into the sea and over the beach's seaward edge, its pools,
  // their life, the golden stars; the blowhole at its lip, the seal rock off it
  function shelf(S) {
    const res = { name: S.name, rock: 0, pools: [], stars: 0, blowhole: null, sealrock: null, point: null };
    const [y0, y1] = S.rows, n = y1 - y0, raw = [];
    for (let y = y0; y <= y1; y++) {
      const sx = shoreX(y, S.from), t = (y - y0) / n, e = Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));
      raw.push(sx === null ? null : { y, sx, o: S.out * e + (hh(y, S.from, 11) - 0.5) * 2.2, b: S.back * Math.min(1, e * 1.6) + (hh(y, S.from, 12) - 0.5) * 1.6 });
    }
    const cells = new Map();   // (tile -> 'r' rock, 'p' pool)
    raw.forEach((r, k) => {
      if (!r) return;
      // (the edge smoothed over the rows either side: no saw-tooth)
      let so = 0, sb = 0, c = 0;
      for (let j = k - 1; j <= k + 1; j++) if (raw[j]) { so += raw[j].o; sb += raw[j].b; c++; }
      const o = Math.max(0, Math.round(so / c)), b = Math.max(0, Math.round(sb / c));
      if (o + b < 2) return;
      const from = idx(r.sx, r.y);
      for (let x = r.sx - o; x < r.sx + b; x++) {
        if (!inF(x, r.y)) continue;
        const i = idx(x, r.y), t = m.tiles[i];
        if (stacks.some(([sx, sy]) => Math.hypot(sx - x - 0.5, sy - r.y - 0.5) < 3.2)) continue;
        if (t === T.WATER && m.land[i]) { cells.set(i, 'p'); continue; }   // (an old puddle on the beach: a pool of the shelf's)
        if (!(t === T.WATER || t === T.DEEP || t === T.SAND || t === T.GRASS || t === T.DIRT) || (m.bld && m.bld[i] >= 0)) continue;
        m.tiles[i] = T.SAND; setLand(i, from); m.reserve[i] = (m.reserve[i] & ~POOLW) | ROCK | KEEP | RES;
        cells.set(i, 'r'); changed.add(i); res.rock++;
      }
    });
    // the old puddles taken in: the shelf's water
    for (const [i, k] of cells) if (k === 'p') { m.reserve[i] = (m.reserve[i] & ~128) | POOLW | KEEP | RES; if (m.lake) m.lake[i] = 0; changed.add(i); }
    // the pools: small rounds of the sea's water in the rock, a rim of rock round each, apart
    const rockAt = (x, y) => inF(x, y) && cells.get(idx(x, y)) === 'r';
    // the rock's seaward lip: the tiles of it with the sea beside them (west, or the rows' ends)
    const lip = [];
    for (const [i, k] of cells) { if (k !== 'r') continue; const x = i % W, y = (i - x) / W; if (sea(x - 1, y)) lip.push([x, y]); }
    if (S.blowhole && lip.length) {
      // (at the shelf's widest: its furthest-out lip, rock behind it for the hump)
      const mid = (y0 + y1) / 2, near = lip.filter(([x, y]) => Math.abs(y - mid) <= 4 && rockAt(x + 1, y));
      const fit = (near.length ? near : lip).filter(([x, y]) => rockAt(x + 1, y) && rockAt(x, y - 1) && rockAt(x, y + 1));
      const pickL = (fit.length ? fit : near.length ? near : lip).sort((a, b) => a[0] - b[0] || hh(a[0], a[1], 43) - hh(b[0], b[1], 43));
      const [bx, by] = pickL[0];
      const X = (bx + 0.6) * TILE, Y = (by + 0.5) * TILE;
      P('blowhole', X, Y, 18, { w: 64, d: 48 });
      m.natureSites.push({ kind: 'blowhole', name: `${S.name.replace(/ tide pools$/, '')} blowhole`, x: Math.round(X), y: Math.round(Y) });
      res.blowhole = [bx, by];
    }
    // the rock fishing point (part 2): a lip tile with rock behind it, clear of the blowhole - at the shelf's south end or
    // its furthest out; an angler's rods and cooler on it, casting into the wash off the rocks (the stripers and the
    // redfish: server/systems/fishing.js habitatAt's spot 'point')
    if (S.point && lip.length) {
      const fits = lip.filter(([x, y]) => rockAt(x + 1, y) && rockAt(x, y - 1) && rockAt(x, y + 1) && rockAt(x + 1, y - 1) && rockAt(x + 1, y + 1) && (!res.blowhole || Math.hypot(x - res.blowhole[0], y - res.blowhole[1]) >= 7));
      fits.sort((a, b) => (S.point === 'south' ? b[1] - a[1] : a[0] - b[0]) || hh(a[0], a[1], 45) - hh(b[0], b[1], 45));
      if (fits.length) {
        const [px, py] = fits[0], X = (px + 0.55) * TILE, Y = (py + 0.5) * TILE;
        P('rods', X + 8, Y - 16, 0, { a: Math.PI });
        P('cooler', X + 26, Y + 12, 0, { v: 1 });
        m.natureSites.push({ kind: 'fishpoint', name: `${S.name.replace(/ tide pools$/, '')} fishing rocks`, x: Math.round(X), y: Math.round(Y), a: Math.round(Math.PI * 100) / 100 });
        res.point = [px, py];
      }
    }
    const PL = COAST3.pool, made = [];
    for (let gy = y0; gy <= y1; gy++) for (let gx = S.from - 60; gx <= S.from; gx++) {
      if (made.length >= S.pools) break;
      const px = gx, py = gy;
      if (!rockAt(px, py) || hh(gx, gy, 23) < 0.2 || (res.blowhole && Math.hypot(px - res.blowhole[0], py - res.blowhole[1]) < 4) || (res.point && Math.hypot(px - res.point[0], py - res.point[1]) < 4)) continue;
      const blob = POOL_SHAPES[Math.floor(hh(gx, gy, 24) * POOL_SHAPES.length)].map(([dx, dy]) => [px + dx, py + dy]);
      const bxs = blob.map(([x]) => x), bys = blob.map(([, y]) => y), rx = (Math.max(...bxs) - Math.min(...bxs) + 1) / 2, ry = (Math.max(...bys) - Math.min(...bys) + 1) / 2;
      // (every tile of it rock with rock or its own water all round: never open to the sea, never into another pool)
      let ok = true;
      for (const [x, y] of blob) { for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (blob.some(([a, b]) => a === X && b === Y)) continue; if (!rockAt(X, Y)) { ok = false; break; } } if (!ok) break; }
      const qx = (Math.min(...bxs) + Math.max(...bxs)) / 2, qy = (Math.min(...bys) + Math.max(...bys)) / 2;
      if (!ok || made.some((q) => Math.abs(q.x - qx) < q.rx + rx + PL.gap && Math.abs(q.y - qy) < q.ry + ry + PL.gap)) continue;
      for (const [x, y] of blob) { const i = idx(x, y); m.tiles[i] = T.WATER; m.reserve[i] = (m.reserve[i] & ~128) | POOLW | KEEP | RES; cells.set(i, 'p'); }
      made.push({ x: qx, y: qy, rx, ry, n: blob.length, tiles: blob });
    }
    // (the old puddles taken in, each a pool of its own)
    const inMade = new Set(made.flatMap((q) => q.tiles.map(([x, y]) => idx(x, y))));
    for (const [i0, k0] of cells) {
      if (k0 !== 'p' || inMade.has(i0)) continue;
      const tiles = [], st = [i0];
      inMade.add(i0);
      while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; tiles.push([x, y]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx(x + dx, y + dy); if (cells.get(j) === 'p' && !inMade.has(j)) { inMade.add(j); st.push(j); } } }
      // (a puddle one tile thin widened to two, where the rock round it allows: a pool, not a crack)
      const thin = (k) => new Set(tiles.map((t) => t[k])).size === 1;
      for (const [k, dx, dy] of [[1, 0, 1], [0, 1, 0]]) {
        if (!thin(k)) continue;
        for (const [x, y] of tiles.slice()) {
          const X = x + dx, Y = y + dy;
          let rim = rockAt(X, Y);
          for (let a = -1; a <= 1 && rim; a++) for (let b = -1; b <= 1; b++) { const c = cells.get(idx(X + a, Y + b)); if (c !== 'r' && c !== 'p') { rim = false; break; } }
          if (!rim) continue;
          const j = idx(X, Y); m.tiles[j] = T.WATER; m.reserve[j] = (m.reserve[j] & ~128) | POOLW | KEEP | RES; cells.set(j, 'p'); inMade.add(j); tiles.push([X, Y]);
        }
      }
      const xs = tiles.map(([x]) => x), ys = tiles.map(([, y]) => y);
      made.push({ x: Math.round(xs.reduce((a, b) => a + b) / xs.length), y: Math.round(ys.reduce((a, b) => a + b) / ys.length), rx: (Math.max(...xs) - Math.min(...xs) + 1) / 2, ry: (Math.max(...ys) - Math.min(...ys) + 1) / 2, n: tiles.length, tiles });
    }
    // round each pool: barnacled basalt (solid), life in it, a crab now and then; gulls about
    for (const q of made) {
      const X = (q.x + 0.5) * TILE, Y = (q.y + 0.5) * TILE, nb = 2 + Math.floor(hh(q.x, q.y, 31) * 2);
      for (let k = 0; k < nb; k++) {
        const a = (k / nb) * Math.PI * 2 + hh(q.x, q.y, 32 + k) * 1.4, s = 18 + Math.floor(hh(q.x + k, q.y, 33) * 3) * 6;
        const x = X + Math.cos(a) * (q.rx * TILE + s * 0.55), y = Y + Math.sin(a) * (q.ry * TILE + s * 0.45);
        if (!rockAt(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
        P('boulder', x, y, Math.round(s * 0.32), { s, style: 'basalt', barn: 1 });
      }
      const nl = Math.min(q.n, 2 + Math.floor(hh(q.x, q.y, 34) * 2));
      for (let k = 0; k < nl; k++) { const [tx, ty] = q.tiles[Math.floor(hh(q.x, q.y + k, 35) * q.tiles.length)]; P(LIFE[Math.floor(hh(q.x, q.y, 36 + k) * LIFE.length)], (tx + 0.25 + hh(tx, ty, 37 + k) * 0.5) * TILE, (ty + 0.25 + hh(ty, tx, 38 + k) * 0.5) * TILE, 0, { v: Math.floor(hh(q.x, q.y, 39 + k) * 4) }); }
      if (hh(q.x, q.y, 40) < 0.4) { const x = X + (q.rx + 0.9) * TILE, y = Y + 6; if (rockAt(Math.floor(x / TILE), Math.floor(y / TILE))) P('crab', x, y, 0, { a: Math.round(hh(q.x, q.y, 41) * 628) / 100 }); }
    }
    const real = made;
    real.slice().sort((a, b) => hh(a.x, a.y, 42) - hh(b.x, b.y, 42)).slice(0, S.stars).forEach((q) => { (m.forage ||= []).push({ x: Math.round((q.x + 0.5) * TILE + q.rx * TILE * 0.4), y: Math.round((q.y + 0.5) * TILE + 2), k: 'goldStar' }); res.stars++; });
    real.slice(0, 3).forEach((q, k) => { const x = (q.x + 0.5) * TILE - (q.rx + 1) * TILE, y = (q.y + 0.5) * TILE - 6; if (rockAt(Math.floor(x / TILE), Math.floor(y / TILE))) P('gull', x, y, 0, { a: 2.4 - k, z: 0 }); });
    res.pools = real.map((q) => [q.x, q.y, q.n]);
    if (S.seals && lip.length) {
      // the seal rock: out in the sea off the shelf, clear of the stacks
      const x0 = Math.min(...lip.map(([x]) => x)), spots = [];
      for (let y = y0; y <= y1; y += 2) for (let x = x0 - 16; x <= x0 - 5; x += 2) {
        if (!sea(x, y) || !sea(x - 2, y) || !sea(x + 2, y) || !sea(x, y - 2) || !sea(x, y + 2)) continue;
        if (stacks.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 7)) continue;
        spots.push([x, y]);
      }
      spots.sort((a, b) => hh(a[0], a[1], 44) - hh(b[0], b[1], 44));
      if (spots.length) {
        const [sx, sy] = spots[0], X = (sx + 0.5) * TILE, Y = (sy + 0.5) * TILE;
        P('sealrock', X, Y, 40, { w: 120, d: 70 });
        for (const [dx, dy, p, a] of [[-26, -6, 0, 0.3], [18, 4, 1, 2.8], [-4, 16, 0, 1.2]]) P('seal', X + dx, Y + dy, 0, { pose: p, a, z: 32 });
        P('gull', X + 40, Y - 10, 0, { a: 0.4, z: 32 });
        res.sealrock = [sx, sy];
      }
    }
    const xs = [...cells.keys()].map((i) => i % W);
    // (the pools' look: clear water over the rock, a mountain lake's - not a park pond's green: client/art2/water.js)
    if (m.waters && Array.isArray(m.waters.lk)) m.waters.lk.push({ k: 'pond', t: 'alpine', box: [Math.min(...xs), y0, Math.max(...xs) + 1, y1 + 1], tide: 1 });
    m.natureSites.push({ kind: 'tidepools', name: S.name, x: Math.round(((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * TILE), y: Math.round(((y0 + y1) / 2 + 0.5) * TILE), pools: real.length });
    return res;
  }

  // ---- North Cape ----
  out.cape = shelf(COAST3.cape);
  // (part 2) the cliff path: along the top of the cliff band over the shelf, a worn footpath behind a post-and-rail fence,
  // the fence broken where the stairs go down; a coin telescope looking out over the shelf and the seal rock
  {
    const K = COAST3.capeTop, tops = [];
    for (let y = K.rows[0]; y <= K.rows[1]; y++) {
      let x = K.from;
      while (x < K.from + K.span && m.tiles[idx(x, y)] !== T.WALL) x++;
      if (x >= K.from + K.span) { tops.push(null); continue; }
      while (x < K.from + K.span + 6 && m.tiles[idx(x, y)] === T.WALL) x++;
      tops.push(m.tiles[idx(x, y)] === T.WALL ? null : x);
    }
    let run = [], fence = 0, path = 0;
    const flush = () => {
      for (let k = 0; k + 1 < run.length; k += 3) { const a = run[k], b = run[Math.min(run.length - 1, k + 3)]; if (a === b) continue; P('rail', (a[0] + 0.35) * TILE, (a[1] + 0.5) * TILE, 0, { tx: (b[0] - a[0]) * TILE, ty: (b[1] - a[1]) * TILE }); fence++; }
      run = [];
    };
    tops.forEach((x, k) => {
      const y = K.rows[0] + k;
      if (x === null) { flush(); return; }
      run.push([x, y]);
      for (const dx of [1, 2]) { const i = idx(x + dx, y); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { if (m.tiles[i] === T.GRASS) path++; m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
    });
    flush();
    // the telescope: on the path at the shelf's middle, looking west over it
    const mid = Math.round((COAST3.cape.rows[0] + COAST3.cape.rows[1]) / 2) - 6, tx = tops[mid - K.rows[0]];
    if (tx !== null && tx !== undefined) { P('scope', (tx + 1.6) * TILE, (mid + 0.5) * TILE, 6, { a: Math.PI }); P('pbench', (tx + 1.6) * TILE, (mid + 2.4) * TILE, 0, { a: Math.PI }); }
    out.capeTop = { fence, path, scope: tx !== null && tx !== undefined };
  }

  // ---- Redwood Cove: the cove bitten back into the woods, its beach, the horn's shelf, the path down ----
  {
    const C = COAST3.cove, [y0, y1] = C.rows, cy = (y0 + y1) / 2, R = (y1 - y0) / 2, cove = { name: C.name, dug: 0, sand: 0, shelf: null, path: 0 };
    const raw = [];
    for (let y = y0; y <= y1; y++) { const sx = shoreX(y, C.from), u = (y - cy) / R; raw.push(sx === null ? null : { y, sx, d: C.depth * (1 - u * u) * (1 - 0.18 * u) + (hh(y, 7, 51) - 0.5) * 1.6 }); }   // (a round bay, a little deeper toward its north end)
    const newShore = new Map();
    raw.forEach((r, k) => {
      if (!r) return;
      let s = 0, c = 0; for (let j = k - 2; j <= k + 2; j++) if (raw[j]) { s += raw[j].d; c++; }
      const d = Math.max(0, Math.round(s / c)), from = idx(r.sx - 1, r.y);
      for (let x = r.sx; x < r.sx + d; x++) {
        const i = idx(x, r.y), t = m.tiles[i];
        if (!(t === T.SAND || t === T.GRASS || t === T.DIRT) || (m.bld && m.bld[i] >= 0)) break;
        m.tiles[i] = T.WATER; m.land[i] = 0; if (m.lake) m.lake[i] = 0; if (m.river) m.river[i] = 0; m.dist[i] = m.dist[from]; if (m.zone) m.zone[i] = m.zone[from];
        m.reserve[i] = KEEP; changed.add(i); cove.dug++;
      }
      newShore.set(r.y, r.sx + d);
    });
    // the beach round it: sand up to C.beach tiles from the water (a wavering edge into the woods), the cove's all one
    // sand (the designed beach's), whatever stood on the new sand gone
    const xs = [...newShore.values()], bx0 = Math.min(...xs) - 14, bx1 = Math.max(...xs) + C.beach + 4, by0 = y0 - 6, by1 = y1 + 6;
    const dist = new Map(), q = [];
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (sea(x, y)) { dist.set(idx(x, y), 0); q.push([x, y]); }
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h], d = dist.get(idx(x, y));
      if (d >= C.beach + 1) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < bx0 || X > bx1 || Y < by0 || Y > by1 || dist.has(idx(X, Y))) continue;
        const t = m.tiles[idx(X, Y)];
        if (!(t === T.SAND || t === T.GRASS || t === T.DIRT) || !m.land[idx(X, Y)]) continue;
        dist.set(idx(X, Y), d + 1); q.push([X, Y]);
      }
    }
    for (const [i, d] of dist) {
      if (d === 0) continue;
      const x = i % W, y = (i - x) / W;
      if (y < y0 - 3 || y > y1 + 3) continue;
      const lim = C.beach + (hh(x >> 1, y >> 1, 52) - 0.5) * 3;
      if (d > lim || (m.reserve[i] & ~(KEEP | RES | 128 | 16 | 1 | 2 | 8))) continue;
      if (m.tiles[i] !== T.SAND) { changed.add(i); cove.sand++; }
      m.tiles[i] = T.SAND; m.reserve[i] = (m.reserve[i] & ~128) | BEACH;
    }
    // the horn's shelf
    cove.shelf = shelf(C.horn);
    // driftwood up the beach (the high-water line: 4-6 tiles from the water), a few rocks at the south horn's foot
    const dry = [...dist].filter(([i, d]) => d >= 4 && d <= 6 && m.tiles[i] === T.SAND).map(([i]) => i).filter((i) => { const y = (i - (i % W)) / W; return y > y0 + 3 && y < y1 - 3; });
    for (let k = 0; k < 6 && dry.length; k++) { const i = dry[Math.floor(hh(k, 9, 53) * dry.length)], x = i % W, y = (i - x) / W; P('driftwood', (x + 0.5) * TILE, (y + 0.5) * TILE, 0, { a: Math.round(hh(k, 10, 53) * 314) / 100, len: 44 + Math.floor(hh(k, 11, 53) * 3) * 12 }); }
    for (let k = 0; k < 5; k++) {
      const y = y1 - 2 - Math.floor(hh(k, 12, 54) * 6), sx = newShore.get(y);
      if (sx === undefined) continue;
      const x = sx + Math.floor(hh(k, 13, 54) * 2), s = 14 + Math.floor(hh(k, 14, 54) * 3) * 5;
      if (m.tiles[idx(x, y)] === T.SAND) P('boulder', (x + 0.5) * TILE, (y + 0.5) * TILE, Math.round(s * 0.3), { s, style: 'basalt', barn: hh(k, 15, 54) < 0.5 ? 1 : 0 });
    }
    // the footpath down to the sand from the cove's trail (its end in the woods: the dirt nearest C.path.from)
    let end = null, bd = 1e9;
    const [px, py] = C.path.from;
    for (let y = py - C.path.r; y <= py + C.path.r; y++) for (let x = px - C.path.r; x <= px + C.path.r; x++) { if (!inF(x, y) || m.tiles[idx(x, y)] !== T.DIRT) continue; const d = Math.hypot(x - px, y - py) + (x - px) * 0.2; if (d < bd) { bd = d; end = [x, y]; } }
    if (end) {
      let goal = null, gd = 1e9;
      for (const [i, d] of dist) { if (d < 3 || m.tiles[i] !== T.SAND) continue; const x = i % W, y = (i - x) / W; const g = Math.hypot(x - end[0], y - end[1]); if (g < gd) { gd = g; goal = [x, y]; } }
      if (goal && gd < 40) {
        const mid = [Math.round((end[0] + goal[0]) / 2 + 2), Math.round((end[1] + goal[1]) / 2 - 3)];
        for (const [a, b] of [[end, mid], [mid, goal]]) {
          const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
          for (let s = 0; s <= steps; s++) {
            const x = a[0] + (b[0] - a[0]) * s / steps, y = a[1] + (b[1] - a[1]) * s / steps;
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
              const X = Math.floor(x) + dx, Y = Math.floor(y) + dy, i = idx(X, Y), t = m.tiles[i];
              if (t !== T.GRASS && t !== T.DIRT) continue;
              if (t === T.GRASS) cove.path++;
              m.tiles[i] = T.DIRT; m.reserve[i] |= RES; changed.add(i);
            }
          }
        }
      }
    }
    out.cove = cove;
  }

  // (part 2) the cliff bands' bare rock between their basalt faces (shared/world3-west.js): rubble, not black squares
  out.rubble = 0;
  for (const [x0, y0, x1, y1] of COAST3.rubble) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = idx(x, y); if (inF(x, y) && m.tiles[i] === T.WALL && !(m.reserve[i] & RES) && m.dist[i] >= 47 && m.dist[i] <= 54) { m.reserve[i] |= RES; out.rubble++; } }
  // what stood on the changed ground goes (the coast's own furniture stays), and the finds on it but the stars
  const kept = new Set(m.props.filter((p) => p && KEEP_PROPS.test(p.t) && changed.has(Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE))).map((p) => p.x + ',' + p.y));
  if (changed.size && H3.removeProps) H3.removeProps(m, (x, y) => changed.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)) && !kept.has(x + ',' + y));
  if (m.forage) m.forage = m.forage.filter((f) => f.k === 'goldStar' || !changed.has(Math.floor(f.y / TILE) * W + Math.floor(f.x / TILE)));
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  return out;
}
