// Guided tour "cut scene": a camera flies over the real city (the same baked chunks the game
// draws, over the full-city map image when zoomed out), rings and labels the places that
// matter, and drives little cars along real roads to show the loops (deliveries, getaways,
// police calls). Content and locations come from shared/tutorial.js + the live map, so the tour
// follows map and rule changes on its own.
import { TILE, CHUNK_PX, MAP_W, MAP_H } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { CHAPTERS, STEPS, TUTORIAL_VERSION, resolveTarget, resolveRoute, fillNames, stepExtra } from '../shared/tutorial.js';
import { GroundCache, drawOverheadProp } from './render/tiles.js';
import { atlas, drawVehicle, drawVehicleShadow } from './render/sprites.js';
import { glyph } from './glyphs.js';
import { LOW_MEM } from './platform.js';

const SEEN_KEY = 'cla.tutorial';
const $ = (id) => document.getElementById(id);
const WW = MAP_W * TILE, WH = MAP_H * TILE;
const ROUTE_SPEED = 950;         // px/s for the demo cars
const MARK_COL = { police: '#5b8cff', hospital: '#3ddc84', reception: '#3ddc84', bank: '#ffd36b', atm: '#ffd36b', fence: '#c07aff', drop: '#c07aff', turf: '#ff5a4a', camera: '#ff5a4a', courthouse: '#ffd36b', evidence: '#5b8cff', home: '#7fe07f' };

export function tutorialSeen() {
  try { return Number(localStorage.getItem(SEEN_KEY) || 0) >= TUTORIAL_VERSION; } catch { return true; }
}
export function tutorialSeenOld() {
  try { const v = Number(localStorage.getItem(SEEN_KEY) || 0); return v > 0 && v < TUTORIAL_VERSION; } catch { return false; }
}
export function markTutorialSeen() { try { localStorage.setItem(SEEN_KEY, String(TUTORIAL_VERSION)); } catch { /* storage blocked */ } }

let T = null; // active tour state

// ---- public API ------------------------------------------------------------------------------
// opts: { map, fallback (canvas/image of the whole city), onClose(), chapter }
export function startTutorial(opts) {
  if (T) stopTutorial();
  const map = opts.map;
  const cv = $('tut-cv');
  T = {
    map, cv, g: cv.getContext('2d'), onClose: opts.onClose,
    gc: new GroundCache(map, LOW_MEM ? 14 : 40),
    fallback: opts.fallback || null, wm: null,
    i: 0, t: 0, paused: false, dur: 8,
    cam: { x: WW / 2, y: WH / 2, z: 0.05 }, fly: null,
    route: null, routeT: 0, target: null,
    last: performance.now(), raf: 0, dpr: Math.min(2, devicePixelRatio || 1),
  };
  // (assets/worldmap.webp is the old world: not used since World v2)
  buildChapters();
  const first = opts.chapter ? Math.max(0, STEPS.findIndex((s) => s.ch === opts.chapter)) : 0;
  resize();
  T.cam = fitCam(resolveTarget(map, { city: 1 }));
  goto(first, true);
  addEventListener('resize', resize);
  T.raf = requestAnimationFrame(loop);
}

export function stopTutorial() {
  if (!T) return;
  cancelAnimationFrame(T.raf);
  removeEventListener('resize', resize);
  T.gc.clear();
  const cb = T.onClose;
  T = null;
  markTutorialSeen();
  cb?.();
}
export function tutorialActive() { return !!T; }

export function tutorialNext() { if (T) { if (T.i >= STEPS.length - 1) stopTutorial(); else goto(T.i + 1); } }
export function tutorialPrev() { if (T && T.i > 0) goto(T.i - 1); }
export function tutorialTogglePause() { if (T) { T.paused = !T.paused; $('tut-pause').textContent = T.paused ? '▶ PLAY' : '❚❚ PAUSE'; } }
export function tutorialKey(k) {
  if (!T) return false;
  if (k === 'ArrowRight' || k === 'Space' || k === 'Enter' || k === 'KeyD') { tutorialNext(); return true; }
  if (k === 'ArrowLeft' || k === 'KeyA') { tutorialPrev(); return true; }
  if (k === 'KeyP') { tutorialTogglePause(); return true; }
  return false;
}

