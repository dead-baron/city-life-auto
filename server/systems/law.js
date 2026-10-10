// Law & tri-faction systems: witness network (GDD §6), legal immunity matrix (§7),
// heat/wanted stars with the 3-second flare and expanding search circle, peak-wanted
// disguise memory (§4B), enforcer badge + demotion (§4C), bounties and arrests.
import { K, FACTION, STAR_HEAT, starsForHeat, TILE, MAP_W } from '../../shared/constants.js';
import * as revive from './revive.js';
import { angleDiff } from '../../shared/math.js';
import { isTurf } from '../../shared/map.js';
import { WEAPONS, ITEMS } from '../../shared/items.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as phone from './phone.js';
import * as events from './events.js';
import * as bounties from './bounties.js';
import * as custody from './custody.js';
import * as cells from './cells.js';
import { wildStyle } from './wildlife.js';
import { edgeInfo } from '../../shared/border.js';
import { undergroundOf, ugLos } from '../../shared/underground.js';
import { ROB_CALLED_HEAT, VANDAL_HEAT, VEH_CRIME } from '../../shared/rules.js';
const EDGE_I = { d: 0, nx: 0, ny: 0 };

// sev: how much more (or less) likely a witness is to call it in than for an assault (WITNESS_REPORT); sight: how far
// people notice it, as a share of the usual (a bike lifted off a rack is easy to miss); minor: a small crime - what
// passers-by see of it adds up to a star, one an officer sees is a star at once (smallCrime, task #405)
export const CRIMES = {
  punch:       { heat: 15, label: 'Assault', sev: 1, minor: true },   // (bare fists: a punch, a shove - onDamage; a weapon's is an assault)
  assault:     { heat: 15, label: 'Assault', sev: 1 },
  copAssault:  { heat: 40, label: 'Assaulting an officer', felony: true, sev: 1.3 },
  murder:      { heat: 45, label: 'Murder', felony: true, sev: 1.5 },
  copMurder:   { heat: 90, label: 'Killing an officer', felony: true, sev: 2 },
  vehKill:     { heat: 40, label: 'Vehicular homicide', felony: true, sev: 1.4 },
  hitrun:      { heat: 15, label: 'Hit and run', sev: 1.1 },
  brandish:    { heat: 6,  label: 'Shots fired', sev: 1.2 },
  theft:       { heat: 10, label: 'Vehicle theft', sev: 0.85 },
  bikeTheft:   { heat: 5,  label: 'Bike theft', sev: 0.55, sight: 0.6, minor: true },
  bikejack:    { heat: 15, label: 'Pulling someone off their bike', sev: 1, sight: 0.8 },
  policeTheft: { heat: 25, label: 'Stealing a police vehicle', felony: true, sev: 1.2 },
  carjack:     { heat: 25, label: 'Carjacking', felony: true, sev: 1.3 },
  cargoTheft:  { heat: 15, label: 'Cargo theft', sev: 0.85 },
  ram:         { heat: 8,  label: 'Reckless ramming', sev: 0.7, minor: true },
  possession:  { heat: 20, label: 'Contraband possession', sev: 1 },
  poaching:    { heat: 30, label: 'Poaching protected sea life', felony: true, sev: 1 },
  robbery:     { heat: ROB_CALLED_HEAT, label: 'Armed robbery', felony: true, sev: 1.5 },   // (1 star; it grows from there: robbery.js)
  trainRobbery: { heat: 50, label: 'Train robbery', felony: true, sev: 1.5 },
  escape:      { heat: 25, label: 'Escaping custody', felony: true, sev: 1 },
  treeFelling: { heat: FELL_HEAT, label: 'Vandalism: felling a tree', sev: 0.6, minor: true },   // (in town or a park: felling.js)
  vandalism:   { heat: VANDAL_HEAT, label: 'Vandalism: damaging a vehicle', sev: 0.7, minor: true },   // (an empty one: vehicleDamaged)
};

import { ENFORCER_MIN_SAMARITAN, HUNTER_MIN_SAMARITAN, MISCONDUCT_GRACE, MISCONDUCT_RESET_MS, MISCONDUCT_WEIGHT, FIRED_LOCKOUT_MS, SERVICE_AMMO, SERVICE_MAG, SUBDUE_S, POLICE_RANKS, ARREST_REWARD_PER_STAR, WILD_SIGHT, COVER_SIGHT, WILD_COOL,
  WITNESS_REPORT, WITNESS_TIER, WITNESS_SIGHT, VICTIM_REPORT, WITNESS_SPREAD, SAW_S, SAW_NOTE_S, REPORT_COOLDOWN_S, FELL_HEAT, SUSPICION_STAR, SUSPICION_HOLD_S, SUSPICION_FADE_S } from '../../shared/rules.js';
import { hash2 } from '../../shared/rng.js';
import { decodeLook, lookToApp, policeLook } from '../../shared/look.js';
import { PAINTS } from '../../shared/vehicles.js';
export { ENFORCER_MIN_SAMARITAN, HUNTER_MIN_SAMARITAN, MISCONDUCT_GRACE, MISCONDUCT_RESET_MS, SERVICE_AMMO, SUBDUE_S, POLICE_RANKS };

// How far the police can spot a wanted suspect at (x, y), as a share of their town range (420 px):
// 1 in town; out in the wilds less (fewer eyes, more ground to cover), and on foot in thick
// cover - the trees, logs and rocks within a couple of tiles - less again.
const SIGHT_PX = 420;
export function sightFactor(map, x, y, onFoot = true) {
  if (!wildStyle(map, x, y)) return 1;
  if (!onFoot || !map.solidProps) return WILD_SIGHT;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let n = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const a = map.solidProps.get((ty + j) * MAP_W + tx + i);
    if (a) for (const e of a) if (!e.off) n++;
  }
  return WILD_SIGHT * (1 - COVER_SIGHT * Math.min(1, n / 6));
}

