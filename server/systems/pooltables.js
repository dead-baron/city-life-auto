// The pool tables out in the world, and what's on them for everyone near (the owner, 2026-11-13: NPCs playing pool
// should look real - "Balls should move on the table if possible" - and a game should be watchable from outside the
// minigame, like walking into a bar and seeing a game going). A table is the Rusty Spur's (its bar room's: where
// client/art2/game/statics.js roadhouseRoom draws it) or a bar's fitted out with one (shared/shoprooms.js: a 'pool'
// piece - a sports bar's, a small saloon's); an arcade's floor and a home's games room are levels of their own, not the
// world's, and keep their tables to the minigame.
//   tablesOf(map) -> [{ key, b (the building), x0, y0, x1, y1, cx, cy (the rim, world px), f (the felt: shared/pool.js) }]
//   tableAt(map, x, y, reach) -> the table whose rim (x, y) is within reach of, or null
// What's on a table - its balls, played by the NPCs at it (poolnpc.js) or a player's match (poolmatch.js) - goes to the
// pages near it and nowhere else: each table keeps who it has told (its subs: a page whose view it's in, checked twice a
// second); a page coming near is sent the table as it stands, and then each shot as it's played.
//   { e: 'ptab', k, f, bi, b, r }                 the table: its felt, its building, the balls ([n, x, y, ...]), rev
//   { e: 'pshot', k, b, v: [vx, vy], by, r, x, y } a shot: the balls where they lay, the cue ball's velocity, who struck
//                                                  (a person's id: their stroke on the page; 0 the computer)
// The page plays each shot out itself with the same physics (client/poolview.js): a few hundred bytes a shot, nothing
// while the balls roll. Nobody near: nothing sent, nothing kept but the table's last balls.
import { TILE } from '../../shared/constants.js';
import { shopRoom } from '../../shared/shoprooms.js';
import { packBalls, idleBalls } from '../../shared/pool.js';
import { viewRect } from '../view.js';

// the Rusty Spur's pool table { x0, y0, x1, y1, cx, cy } in world px, or null: the bar room's layout as roadhouseRoom
// (client/art2/game/statics.js) draws it - one section, the floor in front of the bar, the table 30% along it
export function poolTable(map) {
  const R = map.roadhouse, b = R && map.buildings[R.b], wi = b && b.walkIn, u = wi && wi.units.find((q) => q.kind === 'roadhouse');
  if (!u) return null;
  const ox = b.tx * TILE, oy = b.ty * TILE, ux0 = (Math.max(u.x0, b.tx) - b.tx) * TILE, ux1 = (Math.min(u.x1, b.tx + b.tw - 1) - b.tx + 1) * TILE;
  const Ya = (u.counterRow - b.ty) * TILE + 44, Yb = (wi.y1 - b.ty + 1) * TILE - 6, mid = (Ya + Yb) / 2, x0 = ux0 + 36, W = ux1 - ux0 - 72;
  if (Yb - Ya < 60 || W < 300) return null;
  const tx = ox + Math.round(x0 + W * 0.3), ty = oy + Math.round(mid - 22);
  return { x0: tx, y0: ty, x1: tx + 100, y1: ty + 52, cx: tx + 50, cy: ty + 26 };
}

