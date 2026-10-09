// Lightning: when the storm's lightning comes, what it is and how far off (the same for everyone), and the bolts you
// see (the storm concept AT1-B). weather.js plays it: the flash over the screen and the scene, the bolt drawn over
// the scene like the rain, the ground lit where a strike comes down, the thunder when its sound gets to you.
//
// The storm (task #389, the owner: lightning should vary - a flash in the sky only, a bolt in the sky, a strike on a
// spot on the screen - with storms of varying intensity, rare bursts, usually one or two, sometimes only distant
// flashes, and the thunder after it by how far off it was):
//   stormSpell(n) -> { mood, bearing, ev: [...] }   the storm's spell n (STORM_S seconds of the shared clock, counting
//     the days - main.js: the server's day x the loop + loopTime - so everyone has the same storms; weather.js only
//     plays it while it rains, which the server decides). Hashed to a mood: mostly none; some spells only distant
//     flashes, the rumble long after; some a burst, usually one flash or two close together, now and then a strike
//     near you; now and then a proper storm, two or three bursts with strikes coming down round you. The storm is off
//     to one side (bearing), and its far bolts are seen on that side of the screen.
//     An event: { t: when (s, the shared clock), kind: 'sky' (a flash in the clouds, no bolt seen) | 'bolt' (off in the
//     distance: down out of the clouds or across them, cloud) | 'strike' (down to the ground near you), d: how far off
//     (m; a strike's is where it lands, strikePoint), k: how strong 0..1, seed: its bolt, its flicker, where it lands }
//   lightningIn(t0, t1, out) the events with t0 < t <= t1
//   strikePoint(seed, x, y) -> {x, y}   where a strike comes down near (x, y) (world px): of the points it hits in the
//     cells round you (one in each, from the seed), the nearest - so whoever is near you sees it land on the same spot
//   flashAt(e, s) -> 0..1   its flash s seconds after it struck: the channel lighting two to four times in half a
//     second (the return strokes), each dying fast, as bright as its kind and distance make it (flashLevel)
//   thunderVol(d, k) the thunder's loudness d m off (0.07..1): its delay is d / SOUND_MPS
//
// The bolts:
//   boltPath(seed, W, H, near, o) -> { segs: [[x0, y0, x1, y1, w, k]...], trunk (how many of segs are the main
//     channel, first), end: { x, y } (where it strikes), near }
//     deterministic by seed; every point inside [0, W] x [0, H]; the main channel runs from the top edge down, jagged,
//     forking into branches (thinner and fainter, some forking again). A far bolt ends high on the screen (off in the
//     distance), a near one low (in the street). o (optional): end {x, y} where a strike comes down (screen px); at
//     0..1 across the screen where a far bolt is; w its channel's width (3, 1.8); cloud: a bolt across the clouds
//     instead - in the top part of the screen, running sideways and branching, down to nothing.
//   drawBolt(g, bolt, k, night)   the bolt on a 2D context, additive: a wide soft glow, a bright core; k 0..1 its
//     strength this frame (the flash's flicker), night 0..1 (brighter against a dark sky); a near strike's ground glow
// Pure apart from drawBolt (no DOM), so test/worldbuild.test.js and test/lightning.test.js check them.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clampTo = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- the storm ----------------------------------------------------------------------------------------------------
export const STORM_S = 150;
export const PX_PER_M = 32;     // (the world's scale: 1 tile = 32 px = 1 m, as shared/tutorial.js counts km/h)
export const SOUND_MPS = 340;   // (sound in air)
const MOODS = [[0.45, 0], [0.24, 1], [0.21, 2], [0.1, 3]];   // [chance, mood]: no lightning, distant flashes, a burst, a storm
const spells = new Map();
export function stormSpell(n, force = null) {
  const key = force === null ? n : n + ':' + force;
  let s = spells.get(key);
  if (s) return s;
  const r = rng(n * 2654435761 + 4049), ev = [];
  let mood = 0;
  for (let h = r(), acc = 0, i = 0; i < MOODS.length; i++) { acc += MOODS[i][0]; if (h < acc) { mood = MOODS[i][1]; break; } }
  if (force !== null) mood = force;
  const bearing = r() * Math.PI * 2;
  const add = (t, kind, d, k) => ev.push({ t: n * STORM_S + t, kind, d: kind === 'strike' ? 0 : Math.round(d), k: Math.round(k * 100) / 100, seed: (r() * 4294967296) >>> 0, cloud: kind === 'bolt' && r() < 0.35, bearing });
  if (mood === 1) {   // distant flashes: one to three, far off in the clouds
    const m = 1 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) add(5 + r() * (STORM_S - 15), r() < 0.75 ? 'sky' : 'bolt', 5000 + r() * 9000, 0.2 + r() * 0.3);
  } else if (mood >= 2) {   // a burst (usually one flash or two), or a storm (two or three bursts, closer and stronger)
    const bursts = mood === 2 ? 1 : 2 + (r() < 0.4 ? 1 : 0);
    for (let b = 0; b < bursts; b++) {
      let t = (b + 0.1 + r() * 0.7) * (STORM_S - 20) / bursts;
      const m = mood === 2 ? (r() < 0.55 ? 1 : 2) : 1 + Math.floor(r() * 3);
      for (let i = 0; i < m; i++) {
        const x = r(), kind = x < (mood === 2 ? 0.25 : 0.4) ? 'strike' : x < 0.7 ? 'bolt' : 'sky';
        add(t, kind, mood === 2 ? 800 + r() * 4200 : 300 + r() * 2700, mood === 2 ? 0.5 + r() * 0.4 : 0.7 + r() * 0.3);
        t += 2 + r() * 9;
      }
    }
  }
  ev.sort((a, b) => a.t - b.t);
  s = { n, mood, bearing, ev };
  if (spells.size >= 12) spells.delete(spells.keys().next().value);
  spells.set(key, s);
  return s;
}
export function lightningIn(t0, t1, out = [], force = null) {
  out.length = 0;
  if (!(t1 > t0)) return out;
  for (let n = Math.floor(t0 / STORM_S); n <= Math.floor(t1 / STORM_S); n++) for (const e of stormSpell(n, force).ev) if (e.t > t0 && e.t <= t1) out.push(e);
  return out;
}
// where a strike comes down: the cells are a little smaller than a screen
const CELL_X = 820, CELL_Y = 540;
export function strikePoint(seed, x, y) {
  const cx = Math.floor(x / CELL_X), cy = Math.floor(y / CELL_Y);
  let best = null, bd = Infinity;
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const r = rng((seed ^ Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0);
    const px = (i + 0.1 + 0.8 * r()) * CELL_X, py = (j + 0.1 + 0.8 * r()) * CELL_Y, d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) { bd = d; best = { x: Math.round(px), y: Math.round(py) }; }
  }
  return best;
}
// how bright its flash is at its brightest: a strike near you lights everything; a bolt off in the distance less, the
// further the less; a flash in the clouds a glow
export function flashLevel(e, d = e.d) {
  const k = 0.6 + 0.4 * e.k;
  if (e.kind === 'strike') return 0.8 + 0.2 * e.k;
  if (e.kind === 'bolt') return (0.3 + 0.45 * clampTo(1 - d / 6000, 0, 1)) * k;
  return (0.12 + 0.36 * clampTo(1 - d / 9000, 0, 1)) * k;
}
// its flicker: [time, height, how fast it dies] for each stroke, from its seed (worked out once, kept on the event) -
// the channel goes nearly dark between strokes (60-160 ms apart), the last one lingers; in the clouds it's softer
function pulses(e) {
  if (e.pulses) return e.pulses;
  const r = rng(e.seed ^ 0x5bd1e995), n = (e.kind === 'strike' ? 2 : 1) + Math.floor(r() * 3), P = [], tau = e.kind === 'sky' ? 0.09 : 0.045;
  for (let i = 0, t = 0; i < n; i++) { P.push([t, i === 0 ? 1 : 0.55 + 0.45 * r(), i === n - 1 ? tau * 3.5 : tau]); t += 0.06 + 0.1 * r(); }
  return (e.pulses = P);
}
export function flashAt(e, s, d = e.d) {
  if (!(s >= 0) || s > 1.6) return 0;
  let f = 0;
  for (const [t, a, tau] of pulses(e)) if (s >= t) f = Math.max(f, a * Math.exp(-(s - t) / tau));
  return f * flashLevel(e, d);
}
export function thunderVol(d, k) { return clampTo(1.3 / (1 + d / 1600), 0.12, 1) * (0.55 + 0.45 * k); }

