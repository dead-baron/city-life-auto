// The character creator (concept sheets CC1, CC7-CC10): loaded the first time it opens (main.js openCreator).
// Two screens in one overlay (#creator, built here):
//   'start' - a new player's first join (CC9): twelve starting looks and Random, then "Play as they are" or
//             "Make it yours";
//   'edit'  - the creator (CC1 / CC8 / CC7): Body, Face, Hair (and facial hair), Outfit (style chips, slot tabs, the
//             piece grid, main and trim colours, patterns, complete looks for the style), Extras (makeup, tattoos,
//             piercings, scars) and Saved looks (CC10: save under a name, apply, rename, delete); Randomise, Undo,
//             Save look, Done. A large preview turns through the eight directions with the idle animation.
//   'shop'  - a store's fitting room (ST4, task #364): the store's stock by slot and its complete outfits, tried on the
//             big preview; colours and patterns; Try on, Buy, Buy and wear (shared/wardrobe.js: stock and prices)
//   'barber'- the barbershop's or the salon's chair (ST3): Cut, Colour, Beard, Moustache, priced, then Confirm
// Mouse, touch and the pad: the d-pad / stick moves the focus to the nearest control that way, A presses it, left /
// right moves a slider, B is Done. The server checks every look (server/systems/looks.js): you wear what you own (the
// Outfit tab's Owned / All: CC1, CC7's padlocks), the body and face change at the mirror at home, the hair at a
// barber; a new player's first session is free.
import * as LK from '../shared/look.js';
import * as WD from '../shared/wardrobe.js';
import { person } from './art2/people.js';

