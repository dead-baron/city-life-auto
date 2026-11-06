// The bathhouses (the owner, 10-16: "Bathhouses and locker rooms with usable showers; NPCs going through the routine"):
// the Steam & Stone Baths in the Arts District and the Old Quarter Baths (World v3: their POIs' bath - shared/world3-
// arts.js, world3-oldquarter.js). The door opens onto a floor of its own, as an arcade's does (shared/homelayout.js
// 'bath', walked round by homeinside.js, drawn by client/render/homeview.js and homeart2.js): the lobby, the men's and
// the women's locker rooms through their curtains, the bath hall at the back. Open to anyone, others in there with you.
//   - the front desk: a day at the baths (BATH.fee) - the towel and a locker; the curtains open to you once you've paid
//   - the lockers: change into a bathing suit (and back); leave your weapons in it while you bathe (they're yours again on
//     the way out - kept on your profile, so a restart can't lose them: bathLocker)
//   - the showers (in your bathing suit): BATH.showerS s - the blood and the dirt washed off (grime.js wash: the bleeding
//     stopped, a burn out, the red footprints gone), a little health back
//   - the bath (after a shower - the house rule) and the hot stones' steam: sit in it, health back a little a second;
//     BATH.soakS s or more and you leave refreshed (ped.buffs.bath: stamina back faster for BATH.buffS s, as a coffee)
//   - the benches: sit down
// The city's people go through the routine while anyone's in (h.folk, at most BATH.bathers): in by the door, the desk,
// through their curtain, changed at the lockers, a shower, a soak in the bath, back to the lockers, dressed, out - all in
// their clothes, their bathing suits or nothing at all (most - the page pixelates them, the Sims' way). The
// attendant behind the desk. They're the page's to draw (homeinside.send: m.folk, m.looks).
// (nat5, the owner 10-31: "a few more bath houses") each house its own floor (shared/homelayout.js: its POI's bath - true
// the sento's plan 'bath', a word the plan 'bath' + it): the onsen up at Granite Hot Springs (its rock pools outdoors),
// the Neon Strip's jjimjilbang (the sauna, the hot and the warm baths, the cold plunge, the heated floor), Bayside's
// spa (the pool, the steam room, the sauna, the plunge, the loungers) and Sunset Beach's seaside bathhouse (the big bath
// under its mural, the shower bar). What you sit in (SOAK): hot water (a bath, the onsen's spring - more health, a longer
// refresh), the heat (the stones' steam, a sauna), the heated floor or a lounger, and the cold plunge - straight after
// the heat (BATH.contrastS) the contrast: health back at once and the longest refresh.
//   world.bathHalls: the floors (hallOf), by id - BATH0 + the door's POI id; ped.home.bath: 1 on one; s.pass (paid), s.suit
//   (changed), s.washed (showered), s.soak (in it since), s.sk (in what: SOAK's key), s.steam (not in water), s.hotAt (a
//   hot soak done, when)
import { BATH } from '../../shared/rules-play.js';
import { HOME_IN } from '../../shared/rules.js';
import { WEAPONS } from '../../shared/items.js';
import { layout, useAt, TILE_IN, WADE } from '../../shared/homelayout.js';
import { decodeLook, encodeLook, lookToApp, randomLook, item, emptyLook } from '../../shared/look.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { payFrom as pay } from './economy.js';
import * as homes from './homes.js';
import * as homeinside from './homeinside.js';
import * as grime from './grime.js';
import * as showers from './showers.js';
import { moved } from '../movemark.js';   // (a move the server made: not a teleport to the audit)

export const BATH0 = 6000000;   // (a bathhouse's floor's id: clear of the arcades' - arcade.js ARC0)
const PLAN = 'bath', TIER = 2;
// what you can sit in, by its use: in water (the page draws you up to the shoulders), its health a second, whether it's
// hot (a soak of it counts for the plunge's contrast), the shower first (the house rule: into the water)
const SOAK = {
  bath: { water: 1, heal: 'soakHeal', hot: 1, wash: 1 }, spring: { water: 1, heal: 'springHeal', hot: 1, wash: 1, buff: 'springBuffS' },
  steam: { heal: 'soakHeal', hot: 1 }, sauna: { heal: 'saunaHeal', hot: 1 }, lounge: { heal: 'loungeHeal' }, plunge: { water: 1, wash: 1, cold: 1 },
};
// each house's word for things (its plan's style - shared/homelayout.js L.bath)
const STYLE = {
  sento: { sub: 'A timber bathhouse: the showers, the hot bath, the steam.', bath: ['Get into the hot bath'] },
  onsen: { sub: 'A mountain onsen: the hinoki bath indoors, the hot spring\'s rock pools out under the sky.', bath: ['Get into the hinoki bath'] },
  kr: { sub: 'A jjimjilbang, open all night: the sauna, the hot and the warm baths, the cold plunge, the heated floor.', bath: ['Get into the hot bath (42\u00b0C)', 'Get into the warm bath (39\u00b0C)'], lounge: 'Lie down on the heated floor' },
  spa: { sub: 'A wellness spa: the pool, the steam room, the cedar sauna, the cold plunge, the loungers.', bath: ['Slip into the pool'], steam: 'Sit in the steam room', lounge: 'Stretch out on a lounger' },
  sea: { sub: 'The seaside bathhouse: the shower bar, the big bath under its mural of the sea, the sea-water plunge.', bath: ['Get into the big bath'] },
};
const styleOf = (L) => STYLE[L.bath] || STYLE.sento;
export const feeOf = (h) => BATH.fees[(h && h.style) || 'sento'] ?? BATH.fee;
const planOfPoi = (poi) => (typeof poi.bath === 'string' && poi.bath !== 'sento' ? PLAN + poi.bath : PLAN);
const T = TILE_IN, KEEP = new Set(['fists', 'taser', 'baton', 'service']);   // (what never goes in a locker: economy.js NO_STASH)
const rng = mulberry32(8131);

