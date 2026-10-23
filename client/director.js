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
// main.js asks it each frame: holds() (the keys are the camera's), cam(cam, dt, tx, ty), zoomK, lt (the time of day's
// loop time or null), wx (null | 'clear' | 'rain' | 'fog'), sky(sky), hideMe, clean; key(k, down), pad(axes).
import { DAY_LOOP_S, DAY_PART_S, K } from '../shared/constants.js';

const ZOOMS = [0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1];
const TIMES = [['Live', null], ['Dawn', 390], ['Morning', 540], ['Noon', 720], ['Afternoon', 930], ['Golden hour', 1125], ['Dusk', 1205], ['Night', 1380], ['Small hours', 180]];
const WXS = [['Live', null], ['Clear', 'clear'], ['Rain', 'rain'], ['Fog', 'fog'], ['Mist', 'mist']];
const BOXES = [['Off', 0], ['2.39:1', 2.39], ['1.85:1', 1.85]];
const SHOT_S = 10, FADE_S = 0.7, HOLD_S = 1.6;   // the tour: each shot, the fade either side, the black while the art comes in

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
  { g: 'Action', n: 'A tanker goes up by a row of cars', s: [[0, 'place', { n: 'Port Westport' }], [2500, 'blast', { k: 'row' }]], cam: 'follow', z: 0.85 },
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
  { g: 'Police', n: 'On patrol in a cruiser', s: [[0, 'cop', {}], [600, 'place', { n: 'Civic Center' }], [2500, 'car', { m: 'police', in: 1 }]], cam: 'smooth', z: 0.9 },
  { g: 'Police', n: 'Police helicopter', s: [[0, 'cop', {}], [600, 'near', { k: 'helipad' }], [2500, 'car', { m: 'policeheli', in: 1 }]], t: 1380, cam: 'smooth', z: 0.8 },
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
  { g: 'Life', n: 'At home', s: [[0, 'homein', {}]], cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'The garden', s: [[0, 'garden', {}]], cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'Fishing a river at dawn', s: [[0, 'fish', { k: 'go', w: 'river' }]], t: 390, cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'Fishing out at sea', s: [[0, 'fish', { k: 'boat' }]], t: 1125, cam: 'smooth', z: 1 },
  { g: 'Life', n: 'Hunting: wolves run down a deer', s: [[0, 'place', { n: 'Highland Woods' }], [2500, 'animal', { scene: 'wolves' }]], cam: 'follow', z: 0.9 },
  { g: 'Life', n: 'Wildlife: a bear fishing', s: [[0, 'animal', { scene: 'bear' }]], cam: 'follow', z: 1.2 },
  { g: 'Life', n: 'Wildlife: an eagle takes a rabbit', s: [[0, 'animal', { scene: 'eagle' }]], cam: 'follow', z: 1 },
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
  let axes = null, panel = null, shown = false, x = 0, y = 0, inited = false, target = 0, tour = null, drift = null, scene = null, fade = null;
  D.holds = () => D.mode === 'drone' || D.mode === 'tour';

  // ---- the page's own bits: the clean screen's rule, the bars, the fade ----
  const css = document.createElement('style');
  css.textContent = `body.cine-clean #hud, body.cine-clean #touch, body.cine-clean #wheel, body.cine-clean #menu, body.cine-clean #toasts { display: none !important; }
body.cine-clean #view, body.cine-clean #world { cursor: none; }
.cine-bar { position: fixed; left: 0; right: 0; height: 0; background: #000; z-index: 60; pointer-events: none; transition: height .5s ease; }
#cine-fade { position: fixed; inset: 0; background: #000; opacity: 0; z-index: 61; pointer-events: none; transition: opacity .6s ease; }
#cine-panel { position: fixed; right: 12px; top: 12px; width: 290px; max-height: calc(100vh - 24px); overflow: auto; z-index: 70; background: rgba(14,16,22,.94); color: #e8eaf0; font: 12px/1.35 system-ui, sans-serif; border: 1px solid #39404e; border-radius: 10px; padding: 10px 12px; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
#cine-panel h3 { margin: 10px 0 4px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9aa6c0; }
#cine-panel .row { display: flex; flex-wrap: wrap; gap: 4px; }
#cine-panel button { background: #262c38; color: #e8eaf0; border: 1px solid #3c4454; border-radius: 6px; padding: 4px 7px; font: inherit; cursor: pointer; }
#cine-panel button.on { background: #ffd23a; color: #1a1a1a; border-color: #ffd23a; }
#cine-panel .sc { display: block; width: 100%; text-align: left; margin: 2px 0; }
#cine-panel .sc small { color: #9aa6c0; }
#cine-panel .tip { color: #9aa6c0; margin: 6px 0 0; }
#cine-panel input[type=range] { width: 100%; }`;
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
    if (D.clean && !shown) api.toast('Clean screen: F2 brings the HUD back, F4 the cinematic panel, F8 takes a picture.', 'info');
    render();
  }
  function setMode(m) {
    D.mode = m;
    const [cx, cy] = [S.cam.x, S.cam.y];
    x = cx; y = cy; inited = true;
    if (m !== 'tour') { if (tour) D.zoomK = ZOOMS[D.zi]; tour = null; fadeTo(0); }
    if (m === 'tour') startTour();
    if (m === 'target') nextTarget(1);
    if (m === 'drift') { const a = (performance.now() / 1000) % 6.283; drift = { vx: Math.cos(a) * 26, vy: Math.sin(a) * 18 }; }
    render();
  }
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
  function render() {
    if (!panel || !shown) return;
    const btn = (label, on, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (on) b.classList.add('on'); if (cls) b.classList.add(cls); b.onclick = (ev) => { ev.stopPropagation(); fn(); b.blur(); }; return b; };
    const row = (...bs) => { const r = document.createElement('div'); r.className = 'row'; for (const b of bs) r.appendChild(b); return r; };
    const h = (t) => { const e = document.createElement('h3'); e.textContent = t; return e; };
    panel.textContent = '';
    const title = document.createElement('div'); title.innerHTML = '<b>Cinematic mode</b> <span style="color:#9aa6c0">- your screen only</span>';
    panel.append(title,
      h('Screen'), row(btn(D.clean ? 'Clean screen: on (F2)' : 'Clean screen (F2)', D.clean, () => setClean(!D.clean)), btn('Picture (F8)', false, shot), btn('Hide panel (F4)', false, () => toggle(false))),
      row(btn('Hide my character', D.hideMe, () => { D.hideMe = !D.hideMe; render(); }), btn('No shake', D.noShake, () => { D.noShake = !D.noShake; render(); })),
      h('Letterbox'), row(...BOXES.map(([n], i) => btn(n, D.bi === i, () => setBox(i)))),
      h('Camera'), row(...[['Follow', 'follow'], ['Smooth', 'smooth'], ['Drift', 'drift'], ['Drone', 'drone'], ['On someone', 'target'], ['Tour', 'tour']].map(([n, m]) => btn(n, D.mode === m, () => setMode(m)))));
    if (D.mode === 'smooth' || D.mode === 'target') {
      const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '1'; r.step = '0.05'; r.value = String(D.smooth);
      r.oninput = () => { D.smooth = +r.value; };
      panel.append(h('Smoothing (loose - tight)'), r);
    }
    if (D.mode === 'target') panel.append(row(btn('◀ Previous ([)', false, () => nextTarget(-1)), btn('Next (]) ▶', false, () => nextTarget(1))));
    const tips = { drone: 'Drone: WASD / arrows / left stick fly it, Q / E zoom, Shift faster, Esc back to you.', tour: 'Tour: the camera glides through the world\'s sights on its own. Esc ends it.', drift: 'Drift: a slow pan across wherever you are - scenery shots.', target: 'On someone: the people and vehicles near you, nearest first.', smooth: 'Smooth: the camera trails you, like a camera operator.' };
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
    if (down && k === 'Escape') { setMode('follow'); return true; }
    if (D.mode === 'drone' && down && (k === 'KeyQ' || k === 'Minus')) { setZoom(D.zi - 1); return true; }
    if (D.mode === 'drone' && down && (k === 'KeyE' || k === 'Equal')) { setZoom(D.zi + 1); return true; }
    if (down) keys.add(k); else keys.delete(k);
    return true;
  };
  D.pad = (a) => { axes = a; };
  D.sky = (sky) => { if (D.wx === 'clear') { sky.rain = 0; } };
  D.cam = (cam, dt, tx, ty) => {
    if (D.noShake) cam.shake = 0;
    if (!inited) { x = cam.x; y = cam.y; inited = true; }
    const lag = (k) => 1 - Math.exp(-k * dt);
    if (D.mode === 'follow') { x = cam.x; y = cam.y; return; }
    if (D.mode === 'smooth') { const k = 0.6 + D.smooth * 5; x += (tx - x) * lag(k); y += (ty - y) * lag(k); }
    else if (D.mode === 'drift') { x += drift.vx * dt; y += drift.vy * dt; }
    else if (D.mode === 'target') {
      const e = S.ents.get(target);
      if (!e || e.rx === undefined) { nextTarget(1); return; }
      const k = 0.8 + D.smooth * 5; x += (e.rx - x) * lag(k); y += (e.ry - y) * lag(k);
    } else if (D.mode === 'drone') {
      let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (axes && Math.hypot(axes.lx || 0, axes.ly || 0) > 0.15) { mx = axes.lx; my = axes.ly; }
      const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1500 : 480) / (cam.zoom || 1);
      D.vx = (D.vx || 0) + (mx * sp - (D.vx || 0)) * lag(4); D.vy = (D.vy || 0) + (my * sp - (D.vy || 0)) * lag(4);
      x += D.vx * dt; y += D.vy * dt;
    } else if (D.mode === 'tour' && tour) tourStep(cam, dt);
    cam.x = x; cam.y = y;
  };
  toggle(false);
  return D;
}