// Police misconduct grace: officers can get away with a few offences; each one is forgotten
// after MISCONDUCT_RESET_MS. Going over the limit costs the badge.
function pruneMisconduct(prof) {
  const now = Date.now();
  prof.misconduct = (prof.misconduct || []).filter((t) => now - t < MISCONDUCT_RESET_MS);
  return prof.misconduct;
}
function addMisconduct(world, p, type) {
  const list = pruneMisconduct(p.profile);
  const w = MISCONDUCT_WEIGHT[type] || 1;
  for (let i = 0; i < w; i++) list.push(Date.now());
  void world;
  return list.length;
}
export function misconductFor(p) {
  if (!p.badge) return null;
  const list = pruneMisconduct(p.profile);
  if (!list.length) return { n: 0, max: MISCONDUCT_GRACE, reset: 0 };
  return { n: list.length, max: MISCONDUCT_GRACE, reset: Math.ceil((list[0] + MISCONDUCT_RESET_MS - Date.now()) / 1000) };
}

// Police career: rank comes from service points (arrests, bounties, stops). Shown in the HUD;
// every rank gets the dispatch map, higher ranks see crime reports for longer.
export function policeRank(prof) {
  const pts = prof.policePts || 0;
  let r = 0;
  for (let i = 0; i < POLICE_RANKS.length; i++) if (pts >= POLICE_RANKS[i].pts) r = i;
  return r;
}
export function addPolicePts(world, p, n) {
  const before = policeRank(p.profile);
  p.profile.policePts = (p.profile.policePts || 0) + n;
  const after = policeRank(p.profile);
  if (after > before) world.notify(p, `PROMOTED to ${POLICE_RANKS[after].name}!`, 'good');
  p.meDirty = true;
}

// Dispatch log: every crime that someone actually saw or reported (witness, cop or camera).
// Unwitnessed crimes never reach the police map.
const DISPATCH_TTL = 300;
export function logDispatch(world, type, x, y, p, stars, via) {
  world.dispatch ??= [];
  world.dispatch.push({ id: (world.dispatchSeq = (world.dispatchSeq || 0) + 1), t: world.time, x: Math.round(x), y: Math.round(y), l: CRIMES[type]?.label || ({ mugging: 'Purse snatching', fight: 'Street fight', flee: 'Ran from an officer' })[type] || type, s: stars, via, who: p ? p.pid : null });
  if (world.dispatch.length > 60) world.dispatch.splice(0, world.dispatch.length - 60);
  for (const q of world.players.values()) if (q.badge) q.meDirty = true;
}
export function dispatchFor(world, p) {
  if (!p.badge || !world.dispatch) return null;
  const ttl = DISPATCH_TTL + policeRank(p.profile) * 60;
  return world.dispatch.filter((d) => world.time - d.t < ttl && d.who !== p.pid).map((d) => ({ id: d.id, x: d.x, y: d.y, l: d.l, s: d.s, via: d.via, age: Math.round(world.time - d.t) }));
}

function isCop(ped) { return !!ped && ((ped.npc && (ped.npc.role === 'cop')) || (ped.player && ped.player.badge)); }
function isFlagged(world, ped) {
  if (!ped) return false;
  if (ped.player) return ped.player.wanted > 0 || ped.player.bounty > 0;
  return !!(ped.npc && (ped.npc.flagged || ped.npc.role === 'gang' || ped.npc.role === 'mugger')) || brawling(world, ped);
}
// An NPC who started a street fight (task #395: npc.js markBrawl): a criminal while it lasts and a little after (and while
// the police are after them) - hitting them is no crime; killing them still is (dead, they're not brawling: immune).
// The police take them in (police.js).
export const brawling = (world, e) => !!(e && e.npc && !e.dead && (e.npc.brawl || 0) > world.time);

// The 1-star police stop (task #405): a star from small crimes (smallCrime) brings an officer for a word, not the chase
// (stops.js). p.soft: the star is that kind - any other heat makes it the usual kind (addHeat).
export const soft = (p) => !!p && p.wanted === 1 && !!p.soft;