// a bathhouse's door: a business place on the map marked bath
export const isBath = (world, poi) => !!poi && poi.kind === 'delivery' && !!poi.bath;
export const hallLayout = (h = null) => layout((h && h.plan) || PLAN, TIER);
export function hallOf(world, poi) {
  const id = BATH0 + poi.id, H = (world.bathHalls ||= new Map());
  let h = H.get(id);
  if (!h) {
    const plan = planOfPoi(poi), style = layout(plan, TIER).bath;
    H.set(id, (h = { id, isBath: 1, poi: poi.id, kind: 'bath', plan, style, price: 30000, name: poi.label, x: poi.x, y: poi.y, slots: 0, folk: [], seq: 0, nextAt: 0 }));
    h.welcome = `In ${poi.label}: a day here is $${feeOf(h)} at the front desk - a towel and a locker. ${STYLE[style].sub}`;
  }
  return h;
}
export const hallById = (world, id) => (world.bathHalls ? world.bathHalls.get(Number(id)) || null : null);
const playersIn = (world, h) => [...world.players.values()].filter((q) => q.ped && q.ped.hidden && q.ped.home && q.ped.home.id === h.id);

// ---- the door ----------------------------------------------------------------------------------------------------------
export function doorInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.entering || ped.ug || ped.carrying) return null;
  const poi = world.map.poiNear(ped.x, ped.y);
  if (!isBath(world, poi)) return null;
  if (!p.homePre && p.conn) { p.homePre = 1; p.conn.sendJSON({ t: 'home', pre: 1 }); }   // (the floor's drawing loaded ahead: homeview.js)
  return { label: `Into ${poi.label} - the bathhouse ($${feeOf(hallOf(world, poi))} at the desk)`, run: () => goIn(world, p, poi) };
}
export function goIn(world, p, poi) {
  const ped = p.ped;
  const err = !ped || ped.dead || ped.vehId || ped.hidden ? 'Not right now.' : ped.carrying ? 'Set the crate down first.' : p.wanted > 0 && world.time - (p.seenAt || -99) < 1.5 ? 'Not with the police watching you!' : null;
  if (err) { world.notify(p, err, 'bad'); return err; }
  const h = hallOf(world, poi);
  if (p.wanted > 0) { ped.entering = { home: h.id, at: world.time, x: ped.x, y: ped.y }; ped.vx = 0; ped.vy = 0; world.notify(p, `Slipping into ${poi.label}... (stand still)`, 'info'); return null; }
  homes.goInside(world, p, h);
  return null;
}

