// The owner's saved views (server/systems/views.js; the camera panel's "Save this view" - the owner, 11-14: he scouts the
// places, the hero shots are refined from them): saved on the server with the world's own state, renamed, deleted, played
// as a shot; saving is the owner's and admins' (anyone's on a private dev server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { store } from '../server/store.js';
import { DIRECTOR } from '../shared/rules.js';

const dev = await import('../server/dev.js');
const views = await import('../server/systems/views.js');
const director = await import('../server/systems/director.js');

test('saved views: saved, listed, renamed, deleted - kept with the world\'s state; numbers cleaned; only for the owner and admins', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(w);
  p.devMode = true;
  const sent = [];
  p.conn = { sendJSON: (m) => sent.push(m) };
  store.kept.views = [];
  // not a dev server, no role: listed, never saved
  w.dev = false;
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'save', n: 'Nope', x: 1, y: 2, z: 1, m: 600, w: 'clear' });
  assert.equal(views.all().length, 0);
  assert.equal(sent.at(-1).can, false);
  w.dev = true;
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'save', n: 'Pier <b>at dusk</b>', note: 'push in on the wheel', x: 4100.4, y: 2600, z: 9, m: 1172, w: 'storm' });
  const v = views.all()[0];
  assert.deepEqual([v.n, v.note, v.x, v.y, v.z, v.t, v.w], ['Pier bat dusk/b', 'push in on the wheel', 4100, 2600, 3, 1172, 'storm']);
  assert.equal(store.kept.views, views.all(), 'kept with the world\'s own state (saved with the profiles)');
  assert.equal(sent.at(-1).t, 'views'); assert.equal(sent.at(-1).saved, v.id); assert.equal(sent.at(-1).can, true);
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'save', x: 0, y: 0, m: 720 });
  assert.equal(views.all()[1].n, 'View 2', 'a name of its own when none is given');
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'rename', id: v.id, n: 'The pier', note: '' });
  assert.deepEqual([views.get(v.id).n, views.get(v.id).note], ['The pier', '']);
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'delete', id: views.all()[1].id });
  assert.equal(views.all().length, 1);
  // at most DIRECTOR.views
  store.kept.views = Array.from({ length: DIRECTOR.views }, (_, i) => views.make({ x: i, y: 0, m: 0 }, '', i));
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'save', x: 0, y: 0, m: 0 });
  assert.equal(views.all().length, DIRECTOR.views);
  store.kept.views = [];
});

test('a saved view played as a shot: the camera there at its time and weather, pushing in', () => {
  const w = makeWorld({ npcBudget: 0 });
  w.dev = true;
  const { p } = joinPlayer(w);
  p.devMode = true;
  const sent = [];
  p.conn = { sendJSON: (m) => sent.push(m) };
  store.kept.views = [];
  dev.command(w, p, 'views', { t: 'dev', c: 'views', k: 'save', n: 'Here', x: p.ped.x + 300, y: p.ped.y, z: 1.1, m: 1110, w: 'rain' });
  const v = views.all()[0];
  dev.command(w, p, 'scene', { t: 'dev', c: 'scene', view: v.id, hold: 1 });
  const run = director.runsOf(w).at(-1);
  assert.ok(run && run.view && run.view.id === v.id, 'a shot of it');
  const m = sent.find((q) => q.t === 'dscene' && q.view);
  assert.ok(m && m.view.id === v.id, 'its page told which view (it builds the same shot)');
  assert.equal(run.sc.time, 1110); assert.equal(run.sc.weather, 'rain');
  director.goRun(w, run);
  for (let i = 0; i < 40; i++) w.step();
  assert.ok(Math.hypot(p.dirCam.x - v.x, p.dirCam.y - v.y) < 2, 'the camera where it was saved');
  assert.ok(p.dirCam.z > 1.1 && p.dirCam.z < 1.1 * 1.15, 'pushing in slowly');
  director.end(w, run, 'stopped');
  store.kept.views = [];
});
