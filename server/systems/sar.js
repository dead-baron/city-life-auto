// Search and rescue pilot (H59; the owner, 2026-10-11: "search and rescue helicopter pilot job: patrol around and respond
// to calls of missing or hurt hikers out in nature spots, and you get a general idea where they may be but you gotta go
// out and search for them and retrieve them. They're either injured and you have to land and pick them up and bring them
// back and fly them to the hospital, which you can land on top of, or you need to lower a harness down to hard-to-reach
// places, or find them in the water and lower a harness, or just locate a missing person and pick them up").
// Sign on at the Search & Rescue HQ (World v3: its door or its helipad - shared/world3-sarhq.js; a world without one, a
// hospital's yard pad) or from the phone's job list: a rescue helicopter (shared/vehicles.js
// rescueheli) is issued to you like a work truck (jobs.js: v.issuedTo / v.workTruck, the ring and the arrows). A shift
// of calls (shared/rules.js SAR): someone out in the wild - hurt on open ground, stuck where nothing can land (rough
// ground among the trees and rocks), in the water off the coast, or just lost - found from the built map (sitesOf: the
// wild, rural, park, rocky, beach and desert districts; the water near the shore), never coordinates. The page gets a
// search circle (the job target's area: the minimap, the world map), not the spot; within SAR.seeR they see you, wave
// (the fist pump: shared/dance.js) and a smoke flare goes up (flare: drawn by client/render/aircraft.js in both
// renderers). Land near the hurt and the lost (they're helped aboard); hover low over the stuck and the swimmer and hold
// Act: the harness's cable pays out (hoist: drawn on the overlay) - too high or drifting and it can't reach; clipped on,
// it winches them in. A hurt patient's life runs down (a hard landing costs some); land on a hospital's roof pad (or its
// yard's) to hand them over: paid by how far, how fast and how gently. A patient who runs out of time dies.
//   update(world, dt)            the shifts (world.js SYSTEMS)
//   start(world, p, pad)         sign on at a hospital pad ({ x, y, name } - the nearest yard pad if null) -> error | null
//   interaction(world, p)        Act: signing on at the HQ on foot; the harness in the helicopter
// The calls come to the rescue helicopter (the owner, 10-23): out of it, or flying another one, the shift stands by.
//   target(world, p, j)          the job tracker's target (phone.js jobTarget): area / flare / hoist for the page
//   sitesOf(m)                   { open, rough, water }: where calls can come from (px points)
import { K, T, TILE } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { DISTRICTS, WATER_T, PED_BLOCK } from '../../shared/mapcore.js';
import { airfields, findPadSpot, floorAt, FLY } from '../../shared/flight.js';
import { SAR } from '../../shared/rules.js';
import { DM } from '../../shared/dance.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import * as jobs from './jobs.js';

const rng = mulberry32(6464);
const WILD = new Set(['wild', 'rural', 'park', 'rocky', 'beach', 'desert']);
const OPEN_T = new Set([T.GRASS, T.DIRT, T.SAND, T.FIELD]);
const KINDS = [['ground', 3], ['rough', 2.5], ['water', 2], ['lost', 2.5]];
const SAY = {
  ground: (w) => `a hiker's hurt in ${w} and can't walk - land near them`,
  rough: (w) => `a climber's hurt and stuck on rough ground in ${w} - nowhere to land: lower the harness`,
  water: (w) => `someone's in the water off ${w} - lower the harness`,
  lost: (w) => `a hiker's lost in ${w} - find them and fly them back`,
};
const HURT = { ground: 1, rough: 1, water: 1, lost: 0 };
const HARNESS = { rough: 1, water: 1 };

