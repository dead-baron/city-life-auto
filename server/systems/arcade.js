// The arcades (the owner, 10-08: "Arcade: walk in and play our own 8-bit games... tickets for prizes"; 10-16: "are
// arcades in?"): the Neon Strip's arcades (Retro Rewind, Hi Score, VR Den, the Pixel Arcade and the rest) - at the
// door, the action button: a credit for STARFALL, our own shooter (client/arcade.js, its own little screen), and the
// prize counter. The page plays the game and sends the score back; it's worth tickets (ARCADE.perTicket points each, at
// most ARCADE.maxTickets a game - a score is checked against how long the game took, as a page could say anything),
// and tickets buy the prizes (an item in your bag, or a piece for your home, delivered). The mansion's own cabinets
// play for free (homeinside.js): no tickets, the high score.
//   p.arcade: { id (this credit's), at (world.time it began), free, poi } while a game's on; profile.tickets; profile.arcadeBest
import { randomBytes } from 'node:crypto';
import { ARCADE } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { PIECES as DECOR } from '../../shared/homedecor.js';
import { store } from '../store.js';
import { poolTable } from './activities.js';
import { payFrom as pay } from './economy.js';

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

// the counter's menu (economy.js buildMenu): a credit, the prize counter
export function menu(world, p, poi) {
  const prof = p.profile, t = prof.tickets || 0, opts = [];
  if (p.arcadePrizes === poi.id) {
    ARCADE.prizes.forEach((q, i) => opts.push({ id: `ar:prize:${i}`, label: `${prizeName(q)} - ${q.t} tickets`, dis: t < q.t, note: q.decor ? 'for your home, delivered' : '' }));
    opts.push({ id: 'ar:back', label: 'Back to the games' });
    opts.push({ id: 'close', label: 'Leave' });
    return { t: 'menu', poi: poi.id, title: `${poi.label} - the prize counter`, sub: `You have ${t} ticket${t === 1 ? '' : 's'}.`, opts, cash: prof.cash, bank: prof.bank };
  }
  opts.push({ id: 'ar:play', label: 'Play STARFALL', price: ARCADE.price, note: `tickets for every ${ARCADE.perTicket} points`, shut: true });
  opts.push({ id: 'ar:skee', label: 'Skee-ball', price: ARCADE.skee.price, note: `${ARCADE.skee.balls} balls - tickets for every ${ARCADE.skee.perTicket} points`, shut: true });
  opts.push({ id: 'ar:pinball', label: 'Pinball - NEON NIGHTS', price: ARCADE.pinball.price, note: `three balls - a ticket for every ${ARCADE.pinball.perTicket.toLocaleString('en-US')} points`, shut: true });
  opts.push({ id: 'ar:hockey', label: 'Air hockey against the machine', price: ARCADE.hockey.price, note: `first to ${ARCADE.hockey.to} - ${ARCADE.hockey.win} tickets for a win`, shut: true });
  opts.push({ id: 'ar:prizes', label: `The prize counter (${t} ticket${t === 1 ? '' : 's'})` });
  opts.push({ id: 'close', label: 'Leave' });
  return { t: 'menu', poi: poi.id, title: poi.label, sub: `The cabinets blinking in the dark, the bleeps and the high scores. Your best: ${prof.arcadeBest || 0}.`, opts, cash: prof.cash, bank: prof.bank };
}
const prizeName = (q) => (q.item ? ITEMS[q.item].name : DECOR[q.decor].name);

// economy.js execute: 'ar:...' (pay: economy.js pay)
export function execute(world, p, poi, opt, pay) {
  const parts = opt.split(':'), prof = p.profile;
  switch (parts[1]) {
    case 'prizes': p.arcadePrizes = poi.id; return null;
    case 'back': p.arcadePrizes = null; return null;
    case 'play': {
      if (!pay(p, ARCADE.price)) return 'Not enough money.';
      play(world, p, false, poi.id);
      return null;
    }
    case 'skee': case 'hockey': case 'pinball': {   // (skee-ball and air hockey: client/skeeball.js, client/airhockey.js)
      if (!pay(p, ARCADE[parts[1]].price)) return 'Not enough money.';
      play(world, p, false, poi.id, parts[1]);
      return null;
    }
    case 'prize': {
      const q = ARCADE.prizes[Number(parts[2])];
      if (!q) return 'Not on the shelf.';
      if ((prof.tickets || 0) < q.t) return 'Not enough tickets.';
      if (q.decor && !(prof.homes || []).length) return 'You need a home to put it in.';
      prof.tickets -= q.t;
      if (q.item) prof.inventory[q.item] = (prof.inventory[q.item] || 0) + 1;
      else { prof.furn ||= {}; prof.furn[q.decor] = (prof.furn[q.decor] || 0) + 1; }
      world.notify(p, `Won: ${prizeName(q)}${q.decor ? ' - delivered to your home\'s storage (place it from the hall table: Decorate)' : ' - in your bag'}.`, 'good');
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
  world.notify(p, `STARFALL: ${score}${best ? ' - a new high score!' : ''} ${tickets} ticket${tickets === 1 ? '' : 's'} (${prof.tickets} in all - the prize counter's at the door).`, tickets ? 'good' : 'info');
  p.meDirty = true;
  store.touch();
}
