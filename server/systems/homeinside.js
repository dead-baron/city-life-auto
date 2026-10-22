// Inside your own home (H62; the owner, 2026-10-11: "after the honest jobs are in can we get more of the owning a house
// features up? Like going inside your own house would be great to get going"). At your front door the action button
// opens it and you're in: the rooms of a little level of its own (shared/homelayout.js: a plan for the home's kind,
// furnished by its price - not part of the map, so World v3 can move the homes about), walls you can't walk through,
// doors between the rooms, and things to use where they stand:
//   the bed: sleep - the screen goes dark while the night passes for you (the whole city's night too when everyone online
//     is asleep at home); you wake at morning healed and rested, and this is where you wake up from now on (saved)
//   the wardrobe: your outfits (a new one from your wardrobe, the quick change, the mirror: looks.js)
//   the safe: your stash - things, guns and cash kept at home, safe from a death or an arrest (profile.stash)
//   the fridge: food kept at home (profile.stash's food) - put it in, eat it
//   the shower: stops the bleeding, puts out a burn, a little health back
//   the hall table: the home menu (respawn point, the bank, the garage list)
//   the garage's key board (a house's or a mansion's garage, through the door from the hall): your cars - pick one and
//     you drive it out (homes.driveOut)
//   the front door: back out into the street (a couple of seconds' protection, as ever)
// Friends: at someone else's door while they're in, the action button knocks; the owner lets them in from the hall table
// (who's knocking is listed there). A guest walks round with you - you see each other in there - and goes out by the
// front door; the things in the place are the owner's.
// Nobody can see or hurt you inside (you're out of the world's grid: world.place), and the police can't follow you in.
// The server walks you round (input), says what the action button does where you stand (interaction), and sends you
// where you are every tick ({ t: 'home' }); the page only draws it (client/render/homeview.js, loaded when you go in).
//   ped.home: { id, x, y, a (px, in the plan), mv (walking), sleep / shower (when it ends, world.time; 0 none), eatAt }
//   ped.home.guest: a guest's host (pid); p.knock: { home, at } someone at a door, knocking
//   p.homeMenu: the menu of the thing you're using ('wardrobe' | 'safe' | 'fridge' | 'garage' | 'hall'), null for none
import { DAY_PART_S, TICK_HZ } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { HOME_IN, DECOR, MAIL } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { layout, planOf, tierOf, stepInside, useAt, blocked, TILE_IN } from '../../shared/homelayout.js';
import { decorate, canPlace, targetOf, facingYou, pieceAt, roomsOf, PIECES, KINDS, WALLS, FLOORS, priceOf, backOf, faceName } from '../../shared/homedecor.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import * as economy from './economy.js';
import * as mortgage from './mortgage.js';
import * as mail from './mail.js';
import * as skills from './skills.js';
import * as arcade from './arcade.js';

export const planFor = (h) => layout(planOf(h), tierOf(h));
// (H67) a home's decor - its owner's (profile.decor[home id]: shared/homedecor.js) - and its plan with the decor laid over
export function decorOf(world, h) {
  const pid = h && world.homeOwner.get(h.id);
  if (!pid) return null;
  const q = world.players.get(pid), prof = q ? q.profile : store.get(pid);
  const d = prof && prof.decor && prof.decor[h.id];
  return d && (d.plan === undefined || d.plan === planOf(h)) ? d : null;   // (laid in other rooms: not over these - homes.replanDecor)
}
export const planIn = (world, h) => decorate(planFor(h), decorOf(world, h));
const homeOf = (world, ped) => (ped && ped.home ? homes.homeById(world, ped.home.id) : null);
const money = (n) => `$${Math.round(n).toLocaleString()}`;

// ---- in and out -------------------------------------------------------------------------------------------------------
// You're in (homes.goInside): just inside the front door
export function enter(world, p, h, at) {
  const ped = p.ped;
  const L = planFor(h), sp = at || L.spawn;   // (at: out of a flat's door into its lobby - H71)
  ped.home = { id: h.id, x: sp.x, y: sp.y, a: at ? Math.PI / 2 : -Math.PI / 2, mv: false, sleep: 0, shower: 0, eatAt: -9, inAt: world.time, ...(h.isLobby ? { lobby: 1 } : null) };
  p.homeMenu = null;
  if (!h.isLobby && world.homeOwner.get(h.id) === p.pid) {   // (H71) your pet comes to meet you; the mail by a house's door comes in with you
    petIn(world, p, h);
    const n = homes.blockOf(world, h) == null ? mail.unread(p.profile) : 0;
    if (n) world.notify(p, `You pick up the mail on the way in: ${n} new - read it at the hall table.`, 'info');
  }
  send(world, p, true);
}

// The action button at your own front door, outside: in you go (wanted, the key takes a moment - homes.beginEnter)
export function doorInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying || ped.entering || ped.ug) return null;
  const poi = world.map.poiNear(ped.x, ped.y);
  let h = null, back = false;
  if (poi && poi.kind === 'home') {
    if (homes.unitsAt(world, poi)) return lobbyDoor(world, p, poi);   // (H71: an apartment block - into its lobby, open to anyone)
    h = world.map.homes[poi.home];
  } else if ((h = homes.backDoorNear(world, ped.x, ped.y))) back = true;   // (the mansion's garden door, its south side)
  if (!h) return null;
  if (!world.homeOwner.has(h.id)) return back ? { label: `${h.name}'s garden door - for sale: its front door is round the north side`, passive: true, run: () => {} } : null;
  if (world.homeOwner.get(h.id) === p.pid) {
    if (!p.homePre && p.conn) { p.homePre = 1; p.conn.sendJSON({ t: 'home', pre: 1 }); }   // (the page fetches the rooms' drawing now, so they're there the moment you're in)
    return { label: `Go inside ${h.name}`, run: () => goIn(world, p, h) };
  }
  const host = hostIn(world, h);   // (someone else's: if they're in, knock)
  if (!host) return null;
  if (p.knock && p.knock.home === h.id && world.time - p.knock.at < 20) return { label: `Waiting for ${host.name} to open the door...`, passive: true, run: () => {} };
  return { label: `Ring the doorbell (${host.name} is in)`, run: () => knock(world, p, h, host) };
}

