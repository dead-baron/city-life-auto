// Sprite layer: vehicle sprites from the concept-art atlas (procedural fallback for models
// not in the atlas), runtime-composited layered pedestrians cached per outfit/pose/frame,
// crates and loot bags.
import { VEHICLE_BY_INDEX, PAINTS } from '../../shared/vehicles.js';
import { shade } from './tiles.js';
import { paintCharacter, CHAR_GRID } from './peds.js';
import { PREFAB_SHEETS } from '../../shared/prefab-data.js';
import { BLOCK_SHEETS } from '../../shared/block-data.js';
import { LOW_MEM, capSet } from '../platform.js';

const SKINS = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a'];
export const atlas = { ready: false, imgs: [], frames: {}, variants: {}, scale: 2, ground: null, prefabs: null, prefabGlow: null, blocks: null, blockGlow: null, interiors: null, scenes: null, animals: null };

export async function loadAtlas(base = 'assets/', glowSheets = true) {
  try {
    const meta = await (await fetch(base + 'sprites.json')).json();
    atlas.frames = meta.frames; atlas.variants = meta.variants; atlas.scale = meta.scale;
    const load = (f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = base + f; });
    [atlas.imgs, atlas.ground, atlas.prefabs, atlas.scenes, atlas.blocks] = await Promise.all([Promise.all(meta.atlases.map(load)), load('ground.png'), Promise.all(Array.from({ length: PREFAB_SHEETS }, (_, i) => load(`prefabs${i}.webp`))), load('scenes.webp').catch(() => null),
      Promise.all(Array.from({ length: BLOCK_SHEETS }, (_, i) => load(`blocks${i}.webp`))).catch(() => null)]); // hand-designed blocks
    atlas.ready = true;
    // night emissive sheets load after the day art (not needed for the first frame). They're as
    // big again as the day art once decoded (~100 MB), so a console on less than High does without
    // them: the lighting pass still lights the windows.
    if (!LOW_MEM || glowSheets) loadGlowSheets(base);
    loadInteriorArt(base); // shop interiors (only needed once you walk in)
    load('animals.png').then((im) => { atlas.animals = im; }).catch(() => {}); // lost pets
  } catch (e) { console.warn('atlas unavailable, using procedural sprites', e); }
}

// the police station paintings (front desk, armory cage) on their own: the interior view needs only these
let interiorLoading = false;
export function loadInteriorArt(base = 'assets/') {
  if (atlas.interiors || interiorLoading) return;
  interiorLoading = true;
  const im = new Image();
  im.onload = () => { atlas.interiors = im; };
  im.onerror = () => { interiorLoading = false; };
  im.src = base + 'interiors.webp';
}

// the night emissive sheets (lit windows and signs), loaded once
let glowLoading = false;
export function loadGlowSheets(base = 'assets/') {
  if (glowLoading) return;
  glowLoading = true;
  const load = (f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = base + f; });
  Promise.all(Array.from({ length: PREFAB_SHEETS }, (_, i) => load(`prefabs${i}_glow.webp`))).then((a) => { atlas.prefabGlow = a; }).catch(() => {});
  Promise.all(Array.from({ length: BLOCK_SHEETS }, (_, i) => load(`blocks${i}_glow.webp`))).then((a) => { atlas.blockGlow = a; }).catch(() => {});
}

function frame(name) { return atlas.ready ? atlas.frames[name] : null; }

// ---------------------------------------------------------------------------
// Vehicles (drawn centered, facing +x, in world units)
const procCache = new Map();
const liveryCache = new Map();
// Police motorcycle: the sport bike's art in black-and-white police livery with a light bar.
function policeBike(fr, L, W) {
  const key = `${fr.a}|${fr.x}|${fr.y}|${L}`;
  let cv = liveryCache.get(key);
  if (cv) return cv;
  const S = 3;
  cv = document.createElement('canvas'); cv.width = L * S; cv.height = W * S;
  const g = cv.getContext('2d');
  g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, 0, 0, L * S, W * S);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(236,240,248,0.55)'; g.fillRect(0, 0, L * S, W * S);           // white bodywork
  g.fillStyle = 'rgba(20,32,80,0.75)'; g.fillRect(L * S * 0.42, 0, L * S * 0.16, W * S); // navy band
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#d02020'; g.fillRect(L * S * 0.12, W * S * 0.2, 4 * S, 3 * S);      // rear lights
  g.fillStyle = '#2050e0'; g.fillRect(L * S * 0.12, W * S * 0.8 - 3 * S, 4 * S, 3 * S);
  liveryCache.set(key, cv);
  return cv;
}

