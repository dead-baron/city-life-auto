// Inside your home (H62; server/systems/homeinside.js walks you round, shared/homelayout.js has the plans): the rooms
// drawn on a canvas of their own instead of the city (main.js draws no city while S.homeIn) - with art v2 in the game's
// 3/4 view, the walls standing, the furniture voxel models and you as in the street (render/homeart2.js, H64); in the
// classic view the plan's flat sprites with the walls raised - the camera at the street's scale, framing the inside,
// you walking round it (predicted from your own inputs, as out in the street, so it answers at once), the thing in
// reach outlined, your cars in the garage, the windows showing the time of day, the night passing while you sleep.
// Loaded when you first go in (main.js 'home' message) - nothing of it is in the page until then.
import { layout, stepInside, useAt, TILE_IN, CAR_IN } from '../../shared/homelayout.js';
import { HOME_IN } from '../../shared/rules.js';
import { TICK_HZ } from '../../shared/constants.js';
import { PAINTS, VEHICLES } from '../../shared/vehicles.js';
import { pedSprite, PED_BOX } from './sprites.js';
import { decodeLook, lookToApp } from '../../shared/lookcore.js';

const DT = 1 / TICK_HZ;
const looks = new Map();   // a friend's look by name (sent now and then)
const seen = new Map();    // a friend's last two spots by name: drawn between them (the server's 20 a second)
const appOf = (a) => { if (a && a.lk && a.t === undefined) { const L = decodeLook(a.lk); return L ? lookToApp(L, a.lk) : {}; } return a || {}; };
let cv = null, g = null, S = null, st = null, raf = 0, app = null, bake = null;
// art v2 (H64): render/homeart2.js - the rooms in the game's 3/4 view, the furniture as voxel models, you as in the
// street - loaded the first time you go in with art v2 on (its imports are the renderer's own, in the page by then)
let artMod = null, artP = null, art = null;
const raw = new Map();     // a friend's look as the server sends it (art v2's people adapt it themselves)
// the street camera's scale (main.js baseZoom): CSS px per world px - you're your usual size in here
function streetZoom() {
  const long = Math.max(innerWidth, innerHeight), viewH = 660 * (1 + 0.3 * Math.max(0, Math.min(1, (long - 960) / 960)));
  return long / (viewH * 16 / 9) * ((S && S.camScale) || 1);
}

// the palettes by how well the place is furnished (0 a shack .. 3 a mansion)
const PAL = [
  { wood: ['#8a6a48', '#7f6142'], carpet: ['#6f6a5e', '#676256'], tile: ['#b9b6a8', '#aeab9c'], wall: '#4a4440', top: '#6a625a', cloth: '#5a7a5a', accent: '#a0583a', fab: '#6a6458', face: '#9a7a56' },
  { wood: ['#9a7350', '#8f6a48'], carpet: ['#7a5e52', '#71564a'], tile: ['#d2d0c4', '#c6c4b6'], wall: '#3e3a44', top: '#625c6a', cloth: '#3e6a8a', accent: '#c8873a', fab: '#5a6a7a', face: '#c8b48e' },
  { wood: ['#a87c52', '#9c724a'], carpet: ['#8a4a40', '#80443a'], tile: ['#e2e0d6', '#d6d4c8'], wall: '#36323a', top: '#5c5462', cloth: '#7a3a3a', accent: '#d9a84a', fab: '#3a5a4a', face: '#9ab08e' },
  { wood: ['#c8b89a', '#bfae8e'], carpet: ['#4a3a6a', '#443462'], tile: ['#f0eee8', '#e6e3da'], wall: '#2a2a30', top: '#5a5662', cloth: '#7a1d24', accent: '#f2c21b', fab: '#26303e', face: '#6a2e36' },
];

