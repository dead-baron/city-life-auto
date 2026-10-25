// The cinematic mode (the owner, 2026-10-22: "an option to disable UI, and any other cinematic options ... so I can take
// some really strong video capture and screenshots of gameplay"). Loaded the first time it's asked for (main.js cine:
// F2, F4, F8, or the pause menu's "Cinematic mode"). Everything here is this screen's only - nobody else's game changes,
// except the staged scenes, which run the debug menu's commands (dev mode).
//   F2  the clean screen: no HUD, no prompts or notes, no marks, labels, sights or touch buttons - just the world
//   F4  the panel: the camera, the zoom, the time of day and the weather (on your screen), letterbox bars, hiding your
//       own character, the shake, the cinematic tour, the staged scenes, a picture
//   F8  a picture of the screen as it is, clean (a PNG download)
// The cameras: Follow (the game's own), Smooth (it lags behind you like a camera operator's, the amount on a slider),
// Drone (free: WASD / arrows / the left stick to fly it, Q / E or - / = to zoom, Shift faster, Esc back to you), On
// someone (the camera on a person or a vehicle near you - [ and ] for the next and the one before), the Tour (it glides
// through the world's sights on its own, cutting from one to the next through black).
// The owner, 10-24: "more controls for the camera like choosing which direction the camera drifts at and the speed it
// drifts at" and "automatic scenes that has the camera follow NPCs ... so I can take some cinematic shots of everything":
//   Drift: its direction (8 ways, or any angle on the dial - drag it; WASD / arrows / the left stick steer it), its speed
//     (off, crawl .. fast: Z / X, LB / RB), the zoom (Q / E, LT / RT). The bar of its controls along the bottom hides with
//     the clean screen and comes back for a few seconds when you press something, move the mouse or touch the screen.
//   Follow scenes: the camera on someone doing something - a police chase, a street race, an angler, a surfer, a combine
//     harvesting, a train, a plane landing (shared/cinekinds.js), or the tour of them all. The server picks who
//     (server/systems/cinefollow.js) and moves on when it's over; the camera here follows them, leading the way they go,
//     the framing changing now and then. N / A the next one, [ ] / LB RB the kind, T the tour.
// main.js asks it each frame: holds() (the keys are the camera's), cam(cam, dt, tx, ty), zoomK, lt (the time of day's
// loop time or null), wx (null | 'clear' | 'rain' | 'fog'), sky(sky), hideMe, clean, eye() (where the camera is, when
// it's off you: the world's window follows it); key(k, down), pad(axes), follow(msg) (the server's { t: 'cinef' }).
import { DAY_LOOP_S, DAY_PART_S, K } from '../shared/constants.js';
import { CINE_KINDS, CINE_KIND } from '../shared/cinekinds.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';

const ZOOMS = [0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1];
const TIMES = [['Live', null], ['Dawn', 390], ['Morning', 540], ['Noon', 720], ['Afternoon', 930], ['Golden hour', 1125], ['Dusk', 1205], ['Night', 1380], ['Small hours', 180]];
const WXS = [['Live', null], ['Clear', 'clear'], ['Rain', 'rain'], ['Fog', 'fog'], ['Mist', 'mist']];
const BOXES = [['Off', 0], ['2.39:1', 2.39], ['1.85:1', 1.85]];
const SHOT_S = 10, FADE_S = 0.7, HOLD_S = 1.6;   // the tour: each shot, the fade either side, the black while the art comes in

// ---- the drift: which way and how fast (world px a second at the zoom of 1: further in, slower across the world) ----
export const DRIFT_SPEEDS = [0, 10, 22, 45, 90, 170];
export const DRIFT_NAMES = ['Off', 'Crawl', 'Slow', 'Steady', 'Quick', 'Fast'];
const Q8 = Math.PI / 4;
export const DIRS8 = [['↑', -2 * Q8], ['↗', -Q8], ['→', 0], ['↘', Q8], ['↓', 2 * Q8], ['↙', 3 * Q8], ['←', 4 * Q8], ['↖', -3 * Q8]];
const wrapA = (a) => { a %= 2 * Math.PI; if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a; };
// the way the held keys point (WASD / arrows, diagonals too), or null
export function keyDir(keys) {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  return x || y ? Math.atan2(y, x) : null;
}
// the way a stick points, pushed past halfway, or null
export const stickDir = (ax) => (ax && Math.hypot(ax.lx || 0, ax.ly || 0) > 0.5 ? Math.atan2(ax.ly, ax.lx) : null);
// one step of the drift: d = { x, y, a (its way), si (its speed), vx, vy (as it goes: easing to a new speed or way) };
// want: the way it's steered to (null: as it is) - turning toward it at TURN rad/s
const TURN = 2.2;
export function driftStep(d, dt, zoom = 1, want = null) {
  if (want !== null) { const da = wrapA(want - d.a), st = TURN * dt; d.a = wrapA(d.a + Math.max(-st, Math.min(st, da))); }
  const sp = DRIFT_SPEEDS[d.si] / Math.max(0.3, zoom), k = 1 - Math.exp(-1.6 * dt);
  d.vx += (Math.cos(d.a) * sp - d.vx) * k; d.vy += (Math.sin(d.a) * sp - d.vy) * k;
  d.x += d.vx * dt; d.y += d.vy * dt;
  return d;
}

// ---- the follow scenes' camera: on whoever the server says, leading the way they go, the framing changing now and then
// (zk: the zoom on the kind's own, lead: how far ahead, side: off to one side of their way)
export const FRAMES = [{ zk: 1, lead: 1, side: 0 }, { zk: 0.8, lead: 0.7, side: 0 }, { zk: 1.3, lead: 0.45, side: 0 }, { zk: 1, lead: 1.15, side: 0.45 }, { zk: 1.1, lead: 0.85, side: -0.45 }, { zk: 0.9, lead: 0.3, side: 0 }];
const LEAD_S = 0.6, LEAD_MAX = 380, FRAME_S = [9, 16];
// one step: f = { x, y, vx, vy (theirs, as seen), px, py (where they were), fi (the framing), lead, side, zk (eased) };
// (ex, ey): where they are now
export function followStep(f, ex, ey, dt) {
  if (f.px === null) { f.px = ex; f.py = ey; }
  const k = 1 - Math.exp(-2 * dt), ivx = dt > 0 ? (ex - f.px) / dt : 0, ivy = dt > 0 ? (ey - f.py) / dt : 0;
  if (Math.hypot(ivx, ivy) < 3000) { f.vx += (ivx - f.vx) * k; f.vy += (ivy - f.vy) * k; }   // (not a jump: a teleport, a new subject)
  f.px = ex; f.py = ey;
  const F = FRAMES[f.fi], e = 1 - Math.exp(-0.7 * dt);
  f.lead += (F.lead - f.lead) * e; f.side += (F.side - f.side) * e; f.zk += (F.zk - f.zk) * e;
  const sp = Math.hypot(f.vx, f.vy), L = Math.min(LEAD_MAX, sp * LEAD_S * f.lead), ux = sp > 1 ? f.vx / sp : 0, uy = sp > 1 ? f.vy / sp : 0;
  const S2 = Math.min(160, sp * 0.3) * f.side;
  const tx = ex + ux * L - uy * S2, ty = ey + uy * L + ux * S2, c = 1 - Math.exp(-2.4 * dt);
  f.x += (tx - f.x) * c; f.y += (ty - f.y) * c;
  return f;
}

