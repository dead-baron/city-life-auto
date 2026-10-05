// Atmosphere: what the sky is doing at a given time of day and weather - the colour the world is
// lit by, where the sun is (shadow direction and length), how much the street lights matter, the
// colour graded over the screen (sunrise rose, golden hour, sunset, blue hour), what the water
// reflects, and whether there's fog. Everything is a pure function of the shared game clock and the
// weather, so every player sees the same sky at the same moment.
import { DAY_LOOP_S } from '../../shared/constants.js';

// Key frames over the 24 h clock (minutes). amb: the multiply colour the world is lit by (1 = full
// daylight); grade: an additive tint over the screen [r,g,b,a]; sky: what water reflects; sun: how
// strong the sun's shadows are; night: how much artificial lights count (0 day .. 1 night).
const KEYS = [
  { m: 0, amb: [0.2, 0.24, 0.46], grade: [40, 60, 140, 0.05], sky: [30, 44, 92], sun: 0, night: 1 },
  { m: 300, amb: [0.22, 0.25, 0.48], grade: [50, 60, 140, 0.05], sky: [34, 46, 96], sun: 0, night: 1 },
  { m: 345, amb: [0.38, 0.36, 0.58], grade: [150, 90, 170, 0.08], sky: [96, 80, 140], sun: 0, night: 0.85 },   // first light
  { m: 375, amb: [0.8, 0.66, 0.7], grade: [255, 140, 130, 0.08], sky: [232, 140, 150], sun: 0.25, night: 0.4 }, // sunrise: rose
  { m: 405, amb: [0.98, 0.86, 0.76], grade: [255, 180, 110, 0.07], sky: [250, 190, 140], sun: 0.6, night: 0.06 },  // the sun clears the horizon
  { m: 480, amb: [1, 0.95, 0.88], grade: [255, 220, 170, 0.04], sky: [170, 205, 240], sun: 0.9, night: 0 },
  { m: 600, amb: [1, 1, 0.98], grade: [255, 255, 255, 0], sky: [150, 200, 245], sun: 1, night: 0 },
  { m: 900, amb: [1, 1, 1], grade: [255, 255, 255, 0], sky: [150, 200, 245], sun: 1, night: 0 },
  { m: 1020, amb: [1, 0.96, 0.88], grade: [255, 200, 120, 0.05], sky: [180, 200, 230], sun: 0.95, night: 0 },     // golden hour begins
  { m: 1110, amb: [1, 0.9, 0.74], grade: [255, 180, 90, 0.08], sky: [255, 196, 120], sun: 0.85, night: 0 },     // golden hour
  { m: 1155, amb: [1, 0.8, 0.64], grade: [255, 140, 80, 0.09], sky: [255, 140, 90], sun: 0.6, night: 0.1 },    // sunset
  { m: 1185, amb: [0.78, 0.6, 0.64], grade: [230, 100, 130, 0.08], sky: [200, 90, 130], sun: 0.25, night: 0.4 },   // the sun goes down
  { m: 1215, amb: [0.42, 0.38, 0.62], grade: [110, 80, 200, 0.1], sky: [90, 80, 160], sun: 0, night: 0.8 },        // blue hour
  { m: 1260, amb: [0.24, 0.27, 0.5], grade: [50, 60, 150, 0.06], sky: [40, 52, 104], sun: 0, night: 1 },
  { m: 1440, amb: [0.2, 0.24, 0.46], grade: [40, 60, 140, 0.05], sky: [30, 44, 92], sun: 0, night: 1 },
];
const mix = (a, b, t) => a + (b - a) * t;
const mixA = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const smooth = (t) => t * t * (3 - 2 * t);
export const hash = (a, b = 0, c = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// The day number of the shared loop (one in-game day per DAY_LOOP_S seconds).
export const dayIndex = (loopTime) => Math.floor((loopTime + DAY_LOOP_S * 0.25) / DAY_LOOP_S);

// Fog for this time of day: some mornings have fog rolling off the water (sometimes far into
// town), some nights a light mist. { k: 0..1 how thick, spread: how far inland it reaches }
export function fogAt(loopTime, minutes) {
  const day = dayIndex(loopTime);
  let k = 0, spread = 0;
  if (hash(day, 3) < 0.38 && minutes > 300 && minutes < 600) {           // a foggy morning
    const t = minutes < 390 ? (minutes - 300) / 90 : 1 - (minutes - 390) / 210;
    k = Math.max(k, smooth(Math.max(0, Math.min(1, t))) * (0.65 + 0.35 * hash(day, 4)));
    spread = Math.max(spread, hash(day, 5));                               // some days it reaches well into the city
  }
  const night = minutes >= 1230 || minutes < 300;
  if (night && hash(day, 7) < 0.22) {                                      // a misty night
    const t = minutes >= 1230 ? (minutes - 1230) / 60 : 1;
    k = Math.max(k, 0.45 * Math.min(1, t));
    spread = Math.max(spread, 0.35);
  }
  return { k, spread };
}

// The whole sky at (loopTime, minutes) with rain 0..1 (how wet it's been raining).
export function skyAt(loopTime, minutes, rain = 0) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].m <= minutes) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  const t = smooth(Math.max(0, Math.min(1, (minutes - A.m) / (B.m - A.m))));
  let amb = mixA(A.amb, B.amb, t), grade = mixA(A.grade, B.grade, t), sky = mixA(A.sky, B.sky, t);
  let sun = mix(A.sun, B.sun, t), night = mix(A.night, B.night, t);
  // the sun crosses the sky from the east (sunrise ~06:20) to the west (sunset ~19:40): shadows
  // fall away from it, long at either end of the day and short at noon
  const dayT = Math.max(0, Math.min(1, (minutes - 380) / (1180 - 380)));
  const az = Math.PI * dayT;                       // 0 = east, pi/2 = south, pi = west
  const elev = Math.max(0.12, Math.sin(Math.PI * dayT)) * 1.05; // radians-ish: low at the ends
  const sunDir = { x: -Math.cos(az), y: -Math.sin(az) * 0.8 };  // shadows point away from the sun
  const shadowLen = Math.min(3.2, 0.55 / Math.tan(Math.min(1.25, elev)));
  // rain: overcast - a flat grey-blue light, faint diffuse shadows, the street lights come on early
  if (rain > 0) {
    const r = rain;
    amb = amb.map((v, k) => v * mix(1, [0.74, 0.77, 0.86][k], r));
    sun *= 1 - 0.8 * r;
    night = Math.max(night, 0.3 * r * (1 - night) + night);
    grade = mixA(grade, [110, 130, 160, 0.06], r * 0.7);
    sky = mixA(sky, [96, 108, 128], r * 0.8);
  }
  const fog = fogAt(loopTime, minutes);
  if (fog.k > 0) { amb = amb.map((v) => mix(v, Math.min(1, v * 1.04 + 0.03), fog.k * 0.4)); sun *= 1 - 0.6 * fog.k; }
  // golden light catching the side facing the sun (for the sky-glow over the screen edge)
  const warm = Math.max(0, Math.min(1, (minutes > 700 ? (minutes - 1040) / 120 : (420 - minutes) / 60))) * (1 - rain);
  return { amb, grade, sky, sun, night, sunDir, shadowLen, az, fog, warm, rain, minutes };
}

