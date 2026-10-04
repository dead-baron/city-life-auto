// Railway art: track (ties, rails, the bridge decks and their girders, crossing panels) and the
// open-air station platforms are baked into the ground chunks; rolling stock (roof view or the
// lit interior when you're riding), level-crossing gates, the platform clocks and the "train in -
// board here" glow are drawn live. All procedural canvas drawing - no image assets.
import { T, TILE, CHUNK_PX, MAP_W } from '../../shared/constants.js';
import { TRAIN_CARS, COACH_SEATS, MAIL_BOX, CROSSING_ARM, railAt } from '../../shared/map.js';

const TIE_STEP = 18, RAIL_OFF = 12;

// Index rail points by ground chunk (with a margin) so a chunk bake only walks its own track.
export function railIndex(map, key) {
  const out = new Map();
  if (!map.rail) return out;
  map.rail.pts.forEach((p, i) => {
    for (let cy = Math.floor((p.y - 48) / CHUNK_PX); cy <= Math.floor((p.y + 48) / CHUNK_PX); cy++)
      for (let cx = Math.floor((p.x - 48) / CHUNK_PX); cx <= Math.floor((p.x + 48) / CHUNK_PX); cx++) {
        const k = key(cx, cy);
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(i);
      }
  });
  return out;
}

const roadAt = (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), t = m.tileAt(tx, ty); return t === T.ROAD || (t === T.BRIDGE && !!m.roadAxis[ty * MAP_W + tx]); };
const wetAt = (m, x, y) => { const t = m.tileAtPx(x, y); return t === T.WATER || t === T.DEEP || t === T.BRIDGE; };

export function drawRailChunk(g, m, idx) {
  if (!idx || !idx.length || !m.rail) return;
  const pts = m.rail.pts, n = pts.length;
  const seg = (i) => { const p = pts[i], q = pts[(i + 1) % n]; return { p, q, a: Math.atan2(q.y - p.y, q.x - p.x), len: Math.hypot(q.x - p.x, q.y - p.y) }; };
  // ballast shoulder + ties (timber deck over the water, nothing on the road panels)
  for (const i of idx) {
    const { p, q, a, len } = seg(i);
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
        if (!wetAt(m, p.x, p.y) || !wetAt(m, q.x, q.y) || roadAt(m, p.x, p.y)) continue;
        const nx = -Math.sin(a) * side * off, ny = Math.cos(a) * side * off;
        g.moveTo(p.x + nx + (off === 34 ? 4 : 0), p.y + ny + (off === 34 ? 5 : 0)); g.lineTo(q.x + nx + (off === 34 ? 4 : 0), q.y + ny + (off === 34 ? 5 : 0));
      }
      g.stroke();
    }
  }
  // the two rails
  for (const [w, col] of [[4, '#2a2622'], [2, '#b8bcc4']]) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
    for (const side of [-1, 1]) {
      g.beginPath();
      for (const i of idx) {
        const { p, q, a } = seg(i);
        const nx = -Math.sin(a) * side * RAIL_OFF, ny = Math.cos(a) * side * RAIL_OFF;
        g.moveTo(p.x + nx, p.y + ny); g.lineTo(q.x + nx, q.y + ny);
      }
      g.stroke();
    }
  }
}

