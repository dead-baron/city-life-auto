// The classic renderer's train cars (from render/trains.js; client/main.js drawTrains loads this the first time it
// draws a train - art v2 draws its own: art2/game/actors.js trainCarSprite).
import { TRAIN_CARS, COACH_SEATS, LOCO_SEATS, CAB_OX, MAIL_BOX } from '../../shared/mapcore.js';

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
  if (def.kind === 'loco' && inside) {
    // the front car from inside: seats behind the cab; the cab (ahead of its bulkhead) keeps its roof
    g.fillStyle = '#7a1418'; roundRect(g, -hl, -hw, L, W, 8); g.fill();
    g.fillStyle = '#f2c21b'; g.fillRect(-hl, -hw, L, 3); g.fillRect(-hl, hw - 3, L, 3);
    const x1 = CAB_OX;
    g.fillStyle = '#2f3a52'; g.fillRect(-hl + 4, -hw + 4, x1 + hl - 6, W - 8);                    // floor
    g.fillStyle = '#3a4866'; g.fillRect(-hl + 4, -4, x1 + hl - 6, 8);                              // aisle runner
    g.fillStyle = lit ? '#ffe9a0' : '#9cc4dc';
    for (let k = -hl + 12; k < x1 - 16; k += 24) { if (Math.abs(k) < 18) continue; g.fillRect(k, -hw + 1, 16, 3); g.fillRect(k, hw - 4, 16, 3); }
    g.fillStyle = '#ffd400'; g.fillRect(-12, -hw + 1, 24, 3); g.fillRect(-12, hw - 4, 24, 3);     // door edges
    g.fillStyle = '#1b1d22'; g.fillRect(-10, -hw + 1, 20, 3); g.fillRect(-10, hw - 4, 20, 3);
    for (const [ox, oy] of LOCO_SEATS) {
      g.fillStyle = '#1d4fa8'; g.fillRect(ox - 10, oy - 11, 20, 22);
      g.fillStyle = '#2a63c8'; g.fillRect(ox + (ox < 0 ? -10 : 6), oy - 11, 4, 22);
      g.fillStyle = '#8a8f99'; g.fillRect(ox - 10, oy + (oy < 0 ? -11 : 10), 20, 1);
    }
    g.fillStyle = '#c0c4cc'; g.fillRect(-1, -hw + 8, 2, W - 16);                                   // grab pole
    g.fillStyle = '#5a1012'; g.fillRect(x1 - 2, -hw + 3, hl - x1 - 2, W - 6);                      // the cab: bulkhead and roof
    g.fillStyle = '#2a2a30'; g.fillRect(x1 + 4, -hw + 6, hl - x1 - 30, W - 12);
    g.fillStyle = '#3e4048'; g.fillRect(x1 - 2, -6, 3, 12);                                        // the cab door
    g.fillStyle = lit ? '#fff2b0' : '#7fb6d8'; g.fillRect(hl - 26, -hw + 7, 8, W - 14);           // windscreen
    g.fillStyle = '#d8d8d0'; g.beginPath(); g.arc(hl - 4, 0, 4, 0, 6.28); g.fill();               // headlight
    g.fillStyle = '#ffd400'; for (let k = -hw + 4; k < hw - 4; k += 8) g.fillRect(hl - 6, k, 4, 4); // nose chevrons
    return store(key, c);
  }
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
  const mode = `${inside ? 'in' : 'roof'}${lit ? '-lit' : ''}${e.flags & 16 ? '-empty' : ''}`;
  const cv = carCanvas(type, mode);
  g.save(); g.translate(e.rx, e.ry); g.rotate(e.ra);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-def.L / 2 + 5, -def.W / 2 + 6, def.L, def.W);   // shadow
  g.drawImage(cv, -cv.width / 2, -cv.height / 2);
  if (e.flags & 2) { g.fillStyle = '#121418'; g.fillRect(-10, -def.W / 2 - 1, 20, 4); g.fillRect(-10, def.W / 2 - 3, 20, 4); } // doors slid open
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
