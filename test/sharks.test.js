// Sharks (server/systems/sharks.js; the owner, 2026-10-05: "sharks: very rare, likeliest round the prison; fins; blood
// draws them"): a great white comes up near someone swimming in the open sea - never on land, in a river or a lake -
// circles them and bites; it never leaves the sea; out of the water you're safe; hurt badly it goes down. And its art:
// the fin and the shape under the water, the jaws at the bite, belly up dead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { isSwimming } from '../shared/mapcore.js';
import { SPECIES, APOSE } from '../shared/fauna.js';
import * as sharks from '../server/systems/sharks.js';
import * as combat from '../server/systems/combat.js';
import { animalSprite } from '../client/art2/game/actors.js';

// a spot out in the open sea: deep water, sea all round for a good way
function openSea(w, r = 14) {
  const m = w.map;
  for (let ty = m.y0 + 20; ty < m.y0 + m.h - 20; ty += 7) for (let tx = m.x0 + 20; tx < m.x0 + m.w - 20; tx += 7) {
    if (m.tileAt(tx, ty) !== T.DEEP) continue;
    let ok = true;
    for (let dy = -r; dy <= r && ok; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (!sharks.seaAt(m, (tx + dx) * TILE, (ty + dy) * TILE)) { ok = false; break; }
    if (ok) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
const sharkNear = (w, x, y, r = 4000) => sharks.sharksOf(w).find((s) => Math.hypot(s.x - x, s.y - y) < r);
function swimmer(w) {
  const { p } = joinPlayer(w);
  const at = openSea(w);
  assert.ok(at, 'open sea on the map');
  teleport(w, p.ped, at.x, at.y);
  assert.ok(isSwimming(w.map, p.ped), 'swimming out there');
  return { p, at };
}

test('a great white is a sea animal of its own: protected, no habitat for the wildlife to spawn it in', () => {
  const S = SPECIES.shark;
  assert.ok(S && S.protected && S.own && Object.keys(S.habitat).length === 0 && S.loot.length === 0);
});

test('one comes up out of the deep near a swimmer in the open sea, circles and bites - and keeps to the sea', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = swimmer(w);
  const ev = []; const emit0 = w.emit.bind(w); w.emit = (x, y, e) => { ev.push(e); return emit0(x, y, e); };
  const s = sharks.spawnNear(w, p.ped.x, p.ped.y, p.ped);
  assert.ok(s && s.wild.kind === 'shark' && s.wild.own, 'a shark');
  assert.ok(sharks.seaAt(w.map, s.x, s.y) && w.map.tileAtPx(s.x, s.y) === T.DEEP, 'up from deep water');
  const d0 = Math.hypot(s.x - p.ped.x, s.y - p.ped.y);
  assert.ok(d0 > 600 && d0 < 1300, `a way off (${d0 | 0} px)`);
  const hp0 = p.ped.hp;
  let offSea = 0, circled = false;
  for (let k = 0; k < 40 && p.ped.hp >= hp0; k++) {
    run(w, 1);
    if (!s.removed && !sharks.seaAt(w.map, s.x, s.y)) offSea++;
    if (s.wild.state === 'circle') circled = true;
    p.ped.vx = 0; p.ped.vy = 0;
  }
  assert.ok(circled, 'it circles first');
  assert.ok(p.ped.hp < hp0, `then bites (${hp0} -> ${p.ped.hp | 0})`);
  assert.ok(ev.some((e) => e.e === 'blood') && ev.some((e) => e.e === 'maul' && e.id === s.id), 'blood in the water, the bite seen');
  assert.ok(p.ped.bleeding, 'and you bleed');
  assert.equal(offSea, 0, 'never out of the sea');
  // the bite on the wire: its pose for the page
  assert.ok([APOSE.attack, APOSE.swim].includes(s.wild.pose));
});

test('out of the water you\'re safe: it loses you and stays in the sea', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = swimmer(w);
  const s = sharks.spawnNear(w, p.ped.x, p.ped.y, p.ped);
  run(w, 3);
  // onto dry land: the nearest beach or rock
  const m = w.map;
  let land = null;
  for (let r = 1; r < 400 && !land; r++) for (let k = 0; k < 16 && !land; k++) { const a = k / 16 * Math.PI * 2, x = p.ped.x + Math.cos(a) * r * TILE, y = p.ped.y + Math.sin(a) * r * TILE, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (m.inside(tx, ty) && m.land[m.idx(tx, ty)] && [T.SAND, T.GRASS, T.SIDEWALK, T.ROAD].includes(m.tiles[m.idx(tx, ty)])) land = { x, y }; }
  assert.ok(land, 'land somewhere');
  teleport(w, p.ped, land.x, land.y);
  const hp0 = p.ped.hp;
  for (let k = 0; k < 20; k++) { run(w, 1); if (!s.removed) assert.ok(sharks.seaAt(m, s.x, s.y), 'it stays in the sea'); }
  assert.equal(p.ped.hp, hp0, 'no bite on land');
  assert.ok(s.removed || s.wild.tid !== p.ped.id, 'it lost you');
});

test('no shark for someone on land, in a river or a lake, however the odds fall; one soon for a bleeding swimmer', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = joinPlayer(w);
  const keep = { ...sharks.SHARK.p };
  Object.assign(sharks.SHARK.p, { sea: 1, prison: 1, blood: 1 });
  try {
    // on land
    for (let k = 0; k < 6; k++) run(w, 4);
    assert.ok(!sharks.sharksOf(w).length, 'none on land');
    // in a river or a lake (the map's inland water)
    const m = w.map;
    let fresh = null;
    for (let ty = m.y0; ty < m.y0 + m.h && !fresh; ty += 3) for (let tx = m.x0; tx < m.x0 + m.w; tx += 3) { const i = m.idx(tx, ty); if (m.tiles[i] === T.WATER && ((m.river && m.river[i]) || (m.lake && m.lake[i]))) { fresh = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; break; } }
    if (fresh) { teleport(w, p.ped, fresh.x, fresh.y); for (let k = 0; k < 6; k++) run(w, 4); assert.ok(!sharks.sharksOf(w).length, 'none in fresh water'); }
    // out at sea: soon
    const at = openSea(w);
    teleport(w, p.ped, at.x, at.y);
    p.ped.hp = p.ped.maxHp * 0.3; p.ped.bleeding = true;
    for (let k = 0; k < 6 && !sharks.sharksOf(w).length; k++) run(w, 4);
    assert.ok(sharkNear(w, at.x, at.y), 'a shark for the bleeding swimmer');
    // one about at a time
    for (let k = 0; k < 4; k++) run(w, 4);
    assert.equal(sharks.sharksOf(w).filter((s) => Math.hypot(s.x - p.ped.x, s.y - p.ped.y) < sharks.SHARK.one).length, 1, 'one at a time');
  } finally { Object.assign(sharks.SHARK.p, keep); }
});

