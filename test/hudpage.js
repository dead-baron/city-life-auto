// The HUD on its own, for test/hudlayout.test.js (and for screenshots of it): index.html's HUD and touch controls with
// the game's stylesheet over a plain backdrop, filled with the longest things they show - a crime prompt, four long
// notes, a long job line, the police cruiser's hint - and measured: the box of everything to read and of everything it
// mustn't sit under (the round buttons, the minimap, the cash and the stars, the touch buttons and sticks).
// No game code runs: the page sets the body's classes the way client/input.js and main.js do.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { extname } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const INDEX = readFileSync(new URL('index.html', ROOT), 'utf8');
const cut = (from, to) => { const a = INDEX.indexOf(from), b = INDEX.indexOf(to, a); if (a < 0 || b < 0) throw new Error(`index.html: ${from}`); return INDEX.slice(a, b); };
const HUD = cut('<div id="hud"', '<span id="hp-text"');
const TOUCH = cut('<div id="touch"', '<div id="interior"');

// the sizes asked for (H70): desktops, phones on their side and upright, a tablet; each with the devices it plays with
export const SIZES = [[1280, 720], [1920, 1080], [844, 390], [740, 360], [390, 844], [1024, 768]];
export const DEVICES = ['kbm', 'touch', 'pad'];
export const STATES = ['foot', 'veh', 'air', 'police', 'rob', 'custody'];   // (on foot armed with a flashlight and a crate; driving; flying; the police with the cruiser's hint; robbing a shop; arrested)
// and on touch every state the slots have (shared/controls.js TOUCH_STATES): unarmed, on a horse, a board, at a boat's
// wheel, swimming, a passenger, surfing, at home
export const TOUCH_STATES = ['unarmed', 'horse', 'board', 'boat', 'swim', 'ride', 'surf', 'home'];
// what the page tells the touch slots in each (client/main.js touchFlags), each with everything it can show
export const FLAGS = {
  foot: { items: true, carrying: true, armed: true, light: true, prompt: true },
  veh: { items: true, inVeh: true, driver: true, armed: true, shoot: true, prompt: true, siren: true },
  air: { items: true, air: true, inVeh: true, driver: true, armed: true, shoot: true, prompt: true },
  police: { items: true, armed: true, light: true, call: true, prompt: true },
  rob: { items: true, armed: true, prompt: true },
  custody: {},
  unarmed: { items: true, guard: true, light: true, call: true, prompt: true },
  horse: { items: true, inVeh: true, driver: true, horse: true, armed: true, shoot: true, prompt: true },
  board: { items: true, board: true, prompt: true },
  boat: { items: true, inVeh: true, driver: true, boat: true, armed: true, shoot: true, prompt: true, siren: true },
  swim: { items: true, swim: true, prompt: true },
  ride: { items: true, inVeh: true, armed: true, shoot: true, prompt: true },
  surf: { items: true, surf: true, prompt: true },
  home: { items: true, home: true, light: true, prompt: true },
};
export function scenarios() {
  const out = [];
  // (upright, the touch controls only: the keyboard's HUD wants a window wider than ~450 px - its minimap and weapon
  // plate alone fill 390)
  for (const [w, h] of SIZES) for (const dev of DEVICES) for (const st of STATES) if (w > h || dev === 'touch') out.push({ w, h, dev, st });
  for (const [w, h] of SIZES) for (const st of TOUCH_STATES) out.push({ w, h, dev: 'touch', st });
  return out;
}

// the longest of each (from the server's own words)
export const TEXT = {
  prompt: 'Pull the driver out of the Police Cruiser - Carjacking a police vehicle (felony)',
  shop: 'Shop at Corner Mart #12',   // (in the middle of a robbery you're in the shop: its menu's the prompt)
  notes: [
    'Coast guard: your patrol boat is waiting at the Liberty Bay docks (the green ring). Calls come over the radio - smugglers running contraband along the coast, people in the water.',
    'Snatch-and-grab! A mugger grabbed a purse - stop them (no penalty).',
    'You were seen: Vehicle theft. +10 heat - the police are looking for a Sedan.',
    'Wanted level lost - the police have stopped looking for you.',
  ],
  job: '▶ Fire call: a grass fire in Greenfield Park - it\'s spreading: stop the front before it reaches the houses',
  cruiser: 'Cruiser on its way to you - it\'s the blue square on your map',
};

