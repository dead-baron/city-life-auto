// Little happenings round the players, for variety between the bigger events (snatch-and-grabs, contraband drops,
// shootouts, robberies, lost pets): every few minutes (HAPPEN_EVERY_S) something happens near someone out on foot in
// town - never the same kind twice running:
//   - a street fight: two passers-by come to blows; a crowd stops to watch and film it (npc.js spectacle). Break it
//     up (ACT near them) and they back off; otherwise it ends when one of them goes down. Whoever started it (or both,
//     FIGHT_MUTUAL of the time - the players near are told which) is a criminal while it lasts and BRAWL_AFTER_S after
//     (task #395): hitting them is no crime, killing them still is. Now and then (FIGHT_POLICE) somebody calls the
//     police, who come and break it up with tackles (police.js callFight).
//   - someone collapses (the owner's notes, batch 4: "you actually see them trip and fall or pass out ... and you can go
//     help them up"): a passer-by in sight of you sways, staggers and goes down face first on the pavement. Hold ACT
//     beside them (FAINT_HELP_HOLD_S) and they're back on their feet, thank you and press a little cash on you; left
//     lying FAINT_EMS_S, someone calls an ambulance and the paramedics take them away (ems.js dispatchFor) - or, if none
//     can get there, after a while they come round and limp off by themselves.
//   - a dropped wallet: someone walking along drops it and only notices a little way on - they stand there patting
//     their pockets. Pick it up (it's on the ground behind them) and hand it back for a thank-you, or keep it and sell
//     it at a pawn shop.
// Each shows on the radar and in the city feed (events.js); the players near get a line about it.
import { K, T } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import {
  HAPPEN_EVERY_S, FIGHT_BREAKUP_SAMARITAN, FAINT_HELP_REWARD, FAINT_HELP_SAMARITAN, FAINT_HELP_HOLD_S, FAINT_EMS_S, WALLET_TIP, WALLET_SAMARITAN,
  FIGHT_MUTUAL, BRAWL_AFTER_S, FIGHT_POLICE, CALM_STREETS,
} from '../../shared/rules.js';
import { IN } from '../../shared/input.js';
import { mulberry32 } from '../../shared/rng.js';
import { pedStep } from '../../shared/physics.js';
import { inAnyView } from '../view.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as events from './events.js';
import * as wildlife from './wildlife.js';
import * as law from './law.js';
import * as police from './police.js';
import * as players from './players.js';
import * as ems from './ems.js';

let rng = mulberry32(7321);
export function setRng(r) { rng = r; }

const KINDS = ['fight', 'faint', 'wallet'];
const FIGHT_S = 40;          // a street fight goes on at most this long
const FIGHT_DOWN_HP = 0.5;   // ...and ends when one of them is this hurt (they go down; nobody's killed: combat.js pulls
                             // the punches of two people in one, to a third)
const FAINT_S = 70;          // someone who collapsed (and no ambulance came) comes round by themselves after this long down
const SWAY_S = 1.6;          // ...swaying and staggering this long before they go down
const SEEN_PAD = -90;        // ...well inside someone's view (px inside its edge)
const WAIT_S = 40;           // ...nobody in sight just now: the next who walks into sight, within this long
const WALLET_S = 150;        // the owner looks for their wallet this long, then gives up
const NEAR = [260, 820];     // how far from the player it happens (in sight, or just round the corner)
const REACH = 60;            // stand this close to help

const walkable = (map, x, y) => { const t = map.tileAtPx(x, y); return t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS; };

