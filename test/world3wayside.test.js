// The woods' and the meadows' found places (shared/world3-wayside.js; the art pass, 2026-11-24; concepts NS1-B and
// NS1-E): ruins, an oak with a bench, a fire ring and a mossy log in Highland Woods' pine and oak; a dry-stone wall with
// its gate or a stile, an oak with a swing, beehives by sunflowers, a windmill and its trough in Willow Valley's
// meadows. World v3 as the server builds it (one build: the heavy lock). Each find: on open ground of its own, clear of
// every road, water, building, field, orchard and made place; its pieces there; what should stop you solid; nothing
// tall left standing in front of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { TILE, T } from '../shared/constants.js';
import { WAYSIDE } from '../shared/world3-wayside.js';
import { STACKS3, inLine3, KNEES3 } from '../shared/world3-coast.js';
import { FEET3 } from '../shared/world3-falls.js';
import { FOOTBRIDGE } from '../shared/world3-footbridges.js';
import { CREEKS3 } from '../shared/world3-creeks.js';
import { COVER, TREE_COVER } from '../shared/world3-clearings.js';
import { SHORE_R, SHORE_MIN } from '../shared/world3-croptidy.js';
import { FLORA_SPECIES, staticItems, STATIC_CHUNK, MSTONE_UP } from '../client/art2/game/statics.js';

const { map: m } = await buildWorld3(1337, { log: () => {} });
const finds = (m.natureSites || []).filter((s) => s.kind === 'wayside');
const near = (f, t, r) => m.props.filter((p) => p && p.t === t && Math.abs(p.x - f.x) < r && Math.abs(p.y - f.y) < r);
const solidsIn = (x0, y0, x1, y1) => { let n = 0; for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) for (const e of m.solidProps.get(m.idx(tx, ty)) || []) if (e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) n++; return n; };

test('the found places: enough of each kind, in their own districts, apart from each other', () => {
  const by = {};
  for (const f of finds) by[f.type] = (by[f.type] || 0) + 1;
  console.log('found places', finds.length, JSON.stringify(by));
  assert.ok(finds.length >= 50, `found places in the world (${finds.length})`);
  for (const [d, D] of Object.entries(WAYSIDE.by)) {
    const mine = finds.filter((f) => f.d === +d);
    assert.ok(mine.length >= D.n * 0.75, `district ${d}: ${mine.length} of ${D.n}`);
    for (const k of D.kinds) assert.ok(mine.filter((f) => f.type === k).length >= 2, `district ${d}: ${k} more than once`);
  }
  for (let i = 0; i < finds.length; i++) for (let j = i + 1; j < finds.length; j++) assert.ok(Math.hypot(finds[i].x - finds[j].x, finds[i].y - finds[j].y) >= WAYSIDE.apart * TILE - TILE, 'two finds apart');
});

test('each find: open ground of its own, clear of roads, water, buildings, fields, orchards and made places', () => {
  const HARD = new Set([T.ROAD, T.BRIDGE, T.LOT, T.BUILDING, T.WALL, T.WATER, T.DEEP, T.SIDEWALK, T.PLAZA, T.DOCK, T.FIELD]), R = WAYSIDE.R;
  for (const f of finds) {
    const tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE), at = `${f.type} at ${tx}, ${ty}`;
    for (let dy = -R - 3; dy <= R + 3; dy++) for (let dx = -R - 3; dx <= R + 3; dx++) {
      const i = m.idx(tx + dx, ty + dy), t = m.tiles[i];
      assert.ok(!HARD.has(t), `${at}: nothing hard within ${R + 3} tiles (${dx}, ${dy}: tile ${t})`);
      if (Math.abs(dx) <= R && Math.abs(dy) <= R) assert.ok((t === T.GRASS || t === T.DIRT) && m.dist[i] === f.d, `${at}: its own ground`);
    }
    for (const o of m.orchards || []) assert.ok(f.x < o.x - R * TILE || f.x > o.x + o.w + R * TILE || f.y < o.y - R * TILE || f.y > o.y + o.h + R * TILE, `${at}: off the orchards and the crop rows`);
    for (const s of m.natureSites || []) if (s !== f && s.kind !== 'trail' && s.kind !== 'wayside' && Number.isFinite(s.x)) assert.ok(Math.hypot(s.x - f.x, s.y - f.y) > 12 * TILE, `${at}: off ${s.kind} ${s.name || ''}`);
    // (nothing tall just south of it: in this view it would stand in front)
    const front = m.props.filter((p) => p && /^(tree_|redwood)/.test(p.t) && p.sp !== 'sapling' && Math.abs(p.x - f.x) < R * TILE && p.y > f.y + 2 * TILE && p.y < f.y + 8 * TILE);
    assert.equal(front.length, 0, `${at}: no tree standing in front of it`);
  }
});

