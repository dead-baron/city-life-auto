// The Inventory on its own, for test/invlayout.test.js (and the owner's screenshots): index.html's hub with the game's
// stylesheet over a plain backdrop, the Inventory (client/bag.js) built in it for a player who carries a lot - two guns, a
// bat, grenades, a dozen kinds of things, clothes of their own, saved looks - at a given size and device, and measured:
// every button, tab, tile and label inside the screen, not cut off and not on top of another.
// No game code runs: the page sets the body's classes and --zk the way client/input.js and main.js do.
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { findChrome } from './hudpage.js';

const ROOT = new URL('../', import.meta.url);
const INDEX = readFileSync(new URL('index.html', ROOT), 'utf8');
const cut = (from, to) => { const a = INDEX.indexOf(from), b = INDEX.indexOf(to, a); if (a < 0 || b < 0) throw new Error(`index.html: ${from}`); return INDEX.slice(a, b); };
const HUB = cut('<div id="hub"', '<div id="install"').replace(/<script[\s\S]*?<\/script>/g, '');

// desktops, phones on their side and upright (a small one each way), a tablet, the owner's tall desktop window (11-16)
export const SIZES = [[1920, 1080, 'kbm'], [1280, 720, 'kbm'], [1896, 1927, 'kbm'], [844, 390, 'touch'], [740, 360, 'touch'], [390, 844, 'touch'], [360, 740, 'touch'], [1024, 768, 'touch'], [1280, 720, 'pad']];
const uiScale = (w, h) => Math.round(Math.min(1.6, Math.max(1, Math.min(h / 615, w / 1090))) * 20) / 20;   // (client/main.js)

// a player who carries a lot (the me record and the looks state the server sends)
export const ME = {
  name: 'Tester', hp: 72, maxHp: 100, arm: [40, 60], cash: 3420, bank: 12750, weapon: 'pistol', blade: 0, light: false,
  weapons: [{ id: 'fists', ammo: 0, mag: 0 }, { id: 'pistol', ammo: 48, mag: 12 }, { id: 'shotgun', ammo: 16, mag: 6 }, { id: 'bat', ammo: 0, mag: 0 }, { id: 'grenade', ammo: 3, mag: 1 }, { id: 'rod', ammo: 0, mag: 0 }],
  inv: { medkit: 3, bandage: 5, coffee: 2, energy: 1, hotdog: 2, apple: 4, flashlight: 1, batteries: 6, bucketdrum: 1, guitar: 1, dancemat: 1, lure: 12, worms: 20, scrap: 8, stone: 14, jewelry: 1, wallet: 2, seed_tomato: 5, deerHide: 1, goatHide_3: 1 },
  quick: ['medkit', 'bandage', 'coffee', null], creel: null, crew: null,
};
export function looksFor(LK) {
  const L = LK.STARTERS[2].look, code = LK.encodeLook(L);
  const own = [...new Set([...LK.PIECES.filter((P) => P && P.price > 0).slice(0, 26).map((P) => P.i), ...Object.values(L.outfit).filter(Boolean).map((it) => it.id)])];
  const S1 = LK.decodeLook(code); S1.outfit.hat = null; S1.outfit.glasses = null;
  return { t: 'looks', cur: code, picked: true, saved: [{ n: 'Work', c: code }, { n: 'Night out', c: LK.encodeLook(S1) }, { n: 'Beach', c: code }], own, free: false };
}

