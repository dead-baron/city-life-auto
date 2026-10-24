// Railway art: track (ties, rails, the bridge decks and their girders, crossing panels) and the
// open-air station platforms are baked into the ground chunks; rolling stock (roof view or the
// lit interior when you're riding), level-crossing gates, the platform clocks and the "train in -
// board here" glow are drawn live. Procedural canvas drawing, except the subway entrance kiosks
// (cut from the concept art, in the sprite atlas).
import { T, TILE, CHUNK_PX } from '../../shared/constants.js';
import { CROSSING_ARM, railAt, crossingGate } from '../../shared/mapcore.js';
import { atlas } from './sprites.js';

const TIE_STEP = 18, RAIL_OFF = 12;

// Index rail points by ground chunk (with a margin) so a chunk bake only walks its own track.
export function railIndex(map, key, rail = map.rail) {
  const out = new Map();
  if (!rail) return out;
  rail.pts.forEach((p, i) => {
    for (let cy = Math.floor((p.y - 48) / CHUNK_PX); cy <= Math.floor((p.y + 48) / CHUNK_PX); cy++)
      for (let cx = Math.floor((p.x - 48) / CHUNK_PX); cx <= Math.floor((p.x + 48) / CHUNK_PX); cx++) {
        const k = key(cx, cy);
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(i);
      }
  });
  return out;
}

const roadAt = (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), t = m.tileAt(tx, ty); return t === T.ROAD || (t === T.BRIDGE && !!m.roadAxis[m.idx(tx, ty)]); };
const wetAt = (m, x, y) => { const t = m.tileAtPx(x, y); return t === T.WATER || t === T.DEEP || t === T.BRIDGE; };

export function drawRailChunk(g, m, idx, rail = m.rail, railsOnly = false) {
  if (!idx || !idx.length || !rail) return;
  const pts = rail.pts, n = pts.length;
  const seg = (i) => { const p = pts[i], q = pts[(i + 1) % n]; return { p, q, a: Math.atan2(q.y - p.y, q.x - p.x), len: Math.hypot(q.x - p.x, q.y - p.y) }; };
  if (!railsOnly) railBed(g, m, idx, seg);
  // the two rails
  for (const [w, col] of [[4, '#2a2622'], [2, '#b8bcc4']]) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
    for (const side of [-1, 1]) {
      g.beginPath();
      for (const i of idx) {
        const { p, q, a } = seg(i);
        if (p.under || q.under) continue;
        const nx = -Math.sin(a) * side * RAIL_OFF, ny = Math.cos(a) * side * RAIL_OFF;
        g.moveTo(p.x + nx, p.y + ny); g.lineTo(q.x + nx, q.y + ny);
      }
      g.stroke();
    }
  }
}
// (H33: World v3's loops at their junctions - the bed and the ties of every loop are drawn before any rails, so where a
// loop leaves or crosses another both tracks' rails show: the switch's points and frog, the diamond; and the marks of
// the switches - a turnout's frog and point lever, a diamond's crossing timbers - from m.railSwitches)
export function drawRailSwitches(g, m, cx, cy) {
  const x0 = cx * CHUNK_PX - 120, y0 = cy * CHUNK_PX - 120, x1 = x0 + CHUNK_PX + 240, y1 = y0 + CHUNK_PX + 240;
  for (const w of m.railSwitches || []) {
    if (w.x < x0 || w.x > x1 || w.y < y0 || w.y > y1) continue;
    g.save();
    if (w.kind === 'turnout') {
      g.translate(w.fx, w.fy); g.rotate(w.a);
      g.fillStyle = '#6d7078'; g.beginPath(); g.moveTo(-14, 0); g.lineTo(10, -5); g.lineTo(10, 5); g.closePath(); g.fill();   // the frog
      g.restore(); g.save();
      g.translate(w.x, w.y); g.rotate(w.a);
      g.fillStyle = '#2e3a2e'; g.fillRect(-8, 28, 16, 10); g.fillStyle = '#d8c040'; g.fillRect(-2, 26, 4, 6);   // the point lever
    } else {
      g.translate(w.x, w.y); g.rotate(w.a);
      g.strokeStyle = '#8c9098'; g.lineWidth = 2; g.beginPath(); g.moveTo(-18, 0); g.lineTo(0, -12); g.lineTo(18, 0); g.lineTo(0, 12); g.closePath(); g.stroke();   // the diamond's check rails
    }
    g.restore();
  }
}
function railBed(g, m, idx, seg) {
  // over the water: the bridge's shadow and its deck, drawn smooth along the line
  for (const [dx, dy, w, col] of [[12, 16, 70, 'rgba(0,8,22,.42)'], [0, 5, 64, '#3a3f48'], [0, 0, 62, '#5b6068']]) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath();
    for (const i of idx) { const { p, q } = seg(i); if (p.under || q.under || !wetAt(m, p.x, p.y) || !wetAt(m, q.x, q.y) || roadAt(m, p.x, p.y)) continue; g.moveTo(p.x + dx, p.y + dy); g.lineTo(q.x + dx, q.y + dy); }
    g.stroke();
  }
  // ballast shoulder + ties (timber deck over the water, nothing on the road panels)
  for (const i of idx) {
    const { p, q, a, len } = seg(i);
    if (p.under || q.under) continue;
    for (let s = Math.ceil(p.s / TIE_STEP) * TIE_STEP; s < p.s + len; s += TIE_STEP) {
      const k = (s - p.s) / len, x = p.x + (q.x - p.x) * k, y = p.y + (q.y - p.y) * k;
      if (roadAt(m, x, y)) {
        g.fillStyle = '#3a3a40';
        g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-TIE_STEP / 2, -20, TIE_STEP, 40); g.restore();
        continue;
      }
      const wet = wetAt(m, x, y);
      g.save(); g.translate(x, y); g.rotate(a);
      if (wet) { // trestle: deck planks and the stringers under them
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-8, -27, 14, 56);
        g.fillStyle = '#6b4a2a'; g.fillRect(-7, -26, 12, 52);
        g.fillStyle = '#86603a'; g.fillRect(-7, -26, 12, 3);
      } else {
        g.fillStyle = 'rgba(70,60,50,.35)'; g.fillRect(-9, -26, TIE_STEP, 52);
        g.fillStyle = '#4a3422'; g.fillRect(-5, -21, 10, 42);
        g.fillStyle = '#5e432c'; g.fillRect(-5, -21, 10, 2);
      }
      g.restore();
    }
  }
  // bridge spans: steel girders along both edges of the deck, with a shadow on the water
  for (const [off, w, col] of [[34, 6, 'rgba(0,0,0,.28)'], [30, 4, '#3a3f48'], [30, 1.5, '#8a909a']]) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
    for (const side of [-1, 1]) {
      g.beginPath();
      for (const i of idx) {
        const { p, q, a } = seg(i);
        if (p.under || q.under || !wetAt(m, p.x, p.y) || !wetAt(m, q.x, q.y) || roadAt(m, p.x, p.y)) continue;
        const nx = -Math.sin(a) * side * off, ny = Math.cos(a) * side * off;
        g.moveTo(p.x + nx + (off === 34 ? 4 : 0), p.y + ny + (off === 34 ? 5 : 0)); g.lineTo(q.x + nx + (off === 34 ? 4 : 0), q.y + ny + (off === 34 ? 5 : 0));
      }
      g.stroke();
    }
  }
}