// a civilian on foot near (x, y), out on the street (not working a desk, guarding, in a fight, filming...)
function passerBy(world, x, y, r0, r1, not = null) {
  const out = [];
  for (const e of world.query(x, y, r1, K.PED)) {
    const n = e.npc;
    if (!n || e.dead || e.vehId || e.hidden || e === not || n.role !== 'civ' || n.keep || n.desk || n.guard) continue;
    if (n.state !== 'wander' && n.state !== 'idle') continue;
    if (n.archetype === 'senior' || n.archetype === 'drunk' || n.happening) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d >= r0 && walkable(world.map, e.x, e.y)) out.push(e);
  }
  return out.length ? out[Math.floor(rng() * out.length)] : null;
}
// ...or one comes walking up: somebody just out of sight, on the pavement
function newcomer(world, x, y) {
  for (let k = 0; k < 30; k++) {
    const a = rng() * Math.PI * 2, d = NEAR[0] + rng() * (NEAR[1] - NEAR[0]);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (!walkable(world.map, px, py) || PED_BLOCK[world.map.tileAtPx(px, py)]) continue;
    return npc.spawnNpc(world, rng() < 0.5 ? 'casual' : 'executive', px, py, 'civ');
  }
  return null;
}
const someone = (world, x, y, not = null) => passerBy(world, x, y, NEAR[0], NEAR[1], not) || newcomer(world, x, y);

function start(world, kind, p, opts = {}) {
  const at = p.ped;
  if (kind === 'fight') {
    const a = someone(world, at.x, at.y);
    if (!a) return false;
    // the other one: someone near them, or someone who comes up to them
    let b = passerBy(world, a.x, a.y, 0, 160, a);
    if (!b) { const ang = rng() * Math.PI * 2; b = npc.spawnNpc(world, 'casual', a.x + Math.cos(ang) * 40, a.y + Math.sin(ang) * 40, 'civ'); }
    if (!b) return false;
    // who started it: a - or both of them, as bad as each other (task #395)
    const by = (opts.both ?? rng() < FIGHT_MUTUAL) ? [a, b] : [a];
    const ev = events.add(world, { kind: 'fight', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, until: world.time + FIGHT_S + 10, a: a.id, b: b.id, by: by.map((q) => q.id), text: 'Street fight' });
    for (const [q, o] of [[a, b], [b, a]]) {
      q.npc.happening = ev.id; q.npc.keep = true;
      q.weapon = 'fists';
      npc.startFight(world, q, o, FIGHT_S);
    }
    for (const q of by) npc.markBrawl(world, q, ev.until + BRAWL_AFTER_S);   // (fair game while it lasts: finish cuts it to a little after)
    npc.spectacle(world, ev.x, ev.y, { r: 420, near: 90, chance: 0.6, secs: 12 });   // (a crowd stops to watch, and film)
    events.tellNear(world, ev.x, ev.y, by.length > 1 ? 'A fight\'s broken out on the street - both of them asked for it. Break it up?'
      : `A fight's broken out on the street - the one in the ${law.colourName(a.app && a.app.tc)} top started it. Break it up?`, 'info');
    if (opts.cops ?? rng() < FIGHT_POLICE) police.callFight(world, ev.by, 5 + rng() * 6);   // (somebody calls the police)
    return true;
  }
  if (kind === 'faint') {   // (you see it happen: someone walking past in sight of you - now, or the next who does: faintWait)
    const a = inSight(world, at);
    if (a) faint(world, a); else world.faintWait = { pid: p.pid, until: world.time + WAIT_S };
    return true;
  }
  if (kind === 'wallet') {
    const a = someone(world, at.x, at.y);
    if (!a) return false;
    const n = a.npc;
    // dropped where they stood, noticed a few strides on: they stop and pat their pockets
    const bag = world.spawnBag(a.x - Math.cos(a.a) * 14, a.y - Math.sin(a.a) * 14 + 4, { cash: 0, items: { wallet: 1 }, weapons: {}, itemValue: 60 }, '');
    const ev = events.add(world, { kind: 'wallet', x: a.x, y: a.y, until: world.time + WALLET_S, who: a.id, bag: bag.id, text: 'Somebody lost their wallet' });
    n.happening = ev.id; n.keep = true; n.lostWallet = ev.id;
    n.state = 'waitHelp'; n.until = world.time + WALLET_S;
    events.tellNear(world, a.x, a.y, 'Someone dropped their wallet - it\'s on the ground behind them.', 'info');
    return true;
  }
  return false;
}

