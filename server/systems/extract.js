// Extraction payouts (docs/PROGRESSION.md "Extraction and scheduled events"): the big money is in carrying valuables
// across town in the open. The valuable crates - an event's (calendar.js: the armored truck run's carbon-gold, the dock
// shipment's steel and iron), an armored truck's (streetlife.js), a bank vault's (heist.js) - carry
//   c.extract = { src: 'armored' | 'vault' | 'dock' | 'stash', stolen (taken from someone: the police bring it back),
//                 ev (the calendar event's key, or null), from { x, y } (where it was put in play), by (who last picked it up) }
// and pay only when they're delivered (rules.js CRATE_PAY by tier, EXTRACT):
//   - a fence or the black market: the whole payout into your bank, Criminal EXP - not for an officer on duty;
//   - a bank: an honest hauler (not wanted) hands it in to the vault for `vault` of it, clean, a few Samaritan points;
//   - an officer or a licensed bounty hunter bringing a stolen one back to a bank or a police station: the recovery
//     reward (`recover`), Samaritan points, an officer service points;
//   - your own home: into the stash (profile.stash.crates, up to stashMax), kept through a death or an arrest, taken out
//     again from the home's menu at the door.
// A bank or a police station pays only once the crate has come minTripPx from where it was put in play (no handing in a
// vault's crate at its own counter). Lost on the way - in the water, blown up, cleared away - it's a payout lost: its
// carrier is told, and a carbon-gold case's loss is in the city feed.
// Visibility (the owner accepted the default): a carbon-gold crate on the move - carried, on a vehicle, an event's even
// lying in the road - and a calendar armored truck still carrying its gold show on every player's map, position only
// (k 'gold'); steel and iron show only to the players in the net-culling chunks round them (their own and the eight about
// it: k 'cargo'). The server decides who's sent what (visibleTo; events.forPlayer adds it to `me.happen`).
import { K, CHUNK_PX } from '../../shared/constants.js';
import { CRATE_PAY, EXTRACT } from '../../shared/rules.js';
import { store } from '../store.js';
import * as events from './events.js';
import * as law from './law.js';
import * as homes from './homes.js';
import * as jobs from './jobs.js';

export const TIER_WORD = ['crate', 'wood box', 'steel barrel', 'iron vault', 'carbon-gold case'];
const MIN_TRIP_PX = 600;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

// What delivering crate c at `place` ('fence' | 'vault' (a bank) | 'police' | 'home') pays player p:
// { kind: 'fence' | 'vault' | 'recover' | 'stash', bank, sam, xp, pts } - or null: not taken there, not from them.
export function payout(c, p, place) {
  const x = c && c.extract;
  if (!x) return null;
  const base = c.value || CRATE_PAY[c.tier] || 0, wanted = (p.wanted || 0) > 0, law_ = !!(p.badge || p.hunter);
  if (place === 'fence') {
    if (p.badge) return null;   // (an officer on duty brings it in)
    const g = Math.round(base * EXTRACT.fence);
    return { kind: 'fence', bank: g, sam: 0, xp: Math.round(g / EXTRACT.xpPer), pts: 0 };
  }
  if (place === 'vault' || place === 'police') {
    if (wanted) return null;
    if (x.stolen && law_) return { kind: 'recover', bank: Math.round(base * EXTRACT.recover), sam: EXTRACT.recoverSam, xp: 0, pts: p.badge ? EXTRACT.recoverPts : 0 };
    if (place === 'vault') return { kind: 'vault', bank: Math.round(base * EXTRACT.vault), sam: EXTRACT.vaultSam, xp: 0, pts: 0 };
    return null;
  }
  if (place === 'home') return { kind: 'stash', bank: 0, sam: 0, xp: 0, pts: 0 };
  return null;
}

const tripOk = (c) => { const f = c.extract && c.extract.from; return !f || Math.hypot(c.x - f.x, c.y - f.y) >= MIN_TRIP_PX; };
const stashOf = (prof) => { const st = (prof.stash ||= { items: {}, weapons: {} }); st.crates ||= []; return st; };

