// Playtest/debug commands: accepted when the server runs with CLA_DEV=1 (offline practice), or
// online from a player in Dev Debug Mode (devmode.js - nothing they do there is saved).
import { surfaceZ } from '../shared/levels.js';
import { PED_BLOCK, CAR_SPAWN_BLOCK } from '../shared/map.js';
import { DAY_LOOP_S, DAY_PART_S, STAR_HEAT, T, K, WEATHER, TILE } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { blastSize } from '../shared/explosions.js';
import { collideVehicleTiles } from '../shared/physics.js';
import { WEAPONS, ITEMS, PACK_TIERS } from '../shared/items.js';
import { PACK_LIFE_S } from '../shared/rules.js';
import { store } from './store.js';
import * as env from './systems/environment.js';
import * as jobs from './systems/jobs.js';
import * as law from './systems/law.js';
import * as bounties from './systems/bounties.js';
import * as combat from './systems/combat.js';
import * as vehicles from './systems/vehicles.js';
import * as explosions from './systems/explosions.js';
import * as cargo from './systems/cargo.js';
import * as npc from './systems/npc.js';
import * as burning from './systems/burning.js';
import * as gangwar from './systems/gangwar.js';
import * as cruiser from './systems/cruiser.js';
import * as trains from './systems/trains.js';
import * as hotmoney from './systems/hotmoney.js';
import * as devmode from './devmode.js';
import * as pets from './systems/pets.js';
import * as happenings from './systems/happenings.js';
import * as streetlife from './systems/streetlife.js';
import * as wildlife from './systems/wildlife.js';
import * as sharks from './systems/sharks.js';
import * as wanderer from './systems/wanderer.js';
import * as personas from './systems/personas.js';
import * as activities from './systems/activities.js';
import * as looks from './systems/looks.js';
import { SPECIES } from '../shared/fauna.js';
import { undergroundOf, caveNear } from '../shared/underground.js';
import * as underground from './systems/underground.js';
import * as rescue from './systems/rescue.js';
import * as revive from './systems/revive.js';
import * as devplay from './devplay.js';
import { kerbFor } from './systems/kerbdrive.js';
import { Z } from '../shared/citylayout.js';

// make a live animal the pure white legend of its kind (dev: see one up close)
function w2legend(world, e) {
  const S = SPECIES[e.wild.kind];
  if (!S || !S.legend) return;
  world.remove(e);
  wildlife.spawnAnimal(world, e.wild.kind, e.x, e.y, e.wild.herd, { legend: true, lead: true });
}

import { airfields } from '../shared/flight.js';
import * as sar from './systems/sar.js';
import * as coastguard from './systems/coastguard.js';
import * as gardening from './systems/gardening.js';
import * as farming from './systems/farming.js';
import * as homes from './systems/homes.js';
import * as homeinside from './systems/homeinside.js';
import * as policeair from './systems/policeair.js';
import * as airtraffic from './systems/airtraffic.js';
import * as firefighter from './systems/firefighter.js';
import * as paramedic from './systems/paramedic.js';
import * as taxijob from './systems/taxijob.js';
import * as busjob from './systems/busjob.js';
import * as towjob from './systems/towjob.js';
const { clearSpot } = cruiser;

export const DEV_COMMANDS = ['god', 'godp', 'gunsp', 'healp', 'shootout', 'die', 'snatch', 'cargo', 'rain', 'clear', 'night', 'day', 'money', 'wanted', 'clean', 'record', 'cop', 'promote', 'samaritan', 'pet', 'car', 'guns', 'give', 'drop', 'heal', 'tp', 'train', 'calltrain', 'goto', 'bring', 'grant', 'spectate', 'time', 'near', 'wxhold', 'clockhold', 'hunt', 'animal', 'wind', 'wanderer', 'bounty', 'hunter', 'revenge', 'packs', 'hot', 'blast', 'street', 'home', 'wardrobe', 'rescue', 'act', 'vdmg', 'burn', 'sar', 'coast', 'garden', 'farm', 'homein', 'policeair', 'airtraffic', 'firejob', 'medicjob', 'decor', 'lobby', 'cabjob', 'busjob', 'towjob'];

