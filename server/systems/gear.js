// Rides you own and carry (the owner, 11-03: skateboards, rollerblades and surfboards should be "things you find, keep or
// carry, and lose" - "not something you can just equip and go faster on"; and the surfboard was slower than swimming, and
// you couldn't swim while you carried one). Three of them, each its own way:
//   - A skateboard of your own (skate.js: bought at a skate, surf or sports shop) is in your bag, in your hand, under your
//     feet, lying on the ground or at home. In your hand (the bag's Use, the quick wheel, or the action button by it
//     lying on the ground) it takes a hand: no fighting or shooting with it. The vehicle button rides it from your hand;
//     the action button puts it back in the bag. A skate park's rack boards are only borrowed (skate.js after), and a
//     board wears with each bail till it snaps (skate.js wearOut).
//   - A surfboard (surf.js) the same: in your bag or your hand you swim like anyone; in the sea the action button (or
//     the vehicle button with it in hand) sets it down and you're on it, paddling - faster than you swim. The action
//     button slides you off again (it's in your hand), and up the beach you walk out with it. Set down on dry land (the
//     vehicle button with it in hand) it stays a while (rules.js RIDE_GEAR surfLieS), then goes home: take it out at
//     home or at a surf shop.
//   - Rollerblades are worn: sit on a bench and put them on, or take them off (rules.js BLADES laceS); on them you're
//     quicker than walking and slower than a board, with no sprint and no getting into a vehicle, and rolling onto
//     grass, dirt or sand you go down.
// The bag holds what's in it (profile.inventory: skateboard, surfboard, rollerblades); what you own is kept beside it -
// profile.board (skate.js), profile.surfboard { at: 'bag' | 'out' | 'home' }, profile.bladesOn (worn) - and sync keeps the
// two in step: a board gone from the bag (dropped, sold, lost in your pack when you went down) is gone; one that turns up
// in it (picked up from someone's pack) is yours.
//   ped.held: the board in your hand - { k: 'skate' | 'surf', deck (a skateboard's: skate.js) }; the look: ped.pp
//   ped.blades: wearing rollerblades (the look: ped.gt 'blade'); ped.lacing: sat on a bench putting them on / off -
//   { until, on, from: where you stood }
import { K, T } from '../../shared/constants.js';
import { WATER_T, PED_BLOCK, isSwimming } from '../../shared/mapcore.js';
import { boardGround } from '../../shared/board.js';
import { BLADES, RIDE_GEAR } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { inAnyView } from '../view.js';
import { store } from '../store.js';
import { moved } from '../movemark.js';
import * as skate from './skate.js';
import * as surf from './surf.js';
import * as vehicles from './vehicles.js';
import { benchesNear, benchFacing } from './personas.js';

const ITEM = { skate: 'skateboard', surf: 'surfboard', blades: 'rollerblades' };
const NAME = { skate: 'skateboard', surf: 'surfboard' };
const LOOK = { skate: 'board', surf: 'surfboard' };   // (the prop in hand: client/art2/game/peds.js PROP_CARRY)
const HOME_PX = 2000;   // (a surfboard you set down goes home once you're this far from it - or gone)
const NOTE_S = 20;      // (the same note at most this often)

export const holding = (ped, k) => !!(ped && ped.held && (!k || ped.held.k === k));
export const handsFull = (ped) => !!(ped && ped.held);
export const wearing = (ped) => !!(ped && ped.blades);
export function owns(p, k) {
  const prof = p && p.profile;
  if (!prof) return false;
  if (k === 'skate') return !!prof.board;
  if (k === 'surf') return !!prof.surfboard || (prof.inventory.surfboard || 0) > 0;
  return !!prof.bladesOn || (prof.inventory.rollerblades || 0) > 0;
}
const inBag = (p, k) => (p.profile.inventory[ITEM[k]] || 0) > 0;
function note(world, p, key, text, tone = 'info') {
  const at = (p.gearNote ||= {});
  if (world.time - (at[key] ?? -99) < NOTE_S) return;
  at[key] = world.time;
  world.notify(p, text, tone);
}

