// The cinematic mode (the owner, 2026-10-22: "an option to disable UI, and any other cinematic options ... so I can take
// some really strong video capture and screenshots of gameplay"). Loaded the first time it's asked for (main.js cine:
// F2, F4, F8, or the pause menu's "Cinematic mode"). Everything here is this screen's only - nobody else's game changes,
// except the staged scenes, which run the debug menu's commands (dev mode).
//   F2  the clean screen: no HUD, no prompts or notes, no marks, labels, sights or touch buttons - just the world
//   F4  the panel: the shot list (one tap a shot, or the lot back to back), the free camera, the zoom, the time of day
//       and the weather (on your screen), letterbox bars, hiding your own character, the shake, a picture
//   F8  a picture of the screen as it is, clean (a PNG download)
// The cameras: Follow (the game's own), Smooth (it lags behind you like a camera operator's, the amount on a slider),
// Drone (free: WASD / arrows / the left stick to fly it, Q / E or - / = to zoom, Shift faster, Esc back to you), On
// someone (the camera on a person or a vehicle near you - [ and ] for the next and the one before).
// The shot list (the owner, 11-14: "a diverse range of subjects ... good camera movement and the best areas to show off"):
//   the director's scenes (shared/scenes/: shots.js and the action scenes) in sections - City & Neon at night, Nature &
//   Countryside, Coast & Water, Action & Chases, People & Life, Vehicles & Flight, Weather & Time-lapse. One tap plays one:
//   the server puts its cast in its place and holds it at its first moment till this page's art is in (black meanwhile),
//   then the shot owns the camera - its own move, its time of day and weather on this screen - for its 10-30 s, and ends
//   with a fade. "Play all" / a section's ▶ plays them back to back (the reel): Next skips, Stop ends it, a tap on any shot
//   switches to it. Any other key, touch or pad button hands the camera back - the free camera, where the shot was (drag
//   it on a phone); Esc / B back to you.
// The owner, 10-24: "more controls for the camera like choosing which direction the camera drifts at and the speed it
// drifts at" and "automatic scenes that has the camera follow NPCs ... so I can take some cinematic shots of everything":
//   Drift: its direction (8 ways, or any angle on the dial - drag it; WASD / arrows / the left stick steer it), its speed
//     (off, crawl .. fast: Z / X, LB / RB), the zoom (Q / E, LT / RT). The bar of its controls along the bottom hides with
//     the clean screen and comes back for a few seconds when you press something, move the mouse or touch the screen.
//   Follow scenes: the camera on someone doing something - a police chase, a street race, an angler, a surfer, a combine
//     harvesting, a train, a plane landing (shared/cinekinds.js), or the tour of them all. The server picks who
//     (server/systems/cinefollow.js) and moves on when it's over; the camera here follows them, leading the way they go,
//     the framing changing now and then. N / A the next one, [ ] / LB RB the kind, T the tour.
// The scene director's scenes (server/systems/director.js, shared/scenes/; the owner, 11-13): started from the panel's
//   "Director scenes" (dev mode) or the debug menu, or by the capture server - the server says which ({ t: 'dscene' }:
//   the scene, its clock's first tick, the cast's entities, the place's anchors, when its beats began) and the camera here
//   flies the script's shots (shared camAt) over what's drawn: the 'script' mode. A capture's ({ cap }) has the clean
//   screen with the players' name tags (D.tags), your own character out of the picture. Esc gives the camera back.
// What's drawn while the camera's open (the owner, 11-13: "control things like zoom level and then different layers or
// game objects and things on and off"): the panel's Show section - name tags, the marks over heads (a bounty's skull, a
// reported suspect's flare), speech bubbles (off by default: "too fast to read anyways"), emote balloons, other players,
// people on foot, traffic (the vehicles that move), the rain - this screen only, kept in this browser (localStorage
// 'cla.cine', with the zoom a scene is watched at and the letterbox). A scene's zoom is the script's times the panel's:
// Q / E, LT / RT or the panel's - + move it, the % between them puts it back. The panel answers the arrows / D-pad and
// Enter / A as well as a tap; B / Esc close it, then the camera.
// main.js asks it each frame: holds() (the keys are the camera's), cam(cam, dt, tx, ty), zoomK, lt (the time of day's
// loop time or null), wx (null | 'clear' | 'rain' | 'fog'), sky(sky), hideMe, clean, eye() (where the camera is, when
// it's off you: the world's window follows it); key(k, down), pad(axes), follow(msg) (the server's { t: 'cinef' }).
import { DAY_LOOP_S, DAY_PART_S, K, gameClock, WEATHER } from '../shared/constants.js';
import { CINE_KINDS, CINE_KIND } from '../shared/cinekinds.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { SHOWCASE, showcaseSpot } from './showcase.js';
import { icon } from './touchicons.js';   // (the kit's close X)
import { SCENES as DSCENES, SCENE_LIST as DSCENE_LIST, SECTIONS, camAt, isKept, viewScene } from '../shared/scenes/index.js';

