// District reputation (docs/PROGRESSION.md, "Visible consequences and identity"; build order item 5): each player has a
// standing in each district of the map (World v3's districts, by name: map.districtAt), from feared to loved, saved with
// the account - profile.rep: { [district name]: { s (standing, -100..100), r (shops robbed there), o (offenses seen
// there), t (when it was last settled, ms), v (when a passer-by last vouched for you there, ms) } } (absent on older
// profiles: nothing yet, everywhere Neutral; the progress epoch's reset clears it with the rest). Nothing ticks over all
// players: each entry fades toward neutral by the clock when it's next read (settle - rules.js REPUTATION's fade rates).
//   in:  a shop robbed there (robbery.js start -> robbed), a crime someone saw there (law.js crime -> crimeSeen), the
//        Samaritan points you earn there (update: whatever raised them, the rise is credited where you stand), owning a
//        home or a business there (a standing bonus while you own it, worked out from what you own - not saved)
//   out: the shops' prices and refusal (economy.js buildMenu -> adjustMenu), a clerk pulling a shotgun (robbery.js ->
//        shotgun), the police knowing a repeat offender on sight (law.js update -> knownOffender), a witness who vouches
//        for you once (law.js crime -> vouch), and what people round you do (update: passers-by stepping out of the way
//        of someone feared, gang members' nods, a small-time crook's respect money, a wave or a thank-you for a
//        Samaritan, an owner's neighbors' hello) - the page only shows the 'say' bubbles it's sent; the phone's Skills app
//        lists your standing by district (panel).
// The storefront sign with an owner's name is not here: shop signs are baked into the art (a new bake), so it waits.
import { K, T, TILE } from '../../shared/constants.js';
import { WATER_D, PED_BLOCK } from '../../shared/mapcore.js';
import { REPUTATION as R } from '../../shared/rules.js';
import { hash2, mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import * as biz from './biz.js';

const DAY_MS = 86400000;
const rng = mulberry32(4471);
const clamp = (v) => Math.max(R.min, Math.min(R.max, v));
const toward0 = (v, d) => (v > 0 ? Math.max(0, v - d) : Math.min(0, v + d));

// ---- the numbers ------------------------------------------------------------------------------------------------------
// An entry faded to `now` (ms): the standing toward 0 (the bad side by fadeBad a day, the good by fadeGood), the robs and
// offenses down toward 0. Pure: the tests drive it with their own clock.
export function settle(e, now = Date.now()) {
  const days = Math.max(0, (now - (e.t ?? now)) / DAY_MS);
  if (days > 0) {
    e.s = toward0(e.s || 0, (e.s < 0 ? R.fadeBad : R.fadeGood) * days);
    e.r = Math.max(0, (e.r || 0) - R.fadeRobs * days);
    e.o = Math.max(0, (e.o || 0) - R.fadeOffenses * days);
  }
  e.t = now;
  return e;
}
// a standing as the phone's word
export function word(s) {
  const W = R.words;
  return s <= W.feared ? 'Feared' : s <= W.disliked ? 'Disliked' : s < W.liked ? 'Neutral' : s < W.loved ? 'Liked' : 'Loved';
}
// what a shop charges (x its price) someone robbed there r times, standing s - null: they won't serve you
export function priceMul(r, s) {
  const S = R.shops, n = Math.floor(r + 0.01);
  if (n >= S.refuse) return null;
  if (n >= 1) return S.markup[Math.min(n, S.markup.length - 1)];
  const w = word(s);
  return w === 'Loved' ? S.loved : w === 'Liked' ? S.liked : 1;
}

// ---- a player's entries -----------------------------------------------------------------------------------------------
// the district at (x, y) - null at sea or past the map
export function districtOf(world, x, y) {
  const m = world.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!m || !m.inside(tx, ty)) return null;
  const D = m.districtAt(x, y);
  return D && D.id !== WATER_D ? D : null;
}
// a district's entry, settled to now (made when `make`; else a zero one, not kept)
function entry(prof, name, make = false, now = Date.now()) {
  const all = prof.rep || (make ? (prof.rep = {}) : null);
  let e = all && all[name];
  if (!e) { e = { s: 0, r: 0, o: 0, t: now }; if (make) all[name] = e; return e; }
  return settle(e, now);
}
// a nudge to someone's standing where (x, y) is: { s, r, o } added
function bump(world, p, x, y, d) {
  const D = districtOf(world, x, y);
  if (!D || !p || !p.profile) return null;
  const e = entry(p.profile, D.name, true);
  e.s = clamp((e.s || 0) + (d.s || 0));
  e.r = Math.max(0, (e.r || 0) + (d.r || 0));
  e.o = Math.max(0, (e.o || 0) + (d.o || 0));
  p.repHere = null;   // (the cached standing where they are: worked out again)
  p.meDirty = true;
  store.touch();
  return e;
}
// the districts where they own a home or a business (cached half a minute: the page's world never asks per tick)
function ownedIn(world, p) {
  const now = world.time;
  if (p.repOwn && now - p.repOwn.at < 30) return p.repOwn;
  const set = new Map();   // district name -> [{ x, y }] (what they own there)
  const add = (x, y) => { const D = districtOf(world, x, y); if (D) { if (!set.has(D.name)) set.set(D.name, []); set.get(D.name).push({ x, y }); } };
  try { for (const h of homes.ownedHomes(world, p.profile)) if (h) add(h.x, h.y); } catch { /* (no homes on this map) */ }
  try { for (const { s } of biz.ownedBy(world, p.profile)) if (s && s.t !== 'truck') add(s.x, s.y); } catch { /* (no businesses on this map) */ }
  return (p.repOwn = { at: now, set });
}
// where someone stands in district D: { name, s (with the owner's bonus), r, o, word, own }
export function standing(world, p, D) {
  const e = entry(p.profile, D.name), own = ownedIn(world, p).set.has(D.name);
  const s = clamp((e.s || 0) + (own ? R.owner.bonus : 0));
  return { name: D.name, s, r: e.r || 0, o: e.o || 0, word: word(s), own };
}
export function standingAt(world, p, x, y) {
  const D = districtOf(world, x, y);
  return D ? standing(world, p, D) : null;
}
// (where they are now: worked out at most every second)
function here(world, p) {
  const ped = p.ped, D = ped && districtOf(world, ped.x, ped.y);
  if (!D) return null;
  const c = p.repHere;
  if (c && c.name === D.name && world.time - c.at < 1) return c;
  return (p.repHere = { ...standing(world, p, D), at: world.time });
}