// ---- steps -----------------------------------------------------------------------------------
function buildChapters() {
  const bar = $('tut-chapters');
  bar.innerHTML = '';
  for (const c of CHAPTERS) {
    const b = document.createElement('button');
    b.className = 'tut-ch'; b.dataset.ch = c.id; b.textContent = c.title;
    b.onclick = () => { if (T) goto(STEPS.findIndex((s) => s.ch === c.id)); };
    bar.appendChild(b);
  }
}

function goto(i, instant = false) {
  const st = STEPS[i];
  T.i = i; T.t = 0;
  const tgt = resolveTarget(T.map, st.at) || resolveTarget(T.map, { city: 1 });
  T.target = { ...tgt, step: st };
  T.route = st.route ? resolveRoute(T.map, st.route) : null;
  T.routeT = 0;
  const words = (st.text.split(/\s+/).length + (st.at && st.at.island ? 16 : 0));
  T.dur = Math.max(7, Math.min(17, 3 + words * 0.3));
  if (T.route) T.dur = Math.max(T.dur, T.route.len / ROUTE_SPEED + 3);
  const to = T.route ? routeCam(0) : fitCam(tgt);
  if (instant) { T.cam = to; T.fly = null; } else T.fly = { from: { ...T.cam }, to, t: 0, d: flyTime(T.cam, to) };
  // text
  const ch = CHAPTERS.find((c) => c.id === st.ch);
  const inCh = STEPS.filter((s) => s.ch === st.ch);
  $('tut-kicker').textContent = `${ch ? ch.title : ''} · ${inCh.indexOf(st) + 1}/${inCh.length}`;
  $('tut-title').textContent = st.title;
  const extra = stepExtra(T.map, st);
  $('tut-text').innerHTML = withGlyphs(fillNames(T.map, st.text)) + (extra ? `<span class="tut-extra">${esc(extra)}</span>` : '');
  $('tut-next').textContent = i === STEPS.length - 1 ? 'FINISH ✓' : 'NEXT ▶';
  $('tut-prev').disabled = i === 0;
  document.querySelectorAll('#tut-chapters .tut-ch').forEach((b) => b.classList.toggle('on', b.dataset.ch === st.ch));
  $('tut-count').textContent = `${i + 1} / ${STEPS.length}`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function withGlyphs(text) {
  return esc(text).replace(/\[\[(\w+)\]\]/g, (s, a) => glyph(a));
}

// ---- camera ----------------------------------------------------------------------------------
function view() {
  const W = T.cv.clientWidth, H = T.cv.clientHeight;
  const panel = $('tut-panel').offsetHeight || H * 0.3;
  const top = $('tut-chapters').offsetHeight || 40;
  return { W, H, top, panel, vh: Math.max(120, H - panel - top) };
}
function minZoom() { const v = view(); return Math.min(v.W / WW, v.vh / WH) * 0.98; }
function fitCam(t) {
  const v = view();
  const z = Math.max(minZoom(), Math.min(0.95, Math.min(v.W / (t.w * 1.15 + 200), v.vh / (t.h * 1.15 + 200))));
  return { x: t.x, y: t.y, z };
}
function routeCam(d) {
  const p = pointAt(T.route, d);
  return { x: p.x, y: p.y, z: Math.max(minZoom(), Math.min(0.5, view().W / 2400)) };
}
function flyTime(a, b) {
  const d = Math.hypot(a.x - b.x, a.y - b.y) * Math.min(a.z, b.z);
  return Math.max(0.9, Math.min(2.4, 0.7 + d / 900 + Math.abs(Math.log(a.z / b.z)) * 0.35));
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function stepCam(dt) {
  if (T.fly) {
    const f = T.fly;
    f.t += dt;
    const k = ease(Math.min(1, f.t / f.d));
    // zoom out on long hops (a little "jump" over the city), then settle in
    const dist = Math.hypot(f.from.x - f.to.x, f.from.y - f.to.y);
    const hop = Math.max(0, Math.min(1.4, Math.log(1 + dist * Math.max(f.from.z, f.to.z) / (view().W * 1.2))));
    const lz = Math.log(f.from.z) + (Math.log(f.to.z) - Math.log(f.from.z)) * k - hop * Math.sin(Math.PI * k);
    T.cam = { x: f.from.x + (f.to.x - f.from.x) * k, y: f.from.y + (f.to.y - f.from.y) * k, z: Math.max(minZoom(), Math.exp(lz)) };
    if (f.t >= f.d) T.fly = null;
    return;
  }
  if (T.route) {
    const want = routeCam(routeDist());
    const k = 1 - Math.exp(-4 * dt);
    T.cam.x += (want.x - T.cam.x) * k; T.cam.y += (want.y - T.cam.y) * k; T.cam.z += (want.z - T.cam.z) * k;
  }
}

// ---- routes ----------------------------------------------------------------------------------
// the demo car drives the route, waits a beat at the destination, then runs it again
function routeDist() {
  const r = T.route;
  const loop = r.len + ROUTE_SPEED * 1.6;
  return Math.min(r.len, (T.routeT * ROUTE_SPEED) % loop);
}
function pointAt(r, d) {
  const p = r.pts;
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const L = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc + L >= d) { const k = L ? (d - acc) / L : 0; return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k, a: Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x) }; }
    acc += L;
  }
  const n = p.length - 1;
  return { x: p[n].x, y: p[n].y, a: n > 0 ? Math.atan2(p[n].y - p[n - 1].y, p[n].x - p[n - 1].x) : 0 };
}

