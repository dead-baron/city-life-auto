// Shop symbols over the doors you're near (the owner, 10-08, SI1: "Shop symbols over entrances when close (subtle, can
// be turned off)"): art v2 draws the map's icon for each place within a few steps of you, on foot - over a walk-in's
// door, not its counter inside - fading in as you come close; none from a car, none for the places with marks of their
// own (homes, ATMs, stations); off in Settings (settings.shopMarks: client/main.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';
import { TILE } from '../shared/constants.js';
import { KIND_ICON } from '../client/mapwaypoints.js';

function stubG() {
  const drawn = [];
  const g = { globalAlpha: 1, save() {}, restore() {}, beginPath() {}, roundRect() {}, rect() {}, fill() {}, stroke() {} };
  return { g, drawn, icon: (gg, name, x, y) => drawn.push({ name, x, y, a: gg.globalAlpha }) };
}
function host(pois, walkIns = [], buildings = {}) {
  const h = Object.create(World2.prototype);
  h.S = { playing: true, pred: { kind: 'ped' }, me: {} };
  h.map = { pois, walkIns, buildings };
  return h;
}

test('a shop\'s symbol near you, over a walk-in\'s door; none far off, from a car, or for a home', () => {
  const shop = { id: 0, kind: 'hardware', x: 30 * TILE, y: 20 * TILE };   // (a walk-in: its point at the counter inside)
  const b = { tx: 26, ty: 16, tw: 8, th: 6, walkIn: { units: [{ poi: 0, door: { tx: 29, ty: 22, w: 2 } }] } };
  const home = { id: 1, kind: 'home', x: 31 * TILE, y: 24 * TILE };
  const far = { id: 2, kind: 'pharmacy', x: 60 * TILE, y: 20 * TILE };
  const h = host([shop, home, far], [5], { 5: b });
  const door = { x: 30 * TILE, y: 22.5 * TILE };
  const F = { sp: { x: door.x, y: door.y + 60 }, now: 10 };
  const { g, drawn, icon } = stubG();
  h.shopMarks(g, F, icon, KIND_ICON);
  assert.equal(drawn.length, 1, 'one symbol: the shop\'s');
  assert.equal(drawn[0].name, KIND_ICON.hardware);
  assert.ok(Math.abs(drawn[0].x - door.x) < 1 && drawn[0].y < door.y && drawn[0].y > door.y - 60, 'over its door');
  // walking away: fading, then gone
  const a = host([shop], [5], { 5: b }), s1 = stubG(), s2 = stubG();
  a.shopMarks(s1.g, { sp: { x: door.x, y: door.y + 220 }, now: 10 }, s1.icon, KIND_ICON);
  a.marks = null; a.shopMarks(s2.g, { sp: { x: door.x, y: door.y + 400 }, now: 10 }, s2.icon, KIND_ICON);
  assert.ok(s1.drawn.length === 1 && s1.drawn[0].a < 0.6, 'fading');
  assert.equal(s2.drawn.length, 0, 'gone');
  // from a car: none
  const c = host([shop], [5], { 5: b }), s3 = stubG();
  c.S.pred = { kind: 'veh' };
  c.shopMarks(s3.g, F, s3.icon, KIND_ICON);
  assert.equal(s3.drawn.length, 0);
});