// ---- where calls come from (once per map; the world's hash is untouched: nothing added to the map) ----------------------
const SITES = new WeakMap();
export function sitesOf(m) {
  let S = SITES.get(m);
  if (S) return S;
  S = { open: [], rough: [], water: [] };
  const step = 5;
  const styleAt = (tx, ty) => { const d = DISTRICTS[m.dist[m.idx(tx, ty)]]; return d ? d.style : ''; };
  const landNear = (tx, ty, r) => { for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s = Math.sin(a * Math.PI / 4); for (let d = 2; d <= r; d += 2) { const x = tx + Math.round(c * d), y = ty + Math.round(s * d); if (m.inside(x, y) && !WATER_T[m.tileAt(x, y)]) return true; } } return false; };
  const pool = (x, y) => (m.pools || []).some((r) => (r.ring ? Math.hypot((x - r.ring.cx) / r.ring.rx, (y - r.ring.cy) / r.ring.ry) < 1.4 : x >= r.x - 64 && x < r.x + r.w + 64 && y >= r.y - 64 && y < r.y + r.h + 64));
  const propsNear = (tx, ty) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!m.inside(tx + dx, ty + dy)) continue; const ps = m.solidProps.size ? m.solidProps.get(m.idx(tx + dx, ty + dy)) : null; if (ps) n += ps.filter((q) => !q.off).length; } return n; };
  const underDeck = (tx, ty) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (m.inside(tx + dx, ty + dy) && m.deck[m.idx(tx + dx, ty + dy)]) return true; return false; };   // (not under the elevated highway)
  for (let ty = m.y0 + 2; ty < m.y0 + m.h - 2; ty += step) for (let tx = m.x0 + 2; tx < m.x0 + m.w - 2; tx += step) {
    const t = m.tileAt(tx, ty), x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (m.deck && underDeck(tx, ty)) continue;
    if (t === T.WATER) { if (landNear(tx, ty, 8) && !pool(x, y)) S.water.push({ x, y }); continue; }
    if (!OPEN_T.has(t) || !WILD.has(styleAt(tx, ty))) continue;
    const n = propsNear(tx, ty);
    if (n >= 2 && !PED_BLOCK[t]) {   // among the trees and rocks: nowhere a helicopter can put down - but somewhere to stand
      const ps = m.solidProps.size ? m.solidProps.get(m.idx(tx, ty)) : null;
      if (!ps || !ps.some((q) => !q.off && Math.hypot(q.x - x, q.y - y) < q.r + 12)) S.rough.push({ x, y });
    } else if (!n && findPadSpot(m, x, y, 64, 0)) S.open.push({ x, y });
  }
  SITES.set(m, S);
  return S;
}

// the hospitals' pads: the roof pad (the one meant for it) and the yard's
const hospitalPads = (m) => airfields(m).pads.filter((q) => q.kind === 'hospital');
// where a shift starts: the Search & Rescue HQ's pad (World v3: shared/world3-sarhq.js) - else, a world without one, a
// hospital's ground pad as before
const basePads = (m) => { const hq = airfields(m).pads.filter((q) => q.kind === 'sar'); return hq.length ? hq : hospitalPads(m).filter((q) => !q.roof); };
const nearestBase = (m, x, y) => { let best = null, bd = Infinity; for (const q of basePads(m)) { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q; } } return best; };
const nearestPad = (m, x, y, roof = null) => { let best = null, bd = Infinity; for (const q of hospitalPads(m)) { if (roof !== null && q.roof !== roof) continue; const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q; } } return best; };
const placeName = (m, x, y) => { const d = m.districtAt(x, y); return d ? d.name : 'the wilds'; };