// ---- frame -----------------------------------------------------------------------------------
function resize() {
  if (!T) return;
  const W = T.cv.clientWidth, H = T.cv.clientHeight;
  T.cv.width = Math.round(W * T.dpr); T.cv.height = Math.round(H * T.dpr);
}

function loop(now) {
  if (!T) return;
  const dt = Math.min(0.1, (now - T.last) / 1000);
  T.last = now;
  if (T.cv.width !== Math.round(T.cv.clientWidth * T.dpr)) resize();
  if (!T.paused) {
    T.t += dt;
    if (T.route && !T.fly) T.routeT += dt;
    if (T.t >= T.dur) { if (T.i < STEPS.length - 1) goto(T.i + 1); else T.t = T.dur; }
  }
  $('tut-bar').style.transform = `scaleX(${Math.min(1, T.t / T.dur).toFixed(3)})`;
  stepCam(dt);
  draw(now / 1000);
  T.raf = requestAnimationFrame(loop);
}

function draw(time) {
  const { g, cam, dpr } = T;
  const v = view();
  const z = cam.z;
  // the camera centre sits in the middle of the area between the chapter bar and the panel
  const cx = v.W / 2, cy = v.top + v.vh / 2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0d2238'; g.fillRect(0, 0, v.W, v.H);
  const tf = () => g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cx - cam.x * z), dpr * (cy - cam.y * z));
  tf();
  // whole-city image underneath (instant at any zoom)
  const base = T.wm || T.fallback;
  if (base) { g.imageSmoothingEnabled = true; g.drawImage(base, 0, 0, WW, WH); }
  // street-level detail fades in as we zoom
  const detail = Math.max(0, Math.min(1, (z - 0.2) / 0.12));
  if (detail > 0 && atlas.ready) {
    const x0 = cam.x - cx / z, x1 = cam.x + (v.W - cx) / z, y0 = cam.y - cy / z, y1 = cam.y + (v.H - cy) / z;
    const c0x = Math.max(0, Math.floor(x0 / CHUNK_PX)), c1x = Math.min(Math.ceil(WW / CHUNK_PX) - 1, Math.floor(x1 / CHUNK_PX));
    const c0y = Math.max(0, Math.floor(y0 / CHUNK_PX)), c1y = Math.min(Math.ceil(WH / CHUNK_PX) - 1, Math.floor(y1 / CHUNK_PX));
    let budget = T.fly ? 1 : 3; // bake a few chunks per frame so flights stay smooth
    g.globalAlpha = detail;
    g.imageSmoothingEnabled = z < 0.9;
    for (let ky = c0y; ky <= c1y; ky++) for (let kx = c0x; kx <= c1x; kx++) {
      const baked = T.gc.cache.has(T.gc.key(kx, ky));
      if (!baked) { if (budget <= 0) continue; budget--; }
      g.drawImage(T.gc.get(kx, ky), kx * CHUNK_PX, ky * CHUNK_PX, CHUNK_PX + 0.5, CHUNK_PX + 0.5);
    }
    if (detail > 0.6) for (let ky = c0y; ky <= c1y; ky++) for (let kx = c0x; kx <= c1x; kx++) {
      if (!T.gc.cache.has(T.gc.key(kx, ky))) continue;
      for (const p of T.gc.overhead(kx, ky)) if (p.x > x0 - 60 && p.x < x1 + 60 && p.y > y0 - 60 && p.y < y1 + 60) drawOverheadProp(g, p, false);
    }
    g.globalAlpha = 1;
  }
  // route + demo vehicles
  if (T.route) drawRoute(time, z);
  // screen-space overlays: rings, labels, area names
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = (x, y) => [cx + (x - cam.x) * z, cy + (y - cam.y) * z];
  const tg = T.target;
  if (tg && tg.label && !T.fly) {
    // area name above the area (clear of the markers), clamped on screen
    let [lx] = S(tg.x, tg.y);
    const [, topY] = S(tg.x, tg.y - tg.h / 2);
    const fs = Math.round(Math.min(52, v.W / 15));
    const y = Math.max(v.top + fs * 0.75, Math.min(v.top + v.vh - fs, topY + fs * 0.8));
    g.font = `${fs}px Anton, Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const hw = g.measureText(tg.label.toUpperCase()).width / 2 + 10;
    lx = Math.max(hw, Math.min(v.W - hw, lx));
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(tg.label.toUpperCase(), lx, y);
    g.fillStyle = '#fff'; g.fillText(tg.label.toUpperCase(), lx, y);
  }
  if (tg && tg.marks && !T.fly) {
    const many = tg.marks.length > 6;
    for (const m of tg.marks) {
      const [sx, sy] = S(m.x, m.y);
      if (sx < -40 || sy < -40 || sx > v.W + 40 || sy > v.H + 40) continue;
      const col = MARK_COL[m.kind] || '#ffd400';
      const ph = (time * 1.2 + m.x * 0.0007) % 1;
      g.strokeStyle = col; g.globalAlpha = 1 - ph; g.lineWidth = 3;
      g.beginPath(); g.arc(sx, sy, 10 + ph * 26, 0, 6.28); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(sx, sy, 7, 0, 6.28); g.fill(); g.stroke();
      if (!many || z > 0.08) label(g, m.label, sx, sy - 16, col, many ? 12 : 15);
    }
  }
}

function label(g, text, x, y, col, size) {
  g.font = `600 ${size}px Rubik, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  const w = g.measureText(text).width + 12;
  g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(x - w / 2, y - size - 6, w, size + 8);
  g.fillStyle = col; g.fillRect(x - w / 2, y + 1, w, 2);
  g.fillStyle = '#fff'; g.fillText(text, x, y - 1);
}

