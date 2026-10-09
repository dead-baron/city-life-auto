// Downed players (they go down instead of straight to the respawn screen): Call for Help, revives
// by other players (with a Revive Kit, or bare-handed onto low health with a limp), finishing a
// downed player off, handing them a bandage or med kit after a revive, and the paid ambulance.
//
// A downed player is a player ped with ped.dead set while their respawn timer runs (p.respawnAt)
// and nobody has finished them (p.finished). Their cash, items and weapons were already dropped
// in a backpack beside them (and their cash in a pile of notes) when they went down (players.onPedDeath, cargo.js
// dropEverything) - anyone can take them.
import { K } from '../../shared/constants.js';
import { ITEMS } from '../../shared/items.js';
import {
  HELP_S, HELP_PING_S, HELP_PING_PX, REVIVE_KIT_S, REVIVE_HAND_S, REVIVE_LOW_HP, REVIVE_LIMP_S, FINISH_S,
  GIVE_AFTER_REVIVE_S, AMBULANCE_FEE,
} from '../../shared/rules.js';
import { IN } from '../../shared/input.js';
import { store } from '../store.js';
import * as events from './events.js';
import * as ems from './ems.js';
import { sync as syncBounty } from './bounties.js';

const REACH = 48;      // stand this close to a downed player to work on them
const KEEP_REACH = 70; // ...and don't wander further than this while you do

export function isDowned(ped) {
  const p = ped && ped.player;
  return !!(ped && ped.dead && p && p.ped === ped && !p.finished && p.respawnAt);
}

function placeName(world, x, y) {
  const d = world.map.districtAt(x, y);
  return d ? d.name : 'the city';
}

