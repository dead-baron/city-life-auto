// Nightclubs after dark (task #432). The owner: "NPCs dancing at a night club won't leave the club when morning comes. At
// some point after sunrise the dance club should wind down and all the NPCs should walk out." And: "Nightclubs should have
// bouncers outside when the club is open that will attack you or any NPC that you or an NPC attacks anyone in the night
// club while it's active. That also includes anyone standing in line for the night club. Any nightclub patron is
// protected by the bouncer who fights with their fists but is strong like a brute."
//
// Every club (shared/map.js buildInteriors: a walk-in unit of kind 'club' behind a roller shutter, map.gates[poi.gate]):
//   closed   all day: the shutter down, nobody about
//   open     from dusk (the clock's isNight): the shutter up and the music on (the 'club' event and the welcome's list:
//            client/sound/places.js plays the club's song only while it's on). While a player is near: people dancing on
//            the floor (the dance pose: gt 'dance'), a line outside along the front (on the velvet rope's side where there's
//            room), and one or two bouncers either side of the door. Now and then the bouncer lets the next one in (they
//            walk in and dance); once the floor's full, now and then someone heads home and the line moves up.
//   closing  from the end of the night (isNight goes off, half an hour after sunrise): the music stops, the dancers stop
//            and walk out of the door and off down the street (npc.js leaveBuilding), the line breaks up and goes; the
//            shutter comes down once the floor's empty (CLUB_CLOSE_MAX_S at the latest), and the bouncers go home too.
// The bouncers (role 'bouncer'): built like brutes (BOUNCER_HP, BOUNCER_STR), fists only. Hurt a patron - anyone dancing,
// anyone waiting in the line (or just standing in it), anyone inside the club - or one of the bouncers, and the club's
// bouncers come for you, or for the NPC who did it (combat.js damage -> onHurt; npc.js onAttacked -> bouncerHurt), out to
// BOUNCER_CHASE_PX from their door, then back to their posts. Not for the police at work, nor for someone only hitting
// back at whoever hit them first, nor for a traffic accident.
// Everything here but the clubs' state exists only while a player is near, as the shop staff do (interiors.js).
// Dancing (task #394, "nightclubs full of dancing NPCs instead of idling; lines out the door at the most popular
// nightclubs"): each dancer has a move (shared/dance.js, the descriptor's dm) and changes it now and then; two pair up
// for a slow dance or the salsa now and then; at the peak the floor jumps at the drop. The floor fills through the night,
// the most at the popular clubs (floorCap); the hot clubs (the top third) keep a line out the door at the peak (lineWant).
import { K, T, TILE } from '../../shared/constants.js';
import { mulberry32 } from '../../shared/rng.js';
import {
  CLUB_CLOSE_MAX_S, CLUB_DANCERS, CLUB_LINE, CLUB_ADMIT_S, BOUNCER_HP, BOUNCER_STR, BOUNCER_FIGHT_S, BOUNCER_CHASE_PX,
  CLUB_DANCERS_MAX, CLUB_PEAK_H, CLUB_MOVE_S, CLUB_COUPLE_P, CLUB_DROP_S,
} from '../../shared/rules.js';
import { DANCE_SOLO, DANCE_COUPLES, DANCE_JUMP, COUPLE_PX } from '../../shared/dance.js';
import { ARCHETYPES, BUILDS } from '../entities.js';
import { inAnyView } from '../view.js';
import { spawnNpc, despawnNpc, startFight, walkInAt, leaveBuilding } from './npc.js';

let rng = mulberry32(4320);
export function setRng(r) { rng = r; }

// the bouncer's stats (entities.js ARCHETYPES; dressed by npclooks.js RECIPES.bouncer: big, in black). day / night 0: never
// one of the passers-by
ARCHETYPES.bouncer ??= {
  reflex: 0.4, fight: 1.0, speed: 1.05, hp: 150, cash: [20, 90], item: null, day: 0, night: 0,
  look: () => ({ t: 3, tc: '#18181c', tc2: '#2a2a30', l: '#18181c', sh: '#111', ht: 0, b: 0 }),
};