// Tunnel mouths: the line runs down a short cutting between concrete retaining walls into a
// portal (the subway under the core, the little underpasses under the highways).
// (H35) World v3's station house (m.railHubs: one per station, at its map point, `a` the way it faces away from the
// tracks): a hipped slate roof over cream walls, its canopy on the platform side, the clock gable and doors on the
// street side, the name on a board; and a beach town's lifeguard tower (m.lifeguards) - seen from above.
export function drawStationHouse(g, h, cx, cy) {
  const x0 = cx * CHUNK_PX, y0 = cy * CHUNK_PX;
  if (h.x + 140 < x0 || h.x - 140 > x0 + CHUNK_PX || h.y + 140 < y0 || h.y - 140 > y0 + CHUNK_PX) return;
  g.save(); g.translate(h.x + Math.cos(h.a) * 18, h.y + Math.sin(h.a) * 18); g.rotate(h.a - Math.PI / 2);
  // (local: x along the building, +y toward the street, -y the platform side)
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-66, -42, 140, 92);
  g.fillStyle = '#e2d6bc'; g.fillRect(-68, -18, 136, 62);                       // walls (seen at the eaves)
  g.fillStyle = '#4a5662'; g.fillRect(-66, -16, 132, 58);                       // the hipped roof
  g.fillStyle = '#5a6672'; g.beginPath(); g.moveTo(-66, -16); g.lineTo(-40, 13); g.lineTo(40, 13); g.lineTo(66, -16); g.closePath(); g.fill();
  g.strokeStyle = '#323c46'; g.lineWidth = 2; g.beginPath(); g.moveTo(-40, 13); g.lineTo(40, 13); g.moveTo(-66, -16); g.lineTo(-40, 13); g.lineTo(-66, 42); g.moveTo(66, -16); g.lineTo(40, 13); g.lineTo(66, 42); g.stroke();
  g.fillStyle = '#e2d6bc'; g.fillRect(-13, 34, 26, 12); g.fillStyle = '#4a5662'; g.fillRect(-14, 30, 28, 6);   // the clock gable
  g.fillStyle = '#f0eee6'; g.beginPath(); g.arc(0, 40, 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 40); g.lineTo(0, 37); g.moveTo(0, 40); g.lineTo(3, 40); g.stroke();
  g.fillStyle = '#7a8a8a'; g.fillRect(-70, -46, 140, 30);                       // the platform-side canopy
  g.fillStyle = '#6a7a7a'; for (let x = -66; x < 70; x += 8) g.fillRect(x, -46, 1, 30);
  g.fillStyle = '#2e4a3e'; g.fillRect(-70, -47, 140, 2); for (let x = -62; x < 70; x += 30) g.fillRect(x, -45, 3, 3);
  g.fillStyle = '#1c2a44'; g.fillRect(-34, 47, 68, 12); g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(h.name.replace(/ Station$/, '').toUpperCase().slice(0, 16), 0, 53);
  g.restore();
}
export function drawLifeguardTower(g, t, cx, cy) {
  const x0 = cx * CHUNK_PX, y0 = cy * CHUNK_PX;
  if (t.x + 60 < x0 || t.x - 60 > x0 + CHUNK_PX || t.y + 60 < y0 || t.y - 60 > y0 + CHUNK_PX) return;
  g.save(); g.translate(t.x, t.y);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-14, -10, 34, 34);
  g.fillStyle = '#d8cdb4'; g.fillRect(-5, 18, 10, 26); for (let y = 20; y < 44; y += 4) { g.fillStyle = '#b8ad94'; g.fillRect(-5, y, 10, 1); }   // the ramp
  g.fillStyle = '#e8e4d8'; g.fillRect(-18, -18, 36, 36);                         // the roof
  g.fillStyle = '#5aa8c8'; g.fillRect(-18, 14, 36, 4);
  g.fillStyle = '#d8342a'; g.fillRect(-2, -8, 4, 16); g.fillRect(-8, -2, 16, 4); g.fillRect(17, -22, 7, 5);   // the cross, the flag
  g.restore();
}