export function drawVehicle(g, desc, def, f) {
  const artId = def.art || (atlas.variants[def.id] ? def.id : def.sprite || def.id);   // (def.sprite: a stand-in, e.g. the MC1 motorcycles drawn as the sport bike)
  const n = atlas.variants[artId] || 0;
  const fr = n ? frame(`veh_${artId}_${(desc.vr || 0) % n}`) : null;
  const L = def.L, W = def.W;
  if (fr && (def.id === 'policebike' || def.id === 'policeboat')) { g.drawImage(policeBike(fr, L, W), -L / 2, -W / 2, L, W); return; }
  if (fr) {
    if (desc.tn >= 0) { g.drawImage(tinted(fr, desc.tn), -L / 2, -W / 2, L, W); return; } // resprayed
    g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, -L / 2, -W / 2, L, W);
  } else {
    const key = `${def.id}|${desc.p}`;
    let cv = procCache.get(key);
    if (!cv) { cv = procVehicle(def, PAINTS[desc.p % PAINTS.length] || '#888'); procCache.set(key, cv); }
    g.drawImage(cv, -L / 2 - 2, -W / 2 - 2, L + 4, W + 4);
  }
}

// A painted vehicle in a new colour: the bodywork (saturated, mid-bright pixels) takes the paint's
// hue while glass, tyres, chrome and lights keep theirs. Cached per frame + colour.
const tintCache = new Map();
function tinted(fr, p) {
  const key = `${fr.a}:${fr.x}:${fr.y}:${p}`;
  let cv = tintCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = fr.w; cv.height = fr.h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
  const img = g.getImageData(0, 0, fr.w, fr.h), d = img.data;
  const hex = PAINTS[p % PAINTS.length] || '#888888';
  const pr = parseInt(hex.slice(1, 3), 16), pg = parseInt(hex.slice(3, 5), 16), pb = parseInt(hex.slice(5, 7), 16);
  const pl = (Math.max(pr, pg, pb) + Math.min(pr, pg, pb)) / 2 || 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 30) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, sat = mx - mn;
    // bodywork: coloured paint, or a white / silver / black body panel that isn't glass-blue
    const glass = b > r + 25 && b > gg + 5 && l < 140;
    if (glass || l < 28 || (sat < 22 && (l < 70 || l > 235))) continue;
    const k = l / pl;
    d[i] = Math.min(255, pr * k); d[i + 1] = Math.min(255, pg * k); d[i + 2] = Math.min(255, pb * k);
  }
  g.putImageData(img, 0, 0);
  if (tintCache.size > 300) tintCache.delete(tintCache.keys().next().value);
  tintCache.set(key, cv);
  return cv;
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// the pedal bikes, seen from above: wheel length, tyre width, a smaller front wheel, where the saddle and bars are, the
// cargo bike's box
const PEDAL_LOOK = {
  bicycle: { wheel: 12, tyre: 4, seat: 11, bars: 29 }, cruiser: { wheel: 13, tyre: 5, seat: 12, bars: 29 }, mtb: { wheel: 13, tyre: 5, seat: 12, bars: 30 },
  roadbike: { wheel: 14, tyre: 3, seat: 12, bars: 31 }, bmx: { wheel: 10, tyre: 4, seat: 9, bars: 22 }, cargobike: { wheel: 12, front: 9, tyre: 4, seat: 10, bars: 24, box: [28, 48] },
};
function procVehicle(def, paint) {
  const S = 2, L = def.L, W = def.W;
  const cv = document.createElement('canvas');
  cv.width = (L + 4) * S; cv.height = (W + 4) * S;
  const g = cv.getContext('2d');
  g.scale(S, S); g.translate(2, 2);
  g.fillStyle = '#111'; rr(g, 0, 0, L, W, 6); g.fill();
  if (def.id === 'bus') paint = '#f2c21b';
  if (def.id === 'armored') paint = '#d8dbe0';
  if (def.pedal) { // two wheels (fat, knobby or thin), the frame between, handlebars across the front; the cargo bike's box
    g.clearRect(-2, -2, L + 4, W + 4);
    const cy = W / 2, P = PEDAL_LOOK[def.id] || PEDAL_LOOK.bicycle, t = P.tyre, d = P.wheel;
    g.fillStyle = '#16171b'; rr(g, 0, cy - t / 2, d, t, t / 2); g.fill(); rr(g, L - (P.front || d), cy - t / 2, P.front || d, t, t / 2); g.fill(); // tyres
    g.fillStyle = '#8a8f99'; g.fillRect(2, cy - 0.5, d - 4, 1); g.fillRect(L - (P.front || d) + 2, cy - 0.5, (P.front || d) - 4, 1);       // rims
    g.fillStyle = paint; g.fillRect(d - 4, cy - 1.5, L - d - (P.front || d) + 6, 3);                                                   // frame
    if (P.box) { g.fillStyle = '#8a6a3a'; rr(g, P.box[0], 1, P.box[1] - P.box[0], W - 2, 2); g.fill(); g.fillStyle = '#5a4428'; g.fillRect(P.box[0] + 2, 3, P.box[1] - P.box[0] - 4, W - 6); }
    g.fillStyle = '#1b1d22'; rr(g, P.seat, cy - 2.5, 7, 5, 2); g.fill();                                                               // saddle
    g.fillStyle = '#2a2d35'; g.fillRect(P.bars, 1, 2, W - 2);                                                                          // bars
    g.fillStyle = '#c9c5bb'; g.fillRect(P.bars, 0, 2, 2); g.fillRect(P.bars, W - 2, 2, 2);                                             // grips
    return cv;
  }
  if (def.id === 'jetski') { // stubby hull, seat, handlebars
    g.clearRect(-2, -2, L + 4, W + 4);
    g.fillStyle = paint; g.beginPath(); g.moveTo(0, 3); g.lineTo(L - 12, 1); g.quadraticCurveTo(L, W / 2, L - 12, W - 1); g.lineTo(0, W - 3); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(4, W / 2 - 1, L - 18, 2);
    g.fillStyle = '#1b1d22'; rr(g, 8, W / 2 - 4, 16, 8, 3); g.fill();
    g.fillStyle = '#333'; g.fillRect(L - 18, 3, 2, W - 6);
    return cv;
  }
  if (def.id === 'flatbed') {
    g.fillStyle = paint; rr(g, L - 38, 2, 36, W - 4, 5); g.fill();
    g.fillStyle = '#1b2333'; g.fillRect(L - 14, 6, 8, W - 12);
    g.fillStyle = '#6b4a2a'; g.fillRect(4, 3, L - 46, W - 6);
    g.strokeStyle = '#3a2814'; g.lineWidth = 1; for (let k = 8; k < L - 46; k += 8) { g.beginPath(); g.moveTo(4 + k, 3); g.lineTo(4 + k, W - 3); g.stroke(); }
    g.fillStyle = '#555'; g.fillRect(4, 2, L - 46, 2); g.fillRect(4, W - 4, L - 46, 2); g.fillRect(L - 44, 2, 3, W - 4);
    g.fillStyle = '#ffe9a0'; g.fillRect(L - 3, 5, 2, 6); g.fillRect(L - 3, W - 11, 2, 6);
    g.fillStyle = '#c8262b'; g.fillRect(1, 4, 2, 6); g.fillRect(1, W - 10, 2, 6);
    return cv;
  }
  if (def.id === 'towtruck') {   // the cab at the front, the boom down the middle of the bed, the wheel lift and its hook at the back (tow.js)
    g.fillStyle = paint; rr(g, L - 40, 2, 38, W - 4, 5); g.fill();
    g.fillStyle = '#1b2333'; g.fillRect(L - 16, 6, 8, W - 12);
    g.fillStyle = '#e8b923'; g.fillRect(L - 32, 5, 4, W - 10);                                            // the amber light bar
    g.fillStyle = '#2f4a8a'; g.fillRect(6, 4, L - 48, W - 8);
    g.fillStyle = '#e8b923'; for (let k = 6; k < L - 48; k += 10) { g.fillRect(k, 4, 5, 2); g.fillRect(k, W - 6, 5, 2); }
    g.fillStyle = '#9aa0a8'; g.fillRect(8, W / 2 - 3, L - 54, 6);                                          // the boom
    g.fillStyle = '#2a2d35'; g.fillRect(0, 7, 7, W - 14);                                                  // the wheel lift
    g.fillStyle = '#c9c5bb'; g.fillRect(2, W / 2 - 2, 4, 4);                                               // the hook
    g.fillStyle = '#ffe9a0'; g.fillRect(L - 3, 5, 2, 6); g.fillRect(L - 3, W - 11, 2, 6);
    return cv;
  }
  g.fillStyle = paint; rr(g, 1.5, 1.5, L - 3, W - 3, 6); g.fill();
  g.fillStyle = shade(paint.startsWith('#') ? paint : '#888888', -30); g.fillRect(3, W / 2 - 1, L - 6, 2);
  if (def.id === 'bus') {
    g.fillStyle = '#1b2333'; for (let k = 10; k < L - 30; k += 18) { g.fillRect(k, 3, 12, 4); g.fillRect(k, W - 7, 12, 4); }
    g.fillRect(L - 14, 5, 8, W - 10);
    g.fillStyle = '#d2d2d2'; g.fillRect(20, 12, L - 60, W - 24);
  } else if (def.id === 'armored') {
    g.fillStyle = '#1b2333'; g.fillRect(L - 30, 6, 10, W - 12);
    g.fillStyle = '#2f6a3a'; g.fillRect(10, 8, L - 50, W - 16);
    g.fillStyle = '#fff'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('IRONVAULT', (L - 40) / 2 + 5, W / 2);
  } else {
    g.fillStyle = '#1b2333'; rr(g, L * 0.58, 5, L * 0.14, W - 10, 3); g.fill();
    g.fillStyle = shade(paint.startsWith('#') ? paint : '#888888', 15); rr(g, L * 0.3, 6, L * 0.28, W - 12, 3); g.fill();
    g.fillStyle = '#1b2333'; rr(g, L * 0.2, 6, L * 0.1, W - 12, 2); g.fill();
  }
  g.fillStyle = '#ffe9a0'; g.fillRect(L - 3, 5, 2, 6); g.fillRect(L - 3, W - 11, 2, 6);
  g.fillStyle = '#c8262b'; g.fillRect(1, 4, 2, 6); g.fillRect(1, W - 10, 2, 6);
  return cv;
}