const NEAR_PX = 1100, FAR_PX = 1500;   // the people turn up when a player is this close, go (out of sight) past this
const POST_SIDE = 40, POST_OUT = 30;   // the bouncers: this far either side of the door's middle, this far out from the wall
const LINE_FROM = 72, LINE_GAP = 22, LINE_OUT = 14;   // the line: from this far along the front from the door, this far apart, this far out
const REPLACE_S = 60;                  // a bouncer lost (hurt, killed, gone home) is replaced after this long
const ARRIVE_S = 30;                   // someone walking up to the line who hasn't got there in this long is put there (unseen)
const STAND = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.GRASS, T.DIRT, T.SAND, T.DOCK]);

const alive = (e) => !!(e && !e.removed && !e.dead);
const has = (v) => v !== undefined && v !== null;
const S = (world) => (world.nightclubs ??= { list: null, byGate: null, byUnit: null });

// somewhere a person can stand: open ground, nothing solid in the way
function standable(m, x, y) {
  if (!STAND.has(m.tileAtPx(x, y))) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const arr = m.solidProps.get((ty + oy) * m.w + tx + ox);
    if (arr) for (const p of arr) if (!p.off && Math.hypot(p.x - x, p.y - y) < p.r + 12) return false;
  }
  return true;
}

// Where everything goes at one club: the door, the bouncers' posts, the line's spots, the dance floor.
function layout(world, b, u, i, poi) {
  const m = world.map, wi = b.walkIn, s = wi.south ? 1 : -1, fy = u.door.ty;
  const doorX = (u.door.tx + u.door.w / 2) * TILE, wallY = (wi.south ? fy + 1 : fy) * TILE;
  const face = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  let posts = [-1, 1].map((sd) => ({ x: doorX + sd * POST_SIDE, y: wallY + s * POST_OUT, a: face, fixed: true })).filter((q) => standable(m, q.x, q.y));
  // one or two: the big clubs two, the little ones one or two
  if (posts.length > 1 && b.tw < 14 && (b.id * 7) % 3 === 0) posts = posts.slice(0, 1);
  // the line along the front, beside the door (its first spot nearest it): on the side with room for the most - the left
  // when both have (where a 'club' lot's velvet rope is: client/art2/game/statics.js)
  let line = [];
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let k = 0; k < CLUB_LINE; k++) {
      const x = doorX + sd * (LINE_FROM + k * LINE_GAP), y = wallY + s * LINE_OUT;
      if (!standable(m, x, y)) break;
      pts.push({ x, y, a: sd > 0 ? Math.PI : 0, sd });
    }
    if (pts.length > line.length) line = pts;
  }
  // the dance floor: between the bar and the doors
  const front = wi.south ? wi.y1 : wi.y0, fy0 = (u.counterRow + s * 2) * TILE, fy1 = (front - s) * TILE;
  const floor = { x0: (u.x0 + 0.5) * TILE, x1: (u.x1 + 0.5) * TILE, y0: Math.min(fy0, fy1), y1: Math.min(fy0, fy1) + Math.max(8, Math.abs(fy1 - fy0)) };
  // how popular it is (0..1: the bigger rooms and a roll of the dice; clubs() marks the top third hot) and how many the
  // floor holds (about one to every 22 x 22 px)
  const pop = Math.min(1, 0.55 * (((Math.imul(b.id * 16 + i + 1, 0x9e3779b1) >>> 0) % 1000) / 1000) + 0.45 * Math.min(1, (u.x1 - u.x0 + 1) / 12));
  const room = Math.max(4, Math.floor((floor.x1 - floor.x0) * (floor.y1 - floor.y0) / 480));
  return {
    key: b.id * 16 + i, b, u, gate: poi.gate, poi: poi.id, s, floor, posts, line, pop, room, hot: false,
    door: { x: doorX, y: wallY + s * 20, wallY, inY: wallY - s * 2.1 * TILE, outY: wallY + s * 24 },
    state: 'closed', since: 0, dancers: [], queue: [], bouncers: [], lostAt: -1e9, nextAdmit: 0, nextDrop: 0, dropUntil: 0,
  };
}

