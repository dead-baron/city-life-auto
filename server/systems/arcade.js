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
  if (!poi || poi.kind !== 'delivery' || poi.walk) return false;
  if (poi.arcade !== undefined) return poi.arcade;
  const b = world.map.buildings && world.map.buildings[poi.b];
  const k = !!b && (b.key === 'arcade' || b.arch === 'arcade' || b.prefab === 'arcade' || (b.art && b.art.shop && b.art.shop.kind === 'arcade'));
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
  p.conn.sendJSON({ t: 'arcade', game, id: p.arcade.id, free: !!free, best: (game === 'pool' ? p.profile.poolBest : p.profile.arcadeBest) || 0 });
}
// the Rusty Spur's pool table (activities.js poolTable): a frame for ARCADE.pool dollars
export function poolInteraction(world, p) {
  const ped = p.ped, T = world.map.roadhouse ? poolTable(world.map) : null;
  if (!T || !ped || ped.dead || ped.vehId || Math.hypot(ped.x - T.cx, ped.y - T.cy) > 70) return null;
  return { label: `Rack 'em up at the pool table ($${ARCADE.pool})`, run: () => { if (pay(p, ARCADE.pool)) play(world, p, true, null, 'pool'); else world.notify(p, 'Not enough money.', 'warn'); } };
}

// the score back from the page (session.js): the tickets it's worth, if it's this credit's and could be true
export function onScore(world, p, msg) {
  const A = p.arcade;
  if (!A || String(msg.id || '') !== A.id) return;
  p.arcade = null;
  if (A.game === 'pool') {   // (a frame cleared: the fewest shots - none fewer than the nine balls)
    const shots = Math.floor(Number(msg.score) || 0), prof = p.profile;
    if (shots < 9 || (Number(msg.secs) || 0) < 5) return;
    const best = !prof.poolBest || shots < prof.poolBest;
    if (best) prof.poolBest = shots;
    world.notify(p, `Cleared the table in ${shots} shots${best ? ' - your best!' : ''}.`, best ? 'good' : 'info');
    store.touch();
    return;
  }
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