test('each find has its pieces, and what should stop you is solid', () => {
  for (const f of finds) {
    const at = `${f.type} at ${Math.floor(f.x / TILE)}, ${Math.floor(f.y / TILE)}`, R = 5 * TILE;
    const has = (t, n = 1) => assert.ok(near(f, t, R).length >= n, `${at}: ${n} x ${t}`);
    switch (f.type) {
      case 'ruins': has('ruins'); assert.ok(solidsIn(f.x - 70, f.y - 66, f.x + 60, f.y + 30) >= 11, `${at}: its walls solid`); break;
      case 'oakbench': has('pbench'); has('fingerpost'); assert.ok(near(f, 'tree_b', R).some((p) => p.sp === 'oak'), `${at}: the oak`); break;
      case 'firering': has('campfire'); has('log', 3); has('boulder', 3); break;
      case 'mushlog': has('log'); assert.ok((m.forage || []).filter((q) => q.wayside && Math.abs(q.x - f.x) < R && Math.abs(q.y - f.y) < R).length >= 1, `${at}: its mushrooms`); break;
      case 'drywall': has('drywall', 2); has('fgate'); assert.ok(solidsIn(f.x - 4 * TILE, f.y - 12, f.x + 4 * TILE, f.y + 12) >= 12, `${at}: the wall and its gate solid`); break;
      case 'stilewall': has('drywall', 2); has('stile'); assert.equal(solidsIn(f.x - 14, f.y - 12, f.x + 14, f.y + 12), 0, `${at}: the stile is the way through`); break;
      case 'oakswing': has('rswing'); assert.ok(near(f, 'tree_b', R).some((p) => p.sp === 'oak'), `${at}: the oak`); break;
      case 'apiary': has('beehive', 3); assert.ok(near(f, 'flowers_a', R).filter((p) => p.sp === 'sunflowers').length >= 3, `${at}: the sunflowers`); break;
      case 'windpump': has('windmill'); has('trough'); break;
      // the desert's (11-25): a pan of cracked mud the ground bake paints from the list a seep's ring is in, nothing growing on it
      case 'playa': { const e = (m.tinajas || []).find((q) => q.x === f.x && q.y === f.y); assert.ok(e && e.r === 0 && e.k === 1 && e.ring >= 2 * TILE && e.ring <= WAYSIDE.R * TILE / 1.3, `${at}: its pan, inside its own ground`); assert.ok(near(f, 'tree_a', R).some((p) => p.sp === 'deadSnag'), `${at}: the snag`); assert.equal(m.reserve[m.idx(Math.floor(f.x / TILE), Math.floor(f.y / TILE))] & 192, 192, `${at}: bare`); break; }
      case 'hoodoos': { const hs = near(f, 'hoodoo', R); assert.ok(hs.length >= 3 && hs.every((p) => p.h >= 30 && p.h <= 120), `${at}: three hoodoos or more, 30 to 120 px`); assert.ok(Math.max(...hs.map((p) => p.h)) - Math.min(...hs.map((p) => p.h)) >= 12, `${at}: of different heights (${hs.map((p) => p.h)})`); assert.ok(new Set(hs.map((p) => p.h + ':' + p.s % 12)).size === hs.length, `${at}: no two one picture`); for (const a of hs) for (const b of hs) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 24, `${at}: two not on one spot`); break; }
      case 'saguaros': has('outcrop'); assert.ok(near(f, 'cactus', R).filter((p) => /^saguaro/.test(p.sp)).length >= 3, `${at}: the saguaros`); break;
      case 'tinshack': { has('tinshack'); has('rustpickup'); has('drum', 2); const sh = near(f, 'tinshack', R)[0], pk = near(f, 'rustpickup', R)[0]; assert.ok(solidsIn(sh.x - 56, sh.y - 28, sh.x + 24, sh.y + 20) >= 15, `${at}: the shack's walls solid`); assert.ok(solidsIn(pk.x - 34, pk.y - 34, pk.x + 34, pk.y + 34) >= 3, `${at}: the pickup solid`); assert.ok(Math.hypot(pk.x - sh.x, pk.y - sh.y) > 60, `${at}: the pickup stands clear of the shack`); break; }
      case 'joshuas': assert.ok(near(f, 'tree_a', R).filter((p) => p.sp === 'joshua').length >= 2, `${at}: the joshua trees`); has('boulder', 3); break;
      default: assert.fail(`${at}: a kind the test doesn't know`);
    }
    // (every plant a find sets is a species the art knows)
    for (const p of m.props) if (p && p.sp && Math.abs(p.x - f.x) < R && Math.abs(p.y - f.y) < R) assert.ok(FLORA_SPECIES.includes(p.sp), `${at}: ${p.t} of species ${p.sp}`);
  }
});

