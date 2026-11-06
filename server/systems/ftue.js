// The first-time experience (the owner, 11-04: "the tutorial should be short and sweet and give people general
// direction"; the design: the FTUE is the tutorial - no tour). A new character (store.js defaultProfile: ftue { st: 'new' })
// gets, once their look is picked:
//   1. the arrival: off a train at the arrival station - the one the starter car waits at (starter.js arrivalFor, the
//      same function) - a short staged scene on the page (client/ftue.js: the camera rides in along the line, the doors,
//      onto the platform), FTUE.arriveS long, skippable (the page's Esc / B / a tap: { t: 'intro', a: 'skip' });
//   2. one question on the platform, "What brings you to town?", on the conversation screen's kit (a menu at ASK_POI,
//      the answers numbered): Honest work, A little hustle, The great outdoors, Just let me roam. Not a class - it only
//      picks the first goal;
//   3. the first goal, at most three steps, each teaching one control where it's needed (the page shows that control's
//      glyph for the device in hand - shared/controls.js): walk to your car (move), get in and drive there (vehicle),
//      do the thing (action). It rides the HUD's job card and the job's way-finding (players.js buildMe: me.job), the
//      step's line in me.ftue. Done: a small reward (FTUE.reward, xp for driving) and the big moment.
// Then the first-time moments (once each, ever, while tips are on): the first wanted star, the first time knocked down,
// the first shop, the first stop for transit, the first night, the first time hurt - one fading line each with "More in
// your Guide" (the page's Guide app: shared/guide.js). The Guide replays it all: "Replay the arrival" runs the arrival,
// the question and a first goal again from where you stand; "Show tips again" clears the moments.
// Everyone goes through it once (the owner, 11-04): profiles from before it are reset to new characters as the store loads
// (server/store.js PROGRESS_EPOCH). A wiped profile (players.js wipeProgress, wipeAccount: Start fresh) is a new character
// too - store.js defaultProfile's ftue { st: 'new' } and starter { first } - so it gets the arrival on its next join.
// Every number: shared/rules.js FTUE. Analytics (server/launch.js world.track 'ftue'): ftue_arrive, ftue_answer_<which>,
// ftue_step1..3 (reached), ftue_done, ftue_skip, moment_<id>, guide_open.
//   profile.ftue: { st: 'new' | 'arrive' | 'ask' | 'goal' | 'done', stn (the arrival station's poi), ans, step,
//                   goal { k, x, y, name, poi? }, how ('goal' | 'roam' | 'skip' | 'old'), at { stage: ms }, m { moment: 1 },
//                   tips (0: off), replay (1: the Guide's replay - no move to the station) }
import { FTUE } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { store } from '../store.js';
import { moved } from '../movemark.js';
import * as starter from './starter.js';
import * as homes from './homes.js';
import * as fishing from './fishing.js';
import * as mailjob from './mailjob.js';
import * as skills from './skills.js';
import * as transit from './transit.js';

export const ASK_POI = -31;   // (the question's menu: not a place's - economy.js handleMenu asks onMenu first)
export const ANSWERS = [
  { id: 'work', label: 'Honest work', note: 'a first job nearby' },
  { id: 'hustle', label: 'A little hustle', note: 'meet a contact' },
  { id: 'outdoors', label: 'The great outdoors', note: 'a rod and a fishing spot' },
  { id: 'roam', label: 'Just let me roam', note: 'no goal' },
];
// the controls the steps teach (shared/controls.js actions)
export const STEP_CTL = [null, 'move', 'vehicle', 'action'];
// The first-time moments: what each says (one line), the control it names, the Guide's section it opens on
export const MOMENTS = {
  wanted: { text: 'You\'re wanted. Get out of sight and lie low until the stars fade.', sec: 'law' },
  down: { text: 'Knocked down. Pick where to wake up - or call for help and wait for a revive.', sec: 'law' },
  shop: { text: 'Shopping: pick a line to buy it. Cash goes first, then your bank.', sec: 'items' },
  transit: { text: 'Buses, trains and ferries are free - wait at the stop and board.', ctl: 'action', sec: 'around' },
  night: { text: 'Night falls. A flashlight lights your way.', ctl: 'light', sec: 'items' },
  hurt: { text: 'Hurt? Hold for your quick wheel - a bandage patches you up.', ctl: 'use', sec: 'items' },
};

