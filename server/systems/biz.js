// Tier-4 properties: the businesses (the owner's tracker, 10-06: "Tier-4 homes that are businesses: farm, nightclub,
// criminal hideout with gang guards; auto shop, food truck etc."; docs/DESIGN-NOTES.md, Tier 4). Bought like a home -
// found in the real-estate app (realestate.js: the Businesses list, a waypoint to each) and bought at the place - and,
// like a home, a place to wake up and to rest. Each earns: a day's takings put in its till every in-game day you're in
// the city (no more than BIZ.tillDays' worth waits: go and collect it), more as you work it, and upgrades and stock
// to buy. All of it here on the server; the numbers are shared/rules-games.js BIZ.
//   farm     the fields round a farmhouse (map.fields, grouped): every row harvested there pays into the till (the
//            farmhands' tractors too - farming.js finishRow -> farmRow), more when you drive it yourself; hired hands
//            sell the crop; the coop, the pens and the dairy herd earn every day on a sack of feed each
//   club     the city's nightclubs (nightclubs.js): a night's takings by how popular it is, its sound system and its bar
//            (stocked: the cases behind it), the cover of everyone the bouncer lets in (nightclubs.js admit -> clubAdmit),
//            a cut of the bar's sales (economy.js -> onSpend); at night take the decks: the floor drops, and they tip
//   hideout  a few plain buildings in the rough ends of town, laid out for sale here (nothing added to the map): the grow
//            room makes product - taken as hot money (hotmoney.js), or run to a buyer across the world for clean cash;
//            the Syndicate's soldiers stand guard at the door while you own it and warn off, then shoot, outsiders who
//            come into the yard - and go for anyone who hurts you there
//   shop     the auto shops - the Fresh Coat garage and the Spray & Go paint bays: customers' cars every day (the lift,
//            the tools, the parts to fit), a cut of what other players pay there (yours is free: economy.js, paint.js),
//            and a customer's car brought in to fix by hand
//   truck    a food truck - the Mr. Frosty van, from the dealership: park it where people are, open the hatch and sell
// Where: a farm's, a hideout's and a Spray & Go's office is a spot of its own (the action button there opens the
// manager's menu); a club's is its bar's menu (a row), the garage's its counter's, the food truck's the dealership's and,
// out on the street, the truck itself. Owned businesses show on your map (players.js self record: biz).
//   profile.biz: { [site id]: { t, paid (what it cost, the upgrades too), up: { key: level }, stock, till, day } } - the
//     food truck's under 'truck' (its site: the dealership it came from)
//   world.biz: { sites, byId, owner (site id -> pid), guards (site id -> ids), trucks (pid -> vehicle id), dj, runs }
//   the menus: the page's ordinary menus, a negative poi (-1 - the site's index; TRUCK_POI: your truck)
import { K, T, TILE } from '../../shared/constants.js';
import { DISTRICTS, PED_BLOCK } from '../../shared/mapcore.js';
import { BIZ } from '../../shared/rules-games.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { payFrom as pay } from './economy.js';
import * as hotmoney from './hotmoney.js';
import * as nightclubs from './nightclubs.js';
import * as gang from './gang.js';
import * as crews from './crews.js';
import * as skills from './skills.js';
import { spawnNpc, despawnNpc, startFight } from './npc.js';

const rng = mulberry32(7411);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const TRUCK_POI = -9;
const OFFICE_R = 40;                 // px: standing this close to an office spot
const FARMS_MAX = 10, HIDES_MAX = 6, HIDE_GAP = 4000, FIELD_GAP = 400;   // farms at most, hideouts at most and how far apart, fields this close are one farm
const GUARD_NEAR = 1800, GUARD_FAR = 2400;   // the guards come out with someone this near, go when nobody's within this
const TRUCK_NEAR = 300;              // the hatch shuts with you further than this from the truck
const RUN_REACH = 140;               // px: at the buyer
export const TYPES = {
  farm: { short: "rows harvested, farmhands, animals", word: 'farm', icon: 'farm', stock: 'sacks of feed', home: true, blurb: 'Fields worked by its own hands - every row harvested here pays into the till, more when you drive the tractor yourself. Hire farmhands to sell the crop, and keep animals for eggs, pork and milk every day (a sack of feed each).' },
  club: { short: "a night's takings, the cover, the bar's cut, the decks", word: 'nightclub', icon: 'club', stock: 'cases behind the bar', home: true, blurb: 'Every night the takings come in - more for a popular club, a good sound system and a stocked bar. The cover of everyone the bouncer lets in and a cut of the bar are yours too. At night, take the decks.' },
  hideout: { short: "product every day, guards at the door", word: 'criminal hideout', icon: 'gang', stock: 'bags of nutrients', home: true, blurb: 'A grow room in the back: product every day, taken as hot money or run to a buyer across the world for clean cash. The Syndicate\'s soldiers guard the door while it\'s yours - outsiders who come into the yard are warned off, then shot at.' },
  shop: { short: "customers' cars, a cut of the counter, your paint free", word: 'auto shop', icon: 'garage', stock: 'parts', home: true, blurb: 'Customers\' cars every day - more with a better lift and tools, a part fitted on each. A cut of what other drivers pay here; your own paint and repairs are free. Bring a customer\'s car in to fix it yourself for more.' },
  truck: { short: "park where people are and sell", word: 'food truck', icon: 'snack', stock: 'meals', home: false, blurb: 'Your own Mr. Frosty van: park it where people are, open the hatch and sell - the bigger the crowd, the quicker it goes. Stock up on meals, a better menu sells dearer, a grill serves quicker.' },
};
// the upgrades of each type: { key, name, prices (a level each), what (its effect, for the menu) }
const UPS = {
  farm: [{ key: 'hands', name: 'Farmhands', prices: BIZ.farm.hands, what: (n) => `sell the crop: ${money(BIZ.farm.handsDay * n)} a field a day` },
    ...Object.entries(BIZ.farm.animals).map(([key, A]) => ({ key, name: A.name, prices: [A.price], what: () => `${money(A.day)} a day (a sack of feed)` }))],
  club: [{ key: 'sound', name: 'The sound system', prices: BIZ.club.sound, what: (n) => `+${Math.round(BIZ.club.up * n * 100)}% a night` }, { key: 'bar', name: 'The bar', prices: BIZ.club.bar, what: (n) => `+${Math.round(BIZ.club.up * n * 100)}% a night` }],
  hideout: [{ key: 'lamps', name: 'Grow lamps', prices: BIZ.hideout.lamps, what: (n) => `${money(BIZ.hideout.grow[n])} of product a day` }, { key: 'guards', name: 'More guards', prices: BIZ.hideout.guards, what: (n) => `${BIZ.hideout.guards0 + n} at the door` }],
  shop: [{ key: 'lift', name: 'A better lift', prices: BIZ.shop.lift, what: (n) => `${BIZ.shop.jobs + BIZ.shop.perLift * n} cars a day` }, { key: 'tools', name: 'Better tools', prices: BIZ.shop.tools, what: (n) => `${money(BIZ.shop.perJob + BIZ.shop.perTools * n)} a car` }],
  truck: [{ key: 'menu', name: 'A better menu', prices: BIZ.truck.menu, what: (n) => `${money(BIZ.truck.meal[n])} a meal` }, { key: 'grill', name: 'A bigger grill', prices: BIZ.truck.grill, what: (n) => `serves ${Math.round(BIZ.truck.grillCut * n * 100)}% quicker` }],
};
const STOCK = { farm: BIZ.farm.feed, club: BIZ.club.stock, hideout: BIZ.hideout.nutrients, shop: BIZ.shop.parts, truck: BIZ.truck.food };
const lvl = (e, k) => (e && e.up && e.up[k]) | 0;