// (In this file for its world build.) The planted rows off the shore (shared/world3-croptidy.js stripsOffShore3; the art
// pass, 11-24: three rows of sunflowers stood on a cobble point with the sea a tile off, lavender on a beach - 65 of the
// 513 strips had sand under them). No crop strip or orchard row within SHORE_R tiles of sand or the sea; none left a
// stub; a cut strip's plants gone with its ground.
test('planted rows keep off the sand and the sea', () => {
  const R = m.world3.stripsOffShore;
  console.log('strips off the shore', JSON.stringify(R));
  assert.ok(R && R.trimmed + R.gone >= 20 && R.plants >= 50, 'the rule found its rows');
  const shore = (tx, ty) => { for (let j = -SHORE_R; j <= SHORE_R; j++) for (let i = -SHORE_R; i <= SHORE_R; i++) { if (!m.inside(tx + i, ty + j)) continue; const q = m.idx(tx + i, ty + j), t = m.tiles[q]; if (t === T.SAND || ((t === T.WATER || t === T.DEEP) && !(m.lake && m.lake[q]) && !(m.river && m.river[q]))) return true; } return false; };
  assert.ok(m.orchards.length > 400, `the strips kept (${m.orchards.length})`);
  for (const o of m.orchards) {
    const x0 = Math.floor(o.x / TILE), y0 = Math.floor(o.y / TILE), x1 = Math.ceil((o.x + o.w) / TILE) - 1, y1 = Math.ceil((o.y + o.h) / TILE) - 1;
    assert.ok(x1 - x0 + 1 >= SHORE_MIN || o.w >= SHORE_MIN * TILE - TILE, `a ${o.k} strip at ${x0}, ${y0} is no stub`);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) assert.ok(!shore(tx, ty), `a ${o.k} strip at ${tx}, ${ty}: off the sand and the sea`);
  }
  // (the sunflowers that stood on North Cape's cobbles: tiles 4466..4520, 580..602)
  assert.equal(m.props.filter((p) => p && p.sp === 'sunflowers' && p.x > 4466 * TILE && p.x < 4520 * TILE && p.y > 580 * TILE && p.y < 602 * TILE).length, 0, 'no sunflowers on the cape');
});

// (In this file for its world build.) The Sentinel Stones read (the nature status of 11-21: "standing stones barely
// read" - pale grey posts on pale grey scree): the ring stands on a round of green turf, and a stone that stands is
// drawn MSTONE_UP times its height - a megalith over a walker's head; the altar and the fallen one as laid.
test('the Sentinel Stones: on a round of turf, drawn tall', () => {
  const site = (m.natureSites || []).find((s) => s.kind === 'stones');
  assert.ok(site, 'the ring');
  const tx = Math.floor(site.x / TILE), ty = Math.floor(site.y / TILE);
  let turf = 0;
  for (let dy = -7; dy <= 7; dy++) for (let dx = -8; dx <= 8; dx++) { const i = m.idx(tx + dx, ty + dy); if (m.tiles[i] === T.GRASS && (m.reserve[i] & 128)) turf++; }
  assert.ok(turf >= 70, `a round of turf under the ring (${turf} tiles)`);
  const stones = m.props.map((p, pi) => [p, pi]).filter(([p]) => p && p.t === 'mstone' && Math.hypot(p.x - site.x, p.y - site.y) < 12 * TILE);
  assert.ok(stones.length >= 10, `the stones (${stones.length})`);
  let tall = 0;
  for (const [p, pi] of stones) {
    const it = staticItems(m, Math.floor(p.x / STATIC_CHUNK), Math.floor(p.y / STATIC_CHUNK)).find((q) => q.pi === pi);
    assert.ok(it && /^mst:/.test(it.key), 'drawn');
    const h = +it.key.split(':')[3];
    if (p.h > 20) { tall++; assert.equal(h, Math.round(p.h * MSTONE_UP), 'a standing stone drawn tall'); } else assert.equal(h, p.h, 'a laid stone as laid');
  }
  assert.ok(tall >= 8 && MSTONE_UP >= 1.4, `${tall} standing`);
});