// ---- the bag and what you own, in step -----------------------------------------------------------------------------
export function sync(world, p) {
  const prof = p.profile, inv = prof.inventory;
  if (!inv) return;
  // a skateboard: one in the bag is yours (an old bag's, one found in a pack: skate.js convert); gone from it, it's gone
  if ((inv.skateboard || 0) > 0) { if (inv.skateboard > 1) inv.skateboard = 1; skate.convert(world, p); if (holding(p.ped, 'skate')) clearHeld(p.ped); }
  else if (prof.board && prof.board.at === 'bag') { delete prof.board; store.touch(); }
  // a surfboard the same (one in an older bag: yours, in the bag)
  if ((inv.surfboard || 0) > 0) {
    if (inv.surfboard > 1) inv.surfboard = 1;
    if (!prof.surfboard || prof.surfboard.at !== 'bag') {
      removeLying(world, p, 'surf');
      if (holding(p.ped, 'surf')) clearHeld(p.ped);
      prof.surfboard = { at: 'bag' }; store.touch();
    }
  } else if (prof.surfboard && prof.surfboard.at === 'bag') { delete prof.surfboard; store.touch(); }
  if ((inv.rollerblades || 0) > 1) inv.rollerblades = 1;
}
function removeLying(world, p, k) {
  for (const v of [...world.entities.values()]) if (v.kind === K.VEH && v.owner === p.pid && (k === 'surf' ? v.def.surfboard : v.def.board)) world.remove(v);
}