function finish(world, ev, how) {
  ev.until = 0;   // (events.js drops it on its next pass)
  for (const id of [ev.a, ev.b, ev.who]) {
    const q = id && world.get(id);
    if (!q || !q.npc) continue;
    q.npc.happening = 0; q.npc.keep = false; q.npc.lostWallet = 0;
    q.npc.driven = false; q.emsPatient = false;
    if (ev.by && ev.by.includes(q.id)) q.npc.brawl = Math.min(q.npc.brawl || 0, world.time + BRAWL_AFTER_S);   // (whoever started it: a criminal a little while yet)
  }
  void how;
}

// ACT near one: break the fight up, help them up, give the wallet back
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || !world.happenings) return null;
  for (const ev of world.happenings) {
    if (ev.kind === 'fight' && ev.until > world.time) {
      const a = world.get(ev.a), b = world.get(ev.b);
      if (!a || !b || a.dead || b.dead) continue;
      if (Math.min(Math.hypot(a.x - ped.x, a.y - ped.y), Math.hypot(b.x - ped.x, b.y - ped.y)) < REACH + 30) return { label: `Break up the fight (+${FIGHT_BREAKUP_SAMARITAN} Samaritan)`, run: () => breakUp(world, p, ev) };
    } else if (ev.kind === 'faint' && ev.until > world.time && ev.phase === 'down') {
      const a = world.get(ev.who);
      if (!a || a.dead || !a.passedOut || Math.hypot(a.x - ped.x, a.y - ped.y) > REACH) continue;
      const h = world.helpHold && world.helpHold.get(p.pid);
      if (h && h.ev === ev.id) { const left = Math.max(0, h.until - world.time); return { label: `Helping them up... ${left.toFixed(1)}s (keep holding)`, run: () => {}, prog: 1 - left / FAINT_HELP_HOLD_S }; }
      return { label: `Hold to help them up (+$${FAINT_HELP_REWARD}, +${FAINT_HELP_SAMARITAN} Samaritan)`, run: () => startHelp(world, p, ev) };
    } else if (ev.kind === 'wallet' && ev.until > world.time && (p.profile.inventory.wallet || 0) > 0) {
      const a = world.get(ev.who);
      if (a && !a.dead && Math.hypot(a.x - ped.x, a.y - ped.y) < REACH) return { label: `Give the wallet back (+${WALLET_SAMARITAN} Samaritan)`, run: () => giveWallet(world, p, ev, a) };
    }
  }
  return null;
}

function breakUp(world, p, ev) {
  const a = world.get(ev.a), b = world.get(ev.b);
  for (const [q, o] of [[a, b], [b, a]]) if (q && q.npc && !q.dead) { q.npc.state = 'flee'; q.npc.target = 0; q.npc.fx = o ? o.x : p.ped.x; q.npc.fy = o ? o.y : p.ped.y; q.npc.until = world.time + 3; }
  p.profile.samaritan += FIGHT_BREAKUP_SAMARITAN;
  world.notify(p, `You stepped in and broke it up. +${FIGHT_BREAKUP_SAMARITAN} Samaritan.`, 'good');
  events.feed(world, { kind: 'news', text: `${p.name} broke up a street fight`, x: ev.x, y: ev.y });
  p.meDirty = true; store.touch();
  finish(world, ev, 'broken');
}