// minutes after midnight -> the chrono loop's seconds (as server/dev.js 'time')
export function loopOf(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return m >= 360 && m < 1200 ? (m - 360) / 840 * DAY_PART_S : DAY_PART_S + (((m - 1200 + 1440) % 1440) / 600) * (DAY_LOOP_S - DAY_PART_S);
}

// The staged scenes (the owner, 10-22: "setup staged scenarios on all the [things] I talked about"): each a run of the
// debug menu's commands (server/dev.js; '@' ones are this screen's), a pause before each (ms: a teleport lands, the art
// comes in), then the camera the scene wants. t: the time of day on your screen (minutes), or a server time (st: everyone's
// clock - the drive-in's shows and the clubs only open after dark there).
export const SCENES = [
  { g: 'Action', n: 'Police chase downtown', s: [[0, 'place', { n: 'Downtown' }], [2500, 'car', { m: 'sports', in: 1 }], [1500, 'wanted', { n: 3 }]], cam: 'smooth', z: 0.85, note: 'you at the wheel, three stars: drive' },
  { g: 'Action', n: 'Cops chasing a getaway car', s: [[0, 'place', { n: 'Midtown' }], [2500, 'street', { k: 'chase' }]], cam: 'smooth', z: 0.8 },
  { g: 'Action', n: 'Street race on the Neon Strip at night', s: [[0, 'place', { n: 'Neon Strip' }], [2500, 'street', { k: 'race' }]], t: 1380, cam: 'smooth', z: 0.8 },
  { g: 'Action', n: 'Armored truck run', s: [[0, 'place', { n: 'Downtown' }], [2500, 'street', { k: 'armored' }]], cam: 'smooth', z: 0.85 },
  { g: 'Action', n: 'Gang shootout in The Yards', s: [[0, 'place', { n: 'The Yards' }], [2500, 'guns', {}], [600, 'godp', {}], [600, 'shootout', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Action', n: 'A tanker goes up by a row of cars', s: [[0, 'place', { n: 'Westport Center' }], [2500, 'blast', { k: 'row' }]], cam: 'follow', z: 0.85 },   // (Port Westport's middle is the container stacks: no room for the row)
  { g: 'Action', n: 'A street fight the police break up', s: [[0, 'place', { n: 'Old Town' }], [2500, 'happen', { k: 'fight', cops: 1 }]], cam: 'smooth', z: 1.2 },
  { g: 'Action', n: 'A tank on the boulevard', s: [[0, 'place', { n: 'Midtown' }], [2500, 'car', { m: 'tank', in: 1 }]], cam: 'smooth', z: 0.85 },
  { g: 'Vehicles', n: 'Helicopter over the city at golden hour', s: [[0, 'near', { k: 'helipad' }], [2500, 'car', { m: 'heli', in: 1 }]], t: 1125, cam: 'smooth', z: 0.8, note: 'take off and fly over downtown' },
  { g: 'Vehicles', n: 'A plane takes off', s: [[0, 'near', { k: 'runway' }], [2500, 'car', { m: 'plane', in: 1 }]], t: 540, cam: 'smooth', z: 0.75 },
  { g: 'Vehicles', n: 'Speedboat across the bay', s: [[0, 'near', { k: 'marina' }], [2500, 'car', { m: 'speedboat', in: 1 }]], t: 930, cam: 'smooth', z: 0.85 },
  { g: 'Vehicles', n: 'Jet ski at the race start', s: [[0, 'near', { k: 'race' }], [2500, 'car', { m: 'jetski', in: 1 }]], cam: 'smooth', z: 1 },
  { g: 'Vehicles', n: 'Off-road in the red rock desert', s: [[0, 'place', { n: 'Red Rock Desert' }], [2500, 'car', { m: 'pickup', in: 1 }]], t: 1125, cam: 'smooth', z: 0.85 },
  { g: 'Vehicles', n: 'Dirt bike at the MX park', s: [[0, 'near', { k: 'raceway' }], [2500, 'car', { m: 'dirtbike', in: 1 }]], cam: 'smooth', z: 1 },
  { g: 'Vehicles', n: 'Motorbike through the peaks', s: [[0, 'place', { n: 'Granite Peaks' }], [2500, 'car', { m: 'tourer', in: 1 }]], t: 1125, cam: 'smooth', z: 0.9 },
  { g: 'Vehicles', n: 'Horseback across the farm valley', s: [[0, 'near', { k: 'farm' }], [2500, 'car', { m: 'horse', in: 1 }]], t: 1125, cam: 'smooth', z: 1.1, note: 'Shift to gallop' },
  { g: 'Police', n: 'On patrol in a cruiser', s: [[0, 'place', { n: 'Civic Center' }], [2500, 'cop', {}]], cam: 'smooth', z: 0.9, note: 'on duty, at the wheel of your cruiser' },
  { g: 'Police', n: 'Police helicopter', s: [[0, 'near', { k: 'helipad' }], [2500, 'cop', {}], [600, 'car', { m: 'policeheli', in: 1 }]], t: 1380, cam: 'smooth', z: 0.8 },
  { g: 'Police', n: 'Bounty hunter on a contract', s: [[0, 'hunter', {}], [600, 'bounty', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Taxi fare', s: [[0, 'place', { n: 'Midtown' }], [2500, 'cabjob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Ambulance call', s: [[0, 'near', { k: 'hospital' }], [2500, 'medicjob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Firefighting', s: [[0, 'firejob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Search and rescue', s: [[0, 'sar', {}]], cam: 'smooth', z: 0.85 },
  { g: 'Jobs', n: 'Coast guard', s: [[0, 'coast', {}]], cam: 'smooth', z: 0.85 },
  { g: 'Jobs', n: 'Crop dusting', s: [[0, 'near', { k: 'farm' }], [2500, 'car', { m: 'duster', in: 1 }]], t: 540, cam: 'smooth', z: 0.8 },
  { g: 'Jobs', n: 'Tow truck', s: [[0, 'towjob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Bus route', s: [[0, 'busjob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Harvest with the combine', s: [[0, 'near', { k: 'farm' }], [2500, 'car', { m: 'combine', in: 1 }]], t: 1125, cam: 'smooth', z: 0.9 },
  { g: 'Crime', n: 'The mail train (rob it)', s: [[0, 'train', { mail: 1 }]], cam: 'smooth', z: 0.85 },
  { g: 'Crime', n: 'A bank vault (the drill)', s: [[0, 'near', { k: 'vault' }]], cam: 'follow', z: 1.2 },
  { g: 'Crime', n: 'A mugging on the street', s: [[0, 'place', { n: 'Southside' }], [2500, 'snatch', {}]], cam: 'smooth', z: 1.1 },
  { g: 'Life', n: 'At home', s: [[0, 'homein', { kind: 'house' }]], cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'The garden', s: [[0, 'garden', {}]], cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'Fishing a river at dawn', s: [[0, 'fish', { k: 'go', w: 'river' }]], t: 390, cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'Fishing out at sea', s: [[0, 'fish', { k: 'boat' }]], t: 1125, cam: 'smooth', z: 1 },
  { g: 'Life', n: 'Hunting: wolves run down a deer', s: [[0, 'place', { n: 'Highland Woods' }], [2500, 'animal', { scene: 'wolves' }]], cam: 'follow', z: 0.9 },
  { g: 'Life', n: 'Wildlife: a bear fishing', s: [[0, 'place', { n: 'Pine Lake' }], [2500, 'animal', { scene: 'bear' }]], cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'Wildlife: an eagle takes a rabbit', s: [[0, 'place', { n: 'Willow Valley' }], [2500, 'animal', { scene: 'eagle' }]], cam: 'follow', z: 1 },
  { g: 'Life', n: 'The drive-in after dark', s: [[0, 'time', { m: 1195 }], [400, 'near', { k: 'drivein' }]], st: 1, cam: 'follow', z: 0.85, note: 'sets everyone\'s clock to dusk' },
  { g: 'Life', n: 'A night at the casino', s: [[0, 'near', { k: 'casino' }]], t: 1380, cam: 'follow', z: 1 },
  { g: 'Life', n: 'Dancing at a club', s: [[0, 'time', { m: 1380 }], [400, 'near', { k: 'club' }]], st: 1, cam: 'follow', z: 1.2, note: 'sets everyone\'s clock to night' },
  { g: 'Fun', n: 'A skate session', s: [[0, 'skate', { k: 'spot' }], [2500, 'act', { k: 'skaters' }]], cam: 'smooth', z: 1.2 },
  { g: 'Fun', n: 'Surfing a break', s: [[0, 'near', { k: 'surf' }]], t: 1125, cam: 'smooth', z: 1.1 },
  { g: 'Fun', n: 'Soccer on the pitch', s: [[0, 'near', { k: 'venue' }]], cam: 'follow', z: 0.9 },
  { g: 'Fun', n: 'Bowling', s: [[0, 'near', { k: 'bowling' }]], cam: 'follow', z: 1.2 },
  { g: 'Fun', n: 'The arcade', s: [[0, 'near', { k: 'arcade' }]], cam: 'follow', z: 1.2 },
  { g: 'Fun', n: 'Golf at Lakeside Greens', s: [[0, 'place', { n: 'Lakeside Greens' }]], t: 930, cam: 'follow', z: 0.9 },
  { g: 'Fun', n: 'The pier and the Ferris wheel', s: [[0, 'place', { n: 'Sunset Beach Pier' }]], t: 1125, cam: 'follow', z: 0.9 },
  { g: 'Fun', n: 'The balloon field', s: [[0, 'place', { n: 'Dry Creek Balloon Field' }]], t: 450, cam: 'follow', z: 0.85 },
  { g: 'Exploring', n: 'Cave exploring', s: [[0, 'ug', { k: 'cave' }]], cam: 'follow', z: 1.2 },
  { g: 'Exploring', n: 'The river kayak run', s: [[0, 'place', { n: 'Redwood River Run' }]], cam: 'smooth', z: 1 },
  { g: 'Exploring', n: 'Riding the subway', s: [[0, 'train', { sub: 1 }]], cam: 'follow', z: 1 },
  { g: 'Exploring', n: 'Riding the main line', s: [[0, 'train', {}]], t: 1125, cam: 'follow', z: 0.85 },
  { g: 'People', n: 'Chess in the park, watchers round', s: [[0, 'act', { k: 'chess' }]], cam: 'follow', z: 1.45 },
  { g: 'People', n: 'A picnic', s: [[0, 'act', { k: 'picnic' }]], cam: 'follow', z: 1.45 },
  { g: 'People', n: 'A busker on the street', s: [[0, 'persona', { k: 'busker' }]], cam: 'follow', z: 1.45 },
  { g: 'People', n: 'Someone collapses: help them', s: [[0, 'happen', { k: 'faint' }]], cam: 'follow', z: 1.2 },
  { g: 'Weather', n: 'A thunderstorm', s: [[0, 'rain', { s: 600 }], [300, '@storm', { mood: 3 }]], st: 1, cam: 'smooth', z: 0.8, note: 'rain for everyone for ten minutes' },
  { g: 'Weather', n: 'Fog rolling over the valley', s: [[0, 'place', { n: 'Willow Valley' }]], t: 450, wx: 'fog', cam: 'drift', z: 0.75 },
  { g: 'Weather', n: 'The sea sparkling at night', s: [[0, 'near', { k: 'surf' }], [300, '@bio', { k: 1 }]], t: 1380, cam: 'drift', z: 0.8 },
];

export function makeDirector(S, api) {
  const D = { clean: false, mode: 'follow', zoomK: 1, zi: 3, lt: null, ti: 0, wx: null, wi: 0, box: 0, bi: 0, hideMe: false, noShake: true, smooth: 0.55, hideNames: true };
  const keys = new Set();
  let axes = null, panel = null, shown = false, x = 0, y = 0, inited = false, target = 0, tour = null, scene = null;
  // the drift (its way and speed kept from one drift to the next), the follow scenes (fs: the server's subject - id, k,
  // n, z, tour; cam: the camera on them; hold: black until they're here and the art's in; near: near you or anywhere)
  const dr = { x: 0, y: 0, a: -Math.PI / 6, si: 2, vx: 0, vy: 0 };
  let fs = null, fcam = null, near = true, frameAt = 0, missing = 0, padZoomAt = 0, wokeAt = -1e9, bar = null, barKey = '';
  D.holds = () => D.mode === 'drone' || D.mode === 'tour' || D.mode === 'drift' || D.mode === 'scene';
  D.eye = () => (D.mode === 'follow' || D.mode === 'smooth' || !inited ? null : { x, y });
  // the server's idle clock (players.js idleCheck): the camera flown or the panel used is someone there ({ t: 'cine' }, at
  // most every 20 s); the tour running on by itself is like riding a train ({ t: 'cine', tour: 1 } a minute: the clock
  // runs slow - the owner, 10-23, "riding the train for 10 minutes kicked me out for idling")
  let hereAt = -1e9, tourAt = -1e9;
  const here = () => { const t = performance.now(); if (t - hereAt > 20e3) { hereAt = t; api.send({ t: 'cine' }); } };

  // ---- the page's own bits: the clean screen's rule, the bars, the fade ----
  const css = document.createElement('style');
  css.textContent = `body.cine-clean #hud > :not(#hints), body.cine-clean #touch, body.cine-clean #wheel, body.cine-clean #menu, body.cine-clean #toasts { display: none !important; }
body.cine-clean #view, body.cine-clean #world { cursor: none; }
.cine-bar { position: fixed; left: 0; right: 0; height: 0; background: var(--ink); z-index: 60; pointer-events: none; transition: height .5s ease; }
#cine-fade { position: fixed; inset: 0; background: var(--ink); opacity: 0; z-index: 61; pointer-events: none; transition: opacity .6s ease; }
#cine-panel { position: fixed; right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); width: 290px; max-height: calc(100vh - 24px - env(safe-area-inset-top, 0px)); overflow: auto; z-index: 70; padding: 10px var(--s3); background: var(--panel-bg); color: var(--cream); font: 600 var(--fs-2)/1.35 var(--ui); border: 2px solid var(--gold); border-radius: var(--r2); box-shadow: var(--shadow); animation: enter var(--t2) var(--ease); }
#cine-panel h3 { margin: var(--s3) 0 var(--s1); font: 700 var(--fs-1) var(--pixel); letter-spacing: .08em; text-transform: uppercase; color: var(--gold); }
#cine-panel .row { display: flex; flex-wrap: wrap; gap: var(--s1); }
#cine-panel button, #cine-ctl button { min-height: 32px; min-width: 32px; padding: 0 var(--s2); background: var(--navy2); color: var(--cream); border: 1px solid var(--edge); border-radius: var(--r1); font: inherit; cursor: pointer; transition: background var(--t1) var(--ease); }
#cine-panel button:hover, #cine-ctl button:hover { border-color: var(--gold); }
#cine-panel button.on, #cine-ctl button.on { background: var(--gold); color: var(--ink); border-color: var(--gold); }
#cine-panel .sc { display: block; width: 100%; text-align: left; margin: 2px 0; }
#cine-panel .sc small, #cine-panel .tip { color: var(--dim); }
#cine-panel .tip { margin: 6px 0 0; }
#cine-panel input[type=range] { width: 100%; }
#cine-ctl { position: fixed; left: 50%; bottom: max(14px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 69; display: none; align-items: center; gap: var(--s2); max-width: calc(100vw - 32px); flex-wrap: wrap; justify-content: center; padding: 7px 10px; background: var(--glass); color: var(--cream); font: 600 var(--fs-2)/1.3 var(--ui); border: 2px solid var(--gold-a); border-radius: var(--r2); transition: opacity .4s ease; touch-action: none; user-select: none; }
#cine-ctl .lbl { min-width: 56px; text-align: center; }
#cine-ctl .who { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--gold); }
.cine-dial { position: relative; flex: none; width: 58px; height: 58px; border-radius: var(--r3); border: 2px solid var(--gold-a); background: radial-gradient(circle, var(--navy3) 0 30%, var(--navy) 31%); cursor: grab; touch-action: none; }
.cine-dial i { position: absolute; left: 50%; top: 50%; width: 3px; height: 24px; margin-left: -1.5px; background: var(--gold); border-radius: var(--r1); transform-origin: 50% 0; }
.cine-dial b { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: var(--r3); background: var(--gold); }
.cine-dial.sm { width: 34px; height: 34px; } .cine-dial.sm i { height: 13px; }
#cine-panel .dirs { display: grid; grid-template-columns: repeat(3, 34px); gap: 3px; }
.touch #cine-panel button, .touch #cine-ctl button { min-width: var(--tap); min-height: var(--tap); }
.touch #cine-panel .dirs { grid-template-columns: repeat(3, var(--tap)); }
.touch #cine-ctl { left: auto; right: max(12px, env(safe-area-inset-right)); transform: none; max-width: min(320px, calc(50vw - 16px)); justify-content: flex-end; }
.touch #cine-ctl .who { max-width: 100%; }
body.touch.cine-bar #tbtns, body.dead #cine-ctl { display: none !important; }`;
  document.head.appendChild(css);
  const bars = [0, 1].map((k) => { const b = document.createElement('div'); b.className = 'cine-bar'; b.style[k ? 'bottom' : 'top'] = '0'; document.body.appendChild(b); return b; });
  const fadeEl = document.createElement('div'); fadeEl.id = 'cine-fade'; document.body.appendChild(fadeEl);
  const setBars = () => {
    const [W, H] = api.size(), h = D.box ? Math.max(0, (H - W / D.box) / 2) : 0;
    for (const b of bars) b.style.height = `${Math.round(h)}px`;
  };
  addEventListener('resize', setBars);
  const fadeTo = (k) => { fadeEl.style.opacity = String(k); };

  function setClean(on) {
    D.clean = !!on;
    document.body.classList.toggle('cine-clean', D.clean);
    // (what the keys do: the cinematic hint strip, the first few times - client/hudinfo.js, which sees D.clean)
    render();
  }
  function setMode(m, k0 = 'tour') {
    const was = D.mode;
    D.mode = m;
    if (was !== 'scene' || m !== 'scene') { x = S.cam.x; y = S.cam.y; }
    inited = true;
    if (m !== 'tour') { if (tour) D.zoomK = ZOOMS[D.zi]; tour = null; fadeTo(0); }
    if (was === 'scene' && m !== 'scene') { api.send({ t: 'cine', f: 'stop' }); fs = null; fcam = null; D.zoomK = ZOOMS[D.zi]; fadeTo(0); }
    if (m === 'tour') startTour();
    if (m === 'target') nextTarget(1);
    if (m === 'drift') { dr.x = x; dr.y = y; dr.vx = Math.cos(dr.a) * DRIFT_SPEEDS[dr.si]; dr.vy = Math.sin(dr.a) * DRIFT_SPEEDS[dr.si]; }
    if (m === 'scene' && was !== 'scene') followKind(k0);
    if (m === 'drift' || m === 'scene') wake();
    render();
  }
  // ---- the follow scenes: ask the server for a kind (or the tour, or the next one) ----
  function followKind(k) {
    here();
    if (D.mode !== 'scene') { setMode('scene', k); return; }
    api.send({ t: 'cine', f: k, near });
    if (k !== 'next' && !D.clean) api.toast(k === 'tour' ? 'Follow scenes: the tour - each kind of scene a while, then the next. N skips, Esc ends it.' : `Follow scenes: ${CINE_KIND[k] ? CINE_KIND[k].n : k}...`, 'info');
  }
  function stepKind(dir) {
    const cur = fs && !fs.tour ? CINE_KINDS.findIndex((q) => q.id === fs.k) : -1;
    const i = cur < 0 ? (dir > 0 ? 0 : CINE_KINDS.length - 1) : (cur + dir + CINE_KINDS.length) % CINE_KINDS.length;
    followKind(CINE_KINDS[i].id);
  }
  function setDrift(si) { dr.si = Math.max(0, Math.min(DRIFT_SPEEDS.length - 1, si)); here(); wake(); render(); }
  function setDriftWay(a) { dr.a = wrapA(a); here(); wake(); render(); }
  // the controls along the bottom: shown with the HUD; hidden with it for a clean shot - back for a few seconds when
  // you press something, move the mouse or touch the screen
  const wake = () => { wokeAt = performance.now(); };
  addEventListener('pointerdown', () => { if (D.clean) wake(); }, true);
  addEventListener('pointermove', () => { if (D.clean && (D.mode === 'drift' || D.mode === 'scene')) wake(); }, true);
  function setZoom(i) { D.zi = Math.max(0, Math.min(ZOOMS.length - 1, i)); D.zoomK = ZOOMS[D.zi]; render(); }
  function setTime(i) { D.ti = i; const m = TIMES[i][1]; D.lt = m === null ? null : loopOf(m); render(); }
  function setWx(i) {
    D.wi = i; const w = WXS[i][1];
    D.wx = w === 'mist' ? 'fog' : w;
    if (w === 'fog') S.fogForce = { k: 0.85, spread: 1 }; else if (w === 'mist') S.fogForce = { k: 0.45, spread: 0.45 }; else if (w === 'clear') S.fogForce = { k: 0, spread: 0 }; else S.fogForce = null;
    if (w === 'mist') D.wx = null;   // (mist: the fog's thinner veil over whatever the weather is)
    render();
  }
  function setBox(i) { D.bi = i; D.box = BOXES[i][1]; setBars(); render(); }

  // ---- someone to keep the camera on: the people and vehicles in view, nearest first ----
  function candidates() {
    const me = api.selfPos(), out = [];
    for (const e of S.ents.values()) {
      if (!e.d || (e.kind !== K.PED && e.kind !== K.VEH) || e.id === S.myPedId) continue;
      if (e.kind === K.PED && e.parent) continue;   // (in a vehicle: the vehicle)
      out.push([Math.hypot(e.rx - me.x, e.ry - me.y), e.id]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, 24).map((o) => o[1]);
  }
  function nextTarget(dir) {
    const c = candidates();
    if (!c.length) { api.toast('Nobody near enough to follow.', 'warn'); D.mode = 'smooth'; render(); return; }
    const i = c.indexOf(target);
    target = c[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + c.length) % c.length];
    render();
  }

  // ---- the tour: the world's sights, one after another ----
  function sights() {
    const m = S.map, out = [];
    if (!m) return out;
    for (const L of m.landmarks || []) if (L && L.name && Number.isFinite(L.x)) out.push({ name: L.name, x: L.x + (L.w || 0) / 2, y: L.y + (L.h || 0) / 2 });
    for (const P of m.paintings || []) if (P && P.name && Number.isFinite(P.x)) out.push({ name: P.name, x: P.x + (P.w || 0) / 2, y: P.y + (P.h || 0) / 2 });
    // (nearest first from where you are, then each the nearest left: a route, not a scatter)
    const me = api.selfPos(), route = [];
    let at = me;
    const left = out.filter((q, i) => out.findIndex((o) => Math.hypot(o.x - q.x, o.y - q.y) < 600) === i);
    while (left.length && route.length < 40) {
      let bi = 0, bd = Infinity;
      left.forEach((q, i) => { const d = Math.hypot(q.x - at.x, q.y - at.y); if (d < bd) { bd = d; bi = i; } });
      at = left.splice(bi, 1)[0]; route.push(at);
    }
    return route;
  }
  function startTour() {
    const list = sights();
    if (!list.length) { api.toast('No sights on this map to tour.', 'warn'); D.mode = 'follow'; return; }
    tour = { list, i: -1, t: SHOT_S, shot: null };
    api.toast(`The tour: ${list.length} sights, ${SHOT_S}s each. Esc ends it.`, 'info');
  }
  function tourStep(cam, dt) {
    const T = tour;
    T.t += dt;
    { const t = performance.now(); if (t - tourAt > 60e3) { tourAt = t; api.send({ t: 'cine', tour: 1 }); } }
    if (!T.shot || T.t >= SHOT_S + HOLD_S) {
      T.i = (T.i + 1) % T.list.length; T.t = 0;
      const q = T.list[T.i], a = (T.i * 2.39) % 6.283, r = 260;
      T.shot = { name: q.name, x0: q.x - Math.cos(a) * r, y0: q.y - Math.sin(a) * r, x1: q.x + Math.cos(a) * r, y1: q.y + Math.sin(a) * r, z0: 1.15, z1: 0.85 };
      fadeTo(1);
    }
    const s = T.shot, u = Math.max(0, T.t - HOLD_S) / SHOT_S, e = u * u * (3 - 2 * u);
    x = s.x0 + (s.x1 - s.x0) * e; y = s.y0 + (s.y1 - s.y0) * e;
    D.zoomK = s.z0 + (s.z1 - s.z0) * e;
    // (black while the art comes in, the fade up, the fade out before the cut)
    fadeTo(T.t < HOLD_S ? 1 : T.t < HOLD_S + FADE_S ? 1 - (T.t - HOLD_S) / FADE_S : T.t > HOLD_S + SHOT_S - FADE_S ? (T.t - (HOLD_S + SHOT_S - FADE_S)) / FADE_S : 0);
    if (T.t > HOLD_S && T.t - dt <= HOLD_S && !D.clean) api.toast(s.name, 'info');
  }

  // ---- the staged scenes ----
  function runScene(i) {
    const sc = SCENES[i];
    if (!sc) return;
    if (!(S.dev || S.devMode)) { api.toast('The staged scenes use the debug menu\'s commands: turn on dev mode first (pause menu - Debug menu).', 'warn'); return; }
    if (scene && scene.timer) clearTimeout(scene.timer);
    scene = { sc, i: 0 };
    api.send({ t: 'dev', c: 'afoot' });   // (on your feet first: the teleports want you out of any vehicle)
    if (D.mode === 'tour' || D.mode === 'drone') setMode('follow');
    const go = () => {
      const st = scene && scene.sc === sc ? sc.s[scene.i++] : null;
      if (!st) { done(); return; }
      scene.timer = setTimeout(() => { exec(st[1], st[2]); go(); }, st[0]);
    };
    const done = () => {
      if (sc.t !== undefined) { const k = TIMES.findIndex((q) => q[1] === sc.t); if (k >= 0) setTime(k); else D.lt = loopOf(sc.t); } else if (!sc.st) setTime(0);
      if (sc.wx) setWx(WXS.findIndex((q) => q[1] === sc.wx));
      setZoom(ZOOMS.reduce((b, z, k) => (Math.abs(z - (sc.z || 1)) < Math.abs(ZOOMS[b] - (sc.z || 1)) ? k : b), 0));
      setMode(sc.cam || 'follow');
      if (!D.clean) api.toast(`Scene: ${sc.n}${sc.note ? ` - ${sc.note}` : ''}. F2 for the clean screen.`, 'good');
    };
    go();
  }
  function exec(c, extra) {
    if (c === '@storm') { if (S.wx) S.wx.stormForce = extra ? extra.mood : null; return; }
    if (c === '@bio') { S.bioForce = extra ? [extra.k, 0.5] : null; return; }
    if (c === '@bolt') { if (S.wx) S.wx.strike((extra && extra.kind) || 'strike'); return; }
    api.send({ t: 'dev', c, ...(extra || {}) });
  }

  // ---- the picture ----
  function shot() {
    const was = D.clean;
    if (!was) setClean(true);
    api.grab((cv, world) => {
      const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
      const c2 = out.getContext('2d');
      if (world && !world.classList.contains('hidden')) c2.drawImage(world, 0, 0, out.width, out.height);
      c2.drawImage(cv, 0, 0);
      if (!was) setClean(false);
      out.toBlob((blob) => {
        if (!blob) { api.toast('Could not make the picture.', 'warn'); return; }
        const a = document.createElement('a'), d = new Date();
        a.href = URL.createObjectURL(blob); a.download = `city-life-auto_${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    });
  }

  // ---- the panel ----
  const btn = (label, on, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (on) b.classList.add('on'); if (cls) b.classList.add(cls); b.onclick = (ev) => { ev.stopPropagation(); here(); wake(); fn(); b.blur(); }; return b; };
  // the drift's dial: its needle the way it goes; drag (or tap) it to point it anywhere
  function dial() {
    const d = document.createElement('div'); d.className = 'cine-dial'; d.title = 'Drag to steer the drift';
    const n = document.createElement('i'), c = document.createElement('b');
    d.append(n, c);
    const show = () => { n.style.transform = `rotate(${dr.a - Math.PI / 2}rad)`; };
    const at = (ev) => { const r = d.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2); if (Math.hypot(dx, dy) > 4) { dr.a = Math.atan2(dy, dx); show(); here(); wake(); } };
    d.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ev.preventDefault(); try { d.setPointerCapture(ev.pointerId); } catch { /* old browser */ } at(ev); d.onpointermove = at; });
    d.addEventListener('pointerup', () => { d.onpointermove = null; render(); });
    d.addEventListener('pointercancel', () => { d.onpointermove = null; });
    show(); d.show = show;
    return d;
  }
  const speedRow = () => [btn('◀', false, () => setDrift(dr.si - 1)), Object.assign(document.createElement('span'), { className: 'lbl', textContent: DRIFT_NAMES[dr.si] }), btn('▶', false, () => setDrift(dr.si + 1))];
  const zoomRow = () => [btn('－', false, () => setZoom(D.zi - 1)), btn('＋', false, () => setZoom(D.zi + 1))];
  // the bar along the bottom (drift / follow scenes): made again when what it shows changes
  function barShow() {
    const want = D.mode === 'drift' || D.mode === 'scene';
    document.body.classList.toggle('cine-bar', want);   // (on a phone the bar takes the action buttons' corner: they do nothing while the camera has the controls)
    if (!want) { if (bar) bar.style.display = 'none'; return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'cine-ctl'; bar.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); wake(); }); document.body.appendChild(bar); }
    const key = D.mode === 'drift' ? `d${dr.si}` : `s${fs ? `${fs.k}|${fs.n}|${fs.tour}|${fs.none || 0}` : '-'}|${near}`;
    if (key !== barKey) {
      barKey = key; bar.textContent = '';
      if (D.mode === 'drift') { const dl = dial(); bar.dial = dl; bar.append(dl, ...speedRow(), ...zoomRow(), btn('✕', false, () => setMode('follow'))); }
      else {
        const who = Object.assign(document.createElement('span'), { className: 'who', textContent: fs ? (fs.none ? `Looking for: ${fs.n}` : fs.n) : 'Finding a scene...' });
        bar.append(btn('◀', false, () => stepKind(-1)), who, btn('▶', false, () => stepKind(1)), btn('Next', false, () => followKind('next')), btn('Tour', !!(fs && fs.tour), () => followKind('tour')), ...zoomRow(), btn('✕', false, () => setMode('follow')));
      }
    } else if (bar.dial) bar.dial.show();
    const on = !D.clean || performance.now() - wokeAt < 3500;
    bar.style.display = 'flex'; bar.style.opacity = on ? '1' : '0'; bar.style.pointerEvents = on ? '' : 'none';
  }
  function render() {
    barKey = '';
    if (!panel || !shown) return;
    const row = (...bs) => { const r = document.createElement('div'); r.className = 'row'; for (const b of bs) r.appendChild(b); return r; };
    const h = (t) => { const e = document.createElement('h3'); e.textContent = t; return e; };
    panel.textContent = '';
    const title = document.createElement('div'); title.innerHTML = '<b>Cinematic mode</b> <span style="color:#9aa6c0">- your screen only</span>';
    panel.append(title,
      h('Screen'), row(btn(D.clean ? 'Clean screen: on (F2)' : 'Clean screen (F2)', D.clean, () => setClean(!D.clean)), btn('Picture (F8)', false, shot), btn('Hide panel (F4)', false, () => toggle(false))),
      row(btn('Hide my character', D.hideMe, () => { D.hideMe = !D.hideMe; render(); }), btn('No shake', D.noShake, () => { D.noShake = !D.noShake; render(); })),
      h('Letterbox'), row(...BOXES.map(([n], i) => btn(n, D.bi === i, () => setBox(i)))),
      h('Camera'), row(...[['Follow', 'follow'], ['Smooth', 'smooth'], ['Drift', 'drift'], ['Drone', 'drone'], ['On someone', 'target'], ['Tour', 'tour'], ['Follow scenes', 'scene']].map(([n, m]) => btn(n, D.mode === m, () => setMode(m)))));
    if (D.mode === 'drift') {
      const dirs = document.createElement('div'); dirs.className = 'dirs';
      for (const i of [7, 0, 1, 6, -1, 2, 5, 4, 3]) dirs.append(i < 0 ? dial() : btn(DIRS8[i][0], Math.abs(wrapA(dr.a - DIRS8[i][1])) < 0.05, () => setDriftWay(DIRS8[i][1])));
      dirs.children[4].classList.add('sm');
      panel.append(h('Drift: which way (or drag the dial)'), dirs, h('Drift: how fast'), row(...DRIFT_NAMES.map((n, i) => btn(n, dr.si === i, () => setDrift(i)))));
    }
    if (D.mode === 'scene') {
      panel.append(h('Follow scenes'), row(btn('Near me', near, () => { near = true; if (fs) followKind(fs.tour ? 'tour' : fs.k); render(); }), btn('Anywhere', !near, () => { near = false; if (fs) followKind(fs.tour ? 'tour' : fs.k); render(); }), btn('▶ The tour', !!(fs && fs.tour), () => followKind('tour')), btn('Next (N)', false, () => followKind('next'))));
      if (fs) { const p = document.createElement('div'); p.className = 'tip'; p.style.color = '#ffd23a'; p.textContent = fs.none ? `Nobody's at it right now: ${fs.n} - still looking` : `On: ${fs.n}`; panel.append(p); }
      let g = '';
      for (const q of CINE_KINDS) {
        if (q.g !== g) { g = q.g; const e = document.createElement('div'); e.className = 'tip'; e.style.color = '#ffd23a'; e.textContent = g; panel.append(e); }
        panel.append(btn(q.n, !!(fs && !fs.tour && fs.k === q.id), () => followKind(q.id), 'sc'));
      }
      if (!(S.dev || S.devMode)) { const p = document.createElement('div'); p.className = 'tip'; p.textContent = 'In dev mode, a scene nobody is doing right now is started for the camera (a race, a chase, a plane, a surfer...).'; panel.append(p); }
    }
    if (D.mode === 'smooth' || D.mode === 'target') {
      const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '1'; r.step = '0.05'; r.value = String(D.smooth);
      r.oninput = () => { D.smooth = +r.value; };
      panel.append(h('Smoothing (loose - tight)'), r);
    }
    if (D.mode === 'target') panel.append(row(btn('◀ Previous ([)', false, () => nextTarget(-1)), btn('Next (]) ▶', false, () => nextTarget(1))));
    const tips = { drone: 'Drone: WASD / arrows / left stick fly it, Q / E zoom, Shift faster, Esc back to you.', tour: 'Tour: the camera glides through the world\'s sights on its own. Esc ends it.', drift: 'Drift: a pan across wherever you are. WASD / arrows / the left stick steer it, Z / X or LB / RB slower / faster, Space stops it, Q / E or LT / RT zoom.', scene: 'Follow scenes: the camera on someone doing something, near you or anywhere - it moves on when they\'re done. N / A the next one, [ ] / LB RB the kind, T the tour, Esc / B back to you.', target: 'On someone: the people and vehicles near you, nearest first.', smooth: 'Smooth: the camera trails you, like a camera operator.' };
    if (tips[D.mode]) { const p = document.createElement('div'); p.className = 'tip'; p.textContent = tips[D.mode]; panel.append(p); }
    panel.append(h('Zoom'), row(btn('－', false, () => setZoom(D.zi - 1)), btn(`${Math.round(100 / D.zoomK)}%`, false, () => setZoom(3)), btn('＋', false, () => setZoom(D.zi + 1))));
    panel.append(h('Time of day'), row(...TIMES.map(([n], i) => btn(n, D.ti === i, () => setTime(i)))));
    panel.append(h('Weather'), row(...WXS.map(([n], i) => btn(n, D.wi === i, () => setWx(i)))));
    panel.append(h('Staged scenes'));
    if (!(S.dev || S.devMode)) { const p = document.createElement('div'); p.className = 'tip'; p.textContent = 'These use the debug menu\'s commands - turn on dev mode first (pause menu, Debug menu).'; panel.append(p); }
    let g = '';
    SCENES.forEach((sc, i) => {
      if (sc.g !== g) { g = sc.g; const e = document.createElement('div'); e.className = 'tip'; e.style.color = '#ffd23a'; e.textContent = g; panel.append(e); }
      const b = btn('', false, () => runScene(i), 'sc');
      b.innerHTML = `${sc.n}${sc.note ? ` <small>- ${sc.note}</small>` : ''}`;
      panel.append(b);
    });
  }
  function toggle(on = !shown) {
    shown = on;
    if (on && !panel) { panel = document.createElement('div'); panel.id = 'cine-panel'; panel.addEventListener('keydown', (e) => e.stopPropagation()); document.body.appendChild(panel); }
    if (panel) panel.style.display = on ? '' : 'none';
    render();
  }

  // ---- what main.js calls ----
  D.key = (k, down) => {
    if (down && k === 'F2') { setClean(!D.clean); return true; }
    if (down && k === 'F4') { toggle(); return true; }
    if (down && k === 'F8') { shot(); return true; }
    if (D.mode === 'target' && down && (k === 'BracketLeft' || k === 'BracketRight')) { nextTarget(k === 'BracketRight' ? 1 : -1); return true; }
    if (!D.holds()) return false;
    if (down) { here(); wake(); }
    if (down && k === 'Escape') { setMode('follow'); return true; }
    const zoomKey = D.mode === 'drone' || D.mode === 'drift' || D.mode === 'scene';
    if (zoomKey && down && (k === 'KeyQ' || k === 'Minus')) { setZoom(D.zi - 1); return true; }
    if (zoomKey && down && (k === 'KeyE' || k === 'Equal')) { setZoom(D.zi + 1); return true; }
    if (D.mode === 'drift' && down) {
      if (k === 'KeyZ') { setDrift(dr.si - 1); return true; }
      if (k === 'KeyX') { setDrift(dr.si + 1); return true; }
      if (k === 'Space') { if (dr.si) { dr.last = dr.si; setDrift(0); } else setDrift(dr.last || 2); return true; }
    }
    if (D.mode === 'scene' && down) {
      if (k === 'KeyN' || k === 'Enter') { followKind('next'); return true; }
      if (k === 'BracketLeft' || k === 'BracketRight') { stepKind(k === 'BracketRight' ? 1 : -1); return true; }
      if (k === 'KeyT') { followKind('tour'); return true; }
    }
    if (down) keys.add(k); else keys.delete(k);
    return true;
  };
  // the pad, each frame (main.js, while no menu's open): the sticks and triggers, and while the camera has the controls
  // - B back to you, Y the panel, X a picture; LB / RB the drift's speed or the scene's kind; A the next scene
  D.pad = (a) => {
    axes = a;
    if (!D.holds()) return;
    const I = api.input || {}, t = performance.now();
    if (I.menuBack || I.padX || I.padY || I.menuTab || I.menuSelect || (a && (Math.hypot(a.lx || 0, a.ly || 0) > 0.3 || (a.lt || 0) > 0.3 || (a.rt || 0) > 0.3))) { wake(); here(); }
    if (I.menuBack) { setMode('follow'); return; }
    if (I.padY) toggle();
    if (I.padX) shot();
    if (D.mode === 'drift' && I.menuTab) setDrift(dr.si + I.menuTab);
    if (D.mode === 'scene' && I.menuTab) stepKind(I.menuTab);
    if (D.mode === 'scene' && I.menuSelect) followKind('next');
    if (a && D.mode !== 'drone' && t - padZoomAt > 260) {   // (the drone zooms with Q / E; held, a trigger steps the zoom)
      if ((a.rt || 0) > 0.5) { setZoom(D.zi + 1); padZoomAt = t; } else if ((a.lt || 0) > 0.5) { setZoom(D.zi - 1); padZoomAt = t; }
    }
  };
  // the server's word on the follow scenes: whom to follow ({ id, k, n, z, cut, tour, x, y }), nobody at it ({ none }),
  // or over ({ off })
  D.follow = (m) => {
    if (m.off) { if (D.mode === 'scene') { fs = null; setMode('follow'); } return; }
    if (D.mode !== 'scene') return;
    if (!m.id) { fs = { ...(fs || {}), k: m.k, n: m.n, none: 1, tour: fs ? fs.tour : 0 }; if (!D.clean) api.toast(`Nobody's at it right now: ${m.n}${m.dev ? '' : ' (in dev mode one is started for the camera)'} - still looking.`, 'warn'); render(); return; }
    const first = !fs || !fs.id;
    fs = { id: m.id, k: m.k, n: m.n, z: m.z || 1, tour: !!m.tour, hold: m.cut || first ? 1.2 : 0, none: 0 };
    missing = 0;
    if (m.cut || first || !fcam) {
      fadeTo(1);
      fcam = { x: m.x, y: m.y, vx: 0, vy: 0, px: null, py: null, fi: 0, lead: FRAMES[0].lead, side: 0, zk: FRAMES[0].zk };
      x = m.x; y = m.y;
    }
    frameAt = performance.now() + (FRAME_S[0] + Math.random() * (FRAME_S[1] - FRAME_S[0])) * 1000;
    if (!D.clean) api.toast(m.n, 'info');
    render();
  };
  // the subject's ground point (an aircraft drawn up by its height: two thirds of the way up, as main.js has your own)
  function subjectAt(e) {
    let ex = e.rx, ey = e.ry;
    const def = e.kind === K.VEH && e.d ? VEHICLE_BY_INDEX[e.d.m] : null;
    if (def && def.kind === 'air' && S.airMod && S.airMod.liftOf && S.art2 && S.art2.ready) ey -= S.airMod.liftOf(e.ralt ?? (e.extra | 0) * 4) * 0.66;
    return [ex, ey];
  }
  function sceneStep(dt) {
    if (!fs || !fs.id || !fcam) return;
    const e = S.ents.get(fs.id);
    if (!e || e.rx === undefined) {   // (on its way to us after a cut: black meanwhile; gone for good: the next one)
      missing += dt;
      if (missing > 6) { missing = -6; api.send({ t: 'cine', f: 'next', near }); }
      return;
    }
    missing = 0;
    const [ex, ey] = subjectAt(e);
    if (fs.hold > 0) {   // (the cut: in black, the camera put on them, the art coming in)
      fs.hold -= dt;
      fcam.x = ex; fcam.y = ey; fcam.px = ex; fcam.py = ey;
      if (fs.hold <= 0) fadeTo(0);
    }
    if (performance.now() > frameAt) {   // (now and then the framing changes: wider, closer, off to one side)
      fcam.fi = (fcam.fi + 1 + Math.floor(Math.random() * (FRAMES.length - 1))) % FRAMES.length;
      frameAt = performance.now() + (FRAME_S[0] + Math.random() * (FRAME_S[1] - FRAME_S[0])) * 1000;
    }
    followStep(fcam, ex, ey, dt);
    x = fcam.x; y = fcam.y;
    D.zoomK = ZOOMS[D.zi] * fs.z * fcam.zk;
  }
  D.sky = (sky) => { if (D.wx === 'clear') { sky.rain = 0; } };
  D.cam = (cam, dt, tx, ty) => {
    // (down: the panel shuts and the camera comes back to you - the death screen's choices take the keys and the screen)
    if (S.me && S.me.dead) { if (shown) toggle(false); if (D.holds()) setMode('follow'); }
    if (D.noShake) cam.shake = 0;
    if (!inited) { x = cam.x; y = cam.y; inited = true; }
    barShow();
    const lag = (k) => 1 - Math.exp(-k * dt);
    if (D.mode === 'follow') { x = cam.x; y = cam.y; return; }
    // (the drift and the follow scenes going on by themselves, like the tour: the idle clock runs slow - players.js riding)
    if (D.mode === 'drift' || D.mode === 'scene') { const t = performance.now(); if (t - tourAt > 60e3) { tourAt = t; api.send({ t: 'cine', tour: 1 }); } }
    if (D.mode === 'smooth') { const k = 0.6 + D.smooth * 5; x += (tx - x) * lag(k); y += (ty - y) * lag(k); }
    else if (D.mode === 'drift') {
      const want = keyDir(keys) ?? stickDir(axes);
      dr.x = x; dr.y = y;
      driftStep(dr, dt, cam.zoom || 1, want);
      x = dr.x; y = dr.y;
      if (want !== null && bar && bar.dial) bar.dial.show();
    } else if (D.mode === 'scene') sceneStep(dt);
    else if (D.mode === 'target') {
      const e = S.ents.get(target);
      if (!e || e.rx === undefined) { nextTarget(1); return; }
      const k = 0.8 + D.smooth * 5; x += (e.rx - x) * lag(k); y += (e.ry - y) * lag(k);
    } else if (D.mode === 'drone') {
      let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (axes && Math.hypot(axes.lx || 0, axes.ly || 0) > 0.15) { mx = axes.lx; my = axes.ly; here(); }
      const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1500 : 480) / (cam.zoom || 1);
      D.vx = (D.vx || 0) + (mx * sp - (D.vx || 0)) * lag(4); D.vy = (D.vy || 0) + (my * sp - (D.vy || 0)) * lag(4);
      x += D.vx * dt; y += D.vy * dt;
    } else if (D.mode === 'tour' && tour) tourStep(cam, dt);
    cam.x = x; cam.y = y;
  };
  toggle(false);
  return D;
}
