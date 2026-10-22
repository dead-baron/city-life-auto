// Inside a home, the prompt out of the way of the rooms (the owner, 10-16: "'Act to use item' stays up inside a home on
// mobile and blocks the view"). By nothing to use, "walk up to something to use it" shows for the first few seconds in
// (HOME_IN.hintS), then there's no prompt over the rooms until you're by something; and on a phone the prompt fades
// when you've been still a few seconds (client/hud.js calm's `still`, the campfire's fade: calmState), back at a touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { HOME_IN, CALM_PROMPT_S } from '../shared/rules.js';
import { useAt, blocked, TILE_IN } from '../shared/homelayout.js';
import { calmState } from '../client/hud.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';

test('at home, by nothing: the hint for the first few seconds, then no prompt; by the fridge: what it does', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id));
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, w.map.pois.find((q) => q.kind === 'home' && q.home === h.id).id, 'hbuy');
  homes.goInside(w, p, h);
  const L = homeinside.planFor(h), s = p.ped.home;
  // a spot by nothing, and one by the fridge
  let free = null, fridge = null;
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
    const x = (tx + 0.5) * TILE_IN, y = (ty + 0.5) * TILE_IN;
    if (blocked(L, x, y)) continue;
    const u = useAt(L, x, y, HOME_IN.reach);
    if (!u && !free) free = [x, y];
    if (u && u.use === 'fridge' && !fridge) fridge = [x, y];
  }
  assert.ok(free && fridge);
  [s.x, s.y] = free;
  const a = homeinside.interaction(w, p);
  assert.ok(a && a.passive && /walk up to something/.test(a.label), 'the hint, just in');
  run(w, HOME_IN.hintS + 0.5);
  [s.x, s.y] = free;
  assert.equal(homeinside.interaction(w, p), null, 'then nothing over the rooms');
  assert.equal(players.findInteraction(w, p), null, 'no prompt at all');
  [s.x, s.y] = fridge;
  const f = homeinside.interaction(w, p);
  assert.ok(f && !f.passive && /fridge/i.test(f.label), `by the fridge: ${f && f.label}`);
});

test('the prompt fades when you\'re still (a phone at home, a campfire), back at once when you touch anything', () => {
  const t0 = 10000;
  assert.equal(calmState(t0, 0, t0 + (CALM_PROMPT_S - 1) * 1000).prompt, false, 'not yet');
  assert.equal(calmState(t0, 0, t0 + (CALM_PROMPT_S + 1) * 1000).prompt, true, 'faded');
  assert.equal(calmState(t0, t0 + CALM_PROMPT_S * 1000, t0 + (CALM_PROMPT_S + 1) * 1000).prompt, false, 'touched a second ago: back');
  assert.equal(calmState(0, 0, t0).prompt, false, 'not at home: never');
});
