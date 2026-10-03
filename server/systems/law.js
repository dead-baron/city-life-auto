// Law & tri-faction systems: witness network (GDD §6), legal immunity matrix (§7),
// heat/wanted stars with the 3-second flare and expanding search circle, peak-wanted
// disguise memory (§4B), enforcer badge + demotion (§4C), bounties and arrests.
import { K, FACTION, STAR_HEAT, starsForHeat } from '../../shared/constants.js';
import { angleDiff } from '../../shared/math.js';
import { isTurf } from '../../shared/map.js';
import { store } from '../store.js';
import * as npc from './npc.js';

export const CRIMES = {
  assault:     { heat: 15, label: 'Assault' },
  copAssault:  { heat: 40, label: 'Assaulting an officer', felony: true },
  murder:      { heat: 45, label: 'Murder', felony: true },
  copMurder:   { heat: 90, label: 'Killing an officer', felony: true },
  vehKill:     { heat: 40, label: 'Vehicular homicide', felony: true },
  hitrun:      { heat: 15, label: 'Hit and run' },
  brandish:    { heat: 6,  label: 'Shots fired' },
  theft:       { heat: 10, label: 'Vehicle theft' },
  policeTheft: { heat: 25, label: 'Stealing a police vehicle', felony: true },
  carjack:     { heat: 25, label: 'Carjacking', felony: true },
  cargoTheft:  { heat: 15, label: 'Cargo theft' },
  ram:         { heat: 8,  label: 'Reckless ramming' },
  possession:  { heat: 20, label: 'Contraband possession' },
};

export const ENFORCER_MIN_SAMARITAN = 25;
export const HUNTER_MIN_SAMARITAN = 10;

function isCop(ped) { return !!ped && ((ped.npc && (ped.npc.role === 'cop')) || (ped.player && ped.player.badge)); }
function isFlagged(world, ped) {
  if (!ped) return false;
  if (ped.player) return ped.player.wanted > 0 || ped.player.bounty > 0;
  return !!(ped.npc && (ped.npc.flagged || ped.npc.role === 'gang' || ped.npc.role === 'mugger'));
}

// ---------------------------------------------------------------------------
export function witnesses(world, x, y, perp, victim, loud = false) {
  const night = world.clock.isNight;
  const pedRange = 300 * (night ? 0.55 : 1);   // GDD: night narrows witness cones
  const camFactor = night ? 0.75 : 1;           // GDD: camera radii -25% at night
  const res = { count: 0, cop: false, cam: false };
  for (const e of world.query(x, y, Math.max(pedRange, 420), K.PED)) {
    if (e === perp || e.dead) continue;
    if (world.time < e.downUntil && e !== victim) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    const cop = isCop(e);
    const range = cop ? 420 * (night ? 0.75 : 1) : pedRange;
    if (d > range) continue;
    if (e.npc) {
      if (e.npc.role === 'gang' || e.npc.archetype === 'drunk') continue;
      const facing = Math.abs(angleDiff(e.a, Math.atan2(y - e.y, x - e.x))) < (cop ? 1.4 : 1.3);
      if (!facing && !(loud && d < 220) && e !== victim) continue;
    }
    if (!world.map.los(e.x, e.y, x, y)) continue;
    res.count++;
    if (cop) res.cop = true;
  }
  for (const c of world.map.cameras) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= c.r * camFactor && world.map.los(c.x, c.y, x, y)) {
      res.cam = true; res.count++;
      world.emit(c.x, c.y, { e: 'camera', id: c.id });
    }
  }
  return res;
}

function immune(world, perp, victim) {
  if (!victim) return false;
  const now = world.time;
  const firstStrike = perp.aggressors.get(victim.id);
  if (firstStrike !== undefined && now - firstStrike < 60) return 'self-defense';
  if (isFlagged(world, victim)) return 'flagged';
  if (victim.npc && victim.npc.role === 'gang' && isTurf(victim.x, victim.y)) return 'turf';
  return false;
}

