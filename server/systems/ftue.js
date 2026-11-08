// The first-time experience (the owner, 11-04: "the tutorial should be short and sweet and give people general
// direction"; the design: the FTUE is the tutorial - no tour). A new character (store.js defaultProfile: ftue { st: 'new' })
// gets, once their look is picked:
//   0. where to arrive (the owner, 11-06: "We can have multiple stations to choose from"): one card of the arrival
//      stations (firstcar.js arrivalChoices - World v3's: a station in the city, on the coast, in the desert and in the
//      country, each with an arrival line of its own: shared/world3-arrivals.js), each its name, region and a line of
//      what it's like, the default first. Picked: { t: 'intro', a: 'pick', stn }; skipped (Esc, B, Skip) or left
//      FTUE.pickS: the default (firstcar.js arrivalChoices);
//   1. the arrival: off a train at the arrival station (firstcar.js arrivalFor: the one function for the train, the used
//      lot and the alley) - a short staged scene on the page (client/ftue.js): on its arrival line the train comes out of
//      the first tunnel, slows into the platform, stops, the doors open and you step off; then it pulls out into the
//      far tunnel. The train is the page's alone - no server train, so arrivals never meet; everyone else sees you
//      appear on the platform as the doors open (FTUE.doorS: ped.ftueHid till then - net.js). FTUE.arriveS long,
//      skippable (the page's Esc / B / a tap: { t: 'intro', a: 'skip' });
//   2. one question on the platform, "What brings you to town?", on the conversation screen's kit (a menu at ASK_POI,
//      the answers numbered): Honest work, A little hustle, The great outdoors, Just let me roam. Not a class - it picks
//      the first goal and how you get your first car (the owner, 11-06 22:49: "The first car is earned, by the path you
//      pick" - firstcar.js): honest work and the outdoors get cash (FTUE.cash) for a beater at the station's used lot,
//      the hustle steals one in the station's alley (with a little pocket money, FTUE.hustleCash), roam gets the cash and the lot on the map;
//   3. the first goal, at most three steps, each teaching one control where it's needed (the page shows that control's
//      glyph for the device in hand - shared/controls.js): get your car - buy it at the used lot (move) or steal it in
//      the alley (vehicle) - drive there (vehicle), do the thing (action). It rides the HUD's job card and the job's
//      way-finding (players.js buildMe: me.job), the step's line in me.ftue. Done: a small reward (FTUE.reward, xp for
//      driving) and the big moment. Already driving (a car of your own out, a replay): straight to the drive.
// Then the first-time moments (once each, ever - the hurt one at most FTUE.hurtMax times - while tips are on, and only
// while the character is new: FTUE.tipsPlayH hours played, FTUE.tipsDays days after the FTUE ended): the first wanted star, the first time knocked down,
// the first shop, the first stop for transit, the first night, the first time hurt - one fading line each with "More in
// your Guide" (the page's Guide app: shared/guide.js). The Guide replays it all: "Replay the arrival" runs the arrival,
// the question and a first goal again from where you stand; "Show tips again" clears the moments.
// Everyone goes through it once (the owner, 11-04): profiles from before it are reset to new characters as the store loads
// (server/store.js PROGRESS_EPOCH). A wiped profile (players.js wipeProgress, wipeAccount: Start fresh) is a new character
// too - store.js defaultProfile's ftue { st: 'new' } - so it gets the arrival on its next join (and the first car to earn).
// Every number: shared/rules.js FTUE. Analytics (server/launch.js world.track 'ftue'): ftue_pick (a station picked) or
// ftue_pick_default (skipped, or left to the default), ftue_arrive, ftue_answer_<which>,
// ftue_step1..3 (reached), ftue_done, ftue_skip, moment_<id>, guide_open.
//   profile.ftue: { st: 'new' | 'pick' | 'arrive' | 'ask' | 'goal' | 'done', stn (the arrival station's poi), ans, step,
//                   goal { k, x, y, name, poi? }, car { k: 'buy' | 'steal', x, y, name, poi?, n (your cars when it
//                   began) } (step 1's), paid (1: the answer's cash given - once, ever), how ('goal' | 'roam' | 'skip' | 'old'), at { stage: ms }, m { moment: 1 },
//                   tips (0: off - Settings), replay (1: the Guide's replay - no move to the station), pt (seconds played
//                   since the record began), hn (the hurt line's showings), again (1: the Guide's "Show tips again" - the
//                   new-character window no longer applies) }
import { FTUE } from '../../shared/rules.js';
import { PED_BLOCK } from '../../shared/mapcore.js';
import { ITEMS } from '../../shared/items.js';
import { store } from '../store.js';
import { moved } from '../movemark.js';
import * as starter from './starter.js';
import * as firstcar from './firstcar.js';
import * as safety from './safety.js';
import * as homes from './homes.js';
import * as fishing from './fishing.js';
import * as mailjob from './mailjob.js';
import * as skills from './skills.js';
import * as transit from './transit.js';
import * as ferries from './ferries.js';