// The downed player nearest p within reach, if any.
function downedNear(world, p, r = REACH) {
  let best = null, bd = r;
  for (const e of world.query(p.ped.x, p.ped.y, r + 10, K.PED)) {
    if (e === p.ped || !isDowned(e)) continue;
    const d = Math.hypot(e.x - p.ped.x, e.y - p.ped.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---- the downed player's own choices (death screen) --------------------------------------------
export function callHelp(world, p) {
  const ped = p.ped, now = world.time;
  if (!isDowned(ped)) return;
  if (!p.downHelp) {
    p.downHelp = { at: now, pingAt: -1e9 };
    p.respawnAt = Math.max(p.respawnAt, now + HELP_S);
  }
  if (now - p.downHelp.pingAt < HELP_PING_S) { world.notify(p, `Help is on its way to everyone near you - call again in ${Math.ceil(HELP_PING_S - (now - p.downHelp.pingAt))}s.`, 'info'); p.meDirty = true; return; }
  p.downHelp.pingAt = now;
  const where = placeName(world, ped.x, ped.y);
  let n = 0;
  for (const q of world.players.values()) {
    if (q === p || !q.ped || q.ped.dead || Math.hypot(q.ped.x - ped.x, q.ped.y - ped.y) > HELP_PING_PX) continue;
    world.notify(q, `🩺 ${p.name} is down in ${where} and calling for help - revive them (hold the action button over them).`, 'warn');
    n++;
  }
  if (!p.downHelp.ev) p.downHelp.ev = events.add(world, { kind: 'revive', x: ped.x, y: ped.y, until: now + HELP_S + 30, pid: p.pid, text: `${p.name} is down in ${where} and needs a revive` }).id;
  world.notify(p, n ? `Call for help sent to ${n} player${n === 1 ? '' : 's'} nearby. You'll stay down ${Math.ceil(p.respawnAt - now)}s.` : `Nobody is close enough to hear - you'll stay down ${Math.ceil(p.respawnAt - now)}s in case someone comes.`, n ? 'good' : 'info');
  p.meDirty = true;
}

// Give up waiting: back to the countdown you went down with (never sooner - p.downMinAt), then wake at your choice.
export function cancelHelp(world, p) {
  if (!isDowned(p.ped)) return;
  cancelAmbulance(world, p, true);
  endRequest(world, p);
  p.respawnAt = Math.max(world.time, p.downMinAt || 0);
  p.meDirty = true;
}

export function callAmbulance(world, p) {
  const ped = p.ped, now = world.time;
  if (!isDowned(ped)) return;
  if (p.amb) { world.notify(p, 'An ambulance is already on its way.', 'info'); return; }
  if (p.ambUsed) { world.notify(p, 'You can only call one ambulance each time you go down.', 'warn'); return; }
  if (p.profile.bank < AMBULANCE_FEE) { world.notify(p, `An ambulance costs $${AMBULANCE_FEE} from your bank - you only have $${p.profile.bank} banked.`, 'bad'); return; }
  const v = ems.dispatchPaid(world, ped, p.pid);
  if (!v) { world.notify(p, 'No ambulance can reach you from here right now.', 'bad'); return; }
  if (!p.downHelp) callHelp(world, p);   // (an ambulance on its way is a call for help too: anyone near can still get to you first)
  p.amb = { vehId: v.id };
  p.ambUsed = true;
  p.respawnAt = now + HELP_S; // the clock starts again while it drives over
  world.notify(p, `🚑 Ambulance on its way (watch for it on your map). $${AMBULANCE_FEE} comes from your bank only if they revive you.`, 'good');
  p.meDirty = true;
}

export function cancelAmbulance(world, p, quiet = false) {
  if (!p.amb) return;
  ems.recall(world, p.amb.vehId);
  p.amb = null;
  if (!quiet) world.notify(p, 'Ambulance cancelled - no charge.', 'info');
  p.meDirty = true;
}

function endRequest(world, p) {
  if (p.downHelp && p.downHelp.ev && world.happenings) world.happenings = world.happenings.filter((e) => e.id !== p.downHelp.ev);
  p.downHelp = null;
}

// Reset all the downed bookkeeping (on going down, waking up, being revived).
export function clearDown(world, p) {
  if (p.amb) cancelAmbulance(world, p, true);
  endRequest(world, p);
  p.finished = false; p.ambUsed = false;
}

// ---- finishing a downed player -----------------------------------------------------------------
// Any attack on them, holding the vehicle button over them, or a cop booking them: no revive now.
export function finish(world, ped, by, how = 'finished') {
  const p = ped.player;
  if (!isDowned(ped)) return false;
  p.finished = true;
  cancelAmbulance(world, p, true);
  endRequest(world, p);
  p.respawnAt = Math.min(p.respawnAt, world.time + 3);
  if (how === 'surrender') { p.meDirty = true; return true; } // gave up: straight to the wake-up, no one to blame
  world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a: 0, n: 8 });
  const who = by && by.player ? by.player.name : by ? (by.name || 'someone') : 'someone';
  world.notify(p, how === 'bust' ? `Booked by ${who} while you were down - no revive.` : `${who} finished you off.`, 'bad');
  if (by && by.player && how !== 'bust') world.notify(by.player, `You finished off ${p.name}.`, 'warn');
  p.meDirty = true;
  return true;
}

// ---- reviving ------------------------------------------------------------------------------------
// opts: { by (ped), kit (Revive Kit: full health), ambulance (paramedics: half health, fee) }
export function revive(world, ped, opts = {}) {
  const p = ped.player, now = world.time;
  if (!isDowned(ped)) return false;
  if (opts.ambulance) {
    p.profile.bank = Math.max(0, p.profile.bank - AMBULANCE_FEE);
    p.amb = null;
  }
  clearDown(world, p);
  ped.dead = false; ped.deadAt = 0; ped.bleeding = false;
  ped.hp = ped.maxHp * (opts.kit ? 1 : opts.ambulance ? 0.5 : REVIVE_LOW_HP);
  ped.limpUntil = opts.kit || opts.ambulance ? 0 : now + REVIVE_LIMP_S;
  ped.downUntil = now + 0.8; // getting up
  ped.vx = 0; ped.vy = 0;
  ped.bookable = null;
  p.respawnAt = 0; p.respawnChoice = null;
  // the wanted level they went down with comes back with them: going down is no escape
  if (p.downWanted) { p.heat = p.downWanted.heat; p.wanted = p.downWanted.wanted; p.cityBounty = p.downWanted.city || 0; p.downWanted = null; syncBounty(world, p); }
  world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y });
  const by = opts.by && opts.by.player;
  world.notify(p, opts.ambulance ? `Paramedics got you back on your feet. $${AMBULANCE_FEE} from your bank. Your things are in your backpack beside you.`
    : opts.kit ? `${by ? by.name : 'Someone'} revived you with a Revive Kit. Your things are in your backpack beside you.`
      : `${by ? by.name : 'Someone'} got you back on your feet - you're hurt and bleeding: take it slow for a few seconds. Your things are in your backpack beside you.`, 'good');
  if (by) {
    by.profile.samaritan += 5;
    by.giveTo = { pid: p.pid, until: now + GIVE_AFTER_REVIVE_S };
    const kit = by.profile.inventory;
    const can = (kit.medkit || 0) > 0 || (kit.bandage || 0) > 0;
    world.notify(by, `You revived ${p.name}. +5 Samaritan.${can ? ' You can hand them a bandage or med kit now (action button).' : ''}`, 'good');
    by.meDirty = true;
  }
  p.meDirty = true;
  store.touch();
  return true;
}

// Hand the player you just revived a med kit (full) or bandage (half): used on them at once.
function give(world, p, target, id) {
  const inv = p.profile.inventory;
  if ((inv[id] || 0) <= 0 || !target || target.dead) return;
  inv[id]--;
  const tp = target.player;
  target.hp = id === 'medkit' ? target.maxHp : Math.max(target.hp, target.maxHp * 0.5);
  target.bleeding = false; target.limpUntil = 0;
  world.emit(target.x, target.y, { e: 'heal', x: target.x, y: target.y });
  world.notify(p, `Gave ${tp ? tp.name : 'them'} your ${ITEMS[id].name}.`, 'good');
  if (tp) { world.notify(tp, `${p.name} patched you up with a ${ITEMS[id].name}.`, 'good'); tp.meDirty = true; }
  p.giveTo = null;
  p.meDirty = true;
  store.touch();
}