export function crime(world, ped, type, victim, x = ped.x, y = ped.y, opts = {}) {
  const p = ped.player;
  if (!p) return;
  const spec = CRIMES[type];
  if (!spec) return;
  const now = world.time;
  if (victim) victim.aggressors.set(ped.id, now);
  const imm = immune(world, ped, victim);
  if (imm === 'turf') npc.gangAlert(world, ped);
  if (imm) return;

  if (p.badge) {
    // enforcer code of conduct: demerits instead of heat for lesser offences
    const demerit = { assault: 10, ram: 5, hitrun: 10, brandish: 0, murder: 30, vehKill: 25, theft: 5 }[type] ?? 10;
    if (demerit) {
      p.profile.samaritan -= demerit;
      world.notify(p, `Misconduct: ${spec.label} on a clean citizen (-${demerit} Samaritan)`, 'bad');
      if (p.profile.samaritan < ENFORCER_MIN_SAMARITAN) {
        goOffDuty(world, p, true);
        p.profile.firedUntil = Date.now() + 10 * 60 * 1000;
        world.notify(p, 'You have been FIRED from the force. Badge and uniform revoked.', 'bad');
      }
      store.touch();
      p.meDirty = true;
    }
    if (!spec.felony) return;
  }

  p.profile.criminalExp += Math.round(spec.heat / 2);
  if (spec.felony) p.profile.felonies++;
  if (victim && victim.player) victim.player.robbedBy.set(p.pid, now);
  store.touch();
  if (opts.silentCheck === false) { addHeat(world, p, spec.heat, x, y); return; }
  const w = witnesses(world, x, y, ped, victim, type === 'brandish' || type === 'murder');
  if (w.count === 0) {
    if (now - (p.lastSilentMsg || 0) > 6) { p.lastSilentMsg = now; world.notify(p, `${spec.label} - nobody saw it.`, 'info'); }
    p.meDirty = true;
    return;
  }
  addHeat(world, p, spec.heat, x, y);
  world.notify(p, `${spec.label} reported${w.cam ? ' by a traffic camera' : w.cop ? ' by police' : ''}!`, 'bad');
}

export function addHeat(world, p, amount, x, y) {
  const now = world.time;
  const prof = p.profile;
  if (p.disguised && prof.peakWanted > 0) {
    // GDD: a minor infraction in disguise spikes heat straight back to the cached peak
    p.heat = Math.max(p.heat, STAR_HEAT[prof.peakWanted]);
    p.disguised = false;
    world.notify(p, `Disguise blown! Your ${prof.peakWanted}-star record was recognized.`, 'bad');
  }
  p.heat = Math.min(STAR_HEAT[5] + 60, p.heat + amount);
  p.wanted = Math.min(5, starsForHeat(p.heat));
  p.flareUntil = now + 3;
  if (p.ped) p.ped.flareUntil = now + 3;
  p.lastSeenX = x; p.lastSeenY = y; p.seenAt = now; p.searchR = 60;
  if (p.wanted > prof.peakWanted) { prof.peakWanted = p.wanted; }
  prof.peakWantedAt = Date.now();
  p.faction = FACTION.CRIMINAL;
  if (p.wanted >= 4) p.cityBounty = Math.max(p.cityBounty || 0, 500 * p.wanted);
  p.bounty = (p.placedBounty || 0) + (p.cityBounty || 0);
  if (p.hunter && p.wanted > 0) { p.hunter = false; world.notify(p, 'Bounty Hunter license suspended while wanted.', 'bad'); }
  p.meDirty = true;
  store.touch();
}

export function clearWanted(world, p) {
  p.heat = 0; p.wanted = 0; p.flareUntil = 0; p.searchR = 0; p.cityBounty = 0;
  p.bounty = p.placedBounty || 0;
  p.faction = p.badge ? FACTION.ENFORCER : FACTION.CITIZEN;
  p.meDirty = true;
}

// ---------------------------------------------------------------------------
export function onDamage(world, attacker, victim, amount, cause) {
  if (!attacker || attacker === victim) return;
  const now = world.time;
  victim.aggressors.set(attacker.id, now);
  if (!attacker.player || cause === 'vehicle') return;
  attacker.recentAssault = attacker.recentAssault || new Map();
  const last = attacker.recentAssault.get(victim.id) || -99;
  if (now - last < 5) return;
  attacker.recentAssault.set(victim.id, now);
  crime(world, attacker, isCop(victim) ? 'copAssault' : 'assault', victim, victim.x, victim.y);
}