// ---- signing on -----------------------------------------------------------------------------------------------------------
export function start(world, p, pad = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const m = world.map;
  pad ||= nearestBase(m, p.ped.x, p.ped.y);
  if (!pad) return 'No rescue base here.';
  // the helicopter: on clear ground by the pad, out of the way of anything parked there
  const avoid = world.query(pad.x, pad.y, 900, K.VEH).map((q) => ({ x: q.x - 110, y: q.y - 110, w: 220, h: 220 }));
  const spot = findPadSpot(m, pad.x, pad.y, 64, 900, avoid) || findPadSpot(m, pad.x, pad.y, 48, 1400);
  if (!spot) return 'No room to park a helicopter here.';
  const v = world.spawnVehicle('rescueheli', spot.x, spot.y, -Math.PI / 2, { npcOwned: false });
  v.alt = 0; v.parked = false; v.npcOwned = false;
  v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;   // (yours: not theft - safety.js / vehicles.js mineOf; kept for the shift)
  v.returnTo = { x: spot.x, y: spot.y, label: pad.name };
  p.job = { type: 'sar', stage: 'wait', truck: v.id, base: { x: pad.x, y: pad.y, name: pad.name }, nextAt: world.time + SAR.firstS, expires: world.time + SAR.shiftS, saved: 0, text: 'Search & rescue: on call - stand by for the first call' };
  world.notify(p, `You're on call as a search & rescue pilot. Your rescue helicopter is by ${pad.name} (the green ring). Calls come over the phone: search the circle on your map, land for the hurt and the lost, hold Act over the stuck and the swimmers to lower the harness, and fly them to a hospital - land on its roof (or the helipad in its yard).`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}

// ---- the calls --------------------------------------------------------------------------------------------------------------
function pick(list, x, y) {
  if (!list.length) return null;
  for (let k = 0; k < 60; k++) { const s = list[Math.floor(rng() * list.length)], d = Math.hypot(s.x - x, s.y - y); if (d >= SAR.dist[0] && d <= SAR.dist[1]) return s; }
  let best = null, bd = Infinity;
  for (const s of list) { const d = Math.abs(Math.hypot(s.x - x, s.y - y) - SAR.dist[0]); if (d < bd) { bd = d; best = s; } }
  return best;
}
function newCall(world, p, force = null) {
  const j = p.job, m = world.map, S = sitesOf(m), from = p.ped;
  let kind = force;
  if (!kind) { let r = rng() * KINDS.reduce((a, k) => a + k[1], 0); for (const [k, w] of KINDS) { r -= w; if (r <= 0) { kind = k; break; } } kind ||= 'ground'; }
  let s = pick(kind === 'water' ? S.water : kind === 'rough' ? S.rough : S.open, from.x, from.y);
  if (!s && kind !== 'ground') { kind = 'ground'; s = pick(S.open, from.x, from.y); }
  if (!s) { j.nextAt = world.time + 30; return null; }
  return callAt(world, p, kind, s.x, s.y);
}
// a call for someone at (x, y) (tests and the dev menu name the spot)
export function callAt(world, p, kind, x, y) {
  const j = p.job, m = world.map;
  const ped = spawnNpc(world, 'hiker', x, y, 'civ');
  ped.npc.sar = p.pid; ped.npc.keep = true; ped.npc.state = 'idle';
  ped.vx = 0; ped.vy = 0;
  const off = rng() * SAR.circleR * 0.6, oa = rng() * Math.PI * 2;
  const pad = nearestPad(m, x, y);
  const c = { kind, x, y, cx: Math.round(x + Math.cos(oa) * off), cy: Math.round(y + Math.sin(oa) * off), vic: ped.id, at: world.time, found: false, aboard: false, hurt: !!HURT[kind], life: HURT[kind] ? SAR.life[0] + rng() * (SAR.life[1] - SAR.life[0]) : 0, lifeMax: 0, hard: 0, cable: 0, hooked: false, board: 0, warnAt: -99, landAt: 0, far: pad ? Math.hypot(pad.x - x, pad.y - y) : 3000, where: placeName(m, x, y) };
  c.lifeMax = c.life;
  j.call = c; j.stage = 'search';
  (world.sarCalls ||= new Map()).set(p.pid, ped.id);
  j.text = `Rescue call: ${SAY[kind](c.where)}. Search the circle on your map`;
  world.notify(p, `Dispatch: ${SAY[kind](c.where)}. They're somewhere in the circle on your map - get up there and look for them.`, 'warn');
  p.meDirty = true;
  return c;
}
function endCall(world, p, msg, tone) {
  const j = p.job, c = j && j.call;
  if (c) { const vic = world.get(c.vic); if (vic && !vic.removed) dropVictim(world, vic); }
  if (world.sarCalls) world.sarCalls.delete(p.pid);
  if (j) { j.call = null; j.stage = 'wait'; j.nextAt = world.time + SAR.gapS[0] + rng() * (SAR.gapS[1] - SAR.gapS[0]); j.text = 'Search & rescue: on call - stand by for the next call'; }
  if (msg) world.notify(p, msg, tone || 'info');
  p.meDirty = true;
}
function dropVictim(world, vic) {
  if (vic.vehId) { const v = world.get(vic.vehId); if (v) { const i = v.seats.indexOf(vic.id); if (i >= 0) v.seats[i] = 0; } vic.vehId = 0; vic.seat = -1; }
  despawnNpc(world, vic);
}

// ---- every tick --------------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  // a call whose pilot is gone or off the job: whoever was out there is fetched by someone else (gone)
  if (world.sarCalls) for (const [pid, id] of world.sarCalls) {
    const p = world.players.get(pid);
    if (p && p.job && p.job.type === 'sar' && p.job.call && p.job.call.vic === id) continue;
    const vic = world.get(id);
    if (vic && !vic.removed) dropVictim(world, vic);
    world.sarCalls.delete(pid);
  }
  for (const p of world.players.values()) if (p.job && p.job.type === 'sar') step(world, p, dt);
}