// Every footbridge can be walked and seen (shared/world3-footbridges.js; the redwood overhaul's crossings, 11-24 - the
// owner: "a lot of bridges over streams aren't at the right angle or they don't actually let you walk over them").
// Before the pass: three with no deck under them (the Stadium park's, West Hills' two), three log stubs ending in a
// lake, the Giants Loop's ending on grass, Highland Way's under a giant.
test('every footbridge: a deck under it, its ends on the banks, its path at them, nothing drawn over it', () => {
  const wet = (t) => t === T.WATER || t === T.DEEP, tAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1; };
  const PATH = new Set([T.DIRT, T.SIDEWALK, T.PLAZA, T.ROAD, T.SAND, T.LOT, T.DOCK, T.BRIDGE]);
  const list = m.props.filter((p) => p && FOOTBRIDGE.kinds.includes(p.t)).map((p) => ({ x: p.x, y: p.y, a: p.a || 0, len: p.len || 140, name: p.t }));
  for (const s of m.natureSites || []) if (s.footbridge) list.push({ ...s.footbridge, name: s.name });
  console.log('footbridges', list.length, JSON.stringify(m.world3.footbridges));
  assert.ok(list.length >= 9, `footbridges in the world (${list.length})`);
  const tall = m.props.filter((p) => p && /^(tree_a|tree_b|redwood)$/.test(p.t));
  let noPath = 0, inWater = 0;
  for (const b of list) {
    const ux = Math.cos(b.a), uy = Math.sin(b.a), at = `${b.name} at ${Math.round(b.x / TILE)}, ${Math.round(b.y / TILE)}`;
    let open = 0, over = 0;
    for (let d = -b.len / 2; d <= b.len / 2; d += 8) { const t = tAt(b.x + ux * d, b.y + uy * d); if (wet(t)) open++; else if (t === T.BRIDGE) over++; }
    assert.equal(open, 0, `${at}: ${open * 8} px of it over open water - nothing to walk on`);
    assert.ok(over >= 2, `${at}: it crosses water (${over * 8} px of deck)`);
    for (const sg of [-1, 1]) {
      const ex = b.x + ux * sg * (b.len / 2 + 12), ey = b.y + uy * sg * (b.len / 2 + 12);
      if (wet(tAt(ex, ey))) { inWater++; continue; }
      let has = false, near = false;
      for (let dy = -FOOTBRIDGE.link; dy <= FOOTBRIDGE.link; dy++) for (let dx = -FOOTBRIDGE.link; dx <= FOOTBRIDGE.link; dx++) {
        if (!PATH.has(tAt(ex + dx * TILE, ey + dy * TILE)) || tAt(ex + dx * TILE, ey + dy * TILE) === T.BRIDGE && Math.abs(dx * ux + dy * uy) < 2) continue;
        if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) has = true; else if (dx * dx + dy * dy <= FOOTBRIDGE.link ** 2 && (dx * ux + dy * uy) * sg >= -1) near = true;
      }
      if (!has) { noPath++; console.log(`${at}: no path at its ${sg < 0 ? 'first' : 'far'} end${near ? ' (one within reach)' : ''}`); }
    }
    // (what stands south of the deck and is drawn over two points of it or more)
    for (const p of tall) {
      if (Math.abs(p.x - b.x) > b.len / 2 + 130 || p.y < b.y - b.len / 2 - 10 || p.y > b.y + b.len / 2 + 780) continue;
      const c = p.t === 'redwood' ? COVER[p.sp] || COVER.giant : TREE_COVER, s = p.k && p.t === 'redwood' ? Math.min(1, p.k) : 1;
      let hit = 0;
      for (let d = -b.len / 2; d <= b.len / 2; d += 16) { const x = b.x + ux * d, y = b.y + uy * d, dy = p.y - y, dx = Math.abs(p.x - x); if (dy > -6 && dy <= c[1] * s && dx < c[2] * s && (dy >= c[1] * s * 0.42 || dx < c[0] * s + 10)) hit++; }
      assert.ok(hit < 2, `${at}: a ${p.sp || p.t} at ${Math.round(p.x / TILE)}, ${Math.round(p.y / TILE)} is drawn over it`);
    }
  }
  // (pinned: ends that stop over water - the long boardwalks out into a lake - and ends on a lawn with no path near)
  console.log('ends over water', inWater, 'ends with no path', noPath);
  assert.ok(inWater <= 2, `ends over water (${inWater})`);
  assert.ok(noPath <= 4, `ends with no path at them (${noPath})`);
});