// ---- a board in your hand ----------------------------------------------------------------------------------------------
function setHeld(ped, k, deck = null) {
  ped.held = { k, deck };
  ped.pp = LOOK[k]; ped.appVer = (ped.appVer || 0) + 1;
}
function clearHeld(ped) {
  if (!ped || !ped.held) return null;
  const h = ped.held;
  ped.held = null;
  if (ped.pp === LOOK[h.k]) ped.pp = null;
  ped.appVer = (ped.appVer || 0) + 1;
  return h;
}
const skateDeck = (p) => { const b = p.profile.board || {}; return { owner: p.pid, ownerName: p.name, paint: b.paint, variant: b.variant, wear: b.wear || 0 }; };
// why your hands can't take a board now (null: they can)
function busy(world, ped) {
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.onTrain || ped.ride || ped.cuffed || ped.hoodOf || ped.sky || ped.ug) return 'Not right now.';
  if (ped.board || ped.surf) return 'Not while you\'re riding.';
  if (ped.carrying) return 'Put the crate down first.';
  if (ped.lacing) return 'Not while you\'re lacing up.';
  return null;
}
// a board into your hand: out of the bag (the bag's Use, the quick wheel) - the other one in your hand goes in the bag
export function take(world, p, k) {
  const ped = p.ped, why = busy(world, ped);
  if (why) { world.notify(p, why, 'warn'); return false; }
  if (!inBag(p, k)) return false;
  if (ped.held) stow(world, p);
  const inv = p.profile.inventory;
  inv[ITEM[k]]--; if (!inv[ITEM[k]]) delete inv[ITEM[k]];
  if (k === 'skate') delete p.profile.board.at; else p.profile.surfboard = { at: 'out' };
  setHeld(ped, k, k === 'skate' ? skateDeck(p) : null);
  store.touch(); p.meDirty = true;
  world.notify(p, k === 'skate'
    ? 'Your skateboard in your hand - it takes a hand, so no fighting with it. The vehicle button rides it (F / X / CAR), the action button puts it back in the bag.'
    : 'Your surfboard under your arm. Out in the sea the action button sets it down and you\'re on it, paddling; the vehicle button sets it down on the sand.', 'info');
  return true;
}
// the board in your hand into the bag
export function stow(world, p) {
  const ped = p.ped, h = clearHeld(ped);
  if (!h) return false;
  const prof = p.profile;
  if (h.k === 'skate') { if (!prof.board) prof.board = { paint: h.deck.paint, variant: h.deck.variant }; prof.board.at = 'bag'; prof.board.wear = h.deck.wear || 0; }
  else prof.surfboard = { at: 'bag' };
  prof.inventory[ITEM[h.k]] = 1;
  store.touch(); p.meDirty = true;
  return true;
}
// the board in your hand set down at your feet (dry ground; in the water or nowhere to lie, it goes home)
export function setDown(world, p) {
  const ped = p.ped, h = clearHeld(ped);
  if (!h) return null;
  return h.k === 'skate' ? skate.putDown(world, h.deck, skate.feet(world, ped), ped.a, ped.lz) : layBoard(world, p, ped);
}
// up off the ground into your hand: your own board lying there (vehicles.js tryEnter: a surfboard; the action button: a
// skateboard - the vehicle button rides that). Someone else's stays where it is.
export function pickUp(world, p, v) {
  const ped = p.ped, k = v.def.surfboard ? 'surf' : 'skate';
  if (v.owner !== p.pid) { world.notify(p, `That's someone's ${NAME[k]}.`, 'warn'); return false; }
  const why = busy(world, ped);
  if (why) { world.notify(p, why, 'warn'); return false; }
  if (ped.held) stow(world, p);
  if (k === 'skate') setHeld(ped, k, skate.pickUp(world, v));
  else { world.remove(v); p.profile.surfboard = { at: 'out' }; setHeld(ped, k); }
  p.meDirty = true;
  return true;
}
// The vehicle button with a board in your hand (players.js applyInput): a vehicle in reach first (into it, the board in
// your bag: tryEnter); else a skateboard - on it; a surfboard - in the sea on it, on land set down. true: done here.
export function vehicleButton(world, p, ped) {
  if (!ped.held) return false;
  if (vehicles.nearestVehicle(world, ped, 56, true)) return false;
  if (ped.held.k === 'skate') {
    if (wearing(ped)) { note(world, p, 'veh', 'Not on rollerblades - take them off at a bench first.', 'warn'); return true; }
    const h = clearHeld(ped);
    if (!skate.hopOn(world, p, ped, h.deck)) setHeld(ped, 'skate', h.deck);   // (not here: it stays in your hand)
    return true;
  }
  if (inSea(world, ped)) paddleOut(world, p);
  else setDown(world, p);
  return true;
}