// "Take me there": the places a test can start from, by key - a kind of place on the map (pois), a
// landmark type, a designed nature place, a street-race start or a pitch / court. near() finds the
// closest one to the player and puts them on open ground beside it (inside, at the desk, for walk-ins).
export const NEAR_KINDS = {
  bikerack: (m) => m.props.filter((q) => q.t === 'bikerack').map((q) => ({ x: q.x, y: q.y + 40, name: 'a bike rack' })),
  // (every line's stops: World v3 runs a rail per loop - m.rail is only the first, the main line - the owner, 2026-10-15:
  // "find nearest subway station ... says there is no subway station on this map")
  subway: (m) => railStops(m, (s, r) => s.under && (s.kiosk || r.subway)).map((s) => (s.kiosk ? { x: s.kiosk.out.x, y: s.kiosk.out.y, name: s.name } : { x: s.platform.x, y: s.platform.y, name: s.name })),
  platform: (m) => railStops(m, (s) => !s.under).map((s) => ({ x: s.platform.x, y: s.platform.y, name: s.name })),
  race: (m) => (m.races || []).filter((r) => r.start).map((r) => ({ x: r.start.x, y: r.start.y, name: r.name || 'Race start', craft: r.kind === 'jetski' ? 'jetski' : r.kind === 'boat' ? 'speedboat' : null })),
  venue: (m) => (m.venues || []).filter((v) => v.rect).map((v) => ({ x: v.rect.x + v.rect.w / 2, y: v.rect.y + v.rect.h + 24, name: v.name || v.kind })),
  nature: (m) => (m.natureSites || []).map((q) => ({ x: q.x, y: q.y, name: q.name || q.kind })),
  beaver: (m) => (m.beaverPonds || []).map((b) => ({ x: b.x + 160, y: b.y + 140, name: `${b.name || 'Heron Marsh'} beaver pond` })),
  campfire: (m) => m.props.filter((q) => q && q.t === 'campfire').map((q) => ({ x: q.x, y: q.y + 30, name: 'a campfire' })),
  // under the ground (shared/underground.js): a manhole over the sewers, the cave's mouth (the Old Granite Mine's adit), an
  // ore vein above ground (the quarry's, the mine's outcrops)
  manhole: (m) => { const L = undergroundOf(m); return L ? L.routes.flatMap((r) => r.manholes).map((q) => ({ x: q.x, y: q.y, name: 'a manhole over the sewers' })) : []; },
  cave: (m) => { const L = undergroundOf(m); return L ? L.caves.map((K) => ({ x: K.mouth.x, y: K.mouth.y + 4, name: L.caves.length > 1 ? `the cave's mouth (${K.name})` : 'the cave\'s mouth' })) : []; },   // (a cave per mine)
  vein: (m) => { const L = undergroundOf(m); return L ? L.veins.filter((v) => !v.ug).map((v) => ({ x: v.x, y: v.y, name: `a vein of ${v.ore} (${v.where})` })) : []; },
  stargaze: (m) => { const s = (m.countrySites || []).find((q) => q.type === 'observatory'); return s ? m.props.filter((q) => q && q.t === 'scope' && q.x >= s.x * 32 && q.x <= (s.x + s.w) * 32 && q.y >= s.y * 32 && q.y <= (s.y + s.h) * 32).map((q) => ({ x: q.x + 14, y: q.y + 24, name: 'the observatory telescope' })) : []; },
  // flying (shared/flight.js): the foot of each runway (the far end ahead, the way to take off), the helipads
  runway: (m) => (m.airports || []).map((A) => ({ x: A.runway.x + A.runway.w / 2, y: A.runway.y + A.runway.h - 120, name: `${A.name}'s runway` })),
  helipad: (m) => airfields(m).pads.filter((p) => !p.roof).map((p) => ({ x: p.x + 90, y: p.y, name: p.name })),
  skatespot: (m) => (m.skateSpots || []).map((q) => ({ x: (q.x + q.w / 2) * TILE, y: (q.y + q.h / 2) * TILE, name: q.name })),
};
// the stops of every line on the map (one each: a hub's stop is shared by the loops through it), those keep(stop, rail) takes
function railStops(m, keep) {
  const out = [], seen = new Set();
  for (const r of m.rails || (m.rail ? [m.rail] : [])) for (const s of r.stations || []) {
    const k = `${s.name}|${Math.round(s.x / 400)}|${Math.round(s.y / 400)}`;
    if (seen.has(k) || !keep(s, r)) continue;
    seen.add(k); out.push(s);
  }
  return out;
}
export function nearTargets(m, k) {
  if (NEAR_KINDS[k]) return NEAR_KINDS[k](m);
  const pois = m.pois.filter((q) => q.kind === k).map((q) => ({ x: q.x, y: q.y, name: q.label || q.name || k }));   // (walk-ins: at the desk inside)
  if (pois.length) return pois;
  const lm = (m.landmarks || []).filter((l) => l.type === k).map((l) => ({ x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2, name: l.name || k }));
  if (lm.length) return lm;
  return (m.natureSites || []).filter((q) => q.kind === k).map((q) => ({ x: q.x, y: q.y, name: q.name || k }));
}
// The debug teleport's landing (client/devtp.js sends msg.snap: the page holds only its window of World v3's world, so
// it can't look at the far place's tiles - the server, which has the whole map, picks the spot): the open pavement
// nearest (x, y), else open ground, never on a deck, in a building or the water; within 160 tiles, else (x, y) itself.
const TP_PAVED = new Set([T.SIDEWALK, T.PLAZA]), TP_OPEN = new Set([T.LOT, T.GRASS, T.SAND, T.DIRT, T.DOCK, T.FIELD]);
export function tpSpot(m, x, y) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  let best = null, bd = Infinity;
  for (let r = 0; r < 160 && !best; r += 4) {
    for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) < r - 4 || !m.inside(tx, ty)) continue;
      const i = m.idx(tx, ty), t = m.tiles[i];
      if ((m.deck && m.deck[i]) || !(TP_PAVED.has(t) || TP_OPEN.has(t))) continue;
      const d = Math.hypot(tx - cx, ty - cy) + (TP_PAVED.has(t) ? 0 : 12);
      if (d < bd) { bd = d; best = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
    }
  }
  return best || { x, y };
}
// open ground you can stand on (or, water: open water), as close to (x, y) as there is within reach
// A hunt to watch (Nature-A2, server wildlife.js the hunt), set up a little way ahead of you - far enough off that it
// isn't given up for you being there: wolves run down a deer, a cougar creeps up on one, an eagle stoops on a rabbit, a
// fox mouses, a heron, a bear, an otter fish, an osprey drops into the water. What it said, or null (no room here).
function huntScene(world, ped, scene, k = 0) {
  const said = setScene(world, ped, scene, k);
  // (the one watching goes unnoticed by what it set up - wildlife.js: so it plays out in front of them)
  if (said) for (const e of wildlife.animals(world)) if (!e.dead && world.time - (e.bornAt ?? -1) < 0.01 && Math.hypot(e.x - ped.x, e.y - ped.y) < 1600) { e.wild.watchedBy = ped.id; e.wild.watchUntil = world.time + 120; }
  return said;
}
function setScene(world, ped, scene, k = 0) {
  // (to the east or the west first - the long way across the screen, so it stays in view - then the other ways round)
  const dir = [0, Math.PI, ped.a, ped.a + 1, ped.a - 1, ped.a + 2, ped.a - 2][k];
  if (dir === undefined) return null;
  const ax = Math.cos(dir), ay = Math.sin(dir), at = (d, s = 0) => standAt(world, ped.x + ax * d - ay * s, ped.y + ay * d + ax * s, 200);
  const herd = (kind, pt) => { wildlife.spawnGroup(world, kind, pt.x, pt.y, false); return wildlife.animals(world).filter((e) => e.wild.kind === kind && !e.dead && Math.hypot(e.x - pt.x, e.y - pt.y) < 140); };
  const water = () => standAt(world, ped.x + ax * 420, ped.y + ay * 420, 900, true);
  switch (scene) {
    case 'wolves': case 'cougar': case 'eagle': {
      const P = at(scene === 'eagle' ? 360 : 400), H = at(400, scene === 'wolves' ? 820 : 560);   // (the hunters off to one side of it: the chase runs across your view, not at you)
      if (!P || !H) return setScene(world, ped, scene, k + 1);
      const prey = herd(scene === 'eagle' ? 'rabbit' : 'deer', P), q = prey.find((e) => !e.wild.young) || prey[0];
      const hunters = scene === 'wolves' ? herd('wolf', H) : [wildlife.spawnAnimal(world, scene, H.x, H.y, 0, { lead: true })];
      const lead = hunters.find((e) => e.wild.lead) || hunters[0];
      if (!q || !lead) return null;
      wildlife.startHunt(world, lead, q);
      return scene === 'wolves' ? `A wolf pack (${hunters.length}) on a deer ahead of you - keep back and watch.` : scene === 'cougar' ? 'A mountain lion creeping up on a deer ahead of you - keep still.' : 'A bald eagle after a rabbit ahead of you.';
    }
    case 'fox': { const P = at(330); if (!P) return setScene(world, ped, scene, k + 1); const f = wildlife.spawnAnimal(world, 'redfox', P.x, P.y, 0, { lead: true }); wildlife.startMousing(world, f); return 'A red fox mousing in the grass ahead of you.'; }
    case 'heron': case 'bear': case 'otter': {
      const W = water();
      if (!W) return null;
      const kind = scene === 'bear' ? 'blackbear' : scene;
      const pt = scene === 'otter' ? W : wildlife.edgeSpot(world.map, W.x, W.y) && { x: W.x, y: W.y };
      const g = scene === 'otter' ? W : standAt(world, pt.x, pt.y, 300);
      if (!g) return null;
      const a = wildlife.spawnAnimal(world, kind, g.x, g.y, 0, { lead: true });
      a.wild.calmUntil = 0;
      if (!wildlife.startFishing(world, a)) return `${a.name} by the water (nowhere to fish from here).`;
      return `${a.name.replace(/^a /, 'A ')} off to fish, just ahead of you.`;
    }
    case 'osprey': {
      const W = water();
      if (!W) return null;
      const a = wildlife.spawnAnimal(world, 'osprey', W.x - ay * 300, W.y + ax * 300, 0, { lead: true });
      wildlife.startPlunge(world, a, W.x, W.y);
      return 'An osprey dropping on a fish ahead of you.';
    }
    default: return null;
  }
}
function standAt(world, x, y, reach = 320, water = false) {
  const m = world.map;
  const ok = (px, py) => { const t = m.tileAtPx(px, py); return water ? t === T.WATER || t === T.DEEP : !PED_BLOCK[t] && !m.isWater(px, py); };
  if (ok(x, y)) return { x, y };
  for (let r = 16; r <= reach; r += 16) for (let k = 0, n = Math.max(16, Math.round(r / 10)); k < n; k++) { const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return { x: px, y: py }; }
  return null;
}
export function near(world, p, k) {
  const ped = p.ped;
  if (!ped || ped.dead) return '[dev] Not while you\'re down.';
  const list = nearTargets(world.map, String(k || '').slice(0, 24));
  if (!list.length) return `[dev] There's no "${k}" on this map.`;
  let best = null, bd = Infinity;
  for (const q of list) { const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d > 120 && d < bd) { bd = d; best = q; } } // (the next one along if you're already at one)
  best ||= list[0];
  const at = standAt(world, best.x, best.y, best.craft ? 1800 : 320);   // (a race out on the water: the nearest shore)
  if (!at) return `[dev] Couldn't find open ground by ${best.name}.`;
  if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
  if (ped.vehId) return '[dev] Get out of the vehicle first.';
  ped.sub = false; ped.ug = 0; ped.x = at.x; ped.y = at.y; ped.lz = 0; ped.vx = 0; ped.vy = 0; p.teleportAt = world.time;
  if (best.craft) { // and the right craft in the water beside you
    const wat = standAt(world, at.x + Math.sign(best.x - at.x) * 40, at.y + Math.sign(best.y - at.y) * 40, 400, true);
    if (wat) { const v = world.spawnVehicle(best.craft, wat.x, wat.y, Math.atan2(best.y - wat.y, best.x - wat.x), { npcOwned: false }); v.issuedTo = p.pid; }
  }
  world.notify(p, `[dev] At ${best.name}.`, 'info');
  return null;
}