// ---------------------------------------------------------------------------
// Who saw it, and who calls it in. With a crime (its CRIMES key), not everyone who sees it reports it (design notes
// 2026-10-07): the police always do; anyone else by who they are (WITNESS_REPORT), where it happened (the district's
// wealth: WITNESS_TIER - in the rough parts most look away, and see less: WITNESS_SIGHT), how bad it was (sev) and
// their own disposition (npc.snitch); the victim more likely than a bystander. Players who see it aren't counted:
// they're told and can call it in from the phone (res.saw: sawCrime / reportSaw). Without a crime (a paint shop
// asking if anyone's looking), everyone who sees counts. count: who reported it; seen: who saw it; copId: an NPC officer
// who saw it (stops.js: theirs to deal with, if they're free).
export function witnesses(world, x, y, perp, victim, loud = false, crime = null) {
  const night = world.clock.isNight;
  const tier = crime ? world.map.districtAt(x, y).tier || 'mid' : 'mid';
  const sight = (crime && CRIMES[crime] && CRIMES[crime].sight) || 1;
  const pedRange = 300 * (night ? 0.55 : 1) * (WITNESS_SIGHT[tier] ?? 1) * sight;   // GDD: night narrows witness cones
  const camFactor = night ? 0.75 : 1;           // GDD: camera radii -25% at night
  const res = { count: 0, seen: 0, cop: false, copId: 0, cam: false, saw: [] };
  const seq = crime ? (world.crimeSeq = (world.crimeSeq || 0) + 1) : 0;
  for (const e of world.query(x, y, Math.max(pedRange, 420), K.PED)) {
    if (e === perp || e.dead || e.pet || e.wild || (e.npc && e.npc.blind)) continue; // blind: the clerk being robbed doesn't count as a witness (nor do animals)
    if (!!e.sub !== !!(perp && perp.sub)) continue; // nobody up on the street sees into the subway (or vice versa)
    if (world.time < e.downUntil && e !== victim) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    const cop = isCop(e);
    const range = cop ? 420 * (night ? 0.75 : 1) * sight : pedRange;
    if (d > range) continue;
    if (e.npc) {
      if (e.npc.role === 'gang' || e.npc.archetype === 'drunk') continue;
      const facing = Math.abs(angleDiff(e.a, Math.atan2(y - e.y, x - e.x))) < (cop ? 1.4 : 1.3);
      if (!facing && !(loud && d < 220) && e !== victim) continue;
    }
    if (!sameTrain(e, perp) && !world.map.los(e.x, e.y, x, y)) continue;
    res.seen++;
    if (crime && e.player) { if (e.player !== (perp && perp.player)) res.saw.push(e.player); continue; }
    if (crime && e.npc && !cop && !reports(e, e === victim, tier, CRIMES[crime] ? CRIMES[crime].sev : 1, seq)) continue;   // saw it, kept quiet
    res.count++;
    if (cop) { res.cop = true; if (!res.copId && e.npc) res.copId = e.id; }
  }
  for (const c of world.map.cameras) {
    if (perp && perp.sub) break;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= c.r * camFactor && world.map.los(c.x, c.y, x, y)) {
      res.cam = true; res.count++;
      if (c.sec) res.secCam = true;
      world.emit(c.x, c.y, { e: 'camera', id: c.id });
    }
  }
  return res;
}

// Does this person call it in? (the same answer for the same person and crime, whatever else is going on)
function reports(e, victim, tier, sev, seq) {
  const n = e.npc, snitch = n.snitch ?? 1 + (hash2(e.id, 7, 4242) - 0.5) * 2 * WITNESS_SPREAD;
  const base = (WITNESS_REPORT[n.archetype] ?? 0.5) * (WITNESS_TIER[tier] ?? 1) * sev;
  const p = (victim ? Math.max(VICTIM_REPORT, base * 1.4) : base) * snitch;
  return hash2(e.id, seq, 4091) < p;
}

// ---- players who see a crime ---------------------------------------------------------------------------------------
// A player who sees one isn't counted as a witness: they're told, with a description of who did it (their clothes,
// the car if they were in one), and for SAW_S they can call it in from the phone (reportSaw). The call sends one squad
// car to where they are (police.js reportUnit), which looks for that suspect only: still about in the same clothes
// (or the same car), the officer knows them - stars by what they did, and the chase is on. A change of clothes throws
// it off; one call per REPORT_COOLDOWN_S per player.
const COLOURS = [['black', [24, 24, 28]], ['white', [236, 236, 236]], ['grey', [128, 128, 132]], ['red', [200, 38, 43]], ['maroon', [122, 29, 36]], ['orange', [239, 122, 26]],
  ['yellow', [242, 194, 27]], ['green', [47, 154, 58]], ['teal', [37, 184, 192]], ['blue', [35, 80, 200]], ['navy', [29, 42, 90]], ['purple', [122, 58, 200]],
  ['pink', [224, 74, 154]], ['brown', [107, 74, 42]], ['beige', [216, 196, 152]]];