// ---- the surfboard -------------------------------------------------------------------------------------------------------
const inSea = (world, ped) => isSwimming(world.map, ped) && surf.seaAt(world.map, ped.x, ped.y);
// why you can't get on your surfboard here (null: you can)
function cantPaddle(world, p, ped) {
  if (!ped || ped.dead || ped.surf || ped.vehId || ped.hidden || ped.onTrain || ped.sky || ped.cuffed || ped.ride || ped.board || ped.carrying || ped.fishing) return 'Not right now.';
  if (!(holding(ped, 'surf') || inBag(p, 'surf'))) return 'No surfboard with you.';
  if (!inSea(world, ped)) return 'Out in the sea, not here.';
  return null;
}
// in the sea, the board set down and you on it, paddling (surf.js)
export function paddleOut(world, p) {
  const ped = p.ped, why = cantPaddle(world, p, ped);
  if (why) { world.notify(p, why, 'warn'); return false; }
  if (holding(ped, 'surf')) clearHeld(ped);
  else { const inv = p.profile.inventory; inv.surfboard--; if (!inv.surfboard) delete inv.surfboard; if (holding(ped, 'skate')) stow(world, p); }
  p.profile.surfboard = { at: 'out' };
  store.touch();
  surf.start(world, p);
  return true;
}
// off the board (surf.js stop): into your hand (slid off, up the beach), the bag (into a boat, inside, onto a train...)
// or home (gone down in the water)
export function offBoard(world, p, to) {
  const ped = p.ped, prof = p.profile;
  if (to === 'hand' && ped && !ped.dead && !busy(world, { ...ped, surf: null })) { if (ped.held) stow(world, p); prof.surfboard = { at: 'out' }; setHeld(ped, 'surf'); }
  else if (to !== 'home') { prof.surfboard = { at: 'bag' }; prof.inventory.surfboard = 1; }
  else goHome(world, p, false);
  store.touch(); p.meDirty = true;
}
// a surfboard lying on dry land by you (a vehicle: shared/vehicles.js surfboard - picked up with the vehicle button)
function layBoard(world, p, ped) {
  const a = ped.a || 0, m = world.map;
  for (const [f, r] of [[0, 20], [0, -20], [-24, 0], [0, 0]]) {
    const x = ped.x + Math.cos(a) * f - Math.sin(a) * r, y = ped.y + Math.sin(a) * f + Math.cos(a) * r, t = m.tileAtPx(x, y);
    if (WATER_T[t] || PED_BLOCK[t]) continue;
    const v = world.spawnVehicle('surfboard', x, y, a, { npcOwned: false, owner: p.pid, ownerName: p.name, paint: 0 });
    v.parked = false; v.despawnable = false; v.lz = ped.lz || 0; v.homeAt = world.time + RIDE_GEAR.surfLieS;
    p.profile.surfboard = { at: 'out' };
    store.touch();
    return v;
  }
  goHome(world, p, true);
  return null;
}
function goHome(world, p, tell) {
  p.profile.surfboard = { at: 'home' };
  store.touch();
  if (tell && p.conn) world.notify(p, 'Your surfboard\'s back home - take it out at home or at a surf shop.', 'info');
}
// a surfboard left lying: home once its time's up and nobody's looking, or once its owner's gone or far away
function tidy(world) {
  for (const v of [...world.entities.values()]) {
    if (v.kind !== K.VEH || !v.def.surfboard || v.removed) continue;
    const q = v.owner ? world.players.get(v.owner) : null, ped = q && q.ped;
    const gone = !q || !q.conn || !ped || Math.hypot(ped.x - v.x, ped.y - v.y) > HOME_PX;
    if (!gone && world.time < (v.homeAt || 0)) continue;
    if (inAnyView(world, v.x, v.y, 64)) continue;
    world.remove(v);
    if (q && q.profile.surfboard && q.profile.surfboard.at === 'out') goHome(world, q, !!q.conn);
  }
}
// your surfboard at home: out at home or at a surf shop, into your bag (economy.js: 'sb:out')
export function surfOptions(p, opts, home = false) {
  const S = p.profile.surfboard;
  if (!S || S.at === 'bag' || holding(p.ped, 'surf') || (p.ped && p.ped.surf)) return;
  opts.push({ id: 'sb:out', label: home ? 'Take your surfboard' : 'Your surfboard - take it', note: 'into your bag', shut: true });
}
export function surfExecute(world, p) {
  const S = p.profile.surfboard;
  if (!S || S.at === 'bag' || holding(p.ped, 'surf') || (p.ped && p.ped.surf)) return 'No such thing.';
  removeLying(world, p, 'surf');
  p.profile.surfboard = { at: 'bag' }; p.profile.inventory.surfboard = 1;
  store.touch(); p.meDirty = true;
  world.notify(p, 'Your surfboard, in your bag.', 'good');
  return null;
}

