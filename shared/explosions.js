// Explosions (the owner's notes, task #363: "the explosions should be awesome and epic and make people go whoa"):
// how big a vehicle's blast is, and what its explosion does - all from one seed, so the server and every client
// come to the same thing. The server owns the blast, the damage and where the wreck ends up (vehicles.js); the
// clients play the layered effect from the 'explode' event (client/render/boom.js): the flash, the fireball, the
// shockwave, sparks and embers, the smoke column, debris, the scorch, the shake - and the pieces the plan names.
// Pure integer and arithmetic work only (no trig at load, no Math.random): identical in every engine.
import { mulberry32 } from './rng.js';
import { TANKER_BLAST as TB, EXPLOSIVES_BLAST as EB } from './rules.js';

// the pieces a car can blow apart into (the event names them by these letters)
export const PIECES = { d: 'door', h: 'hood', w: 'wheel', p: 'panel', t: 'trunk', b: 'bumper' };

// How big a vehicle's blast is: r the blast's reach (px), dmg at the heart, big 0 a motorbike .. 3 a fuel tanker;
// n crates of explosives aboard: 3, or 4 when it outreaches a tanker (rules.js)
export function blastSize(def, n = 0) {
  if (def && def.id === 'tanker') return { r: TB.r, dmg: TB.dmg, big: 3 };
  if (n > 0) { const r = Math.min(EB.max, EB.r + EB.per * (n - 1)); return { r, dmg: Math.round(EB.dmg * r / EB.r), big: r > TB.r ? 4 : 3 }; }
  if (!def) return { r: 110, dmg: 70, big: 1 };
  if (def.kind === 'bike') return { r: 72, dmg: 60, big: 0 };
  if (def.mass >= 2.4) return { r: 165, dmg: 85, big: 2 };
  return { r: 120, dmg: 72, big: 1 };
}

// The plan of one vehicle's explosion from its seed: k '' (it burns where it stands), 'launch' (blown up into
// the air: it rises, spins or flips and slams back down - the server moves it to where it lands) or 'pieces'
// (it blows apart: doors, the hood, wheels and panels fly off and the chassis is left a blackened shell);
// pieces [{ c (a PIECES letter), a (the throw's direction, radians from the car's heading), sp (px/s), vz (px/s
// up), va (spin, rad/s) }]; launch { a (direction from the heading), d (how far it lands, px), h (peak height, px),
// t (time in the air, s), spin (turns about its axis), flip (1: it rolls over) }. (A burning wheel: wheelpath.js)
export function boomPlan(seed, def, big = blastSize(def).big) {
  const R = mulberry32((seed >>> 0) ^ 0x5bd1e995);
  const r = R();
  let k = '';
  if (big === 0) k = r < 0.55 ? 'pieces' : '';
  else if (big > 2) k = 'pieces';
  else if (big === 2) k = r < 0.16 ? 'launch' : r < 0.62 ? 'pieces' : '';
  else k = r < 0.34 ? 'launch' : r < 0.72 ? 'pieces' : '';
  const pool = big === 0 ? 'wpw' : 'ddhwwwwpptb';
  const n = k === 'pieces' ? (big === 0 ? 2 : big > 2 ? 8 : 5 + Math.floor(R() * 3)) : k === 'launch' ? 1 + Math.floor(R() * 2) : Math.floor(R() * 2);
  const pieces = [], wheels = wheelCount(def);
  for (let i = 0; i < n; i++) {
    let c = pool[Math.floor(R() * pool.length)];
    if (c === 'w' && pieces.filter((p) => p.c === 'w').length >= wheels) c = 'p';   // (no more wheels than it has)
    const heavy = c === 'w' || c === 'h';
    pieces.push({
      c,
      a: +((i / Math.max(1, n)) * 6.2832 + (R() - 0.5) * 1.4).toFixed(3),
      sp: Math.round((heavy ? 90 : 140) + R() * (big >= 2 ? 300 : 220)),
      vz: Math.round((heavy ? 160 : 220) + R() * (big >= 2 ? 380 : 260)),
      va: +((R() - 0.5) * (c === 'w' ? 8 : 18)).toFixed(2),
    });
  }
  let launch = null;
  if (k === 'launch') {
    const t = 0.85 + R() * 0.55;
    launch = {
      a: +((R() - 0.5) * 6.2832).toFixed(3),
      d: Math.round(30 + R() * (big >= 2 ? 40 : 75)),
      h: Math.round((big >= 2 ? 30 : 46) + R() * 54),
      t: +t.toFixed(2),
      spin: +((R() - 0.5) * 2.4).toFixed(2),
      flip: R() < 0.45 ? 1 : 0,
    };
  }
  return { k, pieces, launch, big };
}

// the event's short list of the pieces ('ddhw...'): the clients rebuild the throws from the seed
export const pieceCodes = (plan) => plan.pieces.map((p) => p.c).join('');

// how many wheels it has (a bicycle buckles, it doesn't blow up)
export function wheelCount(def) {
  if (!def || def.kind === 'boat' || def.pedal) return 0;
  if (def.kind === 'bike') return def.stable ? 3 : 2;
  return def.mass >= 2.4 ? 6 : 4;
}