// ---- in ---------------------------------------------------------------------------------------------------------------
export function robbed(world, p, x, y) { return bump(world, p, x, y, { s: -R.robShop.s, r: 1, o: 1 }); }
// a crime someone saw (law.js crime): sev its severity, felony / minor its kind
export function crimeSeen(world, p, spec, x, y) {
  if (!spec) return null;
  return bump(world, p, x, y, { s: -R.crime.s * (spec.sev || 1) * (spec.felony ? R.crime.felony : 1), o: spec.minor ? 0 : 1 });
}
export function samaritan(world, p, pts, x, y) {
  if (!(pts > 0)) return null;
  return bump(world, p, x, y, { s: Math.min(R.samaritan.maxAct, pts * R.samaritan.perPoint) });
}

// ---- out --------------------------------------------------------------------------------------------------------------
// The shops: prices up after a robbery there (more after two), no service after refuse; a small discount for the liked.
// menu: buildMenu's; its goods are the options whose id carries the price ('w:id:price', 'a:id:price:qty',
// 'i:id:price:qty' - execute reads it from there, and checks it against this same menu). Only a shop's counter.
const NOT_SHOPS = new Set(['hospital', 'police', 'courthouse', 'bank', 'atm', 'home']);
const GOODS = /^(w|a|i):/;
export function adjustMenu(world, p, poi, menu) {
  if (!menu || !poi || !p || !p.profile || NOT_SHOPS.has(poi.kind) || !Array.isArray(menu.opts)) return menu;
  if (!menu.opts.some((o) => GOODS.test(o.id) || /^(s|sw):/.test(o.id))) return menu;
  const st = standingAt(world, p, poi.x, poi.y);
  if (!st) return menu;
  const mul = priceMul(st.r, st.s);
  if (mul === null) {
    menu.opts = [{ id: 'close', label: 'Leave' }];
    menu.sub = `"I know you - you robbed a place round here. We don't serve your kind. Get out before I call the cops." (${st.name})`;
    menu.refused = 1;
    return menu;
  }
  if (mul === 1) return menu;
  for (const o of menu.opts) {
    if (!GOODS.test(o.id) || !(o.price > 0)) continue;
    const parts = o.id.split(':'), price = Math.max(1, Math.round(o.price * mul));
    parts[2] = String(price);
    o.id = parts.join(':'); o.price = price;
  }
  menu.sub = (menu.sub ? menu.sub + ' ' : '') + (mul > 1 ? `Prices are up for you here - word gets round ${st.name} about who robs its shops.` : `A little off for you - people in ${st.name} know what you do for them.`);
  return menu;
}
// a clerk you point a gun at, where you've robbed shops before: a few pull a shotgun from under the counter
export function shotgun(world, p, clerk) {
  const st = standingAt(world, p, clerk.x, clerk.y);
  return !!st && st.r + 0.01 >= R.shops.shotgun && hash2(clerk.id, 0, 5153) < R.shops.shotgunShare;
}
// a repeat offender in this district with a record on file (law.js update: an officer who sees them knows them)
export function knownOffender(world, p, x, y) {
  const prof = p.profile;
  if (p.badge || !((prof.felonies || 0) > 0 || (prof.peakWanted || 0) > 0)) return false;
  if (world.time - (p.recognizedAt ?? -1e9) < R.repeat.cooldownS) return false;
  const st = standingAt(world, p, x, y);
  return !!st && st.o + 0.01 >= R.repeat.offenses;
}
// a passer-by who knows you vouches for you, once a district (every R.vouch.days): true - drop the call
export function vouch(world, p, x, y) {
  const D = districtOf(world, x, y);
  if (!D) return false;
  const st = standing(world, p, D);
  if (st.s < R.words.liked) return false;
  const e = entry(p.profile, D.name, true), now = Date.now();
  if (e.v && now - e.v < R.vouch.days * DAY_MS) return false;
  e.v = now;
  store.touch();
  return true;
}