let C = null;            // main.js's hooks { send, openOverlay, closeOverlay, topOverlay, sfx, toast }
let root = null;
let look = null, hist = [], mode = 'edit', tab = 'body';
let dir = 0, fr = 0, animT = 0, raf = 0;
let state = { cur: null, picked: true, saved: [] };
let outStyle = '', outSlot = 'top', outBase = null, ctarget = 'c', hairLen = 'all';
let startPick = 0, startRandomSeed = 1, renaming = -1, focusEl = null, seedN = 1, wheelSel = 0;
let outView = 'owned', shop = null, shopTab = 'outfits', shopSel = 0, hairTab = 'cut', doneWarnAt = 0;

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
  // the height slider: the preview follows the drag (the page isn't rebuilt under the finger); one undo step a drag
  root.addEventListener('input', (e) => {
    if (e.target.dataset.act !== 'height') return;
    if (heightFrom === null) heightFrom = code();
    const L = clone(look); L.body.height = Number(e.target.value); look = LK.validLook(L) || look;
    drawPreview();
    const lab = e.target.closest('.cc-row')?.querySelector('.cc-lab b'); if (lab) lab.textContent = LK.HEIGHT_NAMES[look.body.height];
  });
  root.addEventListener('change', (e) => { if (e.target.dataset.act === 'height') { commitHeight(); renderPage(); } });
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
  if (mode === 'wheel') { wheelSel = Math.max(0, (state.saved || []).findIndex((s) => s.c === state.cur)); const s = (state.saved || [])[wheelSel]; if (s) look = LK.decodeLook(s.c) || look; }
  tab = 'body'; outBase = null; doneWarnAt = 0;
  outView = state.free ? 'all' : 'owned';
  if (mode === 'shop' || mode === 'barber') { shop = state.shop || shop; if (!shop) { mode = 'edit'; } }
  if (mode === 'shop') { shopSel = 0; const t = shopTabs(); shopTab = t.length ? t[0][0] : 'outfits'; }
  if (mode === 'barber') hairTab = 'cut';
  if (mode === 'edit') C.send({ t: 'look', a: 'get' });   // (fresh: what you own, and whether you're at home)
  if (C.topOverlay() !== 'creator') C.openOverlay('creator');
  render();
  setFocus(null);
  loop();
}
export function onState(st) {
  state = st;
  if (C.topOverlay() !== 'creator') return;
  if (mode === 'wheel') {   // (the list may have changed under the wheel: keep the pick in range and on show)
    const sv = state.saved || [];
    wheelSel = Math.min(wheelSel, Math.max(0, sv.length - 1));
    const L = sv[wheelSel] && LK.decodeLook(sv[wheelSel].c);
    if (L) look = L;
    render();
  } else if (mode === 'shop' || mode === 'barber') render();
  else if (mode === 'edit' && !(document.activeElement && document.activeElement.tagName === 'INPUT' && root.contains(document.activeElement))) renderPage();   // (what you own, whether you're at home)
}
function close(apply) {
  if (mode === 'wheel' || mode === 'shop' || mode === 'barber') apply = false;   // (the wheel puts a look on with Apply; a store sells it)
  if (apply && look) {
    const why = problem(look);
    if (!why) C.send({ t: 'look', a: 'set', c: code() });
    else if (performance.now() - doneWarnAt > 4000) { doneWarnAt = performance.now(); if (C.toast) C.toast(`${why} (Done again: leave as you were.)`, 'warn'); return; }
  }
  cancelAnimationFrame(raf); raf = 0;
  if (C.topOverlay() === 'creator') C.closeOverlay('creator');
}
// why the look being edited can't be worn now (the server says the same: looks.js refusal); null: it can
const owned = (id) => !!state.free || WD.owns(state.own || [], id);
function problem(L) {
  const cur = !state.free && state.cur && LK.decodeLook(state.cur);
  if (!cur) return null;
  const c = WD.changes(cur, L);
  if (c.body && !state.home) return 'Your body, face, makeup and tattoos change at the mirror at home.';
  if (c.hair && !(state.home && cur.body.base !== L.body.base)) return 'Hair and facial hair change at a barbershop or a hair salon.';
  const no = WD.unowned(state.own || [], L);
  if (!no.length) return null;
  const S = WD.STORES[WD.sellerOf(no[0])];
  return `You don't own the ${LK.PIECES[no[0]].name} yet${S ? ` - ${S.name} sells it` : ''}.`;
}
const lockTag = (id) => { const S = WD.STORES[WD.sellerOf(id)]; return `<span class="cc-lock">🔒 ${S ? `${S.icon} ${esc(S.name)}` : ''}</span>`; };
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
// The figures are cast at the size they're shown (people.js opt.res: R pixels per world px), so the faces get real
// eyes, brows, noses and lips (people.js faceHi) and the hair its locks and sheen: the big preview at 4 px per world px
// (the head and shoulders at 8 on the Face and Hair tabs, as CC8 shows them), a figure's thumbnail at 2, a head's at 3,
// a face feature's at 4. The game itself draws them at 1.
const SIZES = { full: [64, 120, 2, null], head: [60, 66, 3, [-10, -13, 10, 9]], face: [64, 44, 4, [-8, -1.5, 8, 9.5]] };   // canvas w, h, res, region
const BUST = [-10.5, -15, 10.5, 12];   // the preview's close-up: 21 x 27 world px at 8 = the canvas
function blit(cv, G, crop) {
  const c2 = cv.getContext('2d');
  c2.clearRect(0, 0, cv.width, cv.height);
  if (!G || !G.w) return;
  const tmp = document.createElement('canvas');
  tmp.width = G.w; tmp.height = G.h;
  const id = tmp.getContext('2d').createImageData(G.w, G.h);
  id.data.set(G.col);
  tmp.getContext('2d').putImageData(id, 0, 0);
  c2.imageSmoothingEnabled = false;
  const close = crop === 'head' || crop === 'face', foot = Math.round(cv.height * 0.035) + 2;
  // (a wide brim or a held bag may not fit: shrink to fit rather than cut it off)
  const s = Math.min(1, cv.width / G.w, (cv.height - (close ? 0 : foot)) / G.h);
  const x = close ? Math.round((cv.width - G.w * s) / 2) : Math.round(cv.width / 2 - G.ax * s);
  const y = close ? Math.round(cv.height - G.h * s) : Math.round(cv.height - foot - G.ay * s);
  if (!close) {   // the pedestal's shadow (CC1)
    const rx = Math.min(cv.width * 0.42, G.w * 0.36), ry = Math.max(2, rx * 0.3);
    c2.fillStyle = 'rgba(0,0,0,.38)'; c2.beginPath(); c2.ellipse(cv.width / 2, cv.height - foot, rx, ry, 0, 0, 6.283); c2.fill();
  }
  c2.drawImage(tmp, 0, 0, G.w, G.h, x, y, Math.round(G.w * s), Math.round(G.h * s));
}
// the preview: each pose cast once and kept (a turn or the idle's two frames are a blit after the first time)
const PREV = new Map();
function previewCanvas(L, d, f, close) {
  const k = code(L) + d + f + (close ? 'c' : 'f');
  let cv = PREV.get(k);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = 168; cv.height = 216;
  let G = null;
  try { G = person(art(L), d, 'idle', f, close ? { tight: true, res: 8, region: BUST } : { tight: true, res: 4 }); } catch (e) { console.warn('[creator] preview', e); }
  blit(cv, G, close ? 'head' : 'full');
  PREV.set(k, cv);
  if (PREV.size > 48) PREV.delete(PREV.keys().next().value);
  return cv;
}
const closeUp = () => (mode === 'edit' && (tab === 'face' || tab === 'hair')) || mode === 'barber';
function drawPreview() {
  if (!root) return;
  const cv = root.querySelector('.cc-prev');
  // (in the barber's chair, and on the Face and Hair tabs' close-up, the hat comes off, so the face and the cut show)
  const L = closeUp() && look.outfit.hat ? (() => { const V = clone(look); V.outfit.hat = null; return V; })() : look;
  const src = previewCanvas(L, dir, fr, closeUp()), c2 = cv.getContext('2d');
  c2.clearRect(0, 0, cv.width, cv.height);
  c2.drawImage(src, 0, 0);
  cv.classList.toggle('close', closeUp());
  const pn = root.querySelector('.cc-pname');
  if (pn) pn.textContent = mode === 'start' ? (startPick < LK.STARTERS.length ? LK.STARTERS[startPick].name : 'Random') : mode === 'wheel' ? ((state.saved || [])[wheelSel] || {}).n || '' : ['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left'][dir];
}
// the idle: breathing (two frames), and now and then a look round (a turn to one side and back) while nothing changes
let lastTouch = 0, glance = 0;
function loop() {
  cancelAnimationFrame(raf);
  const step = (t) => {
    if (!isOpen()) { raf = 0; return; }
    if (t - animT > 520) {
      animT = t; fr = (fr + 1) & 1;
      if (t - lastTouch > 6000 && mode !== 'wheel') { glance = (glance + 1) % 12; if (glance === 8) dir = (dir + 1) % 8; else if (glance === 10) dir = (dir + 7) % 8; }
      drawPreview();
    }
    pumpThumbs();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
// thumbnails: cast a few each frame (about 6 ms' worth, the ones on screen first), cached (bounded); until then the
// card shows a soft placeholder
const THUMB = new Map(), want = [];
function thumbFor(L, crop) {
  const k = code(L) + crop;
  let cv = THUMB.get(k);
  if (cv) { THUMB.delete(k); THUMB.set(k, cv); return cv; }
  const [tw, tht, res, region] = SIZES[crop] || SIZES.full;
  cv = document.createElement('canvas');
  cv.width = tw; cv.height = tht;
  try { blit(cv, person(art(L), 0, 'idle', 0, region ? { tight: true, res, region } : { tight: true, res }), crop); } catch (e) { console.warn('[creator] thumb', e); }
  THUMB.set(k, cv);
  if (THUMB.size > 320) THUMB.delete(THUMB.keys().next().value);
  return cv;
}
function pumpThumbs() {
  const t0 = performance.now(), page = root && root.querySelector('.cc-page'), pr = page && page.getBoundingClientRect();
  // the thumbnails in view (or nearly) first, in page order
  if (pr && want.length > 1) {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.bottom > pr.top - 60 && r.top < pr.bottom + 60; };
    const a = [], b = [];
    for (const q of want) (vis(q[0]) ? a : b).push(q);
    if (a.length && a.length < want.length) { want.length = 0; want.push(...a, ...b); }
  }
  while (want.length && performance.now() - t0 < 6) {
    const [el, L, crop] = want.shift();
    if (!el.isConnected) continue;
    const cv = thumbFor(L, crop), c2 = el.getContext('2d');
    el.width = cv.width; el.height = cv.height;
    c2.drawImage(cv, 0, 0);
    el.classList.add('ok');
  }
}
const TH = [];   // looks for the thumbnails on this page: <canvas data-th="i">
const th = (L, crop = 'full') => { TH.push([L, crop]); return `<canvas class="cc-th ${crop === 'full' ? '' : crop}" data-th="${TH.length - 1}"></canvas>`; };

// ---- the screens ----------------------------------------------------------------------------------------------------------
const TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['extras', 'Extras'], ['saved', 'Saved']];
function render() {
  root.querySelector('.cc-title').textContent = mode === 'start' ? 'CHOOSE YOUR STARTING LOOK' : mode === 'wheel' ? 'QUICK CHANGE' : (mode === 'shop' || mode === 'barber') && shop ? shop.name.toUpperCase() : 'CHARACTER CREATOR';
  root.classList.toggle('cc-start', mode === 'start');
  root.classList.toggle('cc-wheelmode', mode === 'wheel');
  root.querySelector('.cc-tabs').innerHTML = mode === 'shop' ? shopTabs().map(([k, n]) => `<button class="cc-tab ${k === shopTab ? 'on' : ''}" data-act="sh-tab" data-v="${k}">${n}</button>`).join('')
    : mode === 'barber' ? hairTabs().map(([k, n]) => `<button class="cc-tab ${k === hairTab ? 'on' : ''}" data-act="hb-tab" data-v="${k}">${n}</button>`).join('')
    : mode !== 'edit' ? '' : TABS.map(([k, n]) => `<button class="cc-tab ${k === tab ? 'on' : ''}" data-act="tab" data-v="${k}">${n}</button>`).join('');
  renderFoot();
  drawPreview();
  renderPage();
}
function renderFoot() {
  const money = () => `<span class="cc-money">Cash $${(state.cash || 0).toLocaleString()} · Bank $${(state.bank || 0).toLocaleString()}`;
  let h;
  if (mode === 'start') h = `<button class="cc-btn" data-act="make-yours">Make it yours</button><button class="cc-btn gold" data-act="play-as">Play as they are</button>`;
  else if (mode === 'wheel') h = `<button class="cc-btn" data-act="close">Close</button><button class="cc-btn" data-act="mirror">The mirror</button><button class="cc-btn gold" data-act="wh-apply" ${(state.saved || []).length ? '' : 'disabled'}>Apply</button>`;
  else if (mode === 'shop') {
    const total = basket().reduce((t, id) => t + WD.priceAt(shop.store, id), 0), changed = code() !== state.cur;
    h = `${money()}${total ? ` · <b>Total $${total.toLocaleString()}</b>` : ''}</span><button class="cc-btn" data-act="close">Close</button><button class="cc-btn" data-act="sh-reset" ${changed ? '' : 'disabled'}>Start over</button><button class="cc-btn" data-act="sh-try" ${shopSel ? '' : 'disabled'}>Try on</button>`
      + `<button class="cc-btn green" data-act="sh-buy" ${total ? '' : 'disabled'}>Buy</button><button class="cc-btn gold" data-act="sh-wear" ${changed ? '' : 'disabled'}>${total ? 'Buy and wear' : 'Wear'}</button>`;
  } else if (mode === 'barber') {
    const cost = hairBill();
    h = `${money()}${cost && cost.total ? ` · <b>Total $${cost.total}</b>` : ''}</span><button class="cc-btn" data-act="close">Back</button><button class="cc-btn gold" data-act="hb-ok" ${cost && cost.total ? '' : 'disabled'}>Confirm</button>`;
  } else h = `<button class="cc-btn" data-act="random">🎲 ${RANDOM_LABEL[tab] || 'Random'}</button><button class="cc-btn" data-act="undo" ${hist.length ? '' : 'disabled'}>Undo</button><button class="cc-btn" data-act="save">Save look</button><button class="cc-btn gold" data-act="done">Done</button>`;
  root.querySelector('.cc-foot').innerHTML = h;
}

