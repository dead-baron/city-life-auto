// Street dice (the owner's gambling list, 10-08 / 10-16: "back-alley dice"): a crew shooting dice down an alley in a
// rough part of town (activities.js 'dice' - mostly after dark). Walk up and the action button gets you in on it: a
// roll for the stake (cash on you: it's a street game), played as craps' pass line - a 7 or 11 straight off wins, a 2,
// 3 or 12 loses; anything else is your point, and you roll till you make it again (win) or a 7 comes up (lose). Even
// money, the dice fair (the crew's edge is the real game's, 1.4%). The crew has only so much on them (shared/rules.js
// DICE.pot): clean them out and they pack it in. Win too often and one of them may take it badly.
import { DICE } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { startFight } from './npc.js';
import { leave } from './activities.js';
import { store } from '../store.js';

let rng = mulberry32((Date.now() ^ 0xd1ce) >>> 0);
export function seed(n) { rng = mulberry32(n >>> 0); }
const die = () => 1 + Math.floor(rng() * 6);

// a round of the pass line from a run of rolls (each the two dice's sum): { win, rolls (as far as it went), point }
export function passLine(next) {
  const rolls = [], first = next();
  rolls.push(first);
  if (first === 7 || first === 11) return { win: true, rolls, point: 0 };
  if (first === 2 || first === 3 || first === 12) return { win: false, rolls, point: 0 };
  for (let i = 0; i < 200; i++) {
    const r = next();
    rolls.push(r);
    if (r === first) return { win: true, rolls, point: first };
    if (r === 7) return { win: false, rolls, point: first };
  }
  return { win: false, rolls, point: first };
}

// the crew round the dice you're standing by (a filled 'dice' group, at least two of them still at it)
function crewNear(world, ped) {
  for (const g of (world.acts && world.acts.values()) || []) {
    if (g.k !== 'dice' || Math.hypot(g.x - ped.x, g.y - ped.y) > 70) continue;
    const at = g.ids.map((i) => world.get(i)).filter((e) => e && !e.dead && !e.removed && e.npc && e.npc.act && Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) < 12);
    if (at.length >= 2) return { g, at };
  }
  return null;
}

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying) return null;
  const c = crewNear(world, ped);
  if (!c) return null;
  if (c.g.dicePot === undefined) c.g.dicePot = DICE.pot;
  return { label: `Shoot dice with them - $${DICE.bet} a roll`, run: () => roll(world, p, c) };
}

function roll(world, p, c) {
  const ped = p.ped, prof = p.profile, g = c.g, bet = DICE.bet;
  if (world.time - (p.diceAt || -9) < DICE.gapS) return;   // (one roll at a time)
  if ((prof.cash || 0) < bet) { world.notify(p, `It's cash on the street - you need $${bet} on you.`, 'warn'); return; }
  if (g.dicePot < bet) { packUp(world, c, 'They\'re cleaned out.'); return; }
  p.diceAt = world.time;
  const R = passLine(() => die() + die());
  world.emit(ped.x, ped.y, { e: 'dice', x: Math.round(g.x), y: Math.round(g.y), n: R.rolls.length });
  const seq = R.rolls.join(', ');
  if (R.win) {
    prof.cash += bet; g.dicePot -= bet;
    world.notify(p, `${R.point ? `Your point's ${R.point}: ${seq} - made it!` : `${seq} straight off!`} +$${bet}.`, 'good');
    if (g.dicePot < bet) { packUp(world, c, 'You\'ve cleaned them out - they pack it in.'); return; }
    // a sore loser: the further ahead you are, the likelier
    if (rng() < DICE.sore * (1 - g.dicePot / DICE.pot)) {
      const e = c.at[Math.floor(rng() * c.at.length)];
      leave(e);
      world.emit(e.x, e.y, { e: 'say', id: e.id, x: Math.round(e.x), y: Math.round(e.y), text: 'Nobody\'s that lucky...' });
      startFight(world, e, ped, 25);
    }
  } else {
    prof.cash -= bet; g.dicePot += bet;
    world.notify(p, `${R.point ? `Your point's ${R.point}: ${seq} - seven out.` : `${seq} - craps.`} -$${bet}.`, 'warn');
  }
  p.meDirty = true;
  store.touch();
}

// the game's over: they get up and go their ways
function packUp(world, c, msg) {
  for (const e of c.at) leave(e);
  if (msg) for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - c.g.x, q.ped.y - c.g.y) < 200) world.notify(q, msg, 'info');
  c.g.ids.length = 0;   // (activities.js empties the group)
}