export const ASK_POI = -31;   // (the question's menu: not a place's - economy.js handleMenu asks onMenu first)
export const ANSWERS = [
  { id: 'work', label: 'Honest work', note: 'cash for a cheap car, then a first job' },
  { id: 'hustle', label: 'A little hustle', note: 'steal a car, then meet a contact' },
  { id: 'outdoors', label: 'The great outdoors', note: 'cash for a pickup, a rod and a fishing spot' },
  { id: 'roam', label: 'Just let me roam', note: 'cash for a cheap car, no goal' },
];
// the controls the steps teach (shared/controls.js actions); stealing a car, step 1's: getting in (vehicle)
export const STEP_CTL = [null, 'move', 'vehicle', 'action'];
const stepCtl = (f) => (f.step === 1 && f.car && f.car.k === 'steal' ? 'vehicle' : STEP_CTL[f.step]);
// The first-time moments: what each says (one line), the control it names, the Guide's section it opens on
export const MOMENTS = {
  wanted: { text: 'You\'re wanted. Get out of sight and lie low until the stars fade.', sec: 'law' },
  down: { text: 'Knocked down. Pick where to wake up - or call for help and wait for a revive.', sec: 'law' },
  shop: { text: 'Shopping: pick a line to buy it. Cash goes first, then your bank.', sec: 'items' },
  transit: { text: 'Buses, trains and ferries are free - wait at the stop and board.', ctl: 'action', sec: 'around' },
  night: { text: 'Night falls. A flashlight lights your way.', ctl: 'light', sec: 'items' },
  hurt: { text: 'Hurt? Hold for your quick wheel - a bandage patches you up.', ctl: 'use', sec: 'items' },
};

// The arrival stations' card: each region's name and its one line (World v3's regions: shared/world3-arrivals.js
// ARRIVAL_PICKS); a map without arrival lines names the station's district
export const REGIONS = {
  city: { region: 'The city', vibe: 'Greenfield Park, downtown\'s towers and the bright lights. Work is never far.' },
  coast: { region: 'The north coast', vibe: 'Beach towns, the boardwalk and the surf. Easy days by the water.' },
  desert: { region: 'The red rock desert', vibe: 'Mesas, mines and open highway. Room to roam.' },
  country: { region: 'Willow Valley', vibe: 'Farms, rivers and quiet roads. The great outdoors.' },
};
const rec = (prof) => prof.ftue;
const active = (f) => !!f && (f.st === 'pick' || f.st === 'arrive' || f.st === 'ask' || f.st === 'goal');
const stamp = (f, k) => { (f.at ||= {})[k] = Date.now(); };
const track = (world, p, step) => { if (world.track) world.track('ftue', p, { step }); };
const send = (p, m) => { if (p.conn) p.conn.sendJSON(m); };
const posOf = (world, p) => { const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null; return v || ped; };
const districtName = (world, x, y) => (world.map.districtAt && world.map.districtAt(x, y)?.name) || '';
// a new character's record (store.js defaultProfile)
export const fresh = () => ({ st: 'new', tips: 1, m: {} });

// ---- where: the platform, the goal ------------------------------------------------------------------------------------
// The arrival station's platform: { x, y, from } - from: a point back along the line it came in on (where the page's
// camera starts). Open-air platforms only (not the El's deck, not the subway): else a spot by the station's board.
export function platformOf(world, poi) {
  const A = (world.map.arrivals || []).find((q) => q.poi === poi.id);
  if (A) return arrivalSpot(world, A);
  const rails = world.map.rails || (world.map.rail ? [world.map.rail] : []);
  let best = null, bd = 900;
  for (const r of rails) for (const st of r.stations || []) {
    if (st.under || st.el || st.deck || !st.platform) continue;
    const d = Math.hypot(st.platform.x - poi.x, st.platform.y - poi.y);
    if (d < bd) { bd = d; best = { st, r }; }
  }
  const P0 = best ? best.st.platform : null, m = world.map;
  const on = P0 && !PED_BLOCK[m.tileAtPx(P0.x, P0.y)] && !PED_BLOCK[m.tileAtPx(P0.x + 10, P0.y)] && !PED_BLOCK[m.tileAtPx(P0.x - 10, P0.y)];
  const at = on ? { x: P0.x, y: P0.y } : best ? homes.spawnSpot(world, P0.x, P0.y, () => 0.5) : homes.spawnSpot(world, poi.x, poi.y, () => 0.5);   // (on the platform itself where you can stand)
  let from = { x: at.x, y: at.y - 900 };
  const P = best && best.r.pts;
  if (P && P.length > 2) {   // (1100 px back along the track from where it passes the platform)
    let i0 = 0, d0 = Infinity;
    for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i].x - at.x, P[i].y - at.y); if (d < d0) { d0 = d; i0 = i; } }
    let left = 1100, i = i0;
    for (let k = 0; k < P.length && left > 0; k++) { const j = (i - 1 + P.length) % P.length; left -= Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y); i = j; }
    from = { x: P[i].x, y: P[i].y };
  }
  return { x: at.x, y: at.y, from };
}

