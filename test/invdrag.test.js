// Press and drag in the Inventory (client/bag.js dragStart; the owner, 11-23: "click/press and drag things into slots"):
// a mouse drags at once, a finger after holding still a moment - onto a quick bar slot (pinned), a weapon slot (in your
// hand), STASH (moved there); a finger that moves first scrolls and drags nothing. The page: test/invpage.js ?drag=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { serve } from './invpage.js';
import { findChrome } from './hudpage.js';

async function dragRun(w, h, dev, extra = '') {
  const chrome = findChrome();
  if (!chrome) return null;
  const srv = await serve();
  try {
    const url = `http://127.0.0.1:${srv.port}/__inv.html?dev=${dev}&drag=1${extra}`;
    const out = await new Promise((ok, no) => execFile(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--virtual-time-budget=30000', `--window-size=${w},${h}`, '--dump-dom', url], { maxBuffer: 64 << 20, timeout: 120000 }, (e, so) => (e ? no(e) : ok(so))));
    const m = /<pre id="out"[^>]*>(\{.*?)<\/pre>/s.exec(out);
    if (!m) throw new Error('the page gave no result');
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
  } finally { srv.close(); }
}

test('press and drag: a mouse and a finger, onto the quick bar, a weapon slot and the stash; a finger that moves first scrolls', { timeout: 300000 }, async (t) => {
  const r = await dragRun(1280, 720, 'kbm', '&stash=1');
  if (!r) { t.skip('no Chrome here'); return; }
  assert.deepEqual(r.mouseQuick.sent, [{ t: 'inv', a: 'slot', i: 3, id: 'flashlight' }], 'a mouse: pinned to slot 8');
  assert.ok(r.mouseQuick.lit, 'the slot lights up under it');
  assert.deepEqual(r.touchQuick.sent, [{ t: 'inv', a: 'slot', i: 3, id: 'medkit' }], 'a finger held still: pinned too');
  assert.deepEqual(r.mouseWeapon.sent, [{ t: 'weapon', id: 'shotgun' }], 'a gun onto a weapon slot: in your hand');
  assert.deepEqual(r.scroll.sent, [], 'a finger that moves first: nothing dragged');
  assert.ok(!r.scroll.ghost, 'and no tile lifted');
  assert.deepEqual(r.toStash.sent, [{ t: 'stash', a: 'put', k: 'i', id: 'scrap' }], 'onto STASH: into the stash');
});