// Debug homes (the owner, 2026-10-10: "a debug option to go to more homes, maybe a 'nearest' home option but also a 'next
// home' or 'previous home' or maybe a map you can open up and see all the homes available so that we can test them
// out"). msg.op: 'near' (the nearest home's door - the next nearest if you're at one), 'next' / 'prev' (the homes in
// the map's order, on from the last one you went to), 'go' (home msg.id: the list and the map in the debug menu,
// client/devhomes.js). At the door, on open ground. Returns an error or null.
export function devHome(world, p, msg) {
  const ped = p.ped, H = world.map.homes || [];
  if (!ped || ped.dead) return '[dev] Not while you\'re down.';
  if (ped.vehId) return '[dev] Get out of the vehicle first.';
  if (ped.hidden) return '[dev] Step outside first.';   // (inside a home: homes.js)
  if (!H.length) return '[dev] There are no homes on this map.';
  const op = String(msg.op || 'near');
  let i = -1;
  if (op === 'go') i = Math.floor(Number(msg.id));
  else if ((op === 'next' || op === 'prev') && Number.isInteger(p.devHome)) i = (p.devHome + (op === 'next' ? 1 : H.length - 1)) % H.length;
  else {   // the nearest (also where next / previous start from)
    let bd = Infinity;
    H.forEach((h, k) => { const d = Math.hypot(h.x - ped.x, h.y - ped.y); if (d > 120 && d < bd) { bd = d; i = k; } });
  }
  const h = H[i];
  if (!h) return `[dev] No home #${msg.id}.`;
  const at = standAt(world, h.x, h.y + 24);
  if (!at) return `[dev] Couldn't find open ground by ${h.name}.`;
  if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
  ped.sub = false; ped.ug = 0; ped.x = at.x; ped.y = at.y; ped.lz = 0; ped.vx = 0; ped.vy = 0; p.teleportAt = world.time;
  p.devHome = i;
  const owner = world.homeOwner && world.homeOwner.get(h.id);
  world.notify(p, `[dev] At ${h.name} (${h.kind}, $${(h.price || 0).toLocaleString('en-US')}${owner ? owner === p.pid ? ', yours' : ', owned' : ''}) - home ${i + 1} of ${H.length}.`, 'info');
  return null;
}

export const GIVE_MAX = 999;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TOOL_ITEMS = () => Object.keys(ITEMS).filter((id) => ITEMS[id].tool);

// Put something in a player's bag. Weapons come with n magazines of ammo (one loaded; melee weapons and
// tools: just the weapon), items n of them (a tool - flashlight, revive kit - just one: it never wears out).
function addThing(q, kind, id, n) {
  const prof = q.profile, ped = q.ped;
  if (kind === 'weapon') {
    const w = WEAPONS[id];
    prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? w.mag * n : 0);
    if (w.mag && ped) ped.mag[id] = Math.max(ped.mag[id] || 0, Math.min(w.mag, prof.weapons[id]));
  } else {
    prof.inventory[id] = ITEMS[id].tool ? Math.max(1, prof.inventory[id] || 0) : (prof.inventory[id] || 0) + n;
  }
}

// Dev give: anything from the catalogs to yourself or any online player.
//   msg: { pid (absent: yourself), kind: 'weapon' | 'item' | 'all', id (weapon or item id), n (1..GIVE_MAX) }
// 'all' gives every weapon (n magazines each) and every item (n each, tools one). Returns an error or null.
export function give(world, p, msg) {
  const q = msg.pid ? world.players.get(String(msg.pid)) : p;
  if (!q || !q.conn) return '[dev] That player isn\'t online.';
  const n = Math.max(1, Math.min(GIVE_MAX, Math.floor(Number(msg.n)) || 1));
  const kind = String(msg.kind || ''), id = String(msg.id || '').slice(0, 30);
  let what;
  if (kind === 'all') {
    for (const wid of Object.keys(WEAPONS)) if (wid !== 'fists') addThing(q, 'weapon', wid, n);
    for (const iid of Object.keys(ITEMS)) addThing(q, 'item', iid, n);
    what = 'every weapon and item in the game';
  } else if (kind === 'weapon') {
    if (!own(WEAPONS, id) || id === 'fists') return `[dev] No weapon "${id}".`;
    addThing(q, 'weapon', id, n);
    what = WEAPONS[id].mag ? `${WEAPONS[id].name} + ${n} mag${n > 1 ? 's' : ''}` : WEAPONS[id].name;
  } else if (kind === 'item') {
    if (!own(ITEMS, id)) return `[dev] No item "${id}".`;
    addThing(q, 'item', id, n);
    what = ITEMS[id].tool ? ITEMS[id].name : `${n}x ${ITEMS[id].name}`;
  } else return '[dev] Give what? (kind: weapon, item or all)';
  q.meDirty = true;
  store.touch();
  if (q !== p) world.notify(q, `${p.name} (dev) gave you: ${what}.`, 'good');
  world.notify(p, q === p ? `[dev] Given to you: ${what}.` : `[dev] Gave ${q.name}: ${what}.`, 'info');
  return null;
}

