// The character creator (concept sheets CC1, CC7-CC10): loaded the first time it opens (main.js openCreator).
// Two screens in one overlay (#creator, built here):
//   'start' - a new player's first join (CC9): twelve starting looks and Random, then "Play as they are" or
//             "Make it yours";
//   'edit'  - the creator (CC1 / CC8 / CC7): Body, Face, Hair (and facial hair), Outfit (style chips, slot tabs, the
//             piece grid, main and trim colours, patterns, complete looks for the style), Extras (makeup, tattoos,
//             piercings, scars) and Saved looks (CC10: save under a name, apply, rename, delete); Randomise, Undo,
//             Save look, Done. A large preview turns through the eight directions with the idle animation.
// Mouse, touch and the pad: the d-pad / stick moves the focus to the nearest control that way, A presses it, left /
// right moves a slider, B is Done. The server checks every look (server/systems/looks.js); free for now.
import * as LK from '../shared/look.js';
import { person } from './art2/people.js';

let C = null;            // main.js's hooks { send, openOverlay, closeOverlay, topOverlay, sfx, toast }
let root = null;
let look = null, hist = [], mode = 'edit', tab = 'body';
let dir = 0, fr = 0, animT = 0, raf = 0;
let state = { cur: null, picked: true, saved: [] };
let outStyle = '', outSlot = 'top', outBase = null, ctarget = 'c', hairLen = 'all';
let startPick = 0, startRandomSeed = 1, renaming = -1, focusEl = null, seedN = 1;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = (L = look) => LK.encodeLook(L);
const clone = (L) => LK.decodeLook(LK.encodeLook(L));
const newSeed = () => ((Date.now() & 0xfffff) * 4099 + (seedN++) * 7919) >>> 0;

export function init(hooks) {
  C = hooks;
  root = document.createElement('div');
  root.id = 'creator';
  root.className = 'hidden overlay';
  root.innerHTML = `<div class="panel cc-panel">
    <div class="mhead"><h2 class="cc-title">CHARACTER</h2><button class="x" data-act="done" aria-label="Done">✕</button></div>
    <div class="cc-body">
      <div class="cc-left"><canvas class="cc-prev" width="168" height="216"></canvas>
        <div class="cc-turn"><button data-act="turn" data-v="1" aria-label="Turn left">⟲</button><span class="cc-pname"></span><button data-act="turn" data-v="-1" aria-label="Turn right">⟳</button></div></div>
      <div class="cc-right"><div class="cc-tabs"></div><div class="cc-page"></div></div>
    </div>
    <div class="cc-foot"></div>
  </div>`;
  const host = document.getElementById('pause')?.parentNode || document.body;
  host.appendChild(root);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    act(b.dataset.act, b.dataset.v, b);
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.act === 'height') { setL((L) => { L.body.height = Number(e.target.value); }, false); } });
  root.addEventListener('change', (e) => { if (e.target.dataset.act === 'height') commitHeight(); });
  root.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' && e.target.type === 'text' && e.key === 'Enter') { e.preventDefault(); act(e.target.dataset.enter || 'sv-save'); } });
}

// ---- opening and closing -------------------------------------------------------------------------------------------
export function open(m = 'edit', st = null) {
  if (st) state = st;
  mode = m;
  const cur = state.cur && LK.decodeLook(state.cur);
  look = cur || LK.starterFor(0);
  hist = []; renaming = -1;
  if (mode === 'start') { startPick = 0; look = clone(LK.STARTERS[0].look); }
  tab = 'body'; outBase = null;
  if (C.topOverlay() !== 'creator') C.openOverlay('creator');
  render();
  loop();
}
export function onState(st) {
  state = st;
  if (C.topOverlay() === 'creator' && mode === 'edit' && tab === 'saved') renderPage();
}
function close(apply) {
  if (apply && look) C.send({ t: 'look', a: 'set', c: code() });
  cancelAnimationFrame(raf); raf = 0;
  if (C.topOverlay() === 'creator') C.closeOverlay('creator');
}
export const isOpen = () => !!root && !root.classList.contains('hidden');