export function onKill(world, attacker, victim, cause) {
  if (!attacker || !attacker.player || attacker === victim) return;
  const p = attacker.player;
  // bounty claim (GDD §4C bounty hunters / immunity for dropping a bounty target)
  if (victim.player && victim.player.bounty > 0 && (p.hunter || p.badge)) claimBounty(world, p, victim.player);
  const type = cause === 'vehicle' ? 'vehKill' : (isCop(victim) ? 'copMurder' : 'murder');
  attacker.recentAssault?.set(victim.id, world.time);
  crime(world, attacker, type, victim, victim.x, victim.y);
}

export function gunfire(world, ped, hitSomeone) {
  if (!ped.player || hitSomeone || ped.player.badge) return;
  const now = world.time;
  if (now - (ped.lastHitAt || -99) < 10) return; // returning fire
  if (now - (ped.lastBrandish || -99) < 4) return;
  ped.lastBrandish = now;
  crime(world, ped, 'brandish', null, ped.x, ped.y);
}

export function vehicleRam(world, attacker, victimV, impact) {
  if (!attacker.player) return;
  const victim = victimV.seats[0] ? world.get(victimV.seats[0]) : null;
  if (!victim) return;
  const now = world.time;
  if (now - (attacker.lastRam || -99) < 4) return;
  attacker.lastRam = now;
  crime(world, attacker, 'ram', victim, victimV.x, victimV.y);
  void impact;
}

export function hitAndRun(world, driver, ped, killed, v) {
  if (!driver.player || killed) return; // kills are reported by onKill as vehicular homicide
  crime(world, driver, 'hitrun', ped, ped.x, ped.y);
  void v;
}

// ---------------------------------------------------------------------------
export function update(world, dt) {
  const now = world.time;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead) continue;
    if (p.wanted > 0) {
      let seen = false;
      for (const e of world.query(ped.x, ped.y, 420, K.PED)) {
        if (!isCop(e) || e.dead || e === ped) continue;
        if (world.map.los(e.x, e.y, ped.x, ped.y)) { seen = true; break; }
      }
      if (!seen && world.tick % 10 === 0) {
        for (const c of world.map.cameras) {
          if (Math.hypot(c.x - ped.x, c.y - ped.y) < c.r * (world.clock.isNight ? 0.75 : 1) && world.map.los(c.x, c.y, ped.x, ped.y)) {
            seen = true; world.emit(c.x, c.y, { e: 'camera', id: c.id });
            if (now - (p.lastCamPing || -99) > 8) { p.lastCamPing = now; world.notify(p, 'Traffic camera pinged your position to the Police Network!', 'bad'); }
          }
        }
      }
      if (seen) { p.seenAt = now; p.lastSeenX = ped.x; p.lastSeenY = ped.y; p.searchR = 60; }
      const unseen = now - p.seenAt;
      if (unseen > 3) {
        p.searchR = Math.min(1100, p.searchR + 28 * dt);
        const rate = unseen > 20 ? 2.4 : 1.2;
        p.heat = Math.max(0, p.heat - rate * dt);
        const stars = starsForHeat(p.heat);
        if (stars < p.wanted) {
          p.wanted = stars;
          p.meDirty = true;
          if (stars === 0) { clearWanted(world, p); world.notify(p, 'You lost the cops. Wanted level cleared.', 'good'); }
        }
      }
      // contraband in view of police
      if (seen) checkContraband(world, p, ped);
    }
    // peak-wanted memory cools by one star every 10 minutes clean
    const prof = p.profile;
    if (p.wanted === 0 && prof.peakWanted > 0 && Date.now() - prof.peakWantedAt > 600000) {
      prof.peakWanted--; prof.peakWantedAt = Date.now(); store.touch(); p.meDirty = true;
    }
    if (p.placedBountyUntil && now > p.placedBountyUntil) { p.placedBounty = 0; p.placedBountyUntil = 0; p.bounty = p.cityBounty || 0; p.meDirty = true; }
    if (world.tick % 10 === 0 && (p.badge || p.hunter || p.wanted > 0)) p.meDirty = true;
  }
  // cops spot visible contraband even on clean players
  if (world.tick % 20 === 0) {
    for (const p of world.players.values()) if (p.ped && !p.ped.dead && p.wanted === 0) {
      for (const e of world.query(p.ped.x, p.ped.y, 300, K.PED)) {
        if (isCop(e) && e !== p.ped && !e.dead && world.map.los(e.x, e.y, p.ped.x, p.ped.y)) { checkContraband(world, p, p.ped); break; }
      }
    }
  }
}