export function onMsg(state, m) {
  S = state;
  if (m.pre) return;   // (at your door: loaded ahead of going in)
  if (m.off) { hide(); return; }
  if (!st || st.id !== m.id || m.plan !== (st && st.plan)) st = { id: m.id, cars: [], name: '', garage: 0, sleepS: HOME_IN.sleepS, wakeH: HOME_IN.wakeH };
  Object.assign(st, m);
  st.at = performance.now();
  const t = performance.now();
  for (const o of m.others || []) {
    if (o.app) { looks.set(o.n, appOf(o.app)); raw.set(o.n, o.app); }
    const q = seen.get(o.n), k = q ? Math.min(1, (t - q.t) / 50) : 1;
    seen.set(o.n, { x0: q ? q.x0 + (q.x1 - q.x0) * k : o.x, y0: q ? q.y0 + (q.y1 - q.y0) * k : o.y, x1: o.x, y1: o.y, t });
  }
  if (m.sleep && !st.sleepT0) { st.sleepT0 = performance.now(); st.sleepMin0 = m.min; }
  if (!m.sleep) st.sleepT0 = 0;
  const e = S.ents.get(S.myPedId);
  if (e && e.d && e.d.app) app = e.d.app;   // (your look - from the moment before you went in, while you're out of sight)
  show();
}

function show() {
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'home-cv';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;background:#07080b';
    const game = document.getElementById('game'), hud = document.getElementById('hud');
    game.insertBefore(cv, hud);
    g = cv.getContext('2d');
  }
  cv.style.display = '';
  if (!raf) raf = requestAnimationFrame(frame);
  // (H64) the city isn't drawn under the inside (main.js render: a phone's frame rate); no FIRE / ROLL / CAR, no aim
  // stick and no district card in here
  S.homeIn = true;
  if (!document.getElementById('home-css')) {
    const css = document.createElement('style'); css.id = 'home-css';
    css.textContent = 'body.home-in #tbtns [data-b=fire],body.home-in #tbtns [data-b=vehicle],body.home-in #tbtns [data-b=dive],body.home-in #tbtns [data-b=throw],body.home-in #tbtns [data-b=reload],body.home-in #stick-r,body.home-in #firetog,body.home-in #district{display:none!important}';
    document.head.appendChild(css);
  }
  document.body.classList.add('home-in');
  if (S.art2 && !artMod && !artP) artP = import('./homeart2.js').then((m) => { artMod = m; }).catch((e) => console.warn('[home art]', e)).finally(() => { artP = null; });
}
function hide() {
  st = null;
  if (cv) cv.style.display = 'none';
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (S) S.homeIn = false;
  document.body.classList.remove('home-in');
}
export const inside = () => !!st;

// where you are: the server's spot, your inputs it hasn't seen yet replayed on it (the same steps it takes), between the
// last two steps by the time since
function predicted(L) {
  const s = { x: st.x, y: st.y, a: st.a, nc: (st.cars || []).length }, prev = { ...s };   // (nc: the parked cars are solid)
  let mv = !!st.mv;
  if (!st.sleep && !st.shower && S.pending) {
    for (const q of S.pending) {
      if (q.seq <= st.ack) continue;
      prev.x = s.x; prev.y = s.y; prev.a = s.a;
      mv = stepInside(L, s, q.mx || 0, q.my || 0, DT, HOME_IN.walk) || mv;
    }
  }
  const k = Math.min(1, (S.acc || 0) / DT);
  return { x: prev.x + (s.x - prev.x) * k, y: prev.y + (s.y - prev.y) * k, a: s.a, mv };
}