export function drawPortals(g, m, cx, cy) {
  if (!m.rail) return;
  const pts = m.rail.pts, n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    if (!!p.under === !!q.under) continue;
    if (p.x < cx * CHUNK_PX - 300 || p.x > (cx + 1) * CHUNK_PX + 300 || p.y < cy * CHUNK_PX - 300 || p.y > (cy + 1) * CHUNK_PX + 300) continue;
    const a = Math.atan2(q.y - p.y, q.x - p.x) + (p.under ? Math.PI : 0); // pointing into the tunnel
    const metro = !!(p.subway || q.subway);
    // the cutting runs back from the mouth until a street (or a building) gets in the way
    let L = 40;
    while (L < 210) {
      const t = m.tileAtPx(p.x - Math.cos(a) * (L + 16), p.y - Math.sin(a) * (L + 16));
      if (t === T.ROAD || t === T.BUILDING || t === T.BRIDGE) break;
      L += 8;
    }
    g.save(); g.translate(p.x, p.y); g.rotate(a);
    // the track sinks between walls: darker the deeper it gets
    const gr = g.createLinearGradient(-L, 0, 0, 0);
    gr.addColorStop(0, 'rgba(8,9,12,0)'); gr.addColorStop(1, 'rgba(8,9,12,.8)');
    g.fillStyle = gr; g.fillRect(-L, -30, L, 60);
    for (const sd of [-1, 1]) {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-L, sd * 34 - (sd < 0 ? 4 : 0), L, 4);
      g.fillStyle = '#9a9890'; g.fillRect(-L, sd < 0 ? -40 : 32, L, 8);           // retaining walls
      g.fillStyle = '#b8b6ae'; g.fillRect(-L, sd < 0 ? -40 : 38, L, 2);
      for (let k = -L + 4; k < 0; k += 22) { g.fillStyle = '#86847c'; g.fillRect(k, sd < 0 ? -40 : 32, 2, 8); }
      g.fillStyle = '#4a4a46'; g.fillRect(-L, sd < 0 ? -42 : 40, L, 2);           // railing
    }
    // the mouth: black, with the first few metres of tunnel lit
    g.fillStyle = '#07080b'; g.fillRect(0, -32, 70, 64);
    for (let k = 10; k < 70; k += 18) { g.fillStyle = 'rgba(255,214,140,.35)'; g.fillRect(k, -30, 4, 3); g.fillRect(k, 27, 4, 3); }
    // concrete headwall over the mouth, wing walls, hazard paint on the lip
    g.fillStyle = '#7d7d78'; g.fillRect(-8, -50, 26, 100);
    g.fillStyle = '#a9a9a2'; g.fillRect(-8, -50, 4, 100);
    g.fillStyle = '#5a5a56'; g.fillRect(-8, -56, 40, 8); g.fillRect(-8, 48, 40, 8);
    g.fillStyle = '#ffd400'; for (let k = -44; k < 44; k += 12) g.fillRect(-7, k, 4, 6);
    if (metro) {
      // the line's name plate across the headwall, a lamp either side
      g.save(); g.translate(5, 0); g.rotate(Math.PI / 2);
      g.fillStyle = '#1f6f3a'; g.fillRect(-30, -7, 60, 14);
      g.fillStyle = '#e8f5ec'; g.fillRect(-30, -7, 60, 2);
      g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('METRO', 0, 1);
      g.restore();
      for (const sd of [-1, 1]) { g.fillStyle = '#2a2d35'; g.fillRect(-4, sd * 40 - 3, 6, 6); g.fillStyle = '#ffe2a0'; g.fillRect(-3, sd * 40 - 2, 4, 4); }
    }
    g.restore();
  }
}