function checkContraband(world, p, ped) {
  const crates = [];
  if (ped.carrying) crates.push(world.get(ped.carrying));
  if (ped.vehId) { const v = world.get(ped.vehId); if (v) for (const id of v.cargo) if (id) crates.push(world.get(id)); }
  for (const c of crates) {
    if (c && c.contraband && !c.reported && !p.badge) {
      c.reported = true;
      crime(world, ped, 'possession', null, ped.x, ped.y, { silentCheck: false });
    }
  }
}

export function radarFor(world, p) {
  const out = [];
  const now = world.time;
  if (p.badge) {
    for (const q of world.players.values()) {
      if (q === p || q.wanted <= 0 || !q.ped) continue;
      if (now - q.seenAt < 3) out.push({ k: 'wanted', x: Math.round(q.ped.x), y: Math.round(q.ped.y), s: q.wanted });
      else out.push({ k: 'search', x: Math.round(q.lastSeenX), y: Math.round(q.lastSeenY), r: Math.round(q.searchR), s: q.wanted, f: Math.max(0.15, q.heat / 160) });
    }
  }
  if (p.hunter || p.badge) {
    const ping = Math.floor(now / 5);
    for (const q of world.players.values()) {
      if (q === p || q.bounty <= 0 || !q.ped) continue;
      const jx = ((ping * 7919 + q.ped.id * 31) % 160) - 80, jy = ((ping * 104729 + q.ped.id * 17) % 160) - 80;
      out.push({ k: 'bounty', x: Math.round(q.ped.x + jx), y: Math.round(q.ped.y + jy), r: 140, b: q.bounty, n: q.name });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
export function arrestTarget(world, p) {
  const ped = p.ped;
  const now = world.time;
  for (const e of world.query(ped.x, ped.y, 40, K.PED)) {
    if (e === ped || e.dead || e.vehId) continue;
    if (!isFlagged(world, e) || (e.npc && e.npc.role === 'gang')) continue;
    if (now < e.downUntil || now < e.stunUntil || e.hp < e.maxHp * 0.3) return e;
  }
  return null;
}

export function arrest(world, cop, target) {
  const now = world.time;
  if (target.player) {
    const t = target.player;
    const stars = Math.max(1, t.wanted);
    const fine = Math.min(t.profile.cash, 250 * stars);
    t.profile.cash -= fine;
    for (const id of ['smg', 'rocket']) if (t.profile.weapons[id] !== undefined) delete t.profile.weapons[id];
    if (target.carrying) { const c = world.get(target.carrying); target.carrying = 0; if (c) world.remove(c); }
    if (target.weapon === 'smg' || target.weapon === 'rocket') target.weapon = 'fists';
    const reward = 150 * stars;
    if (cop && cop.player) {
      if (t.bounty > 0) claimBounty(world, cop.player, t);
      cop.player.profile.cash += reward + fine;
      cop.player.profile.samaritan += 5 * stars;
      cop.player.profile.stats.arrests++;
      world.notify(cop.player, `Arrested ${t.name}! +$${reward + fine}, +${5 * stars} Samaritan`, 'good');
      cop.player.meDirty = true;
    }
    clearWanted(world, t);
    t.profile.peakWanted = 0;
    t.disguised = false;
    const s = world.map.spawns.police;
    if (target.vehId) { /* already ejected by caller */ }
    target.x = s.x; target.y = s.y; target.vx = 0; target.vy = 0;
    target.stunUntil = now + 1; target.downUntil = 0;
    world.notify(t, `BUSTED${cop?.player ? ' by ' + cop.player.name : ''}. Fined $${fine}; contraband and illegal weapons confiscated.`, 'bad');
    t.meDirty = true;
    store.touch();
  } else {
    // NPC suspect taken into custody
    world.emit(target.x, target.y, { e: 'poof', x: target.x, y: target.y });
    world.remove(target);
    if (cop && cop.player) {
      cop.player.profile.cash += 60; cop.player.profile.samaritan += 4;
      world.notify(cop.player, 'Suspect taken into custody. +$60, +4 Samaritan', 'good');
      cop.player.meDirty = true;
    }
  }
}

export function claimBounty(world, hunter, target) {
  const amount = target.bounty;
  if (amount <= 0) return;
  hunter.profile.cash += amount;
  hunter.profile.samaritan += 10;
  world.notify(hunter, `Bounty on ${target.name} claimed: +$${amount}`, 'good');
  world.notify(target, 'The bounty on your head was collected.', 'bad');
  target.placedBounty = 0; target.cityBounty = 0; target.bounty = 0; target.placedBountyUntil = 0;
  hunter.meDirty = true; target.meDirty = true;
  store.touch();
}

export function placeBounty(world, p, targetPid, amount) {
  const t = world.players.get(targetPid);
  if (!t) return 'That person is not in the city right now.';
  if (p.wanted > 0) return 'Criminals are barred from placing bounties.';
  const when = p.robbedBy.get(targetPid);
  if (when === undefined || world.time - when > 1800) return 'You can only place a bounty on someone who attacked or robbed you recently.';
  if (amount < 100) return 'Minimum bounty is $100.';
  if (p.profile.bank < amount) return 'Bounties are paid from your bank balance - not enough funds.';
  p.profile.bank -= amount;
  t.placedBounty = (t.placedBounty || 0) + amount;
  t.placedBountyUntil = world.time + 1800;
  t.bounty = t.placedBounty + (t.cityBounty || 0);
  world.notify(t, `A $${amount} bounty was placed on your head!`, 'bad');
  for (const q of world.players.values()) if (q.hunter) world.notify(q, `New contract: $${t.bounty} on ${t.name}`, 'info');
  p.meDirty = true; t.meDirty = true;
  store.touch();
  return null;
}

export function goOnDuty(world, p) {
  const prof = p.profile;
  if (p.badge) return 'You are already on duty.';
  if (p.wanted > 0) return 'Wanted suspects cannot pick up a badge.';
  if (Date.now() < (prof.firedUntil || 0)) return 'You were fired recently. Come back later.';
  if (prof.felonies > 0) return `Applicants need an unblemished felony record (you have ${prof.felonies}).`;
  if (prof.samaritan < ENFORCER_MIN_SAMARITAN && !p.dev) return `You need ${ENFORCER_MIN_SAMARITAN} Good Samaritan Points (you have ${prof.samaritan}).`;
  p.badge = true; p.hunter = false;
  p.faction = FACTION.ENFORCER;
  p.civvies = p.ped.app;
  p.ped.app = { ...p.ped.app, t: 6, tc: '#1d2a5a', tc2: '#f2c21b', l: '#1d2a5a', ht: 1, htc: '#1d2a5a' };
  p.ped.appVer = (p.ped.appVer || 0) + 1;
  prof.weapons.taser = prof.weapons.taser ?? 0;
  prof.weapons.baton = prof.weapons.baton ?? 0;
  if (prof.weapons.pistol === undefined) { prof.weapons.pistol = 36; p.ped.mag.pistol = 12; }
  p.meDirty = true;
  store.touch();
  return null;
}

export function goOffDuty(world, p, fired = false) {
  if (!p.badge) return;
  p.badge = false;
  p.faction = FACTION.CITIZEN;
  if (p.civvies && p.ped) { p.ped.app = p.civvies; p.ped.appVer = (p.ped.appVer || 0) + 1; }
  delete p.profile.weapons.taser; delete p.profile.weapons.baton;
  if (p.ped && (p.ped.weapon === 'taser' || p.ped.weapon === 'baton')) p.ped.weapon = 'fists';
  p.meDirty = true;
  void fired;
  void world;
}

export function registerHunter(world, p) {
  if (p.hunter) return 'You already hold a Bounty Hunter license.';
  if (p.wanted > 0) return 'Criminals cannot register as bounty hunters.';
  if (p.badge) return 'Enforcers already track outlaws on the police radar.';
  if (p.profile.samaritan < HUNTER_MIN_SAMARITAN && !p.dev) return `You need ${HUNTER_MIN_SAMARITAN} Good Samaritan Points.`;
  p.hunter = true;
  p.faction = FACTION.HUNTER;
  p.meDirty = true;
  void world;
  return null;
}

export function onPlayerGone(world, p) { void world; void p; }