export function colourName(hex) {
  let s = String(hex || '#888').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16) || 0, r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  let best = 'grey', bd = Infinity;
  for (const [name, [R, G, B]] of COLOURS) { const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < bd) { bd = d; best = name; } }
  return best;
}
// what someone is wearing, as a witness would put it, and the key a match is made on
export const outfitKey = (ped) => { const a = ped.app || {}; return [a.t, a.tc, a.l, a.ht || 0, a.ht ? a.htc : ''].join('|'); };
export const outfitText = (a) => { a = a || {}; return `${colourName(a.tc)} top, ${colourName(a.l)} trousers${a.ht ? `, a ${colourName(a.htc)} hat` : ''}`; };
function looks(world, ped) {
  const a = ped.app || {}, v = ped.vehId ? world.get(ped.vehId) : null;
  let d = outfitText(a);
  if (v && v.def) d += ` - in a ${colourName(PAINTS[v.paint] || '#888')} ${String(v.def.name || 'car').toLowerCase()}`;
  return { desc: d, key: outfitKey(ped), veh: v && v.def ? `${v.def.id}|${v.paint}` : null };
}
function sawCrime(world, q, perpP, type, x, y) {
  if (!q.ped || q.ped.dead) return;
  const now = world.time, L = looks(world, perpP.ped);
  q.saw = (q.saw || []).filter((s) => now - s.at < SAW_S && s.suspect !== perpP.pid);   // (the latest of what one person did)
  q.saw.push({ id: (world.sawSeq = (world.sawSeq || 0) + 1), type, label: CRIMES[type].label, suspect: perpP.pid, name: perpP.name, ...L, x: Math.round(x), y: Math.round(y), at: now });
  if (q.saw.length > 3) q.saw.shift();
  // one note now and then, not one a crime (the user, 2026-10-08): what you saw waits on the phone's home screen
  if (now - (q.sawNoteAt ?? -1e9) >= SAW_NOTE_S) { q.sawNoteAt = now; world.notify(q, 'You saw a crime. You can call it in from your phone for a minute.', 'warn'); }
  q.meDirty = true;
}
// the crimes a player saw that they can still call in
export function sawList(world, p) {
  const now = world.time;
  p.saw = (p.saw || []).filter((s) => now - s.at < SAW_S);
  return p.saw.map((s) => ({ id: s.id, label: s.label, name: s.name, desc: s.desc, left: Math.max(1, Math.round(SAW_S - (now - s.at))), done: !!s.reported }));
}
// calling it in: null, or why not
export function reportSaw(world, p, id, police) {
  const now = world.time, s = (p.saw || []).find((q) => q.id === Number(id));
  if (!s || now - s.at >= SAW_S) return 'Too late to call that in now.';
  if (s.reported) return 'You already called that in.';
  if (now - (p.lastReportAt || -1e9) < REPORT_COOLDOWN_S) return `You called the police a moment ago - give it ${Math.ceil(REPORT_COOLDOWN_S - (now - p.lastReportAt))} s.`;
  if (!p.ped || p.ped.dead) return 'Not right now.';
  const sp = world.players.get(s.suspect);
  if (sp && sp.wanted > 0) { s.reported = true; return null; }   // (they're already wanted: the police are on it)
  s.reported = true;
  p.lastReportAt = now;
  police.reportUnit(world, p, { ...s, x: p.ped.x, y: p.ped.y });
  world.notify(p, `911: "A unit is on its way to you. Stay where you are if you can."`, 'info');
  p.meDirty = true;
  return null;
}
// a unit found the suspect a player called in: they're wanted for it now (a small crime: the officer wants a word)
export function calledIn(world, sp, call, caller) {
  const spec = CRIMES[call.type];
  if (!spec || !sp.ped) return;
  if (spec.minor && !usual(sp)) { if (!soft(sp)) star(world, sp, call.type, sp.ped.x, sp.ped.y, 'witness'); }   // (on that star already: likely the same punches - no more of it)
  else {
    if (spec.felony) sp.profile.felonies++;
    addHeat(world, sp, spec.heat, sp.ped.x, sp.ped.y);
    logDispatch(world, call.type, sp.ped.x, sp.ped.y, sp, sp.wanted, 'witness');
    world.notify(sp, `${spec.label}: a witness called you in, and the police know your description!`, 'bad');
  }
  if (caller) { caller.profile.samaritan += 2; world.notify(caller, 'The police found the suspect you reported. +2 Samaritan', 'good'); caller.meDirty = true; }
  store.touch();
}

// ---- small crimes (task #405; the owner: "one punch with witnesses shouldn't bring a cop") ---------------------------
// What passers-by see of a small crime (CRIMES minor) builds a hidden suspicion, not heat: each counts 1, fading by one
// every SUSPICION_FADE_S once SUSPICION_HOLD_S go by without another, and SUSPICION_STAR of them make a star - one that
// brings an officer for a word (soft; stops.js). An officer who sees one: the star at once. On that star already, the
// next star is 2 - the usual chase. Wanted the usual way already, a small crime is heat like any other.
const usual = (p) => p.wanted > 0 && !soft(p);
export function suspicionOf(world, p) {
  const s = p.suspicion || 0, quiet = world.time - (p.suspicionAt ?? world.time) - SUSPICION_HOLD_S;
  return quiet > 0 ? Math.max(0, s - quiet / SUSPICION_FADE_S) : s;
}
function smallCrime(world, p, type, x, y, w) {
  const now = world.time;
  if (!w.cop) {
    p.suspicion = suspicionOf(world, p) + 1; p.suspicionAt = now;
    if (p.suspicion < SUSPICION_STAR - 1e-6) {
      const close = p.suspicion >= SUSPICION_STAR - 1;   // (one more and someone calls: always said)
      if (close || now - (p.suspicionMsgAt ?? -99) > 6) { p.suspicionMsgAt = now; world.notify(p, `${CRIMES[type].label} - people saw that${close ? ', and they\'re getting their phones out' : ''}.`, 'warn'); }
      p.meDirty = true;
      return false;
    }
  }
  star(world, p, type, x, y, w.cop ? 'officer' : w.cam ? 'camera' : 'witness', w.copId);
  return true;
}
// The star small crimes make: 1, the kind that brings an officer for a word (by: an NPC officer who saw it - theirs to deal
// with, stops.js); on that star already, 2 stars and the usual kind
export { star as smallStar };   // (dev.js: the debug menu's 1 star)
function star(world, p, type, x, y, via, by = 0) {
  const label = CRIMES[type].label;
  p.suspicion = 0;
  if (soft(p)) {
    addHeat(world, p, Math.max(0, STAR_HEAT[2] + 6 - p.heat), x, y);
    logDispatch(world, type, x, y, p, p.wanted, via);
    world.notify(p, `${label} again${via === 'officer' ? ', in front of the police' : ''} - now they're coming for you!`, 'bad');
    return;
  }
  addHeat(world, p, Math.max(0, STAR_HEAT[1] + 6 - p.heat), x, y);
  if (p.wanted !== 1) return;   // (a disguise blown: the old record's stars, the usual kind)
  p.soft = true; p.softSeq = (p.softSeq || 0) + 1;
  p.stopAt = { x, y, by };
  logDispatch(world, type, x, y, p, 1, via);
  world.notify(p, via === 'officer' ? `${label} - an officer saw that and wants a word with you.`
    : `${label} - ${via === 'camera' ? 'a camera caught that' : 'someone called the police'}. An officer's coming for a word.`, 'bad');
}