// Platforms: a concrete deck as long as a train, following the track round any bend, with a
// white coping and the yellow safety line at its edge, shelters, benches, lamp posts and name
// boards. Baked into the ground chunks (it never changes).
const PLAT_STEP = 16;
export function drawStation(g, m, st, cx, cy) {
  const L = st.half || 112, sd = st.side, x0 = cx * CHUNK_PX, y0 = cy * CHUNK_PX;
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

// A train standing at the platform: the platform edge glows green and chevrons point at the
// doors, so it's obvious where to stand and that now is the time to get on.
export function drawBoardingCue(g, rail, st, now) {
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
  const q = railAt(rail, st.s + (st.clockD || 0));
  g.translate(q.x, q.y); g.rotate(q.a);
  g.translate(0, st.side * 72);
  if (Math.cos(q.a) < -0.1 || (Math.abs(Math.cos(q.a)) <= 0.1 && Math.sin(q.a) > 0)) g.rotate(Math.PI); // upright text
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

// ---- rolling stock --------------------------------------------------------------------------------
const spriteCache = new Map();
function carCanvas(type, mode) {
  const key = `${type}:${mode}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const def = TRAIN_CARS[type];
  c = document.createElement('canvas');
  c.width = def.L + 8; c.height = def.W + 8;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  const L = def.L, W = def.W, hl = L / 2, hw = W / 2;
  const lit = mode.includes('lit'), inside = mode.includes('in'), empty = mode.includes('empty');
  if (def.kind === 'loco') {
    g.fillStyle = '#7a1418'; roundRect(g, -hl, -hw, L, W, 8); g.fill();
    g.fillStyle = '#a01c22'; g.fillRect(-hl + 4, -hw + 4, L - 26, W - 8);
    g.fillStyle = '#f2c21b'; g.fillRect(-hl, -hw + 2, L, 4); g.fillRect(-hl, hw - 6, L, 4);        // side stripes
    g.fillStyle = '#5a1012'; for (let k = -hl + 16; k < hl - 60; k += 26) g.fillRect(k, -hw + 10, 16, W - 20); // roof grilles
    g.fillStyle = '#3a0a0c'; for (let k = -hl + 18; k < hl - 60; k += 26) for (let j = -hw + 12; j < hw - 10; j += 4) g.fillRect(k, j, 12, 2);
    g.fillStyle = '#2a2a30'; g.fillRect(hl - 50, -hw + 6, 24, W - 12);                            // cab roof
    g.fillStyle = lit ? '#fff2b0' : '#7fb6d8'; g.fillRect(hl - 26, -hw + 7, 8, W - 14);           // windscreen
    g.fillStyle = '#d8d8d0'; g.beginPath(); g.arc(hl - 4, 0, 4, 0, 6.28); g.fill();               // headlight
    g.fillStyle = '#ffd400'; for (let k = -hw + 4; k < hw - 4; k += 8) g.fillRect(hl - 6, k, 4, 4); // nose chevrons
    return store(key, c);
  }
  const body = def.kind === 'mail' ? '#3e4a2c' : '#8c96a4', trim = def.kind === 'mail' ? '#262e1a' : '#2c4a8a';
  g.fillStyle = body; roundRect(g, -hl, -hw, L, W, 5); g.fill();
  g.fillStyle = trim; g.fillRect(-hl, -hw, L, 3); g.fillRect(-hl, hw - 3, L, 3);
  if (inside) {
    // interior: floor, walls with windows, seats or mail sacks
    g.fillStyle = def.kind === 'mail' ? '#5e4a32' : '#2f3a52'; g.fillRect(-hl + 4, -hw + 4, L - 8, W - 8);
    if (def.kind === 'mail') { g.fillStyle = '#6e5840'; for (let k = -hl + 4; k < hl - 4; k += 10) g.fillRect(k, -hw + 4, 1, W - 8); }
    else { g.fillStyle = '#3a4866'; g.fillRect(-hl + 4, -4, L - 8, 8); }                           // aisle runner
    g.fillStyle = lit ? '#ffe9a0' : '#9cc4dc';                                                    // windows along the walls
    for (let k = -hl + 12; k < hl - 16; k += 24) { if (Math.abs(k) < 18) continue; g.fillRect(k, -hw + 1, 16, 3); g.fillRect(k, hw - 4, 16, 3); }
    g.fillStyle = '#ffd400'; g.fillRect(-12, -hw + 1, 24, 3); g.fillRect(-12, hw - 4, 24, 3);     // door edges
    g.fillStyle = '#1b1d22'; g.fillRect(-10, -hw + 1, 20, 3); g.fillRect(-10, hw - 4, 20, 3);
    if (def.kind === 'coach') {
      for (const [ox, oy] of COACH_SEATS) {
        g.fillStyle = '#1d4fa8'; g.fillRect(ox - 10, oy - 11, 20, 22);
        g.fillStyle = '#2a63c8'; g.fillRect(ox + (ox < 0 ? -10 : 6), oy - 11, 4, 22);            // seat backs
        g.fillStyle = '#8a8f99'; g.fillRect(ox - 10, oy + (oy < 0 ? -11 : 10), 20, 1);
      }
      g.fillStyle = '#c0c4cc'; g.fillRect(-1, -hw + 8, 2, W - 16);                               // grab pole
    } else {
      for (const [sx, sy] of [[44, -26], [56, 24], [68, -14], [20, 26], [76, 10], [6, -26]]) { g.fillStyle = '#b89a6a'; g.beginPath(); g.ellipse(sx, sy, 9, 7, 0.3, 0, 6.28); g.fill(); g.fillStyle = '#8a7048'; g.fillRect(sx - 2, sy - 6, 4, 3); }
      g.fillStyle = '#4a3a2a'; g.fillRect(hl - 12, -hw + 6, 6, W - 12);                          // shelves
      if (!empty) {
        g.fillStyle = '#3a3e46'; g.fillRect(MAIL_BOX.ox - 13, MAIL_BOX.oy - 13, 26, 26);         // the strongbox
        g.fillStyle = '#5a606a'; g.fillRect(MAIL_BOX.ox - 11, MAIL_BOX.oy - 11, 22, 22);
        g.fillStyle = '#d9a21b'; g.beginPath(); g.arc(MAIL_BOX.ox, MAIL_BOX.oy, 5, 0, 6.28); g.fill();
        g.fillStyle = '#3a3e46'; g.fillRect(MAIL_BOX.ox - 1, MAIL_BOX.oy - 4, 2, 8);
      } else { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(MAIL_BOX.ox - 13, MAIL_BOX.oy - 13, 26, 26); }
    }
    return store(key, c);
  }
  // roof
  g.fillStyle = def.kind === 'mail' ? '#4a5834' : '#a8b0bc'; g.fillRect(-hl + 4, -hw + 5, L - 8, W - 10);
  g.fillStyle = 'rgba(0,0,0,.12)'; for (let k = -hl + 10; k < hl - 6; k += 12) g.fillRect(k, -hw + 5, 2, W - 10); // ribs
  g.fillStyle = def.kind === 'mail' ? '#2e361e' : '#6e7684'; g.fillRect(-hl + 30, -6, L - 60, 12);             // roof vent strip
  if (def.kind === 'mail') { g.fillStyle = '#d9a21b'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MAIL', 0, 0); }
  if (lit) { g.fillStyle = 'rgba(255,233,160,.9)'; for (let k = -hl + 12; k < hl - 16; k += 24) { g.fillRect(k, -hw, 16, 2); g.fillRect(k, hw - 2, 16, 2); } }
  return store(key, c);
}
function store(key, c) { spriteCache.set(key, c); return c; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// flags (wire): 2 doors open, 4 horn, 8 lights on, 16 strongbox gone
export function drawTrainCar(g, e, inside, now) {
  const type = e.d.c, def = TRAIN_CARS[type];
  if (!def) return;
  const lit = !!(e.flags & 8);
  const mode = `${inside && type !== 0 ? 'in' : 'roof'}${lit ? '-lit' : ''}${e.flags & 16 ? '-empty' : ''}`;
  const cv = carCanvas(type, mode);
  g.save(); g.translate(e.rx, e.ry); g.rotate(e.ra);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-def.L / 2 + 5, -def.W / 2 + 6, def.L, def.W);   // shadow
  g.drawImage(cv, -cv.width / 2, -cv.height / 2);
  if (e.flags & 2 && type !== 0) { g.fillStyle = '#121418'; g.fillRect(-10, -def.W / 2 - 1, 20, 4); g.fillRect(-10, def.W / 2 - 3, 20, 4); } // doors slid open
  if (type === 0 && lit) { g.fillStyle = 'rgba(255,250,210,.9)'; g.beginPath(); g.arc(def.L / 2 - 4, 0, 5, 0, 6.28); g.fill(); }
  if (type === 0 && (e.flags & 4) && Math.floor(now * 8) % 2) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(def.L / 2 - 46, -3, 6, 6); } // horn puff
  g.restore();
}

// Gangway bellows between two cars (drawn under them, so curves don't open a gap).
export function drawCoupling(g, a, b) {
  g.strokeStyle = '#1b1d22'; g.lineWidth = 46; g.lineCap = 'butt';
  const da = TRAIN_CARS[a.d.c].L / 2 - 2, db = TRAIN_CARS[b.d.c].L / 2 - 2;
  g.beginPath();
  g.moveTo(a.rx - Math.cos(a.ra) * da, a.ry - Math.sin(a.ra) * da);
  g.lineTo(b.rx + Math.cos(b.ra) * db, b.ry + Math.sin(b.ra) * db);
  g.stroke();
}

// ---- level crossings ---------------------------------------------------------------------------
// anim: 0 = arms up, 1 = arms down (eased by the caller); broken: [side0, side1]
export function drawCrossing(g, c, anim, broken, down, now) {
  const tx = Math.cos(c.a), ty = Math.sin(c.a), rx = -Math.sin(c.a), ry = Math.cos(c.a);
  for (const side of [0, 1]) {
    const sg = side ? -1 : 1;
    // pivot on the road's edge, on the approach lanes' side; the arm swings out across them
    const px = c.x + rx * sg * CROSSING_ARM + tx * sg * (c.hw + 6), py = c.y + ry * sg * CROSSING_ARM + ty * sg * (c.hw + 6);
    const len = c.hw + 2;
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
      g.save(); g.translate(dirx * len * 0.55 + rx * sg * 14, diry * len * 0.55 + ry * sg * 14); g.rotate(c.a + 0.5 * sg);
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