// the page: ?w=&h=&dev=kbm|touch|pad&sel=<k>&tab=<tab>&looks=1 (the saved looks open)
export function page() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client/style.css">
<style>body{background:#2a3a2a;margin:0}*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body>${HUB}<pre id="out" hidden></pre><script type="module">
const q = new URL(location.href).searchParams, dev = q.get('dev') || 'kbm', W = innerWidth, H = innerHeight;
document.body.classList.toggle('touch', dev === 'touch'); document.body.classList.toggle('pad', dev === 'pad'); document.body.classList.toggle('portrait', H > W);
document.documentElement.style.setProperty('--zk', String(Math.round(Math.min(1.6, Math.max(1, Math.min(H / 615, W / 1090))) * 20) / 20));
const LK = await import('/shared/look.js');
const { input } = await import('/client/input.js'); input.device = dev === 'pad' ? 'gamepad' : dev === 'touch' ? 'touch' : 'keyboard';
await import('/client/touchicons.js').then((m) => m.paintIcons && m.paintIcons(document));
const ME = ${JSON.stringify(ME)}, LOOKS = (${looksFor.toString()})(LK);
const hub = document.getElementById('hub'); hub.classList.remove('hidden'); hub.dataset.tab = 'bag';
document.getElementById('hub-title').textContent = 'INVENTORY';
for (const el of hub.querySelectorAll('.hubtab')) el.classList.add('hidden');
const inv = document.getElementById('inv'); inv.classList.remove('hidden');
try { localStorage.setItem('cla.bag.tab', q.get('tab') || 'all'); } catch {}
const SENT = [];   // (what the Inventory would send the server)
const STASH = q.get('stash') ? { t: 'stash', open: true, where: 'Your home', items: { medkit: 6, scrap: 30, ironOre: 4, geode: 2, goldFlakes: 9 }, weapons: { rifle: 90, knife: 0, smg: 120 } } : null;   // (?stash=1: the stash open - stash.js)
const B = (await import('/client/bag.js')).createBag({ el: inv, send: (o) => SENT.push(o), me: () => ME, looks: () => LOOKS, look: () => LOOKS.cur, stamina: () => [64, 100], refocus: () => {}, stash: () => STASH });
B.show();
if (q.get('sel')) inv.querySelector('[data-k="' + q.get('sel') + '"]')?.click();
if (q.get('looks')) inv.querySelector('[data-a="looks"]').click();
await new Promise((r) => setTimeout(r, 400));
// ?drag=1 (test/invdrag.test.js): press and drag, a mouse at once, a finger after holding - a medkit onto quick bar slot 8,
// a gun onto weapon slot 2, a worn-able piece onto its clothing slot; then (?stash=1) a tile onto STASH
if (q.get('drag')) {
  const mid = (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const pe = (type, x, y, touch) => window.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: touch ? 7 : 1, pointerType: touch ? 'touch' : 'mouse', button: 0 }));
  async function dragTo(fromSel, toSel, touch) {
    const a = inv.querySelector(fromSel), b = inv.querySelector(toSel);
    if (!a || !b) return 'missing ' + (a ? toSel : fromSel);
    const [x0, y0] = mid(a), [x1, y1] = mid(b), n = SENT.length;
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0, pointerId: touch ? 7 : 1, pointerType: touch ? 'touch' : 'mouse', button: 0 }));
    if (touch) await wait(420);
    pe('pointermove', (x0 + x1) / 2, (y0 + y1) / 2, touch); pe('pointermove', x1, y1, touch);
    const lit = b.classList.contains('drop') || !!b.querySelector('.drop') || !!b.closest('.drop');
    pe('pointerup', x1, y1, touch);
    return { lit, sent: SENT.slice(n) };
  }
  const out = {};
  if (STASH) { inv.querySelector('[data-view="carried"]').click(); await wait(50); }   // (the stash opens on its own side)
  out.mouseQuick = await dragTo('[data-k="i:flashlight"]', '[data-slot="3"]', false);
  out.touchQuick = await dragTo('[data-k="i:medkit"]', '[data-slot="3"]', true);
  out.mouseWeapon = await dragTo('[data-k="w:shotgun"]', '.iv-w[data-q]:nth-child(2)', false);
  out.scroll = await (async () => { const a = inv.querySelector('[data-k="i:medkit"]'); if (!a) return 'missing'; const [x, y] = mid(a), n = SENT.length;   // (a finger that moves first: a scroll, no drag)
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', button: 0 })); pe('pointermove', x, y + 40, true); await wait(420); pe('pointerup', x, y + 40, true);
    return { sent: SENT.slice(n), ghost: !!document.querySelector('.iv-ghost') }; })();
  if (STASH) { out.toStash = await dragTo('[data-k="i:scrap"]', '[data-view="stash"]', true); }
  document.getElementById('out').textContent = JSON.stringify(out);
} else {
// the boxes: everything to press or read
const boxes = [];
for (const el of inv.querySelectorAll('button, select, .bc-n, .bc-tag, .bc-nm, .bag-slot > small, .iv-slot > small, h3, h4, .bag-hint, .iv-stat, .bag-cash, .iv-keys, canvas.iv-cv')) {
  if (!el.offsetParent) continue;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
  const scroller = el.closest('.bag-grid, .bag-detail, .iv-me, .bag-tools');
  const sr = scroller ? scroller.getBoundingClientRect() : null;
  // (in a column that scrolls: only the part in its view counts - the rest is reachable by scrolling, not on show)
  const x0 = sr ? Math.max(r.left, sr.left) : r.left, y0 = sr ? Math.max(r.top, sr.top) : r.top, x1 = sr ? Math.min(r.right, sr.right) : r.right, y1 = sr ? Math.min(r.bottom, sr.bottom) : r.bottom;
  const hidden = x1 - x0 < 2 || y1 - y0 < 2;
  const clip = ((el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis') || (el.classList.contains('bc-nm') && el.scrollHeight > el.clientHeight + 1)) && !/canvas|select/i.test(el.tagName);   // (a name: whole on its two lines - 11-23)
  boxes.push({ name: (el.className || el.tagName) + ':' + (el.dataset.k || el.dataset.cat || el.dataset.q || el.dataset.a || el.dataset.s || el.dataset.off || el.textContent.trim().slice(0, 18)), x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1), hidden, clip, par: el.parentElement && el.parentElement.className, cell: (el.closest('.bag-cell') || {}).dataset?.k || '', cls: el.className, tag: el.tagName, off: el.classList.contains('iv-off'), sheet: H > W && !!el.closest('.bag-detail') });
}
const fr = hub.querySelector('.hub-frame').getBoundingClientRect();
const cvf = inv.querySelector('canvas.iv-cv'), fig = cvf && cvf.dataset.fig ? cvf.dataset.fig.split('|').map(Number) : null;
const res = { fig: fig && { s: fig[0], head: fig[1], feet: fig[2], h: cvf.height, w: cvf.width }, w: W, h: H, dev, extra: q.get('x') || '', frame: [fr.left, fr.top, fr.right, fr.bottom].map(Math.round), boxes };
if (parent !== window) parent.postMessage(res, '*');
document.getElementById('out').textContent = JSON.stringify(res);
}
</script></body></html>`;
}
const TYPES = { '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
export function serve(port = 0) {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__inv.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page()); }
    if (u.pathname === '/__invall.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(allPage()); }
    try {
      const p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (p.includes('..')) throw new Error('no');
      const body = readFileSync(new URL(p, ROOT));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ port: srv.address().port, close: () => srv.close() })));
}
// every size in one headless page: each in a frame of exactly its size, one after another (?list=[[w, h, dev, extra]...])
export function allPage() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><pre id="out"></pre><script type="module">
const list = JSON.parse(new URL(location.href).searchParams.get('list')), out = [];
for (const [w, h, dev, extra] of list) {
  const f = document.createElement('iframe'); f.style.cssText = 'border:0;display:block;width:' + w + 'px;height:' + h + 'px';
  const got = new Promise((ok) => { const on = (e) => { if (e.source === f.contentWindow) { removeEventListener('message', on); ok(e.data); } }; addEventListener('message', on); setTimeout(() => ok({ w, h, dev, extra, err: 'timeout', boxes: [], frame: [0, 0, 0, 0] }), 15000); });
  f.src = '/__inv.html?dev=' + dev + extra + '&x=' + encodeURIComponent(extra);
  document.body.appendChild(f);
  out.push(await got); f.remove();
}
document.getElementById('out').textContent = JSON.stringify(out);
</script></body></html>`;
}
export async function measureAll(list) {
  const chrome = findChrome();
  if (!chrome) return null;
  const srv = await serve();
  try {
    const url = `http://127.0.0.1:${srv.port}/__invall.html?list=${encodeURIComponent(JSON.stringify(list))}`;
    const out = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--js-flags=--max-old-space-size=1024',
      '--virtual-time-budget=120000', '--window-size=2000,2000', '--dump-dom', url], { maxBuffer: 64 << 20, timeout: 240000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out">(\[.*?)<\/pre>/s.exec(out);
    if (!m) throw new Error('the page gave no measurements');
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
  } finally { srv.close(); }
}
// what's wrong at a size: off the screen, cut off, on top of another (a slot's ✕ sits on its slot's corner by design)
export function problems(r) {
  const out = [], tag = `${r.w}x${r.h} ${r.dev}${r.extra ? ' ' + r.extra.slice(1) : ''}`, B = r.boxes.filter((b) => !b.hidden);
  if (r.err) out.push(`${tag}: ${r.err}`);
  const over = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
  const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
  for (const a of B) {
    if (a.x0 < 0 || a.y0 < 0 || a.x1 > r.w || a.y1 > r.h) out.push(`${tag}: ${a.name} off the screen ${JSON.stringify([a.x0, a.y0, a.x1, a.y1])}`);
    if (a.clip) out.push(`${tag}: ${a.name} cut off`);
  }
  // a tile's words: its name, its count and its tag never on top of each other (the owner's phone, 11-16: "12|24" over "Pistol")
  const words = B.filter((b) => b.cell && /^bc-(nm|n|tag)$/.test(b.cls));
  for (const [i, a] of words.entries()) for (const b of words.slice(i + 1)) if (a.cell === b.cell && over(a, b)) out.push(`${tag}: ${a.cls} on ${b.cls} in ${a.cell} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${b.x0},${b.y0}-${b.x1},${b.y1})`);
  for (const a of words) { const c = B.find((b) => b.tag === 'BUTTON' && b.name.endsWith(':' + a.cell) && b.name.startsWith('bag-cell')); if (c && (a.y1 > c.y1 + 1 || a.y0 < c.y0 - 1)) out.push(`${tag}: ${a.cls} out of its tile ${a.cell}`); }
  // your character fills its stand: at least 70% of its height, the head in the top quarter (the owner, 11-16: "super short")
  if (r.fig && !r.extra) { const fh = (r.fig.feet - r.fig.head) / r.fig.h; if (fh < 0.7) out.push(`${tag}: the character fills ${Math.round(fh * 100)}% of its stand`); if (r.fig.head > r.fig.h * 0.25) out.push(`${tag}: the character's head at ${Math.round(r.fig.head / r.fig.h * 100)}% down its stand`); }
  const press = B.filter((b) => b.tag === 'BUTTON' || b.tag === 'SELECT');
  for (const [i, a] of press.entries()) for (const b of press.slice(i + 1)) {
    if (!over(a, b) || inside(a, b) || inside(b, a)) continue;
    if (a.off || b.off) continue;   // (the ✕ on its slot's corner)
    if (a.sheet !== b.sheet) continue;   // (upright, the details are a sheet over the grid)
    out.push(`${tag}: ${a.name} on ${b.name} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${b.x0},${b.y0}-${b.x1},${b.y1})`);
  }
  return out;
}
