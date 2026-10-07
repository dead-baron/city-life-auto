// Art v2 game characters: turns the server's ped records into art2 people (client/art2/people.js) for the
// live renderer. Pure and worker-safe (no DOM), deterministic: the same appearance always gives the same
// figure, so sprites can be cached by pedKey anywhere.
//
//   adaptApp(app, ar, opt) -> art2 app      app: the server appearance { s, h, hc, t, tc, tc2, l, sh, ht, htc, b, bd,
//                                           bandana } (server entities.js); ar: the archetype (e.d.ar: 'player', an NPC
//                                           archetype, 'medic', ...); opt.censored dresses undressed bodies in swimwear.
//                                           The server's few fields are spread into C2/C3-style looks: the archetype picks
//                                           the outfit family (suits, hi-vis, uniforms, gang vests, fur coats...), and a
//                                           hash of the record picks the details (hair cut, bottoms, beard, glasses, bags).
//   pedKey(app, pose, dir8, frame, weapon, opt) -> string     the cache key for one sprite
//   pedSprite(app, pose, dir8, frame, weapon, opt) -> GBuf    {w, h, ax, ay, col, nrm, z, emi, flag}, cropped to the figure,
//                                           anchored at the feet (the ground point under the hips when seated, lying, rolling
//                                           or swimming); z = height above it per pixel; every pixel F_CHAR.
//     app: a server appearance (adapted on the fly, with opt.ar) or an adapted art2 app (cheaper: adapt once per ped)
//     pose: v1 pedPose names: idle, move0-3 (= walk0-3: walk, jog, run, sprint), punch, swing, aim, carry, handsup, fish,
//           kneel, roll, down, dead, swim, ride, sit, drive, plus pedal (a bicycle)
//     dir8: v1 order 0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE (art2's own order is (8 - dir8) % 8)
//     frame: 0 .. PED_POSES[pose] - 1 (wraps); pedFrame(pose, v1Frame) converts the v1 frame counters
//     weapon: WEAPON_BY_INDEX index (drawn held: rest, aimed or swung per pose), or an items.js kind ('phone', 'medkit')
//   weaponItem(w) -> items.js kind or null;  PED_POSES: frames per pose;  SEATS: seat heights of the seated poses
import { person, POSES, SEATS } from '../people.js';
import { ITEMS } from '../items.js';
import { hash } from '../gbuf.js';
import { WEAPON_BY_INDEX } from '../../../shared/items.js';

export const PED_POSES = { ...POSES, move0: 6, move1: 6, move2: 6, move3: 6 };
export { SEATS };
const WEAPON_ITEM = {
  fists: null, bat: 'bat', knife: 'knife', crowbar: 'crowbar', sledge: 'sledgehammer', baton: 'nightstick', taser: 'taser', pistol: 'pistol', revolver: 'revolver',
  shotgun: 'shotgun', rifle: 'rifle', smg: 'smg', rocket: 'rocketLauncher', rod: 'fishingRod', service: 'pistol', prifle: 'rifle', psniper: 'sniper', passault: 'rifle',
  pshotgun: 'shotgun', spistol: 'silencedPistol', pepper: 'pepperSpray', spikes: 'spikeStrip',
};
export function weaponItem(w) {
  if (w === null || w === undefined || w === '') return null;
  if (typeof w === 'string') return ITEMS[w] ? w : WEAPON_ITEM[w] ?? null;
  const W = WEAPON_BY_INDEX[w | 0];
  return W ? WEAPON_ITEM[W.id] ?? null : null;
}
// v1 frame counters -> this module's frames: moves and carry run on the 0-7 stride phase, idle on a slow 0-7 clock,
// punch / swing on 0-3 (+4 for the other side)
export function pedFrame(pose, fr = 0) {
  fr |= 0;
  if (pose === 'idle') return (fr >> 2) & 1;
  if (pose.startsWith('move') || pose.startsWith('walk') || pose === 'carry') return Math.floor(((fr % 8) + 8) % 8 * 6 / 8);
  if (pose === 'punch' || pose === 'swing') return (fr >= 4 ? 3 : 0) + Math.min(2, Math.floor((fr & 3) * 3 / 4));
  const n = PED_POSES[pose] || 1;
  return ((fr % n) + n) % n;
}