function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped;
  const v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) { jobs.failJob(world, p, 'Your rescue helicopter is lost. The shift is over.'); return; }
  const flying = ped && !ped.dead && ped.vehId === v.id && ped.seat === 0;
  // (the owner, 10-23: "Regular helicopter shouldn't trigger search and rescue missions ... they should have a search and
  // rescue helicopter to fly for them"): the calls come to the rescue helicopter - none while you're out of it, and
  // flying something else the shift waits for you to get back to it
  if (!j.call) {
    if (!flying) { standBy(world, p, j, v); return; }
    if (j.stage === 'board') { j.stage = 'wait'; j.text = 'Search & rescue: on call - stand by for the next call'; j.nextAt = Math.max(j.nextAt, now + 3); p.meDirty = true; }
    if (now >= j.nextAt) newCall(world, p);
    return;
  }
  const c = j.call, vic = world.get(c.vic);
  if (!vic || vic.removed) { endCall(world, p, 'The call was cancelled - someone else got to them.', 'info'); return; }
  // a hurt patient's time runs down (aboard too); a hard landing with them aboard costs them (aircraft.js landSink)
  if ((v.landAt || 0) > c.landAt) {
    c.landAt = v.landAt;
    if (c.aboard && v.landSink > FLY.HARD_SINK) { c.hard++; if (c.hurt) c.life -= SAR.hardLife; world.notify(p, 'A hard landing - the patient felt that.', 'warn'); }
  }
  if (c.hurt) {
    c.life -= dt;
    if (c.life <= 0) { endCall(world, p, c.aboard ? 'The patient didn\'t make it. Nothing to be done - stand by for the next call.' : 'Too late - they didn\'t make it. Stand by for the next call.', 'bad'); return; }
  }
  if (!c.found && now - c.at > SAR.callS) { endCall(world, p, 'The call\'s been handed to another crew - you took too long.', 'bad'); return; }
  if (c.aboard) { stepAboard(world, p, j, c, v, vic); return; }
  if (c.hooked && vic.vehId !== v.id) { c.hooked = false; c.cable = 0; }   // (thrown off the cable: the helicopter came down)
  // searching: within sight they spot you - they wave, a flare goes up
  if (!c.found) {
    const afoot = ped && !ped.dead && !ped.vehId;   // (in some other aircraft: it's not the rescue crew looking)
    if (!flying && !afoot) return;
    const ex = flying ? v.x : ped.x, ey = flying ? v.y : ped.y;
    if (Math.hypot(ex - vic.x, ey - vic.y) < SAR.seeR) {
      c.found = true; c.flareAt = now; j.stage = 'rescue';
      j.text = HARNESS[c.kind] ? 'There they are! Hover low right over them and hold Act to lower the harness' : 'There they are! Land near them and they\'ll be helped aboard';
      world.notify(p, `There - a flare! ${HARNESS[c.kind] ? 'Nowhere to land: hover low over them and hold Act to lower the harness.' : 'Put down close by and they\'ll come aboard.'}`, 'good');
      if (!WATER_T[world.map.tileAtPx(vic.x, vic.y)]) wave(vic, true);
      p.meDirty = true;
    }
    return;
  }
  vic.a = Math.atan2(v.y - vic.y, v.x - vic.x);
  if (HARNESS[c.kind]) stepHoist(world, p, j, c, v, vic, flying, dt);
  else stepLanding(world, p, j, c, v, vic, flying, dt);
}

// on shift but not in the rescue helicopter: no calls till you are (told once, and again if you take off in another one)
function standBy(world, p, j, v) {
  const ped = p.ped, other = ped && ped.vehId && ped.vehId !== v.id ? world.get(ped.vehId) : null;
  const k = other ? (other.def.kind === 'air' ? 'other-air' : 'other') : 'out';
  if (j.stage !== 'board' || j.told !== k) {
    j.stage = 'board'; j.told = k;
    j.text = `Search & rescue: get in your ${v.def.name} - the calls come to it`;
    if (k === 'other-air') world.notify(p, `Rescue calls only come to the rescue helicopter, not a ${other.def.name} - your ${v.def.name} is the green ring.`, 'warn');
    p.meDirty = true;
  }
}

