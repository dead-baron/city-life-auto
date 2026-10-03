// Sprite layer: vehicle sprites from the concept-art atlas (procedural fallback for models
// not in the atlas), runtime-composited layered pedestrians cached per outfit/pose/frame,
// crates and loot bags.
import { VEHICLE_BY_INDEX, PAINTS } from '../../shared/vehicles.js';
import { shade } from './tiles.js';

const SKINS = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a'];
export const atlas = { ready: false, imgs: [], frames: {}, variants: {}, scale: 2 };

export async function loadAtlas(base = 'assets/') {
  try {
    const meta = await (await fetch(base + 'sprites.json')).json();
    atlas.frames = meta.frames; atlas.variants = meta.variants; atlas.scale = meta.scale;
    atlas.imgs = await Promise.all(meta.atlases.map((f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = base + f; })));
    atlas.ready = true;
  } catch (e) { console.warn('atlas unavailable, using procedural sprites', e); }
}

function frame(name) { return atlas.ready ? atlas.frames[name] : null; }

// ---------------------------------------------------------------------------
// Vehicles (drawn centered, facing +x, in world units)
const procCache = new Map();
export function drawVehicle(g, desc, def, f) {
  const n = atlas.variants[def.id] || 0;
  const fr = n ? frame(`veh_${def.id}_${(desc.vr || 0) % n}`) : null;
  const L = def.L, W = def.W;
  if (fr) {
    g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, -L / 2, -W / 2, L, W);
  } else {
    const key = `${def.id}|${desc.p}`;
    let cv = procCache.get(key);
    if (!cv) { cv = procVehicle(def, PAINTS[desc.p % PAINTS.length] || '#888'); procCache.set(key, cv); }
    g.drawImage(cv, -L / 2 - 2, -W / 2 - 2, L + 4, W + 4);
  }
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function procVehicle(def, paint) {
  const S = 2, L = def.L, W = def.W;
  const cv = document.createElement('canvas');
  cv.width = (L + 4) * S; cv.height = (W + 4) * S;
  const g = cv.getContext('2d');
  g.scale(S, S); g.translate(2, 2);
  g.fillStyle = '#111'; rr(g, 0, 0, L, W, 6); g.fill();
  if (def.id === 'bus') paint = '#f2c21b';
  if (def.id === 'armored') paint = '#d8dbe0';
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

export function drawBag(g, tier, t) {
  const fr = frame(`bag${tier}`);
  const s = 24;
  if (fr) g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, -s / 2, -s / 2 * (fr.h / fr.w), s, s * (fr.h / fr.w));
  else { g.fillStyle = ['', '#8a6a3a', '#1d3a8a', '#6a6e76', '#e8b923'][tier]; g.fillRect(-11, -8, 22, 16); }
  if (tier >= 3) { g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6); g.strokeStyle = tier === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 16, 0, 6.28); g.stroke(); g.globalAlpha = 1; }
}

// ---------------------------------------------------------------------------
// Pedestrians: layered top-down figure composited at runtime and cached.
const pedCache = new Map();
const PS = 2;        // cache resolution multiplier
const PSIZE = 48;    // world px box

export function pedSprite(app, pose, frameN, weapon) {
  const key = `${appKey(app)}|${pose}|${frameN}|${weapon}`;
  let cv = pedCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = PSIZE * PS;
  const g = cv.getContext('2d');
  g.scale(PS, PS);
  g.translate(PSIZE / 2, PSIZE / 2);
  drawPedFigure(g, app || {}, pose, frameN, weapon);
  if (pedCache.size > 900) pedCache.delete(pedCache.keys().next().value);
  pedCache.set(key, cv);
  return cv;
}
export const PED_BOX = PSIZE;

function appKey(a) { return a ? `${a.s}${a.h}${a.hc}${a.t}${a.tc}${a.tc2}${a.l}${a.sh}${a.ht}${a.htc}${a.b}${a.bandana ? 1 : 0}` : 'x'; }

const WEAPON_DRAW = {
  1: (g) => { g.fillStyle = '#b8864a'; g.fillRect(6, 5, 16, 3); },             // bat
  2: (g) => { g.fillStyle = '#ccc'; g.fillRect(8, 5, 8, 2); },                 // knife
  3: (g) => { g.fillStyle = '#c8262b'; g.fillRect(6, 5, 14, 2); },            // crowbar
  4: (g) => { g.fillStyle = '#6b4a2a'; g.fillRect(6, 5, 16, 2); g.fillStyle = '#555'; g.fillRect(19, 2, 5, 8); }, // sledge
  5: (g) => { g.fillStyle = '#111'; g.fillRect(6, 5, 14, 3); },                // baton
  6: (g) => { g.fillStyle = '#f2c21b'; g.fillRect(9, 3, 9, 4); },             // taser
  7: (g) => { g.fillStyle = '#222'; g.fillRect(9, -1, 10, 3); },              // pistol
  8: (g) => { g.fillStyle = '#333'; g.fillRect(9, -1, 12, 3); },
  9: (g) => { g.fillStyle = '#5a3a1a'; g.fillRect(4, -1, 8, 3); g.fillStyle = '#333'; g.fillRect(12, -1, 12, 3); },
  10: (g) => { g.fillStyle = '#2a2a2a'; g.fillRect(2, -1, 22, 3); },
  11: (g) => { g.fillStyle = '#222'; g.fillRect(8, -2, 12, 4); },
  12: (g) => { g.fillStyle = '#4a5a2a'; g.fillRect(-6, -3, 32, 6); },
  13: (g) => { g.strokeStyle = '#333'; g.lineWidth = 1; g.beginPath(); g.moveTo(6, 4); g.lineTo(26, -6); g.stroke(); },
};