// 2.5D lift: the vehicle's own outline in a darkened shade of its paint, stacked a pixel at a
// time under the top view, reads as the body's side walls (any angle, no pre-drawn views).
const sideCache = new Map();
export function vehicleSide(desc, def, wreck) {
  const artId = def.art || (atlas.variants[def.id] ? def.id : def.sprite || def.id);   // (def.sprite: a stand-in, e.g. the MC1 motorcycles drawn as the sport bike)
  const n = atlas.variants[artId] || 0;
  const key = `${n ? `${artId}_${(desc.vr || 0) % n}` : `${def.id}|${desc.p}`}|${wreck ? 1 : 0}|${atlas.ready ? 1 : 0}`;
  let cv = sideCache.get(key);
  if (cv) return cv;
  const pad = 4;
  cv = document.createElement('canvas');
  cv.width = Math.ceil(def.L + pad * 2) * 2; cv.height = Math.ceil(def.W + pad * 2) * 2;
  const g = cv.getContext('2d');
  g.scale(2, 2); g.translate(def.L / 2 + pad, def.W / 2 + pad);
  if (wreck) drawVehicleWreck(g, desc, def); else drawVehicle(g, desc, def, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = wreck ? 'rgba(6,5,4,.7)' : 'rgba(12,14,22,.52)';
  g.fillRect(0, 0, cv.width, cv.height);
  // a darker rocker line where the body meets the wheels
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(0, cv.height * 0.5 - 1, cv.width, 2);
  if (sideCache.size > 400) sideCache.delete(sideCache.keys().next().value);
  sideCache.set(key, cv);
  return cv;
}
export const VEH_PAD = 4;

// Soft drop shadow in the exact silhouette of the vehicle art (no rectangles).
const shadowCache = new Map();
// Burnt-out wreck: the car's own sprite charred dark (pixels only - no box around it).
const wreckCache = new Map();
export function drawVehicleWreck(g, desc, def) {
  const artId = def.art || (atlas.variants[def.id] ? def.id : def.sprite || def.id);   // (def.sprite: a stand-in, e.g. the MC1 motorcycles drawn as the sport bike)
  const n = atlas.variants[artId] || 0;
  const name = n ? `veh_${def.id}_${(desc.vr || 0) % n}` : `${def.id}|${desc.p}`;
  let wc = wreckCache.get(name);
  if (!wc) {
    const pad = 4;
    wc = document.createElement('canvas');
    wc.width = Math.ceil(def.L + pad * 2); wc.height = Math.ceil(def.W + pad * 2);
    const wg = wc.getContext('2d');
    wg.translate(wc.width / 2, wc.height / 2);
    drawVehicle(wg, desc, def, 0);
    wg.setTransform(1, 0, 0, 1, 0, 0);
    wg.globalCompositeOperation = 'source-atop';
    wg.fillStyle = 'rgba(14,11,8,0.8)';
    wg.fillRect(0, 0, wc.width, wc.height);
    // a few soot streaks and a burnt-through roof
    wg.fillStyle = 'rgba(0,0,0,0.35)';
    wg.beginPath(); wg.ellipse(wc.width * 0.5, wc.height * 0.5, wc.width * 0.22, wc.height * 0.3, 0, 0, 6.28); wg.fill();
    wreckCache.set(name, wc);
  }
  g.drawImage(wc, -wc.width / 2, -wc.height / 2);
}
export function drawVehicleShadow(g, desc, def, placed = false) {
  const artId = def.art || (atlas.variants[def.id] ? def.id : def.sprite || def.id);   // (def.sprite: a stand-in, e.g. the MC1 motorcycles drawn as the sport bike)
  const n = atlas.variants[artId] || 0;
  const name = n ? `veh_${artId}_${(desc.vr || 0) % n}` : null;
  const fr = name ? frame(name) : null;
  const L = def.L, W = def.W;
  if (!fr) { g.fillStyle = 'rgba(0,0,0,.3)'; rr(g, -L / 2 + 3, -W / 2 + 3, L, W, 8); g.fill(); return; }
  let sc = shadowCache.get(name);
  if (!sc) {
    sc = document.createElement('canvas');
    sc.width = fr.w; sc.height = fr.h;
    const sg = sc.getContext('2d');
    sg.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = 'rgba(8,10,24,0.45)';
    sg.fillRect(0, 0, fr.w, fr.h);
    shadowCache.set(name, sc);
  }
  if (placed) g.drawImage(sc, -L / 2 - 1, -W / 2 - 1, L + 2, W + 2); // (the caller has offset it from the car)
  else g.drawImage(sc, -L / 2 + 4, -W / 2 + 5, L, W);
}

// ---------------------------------------------------------------------------
// Crates & bags
const CRATE_COL = [null, ['#9a6a3a', '#5a3a1a'], ['#4a6a3a', '#2a3a1e'], ['#6a6e76', '#3a3d44'], ['#1e1e24', '#e8b923']];
export function drawCrate(g, tier, label, t) {
  const fr = frame(label === 'Produce Box' ? 'produce' : `crate${tier}`);
  const s = 26;
  if (fr) g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, -s / 2, -s / 2 * (fr.h / fr.w), s, s * (fr.h / fr.w));
  else {
    const [c1, c2] = CRATE_COL[tier];
    g.fillStyle = c1; g.fillRect(-12, -10, 24, 20);
    g.strokeStyle = c2; g.lineWidth = 2; g.strokeRect(-11, -9, 22, 18);
  }
  if (tier === 4) { // GDD: carbon-gold case emits a pixel shimmer
    const ph = (t * 2) % 1;
    g.fillStyle = `rgba(255,240,150,${0.8 - ph * 0.8})`;
    g.fillRect(-12 + ph * 24, -12, 3, 3);
    g.fillRect(10 - ph * 20, 9, 2, 2);
  }
  if (label === 'Produce Box' && !fr) { g.fillStyle = '#2f9a3a'; g.fillRect(-6, -6, 4, 4); g.fillStyle = '#c8262b'; g.fillRect(2, -2, 4, 4); }
}

