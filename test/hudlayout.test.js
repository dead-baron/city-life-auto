// The HUD on every screen (H70): the prompt (what Act would do - "Steal the Sedan - Vehicle theft"), the notes, the job
// line, the cruiser's hint and the robbery and custody bars fully on the screen and never under a button, the minimap,
// the cash and the stars, nor each other - on desktops (1280x720, 1920x1080), phones on their side (844x390, 740x360)
// and upright (390x844) and a tablet (1024x768), with a keyboard, a pad or the touch controls, on foot, driving, flying,
// as the police, robbing a shop and arrested. The QA sweep of 2026-10-11 found the prompt under the round buttons on a
// phone (its first word or two showing) and on a desktop with a long prompt, and the notes over the job line on a phone.
// Measured for real: the HUD's markup from index.html with the stylesheet in a headless Chromium (test/hudpage.js;
// skipped when there's none - set CLA_CHROME to one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, scenarios, findChrome, measureAll, FLAGS } from './hudpage.js';
import { touchSlots } from '../shared/touchcontrols.js';

test('the prompt, the notes, the job line, the cruiser hint and the bars are readable and clear of the buttons on every screen', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const all = await measureAll();
  assert.equal(all.length, scenarios().length, 'every scenario measured');
  const bad = all.flatMap(problems);
  assert.ok(all.every((r) => r.sc.st === 'custody' || r.read.some((b) => b.name === 'prompt')), 'the prompt shows everywhere');
  assert.ok(all.every((r) => !['rob', 'custody'].includes(r.sc.st) || r.read.some((b) => b.name === (r.sc.st === 'rob' ? 'rob' : 'trainbar'))), 'the robbery and custody bars show');
  assert.deepEqual(bad, [], bad.slice(0, 30).join('\n'));
  // and you, in the middle of the screen: never under the prompt, the notes, the bars or the job line on a phone
  // (844x390 on its side: one note at a time while there's a prompt; upright), a tablet or a desktop - not yet on a
  // 740x360 phone (the newest note can reach your head) nor with four long notes stacked on a keyboard's 1024x768
  // the touch controls by slots (UI-2, 2026-10-24), in every touch state on every screen: none on another, every one
  // 44 px or more, nothing of them in the left 40% (the move stick's: it comes up where the thumb lands), nor over the
  // middle of the screen (you and the space round you), nor on the HUD (the minimap, the vitals, the cash, the weapon,
  // the round buttons); held upright all of them right of the middle; and each slot holding what shared/controls.js
  // says it does for that state
  const ctl = [], HUDK = ['minimap', 'vitals', 'status', 'rclock', 'weapon', 'money', 'bank', 'stars', 'clock', 'faction'];
  const on = (a, b) => a.x0 < b.x1 - 2 && b.x0 < a.x1 - 2 && a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2;
  for (const r of all.filter((q) => q.sc.dev === 'touch')) {
    const { w, h, st } = r.sc, tag = `${w}x${h} ${st}`, ks = r.keep.filter((k) => k.name.startsWith('tb.') || k.name === 'stick-l'), tb = ks.filter((k) => k.name.startsWith('tb.'));
    const mid = { x0: w / 2 - w / 6, x1: w / 2 + w / 6, y0: h / 2 - h / 8, y1: h / 2 + h / 8 };
    for (const [i, a] of ks.entries()) for (const b of ks.slice(i + 1)) if (on(a, b)) ctl.push(`${tag}: ${a.name} on ${b.name}`);
    for (const a of tb) {
      if (a.x1 - a.x0 < 44 || a.y1 - a.y0 < 44) ctl.push(`${tag}: ${a.name} ${a.x1 - a.x0}x${a.y1 - a.y0}`);
      if (a.x0 < w * 0.4) ctl.push(`${tag}: ${a.name} in the move stick's left 40% (x ${a.x0})`);
      if (h > w && a.x0 < w / 2) ctl.push(`${tag}: ${a.name} in the left half`);
      if (on(a, mid)) ctl.push(`${tag}: ${a.name} over the middle (${a.x0},${a.y0}-${a.x1},${a.y1})`);
      if (a.x0 < 0 || a.y0 < 0 || a.x1 > w || a.y1 > h) ctl.push(`${tag}: ${a.name} off the screen`);
      for (const k of r.keep.filter((q) => HUDK.includes(q.name) || q.name.startsWith('b-'))) if (on(a, k)) ctl.push(`${tag}: ${a.name} on ${k.name}`);
    }
    const want = touchSlots(FLAGS[st]), got = Object.fromEntries(tb.map((k) => [k.slot, { a: k.name.slice(3), label: k.label }]));
    assert.equal(r.state && r.state.state, want.state, `${tag}: the state`);
    if (JSON.stringify(Object.keys(got).sort().map((k) => [k, got[k]])) !== JSON.stringify(Object.keys(want.slots).sort().map((k) => [k, want.slots[k]]))) ctl.push(`${tag}: the slots ${JSON.stringify(got)} - controls.js says ${JSON.stringify(want.slots)}`);
  }
  assert.ok(all.some((r) => r.sc.st === 'air' && r.keep.some((k) => k.name === 'tb.climb')), 'the rocker measured');
  assert.deepEqual(ctl, [], ctl.slice(0, 30).join('\n'));
  const you = all.filter((r) => !/^740x360|^844x390 (kbm|pad)|^1024x768 (kbm|pad)/.test(`${r.sc.w}x${r.sc.h} ${r.sc.dev}`)).flatMap((r) => problems(r, { you: true }));
  assert.deepEqual(you, [], you.join('\n'));
});

// the prompt's crime marks (hud.js crimeMarks: the key chip red with a "!", a felony ringed; the touch button red - no
// warning plate): the server says what Act would be
test('the prompt says when what Act would do is a crime, and when a felony', async () => {
  const { makeWorld, joinPlayer, run, teleport } = await import('./helpers.js');
  const players = await import('../server/systems/players.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  // somewhere with nothing else to Act on (the start can be a hospital's doors)
  const x0 = p.ped.x, y0 = p.ped.y, far = (x, y) => Math.min(...w.map.pois.map((q) => Math.hypot(q.x - x, q.y - y)));
  let best = null;
  for (let dy = -1600; dy <= 1600; dy += 400) for (let dx = -1600; dx <= 1600; dx += 400) {
    const x = x0 + dx, y = y0 + dy;
    if (w.map.isWater(x, y) || (best && far(x, y) <= best.d)) continue;
    teleport(w, p.ped, x, y);
    if (!players.findInteraction(w, p)) best = { x, y, d: far(x, y) };
  }
  teleport(w, p.ped, best.x, best.y);
  assert.equal(players.findInteraction(w, p), null, 'a quiet spot');
  const near = (model, o = {}) => Object.assign(w.spawnVehicle(model, p.ped.x + 30, p.ped.y, 0, { npcOwned: true }), o);
  const car = near('sedan');
  run(w, 0.5);
  assert.match(p.prompt, /Steal the Sedan - Vehicle theft/);
  assert.equal(players.buildMe(w, p).pcr, 1, 'a crime: the key red');
  w.remove(car);
  const cop = near('police');
  run(w, 0.5);
  assert.match(p.prompt, /\(felony\)/);
  assert.equal(players.buildMe(w, p).pcr, 2, 'a felony: the key red and ringed');
  Object.assign(cop, { owner: p.pid, npcOwned: false });
  run(w, 0.5);
  assert.equal(players.buildMe(w, p).pcr, 0, 'your own car: no crime');
});
