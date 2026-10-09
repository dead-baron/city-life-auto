// Pixel icons for the menus and the map (the UI concepts, docs/art-v2/targets/U1, U7, U12: round tab buttons, place
// icons in little rounded squares, an icon by every menu line). Each is a tiny bitmap below, one letter a pixel from
// the palette ('.' clear, 'k' the dark outline); drawn once into a canvas, then used three ways:
//   iconURL(name)            a PNG data URL (an <img> or a CSS background; scale it up with image-rendering: pixelated)
//   iconImg(name, px)        '<img class="pi" ...>' sized to px CSS pixels tall
//   drawIcon(g, name, x, y, size)   onto a canvas, centred on (x, y), size px tall (whole multiples stay crisp)
const PAL = {
  k: '#10131c', w: '#ffffff', g: '#c8ccd8', d: '#6b7388', r: '#e8434b', R: '#9c1f2a', o: '#ff9a2e', O: '#b8601a',
  y: '#ffd34a', Y: '#b8902a', G: '#3ccf6e', n: '#1f8a45', b: '#4aa8ff', B: '#1f5fb8', c: '#7de8ff', p: '#ff6fb8',
  P: '#b83a80', u: '#a07aff', U: '#5e3cb8', t: '#c8925a', T: '#7a5230', s: '#ffd9b0',
};
const ICONS = {
  map: ['kkkk...kkkk', 'kGGkkkkkGGk', 'kGGknnnkGGk', 'kGGknnnkGGk', 'kGGknnnkGGk', 'kGGknnnkGGk', 'kGGknnnkGGk', 'kGGknnnkGGk', 'kkkknnnkkkk', '...kkkkk...'],
  jobs: ['...kkkkk...', '...k...k...', 'kkkkkkkkkkk', 'kooooooooOk', 'kooooooooOk', 'kkkkkykkkkk', 'kooooooooOk', 'kooooooooOk', 'kOOOOOOOOOk', 'kkkkkkkkkkk'],
  people: ['..kkk..kkk.', '.kwwwkkgggk', '.kwwwkkgggk', '.kwwwkkgggk', '..kkk..kkk.', '.kkkkkkkkkk', 'kwwwwwkgggk', 'kwwwwwkgggk', 'kwwwwwkgggk', 'kkkkkkkkkkk'],
  gear: ['kkkkkkkkkk.', 'kggggggggkk', 'kgggggggggk', 'kkkdgkkkkkk', '..kddk.....', '.kddk......', '.kddk......', '.kkkk......'],
  gun: ['kkkkkkkkkk.', 'kooooooookk', 'kooooooooOk', 'kkkOokkkkkk', '..kOOk.....', '.kOOk......', '.kOOk......', '.kkkk......'],
  bag: ['...kkkkk...', '..kk...kk..', '.kkkkkkkkk.', 'kttttttttTk', 'kttkkkkktTk', 'kttkTTTktTk', 'kttkkkkktTk', 'kttttttttTk', 'kTTTTTTTTTk', '.kkkkkkkkk.'],
  sys: ['....kkk....', '.kk.kgk.kk.', '.kgkkgkkgk.', '..kgggggk..', 'kkkgkkkgkkk', 'kgggk.kgggk', 'kkkgkkkgkkk', '..kgggggk..', '.kgkkgkkgk.', '.kk.kgk.kk.', '....kkk....'],
  shop: ['kk.........', '.k.........', '.kkkkkkkkkk', '.kpppppppk.', '.kpppppppk.', '..kPPPPPPk.', '..kkkkkkkk.', '..k........', '..kkkkkkkk.', '..kk...kk..'],
  services: ['.kk...kk.', '.kbk.kbk.', '.kbbkbbk.', '..kbbbk..', '...kbk...', '...kbk...', '...kbk...', '...kbk...', '..kbbbk..', '..kbkbk..', '...kkk...'],
  transit: ['..kkkkkkk..', '.kbbbbbbbk.', '.kbcccccbk.', '.kbcccccbk.', '.kbbbbbbbk.', '.kbbbbbbbk.', '.kbybbbybk.', '.kBBBBBBBk.', '..kkkkkkk..', '.k.......k.', 'k.........k'],
  home: ['.....k.....', '....kok....', '...kooOk...', '..kooooOk..', '.kooooooOk.', 'kkkkkkkkkkk', '.kwwwwwwwk.', '.kwckwTTwk.', '.kwwwwTTwk.', '.kkkkkkkkk.'],
  activity: ['...........', '.kk.....kk.', 'kwwk...kwwk', 'kwwkkkkkwwk', 'kwwgggggwwk', 'kwwkkkkkwwk', 'kwwk...kwwk', '.kk.....kk.'],
  hospital: ['.kkkkkkkkk.', 'krrrrrrrrRk', 'krrrkkkrrRk', 'krrrkwkrrRk', 'krkkkwkkkRk', 'krkwwwwwkRk', 'krkkkwkkkRk', 'krrrkwkrrRk', 'krrrkkkrrRk', 'kRRRRRRRRRk', '.kkkkkkkkk.'],
  clinic: ['.kkkkkkkkk.', 'kbbbbbbbbBk', 'kbbbkkkbbBk', 'kbbbkwkbbBk', 'kbkkkwkkkBk', 'kbkwwwwwkBk', 'kbkkkwkkkBk', 'kbbbkwkbbBk', 'kbbbkkkbbBk', 'kBBBBBBBBBk', '.kkkkkkkkk.'],
  pharmacy: ['.kkkkkkkkk.', 'kGGGGGGGGnk', 'kGGGkkkGGnk', 'kGGGkwkGGnk', 'kGkkkwkkknk', 'kGkwwwwwknk', 'kGkkkwkkknk', 'kGGGkwkGGnk', 'kGGGkkkGGnk', 'knnnnnnnnnk', '.kkkkkkkkk.'],
  police: ['.....k.....', '....kbk....', 'kkkkkbkkkkk', '.kbbbybbbk.', '..kbbbbbk..', '..kbbbbbk..', '.kbbkkkbbk.', '.kbk...kbk.', '.kk.....kk.'],
  bank: ['...kkkkk...', '.kkGGwGGkk.', '.kGwwwwwGk.', 'kGGwGwGGGGk', 'kGGwwwwwGGk', 'kGGGGwGwGGk', '.kGwwwwwGk.', '.kkGGwGGkk.', '...kkkkk...'],
  food: ['..w.w.w....', '...........', 'kkkkkkkkk..', 'kwwwwwwwkk.', 'kwwwwwwwk.k', 'kwwwwwwwk.k', 'kwwwwwwwkk.', '.kwwwwwk...', '..kkkkk....'],
  fuel: ['.kkkkkk....', '.krrrrk.k..', '.krwwrk.kk.', '.krwwrkk.k.', '.krrrrk..k.', '.krrrrk..k.', '.krrrrk.kk.', 'kkkkkkkk...'],
  fish: ['....kkkk...', 'k.kkbbbbkk.', 'kkbbbbbwkbk', 'kbbbbbbbbbk', 'kkbbbbbbbk.', 'k.kkbbbbk..', '....kkkk...'],
  anchor: ['....kkk....', '....kck....', '....kkk....', '.kkkkckkkk.', '.kccccccck.', '.kkkkckkkk.', 'k...kck...k', 'kck.kck.kck', '.kckkckkck.', '..kcccccck.', '...kkkkkk..'],
  plane: ['.....k.....', '....kwk....', '....kwk....', '.kkkkwkkkk.', 'kwwwwwwwwwk', '.kkkkwkkkk.', '....kwk....', '...kkwkk...', '..kwwwwwk..', '...kkkkk...'],
  skull: ['..kkkkkkk..', '.kwwwwwwwk.', 'kwwwwwwwwwk', 'kwkkwwwkkwk', 'kwkkwwwkkwk', 'kwwwwkwwwwk', '.kwwwwwwwk.', '..kwkwkwk..', '..kkkkkkk..'],
  car: ['...kkkkk...', '..kbcccbk..', '.kbcccccbk.', 'kbbbbbbbbbk', 'kbybbbbbybk', 'kbbbbbbbbbk', 'kkkkkkkkkkk', '.kk.....kk.'],
  shirt: ['.kkk...kkk.', 'kuuukkkuuuk', 'kuuuuuuuuuk', 'kkkuuuuukkk', '..kuuuuuk..', '..kuuuuuk..', '..kUUUUUk..', '..kkkkkkk..'],
  bar: ['kkkkkkkkk', 'kpppppppk', '.kpppppk.', '..kpppk..', '...kpk...', '....k....', '....k....', '..kkkkk..'],
  bus: ['.kkkkkkkkk.', 'kyyyyyyyyyk', 'kycccycccyk', 'kycccycccyk', 'kyyyyyyyyyk', 'kYYYYYYYYYk', 'kkkkkkkkkkk', '.kk.....kk.'],
  pin: ['..kkkkk..', '.kyyyyyk.', 'kyyykyyyk', 'kyykwkyyk', 'kyyykyyyk', '.kyyyyyk.', '.kyyyyyk.', '..kyyyk..', '..kyyyk..', '...kyk...', '....k....'],
  play: ['kk.....', 'kwkk...', 'kwwwkk.', 'kwwwwwk', 'kwwwkk.', 'kwkk...', 'kk.....'],
  stats: ['.......kkk', '.......kwk', '...kkk.kwk', '...kwk.kwk', 'kkkkwk.kwk', 'kwkkwk.kwk', 'kwkkwkkkwk', 'kkkkkkkkkk'],
  save: ['kkkkkkkkk.', 'kbkgggkbbk', 'kbkgggkbbk', 'kbkkkkkbbk', 'kbbbbbbbbk', 'kbwwwwwwbk', 'kbwwwwwwbk', 'kbwwwwwwbk', 'kkkkkkkkkk'],
  exit: ['.kkkkkkk.', '.kTTTTTk.', '.kTTTTTk.', '.kTTTTTk.', '.kTTTyTk.', '.kTTTTTk.', '.kTTTTTk.', '.kTTTTTk.', 'kkkkkkkkk'],
  bug: ['.k.....k.', '..k...k..', '...kkk...', 'k.kpppk.k', '.kppkppk.', 'kkppkppkk', '.kppkppk.', 'k.kpkpk.k', '...kkk...'],
  phone: ['.kkkkkk.', '.kddddk.', '.kcccck.', '.kcccck.', '.kcccck.', '.kcccck.', '.kddddk.', '.kdwddk.', '.kkkkkk.'],
  pad: ['.kkkkkkkkk.', 'kgggggggggk', 'kgkgggggrgk', 'kkkkgggbgyk', 'kgkgggggGgk', 'kgggkkkgggk', '.kkk...kkk.'],
  flag: ['kkkkkkk..', 'kwwwwwwk.', 'kwwwwwwwk', 'kwwwwwwk.', 'kkkkkkk..', 'k........', 'k........', 'k........', 'k........'],
  ring: ['..kkkkk..', '.krrwrrk.', 'krkk.kkrk', 'kwk...kwk', 'krkk.kkrk', '.krrwrrk.', '..kkkkk..'],
  full: ['kkkk.kkkk', 'kwwk.kwwk', 'kwk...kwk', 'kk.....kk', '.........', 'kk.....kk', 'kwk...kwk', 'kwwk.kwwk', 'kkkk.kkkk'],
  find: ['...kkk...', '.kkwwwkk.', '.kw...wk.', 'kw..k..wk', 'kw.kwk.wk', 'kw..k..wk', '.kw...wk.', '.kkwwwkk.', '...kkk...'],
  farm: ['...kkkkk...', '..krrrrrk..', '.krrkwkrrk.', 'krrrrkrrrrk', 'kkkkkkkkkkk', 'krrkwwwkrrk', 'krrkwkwkrrk', 'krrkwwwkrrk', 'kkkkkkkkkkk'],
  close: ['kk...kk', 'kwk.kwk', '.kwkwk.', '..kwk..', '.kwkwk.', 'kwk.kwk', 'kk...kk'],
  plus: ['..kkk..', '..kwk..', 'kkkwkkk', 'kwwwwwk', 'kkkwkkk', '..kwk..', '..kkk..'],
  minus: ['kkkkkkk', 'kwwwwwk', 'kkkkkkk'],
  tent: ['.....k.....', '....kGk....', '...kGGnk...', '..kGGGnnk..', '.kGGGknnnk.', 'kGGGkTknnnk', 'kkkkkTkkkkk'],
  menu: ['kkkkkkkkk', 'kwwwwwwwk', 'kkkkkkkkk', '.........', 'kkkkkkkkk', 'kwwwwwwwk', 'kkkkkkkkk', '.........', 'kkkkkkkkk', 'kwwwwwwwk', 'kkkkkkkkk'],
  star: ['....k....', '...kyk...', 'kkkkykkkk', 'kyyyyyyyk', '.kyyyyyk.', '.kyykyyk.', 'kyk...kyk', 'kk.....kk'],
};

const cache = new Map();
function canvasOf(name) {
  if (cache.has(name)) return cache.get(name);
  const rows = ICONS[name] || ICONS.pin;
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const col = PAL[rows[y][x]];
    if (!col) continue;
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  const out = { c, w, h, url: null };
  cache.set(name, out);
  return out;
}
export const ICON_NAMES = Object.keys(ICONS);
export function iconURL(name) { const o = canvasOf(name); return (o.url ||= o.c.toDataURL('image/png')); }
// an <img> px CSS pixels tall (a whole multiple of its height stays crisp)
export function iconImg(name, px = 22, cls = '') {
  const o = canvasOf(name), k = px / o.h;
  return `<img class="pi${cls ? ' ' + cls : ''}" src="${iconURL(name)}" width="${Math.round(o.w * k)}" height="${px}" alt="">`;
}
export function drawIcon(g, name, x, y, size) {
  const o = canvasOf(name), k = size / o.h, w = o.w * k;
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(o.c, Math.round(x - w / 2), Math.round(y - size / 2), Math.round(w), Math.round(size));
  g.imageSmoothingEnabled = s;
}