// Holding ACT beside someone who collapsed: up they come once it's held FAINT_HELP_HOLD_S (let go, walk off: it stops)
function startHelp(world, p, ev) {
  (world.helpHold ||= new Map()).set(p.pid, { ev: ev.id, until: world.time + FAINT_HELP_HOLD_S });
  p.meDirty = true;
}
function holdStep(world) {
  for (const [pid, h] of [...world.helpHold]) {
    const p = world.players.get(pid), ped = p && p.ped;
    const ev = (world.happenings || []).find((e) => e.id === h.ev && e.until > world.time), a = ev && world.get(ev.who);
    if (!ped || ped.dead || ped.vehId || !((p.prevBits || 0) & IN.ACTION) || !a || a.dead || !a.passedOut || Math.hypot(a.x - ped.x, a.y - ped.y) > REACH + 10) {
      world.helpHold.delete(pid);
      if (p) p.meDirty = true;
      continue;
    }
    if (world.time < h.until) continue;
    world.helpHold.delete(pid);
    helpUp(world, p, ev, a);
  }
}

const onPavement = (m, x, y) => { const t = m.tileAtPx(x, y); return t === T.SIDEWALK || t === T.PLAZA; };
// someone walking along the pavement well inside the view of the player at (x, y)
function inSight(world, at) {
  for (let k = 0; k < 6; k++) { const q = passerBy(world, at.x, at.y, 90, 460); if (q && onPavement(world.map, q.x, q.y) && inAnyView(world, q.x, q.y, SEEN_PAD)) return q; }
  return null;
}
// they start to sway (this system moves them now - npc.driven - till they're down)
function faint(world, a) {
  const ev = events.add(world, { kind: 'faint', x: a.x, y: a.y, until: world.time + FAINT_S + 150, who: a.id, phase: 'sway', sw: world.time, h0: a.a, text: 'Someone collapsed in the street' });
  const n = a.npc;
  n.happening = ev.id; n.keep = true; n.driven = true;
  world.emit(a.x, a.y, { e: 'collapse', id: a.id, k: 's', d: 0.7, a: +(a.a + Math.PI).toFixed(2), x: a.x, y: a.y });   // (back on their heels)
  return ev;
}
// The collapse as it happens (every tick): swaying, weaving and slowing, a stagger the other way, and down on their face
function faintStep(world, ev, dt) {
  const a = world.get(ev.who), now = world.time;
  if (!a || a.dead || a.removed || !a.npc) { finish(world, ev, 'gone'); return; }
  if (a.npc.state !== 'wander' && a.npc.state !== 'idle') { finish(world, ev, 'scared'); return; }   // (something made them run)
  const m = world.map, t = now - ev.sw, h = ev.h0 + Math.sin(t * 6) * 0.7;
  const inp = npc.seek(a, a.x + Math.cos(h) * 30, a.y + Math.sin(h) * 30, false, Math.max(0.1, 0.45 - t * 0.25));
  if (t > 0.8 && !ev.sw2) { ev.sw2 = 1; world.emit(a.x, a.y, { e: 'collapse', id: a.id, k: 's', d: 0.7, a: +a.a.toFixed(2), x: a.x, y: a.y }); }   // (and forward)
  if (t >= SWAY_S) { fall(world, ev, a); return; }
  if (onPavement(m, a.x + inp.mx * 8, a.y + inp.my * 8)) {
    const mods = players.pedMods(world, a);
    mods.speedMul *= (a.npc.speed || 1) * 0.55;
    pedStep(a, inp, dt, m, mods);
    if (inp.mx || inp.my) a.a = Math.atan2(inp.my, inp.mx);
    world.place(a);
  } else { a.vx = 0; a.vy = 0; }
  ev.x = a.x; ev.y = a.y;
}
function fall(world, ev, a) {
  const now = world.time, n = a.npc;
  n.driven = false; n.state = 'passed'; a.passedOut = true; a.vx = 0; a.vy = 0;
  ev.phase = 'down'; ev.downAt = now; ev.x = a.x; ev.y = a.y;
  world.emit(a.x, a.y, { e: 'collapse', id: a.id, k: 'F', d: FAINT_S + 150, x: a.x, y: a.y });   // (face down, still)
  npc.spectacle(world, a.x, a.y, { r: 300, near: 60, chance: 0.35, secs: 8 });
  events.tellNear(world, a.x, a.y, 'Someone just collapsed on the pavement - hold ACT beside them to help them up.', 'info');
}

