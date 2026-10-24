// The arcades (the owner, 10-08: "Arcade: walk in and play our own 8-bit games... tickets for prizes"; 10-16: "are
// arcades in?"; 2026-10-24: "The Arcade should be a building that has an interior you walk into and you can go up to
// different arcades or games to play different things, and the prize counter should be somewhere inside that you walk
// up to and interact with"): the Neon Strip's arcades (Retro Rewind, Hi Score, VR Den, the Pixel Arcade and the rest),
// the Pier Arcade, the Game Zones, Midtown's Penny Arcade - every arcade's door (isArcade) opens onto its floor: a level
// of its own like a home's (shared/homelayout.js 'arcade': not part of the map, walked round as a home is -
// homeinside.js; the page draws it the same, client/render/homeview.js), open to anyone. Along the back wall a cabinet
// for each game (GAMES: STARFALL, our own shooter - client/arcade.js, skee-ball, pinball, air hockey against the
// machine): walk up to one and Act puts in a credit and plays it on its own little screen. Down the east wall the prize
// counter: Act there for the prizes. The page plays the game and sends the score back; it's worth tickets
// (ARCADE.perTicket points each, at most ARCADE.maxTickets a game - a score is checked against how long the game took,
// as a page could say anything), and tickets buy the prizes (an item in your bag, a piece for your home, delivered, or a
// skateboard of your own). Out by the door you came in. The mansion's own cabinets play for free (homeinside.js): no
// tickets, the high score.
//   p.arcade: { id (this credit's), at (world.time it began), free, poi } while a game's on; profile.tickets; profile.arcadeBest
//   world.arcadeHalls: the arcades' floors (hallOf), by id - ARC0 + the door's POI id; ped.home.arcade: 1 on one
import { randomBytes } from 'node:crypto';
import { ARCADE, HOME_IN } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { PIECES as DECOR } from '../../shared/homedecor.js';
import { layout, useAt } from '../../shared/homelayout.js';
import { store } from '../store.js';
import { poolTable } from './activities.js';
import { payFrom as pay } from './economy.js';
import * as homes from './homes.js';
import * as homeinside from './homeinside.js';
import * as skate from './skate.js';

// an arcade's door: a business place whose building is an arcade (the strip's storefronts, the Pixel Arcade)
export function isArcade(world, poi) {
  if (!poi || poi.kind !== 'delivery') return false;
  if (poi.walk) return poi.store === 'arcade';   // (a hand plan's walk-in arcade: Midtown's Penny Arcade)
  if (poi.arcade !== undefined) return poi.arcade;
  const b = world.map.buildings && world.map.buildings[poi.b];
  const k = !!b && (b.kind === 'arcade' || b.key === 'arcade' || b.arch === 'arcade' || (b.art && b.art.shop && b.art.shop.kind === 'arcade'));   // (b.kind: the generator's arcades - Lucky Mesa's Pixel Arcade, Falls Center's Game Zone)
  try { poi.arcade = k; } catch { /* (a frozen place: worked out again next time) */ }
  return k;
}
export const label = (poi) => `${poi.label} - the arcade`;