function frame(now) {
  raf = 0;
  if (!st || !cv) return;
  raf = requestAnimationFrame(frame);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const L = layout(st.plan, st.tier);
  const v2 = !!S.art2 && !!artMod;
  const me = predicted(L);
  // the camera: the street's scale (you're your usual size), the whole place framed when it fits, else following you
  const k = streetZoom() * dpr, top = v2 ? artMod.HF - TILE_IN : 16;
  const vw = W / k, vh = H / k;
  const cx = L.w + 40 <= vw ? L.w / 2 : Math.max(vw / 2 - 20, Math.min(L.w - vw / 2 + 20, me.x));
  const cy = L.h + top + 60 <= vh ? (L.h - top) / 2 + 8 : Math.max(vh / 2 - top - 30, Math.min(L.h - vh / 2 + 40, me.y));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
  g.setTransform(k, 0, 0, k, Math.round(W / 2 - cx * k), Math.round(H / 2 - cy * k));
  g.imageSmoothingEnabled = false;
  const u = !st.sleep && !st.shower ? useAt(L, me.x, me.y, HOME_IN.reach) : null;
  if (v2) drawArt(L, me, u, now);
  else {
    if (!bake || bake.key !== `${st.plan}:${st.tier}`) bake = { key: `${st.plan}:${st.tier}`, cv: bakeRooms(L) };
    g.drawImage(bake.cv, -16, -24, L.w + 32, L.h + 40);
    windows(L, now);
    cars(L);
    if (u) {   // the thing in reach: outlined
      g.strokeStyle = `rgba(255,214,90,${0.55 + 0.35 * Math.sin(now / 220)})`; g.lineWidth = 2;
      g.strokeRect(u.x + 1, u.y + 1, u.w - 2, u.h - 2);
    }
    for (const o of st.others || []) friend(L, o, now);
    you(L, me, now);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  hudText(W, H, dpr, now);
}

// ---- art v2: the rooms in the game's 3/4 view (render/homeart2.js), everything standing sorted by where it stands -----
const dir8Of = (a) => ((Math.round(a / (Math.PI / 4)) % 8) + 8 + 6) % 8;   // (v1 order: 0 S, 2 W, 4 N, 6 E)
function drawArt(L, me, u, now) {
  const ap = Math.max(1, Math.min(2, (S.art2 && S.art2.E && S.art2.E.ap) || 2));
  if (!art || art.L !== L || art.ap !== ap) art = new artMod.HomeArt(L, ap);
  art.relight(daylight());
  const f = art.floor;
  g.drawImage(f.cv, 0, 0, f.G.w * ap, f.G.h * ap);
  const list = [];
  for (const it of art.items) list.push({ b: it.base, it });
  (st.cars || []).forEach((c, i) => { const s = art.car(c, i); if (s) list.push({ b: s.base, car: s }); });
  // you, and anyone in here with you: art v2's people, at the street's size
  const person = (look, x, y, a, mv, sl, sh, nm) => {
    let pose = mv ? 'move1' : 'idle', fr = mv ? Math.floor(now / 110) % 6 : 0, d8 = dir8Of(a), b = y;
    if (sl) { const bed = L.pieces.find((p) => p.ch === 'B'); if (bed) { x = bed.x + bed.w / 2 + (nm ? 14 : -6); y = bed.y + 26; b = bed.y + bed.h + 1; pose = 'down'; fr = 0; d8 = 4; } }
    if (sh) { const s2 = L.pieces.find((p) => p.ch === 'H'); if (s2) { x = s2.x + s2.w / 2; y = s2.y + s2.h / 2 + 4; b = s2.y + s2.h - 1; d8 = 0; } }
    list.push({ b, p: { look, x, y, pose, fr, d8, nm } });
  };
  for (const o of st.others || []) {
    const q = seen.get(o.n), kk = q ? Math.min(1, (performance.now() - q.t) / 50) : 1;
    person(raw.get(o.n) || {}, q ? q.x0 + (q.x1 - q.x0) * kk : o.x, q ? q.y0 + (q.y1 - q.y0) * kk : o.y, o.a, o.mv, o.sl, false, o.n);
  }
  person(app || {}, me.x, me.y, me.a, me.mv, st.sleep, st.shower, null);
  list.sort((a, b) => a.b - b.b);
  const pulse = 0.55 + 0.4 * Math.sin(now / 220);
  for (const e of list) {
    if (e.it) {
      const it = e.it;
      g.drawImage(it.cv, it.x, it.y, it.G.w * ap, it.G.h * ap);
      if (u && it.piece === u && it.ol) { g.globalAlpha = pulse; g.drawImage(it.ol, it.x - ap, it.y - ap, it.ol.width * ap, it.ol.height * ap); g.globalAlpha = 1; }
    } else if (e.car) g.drawImage(e.car.cv, e.car.x, e.car.y, e.car.w, e.car.h);
    else {
      const p = e.p;
      let c = null;
      try { c = art.person(p.look, p.pose, p.d8, p.fr, p.x, p.y); } catch (err) { if (!art.pedErr) { art.pedErr = 1; console.warn('[home art] person', err); } }
      if (!c) continue;
      if (p.pose !== 'down' && !st.shower) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.x, p.y, 9, 4, 0, 0, 6.28); g.fill(); }
      g.drawImage(c.cv, Math.round(p.x - c.ax), Math.round(p.y - c.ay));
      if (p.nm) {
        g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(p.nm, p.x + 1, p.y - c.ay - 3);
        g.fillStyle = '#bfe3ff'; g.fillText(p.nm, p.x, p.y - c.ay - 4);
      }
    }
  }
  if (u && u.use === 'door') { g.strokeStyle = `rgba(255,214,90,${pulse})`; g.lineWidth = 2; g.strokeRect(u.x + 1, u.y - 12, u.w - 2, u.h + 10); }
  if (st.shower) {   // steam
    g.fillStyle = 'rgba(235,245,255,.3)';
    for (let k = 0; k < 5; k++) { const t = (now / 900 + k / 5) % 1; g.beginPath(); g.arc(me.x - 10 + k * 5, me.y - 30 - t * 26, 5 + t * 8, 0, 6.28); g.fill(); }
  }
  tvGlow(L, now);
}
// the TV's light flickering on the room at night (over the baked light)
function tvGlow(L, now) {
  const d = daylight();
  if (d > 0.7) return;
  const tv = L.pieces.find((p) => p.ch === 'V');
  if (!tv) return;
  const x = tv.x + tv.w / 2, y = tv.y + tv.h / 2, r = 70;
  g.save(); g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(x, y, 4, x, y, r);
  grd.addColorStop(0, `rgba(110,150,255,${(0.1 + 0.06 * Math.sin(now / 130) + 0.04 * Math.sin(now / 47)) * (1 - d)})`); grd.addColorStop(1, 'rgba(110,150,255,0)');
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

// ---- the rooms, baked once per plan --------------------------------------------------------------------------------
function bakeRooms(L) {
  const PX = 2, c = document.createElement('canvas');
  c.width = (L.w + 32) * PX; c.height = (L.h + 40) * PX;
  const b = c.getContext('2d');
  b.scale(PX, PX); b.translate(16, 24);
  const P = PAL[L.tier] || PAL[0], T = TILE_IN;
  const floorOf = (ch) => (ch === 't' ? P.tile : ch === 'c' ? P.carpet : ch === 'g' ? ['#6c6d70', '#66676a'] : P.wood);
  // floors (under the furniture too: the floor next to it)
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    let ch = L.cell(tx, ty);
    if (/[A-Z#=]/.test(ch)) { const n = [L.cell(tx - 1, ty), L.cell(tx + 1, ty), L.cell(tx, ty + 1), L.cell(tx, ty - 1)].find((q) => /[.ctg+]/.test(q)); if (!n || /[#=DR]/.test(ch)) continue; ch = n; }
    const f = floorOf(ch), x = tx * T, y = ty * T;
    if (ch === 't') { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { b.fillStyle = f[(i + j) & 1]; b.fillRect(x + i * 16, y + j * 16, 16, 16); } }
    else if (ch === 'g') { b.fillStyle = f[(tx + ty) & 1]; b.fillRect(x, y, T, T); b.fillStyle = 'rgba(0,0,0,.08)'; b.fillRect(x + ((tx * 7) % 20), y + ((ty * 11) % 22), 6, 4); }
    else { for (let j = 0; j < 4; j++) { b.fillStyle = f[(j + tx) & 1]; b.fillRect(x, y + j * 8, T, 8); } b.fillStyle = 'rgba(0,0,0,.12)'; b.fillRect(x + ((tx * 13 + ty * 5) % 24), y, 1, T); }
    if (ch === '+') { b.fillStyle = '#5a4630'; if (L.solid(tx, ty - 1)) b.fillRect(x + 13, y + 2, 6, T - 4); else b.fillRect(x + 2, y + 13, T - 4, 6); }   // (the threshold, along the wall it's in)
  }
  // the garage's bays: painted lines either side, an oil stain
  for (const bay of L.bays) {
    b.fillStyle = 'rgba(240,230,170,.55)'; b.fillRect(bay.x - 31, bay.y - 52, 2, 104); b.fillRect(bay.x + 29, bay.y - 52, 2, 104);
    b.fillStyle = 'rgba(0,0,0,.18)'; b.beginPath(); b.ellipse(bay.x + 4, bay.y + 8, 9, 6, 0.4, 0, 6.28); b.fill();
  }
  // a rug in the living room and the bedroom of a better place
  if (L.tier >= 1) for (const p of L.pieces) if (p.ch === 'C' || p.ch === 'B') {
    const r = p.ch === 'B' ? { x: p.x - 10, y: p.y + p.h - 18, w: p.w + 20, h: 30 } : p.w > p.h ? { x: p.x, y: p.y - 70, w: p.w + 30, h: 56 } : { x: p.x + p.w + 6, y: p.y, w: 70, h: p.h };
    b.fillStyle = P.cloth; b.fillRect(r.x, r.y, r.w, r.h);
    b.strokeStyle = P.accent; b.lineWidth = 2; b.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
  }
  // the furniture, its shadow
  for (const p of L.pieces) { b.fillStyle = 'rgba(0,0,0,.2)'; b.fillRect(p.x + 3, p.y + 4, p.w, p.h); piece(b, p, P, L); }
  // the walls standing up (H64): each wall's top raised by its height, the face below it showing where the floor is in
  // front (the back wall taller, the rest cut low so you see in); the front door, the garage door
  const wallish = (ch) => ch === '#' || ch === '=' || ch === 'D' || ch === 'R';
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    const ch = L.cell(tx, ty), x = tx * T, y = ty * T, h = ty === 0 ? 16 : 7;
    if (!wallish(ch)) continue;
    const open = !wallish(L.cell(tx, ty + 1)) || ty === L.rows - 1 || (ty === 0 && L.rows > 1);
    if (open) {   // the face: the wallpaper inside, the outside along the front, a skirting at its foot
      b.fillStyle = ty === L.rows - 1 ? (ch === 'R' ? '#9a9ca0' : '#7a6a5a') : P.face; b.fillRect(x, y + T - h, T, h);
      b.fillStyle = 'rgba(0,0,0,.22)'; b.fillRect(x, y + T - 2, T, 2);
      if (ch === 'R') { b.fillStyle = '#7a7c80'; for (let j = 1; j < h; j += 3) b.fillRect(x, y + T - h + j, T, 1); }
      b.fillStyle = 'rgba(0,0,0,.18)'; if (/[.ctg+]/.test(L.cell(tx, ty + 1))) b.fillRect(x, y + T, T, 5);
    }
    if (ch === 'D') {   // the door: a gap in the cut wall, the door shut in it, the mat inside
      b.fillStyle = '#7a4a26'; b.fillRect(x + 3, y + T - h - 2, T - 6, h + 2);
      b.fillStyle = '#e0b040'; b.fillRect(x + T - 10, y + T - h + 2, 3, 3);
      b.fillStyle = '#6a3a2a'; b.fillRect(x + 4, y - 12, T - 8, 9);
      continue;
    }
    b.fillStyle = P.wall; b.fillRect(x, y - h, T, T);
    b.fillStyle = P.top; b.fillRect(x, y - h, T, 2); b.fillRect(x, y - h + T - 2, T, 2);
  }
  return c;
}

function piece(b, p, P, L) {
  const { x, y, w, h } = p;
  const box = (c, xx, yy, ww, hh) => { b.fillStyle = c; b.fillRect(xx, yy, ww, hh); };
  switch (p.ch) {
    case 'B': {   // the bed: the headboard against the wall above, pillows, the covers
      box('#5a3a22', x + 2, y + 2, w - 4, h - 4);
      box('#f2efe6', x + 5, y + 8, w - 10, h - 12);
      box('#ffffff', x + 7, y + 10, (w - 18) / 2, 12); box('#ffffff', x + w / 2 + 2, y + 10, (w - 18) / 2, 12);
      box(P.cloth, x + 5, y + 26, w - 10, h - 30);
      box('rgba(255,255,255,.18)', x + 5, y + 26, w - 10, 4);
      break;
    }
    case 'W': box('#6a4a2c', x + 2, y + 3, w - 4, h - 8); box('#5a3c22', x + w / 2 - 1, y + 4, 2, h - 10); box('#e0b040', x + w / 2 - 5, y + h / 2, 3, 6); box('#e0b040', x + w / 2 + 2, y + h / 2, 3, 6); break;
    case 'S': box('#5c636e', x + 4, y + 4, w - 8, h - 8); box('#7a828e', x + 6, y + 6, w - 12, 4); b.fillStyle = '#c8ccd2'; b.beginPath(); b.arc(x + w / 2, y + h / 2 + 2, 5, 0, 6.28); b.fill(); box('#2a2e36', x + w / 2 - 1, y + h / 2 - 2, 2, 5); break;
    case 'F': box('#e8ecef', x + 4, y + 2, w - 8, h - 6); box('#c4cad0', x + 4, y + h * 0.42, w - 8, 2); box('#8a9096', x + w - 10, y + 6, 2, 8); box('#8a9096', x + w - 10, y + h * 0.5, 2, 8); break;
    case 'H': {   // the shower: its tray, the glass, the head
      box('#dfe8ee', x + 2, y + 2, w - 4, h - 4);
      b.strokeStyle = '#9cc4dc'; b.lineWidth = 1; for (let k = 6; k < w - 4; k += 6) { b.beginPath(); b.moveTo(x + k, y + 4); b.lineTo(x + k, y + h - 4); b.stroke(); }
      box('rgba(160,210,240,.45)', x + 2, y + h - 6, w - 4, 4);
      box('#a8b0b8', x + w / 2 - 3, y + 4, 6, 4);
      b.fillStyle = '#7a8a96'; b.beginPath(); b.arc(x + w / 2, y + h / 2 + 4, 2.5, 0, 6.28); b.fill();
      break;
    }
    case 'A': box('#6a4a2c', x + 3, y + 8, w - 6, h - 14); box('#c8a050', x + 8, y + 12, 8, 5); b.fillStyle = '#f2e0a0'; b.beginPath(); b.arc(x + w - 9, y + 13, 4, 0, 6.28); b.fill(); break;   // keys in a dish, a lamp
    case 'Y': box('#5a4630', x + 4, y + 4, w - 8, h - 14); for (let k = 0; k < 3; k++) { box('#c8ccd2', x + 8 + k * 6, y + 8, 2, 6); box(PAINTS[(k * 3) % PAINTS.length], x + 7 + k * 6, y + 14, 4, 3); } break;
    case 'K': {   // the kitchen counter: the worktop, a hob or a sink along it
      box('#cfc8b8', x, y + 2, w, h - 6); box('#5a5450', x, y + h - 6, w, 3);
      for (let i = 0; i < p.tw; i++) {
        const xx = x + i * TILE_IN;
        if (i === 0) { b.strokeStyle = '#3a3a3e'; b.lineWidth = 2; for (const [dx, dy] of [[9, 9], [22, 9], [9, 20], [22, 20]]) { b.beginPath(); b.arc(xx + dx, y + dy, 4, 0, 6.28); b.stroke(); } }
        else if (i === 1) { box('#9aa4ac', xx + 6, y + 7, 20, 14); box('#7a848c', xx + 8, y + 9, 16, 10); }
        else box('#b8b0a0', xx + 4, y + 8, 10, 8);
      }
      break;
    }
    case 'T': box('#7a5432', x + 4, y + 4, w - 8, h - 8); box('rgba(255,255,255,.08)', x + 4, y + 4, w - 8, 3); for (const [dx, dy] of [[-2, 8], [w - 6, 8], [-2, h - 16], [w - 6, h - 16]]) box('#4a3220', x + dx, y + dy, 8, 8); box('#f2efe6', x + w / 2 - 5, y + h / 2 - 5, 10, 10); break;
    case 'C': { const ver = h > w; box(P.fab, x + 2, y + 2, w - 4, h - 4); for (let k = 0; k < Math.max(p.tw, p.th); k++) box('rgba(255,255,255,.1)', ver ? x + 10 : x + 4 + k * TILE_IN, ver ? y + 4 + k * TILE_IN : y + 10, ver ? w - 14 : TILE_IN - 8, ver ? TILE_IN - 8 : h - 14); box('rgba(0,0,0,.25)', x + 2, y + 2, ver ? 7 : w - 4, ver ? h - 4 : 7); break; }
    case 'V': box('#2a2a2e', x + 3, y + 10, w - 6, h - 16); box('#141418', x + 5, y + 4, w - 10, 6); break;
    case 'L': box('#eef0f2', x + 9, y + 3, 14, 8); b.fillStyle = '#eef0f2'; b.beginPath(); b.ellipse(x + 16, y + 20, 8, 10, 0, 0, 6.28); b.fill(); b.fillStyle = '#c8d4dc'; b.beginPath(); b.ellipse(x + 16, y + 21, 4, 6, 0, 0, 6.28); b.fill(); break;
    case 'N': box('#d8dcdf', x + 5, y + 3, w - 10, h - 12); b.fillStyle = '#b8c4cc'; b.beginPath(); b.ellipse(x + w / 2, y + 12, 8, 6, 0, 0, 6.28); b.fill(); box('#a8b0b8', x + w / 2 - 1, y + 3, 2, 5); break;
    case 'O': box(P.cloth, x + 4, y + 4, w - 8, h - 8); box('rgba(0,0,0,.25)', x + 4, y + 4, w - 8, 7); break;
    case 'Q': box('#5a3c22', x + 2, y + 2, w - 4, h - 4); for (let k = 0; k < 6; k++) box(['#8a2a2a', '#2a5a8a', '#c8a050', '#3a6a3a', '#6a3a7a', '#d0d0c0'][k], x + 4 + k * 4, y + 5, 3, h - 10); break;
    case 'P': box('#7a4a2a', x + 10, y + 16, 12, 12); b.fillStyle = '#2f7a2a'; b.beginPath(); b.arc(x + 16, y + 14, 10, 0, 6.28); b.fill(); b.fillStyle = '#4a9a3a'; b.beginPath(); b.arc(x + 13, y + 11, 5, 0, 6.28); b.fill(); break;
    default: box('#6a6a6a', x + 2, y + 2, w - 4, h - 4);
  }
  void L;
}

// ---- what changes: the windows' light, the cars, you ---------------------------------------------------------------
function daylight() {   // 0 night .. 1 day, from the game clock's minutes
  const m = st.sleepT0 ? sleepMinutes() : st.min || 720;
  const hr = m / 60;
  return hr < 5 || hr > 21 ? 0 : hr < 7 ? (hr - 5) / 2 : hr > 19 ? (21 - hr) / 2 : 1;
}
function sleepMinutes() {   // the clock running on from bedtime to the morning while you sleep
  const k = Math.min(1, (performance.now() - st.sleepT0) / (st.sleepS * 1000));
  let to = st.wakeH * 60;
  if (to < st.sleepMin0) to += 1440;
  return (st.sleepMin0 + (to - st.sleepMin0) * k * k) % 1440;
}
function windows(L, now) {
  const d = daylight(), T = TILE_IN;
  const glass = d > 0.5 ? `rgb(${150 + 60 * d},${200 + 30 * d},${235})` : d > 0 ? '#e09a5a' : '#1a2440';
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    if (L.cell(tx, ty) !== '=') continue;
    const x = tx * T, y = ty * T;
    g.fillStyle = '#e8e4da'; g.fillRect(x + 2, y + T - 15, T - 4, 12);
    g.fillStyle = glass; g.fillRect(x + 4, y + T - 13, T - 8, 8);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 6, y + T - 12, 6, 2);
    if (d > 0.2 && !L.solid(tx, ty + 1)) {   // the light falling in across the floor below it
      g.fillStyle = `rgba(255,236,180,${0.09 * d})`;
      g.beginPath(); g.moveTo(x + 2, y + T); g.lineTo(x + T - 2, y + T); g.lineTo(x + T + 8, y + T * 1.9); g.lineTo(x + 8, y + T * 1.9); g.closePath(); g.fill();
    }
  }
  void now;
}
function cars(L) {
  if (!st.cars) return;
  st.cars.forEach((c, i) => {
    const bay = L.bays[i], d = VEHICLES[c.m];
    if (!bay || !d) return;
    const len = Math.min(d.L, CAR_IN.l), wid = Math.min(d.W, CAR_IN.w);
    g.save(); g.translate(bay.x, bay.y);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-wid / 2 + 3, -len / 2 + 4, wid, len);
    g.fillStyle = PAINTS[c.p % PAINTS.length]; g.fillRect(-wid / 2, -len / 2, wid, len);
    g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(-wid / 2, -len / 2, wid, 4);
    g.fillStyle = '#26303a'; g.fillRect(-wid / 2 + 5, len * 0.08, wid - 10, len * 0.16); g.fillRect(-wid / 2 + 6, -len * 0.3, wid - 12, len * 0.12);
    g.fillStyle = '#f2efc8'; g.fillRect(-wid / 2 + 3, len / 2 - 4, 8, 3); g.fillRect(wid / 2 - 11, len / 2 - 4, 8, 3);
    g.restore();
  });
}
function you(L, me, now) {
  let x = me.x, y = me.y, a = me.a, pose = me.mv ? 'move1' : 'idle', fr = me.mv ? Math.floor(now / 110) % 4 : 0;
  if (st.sleep) {   // in bed, under the covers
    const bed = L.pieces.find((p) => p.ch === 'B');
    if (bed) { x = bed.x + bed.w / 2; y = bed.y + 22; a = Math.PI / 2; pose = 'idle'; fr = 0; }
  }
  if (st.shower) { const sh = L.pieces.find((p) => p.ch === 'H'); if (sh) { x = sh.x + sh.w / 2; y = sh.y + sh.h / 2; } }
  const spr = pedSprite(app || {}, pose, fr, 0);
  g.save(); g.translate(x, y);
  if (!st.sleep) { g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(2, 3, 12, 8, 0, 0, 6.28); g.fill(); }
  g.rotate(a); g.imageSmoothingEnabled = false;
  g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX);
  g.restore();
  if (st.sleep) { const bed = L.pieces.find((p) => p.ch === 'B'); if (bed) { g.fillStyle = (PAL[L.tier] || PAL[0]).cloth; g.fillRect(bed.x + 5, bed.y + 30, bed.w - 10, bed.h - 34); } }
  if (st.shower) {   // steam
    g.fillStyle = 'rgba(235,245,255,.35)';
    for (let k = 0; k < 5; k++) { const t = (now / 900 + k / 5) % 1; g.beginPath(); g.arc(x - 10 + k * 5, y - 6 - t * 26, 5 + t * 8, 0, 6.28); g.fill(); }
  }
}
// a friend in there with you (server homeinside.js letIn): where the server last had them, their name over them
function friend(L, o, now) {
  const q = seen.get(o.n), k = q ? Math.min(1, (performance.now() - q.t) / 50) : 1;
  let x = q ? q.x0 + (q.x1 - q.x0) * k : o.x, y = q ? q.y0 + (q.y1 - q.y0) * k : o.y, a = o.a;
  if (o.sl) { const bed = L.pieces.find((p) => p.ch === 'B'); if (bed) { x = bed.x + bed.w / 2 + 14; y = bed.y + 22; a = Math.PI / 2; } }
  const spr = pedSprite(looks.get(o.n) || {}, o.mv ? 'move1' : 'idle', o.mv ? Math.floor(now / 110) % 4 : 0, 0);
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(2, 3, 12, 8, 0, 0, 6.28); g.fill();
  g.rotate(a); g.imageSmoothingEnabled = false;
  g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX);
  g.restore();
  g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(o.n, x + 1, y - 21);
  g.fillStyle = '#bfe3ff'; g.fillText(o.n, x, y - 22);
}
// the place's name, and the night passing while you sleep
function hudText(W, H, dpr, now) {
  const fs = Math.round(15 * dpr), ny = H - Math.round(30 * dpr);   // (the name along the bottom: the prompt and the buttons are up top)
  g.font = `bold ${fs}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(st.name || '', W / 2 + 2, ny + 2);
  g.fillStyle = '#f2e6c8'; g.fillText(st.name || '', W / 2, ny);
  if (st.sleepT0) {
    const k = Math.min(1, (performance.now() - st.sleepT0) / (st.sleepS * 1000));
    const dark = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
    g.fillStyle = `rgba(4,6,14,${0.92 * dark})`; g.fillRect(0, 0, W, H);
    const m = sleepMinutes(), hh = Math.floor(m / 60), mm = Math.floor(m % 60);
    g.globalAlpha = dark;
    g.font = `bold ${Math.round(40 * dpr)}px monospace`; g.textBaseline = 'middle';
    g.fillStyle = '#9fb7ff'; g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, W / 2, H / 2);
    g.font = `bold ${Math.round(22 * dpr)}px monospace`;
    g.fillText('z'.repeat(1 + (Math.floor(now / 500) % 3)), W / 2 + 80 * dpr, H / 2 - 40 * dpr);
    g.globalAlpha = 1;
  }
}