const rec = (prof) => prof.ftue;
const active = (f) => !!f && (f.st === 'arrive' || f.st === 'ask' || f.st === 'goal');
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
  const rails = world.map.rails || (world.map.rail ? [world.map.rail] : []);
  let best = null, bd = 900;
  for (const r of rails) for (const st of r.stations || []) {
    if (st.under || st.el || st.deck || !st.platform) continue;
    const d = Math.hypot(st.platform.x - poi.x, st.platform.y - poi.y);
    if (d < bd) { bd = d; best = { st, r }; }
  }
  const at = best ? homes.spawnSpot(world, best.st.platform.x, best.st.platform.y, () => 0.5) : homes.spawnSpot(world, poi.x, poi.y, () => 0.5);
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
const THERE = { mail: (g) => `Take a mail round at ${g.name}`, courier: (g) => `Ask ${g.name} for courier work`, fence: (g) => `Talk to the fence at ${g.name}`, gang: (g) => `Talk to the Syndicate at ${g.name}`, fish: () => 'Cast a line: face the water, hold and let go' };
const PLACE = { mail: (g) => g.name, courier: (g) => g.name, fence: (g) => g.name, gang: (g) => g.name, fish: (g) => g.name };
// the step's line (the page puts its control's glyph in front of it) and the job card's objective
export function stepLine(world, p, f) {
  const g = f.goal;
  if (!g) return '';
  if (f.step === 1) return 'Your car\'s in the lot - walk over to it';
  if (f.step === 2) return starter.carOf(world, p.pid) ? `Get in and drive to ${PLACE[g.k](g)}` : `Head for ${PLACE[g.k](g)}`;
  return THERE[g.k](g);
}
const cardText = (world, p, f) => (f.step === 1 ? 'Walk to your car in the lot' : f.step === 2 ? `${p.ped && p.ped.vehId ? 'Drive' : 'Get'} to ${PLACE[f.goal.k](f.goal)}` : THERE[f.goal.k](f.goal));
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
  return { st: 'goal', step: f.step, ctl: STEP_CTL[f.step], line: stepLine(world, p, f), ans: f.ans };
}
// me.job (players.js buildMe): the goal's way - the car first, then the place - with the job card's step N of 3
export function target(world, p) {
  const f = rec(p.profile);
  if (!f || f.st !== 'goal' || !f.goal || p.job) return null;
  const t = { text: cardText(world, p, f), k: 'First goal', step: [f.step, 3], stage: `ftue${f.step}`, x: f.goal.x, y: f.goal.y };
  const v = f.step === 1 ? starter.carOf(world, p.pid) : null;
  if (v) { t.x = Math.round(v.x); t.y = Math.round(v.y); t.veh = [t.x, t.y, v.def.i]; }
  return t;
}

// ---- joining -----------------------------------------------------------------------------------------------------------
// players.join (a new session), before starter.onJoin: one that left mid-way picks up where it was - the arrival or the question asked again, the goal's step as it was
export function onJoin(world, p) {
  const prof = p.profile;
  if (!prof.ftue) { prof.ftue = fresh(); store.touch(); }   // (no record: a new character's - every profile from before the FTUE was reset to one: store.js PROGRESS_EPOCH)
  const f = prof.ftue;
  f.m ||= {};
  if (f.st === 'arrive') { f.st = 'ask'; p.ftueAskAt = world.time + 1.5; }   // (left during the arrival: straight to the question)
  else if (f.st === 'ask') p.ftueAskAt = world.time + 1.5;
  p.meDirty = true;
}

