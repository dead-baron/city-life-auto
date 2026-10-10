// The Grand Theatre (the layout and the films: shared/cinema.js). Buy a ticket (and popcorn) at the counter - its shop
// menu, shared/items.js SHOPS.cinema - walk into a screen and sit in a seat with the action button: the film starts (or
// you join the one that's on) and the ticket is torn. The room goes dark and the screen's light falls on the audience
// (client/cinema.js draws the film). Get up, walk out or go down and it ends for you; when the film ends, everyone
// watching is told and gets up. A few NPCs watch in each room while a player is near.
import { CINE, FILMS, filmFor, roomAt } from '../../shared/cinema.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';

const rng = mulberry32(1414);
const SIT_PX = 26, MOVE_PX = 10;
const cin = (world) => world.map.cinema || null;
const st = (world) => (world.cine ||= { rooms: (cin(world) ? cin(world).rooms : []).map(() => ({ film: -1, t0: 0, k: 0, npcs: [] })) });

// who's in a seat (a player's ped or an NPC): the seat taken
function seatTaken(world, R, s, except) {
  for (const p of world.players.values()) { const c = p.cine; if (c && c.room === R.i && c.seat === s && p.ped !== except) return true; }
  return st(world).rooms[R.i].npcs.some((n) => n.seat === s);
}
// the free seat nearest (x, y) in a room
function freeSeat(world, R, x, y, except) {
  let best = -1, bd = Infinity;
  R.seats.forEach((q, s) => { const d = Math.hypot(q.x - x, q.y - y); if (d < bd && !seatTaken(world, R, s, except)) { bd = d; best = s; } });
  return best;
}
// what's on in a room (starting the next film if nothing is)
function showing(world, ri) {
  const S = st(world).rooms[ri];
  if (S.film < 0 || world.time >= S.t0 + CINE.FILM_S) { S.film = filmFor(ri, S.k++); S.t0 = world.time; }
  return S;
}

export function interaction(world, p) {
  const C = cin(world), ped = p.ped;
  if (!C || !ped || ped.vehId || ped.hidden || ped.dead) return null;
  if (p.cine) return { label: `Get up (stop watching "${FILMS[p.cine.film].title}")`, run: () => leave(world, p, 'You get up.') };
  const ri = roomAt(C, ped.x, ped.y);
  if (ri < 0) return null;
  const R = C.rooms[ri], s = freeSeat(world, R, ped.x, ped.y, ped);
  if (s < 0 || Math.hypot(R.seats[s].x - ped.x, R.seats[s].y - ped.y) > SIT_PX * 3) return null;
  const has = (p.profile.inventory.filmTicket || 0) > 0;
  return { label: has ? 'Sit down and watch the film (your ticket)' : `Sit down - you need a ticket ($${CINE.TICKET} at the counter)`, run: () => { const e = sit(world, p, ri, s); if (e) world.notify(p, e, 'bad'); } };
}

// take a seat with a ticket: the film starts or you join it
export function sit(world, p, ri, s) {
  const C = cin(world), ped = p.ped, R = C && C.rooms[ri];
  if (!R || !ped) return 'There\'s no screen here.';
  if (p.cine) return 'You\'re watching already.';
  const inv = p.profile.inventory;
  if ((inv.filmTicket || 0) <= 0) return `You need a ticket: $${CINE.TICKET} at the counter in the lobby.`;
  if (s === undefined || s < 0 || seatTaken(world, R, s, ped)) s = freeSeat(world, R, ped.x, ped.y, ped);
  if (s < 0) return 'Every seat is taken.';
  inv.filmTicket--;
  if (inv.filmTicket <= 0) delete inv.filmTicket;
  // (the first player in the room gets the film from the start; the NPCs don't mind)
  if (![...world.players.values()].some((o) => o !== p && o.cine && o.cine.room === ri)) { const Sr = st(world).rooms[ri]; Sr.film = filmFor(ri, Sr.k++); Sr.t0 = world.time; }
  const q = R.seats[s], S = showing(world, ri);
  ped.x = q.x; ped.y = q.y; ped.a = q.a; ped.vx = 0; ped.vy = 0;
  if (world.place) world.place(ped);
  ped.sitBench = true; ped.seat2 = null; ped.appVer = (ped.appVer || 0) + 1;
  p.teleportAt = world.time;
  p.cine = { room: ri, seat: s, film: S.film, x: q.x, y: q.y };
  p.meDirty = true;
  const left = Math.max(1, Math.round(S.t0 + CINE.FILM_S - world.time));
  world.notify(p, `Screen ${ri + 1}: "${FILMS[S.film].title}" - ${FILMS[S.film].tag}. ${left < CINE.FILM_S - 2 ? `${left}s to go. ` : ''}Popcorn's eaten from your bag; get up to leave.`, 'good');
  return null;
}
export function leave(world, p, say) {
  const c = p.cine;
  if (!c) return;
  p.cine = null; p.meDirty = true;
  const ped = p.ped;
  if (ped && ped.sitBench && !p.custody) { ped.sitBench = false; ped.seat2 = null; ped.appVer = (ped.appVer || 0) + 1; }
  if (say) world.notify(p, say, 'info');
}