// Platforms: a concrete deck as long as a train, following the track round any bend, with a
// white coping and the yellow safety line at its edge, shelters, benches, lamp posts and name
// boards. Baked into the ground chunks (it never changes).
const PLAT_STEP = 16;
export function drawStation(g, m, st, cx, cy) {
  const L = st.half || 112, sd = st.side, x0 = cx * CHUNK_PX, y0 = cy * CHUNK_PX;
  if (st.under && st.kiosk) { drawSubwayEntrance(g, st.kiosk, x0, y0); return; }
  if (st.under) { // the subway stairway down from the pavement, with its sign
    const { x, y } = st.platform;
    if (x + 80 < x0 || x - 80 > x0 + CHUNK_PX || y + 80 < y0 || y - 80 > y0 + CHUNK_PX) return;
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-20, -14, 44, 32);
    g.fillStyle = '#26282e'; g.fillRect(-22, -16, 44, 32);
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#3a3d45' : '#30333a'; g.fillRect(-16, -12 + k * 4.4, 32, 4.4); }
    g.fillStyle = '#9aa0a8'; g.fillRect(-22, -16, 3, 32); g.fillRect(19, -16, 3, 32);
    g.fillStyle = '#1f6f3a'; g.fillRect(-26, -34, 52, 14); g.fillStyle = '#fff';
    g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SUBWAY', 0, -27);
    g.restore();
    return;
  }
  if (st.x + L + 140 < x0 || st.x - L - 140 > x0 + CHUNK_PX || st.y + L + 140 < y0 || st.y - L - 140 > y0 + CHUNK_PX) return;
  const at = (d, off) => { const q = railAt(m.rail, st.s + d); const nx = -Math.sin(q.a) * sd, ny = Math.cos(q.a) * sd; return { x: q.x + nx * off, y: q.y + ny * off, a: q.a }; };
  const blocked = (x, y) => { const t = m.tileAtPx(x, y); return t === T.ROAD || t === T.BUILDING || t === T.WALL; };
  // a band of the platform, segment by segment (skipping a street that cuts across it)
  const band = (off0, off1, col) => {
    g.fillStyle = col;
    for (let d = -L; d < L; d += PLAT_STEP) {
      const mid = at(d + PLAT_STEP / 2, (off0 + off1) / 2);
      if (blocked(mid.x, mid.y)) continue;
      const a0 = at(d, off0), a1 = at(d + PLAT_STEP + 0.5, off0), b1 = at(d + PLAT_STEP + 0.5, off1), b0 = at(d, off1);
      g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.lineTo(b1.x, b1.y); g.lineTo(b0.x, b0.y); g.closePath(); g.fill();
    }
  };
  const inner = st.inner || 40, outer = st.outer || 104;
  band(inner, outer, '#a9a69c');                 // the deck
  band(inner + 18, outer, '#b7b4aa');            // paving, a shade lighter away from the edge
  band(inner, inner + 5, '#e9e5da');             // edge coping
  band(inner + 6, inner + 10, '#ffd400');        // mind the gap
  g.fillStyle = 'rgba(255,212,0,.55)';           // tactile strip dots
  for (let d = -L + 8; d < L; d += 12) { const p = at(d, inner + 14); if (!blocked(p.x, p.y)) g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  // furniture, placed in the platform's local frame (x along the track, y away from it)
  const place = (d, off, fn) => { const p = at(d, off); if (blocked(p.x, p.y)) return; g.save(); g.translate(p.x, p.y); g.rotate(p.a); if (sd < 0) g.scale(1, -1); fn(); g.restore(); };
  const at_ = (fs) => fs.map((f) => Math.round(f * L));
  for (const d of at_([-0.72, -0.3, 0.3, 0.72])) place(d, 78, () => {       // shelter: roof with ribs and a shadow
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-50, -10, 104, 30);
    g.fillStyle = '#2f5a4a'; g.fillRect(-52, -14, 104, 28);
    g.fillStyle = '#3d7360'; for (let k = -48; k < 50; k += 12) g.fillRect(k, -12, 8, 24);
    g.fillStyle = '#244538'; g.fillRect(-52, -14, 104, 3);
  });
  for (const d of at_([-0.9, -0.51, -0.12, 0.12, 0.51, 0.9])) place(d, 66, () => { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-13, 1, 28, 7); g.fillStyle = '#6b4a2a'; g.fillRect(-14, -3, 28, 7); g.fillStyle = '#86603a'; g.fillRect(-14, -3, 28, 2); }); // benches
  for (const d of at_([-0.96, -0.6, -0.08, 0.2, 0.6, 0.96])) place(d, 96, () => { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-2, 0, 6, 6); g.fillStyle = '#4a4e56'; g.fillRect(-3, -3, 6, 6); g.fillStyle = '#ffe8a8'; g.fillRect(-2, -2, 4, 4); }); // lamp posts
  for (const d of at_([-0.42, 0.42])) place(d, 52, () => {         // name boards
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-44, -3, 92, 14);
    g.fillStyle = '#1c2a44'; g.fillRect(-46, -6, 92, 13);
    g.fillStyle = '#e8eef8'; g.fillRect(-46, -6, 92, 1.5);
    const flip = Math.cos(at(d, 0).a) < -0.1 || (Math.abs(Math.cos(at(d, 0).a)) <= 0.1 && Math.sin(at(d, 0).a) > 0);
    g.save(); if (flip) g.rotate(Math.PI); if (sd < 0) g.scale(1, -1);
    g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(st.name.replace(/ Station$/, '').toUpperCase(), 0, 0.5, 86);
    g.restore();
  });
  for (const d of [-L + 30, L - 30]) place(d, 84, () => {   // the stairs/ramp down to the street at each end
    g.fillStyle = '#8e8b82'; g.fillRect(-12, -14, 24, 28);
    g.fillStyle = '#6f6c64'; for (let k = -12; k < 12; k += 4) g.fillRect(k, -14, 2, 28);
  });
}