// ---- the places ------------------------------------------------------------------------------------------------------
const distOf = (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? DISTRICTS[m.dist[m.idx(tx, ty)]] || null : null; };
// somewhere to stand: open ground (not water, not a field's crop, nothing solid) - the nearest to (x, y) within r
function standNear(m, x, y, r = 360) {
  const ok = (px, py) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (!m.inside(tx, ty)) return false;
    const t = m.tiles[m.idx(tx, ty)];
    if (PED_BLOCK[t] || t === T.WATER || t === T.DEEP || t === T.FIELD) return false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const arr = m.solidProps.get(m.idx(tx + ox, ty + oy));
      if (arr) for (const q of arr) if (!q.off && Math.hypot(q.x - px, q.y - py) < q.r + 14) return false;
    }
    return true;
  };
  if (ok(Math.round(x), Math.round(y))) return { x: Math.round(x), y: Math.round(y) };
  for (let d = 16; d <= r; d += 16) for (let k = 0; k < 16; k++) {
    const px = Math.round(x + Math.cos((k / 16) * Math.PI * 2) * d), py = Math.round(y + Math.sin((k / 16) * Math.PI * 2) * d);
    if (ok(px, py)) return { x: px, y: py };
  }
  return null;
}
function site(m, t, id, name, x, y, price, extra = {}) {
  const D = distOf(m, x, y);
  return { id, t, name, x: Math.round(x), y: Math.round(y), price, d: D ? D.name : '', dt: D ? D.tier || '' : '', ...extra };
}
// the farms: the map's fields in groups (fields this close are one farm), the biggest FARMS_MAX; the office by the
// farmhouse nearest them, else at the edge of the fields
function farmSites(m) {
  const F = m.fields || [], up = F.map((_, i) => i);
  const find = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  const gap = (a, b) => Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) if (gap(F[i], F[j]) < FIELD_GAP) up[find(i)] = find(j);
  const groups = new Map();
  F.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const area = (g) => g.reduce((n, i) => n + F[i].w * F[i].h, 0);
  const picked = [...groups.values()].sort((a, b) => area(b) - area(a) || a[0] - b[0]).slice(0, FARMS_MAX).sort((a, b) => a[0] - b[0]);
  const houses = (m.homes || []).filter((h) => h && !h.gone && h.kind === 'farmhouse');
  const out = [], names = new Set(), WORDS = ['Farm', 'Acres', 'Homestead', 'Ranch', 'Fields'];
  for (const g of picked) {
    const x0 = Math.min(...g.map((i) => F[i].x)), y0 = Math.min(...g.map((i) => F[i].y)), x1 = Math.max(...g.map((i) => F[i].x + F[i].w)), y1 = Math.max(...g.map((i) => F[i].y + F[i].h));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let house = null, hd = 1600;
    for (const h of houses) { const d = Math.hypot(h.x - cx, h.y - cy) - Math.hypot(x1 - x0, y1 - y0) / 2; if (d < hd) { hd = d; house = h; } }
    const at = (house && (standNear(m, house.x + 70, house.y + 10, 160) || standNear(m, house.x - 70, house.y + 10, 160))) || standNear(m, cx, y0 - 40, 600) || standNear(m, cx, y1 + 40, 600);
    if (!at) continue;
    const D = distOf(m, cx, cy), base = D ? D.name : 'Country';
    let name = '';
    for (const w of WORDS) { name = `${base} ${w}`; if (!names.has(name) && !base.includes(w)) break; }
    for (let k = 2; names.has(name); k++) name = `${base} Farm No. ${k}`;
    names.add(name);
    out.push(site(m, 'farm', `farm:${g[0]}`, name, at.x, at.y, BIZ.farm.price, { fields: g, ax: Math.round(cx), ay: Math.round(cy) }));
  }
  return out;
}
// the hideouts: plain buildings (no business, no home in them) in the rough, industrial and poor ends of town and out
// in the country, a few spread across the world; the office at the front door
const HIDE_TIERS = new Set(['rough', 'industrial', 'low', 'rural']);
function hideoutSites(m) {
  const busy = new Set();
  for (const p of m.pois) if (p.b !== undefined && p.b >= 0) busy.add(p.b);
  for (const h of m.homes || []) if (h && h.b != null) busy.add(h.b);
  const cands = [];
  for (const b of m.buildings || []) {
    if (!b || b.gone || busy.has(b.id) || b.business || b.home != null || b.tw * b.th < 24 || b.tw * b.th > 600) continue;
    const D = distOf(m, (b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE);
    if (!D || !HIDE_TIERS.has(D.tier) || /Prison/.test(D.name)) continue;
    cands.push({ b, D, k: (Math.imul(b.id + 17, 0x9e3779b1) >>> 0) });
  }
  cands.sort((a, q) => a.k - q.k);
  const out = [], per = new Map(), WORDS = ['Lockup', 'Safehouse', 'Warehouse', 'Den', 'Stash House', 'Hideaway'];
  for (const { b, D } of cands) {
    if (out.length >= HIDES_MAX) break;
    if ((per.get(D.name) || 0) >= 2) continue;
    const door = b.door || { tx: b.tx + (b.tw >> 1), ty: b.ty + b.th }, dx = (door.tx + 0.5) * TILE, dy = (door.ty + 0.5) * TILE;   // (no door of its own: the middle of its front)
    const wall = m.inside(door.tx, door.ty - 1) && m.tiles[m.idx(door.tx, door.ty - 1)] === T.BUILDING, wall2 = m.inside(door.tx, door.ty + 1) && m.tiles[m.idx(door.tx, door.ty + 1)] === T.BUILDING;
    if (!wall && !wall2) continue;   // (a front with a building's wall behind it: not a yard or a lot)
    if (out.some((s) => Math.hypot(s.x - dx, s.y - dy) < HIDE_GAP)) continue;
    const at = standNear(m, dx, dy, 64);
    if (!at) continue;
    per.set(D.name, (per.get(D.name) || 0) + 1);
    out.push(site(m, 'hideout', `hide:${b.id}`, `The ${D.name} ${WORDS[out.length % WORDS.length]}`, at.x, at.y, BIZ.hideout.price, { b: b.id }));
  }
  return out;
}
export function sites(world) {
  const B = S(world);
  if (B.sites) return B.sites;
  const m = world.map, out = [];
  out.push(...farmSites(m));
  for (const c of nightclubs.clubs(world)) { const poi = m.pois[c.poi]; if (poi) out.push(site(m, 'club', `club:${c.key}`, poi.label, poi.x, poi.y, BIZ.club.price, { poi: poi.id, key: c.key, pop: c.pop })); }
  out.push(...hideoutSites(m));
  for (const poi of m.pois) if (poi && poi.kind === 'garage') out.push(site(m, 'shop', `shop:g${poi.id}`, poi.label, poi.x, poi.y, BIZ.shop.garagePrice, { poi: poi.id }));
  (m.bays || []).forEach((bay, i) => {
    const bx = (bay.tx + bay.tw / 2) * TILE, by = (bay.ty + bay.th / 2) * TILE;
    let poi = null, pd = 400;
    for (const q of m.pois) if (q && q.kind === 'paint') { const d = Math.hypot(q.x - bx, q.y - by); if (d < pd) { pd = d; poi = q; } }
    const at = poi ? standNear(m, poi.x, poi.y, 120) : standNear(m, bx, by + (bay.th / 2 + 1) * TILE, 200);
    if (at) out.push(site(m, 'shop', `shop:b${i}`, poi ? poi.label : 'Spray & Go', at.x, at.y, BIZ.shop.price, { bay: i }));
  });
  for (const poi of m.pois) if (poi && poi.kind === 'dealer') out.push(site(m, 'truck', `truck:${poi.id}`, `${poi.label} - food trucks`, poi.x, poi.y, BIZ.truck.price, { poi: poi.id, lot: poi.spawnLot || null }));
  B.sites = out;
  B.byId = new Map(out.map((s, i) => { s.i = i; return [s.id, s]; }));
  return out;
}
export const siteById = (world, id) => (sites(world), S(world).byId.get(id) || null);
const S = (world) => (world.biz ??= { sites: null, byId: null, owner: null, guards: new Map(), guardsGone: new Map(), trucks: new Map(), dj: new Map(), warned: new Map() });

// ---- who owns what ---------------------------------------------------------------------------------------------------
// (from the profiles, the first time it's asked: a business whose place is gone - the world changed under it - is bought
// back at what was paid for it, into the bank)
function owners(world) {
  const B = S(world);
  if (B.owner) return B.owner;
  B.owner = new Map();
  sites(world);
  for (const prof of store.all()) claimAll(world, prof);
  return B.owner;
}
function claimAll(world, prof) {
  const B = S(world);
  for (const id of Object.keys(prof.biz || {})) {
    const e = prof.biz[id];
    if (id === 'truck') { if (!siteById(world, e.site)) e.site = (sites(world).find((s) => s.t === 'truck') || {}).id || null; continue; }
    const s = siteById(world, id);
    if (s && e && e.t === s.t && (!B.owner.has(id) || B.owner.get(id) === prof.pid)) { B.owner.set(id, prof.pid); continue; }
    prof.bank = (prof.bank || 0) + Math.max(0, Math.round((e && e.paid) || 0));
    delete prof.biz[id];
    store.touch();
  }
}
export const ownerOf = (world, id) => owners(world).get(id) || null;
const entryOf = (p, id) => (p.profile.biz && p.profile.biz[id]) || null;
const mine = (world, p, s) => !!s && (s.t === 'truck' ? !!entryOf(p, 'truck') : ownerOf(world, s.id) === p.pid);
// the businesses a profile owns: [{ s (the site), e (its entry) }]
export function ownedBy(world, prof) {
  owners(world);
  const out = [];
  for (const id of Object.keys(prof.biz || {})) {
    const e = prof.biz[id], s = id === 'truck' ? siteById(world, e.site) : siteById(world, id);
    if (s && (id === 'truck' || ownerOf(world, id) === prof.pid)) out.push({ s, e, id });
  }
  return out;
}

// ---- what it earns ---------------------------------------------------------------------------------------------------
// a day's takings at full stock (the till's cap: BIZ.tillDays of it), and the day itself: { earn, used, note }
function dayOf(world, s, e, stockOn = e.stock | 0) {
  let earn = 0, used = 0, short = false;
  if (s.t === 'farm') {
    earn += BIZ.farm.handsDay * lvl(e, 'hands') * s.fields.length;
    for (const [k, A] of Object.entries(BIZ.farm.animals)) if (lvl(e, k)) { if (stockOn - used > 0) { used++; earn += A.day; } else short = true; }
  } else if (s.t === 'club') {
    const want = 1 + lvl(e, 'bar'), full = stockOn >= want;
    used = Math.min(want, stockOn); short = !full;
    earn = Math.round(BIZ.club.night * (0.6 + (s.pop || 0.5)) * (1 + BIZ.club.up * (lvl(e, 'sound') + lvl(e, 'bar'))) * (full ? 1 : 0.5));
  } else if (s.t === 'hideout') {
    const want = 1 + lvl(e, 'lamps');
    if (stockOn >= want) { used = want; earn = BIZ.hideout.grow[lvl(e, 'lamps')]; } else short = true;
  } else if (s.t === 'shop') {
    const cars = BIZ.shop.jobs + BIZ.shop.perLift * lvl(e, 'lift'), n = Math.min(cars, stockOn);
    used = n; short = n < cars;
    earn = n * (BIZ.shop.perJob + BIZ.shop.perTools * lvl(e, 'tools'));
  }
  return { earn, used, short };
}
const capOf = (world, s, e) => Math.max(1000, BIZ.tillDays * dayOf(world, s, e, 99).earn);
function credit(e, amt) { e.till = Math.max(0, Math.round((e.till || 0) + amt)); store.touch(); }
// a new in-game day for a player in the city: each business's day in its till
function newDay(world, p) {
  const lines = [];
  for (const { s, e } of ownedBy(world, p.profile)) {
    if (e.day === world.day) continue;
    const first = e.day == null;
    e.day = world.day;
    if (first || s.t === 'truck') continue;
    const d = dayOf(world, s, e), cap = capOf(world, s, e);
    e.stock = Math.max(0, (e.stock | 0) - d.used);
    const before = e.till | 0, after = Math.max(before, Math.min(cap, before + d.earn));
    e.till = after;
    if (after > before) lines.push(`${s.name} ${money(after - before)}`);
    else if (d.earn > 0) lines.push(`${s.name}: the till's full - collect it`);
    if (d.short) lines.push(`${s.name} is short of ${TYPES[s.t].stock}`);
  }
  if (lines.length) { world.notify(p, `Your businesses: ${lines.join(' · ')}.`, 'info'); p.meDirty = true; store.touch(); }
}

// ---- earning as it's worked (the other systems tell us) ------------------------------------------------------------------
// a row of a field done (farming.js finishRow; p: who drove it - null for the farmhands): a harvest pays the farm's owner
export function farmRow(world, p, fieldIdx, job) {
  if (job !== 'harvest') return '';
  for (const s of sites(world)) {
    if (s.t !== 'farm' || !s.fields.includes(fieldIdx)) continue;
    const pid = ownerOf(world, s.id), q = pid && world.players.get(pid), prof = q ? q.profile : pid ? store.get(pid) : null, e = prof && prof.biz && prof.biz[s.id];
    if (!e) return '';
    const own = p && p.pid === pid;
    credit(e, BIZ.farm.row + (own ? BIZ.farm.own : 0));
    return own ? ` - ${money(BIZ.farm.row + BIZ.farm.own)} into ${s.name}'s till` : '';
  }
  return '';
}
// someone let into a club by its bouncer (nightclubs.js admit): the cover's the owner's
export function clubAdmit(world, c) {
  const e = ownedEntry(world, `club:${c.key}`);
  if (e) credit(e, BIZ.club.cover);
}
function ownedEntry(world, id) {
  const pid = ownerOf(world, id);
  if (!pid) return null;
  const q = world.players.get(pid), prof = q ? q.profile : store.get(pid);
  return (prof && prof.biz && prof.biz[id]) || null;
}
// the site a counter belongs to: a club's bar, the garage's counter
const siteOfPoi = (world, poi) => (poi ? sites(world).find((s) => s.poi === poi.id && s.t !== 'truck') || null : null);
// money spent at a counter (economy.js: a drink at a club's bar, a respray or a repair at the garage): the owner's cut
export function onSpend(world, p, poi, amt) {
  const s = siteOfPoi(world, poi);
  if (!s || mine(world, p, s)) return;
  const e = ownedEntry(world, s.id);
  if (e) credit(e, amt * (s.t === 'club' ? BIZ.club.barCut : BIZ.shop.cut));
}
// your own shop: its services are free (economy.js garage, paint.js the bay)
export const freeAt = (world, p, poi) => { const s = siteOfPoi(world, poi); return !!s && s.t === 'shop' && mine(world, p, s); };
const bayShop = (world, i) => sites(world).find((s) => s.t === 'shop' && s.bay === i) || null;
export const freeBay = (world, p, i) => mine(world, p, bayShop(world, i));
export function onBay(world, p, i, amt) {
  const s = bayShop(world, i);
  if (!s || mine(world, p, s)) return;
  const e = ownedEntry(world, s.id);
  if (e) credit(e, amt * BIZ.shop.cut);
}

// ---- the menus -------------------------------------------------------------------------------------------------------
const poiOfSite = (s) => -1 - s.i;
// a row in a counter's own menu (economy.js buildMenu): a club's bar, the garage's counter, the dealership
export function menuRow(world, p, poi, opts) {
  const s = poi && sites(world).find((q) => q.poi === poi.id);
  if (!s) return;
  const own = mine(world, p, s), pid = s.t !== 'truck' ? ownerOf(world, s.id) : null;
  if (s.t === 'truck') opts.push({ id: 'biz', label: own ? 'Your food truck business - the manager\'s menu' : 'A food truck of your own - a business', note: own ? 'stock, upgrades, the van' : `the Mr. Frosty van - ${money(s.price)}`, shut: 1 });
  else opts.push({ id: 'biz', label: own ? `The manager's office - ${s.name} is yours` : pid ? `The manager's office (${nameOf(pid)}'s ${TYPES[s.t].word})` : `The manager's office - ${s.name} is for sale`, note: own ? 'the till, stock, upgrades' : pid ? '' : `${money(s.price)} - a business`, shut: 1 });
}
export function openFrom(world, p, poi) {
  const s = poi && sites(world).find((q) => q.poi === poi.id);
  if (!s) return 'Nothing for sale here.';
  openMenu(world, p, s);
  return null;
}
const nameOf = (pid) => { const prof = store.get(pid); return (prof && prof.name) || 'someone'; };
export function openMenu(world, p, s) {
  if (!p.conn || !s) return;
  p.menu = { poi: poiOfSite(s) };
  p.conn.sendJSON(menuOf(world, p, s));
}
function stockRow(s, e) { const k = STOCK[s.t]; return { id: 'stock', label: `Buy ${TYPES[s.t].stock} x${k.qty}`, price: k.price, note: `${e.stock | 0} in stock` }; }
function upRows(s, e, opts) {
  for (const U of UPS[s.t]) {
    const n = lvl(e, U.key), max = U.prices.length, one = max === 1;
    if (n >= max) opts.push({ id: `up:${U.key}`, label: one ? `${U.name} - yours` : `${U.name} - level ${n} (the best)`, dis: true, note: U.what(n) });
    else opts.push({ id: `up:${U.key}`, label: one ? U.name : `${U.name} - level ${n + 1}`, price: U.prices[n], note: U.what(n + 1) });
  }
}
export function menuOf(world, p, s) {
  const prof = p.profile, own = mine(world, p, s), T0 = TYPES[s.t], opts = [];
  const head = { t: 'menu', poi: poiOfSite(s), cash: prof.cash, bank: prof.bank };
  if (!own) {
    const pid = s.t !== 'truck' ? ownerOf(world, s.id) : null;
    if (pid) return { ...head, title: s.name, sub: `${nameOf(pid)}'s ${T0.word}.`, opts: [{ id: 'close', label: 'Leave' }] };
    const n = ownedBy(world, prof).filter((o) => o.s.t !== 'truck').length, full = s.t !== 'truck' && n >= BIZ.max;
    const why = full ? `you own ${BIZ.max} already` : s.t === 'hideout' && p.badge ? 'not with a badge' : '';
    opts.push({ id: 'buy', label: `Buy ${s.t === 'truck' ? 'a food truck and the van' : s.name}`, price: s.price, dis: !!why, note: why || T0.word });
    opts.push({ id: 'close', label: 'Leave' });
    return { ...head, title: `${s.name} - for sale`, sub: `${T0.blurb}${s.t === 'farm' ? ` ${s.fields.length} field${s.fields.length === 1 ? '' : 's'}.` : ''}`, opts };
  }
  const e = s.t === 'truck' ? entryOf(p, 'truck') : entryOf(p, s.id), till = e.till | 0;
  if (s.t === 'hideout') {
    opts.push({ id: 'take', label: 'Take the product (hot money - clean it after)', price: till ? -till : undefined, dis: !till });
    opts.push({ id: 'run', label: `Run the product to a buyer (clean cash, x${BIZ.hideout.runMult})`, dis: !till || !!p.bizRun, note: p.bizRun ? 'a run on already' : till ? 'far across the world' : 'nothing ready' });
  } else opts.push({ id: 'take', label: 'Collect the takings', price: till ? -till : undefined, dis: !till });
  opts.push(stockRow(s, e));
  upRows(s, e, opts);
  if (s.t === 'club') { const cool = S(world).dj.get(s.id); opts.push({ id: 'dj', label: 'Take the decks - a DJ set', dis: !world.clock.isNight || (cool && world.time < cool.next), note: !world.clock.isNight ? 'at night' : cool && world.time < cool.next ? 'catch your breath' : 'the floor drops, they tip' }); }
  if (s.t === 'shop') opts.push({ id: 'job', label: `Bring a customer's car in to fix (${money(BIZ.shop.fix.pay + BIZ.shop.perTools * lvl(e, 'tools'))})`, dis: !!p.bizFix || world.time < (e.fixAt || 0), note: p.bizFix ? 'one waiting' : world.time < (e.fixAt || 0) ? 'none waiting yet' : 'a part fitted' });
  if (s.t === 'truck') {
    const v = truckOf(world, p);
    opts.push({ id: 'van', label: v ? 'Your van is out' : e.wrecked ? 'A new van (yours was wrecked)' : 'Take the van out', price: !v && e.wrecked ? BIZ.truck.replace : undefined, dis: !!v || Math.hypot(p.ped.x - s.x, p.ped.y - s.y) > 200, note: v ? 'park it where people are' : '' });
  }
  if (T0.home) { opts.push({ id: 'rest', label: 'Rest in the back room', note: 'full health' }); opts.push({ id: 'spawn', label: 'Wake up here after you die', dis: prof.lastSpawn === `biz:${s.id}` }); }
  opts.push({ id: 'sell', label: `Sell ${s.t === 'truck' ? 'the food truck' : s.name}`, price: -Math.round((e.paid || 0) * BIZ.sellBack) });
  opts.push({ id: 'close', label: 'Close' });
  const d = s.t === 'truck' ? null : dayOf(world, s, e);
  const sub = s.t === 'truck' ? `${e.stock | 0} meals · ${money(BIZ.truck.meal[lvl(e, 'menu')])} each · ${money(till)} in the till. Park where people are and open the hatch.`
    : `${money(till)} in the till (holds ${money(capOf(world, s, e))}) · about ${money(d.earn)} a day${d.short ? ` - short of ${T0.stock}` : ''} · ${e.stock | 0} ${T0.stock}.${s.t === 'hideout' ? ` ${guardCount(world, p, e)} guards at the door.` : ''}`;
  return { ...head, title: `${s.name} - yours`, sub, opts };
}
// the truck's own menu, out on the street (its hatch, its till, restocking)
function truckMenu(world, p) {
  const e = entryOf(p, 'truck'), v = truckOf(world, p), opts = [];
  if (!e || !v) return null;
  opts.push({ id: 'hatch', label: v.hatch ? 'Close the hatch' : 'Open the hatch - start selling', dis: !v.hatch && (e.stock | 0) <= 0, note: !v.hatch && (e.stock | 0) <= 0 ? 'no meals left' : v.hatch ? 'serving' : 'where people are' });
  opts.push({ id: 'take', label: 'Empty the till', price: e.till ? -(e.till | 0) : undefined, dis: !e.till });
  opts.push({ id: 'stock', label: `Buy meals x${BIZ.truck.food.qty} (the wholesaler delivers)`, price: BIZ.truck.food.price, note: `${e.stock | 0} left` });
  opts.push({ id: 'close', label: 'Close' });
  return { t: 'menu', poi: TRUCK_POI, title: 'Your food truck', sub: `${e.stock | 0} meals · ${money(BIZ.truck.meal[lvl(e, 'menu')])} each · ${money(e.till | 0)} in the till.`, opts, cash: p.profile.cash, bank: p.profile.bank };
}
// a choice from one of those menus (economy.js handleMenu: a negative poi)
export function onMenu(world, p, poiId, optId) {
  const ped = p.ped;
  if (!ped || ped.dead) return;
  let s = null, menu = null;
  if (poiId === TRUCK_POI) {
    const v = truckOf(world, p);
    if (!v || Math.hypot(ped.x - v.x, ped.y - v.y) > 120) { world.notify(p, 'You walked away from the truck.', 'warn'); return; }
    menu = truckMenu(world, p); s = siteById(world, entryOf(p, 'truck').site);
  } else {
    s = sites(world)[-1 - poiId];
    if (!s) return;
    const reach = s.poi != null ? (world.map.pois[s.poi].r || 40) + 60 : OFFICE_R + 40;
    if (ped.vehId || Math.hypot(ped.x - s.x, ped.y - s.y) > reach) { world.notify(p, 'You walked away from the office.', 'warn'); return; }
    menu = menuOf(world, p, s);
  }
  if (optId === 'close') return;
  const o = menu && menu.opts.find((q) => q.id === optId);
  const err = !o ? 'That option is not available here.' : o.dis ? 'Not available.' : run(world, p, s, optId, poiId === TRUCK_POI);
  if (err) world.notify(p, err, 'bad');
  p.meDirty = true;
  if (p.conn && optId !== 'van' && optId !== 'run' && optId !== 'job') { const again = poiId === TRUCK_POI ? truckMenu(world, p) : menuOf(world, p, s); if (again) p.conn.sendJSON(again); }
}
function run(world, p, s, opt, atTruck) {
  const prof = p.profile, [what, key] = opt.split(':');
  const id = s.t === 'truck' ? 'truck' : s.id, e = entryOf(p, id);
  if (what === 'buy') return buy(world, p, s);
  if (!e) return 'It isn\'t yours.';
  switch (what) {
    case 'take': {
      const amt = e.till | 0;
      if (!amt) return 'Nothing in the till.';
      e.till = 0;
      if (s.t === 'hideout') { hotmoney.add(world, p, amt, s.x, s.y); world.notify(p, `${money(amt)} of product in the bag - it's hot: clean it at a fence, a home's stash or an ATM well away from here.`, 'warn'); }
      else { prof.cash += amt; world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y }); world.notify(p, `${money(amt)} from ${s.t === 'truck' ? 'the food truck' : s.name}'s till.`, 'good'); }
      store.touch();
      return null;
    }
    case 'stock': {
      const k = STOCK[s.t];
      if (!pay(p, k.price)) return 'Not enough money.';
      e.stock = (e.stock | 0) + k.qty;
      store.touch();
      world.notify(p, `${k.qty} ${TYPES[s.t].stock} - ${e.stock} now.`, 'good');
      return null;
    }
    case 'up': {
      if (atTruck) return 'Upgrades at the dealership.';
      const U = UPS[s.t].find((q) => q.key === key), n = lvl(e, key);
      if (!U || n >= U.prices.length) return 'Nothing better.';
      if (!pay(p, U.prices[n])) return 'Not enough money.';
      (e.up ||= {})[key] = n + 1; e.paid = (e.paid || 0) + U.prices[n];
      store.touch();
      world.notify(p, `${U.name}${U.prices.length > 1 ? ` - level ${n + 1}` : ''}: ${U.what(n + 1)}.`, 'good');
      if (s.t === 'hideout' && key === 'guards') resetGuards(world, s);
      return null;
    }
    case 'rest': { const ped = p.ped; ped.hp = ped.maxHp; ped.bleeding = false; ped.stamina = skills.staminaFull(world, ped); world.emit(ped.x, ped.y, { e: 'heal', x: ped.x, y: ped.y }); world.notify(p, 'You rested up in the back room. Full health.', 'good'); return null; }
    case 'spawn': prof.lastSpawn = `biz:${s.id}`; store.touch(); world.notify(p, `You'll wake up at ${s.name} after you die.`, 'good'); return null;
    case 'sell': return sell(world, p, s);
    case 'dj': return djSet(world, p, s);
    case 'job': return startFix(world, p, s, e);
    case 'run': return startRun(world, p, s, e);
    case 'van': return vanOut(world, p, s, e);
    case 'hatch': { const v = truckOf(world, p); if (!v) return 'Your van isn\'t out.'; return setHatch(world, p, v, !v.hatch); }
    default: return 'No such thing.';
  }
}
export function buy(world, p, s) {
  const prof = p.profile;
  if (mine(world, p, s)) return 'It\'s yours already.';
  if (s.t !== 'truck' && ownerOf(world, s.id)) return 'Someone owns it already.';
  if (s.t !== 'truck' && ownedBy(world, prof).filter((o) => o.s.t !== 'truck').length >= BIZ.max) return `You own ${BIZ.max} businesses already - sell one first.`;
  if (s.t === 'hideout' && p.badge) return 'Not with a badge on.';
  if (!pay(p, s.price)) return `You need ${money(s.price)} (cash + bank).`;
  const e = { t: s.t, paid: s.price, up: {}, stock: STOCK[s.t].qty, till: 0, day: world.day };   // (a first load of stock comes with it)
  if (s.t === 'truck') { e.site = s.id; prof.biz = { ...(prof.biz || {}), truck: e }; }
  else { (prof.biz ||= {})[s.id] = e; owners(world).set(s.id, p.pid); }
  store.touch(); p.meDirty = true;
  world.notify(p, s.t === 'truck' ? 'A food truck of your own! Take the van out, park it where people are and open the hatch.' : `You bought ${s.name}! A ${TYPES[s.t].word} - its takings go in the till every day you're in the city. It's on your map, and somewhere to wake up and rest.`, 'good');
  return null;
}
export function sell(world, p, s) {
  const prof = p.profile, id = s.t === 'truck' ? 'truck' : s.id, e = entryOf(p, id);
  if (!e) return 'It isn\'t yours.';
  const back = Math.round((e.paid || 0) * BIZ.sellBack) + (s.t === 'hideout' ? 0 : e.till | 0);
  if (s.t === 'hideout' && e.till) hotmoney.add(world, p, e.till, s.x, s.y);
  delete prof.biz[id];
  if (s.t === 'truck') { const v = truckOf(world, p); if (v && !v.seats.some((q) => q)) world.remove(v); S(world).trucks.delete(p.pid); }
  else { owners(world).delete(s.id); if (s.t === 'hideout') resetGuards(world, s); }
  if (prof.lastSpawn === `biz:${s.id}`) prof.lastSpawn = null;
  prof.bank += back;
  store.touch(); p.meDirty = true;
  world.notify(p, `Sold ${s.t === 'truck' ? 'the food truck' : s.name} for ${money(back)} (paid into your bank).`, 'info');
  return null;
}