// ---- the night's crowd (task #394) ----------------------------------------------------------------------------------------
// How busy the clubs are (0.3 .. 1) at the clock's minutes: 1 through the peak (CLUB_PEAK_H), down to 0.3 three hours either side
export function busyness(minutes) {
  let h = minutes / 60; if (h >= 12) h -= 24;   // (hours from midnight: the evening negative)
  const [a, b] = [CLUB_PEAK_H[0] - 24, CLUB_PEAK_H[1]];
  const off = h < a ? a - h : h > b ? h - b : 0;
  return Math.max(0.3, 1 - off * 0.7 / 3);
}
export const isPeak = (world) => busyness(world.clock.minutes) >= 1;
// How many on this club's floor now: more through the night, more at the popular ones (the quietest at its peak:
// CLUB_DANCERS; the busiest: CLUB_DANCERS_MAX), as many as the floor holds
export function floorCap(world, c) {
  const busy = busyness(world.clock.minutes), want = 3 + (CLUB_DANCERS - 3 + (CLUB_DANCERS_MAX - CLUB_DANCERS) * c.pop) * busy;
  return Math.max(3, Math.min(c.room, Math.round(want)));
}
// How long its line is: a hot club's the length of the rope at the peak; a quiet one's a couple at most; nobody before the
// crowd turns up - but one waiting whenever the floor has room (the bouncer lets them in)
function lineWant(world, c) {
  const busy = busyness(world.clock.minutes), k = Math.max(0, (busy - 0.55) / 0.45);
  const want = Math.round(c.line.length * k * (c.hot ? 1 : 0.4));
  return Math.min(c.line.length, Math.max(want, c.dancers.length < floorCap(world, c) ? 1 : 0));
}

export function clubs(world) {
  const st = S(world);
  if (st.list) return st.list;
  const m = world.map, pois = new Map((m.pois || []).map((p) => [p.id, p]));
  st.list = []; st.byGate = new Map(); st.byUnit = new Map();
  for (const bid of m.walkIns || []) {
    const b = m.buildings[bid];
    b.walkIn.units.forEach((u, i) => {
      const poi = u.kind === 'club' ? pois.get(u.poi) : null;
      if (!poi || poi.gate === undefined) return;
      const c = layout(world, b, u, i, poi);
      c.state = world.clock.isNight ? 'open' : 'closed'; c.nextAdmit = world.time + CLUB_ADMIT_S[0];
      st.list.push(c); st.byGate.set(c.gate, c); st.byUnit.set(u, c);
    });
  }
  // the hot ones: the most popular third
  const ranked = [...st.list].sort((a, q) => q.pop - a.pop || a.key - q.key);
  ranked.slice(0, Math.ceil(ranked.length / 3)).forEach((c) => { c.hot = true; });
  return st.list;
}
export const clubByKey = (world, key) => clubs(world).find((c) => c.key === key) || null;

// Is this club's shutter up (open, or closing while the last of them walk out)? gates.js asks, for its 'night' gates.
export function shutterUp(world, gateIdx) {
  clubs(world);
  const c = S(world).byGate.get(gateIdx);
  return c ? c.state !== 'closed' : world.clock.isNight;
}
// Is (x, y) inside a club that's shut, or shutting? (npc.js: nobody wanders in then.)
export function shutAt(world, x, y) { const c = clubAt(world, x, y); return !!c && c.state !== 'open'; }
// The clubs whose music is on (their gate indices): for the welcome (server/session.js), like gates.gatesOpen.
export function liveList(world) { return clubs(world).filter((c) => c.state === 'open').map((c) => c.gate); }

// The club a point is inside (its walk-in unit), or null.
export function clubAt(world, x, y) {
  clubs(world);
  const wi = walkInAt(world.map, x, y);
  return wi ? S(world).byUnit.get(wi.u) || null : null;
}