// A subway stop's street entrance: a marked queue lane on the plaza (yellow kerb, "WAIT HERE",
// footprints where people stand, chevrons pointing into the stairs) and the kiosk itself.
function drawSubwayEntrance(g, k, x0, y0) {
  const [lx0, ly0, lx1, ly1] = k.lane;
  if (Math.max(lx1, k.x0 + k.w) + 40 < x0 || Math.min(lx0, k.x0) - 40 > x0 + CHUNK_PX || k.y0 + k.h + 40 < y0 || k.y0 - 60 > y0 + CHUNK_PX) return;
  g.save();
  // the lane: a darker pad edged with a yellow line
  g.fillStyle = 'rgba(30,32,38,.18)'; g.fillRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
  g.strokeStyle = '#f2c21b'; g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeRect(lx0 + 1.5, ly0 + 1.5, lx1 - lx0 - 3, ly1 - ly0 - 3); g.setLineDash([]);
  const dir = k.flip ? 1 : -1; // from the mouth out along the lane
  // chevrons pointing at the mouth
  g.fillStyle = 'rgba(242,194,27,.85)';
  for (let i = 0; i < 2; i++) {
    const cx = k.out.x + dir * (8 + i * 9), cy = k.out.y;
    g.beginPath(); g.moveTo(cx - dir * 5, cy); g.lineTo(cx + dir * 2, cy - 7); g.lineTo(cx + dir * 5, cy - 7); g.lineTo(cx - dir * 2, cy); g.lineTo(cx + dir * 5, cy + 7); g.lineTo(cx + dir * 2, cy + 7); g.closePath(); g.fill();
  }
  // footprints where the queue stands
  g.fillStyle = 'rgba(255,255,255,.55)';
  for (const q of k.queue.slice(1)) { if (q.x < lx0 + 6 || q.x > lx1 - 6) continue; g.fillRect(q.x - 4, q.y - 5, 3, 6); g.fillRect(q.x + 1, q.y - 2, 3, 6); }
  // stencil
  g.fillStyle = 'rgba(242,194,27,.9)'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('WAIT HERE', (lx0 + lx1) / 2 - dir * 10, ly1 - 7);
  g.restore();
  const fr = atlas.ready ? atlas.frames[k.flip ? 'prop_subway_r' : 'prop_subway_l'] : null;
  if (fr) { g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, k.x0, k.y0, k.w, k.h); drawLineBadge(g, k.x0 + SIGN_PANEL[k.flip ? 1 : 0][0], k.y0 + SIGN_PANEL[0][1]); }
  else { g.fillStyle = '#1f4a3c'; g.fillRect(k.x0, k.y0 + 30, k.w, k.h - 30); g.fillStyle = '#222'; g.fillRect(k.pit[0], k.pit[1], k.pit[2] - k.pit[0], k.pit[3] - k.pit[1]); }
}

// The sign panel (kiosk px, left and mirrored kiosk) where the concept had real-world route
// bullets; it carries the game's own line instead: the orange L of the City Loop.
export const SUBWAY_LINE = { name: 'City Loop', letter: 'L', color: '#f28c28' };
const SIGN_PANEL = [[74.5, 27, 36.5, 8], [18, 27, 27, 8]];
function drawLineBadge(g, x, y) {
  g.save();
  g.fillStyle = SUBWAY_LINE.color; g.beginPath(); g.arc(x + 4.2, y + 4, 3.9, 0, 6.283); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(SUBWAY_LINE.letter, x + 4.2, y + 4.4);
  g.fillStyle = '#f2efe6'; g.font = 'bold 5px sans-serif'; g.textAlign = 'left';
  g.fillText('LOOP', x + 9.5, y + 4.4);
  g.restore();
}