// ---- the Explosions test (task #382) ---------------------------------------------------------------------------
// The owner: "A debug test that spawns vehicles or other things that explode. Either one explosion type at a time, or
// a small / medium / big / ultra test." The debug menu's Explosions section (client/devcats.js) sends 'blast', msg.k:
//   small, medium, big, ultra   a blast that size a little ahead of you - the game's own sizes (shared/explosions.js
//                               blastSize): a car's, a truck's, a fuel tanker's, a flatbed loaded full of explosives;
//   car, tanker, truck          one a few steps away (the truck: a flatbed with a load of explosives aboard), its engine
//                               dead and on fire, going up BLAST_FUSE_S later;
//   row                         a burning tanker in the middle of a row of parked cars: the chain reaction;
//   crowd                       a burning tanker with people standing round it, near and far: who's thrown how far.
// Nobody's crime (there's no attacker). Accepted in dev mode only, like every dev command (session.js).
export const BLAST_SIZES = {
  small: () => blastSize(VEHICLES.sedan), medium: () => blastSize(VEHICLES.boxtruck),
  big: () => blastSize(VEHICLES.tanker), ultra: () => blastSize(null, VEHICLES.flatbed.slots.length),
};
export const BLAST_FUSE_S = 4;
const BLAST_ROW = ['sedan', 'compact', 'taxi', 'pickup', 'sedan', 'van'];   // parked either side of the tanker, out from it
const BLAST_CROWD = [[100, 5], [180, 6], [260, 7], [370, 6]];               // rings of people round the tanker: [px, how many]
// a vehicle fits there: clear of buildings, walls and water (as cruiser.js clearSpot places dev cars), of other
// vehicles, and of you
function fits(world, ped, x, y, a, def) {
  const s = { x, y, a, vx: 0, vy: 0, av: 0 };
  collideVehicleTiles(s, def, world.map, CAR_SPAWN_BLOCK);
  return Math.hypot(s.x - x, s.y - y) < 0.5 && !world.query(x, y, def.L, K.VEH).length && Math.hypot(x - ped.x, y - ped.y) > def.L / 2 + 40;
}
// A row of vehicles (models: the first in the middle, the rest out to either side of it in turn, 14 px between bumpers)
// about d px ahead of the ped: across its view if it fits there; otherwise turned, or further off - wherever the first
// and the most of the rest fit. [{ x, y, a, m }] (the first one's spot first; none: no room for the first).
function rowSpots(world, ped, models, d) {
  let best = [];
  for (const dd of [d, d + 120, d + 240]) {
    for (const turn of [Math.PI / 2, 0, Math.PI / 4, -Math.PI / 4]) {
      const a = ped.a + turn, ux = Math.cos(a), uy = Math.sin(a), cx = ped.x + Math.cos(ped.a) * dd, cy = ped.y + Math.sin(ped.a) * dd;
      const reach = [VEHICLES[models[0]].L / 2, VEHICLES[models[0]].L / 2], out = [];
      for (let i = 0; i < models.length; i++) {
        const def = VEHICLES[models[i]], side = i % 2;
        let off = 0;
        if (i) { off = (reach[side] + 14 + def.L / 2) * (side ? 1 : -1); reach[side] += 14 + def.L; }
        const x = cx + ux * off, y = cy + uy * off;
        if (fits(world, ped, x, y, a, def)) out.push({ x, y, a, m: models[i] });
        else if (!i) break;   // (no room for the first one here)
      }
      if (out.length > best.length) best = out;
      if (best.length === models.length) return best;
    }
  }
  return best;
}
export function blastTest(world, p, k) {
  const ped = p.ped;
  if (!ped || ped.dead) return '[dev] Not while you\'re down.';
  if (ped.hidden || ped.interior || ped.ug || ped.sub || ped.onTrain) return '[dev] Go outside, above ground, first.';
  const veh = ped.vehId ? world.get(ped.vehId) : null, a = veh ? veh.a : ped.a || 0, z = ped.lz || 0;
  if (own(BLAST_SIZES, k)) {   // a blast that size, its edge reaching back about to you
    const size = BLAST_SIZES[k](), d = Math.min(300, size.r * 0.8);
    explosions.blastAt(world, ped.x + Math.cos(a) * d, ped.y + Math.sin(a) * d, size, null, undefined, z);
    world.notify(p, `[dev] A ${k} blast (reaching ${size.r} px) ${Math.round(d)} px ahead.`, 'info');
    return null;
  }
  if (z > 0.3) return '[dev] Come down off the highway first (there\'s no room up there).';
  const at = { x: ped.x, y: ped.y, a };   // (the spots are found from where you face)
  // (set to go up s seconds from now: the engine dead, on fire at once - vehicles.update sets it off)
  const fire = (v, s) => { v.lz = 0; vehicles.killEngine(world, v, null); v.deadFireAt = world.time; v.deadBoomAt = world.time + s; return v; };
  if (k === 'car' || k === 'tanker' || k === 'truck') {
    const model = k === 'car' ? 'sedan' : k === 'tanker' ? 'tanker' : 'flatbed', sp = clearSpot(world, at, VEHICLES[model]);
    const v = fire(world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false }), BLAST_FUSE_S);
    const n = k === 'truck' ? cargo.loadExplosives(world, v, 4) : 0;
    world.notify(p, `[dev] ${k === 'car' ? 'A car' : k === 'tanker' ? 'A fuel tanker' : `A flatbed with ${n} crates of explosives`} on fire nearby: it goes up in ${BLAST_FUSE_S} s.`, 'info');
    return null;
  }
  if (k === 'row') {
    const spots = rowSpots(world, at, ['tanker', ...BLAST_ROW], 270);
    if (!spots.length) return '[dev] No room for a row of cars here: try an open street or a car park.';
    spots.forEach((s, i) => { const v = world.spawnVehicle(s.m, s.x, s.y, s.a, { npcOwned: false }); if (!i) fire(v, BLAST_FUSE_S); });
    world.notify(p, `[dev] A fuel tanker on fire in a row of ${spots.length - 1} parked cars: it goes up in ${BLAST_FUSE_S} s.`, 'info');
    return null;
  }
  if (k === 'crowd') {
    const sp = clearSpot(world, at, VEHICLES.tanker), v = fire(world.spawnVehicle('tanker', sp.x, sp.y, sp.a, { npcOwned: false }), BLAST_FUSE_S + 1);
    let n = 0;
    for (const [r, m] of BLAST_CROWD) {
      for (let i = 0; i < m; i++) {
        const t = ((i + (r % 3) / 3) / m) * Math.PI * 2, x = v.x + Math.cos(t) * r, y = v.y + Math.sin(t) * r;
        if (PED_BLOCK[world.map.tileAtPx(x, y)] || world.map.isWater(x, y) || explosions.bodyDist(v, x, y) < 14 || Math.hypot(x - ped.x, y - ped.y) < 24) continue;
        const q = npc.spawnNpc(world, 'casual', x, y);
        if (!q) continue;
        q.npc.desk = { x, y, a: t + Math.PI }; q.a = t + Math.PI;   // (standing there watching it burn: they don't run)
        n++;
      }
    }
    world.notify(p, `[dev] A fuel tanker on fire with ${n} people round it, near and far: it goes up in ${BLAST_FUSE_S + 1} s.`, 'info');
    return null;
  }
  return `[dev] Blast what? (${[...Object.keys(BLAST_SIZES), 'car', 'tanker', 'truck', 'row', 'crowd'].join(', ')})`;
}

// Find a clear spot near the player for a dev-spawned vehicle (never inside buildings).