// ---- appearance ---------------------------------------------------------------------------------------------------
const isServer = (a) => a && typeof a === 'object' && a.top === undefined && (a.s !== undefined || a.t !== undefined || a.h !== undefined || a.tc !== undefined);
const rgbOf = (c) => { let s = String(c || '#888').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (c) => { const [r, g, b] = rgbOf(c); return (r * 0.3 + g * 0.59 + b * 0.11) / 255; };
const blueish = (c) => { const [r, g, b] = rgbOf(c); return b > r + 25 && b > g; };
function seedOf(a, ar) {
  const s = [a.s, a.h, a.hc, a.t, a.tc, a.tc2, a.l, a.sh, a.ht, a.htc, a.b, a.bd, a.bandana ? 1 : 0, ar || ''].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const BODIES = [{ h: 0.96, w: 0.86, limb: 0.84 }, { h: 1, w: 1, limb: 1 }, { h: 1, w: 1.1, limb: 1.15, muscle: 0.6 }, { h: 1.04, w: 1.24, limb: 1.25, muscle: 1 }];
export function adaptApp(app, ar = null, opt = {}) {
  const a = app || {};
  ar = ar || a.ar || 'casual';
  if (typeof ar === 'string' && ar.startsWith('pet:')) return { pet: ar.slice(4), seed: 1 };
  const H = seedOf(a, ar), r = (k) => hash(H & 0xfffff, k, 131), pick = (arr, k) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const t = a.t ?? 0, tc = a.tc || '#888888', tc2 = a.tc2 || '#dddddd', l = a.l || '#334455', sh = a.sh || '#222222';
  const fem = a.h === 2 || a.h === 5 || t === 5;
  const police = t === 6 && blueish(tc) && lumOf(tc) < 0.3, medic = ar === 'medic' || (t === 6 && lumOf(tc) > 0.8), sweeper = t === 6 && !police && !medic;
  const swat = ar === 'swat' || (t === 3 && lumOf(tc) < 0.1 && a.ht === 5);
  const out = { seed: H & 0xffff, skin: Math.max(0, Math.min(5, a.s ?? 1)), fem, ar, censored: !!opt.censored };
  // ---- body: the server's build (frail .. brute), a gut on some brutes and seniors
  const bd = Math.max(0, Math.min(3, a.bd ?? 1));
  out.body = { ...BODIES[bd] };
  if (bd === 3 && r(1) < 0.45) { out.body.belly = 0.8; out.body.muscle = 0.3; }
  if (ar === 'senior' && r(2) < 0.3) out.body.belly = 0.6;
  if (ar === 'drunk' && r(2) < 0.4) out.body.belly = 0.7;
  // ---- hair: the server's six cuts spread over the art2 styles
  const hc = ar === 'senior' ? pick(['#cfcfcf', '#e8e8e8', '#a8a8a8'], 3) : a.hc || '#2a1a10';
  let style;
  if (a.h === 3) style = fem ? 'bun' : 'bald';
  else if (a.h === 4) style = ar === 'executive' || ar === 'cop' || ar === 'senior' || ar === 'medic' || police ? 'slick' : 'mohawk';
  else if (a.h === 2) style = pick(['long', 'wavy', 'long', 'braids'], 4);
  else if (a.h === 5) style = pick(['bun', 'pony', 'bun'], 4);
  else if (fem) style = a.h === 1 ? 'pony' : 'bob';
  else if (a.h === 1) style = pick(['spiky', 'curly', 'afro', 'dreads', 'spiky'], 4);
  else style = ar === 'executive' ? pick(['slick', 'short'], 4) : pick(['short', 'spiky', 'buzz', 'short', 'curly', 'slick'], 4);
  if (ar === 'senior' && !fem) style = pick(['short', 'bald', 'slick'], 5);
  out.hair = { style, color: hc };
  if (!fem) {
    const bp = { construction: 0.55, drunk: 0.75, senior: 0.45, syndicate: 0.35, hustler: 0.4, casual: 0.25, player: 0.2 }[ar] ?? 0.12;
    if (r(6) < bp) out.beard = pick(ar === 'drunk' ? ['full', 'stubble'] : ['short', 'full', 'stubble'], 7);
  }
  // ---- top
  const top = { kind: 'tee', color: tc, color2: tc2 };
  if (t === 1) Object.assign(top, { kind: 'suit', color2: 'white', tie: tc2 });
  else if (t === 2) top.kind = 'hoodie';
  else if (t === 3) {
    if (swat) Object.assign(top, { kind: 'tactical', color: '#2a2c32' });
    else if (ar === 'construction' || lumOf(tc) > 0.45) Object.assign(top, { kind: 'hivis', color2: pick(['charcoal', '#2a4a8a', '#4a4a52', 'navy'], 8) });
    else Object.assign(top, { kind: 'vest', color2: ar === 'syndicate' ? 'white' : pick(['white', 'charcoal', '#c8c0b0'], 8), pattern: 'quilt' });
  } else if (t === 4) top.kind = ar === 'drunk' ? pick(['coat', 'cardigan', 'flannel'], 9) : ar === 'casual' || ar === 'player' ? pick(['cardigan', 'jacket', 'flannel', 'cardigan'], 9) : 'cardigan';
  else if (t === 5) Object.assign(top, { kind: 'dress' });
  else if (t === 6) {
    if (police) Object.assign(top, { kind: 'uniform', color2: 'gold' });
    else if (medic) Object.assign(top, { kind: 'uniform', color2: tc2 });
    else Object.assign(top, { kind: 'hivis', color: tc, color2: tc2 });
  } else if (t === 7) Object.assign(top, { kind: 'fur' });
  else if (t === 0) {
    if (ar === 'athlete') top.kind = pick(['tee', 'tank', 'jersey', 'tee'], 10);
    else if (ar === 'casual' || ar === 'player') top.kind = pick(['tee', 'tee', 'polo', 'jersey', 'hawaiian', 'tee', 'tank', 'shirt'], 10);
  }
  if (top.kind === 'hawaiian') { top.pattern = 'floral'; top.color2 = pick(['#f0c040', '#e8e4dc', '#e2765e'], 11); }
  if (top.kind === 'flannel') top.color2 = 'white';
  if (top.kind === 'jacket') top.color2 = pick(['white', 'charcoal', '#c8b89a'], 11);
  out.top = top;
  // ---- bottoms
  const lb = lumOf(l), jeansy = blueish(l) && lb < 0.45;
  let bk = jeansy ? 'jeans' : 'pants';
  if (t === 5) bk = 'pants';
  else if (ar === 'athlete') bk = fem ? pick(['leggings', 'shorts'], 12) : pick(['shorts', 'shorts', 'track'], 12);
  else if (ar === 'casual' || ar === 'player') { const q = r(12); if (q < 0.14) bk = 'shorts'; else if (q < 0.28 && !jeansy) bk = 'cargo'; else if (q < 0.36 && fem) bk = 'skirt'; }
  else if (ar === 'syndicate' || ar === 'mugger') bk = 'track';
  else if (ar === 'construction') bk = jeansy ? 'jeans' : 'cargo';
  else if (swat) bk = 'cargo';
  out.bottom = { kind: bk, color: l };
  if (bk === 'track') out.bottom.stripe = ar === 'syndicate' ? (a.htc && lumOf(a.htc) > 0.2 ? a.htc : '#c8262b') : pick(['white', '#c8262b', '#e8e8e8'], 13);
  if (bk === 'jeans' && (ar === 'drunk' || (ar === 'player' && r(14) < 0.2))) out.bottom.pattern = 'ripped';
  // ---- shoes
  const sl = lumOf(sh);
  out.shoes = sh;
  out.shoeKind = t === 5 ? 'heel' : swat || ar === 'construction' || sh === '#6b4a2a' ? 'boot' : sl > 0.6 || /^#c8262b/i.test(sh) ? 'sneaker' : ar === 'drunk' || (ar === 'mugger' && r(15) < 0.5) ? 'boot' : 'shoe';
  if (ar === 'athlete' || ar === 'syndicate') out.shoeKind = 'sneaker';
  // ---- headwear
  const ht = a.ht || 0, htc = a.htc || '#222222';
  if (ht === 1) out.hat = { kind: police ? 'police' : ar === 'mugger' && r(16) < 0.5 ? 'hood' : (ar === 'casual' || ar === 'player') && !fem && r(16) < 0.3 ? 'trucker' : 'cap', color: htc };
  else if (ht === 2) out.hat = { kind: 'hard', color: htc };
  else if (ht === 3) out.hat = { kind: fem ? 'sunhat' : pick(['fedora', 'bucket'], 17), color: htc };
  else if (ht === 4) out.hat = { kind: 'beanie', color: htc };
  else if (ht === 5) out.hat = { kind: 'helmet', color: htc };
  if (out.hat && out.hat.kind === 'hood') out.hat.color = tc;
  // ---- accessories
  if (a.b === 1) out.carry = 'briefcase';
  else if (a.b === 2) out.carry = 'purse';
  else if (a.b === 3) out.carry = 'toolbag';
  if (a.b === 4 || (ar === 'executive' && r(18) < 0.35) || (ar === 'socialite' && r(18) < 0.5) || (police && r(18) < 0.45) || (ar === 'hustler' && r(18) < 0.55)) out.glasses = 'sun';
  else if ((ar === 'senior' && r(18) < 0.6) || r(18) < 0.06) out.glasses = 'round';
  if (a.bandana) out.bandana = ar === 'syndicate' && a.htc && lumOf(a.htc) > 0.2 ? a.htc : '#c8262b';
  if (ar === 'mugger' && !out.bandana && r(19) < 0.22) { out.mask = true; if (out.hat && out.hat.kind !== 'hood') out.hat = { kind: 'beanie', color: '#1a1a1e' }; }
  if (ar === 'syndicate' || ar === 'hustler' || (ar === 'player' && t === 7)) out.chain = true;
  if ((ar === 'syndicate' && r(20) < 0.6) || (ar === 'construction' && r(20) < 0.25) || ((ar === 'casual' || ar === 'player') && r(20) < 0.08)) out.tattoo = true;
  if (swat) { out.gloves = '#1a1a1e'; out.hat = { kind: 'helmet', color: '#1e2024' }; }
  else if (medic) out.gloves = '#5a8ad8';
  else if (ar === 'construction' && r(21) < 0.5) out.gloves = '#c8a050';
  if (!out.carry && !swat && !police) {
    const q = r(22);
    if (ar === 'casual' || ar === 'player') { if (q < 0.16 && ar === 'casual') out.carry = pick(['coffee', 'phone', 'shopping', 'bag', 'phone'], 23); else if (q < 0.34) out.back = 'backpack'; }
    else if (ar === 'athlete' && q < 0.3) out.carry = 'phone';
    else if (ar === 'senior' && q < 0.35) out.carry = 'cane';
    else if (ar === 'drunk' && q < 0.6) out.carry = 'bottle';
    else if (ar === 'executive' && q < 0.2) out.carry = 'coffee';
    else if (ar === 'socialite' && q < 0.4) out.carry = 'shopping';
  }
  // the country folk (server/entities.js): hikers with packs, campers in flannel and beanies, farmers in
  // flannel, jeans and work boots, desert nomads in a long coat, bandana and shades
  if (ar === 'hiker') {
    out.back = 'backpack'; out.shoeKind = 'boot'; out.carry = undefined;
    top.kind = pick(['tee', 'jacket', 'flannel', 'tee'], 30);
    out.bottom.kind = pick(['shorts', 'cargo', 'cargo'], 31);
    if (out.hat) out.hat.kind = pick(['bucket', 'cap', 'bucket'], 32);
  } else if (ar === 'camper') {
    out.shoeKind = 'boot';
    top.kind = pick(['flannel', 'hoodie', 'flannel', 'jacket'], 30);
    if (top.kind === 'flannel') top.color2 = 'white';
    if (top.kind === 'jacket') top.color2 = 'charcoal';
    if (r(31) < 0.35) out.carry = 'coffee';
  } else if (ar === 'farmer') {
    if (r(30) < 0.5) Object.assign(top, { kind: 'overalls', color: '#3a5a8a', color2: tc }); // bib overalls over the shirt
    else Object.assign(top, { kind: 'flannel', color2: 'white' });
    out.bottom.kind = top.kind === 'overalls' ? 'pants' : 'jeans'; if (top.kind === 'overalls') out.bottom.color = '#3a5a8a';
    out.shoeKind = 'boot';
    if (out.hat) out.hat.kind = fem ? 'sunhat' : pick(['cowboy', 'trucker', 'cowboy', 'cap'], 32);
    if (r(33) < 0.45) out.gloves = '#c8a050';
  } else if (ar === 'nomad') {
    top.kind = pick(['coat', 'vest'], 30); top.color2 = '#5a4a3a';
    out.bottom.kind = 'cargo'; out.shoeKind = 'boot'; out.glasses = 'sun';
    if (!out.bandana && r(34) < 0.6) out.bandana = '#8a3a2e';
    if (out.hat) out.hat.kind = fem ? 'sunhat' : pick(['cowboy', 'bucket'], 32);
  }
  if (out.back) out.backColor = pick(['navy', 'charcoal', '#8a3a2e', '#2e5a38', 'brown', 'black'], 24);
  return out;
}

// ---- keys and sprites --------------------------------------------------------------------------------------------------
const KEYS = new WeakMap();
function art2Key(A) {
  let k = KEYS.get(A);
  if (k) return k;
  const parts = [];
  for (const f of ['seed', 'skin', 'fem', 'build', 'body', 'hair', 'beard', 'top', 'bottom', 'shoes', 'shoeKind', 'hat', 'glasses', 'mask', 'bandana', 'chain', 'carry', 'held', 'back', 'backColor', 'gloves', 'tattoo', 'censored', 'pet']) {
    const v = A[f];
    if (v === undefined || v === null || v === false) continue;
    parts.push(f + ':' + (typeof v === 'object' ? Object.keys(v).sort().map((q) => q + '=' + v[q]).join(',') : v));
  }
  k = parts.join(';');
  KEYS.set(A, k);
  return k;
}
export function appKey(app, opt = {}) {
  if (isServer(app)) return 'S' + [app.s, app.h, app.hc, app.t, app.tc, app.tc2, app.l, app.sh, app.ht, app.htc, app.b, app.bd, app.bandana ? 1 : 0, opt.ar || app.ar || '', opt.censored ? 1 : 0].join(',');
  return art2Key(app || {});
}
const normPose = (p) => (p && p.startsWith('move') ? 'walk' + (p[4] || '0') : p || 'idle');
export function pedKey(app, pose, dir8, frame, weapon, opt = {}) {
  const pn = normPose(pose), n = PED_POSES[pn] || 1;
  return `${appKey(app, opt)}|${pn}|${((dir8 | 0) % 8 + 8) % 8}|${(((frame | 0) % n) + n) % n}|${weaponItem(weapon) || ''}`;
}
export function pedSprite(app, pose, dir8, frame, weapon, opt = {}) {
  const A = isServer(app) ? adaptApp(app, opt.ar || app.ar, opt) : app || {};
  const d = ((8 - (dir8 | 0)) % 8 + 8) % 8;
  const k = weaponItem(weapon);
  return person(A, d, normPose(pose), frame | 0, k ? { held: k, tight: true } : { tight: true });
}
