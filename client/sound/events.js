// What every server event sounds like (the server's world.emit / broadcast { e: '<kind>', ... }; main.js onEvent
// hands each to soundEvent first). A kind maps to a function (ev, A) that plays its sound through A:
//   A.at(name, x, y, vol, p)  a sound placed in the world (instruments.js name; p: its parameters)
//   A.ui(name, vol, p)        a sound with no place (yours, the menus)
//   A.S                       the client state (the map, the entities, me)
//   A.surf(x, y)              what's on the ground there (surface.js)
//   A.mute(name, s)           silence main.js's old sfx(name) calls for s seconds (ones it makes later on a timer)
// or to null: the kind is data the client keeps (who's on which team, the station clocks), and nothing is heard.
// test/sound.test.js checks every kind the server emits is here - a new kind needs its sound.
import { WEAPON_BY_INDEX } from '../../shared/items.js';
import { VF, K } from '../../shared/constants.js';

const GUN = {
  pistol: 'gun_pistol', service: 'gun_pistol', revolver: 'gun_revolver', spistol: 'gun_silenced',
  shotgun: 'gun_shotgun', pshotgun: 'gun_shotgun', rifle: 'gun_rifle', prifle: 'gun_rifle', passault: 'gun_rifle',
  varmint: 'gun_rifle', smg: 'gun_smg', psniper: 'gun_sniper', huntrifle: 'gun_sniper', rocket: 'gun_rocket',
};
export const gunSound = (w) => (w && GUN[w.id]) || (w && w.silenced ? 'gun_silenced' : 'gun_pistol');
const HEAVY = new Set(['bat', 'crowbar', 'sledge']), BLADE = new Set(['knife', 'huntknife', 'sword', 'katana']);
export function meleeHit(w) {
  if (!w || w.id === 'fists') return 'punch';
  if (w.id === 'baton') return 'baton';
  if (w.plasma) return 'sear';
  if (BLADE.has(w.id)) return 'cut';
  return HEAVY.has(w.id) ? 'bonk' : 'punch';
}
export function meleeSwing(w) {
  if (!w || w.id === 'fists') return 'whoosh';
  if (w.plasma) return 'hum';
  if (BLADE.has(w.id)) return 'whoosh_blade';
  return HEAVY.has(w.id) ? 'whoosh_heavy' : 'whoosh';
}
// a smashed prop, by what it's made of
export function propSound(t) {
  t = t || '';
  if (t === 'hydrant') return ['clang', 'gush'];
  if (t.startsWith('vend') || t === 'atm' || t.includes('glass') || t.includes('booth') || t.includes('shelter') || t.includes('window')) return ['glass', 'clang'];
  if (t.startsWith('tree') || t.startsWith('palm')) return ['woodcrunch', 'foliage'];
  if (t.startsWith('shrub') || t.startsWith('bush') || t.startsWith('flower') || t.startsWith('planter') || t === 'potted' || t.startsWith('hedge')) return ['foliage'];
  if (t === 'cone' || t === 'barrier' || t === 'tires' || t === 'spool') return ['thud'];
  if (t.includes('bench') || t.includes('fence') || t.includes('crate') || t.includes('pallet') || t.includes('table') || t.includes('chair') || t.includes('kiosk') || t.includes('stall')) return ['woodcrunch'];
  if (t.includes('trash') || t.includes('bin') || t.includes('news') || t.includes('paper')) return ['clang', 'paper'];
  if (t.includes('lamp') || t.includes('light') || t.includes('sign') || t.includes('pole') || t.includes('meter') || t.includes('mail') || t === 'drum' || t.includes('rail')) return ['clang'];
  if (t.startsWith('umbrella')) return ['thud', 'foliage'];
  return ['bonk'];
}
const near = (S, x, y, kind, r) => { for (const e of S.ents.values()) if (e.kind === kind && Math.abs(e.rx - x) < r && Math.abs(e.ry - y) < r) return e; return null; };
const at = (name, vol = 1) => (ev, A) => A.at(name, ev.x, ev.y, vol);
const speech = (mood) => (ev, A) => A.at('babble', ev.x, ev.y, 0.8, { mood });