// ---- an apartment block's lobby (H71; HO5) --------------------------------------------------------------------------
// The building's front door opens into its lobby (shared/homelayout.js lobby4 .. lobby8): anyone may walk in - a shared,
// safe place, out of the world like a home (nobody sees or hurts you there; the police can't follow you in while they
// can see you, and wanted, the door takes its moment) - the mailboxes, the lift and the stairs, and the flats' doors along
// the landing, one a unit, numbered: yours to go in, one for sale to look round or buy, someone else's to ring the
// doorbell at. Out of a flat's front door you're back on the landing outside it. ped.home.lobby: 1 in a lobby.
function lobbyDoor(world, p, poi) {
  const lob = homes.lobbyOf(world, poi.home), base = world.map.homes[poi.home];
  if (!lob || !base) return null;
  if (!p.homePre && p.conn) { p.homePre = 1; p.conn.sendJSON({ t: 'home', pre: 1 }); }
  const mine = (world.unitsOf.get(poi.home) || []).filter((id) => world.homeOwner.get(id) === p.pid).length;
  return { label: `Into ${base.name}'s lobby${mine ? ' - your home is in here' : ''}`, run: () => intoLobby(world, p, lob) };
}
export function intoLobby(world, p, lob) {
  const ped = p.ped;
  const err = !ped || ped.dead || ped.vehId || ped.hidden ? 'Not right now.' : ped.carrying ? 'Set the crate down first.' : p.wanted > 0 && world.time - (p.seenAt || -99) < 1.5 ? 'Not with the police watching you!' : null;
  if (err) { world.notify(p, err, 'bad'); return err; }
  if (p.wanted > 0) { ped.entering = { home: lob.id, at: world.time, x: ped.x, y: ped.y }; ped.vx = 0; ped.vy = 0; world.notify(p, 'Slipping in through the lobby door... (stand still)', 'info'); return null; }   // (homes.update: in after the moment)
  homes.goInside(world, p, lob);
  return null;
}
// a flat in the block whose lobby you're in: unit n (1 the map's own)
const flatOf = (world, lob, n) => homes.homeById(world, (world.unitsOf.get(lob.block) || [])[n - 1]);
const ownsIn = (world, p, block) => (world.unitsOf.get(block) || []).some((id) => world.homeOwner.get(id) === p.pid);
const nameOf = (world, pid) => { const q = world.players.get(pid), prof = q ? q.profile : store.get(pid); return (q && q.name) || (prof && prof.name) || 'someone'; };
function lobbyInteraction(world, p, h, s) {
  const L = planFor(h), u = useAt(L, s.x, s.y, HOME_IN.reach), base = world.map.homes[h.block], none = () => {};
  if (!u) return { label: `${base.name} - the lobby: the flats' doors along the landing, the mailboxes`, passive: true, run: none };
  if (u.use === 'door') return { label: 'Out to the street', run: () => leave(world, p) };
  if (u.use === 'mail') {
    if (!ownsIn(world, p, h.block)) return { label: 'The mailboxes - one for each flat', passive: true, run: none };
    const n = mail.unread(p.profile);
    return { label: `Your mailbox${n ? ` - ${n} new` : ''}`, run: () => { openMenu(world, p, 'mail'); send(world, p, true); } };
  }
  if (u.use !== 'unit') return { label: `${base.name} - the lobby`, passive: true, run: none };
  const f = flatOf(world, h, u.n);
  if (!f) return { label: `Unit ${u.n}`, passive: true, run: none };
  const o = world.homeOwner.get(f.id), nm = `Unit ${u.n}`;
  if (o === p.pid) return { label: `${nm} - your door: go in`, run: () => homes.goInside(world, p, f) };
  if (!o) return { label: `${nm} - for sale, ${money(f.price)}: look round or buy`, run: () => { p.lobbyPick = f.id; openMenu(world, p, 'unit'); } };
  const host = hostIn(world, f);
  if (!host) return { label: `${nm} - ${nameOf(world, o)}'s (nobody's in)`, passive: true, run: none };
  if (p.knock && p.knock.home === f.id && world.time - p.knock.at < 20) return { label: `Waiting for ${host.name} to open the door...`, passive: true, run: none };
  return { label: `${nm} - ring ${host.name}'s doorbell`, run: () => knock(world, p, f, host) };
}
// out of a flat's front door: onto the landing outside it
function toLobby(world, p, lob, from) {
  const ped = p.ped, d = planFor(lob).doors[(from.unit || 1) - 1];
  ped.inside = lob.id; ped.x = lob.x; ped.y = lob.y;
  p.meDirty = true;
  enter(world, p, lob, d ? { x: d.x, y: d.y + TILE_IN } : null);
}
// the owner of h, online and inside it (null: not in)
function hostIn(world, h) {
  const q = world.players.get(world.homeOwner.get(h.id));
  return q && q.ped && q.ped.home && q.ped.home.id === h.id && !q.ped.home.guest && q.ped.hidden ? q : null;
}
// (H65) the owner of h at home just now (an apartment block's lobby: who to knock at); a knock from the lobby list
export const someoneIn = (world, h) => !!hostIn(world, h);
export function knockAt(world, p, h) {
  const host = hostIn(world, h);
  if (!host) return 'Nobody\'s in.';
  if (host === p) return null;
  knock(world, p, h, host);
  return null;
}
// the bedrooms in a home's plan (the real-estate app, the lobby)
export const bedsIn = (h) => planFor(h).pieces.filter((q) => q.use === 'bed').length;
// (H71) the doorbell: it rings inside - the host's page plays it ({ t: 'home', bell }) - and says who's there
function knock(world, p, h, host) {
  p.knock = { home: h.id, at: world.time };
  world.notify(p, `You ring ${host.name}'s doorbell...`, 'info');
  world.notify(host, `Ding-dong! ${p.name} is at your door - let them in from the hall table.`, 'info');
  host.bellAt = world.time;
  if (host.conn) host.conn.sendJSON({ t: 'home', bell: p.name });
}
// at h's front door, knocking, and fit to come in (out in the street, or on its block's landing - H71)
function knocking(world, q, h) {
  const ped = q.ped;
  if (!(q.knock && q.knock.home === h.id && world.time - q.knock.at < 90 && ped && !ped.dead && !ped.vehId && !ped.carrying)) return false;
  if (ped.hidden) { const lh = ped.home && ped.home.lobby ? homes.homeById(world, ped.home.id) : null; return !!lh && lh.block === homes.blockOf(world, h); }
  return Math.hypot(ped.x - h.x, ped.y - h.y) < 120;
}
// a guest in: just inside the front door, beside the host's way in
function letIn(world, q, h, host) {
  const ped = q.ped, L = planIn(world, h);
  if (q.wanted > 0 && world.time - (q.seenAt || -99) < 1.5) return `Not with the police watching ${q.name}!`;
  q.knock = null;
  ped.entering = null; ped.inside = h.id; ped.hidden = true; ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.fishing = null;
  ped.x = h.x; ped.y = h.y;
  world.place(ped);
  const gx = [L.spawn.x + 20, L.spawn.x - 20, L.spawn.x].find((x) => !blocked(L, x, L.spawn.y));   // (beside the way in, not on the host)
  ped.home = { id: h.id, x: gx, y: L.spawn.y, a: -Math.PI / 2, mv: false, sleep: 0, shower: 0, eatAt: -9, guest: host.pid };
  q.homeMenu = null; q.meDirty = true;
  world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y });
  world.notify(q, `${host.name} lets you in. Nobody outside can see or hurt you in here.`, 'good');
  world.notify(host, `${q.name} is in.`, 'good');
  send(world, q, true); send(world, host, true);
  return null;
}
export function goIn(world, p, h) {
  const err = homes.beginEnter(world, p, h);
  if (err) { world.notify(p, err, 'bad'); return err; }
  if (!(p.wanted > 0)) homes.goInside(world, p, h);   // (not wanted: the door's open and you're in)
  return null;
}

// ---- a look round a home for sale (H65) -------------------------------------------------------------------------------
// At a home for sale (its door's menu, an apartment block's lobby, the real-estate app's waypoint) "Take a look inside":
// you walk its rooms as a visitor - nothing to use, no safe - and at the front door, its price and Buy (or step out).
// Bought from inside, it's yours where you stand. Someone else buys it while you're looking: you're shown out.
// ped.home.tour: 1 while you're a visitor.
export function tour(world, p, h) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || (ped.hidden && !(ped.home && ped.home.lobby)) || ped.ug) return 'Not right now.';   // (from the street, or a block's landing - H71)
  if (!h || h.gone) return 'No such place.';
  if (world.homeOwner.has(h.id)) return world.homeOwner.get(h.id) === p.pid ? 'It\'s yours - just go in.' : 'That place is sold.';
  if (p.wanted > 0) return 'Not while the police are after you.';
  if (ped.carrying) return 'Set the crate down first.';
  const L = planFor(h);
  ped.entering = null; ped.inside = h.id; ped.hidden = true; ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.fishing = null;
  ped.x = h.x; ped.y = h.y;
  world.place(ped);
  ped.home = { id: h.id, x: L.spawn.x, y: L.spawn.y, a: -Math.PI / 2, mv: false, sleep: 0, shower: 0, eatAt: -9, tour: 1 };
  p.homeMenu = null; p.knock = null; p.meDirty = true;
  world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y });
  world.notify(p, `Having a look round ${h.name} - ${money(h.price)}. To buy it, the front door.`, 'info');
  send(world, p, true);
  return null;
}
const THING = { bed: 'The bed', wardrobe: 'The wardrobe', safe: 'The safe', fridge: 'The fridge', shower: 'The shower', hall: 'The hall table', garage: 'The garage' };

// Out through the front door
export function leave(world, p) {
  const ped = p.ped;
  if (!ped || !ped.home) return;
  const h = homeOf(world, ped), b = h && !h.isLobby ? homes.blockOf(world, h) : null, lob = b != null ? homes.lobbyOf(world, b) : null;
  ped.home = null; p.homeMenu = null;
  if (lob && ped.hidden && !ped.dead) { toLobby(world, p, lob, h); return; }   // (H71: a flat's door opens onto its landing)
  homes.leaveHome(world, p);
  if (p.conn) p.conn.sendJSON({ t: 'home', off: 1 });
}

// ---- walking round ----------------------------------------------------------------------------------------------------
// The input while you're inside (players.applyInput): walk, and the action button uses what's in reach. true: handled.
export function input(world, p, ped, inp, pressed, dt) {
  const s = ped.home, h = homeOf(world, ped);
  if (!s || !h) return false;
  if (s.sleep || s.shower || s.cook) { s.mv = false; return true; }   // (asleep, in the shower, at the stove: nothing to do but wait)
  if (s.seat) {   // (sat down: moving gets you up, back where you stood)
    if (Math.hypot(inp.mx || 0, inp.my || 0) < 0.4) { s.mv = false; return true; }
    s.seat = null; send(world, p, true);
  }
  s.mv = stepInside(planIn(world, h), s, inp.mx || 0, inp.my || 0, dt, HOME_IN.walk);
  if (pressed & (IN.ACTION | IN.VEHICLE)) { const act = interaction(world, p); if (act && !act.passive) act.run(); }
  return true;
}