// ---- every tick: open at dusk, wind down at the end of the night, shut once the floor's empty; the bouncers' posts --------
export function update(world) {
  const list = clubs(world), now = world.time, night = world.clock.isNight;
  for (const c of list) {
    if (night && c.state !== 'open') open(world, c);
    else if (!night && c.state === 'open') startClosing(world, c);
    else if (c.state === 'closing') {
      const left = inside(world, c), t = now - c.since;
      if (!left.length || (t > CLUB_CLOSE_MAX_S && !left.some((e) => inAnyView(world, e.x, e.y, 30))) || t > CLUB_CLOSE_MAX_S * 2) close(world, c, left);
    }
  }
  if (world.tick % 5 === 1) for (const c of list) doorWatch(world, c);
  if (world.tick % 20 === 9) for (const c of list) manage(world, c);
}

function open(world, c) {
  c.state = 'open'; c.since = world.time; c.nextAdmit = world.time + CLUB_ADMIT_S[0];
  world.broadcast({ e: 'club', i: c.gate, on: 1 });
}
// The end of the night: the music stops, the dancers walk out, the line breaks up and goes.
function startClosing(world, c) {
  c.state = 'closing'; c.since = world.time;
  world.broadcast({ e: 'club', i: c.gate, on: 0 });
  for (const id of c.dancers) { const e = world.get(id); if (alive(e) && e.npc) leaveBuilding(world, e, c.door); }
  for (const id of c.queue) { const e = world.get(id); if (alive(e) && e.npc) dropFromLine(world, e, c.door); }
  c.queue = [];
  // (anyone else who wandered in off the street goes too - not the staff behind the bar)
  for (const e of strays(world, c)) { leaveBuilding(world, e, c.door); c.dancers.push(e.id); }
}
// people inside the club who aren't its dancers or its staff (passers-by who wandered in)
function strays(world, c) {
  const u = c.u, x = (u.x0 + u.x1 + 1) / 2 * TILE, y = (c.floor.y0 + c.floor.y1) / 2, r = Math.hypot((u.x1 - u.x0 + 1) * TILE, c.floor.y1 - c.floor.y0 + 4 * TILE) / 2 + 40;
  return world.query(x, y, r, K.PED).filter((e) => e.npc && !e.dead && !e.npc.desk && e.npc.role === 'civ' && e.npc.state !== 'leave' && !c.dancers.includes(e.id) && clubAt(world, e.x, e.y) === c);
}
// The club's dancers still inside (on their way out)
function inside(world, c) {
  c.dancers = c.dancers.filter((id) => { const e = world.get(id); return alive(e) && clubAt(world, e.x, e.y) === c; });
  return c.dancers.map((id) => world.get(id));
}
// Shut: the shutter comes down (gates.js); anyone left inside out of sight is gone; the bouncers head home.
function close(world, c, left) {
  c.state = 'closed'; c.since = world.time;
  for (const e of [...left, ...strays(world, c)]) if (!inAnyView(world, e.x, e.y, 30)) despawnNpc(world, e);
  c.dancers = [];
  for (const id of c.bouncers) { const e = world.get(id); if (alive(e) && e.npc) offDuty(world, e, c); }
  c.bouncers = [];
}

// The bouncers' posts: a new one steps out of the door first, then over to his post; one chasing someone goes no further
// than BOUNCER_CHASE_PX from the door, then back to it.
function doorWatch(world, c) {
  for (const id of c.bouncers) {
    const e = world.get(id), n = e && e.npc;
    if (!alive(e) || !n || !n.post) continue;
    if (n.guard !== n.post && n.state !== 'fight' && !clubAt(world, e.x, e.y) && Math.hypot(e.x - n.guard.x, e.y - n.guard.y) < 14) n.guard = n.post;
    if (n.state === 'fight' && Math.hypot(e.x - c.door.x, e.y - c.door.y) > BOUNCER_CHASE_PX) { n.state = 'wander'; n.target = 0; n.until = 0; }
    if (n.state === 'watch' && world.time > n.until) { n.state = 'wander'; n.target = 0; }   // (stood back while the police had them: npc.js backOff)
  }
}

