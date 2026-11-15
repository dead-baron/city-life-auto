// The title's buttons two by two (the owner's layout, 11-14): with RESUME showing, row one is RESUME | PLAY (the same
// width, side by side) and row two CHARACTER | SETTINGS; without it, PLAY takes the whole of row one - on a desktop, a
// phone upright and a phone on its side. Measured for real: the title's markup from index.html with the stylesheet in
// headless Chromium, one frame per screen size and state (skipped when there's none - set CLA_CHROME to one). And the
// player Discord's small button (11-15) clear of everything else on the title, your card and who's online showing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { extname } from 'node:path';
import { findChrome } from './hudpage.js';

const ROOT = new URL('../', import.meta.url);
const SIZES = [['desktop', 1920, 1080, ''], ['phone-upright', 390, 844, 'touch portrait'], ['phone-side', 844, 390, 'touch']];
const TYPES = { '.css': 'text/css', '.woff': 'font/woff', '.png': 'image/png', '.webp': 'image/webp', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function page(port) {
  const html = readFileSync(new URL('index.html', ROOT), 'utf8');
  const a = html.indexOf('<div id="title"'), b = html.indexOf('<div id="signin"');
  const title = html.slice(a, b).replace(/<script[\s\S]*?<\/script>/g, '');
  const frame = (cls, resume) => `<!doctype html><html><head><meta charset="utf-8"><base href="http://127.0.0.1:${port}/"><link rel="stylesheet" href="client/style.css"></head><body class="${cls}">${title}<script>
const t = document.getElementById('title'); t.classList.remove('loading');
document.getElementById('t-resume').classList.toggle('hidden', !${resume});
for (const id of ['t-discord', 't-install', 't-card', 't-online']) document.getElementById(id).classList.remove('hidden');
document.getElementById('t-name').textContent = 'Guest4821'; document.getElementById('t-xp').textContent = 'Criminal XP 0'; document.querySelector('#t-online span').textContent = '12 online';
</script></body></html>`;
  const frames = SIZES.flatMap(([name, w, h, cls]) => [true, false].map((resume) => ({ name, w, h, resume, doc: frame(cls, resume) })));
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="out"></pre>
${frames.map((f, i) => `<iframe id="f${i}" width="${f.w}" height="${f.h}" style="border:0;display:block" srcdoc="${f.doc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`).join('\n')}
<script>
const F = ${JSON.stringify(frames.map(({ name, w, h, resume }) => ({ name, w, h, resume })))};
const box = (d, id) => { const e = d.getElementById(id); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
setTimeout(() => {
  document.getElementById('out').textContent = JSON.stringify(F.map((f, i) => { const d = document.getElementById('f' + i).contentDocument; return { ...f, resume: f.resume, r: box(d, 't-resume'), p: box(d, 'play'), c: box(d, 't-char'), s: box(d, 't-settings'), d: box(d, 't-discord'), i: box(d, 't-install'), g: box(d, 't-gfx'), k: box(d, 't-card'), o: box(d, 't-online'), l: box(d, 'logo'), t: box(d, 't-status'), v: box(d, 't-ver') }; }));
}, 3000);
</script></body></html>`;
}

async function measure() {
  const chrome = findChrome();
  if (!chrome) return null;
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__title.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(srv.address().port)); }
    try {
      const p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (p.includes('..')) throw new Error('no');
      const body = readFileSync(new URL(p, ROOT));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const out = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--virtual-time-budget=10000', '--window-size=2000,1200', '--dump-dom', `http://127.0.0.1:${srv.address().port}/__title.html`], { maxBuffer: 16 << 20, timeout: 60000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out">(\[.*?)<\/pre>/s.exec(out);
    if (!m) throw new Error('the page gave no measurements');
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  } finally { srv.close(); }
}

test('the title buttons two by two: RESUME | PLAY over CHARACTER | SETTINGS, or PLAY the whole row', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const all = await measure();
  assert.equal(all.length, SIZES.length * 2);
  const near = (a, b, d = 2) => Math.abs(a - b) <= d;
  for (const { name, resume, r, p, c, s } of all) {
    const tag = `${name} ${resume ? 'with' : 'without'} RESUME`;
    assert.ok(p && c && s, `${tag}: PLAY, CHARACTER and SETTINGS show`);
    assert.ok(near(c[1], s[1]) && c[2] <= s[0], `${tag}: CHARACTER | SETTINGS side by side`);
    if (resume) {
      assert.ok(r, `${tag}: RESUME shows`);
      assert.ok(near(r[1], p[1]) && r[2] <= p[0], `${tag}: RESUME | PLAY side by side (${r} / ${p})`);
      assert.ok(near(r[2] - r[0], p[2] - p[0], 3), `${tag}: the same width`);
      assert.ok(near(r[0], c[0], 3) && near(p[2], s[2], 3), `${tag}: lined up with the row under it`);
    } else {
      assert.equal(r, null, `${tag}: no RESUME`);
      assert.ok(near(p[0], c[0], 3) && near(p[2], s[2], 3), `${tag}: PLAY the whole row (${p} / ${c} ${s})`);
    }
    assert.ok(c[1] >= p[3], `${tag}: the second row under the first`);
    // the player Discord's small button (with INSTALL APP, your card and who's online showing): on the screen, clear of
    // everything else on it
    const { w, h, d, i, g, k, o, l, v } = all.find((q) => q.name === name && q.resume === resume);
    const over = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    assert.ok(d, `${tag}: the DISCORD button shows`);
    assert.ok(d[0] >= 0 && d[1] >= 0 && d[2] <= w && d[3] <= h, `${tag}: DISCORD on the screen (${d})`);
    for (const [n, b] of [['RESUME', r], ['PLAY', p], ['CHARACTER', c], ['SETTINGS', s], ['the graphics row', g], ['your card', k], ['who\'s online', o], ['the logo', l], ['the version', v], ['INSTALL APP', i]]) assert.ok(!over(d, b), `${tag}: DISCORD clear of ${n} (${d} / ${b})`);
  }
});