// ---- holding a button over a downed player -------------------------------------------------------
function startChannel(world, p, kind, target) {
  const kit = kind === 'revive' && (p.profile.inventory.revivekit || 0) > 0;
  p.channel = { kind, target: target.id, start: world.time, dur: kind === 'finish' ? FINISH_S : kit ? REVIVE_KIT_S : REVIVE_HAND_S, kit, bit: kind === 'finish' ? IN.VEHICLE : IN.ACTION };
  if (kind === 'revive') world.emit(target.x, target.y, { e: 'revive', x: target.x, y: target.y, id: target.id });
  p.meDirty = true;
}

// The prompt / action for p near a downed player (or the one they just revived). Null if none.
export function interaction(world, p) {
  const ped = p.ped, now = world.time;
  if (!ped || ped.dead || ped.vehId) return null;
  if (p.channel) {
    const t = world.get(p.channel.target);
    const left = Math.max(0, p.channel.dur - (now - p.channel.start)).toFixed(1);
    const name = t && t.player ? t.player.name : 'them';
    return { label: p.channel.kind === 'finish' ? `Finishing ${name}... ${left}s (keep holding)` : `Reviving ${name}${p.channel.kit ? ' with the Revive Kit' : ''}... ${left}s (keep holding)`, key: p.channel.kind === 'finish' ? 'F' : 'E', run: () => {} };
  }
  if (p.giveTo && now < p.giveTo.until) {
    const tp = world.players.get(p.giveTo.pid);
    const t = tp && tp.ped;
    if (t && !t.dead && Math.hypot(t.x - ped.x, t.y - ped.y) < 90) {
      const inv = p.profile.inventory;
      const id = (inv.medkit || 0) > 0 ? 'medkit' : (inv.bandage || 0) > 0 ? 'bandage' : null;
      if (id) return { label: `Give ${tp.name} your ${ITEMS[id].name} (${id === 'medkit' ? 'full health' : 'to half health'})`, run: () => give(world, p, t, id) };
    }
  }
  const t = downedNear(world, p);
  if (!t) return null;
  if (p.badge && t.bookable) return null; // a cop over a wanted player: booking them (law.js) comes first
  const kit = (p.profile.inventory.revivekit || 0) > 0;
  return { label: `Hold to revive ${t.player.name}${kit ? ' (Revive Kit: full health)' : ' (no kit: low health)'} · hold F to finish them`, run: () => startChannel(world, p, 'revive', t) };
}

// The vehicle button pressed on foot: over a downed player it starts finishing them (instead of
// looking for a car). True if it did.
export function tryFinish(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.channel) return false;
  const t = downedNear(world, p);
  if (!t) return false;
  startChannel(world, p, 'finish', t);
  return true;
}

// ---- every tick ---------------------------------------------------------------------------------
export function update(world, dt) {
  const now = world.time;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped) continue;
    // channels: keep holding the button, stay close, don't get hit
    if (p.channel) {
      const c = p.channel, t = world.get(c.target);
      const held = (ped.prevBits || 0) & c.bit;
      const ok = t && isDowned(t) && !ped.dead && !ped.vehId && held && Math.hypot(t.x - ped.x, t.y - ped.y) < KEEP_REACH && !((ped.lastHitAt || 0) > c.start);
      if (!ok) { p.channel = null; p.meDirty = true; }
      else if (now - c.start >= c.dur) {
        p.channel = null;
        if (c.kind === 'finish') finish(world, t, ped);
        else revive(world, t, { by: ped, kit: c.kit });
      }
    }
    if (p.giveTo && now >= p.giveTo.until) p.giveTo = null;
    // the limp after a bare-handed revive: bleeding, slow, healing up to half
    if (!ped.dead && ped.limpUntil) {
      if (now >= ped.limpUntil || ped.hp >= ped.maxHp * 0.5) { ped.limpUntil = 0; p.meDirty = true; }
      else ped.hp = Math.min(ped.maxHp * 0.5, ped.hp + (ped.maxHp * (0.5 - REVIVE_LOW_HP) / REVIVE_LOW_HP_SPAN) * dt);
    }
    // downed: the ambulance gone (wrecked, hijacked...) - free to call another
    if (p.amb && !world.get(p.amb.vehId)) { p.amb = null; p.ambUsed = false; world.notify(p, 'The ambulance didn\'t make it - you can call another.', 'warn'); p.meDirty = true; }
  }
}
const REVIVE_LOW_HP_SPAN = REVIVE_LIMP_S;

// For the 'me' message: what the downed player's death screen and map need.
export function downState(world, p) {
  const ped = p.ped;
  if (!isDowned(ped) && !(ped && ped.dead && p.finished)) return null;
  const v = p.amb && world.get(p.amb.vehId);
  return {
    help: !!p.downHelp, finished: !!p.finished, amb: v ? { x: Math.round(v.x), y: Math.round(v.y) } : null, ambUsed: !!p.ambUsed,
    canAmb: !p.amb && !p.ambUsed && p.profile.bank >= AMBULANCE_FEE, fee: AMBULANCE_FEE,
  };
}