// ---- the people (every second): there while a player is near, gone out of sight once nobody is --------------------------
function nearestPlayer(world, x, y) {
  let d = Infinity;
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) d = Math.min(d, Math.hypot(p.ped.x - x, p.ped.y - y));
  return d;
}
function manage(world, c) {
  const now = world.time;
  if (c.state === 'open') c.dancers = c.dancers.filter((id) => { const e = world.get(id); return alive(e) && e.npc && e.npc.dancer && e.npc.desk; });
  c.queue = c.queue.filter((id) => {
    const e = world.get(id);
    if (!alive(e) || !e.npc || e.npc.clubQueue !== c.key) return false;
    if (e.npc.state !== 'wander' && e.npc.state !== 'idle') { dropFromLine(world, e, null); return false; }   // (scared off, hurt, in a fight)
    return true;
  });
  const before = c.bouncers.length;
  c.bouncers = c.bouncers.filter((id) => { const e = world.get(id); return alive(e) && e.npc && e.npc.bouncer === c.key && e.npc.state !== 'limp' && e.npc.state !== 'crawl' && e.npc.state !== 'passed'; });
  if (c.bouncers.length < before) c.lostAt = now;
  const d = nearestPlayer(world, c.door.x, c.door.y);
  if (d > FAR_PX) {   // nobody near: they go, once nobody can see them
    for (const k of ['dancers', 'queue', 'bouncers']) c[k] = c[k].filter((id) => { const e = world.get(id); if (e && !inAnyView(world, e.x, e.y, 30)) { despawnNpc(world, e); return false; } return true; });
    return;
  }
  if (c.state !== 'open' || d > NEAR_PX) return;
  // the bouncers at the door
  if (c.bouncers.length < c.posts.length && now - c.lostAt > REPLACE_S) {
    const post = c.posts.find((q) => !c.bouncers.some((id) => world.get(id).npc.post === q));
    if (post) addBouncer(world, c, post);
  }
  // people on the floor: most of them straight away while nobody's in there to see them turn up (the line brings the rest)
  const cap = floorCap(world, c);
  const watched = [...world.players.values()].some((p) => p.ped && !p.ped.dead && clubAt(world, p.ped.x, p.ped.y) === c);
  if (!watched) while (c.dancers.length < cap - 2) c.dancers.push(addDancer(world, c, null).id);
  // the line, filled from the back: people walking up from out of sight where the spot is in view (as long as the night
  // and the club's name call for: lineWant)
  for (let k = c.queue.length, want = lineWant(world, c); k < want; k++) { const e = addToLine(world, c, k); if (!e) break; c.queue.push(e.id); }
  dancing(world, c);
  for (const id of c.queue) {   // (someone who never got to their spot - a long way round: put there while nobody's looking)
    const e = world.get(id), n = e.npc, spot = n.guard;
    if (!spot || now - n.lineAt < ARRIVE_S || Math.hypot(e.x - spot.x, e.y - spot.y) < 16) continue;
    n.lineAt = now;
    if (!inAnyView(world, e.x, e.y, 30) && !inAnyView(world, spot.x, spot.y, 30)) { e.x = spot.x; e.y = spot.y; e.vx = e.vy = 0; world.place(e); }
  }
  // the door: the next one in when there's room on the floor; once it's full, now and then someone heads home
  if (now >= c.nextAdmit) {
    c.nextAdmit = now + CLUB_ADMIT_S[0] + rng() * (CLUB_ADMIT_S[1] - CLUB_ADMIT_S[0]);
    if (c.dancers.length >= cap) {
      const on = c.dancers.map((id) => world.get(id)).filter((e) => Math.hypot(e.x - e.npc.desk.x, e.y - e.npc.desk.y) < 8);
      if (on.length) { const e = on[Math.floor(rng() * on.length)]; unpair(world, e); leaveBuilding(world, e, c.door); c.dancers = c.dancers.filter((id) => id !== e.id); }
    }
    const head = c.queue.length ? world.get(c.queue[0]) : null;
    if (head && c.dancers.length < cap && Math.hypot(head.x - c.line[0].x, head.y - c.line[0].y) < 16) admit(world, c, head);
  }
}