// Riders in the same train car see each other whatever the street around them is doing.
function sameTrain(a, b) { return !!(a && b && a.onTrain && b.onTrain && a.onTrain.t === b.onTrain.t && a.onTrain.c === b.onTrain.c); }
function canSee(world, e, ped) { return !!e.sub === !!ped.sub && (sameTrain(e, ped) || (ped.ug ? !!e.ug && ugLos(undergroundOf(world.map), e.x, e.y, ped.x, ped.y) : world.map.los(e.x, e.y, ped.x, ped.y))); }   // (underground: the tunnels' own walls - shared/underground.js)

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

  if (p.badge && type !== 'brandish') {
    // enforcer code of conduct: a few slips are forgiven (they expire after a while), then the
    // badge goes and the crime counts like anybody else's
    const n = addMisconduct(world, p, type);
    if (n <= MISCONDUCT_GRACE) {
      const left = MISCONDUCT_GRACE - n;
      world.notify(p, `Misconduct ${n}/${MISCONDUCT_GRACE}: ${spec.label}. ${left === 0 ? 'ONE MORE and you lose your badge!' : `${left + 1} more and you lose your badge.`}`, left === 0 ? 'bad' : 'warn');
      p.meDirty = true;
      store.touch();
      return;
    }
    goOffDuty(world, p, true);
    p.profile.firedUntil = Date.now() + FIRED_LOCKOUT_MS;
    p.profile.misconduct = [];
    world.notify(p, 'Too much misconduct - you have been FIRED from the force. Badge and uniform revoked.', 'bad');
  }
  if (p.badge && type === 'brandish') return;

  p.profile.criminalExp += Math.round(spec.heat / 2);
  store.touch();
  if (opts.silentCheck === false) { if (spec.felony) p.profile.felonies++; addHeat(world, p, spec.heat, x, y); logDispatch(world, type, x, y, p, p.wanted, 'tip'); return true; }
  const w = witnesses(world, x, y, ped, victim, (type === 'brandish' || type === 'murder') && !opts.quiet, type);
  for (const q of w.saw) sawCrime(world, q, p, type, x, y);
  if (w.count === 0) {
    if (now - (p.lastSilentMsg || 0) > 6) { p.lastSilentMsg = now; world.notify(p, `${spec.label} - ${w.seen ? 'people saw, but nobody is calling it in.' : 'nobody saw it.'}`, 'info'); }
    p.meDirty = true;
    return;
  }
  if (spec.minor && !usual(p)) return smallCrime(world, p, type, x, y, w);   // (a small crime: it adds up - task #405)
  if (spec.felony) p.profile.felonies++; // only crimes someone saw go on your record
  addHeat(world, p, spec.heat, x, y);
  logDispatch(world, type, x, y, p, p.wanted, w.cam ? 'camera' : w.cop ? 'officer' : 'witness');
  world.notify(p, `${spec.label} reported${w.cam ? (w.secCam ? ' by a security camera' : ' by a traffic camera') : w.cop ? ' by police' : ''}!`, 'bad');
  return true;   // (called in: robbery.js starts the heat growing)
}

export function addHeat(world, p, amount, x, y) {
  const now = world.time;
  const prof = p.profile;
  p.soft = false;   // (heat from anything but small crimes: the usual chase - star() makes a small crime's star soft again)
  if (p.disguised && prof.peakWanted > 0) {
    // GDD: a minor infraction in disguise spikes heat straight back to the cached peak
    p.heat = Math.max(p.heat, STAR_HEAT[prof.peakWanted]);
    p.disguised = false;
    world.notify(p, `Disguise blown! Your ${prof.peakWanted}-star record was recognized.`, 'bad');
  }
  p.heat = Math.min(STAR_HEAT[5] + 60, p.heat + amount);
  const before = p.wanted;
  p.wanted = Math.min(5, starsForHeat(p.heat));
  if (p.wanted >= 3 && before < p.wanted) events.feed(world, { kind: 'wanted', text: `Police hunting ${p.name}: ${'★'.repeat(p.wanted)}`, x, y });
  p.flareUntil = now + 3;
  if (p.ped) p.ped.flareUntil = now + 3;
  p.lastSeenX = x; p.lastSeenY = y; p.seenAt = now; p.searchR = 60;
  if (p.wanted > prof.peakWanted) { prof.peakWanted = p.wanted; }
  prof.peakWantedAt = Date.now();
  p.faction = FACTION.CRIMINAL;
  if (p.wanted >= 4) p.cityBounty = Math.max(p.cityBounty || 0, 500 * p.wanted);
  bounties.sync(world, p);
  if (p.hunter && p.wanted > 0) { p.hunter = false; world.notify(p, 'Bounty Hunter license suspended while wanted.', 'bad'); }
  p.meDirty = true;
  store.touch();
}

export function clearWanted(world, p) {
  p.heat = 0; p.wanted = 0; p.flareUntil = 0; p.searchR = 0; p.cityBounty = 0; p.soft = false; p.suspicion = 0;
  bounties.sync(world, p);
  p.faction = p.badge ? FACTION.ENFORCER : FACTION.CITIZEN;
  p.meDirty = true;
}

// ---------------------------------------------------------------------------
export function onDamage(world, attacker, victim, amount, cause) {
  if (!attacker || attacker === victim) return;
  const now = world.time;
  victim.aggressors.set(attacker.id, now);
  // who started it, between two players (bounties.js selfDefence): a blow that isn't hitting back
  if (attacker.player && victim.player) { const back = attacker.aggressors.get(victim.id); if (back === undefined || now - back >= 60) (attacker.started ||= new Map()).set(victim.id, now); }
  if (!attacker.player || cause === 'vehicle') return;
  if (victim.hp <= 0) return; // a lethal hit is reported (or not) as the killing itself
  attacker.recentAssault = attacker.recentAssault || new Map();
  const last = attacker.recentAssault.get(victim.id) || -99;
  if (now - last < 5) return;
  attacker.recentAssault.set(victim.id, now);
  // bare fists (a punch, a shove) are a small crime; a weapon, a gun or an officer is as ever
  const wpn = WEAPONS[attacker.weapon], fist = cause === 'melee' && (!wpn || wpn.id === 'fists');
  crime(world, attacker, isCop(victim) ? 'copAssault' : fist ? 'punch' : 'assault', victim, victim.x, victim.y, { quiet: !!attacker.quietWeapon });
}