// The woods' creeks (shared/world3-creeks.js; the redwood overhaul's water, 11-24): laid by the land's own heights
// from a spring in the woods down to water that was there, with riffles and pools; a path goes over on stepping
// stones; nothing stands in it. The first is the sample the owner looked at (Fernwater Creek); the network (11-25,
// his word "Creek looks good let's go with it") is laid by the same rule from springs found on the woods' high ground:
// each to the first water or to a pond in a hollow, under a road in a culvert, never along a path.
// (11-25: the mountains' streams by the same rule - CREEKS3.alp: Granite Peaks had one tarn and no running water)
function checkCreeks(R, kind, NET, named, label) {
  const creeks = (m.natureSites || []).filter((s) => s.kind === kind);
  console.log(label, JSON.stringify(R));
  assert.equal(R.unlaid.length, 0, `creeks that could not be laid: ${R.unlaid}`);
  assert.equal(creeks.length, R.creeks.length);
  const netN = R.creeks.filter((r) => NET.names.includes(r.name)).length;
  assert.equal(R.creeks.length - netN, named, 'the named springs\' creeks');
  assert.ok(netN >= (NET.alp ? 2 : 3) && netN <= NET.n && netN === R.net.laid, `the network: ${netN} creeks of ${NET.n} at most (tried ${R.net.tried}, not laid ${JSON.stringify(R.net.why)})`);
  assert.equal(new Set(creeks.map((c) => c.name)).size, creeks.length, 'each creek its own name');
  for (const [a, c] of creeks.entries()) for (const d of creeks.slice(a + 1)) assert.ok(Math.hypot(c.x - d.x, c.y - d.y) >= NET.apart * TILE * 0.5, `${c.name} and ${d.name}: springs apart`);
  let culverts = 0, ponds = 0;
  const wet = (t) => t === T.WATER || t === T.DEEP, tT = (tx, ty) => (m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1), tAt = (x, y) => tT(Math.floor(x / TILE), Math.floor(y / TILE));
  const sm = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); let a = 0, c = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (m.inside(tx + dx, ty + dy)) { a += m.relief[m.idx(tx + dx, ty + dy)]; c++; } return a / c; };
  for (const [ci, c] of creeks.entries()) {
    const r = R.creeks[ci], L = c.line;
    if (c.name === 'Fernwater Creek') assert.ok(r.tiles >= 100 && r.pools >= 3 && r.riffles >= 3, `${c.name}: ${r.tiles} tiles long, ${r.pools} pools, ${r.riffles} riffles`);
    else assert.ok(r.tiles >= (NET.names.includes(c.name) ? NET.min : CREEKS3.min), `${c.name}: ${r.tiles} tiles long`);
    // under a road: the road's tiles over the creek are a bridge's deck (the owner, 11-25 13:33: "more like a bridge
    // with the road going over it") - no line point left on a plain road tile, deck tiles with road either end
    for (const [x, y] of L) assert.notEqual(tAt(x, y), T.ROAD, `${c.name}: its line on a road tile at ${Math.round(x / TILE)}, ${Math.round(y / TILE)}`);
    if (r.culverts) { culverts += r.culverts; assert.ok(r.decks >= r.culverts * 6, `${c.name}: ${r.decks} deck tiles for ${r.culverts} roads`); const rails = m.props.filter((p) => p && p.t === 'creekrail' && L.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 4 * TILE)).length; assert.equal(rails, r.culverts * 2, `${c.name}: a rail on each edge of the road (${rails})`); }
    // downhill: never higher further on than it was (a point of slack for the smoothing), and well lower at its mouth
    // (its last stretch may cut through a lip to the water it joins: CREEKS3 reach)
    let top = sm(L[0][0], L[0][1]);
    for (const [k, [x, y]] of L.entries()) { const h = sm(x, y); if (k >= L.length - 1 - Math.ceil(NET.reach / 3)) continue; assert.ok(h <= top + 1, `${c.name}: runs uphill at ${Math.round(x / TILE)}, ${Math.round(y / TILE)} (${h.toFixed(1)} after ${top.toFixed(1)})`); top = Math.min(top, h); }
    assert.ok(sm(L[0][0], L[0][1]) - sm(c.mouth[0], c.mouth[1]) >= (r.net ? 1.5 : 5), `${c.name}: falls from spring to mouth`);
    // water all along it, and one water from the spring to the mouth
    for (const [x, y] of L) { const t = tAt(x, y); assert.ok(wet(t) || t === T.BRIDGE, `${c.name}: dry at ${Math.round(x / TILE)}, ${Math.round(y / TILE)}`); }
    const s0 = [Math.floor(L[0][0] / TILE), Math.floor(L[0][1] / TILE)], goal = Math.floor(c.mouth[0] / TILE) + ',' + Math.floor(c.mouth[1] / TILE), seen = new Set([s0.join()]), q = [s0];
    // (along its own run: within 6 tiles of its line - the lake or the river it joins is not searched)
    const near = new Set(); for (const [x, y] of L) { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) near.add((tx + dx) + ',' + (ty + dy)); }
    let hit = false;
    while (q.length && !hit && seen.size < 60000) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy), t = tT(x + dx, y + dy); if (seen.has(k) || !near.has(k) || !(wet(t) || t === T.BRIDGE)) continue; if (k === goal) { hit = true; break; } seen.add(k); q.push([x + dx, y + dy]); } }
    assert.ok(hit, `${c.name}: its water is one from spring to mouth`);
    // the spring in the woods
    const [sx, sy] = s0;
    for (let dy = -CREEKS3.road + 1; dy < CREEKS3.road; dy++) for (let dx = -CREEKS3.road + 1; dx < CREEKS3.road; dx++) { if (dx * dx + dy * dy > (CREEKS3.road - 2) ** 2) continue; const t = tT(sx + dx, sy + dy); assert.ok(t !== T.ROAD && t !== T.LOT, `${c.name}: its spring is ${Math.hypot(dx, dy).toFixed(0)} tiles from a road or a lot`); }
    // nothing standing in it
    const inIt = m.props.filter((p) => p && /^(tree_a|tree_b|redwood)$/.test(p.t) && L.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 36));
    assert.equal(inIt.length, 0, `${c.name}: ${inIt.length} trees standing in it`);
    // a stepping stone is on a deck tile
    const stones = m.props.filter((p) => p && p.t === 'rk' && p.k === 'stone' && L.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 110));
    assert.ok(r.kinds.stones === 0 || stones.length >= 3, `${c.name}: ${r.kinds.stones} stone crossings, ${stones.length} stones`);
    assert.equal(r.kinds.stones + r.kinds.log, r.crossings, `${c.name}: every crossing has its way over`);
    // (most stones stand on a deck tile - a small one beside may be in the water - and they are not all one stone)
    const on = stones.filter((p) => tAt(p.x, p.y - 6) === T.BRIDGE).length;
    assert.ok(stones.length === 0 || on / stones.length >= 0.7, `${c.name}: ${on} of ${stones.length} stones on a deck tile`);
    const nr = new Set(stones.map((p) => p.r)).size, ns = new Set(stones.map((p) => p.s)).size;
    assert.ok(stones.length < 4 || (nr >= 2 && ns >= 2 && (stones.length < 8 || nr + ns >= 6)), `${c.name}: the stones differ (${stones.length} stones: ${nr} sizes, ${ns} shapes)`);
    assert.equal(r.long, 0, `${c.name}: ${r.long} places where it runs along a path`);
    // a pond where it ends in a hollow: water round its mouth
    if (r.pond) {
      ponds++;
      const tx = Math.floor(c.mouth[0] / TILE), ty = Math.floor(c.mouth[1] / TILE);
      let w = 0, deep = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) { const t = tT(tx + dx, ty + dy); if (wet(t)) w++; if (t === T.DEEP) deep++; }
      assert.ok(w >= 24 && deep >= 4, `${c.name}: its pond (${w} tiles of water, ${deep} deep)`);
      if (NET.alp) { const rim = m.props.filter((p) => p && p.t === 'outcrop' && Math.hypot(p.x - c.mouth[0], p.y - c.mouth[1]) < 10 * TILE).length; assert.ok(rim >= 1, `${c.name}: its tarn has granite on its far shore (${rim} outcrops)`); }
    }
  }
  console.log(label + ': the network', JSON.stringify({ creeks: creeks.length, tiles: R.creeks.reduce((a, r) => a + r.tiles, 0), water: R.creeks.reduce((a, r) => a + r.water, 0), pools: R.creeks.reduce((a, r) => a + r.pools, 0), crossings: R.creeks.reduce((a, r) => a + r.crossings, 0), culverts, ponds }));
  // no creek's water on a road, a lot or a building's ground (a car on the road never meets it)
  for (const c of creeks) for (const [x, y] of c.line) { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); assert.ok(!(m.bld && m.bld[m.idx(tx, ty)] >= 0) && tT(tx, ty) !== T.LOT, `${c.name}: through a lot or a building at ${tx}, ${ty}`); }
}
test('the woods\' creeks: each from a spring in the woods downhill to water or a pond, one water, a way over at every path, a culvert under every road', () => checkCreeks(m.world3.woodsCreeks, 'woodscreek', CREEKS3.net, CREEKS3.springs.length, 'woods creeks'));
test('the mountains\' streams: by the creeks\' rule over Granite Peaks - downhill to water or a tarn in a hollow, a way over at every trail, a headwall either side of a road', () => {
  checkCreeks(m.world3.peakCreeks, 'peakcreek', CREEKS3.alp, 0, 'peak creeks');
  // running water in Granite Peaks (11-25: there was none - one tarn in 572,588 tiles of land)
  assert.ok(m.world3.peakCreeks.creeks.reduce((a, r) => a + r.water, 0) >= 1200, 'water laid in the mountains');
  // one of them passes under a road: its deck is checked above, with every other rule (checkCreeks)
  assert.ok(m.world3.peakCreeks.creeks.some((r) => r.culverts), 'a mountain stream under a road');
});
test('no trail runs into open water: every wet stretch of a trail has a deck or stones under it', () => {
  const wet = (t) => t === T.WATER || t === T.DEEP;
  let n = 0;
  for (const s of m.natureSites || []) {
    if (s.kind !== 'trail' || !Array.isArray(s.line)) continue;
    n++;
    for (let k = 1; k < s.line.length; k++) {
      const [x0, y0] = s.line[k - 1], [x1, y1] = s.line[k], L = Math.hypot(x1 - x0, y1 - y0) || 1;
      let run = 0;
      for (let d = 0; d < L; d += 8) { const x = x0 + (x1 - x0) * d / L, y = y0 + (y1 - y0) * d / L, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (m.inside(tx, ty) && wet(m.tiles[m.idx(tx, ty)])) run++; else run = 0; assert.ok(run < 3, `${s.name}: open water under it at ${tx}, ${ty}`); }
    }
  }
  assert.ok(n >= 5, `trails with a line (${n})`);
});