// Someone walking down into (or up out of) a subway kiosk sinks into the stairwell: drawn clipped
// to it, a little lower and darker the deeper they are. Returns false if p isn't on the stairs.
export function drawOnStairs(g, map, p, draw) {
  for (const st of (map.rail && map.rail.stations) || []) {
    const k = st.kiosk;
    if (!k) continue;
    const [x0, y0, x1, y1] = k.pit;
    if (p.rx < x0 || p.rx > x1 || p.ry < y0 - 6 || p.ry > y1 + 4) continue;
    const t = Math.max(0, Math.min(1, (p.rx - k.top.x) / (k.deep.x - k.top.x)));
    g.save();
    g.beginPath(); g.rect(x0, y0 - 30, x1 - x0, y1 - y0 + 30); g.clip();
    g.translate(0, t * 18);
    g.globalAlpha = 1 - 0.8 * t;
    draw();
    g.restore();
    return true;
  }
  return false;
}

// A train standing at the platform: the platform edge glows green and chevrons point at the
// doors, so it's obvious where to stand and that now is the time to get on.
export function drawBoardingCue(g, rail, st, now) {
  if (st.under && st.kiosk) { // the queue lane glows and an arrow bobs at the mouth: go down now
    const k = st.kiosk, [lx0, ly0, lx1, ly1] = k.lane, dir = k.flip ? 1 : -1;
    g.save(); g.strokeStyle = `rgba(90,255,120,${0.45 + 0.35 * Math.sin(now * 6)})`; g.lineWidth = 5; g.strokeRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
    const bob = 4 * Math.sin(now * 6);
    g.fillStyle = `rgba(120,255,140,${0.6 + 0.3 * Math.sin(now * 6)})`;
    g.translate(k.out.x + dir * (4 + bob), k.out.y); g.scale(-dir, 1);
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-7, -12); g.lineTo(-1, 0); g.lineTo(-7, 12); g.closePath(); g.fill();
    g.restore();
    return;
  }
  if (st.under) { // the stairway glows instead
    g.save(); g.strokeStyle = `rgba(90,255,120,${0.45 + 0.35 * Math.sin(now * 6)})`; g.lineWidth = 5; g.strokeRect(st.platform.x - 26, st.platform.y - 20, 52, 40); g.restore();
    return;
  }
  const L = st.half || 112, sd = st.side, inner = st.inner || 40;
  const pulse = 0.45 + 0.35 * Math.sin(now * 6);
  g.save();
  g.strokeStyle = `rgba(90,255,120,${pulse})`; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath();
  for (let d = -L; d <= L; d += 16) { const q = railAt(rail, st.s + d), nx = -Math.sin(q.a) * sd, ny = Math.cos(q.a) * sd; const x = q.x + nx * (inner + 3), y = q.y + ny * (inner + 3); if (d === -L) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  g.fillStyle = `rgba(120,255,140,${0.5 + 0.4 * Math.sin(now * 6)})`;
  for (let d = -L + 50; d < L; d += 90) {
    const q = railAt(rail, st.s + d), nx = -Math.sin(q.a) * sd, ny = Math.cos(q.a) * sd;
    const bob = 4 * Math.sin(now * 6 + d);
    g.save(); g.translate(q.x + nx * (inner + 26 + bob), q.y + ny * (inner + 26 + bob)); g.rotate(Math.atan2(-ny, -nx));
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-7, -12); g.lineTo(-1, 0); g.lineTo(-7, 12); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(10,40,16,.6)'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  g.restore();
}

// The platform clock: an LED board on a post counting down to the next train ("BOARDING" while
// one is in). secs < 0: no timetable yet.
export function drawStationClock(g, rail, st, secs, now) {
  g.save();
  if (st.under && st.kiosk) { g.translate(st.kiosk.board.x, st.kiosk.board.y); g.scale(1.25, 1.25); }
  else if (st.under) { g.translate(st.platform.x + 44, st.platform.y - 26); g.scale(1.2, 1.2); }
  else {
    const q = railAt(rail, st.s + (st.clockD || 0));
    g.translate(q.x, q.y); g.rotate(q.a);
    g.translate(0, st.side * 72);
    if (Math.cos(q.a) < -0.1 || (Math.abs(Math.cos(q.a)) <= 0.1 && Math.sin(q.a) > 0)) g.rotate(Math.PI); // upright text
  }
  g.scale(1.3, 1.3);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-27, -9, 58, 22);
  g.fillStyle = '#5a5e66'; g.fillRect(-2, 8, 4, 10);                      // post
  g.fillStyle = '#16181c'; g.fillRect(-29, -11, 58, 22);                  // housing
  g.fillStyle = '#050607'; g.fillRect(-27, -9, 54, 18);                   // screen
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let text, col = '#ffb020';
  if (secs < 0) text = '--:--';
  else if (secs === 0) { text = 'BOARDING'; col = Math.floor(now * 2) % 2 ? '#7dff7a' : '#4ad048'; }
  else { const s = Math.max(0, Math.ceil(secs)); text = s <= 0 ? 'ARRIVING' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  g.fillStyle = 'rgba(255,176,32,.12)'; g.fillRect(-27, -9, 54, 18);
  g.fillStyle = '#8a8f99'; g.font = 'bold 5px sans-serif'; g.fillText('NEXT TRAIN', 0, -5);
  g.fillStyle = col; g.font = `bold ${text.length > 5 ? 8 : 10}px monospace`; g.fillText(text, 0, 3.5);
  g.restore();
}