// ---- rollerblades -------------------------------------------------------------------------------------------------------
const benchBy = (world, ped) => { let best = null, bd = BLADES.reach; for (const b of benchesNear(world.map, ped.x, ped.y, BLADES.reach)) { const d = Math.hypot(b.x - ped.x, b.y - ped.y); if (d < bd) { bd = d; best = b; } } return best; };
function lace(world, p, b, on) {
  const ped = p.ped;
  if (ped.blades === on || (on && !inBag(p, 'blades'))) return;
  ped.lacing = { until: world.time + BLADES.laceS, on, from: { x: ped.x, y: ped.y, a: ped.a } };
  ped.sitBench = true; ped.x = b.x; ped.y = b.y; ped.a = benchFacing(world.map, b); ped.vx = 0; ped.vy = 0; moved(ped);
  ped.appVer = (ped.appVer || 0) + 1;
  world.place(ped);
  p.meDirty = true;
}
function standUp(world, ped) {
  const L = ped.lacing;
  ped.lacing = null; ped.sitBench = false; ped.appVer = (ped.appVer || 0) + 1;
  if (L) { ped.x = L.from.x; ped.y = L.from.y; ped.a = L.from.a; moved(ped); world.place(ped); }
}
// While you're lacing up (players.js applyInput, before you move): sat still; the stick gets you up (it's not done)
export function lacingInput(world, p, ped, inp) {
  if (!ped.lacing) return false;
  ped.vx = 0; ped.vy = 0;
  if (Math.hypot(inp.mx || 0, inp.my || 0) > 0.5) { standUp(world, ped); world.notify(p, 'You get up - not done.', 'info'); }
  return true;
}
function laced(world, p, ped) {
  const on = ped.lacing.on, prof = p.profile;
  standUp(world, ped);
  if (on) { if (!inBag(p, 'blades')) return; prof.inventory.rollerblades--; if (!prof.inventory.rollerblades) delete prof.inventory.rollerblades; prof.bladesOn = 1; }
  else { delete prof.bladesOn; prof.inventory.rollerblades = 1; }
  ped.blades = on;
  look(ped);
  store.touch(); p.meDirty = true;
  world.notify(p, on ? 'Rollerblades on: quicker than walking, no sprinting, no vehicles - and keep off the grass. Take them off at a bench.' : 'Rollerblades off, in your bag.', 'good');
}
// the blading walk (the descriptor's gt: client/art2/people.js blade) - whenever nothing else has the walk
function look(ped) {
  if (ped.blades && !ped.gt && !ped.board) { ped.gt = 'blade'; ped.appVer = (ped.appVer || 0) + 1; }
  else if (!ped.blades && ped.gt === 'blade') { ped.gt = null; ped.appVer = (ped.appVer || 0) + 1; }
}
// on blades (players.js pedMods): no sprint, and the speed - a glide on smooth ground, a clump across the rough, a swim in
// the water as anyone's
export function bladeMul(world, ped) {
  if (!ped.blades || isSwimming(world.map, ped)) return 1;
  return rough(world, ped) ? BLADES.roughMul : BLADES.speedMul;
}
function rough(world, ped) {
  if ((ped.lz || 0) > 0.3) return false;   // (up on a bridge's deck, an overpass)
  const t = world.map.tileAtPx(ped.x, ped.y);
  return !WATER_T[t] && t !== T.FLOOR && t !== T.COUNTER && boardGround(t) === 2;
}
// rolling onto grass, dirt or sand at speed: down you go
function grass(world, p, ped) {
  if (!ped.blades || ped.lacing || ped.dead || ped.vehId || ped.hidden || ped.onTrain || ped.ride || ped.surf || ped.sky || ped.hoodOf || ped.cuffed) return;
  if (world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0) || isSwimming(world.map, ped) || !rough(world, ped)) return;
  if (Math.hypot(ped.vx, ped.vy) <= BLADES.fallV) return;
  ped.downUntil = world.time + BLADES.fallS; ped.vx *= 0.3; ped.vy *= 0.3;
  world.emit(ped.x, ped.y, { e: 'thud', x: ped.x, y: ped.y });
  note(world, p, 'grass', 'Rollerblades and grass don\'t mix - you go down. Slow over the rough, or take them off at a bench.', 'warn');
}