test('sea stacks stand as the sea left them: in open sea, apart, no three in a line, no two one size and shape', () => {
  const S = m.props.filter((p) => p && p.t === 'seastack'), P = S.map((p) => [p.x / TILE, p.y / TILE]);
  console.log('sea stacks', S.length, JSON.stringify(m.world3.stacks));
  assert.ok(S.length >= 15, `the stacks are all still there (${S.length})`);
  assert.ok(!m.world3.stacks.stuck, `none left where the rule could not place it (${m.world3.stacks.stuck})`);
  for (const p of S) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), at = `stack at ${tx}, ${ty}`;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = m.tiles[m.idx(tx + dx, ty + dy)]; assert.ok(t === T.WATER || t === T.DEEP, `${at}: in the water (${dx}, ${dy})`); }
    assert.ok((m.solidProps.get(m.idx(tx, ty)) || []).length >= 1, `${at}: solid`);
  }
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
    assert.ok(Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]) >= STACKS3.apart - 0.01, `two stacks apart (${P[a]} and ${P[b]})`);
    for (let c = b + 1; c < P.length; c++) assert.ok(!inLine3(P[a], P[b], P[c]) && !inLine3(P[a], P[c], P[b]) && !inLine3(P[b], P[a], P[c]), `three in a line: ${P[a]}, ${P[b]}, ${P[c]}`);
  }
  assert.equal(new Set(S.map((p) => `${p.s}:${p.r}:${p.h}`)).size, S.length, 'no two one size and shape');
  assert.ok(new Set(S.map((p) => p.s)).size >= 6, `shapes used (${new Set(S.map((p) => p.s)).size})`);
  const onStack = m.props.filter((g) => g && g.t === 'gull' && S.some((p) => Math.abs(p.x - g.x) < 2 * TILE && Math.abs(p.y - g.y) < 2 * TILE)).length;
  assert.ok(onStack >= m.world3.stacks.gulls, `the gulls that stood on stacks still have a stack under them (${onStack} of ${m.world3.stacks.gulls})`);
});