// the page's own script: set the scenario up, wait for the fonts, measure, hand the boxes to the parent page
const FRAME_JS = `
const sc = JSON.parse(decodeURIComponent(location.hash.slice(1)));
const T = ${JSON.stringify(TEXT)}, FL = ${JSON.stringify(FLAGS)}[sc.st] || {};
const $ = (id) => document.getElementById(id);
const b = document.body;
b.classList.add(sc.dev);
if (sc.h > sc.w) b.classList.add('portrait');
b.classList.add('armed', 'multi-wpn');
if (sc.st === 'foot') b.classList.add('has-light', 'carrying');
if (FL.inVeh) b.classList.add('in-veh');
if (sc.st === 'air') b.classList.add('in-air');
if (sc.st === 'police') b.classList.add('can-call');
$('hud').classList.remove('hidden');
if (sc.dev === 'touch') $('touch').classList.remove('hidden');
const glyph = sc.dev === 'touch' ? '<span class="g-touch">ACT</span>' : sc.dev === 'pad' ? '<span class="g-pad g-y">Y</span>' : '<span class="g-key">F</span>';
const pr = $('helpbox'); pr.innerHTML = glyph + ' <span>' + (sc.st === 'rob' ? T.shop : T.prompt) + '</span>'; pr.classList.remove('hidden'); if (sc.st !== 'rob') pr.classList.add('crime', 'felony');
if (sc.st === 'custody') pr.classList.add('hidden');   // (held: nothing to Act on)
// (the notes as client/hud.js lays them: the words in a .tx box, paged by client/notepages.js when they don't fit -
// imported with the page's script, not after it: the headless page's clock doesn't wait for an import made later)
import * as NP from '/client/notepages.js';
import * as TS from '/client/touchslots.js';
const slots = sc.dev === 'touch' ? TS.makeSlots($('tbtns')) : null;
if (slots) slots.set(FL);
for (const [i, n] of (sc.notes || T.notes).entries()) { const el = document.createElement('div'); el.className = 'toast ' + ['info', 'warn', 'bad', 'good'][i]; const tx = el.appendChild(document.createElement('div')); tx.className = 'tx'; tx.textContent = n; $('toasts').appendChild(el); }
$('job').textContent = T.job; $('job').classList.remove('hidden');
if (sc.st === 'rob') { $('rob').classList.remove('hidden'); $('rob-take').textContent = 'HOT $1,250 · till $800'; $('rob-fill').style.width = '40%'; }
if (sc.st === 'custody') { $('trainbar').classList.remove('hidden'); $('trainbar').classList.add('custody'); $('tb-where').textContent = 'IN CUSTODY'; $('tb-next').textContent = 'Held on the ground - a patrol car is on its way'; }
if (sc.st === 'police') { $('cruiser-hint').textContent = T.cruiser; $('cruiser-hint').classList.remove('hidden'); }
$('w-icon').innerHTML = '<canvas width="96" height="48"></canvas>';
$('w-name').textContent = 'Assault rifle'; $('w-ammo').textContent = '30 | 120';
$('cash').textContent = '$248,500'; $('bank').textContent = 'bank $1,250,000';
$('stars').innerHTML = '<span class="on">★</span><span class="on">★</span><span>★</span><span>★</span><span>★</span>'; $('stars').classList.add('wanted');
$('clock').textContent = '13:24 ☀'; $('faction').className = 'criminal'; $('faction').textContent = sc.st === 'police' ? 'POLICE · SERGEANT' : 'CITIZEN · 2 FELONIES';
$('status').textContent = 'EXP 1,250 · SAM 40';
$('rc-time').textContent = '13:24';
for (const el of document.querySelectorAll('#hud *, #touch *')) el.style.animation = 'none';
const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const box = (el, name) => { const r = el.getBoundingClientRect(); return { name, x0: Math.round(r.left), y0: Math.round(r.top), x1: Math.round(r.right), y1: Math.round(r.bottom), clip: el.scrollWidth > el.clientWidth + 1 }; };
function measure() {
  const read = [], keep = [];
  if (shown(pr)) read.push(box(pr, 'prompt'));
  // (a note's pages: lost - words it never shows - when they don't fit and it isn't paged; whole - the last page ends on
  // its last line)
  document.querySelectorAll('#toasts .toast').forEach((el, i) => {
    const tx = el.firstChild;
    el.style.animation = 'none';
    const life = NP.layNote(el, tx, tx.textContent), pages = NP.notePages(tx), lh = parseFloat(getComputedStyle(tx).lineHeight) || 14;
    NP.stopNote(el);
    NP.showPage(tx, pages - 1, false);
    const end = tx.scrollTop + tx.clientHeight >= tx.scrollHeight - 1;
    NP.showPage(tx, 0, false);
    if (shown(el)) read.push({ ...box(el, 'note' + i), pages, life, lines: Math.round(tx.clientHeight / lh), lost: pages > 1 && (!el.classList.contains('paged') || !end) });
  });
  for (const id of ['job', 'cruiser-hint', 'rob', 'trainbar']) if (shown($(id))) read.push(box($(id), id));
  keep.push(box($('radar'), 'minimap'));
  // you: the camera keeps you in the middle of the screen (on foot; your character about 24x32 px on a phone)
  keep.push({ name: 'you', x0: Math.round(sc.w / 2 - 12), y0: Math.round(sc.h / 2 - 20), x1: Math.round(sc.w / 2 + 12), y1: Math.round(sc.h / 2 + 12) });
  for (const id of ['vitals', 'status', 'rclock']) if (shown($(id))) keep.push(box($(id), id));
  for (const id of ['weapon', 'money', 'bank', 'stars', 'clock', 'faction']) if (shown($(id))) keep.push(box($(id), id));
  document.querySelectorAll('#hud-btns button').forEach((el) => { if (shown(el)) { const k = el.querySelector('.kchip'); keep.push({ ...box(el, el.id), label: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(), key: k && shown(k) ? k.textContent : '' }); } });
  if (sc.dev === 'touch') {
    document.querySelectorAll('#tbtns [data-b]').forEach((el) => { if (shown(el)) keep.push({ ...box(el, 'tb.' + el.dataset.b), slot: el.dataset.slot, label: el.dataset.lbl }); });
    if (shown($('stick-l'))) keep.push(box($('stick-l'), 'stick-l'));
  }
  parent.postMessage({ sc, read, keep, state: slots && slots.state }, '*');
}
document.fonts.ready.then(() => setTimeout(measure, 100));
`;