// An arrival line's (shared/world3-arrivals.js): where you step off - on the platform at the middle coach's doors (the
// train stops with its middle at the platform's: client/ftue.js) - and the line for the page's train: its start, heading,
// length, the portals' and the stop's distances along it
const DOOR_U = 8, DOOR_O = 76;   // (px: the middle coach's doors along the line from the platform's middle; off the track)
export function arrivalSpot(world, A) {
  const st = A.stations[0], ca = Math.cos(A.a), sa = Math.sin(A.a), nx = -sa, ny = ca;   // (the platform on the right of the way it runs)
  const x = st.x + ca * DOOR_U + nx * DOOR_O, y = st.y + sa * DOOR_U + ny * DOOR_O, p0 = A.pts[0];
  return { x, y, from: { x: A.portals[0].x, y: A.portals[0].y }, line: { x: Math.round(p0.x), y: Math.round(p0.y), a: +A.a.toFixed(4), len: A.len, in: A.portals[0].s, out: A.portals[1].s, stop: st.s, door: st.s + DOOR_U } };
}

const nearestOf = (list, x, y) => {
  let best = null, bd = Infinity, inBand = null, ib = Infinity;
  for (const q of list) {
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < bd) { bd = d; best = q; }
    if (d >= FTUE.goalMin && d <= FTUE.goalMax && d < ib) { ib = d; inBand = q; }
  }
  return inBand || best;
};
// The first goal for an answer, from (x, y) - the station: { k, x, y, name, poi? } or null (nothing of the kind anywhere)
//   work      a mail round at the nearest post office (the walking round: five letters - mailjob.js); else courier work
//             at a depot (the warehouse's contracts)
//   hustle    the fence (the Back-Alley Exchange: buys stolen cargo, and has work - the mail train); else a gang HQ
//   outdoors  a bank to fish from: a pond, a lake, a river or the shore - never a park's koi pond (stealing those is a crime)
export function goalFor(world, ans, x, y) {
  const m = world.map, pois = m.pois;
  if (ans === 'work') {
    const post = mailjob.officesOf(m).filter((q) => /post office/i.test(q.label || ''));
    const q = post.length ? nearestOf(post, x, y) : nearestOf(pois.filter((o) => o.kind === 'warehouse'), x, y);
    if (!q) return null;
    return { k: post.length ? 'mail' : 'courier', x: Math.round(q.x), y: Math.round(q.y), name: q.label, poi: q.id };
  }
  if (ans === 'hustle') {
    const fences = pois.filter((o) => o.kind === 'fence'), q = nearestOf(fences.length ? fences : pois.filter((o) => o.kind === 'gang'), x, y);
    if (!q) return null;
    return { k: q.kind === 'fence' ? 'fence' : 'gang', x: Math.round(q.x), y: Math.round(q.y), name: q.label, poi: q.id };
  }
  if (ans === 'outdoors') {
    const ok = (hab) => hab && hab.spot !== 'lily' && ['pond', 'lake', 'river', 'creek', 'shore', 'pier', 'swamp'].includes(hab.water);
    // (beyond goalMin if there's one within reach: a ring of spots out from the station, then the nearest of all)
    let b = null;
    for (const r of [FTUE.goalMin * 1.4, FTUE.goalMin * 2.6]) {
      for (let k = 0; k < 8 && !b; k++) { const a = (k / 8) * Math.PI * 2, c = fishing.bankNear(world, x + Math.cos(a) * r, y + Math.sin(a) * r, 24, ok); if (c && Math.hypot(c.x - x, c.y - y) >= FTUE.goalMin) b = c; }
      if (b) break;
    }
    b ||= fishing.bankNear(world, x, y, FTUE.fishR, ok);
    if (!b) return null;
    const water = { pond: 'the pond', lake: 'the lake', river: 'the river', creek: 'the creek', shore: 'the shore', pier: 'the pier', swamp: 'the marsh' }[b.hab.water] || 'the water';
    return { k: 'fish', x: Math.round(b.x), y: Math.round(b.y), a: +b.a.toFixed(2), name: water };
  }
  return null;
}

