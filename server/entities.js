// Entity factories and NPC archetype registry (GDD §10 Dynamic NPC Demographic Grid).
import { K, PED_RADIUS } from '../shared/constants.js';
import { VEHICLES, PAINTS } from '../shared/vehicles.js';
import { CRATE_TIERS, bagTier } from '../shared/items.js';
import { newPedState } from '../shared/physics.js';

export const SKINS = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a'];
const HAIR = ['#1a1410', '#3b2414', '#6b3e1e', '#b5862f', '#d9c27a', '#8a8a8a', '#e8e8e8', '#7a1d1d'];

// Archetypes: appearance generator + behaviour stats.
export const ARCHETYPES = {
  executive:    { reflex: 0.35, fight: 0.3, speed: 1.0, hp: 100, cash: [40, 160], item: ['bonds', 0.35], day: 10, night: 3,
    look: (r) => ({ t: 1, tc: pickA(r, ['#1d2a4a', '#2a2a2e', '#4a4a52']), tc2: '#c8262b', l: '#1d2030', sh: '#111', ht: 0, b: 1 }) },
  socialite:    { reflex: 0.4, fight: 0.15, speed: 1.0, hp: 90, cash: [30, 120], item: ['jewelry', 0.35], day: 8, night: 6,
    look: (r) => ({ t: 5, tc: pickA(r, ['#c8262b', '#7a3ac8', '#e04a9a', '#f2c21b']), tc2: '#ffd36b', l: '#000', sh: '#c8262b', ht: 0, b: 2 }) },
  construction: { reflex: 0.5, fight: 0.65, speed: 0.95, hp: 120, cash: [10, 50], item: ['scrap', 0.4], day: 9, night: 1,
    look: (r) => ({ t: 3, tc: pickA(r, ['#ef7a1a', '#b8e02a']), tc2: '#e8e8e8', l: '#2a4a8a', sh: '#6b4a2a', ht: 2, htc: pickA(r, ['#f2c21b', '#f4f4f4']), b: 3 }) },
  sweeper:      { reflex: 0.4, fight: 0.4, speed: 0.85, hp: 100, cash: [5, 30], item: ['wallet', 0.2], day: 5, night: 1,
    look: () => ({ t: 6, tc: '#ef7a1a', tc2: '#1d2a5a', l: '#1d2a5a', sh: '#222', ht: 1, htc: '#1d2a5a', b: 0 }) },
  casual:       { reflex: 0.55, fight: 0.45, speed: 1.0, hp: 100, cash: [10, 80], item: ['wallet', 0.15], day: 14, night: 6,
    look: (r) => ({ t: pickA(r, [0, 2, 4]), tc: pickA(r, ['#c8262b', '#2350c8', '#e8e8e8', '#2f9a3a', '#7a3ac8', '#25b8c0', '#555']), tc2: '#ddd', l: pickA(r, ['#2a4a8a', '#222', '#6b5a3a']), sh: pickA(r, ['#eee', '#222', '#c8262b']), ht: r() < 0.35 ? 1 : 0, htc: pickA(r, ['#c8262b', '#222', '#2350c8']), b: 0 }) },
  athlete:      { reflex: 0.8, fight: 0.6, speed: 1.15, hp: 110, cash: [5, 40], item: null, day: 5, night: 2,
    look: (r) => ({ t: 0, tc: pickA(r, ['#e8e8e8', '#c8262b', '#2350c8']), tc2: '#fff', l: '#111', sh: '#eee', ht: 0, b: 0 }) },
  senior:       { reflex: 0.12, fight: 0.15, speed: 0.7, hp: 70, cash: [20, 90], item: ['wallet', 0.3], day: 5, night: 1,
    look: (r) => ({ t: 4, tc: pickA(r, ['#8a6a3a', '#5a6a5a', '#6a5a7a']), tc2: '#ccc', l: '#555', sh: '#3a2a1a', ht: r() < 0.5 ? 3 : 0, htc: '#6b4a2a', b: 0, hairColor: '#cfcfcf' }) },
  hustler:      { reflex: 0.5, fight: 0.75, speed: 1.05, hp: 100, cash: [40, 200], item: ['purse', 0.15], day: 2, night: 8,
    look: (r) => ({ t: 7, tc: pickA(r, ['#e8dcc0', '#7a3ac8']), tc2: '#f2c21b', l: '#222', sh: '#eee', ht: r() < 0.5 ? 1 : 0, htc: '#7a3ac8', b: 0 }) },
  drunk:        { reflex: 0.05, fight: 0.2, speed: 0.6, hp: 80, cash: [0, 25], item: null, day: 1, night: 4, sway: true,
    look: (r) => ({ t: 4, tc: pickA(r, ['#4a5a3a', '#7a1d24', '#6b5a3a']), tc2: '#aaa', l: '#2a4a8a', sh: '#3a2a1a', ht: r() < 0.5 ? 4 : 0, htc: '#3a5a2a', b: 0 }) },
  syndicate:    { reflex: 0.6, fight: 1.0, speed: 1.05, hp: 130, cash: [60, 220], item: null, armed: 'pistol', gang: true, day: 0, night: 0,
    look: (r) => ({ t: 3, tc: '#1a1a1e', tc2: '#c8262b', l: '#1a1a1e', sh: '#eee', ht: 1, htc: pickA(r, ['#c8262b', '#111']), b: 0, bandana: true }) },
  mugger:       { reflex: 0.6, fight: 0.7, speed: 1.2, hp: 90, cash: [20, 60], item: null, day: 0, night: 0,
    look: () => ({ t: 2, tc: '#2a2a2e', tc2: '#555', l: '#222', sh: '#eee', ht: 1, htc: '#111', b: 0 }) },
  cop:          { reflex: 0.6, fight: 1.0, speed: 1.1, hp: 140, cash: [0, 0], item: null, day: 0, night: 0,
    look: () => ({ t: 6, tc: '#1d2a5a', tc2: '#f2c21b', l: '#1d2a5a', sh: '#111', ht: 1, htc: '#1d2a5a', b: 0 }) },
  swat:         { reflex: 0.6, fight: 1.0, speed: 1.0, hp: 220, cash: [0, 0], item: null, day: 0, night: 0,
    look: () => ({ t: 3, tc: '#151517', tc2: '#333', l: '#151517', sh: '#111', ht: 5, htc: '#151517', b: 0 }) },
  medic:        { reflex: 0.6, fight: 0.0, speed: 1.15, hp: 120, cash: [0, 0], item: null, day: 0, night: 0,
    look: () => ({ t: 6, tc: '#e8e8e8', tc2: '#2350c8', l: '#1d2a5a', sh: '#111', ht: 1, htc: '#2350c8', b: 0 }) },
};