// ---- the plan's places: the desk, each side's curtain, lockers, showers and doorway, what the bathers soak in -----------
const GEO = new WeakMap();
export function geoOf(L) {
  let G = GEO.get(L);
  if (G) return G;
  const P = (ch) => L.pieces.filter((q) => q.ch === ch).sort((a, b) => a.x - b.x), mid = L.w / 2;
  const desk = P('I')[0], bath = P('u')[0], stones = P('y')[0] || null, gates = [], doors = [];
  for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) { const c = L.cell(tx, ty); if (c === 'X') gates.push({ tx, ty }); if (c === '+') doors.push({ tx, ty }); }
  // (the locker rooms' doorways into the hall: the lowest of the plan's doorways - a hall may have more of its own)
  const dy = Math.max(...doors.map((d) => d.ty)), back = doors.filter((d) => d.ty === dy);
  gates.sort((a, b) => a.tx - b.tx); back.sort((a, b) => a.tx - b.tx);
  const sides = [0, 1].map((k) => {
    const g = gates[k], d = back[k], J = P('J')[k], gx = (g.tx + 0.5) * T, gy = (g.ty + 0.5) * T, row = (d.ty + 2.5) * T;
    const showers = P('H').filter((q) => (q.x < mid) === !k && q.ty === d.ty + 1).map((q) => ({ piece: q, at: [q.x + q.w / 2, q.y + 18], stand: [q.x + q.w / 2, row] }));
    return { lobby: [gx + (k ? -T : T), gy], gate: [gx, gy], room: [gx + (k ? T : -T), gy], locker: J, lx: k ? J.x - 14 : J.x + J.w + 14, row, showers,
      below: [(d.tx + 0.5) * T, (d.ty + 1.5) * T], door: [(d.tx + 0.5) * T, (d.ty + 0.5) * T], above: [(d.tx + 0.5) * T, (d.ty - 0.5) * T] };
  });
  // what the bathers sit in: each piece with a clear way down to the hall's front row (the row above the doorways) - the
  // columns it's reachable along
  const front = dy - 1, soaks = [];
  for (const q of L.pieces) {
    if (!SOAK[q.use]) continue;
    const cols = [];
    for (let tx = q.tx; tx < q.tx + q.tw; tx++) { let ok = true; for (let ty = q.ty + q.th; ty <= front; ty++) if (L.solid(tx, ty)) ok = false; if (ok) cols.push(tx); }
    if (cols.length) soaks.push({ piece: q, cols });
  }
  G = { desk, bath, stones, sides, soaks, frontY: (front + 0.5) * T, deskFront: [desk.x + desk.w / 2, desk.y + desk.h + 12], clerk: [desk.x + desk.w / 2, desk.y - 14], edgeY: bath.y + bath.h + 16 };
  GEO.set(L, G);
  return G;
}
// where you sit in a piece (px), along it by u 0..1: in the water (its middle), on a sauna's bench, on the heated floor
function seatIn(q, u) {
  const x = q.x + 18 + u * Math.max(0, q.w - 36);
  if (q.use === 'sauna' || q.use === 'lounge') return [x, q.y + q.h - 22];
  if (q.use === 'steam') return [q.x + q.w + 14, q.y + q.h - 10];
  return [x, q.y + q.h / 2 + 2];
}

// ---- looks: in the street, and changed - a bathing suit (a man's trunks with a vest, a woman's swimsuit) or nothing at all
// (the owner, 11-01: "you can change into a bathing suit or just not wear anything at all" - the page pixelates the private
// areas, the Sims' way: client/art2/people.js censor) ---
export function suitOf(look, seed) {
  const L = JSON.parse(JSON.stringify(look || emptyLook('m'))), O = L.outfit, r = mulberry32(seed >>> 0), cols = ['Navy', 'Royal blue', 'Red', 'Teal', 'Black', 'Coral', 'Forest', 'Purple'];
  for (const k of ['top', 'jacket', 'bottoms', 'set', 'shoes', 'hat', 'bag', 'glasses', 'jewel']) O[k] = null;
  const c = cols[Math.floor(r() * cols.length)];
  if (L.body.base === 'f') O.set = item('Swimsuit', c); else { O.bottoms = item('Swim trunks', c); O.top = item('Tank top', 'White'); }   // (a vest over the trunks: never reads as bare at the street's size)
  return L;
}
export function bareOf(look) {
  const L = JSON.parse(JSON.stringify(look || emptyLook('m'))), O = L.outfit;
  for (const k of ['top', 'jacket', 'bottoms', 'set', 'shoes', 'hat', 'bag', 'glasses', 'jewel']) O[k] = null;
  O.set = item('Nothing');
  return L;
}
const appOfLook = (L) => lookToApp(L, encodeLook(L));
// what a player has on in there (s.suit): 1 their bathing suit, 2 nothing - their own face and hair; made once a look
function playerSuit(p) {
  const app = p.wearOut ? p.wearOut.civvies : p.ped && p.ped.app, code = app && app.lk, bare = p.ped && p.ped.home ? p.ped.home.suit === 2 : !!(p.wearOut && p.wearOut.k === 2);
  if (p.bathSuit && p.bathSuit.of === code && p.bathSuit.bare === bare) return p.bathSuit.app;
  const L = (code && decodeLook(code)) || randomLook(p.ped ? p.ped.id : 1, 'm');
  p.bathSuit = { of: code, bare, app: appOfLook(bare ? bareOf(L) : suitOf(L, (p.ped ? p.ped.id : 1) * 7)) };
  return p.bathSuit.app;
}
// the look the others in there see on a player: their suit (or nothing) once they've changed
export const appIn = (q) => (q.ped && q.ped.home && q.ped.home.bath && q.ped.home.suit ? playerSuit(q) : null);