// (the rolling stock - the classic renderer's train cars: render/traincars.js, loaded when it first draws a train)

// ---- level crossings ---------------------------------------------------------------------------
// anim: 0 = arms up, 1 = arms down (eased by the caller); broken: [side0, side1]
export function drawCrossing(g, c, anim, broken, down, now) {
  for (const side of [0, 1]) {
    const sg = side ? -1 : 1;
    // pivot on the road's edge, on the approach lanes' side; the arm swings out across them (mapcore.js crossingGate:
    // across the road - World v3's crossings know their road)
    const G = crossingGate(c, sg, c.ra === undefined ? CROSSING_ARM : undefined);
    const px = G.px, py = G.py, rx = G.ux, ry = G.uy, tx = -G.dx * sg, ty = -G.dy * sg;
    const len = G.len;
    g.save(); g.translate(px, py);
    // crossbuck post
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-4, -2, 10, 10);
    g.fillStyle = '#d8d8d8'; g.fillRect(-4, -4, 8, 8);
    g.save(); g.rotate(Math.PI / 4); g.fillStyle = '#f4f4f4'; g.fillRect(-11, -2, 22, 4); g.fillRect(-2, -11, 4, 22); g.fillStyle = '#c8262b'; g.fillRect(-11, -1, 22, 1); g.restore();
    // flashing lights
    const on = down && Math.floor(now * 3) % 2;
    g.fillStyle = on ? '#ff3030' : '#4a1010'; g.beginPath(); g.arc(-sg * 5 * ry, sg * 5 * rx, 3, 0, 6.28); g.fill();
    g.fillStyle = down && !on ? '#ff3030' : '#4a1010'; g.beginPath(); g.arc(sg * 5 * ry, -sg * 5 * rx, 3, 0, 6.28); g.fill();
    if (down) { g.fillStyle = on ? 'rgba(255,60,60,.25)' : 'rgba(255,60,60,.12)'; g.beginPath(); g.arc(0, 0, 18, 0, 6.28); g.fill(); }
    // the arm: foreshortened when raised, full length across the lanes when down
    const dirx = -tx * sg, diry = -ty * sg;
    if (broken[side]) {
      g.fillStyle = '#f4f4f4'; g.fillRect(-2, -2, dirx * 10 + 4, diry * 10 + 4);
      g.save(); g.translate(dirx * len * 0.55 + rx * sg * 14, diry * len * 0.55 + ry * sg * 14); g.rotate(Math.atan2(ty, tx) + 0.5 * sg);
      g.fillStyle = '#f4f4f4'; g.fillRect(-len * 0.3, -2, len * 0.6, 4);
      g.fillStyle = '#c8262b'; for (let k = -len * 0.3; k < len * 0.3; k += 12) g.fillRect(k, -2, 6, 4);
      g.restore();
    } else {
      const l = 8 + (len - 8) * anim;
      g.save(); g.rotate(Math.atan2(diry, dirx));
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(2, 2, l, 5);
      g.fillStyle = '#f4f4f4'; g.fillRect(0, -2, l, 5);
      g.fillStyle = '#c8262b'; for (let k = 6; k < l - 4; k += 14) g.fillRect(k, -2, 7, 5);
      if (anim > 0.9 && down) { g.fillStyle = on ? '#ff3030' : '#7a1a1a'; g.fillRect(l - 4, -1, 3, 3); }
      g.restore();
    }
    g.restore();
  }
}