// ---- the arrival -------------------------------------------------------------------------------------------------------
function arrive(world, p, replay = false) {
  const f = rec(p.profile), ped = p.ped;
  let name, place, to, from;
  if (!replay) {
    const g = starter.arrivalFor(world, p), poi = g ? world.map.pois[g.poi] : null;
    if (!poi) { f.st = 'ask'; p.ftueAskAt = world.time; return; }   // (no station anywhere: the question where you are)
    const pl = platformOf(world, poi);
    ped.x = pl.x; ped.y = pl.y; ped.lz = 0; ped.vx = 0; ped.vy = 0; ped.a = Math.PI / 2;
    world.place(ped); moved(ped);
    p.profile.pos = { x: Math.round(pl.x), y: Math.round(pl.y) };
    name = poi.label; place = districtName(world, pl.x, pl.y); to = pl; from = pl.from;
  } else {
    name = districtName(world, ped.x, ped.y) || 'the city'; place = ''; to = { x: ped.x, y: ped.y }; from = { x: ped.x - 700, y: ped.y - 500 };
  }
  homes.protect(world, ped, FTUE.arriveS + 3);
  f.st = 'arrive'; f.replay = replay ? 1 : 0; stamp(f, 'arrive');
  p.ftueUntil = world.time + FTUE.arriveS + 4;   // (the page says when its scene is over: this only if it never does)
  send(p, { t: 'ftue', a: 'arrive', name, place, from: [Math.round(from.x), Math.round(from.y)], to: [Math.round(to.x), Math.round(to.y)], s: FTUE.arriveS, replay: replay ? 1 : 0 });
  if (!replay) track(world, p, 'ftue_arrive');
  store.touch(); p.meDirty = true;
}
function ask(world, p) {
  const f = rec(p.profile);
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
  if (ans === 'roam') { world.notify(p, ROAM_LINE, 'info'); finish(world, p, 'roam'); return true; }
  const st = p.ped, g = goalFor(world, ans, st.x, st.y);
  if (!g) { world.notify(p, ROAM_LINE, 'info'); finish(world, p, 'roam'); return true; }
  f.goal = g; f.st = 'goal';
  if (ans === 'outdoors') gear(world, p);
  // the car's step only when it's there to walk to (out, nobody in it) and you're not at it already
  const v = starter.carOf(world, p.pid);
  setStep(world, p, v && !v.seats.some((s) => s) && !st.vehId && Math.hypot(v.x - st.x, v.y - st.y) > FTUE.carR ? 1 : 2);
  return true;
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
  f.st = 'done'; f.how = how; f.replay = 0; stamp(f, 'done');
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
//   skip      the arrival (on to the question), the question (no goal), or the goal - whichever is on
//   arrived   the arrival's scene played to its end (on to the question)
//   replay    the Guide's "Replay the arrival": from where you stand, the question and a first goal again
//   tips      the Guide's "Show tips again": the first-time moments from the start
//   guide     the Guide app opened (analytics)
export function handle(world, p, msg) {
  const f = rec(p.profile), a = String(msg.a || '');
  if (!f) return;
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
  if (a === 'tips') { f.m = {}; f.tips = 1; p.ftueTipAt = world.time - FTUE.tipGapS + 3; store.touch(); world.notify(p, 'Tips are back on: a line the first time you meet each thing.', 'info'); return; }
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
// a place's menu opened (economy.js openMenu): the hustle's contact talked to; the first shop
export function menuOpened(world, p, poi, menu) {
  const f = rec(p.profile);
  if (f && f.st === 'goal' && f.step === 3 && f.goal && f.goal.poi === poi.id && (f.goal.k === 'fence' || f.goal.k === 'gang' || f.goal.k === 'courier')) {
    if (f.goal.k !== 'courier') complete(world, p);   // (the courier's is its contract taken: update)
    return;
  }
  if (menu && menu.opts && menu.opts.some((o) => o.price > 0)) moment(world, p, 'shop');
}

// ---- the first-time moments --------------------------------------------------------------------------------------------
// Once each, ever (profile.ftue.m), while tips are on, never during the FTUE itself, FTUE.tipGapS apart at least. Returns
// whether it fired.
export function moment(world, p, id) {
  const f = rec(p.profile), M = MOMENTS[id];
  if (!f || !M || active(f) || !f.tips || (f.m && f.m[id]) || !p.conn) return false;
  if (world.time - (p.ftueTipAt ?? -1e9) < FTUE.tipGapS) return false;
  (f.m ||= {})[id] = 1;
  p.ftueTipAt = world.time;
  send(p, { t: 'ftue', a: 'tip', id, text: M.text, ctl: M.ctl || null, sec: M.sec });
  track(world, p, `moment_${id}`);
  store.touch();
  return true;
}
const NEAR_TRANSIT = (world, ped) => {
  if (transit.stopNote(world, { ped })) return true;
  const R = FTUE.transitR;
  for (const q of world.map.pois) if ((q.kind === 'station' || q.kind === 'marina') && Math.abs(q.x - ped.x) < R && Math.abs(q.y - ped.y) < R) return true;
  return false;
};
function moments(world, p) {
  const f = rec(p.profile), ped = p.ped;
  if (!f || !f.tips || active(f) || !ped) return;
  const has = (k) => f.m && f.m[k];
  if (!has('down') && ped.dead) { moment(world, p, 'down'); return; }
  if (ped.dead) return;
  if (!has('wanted') && p.wanted > 0) { moment(world, p, 'wanted'); return; }
  if (!has('hurt') && ped.hp < ped.maxHp * FTUE.hurtAt) { moment(world, p, 'hurt'); return; }
  if (!has('transit') && (ped.onTrain || (ped.vehId && world.get(ped.vehId)?.bus) || (!ped.vehId && NEAR_TRANSIT(world, ped)))) { moment(world, p, 'transit'); return; }
  if (!has('night') && world.clock.isNight && !ped.interior && !ped.hidden && !ped.ug) moment(world, p, 'night');
}

// ---- each half second --------------------------------------------------------------------------------------------------
export function update(world) {
  if (world.tick % 10 !== 7) return;
  for (const p of world.players.values()) {
    const f = rec(p.profile), ped = p.ped;
    if (!f || !p.conn || !ped) continue;
    if (f.st === 'done') { moments(world, p); continue; }
    if (ped.dead) continue;
    if (f.st === 'new') { if (p.profile.lookPicked !== false) arrive(world, p); continue; }
    if (f.st === 'arrive') { if (world.time >= (p.ftueUntil ?? 0)) ask(world, p); continue; }
    if (f.st === 'ask') { if (p.ftueAskAt && world.time >= p.ftueAskAt) ask(world, p); continue; }
    if (f.st === 'goal') stepGoal(world, p, f);
  }
}
function stepGoal(world, p, f) {
  const ped = p.ped, at = posOf(world, p), g = f.goal;
  if (!g) { finish(world, p, 'skip'); return; }
  if (p.job && !(f.step === 3 && jobDone(p, g))) { finish(world, p, 'skip'); return; }   // (took another job: it's theirs now)
  if (f.step === 1) {
    const v = starter.carOf(world, p.pid);
    if (!v || ped.vehId || Math.hypot(v.x - ped.x, v.y - ped.y) < FTUE.carR) setStep(world, p, 2);
    return;
  }
  if (f.step === 2) { if (Math.hypot(at.x - g.x, at.y - g.y) < FTUE.goalR) setStep(world, p, 3); return; }
  // step 3: the thing itself
  if (jobDone(p, g)) { complete(world, p); return; }
  if (g.k === 'fish' && ped.fishing && ped.fishing.P) complete(world, p);   // (the line's out: cast)
}
const jobDone = (p, g) => !!p.job && ((g.k === 'mail' && p.job.type === 'mail') || (g.k === 'courier' && p.job.type === 'courier'));
// (dev and tests: the record as it stands)
export const recordOf = (p) => rec(p.profile);
export const isActive = (p) => active(rec(p.profile));