test('the coast by rule: knees along the marsh\'s water; a scarp of basalt along North Cape, the cove horns as headlands', () => {
  const K = m.props.filter((p) => p && p.t === 'shrub_a' && p.sp === 'knees'), marsh = (m.landmarks || []).filter((l) => l.type === 'marsh');
  const wetBy = (p) => { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) { const t = m.tiles[m.idx(tx + dx, ty + dy)]; if (t === T.WATER || t === T.DEEP) return true; } return false; };
  console.log('marsh knees', JSON.stringify(m.world3.knees), 'marshes', marsh.length);
  assert.ok(marsh.length >= 1 && K.length >= 20 && K.length === m.world3.knees.knees, `knees along the marsh's edge (${K.length} on ${m.world3.knees.edge} edge tiles)`);
  assert.ok(K.length <= m.world3.knees.edge / (KNEES3.one - 1.5), 'a huddle here and there, not a fence of them');
  for (const k of K) { assert.ok(wetBy(k), `knees at ${Math.floor(k.x / TILE)}, ${Math.floor(k.y / TILE)}: at the water's edge`); assert.ok(marsh.some((l) => k.x > l.x - 6 * TILE && k.x < l.x + l.w + 6 * TILE && k.y > l.y - 6 * TILE && k.y < l.y + l.h + 6 * TILE), 'in the marsh, not by a garden pool'); }
  assert.ok(FLORA_SPECIES.includes('knees'), 'the species the page draws');
  // (the west coast's rock, 11-25: no wall piece left on the cape's shore band or at the Egret coves' horns)
  const walls = m.props.filter((p) => p && p.t === 'cliffwall' && !p.relief), west = walls.filter((p) => p.x / TILE < 760);
  assert.equal(west.length, 0, `no straight wall pieces on the west coast (${west.map((p) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)])})`);
  const horns = m.props.filter((p) => p && p.t === 'cliff' && p.rough && p.st === 'basalt' && p.x / TILE < 760);
  assert.equal(horns.length, 7, `the six cove horns and the sea cave's rock are rough headlands (${horns.length})`);
  const scarp = m.props.filter((p) => p && (p.t === 'boulder' || p.t === 'outcrop') && p.style === 'basalt' && Math.abs(p.x / TILE - 478) < 30 && Math.abs(p.y / TILE - 830) < 28);
  assert.ok(scarp.length >= 18 && scarp.some((p) => p.t === 'boulder') && scarp.some((p) => p.t === 'outcrop'), `North Cape's scarp: boulders and outcrops along the band (${scarp.length})`);
  { const bs = scarp.filter((p) => p.t === 'boulder').map((p) => p.s), ow = scarp.filter((p) => p.t === 'outcrop').map((p) => p.w); assert.ok(Math.max(...bs) - Math.min(...bs) >= 14 && Math.max(...ow) - Math.min(...ow) >= 30, `of mixed sizes (boulders ${Math.min(...bs)}-${Math.max(...bs)}, outcrops ${Math.min(...ow)}-${Math.max(...ow)} px wide)`); }
});