// A dropped backpack (tiers 5-9, Common to Legendary): an upright pack in its rarity's colour, the rare ones ringed
const PACK_COL = [null, ['#a89a74', '#5a4a34'], ['#3e6a3a', '#86e070'], ['#2c3038', '#4aa0ff'], ['#2a2034', '#c27aff'], ['#1e1a14', '#ffc848']];
function drawPack(g, r, t) {
  const [c1, c2] = PACK_COL[r];
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-8, -6, 18, 16);
  g.fillStyle = c1; g.beginPath(); g.moveTo(-8, 8); g.lineTo(-8, -4); g.quadraticCurveTo(0, -12, 8, -4); g.lineTo(8, 8); g.closePath(); g.fill();
  g.strokeStyle = c2; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = c2; g.fillRect(-5, 1, 10, 6); g.fillStyle = c1; g.fillRect(-4, 2, 8, 4);
  if (r >= 3) { g.globalAlpha = 0.3 + 0.25 * Math.sin(t * (r === 5 ? 4 : 3)); g.strokeStyle = c2; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 13 + r, 0, 6.28); g.stroke(); g.globalAlpha = 1; }
}
export function drawBag(g, tier, t) {
  if (tier === 0) { drawCash(g, t); return; }
  if (tier > 4) { drawPack(g, Math.min(5, tier - 4), t); return; }
  const fr = frame(`bag${tier}`);
  const s = 24;
  if (fr) g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, -s / 2, -s / 2 * (fr.h / fr.w), s, s * (fr.h / fr.w));
  else { g.fillStyle = ['', '#8a6a3a', '#1d3a8a', '#6a6e76', '#e8b923'][tier]; g.fillRect(-11, -8, 22, 16); }
  if (tier >= 3) { g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6); g.strokeStyle = tier === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 16, 0, 6.28); g.stroke(); g.globalAlpha = 1; }
}