export const EVENT_SOUNDS = {
  // ---- guns, blades, fists ----
  shot: (ev, A) => {
    const w = WEAPON_BY_INDEX[ev.w], me = A.S.ents.get(A.S.myPedId);
    A.at(gunSound(w), ev.x1, ev.y1, 1, { mine: !!(me && Math.abs(me.rx - ev.x1) < 40 && Math.abs(me.ry - ev.y1) < 40) });
    A.at('impact', ev.x2, ev.y2, 0.5, { s: A.surf(ev.x2, ev.y2) });   // (where it struck: by what's there)
  },
  taser: (ev, A) => A.at('taser', ev.x1, ev.y1),
  spray: at('spray'),
  loose: at('twang'),
  arrowhit: at('thwack'),
  arrowstick: (ev, A) => A.at(ev.wall ? 'impact_wood' : 'thwack', ev.x, ev.y, 0.7),
  swing: (ev, A) => {
    const a = A.S.ents.get(ev.id);
    if (a && a.localSwing && A.S.loopClock - a.localSwing < 0.6) return;   // (your own swing played the moment you pressed)
    A.at(meleeSwing(a ? WEAPON_BY_INDEX[a.extra] : null), ev.x, ev.y, 0.9);
  },
  hit: (ev, A) => A.at(meleeHit(WEAPON_BY_INDEX[ev.w]), ev.x, ev.y),
  blood: (ev, A) => A.at(ev.g ? 'impact_flesh' : 'hit', ev.x, ev.y, 0.8),
  finisher: (ev, A) => A.at(ev.k === 'stab' ? 'stab' : 'slash', ev.x, ev.y, 1.2),
  sizzle: at('sear'),
  deflect: at('zing'),
  block: (ev, A) => A.at(ev.w === 28 ? 'zing' : ev.w ? 'clank' : 'punch', ev.x, ev.y, 0.8),   // (a guard taking a blow: combat.js blocked)
  guard: null,   // (the guard pose raised or let down: re-sent while it's held, heard only when it takes a blow - 'block')
  // a deflected arrow landing (combat.js): the shaft clattering down; a fire arrow's flame hissing out
  arrowdrop: (ev, A) => { A.at('impact_wood', ev.x, ev.y, 0.35); if (ev.f) A.at('sear', ev.x, ev.y, 0.3); },
  spark: (ev, A) => A.at('ricochet', ev.x, ev.y, 0.6),
  knockdown: at('knockdown', 1.1),
  // fighting off an officer (server struggle.js): grunts and a scuffle on the ground as you heave, a shove and a whoosh as
  // you throw them off, the cuffs clicking shut if you don't
  struggle: (ev, A) => { A.at('hit', ev.x, ev.y, 0.55); A.at('roll', ev.x, ev.y, 0.45); },
  breakfree: (ev, A) => { A.at('whoosh_heavy', ev.x, ev.y, 1); A.at('punch', ev.x, ev.y, 0.8); },
  cuffs: (ev, A) => { A.at('lightclick', ev.x, ev.y, 1); A.at('clank', ev.x, ev.y, 0.4); },
  react: null,                                   // (the stagger: the 'hit' or 'blood' with it is heard)
  fling: at('whoosh_heavy', 0.7),
  death: at('bodyfall'),
  drip: (ev, A) => A.at('drip', ev.x, ev.y, 0.35),
  foot: null,                                    // (bloody prints: the footsteps themselves come from the frame)
  maul: (ev, A) => { A.at('growl', ev.x, ev.y, 0.7); A.at('bonk', ev.x, ev.y, 0.9); },
  roar: (ev, A) => A.at(ev.k === 'cougar' || ev.k === 'bobcat' ? 'screech' : ev.k === 'goose' ? 'honk' : ev.k === 'moose' || ev.k === 'elk' || ev.k === 'deer' ? 'bellow' : 'growl', ev.x, ev.y),
  flush: at('flutter'),
  // ---- vehicles, explosions, fire, things breaking ----
  crash: (ev, A) => {   // by how hard: a grinding scrape along a wall, a crunch, a smash with the glass going
    const p = ev.p ?? 0.5;
    if (p < 0.18) { A.at('scrape', ev.x, ev.y, 0.6 + p * 2); return; }
    A.at('crash', ev.x, ev.y, 1, { p }); if (p > 0.45) A.at('glass', ev.x, ev.y, 0.5 + 0.5 * p);
  },
  explode: (ev, A) => {   // bigger vehicles, bigger blasts (task #363): a truck adds the rubble, a car blown apart its metal and glass
    A.at('explosion', ev.x, ev.y, 1, { r: ev.r || 100 });
    if ((ev.r || 0) >= 160) { A.at('explosion', ev.x, ev.y, 0.7, { r: ev.r * 1.3 }); A.at('rubble', ev.x, ev.y, 1); }
    if (ev.k === 'pieces' || ev.k === 'launch') { A.at('clang', ev.x, ev.y, 0.9); A.at('glass', ev.x, ev.y, 0.8); }
  },
  // the tank's cannon (H58: server tank.js): a short, deep blast at the muzzle and the clang of the breech
  tankfire: (ev, A) => { A.at('explosion', ev.x, ev.y, 0.85, { r: 70 }); A.at('clang', ev.x, ev.y, 0.5); A.at('thud', ev.x, ev.y, 0.8); },
  // a part coming off a battered car (task #402: vehicles.js): a bumper or a door clanging down, a wheel's thump
  vpart: (ev, A) => { if (ev.k === 'wheel') A.at('thud', ev.x, ev.y, 0.8); else { A.at('clang', ev.x, ev.y, 0.6); A.at('scrape', ev.x, ev.y, 0.4); } },
  // a car cut in two by a plasma blade: the blade's sear through the metal, the shell parting
  vcut: (ev, A) => { A.at('sear', ev.x, ev.y, 1); A.at('hum', ev.x, ev.y, 1.2); A.at('clang', ev.x, ev.y, 0.7); },
  wreckland: (ev, A) => { A.at('crash', ev.x, ev.y, 1, { p: 1 }); A.at('rubble', ev.x, ev.y, 0.8); A.at('clang', ev.x, ev.y, 0.7); },   // a wreck blown up into the air slams down
  collapse: (ev, A) => { if (ev.k !== 's') A.at('bodyfall', ev.x, ev.y, 0.8); },
  runover: (ev, A) => { A.at('bonk', ev.x, ev.y, 1); A.at('bodyfall', ev.x, ev.y, 0.9); A.at('crash', ev.x, ev.y, 0.5, { p: 0.2 }); },   // a body under a car (task #361)
  // a skateboard (server skate.js): stepping on, an ollie's pop and its landing, a bail - the scrape and the thump down
  boardon: (ev, A) => A.at('clack', ev.x, ev.y, 0.35),
  ollie: (ev, A) => A.at('clack', ev.x, ev.y, 0.7),
  land: (ev, A) => { A.at('clack', ev.x, ev.y, 0.55); A.at('thud', ev.x, ev.y, 0.3); },
  hop: (ev, A) => { const e = A.S.ents.get(ev.id); if (e) A.at('roll', e.rx, e.ry, 0.3); },   // over a fence (shared/fences.js)
  bail: (ev, A) => { A.at('scrape', ev.x, ev.y, 0.7); A.at('thud', ev.x, ev.y, 0.9); },
  // the tricks (2026-10-18): onto a rail - the clack and the trucks' scrape (a metal rail rings: clank); a combo banked
  skgrind: (ev, A) => { A.at('clack', ev.x, ev.y, 0.6); A.at(ev.q === 'rail' || ev.q === 'coping' ? 'clank' : 'scrape', ev.x, ev.y, 0.5); },
  skbank: (ev, A) => A.at('cashtoss', ev.x, ev.y, 0.35),
  skbail: null,   // (a combo lost: the 'bail' with it is heard)
  cartcrash: (ev, A) => { A.at('clang', ev.x, ev.y, 0.55); A.at('scrape', ev.x, ev.y, 0.5); },
  cartup: (ev, A) => A.at('clang', ev.x, ev.y, 0.3),   // (a tipped shopping cart stood back up)   // (a shopping cart's wire basket into something, someone thrown out)
  hood: (ev, A) => { A.at('thud', ev.x, ev.y, 1); A.at('bonk', ev.x, ev.y, 0.8); A.at('clank', ev.x, ev.y, 0.6); },   // a thud up onto the hood
  hoodoff: (ev, A) => A.at('bodyfall', ev.x, ev.y, 0.9),
  sinkboom: (ev, A) => { A.at('explosion', ev.x, ev.y, 0.5, { r: 60, wet: 1 }); A.at('splash', ev.x, ev.y, 1, { n: 40 }); },
  pop: at('tyrepop'),
  spikes: at('spikes'),
  spikesgone: null,                              // (the strip picked up: the deploy was heard)
  // bank heists (heist.js): the thermal drill's whine at the vault door, a jam's clunk, the door swinging open
  bt: null,   // (the bus shelters' arrival boards, said again every second: drawn by client/render/busboard.js)
  vault: null, vaultgone: null,                  // (the vault's state, said again every few seconds: drawn by client/vault.js)
  drill: at('chainsaw', 0.5),
  drilljam: (ev, A) => { A.at('clang', ev.x, ev.y, 0.8); A.at('thud', ev.x, ev.y, 0.6); },
  vaultopen: (ev, A) => { A.at('clang', ev.x, ev.y, 1); A.at('thud', ev.x, ev.y, 1); A.at('rubble', ev.x, ev.y, 0.4); },
  barrier: (ev, A) => { A.at('crash', ev.x, ev.y, 1, { p: 1 }); A.at('rubble', ev.x, ev.y); },
  barrierfix: null,                              // (repaired off-screen, by the road crews)
  gatebreak: (ev, A) => { A.at('crash', ev.x, ev.y, 0.7, { p: 0.6 }); A.at('woodcrunch', ev.x, ev.y, 0.8); },
  propbreak: (ev, A) => { const p = A.S.map && A.S.map.props[ev.i]; if (p) for (const n of propSound(p.t)) A.at(n, p.x, p.y); },
  propfix: null,                                 // (put back by the crews)
  // lights to carry and felling trees (#358, #359): the click of a switch, a flare struck, the axe, the saw, the crack
  // and the crash; the lights on the ground and the stumps growing back are data (client/carrylights.js)
  lightclick: (ev, A) => A.at('lightclick', ev.x, ev.y, ev.snap ? 0.8 : 0.6),
  flarestrike: at('flarestrike'),
  glight: null,
  chop: at('chop'),
  saw: at('chainsaw', 0.9),
  treefall: (ev, A) => A.at('treecrack', ev.x, ev.y, 0.55 + 0.12 * (ev.s || 2)),
  logcut: (ev, A) => { if (ev.x !== undefined) A.at('thud', ev.x, ev.y, 0.45); },   // (a round off a felled trunk: felling.js)
  treecrash: (ev, A) => { A.at('treefall', ev.x, ev.y, 0.55 + 0.15 * (ev.s || 2), { s: ev.s }); A.at('foliage', ev.x, ev.y, 0.8); },
  treeup: null,
  fire: (ev, A) => { const p = A.S.map && A.S.map.props[ev.i]; if (p) A.at(ev.lit ? 'ignite' : 'douse', p.x, p.y); },
  // the park and the camp (server ducks.js, fireworks.js, chess.js, campfires.js build; fwup / fwpop / fwfount are the
  // page's own, as client/leisure/stage.js plays a show out: the rocket going up, its burst, the fountain's hiss)
  camp: (ev, A) => A.at(ev.off ? 'douse' : 'ignite', ev.x, ev.y, 0.8),
  fw: (ev, A) => A.at('flarestrike', ev.x, ev.y, 0.8),
  fwup: (ev, A) => A.at('whoosh', ev.x, ev.y, 0.75),
  fwpop: (ev, A) => { A.at('explosion', ev.x, ev.y, ev.big ? 0.42 : 0.28, { r: ev.big ? 70 : 45 }); A.at('crackle', ev.x, ev.y, ev.crk ? 1 : 0.6); },
  fwfount: (ev, A) => A.at('crackle', ev.x, ev.y, 0.9),
  duckfeed: (ev, A) => A.at('splash', ev.tx, ev.ty, 0.35, { n: 4 }),
  chessmv: (ev, A) => A.at('clack', ev.x, ev.y, ev.c ? 0.5 : 0.35),
  geyser: (ev, A) => A.at('gush', ev.x, ev.y),
  trainhorn: (ev, A) => A.at(ev.s === 2 ? 'trainhorn' : 'trainhornshort', ev.x, ev.y),
  xing: (ev, A) => { const c = A.S.map && A.S.map.rail && A.S.map.rail.crossings && A.S.map.rail.crossings[ev.i]; if (c) A.at('gatearm', c.x, c.y, 0.6); },
  tt: null,                                      // (the station clocks' timetable)
  club: null,                                    // (a club's music on or off: sound/places.js plays it)
  // ---- doors and gates ----
  door: (ev, A) => A.at(near(A.S, ev.x, ev.y, K.VEH, 70) ? 'cardoor' : 'housedoor', ev.x, ev.y),
  mount: (ev, A) => A.at('hoof', ev.x, ev.y, 0.5, { s: 'soft' }),   // (up on a horse or down off it: a stamp of its hoof - server vehicles.js)
  garagedoor: (ev, A) => { const h = A.S.map && A.S.map.homes && A.S.map.homes[ev.home]; const d = h && (h.garageDoor || h.garage); if (d) A.at('rollerdoor', d.x, d.y); },
  baydoor: (ev, A) => { const b = A.S.map && A.S.map.bays && A.S.map.bays[ev.i]; if (b) A.at('rollerdoor', (b.tx + b.tw / 2) * 32, (b.ty + b.th / 2) * 32); },
  gate: (ev, A) => { const g = A.S.map && A.S.map.gates && A.S.map.gates[ev.i]; if (g) A.at(g.club ? 'rollerdoor' : 'gate', g.x, g.y, 0.8); },
  celldoor: (ev, A) => A.at('gate', ev.x, ev.y, 0.55),
  bang: (ev, A) => A.at(ev.k === 2 ? 'thud' : 'clang', ev.x, ev.y, ev.k === 2 ? 0.5 : 0.4),   // fight in a cell: the bars rattled, a fist on the wall (server cells.js bang)   // a cell door clanking open or shut (server cells.js)
  tow: (ev, A) => A.at(ev.hooked ? 'clank' : 'gate', ev.x, ev.y, ev.hooked ? 1 : 0.9),   // the tow truck's winch, then the hook taking the weight (server tow.js)

  // ---- under the ground (server/systems/underground.js) ----
  manhole: (ev, A) => A.at('manhole', ev.x, ev.y),                     // a cover dragged aside, down or up the ladder
  pick: (ev, A) => A.at(ev.done ? 'orefree' : 'pickaxe', ev.x, ev.y, 1, { t: ev.t || 1 }),   // a pickaxe on the rock; the ore coming free
  bats: (ev, A) => A.at('bats', ev.x, ev.y),                           // a roost bursting out at a light
  dust: (ev, A) => A.at('trickle', ev.x, ev.y),                        // grit trickling from a cracked roof...
  rockfall: (ev, A) => A.at('rockfall', ev.x, ev.y),                   // ...and the rock coming down
  chest: (ev, A) => { A.at('gate', ev.x, ev.y, 0.35); A.at('cashtoss', ev.x, ev.y, 0.5); },   // an old chest's lid creaking up, the coins in it (a cavern's: server/systems/underground.js)
  // ---- people ----
  say: speech('talk'),
  thanks: speech('happy'),
  scream: (ev, A) => A.at('scream', ev.x, ev.y),
  yelp: (ev, A) => A.at('yelp', ev.x, ev.y),
  ignite: (ev, A) => { A.at('burner', ev.x, ev.y, 0.8); A.at('scream', ev.x, ev.y); },   // someone catching fire: the whoomph, the scream (server burning.js)
  douse: (ev, A) => A.at('sear', ev.x, ev.y, 0.9),                                       // ...and the hiss as the water puts it out
  thud: at('thud'),
  kick: at('kick', 0.8),
  poof: (ev, A) => { if (ev.k === 'plasma') { A.at('hum', ev.x, ev.y, 1.4); A.at('zing', ev.x, ev.y); } else A.at('poof', ev.x, ev.y, 0.6); },
  fade: (ev, A) => { if (ev.x !== undefined) A.at('poof', ev.x, ev.y, 0.5); },
  heal: at('heal', 0.7),
  revive: at('revive'),
  splash: (ev, A) => A.at('splash', ev.x, ev.y, 1, { n: ev.n || 10 }),
  whinny: (ev, A) => A.at('whinny', ev.x, ev.y, 1),   // (a horse bolting: server horses.js)
  // ---- money and things ----
  cash: at('cashtoss'),
  // the owner's weapons and the fall from the sky: a grenade thrown and bouncing (grenades.js), the flamethrower's roar
  // (combat.js flame); out of an aircraft (skydive.js) - the jump, the canopy filling, the landing (soft, onto a car, a splat)
  toss: at('whoosh', 0.7),
  clink: at('thud', 0.3),
  flame: at('burner', 0.5),
  skyjump: at('whoosh_heavy', 0.6),
  chute: at('flutter', 0.9),
  skyland: (ev, A) => { if (ev.k === 'soft') A.at('roll', ev.x, ev.y, 0.6); else { A.at('bodyfall', ev.x, ev.y, 1); if (ev.k === 'car') A.at('clang', ev.x, ev.y, 0.8); } },
  // tennis (tennis.js): the racket on the ball, its bounce, a swing at the air
  thwock: at('thwack', 0.6),
  bounce: at('thud', 0.25),
  swish: (ev, A) => { const e = A.S && A.S.ents && A.S.ents.get(ev.id); if (e || ev.x !== undefined) A.at('whoosh', e ? e.rx : ev.x, e ? e.ry : ev.y, 0.5); },
  dice: (ev, A) => { A.at('clack', ev.x, ev.y, 0.5); A.at('clack', ev.x, ev.y, 0.35); },   // (dice against the alley wall: streetdice.js)
  casino: (ev, A) => { if (ev.k === 'jackpot') { A.at('cashtoss', ev.x, ev.y, 1); A.at('cashtoss', ev.x, ev.y, 0.9); A.at('deposit', ev.x, ev.y, 0.8); } else if (ev.k === 'win') A.at('cashtoss', ev.x, ev.y, 0.7); },   // (a casino's slots and tables: casino.js)
  loot: at('pickup'),
  deposit: at('deposit'),
  forage: (ev, A) => { if (ev.up) return; const f = A.S.map && A.S.map.forage && A.S.map.forage[ev.i]; if (f) A.at('pluck', f.x, f.y); },
  alarm: (ev, A) => A.at('alarmbell', ev.x, ev.y),
  camera: (ev, A) => { const c = A.S.map && A.S.map.cameras && A.S.map.cameras[ev.id]; if (c) A.at('camera', c.x, c.y); },
  pflash: (ev, A) => A.at('shutter', ev.x, ev.y, 0.6),
  toast: (ev, A) => A.ui(ev.tone === 'bad' ? 'bad' : ev.tone === 'good' ? 'good' : ev.tone === 'warn' ? 'alert' : 'notify', ev.tone === 'info' ? 0.5 : 0.8),
  // ---- fishing, games, rides, the town ----
  cast: at('cast'),
  nibble: (ev, A) => A.at('splash', ev.x, ev.y, 0.3, { n: 3 }),   // (a fish at the bait: the bobber twitches)
  bite: at('bite'),
  bark: at('dog'),   // (a police dog let out of the car, straining at the lead, let go: server k9.js)
  yelp: at('dog', 0.45),   // (the police dog hurt: it lets go, limps off)
  k9bite: (ev, A) => { A.at('dog', ev.x, ev.y, 1); A.at('punch', ev.x, ev.y, 0.7); },   // (the police dog gets hold of someone: k9.js)
  hook: (ev, A) => A.at('splash', ev.x, ev.y, ev.leg ? 1 : 0.8, { n: ev.leg ? 16 : 10 }),   // (struck: it's on)
  flost: (ev, A) => A.at('splash', ev.x, ev.y, 0.5, { n: 5 }),   // (it got away, or the line snapped)
  catch: (ev, A) => { A.at('splash', ev.x, ev.y, 0.8, { n: 12 }); A.ui('good', 0.7); },
  golfhit: (ev, A) => A.at(ev.k ? 'golfhit' : 'putt', ev.x, ev.y),
  golfcup: at('golfcup'),
  golfsplash: (ev, A) => A.at('splash', ev.x, ev.y, 0.7, { n: 6 }),
  hoop: (ev, A) => A.at(ev.in ? (ev.sw ? 'swish' : 'hoopin') : 'clank', ev.x, ev.y),
  goal: (ev, A) => A.ui('goal'),
  teams: null,                                   // (who's on which team at a venue)
  raceGo: (ev, A) => A.ui('racego'),
  checkpoint: (ev, A) => A.ui('checkpoint', 0.8),
  ride: (ev, A) => { if (ev.k === 'balloon') A.ui('burner', 0.6); else A.ui('ridebell', 0.6); },
  rideend: null,                                 // (the ride's over: its cab just stops)
  bells: (ev, A) => { A.mute('churchbell', (ev.n || 3) * 1.2 + 1); A.at('churchbells', ev.x, ev.y, 1, { n: ev.n || 3 }); },
  // ---- Pinwheel Lanes (server/systems/bowling.js) ----
  bowl: (ev, A) => (ev.n ? A.at('woodcrunch', ev.x, ev.y, Math.min(1, 0.45 + ev.n * 0.06)) : A.at('thud', ev.x, ev.y, 0.4)),   // (the pins going down; a gutter ball's thump at the pit)
  bowlx: (ev, A) => A.ui('good', 0.6),           // (a strike)
  bowlset: null,                                 // (the pinsetter sets a new rack)
  // ---- flying (server/systems/aircraft.js) ----
  touchdown: (ev, A) => A.at('scrape', ev.x, ev.y, 0.45),   // (the wheels / skids meeting the ground)
  hose: at('gush', 0.5),                         // (a firefighter's hose: server/systems/firefighter.js)
};

// For the frame: true for a vehicle whose engine is running (someone at the wheel, not wrecked or dead)
export const engineOn = (v) => !!(v.flags & VF.DRIVER) && !(v.flags & (VF.WRECK | VF.DEAD));