// ---- the lines ---------------------------------------------------------------------------------------------------------
const THERE = { mail: (g) => `Take a mail round at ${g.name}`, courier: (g) => `Sign on for work at ${g.name}`, fence: (g) => `Talk to the fence at ${g.name}`, gang: (g) => `Talk to the Syndicate at ${g.name}`, fish: () => 'Cast a line: face the water, hold and let go' };
const PLACE = { mail: (g) => g.name, courier: (g) => g.name, fence: (g) => g.name, gang: (g) => g.name, fish: (g) => g.name };
// the step's line (the page puts its control's glyph in front of it) and the job card's objective
export function stepLine(world, p, f) {
  const g = f.goal;
  if (!g) return '';
  if (f.step === 1) return carLine(world, p, f);
  if (f.step === 2) return p.ped && p.ped.vehId ? `Drive to ${PLACE[g.k](g)}` : myCar(world, p) ? `Get in your car and drive to ${PLACE[g.k](g)}` : `Head for ${PLACE[g.k](g)}`;
  return THERE[g.k](g);
}
// step 1's line: buy a car at the used lot, or steal the one in the alley (Safety mode on: it asks first - press again)
function carLine(world, p, f) {
  const c = f.car;
  if (!c) return '';
  if (c.k === 'steal') { const v = firstcar.markOf(world, p), far = v && Math.hypot(v.x - c.x, v.y - c.y) > 600; return `Steal a car ${far ? 'parked down the street from' : 'in'} ${c.name}: walk up to it and get in${safety.on(p) ? ' (Safety mode is on: press twice)' : ''}`; }
  return `Buy a cheap car at ${c.name} - you've the cash for one`;
}
// your car out for step 2: the first one you bought or stole, a starter car, your car out in the world
const myCar = (world, p) => starter.carOf(world, p.pid) || (() => { const v = world.get(p.firstCarId) || world.get(p.activeVehicle); return v && !v.removed && !v.wreckAt && (v.owner === p.pid || v.id === p.firstCarId) ? v : null; })();
const cardText = (world, p, f) => (f.step === 1 ? (f.car && f.car.k === 'steal' ? `Steal a car in ${f.car.name}` : `Buy a car at ${f.car ? f.car.name : 'a dealership'}`) : f.step === 2 ? `${p.ped && p.ped.vehId ? 'Drive' : 'Get'} to ${PLACE[f.goal.k](f.goal)}` : THERE[f.goal.k](f.goal));
const END = {
  mail: 'Post the letters on your round. After that, the city\'s yours - your phone\'s Guide has the rest.',
  courier: 'Haul the crate to its storefront. After that, the city\'s yours - your phone\'s Guide has the rest.',
  fence: 'The fence buys stolen cargo and knows of work - the mail train. Your phone\'s Guide has the rest.',
  gang: 'The Syndicate takes members, and its turf leaves them be. Your phone\'s Guide has the rest.',
  fish: 'Strike when it bites. Sell the catch at a bait shop or a fish market - your phone\'s Guide has the rest.',
};
export const ROAM_LINE = 'Your phone\'s Guide has everything. The city\'s yours.';

// ---- the page's view: me.ftue and me.job ------------------------------------------------------------------------------
// me.ftue: { st, step, ctl, line, ans } while it runs (null otherwise)
export function meInfo(world, p) {
  const f = rec(p.profile);
  if (!active(f)) return null;
  if (f.st !== 'goal') return { st: f.st };
  return { st: 'goal', step: f.step, ctl: stepCtl(f), line: stepLine(world, p, f), ans: f.ans };
}
// me.job (players.js buildMe): the goal's way - the car first, then the place - with the job card's step N of 3
export function target(world, p) {
  const f = rec(p.profile);
  if (!f || f.st !== 'goal' || !f.goal || p.job) return null;
  const t = { text: cardText(world, p, f), k: 'First goal', step: [f.step, 3], stage: `ftue${f.step}`, x: f.goal.x, y: f.goal.y };
  if (f.step === 1 && f.car) {   // (the used lot's gate; the car to steal itself, ringed)
    t.x = Math.round(f.car.x); t.y = Math.round(f.car.y);
    const v = f.car.k === 'steal' ? firstcar.markOf(world, p) : null;
    if (v) { t.x = Math.round(v.x); t.y = Math.round(v.y); t.veh = [t.x, t.y, v.def.i, 'UNLOCKED']; }   // (not yours - yet: its plate says what it is - client main.js drawJobTruck)
  }
  return t;
}

// ---- joining -----------------------------------------------------------------------------------------------------------
// players.join (a new session), before starter.onJoin: one that left mid-way picks up where it was - the arrival or the question asked again, the goal's step as it was
export function onJoin(world, p) {
  const prof = p.profile;
  if (!prof.ftue) { prof.ftue = fresh(); store.touch(); }   // (no record: a new character's - every profile from before the FTUE was reset to one: store.js PROGRESS_EPOCH)
  const f = prof.ftue;
  f.m ||= {};
  if (f.st === 'pick') { p.ftuePickAt = world.time + 1.5; p.ftuePickUntil = p.ftuePickAt + FTUE.pickS; }   // (left at the arrival stations' card: it comes up again)
  else if (f.st === 'arrive') { f.st = 'ask'; p.ftueAskAt = world.time + 1.5; }   // (left during the arrival: straight to the question)
  else if (f.st === 'ask') p.ftueAskAt = world.time + 1.5;
  p.meDirty = true;
}