// Dropped cash: a few green bills with a gentle shine (picked up by walking over it).
function drawCash(g, t) {
  const bills = [[-6, -3, 0.3], [3, -1, -0.4], [-1, 4, 0.9]];
  for (const [x, y, a] of bills) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-6, -2, 13, 7);
    g.fillStyle = '#3f9a4a'; g.fillRect(-7, -4, 13, 7);
    g.fillStyle = '#7fd08a'; g.fillRect(-6, -3, 11, 5);
    g.fillStyle = '#2f7a3a'; g.fillRect(-2, -2, 3, 3);
    g.restore();
  }
  g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 5); g.fillStyle = '#fff'; g.fillRect(-1, -6, 2, 2); g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Pedestrians: 24x24 top-down pixel-art characters (render/peds.js), cached per
// appearance + pose + frame.
const pedCache = new Map();
const PSIZE = 48;    // world px box (24 art px x 2)
const PS = 4;        // cache canvas px per art px (2 per world px)

export function pedSprite(app, pose, frameN, weapon) {
  const key = `${appKey(app)}|${pose}|${frameN}|${weapon}`;
  let cv = pedCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = CHAR_GRID * PS;
  paintCharacter(cv, PS, app, pose, frameN, weapon);
  capSet(pedCache, key, cv, LOW_MEM ? 200 : 3000);
  return cv;
}
export const PED_BOX = PSIZE;

function appKey(a) { return a ? `${a.s}${a.h}${a.hc}${a.t}${a.tc}${a.tc2}${a.l}${a.sh}${a.ht}${a.htc}${a.b}${a.bandana ? 1 : 0}` : 'x'; }