// ---- the look being edited ----------------------------------------------------------------------------------------------
function setL(fn, record = true) {
  const before = code();
  const L = clone(look);
  fn(L);
  const v = LK.validLook(L);
  if (!v) return;
  if (code(v) === before) return;
  if (record) { hist.push(before); if (hist.length > 60) hist.shift(); }
  look = v;
  if (mode === 'start') { mode = 'edit'; }
  drawPreview();
  renderPage();
}
let heightFrom = null;
function commitHeight() { if (heightFrom !== null && heightFrom !== code()) { hist.push(heightFrom); } heightFrom = null; }

// ---- figures: the big preview and the thumbnails --------------------------------------------------------------------------
const ART = new Map();      // code -> art app (a few dozen at most)
function art(L) {
  const k = code(L);
  let A = ART.get(k);
  if (!A) { A = LK.lookArt(L, { code: k }); ART.set(k, A); if (ART.size > 200) ART.delete(ART.keys().next().value); }
  return A;
}
function blit(cv, G, scale, crop) {
  const c2 = cv.getContext('2d');
  c2.clearRect(0, 0, cv.width, cv.height);
  if (!G || !G.w) return;
  const tmp = document.createElement('canvas');
  tmp.width = G.w; tmp.height = G.h;
  const id = tmp.getContext('2d').createImageData(G.w, G.h);
  id.data.set(G.col);
  tmp.getContext('2d').putImageData(id, 0, 0);
  c2.imageSmoothingEnabled = false;
  // a head crop: the top 22 rows round the anchor's column; the whole figure stands on a shadow
  let sx = 0, sw = G.w, sh = G.h;
  if (crop === 'head') { sw = Math.min(G.w, 22); sx = Math.max(0, Math.min(G.w - sw, Math.round(G.ax - sw / 2))); sh = Math.min(G.h, 22); }
  const avail = crop === 'head' ? cv.height : cv.height - 6;
  const s = Math.max(1, Math.min(scale, Math.floor(Math.min(cv.width / sw, avail / sh))));
  const x = crop === 'head' ? Math.round((cv.width - sw * s) / 2) : Math.round(cv.width / 2 - (G.ax - sx) * s);
  const y = crop === 'head' ? Math.round((cv.height - sh * s) / 2) : Math.round(cv.height - 6 - G.ay * s);
  if (crop !== 'head') { c2.fillStyle = 'rgba(0,0,0,.35)'; c2.beginPath(); c2.ellipse(cv.width / 2, cv.height - 6, 7 * s, 2.2 * s, 0, 0, 6.283); c2.fill(); }
  c2.drawImage(tmp, sx, 0, sw, sh, x, y, sw * s, sh * s);
}
function drawPreview() {
  if (!root) return;
  const cv = root.querySelector('.cc-prev');
  let G = null;
  try { G = person(art(look), dir, 'idle', fr, { tight: true }); } catch (e) { console.warn('[creator] preview', e); }
  blit(cv, G, 4);
  const pn = root.querySelector('.cc-pname');
  if (pn) pn.textContent = mode === 'start' ? (startPick < LK.STARTERS.length ? LK.STARTERS[startPick].name : 'Random') : ['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left'][dir];
}
function loop() {
  cancelAnimationFrame(raf);
  const step = (t) => {
    if (!isOpen()) { raf = 0; return; }
    if (t - animT > 520) { animT = t; fr = (fr + 1) & 1; drawPreview(); }
    pumpThumbs();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
// thumbnails: drawn a few a frame, cached (bounded)
const THUMB = new Map(), want = [];
function thumbFor(L, crop) {
  const k = code(L) + crop;
  let cv = THUMB.get(k);
  if (cv) { THUMB.delete(k); THUMB.set(k, cv); return cv; }
  cv = document.createElement('canvas');
  cv.width = crop === 'head' ? 56 : 64; cv.height = crop === 'head' ? 56 : 104;
  try { blit(cv, person(art(L), 0, 'idle', 0, { tight: true }), crop === 'head' ? 3 : 2, crop); } catch (e) { console.warn('[creator] thumb', e); }
  THUMB.set(k, cv);
  if (THUMB.size > 260) THUMB.delete(THUMB.keys().next().value);
  return cv;
}
function pumpThumbs() {
  const t0 = performance.now();
  while (want.length && performance.now() - t0 < 8) {
    const [el, L, crop] = want.shift();
    if (!el.isConnected) continue;
    const cv = thumbFor(L, crop), c2 = el.getContext('2d');
    el.width = cv.width; el.height = cv.height;
    c2.drawImage(cv, 0, 0);
  }
}
const TH = [];   // looks for the thumbnails on this page: <canvas data-th="i">
const th = (L, crop = 'full') => { TH.push([L, crop]); return `<canvas class="cc-th ${crop === 'head' ? 'head' : ''}" data-th="${TH.length - 1}"></canvas>`; };

// ---- the screens ----------------------------------------------------------------------------------------------------------
const TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['extras', 'Extras'], ['saved', 'Saved looks']];
function render() {
  root.querySelector('.cc-title').textContent = mode === 'start' ? 'CHOOSE YOUR STARTING LOOK' : 'CHARACTER CREATOR';
  root.classList.toggle('cc-start', mode === 'start');
  root.querySelector('.cc-tabs').innerHTML = mode === 'start' ? '' : TABS.map(([k, n]) => `<button class="cc-tab ${k === tab ? 'on' : ''}" data-act="tab" data-v="${k}">${n}</button>`).join('');
  root.querySelector('.cc-foot').innerHTML = mode === 'start'
    ? `<button class="cc-btn" data-act="make-yours">Make it yours</button><button class="cc-btn gold" data-act="play-as">Play as they are</button>`
    : `<button class="cc-btn" data-act="random">Randomise</button><button class="cc-btn" data-act="undo" ${hist.length ? '' : 'disabled'}>Undo</button><button class="cc-btn" data-act="save">Save look</button><button class="cc-btn gold" data-act="done">Done</button>`;
  drawPreview();
  renderPage();
}
const chip = (actn, v, label, on, extra = '') => `<button class="cc-chip ${on ? 'on' : ''}" data-act="${actn}" data-v="${v}" ${extra}>${label}</button>`;
const sw = (actn, v, hex, on, title) => `<button class="cc-sw ${on ? 'on' : ''}" data-act="${actn}" data-v="${v}" style="background:${hex}" title="${esc(title)}" aria-label="${esc(title)}"></button>`;
const row = (label, inner) => `<div class="cc-row"><div class="cc-lab">${label}</div><div class="cc-opts">${inner}</div></div>`;
const variant = (fn) => { const L = clone(look); fn(L); return LK.validLook(L); };

function renderPage() {
  if (!root) return;
  TH.length = 0;
  const pg = root.querySelector('.cc-page');
  const ub = root.querySelector('[data-act="undo"]');
  if (ub) ub.disabled = !hist.length;
  let h = '';
  const L = look, B = L.body;
  if (mode === 'start') {
    h = `<p class="cc-note">Pick who you'll be. You can change everything later from the pause menu (Appearance).</p><div class="cc-grid big">`
      + LK.STARTERS.map((s, i) => `<button class="cc-card ${i === startPick ? 'on' : ''}" data-act="start" data-v="${i}">${th(s.look)}<span>${esc(s.name)}</span></button>`).join('')
      + `<button class="cc-card ${startPick === LK.STARTERS.length ? 'on' : ''}" data-act="start" data-v="random"><span class="cc-q">?</span><span>Random</span></button></div>`;
  } else if (tab === 'body') {
    h = row('Base', chip('base', 'm', 'Men', B.base === 'm') + chip('base', 'f', 'Women', B.base === 'f'))
      + row('Build', `<div class="cc-grid">${LK.BUILDS.map((b, i) => `<button class="cc-card sm ${B.build === i ? 'on' : ''}" data-act="build" data-v="${i}">${th(variant((V) => { V.body.build = i; }))}<span>${b.name}</span></button>`).join('')}</div>`)
      + row(`Height <b>${LK.HEIGHT_NAMES[B.height]}</b>`, `<input class="cc-range" type="range" min="0" max="${LK.HEIGHTS.length - 1}" step="1" value="${B.height}" data-act="height" aria-label="Height">`)
      + row('Skin tone', LK.SKIN_ORDER.map((i) => sw('skin', i, LK.SKIN_TONES[i], B.skin === i, `Skin tone ${i + 1}`)).join(''))
      + row('Age', LK.AGES.map((a, i) => chip('age', i, a, B.age === i)).join(''));
  } else if (tab === 'face') {
    const F = L.face, o = LK.FACE_OPTS;
    const fr2 = (k, label) => row(label, o[k].map((n, i) => chip('face', `${k}:${i}`, n, F[k] === i)).join(''));
    h = `<div class="cc-row"><div class="cc-opts">${chip('rface', 0, '🎲 Random face', false)}</div></div>`
      + row('Face shape', `<div class="cc-grid">${o.shape.map((n, i) => `<button class="cc-card hd ${F.shape === i ? 'on' : ''}" data-act="face" data-v="shape:${i}">${th(variant((V) => { V.face.shape = i; }), 'head')}<span>${n}</span></button>`).join('')}</div>`)
      + fr2('eyes', 'Eyes')
      + row('Eye colour', LK.EYE_COLORS.map(([hx, n], i) => sw('face', `eyeColor:${i}`, hx, F.eyeColor === i, n)).join(''))
      + fr2('brows', 'Brows') + fr2('nose', 'Nose') + fr2('lips', 'Lips')
      + row('Marks', chip('ftog', 'freckles', 'Freckles', !!F.freckles) + chip('ftog', 'mole', 'Beauty mark', !!F.mole) + chip('ftog', 'dimples', 'Dimples', !!F.dimples));
  } else if (tab === 'hair') {
    const LEN = { bald: 's', buzz: 's', short: 's', slick: 's', spiky: 's', curly: 's', undercut: 's', fade: 's', cornrows: 's', pixie: 's', curtains: 's', mohawk: 's' };
    const lenOf = (st) => LEN[st] ? 'short' : ['long', 'wavy', 'braids', 'dreads', 'curlylong', 'braid', 'halfup'].includes(st) ? 'long' : 'medium';
    const styles = LK.HAIR_STYLES.map((s, i) => [s, i]).filter(([s]) => s[1].includes(B.base) && (hairLen === 'all' || lenOf(s[2]) === hairLen));
    h = row('Hair length', ['all', 'short', 'medium', 'long'].map((k) => chip('hlen', k, k[0].toUpperCase() + k.slice(1), hairLen === k)).join(''))
      + row('Hairstyle', `<div class="cc-grid">${styles.map(([s, i]) => `<button class="cc-card hd ${L.hair.style === i ? 'on' : ''}" data-act="hair" data-v="${i}">${th(variant((V) => { V.hair.style = i; V.outfit.hat = null; V.outfit.glasses = null; }), 'head')}<span>${esc(s[0])}</span></button>`).join('')}</div>`)
      + row('Hair colour', LK.HAIR_COLORS.map(([hx, n], i) => sw('hcol', i, hx, L.hair.color === i, n)).join(''))
      + (B.base === 'm' ? row('Facial hair', `<div class="cc-grid">${LK.FACIAL_HAIR.map(([n], i) => `<button class="cc-card hd ${L.hair.facial === i ? 'on' : ''}" data-act="facial" data-v="${i}">${th(variant((V) => { V.hair.facial = i; V.outfit.glasses = null; }), 'head')}<span>${n}</span></button>`).join('')}</div>`) : '');
  } else if (tab === 'outfit') {
    const base = outBase || B.base;
    const slotItem = L.outfit[outSlot];
    const pieces = LK.PIECES.filter((p) => p && p.slot === outSlot && (base === 'all' || LK.fits(p, base)) && (!outStyle || p.tags.includes(outStyle)));
    const none = outSlot !== 'shoes' ? `<button class="cc-card sm ${!slotItem ? 'on' : ''}" data-act="piece" data-v="0">${th(variant((V) => { V.outfit[outSlot] = null; }))}<span>None</span></button>` : '';
    const tiles = pieces.map((p) => `<button class="cc-card sm ${slotItem && slotItem.id === p.i ? 'on' : ''}" data-act="piece" data-v="${p.i}">${th(variant((V) => { V.outfit[outSlot] = { id: p.i, c: slotItem && slotItem.id === p.i ? slotItem.c : p.c, t: slotItem && slotItem.id === p.i ? slotItem.t : p.t, p: slotItem && slotItem.id === p.i ? slotItem.p : p.d.p || 0 }; if (outSlot === 'set') { V.outfit.top = null; V.outfit.bottoms = null; } }))}<span>${esc(p.name)}</span></button>`).join('');
    const strip = completeLooks().map((V, i) => `<button class="cc-card sm" data-act="complete" data-v="${i}">${th(V)}</button>`).join('');
    h = row('Style', chip('style', '', 'All', !outStyle) + LK.STYLES.map(([k, n]) => chip('style', k, n, outStyle === k)).join(''))
      + row('Show', chip('obase', 'f', "Women's", base === 'f') + chip('obase', 'm', "Men's", base === 'm') + chip('obase', 'all', 'All', base === 'all'))
      + `<div class="cc-slots">${LK.SLOTS.map((s) => `<button class="cc-tab sm ${s === outSlot ? 'on' : ''}" data-act="slot" data-v="${s}">${LK.SLOT_NAMES[s]}</button>`).join('')}</div>`
      + `<div class="cc-grid">${none}${tiles || '<p class="cc-note">Nothing in this style for this slot.</p>'}</div>`
      + (slotItem ? row('Colour', chip('ctarget', 'c', 'Main', ctarget === 'c') + chip('ctarget', 't', 'Trim', ctarget === 't'))
        + `<div class="cc-opts sw">${LK.CLOTH.map(([hx, n], i) => sw('colour', i, hx, slotItem[ctarget] === i, n)).join('')}</div>`
        + row('Pattern', LK.PATTERNS.map((p, i) => chip('pattern', i, p === 'tiedye' ? 'Tie-dye' : p[0].toUpperCase() + p.slice(1), slotItem.p === i)).join('')) : '')
      + row(`Complete looks${outStyle ? ': ' + LK.STYLES.find((s) => s[0] === outStyle)[1] : ''}`, `<div class="cc-grid">${strip}</div>`);
  } else if (tab === 'extras') {
    const E = L.extras;
    h = row('Makeup', LK.MAKEUP.map((n, i) => chip('makeup', i, n, E.makeup === i)).join(''))
      + (E.makeup ? row('Makeup colour', LK.MAKEUP_COLORS.map(([hx, n], i) => sw('mcol', i, hx, E.makeupColor === i, n)).join('')) : '')
      + row('Tattoos', LK.TATTOO_AREAS.map(([, n], i) => chip('tat', i, n, !!(E.tattoos & (1 << i)))).join(''))
      + row('Piercings', LK.PIERCINGS.map(([, n], i) => chip('pierce', i, n, !!(E.piercings & (1 << i)))).join(''))
      + row('Scars', LK.SCARS.map((n, i) => chip('scar', i, n, E.scar === i)).join(''));
  } else if (tab === 'saved') {
    const sv = state.saved || [];
    h = `<div class="cc-row"><div class="cc-lab">Save this look as</div><div class="cc-opts"><input class="cc-name" type="text" maxlength="20" placeholder="Name" data-enter="sv-save" autocomplete="off"><button class="cc-btn" data-act="sv-save">Save</button></div>
      <div class="cc-opts">${['Work', 'Night out', 'Beach', 'Gym', 'Heist', 'Wedding'].map((n) => chip('sv-name', n, n, false)).join('')}</div></div>`
      + `<p class="cc-note">${sv.length} of 12 saved.</p><div class="cc-saved">`
      + sv.map((s, i) => {
        const SL = LK.decodeLook(s.c);
        return `<div class="cc-sv">${SL ? th(SL) : ''}<div class="cc-svn">${renaming === i ? `<input class="cc-name" type="text" maxlength="20" value="${esc(s.n)}" data-enter="sv-ok" autocomplete="off">` : esc(s.n)}</div>
          <div class="cc-svb">${renaming === i ? `<button class="cc-btn" data-act="sv-ok" data-v="${i}">OK</button>` : `<button class="cc-btn gold" data-act="sv-apply" data-v="${i}">Apply</button><button class="cc-btn" data-act="sv-ren" data-v="${i}">Rename</button><button class="cc-btn" data-act="sv-del" data-v="${i}">Delete</button>`}</div></div>`;
      }).join('') + '</div>';
  }
  pg.innerHTML = h;
  want.length = 0;
  for (const el of pg.querySelectorAll('canvas[data-th]')) { const [TL, crop] = TH[Number(el.dataset.th)]; el.width = crop === 'head' ? 56 : 64; el.height = crop === 'head' ? 56 : 104; want.push([el, TL, crop]); }
  pumpThumbs();
  if (renaming >= 0) { const inp = pg.querySelector('.cc-sv input'); if (inp) inp.focus(); }
  refocus();
}
function completeLooks() {
  const base = look.body.base, st = outStyle || null, out = [];
  let h = 7; for (const ch of String(outStyle || 'all')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < 6; i++) {
    const R = LK.randomLook(h + i * 977, base, st || LK.STYLES[(h + i) % LK.STYLES.length][0]);
    out.push(variant((V) => { V.outfit = R.outfit; }));
  }
  return out;
}

// ---- actions ----------------------------------------------------------------------------------------------------------------
function act(a, v, el) {
  if (C.sfx) C.sfx('click', 0.5);
  switch (a) {
    case 'tab': tab = v; renaming = -1; render(); return;
    case 'turn': dir = (dir + Number(v) + 8) % 8; drawPreview(); return;
    case 'done': close(true); return;
    case 'play-as': close(true); return;
    case 'make-yours': mode = 'edit'; tab = 'body'; render(); return;
    case 'start': {
      if (v === 'random') { startPick = LK.STARTERS.length; startRandomSeed = newSeed(); look = LK.randomLook(startRandomSeed); }
      else { startPick = Number(v); look = clone(LK.STARTERS[startPick].look); }
      drawPreview(); renderPage(); return;
    }
    case 'undo': if (hist.length) { look = LK.decodeLook(hist.pop()); drawPreview(); render(); } return;
    case 'random': {
      const s = newSeed();
      if (tab === 'outfit') { const R = LK.randomLook(s, look.body.base, outStyle || null); setL((L) => { L.outfit = R.outfit; }); }
      else { const R = LK.randomLook(s, look.body.base); setL((L) => { Object.assign(L, R); }); }
      render(); return;
    }
    case 'save': tab = 'saved'; render(); { const i = root.querySelector('.cc-name'); if (i) i.focus(); } return;
    case 'base': setL((L) => { const R = LK.randomLook(newSeed(), v); if (L.body.base !== v) { L.body.base = v; L.hair = R.hair; if (v === 'f') L.hair.facial = 0; } }); return;
    case 'build': setL((L) => { L.body.build = Number(v); }); return;
    case 'skin': setL((L) => { L.body.skin = Number(v); }); return;
    case 'age': setL((L) => { L.body.age = Number(v); }); return;
    case 'face': { const [k, n] = v.split(':'); setL((L) => { L.face[k] = Number(n); }); return; }
    case 'ftog': setL((L) => { L.face[v] = L.face[v] ? 0 : 1; }); return;
    case 'rface': { const R = LK.randomLook(newSeed(), look.body.base); setL((L) => { L.face = R.face; }); return; }
    case 'hlen': hairLen = v; renderPage(); return;
    case 'hair': setL((L) => { L.hair.style = Number(v); }); return;
    case 'hcol': setL((L) => { L.hair.color = Number(v); }); return;
    case 'facial': setL((L) => { L.hair.facial = Number(v); }); return;
    case 'makeup': setL((L) => { L.extras.makeup = Number(v); }); return;
    case 'mcol': setL((L) => { L.extras.makeupColor = Number(v); }); return;
    case 'tat': setL((L) => { L.extras.tattoos ^= 1 << Number(v); }); return;
    case 'pierce': setL((L) => { L.extras.piercings ^= 1 << Number(v); }); return;
    case 'scar': setL((L) => { L.extras.scar = Number(v); }); return;
    case 'style': outStyle = v; renderPage(); return;
    case 'obase': outBase = v; renderPage(); return;
    case 'slot': outSlot = v; renderPage(); return;
    case 'ctarget': ctarget = v; renderPage(); return;
    case 'piece': {
      const id = Number(v), P = LK.PIECES[id];
      setL((L) => {
        const cur = L.outfit[outSlot];
        if (!P) { L.outfit[outSlot] = null; return; }
        L.outfit[outSlot] = { id, c: cur ? cur.c : P.c, t: cur ? cur.t : P.t, p: cur && cur.p ? cur.p : P.d.p || 0 };
        if (!cur) { L.outfit[outSlot].c = P.c; L.outfit[outSlot].t = P.t; }
        if (outSlot === 'set') { L.outfit.top = null; L.outfit.bottoms = null; }
        if ((outSlot === 'top' || outSlot === 'bottoms') && L.outfit.set) { const S2 = L.outfit.set; L.outfit.set = null; if (outSlot === 'top' && !L.outfit.bottoms) L.outfit.bottoms = LK.item('Jeans'); if (outSlot === 'bottoms' && !L.outfit.top) L.outfit.top = { ...LK.item('Plain tee'), c: S2.c }; }
      });
      return;
    }
    case 'colour': setL((L) => { const it = L.outfit[outSlot]; if (it) it[ctarget] = Number(v); }); return;
    case 'pattern': setL((L) => { const it = L.outfit[outSlot]; if (it) it.p = Number(v); }); return;
    case 'complete': { const V = completeLooks()[Number(v)]; if (V) setL((L) => { L.outfit = V.outfit; }); return; }
    case 'sv-name': { const i = root.querySelector('.cc-name'); if (i) { i.value = v; i.focus(); } return; }
    case 'sv-save': {
      const i = root.querySelector('.cc-name'), n = i ? i.value.trim() : '';
      if (!n) { if (i) i.focus(); if (C.toast) C.toast('Give the look a name first.', 'warn'); return; }
      C.send({ t: 'look', a: 'save', n, c: code() });
      if (i) i.value = '';
      return;
    }
    case 'sv-apply': {
      const s = (state.saved || [])[Number(v)], L = s && LK.decodeLook(s.c);
      if (!L) return;
      hist.push(code()); look = L; drawPreview(); renderPage();
      C.send({ t: 'look', a: 'set', c: s.c });
      if (C.toast) C.toast(`Wearing: ${s.n}`, 'good');
      return;
    }
    case 'sv-ren': renaming = Number(v); renderPage(); return;
    case 'sv-ok': {
      const i = root.querySelector('.cc-sv input');
      if (i && renaming >= 0) C.send({ t: 'look', a: 'ren', i: renaming, n: i.value.trim() });
      renaming = -1; renderPage(); return;
    }
    case 'sv-del': {
      if (el && el.dataset.armed && performance.now() - Number(el.dataset.armed) < 3000) { C.send({ t: 'look', a: 'del', i: Number(v) }); return; }
      if (el) { el.dataset.armed = String(performance.now()); el.textContent = 'Sure?'; }
      return;
    }
    default:
  }
}

// ---- the pad and the keyboard: spatial focus -------------------------------------------------------------------------------
function focusables() { return [...root.querySelectorAll('button, input')].filter((b) => !b.disabled && b.offsetParent !== null); }
function setFocus(el) {
  root.querySelectorAll('.pfocus').forEach((x) => x.classList.remove('pfocus'));
  focusEl = el;
  if (!el) return;
  el.classList.add('pfocus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function refocus() {
  if (!focusEl || !focusEl.isConnected) {
    const key = focusEl && focusEl.dataset ? `[data-act="${focusEl.dataset.act}"]${focusEl.dataset.v !== undefined ? `[data-v="${focusEl.dataset.v}"]` : ''}` : null;
    const again = key && root.querySelector(key);
    if (again) setFocus(again); else if (focusEl) setFocus(null);
  } else setFocus(focusEl);
}
function move(dx, dy) {
  const f = focusables();
  if (!f.length) return;
  if (!focusEl || !focusEl.isConnected) { setFocus(f.find((b) => b.closest('.cc-page')) || f[0]); return; }
  const r0 = focusEl.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bd = Infinity;
  for (const b of f) {
    if (b === focusEl) continue;
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, ddx = x - cx, ddy = y - cy;
    const along = dx ? ddx * dx : ddy * dy, across = dx ? Math.abs(ddy) : Math.abs(ddx);
    if (along <= 2) continue;
    const d = along + across * 2.5;
    if (d < bd) { bd = d; best = b; }
  }
  if (best) setFocus(best);
}
function press() {
  if (!focusEl || !focusEl.isConnected) return;
  if (focusEl.tagName === 'INPUT' && focusEl.type === 'text') { focusEl.focus(); return; }
  if (focusEl.tagName === 'INPUT') return;
  focusEl.click();
}
function slide(d) {
  if (focusEl && focusEl.tagName === 'INPUT' && focusEl.type === 'range') {
    const v = Math.max(Number(focusEl.min), Math.min(Number(focusEl.max), Number(focusEl.value) + d));
    if (v !== Number(focusEl.value)) { hist.push(code()); focusEl.value = String(v); setL((L) => { L.body.height = v; }, false); }
    return true;
  }
  return false;
}
// a pad frame (main.js overlayPad): true when it was ours
export function pad(input) {
  if (!isOpen()) return false;
  if (input.menuNav) move(0, input.menuNav);
  if (input.menuLR && !slide(input.menuLR)) move(input.menuLR, 0);
  if (input.menuSelect) press();
  if (input.menuBack) { if (renaming >= 0) { renaming = -1; renderPage(); } else close(true); }
  if (input.padStart) close(true);
  return true;
}
// a key (main.js onKey): true when it was ours
export function key(k) {
  if (!isOpen()) return false;
  if (k === 'ArrowUp' || k === 'KeyW') { move(0, -1); return true; }
  if (k === 'ArrowDown' || k === 'KeyS') { move(0, 1); return true; }
  if (k === 'ArrowLeft' || k === 'KeyA') { if (!slide(-1)) move(-1, 0); return true; }
  if (k === 'ArrowRight' || k === 'KeyD') { if (!slide(1)) move(1, 0); return true; }
  if (k === 'Enter' || k === 'Space' || k === 'KeyE') { press(); return true; }
  if (k === 'Escape') { close(true); return true; }
  if (k === 'KeyQ') { dir = (dir + 1) % 8; drawPreview(); return true; }
  return true;   // (nothing else reaches the game while the creator is open)
}