// ---- the prompts ---------------------------------------------------------------------------------------------------------
// The action button (players.js findInteraction), in three places: early - lacing up (what's happening), the sea to paddle
// out into; before the vehicles in reach - your own skateboard lying here to pick up, a bench to put your blades on or take
// them off at; last of all - off your surfboard, the board in your hand into the bag
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead) return null;
  if (ped.lacing) return { label: `${ped.lacing.on ? 'Putting on' : 'Taking off'} your rollerblades... (move to get up)`, passive: true, run: () => {} };
  if (!cantPaddle(world, p, ped)) return { label: 'Paddle out on your surfboard', run: () => paddleOut(world, p) };
  return null;
}
export function groundInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead || ped.board || ped.surf || isSwimming(world.map, ped)) return null;
  const lying = world.query(ped.x, ped.y, 40, K.VEH).find((v) => v.def.board && v.owner === p.pid && !v.removed);
  if (lying) return { label: 'Pick up your skateboard', run: () => pickUp(world, p, lying) };
  if ((wearing(ped) || inBag(p, 'blades')) && !ped.carrying) {
    const b = benchBy(world, ped);
    if (b) return { label: `${wearing(ped) ? 'Take off' : 'Put on'} your rollerblades (sit, ${BLADES.laceS} s)`, run: () => lace(world, p, b, !wearing(ped)) };
  }
  return null;
}
export function lateInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead) return null;
  if (ped.surf) return ped.surf.st === 'pad' ? { label: 'Slide off your surfboard', run: () => surf.stop(world, p, 'hand') } : null;
  if (ped.held) return { label: `Put the ${NAME[ped.held.k]} in your bag`, run: () => stow(world, p) };
  return null;
}
// The bag's Use, the quick wheel (economy.js useItem): a board into your hand; your rollerblades on at a bench
export function useFromBag(world, p, id) {
  const k = ITEMS[id] && ITEMS[id].ride;
  if (k === 'skate' || k === 'surf') {
    if (k === 'surf' && inSea(world, p.ped)) return paddleOut(world, p);
    return take(world, p, k);
  }
  if (k === 'blades') {
    const b = p.ped && !busy(world, p.ped) ? benchBy(world, p.ped) : null;
    if (!b) { world.notify(p, 'Sit on a bench to put your rollerblades on - walk up to one and press the action button.', 'info'); return false; }
    lace(world, p, b, true);
    return true;
  }
  return false;
}
// Into a vehicle (vehicles.js tryEnter): not on rollerblades; a board in your hand goes in your bag
export function canEnter(world, p, ped) {
  if (wearing(ped)) { note(world, p, 'veh', 'Not on rollerblades - take them off at a bench first.', 'warn'); return false; }
  if (ped.held) stow(world, p);
  return true;
}

// ---- joining, spawning, every tick ---------------------------------------------------------------------------------------
// coming back (players.js join): the bag and what you own in step; a surfboard you'd left out somewhere is home
export function onJoin(world, p) {
  sync(world, p);
  const S = p.profile.surfboard;
  if (S && S.at === 'out') S.at = 'home';
}
// a new character in the world (players.js spawnPlayerPed): your rollerblades on if you had them on
export function onSpawn(world, p, ped) {
  ped.blades = !!p.profile.bladesOn;
  ped.held = null; ped.lacing = null;
  look(ped);
}
// every tick (world.js SYSTEMS): the lacing done, a fall on the grass, the walk's look, a board in your hand put away when
// your hands are wanted (into a vehicle, inside, a crate) or dropped where you fall; now and then the bag in step and the
// surfboards left lying taken home
export function update(world) {
  const slow = world.tick % 20 === 13;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (slow) sync(world, p);
    if (!ped || ped.removed) continue;
    if (ped.lacing) {
      if (ped.dead || ped.vehId || ped.hidden || world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0)) standUp(world, ped);
      else if (world.time >= ped.lacing.until) laced(world, p, ped);
    }
    if (ped.held) {
      if (ped.dead) setDown(world, p);
      else if (ped.vehId || ped.hidden || ped.onTrain || ped.ride || ped.carrying || ped.cuffed || ped.board || ped.surf || ped.sky || ped.ug) stow(world, p);
    }
    grass(world, p, ped);
    look(ped);
  }
  if (world.tick % 40 === 27) tidy(world);
}