function wave(vic, on) {
  if (on && !vic.dancing) { vic.gt = 'dance'; vic.dm = DM.pump; vic.dancing = true; vic.appVer = (vic.appVer || 0) + 1; }
  else if (!on && vic.dancing) { vic.dancing = false; vic.dm = undefined; vic.gt = null; vic.appVer = (vic.appVer || 0) + 1; }
}
const landed = (world, v) => (v.alt || 0) <= floorAt(world.map, v.x, v.y) + 1 && Math.hypot(v.vx, v.vy) < 30;
// in a seat (on the cable too: it carries them with it - the page draws them hanging in the harness)
function seatIn(world, p, c, v, vic) {
  if (vic.vehId === v.id) return true;
  const seat = v.seats.findIndex((s, i) => i > 0 && !s);
  if (seat < 0) { if (world.time - c.warnAt > 6) { c.warnAt = world.time; world.notify(p, 'No free seat aboard - let your passengers off first.', 'warn'); } return false; }
  v.seats[seat] = vic.id; vic.vehId = v.id; vic.seat = seat; vic.vx = 0; vic.vy = 0;
  return true;
}
function board(world, p, j, c, v, vic) {
  if (!seatIn(world, p, c, v, vic)) return false;
  wave(vic, false);
  c.aboard = true; c.boardedAt = world.time; j.stage = 'deliver';
  const pad = nearestPad(world.map, v.x, v.y, true) || nearestPad(world.map, v.x, v.y);
  j.text = `Fly them to a hospital - land on its roof pad${pad ? ` (${pad.name.replace(/ (roof pad|helipad)$/, '')})` : ''} or the helipad in its yard`;
  world.notify(p, c.hurt ? 'Patient aboard! Get them to a hospital fast - land on its roof, or the helipad in its yard. Gently does it.' : 'They\'re aboard, cold and tired but fine. Fly them to a hospital to be checked over.', 'good');
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  p.meDirty = true;
  return true;
}

// land for them: down close by, they walk over and climb in (the hurt are helped aboard by the crew)
function stepLanding(world, p, j, c, v, vic, flying, dt) {
  const d = Math.hypot(v.x - vic.x, v.y - vic.y);
  if (!(landed(world, v) && (v.alt || 0) < 1 && d < SAR.landR)) { if (c.board) { c.board = 0; } return; }
  wave(vic, false);
  c.board += dt;
  const sp = c.hurt ? 45 : 90, k = Math.min(1, (sp * dt) / Math.max(1, d - 40));
  if (d > 46) { vic.x += (v.x - vic.x) * k; vic.y += (v.y - vic.y) * k; world.place(vic); }
  if (d <= 46 || c.board > SAR.boardS + d / sp) board(world, p, j, c, v, vic);
  void flying;
}

// the harness: hover low over them and hold Act - the cable pays out to them, they clip on, it winches them up
function stepHoist(world, p, j, c, v, vic, flying, dt) {
  const H = SAR.hoist, now = world.time;
  const held = flying && ((p.prevBits || 0) & IN.ACTION);
  const above = (v.alt || 0) - floorAt(world.map, vic.x, vic.y);
  const across = Math.hypot(v.x - vic.x, v.y - vic.y), drift = Math.hypot(v.vx, v.vy);
  const was = c.cable;
  if (c.hooked) {
    if (held) c.cable = Math.max(0, c.cable - H.winch * dt);
    c.cable = Math.min(c.cable, Math.max(0, above));
    if (c.cable <= 0) { board(world, p, j, c, v, vic); c.cable = 0; }
  } else if (held && across <= H.reach && drift <= H.drift && (v.alt || 0) > FLY.AIRBORNE) {
    c.cable = Math.min(H.maxLen, c.cable + H.payout * dt);
    if (above <= H.maxLen && c.cable >= above - 6 && seatIn(world, p, c, v, vic)) {
      c.hooked = true; c.cable = Math.max(0, above);
      wave(vic, false);
      world.notify(p, 'Clipped on! Keep holding Act to winch them up.', 'good');
    } else if (c.cable >= H.maxLen && now - c.warnAt > 4) { c.warnAt = now; world.notify(p, `Too high - the cable won't reach them. Come down below ${Math.round(H.maxLen / 22)} m.`, 'warn'); }
  } else {
    if (held && now - c.warnAt > 4) { c.warnAt = now; world.notify(p, drift > H.drift ? 'You\'re drifting - hold still over them so the harness can reach.' : (v.alt || 0) <= FLY.AIRBORNE ? 'Get airborne and hover over them.' : 'Not over them - get right above them for the harness.', 'warn'); }
    c.cable = Math.max(0, c.cable - H.winch * dt);
  }
  if (c.cable !== was || c.hooked) p.meDirty = true;
}