// ---- NPCs watching while a player is near ----------------------------------------------------------------------------------
function fillRoom(world, ri) {
  const C = cin(world), R = C.rooms[ri], S = st(world).rooms[ri];
  showing(world, ri);
  while (S.npcs.length < CINE.NPC_PER_ROOM) {
    let s = -1;
    for (let k = 0; k < 8 && s < 0; k++) { const t = Math.floor(rng() * R.seats.length); if (!seatTaken(world, R, t)) s = t; }
    if (s < 0) break;
    const q = R.seats[s], c = spawnNpc(world, 'casual', q.x, q.y, 'civ');
    c.npc.desk = { x: q.x, y: q.y, a: q.a }; c.npc.keep = true; c.npc.watcher = ri;
    c.a = q.a; c.sitBench = true; c.seat2 = null; c.appVer = (c.appVer || 0) + 1;
    S.npcs.push({ id: c.id, seat: s });
  }
}
function emptyRoom(world, ri) {
  const S = st(world).rooms[ri];
  for (const n of S.npcs) { const c = world.get(n.id); if (c && !c.removed) despawnNpc(world, c); }
  S.npcs = [];
}

export function update(world) {
  const C = cin(world);
  if (!C) return;
  const S = st(world);
  // players: walked off the seat, went down, the film ended
  for (const p of world.players.values()) {
    const c = p.cine;
    if (!c) continue;
    const ped = p.ped;
    if (!ped || ped.dead || ped.removed || ped.vehId || Math.hypot(ped.x - c.x, ped.y - c.y) > MOVE_PX) { leave(world, p, ped && !ped.dead ? 'You leave your seat - the film goes on without you.' : null); continue; }
    const R = S.rooms[c.room];
    if (R.film !== c.film || world.time >= R.t0 + CINE.FILM_S) leave(world, p, `The end: "${FILMS[c.film].title}". The lights come up.`);
  }
  if (world.tick % 20 !== 11) return;
  // the NPC audience: hurt or gone, they're dropped; nobody near, they leave
  for (const R of S.rooms) R.npcs = R.npcs.filter((n) => { const c = world.get(n.id); return c && !c.dead && !c.removed && !(c.npc && c.npc.state === 'flee'); });
  let near = Infinity;
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) near = Math.min(near, Math.hypot(p.ped.x - C.counter.x, p.ped.y - C.counter.y));
  if (near > CINE.FAR_PX) { S.rooms.forEach((R, ri) => { if (R.npcs.length) emptyRoom(world, ri); }); return; }
  if (near <= CINE.NEAR_PX) S.rooms.forEach((R, ri) => fillRoom(world, ri));
}

// for the HUD ('me') and client/cinema.js: the film you're watching and how far in it is
export function meInfo(world, p) {
  const c = p.cine;
  if (!c) return null;
  const R = st(world).rooms[c.room];
  return { room: c.room, seat: c.seat, film: c.film, at: Math.round((world.time - R.t0) * 10) / 10, len: CINE.FILM_S };
}
// the HUD tracker (the job slot)
export function targetFor(world, p) {
  const c = p.cine, C = cin(world);
  if (!c || !C) return null;
  const R = st(world).rooms[c.room], left = Math.max(0, Math.round(R.t0 + CINE.FILM_S - world.time)), Rm = C.rooms[c.room];
  return { text: `Screen ${c.room + 1}: "${FILMS[c.film].title}" · ${left}s left`, x: (Rm.screen.x0 + Rm.screen.x1) / 2, y: Rm.backEdge, stage: 'cinema' };
}
