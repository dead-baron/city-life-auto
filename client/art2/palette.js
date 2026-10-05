// Art v2 palette: hue-shifted colour ramps for every material, measured by eye from the approved
// Round 1 targets (docs/art-v2/targets). Darker steps lean toward blue-violet, lighter steps toward
// warm yellow - the classic 16-bit ramp. Ramps are albedo (unlit colour); the renderer adds light.
//
// ramp(base, n, k) -> [[r,g,b] x n], with the base colour at index k (default: the middle).

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const hex = hexToRgb;
export const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
// move hue a toward b by k (shortest way round)
function hueToward(a, b, k) { let d = ((b - a + 540) % 360) - 180; return a + d * k; }

export function ramp(base, n = 6, k = Math.floor((n - 1) / 2), opt = {}) {
  const [h, s, l] = rgbToHsl(typeof base === 'string' ? hexToRgb(base) : base);
  const dark = opt.dark ?? 0.62, light = opt.light ?? 0.5, shift = opt.shift ?? 0.28;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i - k;
    let hh = h, ss = s, ll = l;
    if (t < 0) {
      const u = -t / Math.max(1, k);                          // 0..1 toward the darkest
      hh = hueToward(h, 250, shift * u);                      // cool, violet shadows
      ss = Math.min(1, s * (1 + 0.25 * u) + (s < 0.08 ? 0.06 * u : 0));
      ll = l * (1 - dark * u);
    } else if (t > 0) {
      const u = t / Math.max(1, n - 1 - k);
      hh = hueToward(h, 52, shift * 0.8 * u);                 // warm highlights
      ss = s * (1 - 0.18 * u);
      ll = l + (1 - l) * light * u;
    }
    out.push(hslToRgb([hh, ss, ll]).map(Math.round));
  }
  return out;
}