const RANDOM_LABEL = { body: 'Random body', face: 'Random face', hair: 'Random hair', outfit: 'Random outfit', extras: 'Random extras', saved: 'Random look' };

// ---- the fitting room (ST4) and the barber's chair (ST3) ---------------------------------------------------------------------
const SHOP_TABS = [['outfits', 'Outfits'], ['top', 'Tops'], ['jacket', 'Jackets'], ['bottoms', 'Bottoms'], ['set', 'Dresses & sets'], ['shoes', 'Shoes'], ['hat', 'Hats'], ['acc', 'Accessories']];
const ACC = ['glasses', 'jewel', 'bag'], PATTERNED = new Set(['top', 'jacket', 'bottoms', 'set']);
const inTab = (id, k) => (k === 'acc' ? ACC.includes(LK.PIECES[id].slot) : LK.PIECES[id].slot === k);
function shopTabs() { const ids = shop ? WD.stock(shop.store) : []; return SHOP_TABS.filter(([k]) => (k === 'outfits' ? outfitsHere().length > 0 : ids.some((id) => inTab(id, k)))); }
let outfitMemo = null;
function outfitsHere() {
  if (!shop || !look) return [];
  const k = shop.store + look.body.base;
  if (!outfitMemo || outfitMemo.k !== k) outfitMemo = { k, l: WD.storeOutfits(shop.store, look.body.base, 10) };
  return outfitMemo.l;
}
// what Buy pays for: the pieces tried on that aren't yours yet (all of them from this store)
const basket = (L = look) => (shop ? WD.lookPieces(L).filter((id) => !WD.owns(state.own || [], id) && WD.stocks(shop.store, id)) : []);
// a piece on, in the store's colours (a dress or set instead of the top and bottoms; a top or bottoms instead of it)
function shopDress(V, id) {
  const P = LK.PIECES[id];
  V.outfit[P.slot] = { id, c: P.c, t: P.t, p: P.d.p || 0 };
  if (P.slot === 'set') { V.outfit.top = null; V.outfit.bottoms = null; }
  if ((P.slot === 'top' || P.slot === 'bottoms') && V.outfit.set) {
    V.outfit.set = null;
    if (!V.outfit.top) V.outfit.top = LK.item('Plain tee');
    if (!V.outfit.bottoms) V.outfit.bottoms = LK.item('Jeans');
  }
}
const hairTabs = () => (shop ? WD.HAIR_TABS[shop.kind] || WD.HAIR_TABS.barber : []).filter(([k]) => look.body.base === 'm' || (k !== 'beard' && k !== 'moustache'));
const hairBill = () => { const cur = state.cur && LK.decodeLook(state.cur); return cur && shop ? WD.hairCost(shop.kind, cur, look) : null; };
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
  if (mode === 'shop' || mode === 'barber') renderFoot();   // (the total follows what's tried on)
  let h = '';
  const L = look, B = L.body;
  // (outside the first session: the body, face and extras change at the mirror at home, the hair at a barber)
  const here = (what) => `<p class="cc-note cc-info">${what}</p>`;
  const lockedHere = mode === 'edit' && !state.free && ((tab === 'hair') || (!state.home && (tab === 'body' || tab === 'face' || tab === 'extras')));
  if (mode === 'shop') {
    const S = WD.STORES[shop.store] || {}, own = state.own || [];
    h = `<p class="cc-note">${esc(S.line || '')}. Everything you buy goes to your wardrobe.</p>`;
    if (shopTab === 'outfits') {
      h += `<div class="cc-grid">` + outfitsHere().map((o, i) => {
        const price = Object.values(o).reduce((t, it) => t + (it && !WD.owns(own, it.id) ? WD.priceAt(shop.store, it.id) : 0), 0);
        return `<button class="cc-card sm" data-act="sh-outfit" data-v="${i}">${th(WD.dressIn(look, o))}<span class="cc-price">${price ? '$' + price : '✓ yours'}</span></button>`;
      }).join('') + '</div>';
    } else {
      const ids = WD.stock(shop.store).filter((id) => inTab(id, shopTab));
      h += `<div class="cc-grid">` + ids.map((id) => {
        const P = LK.PIECES[id], cur = look.outfit[P.slot], on = !!cur && cur.id === id, mine = WD.owns(own, id), crop = P.slot === 'hat' || P.slot === 'glasses' ? 'head' : 'full';
        const V = variant((X) => { shopDress(X, id); if (P.slot === 'top' || P.slot === 'set') X.outfit.jacket = null; });
        return `<button class="cc-card sm ${on ? 'on' : ''} ${mine ? 'owned' : ''}" data-act="sh-piece" data-v="${id}">${th(V, crop)}<span>${esc(P.name)}</span><span class="cc-price">${mine ? '✓ yours' : '$' + WD.priceAt(shop.store, id)}</span></button>`;
      }).join('') + '</div>';
      const P = LK.PIECES[shopSel], it = P && look.outfit[P.slot];
      if (it && it.id === shopSel) {
        h += row(`Colour: ${esc(P.name)}`, chip('ctarget', 'c', 'Main', ctarget === 'c') + chip('ctarget', 't', 'Trim', ctarget === 't')) + `<div class="cc-opts sw">${LK.CLOTH.map(([hx, n], i) => sw('sh-colour', i, hx, it[ctarget] === i, n)).join('')}</div>`;
        if (PATTERNED.has(P.slot)) h += row('Pattern', LK.PATTERNS.map((pp, i) => chip('sh-pattern', i, pp === 'tiedye' ? 'Tie-dye' : pp[0].toUpperCase() + pp.slice(1), it.p === i)).join(''));
      }
    }
  } else if (mode === 'barber') {
    const cur = LK.decodeLook(state.cur) || look, k = shop.kind;
    const price = (what, same) => `<span class="cc-price">${same ? 'yours' : '$' + WD.hairPrice(k, what)}</span>`;
    const heads = (list, what) => `<div class="cc-grid">${list.map(([n, i, fn, on, same]) => `<button class="cc-card hd ${on ? 'on' : ''}" data-act="${what}" data-v="${i}">${th(variant(fn), 'head')}<span>${esc(n)}</span>${price(hairTab, same)}</button>`).join('')}</div>`;
    if (hairTab === 'cut') h = heads(LK.HAIR_STYLES.map((s, i) => [s, i]).filter(([s]) => s[1].includes(B.base)).map(([s, i]) => [s[0], i, (V) => { V.hair.style = i; V.outfit.hat = null; V.outfit.glasses = null; }, L.hair.style === i, cur.hair.style === i]), 'hb-style');
    else if (hairTab === 'colour') h = row(`Colour <b>${WD.hairPrice(k, 'colour') ? '$' + WD.hairPrice(k, 'colour') : ''}</b>`, LK.HAIR_COLORS.map(([hx, n], i) => sw('hb-col', i, hx, L.hair.color === i, n)).join(''));
    else h = heads((hairTab === 'beard' ? WD.BEARDS : WD.MOUSTACHES).map((i) => [i ? LK.FACIAL_HAIR[i][0] : 'Clean shaven', i, (V) => { V.hair.facial = i; V.outfit.glasses = null; }, L.hair.facial === i, cur.hair.facial === i]), 'hb-fac');
    h = `<p class="cc-note">${k === 'salon' ? 'Cuts and colour' : 'Cuts, colour, beards and moustaches'}: see it on you, then Confirm to pay.</p>` + h;
  } else if (mode === 'start') {
    h = `<p class="cc-note">Pick who you'll be. You can change everything later from the pause menu (Appearance).</p><div class="cc-grid big">`
      + LK.STARTERS.map((s, i) => `<button class="cc-card ${i === startPick ? 'on' : ''}" data-act="start" data-v="${i}">${th(s.look)}<span>${esc(s.name)}</span></button>`).join('')
      + `<button class="cc-card ${startPick === LK.STARTERS.length ? 'on' : ''}" data-act="start" data-v="random"><span class="cc-q">?</span><span>Random</span></button></div>`;
  } else if (mode === 'wheel') {
    const sv = state.saved || [], n = sv.length;
    h = n ? `<div class="cc-ring">` + sv.map((s, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2, SL = LK.decodeLook(s.c);
      return `<button class="cc-rb ${i === wheelSel ? 'on' : ''}" data-act="wh-pick" data-v="${i}" style="left:${(50 + Math.cos(a) * 39).toFixed(1)}%;top:${(50 + Math.sin(a) * 39).toFixed(1)}%">${SL ? th(SL, 'head') : ''}<span>${esc(s.n)}</span></button>`;
    }).join('') + `<div class="cc-rc"><button class="cc-btn" data-act="wh-step" data-v="-1" aria-label="Previous">◀</button><span>${esc(sv[wheelSel] ? sv[wheelSel].n : '')}</span><button class="cc-btn" data-act="wh-step" data-v="1" aria-label="Next">▶</button></div></div>`
      : `<p class="cc-note">No saved looks yet. Open the mirror, dress up, and save the look under a name (Work, Night out, Beach...).</p>`;
    h += `<p class="cc-note cc-info">A fresh look at home lowers your public wanted level.</p>`;
  } else if (tab === 'body') {
    h = row('Base', chip('base', 'm', 'Men', B.base === 'm') + chip('base', 'f', 'Women', B.base === 'f'))
      + row('Build', `<div class="cc-grid">${LK.BUILDS.map((b, i) => `<button class="cc-card sm ${B.build === i ? 'on' : ''}" data-act="build" data-v="${i}">${th(variant((V) => { V.body.build = i; }))}<span>${b.name}</span></button>`).join('')}</div>`)
      + row(`Height <b>${LK.HEIGHT_NAMES[B.height]}</b>`, `<input class="cc-range" type="range" min="0" max="${LK.HEIGHTS.length - 1}" step="1" value="${B.height}" data-act="height" aria-label="Height">`)
      + row('Skin tone', LK.SKIN_ORDER.map((i) => sw('skin', i, LK.SKIN_TONES[i], B.skin === i, `Skin tone ${i + 1}`)).join(''))
      + row('Age', LK.AGES.map((a, i) => chip('age', i, a, B.age === i)).join(''));
  } else if (tab === 'face') {
    const F = L.face, o = LK.FACE_OPTS;
    // each option a close-up of your own face wearing it (CC8)
    const fr2 = (k, label) => row(label, `<div class="cc-grid fc">${o[k].map((n, i) => `<button class="cc-card fc ${F[k] === i ? 'on' : ''}" data-act="face" data-v="${k}:${i}">${th(variant((V) => { V.face[k] = i; V.outfit.glasses = null; V.outfit.hat = null; }), 'face')}<span>${n}</span></button>`).join('')}</div>`);
    h = row('Face shape', `<div class="cc-grid">${o.shape.map((n, i) => `<button class="cc-card hd ${F.shape === i ? 'on' : ''}" data-act="face" data-v="shape:${i}">${th(variant((V) => { V.face.shape = i; V.outfit.hat = null; V.outfit.glasses = null; }), 'head')}<span>${n}</span></button>`).join('')}</div>`)
      + fr2('eyes', 'Eyes')
      + row('Eye colour', LK.EYE_COLORS.map(([hx, n], i) => sw('face', `eyeColor:${i}`, hx, F.eyeColor === i, n)).join(''))
      + fr2('brows', 'Brows') + fr2('nose', 'Nose') + fr2('lips', 'Lips')
      + row('Marks', `<div class="cc-grid fc">${[['freckles', 'Freckles'], ['mole', 'Beauty mark'], ['dimples', 'Dimples']].map(([k, n]) => `<button class="cc-card fc ${F[k] ? 'on' : ''}" data-act="ftog" data-v="${k}">${th(variant((V) => { V.face[k] = 1; V.outfit.glasses = null; V.outfit.hat = null; }), 'face')}<span>${F[k] ? '✓ ' : ''}${n}</span></button>`).join('')}</div>`);
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
    const pieces = LK.PIECES.filter((p) => p && p.slot === outSlot && (base === 'all' || LK.fits(p, base)) && (!outStyle || p.tags.includes(outStyle)) && (outView === 'all' || owned(p.i)));
    // each tile: you wearing it (a top or a set without the jacket over it; hats, glasses and masks as a close-up)
    const crop = outSlot === 'hat' || outSlot === 'glasses' ? 'head' : 'full';
    const dress = (V, id) => { V.outfit[outSlot] = id; if (outSlot === 'set' && id) { V.outfit.top = null; V.outfit.bottoms = null; } if ((outSlot === 'top' || outSlot === 'set') && id) V.outfit.jacket = null; if (outSlot === 'hair' || crop === 'head') V.outfit.glasses = outSlot === 'glasses' ? id : V.outfit.glasses; };
    const none = outSlot !== 'shoes' ? `<button class="cc-card sm ${!slotItem ? 'on' : ''}" data-act="piece" data-v="0">${th(variant((V) => dress(V, null)), crop)}<span>None</span></button>` : '';
    const tiles = pieces.map((p) => { const mine = slotItem && slotItem.id === p.i, lk = owned(p.i) ? '' : lockTag(p.i); return `<button class="cc-card sm ${mine ? 'on' : ''} ${lk ? 'locked' : ''}" data-act="piece" data-v="${p.i}">${th(variant((V) => dress(V, { id: p.i, c: mine ? slotItem.c : p.c, t: mine ? slotItem.t : p.t, p: mine ? slotItem.p : p.d.p || 0 })), crop)}<span>${esc(p.name)}</span>${lk}</button>`; }).join('');
    const strip = completeLooks().map((V, i) => `<button class="cc-card sm" data-act="complete" data-v="${i}">${th(V)}</button>`).join('');
    // Owned / All (CC1): what's in your wardrobe, or the whole catalogue - the rest padlocked, with the store that sells it
    h = (state.free ? `<p class="cc-note cc-info">Your first look is on the house: whatever you leave wearing is yours to keep.</p>`
      : row('Wardrobe', chip('oview', 'owned', 'Owned', outView === 'owned') + chip('oview', 'all', 'All', outView === 'all')) + (outView === 'all' ? `<p class="cc-note cc-info">🔒 Try anything on; what isn't yours yet is sold at the store shown.</p>` : ''))
      + row('Style', chip('style', '', 'All', !outStyle) + LK.STYLES.map(([k, n]) => chip('style', k, n, outStyle === k)).join(''))
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
  if (lockedHere) h = here(tab === 'hair' ? '✂ Try any style here: cuts, colour and beards are done at a barbershop or a hair salon.' : '🪞 Try anything here: these change at the mirror at home.') + h;
  pg.innerHTML = h;
  want.length = 0;
  for (const el of pg.querySelectorAll('canvas[data-th]')) { const [TL, crop] = TH[Number(el.dataset.th)], Z = SIZES[crop] || SIZES.full; el.width = Z[0]; el.height = Z[1]; want.push([el, TL, crop]); }
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
  lastTouch = performance.now();
  switch (a) {
    case 'tab': { tab = v; renaming = -1; render(); const pg = root.querySelector('.cc-page'); pg.classList.remove('tabin'); void pg.offsetWidth; pg.classList.add('tabin'); pg.scrollTop = 0; return; }
    case 'turn': dir = (dir + Number(v) + 8) % 8; drawPreview(); return;
    case 'done': close(true); return;
    case 'close': close(false); return;
    case 'mirror': mode = 'edit'; tab = 'body'; render(); return;
    case 'wh-pick': if (wheelSel === Number(v)) { act('wh-apply'); return; } wheelSel = Number(v); wheelShow(); return;
    case 'wh-step': { const n = (state.saved || []).length; if (n) { wheelSel = (wheelSel + Number(v) + n) % n; wheelShow(); } return; }
    case 'wh-apply': {
      const s = (state.saved || [])[wheelSel];
      if (!s) return;
      C.send({ t: 'look', a: 'set', c: s.c });
      if (C.toast) C.toast(`Wearing: ${s.n}`, 'good');
      close(false);
      return;
    }
    case 'play-as': close(true); return;
    case 'make-yours': mode = 'edit'; tab = 'body'; render(); return;
    case 'start': {
      if (v === 'random') { startPick = LK.STARTERS.length; startRandomSeed = newSeed(); look = LK.randomLook(startRandomSeed); }
      else { startPick = Number(v); look = clone(LK.STARTERS[startPick].look); }
      drawPreview(); renderPage(); return;
    }
    case 'undo': if (hist.length) { look = LK.decodeLook(hist.pop()); drawPreview(); render(); } return;
    case 'random': {   // (each tab randomises its own part: the body, the face, the hair, the outfit, the extras)
      const s = newSeed();
      if (tab === 'outfit') { const R = LK.randomLook(s, look.body.base, outStyle || null); setL((L) => { L.outfit = R.outfit; }); }
      else if (tab === 'body') { const R = LK.randomLook(s, look.body.base); setL((L) => { L.body = { ...R.body, base: L.body.base }; }); }
      else if (tab === 'face') { const R = LK.randomLook(s, look.body.base); setL((L) => { L.face = R.face; }); }
      else if (tab === 'hair') { const R = LK.randomLook(s, look.body.base); setL((L) => { L.hair = R.hair; if (L.body.base === 'f') L.hair.facial = 0; }); }
      else if (tab === 'extras') { const R = LK.randomLook(s, look.body.base); setL((L) => { L.extras = R.extras; }); }
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
    case 'oview': outView = v; renderPage(); return;
    // the fitting room
    case 'sh-tab': shopTab = v; render(); return;
    case 'sh-piece': { shopSel = Number(v); const P = LK.PIECES[shopSel], cur = P && look.outfit[P.slot]; if (P && !(cur && cur.id === shopSel)) setL((L2) => shopDress(L2, shopSel)); else renderPage(); return; }
    case 'sh-outfit': { const o = outfitsHere()[Number(v)]; if (o) setL((L2) => { L2.outfit = WD.dressIn(L2, o).outfit; }); return; }
    case 'sh-colour': case 'sh-pattern': setL((L2) => { const P = LK.PIECES[shopSel], it = P && L2.outfit[P.slot]; if (it && it.id === shopSel) { if (a === 'sh-colour') it[ctarget] = Number(v); else it.p = Number(v); } }); return;
    case 'sh-try': if (shopSel) setL((L2) => shopDress(L2, shopSel)); return;
    case 'sh-reset': { const L2 = state.cur && LK.decodeLook(state.cur); if (L2) { hist.push(code()); look = L2; drawPreview(); renderPage(); } return; }
    case 'sh-buy': { const ids = basket(); if (ids.length) C.send({ t: 'look', a: 'buy', poi: shop.poi, ids }); return; }
    case 'sh-wear': C.send({ t: 'look', a: 'buy', poi: shop.poi, ids: basket(), wear: code() }); return;
    // the barber's chair
    case 'hb-tab': hairTab = v; render(); return;
    case 'hb-style': setL((L2) => { L2.hair.style = Number(v); }); return;
    case 'hb-col': setL((L2) => { L2.hair.color = Number(v); }); return;
    case 'hb-fac': setL((L2) => { L2.hair.facial = Number(v); }); return;
    case 'hb-ok': C.send({ t: 'look', a: 'cut', poi: shop.poi, c: code() }); close(false); return;
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
      const no = state.free ? [] : WD.unowned(state.own || [], look);   // (try on anything; keep only what you own)
      if (no.length) { const S = WD.STORES[WD.sellerOf(no[0])]; if (C.toast) C.toast(`You don't own the ${LK.PIECES[no[0]].name} yet${S ? ` - ${S.name} sells it` : ''}.`, 'warn'); return; }
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

function wheelShow() {
  const s = (state.saved || [])[wheelSel], L = s && LK.decodeLook(s.c);
  if (L) look = L;
  drawPreview();
  renderPage();
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
  if (mode === 'wheel') {
    const d = input.menuLR || input.menuNav;
    if (d) act('wh-step', String(d));
    if (input.menuSelect) act('wh-apply');
    if (input.menuBack || input.padStart) close(false);
    return true;
  }
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
  if (mode === 'wheel') {
    if (k === 'ArrowLeft' || k === 'KeyA' || k === 'ArrowUp' || k === 'KeyW') act('wh-step', '-1');
    else if (k === 'ArrowRight' || k === 'KeyD' || k === 'ArrowDown' || k === 'KeyS') act('wh-step', '1');
    else if (k === 'Enter' || k === 'Space' || k === 'KeyE') act('wh-apply');
    else if (k === 'Escape') close(false);
    return true;
  }
  if (k === 'ArrowUp' || k === 'KeyW') { move(0, -1); return true; }
  if (k === 'ArrowDown' || k === 'KeyS') { move(0, 1); return true; }
  if (k === 'ArrowLeft' || k === 'KeyA') { if (!slide(-1)) move(-1, 0); return true; }
  if (k === 'ArrowRight' || k === 'KeyD') { if (!slide(1)) move(1, 0); return true; }
  if (k === 'Enter' || k === 'Space' || k === 'KeyE') { press(); return true; }
  if (k === 'Escape') { close(true); return true; }
  if (k === 'KeyQ') { dir = (dir + 1) % 8; drawPreview(); return true; }
  return true;   // (nothing else reaches the game while the creator is open)
}