export function framePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/client/style.css"><style>body { background: #4a5d48; } #game { background: repeating-linear-gradient(45deg, #4a5d48 0 40px, #55694f 40px 80px); }</style></head>
<body><div id="game">${HUD}${TOUCH}</div><script type="module">${FRAME_JS}</script></body></html>`;
}

// every scenario in an iframe of its size; the boxes collected into <pre id="out"> (read with chrome --dump-dom)
export function allPage(list = scenarios()) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="out"></pre><script>
const list = ${JSON.stringify(list)}, got = [];
addEventListener('message', (e) => { got.push(e.data); if (got.length === list.length) document.getElementById('out').textContent = JSON.stringify(got); });
for (const sc of list) { const f = document.createElement('iframe'); f.style.cssText = 'border:0;display:block;width:' + sc.w + 'px;height:' + sc.h + 'px'; f.src = '/__hud/frame.html#' + encodeURIComponent(JSON.stringify(sc)); document.body.appendChild(f); }
</script></body></html>`;
}

// The touch aim stick and FIRE for real (test/touchslots.test.js): the page's touch controls with client/input.js bound
// to them, armed, the slots placed; touches on the stick (short of its ring, into it with FIRE ON on and off) and on
// FIRE, and what sample() would send after each
const DRAG_JS = `
import { initInput, sample, setTouchAim, settings, input } from '/client/input.js';
import * as TS from '/client/touchslots.js';
const $ = (id) => document.getElementById(id);
document.body.classList.add('touch');
$('touch').classList.remove('hidden');
TS.makeSlots($('tbtns')).set({ armed: true, prompt: true });
initInput($('cv'), {});
setTouchAim(TS.touchAim);   // (as client/main.js does when the touch controls load)
const el = (b) => $('tbtns').querySelector('[data-b=' + b + ']');
const mid = (b) => { const r = el(b).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; };
const ev = (type, t0, x, y, id) => { const t = new Touch({ identifier: id, target: t0, clientX: x, clientY: y }); t0.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
const view = (target) => ({ selfScreen: { x: 400, y: 200 }, inVehicle: false, armed: true, lastAim: 0.25, face: 0.5, target: () => target });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));   // (the page in touch mode)
// the stick: short of the ring (down, half way), then out into the ring (up and left)
const stick = (name, dx, dy) => { const [x, y, r] = mid('stick'); ev('touchstart', el('stick'), x, y, 3); ev('touchmove', el('stick'), x + dx * r, y + dy * r, 3); out[name] = sample(view(1.0)); ev('touchend', el('stick'), x + dx * r, y + dy * r, 3); out[name + 'After'] = sample(view(1.0)); };
stick('aim', 0, 0.5);
stick('ring', -0.8, -0.8);
el('firetog').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // FIRE OFF
out.toggle = { on: settings.touchEdgeFire, label: el('firetog').textContent };
stick('ringOff', -0.8, -0.8);
el('firetog').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // FIRE ON again
// FIRE tapped with the stick held: where the stick aims
{ const [x, y, r] = mid('stick'); ev('touchstart', el('stick'), x, y, 3); ev('touchmove', el('stick'), x, y - r * 0.5, 3);
  const [fx, fy] = mid('fire'); ev('touchstart', el('fire'), fx, fy, 4); out.fireStick = sample(view(1.0)); ev('touchend', el('fire'), fx, fy, 4); ev('touchend', el('stick'), x, y - r * 0.5, 3); sample(view(1.0)); }
await wait(1400);   // (past the stick's aim staying a moment: shared/touchcontrols.js AIM_KEEP_MS)
// FIRE tapped alone: at the auto-target; with nobody about, where you face
{ const [fx, fy] = mid('fire'); ev('touchstart', el('fire'), fx, fy, 4); out.tap = sample(view(1.0)); ev('touchend', el('fire'), fx, fy, 4); out.tapAfter = sample(view(1.0));
  ev('touchstart', el('fire'), fx, fy, 4); out.tapNone = sample(view(null)); ev('touchend', el('fire'), fx, fy, 4); }
document.getElementById('out').textContent = JSON.stringify(out);
`;
export function dragPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/client/style.css"></head>
<body><div id="game"><canvas id="cv" width="10" height="10"></canvas>${TOUCH}</div><pre id="out"></pre><script type="module">${DRAG_JS}</script></body></html>`;
}
export async function measureDrag() {
  const chrome = findChrome();
  if (!chrome) return null;
  const srv = await serve();
  try {
    const out = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--touch-events=enabled', '--force-device-scale-factor=1',
      '--virtual-time-budget=20000', '--window-size=844,390', '--dump-dom', `http://127.0.0.1:${srv.port}/__hud/drag.html`], { maxBuffer: 8 << 20, timeout: 60000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out">(\{.*?)<\/pre>/s.exec(out);
    if (!m) throw new Error('the drag page gave nothing: ' + out.slice(-400));
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  } finally { srv.close(); }
}