// ---- the office spots: the action button there ------------------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying) return null;
  const fx = p.bizFix && world.get(p.bizFix.v);
  if (fx && Math.hypot(fx.x - ped.x, fx.y - ped.y) < 70) {
    if (p.bizFix.at) return { label: `Fixing the customer's car... ${Math.max(1, Math.ceil(p.bizFix.at + BIZ.shop.fix.s - world.time))}s (stand by it)`, passive: true, run: () => {} };
    return { label: `Fix the customer's car - stand by it ${BIZ.shop.fix.s}s`, run: () => { p.bizFix.at = world.time; p.bizFix.px = ped.x; p.bizFix.py = ped.y; } };
  }
  const v = truckOf(world, p);
  if (v && Math.hypot(v.x - ped.x, v.y - ped.y) < 80 && Math.hypot(v.vx, v.vy) < 20 && !v.seats.some((q) => q)) {
    const e = entryOf(p, 'truck');
    return { label: v.hatch ? `Your food truck - serving (${e.stock | 0} meals, ${money(e.till | 0)} in the till)` : `Your food truck - open the hatch (${e.stock | 0} meals)`, run: () => { if (p.conn) { p.menu = { poi: TRUCK_POI }; p.conn.sendJSON(truckMenu(world, p)); } } };
  }
  for (const s of sites(world)) {
    if (s.poi != null || Math.abs(s.x - ped.x) > OFFICE_R || Math.abs(s.y - ped.y) > OFFICE_R || Math.hypot(s.x - ped.x, s.y - ped.y) > OFFICE_R) continue;
    const pid = ownerOf(world, s.id);
    const label = pid === p.pid ? `${s.name} - your ${TYPES[s.t].word}: the manager's menu (${money(entryOf(p, s.id).till | 0)} in the till)` : pid ? `${s.name} - ${nameOf(pid)}'s ${TYPES[s.t].word}` : `For sale: ${s.name} - a ${TYPES[s.t].word}, ${money(s.price)}`;
    return { label, run: () => openMenu(world, p, s) };
  }
  return null;
}