// ---- the bolts --------------------------------------------------------------------------------------------------
export function boltPath(seed, W, H, near = false, o = null) {
  const r = rng(seed * 2654435761 + 977), segs = [];
  const X = (v) => Math.round(clampTo(v, 0, W)), Y = (v) => Math.round(clampTo(v, 0, H));
  // branches off a channel, heading down and out; some fork again
  const branch = (bx, by, dir, len, w, k, depth) => {
    let px = bx, py = by;
    for (let j = 0; j < len; j++) {
      const nx = px + dir * (W * (0.008 + r() * 0.022)) + (r() - 0.5) * W * 0.012, ny = py + H * (0.022 + r() * 0.035);
      const a = [X(px), Y(py)], b = [X(nx), Y(ny)];
      if (a[0] === b[0] && a[1] === b[1]) break;
      segs.push([a[0], a[1], b[0], b[1], w, k * (1 - j / (len + 2))]);
      if (depth < 2 && r() < 0.22) branch(b[0], b[1], r() < 0.5 ? -dir : dir, Math.max(2, len - j - 2), Math.max(1, w - 0.6), k * 0.7, depth + 1);
      px = nx; py = ny;
      if (ny >= H || nx <= 0 || nx >= W) break;
    }
  };
  const tw = o && o.w ? o.w : 3, bw = tw >= 3 ? 1.8 : 1.2;
  // across the clouds: from somewhere high on the screen, sideways, jagged, rising and falling a little
  if (o && o.cloud) {
    const dir = r() < 0.5 ? -1 : 1, len = W * (0.25 + r() * 0.35), x0 = clampTo(W * (o.at ?? r()) - dir * len * 0.5, W * 0.04, W * 0.96);
    let x = x0, y = H * (0.06 + r() * 0.2);
    const n = Math.max(8, Math.round(len / Math.max(10, W / 40))), pts = [[X(x), Y(y)]];
    for (let i = 1; i <= n; i++) { x += dir * len / n * (0.6 + r() * 0.8); y += (r() - 0.5) * H * 0.04 + H * 0.004; pts.push([X(x), Y(y)]); }
    for (let i = 1; i < pts.length; i++) if (pts[i][0] !== pts[i - 1][0] || pts[i][1] !== pts[i - 1][1]) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], tw, 1]);
    const trunk = segs.length;
    for (let i = 1; i < pts.length - 1; i++) if (r() < 0.3) branch(pts[i][0], pts[i][1], r() < 0.5 ? -dir : dir, 2 + Math.floor(r() * 3), 1.2, 0.6, 1);
    if (segs.length === trunk && pts.length > 2) branch(pts[1][0], pts[1][1], dir, 3, 1.2, 0.6, 1);
    const e = segs[trunk - 1];
    return { segs, trunk, end: { x: e[2], y: e[3] }, near: false, cloud: true };
  }
  // the main channel: from somewhere along the top edge to where it strikes
  const end = o && o.end;
  const x0 = end ? clampTo(end.x + (r() - 0.5) * W * 0.3, W * 0.06, W * 0.94) : o && o.at !== undefined ? W * clampTo(o.at + (r() - 0.5) * 0.16, 0.08, 0.92) : W * (0.12 + r() * 0.76);
  const endY = end ? clampTo(end.y, H * 0.08, H) : near ? H * (0.58 + r() * 0.3) : H * (0.16 + r() * 0.3);
  const endX = end ? clampTo(end.x, 0, W) : clampTo(x0 + (r() - 0.5) * W * (near ? 0.35 : 0.5), W * 0.06, W * 0.94);
  const n = Math.max(8, Math.round(endY / Math.max(8, H / 26)));
  const pts = [[X(x0), 0]];
  let x = x0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, aim = x0 + (endX - x0) * t;
    x += (aim - x) * 0.35 + (r() - 0.5) * W * 0.045 * (1 - t * 0.4);   // jagged, but heading for the strike
    pts.push([X(i === n ? endX : x), Y(endY * t + (i < n ? (r() - 0.5) * (endY / n) * 0.5 : 0))]);
  }
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], tw, 1]);
  const trunk = segs.length;
  for (let i = 1; i < pts.length - 1; i++) if (r() < (i < 3 ? 0.2 : 0.42)) branch(pts[i][0], pts[i][1], r() < 0.5 ? -1 : 1, 3 + Math.floor(r() * 5), bw, 0.75, 0);
  if (segs.length === trunk) branch(pts[2][0], pts[2][1], 1, 4, bw, 0.75, 0);   // (always at least one fork)
  return { segs, trunk, end: { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] }, near: !!(near || end) };
}