// ---- materials ------------------------------------------------------------------------------------
export const MAT = {
  asphalt: ramp('#6a6f7c', 6, 3, { dark: 0.55, light: 0.35, shift: 0.14 }),
  asphaltWorn: ramp('#6f7178', 6, 3, { dark: 0.5, light: 0.35, shift: 0.14 }),
  concrete: ramp('#c8c3ba', 6, 3, { dark: 0.48, light: 0.45, shift: 0.16 }),
  curb: ramp('#d6d1c6', 6, 3, { dark: 0.5, light: 0.45, shift: 0.16 }),
  pebble: ramp('#b08a5a', 4, 2),
  paver: ramp('#c2ae90', 6, 3, { dark: 0.42, light: 0.4, shift: 0.15 }),
  kerbRed: ramp('#a8434a', 5, 2),
  paintWhite: ramp('#e6e2d6', 4, 2, { dark: 0.3 }),
  paintYellow: ramp('#d8a637', 4, 2),
  brick: ramp('#8e4a3c', 6, 3, { dark: 0.55 }),
  brickDark: ramp('#6e3a34', 6, 3),
  stucco: ramp('#ddd0c2', 6, 3, { dark: 0.42, light: 0.5 }),
  stuccoPeach: ramp('#d9a98a', 6, 3),
  stuccoPurple: ramp('#6c4a86', 6, 3),
  stuccoTeal: ramp('#5f9a96', 6, 3),
  terracotta: ramp('#b5553c', 6, 3),
  roofTar: ramp('#a6a8ae', 6, 3, { dark: 0.5, shift: 0.15 }),
  roofGravel: ramp('#9c9a96', 6, 3, { dark: 0.5, shift: 0.15 }),
  woodDock: ramp('#8a6440', 6, 3),
  woodDark: ramp('#5a3d2a', 6, 3),
  metal: ramp('#8a929c', 6, 3, { dark: 0.6, light: 0.6, shift: 0.15 }),
  metalDark: ramp('#3f4650', 6, 3, { shift: 0.15 }),
  glass: ramp('#5d8fa8', 6, 3, { light: 0.65 }),
  glassDark: ramp('#2d3e52', 6, 3),
  awningGreen: ramp('#2f7a5c', 6, 3),
  awningRed: ramp('#b8443e', 6, 3),
  awningCream: ramp('#e8dcc0', 6, 3, { dark: 0.4 }),
  palmLeaf: ramp('#5d8a2e', 7, 3, { dark: 0.7, light: 0.55, shift: 0.35 }),
  leaf: ramp('#6a9230', 7, 3, { dark: 0.7, light: 0.55, shift: 0.38 }),
  leafDark: ramp('#2f5a35', 7, 3, { dark: 0.7, light: 0.45 }),
  palmTrunk: ramp('#7a5a40', 6, 3),
  bark: ramp('#5e4430', 6, 3),
  grass: ramp('#76952e', 6, 3, { dark: 0.6, light: 0.45, shift: 0.32 }),
  soil: ramp('#6e5038', 6, 3),
  sand: ramp('#dcc29a', 6, 3, { dark: 0.4, light: 0.5, shift: 0.18 }),
  sandWet: ramp('#b89a70', 6, 3),
  water: ramp('#1d7f98', 6, 3, { dark: 0.6, light: 0.55, shift: 0.1 }),
  waterDeep: ramp('#155a70', 6, 3, { dark: 0.6, light: 0.5, shift: 0.1 }),
  foam: ramp('#e8f4f2', 4, 2, { dark: 0.25 }),
  stone: ramp('#bdb6aa', 6, 3, { dark: 0.45 }),
  diner: ramp('#d8cdb8', 6, 3, { dark: 0.45 }),
  dinerRed: ramp('#b8343a', 6, 3),
  // car paints
  paintBlue: ramp('#2f5aa8', 6, 3, { light: 0.6 }),
  paintRed: ramp('#c23a35', 6, 3, { light: 0.6 }),
  paintYellowCar: ramp('#e8b830', 6, 3, { light: 0.6 }),
  paintGreen: ramp('#4f7a4a', 6, 3, { light: 0.6 }),
  paintTeal: ramp('#2f8a8a', 6, 3, { light: 0.6 }),
  paintWhiteCar: ramp('#e4e4e0', 6, 3, { dark: 0.45, light: 0.6 }),
  paintBlack: ramp('#2c2f38', 6, 3, { light: 0.55 }),
  tyre: ramp('#2a2a30', 5, 2),
  chrome: ramp('#b8c0c8', 5, 2, { light: 0.8 }),
  // people
  skin: [ramp('#f1c9a5', 5, 2), ramp('#d9a27a', 5, 2), ramp('#b77a52', 5, 2), ramp('#8d5536', 5, 2), ramp('#5e3826', 5, 2)],
  hair: [ramp('#2a2220', 5, 2), ramp('#5a3a24', 5, 2), ramp('#a8743a', 5, 2), ramp('#d9b25e', 5, 2), ramp('#8a8a8e', 5, 2), ramp('#b8432e', 5, 2)],
  cloth: {
    white: ramp('#e8e4dc', 5, 2), black: ramp('#2c2c34', 5, 2), denim: ramp('#3e5f8f', 5, 2), navy: ramp('#2c3a66', 5, 2),
    red: ramp('#b8343a', 5, 2), orange: ramp('#d8722e', 5, 2), yellow: ramp('#e0b83a', 5, 2), green: ramp('#3f7a46', 5, 2),
    teal: ramp('#2f8a86', 5, 2), purple: ramp('#6a3e8e', 5, 2), pink: ramp('#d86a90', 5, 2), khaki: ramp('#b49a6a', 5, 2),
    grey: ramp('#80808a', 5, 2), brown: ramp('#6a4a32', 5, 2),
  },
};

// light colours (renderer)
export const LIGHT = {
  sodium: [1.0, 0.72, 0.38], warmWindow: [1.0, 0.78, 0.48], coolWindow: [0.55, 0.85, 1.0],
  neonMagenta: [1.0, 0.3, 0.85], neonCyan: [0.3, 0.95, 1.0], neonViolet: [0.7, 0.35, 1.0],
  headlight: [1.0, 0.95, 0.8], tail: [1.0, 0.15, 0.12], fire: [1.0, 0.55, 0.2],
};