// The action button while carrying a valuable crate (jobs.deliveryZoneFor asks first): { label, run } or null
export function zone(world, p, crate) {
  if (!crate || !crate.extract || !p.ped) return null;
  const ped = p.ped, R = EXTRACT.reach, word = TIER_WORD[crate.tier] || 'crate';
  const near = (kinds) => world.map.pois.find((q) => kinds.includes(q.kind) && Math.hypot(q.x - ped.x, q.y - ped.y) < R);
  if (near(['fence', 'smuggler'])) {
    const r = payout(crate, p, 'fence');
    if (r) return { label: `Fence the ${word} (+${money(r.bank)} to your bank)`, run: () => deliver(world, p, crate, 'fence') };
  }
  const bank = near(['bank']), cop = !bank && near(['police', 'evidence']);
  if (bank || cop) {
    const place = bank ? 'vault' : 'police', r = payout(crate, p, place);
    if (r && !tripOk(crate)) return { label: `The ${word} has to come from somewhere else first`, run: () => {} };
    if (r) return { label: r.kind === 'recover' ? `Return the stolen ${word} (+${money(r.bank)} reward, +${r.sam} Samaritan)` : `Hand the ${word} in to the bank vault (+${money(r.bank)}, clean)`, run: () => deliver(world, p, crate, place) };
    if (bank && (p.wanted || 0) > 0) return { label: 'The bank won\'t take it from someone wanted', run: () => {} };
  }
  const h = homes.ownedHomes(world, p.profile).find((q) => { const d = homes.homePoi(world, q) || q; return Math.hypot(d.x - ped.x, d.y - ped.y) < R; });
  if (h) {
    const n = stashOf(p.profile).crates.length;
    if (n >= EXTRACT.stashMax) return { label: `Your stash is full (${n} crates)`, run: () => {} };
    return { label: `Stash the ${word} at home (${n + 1}/${EXTRACT.stashMax})`, run: () => deliver(world, p, crate, 'home') };
  }
  return null;
}

// Delivered: paid (or stashed) and gone. -> the payout, or null if it doesn't go there
export function deliver(world, p, crate, place) {
  const r = payout(crate, p, place), ped = p.ped, prof = p.profile;
  if (!r || !ped || ped.carrying !== crate.id) return null;
  const word = TIER_WORD[crate.tier] || 'crate';
  ped.carrying = 0;
  crate.extract.done = r.kind;
  const kept = world.extractLive && world.extractLive.get(crate.id);
  if (kept) kept.done = r.kind;   // (not lost: update)
  world.remove(crate);
  p.meDirty = true;
  if (r.kind === 'stash') {
    stashOf(prof).crates.push({ t: crate.tier, v: crate.value, s: crate.extract.stolen ? 1 : 0, l: crate.label || '' });
    world.notify(p, `The ${word} is in your stash at home - safe. Take it out from the home's menu when you're ready to cash it in.`, 'good');
    store.touch();
    return r;
  }
  prof.bank += r.bank;
  if (r.sam) prof.samaritan = (prof.samaritan || 0) + r.sam;
  if (r.xp) prof.criminalExp = (prof.criminalExp || 0) + r.xp;
  if (r.pts) law.addPolicePts(world, p, r.pts);
  if (r.kind !== 'fence') prof.stats.deliveries = (prof.stats.deliveries || 0) + 1;
  world.emit(ped.x, ped.y, { e: 'cash', x: ped.x, y: ped.y });
  world.notify(p, r.kind === 'fence' ? `Fenced: ${money(r.bank)} wired to your bank. +${r.xp} Criminal EXP.`
    : r.kind === 'recover' ? `Recovered: the stolen ${word} is back. ${money(r.bank)} reward to your bank, +${r.sam} Samaritan.`
      : `The bank took the ${word} into its vault: ${money(r.bank)} to your bank, +${r.sam} Samaritan.`, 'good');
  if (crate.tier === 4) events.feed(world, { kind: 'cargo', text: r.kind === 'fence' ? 'A carbon-gold case was fenced' : 'A carbon-gold case is back in a bank vault', x: ped.x, y: ped.y });
  store.touch();
  return r;
}

