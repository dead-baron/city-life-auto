// Little happenings round the players, for variety between the bigger events (snatch-and-grabs, contraband drops,
// shootouts, robberies, lost pets): every few minutes (HAPPEN_EVERY_S) something happens near someone out on foot in
// town - never the same kind twice running:
//   - a street fight: two passers-by come to blows; a crowd stops to watch and film it (npc.js spectacle). Break it
//     up (ACT near them) and they back off; otherwise it ends when one of them goes down.
//   - someone collapses on the pavement: help them up (ACT beside them) - or after a minute they come round and limp
//     off by themselves.
//   - a dropped wallet: someone walking along drops it and only notices a little way on - they stand there patting
//     their pockets. Pick it up (it's on the ground behind them) and hand it back for a thank-you, or keep it and sell
//     it at a pawn shop.
// Each shows on the radar and in the city feed (events.js); the players near get a line about it.
import { K, T } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import {
  HAPPEN_EVERY_S, FIGHT_BREAKUP_SAMARITAN, FAINT_HELP_REWARD, FAINT_HELP_SAMARITAN, WALLET_TIP, WALLET_SAMARITAN,
} from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as events from './events.js';
import * as wildlife from './wildlife.js';

let rng = mulberry32(7321);
export function setRng(r) { rng = r; }

const KINDS = ['fight', 'faint', 'wallet'];
const FIGHT_S = 40;          // a street fight goes on at most this long
const FIGHT_DOWN_HP = 0.5;   // ...and ends when one of them is this hurt (they go down; nobody's killed: combat.js pulls
                             // the punches of two people in one, to a third)
const FAINT_S = 70;          // someone who collapsed comes round by themselves after this long
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

function start(world, kind, p) {
  const at = p.ped;
  if (kind === 'fight') {
    const a = someone(world, at.x, at.y);
    if (!a) return false;
    // the other one: someone near them, or someone who comes up to them
    let b = passerBy(world, a.x, a.y, 0, 160, a);
    if (!b) { const ang = rng() * Math.PI * 2; b = npc.spawnNpc(world, 'casual', a.x + Math.cos(ang) * 40, a.y + Math.sin(ang) * 40, 'civ'); }
    if (!b) return false;
    const ev = events.add(world, { kind: 'fight', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, until: world.time + FIGHT_S + 10, a: a.id, b: b.id, text: 'Street fight' });
    for (const [q, o] of [[a, b], [b, a]]) {
      q.npc.happening = ev.id; q.npc.keep = true;
      q.weapon = 'fists';
      npc.startFight(world, q, o, FIGHT_S);
    }
    npc.spectacle(world, ev.x, ev.y, { r: 420, near: 90, chance: 0.6, secs: 12 });   // (a crowd stops to watch, and film)
    events.tellNear(world, ev.x, ev.y, 'A fight\'s broken out on the street - break it up?', 'info');
    return true;
  }
  if (kind === 'faint') {
    const a = someone(world, at.x, at.y);
    if (!a) return false;
    const n = a.npc;
    n.state = 'passed'; a.passedOut = true; a.vx = 0; a.vy = 0;
    const ev = events.add(world, { kind: 'faint', x: a.x, y: a.y, until: world.time + FAINT_S + 5, who: a.id, text: 'Someone collapsed in the street' });
    n.happening = ev.id; n.keep = true;
    npc.spectacle(world, a.x, a.y, { r: 300, near: 60, chance: 0.35, secs: 8 });
    events.tellNear(world, a.x, a.y, 'Someone\'s collapsed on the pavement - help them up.', 'info');
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
    } else if (ev.kind === 'faint' && ev.until > world.time) {
      const a = world.get(ev.who);
      if (a && !a.dead && a.passedOut && Math.hypot(a.x - ped.x, a.y - ped.y) < REACH) return { label: `Help them up (+${FAINT_HELP_SAMARITAN} Samaritan)`, run: () => helpUp(world, p, ev, a) };
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

function helpUp(world, p, ev, a) {
  a.passedOut = false; a.npc.state = 'wander';
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

export function update(world) {
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
    } else if (ev.kind === 'faint') {
      const a = world.get(ev.who);
      if (!a || a.dead || a.removed || !a.passedOut) { finish(world, ev, 'gone'); continue; }
      if (now > ev.t + FAINT_S) {   // nobody helped: they come round by themselves and limp off
        a.passedOut = false; a.npc.state = 'limp'; a.npc.until = now + 20; a.npc.fx = a.x; a.npc.fy = a.y - 10;
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
  const kinds = KINDS.filter((k) => k !== world.lastHappening);
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for (const k of kinds) if (start(world, k, p)) { world.lastHappening = k; break; }
}

// (dev and tests: start one now, near this player)
export function startNow(world, kind, p) { const ok = start(world, kind, p); if (ok) world.lastHappening = kind; return ok; }
events.setWalletTarget((world, p) => walletTarget(world, p));