// a spot on the dance floor, a little way from everyone else's if there's one, facing the middle of the floor (task #394:
// the crowd faces the same way - the sprites for few headings)
function floorSpot(world, c) {
  const F = c.floor, cx = (F.x0 + F.x1) / 2, cy = (F.y0 + F.y1) / 2;
  const taken = c.dancers.map((id) => world.get(id)).filter((e) => e && e.npc && e.npc.desk).map((e) => e.npc.desk);
  let best = null, bd = -1;
  for (let t = 0; t < 8; t++) {
    const x = F.x0 + rng() * (F.x1 - F.x0), y = F.y0 + rng() * (F.y1 - F.y0);
    let d = 1e9; for (const q of taken) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
    if (d > bd) { bd = d; best = { x, y }; }
    if (d > 26) break;
  }
  const away = Math.hypot(cx - best.x, cy - best.y);
  best.a = away > 12 ? Math.atan2(cy - best.y, cx - best.x) : (c.s > 0 ? -Math.PI / 2 : Math.PI / 2);   // (in the middle: toward the bar)
  return best;
}
// someone dancing (desk: they keep to their spot, swaying - npc.js; gt 'dance': the dance pose): spawned on the floor, or
// (ped given) someone from the line, who walks in through the door to their spot (npc.js: a desk out of sight goes by it)
function addDancer(world, c, ped) {
  const spot = floorSpot(world, c);
  if (!ped) ped = spawnNpc(world, ['casual', 'hustler', 'socialite', 'casual'][Math.floor(rng() * 4)], spot.x, spot.y, 'civ');
  const n = ped.npc;
  n.desk = spot; n.keep = true; n.dancer = true; n.clubKey = c.key; n.guard = null; n.clubQueue = null; n.partner = 0;
  setMove(world, ped, c.dropUntil > world.time ? DANCE_JUMP : soloMove());   // (and a move of their own: task #394)
  return ped;
}