// ---- waking up there (homes.js spawnOptions / resolveSpawn) ---------------------------------------------------------
export const spawnSites = (world, prof) => ownedBy(world, prof).filter(({ s }) => TYPES[s.t].home).map(({ s }) => s);
export function spawnAt(world, p, id) {
  const s = siteById(world, id);
  if (!s || !TYPES[s.t].home || ownerOf(world, s.id) !== p.pid) return null;
  return { x: s.x, y: s.y + 8, name: s.name };
}
// (players.js self record) your businesses on the map: { n, k (the map icon's kind), x, y }
export function mapList(world, prof) {
  if (!prof.biz) return null;
  const out = ownedBy(world, prof).map(({ s, id }) => {
    const p = world.players.get(prof.pid), v = id === 'truck' && p ? truckOf(world, p) : null;
    return { n: id === 'truck' ? 'Your food truck' : s.name, k: TYPES[s.t].icon, x: Math.round(v ? v.x : s.ax ?? s.x), y: Math.round(v ? v.y : s.ay ?? s.y) };
  });
  return out.length ? out : null;
}
// (realestate.js) the businesses for sale - nearest first - and yours
export function listings(world, p, n = 30) {
  const ped = p.ped, near = (s) => (ped ? Math.hypot(s.x - ped.x, s.y - ped.y) : 0);
  const row = (s) => ({ id: s.id, n: s.name, t: s.t, w: TYPES[s.t].word, p: s.price, x: s.x, y: s.y, d: s.d, dt: s.dt, b: TYPES[s.t].short, ...(s.t === 'farm' ? { f: s.fields.length } : null) });
  const all = sites(world), free = all.filter((s) => (s.t === 'truck' ? !entryOf(p, 'truck') : !ownerOf(world, s.id)));
  const trucks = free.filter((s) => s.t === 'truck').sort((a, b) => near(a) - near(b)).slice(0, 1);
  const sale = [...free.filter((s) => s.t !== 'truck'), ...trucks].sort((a, b) => near(a) - near(b)).slice(0, n).map(row);
  const yours = ownedBy(world, p.profile).map(({ s, e }) => ({ ...row(s), till: e.till | 0, stock: e.stock | 0, worth: Math.round((e.paid || 0) * BIZ.sellBack) }));
  return { sale, mine: yours, total: free.length };
}