const ZOOMS = [0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1];
const nearZoom = (z) => ZOOMS.reduce((b, q, k) => (Math.abs(q - z) < Math.abs(ZOOMS[b] - z) ? k : b), 0);
const TIMES = [['Live', null], ['Dawn', 390], ['Morning', 540], ['Noon', 720], ['Afternoon', 930], ['Golden hour', 1125], ['Dusk', 1205], ['Night', 1380], ['Small hours', 180]];
const WXS = [['Live', null], ['Clear', 'clear'], ['Rain', 'rain'], ['Fog', 'fog'], ['Mist', 'mist']];
const BOXES = [['Off', 0], ['2.39:1', 2.39], ['1.85:1', 1.85]];
const HOLD_MAX = 9500, HOLD_MIN = 500, END_FADE = 600;   // ms: a shot's hold for the art at most / at least, the fade out at its end
// the shot list's sections and their shots, in order (shared/scenes/: each scene's g) - the kept ones (shared/scenes KEPT:
// they pass the sanity check); moreOf: the rest, under "More (unreviewed)"
export const shotsOf = (sec) => DSCENE_LIST.filter((q) => isKept(q.id) && (sec ? q.g === sec : SECTIONS.some((g) => g[0] === q.g))).map((q) => q.id);
export const moreOf = () => DSCENE_LIST.filter((q) => !isKept(q.id)).map((q) => q.id);
const MORE = 'more';   // (the reel of the unreviewed ones: its sec)
// does this key hand the camera back from a shot? (not the screen's own keys, the zoom, Next or the panel's)
const KEEP_KEYS = new Set(['F2', 'F4', 'F8', 'KeyQ', 'KeyE', 'Minus', 'Equal', 'Digit0', 'KeyN', 'Tab', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
export const handsBack = (k) => !KEEP_KEYS.has(k) && k !== 'Escape';
// the camera's time of day on a shot at t of len s: its own, or a time-lapse from tl[0] to tl[1] (minutes)
export function shotMinutes(sc, t) { if (sc.tl) { const u = Math.max(0, Math.min(1, t / Math.max(1, sc.len - (sc.linger || 0)))); return sc.tl[0] + (sc.tl[1] - sc.tl[0]) * u; } return sc.time; }

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

// auto: the scene's autoplay script (shared/scenes/: the owner, 11-13 - it plays on its own, an NPC the subject, the camera's
// moves planned, your character out of it); the panel offers Autoplay beside Play it yourself. More get one by writing the
// script (a few lines: shared/scenes/autochase.js) and naming it here.
// The staged scenes (the owner, 10-22: "setup staged scenarios on all the [things] I talked about"): each a run of the
// debug menu's commands (server/dev.js; '@' ones are this screen's), a pause before each (ms: a teleport lands, the art
// comes in), then the camera the scene wants. t: the time of day on your screen (minutes), or a server time (st: everyone's
// clock - the drive-in's shows and the clubs only open after dark there).
// Each starts clean (the server's 'afoot': out of the home, off the train, out of the vehicle - whatever the last one left
// you in), and what it brings you is put where it belongs (the car command's on: 'road' the street, 'pad' a helipad,
// 'runway' the foot of a runway; a boat always on the water) - test/world3scenes.test.js plays them all in a row.
export const SCENES = [
  { g: 'Action', n: 'Police chase downtown', s: [[0, 'place', { n: 'Downtown' }], [2500, 'car', { m: 'sports', in: 1, on: 'road' }], [1500, 'wanted', { n: 3 }]], cam: 'smooth', z: 0.85, note: 'you at the wheel, three stars: drive' },
  { g: 'Action', n: 'Cops chasing a getaway car', auto: 'autochase', s: [[0, 'place', { n: 'Midtown' }], [2500, 'street', { k: 'chase' }]], cam: 'smooth', z: 0.8 },
  { g: 'Action', n: 'Street race on the Neon Strip at night', auto: 'autorace', s: [[0, 'place', { n: 'Neon Strip' }], [2500, 'street', { k: 'race' }]], t: 1380, cam: 'smooth', z: 0.8 },
  { g: 'Action', n: 'Armored truck run', s: [[0, 'place', { n: 'Downtown' }], [2500, 'street', { k: 'armored' }]], cam: 'smooth', z: 0.85 },
  { g: 'Action', n: 'Gang shootout in The Yards', auto: 'autoshootout', s: [[0, 'place', { n: 'The Yards' }], [2500, 'guns', {}], [600, 'godp', {}], [600, 'shootout', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Action', n: 'A tanker goes up by a row of cars', s: [[0, 'place', { n: 'Westport Center' }], [2500, 'blast', { k: 'row' }]], cam: 'follow', z: 0.85 },   // (Port Westport's middle is the container stacks: no room for the row)
  { g: 'Action', n: 'A street fight the police break up', s: [[0, 'place', { n: 'Old Town' }], [2500, 'happen', { k: 'fight', cops: 1 }]], cam: 'smooth', z: 1.2 },
  { g: 'Action', n: 'A tank on the boulevard', s: [[0, 'place', { n: 'Midtown' }], [2500, 'car', { m: 'tank', in: 1, on: 'road' }]], cam: 'smooth', z: 0.85 },
  { g: 'Vehicles', n: 'Helicopter over the city at golden hour', s: [[0, 'near', { k: 'helipad' }], [2500, 'car', { m: 'heli', in: 1, on: 'pad' }]], t: 1125, cam: 'smooth', z: 0.8, note: 'take off and fly over downtown' },
  { g: 'Vehicles', n: 'A plane takes off', s: [[0, 'near', { k: 'runway' }], [2500, 'car', { m: 'plane', in: 1, on: 'runway' }]], t: 540, cam: 'smooth', z: 0.75 },
  { g: 'Vehicles', n: 'Speedboat across the bay', s: [[0, 'near', { k: 'marina' }], [2500, 'car', { m: 'speedboat', in: 1 }]], t: 930, cam: 'smooth', z: 0.85 },
  { g: 'Vehicles', n: 'Jet ski at the race start', s: [[0, 'near', { k: 'jetskirace', ride: 1 }]], cam: 'smooth', z: 1 },
  { g: 'Vehicles', n: 'Off-road in the red rock desert', s: [[0, 'place', { n: 'Red Rock Desert' }], [2500, 'car', { m: 'pickup', in: 1 }]], t: 1125, cam: 'smooth', z: 0.85 },
  { g: 'Vehicles', n: 'Dirt bike at the MX park', s: [[0, 'near', { k: 'raceway' }], [2500, 'car', { m: 'dirtbike', in: 1 }]], cam: 'smooth', z: 1 },
  { g: 'Vehicles', n: 'Motorcycle through the peaks', s: [[0, 'place', { n: 'Granite Peaks' }], [2500, 'car', { m: 'tourer', in: 1, on: 'road' }]], t: 1125, cam: 'smooth', z: 0.9 },
  { g: 'Vehicles', n: 'Horseback across the farm valley', s: [[0, 'near', { k: 'farm' }], [2500, 'car', { m: 'horse', in: 1 }]], t: 1125, cam: 'smooth', z: 1.1, note: 'Shift to gallop' },
  { g: 'Police', n: 'On patrol in a cruiser', s: [[0, 'place', { n: 'Civic Center' }], [2500, 'cop', { on: 'road' }]], cam: 'smooth', z: 0.9, note: 'on duty, at the wheel of your cruiser' },
  { g: 'Police', n: 'Police helicopter', s: [[0, 'near', { k: 'policepad' }], [2500, 'cop', { on: 'road' }], [600, 'car', { m: 'policeheli', in: 1, on: 'pad' }]], t: 1380, cam: 'smooth', z: 0.8 },
  { g: 'Police', n: 'Bounty hunter on a contract', s: [[0, 'hunter', {}], [600, 'bounty', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Taxi fare', s: [[0, 'place', { n: 'Midtown' }], [2500, 'cabjob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Ambulance call', s: [[0, 'near', { k: 'hospital' }], [2500, 'medicjob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Firefighting', s: [[0, 'firejob', {}]], cam: 'smooth', z: 0.9 },
  { g: 'Jobs', n: 'Search and rescue', s: [[0, 'sar', {}]], cam: 'smooth', z: 0.85 },
  { g: 'Jobs', n: 'Coast guard', s: [[0, 'coast', {}]], cam: 'smooth', z: 0.85 },
  { g: 'Jobs', n: 'Crop dusting', auto: 'autodust', s: [[0, 'near', { k: 'duststrip' }], [2500, 'car', { m: 'duster', in: 1, on: 'runway' }]], t: 540, cam: 'smooth', z: 0.8 },
  { g: 'Jobs', n: 'Tow truck', s: [[0, 'place', { n: 'Midtown' }], [2500, 'towjob', {}]], cam: 'smooth', z: 0.9 },
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
  { g: 'Fun', n: 'Soccer on the field', s: [[0, 'near', { k: 'venue' }]], cam: 'follow', z: 0.9 },
  { g: 'Fun', n: 'Bowling', s: [[0, 'near', { k: 'bowling' }]], cam: 'follow', z: 1.2 },
  { g: 'Fun', n: 'The arcade', s: [[0, 'arcade', { k: 'in' }]], cam: 'follow', z: 1.2, note: 'on the floor among the games' },   // (in through the nearest arcade's door: server/devplay.js devArcade - 'near' left you on the street outside)
  { g: 'Fun', n: 'Golf at Lakeside Greens', s: [[0, 'place', { n: 'Lakeside Greens' }]], t: 930, cam: 'follow', z: 0.9 },
  { g: 'Fun', n: 'The pier and the Ferris wheel', s: [[0, 'place', { n: 'Sunset Beach Pier' }]], t: 1125, cam: 'follow', z: 0.9 },
  { g: 'Fun', n: 'The balloon field', s: [[0, 'place', { n: 'Dry Creek Balloon Field' }]], t: 450, cam: 'follow', z: 0.85 },
  { g: 'Exploring', n: 'Cave exploring', s: [[0, 'ug', { k: 'cave' }]], cam: 'follow', z: 1.2 },
  { g: 'Exploring', n: 'The river kayak run', s: [[0, 'place', { n: 'Redwood River Run' }]], cam: 'smooth', z: 1 },
  { g: 'Exploring', n: 'Riding the subway', s: [[0, 'train', { sub: 1 }]], cam: 'follow', z: 1 },
  { g: 'Exploring', n: 'Riding the main line', s: [[0, 'train', {}]], t: 1125, cam: 'follow', z: 0.85 },
  { g: 'People', n: 'Chess in the park, watchers around', s: [[0, 'act', { k: 'chess' }]], cam: 'follow', z: 1.45 },
  { g: 'People', n: 'A picnic', s: [[0, 'act', { k: 'picnic' }]], cam: 'follow', z: 1.45 },
  { g: 'People', n: 'A busker on the street', s: [[0, 'persona', { k: 'busker' }]], cam: 'follow', z: 1.45 },
  { g: 'People', n: 'Someone collapses: help them', s: [[0, 'happen', { k: 'faint' }]], cam: 'follow', z: 1.2 },
  { g: 'Weather', n: 'A thunderstorm', s: [[0, 'rain', { s: 600 }], [300, '@storm', { mood: 3 }]], st: 1, cam: 'smooth', z: 0.8, note: 'rain for everyone for ten minutes' },
  { g: 'Weather', n: 'Fog rolling over the valley', s: [[0, 'place', { n: 'Willow Valley' }]], t: 450, wx: 'fog', cam: 'drift', z: 0.75 },
  { g: 'Weather', n: 'The sea sparkling at night', s: [[0, 'near', { k: 'surf' }], [300, '@bio', { k: 1 }]], t: 1380, cam: 'drift', z: 0.8 },
];

export function makeDirector(S, api) {
  const D = { clean: false, mode: 'follow', zoomK: 1, zi: 3, lt: null, ti: 0, wx: null, wi: 0, box: 0, bi: 0, hideMe: false, noShake: true, smooth: 0.55, hideNames: true, tags: false, snapZoom: false };
  const keys = new Set();
  // the Show toggles and what's kept in this browser (per device; a private window or blocked storage: the defaults)
  const L = { tags: false, marks: false, bubbles: false, emotes: true, players: true, peds: true, traffic: true, rain: true, sz: 3, open: '' };
  const LAYERS = [['tags', 'Name tags'], ['marks', 'Marks over heads'], ['bubbles', 'Speech bubbles'], ['emotes', 'Emote balloons'], ['players', 'Other players'], ['peds', 'People on foot'], ['traffic', 'Traffic'], ['rain', 'Rain']];
  try { const o = JSON.parse(localStorage.getItem('cla.cine') || 'null'); if (o && typeof o === 'object') for (const k of Object.keys(L)) if (typeof o[k] === typeof L[k]) L[k] = o[k]; } catch { /* storage blocked: the defaults */ }
  const keep = () => { try { localStorage.setItem('cla.cine', JSON.stringify(L)); } catch { /* storage blocked */ } };
  const flip = (k) => { L[k] = !L[k]; keep(); syncLayers(); render(); };
  // the page's own: the bubbles and emote balloons by a class on the body (client/chat.js #cht-bubs: .cht-bub, .emo-pop)
  function syncLayers() { const on = D.isOpen(); document.body.classList.toggle('cine-nosay', on && !L.bubbles); document.body.classList.toggle('cine-noemo', on && !L.emotes); }
  D.layers = L;
  let axes = null, panel = null, shown = false, x = 0, y = 0, inited = false, target = 0, scene = null;
  // the shot list playing: reel { ids, i, sec (its section, '' all) } - one shot is a reel of one; want: the shot asked
  // for, its dscene not here yet ({ id, at }); before: the screen's time and weather before the reel, put back after
  let reel = null, want = null, before = null, endAt = 0, dropId = '';   // (dropId: a shot stopped before it came - its scene is let go when it does)
  // the drift (its way and speed kept from one drift to the next), the follow scenes (fs: the server's subject - id, k,
  // n, z, tour; cam: the camera on them; hold: black until they're here and the art's in; near: near you or anywhere)
  const dr = { x: 0, y: 0, a: -Math.PI / 6, si: 2, vx: 0, vy: 0 };
  // the Showcase (client/showcase.js): the hand-crafted places, for the cinematics - where they are on this map (looked up
  // once, by name: client/devtp.js teleportPlaces), the one picked
  let shows = null, showAt = -1;
  const showList = () => shows || [];
  async function loadShows() {
    if (shows) return shows;
    try { const { teleportPlaces } = await import('./devtp.js'); shows = SHOWCASE.map((q) => ({ ...q, at: S.map ? showcaseSpot(q, teleportPlaces(S.map)) : null })); } catch (e) { console.warn('[director] showcase', e); shows = SHOWCASE.map((q) => ({ ...q, at: null })); }
    return shows;
  }
  function showcaseGo(i) {
    const q = showList()[i];
    if (!q || !q.at) { api.toast(q ? `${q.n}: not on this map.` : 'The Showcase is still loading.', 'warn'); return; }
    showAt = i;
    setMode('drone');
    x = q.at.x; y = q.at.y; D.vx = 0; D.vy = 0;
    setZoom(nearZoom(q.z || 1));
    if (q.t !== undefined) { const k = TIMES.findIndex((w) => w[1] === q.t); if (k >= 0) setTime(k); else { D.ti = -1; D.lt = loopOf(q.t); } }
    if (!D.clean) api.toast(`${q.n}${q.note ? ` - ${q.note}` : ''}`, 'info');
    render();
  }
  let fs = null, fcam = null, near = true, frameAt = 0, missing = 0, padZoomAt = 0, wokeAt = -1e9, wokeSig = false, bar = null, barKey = '';
  D.holds = () => D.mode === 'drone' || D.mode === 'drift' || D.mode === 'scene' || D.mode === 'script' || !!want;
  // the scene director's scene on this screen (sct): { sc, seq, tick0, cast { castId: entity id }, anchors, bt (when its
  // beats began), cap, vel (the cast's smoothed velocities, for the shots' lead), cam (where the camera was), shot }
  let sct = null;
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
#cine-panel { position: fixed; right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); width: 320px; max-height: calc(100vh - 24px - env(safe-area-inset-top, 0px)); overflow: auto; z-index: 70; padding: 10px var(--s3); background: var(--pad-navy); color: var(--pad-cream); font: 700 var(--fs-2)/1.35 var(--pixel); border: 2px solid var(--pad-ink); border-radius: 0; box-shadow: var(--pn-rim), var(--pn-drop); }
#cine-panel h3 { margin: var(--s3) 0 var(--s1); font: 700 var(--fs-1) var(--pixel); letter-spacing: .08em; text-transform: uppercase; color: var(--gold); }
#cine-panel .row { display: flex; flex-wrap: wrap; gap: var(--s1); }
#cine-panel button, #cine-ctl button { min-height: 32px; min-width: 32px; padding: 0 var(--s2); background: var(--pad-navy); color: var(--pad-cream); border: 2px solid var(--pad-line); border-radius: 0; font: inherit; cursor: pointer; transition: background var(--t1) var(--ease); }
#cine-panel button:hover, #cine-ctl button:hover { border-color: var(--pad-gold); }
#cine-panel button.on, #cine-ctl button.on { background: var(--pad-gold); color: var(--pad-ink); border-color: var(--pad-ink); }
/* the way out and the shutter (the owner, 11-12: every screen has a way out on every device): a close button top centre,
   faint till it's touched (the corners are the HUD's), and on touch a round shutter by the right thumb - over the clean
   screen too */
.cine-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; } .cine-head .x { margin-left: auto; width: 36px; height: 36px; }
#cine-x, #cine-shut { position: fixed; z-index: 72; display: none; padding: 0; cursor: pointer; touch-action: manipulation; }
#cine-x { left: 50%; margin-left: calc(-1 * var(--tap) / 2); top: max(12px, env(safe-area-inset-top)); width: var(--tap); height: var(--tap); background: var(--pad-navy); color: var(--pad-cream); border: 2px solid var(--pad-ink); box-shadow: var(--pn-rim), var(--pn-drop); font: 700 var(--fs-4) var(--pixel); opacity: .55; }
#cine-x:active, #cine-x:focus-visible { opacity: 1; }
#cine-shut { right: max(24px, env(safe-area-inset-right)); bottom: max(24px, env(safe-area-inset-bottom)); width: 68px; height: 68px; border-radius: var(--r3); background: var(--white); border: 4px solid var(--pad-ink); box-shadow: 0 0 0 4px var(--white), 0 4px 0 4px var(--pad-drop); }
#cine-shut:active { transform: scale(.9); }
body.cine-on #cine-x, body.touch.cine-on #cine-shut { display: block; }
body.cine-cap #cine-x, body.cine-cap #cine-shut, body.cine-cap #cine-ctl { display: none !important; }
body.cine-clean:not(.cine-woke) #cine-x, body.cine-clean:not(.cine-woke) #cine-shut { display: none !important; }
body.cine-nosay #cht-bubs .cht-bub, body.cine-noemo #cht-bubs .emo-pop { display: none !important; }
#cine-panel button:focus-visible { outline: 2px solid var(--pad-gold); outline-offset: 1px; }   /* (a capture's frames: nothing of the camera's own on them) */
body.touch.cine-on #cine-ctl { bottom: max(108px, env(safe-area-inset-bottom)); }
.touch #cine-panel { right: auto; left: max(12px, env(safe-area-inset-left)); width: min(290px, calc(100vw - 92px)); max-height: calc(100vh - 24px); }
body.cine-on #hud-tc { visibility: hidden; }   /* (the photo mode: the top centre is the close button's - the objective waits) */
#cine-panel .sc { display: block; width: 100%; text-align: left; margin: 2px 0; }
#cine-panel .sc small, #cine-panel .tip { color: var(--dim); }
#cine-panel .tip { margin: 6px 0 0; }
#cine-panel input[type=range] { width: 100%; }
#cine-panel .cine-in { display: block; width: 100%; box-sizing: border-box; min-height: 32px; margin: 2px 0; padding: 0 var(--s2); background: var(--pad-ink); color: var(--pad-cream); border: 2px solid var(--pad-line); border-radius: 0; font: 600 var(--fs-3) var(--ui); }
.touch #cine-panel .cine-in { min-height: var(--tap); }
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
  // the way out, and on touch the shutter (shown while the camera's open: body.cine-on)
  const mk = (id, label, fn, txt = '') => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.textContent = txt; b.addEventListener('pointerdown', (ev) => ev.stopPropagation()); b.onclick = (ev) => { ev.stopPropagation(); fn(); }; document.body.appendChild(b); return b; };
  mk('cine-x', 'Close the camera (Esc, B)', () => close(), '✕');
  mk('cine-shut', 'Take a picture', () => shot());
  // (debug mode: what the camera did and why, newest last - window.__dirLog, for the captures)
  const trace = (what) => { if (!dev() || typeof window === 'undefined') return; const L = (window.__dirLog ||= []); L.push(`${Math.round(performance.now())} ${what} | ${String(new Error().stack).split('\n').slice(2, 5).map((q) => q.trim().replace(/^at /, '').replace(/\(.*\//, '(')).join(' < ')}`); if (L.length > 60) L.shift(); };
  const dev = () => !!(S.dev || S.devMode);   // (the shot list, the staged and follow scenes, the Showcase: debug mode's - they run its commands or move you)
  // open: anything of the camera's on this screen - the panel, the clean screen, a camera off the game's own, the bars,
  // your character hidden, a time of day or a weather of its own
  D.isOpen = () => shown || D.clean || D.mode !== 'follow' || !!D.box || D.hideMe || D.lt !== null || D.wi !== 0;
  let onSig = false;
  const syncOn = () => { const on = D.isOpen(); if (on !== onSig) { onSig = on; document.body.classList.toggle('cine-on', on); syncLayers(); } };
  // close: all of it off, the game's own camera back (Esc, B, the corner's button)
  function close() {
    trace('close');
    if (scene && scene.timer) clearTimeout(scene.timer);
    scene = null;
    stopReel(false);
    if (D.mode !== 'follow') setMode('follow');
    if (D.clean) setClean(false);
    D.hideMe = false; setBox(0); setTime(0); setWx(0); setZoom(3);
    toggle(false);
    syncOn();
  }
  D.close = close;

  function setClean(on) {
    D.clean = !!on;
    document.body.classList.toggle('cine-clean', D.clean);
    // (what the keys do: the cinematic hint strip, the first few times - client/hudinfo.js, which sees D.clean)
    render();
  }
  // mode: the camera's (follow, smooth, drift, drone, target, scene - the follow scenes; script - a director's scene, the
  // shot list's). keep: from a shot, the camera stays where it is (the hand-back: the free camera there)
  function setMode(m, k0 = 'tour', keep = false) {
    if (m !== D.mode) trace(`mode ${D.mode} -> ${m}`);
    if (m === 'scene' && !dev()) m = 'follow';
    if (m === 'script' && !sct) m = 'follow';
    const was = D.mode;
    D.mode = m;
    if ((was !== 'scene' || m !== 'scene') && !(keep && was === 'script')) { x = S.cam.x; y = S.cam.y; }
    inited = true;
    fadeTo(0);
    if (was === 'scene' && m !== 'scene') { api.send({ t: 'cine', f: 'stop' }); fs = null; fcam = null; D.zoomK = ZOOMS[D.zi]; }
    // out of a director's scene: the server's word on it ended it already (an 'off'), or this screen lets go of it - that
    // scene only (its seq: a word that arrives after the next scene began must not take the camera off the new one)
    if (was === 'script' && m !== 'script') { if (sct && !sct.cap && !sct.over) api.send({ t: 'dev', c: 'scene', k: 'stop', seq: sct.seq }); if (sct) D.hideMe = !!sct.hadHide; sct = null; if (keep) D.zi = nearZoom(D.zoomK); D.zoomK = ZOOMS[D.zi]; D.tags = false; }
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
  // a touch or click on the world: during a shot it hands you the camera (on the clean screen the first one only brings the
  // controls back); in the free camera a drag flies it (a phone has no WASD)
  const ours = (t) => !!(t && t.closest && t.closest('#cine-panel, #cine-ctl, #cine-x, #cine-shut, #menu, .overlay, #hud button'));
  let drag = null;
  addEventListener('pointerdown', (ev) => {
    if (ours(ev.target)) return;
    const shotOn = D.mode === 'script' || !!want;
    if (shotOn && D.clean && performance.now() - wokeAt > 3500) { wake(); return; }
    if (shotOn) handBack();
    else if (D.clean) wake();
    if (D.mode === 'drone') drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  }, true);
  addEventListener('pointermove', (ev) => {
    if (D.clean && (D.mode === 'drift' || D.mode === 'scene' || D.mode === 'script')) wake();
    if (drag && ev.pointerId === drag.id && D.mode === 'drone') { const z = S.cam.zoom || 1; x -= (ev.clientX - drag.x) / z; y -= (ev.clientY - drag.y) / z; drag.x = ev.clientX; drag.y = ev.clientY; here(); }
  }, true);
  const undrag = (ev) => { if (drag && ev.pointerId === drag.id) drag = null; };
  addEventListener('pointerup', undrag, true); addEventListener('pointercancel', undrag, true);
  function setZoom(i) {
    if (D.mode === 'script') { L.sz = Math.max(0, Math.min(ZOOMS.length - 1, i)); keep(); render(); return; }   // (a scene's: an offset on the script's own zoom, kept)
    D.zi = Math.max(0, Math.min(ZOOMS.length - 1, i)); D.zoomK = ZOOMS[D.zi]; render();
  }
  const zoomAt = () => (D.mode === 'script' ? L.sz : D.zi);
  function setTime(i) { D.ti = i; const m = TIMES[i][1]; D.lt = m === null ? null : loopOf(m); render(); }
  function setWx(i, quiet = false) {
    D.wi = i; const w = WXS[i][1];
    D.wx = w === 'mist' ? 'fog' : w;
    if (w === 'fog') S.fogForce = { k: 0.85, spread: 1 }; else if (w === 'mist') S.fogForce = { k: 0.45, spread: 0.45 }; else if (w === 'clear') S.fogForce = { k: 0, spread: 0 }; else S.fogForce = null;
    if (w === 'mist') D.wx = null;   // (mist: the fog's thinner veil over whatever the weather is)
    if (!quiet) render();
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

  // ---- the shot list: one shot, or the reel (a section or all of them, back to back) ----
  // A shot is a director's scene (server/systems/director.js): asked for with hold - the server puts the cast in place and
  // holds it at its first moment, this screen in black till its art is in (scriptStep), then 'go'. Its end ('off') plays
  // the next, or ends the reel: the camera back to you, the screen's own time and weather back.
  function playShot(id) {
    if (!dev()) { api.toast('The shot list runs the debug menu\'s scenes: turn on dev mode first (pause menu - Debug menu).', 'warn'); return; }
    if (scene && scene.timer) clearTimeout(scene.timer);
    scene = null;
    if (!before) before = { ti: D.ti, lt: D.lt, wi: D.wi, hide: D.hideMe, clean: D.clean };
    // (a saved view: 'view:' and its id - the server plays it as a shot there, views.js)
    const vw = String(id).startsWith('view:') ? views.list.find((q) => `view:${q.id}` === id) : null;
    want = vw ? { id: 'view', view: vw.id, n: vw.n, at: performance.now() } : { id, at: performance.now() };
    fadeTo(1);
    if (sct) sct.over = true;   // (the server ends it as the next starts: no word of ours needed)
    api.send(vw ? { t: 'dev', c: 'scene', view: vw.id, hold: 1 } : { t: 'dev', c: 'scene', id, hold: 1 });
    wake(); render();
  }
  D.play = (sec = '', from = '') => {   // the reel: a section ('' all of them; MORE the unreviewed), from one of its shots
    const ids = sec === MORE ? moreOf() : shotsOf(sec);
    if (!ids.length) return;
    reel = { ids, i: Math.max(0, ids.indexOf(from)), sec };
    playShot(reel.ids[reel.i]);
  };
  // one shot on its own (a tap on it): a reel of one - or, while a reel plays, a jump to it, the reel going on from there
  D.shot = (id) => { if (reel && reel.ids.length > 1 && reel.ids.includes(id)) { reel.i = reel.ids.indexOf(id); } else reel = { ids: [id], i: 0, sec: null }; playShot(id); };
  D.next = (dir = 1) => {
    if (!reel) return;
    reel.i += dir;
    if (reel.i < 0) reel.i = 0;
    if (reel.i >= reel.ids.length) { stopReel(true); return; }
    playShot(reel.ids[reel.i]);
  };
  // stop: the reel over and the shot ended; back: the camera to you (else it stays where it is: the free camera there)
  function stopReel(back) {
    if (reel || want || sct) trace(`stop ${back ? 'back' : 'keep'}`);
    const had = !!(reel || want || sct);
    if (want) dropId = want.id;
    reel = null; want = null; endAt = 0;
    if (sct && D.mode === 'script') setMode(back ? 'follow' : 'drone', 'tour', !back);
    if (before) { const b = before; before = null; if (back) { D.ti = b.ti; D.lt = b.lt; setWx(b.wi); D.hideMe = b.hide; setClean(b.clean); } }
    if (S.wx) S.wx.stormForce = null;
    S.bioForce = null;
    fadeTo(0);
    if (had) render();
  }
  D.stop = stopReel;
  // the hand-back (any key, touch or button but the camera's own): the shot stops, the camera's yours where it is
  function handBack() { if (!(reel || want || D.mode === 'script')) return false; stopReel(false); if (!D.clean) api.toast('Your camera - drag or WASD / the stick to fly it, Esc for your character.', 'info'); return true; }
  // a shot's own time of day and weather on this screen (its storm, the sea's sparkle)
  // - put on every frame the shot plays (the owner, 11-14 20:21: "They're all the same nighttime scene"): it had been set
  // once, at the shot's start, and anything after that took the screen back to the world's own hour; and unless he picks
  // a time or a weather in the panel during it (sct.own: his from then)
  function shotLook(sc, t, first = false) {
    const m = shotMinutes(sc, t);
    if (m !== undefined) { D.ti = -1; D.lt = loopOf(m); }
    const w = sc.weather || 'clear', wi = Math.max(0, WXS.findIndex((q) => q[1] === (w === 'storm' ? 'rain' : w)));
    if (first || D.wi !== wi) setWx(wi, !first);
    if (first) { if (S.wx) S.wx.stormForce = w === 'storm' ? 3 : null; S.bioForce = sc.bio ? [1, 0.5] : null; }
  }

  // ---- the staged scenes ----
  function runScene(i) {
    const sc = SCENES[i];
    if (!sc) return;
    if (!(S.dev || S.devMode)) { api.toast('The staged scenes use the debug menu\'s commands: turn on dev mode first (pause menu - Debug menu).', 'warn'); return; }
    if (scene && scene.timer) clearTimeout(scene.timer);
    scene = { sc, i: 0 };
    api.send({ t: 'dev', c: 'afoot' });   // (a clean start first: out of the home, off the train, out of the vehicle - the teleports want you on your feet)
    if (D.mode === 'drone' || D.mode === 'script') setMode('follow');
    const go = () => {
      const st = scene && scene.sc === sc ? sc.s[scene.i++] : null;
      if (!st) { done(); return; }
      scene.timer = setTimeout(() => { exec(st[1], st[2]); go(); }, st[0]);
    };
    const done = () => {
      if (sc.t !== undefined) { const k = TIMES.findIndex((q) => q[1] === sc.t); if (k >= 0) setTime(k); else D.lt = loopOf(sc.t); } else if (!sc.st) setTime(0);
      if (sc.wx) setWx(WXS.findIndex((q) => q[1] === sc.wx));
      setZoom(nearZoom(sc.z || 1));
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

  // ---- a recording of this screen (the owner's own computer, its GPU: the scenes at full speed) ----
  // the world's canvas and the overlay composited each frame into one, captured by the browser's MediaRecorder (VP9 or
  // H.264 as it offers, a high bit rate) and downloaded as a file when it stops. tools/capture.mjs is the steady,
  // frame-by-frame way (any machine, any speed); this is the quick one.
  let rec = null;
  function toggleRec() {
    if (rec) { rec.stop(); return; }
    const [W, H] = api.size(), out = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1);
    out.width = Math.round(W * dpr); out.height = Math.round(H * dpr);
    const c2 = out.getContext('2d');
    let on = true;
    const draw = () => { if (!on) return; api.grab((cv, world) => { c2.clearRect(0, 0, out.width, out.height); if (world && !world.classList.contains('hidden')) c2.drawImage(world, 0, 0, out.width, out.height); c2.drawImage(cv, 0, 0, out.width, out.height); }); requestAnimationFrame(draw); };
    const type = ['video/mp4;codecs=avc1.640033', 'video/webm;codecs=vp9', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type || !out.captureStream) { api.toast('This browser can\'t record the screen here.', 'warn'); return; }
    const chunks = [], mr = new MediaRecorder(out.captureStream(60), { mimeType: type, videoBitsPerSecond: 40e6 });
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      on = false; rec = null; render();
      const blob = new Blob(chunks, { type }), a = document.createElement('a'), d = new Date();
      a.href = URL.createObjectURL(blob); a.download = `city-life-auto_${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    };
    if (!D.clean) setClean(true);
    rec = mr; mr.start(1000); draw(); render();
    if (!D.clean) api.toast('Recording - F4 and stop it in the panel.', 'info');
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

  // ---- the owner's saved views (server/systems/views.js: kept on the server; the owner, 11-14 - he scouts the places, the
  // hero shots are refined from them) ----
  // views: the list as the server last said, can (may save, rename, delete: an admin or the owner), draft (the name and
  // note typed for the next save)
  const views = { list: [], can: false, asked: 0, draft: { n: '', note: '' } };
  D.views = (m) => { views.list = Array.isArray(m.list) ? m.list : []; views.can = !!m.can; if (m.saved) { views.draft = { n: '', note: '' }; } render(); };
  D.viewList = () => views.list;
  const askViews = () => { const t = performance.now(); if (dev() && t - views.asked > 30e3) { views.asked = t; api.send({ t: 'dev', c: 'views', k: 'list' }); } };
  // where the camera is now: its middle, its zoom (the director's own: on a shot, without the panel's offset), the time of
  // day and the weather on this screen
  function curView() {
    const [W, H] = api.size(), tall = (H || 1) > (W || 1);
    const z = D.mode === 'script' ? D.zoomK / (tall ? 0.85 : 1) / ZOOMS[L.sz] : D.zoomK;
    const w = S.wx && S.wx.stormForce ? 'storm' : D.wi > 0 ? WXS[D.wi][1] : S.weather === WEATHER.RAIN ? 'rain' : 'clear';
    return { x: Math.round(S.cam.x), y: Math.round(S.cam.y), z: +z.toFixed(3), t: Math.round(gameClock(D.lt !== null ? D.lt : S.loopTime || 0).minutes) % 1440, w };
  }
  D.curView = curView;
  // (its time of day goes as m: t is the message's own kind - spread in as t, it had made the save no message at all)
  function saveView() { const v = curView(); api.send({ t: 'dev', c: 'views', k: 'save', n: views.draft.n, note: views.draft.note, x: v.x, y: v.y, z: v.z, m: v.t, w: v.w }); }
  D.saveView = saveView;
  // go to one: the free camera there, at its zoom, its time and weather on this screen
  function goView(v) {
    stopReel(false);
    setMode('drone');
    x = v.x; y = v.y; D.vx = 0; D.vy = 0;
    D.zi = nearZoom(v.z); D.zoomK = v.z;
    D.ti = -1; D.lt = loopOf(v.t);
    setWx(Math.max(0, WXS.findIndex((q) => q[1] === (v.w === 'storm' ? 'rain' : v.w))), true);
    if (S.wx) S.wx.stormForce = v.w === 'storm' ? 3 : null;
    render();
  }
  D.goView = goView;
  D.playView = (v) => { reel = { ids: [`view:${v.id}`], i: 0, sec: null }; playShot(`view:${v.id}`); };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  function viewsPanel(panel, row, h, tip) {
    askViews();
    panel.append(h('Your saved views'));
    if (views.can) {
      const inp = (k, ph) => { const e = document.createElement('input'); e.type = 'text'; e.className = 'cine-in'; e.placeholder = ph; e.value = views.draft[k]; e.maxLength = k === 'n' ? 48 : 160; e.oninput = () => { views.draft[k] = e.value; }; return e; };
      panel.append(inp('n', 'Name (optional)'), inp('note', 'A note (optional)'), row(btn('★ Save this view', false, () => saveView())));
      panel.append(tip('Saves where the camera is, its zoom, the time and the weather - on the server.'));
    }
    if (!views.list.length) panel.append(tip(views.can ? 'None yet: frame a place (Free camera), set the time and weather, and save it.' : 'None yet.'));
    for (const v of views.list) {
      const go = btn('', false, () => goView(v), 'sc');
      go.textContent = v.n;
      const sm = document.createElement('small'); sm.textContent = ` - ${hhmm(v.t)}${v.w && v.w !== 'clear' ? `, ${v.w}` : ''}${v.note ? ` · ${v.note}` : ''}`;
      go.append(sm);
      go.title = 'Go there (the free camera)';
      go.style.flex = '1';
      const play = btn('▶', !!(want && want.view === v.id), () => D.playView(v));
      play.title = 'Play it as a shot';
      const r = row(go, play, ...(views.can ? [btn('✎', false, () => {
        if (typeof prompt !== 'function') return;
        const n = prompt('Name this view', v.n); if (n === null) return;
        const note = prompt('A note', v.note || '');
        api.send({ t: 'dev', c: 'views', k: 'rename', id: v.id, n, note: note === null ? v.note : note });
      }), btn('✕', false, () => { if (typeof confirm === 'function' && !confirm(`Delete "${v.n}"?`)) return; api.send({ t: 'dev', c: 'views', k: 'delete', id: v.id }); })] : []));
      r.style.flexWrap = 'nowrap';
      panel.append(r);
    }
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
  const zoomRow = () => [btn('－', false, () => setZoom(zoomAt() - 1)), btn('＋', false, () => setZoom(zoomAt() + 1))];
  // the bar along the bottom (drift / follow scenes / the shot playing): made again when what it shows changes
  const shotName = () => { const q = want ? (want.view ? { n: want.n } : DSCENES[want.id]) : sct ? sct.sc : null; return q ? `${q.n}${reel && reel.ids.length > 1 ? ` (${reel.i + 1}/${reel.ids.length})` : ''}` : ''; };
  function barShow() {
    // the clean screen (all the UI off) has nothing on it - the close X and the picture button too (the owner, 11-17: "there
    // is still an X at the top center"): back with the bar for a few seconds on a tap or a key; Esc / B still close the camera
    const woke = D.clean && performance.now() - wokeAt < 3500;
    if (woke !== wokeSig) { wokeSig = woke; document.body.classList.toggle('cine-woke', woke); }
    const shotOn = D.mode === 'script' || !!want, on0 = D.mode === 'drift' || D.mode === 'scene' || (shotOn && !(sct && sct.cap));
    document.body.classList.toggle('cine-bar', on0);   // (on a phone the bar takes the action buttons' corner: they do nothing while the camera has the controls)
    if (!on0) { if (bar) bar.style.display = 'none'; return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'cine-ctl'; bar.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); wake(); }); document.body.appendChild(bar); }
    const key = shotOn ? `p${shotName()}|${!!reel}` : D.mode === 'drift' ? `d${dr.si}` : `s${fs ? `${fs.k}|${fs.n}|${fs.tour}|${fs.none || 0}` : '-'}|${near}`;
    if (key !== barKey) {
      barKey = key; bar.textContent = ''; bar.dial = null;
      const who = (t) => Object.assign(document.createElement('span'), { className: 'who', textContent: t });
      if (shotOn) bar.append(...(reel && reel.ids.length > 1 ? [btn('⏮', false, () => D.next(-1))] : []), who(shotName() || 'Setting up the shot...'), ...(reel && reel.ids.length > 1 ? [btn('Next ⏭', false, () => D.next(1))] : []), btn('⏹ Stop', false, () => stopReel(true)), ...zoomRow());
      else if (D.mode === 'drift') { const dl = dial(); bar.dial = dl; bar.append(dl, ...speedRow(), ...zoomRow(), btn('✕', false, () => setMode('follow'))); }
      else bar.append(btn('◀', false, () => stepKind(-1)), who(fs ? (fs.none ? `Looking for: ${fs.n}` : fs.n) : 'Finding a scene...'), btn('▶', false, () => stepKind(1)), btn('Next', false, () => followKind('next')), btn('Tour', !!(fs && fs.tour), () => followKind('tour')), ...zoomRow(), btn('✕', false, () => setMode('follow')));
    } else if (bar.dial) bar.dial.show();
    const on = !D.clean || performance.now() - wokeAt < 3500;
    bar.style.display = 'flex'; bar.style.opacity = on ? '1' : '0'; bar.style.pointerEvents = on ? '' : 'none';
  }
  let openFly = false, openSelf = false;
  function render() {
    barKey = '';
    if (!panel || !shown) return;
    const row = (...bs) => { const r = document.createElement('div'); r.className = 'row'; for (const b of bs) r.appendChild(b); return r; };
    const h = (t) => { const e = document.createElement('h3'); e.textContent = t; return e; };
    const tip = (t, gold) => { const p = document.createElement('div'); p.className = 'tip'; if (gold) p.style.color = '#ffd23a'; p.textContent = t; return p; };
    panel.textContent = '';
    const title = document.createElement('div'); title.className = 'cine-head'; title.innerHTML = '<b>Camera</b> <small class="tip">- your screen only</small>';
    // (its close in the corner, the kit's X as every screen has it - the owner, 11-14 20:24: "Camera mode doesn't have an
    // X button to close it"; Esc and a pad's B close it too)
    const cx = document.createElement('button'); cx.type = 'button'; cx.id = 'cine-close'; cx.className = 'x'; cx.title = 'Close the camera (Esc, B)'; cx.setAttribute('aria-label', 'Close the camera'); cx.innerHTML = icon('close'); cx.onclick = () => close();
    title.append(cx);
    panel.append(title);
    // the shot list (debug mode's: it runs the debug menu's scenes) - each a tap; a section's ▶ or Play all back to back
    if (dev()) {
      const playing = reel || want || D.mode === 'script';
      panel.append(h('Shot list'), row(btn(`▶ Play all (${shotsOf('').length})`, !!(reel && reel.sec === ''), () => D.play('')), ...(playing ? [btn('⏭ Next', false, () => D.next(1)), btn('⏹ Stop', false, () => stopReel(true))] : []), ...(views.can ? [btn('★ Save this view', false, () => saveView())] : [])));
      if (playing) panel.append(tip(`Playing: ${shotName() || '...'}`, true));
      for (const [sec, name] of SECTIONS) {
        const ids = shotsOf(sec), open = L.open === sec;
        const hb = btn(`${open ? '▾' : '▸'} ${name} · ${ids.length}`, false, () => { L.open = open ? '' : sec; keep(); render(); }, 'sc');
        hb.style.flex = '1';
        const r = row(hb, btn('▶', !!(reel && reel.sec === sec), () => D.play(sec)));
        r.style.flexWrap = 'nowrap';
        panel.append(r);
        if (open) for (const id of ids) {
          const q = DSCENES[id], b = btn('', !!((want && want.id === id) || (sct && sct.sc.id === id)), () => D.shot(id), 'sc');
          b.innerHTML = `${q.n}${q.note ? ` <small>- ${q.note}</small>` : ''}`;
          b.style.paddingLeft = '14px';
          panel.append(b);
        }
      }
      // the rest: not through the sanity check yet - folded away, each still one tap (or all of them back to back)
      const more = moreOf(), mo = L.open === MORE;
      const mb = btn(`${mo ? '▾' : '▸'} More (unreviewed) · ${more.length}`, false, () => { L.open = mo ? '' : MORE; keep(); render(); }, 'sc');
      mb.style.flex = '1';
      const mr = row(mb, btn('▶', !!(reel && reel.sec === MORE), () => D.play(MORE)));
      mr.style.flexWrap = 'nowrap';
      panel.append(mr);
      if (mo) for (const id of more) {
        const q = DSCENES[id], b = btn('', !!((want && want.id === id) || (sct && sct.sc.id === id)), () => D.shot(id), 'sc');
        b.innerHTML = `${q.n}${q.note ? ` <small>- ${q.note}</small>` : ''}`;
        b.style.paddingLeft = '14px';
        panel.append(b);
      }
      panel.append(tip('One tap plays a shot: its place, time, weather, cast and camera move. Any key, touch or button hands you the camera where it is; Esc / B back to you.'));
      viewsPanel(panel, row, h, tip);
    }
    panel.append(h('Free camera'), row(...[['Follow me', 'follow'], ['Smooth', 'smooth'], ['Free', 'drone'], ['Drift', 'drift'], ['On someone', 'target'], ...(dev() ? [['Follow scenes', 'scene']] : [])].map(([n, m]) => btn(n, D.mode === m, () => { stopReel(false); setMode(m); }))));
    if (D.mode === 'drift') {
      const dirs = document.createElement('div'); dirs.className = 'dirs';
      for (const i of [7, 0, 1, 6, -1, 2, 5, 4, 3]) dirs.append(i < 0 ? dial() : btn(DIRS8[i][0], Math.abs(wrapA(dr.a - DIRS8[i][1])) < 0.05, () => setDriftWay(DIRS8[i][1])));
      dirs.children[4].classList.add('sm');
      panel.append(h('Drift: which way (or drag the dial)'), dirs, h('Drift: how fast'), row(...DRIFT_NAMES.map((n, i) => btn(n, dr.si === i, () => setDrift(i)))));
    }
    if (D.mode === 'scene') {
      panel.append(h('Follow scenes'), row(btn('Near me', near, () => { near = true; if (fs) followKind(fs.tour ? 'tour' : fs.k); render(); }), btn('Anywhere', !near, () => { near = false; if (fs) followKind(fs.tour ? 'tour' : fs.k); render(); }), btn('▶ The tour', !!(fs && fs.tour), () => followKind('tour')), btn('Next (N)', false, () => followKind('next'))));
      if (fs) panel.append(tip(fs.none ? `Nobody's at it right now: ${fs.n} - still looking` : `On: ${fs.n}`, true));
      let g = '';
      for (const q of CINE_KINDS) {
        if (q.g !== g) { g = q.g; panel.append(tip(g, true)); }
        panel.append(btn(q.n, !!(fs && !fs.tour && fs.k === q.id), () => followKind(q.id), 'sc'));
      }
    }
    if (D.mode === 'smooth' || D.mode === 'target') {
      const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '1'; r.step = '0.05'; r.value = String(D.smooth);
      r.oninput = () => { D.smooth = +r.value; };
      panel.append(h('Smoothing (loose - tight)'), r);
    }
    if (D.mode === 'target') panel.append(row(btn('◀ Previous ([)', false, () => nextTarget(-1)), btn('Next (]) ▶', false, () => nextTarget(1))));
    const tips = { drone: 'Free: WASD / arrows / left stick (or drag on a phone) fly it, Q / E zoom, Shift faster, Esc back to you.', drift: 'Drift: a pan across wherever you are. WASD / arrows / the left stick steer it, Z / X or LB / RB slower / faster, Space stops it, Q / E or LT / RT zoom.', scene: 'Follow scenes: the camera on someone doing something, near you or anywhere - it moves on when they\'re done. N / A the next one, [ ] / LB RB the kind, T the tour, Esc / B back to you.', target: 'On someone: the people and vehicles near you, nearest first.', smooth: 'Smooth: the camera trails you, like a camera operator.' };
    if (tips[D.mode]) panel.append(tip(tips[D.mode]));
    panel.append(h(D.mode === 'script' ? 'Zoom (on the shot\'s own)' : 'Zoom'), row(btn('－', false, () => setZoom(zoomAt() - 1)), btn(`${Math.round(100 / ZOOMS[zoomAt()])}%`, false, () => setZoom(3)), btn('＋', false, () => setZoom(zoomAt() + 1))));
    panel.append(h('Screen'), row(btn(D.clean ? 'Clean screen: on (F2)' : 'Clean screen (F2)', D.clean, () => setClean(!D.clean)), btn('Picture (F8)', false, shot), btn('Hide panel (F4)', false, () => toggle(false))),
      row(btn('Hide my character', D.hideMe, () => { D.hideMe = !D.hideMe; render(); }), btn('No shake', D.noShake, () => { D.noShake = !D.noShake; render(); })),
      h('Letterbox'), row(...BOXES.map(([n], i) => btn(n, D.bi === i, () => setBox(i)))));
    // what's drawn (this screen only; kept in this browser)
    panel.append(h('Show'), row(...LAYERS.map(([k, n]) => btn(`${L[k] ? '☑' : '☐'} ${n}`, L[k], () => flip(k)))));
    panel.append(h('Time of day'), row(...TIMES.map(([n], i) => btn(n, D.ti === i, () => { if (sct) sct.own = true; setTime(i); }))));
    panel.append(h('Weather'), row(...WXS.map(([n], i) => btn(n, D.wi === i, () => { if (sct) sct.own = true; setWx(i); }))));
    if (!dev()) return;   // (the rest - the Showcase, the staged scenes - debug mode's: they move you and run its commands)
    panel.append(h('More'), row(btn(rec ? '⏺ Recording... (stop)' : '⏺ Record this screen', !!rec, () => toggleRec())));
    // the Showcase: the hand-crafted places, a press to fly the free camera there
    panel.append(btn(`${openFly ? '▾' : '▸'} Fly to a place (the Showcase)`, false, () => { openFly = !openFly; render(); }, 'sc'));
    if (openFly && !shows) { panel.append(tip('Finding the places...')); loadShows().then(render); }
    else if (openFly) {
      let sg = '';
      showList().forEach((q, i) => {
        if (q.g !== sg) { sg = q.g; panel.append(tip(sg, true)); }
        const b = btn('', showAt === i && D.mode === 'drone', () => { stopReel(false); showcaseGo(i); }, 'sc');
        b.innerHTML = `${q.n}${q.at ? '' : ' <small>- not on this map</small>'}${q.note ? ` <small>- ${q.note}</small>` : ''}`;
        if (!q.at) b.disabled = true;
        panel.append(b);
      });
    }
    // the staged scenes you play yourself (the debug menu's commands: you at the wheel, on the job...)
    panel.append(btn(`${openSelf ? '▾' : '▸'} Play it yourself (staged scenes)`, false, () => { openSelf = !openSelf; render(); }, 'sc'));
    if (openSelf) {
      let g = '';
      SCENES.forEach((sc, i) => {
        if (sc.g !== g) { g = sc.g; panel.append(tip(g, true)); }
        const b = btn('', false, () => { stopReel(false); runScene(i); }, 'sc');
        b.innerHTML = `${sc.n}${sc.note ? ` <small>- ${sc.note}</small>` : ''}`;
        panel.append(b);
      });
    }
  }
  function toggle(on = !shown) {
    shown = on;
    if (on && !panel) { panel = document.createElement('div'); panel.id = 'cine-panel'; panel.addEventListener('keydown', (e) => e.stopPropagation()); document.body.appendChild(panel); }
    if (panel) panel.style.display = on ? '' : 'none';
    render();
  }

  // ---- what main.js calls ----
  // the panel by keys or the pad: a step through its buttons, a press of the one with the focus
  function navPanel(dir) {
    const bs = [...panel.querySelectorAll('button:not([disabled])')];
    if (!bs.length) return;
    const i = bs.indexOf(document.activeElement), j = i < 0 ? 0 : (i + dir + bs.length) % bs.length;
    bs[j].focus(); bs[j].scrollIntoView({ block: 'nearest' });
  }
  function pressPanel() { const a = document.activeElement; if (panel && a && panel.contains(a) && a.tagName === 'BUTTON') { a.click(); return true; } return false; }
  D.key = (k, down) => {
    if (down && k === 'F2') { setClean(!D.clean); return true; }
    if (down && k === 'F4') { toggle(); if (shown) navPanel(0); return true; }
    // the panel up: the arrows and Enter are its, whatever the camera's doing (the camera flies on WASD / the stick) - with
    // the tour on they had been the tour's, and a scene couldn't be picked from the keyboard (the owner, 11-14)
    if (shown && panel && down && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowRight' || ((k === 'Enter' || k === 'Space') && panel.contains(document.activeElement)))) {
      if (k === 'ArrowDown' || k === 'ArrowRight') navPanel(1); else if (k === 'ArrowUp' || k === 'ArrowLeft') navPanel(-1); else pressPanel();
      return true;
    }
    if (shown && panel && down && k === 'Escape' && panel.contains(document.activeElement)) { toggle(false); return true; }
    if (down && k === 'F8') { shot(); return true; }
    // a shot playing: N the next, Q / E the zoom, Esc back to you; any other key hands you the camera (and does its thing)
    if ((D.mode === 'script' || want) && down) {
      if (k === 'Escape') { stopReel(true); return true; }
      if (k === 'KeyN') { D.next(1); return true; }
      if (handsBack(k)) handBack();
    }
    if (D.mode === 'target' && down && (k === 'BracketLeft' || k === 'BracketRight')) { nextTarget(k === 'BracketRight' ? 1 : -1); return true; }
    if (down && k === 'Escape' && !D.holds() && D.isOpen()) { close(); return true; }   // (Esc: out of the camera)
    if (!D.holds()) return false;
    if (down) { here(); wake(); }
    if (down && k === 'Escape') { setMode('follow'); return true; }
    const zoomKey = D.mode === 'drone' || D.mode === 'drift' || D.mode === 'scene' || D.mode === 'script';
    if (zoomKey && down && (k === 'KeyQ' || k === 'Minus')) { setZoom(zoomAt() - 1); return true; }
    if (zoomKey && down && (k === 'KeyE' || k === 'Equal')) { setZoom(zoomAt() + 1); return true; }
    if (D.mode === 'script' && down && k === 'Digit0') { setZoom(3); return true; }   // (0: the scene's own zoom again)
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
    const I = api.input || {}, t = performance.now();
    if (shown && panel) {   // (the panel up: the D-pad steps through it, A presses, B closes it - Y too)
      if (I.menuNav) { navPanel(I.menuNav > 0 ? 1 : -1); here(); return; }
      if (I.menuLR) { navPanel(I.menuLR > 0 ? 1 : -1); here(); return; }
      if (I.menuSelect && pressPanel()) return;
      if (I.menuBack || I.padY) { toggle(false); return; }
    }
    if (!D.holds()) { if (I.menuBack && D.isOpen()) close(); return; }   // (B: out of the camera)
    if (D.mode === 'script' || want) {   // a shot playing: B back to you, A / RB the next, LB the one before; the stick or any other button hands you the camera
      if (I.menuBack) { stopReel(true); return; }
      if (I.menuSelect || I.menuTab > 0) { D.next(1); return; }
      if (I.menuTab < 0) { D.next(-1); return; }
      if ((a && Math.hypot(a.lx || 0, a.ly || 0) > 0.5) || I.menuNav || I.menuLR) handBack();
    }
    if (I.menuBack || I.padX || I.padY || I.menuTab || I.menuSelect || (a && (Math.hypot(a.lx || 0, a.ly || 0) > 0.3 || (a.lt || 0) > 0.3 || (a.rt || 0) > 0.3))) { wake(); here(); }
    if (I.menuBack) { setMode('follow'); return; }
    if (I.padY) { toggle(); if (shown) navPanel(0); }
    if (I.padX) shot();
    if (D.mode === 'drift' && I.menuTab) setDrift(dr.si + I.menuTab);
    if (D.mode === 'scene' && I.menuTab) stepKind(I.menuTab);
    if (D.mode === 'scene' && I.menuSelect) followKind('next');
    if (a && D.mode !== 'drone' && t - padZoomAt > 260) {   // (the drone zooms with Q / E; held, a trigger steps the zoom - a scene's offset in a scene)
      if ((a.rt || 0) > 0.5) { setZoom(zoomAt() + 1); padZoomAt = t; } else if ((a.lt || 0) > 0.5) { setZoom(zoomAt() - 1); padZoomAt = t; }
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
  // the subject's ground point (an aircraft drawn up by its height: all the way up, as main.js has your own - camLift)
  function subjectAt(e) {
    let ex = e.rx, ey = e.ry;
    const def = e.kind === K.VEH && e.d ? VEHICLE_BY_INDEX[e.d.m] : null;
    if (def && def.kind === 'air' && S.airMod && S.airMod.camLift && S.art2 && S.art2.ready) ey -= S.airMod.camLift(e.ralt ?? (e.extra | 0) * 4);
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
  // ---- the scene director's scenes ----
  const anchorsOf = (a) => { const out = {}; for (const [k, q] of Object.entries(a || {})) out[k] = { x: q[0], y: q[1], a: q[2] || 0 }; return out; };
  // The server's word on a director's scene: { id, seq, tick0, cast, anchors, bt, cap, held } - a new one (the camera on
  // its script), more of the same one (someone new in the cast, a beat begun, let go after its hold), or { off, seq } over.
  // An 'off' is the server's: nothing goes back (it used to send 'unwatch', which reached the server after the next scene
  // had begun and took the camera off that one - the owner's "won't let me switch scenes", 11-14).
  D.script = (m) => {
    if (m.off) {
      if (!sct || (m.seq && m.seq !== sct.seq)) return;   // (an old one's: the one playing now stays)
      const cap = sct.cap, sc = sct.sc;
      sct.over = true;
      if (reel && !want) {   // (the shot list: a fade, then the next - or the end of it)
        fadeTo(1);
        endAt = performance.now();
        setTimeout(() => { if (!reel || want || (sct && !sct.over)) return; reel.i + 1 < reel.ids.length ? D.next(1) : stopReel(true); }, END_FADE);
        return;
      }
      if (want) return;   // (the next is on its way: its own 'dscene' takes over)
      stopReel(true);
      sct = null;
      if (!cap && !D.clean) api.toast(`${sc.n}: over.`, 'info');
      return;
    }
    if (sct && m.seq === sct.seq) {   // (more of the same scene: someone new in the cast, a beat begun)
      if (m.bt) Object.assign(sct.bt, m.bt);
      if (m.tick0 !== undefined) sct.tick0 = m.tick0;   // (held at its first moment, then let go)
      if (m.cast) sct.cast = m.cast;
      if (m.anchors) sct.anchors = anchorsOf(m.anchors);
      if (m.held === 0 && sct.held) { sct.held = false; fadeTo(0); }
      return;
    }
    const sc = m.view ? viewScene(m.view) : m.id && DSCENES[m.id];   // (m.view: a saved view played as a shot)
    if (!sc) return;
    if (!m.cap && dropId === m.id && !(want && want.id === m.id)) { dropId = ''; api.send({ t: 'dev', c: 'scene', k: 'stop', seq: m.seq }); return; }   // (stopped while it was being set up)
    dropId = '';
    if (want && want.id === m.id) want = null;
    if (!before && !m.cap) before = { ti: D.ti, lt: D.lt, wi: D.wi, hide: D.hideMe, clean: D.clean };   // (the debug menu's too: put back after)
    const hadHide = sct ? sct.hadHide : D.hideMe;
    if (sct) sct.over = true;
    sct = { sc, seq: m.seq, tick0: m.tick0, cast: m.cast || {}, anchors: anchorsOf(m.anchors), bt: { ...(m.bt || {}) }, cap: !!m.cap, vel: new Map(), cam: null, shot: -2, held: !!m.held, heldAt: performance.now(), told: false };
    sct.hadHide = hadHide; D.hideMe = true;   // (your own character out of it)
    if (sct.cap) { setClean(true); D.noShake = true; D.tags = true; L.tags = true; document.body.classList.add('cine-cap'); }   // (the capture: the clean screen, the players' name tags, no close button)
    if (!sct.cap) shotLook(sc, 0, true);
    if (D.mode !== 'script') setMode('script');
    else { x = S.cam.x; y = S.cam.y; }
    fadeTo(sct.held && !sct.cap ? 1 : 0);   // (setMode clears it: black while held - a capture's frames never)
    render();
  };
  D.scriptOn = () => !!sct;
  // where a walk-in's roof is lifted from (main.js interiorTick): the shot's camera - someone it follows inside a bar is
  // seen at the table, not under the roof (null: your own place, as ever)
  // - and false: no roof lifted at all. A shot keeps every roof drawn solid (the owner, 11-14 20:21: "It's toggling between
  // interior and exterior shots" - its camera lifted each walk-in's roof as it passed over it), unless it's an interior
  // (sc.interior: the pool shot's bar room)
  D.roofAt = () => (D.mode === 'script' && sct ? (sct.sc.interior ? { x, y } : false) : null);
  function castEnt(cid) {
    const id = sct.cast[cid];
    let e = id ? S.ents.get(id) : null;
    if (!e || e.rx === undefined) return null;
    if (e.kind === K.PED && e.parent) { const v = S.ents.get(e.parent); if (v && v.rx !== undefined && v.kind === K.VEH) e = v; }   // (in a vehicle: the vehicle)
    return e;
  }
  function scriptStep(dt) {
    if (!sct) return;
    const t = sct.held ? 0 : (S.renderTick - sct.tick0) / 20;
    if (!sct.cap && !sct.own) shotLook(sct.sc, Math.max(0.01, t));   // (its own hour every frame - a time-lapse's clock on through it)
    // the cast's velocities, smoothed (a shot's lead: where they're going)
    const k = 1 - Math.exp(-3 * dt);
    for (const cid of Object.keys(sct.cast)) {
      const e = castEnt(cid);
      if (!e) continue;
      let q = sct.vel.get(e.id);
      if (!q) { q = { px: e.rx, py: e.ry, vx: 0, vy: 0 }; sct.vel.set(e.id, q); continue; }
      const ivx = dt > 0 ? (e.rx - q.px) / dt : 0, ivy = dt > 0 ? (e.ry - q.py) / dt : 0;
      if (Math.hypot(ivx, ivy) < 3000) { q.vx += (ivx - q.vx) * k; q.vy += (ivy - q.vy) * k; }
      q.px = e.rx; q.py = e.ry;
    }
    const ctx = { anchors: sct.anchors, beatAt: (id) => sct.bt[id], ent: (cid) => { const e = castEnt(cid); if (!e) return null; const q = sct.vel.get(e.id), [ex, ey] = subjectAt(e); return { x: ex, y: ey, a: e.ra || 0, vx: q ? q.vx : 0, vy: q ? q.vy : 0 }; } };   // (an aircraft where it's drawn: up by its height - subjectAt)
    const c = camAt(sct.sc, Math.max(0, t), ctx, sct.cam);
    // held at its first moment (black): once the camera's on its first shot and the art there is in - or HOLD_MAX - the
    // server's told to go on (the shot list's scenes; a capture's are the capture's to let go)
    if (sct.held && !sct.told && !sct.cap) {
      const el = performance.now() - sct.heldAt, w = c && S.art2 && S.art2.warmth ? S.art2.warmth() : null;
      if (el > HOLD_MAX || (el > HOLD_MIN && c && (!S.art2 || (w && w.ok && w.scrHave >= w.scr && !S.art2.warming)))) { sct.told = true; api.send({ t: 'dev', c: 'scene', k: 'go', seq: sct.seq }); }   // (warming: the page's 'Loading the area' veil up after the camera's jump - client/warmup.js)
    }
    if (!c) return;
    const tall = (api.size()[1] || 1) > (api.size()[0] || 1);
    // a cut (or the first shot): there at once; otherwise a light follow over the shot's own path (no jitter from the
    // interpolation)
    if (c.i !== sct.shot && c.cut) { x = c.x; y = c.y; D.snapZoom = true; }
    else { const f = 1 - Math.exp(-6 * dt); x += (c.x - x) * f; y += (c.y - y) * f; }
    sct.shot = c.i;
    sct.cam = { x: c.x, y: c.y, z: c.z };
    D.zoomK = c.z * ZOOMS[L.sz] * (tall ? 0.85 : 1);   // (the script's zoom, times the panel's offset on it)
  }
  D.sky = (sky) => { if (D.wx === 'clear' || (D.isOpen() && !L.rain)) { sky.rain = 0; } };
  // what main.js draws over people while the camera's open: { tags, marks } (null: as ever)
  D.labels = () => (D.isOpen() ? { tags: L.tags || D.tags, marks: L.marks } : null);
  // a 'say' (an NPC's spoken line) shown? Not while the camera's open with the bubbles off
  D.noSay = () => D.isOpen() && !L.bubbles;
  // an entity left out of the picture by the Show toggles (never the scene's own cast, never you or yours)
  const castIds = () => (sct ? new Set(Object.values(sct.cast)) : null);
  let castSet = null, castAt = -1, castN = -1;
  D.hidden = (e) => {
    if (!D.isOpen() || (L.players && L.peds && L.traffic)) return false;
    const n = sct ? Object.keys(sct.cast).length : 0;
    if (castAt !== sct || castN !== n) { castSet = castIds(); castAt = sct; castN = n; }
    if (castSet && castSet.has(e.id)) return false;
    if (e.kind === K.VEH) { if (Math.abs((e.rx || 0) - (e.mvX ?? e.rx)) > 0.5) e.moved = true; e.mvX = e.rx; return !L.traffic && !!e.moved && !(castSet && [...castSet].some((id) => { const q = S.ents.get(id); return q && q.parent === e.id; })); }
    if (e.kind !== K.PED || !e.d) return false;
    if (e.parent) { const v = S.ents.get(e.parent); if (v && v.kind === K.VEH) return D.hidden(v); }
    if (e.d.pl) return !L.players;
    return !L.peds && !String(e.d.ar || '').startsWith('pet:');
  };
  D.cam = (cam, dt, tx, ty) => {
    // (down: the panel shuts and the camera comes back to you - the death screen's choices take the keys and the screen)
    if (S.me && S.me.dead) { if (shown) toggle(false); if (D.holds()) setMode('follow'); }
    if (D.noShake) cam.shake = 0;
    if (!inited) { x = cam.x; y = cam.y; inited = true; }
    barShow(); syncOn();
    const lag = (k) => 1 - Math.exp(-k * dt);
    // a shot asked for that never came (no place for it on this map: the server said why): the next, or the end
    if (want && performance.now() - want.at > 12e3) {
      const q = DSCENES[want.id];
      want = null;
      if (reel && reel.i + 1 < reel.ids.length) D.next(1); else { stopReel(true); api.toast(`${q ? q.n : 'That shot'}: couldn't be set up here.`, 'warn'); }
    }
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
    else if (D.mode === 'script') scriptStep(dt);
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
    }
    cam.x = x; cam.y = y;
  };
  toggle(false);
  return D;
}