// ---- the arrival -------------------------------------------------------------------------------------------------------
function arrive(world, p, replay = false) {
  const f = rec(p.profile), ped = p.ped;
  let name, place, to, from, line = null;
  if (!replay) {
    const g = firstcar.arrivalFor(world, p), poi = g ? world.map.pois[g.poi] : null;
    if (!poi) { f.st = 'ask'; p.ftueAskAt = world.time; return; }   // (no station anywhere: the question where you are)
    const pl = platformOf(world, poi);
    ped.hidden = false; ped.inside = null; ped.interior = null; ped.entering = null; ped.sub = false; ped.ug = 0;   // (out of wherever they woke: a hospital's waiting room)
    ped.x = pl.x; ped.y = pl.y; ped.lz = 0; ped.vx = 0; ped.vy = 0; ped.a = Math.PI / 2;
    world.place(ped); moved(ped);
    p.profile.pos = { x: Math.round(pl.x), y: Math.round(pl.y) };
    name = poi.label; place = regionOf(world, poi); to = pl; from = pl.from; line = pl.line || null;
    if (line) { ped.ftueHid = true; p.ftueShowAt = world.time + FTUE.doorS; ped.a = line.a + Math.PI / 2; }   // (out of everyone else's sight until the doors open; facing out of the train)
  } else {
    name = districtName(world, ped.x, ped.y) || 'the city'; place = ''; to = { x: ped.x, y: ped.y }; from = { x: ped.x - 700, y: ped.y - 500 };
  }
  homes.protect(world, ped, FTUE.arriveS + 3);
  f.st = 'arrive'; f.replay = replay ? 1 : 0; stamp(f, 'arrive');
  p.ftueUntil = world.time + FTUE.arriveS + 10;   // (the page says when its scene is over: this only if it never does - a page whose frames stall, a capture)
  send(p, { t: 'ftue', a: 'arrive', name, place, from: [Math.round(from.x), Math.round(from.y)], to: [Math.round(to.x), Math.round(to.y)], s: FTUE.arriveS, replay: replay ? 1 : 0, ...(line ? { line, stop: FTUE.stopS, door: FTUE.doorS, leave: FTUE.leaveS, gone: FTUE.goneS } : null) });
  if (!replay) track(world, p, 'ftue_arrive');
  store.touch(); p.meDirty = true;
}
// seen again by everyone: the doors open (or the arrival skipped, cut short)
function reveal(p) { if (p.ped && p.ped.ftueHid) { p.ped.ftueHid = false; p.meDirty = true; } p.ftueShowAt = 0; }
// the arrival stations' card (0.)
export function choices(world) {
  return firstcar.arrivalChoices(world).map((c) => {
    const poi = world.map.pois[c.poi], R = (c.key && REGIONS[c.key]) || null;
    return { id: c.poi, name: c.name.replace(/ Station$/, ''), region: R ? R.region : districtName(world, poi.x, poi.y) || 'The city', vibe: R ? R.vibe : '', def: c.def ? 1 : 0 };
  });
}
const regionOf = (world, poi) => { const c = firstcar.arrivalChoices(world).find((q) => q.poi === poi.id), R = c && c.key && REGIONS[c.key]; return R ? R.region : districtName(world, poi.x, poi.y); };
function offer(world, p) {
  const f = rec(p.profile), opts = choices(world);
  if (opts.length < 2) { pick(world, p, null); return; }   // (one station, or none: nothing to choose)
  f.st = 'pick'; stamp(f, 'pick'); p.ftuePickAt = 0;
  p.ftuePickUntil = world.time + FTUE.pickS;
  send(p, { t: 'ftue', a: 'pick', title: 'Where to?', sub: 'Pick where your train comes in. There\'s a cheap car to be had near each one.', opts, s: FTUE.pickS });
  store.touch(); p.meDirty = true;
}
// picked (stn: a station's poi from the card), or the default (null: skipped, left, or not one of the card's)
export function pick(world, p, stn) {
  const f = rec(p.profile);
  if (!f || (f.st !== 'pick' && f.st !== 'new')) return false;
  const c = firstcar.arrivalChoices(world), ch = c.find((q) => q.poi === stn) || c[0] || null;
  if (ch) f.stn = ch.poi;
  if (f.st === 'pick') track(world, p, ch && ch.poi === stn ? 'ftue_pick' : 'ftue_pick_default');
  arrive(world, p);
  return true;
}
function ask(world, p) {
  const f = rec(p.profile);
  reveal(p);
  f.st = 'ask'; stamp(f, 'ask'); p.ftueAskAt = 0; p.ftueAsked = world.time;
  send(p, { t: 'menu', poi: ASK_POI, ask: 1, title: 'What brings you to town?', sub: 'Pick one - it only sets your first goal. You can do all of it, any time.', opts: ANSWERS.map((a) => ({ id: a.id, label: a.label, note: a.note, shut: true })) });
  store.touch(); p.meDirty = true;
}