// aboard: to a hospital's pad (the roof's - or the yard's), landed: handed over and paid
function stepAboard(world, p, j, c, v, vic) {
  if (vic.vehId !== v.id) { endCall(world, p, 'You lost your patient.', 'bad'); return; }
  if (c.hurt) { const pct = Math.max(0, Math.round((c.life / c.lifeMax) * 100)); const t = `Patient aboard (${pct}%) - land on a hospital's roof pad or helipad`; if (t !== j.text) { j.text = t; p.meDirty = true; } }
  if (!landed(world, v)) return;
  const pad = hospitalPads(world.map).find((q) => Math.hypot(q.x - v.x, q.y - v.y) <= FLY.PAD_R * 1.25 && Math.abs((v.alt || 0) - q.alt) < 10);
  if (!pad) return;
  const elapsed = world.time - c.at, par = SAR.parS + c.far / SAR.perKmS;
  const fast = Math.max(0, Math.min(1, (par * 2 - elapsed) / par)) * SAR.fast;
  const gentle = Math.max(SAR.minPay, 1 - c.hard * SAR.hardCut);
  const pay = Math.round(((SAR.base + (c.far / 1000) * SAR.perKm) * (1 + fast) * gentle) / 5) * 5;
  const prof = p.profile;
  prof.cash += pay; prof.samaritan = (prof.samaritan || 0) + SAR.samaritan;
  prof.stats.rescues = (prof.stats.rescues || 0) + 1;
  j.saved++;
  j.expires = Math.max(j.expires, world.time + SAR.shiftS / 2);   // (busy: the shift runs on)
  j.lastPay = { pay, fast: Math.round(fast * 100), hard: c.hard, roof: pad.roof };
  world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y });
  endCall(world, p, `${c.hurt ? 'Patient handed over to the trauma team' : 'Hiker handed over'} at ${pad.name}. +$${pay}${fast > 0.05 ? ' (a quick rescue)' : ''}${c.hard ? ` (${c.hard} hard landing${c.hard > 1 ? 's' : ''} cost you)` : ''}, +${SAR.samaritan} Samaritan.`, 'good');
  store.touch();
}

// ---- Act ----------------------------------------------------------------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return null;
  if (ped.vehId) {
    const j = p.job;
    if (!j || j.type !== 'sar' || !j.call || !j.call.found || j.call.aboard || !HARNESS[j.call.kind] || ped.vehId !== j.truck || ped.seat !== 0) return null;
    return { label: j.call.hooked ? 'Hold: winch them up' : 'Hold: lower the harness', run: () => {} };
  }
  if (p.job) return null;
  // at a Search & Rescue HQ (World v3: shared/world3-sarhq.js) - its door or its pad; never a hospital where there's an
  // HQ (the owner, 10-23: "we should have a few specific search and rescue HQs to take these missions not the hospital")
  const m = world.map, hq = (m.pois || []).find((q) => q && q.kind === 'sar' && Math.hypot(q.x - ped.x, q.y - ped.y) < (q.r || 44) + 30);
  const pad = hq ? nearestBase(m, hq.x, hq.y) : basePads(m).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < FLY.PAD_R + 30);
  if (!pad) return null;
  return { label: 'Sign on as a search & rescue pilot (a rescue helicopter is issued)', run: () => { const err = start(world, p, pad); if (err) world.notify(p, err, 'bad'); } };
}

