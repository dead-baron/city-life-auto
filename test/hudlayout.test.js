// The HUD on every screen (H70): the prompt (what Act would do - "Steal the Sedan - Vehicle theft"), the notes, the job
// line and the cruiser's hint fully on the screen and never under a button, the minimap, the cash and the stars, nor
// each other - on desktops (1280x720, 1920x1080), phones on their side (844x390, 740x360) and upright (390x844) and a
// tablet (1024x768), with a keyboard, a pad or the touch controls, on foot, driving, flying and as the police. The QA
// sweep of 2026-10-11 found the prompt under the round buttons on a phone (its first word or two showing) and on a
// desktop with a long prompt, and the notes over the job line on a phone.
// Measured for real: the HUD's markup from index.html with the stylesheet in a headless Chromium (test/hudpage.js;
// skipped when there's none - set CLA_CHROME to one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, scenarios, findChrome, measureAll } from './hudpage.js';

test('the prompt, the notes, the job line and the cruiser hint are readable and clear of the buttons on every screen', { skip: !findChrome() && 'no headless Chromium (set CLA_CHROME)' }, async () => {
  const all = await measureAll();
  assert.equal(all.length, scenarios().length, 'every scenario measured');
  const bad = all.flatMap(problems);
  assert.ok(all.every((r) => r.read.some((b) => b.name === 'prompt')), 'the prompt shows everywhere');
  assert.deepEqual(bad, [], bad.slice(0, 30).join('\n'));
});

// the prompt's colour (hud.js: #helpbox.crime amber, .felony red): the server says what Act would be
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
  assert.equal(players.buildMe(w, p).pcr, 1, 'a crime: amber');
  w.remove(car);
  const cop = near('police');
  run(w, 0.5);
  assert.match(p.prompt, /\(felony\)/);
  assert.equal(players.buildMe(w, p).pcr, 2, 'a felony: red');
  Object.assign(cop, { owner: p.pid, npcOwned: false });
  run(w, 0.5);
  assert.equal(players.buildMe(w, p).pcr, 0, 'your own car: no crime');
});