// ---- the floor -------------------------------------------------------------------------------------------------------
export const ARC0 = 5000000;   // (an arcade's floor's id: clear of the homes' and the flats' - homes.js UNIT0)
// the cabinets along the back wall, west to east (shared/homelayout.js 'arcade': its j pieces in order), a game each
export const GAMES = ['starfall', 'skee', 'pinball', 'hockey'];
const GAME = {
  starfall: { name: 'STARFALL', price: () => ARCADE.price, note: () => `tickets for every ${ARCADE.perTicket} points` },
  skee: { name: 'Skee-ball', price: () => ARCADE.skee.price, note: () => `${ARCADE.skee.balls} balls - tickets for every ${ARCADE.skee.perTicket} points` },
  pinball: { name: 'Pinball - NEON NIGHTS', price: () => ARCADE.pinball.price, note: () => `three balls - a ticket for every ${ARCADE.pinball.perTicket.toLocaleString('en-US')} points` },
  hockey: { name: 'Air hockey against the machine', price: () => ARCADE.hockey.price, note: () => `first to ${ARCADE.hockey.to} - ${ARCADE.hockey.win} tickets for a win` },
};
const PLAN = 'arcade', TIER = 3;   // (the mansion's palette: the deep purple carpet, the dark walls)
export const hallLayout = () => layout(PLAN, TIER);
// the floor behind an arcade's door (made the first time anyone goes in): a "home" to homes.js and homeinside.js -
// x, y its door out in the street (where you come out), price only for the plan's palette (homelayout.js tierOf)
export function hallOf(world, poi) {
  const id = ARC0 + poi.id, H = (world.arcadeHalls ||= new Map());
  let h = H.get(id);
  if (!h) H.set(id, (h = { id, isArcade: 1, poi: poi.id, kind: 'arcade', plan: PLAN, price: 60000, name: poi.label, x: poi.x, y: poi.y, slots: 0, welcome: `In ${poi.label}: walk up to a cabinet to play, the prize counter for your tickets.` }));
  return h;
}
export const hallById = (world, id) => (world.arcadeHalls ? world.arcadeHalls.get(Number(id)) || null : null);
const inHall = (p, poi) => !!(p.ped && p.ped.hidden && p.ped.home && p.ped.home.arcade && p.ped.home.id === ARC0 + poi.id);
// At an arcade's door (players.js findInteraction): in you go
export function doorInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.entering || ped.ug || ped.carrying) return null;
  const poi = world.map.poiNear(ped.x, ped.y);
  if (!poi || !isArcade(world, poi)) return null;
  if (!p.homePre && p.conn) { p.homePre = 1; p.conn.sendJSON({ t: 'home', pre: 1 }); }   // (the floor's drawing loaded ahead: homeview.js)
  return { label: `Into ${poi.label} - the arcade`, run: () => goIn(world, p, poi) };
}
// in through the door: as a block's lobby (homeinside.js intoLobby) - not with the police watching; wanted, out of their
// sight, the door takes its moment (homes.update)
export function goIn(world, p, poi) {
  const ped = p.ped;
  const err = !ped || ped.dead || ped.vehId || ped.hidden ? 'Not right now.' : ped.carrying ? 'Set the crate down first.' : p.wanted > 0 && world.time - (p.seenAt || -99) < 1.5 ? 'Not with the police watching you!' : null;
  if (err) { world.notify(p, err, 'bad'); return err; }
  if (ped.board) skate.hopOff(world, ped);   // (your board left by the door)
  const h = hallOf(world, poi);
  if (p.wanted > 0) { ped.entering = { home: h.id, at: world.time, x: ped.x, y: ped.y }; ped.vx = 0; ped.vy = 0; world.notify(p, `Slipping into ${poi.label}... (stand still)`, 'info'); return null; }
  homes.goInside(world, p, h);
  return null;
}
// the cabinet within reach of (x, y) - the nearest, to its edge - with its game, or null
const edge = (q, x, y) => Math.hypot(Math.max(q.x - x, 0, x - (q.x + q.w)), Math.max(q.y - y, 0, y - (q.y + q.h)));
export function cabinetAt(L, x, y) {
  let best = null, bd = HOME_IN.reach + 2;
  L.pieces.filter((q) => q.ch === 'j').forEach((q, i) => { const d = edge(q, x, y); if (d < bd) { bd = d; best = { piece: q, game: GAMES[i % GAMES.length], d }; } });
  return best;
}
// What the action button does where you stand on the floor (homeinside.js interaction)
export function hallInteraction(world, p, h, s) {
  const L = hallLayout(), poi = world.map.pois[h.poi], none = () => {};
  const u = useAt(L, s.x, s.y, HOME_IN.reach), cab = cabinetAt(L, s.x, s.y);
  if (cab && (!u || cab.d <= edge(u, s.x, s.y))) {
    const G = GAME[cab.game], best = bestOf(p.profile, cab.game);
    return { label: `Play ${G.name} - $${G.price()} (${G.note()}${best ? `; your best ${best.toLocaleString('en-US')}` : ''})`, run: () => credit(world, p, poi, cab.game) };
  }
  if (u && u.use === 'door') return { label: 'Out to the street', run: () => homeinside.leave(world, p) };
  if (u && u.use === 'prizes') { const t = p.profile.tickets || 0; return { label: `The prize counter - ${t} ticket${t === 1 ? '' : 's'}`, run: () => openCounter(world, p, poi) }; }
  return world.time - (s.inAt ?? -1e9) < HOME_IN.hintS ? { label: `${h.name} - walk up to a cabinet to play, the prize counter for your tickets`, passive: true, run: none } : null;
}
const bestOf = (prof, game) => ({ skee: prof.skeeBest, hockey: prof.hockeyWins, pinball: prof.pinballBest }[game] ?? prof.arcadeBest) || 0;
// a credit in a cabinet: paid for, and the page plays it (play)
export function credit(world, p, poi, game) {
  const G = GAME[game];
  if (!G || !poi) return 'Out of order.';
  if (!pay(p, G.price())) { world.notify(p, 'Not enough money.', 'warn'); return 'Not enough money.'; }
  play(world, p, false, poi.id, game);
  return null;
}
// the prize counter's menu, up on the page (economy.js handleMenu: its choices)
export function openCounter(world, p, poi) {
  if (!p.conn || !poi) return;
  p.menu = { poi: poi.id };
  p.conn.sendJSON(menu(world, p, poi));
}

