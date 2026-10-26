// The store icons over the doors near you (UI-4, the owner's notes part 2, page 15 of his icon concepts: "round with a
// gold rim and a clear glyph per trade" - as easy to read as the ATM machines). art v2's shopMarks (client/art2/game/
// host.js) floats one over each walk-in's door within a few steps of you, on foot, fading in and out; this paints them:
// a dark disc, a 2 px gold rim with a warm glow, the trade's glyph in its own colours. Each badge is drawn once into a
// small canvas and reused. Loaded the first time a mark is drawn (client/main.js), not with the page.

// what each kind of place shows: every kind with a door you can walk into or a counter you walk up to
export const STORE_ICON = {
  gunshop: 'gun', clothing: 'shirt', hardware: 'hammer', convenience: 'cart', grocery: 'cart', pharmacy: 'pill', hospital: 'cross',
  police: 'badge', courthouse: 'scales', bank: 'bank', club: 'cocktail', roadhouse: 'beer', clubhouse: 'cocktail', winery: 'wine', coffee: 'coffee',
  snack: 'burger', fruitstand: 'apple', farmstand: 'shop', market: 'shop', gasstation: 'fuel', pawn: 'rings', fence: 'hood', smuggler: 'hood', gang: 'hood',
  garage: 'wrench', salvage: 'wrench', paint: 'spray', dealer: 'car', barber: 'scissors', sports: 'dumbbell', tackle: 'hook', fishmarket: 'fish',
  lodge: 'deer', huntcamp: 'deer', trapper: 'deer', butcher: 'cleaver', marina: 'anchor', rental: 'ship', charter: 'ship', airport: 'plane',
  assay: 'pick', cinema: 'film', bowling: 'pin', warehouse: 'box', vending: 'cup',
};
// a glyph: drawn in a 24-unit box (g scaled), centred on 12,12
const fillPath = (g, c, d) => { g.fillStyle = c; g.fill(new Path2D(d)); };
const strokePath = (g, c, w, d) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(new Path2D(d)); };
const C = { blue: '#6fa8ff', cyan: '#5ae0ff', gold: '#e2bd57', cream: '#f3ead2', red: '#ff5a4e', green: '#6cd06c', steel: '#c8d2e0', wood: '#c07a3a', amber: '#ffb43c', pink: '#ff6fd0', brown: '#a86a3a', dark: '#22325e', ink: '#070b16' };
export const GLYPHS = {
  gun: (g) => { g.translate(0, -2); fillPath(g, C.blue, 'M2 7h18v4h2v2h-8l-1 2h-3l-1-2H8l-2 7H2l2-7H2z'); fillPath(g, C.dark, 'M11.5 13h2l-1 2h-1z'); },
  shirt: (g) => fillPath(g, C.cyan, 'M8 4l-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3c-1 2-2 2-4 2s-3 0-4-2z'),
  hammer: (g) => { strokePath(g, C.wood, 3, 'M7 19l8-8'); fillPath(g, C.steel, 'M12 4l3-1 6 6-2 2-3-3-2 2-3-3z'); },
  cart: (g) => { strokePath(g, C.gold, 2.2, 'M2 5h3l3 10h10l2-7H6'); g.fillStyle = C.gold; g.beginPath(); g.arc(9, 19.5, 1.7, 0, 6.3); g.arc(17, 19.5, 1.7, 0, 6.3); g.fill(); },
  pill: (g) => { g.save(); g.translate(12, 12); g.rotate(-0.8); fillPath(g, C.red, 'M-8 -3.5h8v7h-8a3.5 3.5 0 0 1 0-7z'); fillPath(g, C.cream, 'M0 -3.5h8a3.5 3.5 0 0 1 0 7h-8z'); g.restore(); },
  cross: (g) => fillPath(g, C.red, 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'),
  badge: (g) => { fillPath(g, C.blue, 'M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z'); fillPath(g, C.gold, 'M12 6.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 14.7l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z'); },
  scales: (g) => { strokePath(g, C.gold, 2, 'M12 3v17M7 20h10M4 7h16M4 7l-3 6M4 7l3 6M20 7l-3 6M20 7l3 6'); fillPath(g, C.gold, 'M1 13h6a3 3 0 0 1-6 0zM17 13h6a3 3 0 0 1-6 0z'); },
  bank: (g) => { fillPath(g, C.cream, 'M12 2l10 5v2H2V7zM3 19h18v3H3z'); for (const x of [4.5, 9.5, 14.5, 19]) fillPath(g, C.cream, `M${x - 1} 10h2.4v8H${x - 1}z`); },
  cocktail: (g) => { fillPath(g, C.pink, 'M3 4h18l-9 9z'); strokePath(g, C.cream, 2, 'M12 13v7M8 21h8'); g.fillStyle = C.green; g.beginPath(); g.arc(18, 4, 2.6, 0, 6.3); g.fill(); },
  wine: (g) => { fillPath(g, '#c04a7a', 'M6 3h12c0 6-2 9-6 9s-6-3-6-9z'); strokePath(g, C.cream, 2, 'M12 12v8M8 21h8'); },
  beer: (g) => { fillPath(g, C.amber, 'M5 7h11v14H5z'); fillPath(g, C.cream, 'M4 4h13v4H4z'); strokePath(g, C.amber, 2.5, 'M16 10h3v7h-3'); },
  coffee: (g) => { fillPath(g, C.cream, 'M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z'); strokePath(g, C.cream, 2, 'M17 11h2a2 2 0 0 1 0 4h-2M3 21h16'); strokePath(g, C.steel, 1.5, 'M8 3c-1 2 1 2 0 4M12 3c-1 2 1 2 0 4'); },
  burger: (g) => { fillPath(g, C.amber, 'M3 11a9 7 0 0 1 18 0z'); fillPath(g, C.green, 'M2 12h20v2H2z'); fillPath(g, C.brown, 'M3 14h18v3H3z'); fillPath(g, C.amber, 'M3 17h18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z'); },
  apple: (g) => { fillPath(g, C.red, 'M12 7c3-2 8-1 8 5s-4 9-8 9-8-3-8-9 5-7 8-5z'); fillPath(g, C.green, 'M12 7c0-3 2-5 5-5-1 3-2 4-5 5z'); },
  shop: (g) => { fillPath(g, C.green, 'M2 4h20l-1 6H3z'); fillPath(g, C.cream, 'M4 10h16v11H4z'); fillPath(g, C.blue, 'M6 12h5v5H6zM13 12h5v9h-5z'); },
  fuel: (g) => { fillPath(g, C.red, 'M4 3h11v18H4z'); fillPath(g, C.cream, 'M6 5h7v5H6z'); strokePath(g, C.cyan, 2, 'M15 8l3 2v8a1.5 1.5 0 0 0 3 0V9l-2-3'); },
  rings: (g) => { g.strokeStyle = C.gold; g.lineWidth = 2.4; for (const [x, y] of [[8, 9], [16, 9], [12, 16]]) { g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.stroke(); } },
  hood: (g) => { fillPath(g, '#7a5ae0', 'M12 2c5 0 8 5 8 11v8H4v-8c0-6 3-11 8-11z'); fillPath(g, C.ink, 'M12 7c3 0 5 3 5 7v7H7v-7c0-4 2-7 5-7z'); fillPath(g, C.cream, 'M9 12h2v1.4H9zM13 12h2v1.4h-2z'); },
  wrench: (g) => strokePath(g, C.steel, 3, 'M5 19l8-8M13 11a4.5 4.5 0 1 0 0-.1M14.5 6.5l3 3'),
  spray: (g) => { fillPath(g, C.blue, 'M7 8h8v14H7z'); fillPath(g, C.steel, 'M9 4h4v4H9z'); fillPath(g, C.pink, 'M17 3h2v2h-2zM19 6h2v2h-2zM17 9h2v2h-2z'); fillPath(g, C.amber, 'M7 13h8v3H7z'); },
  car: (g) => { fillPath(g, C.red, 'M3 13l2-6h14l2 6v5H3z'); fillPath(g, C.cyan, 'M6.5 8.5h11l1 4h-13z'); fillPath(g, C.ink, 'M4 18h4v3H4zM16 18h4v3h-4z'); },
  scissors: (g) => { strokePath(g, C.pink, 2.2, 'M8 16L18 3M16 16L6 3'); g.strokeStyle = C.pink; g.lineWidth = 2.2; for (const x of [7, 17]) { g.beginPath(); g.arc(x, 18, 3, 0, 6.3); g.stroke(); } },
  dumbbell: (g) => { fillPath(g, C.steel, 'M2 9h3v6H2zM5 7h3v10H5zM16 7h3v10h-3zM19 9h3v6h-3z'); fillPath(g, C.cream, 'M8 11h8v2H8z'); },
  hook: (g) => strokePath(g, C.cyan, 2.4, 'M14 3v12a4 4 0 0 1-8 0v-2l3 2'),
  fish: (g) => { fillPath(g, C.cyan, 'M3 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2z'); fillPath(g, C.ink, 'M7 10.5h1.6v1.6H7z'); },
  deer: (g) => { strokePath(g, C.amber, 2, 'M7 3v4l3 3M17 3v4l-3 3M4 5l3 2M20 5l-3 2'); fillPath(g, C.amber, 'M8 10h8l-1 7-3 4-3-4z'); fillPath(g, C.ink, 'M10 13h1.4v1.4H10zM12.6 13H14v1.4h-1.4z'); },
  cleaver: (g) => { fillPath(g, C.steel, 'M4 4h11v9H6l-2-2z'); strokePath(g, C.wood, 3, 'M15 9l6 6'); fillPath(g, C.ink, 'M7 6h1.6v1.6H7z'); },
  anchor: (g) => { strokePath(g, C.blue, 2.4, 'M12 5v16M7 9h10M4 14c0 4 4 7 8 7s8-3 8-7'); g.strokeStyle = C.blue; g.beginPath(); g.arc(12, 4, 2, 0, 6.3); g.stroke(); },
  ship: (g) => { fillPath(g, C.cream, 'M2 14h20l-3 5H5z'); fillPath(g, C.blue, 'M6 9h11v5H6z'); fillPath(g, C.red, 'M10 5h3v4h-3z'); strokePath(g, C.cyan, 1.6, 'M2 21c2-1 4-1 6 0s4 1 6 0 4-1 6 0'); },
  plane: (g) => fillPath(g, C.steel, 'M21 3l-6 6 2 9-2 2-4-7-4 4v3l-2 2-1-4-4-1 2-2h3l4-4-7-4 2-2 9 2 6-6c1-1 2 0 2 0s1 1 0 2z'),
  pick: (g) => { strokePath(g, C.wood, 2.6, 'M6 20L16 8'); strokePath(g, C.steel, 2.6, 'M5 8c4-4 10-5 15-2'); },
  film: (g) => { fillPath(g, C.amber, 'M3 6h18v12H3z'); fillPath(g, C.ink, 'M5 8h2v2H5zM5 14h2v2H5zM17 8h2v2h-2zM17 14h2v2h-2zM9 9h6v6H9z'); },
  pin: (g) => { fillPath(g, C.cream, 'M12 2a3 3 0 0 1 2 5c2 3 3 7 2 11a4 4 0 0 1-8 0c-1-4 0-8 2-11a3 3 0 0 1 2-5z'); fillPath(g, C.red, 'M9.6 8.5h4.8v1.6H9.6z'); },
  box: (g) => { fillPath(g, C.wood, 'M3 7l9-4 9 4v11l-9 4-9-4z'); strokePath(g, C.amber, 1.5, 'M3 7l9 4 9-4M12 11v11'); },
  cup: (g) => { fillPath(g, C.green, 'M6 4h12l-1.5 17h-9z'); fillPath(g, C.cream, 'M7 8h10v3H7z'); },
};
// the badge for a glyph, px across (drawn once per size)
const cache = new Map();
export function badgeCanvas(glyph, px = 32, dpr = 1) {
  const k = `${glyph}|${px}|${dpr}`;
  let cv = cache.get(k);
  if (cv) return cv;
  const s = Math.round(px * dpr), pad = Math.round(s * 0.22);   // (room round it for the glow)
  cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s + pad * 2, s + pad * 2) : Object.assign(document.createElement('canvas'), { width: s + pad * 2, height: s + pad * 2 });
  const g = cv.getContext('2d'), c = s / 2 + pad, r = s / 2 - s * 0.06;
  g.shadowColor = 'rgba(255,166,61,.75)'; g.shadowBlur = s * 0.22;   // the warm glow round the rim
  g.fillStyle = '#0f1830'; g.beginPath(); g.arc(c, c, r, 0, 6.3); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#e2bd57'; g.lineWidth = Math.max(2, s * 0.07); g.beginPath(); g.arc(c, c, r, 0, 6.3); g.stroke();
  g.strokeStyle = '#070b16'; g.lineWidth = Math.max(1, s * 0.03); g.beginPath(); g.arc(c, c, r + g.lineWidth * 1.6, 0, 6.3); g.stroke();
  const draw = GLYPHS[glyph] || GLYPHS.shop, k2 = (s * 0.68) / 24;
  g.save(); g.translate(c - 12 * k2, c - 12 * k2); g.scale(k2, k2); draw(g); g.restore();
  cv.pad = pad / dpr;
  cache.set(k, cv);
  return cv;
}
// the painter art v2's shopMarks calls: icon(g, glyph, x, y, size) - centred on x, y, size px across (the disc)
export function drawBadge(g, glyph, x, y, size = 30) {
  const dpr = Math.min(3, Math.max(1, Math.round((g.getTransform ? Math.abs(g.getTransform().a) : 1) * 2) / 2));
  const cv = badgeCanvas(glyph, size, dpr), w = cv.width / dpr;
  g.drawImage(cv, x - w / 2, y - w / 2, w, w);
}