function pickA(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

export function makeAppearance(r, archetype) {
  const a = ARCHETYPES[archetype] || ARCHETYPES.casual;
  const base = { s: Math.floor(r() * SKINS.length), h: Math.floor(r() * 6), hc: pickA(r, HAIR) };
  const look = a.look(r);
  if (look.hairColor) { base.hc = look.hairColor; delete look.hairColor; }
  return { ...base, ...look };
}

export function playerOutfit(r) {
  const tops = [0, 2, 4, 7, 3];
  return {
    s: Math.floor(r() * SKINS.length), h: Math.floor(r() * 6), hc: pickA(r, HAIR),
    t: pickA(r, tops), tc: pickA(r, ['#c8262b', '#2350c8', '#2f9a3a', '#f2c21b', '#7a3ac8', '#e8e8e8', '#25b8c0', '#ef7a1a', '#2a2a2e']),
    tc2: pickA(r, ['#fff', '#111', '#f2c21b']), l: pickA(r, ['#2a4a8a', '#222', '#6b5a3a', '#4a4a52']),
    sh: pickA(r, ['#eee', '#222', '#c8262b']), ht: r() < 0.4 ? 1 : 0, htc: pickA(r, ['#c8262b', '#111', '#2350c8', '#f2c21b']), b: 0,
  };
}

export function createPed(id, x, y, opts = {}) {
  const st = newPedState(x, y);
  return {
    id, kind: K.PED, ...st,
    a: opts.a || 0,
    r: PED_RADIUS,
    hp: opts.hp || 100, maxHp: opts.hp || 100,
    dead: false, deadAt: 0, downUntil: 0, stunUntil: 0, bleeding: false,
    player: null, npc: null,
    vehId: 0, seat: -1, carrying: 0,
    weapon: opts.weapon || 'fists',
    ammo: {}, mag: {},
    nextAttack: 0, reloadUntil: 0, attackAnimUntil: 0, aimUntil: 0,
    app: opts.app || null, archetype: opts.archetype || 'casual', name: opts.name || '',
    flareUntil: 0, aggressors: new Map(),
    buffs: {}, lastStepX: x, lastStepY: y, footAcc: 0, bloodyFeet: 0,
    fishing: null, umbrella: false,
    lastHitBy: 0, lastHitAt: 0, lastCombatAt: 0,
    cx: -1, cy: -1,
  };
}

export function createVehicle(id, model, x, y, a, opts = {}) {
  const def = VEHICLES[model];
  return {
    id, kind: K.VEH, model, def,
    x, y, a, vx: 0, vy: 0, av: 0,
    hp: def.hp, seats: new Array(def.seats).fill(0), cargo: new Array(def.slots.length).fill(0),
    paint: opts.paint ?? Math.floor(Math.random() * PAINTS.length),
    variant: opts.variant ?? Math.floor(Math.random() * 1000),
    owner: opts.owner || null, ownerName: opts.ownerName || null,
    npcOwned: opts.npcOwned ?? true,
    lights: false, siren: false, sirenOn: false, hornUntil: 0, brake: false, reverse: false, drift: false,
    wreckAt: 0, burnUntil: 0, bloody: false, lastDriver: 0, lastImpact: 0,
    ai: null, parked: !!opts.parked, despawnable: opts.despawnable ?? true,
    input: { throttle: 0, steer: 0, hb: false },
    cx: -1, cy: -1,
  };
}

export function createCrate(id, tier, x, y, opts = {}) {
  const t = CRATE_TIERS[tier];
  const value = opts.value ?? Math.round(t.min + Math.random() * (t.max - t.min));
  return {
    id, kind: K.CRATE, tier, value, x, y, a: 0, vx: 0, vy: 0, z: 0, vz: 0,
    state: 'ground', parent: 0, slot: 0,
    owner: opts.owner || null, contraband: opts.contraband ?? t.contraband,
    label: opts.label || '', job: opts.job || null, created: opts.now || 0,
    expires: opts.expires || 0,
    cx: -1, cy: -1,
  };
}

export function createBag(id, x, y, contents, now, ownerName = '') {
  const value = contents.cash + (contents.itemValue || 0);
  return {
    id, kind: K.BAG, x, y, a: Math.random() * 6.28,
    cash: contents.cash, items: contents.items || {}, weapons: contents.weapons || {},
    value, tier: bagTier(value), expires: now + 300, ownerName,
    cx: -1, cy: -1,
  };
}

export function createProjectile(id, owner, x, y, a, speed, maxDist, weapon) {
  return { id, kind: K.PROJ, owner, x, y, a, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dist: 0, maxDist, weapon, cx: -1, cy: -1 };
}