const TABLES = new WeakMap();
export function tablesOf(map) {
  let L = TABLES.get(map);
  if (L) return L;
  L = [];
  const spur = map.roadhouse ? poolTable(map) : null;
  // (the felt: the rim's 5 px in, at the top of the 20 px rail - as both painters lay it)
  if (spur) L.push({ key: 'spur', b: map.roadhouse.b, ...spur, f: [spur.x0 + 5, spur.y0 + 5, spur.x1 - 5, spur.y1 - 5, 21], spur: true });
  (map.buildings || []).forEach((b, bi) => {
    if (!b || !b.walkIn) return;
    for (const u of b.walkIn.units) {
      if (u.kind === 'roadhouse' || u.kind === 'coffee') continue;   // (the Spur's: above)
      const R = shopRoom(b, u, TILE, map);
      if (!R) continue;
      for (const p of R.pieces) {
        if (p.t !== 'pool') continue;
        const x0 = Math.round(p.x0), y0 = Math.round(p.y0), x1 = Math.round(p.x1), y1 = Math.round(p.y1);
        L.push({ key: `t${bi}:${x0},${y0}`, b: bi, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, f: [x0 + 5, y0 + 5, x1 - 5, y1 - 5, (p.h || 20) + 1] });
      }
    }
  });
  TABLES.set(map, L);
  return L;
}
export const tableByKey = (map, key) => tablesOf(map).find((t) => t.key === key) || null;
const rimD = (T, x, y) => Math.hypot(Math.max(T.x0 - x, 0, x - T.x1), Math.max(T.y0 - y, 0, y - T.y1));
export function tableAt(map, x, y, reach) {
  let best = null, bd = reach;
  for (const T of tablesOf(map)) { const d = rimD(T, x, y); if (d <= bd) { bd = d; best = T; } }
  return best;
}
export const nearTable = (T, o, pad) => !!(o && o.ped && !o.ped.dead && !o.ped.vehId && !o.ped.hidden && rimD(T, o.ped.x, o.ped.y) <= pad);

// ---- what's on each table, and who's been told -----------------------------------------------------------------------
const seedOf = (k) => { let h = 7; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); return h >>> 0; };
export function stateOf(world, T) {
  const S = (world.poolTabs ||= new Map());
  let s = S.get(T.key);
  if (!s) S.set(T.key, (s = { T, balls: idleBalls(seedOf(T.key)), r: 0, subs: new Map() }));
  return s;
}
const send = (q, ev) => { if (q && q.conn) (q.evq ||= []).push(ev); };
const tabMsg = (s) => ({ e: 'ptab', k: s.T.key, f: s.T.f, bi: s.T.b, b: packBalls(s.balls), r: s.r });
// the table's balls are these now (a rack, a respot, a game handed over): everyone near is told
export function publish(world, T, balls) {
  const s = stateOf(world, T);
  s.balls = balls; s.r++;
  const m = tabMsg(s);
  for (const pid of s.subs.keys()) send(world.players.get(pid), m);
}
// a shot: from (packBalls: the balls before it, settled), v the cue ball's velocity (pool.js cueVel), by who struck; the
// caller then plays it out on balls (the table's own: what a page coming near later is sent)
export function shot(world, T, balls, from, v, by) {
  const s = stateOf(world, T);
  s.balls = balls; s.r++;
  const m = { e: 'pshot', k: T.key, b: from, v, by: by | 0, r: s.r, x: Math.round(T.cx), y: Math.round(T.cy) };
  for (const pid of s.subs.keys()) send(world.players.get(pid), m);
  (world.poolShots ||= { n: 0 }).n++;   // (tests, the profile)
}
// twice a second: the pages a table's in view of (and a little past) are told it as it stands when they come near
const tmp = {}, PAD = 220;
export function update(world) {
  if (world.tick % 10 !== 4) return;
  const L = tablesOf(world.map);
  if (!L.length) return;
  for (const T of L) {
    let s = world.poolTabs && world.poolTabs.get(T.key);
    for (const p of world.players.values()) {
      const on = !!(p.conn && p.ped && !p.ped.ug && !(p.ped.hidden && p.ped.home) && viewRect(world, p, tmp) && T.cx >= tmp.x0 - PAD && T.cx <= tmp.x1 + PAD && T.cy >= tmp.y0 - PAD && T.cy <= tmp.y1 + PAD);
      if (!on) { if (s && s.subs.has(p.pid)) s.subs.delete(p.pid); continue; }
      s ||= stateOf(world, T);
      if (s.subs.get(p.pid) === p.conn) continue;
      s.subs.set(p.pid, p.conn);
      send(p, tabMsg(s));
    }
    if (s) for (const pid of [...s.subs.keys()]) if (!world.players.has(pid)) s.subs.delete(pid);
  }
}