// ---- underground ----------------------------------------------------------------------------------
// Riding through the subway: the city goes black; the tunnel walls and their lamps slide past.
let glowCv = null;
function lampGlow() {
  if (glowCv) return glowCv;
  glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 80;
  const c = glowCv.getContext('2d'), gr = c.createRadialGradient(40, 40, 0, 40, 40, 40);
  gr.addColorStop(0, 'rgba(255,214,140,.45)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 80, 80);
  return glowCv;
}
// Every line's underground stretches (World v3: the main line runs below the city and the towns too, not only the subway
// loop that today's m.rail is - the owner, 2026-10-15, riding the main line out of Lucky Mesa: the screen went dark),
// cut into segments once per map and kept by 1024 px cell, so a frame only walks what is near the view.
const TUN_CELL = 1024;
const tunnelCache = new WeakMap();
export function tunnelSegments(map) {
  let c = tunnelCache.get(map);
  if (c) return c;
  c = new Map();
  const add = (x1, y1, x2, y2, lamp) => {
    const k = Math.floor((x1 + x2) / 2 / TUN_CELL) * 100000 + Math.floor((y1 + y2) / 2 / TUN_CELL);
    let a = c.get(k); if (!a) c.set(k, (a = []));
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    a.push({ x1, y1, x2, y2, nx: -(y2 - y1) / L, ny: (x2 - x1) / L, lamp });
  };
  for (const r of map.rails || (map.rail ? [map.rail] : [])) {
    const pts = r.pts || [], n = pts.length;
    if (n < 2) continue;
    const closed = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y) < 64;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      if (!p.under || !q.under) continue;
      add(p.x, p.y, q.x, q.y, Math.round(p.s || 0) % 150 < 8);   // (wall lamps every ~150 px)
    }
  }
  tunnelCache.set(map, c);
  return c;
}
// the streets overhead, ghosted through the dark (the owner's 10-07 note: "subway under the world: ghosted street") - so
// you can tell where you are going under the city
function ghostStreets(g, map, view) {
  const E = map.edges;
  if (!E || !E.length) return;
  g.strokeStyle = 'rgba(150,165,200,.07)'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const e of E) {
    if (!e || !e.pts || e.pts.length < 2) continue;
    let b = e.gb;
    if (!b) { b = e.gb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; for (const p of e.pts) { if (p.x < b.x0) b.x0 = p.x; if (p.y < b.y0) b.y0 = p.y; if (p.x > b.x1) b.x1 = p.x; if (p.y > b.y1) b.y1 = p.y; } }
    if (b.x1 < view.x0 - 100 || b.x0 > view.x1 + 100 || b.y1 < view.y0 - 100 || b.y0 > view.y1 + 100) continue;
    g.lineWidth = Math.max(24, (e.hw || 40) * 2);
    g.beginPath(); g.moveTo(e.pts[0].x, e.pts[0].y);
    for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i].x, e.pts[i].y);
    g.stroke();
  }
  g.lineJoin = 'miter';
}
export function drawTunnel(g, map, view, now, platforms = null) {   // (platforms: the stations' platforms - render/tunnelplat.js, loaded the first time you're down there)
  g.fillStyle = '#050608'; g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ghostStreets(g, map, view);
  const cells = tunnelSegments(map);
  const segs = [];
  const x0 = view.x0 - 200, x1 = view.x1 + 200, y0 = view.y0 - 200, y1 = view.y1 + 200;
  for (let cy = Math.floor(y0 / TUN_CELL) - 1; cy <= Math.floor(y1 / TUN_CELL) + 1; cy++)
    for (let cx = Math.floor(x0 / TUN_CELL) - 1; cx <= Math.floor(x1 / TUN_CELL) + 1; cx++) {
      const a = cells.get(cx * 100000 + cy);
      if (a) for (const s of a) if (Math.max(s.x1, s.x2) > x0 && Math.min(s.x1, s.x2) < x1 && Math.max(s.y1, s.y2) > y0 && Math.min(s.y1, s.y2) < y1) segs.push(s);
    }
  if (!segs.length) return;
  const pass = (w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath();
    for (const s of segs) { g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); }
    g.stroke();
  };
  pass(96, '#1e2026'); pass(78, '#14151a'); pass(60, '#24262c');
  if (platforms) platforms(g, map, x0, y0, x1, y1);
  for (const s of segs) {
    if (!s.lamp) continue;
    for (const sd of [-1, 1]) {
      const lx = s.x1 + s.nx * sd * 44, ly = s.y1 + s.ny * sd * 44;
      g.drawImage(lampGlow(), lx - 40, ly - 40, 80, 80);
      g.fillStyle = '#ffe2a0'; g.fillRect(lx - 3, ly - 2, 6, 4);
    }
  }
  // rails underfoot
  g.strokeStyle = '#5a5e66'; g.lineWidth = 2; g.beginPath();
  for (const side of [-1, 1]) for (const s of segs) { const ox = s.nx * side * RAIL_OFF, oy = s.ny * side * RAIL_OFF; g.moveTo(s.x1 + ox, s.y1 + oy); g.lineTo(s.x2 + ox, s.y2 + oy); }
  g.stroke();
  void now;
}

// The tunnel's portal regions, for hiding the part of a train that has already gone underground.
export function portalCovers(map) {
  const out = [];
  if (!map.rail) return out;
  const pts = map.rail.pts, n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    if (!!p.under === !!q.under) continue;
    const a = Math.atan2(q.y - p.y, q.x - p.x) + (p.under ? Math.PI : 0);
    const dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
    const x0 = p.x + (dx < 0 ? -260 : dx > 0 ? 6 : -40), y0 = p.y + (dy < 0 ? -260 : dy > 0 ? 6 : -40);
    out.push({ x0, y0, x1: x0 + (dx ? 254 : 80), y1: y0 + (dy ? 254 : 80), px: p.x, py: p.y, a });
  }
  return out;
}