// Lamp behaviour: lamps come on one by one through dusk (most just come on, some flicker on, some
// warm up slowly), a few are faulty and flicker now and then, and every night a rare one is out.
// Returns brightness 0..1 for a lamp with id `i` at loopTime t with darkness `night`.
export function lampLevel(i, t, night) {
  if (night <= 0.05) return 0;
  const h = hash(i, 11);
  const on = 0.12 + h * 0.45;                       // how dark it has to get before this one comes on
  if (night < on) return 0;
  const since = (night - on) / 0.08;                 // 0..1 over the moment it comes on
  const day = Math.floor(t / DAY_LOOP_S);
  if (hash(i, day, 17) < 0.015) return 0;            // burnt out tonight
  const kind = hash(i, 13);
  let b = 1;
  if (kind < 0.1) {                                  // flickers on
    if (since < 1) b = hash(i, Math.floor(t * 14), 3) < 0.55 ? 0.15 : 1;
  } else if (kind < 0.25) {                          // warms up slowly (sodium lamp)
    b = Math.min(1, 0.15 + since * 0.4);
  } else if (since < 1) b = Math.min(1, since * 3);
  // faulty: now and then a burst of flickering
  if (hash(i, 19) < 0.035) {
    const w = Math.floor(t / 9);
    if (hash(i, w, 23) < 0.35) {
      const ph = t - w * 9;
      if (ph < 1.6) b *= hash(i, Math.floor(t * 18), 29) < 0.5 ? 0.1 : 1;
    }
  }
  return b;
}

// Neon signs in rough areas misbehave now and then: a burst of flicker, or out for the night.
export function neonLevel(id, t, rough) {
  if (!rough) return 1;
  if (hash(id, 41) > 0.3) return 1;
  const day = Math.floor(t / DAY_LOOP_S);
  if (hash(id, day, 43) < 0.06) return 0.12;        // dead tonight
  const w = Math.floor(t / 7);
  if (hash(id, w, 47) < 0.18) {
    const ph = t - w * 7;
    if (ph < 1.3) return hash(id, Math.floor(t * 16), 53) < 0.45 ? 0.15 : 1;
  }
  return 1;
}
