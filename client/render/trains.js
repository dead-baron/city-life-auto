// Railway art: track (ties, rails, the timber trestle, crossing panels), tunnel portals, station
// platforms and the subway entrance are baked into the ground chunks; rolling stock (roof view
// or the lit interior when you're riding), level-crossing gates and the dark subway are drawn
// live. All procedural canvas drawing - no image assets.
import { T, TILE, CHUNK_PX, MAP_W } from '../../shared/constants.js';
import { TRAIN_CARS, COACH_SEATS, MAIL_BOX, CROSSING_ARM } from '../../shared/map.js';

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

// Tunnel mouths where the line dives under Downtown.
export function drawPortals(g, m, cx, cy) {
  if (!m.rail) return;
  const pts = m.rail.pts, n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    if (!!p.under === !!q.under) continue;
    if (p.x < cx * CHUNK_PX - 80 || p.x > (cx + 1) * CHUNK_PX + 80 || p.y < cy * CHUNK_PX - 80 || p.y > (cy + 1) * CHUNK_PX + 80) continue;
    const a = Math.atan2(q.y - p.y, q.x - p.x) + (p.under ? Math.PI : 0); // pointing into the tunnel
    g.save(); g.translate(p.x, p.y); g.rotate(a);
    const gr = g.createLinearGradient(-6, 0, 46, 0);
    gr.addColorStop(0, 'rgba(10,10,14,.6)'); gr.addColorStop(0.3, '#08090c'); gr.addColorStop(1, '#08090c');
    g.fillStyle = gr; g.fillRect(-6, -34, 52, 68);
    g.fillStyle = '#8a8a86'; g.fillRect(-10, -40, 10, 80);           // the concrete portal
    g.fillStyle = '#b4b4ae'; g.fillRect(-10, -40, 3, 80);
    g.fillStyle = '#5a5a56'; g.fillRect(-10, -44, 22, 8); g.fillRect(-10, 36, 22, 8); // wing walls
    g.fillStyle = '#ffd400'; for (let k = -36; k < 36; k += 12) g.fillRect(-9, k, 4, 6); // hazard paint
    g.restore();
  }
}

// Platforms: yellow safety line, a shelter and the name board. Subway: the stairway entrance.
export function drawStation(g, st, cx, cy) {
  const x = st.platform.x, y = st.platform.y;
  if (x + 200 < cx * CHUNK_PX || x - 200 > (cx + 1) * CHUNK_PX || y + 200 < cy * CHUNK_PX || y - 200 > (cy + 1) * CHUNK_PX) return;
  if (st.under) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-20, -14, 44, 32);
    g.fillStyle = '#26282e'; g.fillRect(-22, -16, 44, 32);
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#3a3d45' : '#30333a'; g.fillRect(-16, -12 + k * 4.4, 32, 4.4); }
    g.fillStyle = '#9aa0a8'; g.fillRect(-22, -16, 3, 32); g.fillRect(19, -16, 3, 32);
    g.fillStyle = '#1f6f3a'; g.fillRect(-14, -30, 28, 12); g.fillStyle = '#fff';
    g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SUBWAY', 0, -24);
    g.restore();
    return;
  }
  // local frame: +x along the track, +y away from it towards the platform side
  const sd = st.side;
  const rect = (x, y, w, h) => g.fillRect(x, sd > 0 ? y : -y - h, w, h);
  g.save(); g.translate(st.x, st.y); g.rotate(st.a);
  g.fillStyle = '#ffd400'; rect(-112, 39, 224, 4);                             // mind the gap
  g.fillStyle = 'rgba(0,0,0,.28)'; rect(-58, 56, 120, 30);
  g.fillStyle = '#2f5a4a'; rect(-60, 52, 120, 30);                              // shelter roof
  g.fillStyle = '#3d7360'; for (let k = -56; k < 60; k += 12) rect(k, 54, 8, 26);
  g.fillStyle = '#1c2a44'; rect(-46, 40, 92, 12);                               // name board
  for (const bx of [-92, 80]) { g.fillStyle = '#6b4a2a'; rect(bx, 46, 16, 6); }   // benches
  g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.translate(0, sd * 46); if (Math.cos(st.a) < -0.1 || (Math.abs(Math.cos(st.a)) <= 0.1 && Math.sin(st.a) > 0)) g.rotate(Math.PI); // keep the lettering upright
  g.fillText(st.name.replace(/ Station$/, '').toUpperCase(), 0, 0.5, 88);
  g.restore();
}

// The platform clock: an LED board on a post counting down to the next train ("BOARDING" while
// one is in). secs < 0: no timetable yet.
export function drawStationClock(g, st, secs, now) {
  const under = st.under;
  g.save();
  if (under) { g.translate(st.platform.x + 40, st.platform.y - 28); g.scale(1.3, 1.3); }
  else {
    g.translate(st.x, st.y); g.rotate(st.a);
    g.translate(98, st.side * 70);
    if (Math.cos(st.a) < -0.1 || (Math.abs(Math.cos(st.a)) <= 0.1 && Math.sin(st.a) > 0)) g.rotate(Math.PI); // upright text
    g.scale(1.3, 1.3);
  }
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

// flags (wire): 1 underground, 2 doors open, 4 horn, 8 lights on, 16 strongbox gone
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

// ---- underground ----------------------------------------------------------------------------------
// Riding through the subway: the city goes black; the tunnel walls and their lamps slide past.
export function drawTunnel(g, map, view, now) {
  g.fillStyle = '#050608'; g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  if (!map.rail) return;
  const pts = map.rail.pts, n = pts.length;
  const inView = (p) => p.x > view.x0 - 200 && p.x < view.x1 + 200 && p.y > view.y0 - 200 && p.y < view.y1 + 200;
  const pass = (w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; if (!p.under || !q.under || !inView(p)) continue; g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
    g.stroke();
  };
  pass(96, '#1e2026'); pass(78, '#14151a'); pass(60, '#24262c');
  for (let i = 0; i < n; i++) { // wall lamps every ~150 px
    const p = pts[i];
    if (!p.under || !inView(p) || Math.round(p.s) % 150 >= 8) continue;
    const q = pts[(i + 1) % n], a = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(a), ny = Math.cos(a);
    for (const sd of [-1, 1]) {
      const lx = p.x + nx * sd * 44, ly = p.y + ny * sd * 44;
      const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 40);
      gr.addColorStop(0, 'rgba(255,214,140,.45)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
      g.fillStyle = gr; g.fillRect(lx - 40, ly - 40, 80, 80);
      g.fillStyle = '#ffe2a0'; g.fillRect(lx - 3, ly - 2, 6, 4);
    }
  }
  // rails underfoot
  for (const side of [-1, 1]) {
    g.strokeStyle = '#5a5e66'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; if (!p.under || !q.under || !inView(p)) continue; const a = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(a) * side * RAIL_OFF, ny = Math.cos(a) * side * RAIL_OFF; g.moveTo(p.x + nx, p.y + ny); g.lineTo(q.x + nx, q.y + ny); }
    g.stroke();
  }
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