// ---- dancing (task #394, shared/dance.js): each dancer has a move (the descriptor's dm) and changes it now and then; now and
// then two pair up face to face for a slow dance or the salsa; at the peak the whole floor jumps now and then (the drop)
const soloMove = () => DANCE_SOLO[Math.floor(rng() * DANCE_SOLO.length)];
function setMove(world, e, dm) {
  e.gt = 'dance'; e.dm = dm; e.appVer = (e.appVer || 0) + 1;
  e.npc.danceNext = world.time + CLUB_MOVE_S[0] + rng() * (CLUB_MOVE_S[1] - CLUB_MOVE_S[0]);
}
const onSpot = (e) => !!(e && e.npc && e.npc.desk && Math.hypot(e.x - e.npc.desk.x, e.y - e.npc.desk.y) < 8);
// a couple splits up (one leaving, a new move): the other dances on their own
function unpair(world, e) {
  const n = e.npc, q = n && n.partner ? world.get(n.partner) : null;
  if (n) n.partner = 0;
  if (q && q.npc && q.npc.partner === e.id) { q.npc.partner = 0; if (alive(q) && q.npc.dancer) setMove(world, q, soloMove()); }
}
// two dancers pair up: the lead stays where they are, the partner comes over to face them
function pair(world, c, lead, mate) {
  const [dl, df] = DANCE_COUPLES[Math.floor(rng() * DANCE_COUPLES.length)], F = c.floor, a = lead.npc.desk.a;
  const x = Math.max(F.x0, Math.min(F.x1, lead.npc.desk.x + Math.cos(a) * COUPLE_PX)), y = Math.max(F.y0, Math.min(F.y1, lead.npc.desk.y + Math.sin(a) * COUPLE_PX));
  lead.npc.desk = { x: lead.npc.desk.x, y: lead.npc.desk.y, a: Math.atan2(y - lead.npc.desk.y, x - lead.npc.desk.x) };
  mate.npc.desk = { x, y, a: lead.npc.desk.a + Math.PI };
  lead.npc.partner = mate.id; mate.npc.partner = lead.id;
  setMove(world, lead, dl); setMove(world, mate, df);
  mate.npc.danceNext = lead.npc.danceNext + 60;   // (the lead says when it's over)
}
function dancing(world, c) {
  const now = world.time, list = c.dancers.map((id) => world.get(id)).filter((e) => alive(e) && e.npc && e.npc.dancer);
  // the drop: at the peak, now and then everyone on their own jumps for a while
  if (isPeak(world) && now >= c.nextDrop) {
    if (c.nextDrop) { c.dropUntil = now + CLUB_DROP_S[0]; for (const e of list) if (!e.npc.partner) setMove(world, e, DANCE_JUMP); }
    c.nextDrop = now + CLUB_DROP_S[1][0] + rng() * (CLUB_DROP_S[1][1] - CLUB_DROP_S[1][0]);
  }
  if (c.dropUntil && now >= c.dropUntil) { c.dropUntil = 0; for (const e of list) if (e.dm === DANCE_JUMP) setMove(world, e, soloMove()); }
  if (c.dropUntil) return;
  for (const e of list) {
    const n = e.npc;
    if (n.partner && !(alive(world.get(n.partner)) && world.get(n.partner).npc && world.get(n.partner).npc.partner === e.id)) { n.partner = 0; setMove(world, e, soloMove()); continue; }
    if (now < (n.danceNext || 0) || !onSpot(e)) continue;
    if (n.partner) { unpair(world, e); setMove(world, e, soloMove()); continue; }   // (the song's over)
    if (rng() < CLUB_COUPLE_P) {
      const mate = list.find((q) => q !== e && !q.npc.partner && onSpot(q) && Math.hypot(q.x - e.x, q.y - e.y) < 90);
      if (mate) { pair(world, c, e, mate); continue; }
    }
    let dm = soloMove(); if (dm === e.dm) dm = soloMove();
    setMove(world, e, dm);
  }
}
// the front of the line goes in; everyone behind steps up a place
function admit(world, c, head) {
  c.queue.shift();
  addDancer(world, c, head);
  c.dancers.push(head.id);
  c.queue.forEach((id, k) => { const e = world.get(id); if (e && e.npc) { e.npc.guard = lineGuard(c, k); e.npc.lineAt = world.time; } });
}
const lineGuard = (c, k) => ({ x: c.line[k].x, y: c.line[k].y, a: c.line[k].a, fixed: true });
// someone for spot k of the line: right there if nobody can see it, else walking up from out of sight along the front
function addToLine(world, c, k) {
  const spot = c.line[k];
  if (!spot) return null;
  let at = null;
  if (!inAnyView(world, spot.x, spot.y, 40)) at = spot;
  else {
    const m = world.map;
    for (let d = 360; d <= 760 && !at; d += 80) for (const sd of [spot.sd, -spot.sd]) {
      const x = c.door.x + sd * d, y = spot.y;
      if (standable(m, x, y) && !inAnyView(world, x, y, 40) && m.los(x, y, spot.x, spot.y)) { at = { x, y }; break; }
    }
  }
  if (!at) return null;
  const e = spawnNpc(world, ['casual', 'socialite', 'hustler', 'casual', 'athlete'][Math.floor(rng() * 5)], at.x, at.y, 'civ');
  const n = e.npc;
  n.guard = lineGuard(c, k); n.clubQueue = c.key; n.clubKey = c.key; n.keep = true; n.lineAt = world.time;
  e.a = spot.a;
  return e;
}
// out of the line: at closing time they walk off; scared or hurt, whatever they were doing goes on and they're anyone
function dropFromLine(world, e, door) {
  const n = e.npc;
  n.guard = null; n.clubQueue = null; n.clubKey = undefined;
  if (door) leaveBuilding(world, e, door); else n.keep = false;
}

// a bouncer for a post: built like a brute (BOUNCER_HP, BOUNCER_STR), fists only. Out of sight he's put at his post; in
// sight he steps out of the door to it.
function addBouncer(world, c, post) {
  const seen = inAnyView(world, post.x, post.y, 40);
  const e = spawnNpc(world, 'bouncer', seen ? c.door.x + Math.sign(post.x - c.door.x) * 8 : post.x, seen ? c.door.inY : post.y, 'bouncer');
  e.build = { ...BUILDS[3], str: BOUNCER_STR };
  e.hp = e.maxHp = BOUNCER_HP;
  e.weapon = 'fists'; e.name = 'a bouncer'; e.a = post.a;
  const n = e.npc;
  n.post = post;
  n.guard = seen ? { x: c.door.x + Math.sign(post.x - c.door.x) * 8, y: c.door.outY, a: post.a, fixed: true } : post;
  n.bouncer = c.key; n.keep = true; n.fight = 1;
  c.bouncers.push(e.id);
  return e;
}
// the club's shut: off home like anyone else
function offDuty(world, e, c) {
  const n = e.npc;
  n.bouncer = null; n.post = null; n.role = 'civ';
  leaveBuilding(world, e, c.door);
}