// ---- answering ---------------------------------------------------------------------------------------------------------
export function answer(world, p, ans) {
  const f = rec(p.profile);
  if (!f || f.st !== 'ask' || !ANSWERS.some((a) => a.id === ans) || !p.ped || p.ped.dead) return false;
  f.ans = ans; stamp(f, 'answer');
  track(world, p, `ftue_answer_${ans}`);
  const st = p.ped, stn = f.stn != null ? f.stn : (firstcar.arrivalFor(world, p) || {}).poi, P = stn != null ? firstcar.placesFor(world, stn) : null;
  pay(world, p, ans === 'hustle');   // (the first car's cash: honest work, the outdoors, roam; the hustle's smaller grant - firstcar.js)
  if (ans === 'roam') { roam(world, p, P); return true; }
  const g = goalFor(world, ans, st.x, st.y);
  if (!g) { roam(world, p, P); return true; }
  f.goal = g; f.st = 'goal'; f.car = null;
  if (ans === 'outdoors') gear(world, p);
  // step 1, your first car: bought at the used lot (honest work, the outdoors) or stolen in the alley (the hustle) - not
  // when you've a car out to drive already (a starter car, one you own out in the world: a replay)
  if (!st.vehId && !myCar(world, p) && P) {
    if (ans === 'hustle' && P.alley) {
      const v = firstcar.markCar(world, p, P.alley);
      if (v) f.car = { k: 'steal', x: Math.round(P.alley.x), y: Math.round(P.alley.y), name: P.alley.name };
    } else if (ans !== 'hustle' && P.lot) f.car = { k: 'buy', x: Math.round(P.lot.x), y: Math.round(P.lot.y), name: P.lot.name, poi: P.lot.poi, n: p.profile.vehicles.length };
  }
  setStep(world, p, f.car ? 1 : 2);
  return true;
}
// the answer's cash (FTUE.cash; the hustle's FTUE.hustleCash): once a character, ever - never again on the Guide's replay
function pay(world, p, hustle) {
  const f = rec(p.profile);
  if (f.paid) return;
  const amt = hustle ? FTUE.hustleCash : FTUE.cash;
  f.paid = 1; p.profile.cash += amt;
  world.notify(p, hustle ? `+$${amt} pocket money: food, ammo or bail. The car you'll take.` : `+$${amt} to get you started: enough for a cheap car.`, 'good');
  store.touch(); p.meDirty = true;
}
// just let me roam (or no goal to be had): the cash, and the used lot on your map - no steps
function roam(world, p, P) {
  const lot = P && P.lot;
  if (lot) send(p, { t: 'ftue', a: 'mark', x: Math.round(lot.x), y: Math.round(lot.y), label: lot.name });   // (the page's waypoint: client/ftue.js)
  world.notify(p, lot ? `${ROAM_LINE} A cheap car at ${lot.name} - it's on your map.` : ROAM_LINE, 'info');
  finish(world, p, 'roam');
}
// the outdoors answer: a rod and bait if you've none (shared/items.js: the cane pole, worms)
function gear(world, p) {
  const prof = p.profile, inv = prof.inventory;
  const got = [];
  if (!fishing.canFish(p)) { inv[FTUE.rod] = (inv[FTUE.rod] || 0) + 1; got.push(`a ${ITEMS[FTUE.rod].name.toLowerCase()}`); }
  const [bait, n] = FTUE.bait;
  if (!Object.keys(inv).some((k) => ITEMS[k] && ITEMS[k].bait && inv[k] > 0)) { inv[bait] = (inv[bait] || 0) + n; got.push(`${n} ${ITEMS[bait].name.toLowerCase()}`); }
  if (got.length) world.notify(p, `In your bag: ${got.join(' and ')}.`, 'good');
  store.touch();
}
function setStep(world, p, n) {
  const f = rec(p.profile);
  f.step = n; stamp(f, `s${n}`);
  track(world, p, `ftue_step${n}`);
  store.touch(); p.meDirty = true;
}
function finish(world, p, how) {
  const f = rec(p.profile);
  reveal(p);
  firstcar.dropMark(world, p);   // (a car still waiting in the alley: taken away)
  f.st = 'done'; f.how = how; f.replay = 0; stamp(f, 'done');
  p.nxDirty = true;   // (the "What's next" app takes over: whatsnext.js)
  p.ftueTipAt = world.time;   // (the first-time moments wait their gap after it)
  if (how === 'skip') track(world, p, 'ftue_skip');
  store.touch(); p.meDirty = true;
}
// the goal reached: the reward, the big moment, one line of where next
function complete(world, p) {
  const f = rec(p.profile), prof = p.profile;
  prof.cash += FTUE.reward;
  const xp = skills.gain(world, p, 'drive', FTUE.xp);
  send(p, { t: 'ftue', a: 'end', title: 'FIRST GOAL DONE', sub: `+$${FTUE.reward}${xp ? ` · +${Math.round(xp)} DRIVING XP` : ''}` });
  world.notify(p, END[f.goal.k], 'good');
  track(world, p, 'ftue_done');
  finish(world, p, 'goal');
}