export function command(world, p, c, msg) {
  const ped = p.ped;
  const prof = p.profile;
  const lt0 = world.loopTime;
  switch (c) {
    case 'rain': env.startRain(world, Math.max(30, Math.min(3600, Number(msg.s) || 300))); if (world.weatherHold) world.weatherHold.w = WEATHER.RAIN; break;   // (msg.s: for how long)
    case 'clear': env.stopRain(world); if (world.weatherHold) world.weatherHold.w = WEATHER.CLEAR; break;
    case 'wxhold': // hold the weather as it is (rain keeps falling, or no rain rolls in) until let go
      world.weatherHold = world.weatherHold ? null : { w: world.weather };
      if (!world.weatherHold && world.weather === WEATHER.RAIN) world.rainUntil = world.time + 120;
      world.notify(p, world.weatherHold ? '[dev] Weather held: no change until you let it go.' : '[dev] Weather back to normal.', 'info'); break;
    case 'clockhold': world.clockHold = !world.clockHold; world.notify(p, world.clockHold ? '[dev] Clock frozen at this time of day.' : '[dev] Clock running again.', 'info'); break;
    case 'near': { const err = near(world, p, msg.k); if (err) world.notify(p, err, 'warn'); break; }
    case 'home': { const err = devHome(world, p, msg); if (err) world.notify(p, err, 'warn'); break; }   // the debug homes: nearest, next, previous, any
    case 'wardrobe': if (p.conn) p.conn.sendJSON(looks.devWardrobe(world, p, msg)); else looks.devWardrobe(world, p, msg); break;   // the debug wardrobe: wear (or, n: save) a look, its pieces yours
    case 'ug': {   // straight down: the nearest manhole into the sewers, or (k: 'cave') in through the mine's adit
      if (!ped || ped.dead || ped.vehId) break;
      const L = undergroundOf(world.map);
      if (ped.ug) break;
      if (msg.k === 'cave') { const K2 = L.caves[msg.cave] || caveNear(L, ped.x, ped.y); if (K2) { ped.x = K2.mouth.x; ped.y = K2.mouth.y; underground.enterCave(world, p, K2); const c = K2.ch[msg.at]; if (c) { ped.x = c.x; ped.y = c.y; } } break; }   // (at: a chamber - grotto, river, worms, pool, crystal, den; cave: which, else the nearest)
      let best = null, bd = Infinity;
      for (const r of L.routes) for (const m of r.manholes) { const d = Math.hypot(m.x - ped.x, m.y - ped.y); if (d < bd) { bd = d; best = m; } }
      if (best) { ped.x = best.x; ped.y = best.y; underground.goDown(world, p, best); }
      break;
    }
    case 'night': world.loopTime = DAY_PART_S + 5; break;
    case 'day': world.loopTime = 90; break;
    case 'time': { // jump the clock to a time of day: msg.m minutes after midnight
      const mins = ((Number(msg.m) % 1440) + 1440) % 1440;
      // 06:00-20:00 is the day part (DAY_PART_S), 20:00-06:00 the rest of the loop
      world.loopTime = mins >= 360 && mins < 1200 ? (mins - 360) / 840 * DAY_PART_S : DAY_PART_S + (((mins - 1200 + 1440) % 1440) / 600) * (DAY_LOOP_S - DAY_PART_S);
      break;
    }
    case 'money': prof.cash += 5000; prof.bank += 20000; world.notify(p, '[dev] +$5,000 cash, +$20,000 bank', 'info'); break;
    case 'hot': if (ped) { hotmoney.add(world, p, 1000, ped.x, ped.y); world.notify(p, '[dev] +$1,000 hot money in the robbery bag, stolen right here', 'info'); } break;
    case 'wanted': {
      if (!ped) break;
      if (msg.soft) { law.clearWanted(world, p); law.smallStar(world, p, 'punch', ped.x, ped.y, 'witness'); break; }   // (1 star from small crimes: an officer comes for a word - stops.js)
      const s = Math.max(1, Math.min(5, Number(msg.n) || 2));
      law.addHeat(world, p, STAR_HEAT[s] - p.heat + 1, ped.x, ped.y);
      break;
    }
    case 'clean': law.clearWanted(world, p); prof.peakWanted = 0; break;
    case 'bounty': bounties.devOnMe(world, p); break;                         // a test bounty on your own head
    case 'packs': { // the dropped backpacks, Common to Legendary, in a row ahead of you, and a pile of notes
      if (!ped) break;
      const c = Math.cos(ped.a), s = Math.sin(ped.a);
      for (let t = 1; t < PACK_TIERS.length; t++) {
        const value = PACK_TIERS[t].min + 150, k = t - 3;
        const b = world.spawnBag(ped.x + c * 90 - s * k * 46, ped.y + s * 90 + c * k * 46, { cash: 0, items: { bandage: 1 }, weapons: {}, itemValue: value }, 'Test Dummy');
        b.pack = true; b.tier = t; b.value = value; b.expires = world.time + PACK_LIFE_S;
      }
      const pile = world.spawnBag(ped.x + c * 150, ped.y + s * 150, { cash: 250, items: {}, weapons: {}, itemValue: 0 }, 'Test Dummy');
      pile.cashOnly = true; pile.expires = world.time + PACK_LIFE_S;
      break;
    }
    case 'hunter': law.clearWanted(world, p); if (p.badge) law.goOffDuty(world, p); p.hunter = true; p.faction = 'hunter'; p.meDirty = true; world.notify(p, '[dev] Licensed bounty hunter: take contracts in the Bounties app.', 'info'); break;
    case 'revenge': { const err = bounties.devUnlock(world, p); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }
    case 'record': // wipe the criminal record: no wanted level, no felonies, no peak-wanted memory
      law.clearWanted(world, p); prof.peakWanted = 0; prof.felonies = 0; prof.firedUntil = 0; p.disguised = false;
      world.notify(p, '[dev] Criminal record wiped - no felonies on file.', 'info'); p.meDirty = true; break;
    case 'cop': { // join the force on the spot (record wiped, enough Samaritan points), keep current rank
      law.clearWanted(world, p); prof.peakWanted = 0; prof.felonies = 0; prof.firedUntil = 0;
      prof.samaritan = Math.max(prof.samaritan, law.ENFORCER_MIN_SAMARITAN + 10);
      const err = p.badge ? null : law.goOnDuty(world, p);
      if (!err && !(ped && ped.vehId && world.get(ped.vehId)?.cruiserOf === p.pid)) cruiser.issueNow(world, p);
      world.notify(p, err ? `[dev] ${err}` : `[dev] On duty as ${law.POLICE_RANKS[law.policeRank(prof)].name}. Dispatch map: M / Start → Map / tap the radar.`, err ? 'bad' : 'good');
      break;
    }
    case 'promote': { // jump to the next police rank
      const r = law.policeRank(prof);
      if (r < law.POLICE_RANKS.length - 1) law.addPolicePts(world, p, law.POLICE_RANKS[r + 1].pts - (prof.policePts || 0));
      else world.notify(p, '[dev] Already Chief of Police.', 'info');
      break;
    }
    case 'shootout': world.notify(p, gangwar.startShootout(world, p) ? '[dev] Shootout started nearby.' : '[dev] No gang turf near you - go toward The Yards or Southside.', 'info'); break;
    case 'die': if (ped && !ped.dead) combat.damage(world, ped, 99999, null, 'crash', 0); break;
    case 'snatch': npc.snatchEvent(world, p); world.notify(p, '[dev] A mugger is on the way to a nearby pedestrian.', 'info'); break;
    case 'happen': world.notify(p, happenings.startNow(world, String(msg.k || 'fight'), p, { cops: msg.cops ? true : undefined }) ? `[dev] Started: ${msg.k}.` : '[dev] Nobody about to start it with - try a busier street.', 'info'); break;
    case 'street': world.notify(p, streetlife.startNow(world, String(msg.k || 'race'), p) ? `[dev] Started: ${msg.k || 'race'} - coming your way.` : '[dev] No street to start it on round here - try somewhere in town, out on the street.', 'info'); break;   // a street race (msg.k 'race'), a police chase ('chase'), an armored truck ('armored'): streetlife.js
    case 'pet': pets.spawnLost(world, p); world.notify(p, '[dev] A pet ran off nearby.', 'info'); break;
    case 'samaritan': prof.samaritan += 50; world.notify(p, '[dev] +50 Samaritan', 'info'); break;
    case 'car': {
      if (!ped) break;
      if (msg.in && (ped.home || ped.hidden)) { world.notify(p, '[dev] Step outside first.', 'warn'); break; }   // (from inside a home it seated the body in there at the controls out here - H69)
      const model = VEHICLES[msg.m] ? msg.m : 'pickup';
      let sp = clearSpot(world, ped, VEHICLES[model]);
      if ((ped.lz || 0) > 0.5) { // up on the deck: somewhere on the deck beside you
        sp = { x: ped.x, y: ped.y, a: ped.a };
        for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8, x = ped.x + Math.cos(a) * 110, y = ped.y + Math.sin(a) * 110; if (surfaceZ(world.map, x, y, 1) !== null) { sp = { x, y, a: 0 }; break; } }
      }
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) sp = { x: msg.x, y: msg.y, a: Number(msg.a) || 0 };   // (testing: exactly there)
      const v = world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      v.lz = ped.lz || 0; // up on the highway with you
      // an aircraft already up (msg.alt px, flying: testing - shared/flight.js), and (msg.in) you at its controls
      if (VEHICLES[model].kind === 'air' && Number(msg.alt) > 0) { v.alt = Math.min(VEHICLES[model].ceiling, Number(msg.alt)); v.spool = 1; const sp0 = VEHICLES[model].air === 'plane' ? VEHICLES[model].stall * 1.6 : 0; v.vx = Math.cos(sp.a) * sp0; v.vy = Math.sin(sp.a) * sp0; }
      if (msg.in && ped.vehId) { const ov = world.get(ped.vehId), k = ov ? ov.seats.indexOf(ped.id) : -1; if (k >= 0) ov.seats[k] = 0; ped.vehId = 0; ped.seat = -1; }   // (out of whatever you were in)
      if (msg.in && !ped.dead) { v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; p.lastVehicle = v.id; p.meDirty = true; }
      break;
    }
    case 'boom': { // a vehicle (msg.m, a sedan) blown up a little way off: msg.k 'launch' | 'pieces' | 'plain' picks how (task #363); msg.wh: a burning wheel comes off (task #412)
      if (!ped) break;
      const model = VEHICLES[msg.m] ? msg.m : 'sedan', sp = clearSpot(world, ped, VEHICLES[model]);
      const v = world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false });
      if (msg.k) v.boomKind = msg.k === 'plain' ? '' : String(msg.k);
      if (msg.wh) v.boomWheel = true;
      vehicles.explode(world, v, null);
      break;
    }
    case 'blast': { const err = blastTest(world, p, String(msg.k || '').slice(0, 12)); if (err) world.notify(p, err, 'warn'); break; }   // the Explosions test (task #382, above)
    case 'vdmg': { // vehicle damage you can see (task #402): a car (msg.m, a sedan) a little way off, damaged to msg.s - 1 scuffed, 2 dented,
      // 3 crumpled, 4 the engine dead (a door hanging), 'shot' shot up, 'cut' cut in two by a plasma blade - hit at msg.z (VZ: 1 front, 2 back, 4 left, 8 right)
      if (!ped) break;
      const model = VEHICLES[msg.m] ? msg.m : 'sedan', sp = clearSpot(world, ped, VEHICLES[model]);
      const v = world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false });
      const z = [1, 2, 4, 8].includes(msg.z) ? msg.z : 1, hp = v.def.hp, s = msg.s;
      if (s === 'cut') { vehicles.noteHit(v, 4, 1); vehicles.cutVehicle(world, v, ped, 0); break; }
      if (s === 'shot') { v.holes = 12; vehicles.damageVehicle(world, v, hp * 0.45, ped, true, false, 4); vehicles.damageVehicle(world, v, 1, ped, true, false, 8); break; }
      const left = { 1: 0.75, 2: 0.5, 3: 0.25 }[s];
      if (left) vehicles.damageVehicle(world, v, hp * (1 - left), ped, true, false, z);
      else { vehicles.damageVehicle(world, v, hp * 0.7, ped, true, false, z); vehicles.damageVehicle(world, v, hp, ped, true, false, z === 1 ? 4 : z); v.deadFireAt = world.time + 6; v.deadBoomAt = world.time + 30; }
      break;
    }
    case 'guns': // every weapon in the game with ammo (the police's and the hunters' too), med kits, and every tool / bit of equipment
      for (const [id, w] of Object.entries(WEAPONS)) {
        if (id === 'fists' || w.type === 'deploy') continue;
        prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? Math.max(w.mag * 5, w.starter || 0) : 0);
        if (w.mag && ped) ped.mag[id] = w.mag;
      }
      prof.inventory.medkit = (prof.inventory.medkit || 0) + 3;
      for (const id of TOOL_ITEMS()) prof.inventory[id] = Math.max(1, prof.inventory[id] || 0);
      break;
    case 'hunt': // the hunter's kit: the hunting rifle, the bow and arrows, the varmint rifle, the hunting knife, the cloak, scent
      for (const id of ['huntrifle', 'bow', 'varmint', 'huntknife']) { const w = WEAPONS[id]; prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? Math.max(w.mag * 4, 30) : 0); if (w.mag && ped) ped.mag[id] = w.mag; }
      prof.inventory.camoCloak = 1; prof.inventory.coverScent = (prof.inventory.coverScent || 0) + 3; prof.inventory.flashlight = Math.max(1, prof.inventory.flashlight || 0);
      if (ped) combat.selectWeapon(world, ped, 'bow');
      world.notify(p, '[dev] Hunting kit: rifle, bow + arrows, varmint rifle, hunting knife, ghillie cloak, cover scent.', 'info');
      break;
    case 'animal': { // an animal (or its group) out of sight nearby: msg.k kind, msg.young / msg.legend, msg.stalk (a predator that stalks you)
      if (!ped) break;
      if (msg.scene) { const said = huntScene(world, ped, String(msg.scene).slice(0, 16)); world.notify(p, `[dev] ${said || 'No room for that here - try out in the wilds, near water for the fishers.'}`, said ? 'info' : 'warn'); break; }   // (Nature-A2: a hunt to watch)
      const kind = String(msg.k || 'deer');
      if (!SPECIES[kind] && !wildlife.LIVESTOCK[kind]) { world.notify(p, `[dev] No animal "${kind}".`, 'warn'); break; }
      const S = SPECIES[kind];
      if (kind === 'shark') {   // (a great white: up out of the deep near you, after you - you'll want to be in the sea: sharks.js)
        const s = sharks.spawnNear(world, ped.x, ped.y, ped);
        world.notify(p, s ? '[dev] A great white is coming up nearby - it hunts swimmers in the open sea.' : '[dev] No deep sea near enough for a shark: swim out further.', s ? 'info' : 'warn');
        break;
      }
      const ang = ped.a + Math.PI + (Math.random() - 0.5), d = msg.stalk ? 520 : 300;
      let x = ped.x + Math.cos(ang) * d, y = ped.y + Math.sin(ang) * d;
      if (S && (S.swims === 'float' || kind === 'beaver' || kind === 'otter' || kind === 'duck' || kind === 'goose')) { const wat = standAt(world, x, y, 900, true); if (wat) { x = wat.x; y = wat.y; } }
      else { const g = standAt(world, x, y, 400); if (g) { x = g.x; y = g.y; } }
      if (S && msg.stalk) {   // one of them, on your trail
        const a = wildlife.spawnAnimal(world, kind, x, y, 0, { lead: true });
        a.wild.predator = true; a.wild.stalkOf = ped.id; a.wild.state = 'stalk'; a.wild.until = world.time + 60;
        world.notify(p, `[dev] ${a.name} is stalking you.`, 'info');
        break;
      }
      if (S && !msg.single) {
        const n = wildlife.spawnGroup(world, kind, x, y, false);
        if (msg.legend || msg.young) for (const e of wildlife.animals(world)) if (e.wild.kind === kind && Math.hypot(e.x - x, e.y - y) < 120 && e.wild.lead) { if (msg.legend) { w2legend(world, e); } break; }
        world.notify(p, `[dev] ${S.name} x${n} nearby.`, 'info');
      } else {
        const a = wildlife.spawnAnimal(world, kind, x, y, 0, { young: !!msg.young, legend: !!msg.legend, lead: true });
        world.notify(p, `[dev] ${a.name} nearby.`, 'info');
      }
      if (msg.calm) for (const e of wildlife.animals(world)) if (Math.hypot(e.x - x, e.y - y) < 160) e.wild.calmUntil = world.time + (Number(msg.calm) > 1 ? Number(msg.calm) : 40);   // (calm a while: to look at)
      break;
    }
    case 'dummy': { // a few people standing still just ahead of you, to try the blades (and anything else) on: msg.n of
      // them (1-6, default 3), msg.hp to set their health (1: every blow is a killing blow, to see how they fall)
      if (!ped || ped.vehId) break;
      const n = Math.max(1, Math.min(6, Number(msg.n) || 3));
      let made = 0;
      for (let i = 0; i < n; i++) {
        const a = (ped.a || 0) + (i - (n - 1) / 2) * 0.55, d = 44 + (i % 2) * 18, x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
        if (PED_BLOCK[world.map.tileAtPx(x, y)]) continue;
        const q = npc.spawnNpc(world, 'casual', x, y);
        if (!q) continue;
        q.npc.desk = { x, y, a: a + Math.PI }; q.npc.keep = true; q.a = a + Math.PI;
        if (Number(msg.hp) > 0) q.hp = q.maxHp = Number(msg.hp);
        made++;
      }
      world.notify(p, `[dev] ${made} practice ${made === 1 ? 'dummy' : 'dummies'} in front of you.`, 'info');
      break;
    }
    case 'persona': { // a street personality a few steps ahead (personas.js PERSONAS, msg.k: cane, trolley, couple, tough, gym,
      // glam, streetw, jogger, skater, blader, punk, homeless, phone, dogs, dancer, swim, texter, caller, bench, sleeper, busker, selfie)
      if (!ped) break;
      const k = String(msg.k || 'cane'), x = ped.x + Math.cos(ped.a || 0) * 70, y = ped.y + Math.sin(ped.a || 0) * 70;
      const q = personas.PERSONAS[k] ? personas.spawnPersona(world, npc.spawnNpc, k, x, y) : null;
      if (q) q.npc.keep = true;
      world.notify(p, q ? `[dev] ${k} nearby.` : `[dev] No ${k} here (${Object.keys(personas.PERSONAS).join(', ')}).`, q ? 'info' : 'warn');
      break;
    }
    case 'act': {   // people going about their lives (activities.js): the nearest spot of msg.k, filled, you a little way off it
      if (!ped || ped.dead || ped.vehId) break;
      const k = String(msg.k || 'chess').slice(0, 16);
      let best = null, bd = Infinity;
      for (const s of activities.spotsOf(world.map).list) { if (s.k !== k) continue; const d = Math.hypot(s.x - ped.x, s.y - ped.y); if (d > 200 && d < bd && !(world.acts && world.acts.has(s.id))) { bd = d; best = s; } }
      if (!best) { world.notify(p, `[dev] No ${k} spot (anglers, chess, picnic, painter, carwash, chat, pickers, miners, hunter, hoops, pool, diners; the wilds' ranger, trail, birders, holds, kayakers, climbers, foragers, campcook).`, 'warn'); break; }
      if (best.k === 'carwash' && !world.query(best.x, best.y, 24, K.VEH).length) world.spawnVehicle('sedan', best.x, best.y, best.a, { parked: true });
      const at = standAt(world, best.x, best.y + 120, 200) || standAt(world, best.x, best.y, 320);
      if (at) { if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y); ped.sub = false; ped.ug = 0; ped.x = at.x; ped.y = at.y; ped.lz = 0; ped.vx = ped.vy = 0; p.teleportAt = world.time; }
      world.notify(p, activities.fill(world, best, { seen: true }) ? `[dev] ${k} here.` : `[dev] Couldn't fill the ${k} spot just now.`, 'info');
      break;
    }
    case 'wanderer': { // the hooded stranger who sells the plasma blade, a few steps away
      if (!ped) break;
      const s = wanderer.appear(world, { x: ped.x + Math.cos(ped.a) * 90, y: ped.y + Math.sin(ped.a) * 90 });
      world.notify(p, s ? '[dev] A hooded stranger stands nearby.' : '[dev] No room for him here.', 'info');
      break;
    }
    case 'wind': // where the wind blows from: msg.a (radians) - or back to the weather's own
      world.windHold = Number.isFinite(msg.a) ? { a: msg.a, s: 0.8 } : null;
      if (ped && msg.toMe) world.windHold = { a: Math.atan2(-Math.sin(ped.a), -Math.cos(ped.a)), s: 0.8 };
      world.notify(p, world.windHold ? '[dev] The wind is held.' : '[dev] The wind is free again.', 'info');
      break;
    case 'give': { const err = give(world, p, msg); if (err) world.notify(p, err, 'warn'); break; }
    case 'cargo': {
      // a flatbed pre-loaded with one crate of every tier, for open-cargo playtests
      if (!ped) break;
      const sp = clearSpot(world, ped, VEHICLES.flatbed);
      const v = world.spawnVehicle('flatbed', sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      [1, 2, 3, 4, 1, 2].forEach((tier, i) => {
        const c = world.spawnCrate(tier, v.x, v.y, { owner: p.pid, contraband: false });
        c.state = 'loaded'; c.parent = v.id; c.slot = i; v.cargo[i] = c.id;
      });
      break;
    }
    case 'drop': jobs.spawnDrop(world, Number(msg.n) === 4 ? 4 : 3); break;
    case 'heal': if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } break;
    case 'train': { // hop aboard a train right now (nearest, or msg.n), in car msg.car (default: the first coach)
      if (!ped || ped.dead || !world.trains.length) break;
      if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
      let t = world.trains[Number(msg.n)] || null;
      // (msg.sub: the nearest subway train - World v3's Pink and Yellow Lines - not the main line's)
      const isSub = (q) => !!(world.rails && world.rails[q.r] && world.rails[q.r].subway);
      if (!t) { let bd = Infinity; for (const q of world.trains) { if (msg.sub && !isSub(q)) continue; const e = world.get(q.cars[0].id); if (!e) continue; const d = Math.hypot(e.x - ped.x, e.y - ped.y); if (d < bd) { bd = d; t = q; } } }
      if (!t) { world.notify(p, msg.sub ? '[dev] There is no subway train running on this map.' : '[dev] No train found.', 'warn'); break; }
      const ci = Math.max(1, Math.min(t.cars.length - 1, Number(msg.car) || 1));
      trains.board(world, ped, t, ci, 0, 0, 0);
      world.notify(p, `[dev] Aboard train ${t.i}, car ${ci}.`, 'info');
      break;
    }
    case 'calltrain': { // bring the next train into the nearest station, doors open
      if (!ped || ped.dead || !world.trains.length) break;
      const r = trains.callTrain(world, ped.x, ped.y);
      if (r) world.notify(p, `[dev] A train is waiting at ${r.st.name}.`, 'info');
      break;
    }
    case 'tp': if (ped && ped.onTrain) trains.alight(world, ped, ped.x, ped.y); if (ped) { ped.sub = false; ped.ug = 0; }
      if (ped && !ped.vehId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        const at = msg.snap ? tpSpot(world.map, msg.x, msg.y) : { x: msg.x, y: msg.y };   // (snap: the debug teleport's places - the server finds the ground)
        ped.x = at.x; ped.y = at.y; ped.lz = !msg.snap && msg.lz === 1 && surfaceZ(world.map, at.x, at.y, 1) !== null ? 1 : 0; ped.vx = 0; ped.vy = 0; p.teleportAt = world.time;
      } else if (ped && ped.vehId) world.notify(p, '[dev] Get out of the vehicle first.', 'warn');
      break; // lz: 1 = up on the highway deck
    case 'god': devmode.setInvincible(world, p, null); break;              // invincible (toggle)
    case 'spectate':                                                        // free camera: your character stays put, safe
      if (msg.on && !p.spectating) { p.spectating = true; p.specWasGod = !!p.invincible; p.invincible = true; if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } }
      else if (!msg.on && p.spectating) { p.spectating = false; p.invincible = p.specWasGod; }
      p.meDirty = true;
      break;
    case 'godp': devmode.setInvincible(world, p, msg.pid); break;          // make another player invincible (toggle)
    case 'gunsp': case 'healp': {                                          // give another player weapons / heal them
      const q = world.players.get(String(msg.pid));
      if (!q || !q.ped || q.ped.dead) { world.notify(p, '[dev] Can\'t reach that player right now.', 'warn'); break; }
      if (c === 'healp') { q.ped.hp = q.ped.maxHp; q.ped.bleeding = false; world.notify(q, `${p.name} (dev) healed you.`, 'good'); world.notify(p, `[dev] Healed ${q.name}.`, 'info'); }
      else { command(world, q, 'guns', {}); world.notify(p, `[dev] Gave ${q.name} weapons.`, 'info'); }
      q.meDirty = true;
      break;
    }
    case 'rescue': devRescue(world, p, ped, String(msg.at || 'water')); break;   // tasks #409, #420
    case 'place': {   // a place by its name: World v3's handcrafted districts' places and sights (map.world3hand), a landmark, a district
      if (!ped || ped.dead) break;
      if (ped.vehId) { world.notify(p, '[dev] Get out of the vehicle first.', 'warn'); break; }
      const n = String(msg.n || '').toLowerCase(), m = world.map;
      let q = null;
      for (const H of Object.values(m.world3hand || {})) {
        for (const pl of (H && H.places) || []) if (!q && pl.name && pl.name.toLowerCase().includes(n)) q = { x: ((pl.x0 + pl.x1) / 2) * TILE, y: ((pl.y0 + pl.y1) / 2) * TILE, name: pl.name };
        for (const sg of (H && H.sights) || []) if (!q && sg.name && sg.name.toLowerCase().includes(n)) q = { x: sg.x, y: sg.y, name: sg.name };
      }
      if (!q) for (const l of m.landmarks || []) if (!q && l.name && l.name.toLowerCase().includes(n)) q = { x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2, name: l.name };
      if (!q) { world.notify(p, `[dev] No "${msg.n}" on this map (World v3's places).`, 'warn'); break; }
      const at = tpSpot(m, q.x, q.y);
      if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
      ped.sub = false; ped.ug = 0; ped.x = at.x; ped.y = at.y; ped.lz = 0; ped.vx = 0; ped.vy = 0; p.teleportAt = world.time;
      world.notify(p, `[dev] At ${q.name}.`, 'info');
      break;
    }
    case 'skate': case 'cart': case 'fish': {   // today's new play (2026-10-18): skateboarding, the shopping carts, fishing - server/devplay.js
      const err = (c === 'skate' ? devplay.devSkate : c === 'cart' ? devplay.devCart : devplay.devFish)(world, p, msg);
      if (err) world.notify(p, err, 'warn');
      break;
    }
    case 'goto': devmode.goTo(world, p, msg.pid); break;     // teleport to an online player
    case 'bring': devmode.bring(world, p, msg.pid); break;   // fetch an online player to you
    case 'grant': devmode.grant(world, p, msg.pid); break;   // give someone Dev Debug Mode (their progress stops saving too)
    case 'burn': devBurn(world, p, ped, String(msg.k || 'me')); break;   // fire on people (H58): you ('me'), or people standing a little way ahead ('crowd')
    case 'sar': { const err = sar.devSar(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }
    case 'coast': { const err = coastguard.devCoast(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // the coast guard (H59): msg.mode 'boat' | 'air', msg.k 'smuggle' | 'overboard', msg.near   // search and rescue (H59): msg.k a call's kind near you, msg.hover over them, msg.roof on a hospital's roof pad
    case 'garden': { const err = gardening.devGarden(world, p, msg, homes.buy); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // a garden of your own at every stage (H61); msg.k 'ripe': all of it ripe
    case 'farm': { const err = farming.devFarm(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // a tractor at the fields, the rows in every state (H61)

    case 'homein': { const err = homeinside.devIn(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }
    case 'decor': { const err = homeinside.devDecor(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // decorating (H67): msg.furn, msg.demo, msg.wall / msg.floor, msg.edit   // inside a home (H62): msg.id | msg.kind - yours, and in; msg.at: by the bed, the safe...
    case 'lobby': { const err = homeinside.devLobby(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // (H71) an apartment block's lobby: msg.own / msg.other unit n, msg.mail, msg.pet, msg.at ('mail' | n), msg.home
    case 'airtraffic': {   // aircraft about the world (H66): msg.k 'land' | 'takeoff' at the runway nearest you (msg.seen: even in view), 'news' over you
      if (!ped) break;
      const A = (world.airTraffic ||= { flights: new Map(), nextAt: world.time + 60, newsAt: 0 });
      for (const f of A.flights.values()) if (f.kind === (msg.k === 'news' ? 'news' : 'plane')) { const ov = world.get(f.vid); A.flights.delete(f.vid); if (ov) { for (const id of ov.seats) { const c = id && world.get(id); if (c && !c.player) npc.despawnNpc(world, c); } world.remove(ov); } }
      if (msg.k === 'news') { airtraffic.news(world, A, p); break; }
      let best = null, bd = 1e12;
      for (const r of airtraffic.runways(world.map)) { const d = Math.hypot(r.x - ped.x, r.y - ped.y); if (d < bd) { bd = d; best = r; } }
      if (!best) break;
      const v = airtraffic.planeFlight(world, A, { rw: best, mode: msg.k === 'takeoff' ? 'out' : 'land', force: true, seen: !!msg.seen, dir: msg.dir === -1 || msg.dir === 1 ? msg.dir : 0 });
      if (!v) world.notify(p, '[dev] no way in or out clear at that runway', 'warn');
      break;
    }
    case 'cabjob': case 'busjob': case 'towjob': {   // driving for a living (H72): on the rota - a fare hailing beside you, the bus on its line, a car to tow
      const err = (c === 'cabjob' ? taxijob.devCab : c === 'busjob' ? busjob.devBus : towjob.devTow)(world, p);
      if (err) world.notify(p, `[dev] ${err}`, 'warn');
      break;
    }
    case 'medicjob': { const err = paramedic.devMedic(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // the paramedic (H68): on the rota, a patient (msg.k 'minor' | 'serious') beside you
    case 'firejob': { const err = firefighter.devFire(world, p, msg); if (err) world.notify(p, `[dev] ${err}`, 'warn'); break; }   // the firefighter (H68): on the crew, a call of kind msg.k beside you
    case 'policeair': {   // the police air unit (H66): up after you now - 3 stars at least; msg.near: already in the air close by
      if (!ped) break;
      if ((p.wanted | 0) < 3) law.addHeat(world, p, STAR_HEAT[3] - p.heat + 1, ped.x, ped.y);
      const old = world.policeAir && world.policeAir.get(p.pid);
      if (old) { const ov = world.get(old.vid); world.policeAir.delete(p.pid); if (ov) { for (const id of ov.seats) { const c = id && world.get(id); if (c && !c.player) npc.despawnNpc(world, c); } world.remove(ov); } }
      p.airNextAt = 0;
      const v = policeair.launch(world, p);
      if (!v) { world.notify(p, '[dev] no police headquarters helipad on this map', 'warn'); break; }
      if (msg.near) { v.x = ped.x + 260; v.y = ped.y - 120; v.alt = 300; v.spool = 1; v.vx = 0; v.vy = 0; world.policeAir.get(p.pid).mode = 'chase'; }
      break;
    }
    default: world.notify(p, `[dev] unknown command ${c}. Try: ${DEV_COMMANDS.join(', ')}`, 'warn'); return;
  }
  world.loopTime %= DAY_LOOP_S;
  if (world.loopTime < lt0 - DAY_LOOP_S / 2) world.day = (world.day || 0) + 1;   // (the clock set back past 06:00: a new day, as the clients count it)
  p.meDirty = true;
  store.touch();
}

// Fire on people (H58, burning.js): set yourself alight (k 'me': try putting it out - a dive roll, running, the water),
// or a few people standing a little way ahead of you, alight ('crowd': watch them run, roll, fall or make for the water)
function devBurn(world, p, ped, k) {
  if (!ped || ped.dead || ped.vehId) { world.notify(p, '[dev] On your feet first.', 'warn'); return; }
  if (k === 'me') { if (!burning.ignite(world, ped, null)) world.notify(p, '[dev] You can\'t catch fire here (in the water?).', 'warn'); return; }
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const a = ped.a + (i - 2.5) * 0.35, d = 150 + (i % 2) * 40, x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
    if (PED_BLOCK[world.map.tileAtPx(x, y)] || world.map.isWater(x, y)) continue;
    const q = npc.spawnNpc(world, 'casual', x, y);
    if (q && burning.ignite(world, q, null)) n++;
  }
  world.notify(p, n ? `[dev] ${n} people on fire ahead of you.` : '[dev] No room for anyone here.', n ? 'info' : 'warn');
}

// Rescue anywhere (tasks #409, #420): at 'water' you go down in open water off the nearest dock and call for help (the
// rescue boat comes); at 'wild' out in the open country, well off the road (the ambulance drives on over the ground and
// its crew walk in); 'crew' brings a speedboat alongside with people aboard (who rides in an open boat is drawn there).
function devRescue(world, p, ped, at) {
  if (!ped || ped.vehId || ped.dead) { world.notify(p, '[dev] On your feet and out of any vehicle first.', 'warn'); return; }
  const m = world.map;
  if (at === 'crew') {
    let sp = null;
    for (let r = 120; r <= 1600 && !sp; r += 80) for (let k = 0; k < 16 && !sp; k++) {
      const x = ped.x + Math.cos(k * Math.PI / 8) * r, y = ped.y + Math.sin(k * Math.PI / 8) * r;
      if (rescue.inWater(m, { x, y }) && rescue.inWater(m, { x: x + 70, y }) && rescue.inWater(m, { x: x - 70, y }) && rescue.inWater(m, { x, y: y + 40 }) && rescue.inWater(m, { x, y: y - 40 })) sp = { x, y };
    }
    if (!sp) { world.notify(p, '[dev] No open water near you - try by the shore.', 'warn'); return; }
    for (const [model, dy, n] of [['speedboat', 0, 4], ['dinghy', 90, 2], ['rescueboat', -90, 4]]) {
      if (!rescue.inWater(m, { x: sp.x, y: sp.y + dy })) continue;
      const v = world.spawnVehicle(model, sp.x, sp.y + dy, 0, { npcOwned: true });
      for (let s = 0; s < n; s++) { const c = npc.spawnNpc(world, model === 'rescueboat' ? 'rescue' : 'casual', v.x, v.y, model === 'rescueboat' ? 'medic' : 'civ'); c.vehId = v.id; c.seat = s; v.seats[s] = c.id; }
    }
    world.notify(p, '[dev] Boats with people aboard, out on the water by you.', 'info');
    return;
  }
  let to = null;
  if (at === 'water') to = rescue.waterSpot(world, ped.x, ped.y);
  else {
    // the open country (grass, dirt, fields, sand) 400-900 px from the nearest road, nearest you (within 9000 px)
    const WILDS = new Set([Z.WILD, Z.WEST, Z.NORTH]), OPEN = new Set([T.GRASS, T.DIRT, T.FIELD, T.SAND]);
    let best = 9000;
    for (let ty = m.y0; ty < m.y0 + m.h; ty += 6) for (let tx = m.x0; tx < m.x0 + m.w; tx += 6) {
      const x = tx * 32 + 16, y = ty * 32 + 16, dd = Math.hypot(x - ped.x, y - ped.y);
      if (dd >= best || !WILDS.has(m.zoneAt(x, y)) || !OPEN.has(m.tileAtPx(x, y)) || !m.isWalkable(x, y) || m.isWater(x, y)) continue;
      const k = kerbFor(world, x, y), d = Math.hypot(k.x - x, k.y - y);
      if (d > 400 && d < 900) { best = dd; to = { x, y }; }
    }
  }
  if (!to) { world.notify(p, `[dev] Nowhere ${at === 'water' ? 'out on the water' : 'out in the wilds'} round here.`, 'warn'); return; }
  ped.x = to.x; ped.y = to.y; ped.lz = 0; ped.sub = false; ped.ug = 0; p.teleportAt = world.time; world.place(ped);
  p.profile.bank = Math.max(p.profile.bank, 1000);   // (the fee)
  p.amb = null; p.ambUsed = false;
  combat.kill(world, ped, null, 'crash', 0);
  revive.callAmbulance(world, p);
  world.notify(p, `[dev] Down ${at === 'water' ? `in the water (${to.dock})` : 'in the wilds'} - help called.`, 'info');
}