// ---- the club's decks -----------------------------------------------------------------------------------------------
function djSet(world, p, s) {
  const c = nightclubs.clubByKey(world, s.key);
  if (!c || c.state !== 'open') return 'The club\'s shut - the decks are for the night.';
  const B = S(world), now = world.time, st = B.dj.get(s.id);
  if (st && now < st.next) return 'Catch your breath first.';
  B.dj.set(s.id, { until: now + BIZ.club.dj.s, next: now + BIZ.club.dj.s + BIZ.club.dj.cool, tipAt: now + BIZ.club.dj.every, pid: p.pid });
  nightclubs.drop(world, c, Math.min(BIZ.club.dj.s, 20));
  world.notify(p, `You're on the decks at ${s.name}: the floor goes up - and they tip, for the next ${BIZ.club.dj.s} seconds.`, 'good');
  return null;
}
function djTips(world) {
  const B = S(world), now = world.time;
  for (const [id, st] of B.dj) {
    if (now > st.until || now < st.tipAt) continue;
    st.tipAt = now + BIZ.club.dj.every;
    const s = siteById(world, id), c = s && nightclubs.clubByKey(world, s.key), e = ownedEntry(world, id);
    if (!c || !e || c.state !== 'open') { st.until = 0; continue; }
    const n = c.dancers.filter((q) => { const d = world.get(q); return d && !d.dead && !d.removed; }).length;
    if (n) credit(e, n * BIZ.club.dj.tip);
  }
}