// the menu at an arcade's POI (economy.js buildMenu): on its floor at the counter, the prizes; out at the door (a menu
// opened some other way), the way in
export function menu(world, p, poi) {
  const prof = p.profile, t = prof.tickets || 0, opts = [];
  if (inHall(p, poi)) {
    ARCADE.prizes.forEach((q, i) => { const have = q.board && skate.owns(p); opts.push({ id: `ar:prize:${i}`, label: `${prizeName(q)} - ${q.t} tickets`, dis: t < q.t || have, note: q.decor ? 'for your home, delivered' : have ? 'have one' : q.board ? 'yours, set down by the door' : '' }); });
    opts.push({ id: 'close', label: 'Done' });
    return { t: 'menu', poi: poi.id, title: `${poi.label} - the prize counter`, sub: `You have ${t} ticket${t === 1 ? '' : 's'}. Your best at STARFALL: ${prof.arcadeBest || 0}.`, opts, cash: prof.cash, bank: prof.bank };
  }
  opts.push({ id: 'ar:in', label: 'Go inside', note: 'the cabinets and the prize counter', shut: true });
  opts.push({ id: 'close', label: 'Leave' });
  return { t: 'menu', poi: poi.id, title: poi.label, sub: `The cabinets blinking in the dark, the bleeps and the high scores. You have ${t} ticket${t === 1 ? '' : 's'}.`, opts, cash: prof.cash, bank: prof.bank };
}
const prizeName = (q) => (q.item ? ITEMS[q.item].name : q.board ? 'A skateboard of your own' : DECOR[q.decor].name);

// economy.js execute: 'ar:...' (pay: economy.js pay)
export function execute(world, p, poi, opt) {
  const parts = opt.split(':'), prof = p.profile;
  switch (parts[1]) {
    case 'in': return goIn(world, p, poi);
    case 'prize': {
      const q = ARCADE.prizes[Number(parts[2])];
      if (!q) return 'Not on the shelf.';
      if (!inHall(p, poi)) return 'The prize counter\'s inside.';
      if ((prof.tickets || 0) < q.t) return 'Not enough tickets.';
      if (q.decor && !(prof.homes || []).length) return 'You need a home to put it in.';
      if (q.board && skate.owns(p)) return 'You have a skateboard already.';
      prof.tickets -= q.t;
      if (q.item) prof.inventory[q.item] = (prof.inventory[q.item] || 0) + 1;
      else if (q.board) { prof.board = { paint: Math.floor(world.rand() * 14), variant: Math.floor(world.rand() * 1000) }; skate.bringOut(world, p, poi.outside || poi); }
      else { prof.furn ||= {}; prof.furn[q.decor] = (prof.furn[q.decor] || 0) + 1; }
      world.notify(p, `Won: ${prizeName(q)}${q.decor ? ' - delivered to your home\'s storage (place it from the hall table: Decorate)' : q.board ? ' - by the door outside (the vehicle button steps on and off it)' : ' - in your bag'}.`, 'good');
      p.meDirty = true;
      store.touch();
      return null;
    }
  }
  return 'Not at this counter.';
}

// a credit: the page plays it (client/arcade.js STARFALL; client/pool.js a frame of pool - at the Rusty Spur's table
// and the mansion's)
export function play(world, p, free, poi = null, game = 'starfall') {
  if (!p.conn) return;
  p.arcade = { id: randomBytes(6).toString('hex'), at: world.time, free: !!free, poi, game };
  const best = { pool: p.profile.poolBest, skee: p.profile.skeeBest, hockey: p.profile.hockeyWins, pinball: p.profile.pinballBest }[game] ?? p.profile.arcadeBest;
  p.conn.sendJSON({ t: 'arcade', game, id: p.arcade.id, free: !!free, best: best || 0 });
}
// the Rusty Spur's pool table (activities.js poolTable): a frame for ARCADE.pool dollars - from anywhere round it, within
// POOL_REACH px of its rim (the owner, 10-23: "Tried playing pool and it said you can't do it indoors": at the table's
// ends - over 70 px from its middle - there was nothing to Act on, and the vehicle button there tried the skateboard)
export const POOL_REACH = 40;
export function poolInteraction(world, p) {
  const ped = p.ped, T = world.map.roadhouse ? poolTable(world.map) : null;
  if (!T || !ped || ped.dead || ped.vehId) return null;
  if (Math.hypot(Math.max(T.x0 - ped.x, 0, ped.x - T.x1), Math.max(T.y0 - ped.y, 0, ped.y - T.y1)) > POOL_REACH) return null;
  return { label: `Rack 'em up at the pool table ($${ARCADE.pool})`, run: () => { if (pay(p, ARCADE.pool)) play(world, p, true, null, 'pool'); else world.notify(p, 'Not enough money.', 'warn'); } };
}