export function onKill(world, attacker, victim, cause) {
  if (!attacker || !attacker.player || attacker === victim) return;
  const p = attacker.player, vp = victim.player;
  // a kill towards a revenge bounty (bounties.js): not a wanted or marked victim, not police work, not self-defence
  const counts = !!vp && !isFlagged(world, victim) && !p.badge && !bounties.selfDefence(world, attacker, victim);
  const type = cause === 'vehicle' ? 'vehKill' : (isCop(victim) ? 'copMurder' : 'murder');
  attacker.recentAssault?.set(victim.id, world.time);
  // (the crime first: dropping a bounty target is no murder - GDD §4C immunity - even when it's the last bounty on them)
  crime(world, attacker, type, victim, victim.x, victim.y, { quiet: !!attacker.quietWeapon && cause !== 'vehicle' });
  if (vp) { bounties.collect(world, p, vp, 'kill'); if (counts) bounties.noteKill(world, p, vp); }
}

export function gunfire(world, ped, hitSomeone) {
  if (!ped.player || hitSomeone || ped.player.badge) return;
  const w = WEAPONS[ped.weapon];
  if (w && w.hunting && wildStyle(world.map, ped.x, ped.y)) return;   // a hunter's shot out in the open country is no crime
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

// A player's weapon damaging a vehicle (combat.js: a swing at it, the plasma blade's cut, a bullet, an arrow): someone
// else's is a crime when it's seen - vandalism when it's empty, an assault on whoever's in it (an officer's: assaulting
// an officer). Your own (owned, rented, issued; a police car on duty) is nobody's business. Its driver reacts (npc.js
// onVehicleHit).
export function vehicleDamaged(world, attacker, v) {
  if (!attacker || !attacker.player || !v || v.wreckAt || v.ferry || attacker.vehId === v.id) return false;
  const p = attacker.player;
  if (v.owner === p.pid || v.rentedBy === p.pid || v.issuedTo === p.pid || (v.motorPool !== undefined && p.badge)) return false;
  let victim = null;
  for (const id of v.seats) { const e = id ? world.get(id) : null; if (e && !e.dead) { victim = e; break; } }   // (the driver first)
  const now = world.time, key = victim ? victim.id : -v.id;
  attacker.recentAssault ||= new Map();
  if (now - (attacker.recentAssault.get(key) ?? -99) < VEH_CRIME.repeatS) return false;
  attacker.recentAssault.set(key, now);
  crime(world, attacker, victim ? (isCop(victim) ? 'copAssault' : 'assault') : 'vandalism', victim, v.x, v.y, { quiet: !!attacker.quietWeapon });
  return true;
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
    if (p.wanted > 0 && !p.custody) {   // (cuffed: the police have them - custody.js)
      let seen = false;
      const sight = sightFactor(world.map, ped.x, ped.y, !ped.vehId);
      if (!ped.hidden) for (const e of world.query(ped.x, ped.y, SIGHT_PX * sight, K.PED)) {
        if (!isCop(e) || e.dead || e === ped) continue;
        if (canSee(world, e, ped)) { seen = true; break; }
      }
      if (!seen && !ped.hidden && !ped.sub && world.tick % 10 === 0) {
        for (const c of world.map.cameras) {
          if (Math.hypot(c.x - ped.x, c.y - ped.y) < c.r * (world.clock.isNight ? 0.75 : 1) && world.map.los(c.x, c.y, ped.x, ped.y)) {
            seen = true; world.emit(c.x, c.y, { e: 'camera', id: c.id });
            if (now - (p.lastCamPing || -99) > 8) { p.lastCamPing = now; world.notify(p, c.toll ? 'A bridge toll camera logged you crossing - the police know where you are!' : 'Traffic camera pinged your position to the Police Network!', 'bad'); }
          }
        }
      }
      // out past the map's edge there's nowhere to hide: the harbour patrol has you on radar (border.js)
      if (!seen && !ped.hidden && edgeInfo(ped.x, ped.y, EDGE_I).d > 0) {
        seen = true;
        if (now - (p.lastEdgePing || -99) > 15) { p.lastEdgePing = now; world.notify(p, 'The harbour patrol has you on radar out here - the police know where you are.', 'bad'); }
      }
      if (seen) { p.seenAt = now; p.lastSeenX = ped.x; p.lastSeenY = ped.y; p.searchR = 60; }
      const unseen = now - p.seenAt;
      // a star from small crimes: it holds while an officer's on the way for a word or looking round for you, and once
      // they're done with you (let you go, gave up) it fades, seen or not (stops.js)
      const done = soft(p) && !p.stop && p.stopDone === p.softSeq;
      if ((unseen > 3 || done) && !p.stop) {
        // out in the wilds the trail goes cold faster: the search spreads wider and heat cools quicker
        const wild = sight < 1;
        p.searchR = Math.min(wild ? 1500 : 1100, p.searchR + (wild ? 42 : 28) * dt);
        const rate = (unseen > 20 ? 2.4 : 1.2) * (wild ? WILD_COOL : 1);
        p.heat = Math.max(0, p.heat - rate * dt);
        const stars = starsForHeat(p.heat);
        if (stars < p.wanted) {
          p.wanted = stars;
          p.meDirty = true;
          if (stars === 0) { clearWanted(world, p); world.notify(p, done ? 'The police let it go. Wanted level cleared.' : 'You lost the cops. Wanted level cleared.', 'good'); }
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
  if (p.badge && p.ped) {
    // NPC muggers on the run (and whoever started a street fight), only while an officer (you) can actually see them
    for (const e of world.query(p.ped.x, p.ped.y, 900, K.PED)) {
      if (!e.npc || e.dead || !((e.npc.flagged && e.npc.role === 'mugger') || brawling(world, e))) continue;
      if (world.map.los(p.ped.x, p.ped.y, e.x, e.y)) out.push({ k: 'wanted', x: Math.round(e.x), y: Math.round(e.y), s: 1 });
    }
    for (const q of world.players.values()) {
      if (q === p || q.wanted <= 0 || !q.ped) continue;
      if (now - q.seenAt < 3) out.push({ k: 'wanted', x: Math.round(q.ped.x), y: Math.round(q.ped.y), s: q.wanted });
      else out.push({ k: 'search', x: Math.round(q.lastSeenX), y: Math.round(q.lastSeenY), r: Math.round(q.searchR), s: q.wanted, f: Math.max(0.15, q.heat / 160) });
    }
  }
  bounties.radar(world, p, out);   // the targets of your contracts (and the city's bounties: hunters, officers)
  return out;
}

// ---------------------------------------------------------------------------
// Arrests need the suspect knocked out: floored by a combo, tased, tackled, run down - or dead.
// The officer still has to walk up and cuff them (or book the body).
export function arrestable(world, e) {
  const now = world.time;
  if (e.vehId || e.cuffed || (e.player && e.player.custody)) return false;
  if (e.dead) return !!(e.bookable || (e.npc && e.npc.flagged && e.npc.role !== 'gang'));
  if (!isFlagged(world, e) || (e.npc && e.npc.role === 'gang')) return false;
  return now < e.downUntil || now < e.stunUntil || !!e.passedOut;
}
export function arrestTarget(world, p) {
  const ped = p.ped;
  let best = null, bd = 52;
  for (const e of world.query(ped.x, ped.y, 52, K.PED)) {
    if (e === ped || !arrestable(world, e)) continue;
    const d = Math.hypot(e.x - ped.x, e.y - ped.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Officer (or anyone hunting a wanted suspect) puts a suspect on the floor: they stay out long
// enough for the arrest walk-up.
export function subdue(world, by, target) {
  if (!by || !target || target.dead) return;
  const p = by.player;
  if (!p || !(p.badge || p.hunter) || !isFlagged(world, target)) return;
  target.downUntil = Math.max(target.downUntil || 0, world.time + SUBDUE_S);
  target.subduedBy = by.id;
}
export function isSuspectFor(world, p, e) { return isFlagged(world, e) && !(e.npc && e.npc.role === 'gang') && e !== p.ped && !e.cuffed; }

// Criminals an officer can see right now (ids for the subtle overhead marker).
export function suspectsFor(world, p) {
  if (!p.badge || !p.ped) return null;
  const out = [];
  for (const e of world.query(p.ped.x, p.ped.y, 900, K.PED)) {
    if (e === p.ped || (e.dead && !e.bookable)) continue;
    if (!e.dead && !isSuspectFor(world, p, e)) continue;
    if (e.dead && !e.bookable && !(e.npc && e.npc.flagged)) continue;
    if (!world.map.los(p.ped.x, p.ped.y, e.x, e.y)) continue;
    out.push(e.id);
    if (out.length >= 24) break;
  }
  return out;
}

function bookBody(world, cop, body) {
  const now = world.time;
  const b = body.bookable;
  if (body.player && revive.isDowned(body)) { revive.finish(world, body, cop, 'bust'); body.player.downWanted = null; } // booked while down: a bust, no revive
  world.emit(body.x, body.y, { e: 'poof', x: body.x, y: body.y });
  if (b) {
    const t = world.players.get(b.pid);
    if (t) {
      const fine = Math.min(t.profile.cash, 150 * b.stars);
      t.profile.cash -= fine;
      for (const id of ['smg', 'rocket']) if (t.profile.weapons[id] !== undefined) delete t.profile.weapons[id];
      for (const id of Object.keys(t.profile.inventory || {})) if (ITEMS[id] && ITEMS[id].illegal) delete t.profile.inventory[id];   // (ghostglass caps)
      world.notify(t, `Your body was booked by ${cop && cop.player ? cop.player.name : 'the police'}: fined $${fine}, illegal weapons confiscated.`, 'bad');
      t.meDirty = true;
    }
  }
  phone.onCriminalStopped(world, cop, body);
  if (body.player) { body.bookable = null; } else { world.bodies.delete(body); world.remove(body); }
  if (cop && cop.player) {
    const stars = b ? b.stars : 1;
    const reward = b ? 75 * stars : 30;
    cop.player.profile.cash += reward;
    cop.player.profile.stats.arrests++;
    if (cop.player.badge) addPolicePts(world, cop.player, b ? 5 * stars : 2);
    world.notify(cop.player, `Suspect's body booked. +$${reward}`, 'good');
    cop.player.meDirty = true;
  }
  void now;
  store.touch();
}

// Cuffing someone. A wanted player is taken into custody (custody.js: held, walked to a car, driven to the station and
// booked - the fine and the confiscations come in the cell); someone with a price on their head but nothing on their
// record is taken in for questioning and let go. The arresting player is paid on the cuffs. No cop: turning yourself in
// (unstuck.js surrender) - straight to the cells.
export function arrest(world, cop, target) {
  if (target.dead) { bookBody(world, cop, target); return; }
  if (target.player) {
    const t = target.player;
    if (t.custody) return;
    if (t.wanted <= 0) { questioned(world, cop, target); return; }
    t.soft = false;   // (cuffed: custody.js has them, and the police treat it as they always have)
    const stars = Math.max(1, t.wanted);
    if (cop && cop.player) {
      const reward = ARREST_REWARD_PER_STAR * stars;
      bounties.collect(world, cop.player, t, 'arrest');
      cop.player.profile.cash += reward;
      cop.player.profile.samaritan += 5 * stars;
      cop.player.profile.stats.arrests++;
      if (cop.player.badge) addPolicePts(world, cop.player, 10 * stars);
      world.notify(cop.player, `Arrested ${t.name}! +$${reward}, +${5 * stars} Samaritan`, 'good');
      cop.player.meDirty = true;
    }
    if (cop) custody.start(world, t, cop); else custody.surrender(world, t);
    store.touch();
  } else {
    // NPC suspect taken into custody (a mugger still holding the purse drops it first)
    if (target.npc && target.npc.hasPurse) npc.onMuggerDowned(world, target);
    phone.onCriminalStopped(world, cop, target);
    world.emit(target.x, target.y, { e: 'poof', x: target.x, y: target.y });
    cells.lockUp(world, target);   // (they do their time in the nearest station's cells: cells.js)
    world.remove(target);
    if (cop && cop.player) {
      cop.player.profile.cash += 60; cop.player.profile.samaritan += 4;
      if (cop.player.badge) addPolicePts(world, cop.player, 4);
      world.notify(cop.player, 'Suspect taken into custody. +$60, +4 Samaritan', 'good');
      cop.player.meDirty = true;
    }
  }
}
// Not wanted, only a price on their head: questioned at the nearest station and let go (the officer collects any contract
// they took on them).
function questioned(world, cop, target) {
  const t = target.player, now = world.time;
  if (cop && cop.player) { bounties.collect(world, cop.player, t, 'arrest'); cop.player.meDirty = true; }
  const st = custody.nearestStation(world, target.x, target.y);
  if (target.vehId) target.vehId = 0;
  if (st) { target.x = st.x; target.y = st.y; target.vx = 0; target.vy = 0; world.place(target); t.teleportAt = now; }
  target.stunUntil = now + 1; target.downUntil = 0;
  world.notify(t, `Taken in for questioning${cop && cop.player ? ' by ' + cop.player.name : ''} and let go.`, 'info');
  t.meDirty = true;
}

export function goOnDuty(world, p) {
  const prof = p.profile;
  if (p.badge) return 'You are already on duty.';
  if (p.wanted > 0) return 'Wanted suspects cannot pick up a badge.';
  if (Date.now() < (prof.firedUntil || 0)) return 'You were fired recently. Come back later.';
  if (prof.felonies > 0) return `Applicants need an unblemished felony record (you have ${prof.felonies}).`;
  if (prof.gang) return 'Known Syndicate members can\'t join the force - leave the gang first.';
  if (prof.samaritan < ENFORCER_MIN_SAMARITAN && !p.dev) return `You need ${ENFORCER_MIN_SAMARITAN} Good Samaritan Points (you have ${prof.samaritan}).`;
  p.badge = true; p.hunter = false;
  p.faction = FACTION.ENFORCER;
  p.civvies = p.ped.app;
  // the uniform by rank (CC5), on their own body, face and hair (shared/look.js policeLook)
  const mine = prof.look ? decodeLook(prof.look) : null;
  p.ped.app = mine ? lookToApp(policeLook(mine, policeRank(prof))) : { ...p.ped.app, lk: undefined, t: 6, tc: '#1d2a5a', tc2: '#f2c21b', l: '#1d2a5a', ht: 1, htc: '#1d2a5a' };
  p.ped.appVer = (p.ped.appVer || 0) + 1;
  prof.weapons.taser = prof.weapons.taser ?? 0;
  prof.weapons.baton = prof.weapons.baton ?? 0;
  prof.weapons.spikes = prof.weapons.spikes ?? 0;
  if (prof.weapons.service === undefined || prof.weapons.service < SERVICE_AMMO) { prof.weapons.service = SERVICE_AMMO; p.ped.mag.service = SERVICE_MAG; }
  p.ped.weapon = 'service';
  p.meDirty = true;
  store.touch();
  return null;
}

// Department-issued gear: handed out on duty, handed back off duty (or lost on death).
const DEPT_GEAR = () => ['taser', 'baton', ...Object.keys(WEAPONS).filter((id) => WEAPONS[id].police)];
export function stripPoliceGear(p) {
  for (const id of DEPT_GEAR()) { delete p.profile.weapons[id]; if (p.ped) delete p.ped.mag[id]; }
  if (p.ped && DEPT_GEAR().includes(p.ped.weapon)) p.ped.weapon = 'fists';
  p.meDirty = true;
}
export function restockService(world, p) {
  if (!p.badge) return 'On-duty officers only.';
  const prof = p.profile;
  const have = prof.weapons.service ?? 0;
  if (have >= SERVICE_AMMO && p.ped.mag.service >= SERVICE_MAG) return 'Your service pistol is already fully stocked.';
  prof.weapons.service = Math.max(have, SERVICE_AMMO);
  p.ped.mag.service = SERVICE_MAG;
  world.notify(p, `Armory: service pistol restocked (${SERVICE_AMMO} rounds).`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}

export function goOffDuty(world, p, fired = false) {
  if (!p.badge) return;
  p.badge = false;
  p.faction = FACTION.CITIZEN;
  if (p.civvies && p.ped) { p.ped.app = p.civvies; p.ped.appVer = (p.ped.appVer || 0) + 1; }
  stripPoliceGear(p);
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