// ---- the auto shop's customer car ------------------------------------------------------------------------------------
function startFix(world, p, s, e) {
  if (p.bizFix) return 'There\'s a car waiting for you already.';
  if ((e.stock | 0) <= 0) return 'No parts to fit - buy some first.';
  const m = world.map;
  let spot = null, bd = 420;
  for (const q of m.parking || []) { const d = Math.hypot(q.x - s.x, q.y - s.y); if (d < bd && !world.query(q.x, q.y, 50, K.VEH).length) { bd = d; spot = q; } }
  if (!spot) { const at = standNear(m, s.x + 90, s.y + 60, 240); if (at) spot = { x: at.x, y: at.y, a: 0 }; }
  if (!spot) return 'Nowhere to put the car - clear the lot.';
  const models = ['sedan', 'compact', 'pickup', 'van'], model = models[Math.floor(rng() * models.length)];
  const v = world.spawnVehicle(model, spot.x, spot.y, spot.a ?? 0, { npcOwned: true });
  v.hp = Math.round(v.def.hp * 0.35); v.despawnable = false; v.bizCar = p.pid;
  p.bizFix = { v: v.id, site: s.id, at: 0 };
  e.fixAt = world.time + BIZ.shop.fix.cool;
  world.notify(p, `A customer's ${v.def.name} is on the lot - go and stand by it to fix it.`, 'info');
  return null;
}
function stepFix(world, p) {
  const F = p.bizFix, v = world.get(F.v), ped = p.ped, s = siteById(world, F.site), e = s && entryOf(p, s.id);
  if (!v || v.removed || !e || v.wreckAt) { p.bizFix = null; if (v && !v.removed) v.despawnable = true; return; }
  if (v.seats.some((q) => q)) { p.bizFix = null; v.despawnable = true; v.bizCar = 0; world.notify(p, 'The customer\'s car was taken - no job.', 'bad'); return; }
  if (!F.at) return;
  if (!ped || ped.dead || ped.vehId || Math.hypot(ped.x - F.px, ped.y - F.py) > 24 || Math.hypot(v.x - ped.x, v.y - ped.y) > 80) { F.at = 0; world.notify(p, 'You stepped away from the car.', 'warn'); return; }
  if (world.time - F.at < BIZ.shop.fix.s) return;
  const pay0 = BIZ.shop.fix.pay + BIZ.shop.perTools * lvl(e, 'tools');
  e.stock = Math.max(0, (e.stock | 0) - 1);
  credit(e, pay0);
  v.hp = v.def.hp; v.flat = false; v.dz = 0; v.holes = 0;
  v.despawnable = true; v.bizCar = 0;
  p.bizFix = null;
  world.emit(v.x, v.y, { e: 'heal', x: v.x, y: v.y });
  world.notify(p, `Fixed - the customer pays ${money(pay0)} into ${s.name}'s till.`, 'good');
  p.meDirty = true;
}