function drawPedFigure(g, a, pose, fr, weapon) {
  const skin = SKINS[a.s ?? 1] || SKINS[1];
  const top = a.tc || '#888', top2 = a.tc2 || '#ddd', legs = a.l || '#333', shoes = a.sh || '#222', hair = a.hc || '#222';
  if (pose === 'down' || pose === 'dead') {
    // lying flat, head toward +x
    g.rotate(fr === 1 ? 0.3 : -0.2);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(2, 2, 19, 9, 0, 0, 6.28); g.fill();
    g.fillStyle = legs; g.fillRect(-18, -6, 14, 5); g.fillRect(-18, 1, 14, 5);
    g.fillStyle = shoes; g.fillRect(-21, -6, 4, 5); g.fillRect(-21, 1, 4, 5);
    g.fillStyle = top; g.beginPath(); g.ellipse(2, 0, 10, 9, 0, 0, 6.28); g.fill();
    g.fillStyle = skin; g.fillRect(-2, -14, 10, 4); g.fillRect(-2, 10, 10, 4);
    g.beginPath(); g.arc(15, 0, 6, 0, 6.28); g.fill();
    g.fillStyle = hair; g.beginPath(); g.arc(16, 0, 5.5, -1.2, 1.2); g.fill();
    if (a.t === 5) { g.fillStyle = top; g.beginPath(); g.ellipse(-8, 0, 9, 8, 0, 0, 6.28); g.fill(); }
    return;
  }
  if (pose === 'roll') {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(2, 2, 11, 0, 6.28); g.fill();
    g.fillStyle = top; g.beginPath(); g.arc(0, 0, 10, 0, 6.28); g.fill();
    g.fillStyle = legs; g.beginPath(); g.arc(-3 + fr * 2, 3, 5, 0, 6.28); g.fill();
    g.fillStyle = hair; g.beginPath(); g.arc(4, -3, 5, 0, 6.28); g.fill();
    return;
  }
  const walk = pose === 'walk' || pose === 'run' || pose === 'carry';
  const stride = walk ? [0, 1, 0, -1][fr % 4] * (pose === 'run' ? 7 : 5) : 0;
  // shadow
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(3, 3, 10, 12, 0, 0, 6.28); g.fill();
  // legs / dress
  if (a.t === 5) {
    g.fillStyle = shoes; g.fillRect(-5 + stride * 0.6, -6, 5, 3); g.fillRect(-5 - stride * 0.6, 3, 5, 3);
    g.fillStyle = top; g.beginPath(); g.ellipse(-2, 0, 8, 9, 0, 0, 6.28); g.fill();
  } else {
    g.fillStyle = legs; g.fillRect(-3 + stride, -6, 8, 5); g.fillRect(-3 - stride, 1, 8, 5);
    g.fillStyle = shoes; g.fillRect(4 + stride, -6, 3, 5); g.fillRect(4 - stride, 1, 3, 5);
  }
  // arms
  const armSwing = walk && pose !== 'carry' ? -stride * 0.8 : 0;
  g.fillStyle = a.t === 0 || a.t === 5 ? skin : top;
  if (pose === 'aim' || pose === 'attack' || pose === 'carry' || pose === 'fish') {
    const reach = pose === 'attack' ? 14 : pose === 'aim' ? 12 : 9;
    g.fillRect(0, -9, reach, 4); g.fillRect(0, 5, pose === 'aim' ? reach - 2 : reach, 4);
    g.fillStyle = skin; g.beginPath(); g.arc(reach + 1, -7, 2.5, 0, 6.28); g.arc(reach + 1, 7, 2.5, 0, 6.28); g.fill();
    if (pose === 'aim' && weapon >= 7) {
      g.fillStyle = a.t === 0 || a.t === 5 ? skin : top;
      g.fillRect(0, -3, 12, 4); g.fillRect(0, 0, 12, 4);
    }
  } else {
    g.fillRect(-2 + armSwing, -13, 8, 4); g.fillRect(-2 - armSwing, 9, 8, 4);
    g.fillStyle = skin; g.beginPath(); g.arc(6 + armSwing, -11, 2.4, 0, 6.28); g.arc(6 - armSwing, 11, 2.4, 0, 6.28); g.fill();
  }
  // torso (shoulders) by top type
  const wide = a.t === 7 ? 14 : a.t === 3 ? 12.5 : 11.5;
  g.fillStyle = top; g.beginPath(); g.ellipse(0, 0, 6.5, wide, 0, 0, 6.28); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke();
  if (a.t === 1) { g.fillStyle = '#eee'; g.fillRect(2, -2, 4, 4); g.fillStyle = top2; g.fillRect(3, -1, 3, 2); }
  if (a.t === 2) { g.fillStyle = shade(top.length === 7 ? top : '#777777', -25); g.beginPath(); g.ellipse(-5, 0, 3.5, 6, 0, 0, 6.28); g.fill(); }
  if (a.t === 3) { g.fillStyle = top2; g.fillRect(-4, -wide + 2, 2, wide * 2 - 4); g.fillRect(1, -wide + 2, 2, wide * 2 - 4); }
  if (a.t === 6) { g.fillStyle = top2; g.fillRect(1, -7, 3, 3); g.fillStyle = shade(top.length === 7 ? top : '#777777', 30); g.fillRect(-1, -wide + 1, 2, wide * 2 - 2); }
  if (a.t === 7) { g.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 6; k++) g.fillRect(-5 + (k % 3) * 3, -10 + k * 3.5, 2, 2); g.fillStyle = top2; g.fillRect(3, -3, 2, 6); }
  if (a.b === 1) { g.fillStyle = '#3a2414'; g.fillRect(-2, 12, 8, 5); }
  if (a.b === 2) { g.fillStyle = '#c8262b'; g.fillRect(-4, -15, 7, 4); }
  if (a.b === 3) { g.fillStyle = '#555'; g.fillRect(-3, 12, 6, 4); }
  // head
  g.fillStyle = skin; g.beginPath(); g.arc(1.5, 0, 6.3, 0, 6.28); g.fill();
  if (a.bandana) { g.fillStyle = '#c8262b'; g.beginPath(); g.arc(1.5, 0, 6.3, -1.1, 1.1); g.fill(); }
  // hair / hats
  const ht = a.ht || 0;
  if (ht === 0) {
    g.fillStyle = hair;
    const hs = a.h ?? 0;
    if (hs === 0) { g.beginPath(); g.arc(0, 0, 6, Math.PI * 0.45, Math.PI * 1.55); g.fill(); g.beginPath(); g.arc(0.5, 0, 5, 0, 6.28); g.fill(); }
    else if (hs === 1) { g.beginPath(); g.arc(-0.5, 0, 6.2, 0, 6.28); g.fill(); }
    else if (hs === 2) { g.beginPath(); g.ellipse(-3, 0, 7, 7, 0, 0, 6.28); g.fill(); }
    else if (hs === 3) { g.beginPath(); g.arc(0, 0, 5.6, Math.PI * 0.5, Math.PI * 1.5); g.fill(); }
    else if (hs === 4) { g.beginPath(); g.ellipse(-4, 0, 6, 8, 0, 0, 6.28); g.fill(); g.fillStyle = shade(hair.length === 7 ? hair : '#333333', 25); for (let k = -5; k <= 5; k += 3) g.fillRect(-9, k, 6, 1); }
    else { g.beginPath(); g.arc(0, 0, 5, 0, 6.28); g.fill(); g.fillRect(-10, -2, 6, 4); }
  } else {
    const hc = a.htc || '#222';
    g.fillStyle = hc;
    if (ht === 1) { g.beginPath(); g.arc(0.5, 0, 6.4, 0, 6.28); g.fill(); g.fillRect(4, -4.5, 6, 9); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-2, -1, 3, 2); }
    else if (ht === 2) { g.beginPath(); g.arc(0.5, 0, 7.2, 0, 6.28); g.fill(); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(-6, -0.5, 13, 1); }
    else if (ht === 3) { g.beginPath(); g.arc(0.5, 0, 9, 0, 6.28); g.fill(); g.fillStyle = shade(hc.length === 7 ? hc : '#555555', -25); g.beginPath(); g.arc(0.5, 0, 5.5, 0, 6.28); g.fill(); }
    else if (ht === 4) { g.beginPath(); g.arc(0, 0, 6.6, 0, 6.28); g.fill(); g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = -4; k <= 4; k += 2) g.fillRect(-6, k, 12, 1); }
    else if (ht === 5) { g.beginPath(); g.arc(0.5, 0, 7.4, 0, 6.28); g.fill(); g.fillStyle = '#4a6a8a'; g.fillRect(4, -4, 3, 8); }
  }
  if (pose === 'carry') return;
  const wd = WEAPON_DRAW[weapon];
  if (wd && (pose === 'aim' || pose === 'attack' || weapon <= 6 || pose === 'fish')) {
    g.save(); if (pose !== 'aim' && pose !== 'attack' && pose !== 'fish') g.translate(-2, 6); wd(g); g.restore();
  }
}
