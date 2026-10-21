// Rivers part 2 (shared/world3-rapids.js): the rapids where the land falls fast under a river, the calm pockets below them
// and under the cut banks of the bends; the fishing's 'pocket' spot (server/systems/fishing.js habitatAt) and its big
// trout (shared/fish.js POCKET); the anglers' boats (server/systems/boats.js); the bake's white water and still pockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { RAPIDS, POCKETS, rapidsAndPockets3 } from '../shared/world3-rapids.js';
import { LEDGES3 } from '../shared/world3-ledgefalls.js';
import * as FS from '../shared/fish.js';

// a stand-in map: water stamped round a centre line (half-width hw tiles), the land's height from hAt(x, y)
function standIn(W, H, lines, hAt) {
  const m = { w: W, h: H, tiles: new Uint8Array(W * H).fill(T.GRASS), river: new Uint8Array(W * H), lake: new Uint8Array(W * H), relief: new Float32Array(W * H), waters: { ch: [], lk: [] } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m.relief[y * W + x] = hAt(x, y);
  for (const { pts, w } of lines) {
    const hw = w / 2;
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      for (let y = Math.floor(Math.min(ay, by) - hw - 1); y <= Math.ceil(Math.max(ay, by) + hw + 1); y++) for (let x = Math.floor(Math.min(ax, bx) - hw - 1); x <= Math.ceil(Math.max(ax, bx) + hw + 1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / (L2 || 1))), ex = x + 0.5 - ax - dx * t, ey = y + 0.5 - ay - dy * t;
        if (ex * ex + ey * ey <= hw * hw) { m.tiles[y * W + x] = T.WATER; m.river[y * W + x] = 1; }
      }
    }
    m.waters.ch.push({ k: w >= 30 ? 'river' : 'creek', w, t: 'forest', v: 0.6, pts });
  }
  return m;
}
const wet = (m, x, y) => { const i = Math.round(y) * m.w + Math.round(x); return m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP; };

test('rapids where the land falls fast; an eddy below, hugging the bank; a pool on the outside of a bend; none by a bridge', () => {
  // a creek running east (x 10 -> 330 at y 60), steep between x 140 and 190; and a river running east then bending south
  // (flat) - with a footbridge across the creek at x 300
  const bend = [];
  for (let x = 10; x <= 150; x += 2) bend.push([x, 160]);
  for (let a = 1; a <= 18; a++) { const th = a / 18 * Math.PI / 2; bend.push([150 + Math.sin(th) * 30, 190 - Math.cos(th) * 30]); }
  for (let y = 192; y <= 330; y += 2) bend.push([180, y]);
  const creek = []; for (let x = 10; x <= 330; x += 2) creek.push([x, 60]);
  const m = standIn(360, 360, [{ pts: creek, w: 22 }, { pts: bend.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), w: 34 }], (x, y) => (y < 110 ? (x < 140 ? 60 - x * 0.02 : x < 190 ? 57.2 - (x - 140) * 0.32 : 41.2 - (x - 190) * 0.02) : 30));
  for (let y = 50; y <= 70; y++) for (let x = 298; x <= 302; x++) m.tiles[y * m.w + x] = T.BRIDGE;
  const r = rapidsAndPockets3(m);
  const [C, B] = m.waters.ch;
  assert.ok(C.r && C.r.length === 1, `one rapid on the creek (${JSON.stringify(C.r)})`);
  const [s0, s1, k] = C.r[0];
  assert.ok(s0 > 115 && s0 < 140 && s1 > 175 && s1 < 200 && k >= 0.45 && k <= 1, `over the steep stretch (${s0}..${s1}, ${k})`);
  assert.ok(!B.r, 'no rapid on the flat river');
  assert.ok(r.rapidTiles > 40 && r.riverTiles > 600, JSON.stringify(r));
  // the eddy: just below the rapid, by a bank (land within a couple of tiles of its edge), all its water open
  const ed = (C.p || []).filter((p) => p[3] === 0);
  assert.equal(ed.length, 1, `an eddy below the rapid (${JSON.stringify(C.p)})`);
  const [ex, ey, er] = ed[0];
  assert.ok(ex > 10 + s1 && ex < 10 + s1 + POCKETS.below[1] + 4, `below it (${ex})`);
  assert.ok(Math.abs(ey - 60) + er > 22 / 2 - 2.5 && Math.abs(ey - 60) + er <= 22 / 2, `hugging the bank (${ey}, r ${er})`);
  for (let dy = -er; dy <= er; dy++) for (let dx = -er; dx <= er; dx++) if (dx * dx + dy * dy <= er * er) assert.ok(wet(m, ex + dx, ey + dy), 'all water');
  // the bend pool: on the outside of the bend (further from the bend's centre, 150,190, than the centre line)
  const pl = (B.p || []).filter((p) => p[3] === 1);
  assert.ok(pl.length >= 1, `a pool in the bend (${JSON.stringify(B.p)})`);
  for (const [x, y] of pl) assert.ok(Math.hypot(x - 150, y - 190) > 30 + 4, `on the outside (${x}, ${y}: ${Math.hypot(x - 150, y - 190).toFixed(1)})`);
  // nothing by the bridge
  for (const c of m.waters.ch) for (const [x] of c.p || []) assert.ok(Math.abs(x - 300) > 8, 'no pocket by the bridge');
  // no two pockets close
  const all = m.waters.ch.flatMap((c) => c.p || []);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]) >= POCKETS.apart - 0.01, 'apart');
});