// ---- on the floor: what the action button does (homeinside.js interaction) ------------------------------------------
const edge = (q, x, y) => Math.hypot(Math.max(q.x - x, 0, x - (q.x + q.w)), Math.max(q.y - y, 0, y - (q.y + q.h)));
export function hallInteraction(world, p, h, s) {
  const L = hallLayout(h), G = geoOf(L), none = () => {}, ped = p.ped, Y = styleOf(L), fee = feeOf(h);
  if (s.wade) {   // (wading round the water: walk out to get out)
    const k = s.sk || 'bath', done = k !== 'plunge' && world.time - s.soak >= BATH.soakS;
    const what = { bath: 'In the hot bath', spring: 'In the hot spring, under the sky', plunge: 'In the cold plunge - brr' }[k] || 'In the water';
    return { label: `${what}${done ? ' - you feel refreshed' : ''} - walk out to get out`, passive: true, run: none };
  }
  if (s.seat) {
    const k = s.sk || 'bath', done = k !== 'plunge' && world.time - s.soak >= BATH.soakS;
    const what = { bath: 'Soaking in the hot bath', spring: 'Soaking in the hot spring under the sky', steam: 'In the steam', sauna: 'Sweating it out in the sauna', lounge: 'Stretched out in the warmth', plunge: 'In the cold plunge - brr' }[k];
    return { label: s.soak ? `${what}${done ? ' - you feel refreshed' : ''} - move to get out` : 'Sitting on the bench - move to get up', passive: true, run: none };
  }
  const u = useAt(L, s.x, s.y, HOME_IN.reach);
  const bench = L.pieces.find((q) => q.ch === 'o' && edge(q, s.x, s.y) <= HOME_IN.reach + 2 && (!u || edge(q, s.x, s.y) + 8 < edge(u, s.x, s.y)));
  if (bench) return { label: 'Sit down on the bench', run: () => sit(world, p, s, bench, false) };
  if (!u) return world.time - (s.inAt ?? -1e9) < HOME_IN.hintS ? { label: `${h.name} - the front desk first: $${fee} for the day`, passive: true, run: none } : null;
  if (u.use === 'door') return { label: 'Out to the street', run: () => homeinside.leave(world, p) };
  if (u.use === 'desk') {
    if (s.pass) return { label: 'The front desk - you\'ve paid for the day: the lockers are through the curtains', passive: true, run: none };
    return { label: `The front desk - a day here: $${fee} (a towel, a locker)`, run: () => payDesk(world, p, h, s) };
  }
  if (u.use === 'locker') return { label: `Your locker - ${s.suit ? 'get dressed again' : 'undress (a bathing suit if you like)'}; leave your things in it`, run: () => openLocker(world, p, h) };
  if (u.use === 'shower') {
    const w = grime.grimeWord(ped);
    return { label: `Take a shower${w ? ` - wash off ${w}` : ''}`, run: () => shower(world, p, h, s, u) };
  }
  const K = SOAK[u.use];
  if (K) {
    const what = u.use === 'bath' ? 'The bath' : K.water ? 'The water' : u.use === 'lounge' ? 'The heated floor' : u.use === 'sauna' ? 'The sauna' : 'The steam';
    if (K.water) return { label: `${u.use === 'plunge' ? `The cold plunge (${BATH.plungeC}\u00b0C)${s.hotAt && world.time - s.hotAt <= BATH.contrastS ? ' - straight from the heat' : ''}` : u.use === 'spring' ? 'The hot spring' : what} - walk in`, passive: true, run: none };   // (the water's waded into: wade below)
    const baths = L.pieces.filter((q) => q.use === 'bath').sort((a, b) => a.x - b.x);
    const label = u.use === 'bath' ? Y.bath[Math.max(0, baths.indexOf(u)) % Y.bath.length]
      : u.use === 'spring' ? 'Get into the hot spring, out under the sky'
        : u.use === 'steam' ? Y.steam || 'Sit in the steam by the hot stones'
          : u.use === 'sauna' ? 'Sit in the sauna'
            : u.use === 'lounge' ? Y.lounge || 'Lie down in the warmth'
              : `Into the cold plunge (${BATH.plungeC}\u00b0C)${s.hotAt && world.time - s.hotAt <= BATH.contrastS ? ' - straight from the heat' : ''}`;
    return { label, run: () => soak(world, p, h, s, u) };
  }
  return null;
}
function payDesk(world, p, h, s) {
  if (s.pass) return null;
  if (!pay(p, feeOf(h))) { world.notify(p, 'Not enough money.', 'warn'); return 'Not enough money.'; }
  s.pass = 1;
  world.notify(p, `A towel and a locker key. Men's lockers to the west, women's to the east - the baths are through the back.`, 'good');
  homeinside.send(world, p, true);
  return null;
}
function sit(world, p, s, q, inWater) {
  const cx = Math.max(q.x + 12, Math.min(q.x + q.w - 12, s.x)), cy = q.y + q.h / 2;
  s.seat = { x: cx, y: cy, a: Math.PI / 2 }; s.mv = false;
  if (!inWater) s.soak = 0;
  homeinside.send(world, p, true);
}
function shower(world, p, h, s, u) {
  s.shower = world.time + BATH.showerS; s.mv = false; s.showerAt = [Math.round(u.x + u.w / 2), Math.round(u.y + 18)];
  p.ped.bleeding = false;   // (the bleeding stops as you step in)
  homeinside.send(world, p, true);
}
function soak(world, p, h, s, u) {   // (sat down in the steam, the sauna, on the heated floor: the water's waded into - wade)
  const [x, y] = seatIn(u, Math.max(0, Math.min(1, (s.x - u.x - 18) / Math.max(1, u.w - 36))));
  s.seat = { x, y, a: u.use === 'steam' ? Math.PI : Math.PI / 2 }; s.mv = false; s.wade = null;
  enterWater(world, p, h, s, u);
}
// homeinside.js input, after each step: into the water (the bath, a rock pool, the plunge) - and out again
export function waterAt(L, x, y) {
  const c = L.cell(Math.floor(x / TILE_IN), Math.floor(y / TILE_IN));
  if (!c || !WADE.includes(c)) return null;
  return L.pieces.find((q) => q.ch === c && x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) || null;
}
export function wade(world, p, h, s) {
  if (s.seat) return;
  const u = waterAt(hallLayout(h), s.x, s.y), was = s.wade;
  if (u && was === u.use) return;
  if (!u) { if (was) { s.wade = null; s.soak = 0; homeinside.send(world, p, true); } return; }
  s.wade = u.use;
  enterWater(world, p, h, s, u);
}
function enterWater(world, p, h, s, u) {
  const K = SOAK[u.use] || SOAK.bath, ped = p.ped;
  s.steam = K.water ? 0 : 1; s.sk = u.use; s.soak = world.time; s.soaked = 0;
  if (K.cold) {   // the cold plunge: wide awake at once; straight after the heat, the contrast
    ped.stamina = Math.max(ped.stamina || 0, 100); ped.burnT = 0; s.soaked = 1;
    if (s.hotAt && world.time - s.hotAt <= BATH.contrastS) {
      s.hotAt = 0;
      ped.hp = Math.min(ped.maxHp, ped.hp + BATH.contrastHeal); ped.buffs.bath = Math.max(ped.buffs.bath || 0, world.time + BATH.contrastBuffS);
      world.notify(p, `The cold after the heat - every nerve awake! Refreshed for ${Math.round(BATH.contrastBuffS / 60)} minutes.`, 'good');
    } else world.notify(p, 'Brr! The cold water knocks the breath out of you - wide awake.', 'info');
    p.meDirty = true;
  } else world.notify(p, { bath: 'Into the hot water... ahh.', spring: 'Into the hot spring - the steam rising around you, the sky overhead.', steam: 'The steam rolls over you.', sauna: 'The dry heat of the sauna wraps around you.', lounge: 'The warmth soaks into you.' }[u.use] || 'Ahh.', 'info');
  if (K.water && ped.bleeding) ped.bleeding = false;
  homeinside.send(world, p, true);
}
// homeinside.js update: a shower's done
export function showered(world, p) {
  const s = p.ped && p.ped.home;
  if (s && s.bath) { s.washed = 1; s.showerAt = null; }
}