const LABEL = {
  door: () => 'Step outside',
  bed: () => 'Sleep (wake up in the morning, rested)',
  wardrobe: () => 'Wardrobe - your outfits',
  safe: (world, p) => { const st = p.profile.stash || {}; return `The safe${st.cash ? ` (${money(st.cash)} in it)` : ''}`; },
  fridge: () => 'The fridge',
  shower: () => 'Take a shower',
  hall: () => 'Home - respawn point, bank, garage',
  garage: (world, p, h) => (h.garage ? 'Your cars - pick one to drive out' : 'This place has no garage'),
};
// What the action button does where you stand (players.findInteraction, for the prompt)
export function interaction(world, p) {
  const ped = p.ped, s = ped && ped.home, h = homeOf(world, ped);
  if (!s || !h) return null;
  if (s.sleep) return { label: 'Asleep... the night is passing', passive: true, run: () => {} };
  if (s.shower) return { label: 'In the shower...', passive: true, run: () => {} };
  if (s.cook) return { label: 'Cooking... something smells good', passive: true, run: () => {} };
  if (s.lobby) return lobbyInteraction(world, p, h, s);   // (H71: a block's lobby)
  if (s.edit) return editPrompt(world, p, h);   // (H67: decorating - the action button is the menu for the spot in front of you)
  const u = useAt(planFor(h), s.x, s.y, HOME_IN.reach);
  if (s.tour) {   // a visitor: the door is the way out (or the sale), the rest is to look at - the door first when it's in reach
    const L = planFor(h), D = L.door, dd = Math.hypot(Math.max(D.x - TILE_IN / 2 - s.x, 0, s.x - D.x - TILE_IN / 2), Math.max(D.y - TILE_IN / 2 - s.y, 0, s.y - D.y - TILE_IN / 2));
    if ((u && u.use === 'door') || dd <= HOME_IN.reach + 2) return { label: `The front door - buy ${h.name} (${money(h.price)}) or step outside`, run: () => openMenu(world, p, 'tour') };
    return { label: `${u ? `${THING[u.use] || 'That'} comes with the place - ` : 'Having a look round - '}${h.name}, ${money(h.price)}`, passive: true, run: () => {} };
  }
  if (s.seat) return { label: tvOn(world, h) ? 'Watching TV - move to get up' : 'Sitting down - move to get up', passive: true, run: () => {} };
  const f = furnitureAt(world, h, s);   // (a seat or the TV - the couch, an armchair, the cinema's rows; the decor's too)
  if (f && (!u || near(f, s.x, s.y) + 10 < near(u, s.x, s.y))) {   // (a seat or the TV only when clearly nearer: the hall table, the bed and the rest come first)
    if (TVS.has(f.ch)) return { label: tvOn(world, h) ? 'Switch the TV off' : 'Switch the TV on', run: () => tv(world, p, h) };
    if (f.ch === 'x') return { label: 'Rack \'em up at the pool table', run: () => arcade.play(world, p, true, null, 'pool') };
    if (CABS.has(f.ch)) return { label: 'Play STARFALL on the cabinet', run: () => arcade.play(world, p, true) };
    return { label: tvOn(world, h) ? 'Sit down and watch TV' : 'Sit down', run: () => sit(world, p, h, f) };
  }
  // (by nothing: the hint for the first few seconds in, then no prompt over the rooms - HOME_IN.hintS)
  if (!u) return world.time - (s.inAt ?? -1e9) < HOME_IN.hintS ? { label: `${h.name} - walk up to something to use it`, passive: true, run: () => {} } : null;
  if (s.guest && u.use !== 'door') { const host = world.players.get(s.guest); return { label: `The ${u.use === 'hall' ? 'hall table' : u.use === 'garage' ? 'garage' : u.use} - ${host ? `${host.name}'s` : 'not yours'}`, passive: true, run: () => {} }; }
  return { label: LABEL[u.use](world, p, h), run: () => use(world, p, h, u.use) };
}

// ---- the couch and the TV (the owner, 10-06 / 10-16: "usable furniture: sit, sleep, watch TV...") ----------------------
// A seat - the couch, the sectional, an armchair, the home cinema's rows (the decor's too) - is sat on where it's
// nearest you, facing the way it faces (the sectional and the cinema's seats the TV); moving gets you up. A rest there
// brings health back slowly (HOME_IN.restHeal). The TV switches on and off (everyone in the home sees it: the page's
// screen flickers and lights the room); with nobody home it goes off.
const SEATS = new Set(['C', 's', 'O', 'i']), TVS = new Set(['V', 'v']), CABS = new Set(['j', 'x']);   // (s: the mansion's sectional; j: its arcade cabinets, x: its pool table - arcade.js)
const near = (q, x, y) => Math.hypot(Math.max(q.x - x, 0, x - (q.x + q.w)), Math.max(q.y - y, 0, y - (q.y + q.h)));
const tvOn = (world, h) => !!(world.homeTv && world.homeTv.has(h.id));
function furnitureAt(world, h, s) {
  let best = null, bd = HOME_IN.reach + 2;
  for (const q of planIn(world, h).pieces) {
    if (!SEATS.has(q.ch) && !TVS.has(q.ch) && !CABS.has(q.ch)) continue;
    const d = near(q, s.x, s.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
const FACES = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };
export function seatOf(world, h, q, x, y) {
  const L = planIn(world, h);
  const tx = Math.max(q.tx, Math.min(q.tx + q.tw - 1, Math.floor(x / TILE_IN))), ty = Math.max(q.ty, Math.min(q.ty + q.th - 1, Math.floor(y / TILE_IN)));
  const cx = (tx + 0.5) * TILE_IN, cy = (ty + 0.5) * TILE_IN;
  let face = q.face || null;
  if (!face) {
    let tvp = null, td = 10 * TILE_IN;
    for (const o of L.pieces) if (TVS.has(o.ch)) { const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy); if (d < td) { td = d; tvp = o; } }
    if ((q.ch === 's' || q.ch === 'i') && tvp) { const dx = tvp.x + tvp.w / 2 - cx, dy = tvp.y + tvp.h / 2 - cy; face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'; }
    else face = q.h > q.w ? (L.solid(q.tx - 1, q.ty) ? 'e' : 'w') : L.solid(q.tx, q.ty + q.th) ? 'n' : 's';
  }
  return { x: cx, y: cy, a: FACES[face] ?? Math.PI / 2 };
}
function sit(world, p, h, q) {
  const s = p.ped.home;
  s.seat = seatOf(world, h, q, s.x, s.y); s.mv = false;
  send(world, p, true);
}
function tv(world, p, h) {
  const T = (world.homeTv ||= new Set());
  if (T.has(h.id)) T.delete(h.id);
  else { T.add(h.id); world.notify(p, `The TV comes on: ${SHOWS[Math.floor(world.time / 60) % SHOWS.length]}.`, 'info'); }
  for (const q of world.players.values()) if (q.ped && q.ped.home && q.ped.home.id === h.id) send(world, q, false);
}
const SHOWS = ['a cooking show', 'the news - a car chase downtown', 'a game show', 'a nature documentary about the redwoods', 'reruns of an old sitcom', 'a soap opera', 'the late movie', 'a shopping channel', 'the weather', 'a cop show'];

export function use(world, p, h, what) {
  const ped = p.ped, s = ped.home;
  if (what === 'door') { leave(world, p); return; }
  if (what === 'bed') { s.sleep = world.time + HOME_IN.sleepS; s.mv = false; world.notify(p, 'You get into bed. Lights out...', 'info'); send(world, p, true); return; }
  if (what === 'shower') { s.shower = world.time + HOME_IN.showerS; s.mv = false; ped.bleeding = false; send(world, p, true); return; }   // (the bleeding stops as you step in)
  if (what === 'garage' && !h.garage) { world.notify(p, 'This place has no garage - your cars come out at a home with one.', 'info'); return; }
  openMenu(world, p, what);
}

// ---- the menus of the things you use ---------------------------------------------------------------------------------
function menuOf(world, p, h, what) {
  const prof = p.profile, st = prof.stash || {}, ped = p.ped;
  if (what === 'tour') {   // a visitor at the front door: the price and Buy, or out
    const L = planFor(h), beds = L.pieces.filter((q) => q.use === 'bed').length;
    const opts = [
      { id: 'hi:tbuy', label: `Buy ${h.name}`, price: h.price, note: `wallet ${money(prof.cash)} · bank ${money(prof.bank)}` },
      { id: 'hi:tmort', label: `Buy it with a mortgage: ${mortgage.terms(h).days} payments of ${money(mortgage.terms(h).pay)} a day`, price: mortgage.terms(h).deposit, note: 'deposit' },
      { id: 'hi:tout', label: 'Step outside' },
      { id: 'close', label: 'Keep looking' },
    ];
    const sub = `For sale: ${money(h.price)}. ${h.what ? `A ${h.what}` : `A ${h.kind === 'shack' ? 'shack' : h.kind}`}${h.floor > 1 ? ` on floor ${h.floor}` : ''}, ${beds} bedroom${beds === 1 ? '' : 's'}, room for ${h.slots} vehicle${h.slots === 1 ? '' : 's'}${h.dock ? ', a boathouse' : ''}. Yours: a respawn point, a safe, a bed, a garage you reach from any home you own.`;
    return { t: 'menu', poi: homes.homePoi(world, h).id, title: `${h.name} - for sale`, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
  }
  if (what === 'deco' || what === 'paint') return decoMenu(world, p, h, what);   // (H67)
  if (what === 'unit' || what === 'mail') {   // (H71) a flat for sale along a lobby's landing; your mail
    const opts = [];
    let title = 'Your mail', sub = '';
    if (what === 'unit') {
      const f = homes.homeById(world, p.lobbyPick);
      if (!f || world.homeOwner.has(f.id)) { title = 'Sold'; sub = 'Someone has just bought it.'; }
      else {
        const t = mortgage.terms(f), beds = bedsIn(f);
        title = `${f.name} - for sale`;
        sub = `A ${f.what || 'flat'}${(f.floor || 1) > 1 ? ` on floor ${f.floor}` : ' on the ground floor'}, ${beds} bedroom${beds === 1 ? '' : 's'}, parking out front for ${f.slots}. Wallet ${money(prof.cash)} · bank ${money(prof.bank)}.`;
        opts.push({ id: 'hi:ltour', label: 'Take a look inside', note: 'walk round it first' });
        opts.push({ id: 'hi:lbuy', label: `Buy unit ${f.unit || 1}`, price: f.price });
        opts.push({ id: 'hi:lmort', label: `Buy it with a mortgage: ${t.days} payments of ${money(t.pay)} a day`, price: t.deposit, note: 'deposit' });
      }
    } else sub = mail.menuOpts(world, p, opts);
    opts.push({ id: 'close', label: 'Done' });
    return { t: 'menu', poi: homes.homePoi(world, h).id, title, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
  }
  const base = economy.buildMenu(world, p, homes.homePoi(world, h)), all = base.opts;   // (the home menu's options: wardrobe and stash)
  const pick = (pre) => all.filter((o) => o.id === pre || o.id.startsWith(pre + ':'));
  const opts = [];
  let title = h.name, sub = '';
  if (what === 'wardrobe') {
    title = 'Wardrobe'; sub = 'Your clothes. Changing in here, nobody sees who walked in.';
    opts.push(...pick('houtfit'), ...pick('hlooks'), ...pick('hmirror'));
  } else if (what === 'safe') {
    title = 'The safe';
    sub = `Kept at home, safe from a death or an arrest. In the safe: ${money(st.cash || 0)} cash.`;
    opts.push({ id: 'hi:cin', label: `Put your cash in the safe (${money(prof.cash)})`, dis: !(prof.cash > 0) });
    opts.push({ id: 'hi:cout', label: `Take the cash out (${money(st.cash || 0)})`, dis: !(st.cash > 0) });
    opts.push(...pick('hst').filter((o) => !ITEMS[o.id.slice(4)].food), ...pick('hsw'), ...pick('htk').filter((o) => !ITEMS[o.id.slice(4)].food), ...pick('htw'));
  } else if (what === 'fridge') {
    title = 'The fridge';
    const food = Object.entries(st.items || {}).filter(([id, n]) => n > 0 && ITEMS[id] && ITEMS[id].food);
    sub = food.length ? `Health ${Math.round(ped.hp)}/${ped.maxHp}. Something to eat?` : 'Empty. Put food from your bag in here and it keeps.';
    for (const [id, n] of food) opts.push({ id: `hi:eat:${id}`, label: `Eat ${ITEMS[id].name}`, note: `+${ITEMS[id].heal} health · ${n} in the fridge` });
    // cooking (the owner, 10-06: "home life: cooking"): three things from the fridge into a meal at the stove
    if (!ped.home.guest && !ped.home.tour) {
      const use = cookPick(st);
      if (use) opts.unshift({ id: 'hi:cook', label: `Cook a meal: ${use.map((id) => ITEMS[id].name).join(', ')}`, note: `a ${ITEMS.homeMeal.name} (+${ITEMS.homeMeal.heal} health, hearty) · ${HOME_IN.cookS} s` });
      else opts.push({ id: 'hi:nocook', label: `Cook a meal - ${HOME_IN.cookN} things to cook in the fridge first`, note: 'fruit, the garden\'s crops, mushrooms, game...', dis: true });
    }
    for (const o of pick('hst')) if (ITEMS[o.id.slice(4)].food) opts.push({ ...o, label: o.label.replace(/^Stash /, 'Put in the fridge: ') });
    for (const o of pick('htk')) if (ITEMS[o.id.slice(4)].food) opts.push({ ...o, label: o.label.replace(/^Take /, 'Take out: '), note: '' });
  } else if (what === 'hall') {   // the home menu itself, and selling the place (you step out to hand the keys over)
    title = base.title; sub = base.sub;
    opts.push(...all.filter((o) => o.id !== 'close'));
    for (const q of world.players.values()) if (q !== p && knocking(world, q, h)) opts.unshift({ id: `hi:let:${q.pid}`, label: `Let ${q.name} in`, note: 'at your door' });
    if (!ped.home.guest && !ped.home.tour) { const n = mail.unread(prof); opts.push({ id: 'hi:mail', label: `The mail${n ? ` - ${n} new` : ''}`, note: 'from your mailbox' }); }   // (H71)
    if (!ped.home.guest && !ped.home.tour) opts.push({ id: 'hi:deco', label: 'Decorate - place, move, turn and sell your furniture; paint the walls, new floors', note: furnNote(prof) });   // (H67)
    opts.push({ id: 'hi:sell', label: `Sell this place (+${money(h.price * 0.6)} to the bank)`, note: 'you step outside' });
  } else if (what === 'garage') {
    title = 'Your garage';
    prof.vehicles.forEach((ov, i) => { const d = VEHICLES[ov.model]; if (d && d.kind !== 'boat' && d.kind !== 'air') opts.push({ id: `hi:car:${i}`, label: `Drive out in the ${d.name}`, note: 'the door rolls up' }); });
    opts.push(...pick('hboat'));
    sub = opts.length ? `${prof.vehicles.length}/${homes.garageCap(world, prof)} spaces used (shared by all your homes).` : 'No cars in here yet - drive one up to the garage door outside to park it.';
  }
  opts.push({ id: 'close', label: 'Done' });
  return { t: 'menu', poi: homes.homePoi(world, h).id, title, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
}
export function openMenu(world, p, what) {
  const h = homeOf(world, p.ped);
  if (!h || !p.conn) return;
  const m = menuOf(world, p, h, what);
  p.menu = { poi: m.poi };
  p.homeMenu = what;
  p.conn.sendJSON(m);
}

// A choice from one of those menus (economy.handleMenu asks first; true: done here). The home menu's own options (the
// wardrobe's, the stash's) are run by economy's `execute`, and the same menu comes back up to date.
export function onMenu(world, p, poiId, optId, execute) {
  const ped = p.ped, h = homeOf(world, ped);
  if (!p.homeMenu || !h || !ped.hidden) { p.homeMenu = null; return false; }
  const poi = world.map.pois[poiId];
  if (!poi || poi.kind !== 'home' || poi.home !== (h.isLobby ? h.block : h.lobby ?? h.id)) return false;   // (a unit's menus, a lobby's, come from its building's front door)
  if (optId === 'close') { p.homeMenu = null; return true; }
  const what = p.homeMenu;
  const valid = menuOf(world, p, h, what).opts.find((o) => o.id === optId);
  let err = !valid ? 'That option is not available here.' : valid.dis ? 'Not available.' : null;
  if (!err) err = optId.startsWith('hi:') ? own(world, p, h, optId.split(':')) : execute(world, p, poi, optId);
  if (err) world.notify(p, err, 'bad');
  p.meDirty = true;
  if (ped.home && ped.hidden && p.homeMenu === what) openMenu(world, p, what);
  return true;
}

function own(world, p, h, parts) {
  const prof = p.profile, ped = p.ped;
  const st = (prof.stash ||= { items: {}, weapons: {} });
  st.items ||= {};
  switch (parts[1]) {
    case 'cin': { const n = prof.cash; if (!(n > 0)) return 'No cash on you.'; st.cash = (st.cash || 0) + n; prof.cash = 0; store.touch(); world.notify(p, `${money(n)} into the safe.`, 'good'); return null; }
    case 'cout': { const n = st.cash || 0; if (!(n > 0)) return 'The safe is empty.'; prof.cash += n; st.cash = 0; store.touch(); world.notify(p, `Took ${money(n)} out of the safe.`, 'good'); return null; }
    case 'eat': {
      const id = parts[2], it = ITEMS[id];
      if (!it || !it.food || !(st.items[id] > 0)) return 'None of that in the fridge.';
      if (world.time - ped.home.eatAt < HOME_IN.eatS) return null;
      if (ped.hp >= ped.maxHp && !it.hearty) return 'You\'re not hungry - you\'re at full health.';
      ped.home.eatAt = world.time;
      st.items[id]--;
      ped.hp = Math.min(ped.maxHp, ped.hp + it.heal);
      if (it.hearty) economy.applyBuff(world, ped, 'hearty');
      store.touch();
      world.notify(p, `Ate ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}. +${it.heal} health.`, 'good');
      return null;
    }
    case 'cook': {
      if (ped.home.sleep || ped.home.shower || ped.home.cook) return null;
      const use = cookPick(st);
      if (!use) return `${HOME_IN.cookN} things to cook in the fridge first.`;
      for (const id of use) st.items[id]--;
      ped.home.cook = world.time + HOME_IN.cookS; ped.home.mv = false;
      p.homeMenu = null;
      store.touch();
      world.notify(p, `Cooking: ${use.map((id) => ITEMS[id].name).join(', ')}...`, 'info');
      send(world, p, false);
      return null;
    }
    case 'let': {
      const q = world.players.get(parts.slice(2).join(':'));
      if (!q || !knocking(world, q, h)) return 'Nobody at the door now.';
      return letIn(world, q, h, p);
    }
    case 'sell': {
      p.homeMenu = null;
      leave(world, p);
      return homes.sell(world, p, h);
    }
    case 'tbuy': {   // bought on a look round: yours, and you're in it
      if (!ped.home || !ped.home.tour) return 'Not on a look round.';
      const err = homes.buy(world, p, h, economy.payFrom);
      if (err) return err;
      ped.home.tour = 0;
      p.homeMenu = null;
      send(world, p, true);
      return null;
    }
    case 'tmort': {   // on a mortgage (mortgage.js)
      if (!ped.home || !ped.home.tour) return 'Not on a look round.';
      const err = mortgage.buyWith(world, p, h, economy.payFrom);
      if (err) return err;
      ped.home.tour = 0;
      p.homeMenu = null;
      send(world, p, true);
      return null;
    }
    case 'tout': p.homeMenu = null; leave(world, p); return null;
    case 'ltour': case 'lbuy': case 'lmort': {   // (H71) a flat for sale on a lobby's landing: a look round, or bought - and you're in
      const f = homes.homeById(world, p.lobbyPick);
      if (!ped.home || !ped.home.lobby || !f || homes.blockOf(world, f) !== h.block) return 'Not here.';
      p.homeMenu = null;
      if (parts[1] === 'ltour') return tour(world, p, f);
      const err = parts[1] === 'lbuy' ? homes.buy(world, p, f, economy.payFrom) : mortgage.buyWith(world, p, f, economy.payFrom);
      if (err) return err;
      homes.goInside(world, p, f);
      return null;
    }
    case 'mail': openMenu(world, p, 'mail'); return null;   // (H71: from the hall table)
    case 'mread': return null;
    case 'mpay': return mail.pay(world, p, Number(parts[2]), economy.payFrom);
    case 'mclear': mail.clear(prof); return null;
    case 'deco': case 'dpick': case 'dmove': case 'dturn': case 'dput': case 'dstay': case 'dstore': case 'dspin': case 'dsell': case 'dstow':
    case 'dpaint': case 'dwall': case 'dfloor': case 'dback': case 'dend':
      return decoOp(world, p, h, parts);
    case 'car': {
      const i = Number(parts[2]);
      p.homeMenu = null;
      if (!h.garage) return 'This place has no garage.';
      const err = homes.driveOut(world, p, h, i);
      if (!err) { ped.home = null; if (p.conn) p.conn.sendJSON({ t: 'home', off: 1 }); }
      return err;
    }
    default: return 'Unknown option.';
  }
}

// ---- decorating (H67) -------------------------------------------------------------------------------------------------
// From the hall table, Decorate: ped.home.edit { k: a piece from storage in your hands, mv: the placed piece you're moving
// (its index in decor.it; -1 none), r: the way it faces }. The action button opens the menu for the spot in front of you:
// what's there (move it, turn it, sell it back, put it in storage), your stored pieces to place, this room's paint and
// floor; holding a piece, put it down (where shared/homedecor.js canPlace allows), turn it, put it away.
// The pieces are bought at the hardware store's furniture counter (economy.js) and wait in profile.furn.
const furnNote = (prof) => { const n = Object.values(prof.furn || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0); return n ? `${n} piece${n === 1 ? '' : 's'} in storage` : 'furniture from the hardware store'; };
const an = (s) => (/^[aeiou]/i.test(s) ? 'an' : 'a');
function heldKind(world, h, s) {
  const e = s.edit;
  if (!e) return null;
  if (e.mv >= 0) { const d = decorOf(world, h), q = d && d.it && d.it[e.mv]; return q ? q.k : null; }
  return e.k || null;
}
// the people standing in a home (a piece can't land on anyone)
function bodiesIn(world, h) {
  const out = [];
  for (const q of world.players.values()) if (q.ped && q.ped.home && q.ped.home.id === h.id && q.ped.hidden) out.push({ x: q.ped.home.x, y: q.ped.home.y });
  return out;
}
// where what you hold would go, and whether it can: { q, err }
function heldSpot(world, p, h) {
  const s = p.ped.home, k = heldKind(world, h, s);
  if (!k) return null;
  const L0 = planFor(h), t = targetOf(L0, s.x, s.y, s.a, k, s.edit.r), q = { k, tx: t.tx, ty: t.ty, r: s.edit.r };
  return { q, err: canPlace(L0, decorOf(world, h), q, s.edit.mv, bodiesIn(world, h)) };
}
function editPrompt(world, p, h) {
  const s = p.ped.home, run = () => openMenu(world, p, 'deco');
  const hs = heldSpot(world, p, h);
  if (hs) return { label: hs.err ? `${PIECES[hs.q.k].name} - ${hs.err[0].toLowerCase()}${hs.err.slice(1, -1)}` : `${PIECES[hs.q.k].name} - it fits here: put it down, turn it`, run };
  const d = decorOf(world, h), t = targetOf(planFor(h), s.x, s.y, s.a, null, 0), i = pieceAt(d, t.tx, t.ty);
  return { label: `Decorating${i >= 0 ? ` - the ${PIECES[d.it[i].k].name.toLowerCase()} in front of you` : ''}: what to do here`, run };
}
function decoMenu(world, p, h, what) {
  const prof = p.profile, s = p.ped.home, e = s.edit, d = decorOf(world, h) || {}, L0 = planFor(h);
  const opts = [];
  let title = 'Decorating', sub = '';
  const room = roomsOf(L0).at(Math.floor(s.x / TILE_IN), Math.floor(s.y / TILE_IN));
  if (what === 'paint') {
    title = 'This room';
    const wl = (d.wall || {})[room], fl = (d.floor || {})[room];
    sub = `The walls ${wl != null ? WALLS[wl][0].toLowerCase() : 'as they came'}, the floor ${fl != null ? FLOORS[fl][0].toLowerCase() : 'as it came'}. Wallet ${money(prof.cash)} · bank ${money(prof.bank)}.`;
    WALLS.forEach(([n], i) => opts.push({ id: `hi:dwall:${i}`, label: `Paint the walls ${n.toLowerCase()}`, price: DECOR.paint, dis: wl === i, note: wl === i ? 'they are' : '' }));
    FLOORS.forEach(([n], i) => opts.push({ id: `hi:dfloor:${i}`, label: `Lay a new floor: ${n.toLowerCase()}`, price: DECOR.floor, dis: fl === i, note: fl === i ? 'it is' : '' }));
    opts.push({ id: 'hi:dback', label: 'Back' });
    return { t: 'menu', poi: homes.homePoi(world, h).id, title, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
  }
  const hs = e && heldSpot(world, p, h);
  if (hs) {
    title = PIECES[hs.q.k].name;
    sub = `Facing ${faceName(e.r)}. ${hs.err || 'It fits here - the green tiles.'}`;
    opts.push({ id: 'hi:dput', label: 'Put it down here', dis: !!hs.err, note: hs.err || '' });
    opts.push({ id: 'hi:dturn', label: 'Turn it', note: `facing ${faceName(e.r)}` });
    if (e.mv >= 0) opts.push({ id: 'hi:dstay', label: 'Leave it where it was' });
    opts.push({ id: 'hi:dstore', label: e.mv >= 0 ? 'Put it in storage' : 'Back into storage' });
    opts.push({ id: 'hi:dend', label: 'Done decorating', note: e.mv >= 0 ? 'it stays where it was' : 'it stays in storage' });
  } else if (e) {
    const t = targetOf(L0, s.x, s.y, s.a, null, 0), i = pieceAt(d, t.tx, t.ty);
    sub = 'Walk up to a spot, face it and press Act. Your things stand where you put them; the bed, the safe and the doors stay clear.';
    if (i >= 0) {
      const q = d.it[i], nm = PIECES[q.k].name.toLowerCase();
      opts.push({ id: `hi:dmove:${i}`, label: `Move the ${nm}` });
      opts.push({ id: `hi:dspin:${i}`, label: `Turn the ${nm}`, note: `facing ${faceName(q.r)}` });
      opts.push({ id: `hi:dsell:${i}`, label: `Sell the ${nm} back`, note: `+${money(backOf(q.k))}` });
      opts.push({ id: `hi:dstow:${i}`, label: `Put the ${nm} in storage` });
    }
    for (const k of KINDS) if ((prof.furn || {})[k] > 0) opts.push({ id: `hi:dpick:${k}`, label: `Place ${an(PIECES[k].name)} ${PIECES[k].name.toLowerCase()}`, note: `${prof.furn[k]} in storage` });
    if (!KINDS.some((k) => (prof.furn || {})[k] > 0)) opts.push({ id: 'hi:dnone', label: 'Nothing in storage - the hardware store sells furniture', dis: true });
    opts.push({ id: 'hi:dpaint', label: 'Paint this room, lay a new floor', dis: room < 0, note: room < 0 ? 'stand in a room' : '' });
    opts.push({ id: 'hi:dend', label: 'Done decorating' });
  }
  opts.push({ id: 'close', label: 'Close' });
  return { t: 'menu', poi: homes.homePoi(world, h).id, title, sub, opts, cash: prof.cash, bank: prof.bank, inside: true };
}
// the home's decor replaced (a new object: shared/homedecor.js keeps each one's layout) - saved, and everyone in there sees it
function setDecor(world, p, h, d) {
  d.plan = planOf(h);   // (the plan it's laid in: homes.replanDecor stows it should the home's rooms ever change)
  (p.profile.decor ||= {})[h.id] = d;
  store.touch();
  for (const q of world.players.values()) if (q.ped && q.ped.home && q.ped.home.id === h.id) send(world, q, true);
}
// what a meal at home is cooked from: HOME_IN.cookN things from the fridge - the plainest first (the least health on
// its own), never a meal already cooked nor a prize crop - or null when there aren't that many
function cookPick(st) {
  const units = [];
  for (const [id, n] of Object.entries((st && st.items) || {})) { const it = ITEMS[id]; if (n > 0 && it && it.food && !it.cooked && !it.prize) for (let k = 0; k < n && units.length < 64; k++) units.push(id); }
  if (units.length < HOME_IN.cookN) return null;
  units.sort((a, b) => ITEMS[a].heal - ITEMS[b].heal || (a < b ? -1 : a > b ? 1 : 0));
  return units.slice(0, HOME_IN.cookN);
}
const copyDecor = (d) => ({ it: ((d && d.it) || []).map((q) => ({ ...q })), wall: { ...((d && d.wall) || {}) }, floor: { ...((d && d.floor) || {}) } });
function decoOp(world, p, h, parts) {
  const prof = p.profile, s = p.ped.home, op = parts[1];
  if (s.guest || s.tour || world.homeOwner.get(h.id) !== p.pid) return 'It\'s not yours to decorate.';
  const furn = (prof.furn ||= {}), d0 = decorOf(world, h), L0 = planFor(h);
  if (op === 'deco') {
    s.edit = { k: null, mv: -1, r: 0 };
    p.homeMenu = null;
    world.notify(p, 'Decorating: face a spot and press Act - place your things, move them, turn them; paint the room you\'re in.', 'info');
    send(world, p, true);
    return null;
  }
  const e = s.edit;
  if (!e) return 'Start decorating from the hall table.';
  const i = Number(parts[2]), q0 = d0 && d0.it ? d0.it[i] : null;
  switch (op) {
    case 'dend': s.edit = null; p.homeMenu = null; world.notify(p, 'All done.', 'good'); send(world, p, true); return null;
    case 'dpick': {
      const k = parts[2];
      if (!PIECES[k] || !(furn[k] > 0)) return 'None of those in storage.';
      e.k = k; e.mv = -1; e.r = facingYou(s.a);
      p.homeMenu = null;
      send(world, p, true);
      return null;
    }
    case 'dmove': if (!q0) return 'Nothing there.'; e.k = null; e.mv = i; e.r = q0.r; p.homeMenu = null; send(world, p, true); return null;
    case 'dturn': e.r = (e.r + 1) & 3; send(world, p, true); return null;   // (the menu comes back: turn again or put it down)
    case 'dstay': e.mv = -1; e.k = null; p.homeMenu = null; send(world, p, true); return null;
    case 'dstore': {
      const q = e.mv >= 0 && d0 && d0.it ? d0.it[e.mv] : null;
      if (q) { const d = copyDecor(d0); d.it.splice(e.mv, 1); furn[q.k] = (furn[q.k] || 0) + 1; e.mv = -1; setDecor(world, p, h, d); }
      e.k = null; e.mv = -1; p.homeMenu = null; send(world, p, true);
      return null;
    }
    case 'dput': {
      const hs = heldSpot(world, p, h);
      if (!hs) return 'You\'re not holding anything.';
      if (hs.err) return hs.err;
      const d = copyDecor(d0);
      if (e.mv >= 0) d.it[e.mv] = hs.q;
      else { if (!(furn[hs.q.k] > 0)) return 'None of those in storage.'; furn[hs.q.k]--; d.it.push(hs.q); }
      e.k = null; e.mv = -1; p.homeMenu = null;
      setDecor(world, p, h, d);
      return null;
    }
    case 'dspin': {
      if (!q0) return 'Nothing there.';
      const q = { ...q0, r: (q0.r + 1) & 3 }, err = canPlace(L0, d0, q, i, bodiesIn(world, h));
      if (err) return `It won't turn there: ${err[0].toLowerCase()}${err.slice(1)}`;
      const d = copyDecor(d0); d.it[i] = q;
      setDecor(world, p, h, d);
      return null;
    }
    case 'dsell': case 'dstow': {
      if (!q0) return 'Nothing there.';
      const d = copyDecor(d0); d.it.splice(i, 1);
      if (op === 'dsell') { prof.cash += backOf(q0.k); world.notify(p, `Sold the ${PIECES[q0.k].name.toLowerCase()} back: +${money(backOf(q0.k))}.`, 'good'); }
      else furn[q0.k] = (furn[q0.k] || 0) + 1;
      setDecor(world, p, h, d);
      return null;
    }
    case 'dpaint': openMenu(world, p, 'paint'); return null;
    case 'dback': openMenu(world, p, 'deco'); return null;
    case 'dwall': case 'dfloor': {
      const n = Number(parts[2]), list = op === 'dwall' ? WALLS : FLOORS, room = roomsOf(L0).at(Math.floor(s.x / TILE_IN), Math.floor(s.y / TILE_IN));
      if (!list[n] || room < 0) return 'Not here.';
      const cost = op === 'dwall' ? DECOR.paint : DECOR.floor;
      if (!economy.payFrom(p, cost)) return `You need ${money(cost)}.`;
      const d = copyDecor(d0);
      d[op === 'dwall' ? 'wall' : 'floor'][room] = n;
      setDecor(world, p, h, d);
      world.notify(p, op === 'dwall' ? `The walls painted ${list[n][0].toLowerCase()}.` : `A new floor: ${list[n][0].toLowerCase()}.`, 'good');
      return null;
    }
    default: return 'Unknown option.';
  }
}

// The dev command 'decor' (server/dev.js; inside a home of yours): msg.furn n of every piece into storage; msg.demo a
// house's living room and hall furnished (whatever fits of a set - the playtests' decorated room); msg.wall / msg.floor
// { room: choice } the paint and the floors; msg.edit: decorating, holding msg.edit (a kind from storage; false: done); msg.at
// [tx, ty, a]: stand there
export function devDecor(world, p, msg) {
  const ped = p.ped, s = ped && ped.home, h = homeOf(world, ped);
  if (!s || !h || world.homeOwner.get(h.id) !== p.pid) return 'Go inside a home of yours first (dev homein).';
  const prof = p.profile, furn = (prof.furn ||= {});
  if (msg.furn) for (const k of KINDS) furn[k] = (furn[k] || 0) + Math.max(1, msg.furn | 0);
  const d = copyDecor(decorOf(world, h)), L0 = planFor(h);
  if (msg.demo) {
    const set = [['rug', 2, 5, 0], ['lamp', 4, 5, 0], ['bedside', 13, 2, 0], ['art', 13, 2, 1], ['walltv', 8, 5, 0], ['art', 10, 5, 0], ['couch', 8, 7, 2], ['washer', 9, 3, 2], ['plant', 7, 5, 0], ['rug', 11, 6, 0], ['armchair', 12, 5, 0], ['bookshelf', 13, 7, 0], ['workbench', 15, 6, 3]];
    for (const [k, tx, ty, r] of set) { const q = { k, tx, ty, r }; if (!canPlace(L0, d, q, -1, bodiesIn(world, h))) d.it.push(q); }
  }
  if (msg.wall) Object.assign(d.wall, msg.wall);
  if (msg.floor) Object.assign(d.floor, msg.floor);
  setDecor(world, p, h, d);
  if (Array.isArray(msg.at)) { s.x = (msg.at[0] + 0.5) * TILE_IN; s.y = (msg.at[1] + 0.5) * TILE_IN; s.a = +msg.at[2] || 0; }   // (stand on a tile, facing a way)
  if (msg.edit === false) { s.edit = null; send(world, p, true); } else if (msg.edit !== undefined) { s.edit = { k: PIECES[msg.edit] ? msg.edit : null, mv: -1, r: facingYou(s.a) }; send(world, p, true); }
  return null;
}

// ---- every tick ------------------------------------------------------------------------------------------------------
export function update(world) {
  if (world.homeTv && world.homeTv.size && world.tick % 40 === 0) for (const id of [...world.homeTv]) if (![...world.players.values()].some((q) => q.ped && q.ped.home && q.ped.home.id === id)) world.homeTv.delete(id);   // (nobody home: the TV goes off)
  for (const p of world.players.values()) {
    const ped = p.ped, s = ped && ped.home;
    if (!s) continue;
    const h = homes.homeById(world, s.id);
    // out some other way (the home menu's Step outside, the garage, the boathouse, dead, a dev command): gone from here
    const ok = s.lobby ? !!h : s.tour ? !world.homeOwner.has(s.id) : world.homeOwner.get(s.id) === (s.guest || p.pid);   // (a look round: while it's still for sale; a lobby: anyone's)
    if (!h || !ped.hidden || ped.dead || ped.removed || ped.inside !== s.id || !ok) {
      if (h && !ped.dead && !ped.removed && ped.hidden && ped.inside === s.id) { homes.leaveHome(world, p); if (s.tour) world.notify(p, `${h.name} has just been sold - you're shown out.`, 'warn'); }   // (sold under a guest or a visitor: out they go)
      ped.home = null; p.homeMenu = null;
      if (p.conn) p.conn.sendJSON({ t: 'home', off: 1 });
      continue;
    }
    if (s.pet) petStep(world, p, s, h);   // (H71: your pet at home)
    if (s.seat && ped.hp < ped.maxHp && !ped.bleeding) { ped.hp = Math.min(ped.maxHp, ped.hp + HOME_IN.restHeal / TICK_HZ); if (world.tick % 20 === 0) p.meDirty = true; }   // (a rest on the couch)
    if (s.sleep && world.time >= s.sleep) wake(world, p, h);
    if (s.cook && world.time >= s.cook) {   // (dinner's ready: into the fridge)
      s.cook = 0;
      const st = (p.profile.stash ||= { items: {}, weapons: {} });
      st.items ||= {};
      st.items.homeMeal = (st.items.homeMeal || 0) + 1;
      store.touch();
      world.notify(p, `Dinner's ready: a ${ITEMS.homeMeal.name}, in the fridge.`, 'good');
    }
    if (s.shower && world.time >= s.shower) {
      s.shower = 0;
      ped.hp = Math.min(ped.maxHp, ped.hp + HOME_IN.showerHeal); ped.bleeding = false; ped.burnT = 0;
      world.notify(p, 'Fresh and clean.', 'good');
      p.meDirty = true;
    }
    send(world, p, false);
  }
}

function wake(world, p, h) {
  const ped = p.ped, prof = p.profile;
  ped.home.sleep = 0;
  ped.hp = ped.maxHp; ped.bleeding = false; ped.stamina = skills.staminaFull(world, ped);
  if (!ped.home.guest && !ped.home.tour) skills.gain(world, p, 'sleep');   // (a night in your own bed: constitution - skills.js)
  // the night passes for the whole city when everyone online is asleep at home (alone, it's you)
  const night = world.loopTime >= DAY_PART_S - 30 || world.clock.minutes < HOME_IN.wakeH * 60;
  const everyone = [...world.players.values()].every((q) => q === p || !q.conn || !q.ped || (q.ped.home && q.ped.home.sleep));
  if (night && everyone) {
    const wakeT = (HOME_IN.wakeH * 60 - 360) * DAY_PART_S / (14 * 60);   // (shared/constants.js gameClock: 06:00 is 0)
    if (world.loopTime >= DAY_PART_S - 30) world.day = (world.day || 0) + 1;
    world.loopTime = wakeT;
  }
  prof.spawnHome = h.id; prof.lastSpawn = `home:${h.id}`;   // (a save point: you wake up here after a death)
  store.touch();
  world.notify(p, night && everyone ? 'Good morning! You slept through the night - fully rested. You\'ll wake up here from now on.' : 'You had a good sleep - fully rested. You\'ll wake up here from now on.', 'good');
  p.meDirty = true;
  send(world, p, true);
}

// Where you are inside, to your page (every tick while you're in; the cars in the garage when something changed)
export function send(world, p, full) {
  const ped = p.ped, s = ped && ped.home;
  if (!s || !p.conn) return;
  const h = homes.homeById(world, s.id), L = planFor(h);
  const m = {
    t: 'home', id: h.id, plan: L.key, tier: L.tier, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, a: Math.round(s.a * 100) / 100,
    mv: s.mv ? 1 : 0, ack: p.ack, min: Math.round(world.clock.minutes),
    sleep: s.sleep ? Math.max(0, Math.round((s.sleep - world.time) * 10) / 10) : 0, shower: s.shower ? 1 : 0,
    seat: s.seat ? [Math.round(s.seat.x), Math.round(s.seat.y), Math.round(s.seat.a * 100) / 100] : 0, tv: tvOn(world, h) ? 1 : 0,
  };
  const others = [];
  for (const q of world.players.values()) {
    const o = q !== p && q.ped && q.ped.home && q.ped.hidden && q.ped.home.id === s.id ? q.ped.home : null;
    if (o) others.push({ n: q.name, x: Math.round(o.x), y: Math.round(o.y), a: Math.round(o.a * 100) / 100, mv: o.mv ? 1 : 0, sl: o.sleep ? 1 : 0, si: o.seat ? [Math.round(o.seat.x), Math.round(o.seat.y), Math.round(o.seat.a * 100) / 100] : 0, ...(full || world.tick % 20 === 0 ? { app: q.ped.app || null } : null) });
  }
  m.others = others;   // (their looks now and then: the page keeps them)
  const pt = petOf(world, h);   // (H71: the owner's pet - you see it as their guest too)
  if (pt) m.pet = { x: Math.round(pt.x), y: Math.round(pt.y), a: Math.round(pt.a * 100) / 100, po: pt.po, ...(full ? { n: pt.n, art: pt.art, bx: pt.bx, by: pt.by } : null) };
  if (full) {
    m.name = s.tour ? `${h.name} - for sale, ${money(h.price)}` : h.name; m.garage = h.garage ? 1 : 0; m.sleepS = HOME_IN.sleepS; m.wakeH = HOME_IN.wakeH;
    if (s.tour) m.tour = h.price;   // (a visitor: the price - the page may show it; the garage's bays empty)
    m.decor = decorOf(world, h);   // (H67: the owner's things placed, the walls' paint, the floors - shared/homedecor.js decorate)
    m.edit = s.edit ? { k: heldKind(world, h, s), r: s.edit.r, mv: s.edit.mv } : null;   // (decorating: what you hold - the page shows where it'd go)
    if (s.lobby) m.doors = (world.unitsOf.get(h.block) || []).map((id) => { const o = world.homeOwner.get(id); return o === p.pid ? 2 : o ? (someoneIn(world, homes.homeById(world, id)) ? 3 : 1) : 0; });   // (H71: each flat's door - 0 for sale, 1 taken, 2 yours, 3 someone's in)
    if (s.lobby) m.mail = ownsIn(world, p, h.block) ? mail.unread(p.profile) : 0;   // (H71: new mail in your box - the page flags it)
    m.cars = s.tour || s.lobby ? [] : p.profile.vehicles.filter((ov) => VEHICLES[ov.model] && VEHICLES[ov.model].kind !== 'boat' && VEHICLES[ov.model].kind !== 'air').slice(0, L.bays.length).map((ov) => ({ m: ov.model, p: ov.paint | 0, v: ov.variant | 0 }));
    s.nc = m.cars.length;   // (the cars parked in the bays are solid: shared/homelayout.js stepInside - the page counts the same ones)
  }
  p.conn.sendJSON(m);
}

// ---- dev ----------------------------------------------------------------------------------------------------------
// The dev command 'homein' (server/dev.js): msg.id (a home) or msg.kind (the first of that kind nobody else owns) -
// yours for nothing, and you're inside; msg.cars: cars of your own for the garage; msg.at: stand by that thing in there
// ('bed', 'safe', 'fridge', 'garage', 'door'...).
// Returns an error or null.
export function devIn(world, p, msg) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not while you\'re down.';
  let h = homeOf(world, ped);
  if (msg.id != null || msg.kind) {
    const want = msg.id != null ? homes.homeById(world, Math.floor(Number(msg.id))) : world.map.homes.find((q) => q.kind === msg.kind && (!world.homeOwner.has(q.id) || world.homeOwner.get(q.id) === p.pid));
    if (!want) return 'No such home.';
    if (ped.vehId) return 'Get out of the vehicle first.';
    if (!world.homeOwner.has(want.id)) { (p.profile.homes ||= []).push(want.id); world.homeOwner.set(want.id, p.pid); store.touch(); }
    if (world.homeOwner.get(want.id) !== p.pid) return 'Someone else owns that one.';
    if (h && h.id !== want.id) leave(world, p);
    if (!ped.home) { if (ped.hidden) homes.leaveHome(world, p); ped.x = want.x; ped.y = want.y; world.place(ped); homes.goInside(world, p, want); }
    h = want;
  }
  if (!h || !ped.home) return 'Go inside one of your homes first (or give a home id or kind).';
  if (Array.isArray(msg.cars)) {   // (cars of your own, for the garage: msg.cars ['sedan', ...])
    for (const m of msg.cars.slice(0, 4)) if (VEHICLES[m] && p.profile.vehicles.length < homes.garageCap(world, p.profile)) p.profile.vehicles.push({ model: m, paint: p.profile.vehicles.length * 3 % 14, variant: 0 });
    store.touch();
    send(world, p, true);
  }
  if (msg.at) {
    const L = planFor(h);
    for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) {
      const x = (tx + 0.5) * L.w / L.cols, y = (ty + 0.5) * L.h / L.rows;
      if (L.solid(tx, ty) || blocked(L, x, y, undefined, ped.home.nc)) continue;   // (not in a parked car)
      const u = useAt(L, x, y, HOME_IN.reach);
      if (u && u.use === msg.at) { ped.home.x = x; ped.home.y = y; send(world, p, true); return null; }
    }
    return `No ${msg.at} in here.`;
  }
  return null;
}

// ---- your pet at home (H71) -----------------------------------------------------------------------------------------
// A lost pet you brought back can be yours (pets.js adopt: profile.pet { n, art, k }): it waits at home on its bed, comes
// running to meet you at the door, bounces round you with its tail going, follows you about a while, then goes back to
// its bed and lies down (and when you go to bed). Kept on the owner's ped.home.pet while they're in: { n, art, x, y, a,
// po (its pose for the page), st, t (since when), bx, by (its bed) }; a guest sees it too (send).
const petBeds = new WeakMap();
// its bed: a spot of open floor against a wall or a piece, nearest the couch (else the hall table), clear of the way in
export function petBed(L) {
  if (petBeds.has(L)) return petBeds.get(L);
  const near = L.pieces.find((q) => q.ch === 'C') || L.pieces.find((q) => q.use === 'hall') || { x: L.spawn.x, y: L.spawn.y, w: 0, h: 0 };
  const sx = Math.floor(L.spawn.x / TILE_IN), sy = Math.floor(L.spawn.y / TILE_IN);
  let best = null, bd = Infinity;
  for (let ty = 1; ty < L.rows - 1; ty++) for (let tx = 1; tx < L.cols - 1; tx++) {
    if (!'.ct'.includes(L.cell(tx, ty)) || L.solid(tx, ty) || (Math.abs(tx - sx) <= 1 && ty >= sy - 1)) continue;
    if ((!L.solid(tx, ty - 1) && !L.solid(tx - 1, ty) && !L.solid(tx + 1, ty)) || L.solid(tx, ty + 1)) continue;   // (against something, and nothing in front of it to hide it)
    const x = (tx + 0.5) * TILE_IN, y = (ty + 0.5) * TILE_IN, d = Math.hypot(x - near.x - near.w / 2, y - near.y - near.h / 2);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  const b = best || { x: L.spawn.x, y: L.spawn.y - TILE_IN };
  petBeds.set(L, b);
  return b;
}
function petIn(world, p, h) {
  const pp = p.profile.pet, s = p.ped.home;
  if (!pp || !s) return;
  const b = petBed(planIn(world, h));
  s.pet = { n: pp.n, art: pp.art, x: b.x, y: b.y, a: Math.PI / 2, po: 'run', st: 'greet', t: world.time, bx: b.x, by: b.y };
  world.notify(p, `${pp.n} jumps off its bed and runs to meet you!`, 'good');
}
// the owner's pet in h, while they're in (null: none)
function petOf(world, h) {
  const q = h && !h.isLobby ? world.players.get(world.homeOwner.get(h.id)) : null, s = q && q.ped && q.ped.home;
  return s && s.id === h.id && !s.guest && !s.tour ? s.pet || null : null;
}
const PET_HAPPY_S = 2.5, PET_FOLLOW_S = 14;
function petStep(world, p, s, h) {
  const q = s.pet, now = world.time;
  const toward = (tx, ty, sp, stop) => {
    const dx = tx - q.x, dy = ty - q.y, d = Math.hypot(dx, dy);
    if (d <= stop) return false;
    const o = { x: q.x, y: q.y, a: q.a, nc: s.nc };
    stepInside(planIn(world, h), o, dx / d, dy / d, 1 / TICK_HZ, Math.min(sp, d * TICK_HZ));
    const moved = Math.hypot(o.x - q.x, o.y - q.y) > 0.2;
    q.x = o.x; q.y = o.y; q.a = o.a;
    return moved;
  };
  if (s.sleep && q.st !== 'lie') q.st = 'bed';
  if (q.st === 'greet') { q.po = 'run'; if (!toward(s.x, s.y, MAIL.petWalk * 1.6, 26) || now - q.t > 6) { q.st = 'happy'; q.t = now; } }
  else if (q.st === 'happy') { q.po = 'happy'; q.a = Math.atan2(s.y - q.y, s.x - q.x); if (now - q.t > PET_HAPPY_S) { q.st = 'follow'; q.t = now; } }
  else if (q.st === 'follow') { q.po = toward(s.x, s.y, MAIL.petWalk, 36) ? 'walk' : 'sit'; if (q.po === 'sit') q.a = Math.atan2(s.y - q.y, s.x - q.x); if (now - q.t > PET_FOLLOW_S) { q.st = 'bed'; q.t = now; } }
  else if (q.st === 'bed') { q.po = 'walk'; if (!toward(q.bx, q.by, MAIL.petWalk, 2) || now - q.t > 12) { q.st = 'lie'; q.x = q.bx; q.y = q.by; q.a = Math.PI / 2; } }
  else q.po = 'lie';
}

// The dev command 'lobby' (server/dev.js; H71): into an apartment block's lobby - msg.block (its home id; else the first
// with all its flats for sale and room for 6 or more), msg.own: unit n yours, msg.other: unit n someone else's, msg.mail:
// a bill, a letter and a coupon in your mailbox, msg.pet: a pet of your own ('dog_golden', 'cat_ginger'...; true a dog),
// msg.at: stand at 'mail' or a unit's number, msg.home: then go into your own flat
export function devLobby(world, p, msg) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return 'Not right now.';
  const ok = (b) => b && !b.gone && world.unitsOf.has(b.id);
  let base = msg.block != null ? world.map.homes[msg.block | 0] : null;
  if (!ok(base)) base = world.map.homes.find((b) => ok(b) && world.unitsOf.get(b.id).length >= 6 && world.unitsOf.get(b.id).every((id) => !world.homeOwner.has(id) || world.homeOwner.get(id) === p.pid || world.homeOwner.get(id) === 'dev-neighbour')) || world.map.homes.find(ok);
  if (!base) return 'No apartment blocks.';
  const ids = world.unitsOf.get(base.id), prof = p.profile;
  const own = msg.own ? homes.homeById(world, ids[(msg.own | 0) - 1]) : null;
  if (own && !world.homeOwner.has(own.id)) { (prof.homes ||= []).push(own.id); world.homeOwner.set(own.id, p.pid); }
  const other = msg.other ? ids[(msg.other | 0) - 1] : null;
  if (other != null && !world.homeOwner.has(other)) world.homeOwner.set(other, 'dev-neighbour');
  if (msg.mail) { mail.post(p, 'bill', 'Utilities for the week - water, power, gas.', MAIL.util); mail.post(p, 'letter', 'The residents\' newsletter: the block party is on Saturday, bring a dish.'); prof.coupon = MAIL.off; mail.post(p, 'coupon', `A coupon from Nail & Gear Hardware: ${MAIL.off}% off your next piece of furniture at the counter.`); }
  if (msg.pet) prof.pet = { n: msg.petName || 'Biscuit', art: typeof msg.pet === 'string' ? msg.pet : 'dog_golden', k: /^cat/.test(String(msg.pet)) ? 'cat' : 'dog' };
  store.touch();
  if (ped.home) { ped.home = null; p.homeMenu = null; }
  if (ped.hidden) homes.leaveHome(world, p);
  ped.x = base.x; ped.y = base.y; world.place(ped);
  const lob = homes.lobbyOf(world, base.id);
  homes.goInside(world, p, lob);
  if (msg.home && own) { homes.goInside(world, p, own); return null; }
  if (msg.at != null) {
    const L = planFor(lob), s = ped.home;
    if (msg.at === 'mail') { const m = L.pieces.find((q) => q.use === 'mail'); s.x = m.x + m.w / 2; s.y = m.y + m.h + TILE_IN / 2; }
    else { const d = L.doors[(msg.at | 0) - 1]; if (d) { s.x = d.x; s.y = d.y + TILE_IN; } }
    s.a = -Math.PI / 2;
    send(world, p, true);
  }
  return null;
}