test('a calm pocket: the trout and the bass hold there - likelier, and heavier', () => {
  const tab = (spot) => new Map(FS.biteTable({ water: 'river', spot }, { when: 'day' }).map(([f, w]) => [f.id, w]));
  const open = tab(null), pocket = tab('pocket');
  for (const id of ['rainbow', 'browntrout', 'cutthroat', 'smallmouth', 'bass']) assert.ok(pocket.get(id) > open.get(id) * 1.4, `${id} likelier in a pocket`);
  assert.equal(pocket.get('carp'), open.get('carp'), 'the carp as anywhere');
  const f = FS.FISH_BY_ID.browntrout, seq = (n) => { let s = n; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  let a = 0, b = 0; for (let i = 1; i <= 400; i++) { a += FS.weighFish(f, seq(i)); b += FS.weighFish(f, seq(i), FS.POCKET.heavy); }
  assert.ok(b > a * 1.3, `heavier (${(a / 400).toFixed(1)} -> ${(b / 400).toFixed(1)} lb)`);
});

test('the anglers\' boats: one sits still with the rod out over the side, rows on to the next spot, puts the rod down when taken', async () => {
  const { makeWorld, joinPlayer, run, teleport } = await import('./helpers.js');
  const boats = await import('../server/systems/boats.js');
  const players = await import('../server/systems/players.js');
  const { PF } = await import('../shared/constants.js');
  const w = makeWorld({ npcBudget: 60 });
  const { p } = joinPlayer(w);
  // (open water: an offshore point with open sea 700 px east of it; the anglers' spots stood in for by two points on it)
  const open = (q) => { for (let dx = 0; dx <= 800; dx += 40) if (w.map.tileAtPx(q.x + dx, q.y) !== T.DEEP) return false; return true; };
  const mid = Math.floor(w.map.offshore.length / 2), sp = w.map.offshore.slice(mid).find(open) || w.map.offshore[mid];
  Object.defineProperty(w.map, '_fishSpots', { value: [{ x: sp.x, y: sp.y }, { x: sp.x + 600, y: sp.y }], configurable: true });
  teleport(w, p.ped, sp.x - 900, sp.y);
  const v = boats.spawnFisher(w, { x: sp.x, y: sp.y }), d = w.get(v.seats[0]);
  assert.ok(v.model === 'rowboat' || v.model === 'dinghy', v.model);
  run(w, 2);
  assert.equal(v.ai && v.ai.kind, 'fisher');
  assert.ok(d.fishing && d.fishing.npc && (players.pedFlags(w, d) & PF.FISHING), 'the rod out');
  assert.ok(Math.hypot(v.vx, v.vy) < 30, 'sat still');
  v.ai.until = w.time;   // (time to move on)
  run(w, 3);
  assert.ok(v.ai.to && !d.fishing && v.x > sp.x + 40, `rowing on to the next spot (${Math.round(v.x - sp.x)} px)`);
  run(w, 12);
  assert.ok(!v.ai.to && Math.hypot(v.x - sp.x - 600, v.y - sp.y) < 120, 'there');
  run(w, 2);
  assert.ok(d.fishing, 'the rod out again');
  // taken: the angler out, the rod down, the boat yours
  d.vehId = 0; v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0;
  run(w, 0.5);
  assert.ok(!v.ai && !d.fishing, 'the rod down');
});

test('World v3: the rapids and calm pockets along the rivers; the fishing finds the pockets; the bake draws them; the ledge falls', { timeout: 400000 }, async () => {
  const { generateCity } = await import('../shared/map.js');
  await import('../shared/world3-islands.js');
  const { FRAME_W, FRAME_H } = await import('../shared/world3.js');
  const { prepare } = await import('../tools/world3-build.mjs');
  const { habitatAt } = await import('../server/systems/fishing.js');
  const { bakeGround, CHUNK } = await import('../client/art2/game/groundbake.js');
  const { F_GROUND, F_WATER, F_WET, F_NOCAST } = await import('../client/art2/gbuf.js');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const S = m.world3.rapids;
  console.log('rapids and pockets', JSON.stringify(S));
  assert.ok(S.rapids >= 8 && S.rapidTiles / S.riverTiles > 0.04 && S.rapidTiles / S.riverTiles < 0.15, `rapids on the steep tenth or so of the rivers (${JSON.stringify(S)})`);
  const CH = m.waters.ch, pockets = CH.flatMap((c) => c.p || []);
  const LF = m.world3.ledges;   // (the ledge falls' plunge pools join them: shared/world3-ledgefalls.js)
  assert.ok(S.eddies >= 4 && S.pools >= 8 && pockets.length === S.eddies + S.pools + LF.pools, `eddies and bend pools (${S.eddies}, ${S.pools}, ${LF.pools})`);
  for (const c of CH) for (const [s0, s1, k] of c.r || []) { assert.ok(c.k === 'river' || c.k === 'creek'); assert.ok(s1 - s0 >= RAPIDS.min - 0.01 && k >= 0.45 && k <= 1); }
  const W = m.w, at = (x, y) => Math.round(y) * W + Math.round(x);
  let hug = 0;
  for (const [x, y, r] of pockets) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const i = at(x + dx, y + dy);
      assert.ok((m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && m.river[i] && !m.lake[i], `pocket ${x},${y}: open river water`);
    }
    let land = false;
    for (let a = 0; a < 16 && !land; a++) { const th = a / 16 * Math.PI * 2, q = at(x + Math.cos(th) * (r + 3), y + Math.sin(th) * (r + 3)); if (m.tiles[q] !== T.WATER && m.tiles[q] !== T.DEEP && m.tiles[q] !== T.BRIDGE) land = true; }
    if (land || pockets.find((q) => q[0] === x && q[1] === y)[3] === 2) hug++;   // (a plunge pool lies below its falls' middle)
  }
  assert.ok(hug >= pockets.length * 0.9, `the pockets hug a bank (${hug} of ${pockets.length})`);
  // the fishing: a cast into a pocket finds it
  const world = { map: m };
  const found = pockets.filter(([x, y]) => habitatAt(world, x * TILE, y * TILE).spot === 'pocket').length;
  assert.ok(found >= pockets.length * 0.8, `the fishing's pocket spot (${found} of ${pockets.length})`);
  // the bake: the wildest rapid's chunk runs fast and white; a pocket's middle lies still
  const words = (cx, cy, px, py) => {
    const G = bakeGround(m, cx, cy, { quality: 1, seed: 1337 }), o = { fast: 0, run: 0, foam: 0, still: 0, near: 0 };
    for (let i = 0; i < G.w * G.h; i++) {
      const f = G.flag[i];
      if (!(f & F_WATER) || !(f & F_GROUND) || (f & F_WET) || !(f & F_NOCAST)) continue;
      const c = G.col[i * 4 + 3];
      if (c >= 128 && c < 192) { o.run++; if ((c - 128) & 2) o.fast++; }
      if (G.col[i * 4] > 200 && G.col[i * 4 + 1] > 215 && G.col[i * 4 + 2] > 210) o.foam++;
      if (px !== undefined) { const x = cx * CHUNK + (i % G.w), y = cy * CHUNK + Math.floor(i / G.w); if (Math.hypot(x - px, y - py) < 40) { o.near++; if (c >= 192 && c < 232) o.still++; } }
    }
    return o;
  };
  let best = null;
  for (const c of CH) for (const [s0, s1, k] of c.r || []) if (!best || k * (s1 - s0) > best.k * (best.s1 - best.s0)) best = { c, s0, s1, k };
  let s = 0, mid = null;
  for (let j = 1; j < best.c.pts.length && !mid; j++) { const a = best.c.pts[j - 1], b = best.c.pts[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s + l >= (best.s0 + best.s1) / 2) { const t = ((best.s0 + best.s1) / 2 - s) / l; mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; } s += l; }
  const C = CHUNK / TILE, rap = words(Math.floor(mid[0] / C), Math.floor(mid[1] / C));
  const pk = pockets.find((p) => p[2] >= 5) || pockets[0], pw = words(Math.floor(pk[0] / C), Math.floor(pk[1] / C), pk[0] * TILE, pk[1] * TILE);
  console.log('bake', JSON.stringify({ rap, pw }));
  assert.ok(rap.fast > rap.run * 0.5 && rap.foam > 3000, `the rapid: fast, white water (${JSON.stringify(rap)})`);
  assert.ok(pw.near > 1000 && pw.still > pw.near * 0.6, `the pocket: still in its middle (${JSON.stringify(pw)})`);
  // the falls chain, part 2 (shared/world3-ledgefalls.js): four steep reaches start with a fall - its lip a row of rock
  // from bank to bank (boats stop at it; a swimmer goes down it, never up), drawn as the water over it; a plunge pool
  // below the last ledge, where the fishing finds the falls' fish; the white water after the pool; a bench and a sign
  console.log('ledge falls', JSON.stringify(LF));
  assert.equal(LF.falls, LEDGES3.length, `the ledge falls (${LF.names})`);
  assert.ok(LF.steps >= LEDGES3.length + 2 && LF.pools >= 3 && LF.benches === LEDGES3.length, JSON.stringify(LF));
  const { dropsOf } = await import('../shared/ledges.js');
  const drops = dropsOf(m), sites = m.natureSites.filter((q) => q.kind === 'ledgefall');
  assert.equal(sites.length, LF.steps);
  for (const q of sites) {
    const ly = Math.round((q.falls.y + 8) / TILE) - 1, xa = Math.ceil((q.falls.x - q.falls.w / 2 + 8) / TILE), xb = Math.floor((q.falls.x + q.falls.w / 2 - 8) / TILE) - 1;
    let lip = 0, drop = 0;
    for (let x = xa; x <= xb; x++) { const i = ly * W + x; if (m.tiles[i] === T.WALL && (m.reserve[i] & 96) === 96) lip++; if (drops.has(i)) drop++; }
    assert.equal(lip, xb - xa + 1, `${q.name} (${q.step}): its lip right across (${lip} of ${xb - xa + 1})`);
    assert.ok(m.land[ly * W + xa - 1] && m.land[ly * W + xb + 1], `${q.name}: bank to bank`);
    assert.ok(drop === lip, `${q.name}: a one-way drop (${drop})`);
    assert.ok(q.segs.length >= 1 && q.segs.every((g) => g.up.length >= 2 && Math.abs(g.y - (ly + 1) * TILE) < TILE * 1.5), `${q.name}: drawn along it, in strands`);
    for (const [cx, cy] of [[Math.round(xa + (xb - xa) * 0.25), ly], [Math.round((xa + xb) / 2), ly], [Math.round(xa + (xb - xa) * 0.75), ly]]) {   // (across it, clear of the banks' wet sand)
      const G = bakeGround(m, Math.floor(cx * TILE / CHUNK), Math.floor(cy * TILE / CHUNK), { quality: 1, seed: 1337 }), px = cx * TILE + 16 - Math.floor(cx * TILE / CHUNK) * CHUNK, py = cy * TILE + 16 - Math.floor(cy * TILE / CHUNK) * CHUNK;
      assert.ok(G.flag[py * G.w + px] & F_WATER, `${q.name}: the lip drawn as water`);
    }
  }
  for (const name of LF.names) {
    const last = sites.filter((q) => q.name === name).pop();
    const pool = pockets.find((p) => p[3] === 2 && Math.abs(p[0] * TILE - last.falls.x) < last.falls.w / 2 && p[1] * TILE > last.falls.y && p[1] * TILE < last.falls.y + 16 * TILE);
    if (pool) assert.equal(habitatAt(world, pool[0] * TILE, pool[1] * TILE).spot, 'falls', `${name}: the falls' fish in its pool`);
    assert.ok(m.props.some((p) => p && p.t === 'pbench' && Math.hypot(p.x - last.falls.x, p.y - last.falls.y) < Math.max(40 * TILE, last.falls.w)), `${name}: a bench looking at it`);
    assert.ok(m.props.some((p) => p && p.t === 'textsign' && p.text === name.toUpperCase()), `${name}: its sign`);
  }
});