// skee-ball's points or air hockey's goals: tickets, if it could be true (no more than the game allows, and no quicker)
function ticketGame(world, p, A, msg) {
  const prof = p.profile, el = world.time - A.at, n = Math.floor(Number(msg.score) || 0);
  let tickets = 0, text;
  if (A.game === 'skee') {
    const S = ARCADE.skee;
    if (n < 0 || n > S.balls * 100 || n % 10 || el < S.minS) return;
    tickets = Math.min(ARCADE.maxTickets, Math.floor(n / S.perTicket));
    const best = n > (prof.skeeBest || 0);
    if (best) prof.skeeBest = n;
    text = `Skee-ball: ${n}${best ? ' - your best!' : ''}`;
  } else if (A.game === 'pinball') {
    const Pb = ARCADE.pinball;
    if (n < 0 || n % 10 || el < Pb.minS) return;
    const pts = Math.min(n, Math.floor((el + 2) * Pb.maxRate));   // (no faster than a table can score)
    tickets = Math.min(ARCADE.maxTickets, Math.floor(pts / Pb.perTicket));
    const best = pts > (prof.pinballBest || 0);
    if (best) prof.pinballBest = pts;
    text = `NEON NIGHTS: ${pts.toLocaleString('en-US')}${best ? ' - your best!' : ''}`;
  } else {
    const Hk = ARCADE.hockey, won = !!msg.win && n === Hk.to && el >= Hk.minS;
    if (n < 0 || (!won && n >= Hk.to) || (msg.win && !won) || el < n * 1.5) return;   // (a goal takes a moment at least; seven goals is a win, not a loss)
    tickets = won ? Hk.win : n * Hk.perGoal;
    if (won) prof.hockeyWins = (prof.hockeyWins || 0) + 1;
    text = won ? `Air hockey: you beat the machine ${n}-${Math.max(0, Math.min(Hk.to - 1, Math.floor(Number(msg.them) || 0)))}!` : `Air hockey: ${n} goal${n === 1 ? '' : 's'} against the machine's ${Hk.to}`;
  }
  if (A.free) { world.notify(p, text, 'info'); store.touch(); return; }
  prof.tickets = (prof.tickets || 0) + tickets;
  world.notify(p, `${text} - ${tickets} ticket${tickets === 1 ? '' : 's'} (${prof.tickets} in all).`, tickets ? 'good' : 'info');
  p.meDirty = true;
  store.touch();
}

// the score back from the page (session.js): the tickets it's worth, if it's this credit's and could be true
export function onScore(world, p, msg) {
  const A = p.arcade;
  if (!A || String(msg.id || '') !== A.id) return;
  p.arcade = null;
  if (A.game === 'pool') {   // (a frame cleared: the fewest shots - a break can sink several, so any number counts)
    const shots = Math.floor(Number(msg.score) || 0), prof = p.profile;
    if (shots < 1 || world.time - A.at < 6) return;   // (the server's own clock: a frame takes a few seconds at least)
    const best = !prof.poolBest || shots < prof.poolBest;
    if (best) prof.poolBest = shots;
    world.notify(p, `Cleared the table in ${shots} shots${best ? ' - your best!' : ''}.`, best ? 'good' : 'info');
    store.touch();
    return;
  }
  if (A.game === 'skee' || A.game === 'hockey' || A.game === 'pinball') return ticketGame(world, p, A, msg);
  const secs = Math.max(0, Math.min(Number(msg.secs) || 0, world.time - A.at + 2));
  const score = Math.max(0, Math.min(Math.floor(Number(msg.score) || 0), Math.floor(secs * ARCADE.maxRate)));
  const prof = p.profile, best = score > (prof.arcadeBest || 0);
  if (best) prof.arcadeBest = score;
  if (A.free) { world.notify(p, `STARFALL: ${score}${best ? ' - a new high score!' : ''}`, best ? 'good' : 'info'); store.touch(); return; }
  const tickets = Math.min(ARCADE.maxTickets, Math.floor(score / ARCADE.perTicket));
  prof.tickets = (prof.tickets || 0) + tickets;
  world.notify(p, `STARFALL: ${score}${best ? ' - a new high score!' : ''} ${tickets} ticket${tickets === 1 ? '' : 's'} (${prof.tickets} in all - the prize counter's by the east wall).`, tickets ? 'good' : 'info');
  p.meDirty = true;
  store.touch();
}