// ---- trouble -------------------------------------------------------------------------------------------------------------
// The club whose patron this is, or null: someone dancing there or waiting in its line, anyone inside it or standing in
// its line - while it's open (or closing: the bouncers are still on the door).
function patronOf(world, e) {
  const n = e.npc, list = S(world).list;
  if (n && has(n.clubKey) && (n.desk || has(n.clubQueue))) { const c = list.find((q) => q.key === n.clubKey); return c && c.state !== 'closed' ? c : null; }
  const c = clubAt(world, e.x, e.y);
  if (c) return c.state !== 'closed' ? c : null;
  for (const q of list) {
    if (q.state === 'closed' || !q.line.length || Math.abs(e.x - q.door.x) > 260 || Math.abs(e.y - q.door.y) > 80) continue;
    if (q.line.some((p) => Math.hypot(p.x - e.x, p.y - e.y) < LINE_GAP)) return q;
  }
  return null;
}
const isPolice = (e) => (e.npc ? e.npc.role === 'cop' : !!(e.player && e.player.badge));

// combat.js damage: someone (victim) hurt by someone (attacker). A patron hurt by anyone but the police, one of the
// bouncers, or someone only hitting back: the club's bouncers go for them. Returns how many did.
export function onHurt(world, victim, attacker, cause) {
  const st = world.nightclubs;
  if (!st || !st.list || !attacker || attacker === victim || attacker.kind !== K.PED || attacker.wild || attacker.pet || victim.wild || victim.pet) return 0;
  if (isPolice(attacker) || (attacker.npc && has(attacker.npc.bouncer))) return 0;
  if (cause === 'vehicle' && attacker.npc) return 0;   // (a driver in the traffic: an accident)
  const back = attacker.aggressors && attacker.aggressors.get(victim.id);
  if (back !== undefined && world.time - back < 30) return 0;   // (hitting back at whoever started it)
  const c = patronOf(world, victim);
  return c ? sic(world, c, attacker) : 0;
}
// npc.js onAttacked: one of the bouncers was hurt - they all go for whoever did it
export function bouncerHurt(world, bouncer, attacker) {
  if (!attacker || attacker === bouncer || attacker.kind !== K.PED || attacker.wild || isPolice(attacker)) return 0;   // (not the police: a baton in a brawl, an arrest)
  const c = clubByKey(world, bouncer.npc.bouncer);
  if (!c) { startFight(world, bouncer, attacker, BOUNCER_FIGHT_S); return 1; }
  return sic(world, c, attacker, true);
}
function sic(world, c, attacker, any = false) {
  let n = 0;
  for (const id of c.bouncers) {
    const b = world.get(id), bn = b && b.npc;
    if (!alive(b) || !bn || bn.state === 'limp' || bn.state === 'crawl' || bn.state === 'passed') continue;
    if (bn.state === 'fight' && bn.target && bn.target !== attacker.id && alive(world.get(bn.target))) continue;   // (already on someone)
    if (!any && Math.hypot(attacker.x - c.door.x, attacker.y - c.door.y) > BOUNCER_CHASE_PX) continue;
    if (bn.state === 'fight' && bn.target === attacker.id) bn.until = Math.max(bn.until, world.time + BOUNCER_FIGHT_S);
    else startFight(world, b, attacker, BOUNCER_FIGHT_S);
    if (bn.state === 'fight') n++;
  }
  const p = attacker.player;
  if (n && p && world.time - (p.bouncerWarnAt || -99) > 15) { p.bouncerWarnAt = world.time; world.notify(p, 'You hurt someone at the club - the bouncers are coming for you!', 'bad'); }
  return n;
}