export function drawBolt(g, B, k = 1, night = 1) {
  if (!B || k <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const a = Math.min(1, k * (0.65 + 0.35 * night));
  // a near strike lights the ground where it hits
  if (B.near) {
    const R = 140 + 60 * k, gr = g.createRadialGradient(B.end.x, B.end.y, 0, B.end.x, B.end.y, R);
    gr.addColorStop(0, `rgba(210,222,255,${(0.55 * a).toFixed(3)})`); gr.addColorStop(0.35, `rgba(150,170,255,${(0.22 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(120,140,255,0)');
    g.fillStyle = gr; g.fillRect(B.end.x - R, B.end.y - R, R * 2, R * 2);
  }
  // glow, halo, core: one path per pass and width
  for (const [mul, col, al] of [[5, '140,160,255', 0.1], [2.4, '185,200,255', 0.28], [1, '248,250,255', 1]]) {
    for (const w of [3, 1.8, 1.2, 1]) {
      let any = false;
      g.beginPath();
      for (const s of B.segs) { if (Math.abs(s[4] - w) > 0.05) continue; g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); any = true; }
      if (!any) continue;
      g.lineWidth = Math.max(1, w * mul);
      g.strokeStyle = `rgba(${col},${(al * a * (w >= 3 ? 1 : 0.75)).toFixed(3)})`;
      g.stroke();
    }
  }
  g.restore();
}