// ---- what people round you do ------------------------------------------------------------------------------------------
const say = (world, e, text) => world.emit(e.x, e.y, { e: 'say', id: e.id, x: Math.round(e.x), y: Math.round(e.y), text });
const pick = (a) => a[Math.floor(rng() * a.length) % a.length];
const LOOSE = new Set(['wander', 'idle']);   // (someone at a loose end - not at work, in a fight, running, watching a show)
const free = (e) => { const n = e.npc; return !!n && !e.dead && !e.vehId && !e.hidden && !n.desk && !n.guard && !n.keep && !n.driven && !n.happening && LOOSE.has(n.state); };
const WALK = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.GRASS, T.SAND, T.DIRT]);
// out of someone's way: a few tiles off, away from them (the far side of the street, as often as not)
function giveWay(world, e, from) {
  const n = e.npc, a = Math.atan2(e.y - from.y, e.x - from.x);
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) for (const r of [6, 4]) {
    const x = e.x + Math.cos(a + turn) * r * TILE, y = e.y + Math.sin(a + turn) * r * TILE, t = world.map.tileAtPx(x, y);
    if (!WALK.has(t) || PED_BLOCK[t]) continue;
    n.state = 'wander'; n.wx = x; n.wy = y; n.until = world.time + 5; n.target = 0; n.repAt = world.time;
    return true;
  }
  return false;
}
const WAVES = ['*waves*', 'Thank you for all you do!', 'Hey - it\'s you! Thanks!', '*waves* Good to see you.', 'This neighborhood owes you one.'];
const NODS = ['*nods*', '*nods* Respect.', '*a slow nod*'];
const RESPECT = ['For you. Respect.', 'Here - no trouble, right?', 'A little something, boss.'];
const GREET = (name) => [`Morning, ${name}!`, `Hello, ${name}!`, 'Hey, neighbor!', `Evening, ${name} - the place looks good.`];