function helpUp(world, p, ev, a) {
  a.passedOut = false; a.emsPatient = false; a.npc.state = 'wander';
  a.a = Math.atan2(p.ped.y - a.y, p.ped.x - a.x);
  p.profile.cash += FAINT_HELP_REWARD; p.profile.samaritan += FAINT_HELP_SAMARITAN;
  world.emit(a.x, a.y, { e: 'thanks', x: a.x, y: a.y });
  world.notify(p, `"Oh... thank you. I don't know what happened." +$${FAINT_HELP_REWARD}, +${FAINT_HELP_SAMARITAN} Samaritan.`, 'good');
  events.feed(world, { kind: 'news', text: `${p.name} helped someone who collapsed in the street`, x: a.x, y: a.y });
  p.meDirty = true; store.touch();
  finish(world, ev, 'helped');
}

function giveWallet(world, p, ev, a) {
  const prof = p.profile;
  prof.inventory.wallet--;
  if (prof.inventory.wallet <= 0) delete prof.inventory.wallet;
  const tip = WALLET_TIP[0] + Math.floor(rng() * (WALLET_TIP[1] - WALLET_TIP[0] + 1));
  prof.cash += tip; prof.samaritan += WALLET_SAMARITAN;
  a.npc.state = 'wander';
  world.emit(a.x, a.y, { e: 'thanks', x: a.x, y: a.y });
  world.notify(p, `"My wallet! Thank you!" +$${tip} tip, +${WALLET_SAMARITAN} Samaritan.`, 'good');
  p.meDirty = true; store.touch();
  finish(world, ev, 'returned');
}

// where the owner of a wallet you're carrying is (events.forPlayer: the guide arrow)
export function walletTarget(world, p) {
  if (!p.ped || !((p.profile.inventory.wallet || 0) > 0)) return null;
  for (const ev of world.happenings || []) {
    if (ev.kind !== 'wallet' || ev.until <= world.time) continue;
    const a = world.get(ev.who);
    if (a && !a.dead) return { id: 'w' + ev.id, k: 'walletret', x: Math.round(a.x), y: Math.round(a.y) };
  }
  return null;
}