// ---- the hideout's product run to a buyer -----------------------------------------------------------------------------
function startRun(world, p, s, e) {
  if (p.bizRun) return 'You\'re on a run already.';
  const amt = e.till | 0;
  if (!amt) return 'Nothing ready.';
  const m = world.map, cands = [];
  for (const q of sites(world)) if (q.t === 'hideout' && q.id !== s.id) cands.push({ x: q.x, y: q.y, label: `a buyer at ${q.name}` });
  for (const q of m.pois) if (q && (q.kind === 'fence' || q.kind === 'smuggler' || q.kind === 'pawn' || q.kind === 'gang')) cands.push({ x: q.x, y: q.y, label: `a buyer by ${q.label}` });
  const far = cands.filter((c) => Math.hypot(c.x - s.x, c.y - s.y) >= BIZ.hideout.runPx);
  const pool = far.length ? far : cands.sort((a, b) => Math.hypot(b.x - s.x, b.y - s.y) - Math.hypot(a.x - s.x, a.y - s.y)).slice(0, 1);
  if (!pool.length) return 'No buyer anywhere.';
  const to = pool[Math.floor(rng() * pool.length)];
  e.till = 0;
  p.bizRun = { amt, x: Math.round(to.x), y: Math.round(to.y), label: to.label, from: s.id };
  store.touch();
  world.notify(p, `${money(amt)} of product packed - take it to ${to.label} (on your map) for ${money(amt * BIZ.hideout.runMult)} clean. Get killed or cuffed and it's gone.`, 'warn');
  return null;
}
function stepRun(world, p) {
  const R = p.bizRun, ped = p.ped;
  if (!ped) return;
  if (ped.dead || ped.cuffed) { p.bizRun = null; world.notify(p, 'The product\'s gone - the run fell through.', 'bad'); p.meDirty = true; return; }
  if (Math.hypot(ped.x - R.x, ped.y - R.y) > RUN_REACH) return;
  const cash = Math.round(R.amt * BIZ.hideout.runMult);
  p.profile.cash += cash;
  p.bizRun = null;
  store.touch(); p.meDirty = true;
  world.emit(ped.x, ped.y, { e: 'cash', x: ped.x, y: ped.y });
  world.notify(p, `The buyer takes it: ${money(cash)}, clean.`, 'good');
}
// the waypoint while a run's on, a car's waiting or the decks: players.js self record's job (as golf.targetFor)
export function targetFor(world, p) {
  if (p.bizRun) return { text: `Product run: ${p.bizRun.label} (${money(p.bizRun.amt * BIZ.hideout.runMult)})`, x: p.bizRun.x, y: p.bizRun.y, stage: 'biz' };
  const v = p.bizFix && world.get(p.bizFix.v);
  if (v) return { text: 'A customer\'s car to fix - stand by it', x: Math.round(v.x), y: Math.round(v.y), stage: 'biz' };
  return null;
}

