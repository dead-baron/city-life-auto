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
  inv: { medkit: 3, bandage: 5, coffee: 2, energy: 1, hotdog: 2, apple: 4, flashlight: 1, batteries: 6, bucketdrum: 1, guitar: 1, dancemat: 1, lure: 12, worms: 20, scrap: 8, stone: 14, jewelry: 1, wallet: 2, seed_tomato: 5, deerHide: 1 },
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
<style>body{background:#2a3a2a;margin:0}</style></head><body>${HUB}<pre id="out" hidden></pre><script type="module">
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
const B = (await import('/client/bag.js')).createBag({ el: inv, send: () => {}, me: () => ME, looks: () => LOOKS, look: () => LOOKS.cur, stamina: () => [64, 100], refocus: () => {} });
B.show();
if (q.get('sel')) inv.querySelector('[data-k="' + q.get('sel') + '"]')?.click();
if (q.get('looks')) inv.querySelector('[data-a="looks"]').click();
await new Promise((r) => setTimeout(r, 400));
// the boxes: everything to press or read
const boxes = [];
for (const el of inv.querySelectorAll('button, select, .bc-nm, .bag-slot > small, .iv-slot > small, h3, h4, .bag-hint, .iv-stat, .bag-cash, .iv-keys, canvas.iv-cv')) {
  if (!el.offsetParent) continue;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
  const scroller = el.closest('.bag-grid, .bag-detail, .iv-me');
  const sr = scroller ? scroller.getBoundingClientRect() : null;
  const hidden = sr && (r.bottom <= sr.top + 1 || r.top >= sr.bottom - 1);   // (scrolled out of its column's view: reachable, not shown)
  const clip = (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis') && !/canvas|select/i.test(el.tagName);
  boxes.push({ name: (el.className || el.tagName) + ':' + (el.dataset.k || el.dataset.cat || el.dataset.q || el.dataset.a || el.dataset.s || el.dataset.off || el.textContent.trim().slice(0, 18)), x0: Math.round(r.left), y0: Math.round(r.top), x1: Math.round(r.right), y1: Math.round(r.bottom), hidden, clip, par: el.parentElement && el.parentElement.className, tag: el.tagName, off: el.classList.contains('iv-off'), sheet: H > W && !!el.closest('.bag-detail') });
}
const fr = hub.querySelector('.hub-frame').getBoundingClientRect();
document.getElementById('out').textContent = JSON.stringify({ w: W, h: H, dev, frame: [fr.left, fr.top, fr.right, fr.bottom].map(Math.round), boxes });
document.getElementById('out').hidden = false; document.getElementById('out').style.display = 'none';
</script></body></html>`;
}
const TYPES = { '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
export function serve(port = 0) {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__inv.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page()); }
    try {
      const p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (p.includes('..')) throw new Error('no');
      const body = readFileSync(new URL(p, ROOT));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ port: srv.address().port, close: () => srv.close() })));
}
// one size measured in headless Chrome (null without one)
export async function measure(w, h, dev, extra = '') {
  const chrome = findChrome();
  if (!chrome) return null;
  const srv = await serve();
  try {
    const url = `http://127.0.0.1:${srv.port}/__inv.html?dev=${dev}${extra}`;
    const out = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--js-flags=--max-old-space-size=1024',
      '--virtual-time-budget=20000', `--window-size=${w},${h}`, '--dump-dom', url], { maxBuffer: 64 << 20, timeout: 90000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out"[^>]*>(\{.*?)<\/pre>/s.exec(out);
    if (!m) throw new Error(`${w}x${h}: the page gave no measurements`);
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
  } finally { srv.close(); }
}
// what's wrong at a size: off the screen, cut off, on top of another (a slot's ✕ sits on its slot's corner by design)
export function problems(r) {
  const out = [], tag = `${r.w}x${r.h} ${r.dev}`, B = r.boxes.filter((b) => !b.hidden);
  const over = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
  const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
  for (const a of B) {
    if (a.x0 < 0 || a.y0 < 0 || a.x1 > r.w || a.y1 > r.h) out.push(`${tag}: ${a.name} off the screen ${JSON.stringify([a.x0, a.y0, a.x1, a.y1])}`);
    if (a.clip) out.push(`${tag}: ${a.name} cut off`);
  }
  const press = B.filter((b) => b.tag === 'BUTTON' || b.tag === 'SELECT');
  for (const [i, a] of press.entries()) for (const b of press.slice(i + 1)) {
    if (!over(a, b) || inside(a, b) || inside(b, a)) continue;
    if (a.off || b.off) continue;   // (the ✕ on its slot's corner)
    if (a.sheet !== b.sheet) continue;   // (upright, the details are a sheet over the grid)
    out.push(`${tag}: ${a.name} on ${b.name} (${a.x0},${a.y0}-${a.x1},${a.y1} vs ${b.x0},${b.y0}-${b.x1},${b.y1})`);
  }
  return out;
}