test('hurt badly, it goes back down: off away from you', () => {
  const w = makeWorld({ npcBudget: 0 });
  const { p } = swimmer(w);
  const s = sharks.spawnNear(w, p.ped.x, p.ped.y, p.ped);
  run(w, 2);
  combat.damage(w, s, s.maxHp * 0.6, p.ped, 'gun', 0);
  assert.ok(!s.dead, 'still alive');
  const d0 = Math.hypot(s.x - p.ped.x, s.y - p.ped.y);
  run(w, 4);
  assert.ok(s.removed || (s.wild.state === 'leave' && Math.hypot(s.x - p.ped.x, s.y - p.ped.y) > d0), 'going away');
});

test('its art: the fin and the dark shape under the water, the jaws up at the bite, belly up dead', () => {
  const px = (g) => { let n = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) n++; return n; };
  const swim = animalSprite('pet:shark', 'swim', 2, 0), bite = animalSprite('pet:shark', 'swipe', 2, 0), dead = animalSprite('pet:shark', 'dead', 2, 0);
  assert.ok(px(swim) > 200 && px(bite) > 200 && px(dead) > 200, 'drawn');
  assert.ok(swim.w > 90, `a big fish (${swim.w} px long, side on)`);
  const red = (g) => { let n = 0; for (let i = 0; i < g.col.length; i += 4) if (g.col[i + 3] && g.col[i] > g.col[i + 1] + 40 && g.col[i] > g.col[i + 2] + 40) n++; return n; };
  assert.ok(red(bite) > 20 && red(swim) === 0, 'the open jaws at the bite');
  const white = (g) => { let n = 0; for (let i = 0; i < g.col.length; i += 4) if (g.col[i + 3] && g.col[i] > 190 && g.col[i + 1] > 190 && g.col[i + 2] > 190) n++; return n; };
  assert.ok(white(dead) > white(swim) + 100, 'belly up');
  const f = [0, 1].map((k) => animalSprite('pet:shark', 'swim', 2, k));
  assert.ok(f[0].col.some((v, i) => v !== f[1].col[i]), 'the tail beats');
  assert.equal(K.PED, K.PED);
});