// ---- the hideout's guards ---------------------------------------------------------------------------------------------
const guardCount = (world, p, e) => BIZ.hideout.guards0 + lvl(e, 'guards') + (gang.isMember(p) ? 1 : 0);
function resetGuards(world, s) {
  const B = S(world);
  for (const id of B.guards.get(s.id) || []) { const g = world.get(id); if (g && !g.removed) despawnNpc(world, g); }
  B.guards.delete(s.id);
}
function posts(world, s, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.4, at = standNear(world.map, s.x + Math.cos(a) * 70, s.y + Math.sin(a) * 50, 90);
    if (at) out.push(at);
  }
  return out;
}
function guardHideouts(world) {
  const B = S(world), now = world.time;
  const live = [...world.players.values()].filter((q) => q.ped && !q.ped.dead);
  for (const s of sites(world)) {
    if (s.t !== 'hideout') continue;
    const pid = ownerOf(world, s.id), list = (B.guards.get(s.id) || []).filter((id) => { const g = world.get(id); return g && !g.removed; });
    const near = live.some((q) => Math.hypot(q.ped.x - s.x, q.ped.y - s.y) < GUARD_NEAR), far = !live.some((q) => Math.hypot(q.ped.x - s.x, q.ped.y - s.y) < GUARD_FAR);
    if (!pid || far) { if (list.length) resetGuards(world, s); continue; }
    if (list.length && list.every((id) => world.get(id).dead)) { if (!B.guardsGone.has(s.id)) B.guardsGone.set(s.id, now + BIZ.hideout.respawnS); }
    if (!list.length && near && now >= (B.guardsGone.get(s.id) || 0)) {
      B.guardsGone.delete(s.id);
      const op = world.players.get(pid), prof = op ? op.profile : store.get(pid), e = prof && prof.biz && prof.biz[s.id];
      const n = BIZ.hideout.guards0 + lvl(e, 'guards') + (prof && prof.gang === 'syndicate' ? 1 : 0);
      for (const at of posts(world, s, n)) {
        const g = spawnNpc(world, 'syndicate', at.x, at.y, 'gang');
        g.npc.keep = true; g.npc.guard = { x: at.x, y: at.y, a: Math.atan2(at.y - s.y, at.x - s.x) }; g.npc.bizGuard = s.id;
        g.weapon = list.length % 3 === 2 ? 'smg' : 'pistol';
        list.push(g.id);
      }
    }
    B.guards.set(s.id, list);
    if (!list.length) continue;
    // the owner hurt nearby: they go for whoever did it
    const op = world.players.get(pid), oped = op && op.ped;
    if (oped && !oped.dead && Math.hypot(oped.x - s.x, oped.y - s.y) < 700 && oped.lastHitBy) {
      const a = world.get(oped.lastHitBy);
      if (a && !a.dead && now - (a.lastCombatAt || -99) < 2 && a !== oped) for (const id of list) { const g = world.get(id); if (g && !g.dead && g.npc.state !== 'fight') startFight(world, g, a, 40); }
    }
    // outsiders in the yard: one warning, then the guards open up
    for (const q of live) {
      const ped = q.ped, key = `${s.id}:${q.pid}`;
      const out = q.pid !== pid && !(op && crews.mates(q, op)) && !ped.hidden && Math.hypot(ped.x - s.x, ped.y - s.y) < BIZ.hideout.yardPx;
      if (!out) { const w0 = B.warned.get(key); if (w0 && now - w0 > 30) B.warned.delete(key); continue; }
      const seen = list.some((id) => { const g = world.get(id); return g && !g.dead && Math.hypot(g.x - ped.x, g.y - ped.y) < 460 && world.map.los(g.x, g.y, ped.x, ped.y); });
      if (!seen) continue;
      const w0 = B.warned.get(key);
      if (!w0) { B.warned.set(key, now); world.notify(q, `Guards at ${s.name}: "Private property! Walk away - you've got ${BIZ.hideout.warnS} seconds."`, 'bad'); continue; }
      if (now - w0 < BIZ.hideout.warnS) continue;
      for (const id of list) { const g = world.get(id); if (g && !g.dead && g.npc.state !== 'fight' && Math.hypot(g.x - ped.x, g.y - ped.y) < 460) startFight(world, g, ped, 40); }
    }
  }
}
export const guardsOf = (world, id) => (S(world).guards.get(id) || []).map((g) => world.get(g)).filter(Boolean);

// ---- the food truck --------------------------------------------------------------------------------------------------
export function truckOf(world, p) {
  const id = S(world).trucks.get(p.pid), v = id && world.get(id);
  if (!v || v.removed) { if (id) S(world).trucks.delete(p.pid); return null; }
  return v;
}
function vanOut(world, p, s, e) {
  if (truckOf(world, p)) return 'Your van is out already.';
  if (e.wrecked && !pay(p, BIZ.truck.replace)) return `A new van is ${money(BIZ.truck.replace)}.`;
  const spot = s.lot || (() => { const at = standNear(world.map, s.x, s.y + 90, 260); return at ? { x: at.x, y: at.y, a: -Math.PI / 2 } : null; })();
  if (!spot) return 'Nowhere to bring it round.';
  for (const q of world.query(spot.x, spot.y, 80, K.VEH)) if (!q.seats.some((z) => z)) world.remove(q);
  const v = world.spawnVehicle('icecream', spot.x, spot.y, spot.a ?? 0, { paint: 0, owner: p.pid, ownerName: p.name, npcOwned: false });
  v.despawnable = false; v.foodTruck = p.pid; v.hatch = false;
  e.wrecked = false;
  S(world).trucks.set(p.pid, v.id);
  world.notify(p, 'Your food truck is out front. Park it where people are, step out and open the hatch.', 'good');
  return null;
}
function setHatch(world, p, v, open) {
  const e = entryOf(p, 'truck');
  if (open && (e.stock | 0) <= 0) return 'No meals left - restock first.';
  if (open && Math.hypot(v.vx, v.vy) > 20) return 'Park it first.';
  v.hatch = open; v.serveAt = world.time + serveS(e);
  world.notify(p, open ? 'The hatch is up - you\'re open. The more people about, the quicker it sells.' : 'The hatch is down.', 'info');
  return null;
}
const serveS = (e) => BIZ.truck.serveS * (1 - BIZ.truck.grillCut * lvl(e, 'grill'));
function stepTrucks(world) {
  const B = S(world), now = world.time;
  for (const [pid, id] of B.trucks) {
    const v = world.get(id), p = world.players.get(pid), e = p && entryOf(p, 'truck');
    if (!v || v.removed || !p || !e) { if (v && !v.removed && !v.seats.some((q) => q)) world.remove(v); B.trucks.delete(pid); continue; }
    if (v.wreckAt) { e.wrecked = true; v.hatch = false; B.trucks.delete(pid); v.despawnable = true; world.notify(p, 'Your food truck is wrecked - a new van at the dealership.', 'bad'); store.touch(); continue; }
    if (!v.hatch) continue;
    const ped = p.ped;
    if (Math.hypot(v.vx, v.vy) > 20 || !ped || ped.dead || Math.hypot(ped.x - v.x, ped.y - v.y) > TRUCK_NEAR) { v.hatch = false; world.notify(p, 'The food truck\'s hatch comes down.', 'info'); continue; }
    if ((e.stock | 0) <= 0) { v.hatch = false; world.notify(p, 'Sold out! Restock and open up again.', 'warn'); continue; }
    if (now < v.serveAt) continue;
    const crowd = world.query(v.x, v.y, BIZ.truck.crowdR, K.PED).filter((q) => q.npc && !q.dead && !q.vehId && q.npc.role === 'civ' && !q.npc.desk && !q.npc.dancer);
    v.serveAt = now + serveS(e) / Math.min(3, 1 + crowd.length / 6);
    if (!crowd.length) continue;
    // someone comes over for a meal: they walk up to the hatch (its side), and it's sold
    const q = crowd[Math.floor(rng() * crowd.length)], nx = -Math.sin(v.a), ny = Math.cos(v.a);
    if (q.npc.state !== 'fight' && q.npc.state !== 'flee') { q.npc.state = 'wander'; q.npc.until = now + 8; q.npc.wx = v.x + nx * (v.def.W / 2 + 18); q.npc.wy = v.y + ny * (v.def.W / 2 + 18); }
    e.stock = (e.stock | 0) - 1;
    credit(e, BIZ.truck.meal[lvl(e, 'menu')]);
    world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y });
    p.meDirty = true;
  }
}

// ---- every tick -------------------------------------------------------------------------------------------------------
export function update(world) {
  if (world.tick % 40 === 31) {
    owners(world);
    for (const p of world.players.values()) {
      if (!p.profile.biz) continue;
      if (p.profile.biz && !p.bizClaimed) { p.bizClaimed = true; claimAll(world, p.profile); }   // (a profile that came after the start)
      newDay(world, p);
    }
  }
  if (world.tick % 10 === 4 && world.biz && world.biz.owner && world.biz.owner.size) guardHideouts(world);
  if (world.tick % 20 === 7 && world.biz && world.biz.trucks.size) stepTrucks(world);
  if (world.tick % 20 === 13 && world.biz && world.biz.dj.size) djTips(world);
  if (world.tick % 5 === 2) for (const p of world.players.values()) { if (p.bizFix) stepFix(world, p); if (p.bizRun) stepRun(world, p); }
}