// ---- out to the street in what you had on in there (the owner, 11-01: "you can leave the bath house with what you're
// wearing in there"): p.wearOut { k: 1 the bathing suit | 2 nothing, civvies: the look you came in with }; dressed again
// at any bathhouse's locker, or by putting a look on (looks.js wear: the wardrobe, a clothes shop)
export function leaving(world, p, s) {
  if (!p.ped || !s || !s.bath) return;
  if (!s.suit) { if (p.wearOut) dressOut(p); return; }
  const civ = p.wearOut ? p.wearOut.civvies : p.ped.app;
  p.wearOut = { k: s.suit, civvies: civ };
  p.ped.app = playerSuit(p); p.ped.appVer = (p.ped.appVer || 0) + 1;
  world.notify(p, s.suit === 2 ? 'Out on the street with nothing on - get dressed at a bathhouse locker or your wardrobe.' : 'Out on the street in your bathing suit.', 'info');
}
export function dressOut(p) {
  if (!p.wearOut) return;
  if (p.ped) { p.ped.app = p.wearOut.civvies; p.ped.appVer = (p.ped.appVer || 0) + 1; }
  p.wearOut = null;
}
// into a bathhouse already changed (from the street): what you have on
export function arriving(p, s) { if (p.wearOut && s && s.bath) s.suit = p.wearOut.k; }