const TYPES = { '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
// a static server for the checkout plus the two pages; resolves to { port, close }
export function serve(port = 0) {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__hud/frame.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(framePage()); }
    if (u.pathname === '/__hud/drag.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(dragPage()); }
    if (u.pathname === '/__hud/all.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(allPage(u.searchParams.get('only') ? JSON.parse(u.searchParams.get('only')) : undefined)); }
    try {
      const p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (p.includes('..')) throw new Error('no');
      const body = readFileSync(new URL(p, ROOT));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ port: srv.address().port, close: () => srv.close() })));
}

// what overlaps what: every box to read against everything it mustn't sit under and against each other, and kept
// inside the screen
// (you - the middle of the screen - only when asked: the notes may cover you on a small screen for their few seconds)
export function problems(r, { you = false } = {}) {
  const out = [], { sc } = r, tag = `${sc.w}x${sc.h} ${sc.dev} ${sc.st}`;
  const over = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const [i, a] of r.read.entries()) {
    if (a.x0 < 0 || a.y0 < 0 || a.x1 > sc.w || a.y1 > sc.h) out.push(`${tag}: ${a.name} off the screen ${JSON.stringify(a)}`);
    if (a.clip) out.push(`${tag}: ${a.name} cut off (wider than its box)`);
    if (a.lost) out.push(`${tag}: ${a.name} cut off (words it never shows)`);
    for (const k of r.keep) if ((you || k.name !== 'you') && over(a, k)) out.push(`${tag}: ${a.name} under ${k.name} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${k.x0},${k.y0}-${k.x1},${k.y1})`);
    for (const b of r.read.slice(i + 1)) if (over(a, b)) out.push(`${tag}: ${a.name} overlaps ${b.name} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${b.x0},${b.y0}-${b.x1},${b.y1})`);
  }
  // and the round buttons (menu, phone, bag...) clear of the touch buttons, the minimap and the cash
  for (const a of r.keep.filter((k) => k.name.startsWith('b-'))) {
    for (const k of r.keep) if (!k.name.startsWith('b-') && k.name !== 'you' && over(a, k)) out.push(`${tag}: ${a.name} under ${k.name} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${k.x0},${k.y0}-${k.x1},${k.y1})`);
  }
  return out;
}

export function findChrome() {
  if (process.env.CLA_CHROME) return process.env.CLA_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${process.env.HOME}/.cache/ms-playwright`].filter(Boolean);
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const d of readdirSync(r).sort().reverse()) {
      for (const f of ['chrome-linux/headless_shell', 'chrome-linux/chrome']) if (existsSync(`${r}/${d}/${f}`)) return `${r}/${d}/${f}`;
    }
  }
  for (const f of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (existsSync(f)) return f;
  return null;
}

// every scenario's boxes, measured in one headless page
export async function measureAll(list) {
  const chrome = findChrome();
  if (!chrome) return null;
  const srv = await serve();
  try {
    const url = `http://127.0.0.1:${srv.port}/__hud/all.html${list ? '?only=' + encodeURIComponent(JSON.stringify(list)) : ''}`;
    const out = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--virtual-time-budget=60000', '--window-size=2000,1200', '--dump-dom', url], { maxBuffer: 64 << 20, timeout: 90000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out">(\[.*?)<\/pre>/s.exec(out);
    if (!m) throw new Error('the page gave no measurements');
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  } finally { srv.close(); }
}