export function update(world, dt) {
  if (world.helpHold && world.helpHold.size) holdStep(world);
  for (const ev of world.happenings || []) if (ev.kind === 'faint' && ev.phase === 'sway' && ev.until > world.time) faintStep(world, ev, dt);
  const fw = world.faintWait;
  if (fw && world.tick % 5 === 1) {   // (waiting for someone to walk into sight of them)
    const q = world.players.get(fw.pid), a = q && q.ped && !q.ped.dead && world.time < fw.until ? inSight(world, q.ped) : null;
    if (a) faint(world, a);
    if (a || !q || !q.ped || world.time >= fw.until) world.faintWait = null;
  }
  if (world.tick % 10 !== 4) return;
  const now = world.time;
  // what's going on
  for (const ev of world.happenings || []) {
    if (ev.until <= now) continue;
    if (ev.kind === 'fight') {
      const a = world.get(ev.a), b = world.get(ev.b);
      if (!a || !b || a.dead || b.dead || a.removed || b.removed) { finish(world, ev, 'gone'); continue; }
      ev.x = (a.x + b.x) / 2; ev.y = (a.y + b.y) / 2;
      // one of them goes down: it's over (the other walks off)
      const lo = a.hp / a.maxHp < b.hp / b.maxHp ? a : b, hi = lo === a ? b : a;
      if (lo.hp < lo.maxHp * FIGHT_DOWN_HP || now > ev.t + FIGHT_S) {
        if (lo.hp < lo.maxHp * FIGHT_DOWN_HP) lo.downUntil = now + 3;
        for (const q of [lo, hi]) if (q.npc) { q.npc.state = q === lo ? 'flee' : 'wander'; q.npc.target = 0; q.npc.fx = (q === lo ? hi : lo).x; q.npc.fy = (q === lo ? hi : lo).y; q.npc.until = now + 4; }
        events.feed(world, { kind: 'news', text: 'A street fight ended with one of them on the ground', x: ev.x, y: ev.y });
        finish(world, ev, 'down');
        continue;
      }
      // one of them broke off (someone else scared them off, or picked a fight with them): it's over
      if (a.npc.state !== 'fight' || b.npc.state !== 'fight') { finish(world, ev, 'stopped'); continue; }
    } else if (ev.kind === 'faint' && ev.phase === 'down') {
      const a = world.get(ev.who);
      if (!a || a.dead || a.removed || !a.passedOut) {
        if (ev.amb && (!a || a.removed)) events.feed(world, { kind: 'news', text: 'Paramedics took away someone who collapsed in the street', x: ev.x, y: ev.y });
        finish(world, ev, 'gone'); continue;
      }
      // left lying: somebody calls an ambulance (the paramedics take them away: ems.js) - none can come, or it's gone
      // without them: they come round by themselves after a while and limp off
      if (!ev.emsTried && now - ev.downAt > FAINT_EMS_S) {
        ev.emsTried = true;
        const v = ems.dispatchFor(world, a);
        if (v) { ev.amb = v.id; events.tellNear(world, a.x, a.y, 'Somebody\'s called an ambulance for the person lying on the pavement.', 'info'); }
      }
      const amb = ev.amb && world.get(ev.amb);
      if ((!amb || amb.removed) && now > ev.downAt + (ev.amb ? FAINT_EMS_S : FAINT_S)) {
        a.passedOut = false; a.emsPatient = false; a.npc.state = 'limp'; a.npc.until = now + 20; a.npc.fx = a.x; a.npc.fy = a.y - 10;
        finish(world, ev, 'came round');
      }
    } else if (ev.kind === 'wallet') {
      const a = world.get(ev.who);
      if (!a || a.dead || a.removed) { finish(world, ev, 'gone'); continue; }
      if (a.npc && a.npc.state !== 'waitHelp') { finish(world, ev, 'gave up'); continue; }
    }
  }
  // something new, now and then, near someone out on foot in town
  world.nextHappenAt ??= now + HAPPEN_EVERY_S * 0.5;
  if (now < world.nextHappenAt || !world.players.size) return;
  world.nextHappenAt = now + HAPPEN_EVERY_S * (0.6 + rng() * 0.8);
  const live = (world.happenings || []).filter((e) => KINDS.includes(e.kind) && e.until > now).length;
  if (live >= 2 || world.npcBudget <= 0) return;
  const ps = [...world.players.values()].filter((q) => q.ped && !q.ped.dead && !q.ped.hidden && !q.ped.vehId && !q.ped.sub && !q.ped.interior && !wildlife.wildStyle(world.map, q.ped.x, q.ped.y));
  if (!ps.length) return;
  const p = ps[Math.floor(rng() * ps.length)];
  if (events.calmBusy(world, p.ped.x, p.ped.y)) return;   // (enough going on round them already: rules.js CALM_STREETS)
  // a street fight: in the rough parts of town; elsewhere only now and then (CALM_STREETS.fightShare)
  const fights = events.roughAt(world.map, p.ped.x, p.ped.y) || rng() < CALM_STREETS.fightShare;
  const kinds = KINDS.filter((k) => k !== world.lastHappening && (k !== 'fight' || fights));
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for (const k of kinds) if (start(world, k, p)) { world.lastHappening = k; break; }
}

// (dev and tests: start one now, near this player; a fight's opts: both - both started it, cops - the police are called
// (true) or not (false))
export function startNow(world, kind, p, opts = {}) { const ok = start(world, kind, p, opts); if (ok) world.lastHappening = kind; return ok; }
events.setWalletTarget((world, p) => walletTarget(world, p));