// ---- the lockers ---------------------------------------------------------------------------------------------------
const guns = (prof) => Object.keys(prof.weapons || {}).filter((id) => WEAPONS[id] && !KEEP.has(id));
function openLocker(world, p, h) {
  if (!p.conn) return;
  const poi = world.map.pois[h.poi];
  p.menu = { poi: poi.id };
  p.conn.sendJSON(menu(world, p, poi));
}
// the locker's menu, up on the page (economy.js buildMenu: its choices)
export function menu(world, p, poi) {
  const prof = p.profile, s = p.ped && p.ped.home, inside = !!(s && s.bath && s.id === BATH0 + poi.id), opts = [], lk = prof.bathLocker || {};
  if (!inside) {
    const h = hallOf(world, poi);
    opts.push({ id: 'ba:in', label: 'Go inside', note: `$${feeOf(h)} for the day at the desk`, shut: true });
    opts.push({ id: 'close', label: 'Leave' });
    return { t: 'menu', poi: poi.id, title: poi.label, sub: STYLE[h.style].sub, opts, cash: prof.cash, bank: prof.bank };
  }
  if (s.suit !== 2) opts.push({ id: 'ba:bare', label: s.suit ? 'Take the bathing suit off - nothing on' : 'Undress - nothing on', note: 'the way bathhouses go', shut: true });
  if (s.suit !== 1) opts.push({ id: 'ba:suit', label: s.suit ? 'Put a bathing suit on' : 'Change into a bathing suit', shut: true });
  if (s.suit) opts.push({ id: 'ba:dress', label: 'Get dressed again', shut: true });
  const mine = guns(prof);
  if (mine.length) opts.push({ id: 'ba:put', label: `Leave your weapons in the locker (${mine.map((id) => WEAPONS[id].name).join(', ')})`, note: 'yours again on the way out' });
  if (Object.keys(lk).length) opts.push({ id: 'ba:take', label: `Take your things back (${Object.keys(lk).map((id) => WEAPONS[id] ? WEAPONS[id].name : id).join(', ')})` });
  opts.push({ id: 'close', label: 'Done' });
  return { t: 'menu', poi: poi.id, title: 'Your locker', sub: 'Your things are safe in here while you bathe.', opts, cash: prof.cash, bank: prof.bank };
}
export function execute(world, p, poi, opt) {
  const prof = p.profile, ped = p.ped, s = ped && ped.home, parts = opt.split(':');
  if (parts[1] === 'in') return goIn(world, p, poi);
  if (!s || !s.bath) return 'At the lockers, inside.';
  if (parts[1] === 'suit' || parts[1] === 'bare' || parts[1] === 'dress') {
    const to = parts[1] === 'dress' ? 0 : parts[1] === 'bare' ? (s.suit === 2 ? 0 : 2) : (s.suit === 1 ? 0 : 1);   // (suit / bare again: back into your clothes)
    s.suit = to; if (!s.suit) s.washed = 0;
    if (!to && p.wearOut) dressOut(p);   // (came in in it from the street: your clothes back on)
    world.notify(p, to === 1 ? 'Changed into your bathing suit, a towel over your shoulder.' : to === 2 ? 'Undressed, a towel over your shoulder.' : 'Dressed again.', 'info');
    homeinside.send(world, p, true);
    return null;
  }
  if (parts[1] === 'put') {
    const lk = (prof.bathLocker ||= {});
    for (const id of guns(prof)) { lk[id] = (lk[id] || 0) + (prof.weapons[id] || 0) + (ped.mag[id] || 0); delete prof.weapons[id]; delete ped.mag[id]; if (ped.weapon === id) ped.weapon = 'fists'; }
    store.touch(); p.meDirty = true;
    world.notify(p, 'Your weapons are in the locker.', 'good');
    return null;
  }
  if (parts[1] === 'take') { giveBack(world, p, true); return null; }
  return 'Not at the lockers.';
}
// a locker's things back to you (and your clothes back on: the suit is only ever the bath's)
function giveBack(world, p, say) {
  const prof = p.profile, ped = p.ped, lk = prof.bathLocker;
  if (!lk) return;
  for (const [id, rounds] of Object.entries(lk)) {
    const w = WEAPONS[id];
    if (!w) continue;
    if (w.mag) { const inMag = Math.min(w.mag, rounds); if (ped) ped.mag[id] = Math.max(ped.mag[id] || 0, inMag); prof.weapons[id] = (prof.weapons[id] || 0) + rounds - inMag; }
    else prof.weapons[id] = prof.weapons[id] || 0;
  }
  delete prof.bathLocker;
  store.touch(); p.meDirty = true;
  if (say) world.notify(p, 'You take your things out of the locker.', 'good');
}