function drawRoute(time, z) {
  const { g } = T;
  const r = T.route;
  // dashed road route
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = r.chaser ? 'rgba(255,90,74,.85)' : r.siren ? 'rgba(91,140,255,.9)' : 'rgba(255,212,0,.9)';
  g.lineWidth = Math.max(6, 5 / z); g.setLineDash([22 / Math.max(z, 0.2), 16 / Math.max(z, 0.2)]); g.lineDashOffset = -time * 60 / Math.max(z, 0.2);
  g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
  g.restore();
  // end flag
  const e = r.end;
  g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2 / z;
  g.beginPath(); g.arc(e.x, e.y, Math.max(10, 7 / z), 0, 6.28); g.fill(); g.stroke();
  if (e.label) {
    g.save(); g.setTransform(T.dpr, 0, 0, T.dpr, 0, 0);
    const v = view();
    const sx = v.W / 2 + (e.x - T.cam.x) * z, sy = v.top + v.vh / 2 + (e.y - T.cam.y) * z;
    label(g, e.label, sx, sy - 14, '#ffd400', 14);
    g.restore();
  }
  // the demo car (and its pursuer)
  const d = routeDist();
  const car = (id, dist, paint, siren) => {
    const def = VEHICLES[id];
    if (!def) return;
    const p = pointAt(r, Math.max(0, dist));
    const s = Math.max(1, 0.45 / z); // keep it visible when zoomed out
    g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(s, s);
    drawVehicleShadow(g, { p: paint, vr: 0 }, def);
    drawVehicle(g, { p: paint, vr: 0 }, def, 0);
    if (siren) {
      const ph = Math.floor(time * 6) % 2;
      g.fillStyle = ph ? '#ff2a2a' : '#2a6aff'; g.beginPath(); g.arc(-2, -6, 6, 0, 6.28); g.fill();
      g.fillStyle = ph ? '#2a6aff' : '#ff2a2a'; g.beginPath(); g.arc(-2, 6, 6, 0, 6.28); g.fill();
    }
    g.restore();
  };
  if (r.chaser) car(r.chaser, d - 420, 0, true);
  car(r.veh, d, 2, r.siren);
}