// ---- the page's messages: { t: 'intro', a } ----------------------------------------------------------------------------
//   pick      the arrival stations' card: { stn } the station picked
//   skip      the card (the default station), the arrival (on to the question), the question (no goal), or the goal -
//             whichever is on
//   arrived   the arrival's scene played to its end (on to the question)
//   replay    the Guide's "Replay the arrival": from where you stand, the question and a first goal again
//   tips      the Guide's "Show tips again": the first-time moments from the start
//   tipset    Settings' "First-time tips" ({ on }): on or off
//   guide     the Guide app opened (analytics)
export function handle(world, p, msg) {
  const f = rec(p.profile), a = String(msg.a || '');
  if (!f) return;
  if (a === 'pick') { if (f.st === 'pick') pick(world, p, Number(msg.stn)); return; }
  if (a === 'skip' && f.st === 'pick') { pick(world, p, null); return; }   // (the card skipped: the default)
  if (a === 'skip' || a === 'arrived') {
    if (f.st === 'arrive') { if (a === 'skip') stamp(f, 'skipArrive'); ask(world, p); return; }
    if (a !== 'skip') return;
    if (f.st === 'ask' || f.st === 'goal') finish(world, p, 'skip');
    return;
  }
  if (a === 'replay') {
    if (active(f)) return;
    const why = !p.ped || p.ped.dead ? 'Not right now.' : p.ped.vehId ? 'Get out of the vehicle first.' : p.job ? 'Finish or quit your job first.' : p.wanted > 0 ? 'Not while you\'re wanted.' : p.ped.hidden || p.ped.interior ? 'Step outside first.' : null;
    if (why) { world.notify(p, why, 'warn'); return; }
    arrive(world, p, true);
    return;
  }
  if (a === 'tips') { f.m = {}; f.hn = 0; f.tips = 1; f.again = 1; p.ftueTipAt = world.time - FTUE.tipGapS + 3; store.touch(); p.meDirty = true; world.notify(p, 'Tips are back on: a line the first time you meet each thing.', 'info'); return; }
  if (a === 'tipset') { f.tips = msg.on ? 1 : 0; store.touch(); p.meDirty = true; return; }   // (Settings: First-time tips on or off - nothing shown is forgotten)
  if (a === 'guide') { if (!p.guideSaid) { p.guideSaid = 1; track(world, p, 'guide_open'); } }
}
// the question's menu (economy.js handleMenu): an answer, or closed without one (skipped)
export function onMenu(world, p, poiId, optId) {
  if (poiId !== ASK_POI) return false;
  const f = rec(p.profile);
  if (!f || f.st !== 'ask') return true;
  if (optId === 'close') finish(world, p, 'skip');
  else answer(world, p, String(optId));
  return true;
}
// The shop moment's places: a counter whose lines are things to buy (shared/items.js SHOPS' kinds, and the walk-in shops'
// counters - economy.js walkCounter). Not a home for sale, a car or boat dealer, the garage, a charter, the farm co-op,
// the grocery (it buys), the hospital, the bank, the police...: those menus have prices too, but "pick a line to buy it"
// isn't what they're about (the owner's 11-06 screenshot: the shop line at a house for sale's door).
export const SHOP_KINDS = new Set(['gunshop', 'sports', 'hardware', 'pharmacy', 'coffee', 'convenience', 'gasstation', 'club', 'vending', 'pawn', 'fence', 'tackle', 'fishmarket', 'smuggler', 'clothing', 'winery', 'fruitstand', 'market', 'snack', 'roadhouse', 'clubhouse', 'farmstand', 'lodge', 'huntcamp', 'trapper', 'butcher', 'assay', 'cinema']);
export const isShop = (poi) => !!poi && !poi.casino && !poi.bath && !poi.arcade && poi.store !== 'arcade' && (SHOP_KINDS.has(poi.kind) || (poi.kind === 'delivery' && !!poi.walk));
// a place's menu opened (economy.js openMenu): the hustle's contact talked to; the first shop
export function menuOpened(world, p, poi, menu) {
  const f = rec(p.profile);
  if (f && f.st === 'goal' && f.step === 3 && f.goal && f.goal.poi === poi.id && (f.goal.k === 'fence' || f.goal.k === 'gang' || f.goal.k === 'courier')) {
    if (f.goal.k !== 'courier') complete(world, p);   // (the courier's is its contract taken: update)
    return;
  }
  if (isShop(poi) && menu && menu.opts && menu.opts.some((o) => o.price > 0)) moment(world, p, 'shop');
}

// ---- the first-time moments --------------------------------------------------------------------------------------------
// Once each, ever (profile.ftue.m), while tips are on, never during the FTUE itself, FTUE.tipGapS apart at least. Never
// while you're down or dead (the owner's 11-06 screenshot: "Hurt? ... a bandage" over YOU'RE DOWN) - only 'down' itself,
// which is about that screen - nor FTUE.wakeS after you're back up (the wake-up screen): held till then (downs). Returns
// whether it fired.
// Only while the character is new (the owner, 11-06: "only new players, eventually these tip popups should stop"): none
// after FTUE.tipsPlayH hours played, nor FTUE.tipsDays days after the FTUE ended - unless the Guide's "Show tips again"
// asked for them (f.again).
export const tipsNew = (f) => !!f && (!!f.again || ((f.pt || 0) < FTUE.tipsPlayH * 3600 && !(f.at && f.at.done && Date.now() - f.at.done > FTUE.tipsDays * 86400e3)));
export function moment(world, p, id) {
  const f = rec(p.profile), M = MOMENTS[id];
  if (!f || !M || active(f) || !f.tips || (f.m && f.m[id]) || !p.conn || !tipsNew(f)) return false;
  if (id === 'hurt' && (f.hn || 0) >= FTUE.hurtMax) return false;   // (un-marked when you go down right after it: downs - twice at most)
  if (world.time - (p.ftueTipAt ?? -1e9) < FTUE.tipGapS) return false;
  if (id !== 'down' && (!p.ped || p.ped.dead || world.time - (p.ftueUpAt ?? -1e9) < FTUE.wakeS)) return false;
  (f.m ||= {})[id] = 1;
  if (id === 'hurt') f.hn = (f.hn || 0) + 1;
  p.ftueTipAt = world.time; p.ftueTipId = id;
  send(p, { t: 'ftue', a: 'tip', id, text: M.text, ctl: M.ctl || null, sec: M.sec });
  track(world, p, `moment_${id}`);
  store.touch();
  return true;
}
// (a bus stop, a station, a ferry in at its pier - not a marina: that's the boat dealer's)
const NEAR_TRANSIT = (world, p) => {
  const ped = p.ped;
  if (transit.stopNote(world, { ped })) return true;
  const R = FTUE.transitR;
  for (const q of world.map.pois) if (q.kind === 'station' && Math.abs(q.x - ped.x) < R && Math.abs(q.y - ped.y) < R) return true;
  return !!ferries.interaction(world, p);
};
// Down and back up (each half second, whatever the FTUE's state): the moment you're back up starts the wake-up gap; going
// down while the hurt line is still up drops it (the page hides it: client/ftue.js) - it's taught again the next time
// you're hurt and on your feet.
function downs(world, p) {
  const f = rec(p.profile), ped = p.ped;
  if (ped.dead) {
    if (p.ftueDown) return;
    p.ftueDown = true;
    if (f && f.m && f.m.hurt && p.ftueTipId === 'hurt' && (f.hn || 0) < FTUE.hurtMax && world.time - (p.ftueTipAt ?? -1e9) < FTUE.lineS + 1) { delete f.m.hurt; p.ftueTipId = null; store.touch(); }
  } else if (p.ftueDown) { p.ftueDown = false; p.ftueUpAt = world.time; }
}
function moments(world, p) {
  const f = rec(p.profile), ped = p.ped;
  if (!f || !f.tips || active(f) || !ped || !tipsNew(f)) return;
  const has = (k) => f.m && f.m[k];
  if (!has('down') && ped.dead) { moment(world, p, 'down'); return; }
  if (ped.dead) return;
  if (!has('wanted') && p.wanted > 0) { moment(world, p, 'wanted'); return; }
  if (!has('hurt') && ped.hp < ped.maxHp * FTUE.hurtAt) { moment(world, p, 'hurt'); return; }
  if (!has('transit') && (ped.onTrain || (ped.vehId && ped.seat > 0 && world.get(ped.vehId)?.bus) || (!ped.vehId && NEAR_TRANSIT(world, p)))) { moment(world, p, 'transit'); return; }   // (a bus's passenger: not its driver)
  if (!has('night') && world.clock.isNight && !ped.interior && !ped.hidden && !ped.ug) moment(world, p, 'night');
}