function react(world, p, st) {
  const ped = p.ped, now = world.time, prof = p.profile, Q = R.react;
  const feared = st.word === 'Feared' && (prof.criminalExp || 0) >= Q.fearExp;
  const liked = st.word === 'Liked' || st.word === 'Loved';
  let mine = null;
  if (st.own && now - (p.repGreetAt ?? -1e9) >= Q.greetS) {
    const at = ownedIn(world, p).set.get(st.name) || [];
    mine = at.some((o) => Math.hypot(o.x - ped.x, o.y - ped.y) < Q.ownPx);
  }
  if (!feared && !(liked && now - (p.repWaveAt ?? -1e9) >= Q.waveS) && !mine) return;
  const reach = Math.max(feared ? Q.nodPx : 0, Q.wavePx);
  for (const e of world.query(ped.x, ped.y, reach, K.PED)) {
    const n = e.npc;
    if (!n || e === ped || e.dead || !!e.sub !== !!ped.sub) continue;
    const d = Math.hypot(e.x - ped.x, e.y - ped.y);
    if (feared) {
      if (n.role === 'gang' && d < Q.nodPx && now - (n.repAt ?? -1e9) >= Q.nodS && world.map.los(e.x, e.y, ped.x, ped.y)) { n.repAt = now; e.a = Math.atan2(ped.y - e.y, ped.x - e.x); say(world, e, pick(NODS)); continue; }
      if (!free(e) || n.role !== 'civ') continue;
      if ((n.archetype === 'hustler' || n.role === 'mugger') && d < Q.wavePx && now - (p.repRespectAt ?? -1e9) >= Q.respectS && rng() < Q.respectP) {
        p.repRespectAt = now;
        const amt = Math.round(Q.respect[0] + rng() * (Q.respect[1] - Q.respect[0]));
        prof.cash = (prof.cash || 0) + amt;
        say(world, e, pick(RESPECT));
        world.notify(p, `A small-time crook slips you $${amt} - respect money. ${st.name} knows your name.`, 'good');
        p.meDirty = true; store.touch();
        continue;
      }
      if (d < Q.keepPx && now - (n.repAt ?? -1e9) >= 3) giveWay(world, e, ped);
      continue;
    }
    if (!free(e) || n.role !== 'civ' || d > Q.wavePx || !world.map.los(e.x, e.y, ped.x, ped.y)) continue;
    if (mine) { p.repGreetAt = now; mine = false; e.a = Math.atan2(ped.y - e.y, ped.x - e.x); say(world, e, pick(GREET(p.name || 'neighbor'))); continue; }
    if (liked && now - (p.repWaveAt ?? -1e9) >= Q.waveS) {
      if (rng() >= Q.waveP) { p.repWaveAt = now - Q.waveS * 0.75; break; }   // (not this time: ask again in a few seconds)
      p.repWaveAt = now; e.a = Math.atan2(ped.y - e.y, ped.x - e.x); say(world, e, pick(WAVES));
      break;
    }
  }
}

// Every half second, only for players on foot out in the city: the Samaritan points they've earned since the last look
// credited where they stand, and the people round them.
export function update(world) {
  if (world.tick % 10 !== 4) return;
  for (const p of world.players.values()) {
    const ped = p.ped, prof = p.profile;
    if (!ped || !prof) continue;
    const sam = prof.samaritan || 0;
    if (p.repSam === undefined || sam < p.repSam) p.repSam = sam;
    else if (sam > p.repSam) { samaritan(world, p, sam - p.repSam, ped.x, ped.y); p.repSam = sam; }
    if (ped.dead || ped.vehId || ped.hidden || ped.interior || p.custody || p.wanted > 0) continue;
    const st = here(world, p);
    if (st) react(world, p, st);
  }
}

// ---- the phone ---------------------------------------------------------------------------------------------------------
// The Skills app's district standing: every district that isn't Neutral for you, the ones you own in, and where you are
// - [{ n (name), w (word), here, own }], the worst first.
export function panel(world, p) {
  const rows = new Map(), prof = p.profile;
  const add = (name, at) => { if (!rows.has(name)) { const st = standing(world, p, { name }); rows.set(name, { n: name, w: st.word, s: st.s, own: st.own ? 1 : 0, here: at ? 1 : 0 }); } else if (at) rows.get(name).here = 1; };
  const H = p.ped && districtOf(world, p.ped.x, p.ped.y);
  if (H) add(H.name, true);
  for (const name of Object.keys(prof.rep || {})) add(name, false);
  for (const name of ownedIn(world, p).set.keys()) add(name, false);
  const out = [...rows.values()].filter((r) => r.here || r.own || r.w !== 'Neutral').sort((a, b) => a.s - b.s || a.n.localeCompare(b.n));
  for (const r of out) delete r.s;
  return out;
}
