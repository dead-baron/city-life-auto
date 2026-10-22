// The mansion's garden door (the owner, 10-16: "Mansion entrance on the north only: add a south door"): art v2 draws the
// Hilltop Mansion's front - its door and portico - on its south wall, the side you see, but the way in was round the
// north side on the terrace by the gate. Now the south door is a way in too (h.back, onto a terrace of its own:
// shared/map.js mansion), and out by the door you came in by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import * as economy from '../server/systems/economy.js';
import * as homeinside from '../server/systems/homeinside.js';

test('the mansion: in by the south door, out by it again; the north door as before', () => {
  const w = makeWorld();
  const h = w.map.homes.find((q) => q.kind === 'mansion');
  assert.ok(h && h.back, 'a garden door');
  const b = w.map.buildings[h.b];
  assert.ok(h.back.y > (b.ty + b.th) * TILE && h.back.y < (b.ty + b.th + 2) * TILE, 'just south of the house');
  assert.equal(w.map.tileAtPx(h.back.x, h.back.y), T.PLAZA, 'on its terrace');
  const { p } = joinPlayer(w, { bank: 1e7 });
  // for sale: the south door says where the front door is
  teleport(w, p.ped, h.back.x, h.back.y);
  const a = players.findInteraction(w, p);
  assert.ok(a && a.passive && /north/.test(a.label), `for sale (${a && a.label})`);
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, w.map.pois.find((q) => q.kind === 'home' && q.home === h.id).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid, 'bought');
  // in by the south door
  teleport(w, p.ped, h.back.x + 6, h.back.y + 4);
  const g = players.findInteraction(w, p);
  assert.ok(g && !g.passive && /Go inside/.test(g.label), `the south door (${g && g.label})`);
  g.run();
  assert.ok(p.ped.hidden && p.ped.home && p.ped.home.id === h.id, 'inside');
  homeinside.leave(w, p);
  assert.ok(!p.ped.hidden && Math.hypot(p.ped.x - h.back.x, p.ped.y - h.back.y) < 30, 'out by the south door');
  // the north door, as ever
  teleport(w, p.ped, h.x, h.y);
  players.findInteraction(w, p).run();
  assert.ok(p.ped.hidden, 'in by the north door');
  homeinside.leave(w, p);
  assert.ok(Math.hypot(p.ped.x - h.x, p.ped.y - h.y) < 30, 'out by the north door');
});