// ---- each half second --------------------------------------------------------------------------------------------------
export function update(world) {
  if (world.tick % 10 !== 7) return;
  for (const p of world.players.values()) {
    const f = rec(p.profile), ped = p.ped;
    if (!f || !p.conn || !ped) continue;
    f.pt = (f.pt || 0) + 0.5;   // (time played: the tips' new-character window - saved with the profile's next write)
    downs(world, p);
    firstcar.tick(world, p);   // (your first car driven: its marker small from now on)
    if (f.st === 'done') { moments(world, p); continue; }
    if (ped.dead) continue;
    if (f.st === 'new') { if (p.profile.lookPicked !== false) offer(world, p); continue; }
    if (f.st === 'pick') { if (p.ftuePickAt && world.time >= p.ftuePickAt) offer(world, p); else if (world.time >= (p.ftuePickUntil ?? 0)) pick(world, p, null); continue; }
    if (f.st === 'arrive') { if (p.ftueShowAt && world.time >= p.ftueShowAt) reveal(p); if (world.time >= (p.ftueUntil ?? 0)) ask(world, p); continue; }
    if (f.st === 'ask') { if (p.ftueAskAt && world.time >= p.ftueAskAt) ask(world, p); continue; }
    if (f.st === 'goal') stepGoal(world, p, f);
  }
}
function stepGoal(world, p, f) {
  const ped = p.ped, at = posOf(world, p), g = f.goal;
  if (!g) { finish(world, p, 'skip'); return; }
  if (p.job && !(f.step === 3 && jobDone(p, g))) { finish(world, p, 'skip'); return; }   // (took another job: it's theirs now)
  if (f.step === 1) {   // your first car: bought (one more of your cars than when it began), or you're driving one
    const c = f.car;
    if (!c || (ped.vehId && ped.seat === 0) || (c.k === 'buy' && p.profile.vehicles.length > (c.n || 0))) { setStep(world, p, 2); return; }
    if (c.k === 'steal' && !firstcar.markOf(world, p) && !p.ftueReMark) { p.ftueReMark = 1; firstcar.markCar(world, p, firstcar.placesFor(world, f.stn)?.alley); }   // (back after a logoff: its car again)
    return;
  }
  if (f.step === 2) { if (Math.hypot(at.x - g.x, at.y - g.y) < FTUE.goalR) setStep(world, p, 3); return; }
  // step 3: the thing itself
  if (jobDone(p, g)) { complete(world, p); return; }
  if (g.k === 'fish' && ped.fishing && ped.fishing.P) complete(world, p);   // (the line's out: cast)
}
// (honest work: a mail round or a courier contract, whichever the place offers - a depot standing in for a post office
// offers the mail round too)
const jobDone = (p, g) => !!p.job && (g.k === 'mail' || g.k === 'courier') && (p.job.type === 'mail' || p.job.type === 'courier');
// (dev and tests: the record as it stands)
export const recordOf = (p) => rec(p.profile);
export const isActive = (p) => active(rec(p.profile));
export const tipsOn = (p) => !!(rec(p.profile) && rec(p.profile).tips);