test('a fall lands in water: no strip of dry grass or sand between its foot and the water it falls toward', () => {
  const R = m.world3.fallsFeet, falls = m.props.filter((p) => p && FEET3.re.test(p.t));
  console.log('falls feet', JSON.stringify(R));
  assert.ok(falls.length >= 30 && R.falls === falls.length, `every fall looked at (${R.falls} of ${falls.length})`);
  assert.ok(R.short >= 4 && R.flooded >= R.short, `the short ones brought to water (${R.short}, ${R.flooded} tiles)`);
  const wet = (x, y) => m.tiles[m.idx(x, y)] === T.WATER || m.tiles[m.idx(x, y)] === T.DEEP, soft = (x, y) => { const t = m.tiles[m.idx(x, y)]; return t === T.GRASS || t === T.SAND; };
  const short = [];
  for (const p of falls) {
    const tx = Math.floor(p.x / TILE); let ty = Math.floor(p.y / TILE), lip = 0;
    if (wet(tx, ty)) continue;
    while (lip < FEET3.lip && m.tiles[m.idx(tx, ty)] === T.WALL) { ty++; lip++; }
    let y1 = ty; while (y1 - ty < FEET3.reach && soft(tx, y1)) y1++;
    const X = (tx + 0.5) * TILE, Y = (y1 + 0.5) * TILE;
    if ((m.pools || []).some((r) => (r.ring ? Math.abs(Math.hypot((X - r.ring.cx) / r.ring.rx, (Y - r.ring.cy) / r.ring.ry) - 1) * Math.min(r.ring.rx, r.ring.ry) < r.ring.hw + 16 : X >= r.x - 16 && X < r.x + r.w + 16 && Y >= r.y - 16 && Y < r.y + r.h + 16))) continue;   // (a swimming pool's own little fall)
    if (y1 > ty && wet(tx, y1) && y1 * TILE - p.y >= FEET3.min) short.push(`${p.t} at ${tx}, ${Math.floor(p.y / TILE)}: ${y1 * TILE - p.y} px dry`);
  }
  assert.equal(short.length, 0, `falls that land short of their water: ${short.join('; ')}`);
  // (the gorge's own: its fall's foot is wet now - the salmon's climb starts in water)
  const gorge = m.natureSites.find((s) => s.kind === 'gorge');
  if (gorge && gorge.falls) { const gx = Math.floor(gorge.falls.x / TILE), gy = Math.floor(gorge.falls.y / TILE); let ok = false; for (let d = 0; d <= 3; d++) if (wet(gx, gy + d)) ok = true; assert.ok(ok, `Fern Gorge's fall has water within three tiles of its lip (${gx}, ${gy})`); }
});