// ---- the stash's crates: put there by a delivery (or a reward: stashCrate), taken out at the home's door ------------
export function stashCrate(prof, tier, opts = {}) {
  const st = stashOf(prof);
  if (st.crates.length >= EXTRACT.stashMax) return false;
  st.crates.push({ t: tier, v: opts.value ?? CRATE_PAY[tier], s: opts.stolen ? 1 : 0, l: opts.label || '' });
  store.touch();
  return true;
}
// the home menu's options for the crates in the stash (economy.js: at your home's door, outside)
export function homeOpts(p, opts) {
  const st = p.profile.stash;
  if (!st || !st.crates || !st.crates.length || !p.ped || p.ped.carrying) return;
  st.crates.forEach((c, i) => opts.push({ id: `htc:${i}`, label: `Take out the ${TIER_WORD[c.t] || 'crate'}`, note: `stash · ${money(c.v)}` }));
}
// one out of the stash, into your arms at the door
export function takeOut(world, p, i) {
  const st = p.profile.stash, ped = p.ped;
  const c = st && st.crates && st.crates[i];
  if (!c) return 'Not in your stash.';
  if (!ped || ped.dead || ped.vehId || ped.carrying) return 'Your hands have to be free.';
  st.crates.splice(i, 1);
  const crate = world.spawnCrate(c.t, ped.x, ped.y, { contraband: !!c.s, label: c.l, value: c.v, owner: p.pid });
  crate.extract = { src: 'stash', stolen: !!c.s, ev: null, from: { x: ped.x, y: ped.y }, by: p.pid };
  crate.state = 'carried'; crate.parent = ped.id; crate.z = 10;
  ped.carrying = crate.id;
  p.meDirty = true;
  store.touch();
  world.notify(p, `You've got the ${TIER_WORD[c.t] || 'crate'} - it pays only once it's delivered.`, 'info');
  return null;
}

// ---- in play: the markers, and the crates lost ------------------------------------------------------------------------
const carrierOf = (world, c) => (c.state === 'carried' || c.state === 'loaded' ? c.parent : 0);
export function update(world) {
  if (world.tick % 10 !== 4) return;
  const was = world.extractLive || new Map(), live = new Map(), marks = [];
  for (const e of world.entities.values()) {
    if (e.kind !== K.CRATE || e.removed) continue;
    const moving = e.state === 'carried' || e.state === 'loaded';
    if (!e.extract && !(e.tier === 4 && moving)) continue;
    if (e.extract) live.set(e.id, { tier: e.tier, by: e.extract.by || null, ev: e.extract.ev, x: e.x, y: e.y });
    if (e.tier < 2 || e.litter || e.heavy) continue;
    const all = e.tier === 4 && (moving || !!(e.extract && e.extract.ev));
    marks.push({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), all, carrier: carrierOf(world, e) });
  }
  // the calendar's armored trucks with their gold still aboard
  for (const ev of (world.street && world.street.live) || []) {   // (streetlife.js's live ones - not imported: jobs.js imports this)
    if (!ev.sched || ev.spilled || !ev.load.some((t) => t === 4)) continue;
    const van = world.get(ev.van);
    if (van && !van.removed) marks.push({ id: `v${van.id}`, x: Math.round(van.x), y: Math.round(van.y), all: true, carrier: van.id });
  }
  // lost: gone without being delivered
  for (const [id, c] of was) {
    if (live.has(id)) continue;
    const e = world.get(id);
    if (e && !e.removed) { live.set(id, c); continue; }
    if (c.done) continue;
    lost(world, c);
  }
  world.extractLive = live;
  world.extractMarks = marks;
}
function lost(world, c) {
  const p = c.by && world.players.get(c.by);
  if (p) world.notify(p, `The ${TIER_WORD[c.tier] || 'crate'} you had is gone - and its payout with it.`, 'bad');
  if (c.tier === 4) events.feed(world, { kind: 'cargo', text: 'A carbon-gold case was lost on the way', x: c.x, y: c.y });
}

// What player p is shown of them: [{ id, k: 'gold' | 'cargo', x, y }]
export function visibleTo(world, p) {
  const L = world.extractMarks, ped = p.ped;
  if (!L || !L.length || !ped) return [];
  const pcx = Math.floor(ped.x / CHUNK_PX), pcy = Math.floor(ped.y / CHUNK_PX), out = [];
  for (const m of L) {
    if (m.carrier && (m.carrier === ped.id || m.carrier === ped.vehId)) continue;   // (your own)
    if (!m.all && (Math.abs(Math.floor(m.x / CHUNK_PX) - pcx) > 1 || Math.abs(Math.floor(m.y / CHUNK_PX) - pcy) > 1)) continue;
    out.push({ id: `x${m.id}`, k: m.all ? 'gold' : 'cargo', x: m.x, y: m.y });
  }
  return out;
}
events.setCargoMarks(visibleTo);
jobs.setExtractZone(zone);   // (jobs.deliveryZoneFor asks this first for a valuable crate)