// ---- the bathers: the city's people going through the routine --------------------------------------------------------
// a route as waypoints, each [x, y, wait s, then: what they wear / how they stand]; walked at a stroll
const WALK = 62;
function route(G, side, sh, u) {
  const S = G.sides[side], at = (p, w = 0, o = null) => [p[0], p[1], w, o];
  const ly = S.locker.y + 18 + ((u * 997) % 1) * (S.locker.h - 36), Sh = S.showers[Math.floor(sh * S.showers.length) % S.showers.length];
  // what they soak in (the bath, mostly; the house's others - a rock pool, the sauna, the heated floor - as often) and
  // where: one of its columns with a clear way up from the hall's front row
  const pick = G.soaks.length ? (((u * 7919) % 1) < 0.4 ? G.soaks.find((q) => q.piece === G.bath) || G.soaks[0] : G.soaks[Math.floor(((u * 3571) % 1) * G.soaks.length)]) : null;
  const q = pick ? pick.piece : G.bath, col = pick ? pick.cols[Math.floor(((u * 131) % 1) * pick.cols.length)] : q.tx;
  const K = SOAK[q.use] || SOAK.bath, spot = seatIn(q, q.w > 36 ? ((col + 0.5) * T - q.x - 18) / (q.w - 36) : 0.5).map((v, i) => (i === 0 && q.use !== 'steam' ? Math.max(q.x + 14, Math.min(q.x + q.w - 14, (col + 0.5) * T)) : v));
  const edge = [spot[0], Math.min(q.y + q.h + 16, G.frontY)], po = K.water ? 'soak' : 'sit', long = K.cold ? 6 : 14 + u * 16;
  return [
    at(G.deskFront, 2), at(S.lobby), at(S.gate), at(S.room), at([S.lx, S.room[1]]), at([S.lx, ly], 4, { wear: 'suit' }),
    at([S.lx, S.row]), at(Sh.stand), at(Sh.at, 5, { po: 'shower' }), at(Sh.stand), at([S.below[0], S.row]), at(S.below), at(S.door), at(S.above),
    at([spot[0], G.frontY]), at(edge), at(spot, long, { po }), at(edge), at([spot[0], G.frontY]), at(S.above), at(S.door), at(S.below), at([S.below[0], S.row]),
    at([S.lx, S.row]), at([S.lx, ly], 4, { wear: 'street' }), at([S.lx, S.room[1]]), at(S.room), at(S.gate), at(S.lobby), at(G.deskFront), at(G.door),
  ];
}
function newBather(world, h, G, L, stage = 0) {
  const side = rng() < 0.5 ? 0 : 1, seed = (h.id * 31 + (h.seq += 1) * 7919) >>> 0;
  const look = randomLook(seed, side ? 'f' : 'm');
  const b = { id: h.seq, side, path: route({ ...G, door: [L.spawn.x, L.spawn.y + 10] }, side, rng(), rng()), i: 0, wait: 0, x: L.spawn.x, y: L.spawn.y + 10, a: -Math.PI / 2, mv: 0, po: 'idle', wear: 'street',
    change: rng() < BATH.bareShare ? 'bare' : 'suit',   // (some go in a bathing suit, most in nothing at all)
    app: { street: appOfLook(look), suit: appOfLook(suitOf(look, seed)), bare: appOfLook(bareOf(look)) } };
  // (one already somewhere along it: seeded through the routine when the first player comes in)
  for (let k = 0; k < stage && b.i < b.path.length - 1; k++) arrive(b, b.path[b.i]), b.i++;
  if (stage) { const q = b.path[b.i]; b.x = q[0]; b.y = q[1]; }
  h.folk.push(b);
  return b;
}
function arrive(b, q) { const o = q[3]; if (o && o.wear) b.wear = o.wear === 'suit' ? b.change || 'suit' : o.wear; }
function stepFolk(world, h, dt) {
  const L = hallLayout(h), G = geoOf(L);
  if (world.time >= h.nextAt && h.folk.length < BATH.bathers) { newBather(world, h, G, L); h.nextAt = world.time + BATH.arriveS * (0.6 + rng() * 0.8); }
  for (const b of h.folk) {
    const q = b.path[b.i];
    if (!q) { b.gone = true; continue; }
    if (b.wait > 0) { b.wait -= dt; b.mv = 0; if (b.wait <= 0) { b.po = 'idle'; b.i++; } continue; }
    const dx = q[0] - b.x, dy = q[1] - b.y, d = Math.hypot(dx, dy), stepL = WALK * dt;
    if (d <= stepL) {
      b.x = q[0]; b.y = q[1]; b.mv = 0;
      arrive(b, q);
      if (q[2] > 0) { b.wait = q[2]; b.po = (q[3] && q[3].po) || 'idle'; if (b.po === 'soak' || b.po === 'shower' || b.po === 'sit') b.a = Math.PI / 2; } else b.i++;
    } else { b.x += dx / d * stepL; b.y += dy / d * stepL; b.a = Math.atan2(dy, dx); b.mv = 1; b.po = 'idle'; }
  }
  h.folk = h.folk.filter((b) => !b.gone);
}
// for the page (homeinside.send): where they are, and the looks it hasn't had yet (by key: bather id and what they wear)
export function sendExtra(world, p, h, s, m, full) {
  const seen = (p.bathSeen ||= new Set()), looks = {};
  if (full) seen.clear();
  m.folk = h.folk.map((b) => {
    const k = `${h.id}:${b.id}:${b.wear}`;
    if (!seen.has(k)) { seen.add(k); looks[k] = b.app[b.wear]; }
    return [Math.round(b.x), Math.round(b.y), Math.round(b.a * 100) / 100, b.mv, b.po, k];
  });
  const G = geoOf(hallLayout(h));
  m.clerk = G.clerk;
  if (!seen.has('clerk')) { seen.add('clerk'); looks.clerk = (h.clerkApp ||= appOfLook(randomLook(h.id * 13 + 5, h.id % 2 ? 'f' : 'm', 'casual'))); }
  if (Object.keys(looks).length) m.looks = looks;
  m.pass = s.pass ? 1 : 0;
  m.soak = s.soak && s.seat ? (s.steam ? 2 : 1) : 0;
  if (s.suit) m.suit = playerSuit(p);
}