// the hospital yard pad a shift starts from: the nearest to p (the phone's job list)
export function baseFor(world, p) { return p.ped ? nearestBase(world.map, p.ped.x, p.ped.y) : basePads(world.map)[0] || null; }

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------------
export function target(world, p, j) {
  const c = j.call, v = world.get(j.truck);
  if (!c) return { text: j.text, x: Math.round(j.base.x), y: Math.round(j.base.y), stage: 'wait' };
  if (c.aboard) {
    const pad = v ? nearestPad(world.map, v.x, v.y, true) || nearestPad(world.map, v.x, v.y) : null;   // (the roof's pad: drawn up on the roof in both renderers)
    return { text: j.text, x: Math.round(pad ? pad.x : j.base.x), y: Math.round(pad ? pad.y : j.base.y), stage: 'deliver' };
  }
  if (!c.found) return { text: j.text, x: c.cx, y: c.cy, stage: 'search', area: [c.cx, c.cy, SAR.circleR] };
  const vic = world.get(c.vic), t = { text: j.text, x: Math.round(vic ? vic.x : c.x), y: Math.round(vic ? vic.y : c.y), stage: 'rescue', flare: [Math.round(c.x + 64), Math.round(c.y + 40)] };
  if (HARNESS[c.kind] && v && (c.cable > 0 || c.hooked)) t.hoist = [v.id, Math.round(c.cable), c.hooked ? 1 : 0, Math.round(c.x), Math.round(c.y)];
  return t;
}

// ---- the dev menu (server/dev.js 'sar'): on shift at the controls of your rescue helicopter, then msg.k: a call of that
// kind ('ground' | 'rough' | 'water' | 'lost') at the nearest such place (msg.hover: hovering low right over them, found);
// msg.roof: down on the nearest hospital's roof pad (a patient aboard with msg.k). -> error | null
export function devSar(world, p, msg = {}) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  if (!p.job || p.job.type !== 'sar') {
    if (p.job) jobs.failJob(world, p, 'Job cancelled.');
    const err = start(world, p, nearestBase(world.map, ped.x, ped.y));   // (the Search & Rescue HQ's pad - a hospital's yard only where there's no HQ)
    if (err) return err;
  }
  const j = p.job, v = world.get(j.truck);
  if (ped.vehId !== v.id) {
    if (ped.vehId) { const o = world.get(ped.vehId); if (o) { const i = o.seats.indexOf(ped.id); if (i >= 0) o.seats[i] = 0; } }
    v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; p.lastVehicle = v.id;
  }
  if (j.call) endCall(world, p, null);
  const kind = ['ground', 'rough', 'water', 'lost'].includes(msg.k) ? msg.k : null;
  const put = (x, y, alt) => { v.x = x; v.y = y; v.alt = alt; v.vx = 0; v.vy = 0; v.vz = 0; v.spool = 1; world.place(v); ped.x = x; ped.y = y; world.place(ped); p.meDirty = true; };
  if (kind) {
    const S = sitesOf(world.map), list = kind === 'water' ? S.water : kind === 'rough' ? S.rough : S.open;
    let best = null, bd = Infinity;
    for (const s of list) { const d = Math.hypot(s.x - v.x, s.y - v.y); if (d > 400 && d < bd) { bd = d; best = s; } }
    if (!best) return `No ${kind} places on this map.`;
    const c = callAt(world, p, kind, best.x, best.y);
    if (msg.hover) put(best.x + 10, best.y, HARNESS[kind] ? 120 : 160);
    if (msg.hooked && HARNESS[kind]) { const vic = world.get(c.vic); put(best.x + 10, best.y, 160); c.found = true; j.stage = 'rescue'; if (seatIn(world, p, c, v, vic)) { c.hooked = true; c.cable = 110; j.text = 'Clipped on - hold Act to winch them up'; } }   // (msg.hooked: on the cable, halfway up)
    if (msg.roof) { c.found = true; const vic = world.get(c.vic); seatIn(world, p, c, v, vic); board(world, p, j, c, v, vic); }
  }
  if (msg.roof) { const pad = nearestPad(world.map, v.x, v.y, true); if (!pad) return 'No hospital roof pad.'; put(pad.x, pad.y + (j.call ? 0 : 40), pad.alt); }
  world.notify(p, `[dev] On shift${kind ? `: a ${kind} call` : ''}${msg.hover ? ', hovering over them' : ''}${msg.roof ? ', on the roof pad' : ''}.`, 'info');
  return null;
}