// ---- every tick ------------------------------------------------------------------------------------------------------
const G0 = (h) => geoOf(hallLayout(h));
export function update(world, dt) {
  grime.update(world, dt);
  showers.update(world);   // (the outdoor showers: showers.js)
  const now = world.time;
  // the floors someone's on: their bathers along the routine, a soak's health and its buff
  if (world.bathHalls) for (const h of world.bathHalls.values()) {
    const ps = playersIn(world, h);
    if (!ps.length) { if (h.folk.length) h.folk = []; continue; }
    if (!h.folk.length && !h.seeded) { const L = hallLayout(h), G = geoOf(L); for (let k = 0; k < 4; k++) newBather(world, h, G, L, 2 + Math.floor(rng() * 20)); h.nextAt = now + 4; }
    h.seeded = true;
    stepFolk(world, h, dt);
    for (const q of ps) {
      const s = q.ped.home, ped = q.ped;
      if (!s.soak || !(s.seat || s.wade)) { if (s.soak && !s.seat && !s.wade) s.soak = 0; continue; }
      const K = SOAK[s.sk] || SOAK.bath;
      if (K.heal && ped.hp < ped.maxHp) { ped.hp = Math.min(ped.maxHp, ped.hp + BATH[K.heal] * dt); if (world.tick % 20 === 0) q.meDirty = true; }
      if (!s.soaked && now - s.soak >= BATH.soakS) {
        const S = BATH[K.buff || 'buffS'];
        s.soaked = 1; if (K.hot) s.hotAt = now;
        ped.buffs.bath = Math.max(ped.buffs.bath || 0, now + S); ped.stamina = Math.max(ped.stamina || 0, 100);
        world.notify(q, `Refreshed: your stamina comes back faster for ${Math.round(S / 60)} minutes.${K.hot && G0(h).soaks.some((o) => o.piece.use === 'plunge') ? ' (The cold plunge now, while you\'re hot...)' : ''}`, 'good'); q.meDirty = true;
      }
    }
  }
  // out of a bathhouse some way (the door, dying, a dev command): the locker's things back
  if (world.tick % 10 === 0) for (const p of world.players.values()) {
    if (!p.profile.bathLocker) continue;
    const s = p.ped && p.ped.home;
    if (!(s && s.bath)) giveBack(world, p, true);
  }
}
// ---- dev (server/dev.js 'bath'): into the nearest bathhouse - paid (msg.pass, default yes), changed (msg.suit), stood at
// msg.at: 'lobby' | 'lockers' | 'showers' | 'hall' | 'soak' (in the bath) | 'steam' | 'spring' | 'sauna' | 'plunge' | 'lounge';
// msg.side 0 the men's, 1 the women's; msg.style: the nearest of that house ('onsen', 'kr', 'spa', 'sea', 'sento')
export function devIn(world, p, msg = {}) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return 'Not right now.';
  let poi = null, bd = Infinity;
  for (const q of world.map.pois) if (isBath(world, q) && (!msg.style || hallOf(world, q).style === msg.style)) { const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d < bd) { bd = d; poi = q; } }
  if (!poi) return 'No bathhouse on this map.';
  if (ped.home) homeinside.leave(world, p);
  if (ped.hidden) homes.leaveHome(world, p);
  ped.x = poi.x; ped.y = poi.y; world.place(ped); moved(ped);
  homes.goInside(world, p, hallOf(world, poi));
  const h = ped.home && hallById(world, ped.home.id), L = hallLayout(h), s = ped.home, G = geoOf(L), S = G.sides[msg.side ? 1 : 0];
  if (msg.pass !== false) s.pass = 1;
  if (msg.suit) s.suit = 1;
  const use = { soak: 'bath', steam: 'steam', spring: 'spring', sauna: 'sauna', plunge: 'plunge', lounge: 'lounge' }[msg.at], piece = use && L.pieces.find((q) => q.use === use);
  const at = { lobby: G.deskFront, lockers: [S.lx, S.locker.y + 40], showers: S.showers[1].stand, hall: [G.bath.x + 160, G.edgeY] }[msg.at] || (piece && [piece.x + piece.w / 2, piece.y + piece.h + 12]);
  if (at) { s.x = at[0]; s.y = at[1]; s.a = -Math.PI / 2; }
  if (piece && (SOAK[piece.use] || {}).water) { s.x = piece.x + piece.w / 2; s.y = piece.y + piece.h / 2; wade(world, p, h, s); }
  else if (piece) soak(world, p, h, s, piece);
  homeinside.send(world, p, true);
  return null;
}
export const _test = { geoOf, route, stepFolk, newBather, suitOf, seatIn, SOAK };
