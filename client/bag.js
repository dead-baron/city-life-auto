// The bag (UI-3, the hub's BAG tab; the owner: "much cleaner and modern and easier to work through"): everything you
// carry as a grid of cells by category - weapons, healing, food and drink, tools, clothes, fishing, hunting, the garden,
// valuables - with a filter and a sort, and one thing's details beside it: its name, what it does, how many, and what you
// can do with it (Use / Equip / Drop / pin it to the quick wheel's four slots). The quick wheel's slots under the grid.
// The client only asks; the server checks and does it (server/session.js inv, weapon; economy.js useItem, setQuick;
// cargo.js dropItem). Loaded the first time the bag opens (client/main.js). The layout keeps a place for crafting.
import { WEAPONS, ITEMS, BLADE_COLORS } from '../shared/items.js';
import { keyName } from './glyphs.js';
import { input } from './input.js';
import { glyph, glyphOfWeapon, addGlyphs } from './touchicons.js';

// a weapon's picture in a tile: its class's line icon (pistol, rifle, knife, bat...: the touch buttons' family,
// client/touchicons.js) - the top-down sprites are thin bars or blocks at this size and read as broken art (11-04 review)
function wIcon(id, w, h) {
  const s = document.createElement('span');
  s.className = 'bc-gl';
  s.innerHTML = glyph(glyphOfWeapon(id, (WEAPONS[id] || {}).type), Math.round(h * 1.15));
  return s;
}
// a thing's picture: its line icon too (the owner, 11-05: the bag's icons "don't look very good" - the emoji went), by the
// first pattern its id matches, else by what it is
const ITEM_GLYPH = [
  [/^legend_|^prize_|goldStar/, 'trophy'], [/^seed_/, 'sprout'], [/^medkit/, 'briefcase-medical'], [/bandage/, 'bandage'], [/revivekit/, 'heart-pulse'],
  [/Gloves|moccasins|furHat|Jacket|Coat|camo/, 'shirt'],
  [/coffee/, 'coffee'], [/energy|lemonade|cider/, 'cup-soda'], [/wine|cocktail/, 'wine'], [/beer/, 'beer'], [/whiskey/, 'glass-water'], [/popcorn/, 'popcorn'],
  [/apple|tomato/, 'apple'], [/orange/, 'citrus'], [/grape/, 'grape'], [/[Bb]err/, 'cherry'], [/carrot/, 'carrot'], [/lettuce|Herbs/, 'leafy-green'], [/corn/, 'wheat'],
  [/sunflower|lavender/, 'flower'], [/pumpkin/, 'salad'], [/hotdog/, 'sandwich'], [/bread/, 'croissant'], [/[Hh]oney|castoreum|coverScent/, 'droplet'],
  [/Trumpet|bunCap|Oyster|redcap/, 'leaf'], [/Truffle/, 'bean'], [/Mussels|ammonite|fossil/, 'shell'], [/Ticket/, 'ticket'], [/Stew|homeMeal/, 'soup'],
  [/roast(Bird|Turkey|Goose)|Steak|Chops/, 'drumstick'], [/Roast/, 'ham'], [/Meat$|^venison$/, 'beef'],
  [/bass|catfish|salmon|tuna|grouper|swordfish|marlin/, 'fish'], [/lure|worms|crickets|minnows|shrimp|squid|doughballs|chum|dryfly/, 'fishing-hook'], [/Rod$|baitcaster/, 'fishing-rod'],
  [/Pelt|Hide|bearRug/, 'paw-print'], [/ntler|Horns|Tusks|Claws|Fangs/, 'bone'], [/[Ff]eather/, 'feather'],
  [/flashlight|headlamp/, 'flashlight'], [/lantern/, 'lamp'], [/hardhat/, 'hard-hat'], [/flare/, 'flame'], [/glowstick/, 'wand'], [/batteries/, 'battery'], [/sawfuel/, 'fuel'],
  [/hatchet|axe|chainsaw/, 'axe'], [/^pick[A-Z]/, 'pickaxe'], [/trowel/, 'shovel'], [/goldPan/, 'cooking-pot'], [/drill/, 'drill'], [/parachute/, 'umbrella'],
  [/surfboard/, 'waves-horizontal'], [/skateboard|rollerblades/, 'footprints'],
  [/purse/, 'handbag'], [/wallet/, 'wallet'], [/bonds/, 'scroll-text'], [/jewelry|^gem$|diamond|quartz|[Gg]eode|[Pp]earl|ghostglass/, 'gem'], [/nugget|doubloon|goldFlakes/, 'coins'],
  [/scrap/, 'cog'], [/Ore$|^coal$|^stone$/, 'mountain'], [/arrowhead/, 'triangle'],
  [/boombox/, 'boom-box'], [/radio/, 'radio'], [/guitar/, 'guitar'], [/^tape_/, 'cassette-tape'], [/dancemat/, 'eighth-notes'], [/^fw/, 'sparkles'], [/campkit/, 'flame-kindling'],
];
// the bag's own line icons (client/touchicons.js has the rest of the family): Lucide 1.69.0 path data, as there.
/*! Lucide icons: ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather
 * (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022. The full text: client/icons-LICENSE.txt. */
addGlyphs({
  'briefcase-medical': 'M12 11v4M14 13h-4M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M18 6v14M6 6v14M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2z',
  'waves-horizontal': 'M2 12q2.5 2 5 0t5 0 5 0 5 0M2 19q2.5 2 5 0t5 0 5 0 5 0M2 5q2.5 2 5 0t5 0 5 0 5 0',
  umbrella: 'M12 13v7a2 2 0 0 0 4 0M12 2v2M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z',
  bandage: 'M10 10.01h.01M10 14.01h.01M14 10.01h.01M14 14.01h.01M18 6v12M6 6v12M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
  coffee: 'M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1M6 2v2',
  'cup-soda': 'M6 8l1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8M5 8h14M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0M12 8l1-6h2',
  wine: 'M8 22h8M7 10h10M12 15v7M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z',
  'fishing-hook': 'M17.586 11.414l-5.93 5.93a1 1 0 0 1-8-8l3.137-3.137a.707.707 0 0 1 1.207.5V10M20.414 8.586 22 7M17 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  fish: 'M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6ZM18 12v.5M16 17.93a9.77 9.77 0 0 1 0-11.86M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4M16.01 17.93l-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98',
  handbag: 'M2.048 18.566A2 2 0 0 0 4 21h16a2 2 0 0 0 1.952-2.434l-2-9A2 2 0 0 0 18 8H6a2 2 0 0 0-1.952 1.566zM8 11V6a4 4 0 0 1 8 0v5',
  'scroll-text': 'M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3',
  gem: 'M10.5 3 8 9l4 13 4-13-2.5-6M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3zM2 9h20',
  cog: 'M11 10.27 7 3.34M11 13.73l-4 6.93M12 22v-2M12 2v2M14 12h8M17 20.66l-1-1.73M17 3.34l-1 1.73M2 12h2M20.66 17l-1.73-1M20.66 7l-1.73 1M3.34 17l1.73-1M3.34 7l1.73 1M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  apple: 'M12 6.528V3a1 1 0 0 1 1-1h0M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21',
  citrus: 'M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04zM19.65 15.66A8 8 0 0 1 8.35 4.34M14 10l-5.5 5.5M14 17.85V10H6.15',
  grape: 'M22 5V2l-5.89 5.89M13.6 15.89a3 3 0 1 0 6 0a3 3 0 1 0-6 0M5.11 7.4a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9.35 11.65a3 3 0 1 0 6 0a3 3 0 1 0-6 0M10.91 5.85a3 3 0 1 0 6 0a3 3 0 1 0-6 0M15.15 10.09a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3.56 13.2a3 3 0 1 0 6 0a3 3 0 1 0-6 0M7.8 17.44a3 3 0 1 0 6 0a3 3 0 1 0-6 0M2 19a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  sandwich: 'M2.37 11.223l8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9M6.67 15l6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2M3 11h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-18a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z',
  croissant: 'M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676',
  droplet: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z',
  flower: 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5M12 7.5V9M7.5 12H9M16.5 12H15M12 16.5V15M8 8l1.88 1.88M14.12 9.88 16 8M8 16l1.88-1.88M14.12 14.12 16 16',
  leaf: 'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13',
  trophy: 'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3',
  drill: 'M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1zM13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1l-.81 3.242a1 1 0 0 1-.97.758H8M14 4h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3M18 6h4M5 10l-2 8M7 18l2-8',
  cherry: 'M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3ZM12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3ZM7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z',
  'leafy-green': 'M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22M2 22 17 7',
  bean: 'M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402ZM5.341 10.62a4 4 0 1 0 5.279-5.28',
  shell: 'M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44',
  triangle: 'M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z',
  bone: 'M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z',
  feather: 'M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49zM16 8 2 22M17.488 15H9',
  shovel: 'M21.56 4.56a1.5 1.5 0 0 1 0 2.122l-.47.47a3 3 0 0 1-4.212-.03 3 3 0 0 1 0-4.243l.44-.44a1.5 1.5 0 0 1 2.121 0zM3 22a1 1 0 0 1-1-1v-3.586a1 1 0 0 1 .293-.707l3.355-3.355a1.205 1.205 0 0 1 1.704 0l3.296 3.296a1.205 1.205 0 0 1 0 1.704l-3.355 3.355a1 1 0 0 1-.707.293zM9 15l7.879-7.878',
  'cooking-pot': 'M2 12h20M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8M4 8l16-4M8.86 6.78l-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8',
  beef: 'M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3M18.5 6l1.754 3.5a6.48 6.48 0 0 1-1.854 8.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5M10 8.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  drumstick: 'M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23M8.29 12.71l-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59',
  ham: 'M13.144 21.144A7.274 10.445 45 1 0 2.856 10.856M13.144 21.144A7.274 4.365 45 0 0 2.856 10.856a7.274 4.365 45 0 0 10.288 10.288M16.565 10.435 18.6 8.4a2.501 2.501 0 1 0 1.65-4.65 2.5 2.5 0 1 0-4.66 1.66l-2.024 2.025M8.5 16.5l-1-1',
  soup: 'M11.248 3c.273.1.808.53.747 1.36-.05.83-.938 1.2-.989 2.02-.06.78.333 1.24.727 1.62M16.252 3c.268.1.794.53.745 1.36-.06.83-.923 1.2-.993 2.02-.05.78.338 1.24.725 1.62M19.5 12 22 6M4 12a1 1 0 00-.99 1.133A9 9 0 0012 21a9 9 0 008.99-7.867A1 1 0 0020 12zM6.252 3c.268.1.794.53.745 1.36-.06.83-.923 1.2-.993 2.02-.05.78.338 1.24.735 1.62M7 21h10',
  beer: 'M17 11h1a3 3 0 0 1 0 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5ZM5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8',
  'glass-water': 'M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79zM6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2',
  popcorn: 'M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4M10 22 9 8M14 22l1-14M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z',
  'hard-hat': 'M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M14 6a6 6 0 0 1 6 6v3M4 15v-3a6 6 0 0 1 6-6M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-18a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z',
  lamp: 'M12 12v6M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23ZM8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  battery: 'M22 14L22 10M4 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
  fuel: 'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16M2 21h13M3 9h11',
  mountain: 'M8 3l4 8 5-5 5 15H2L8 3z',
  carrot: 'M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7M8 15l-2.58-2.58',
  salad: 'M19.496 12a2.5 2.5 0 00.399-2.214A2 2 0 0020.32 6.5 2 2 0 0019 3a2 2 0 00-1.5.68 2 2 0 00-3.287.424 2.5 2.5 0 00-3.189 2.06A3 3 0 0012 12l4-4M4 12a1 1 0 00-.99 1.133A9 9 0 0012 21a9 9 0 008.99-7.867A1 1 0 0020 12zM7 21h10M9.85 6.907A3.5 3.5 0 005.05 12',
  wheat: 'M2 22 16 8M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4ZM11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0ZM15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0ZM19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z',
  'boom-box': 'M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M8 8v1M12 8v1M16 8v1M4 9h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM6 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0M14 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  radio: 'M16.247 7.761a6 6 0 0 1 0 8.478M19.075 4.933a10 10 0 0 1 0 14.134M4.925 19.067a10 10 0 0 1 0-14.134M7.753 16.239a6 6 0 0 1 0-8.478M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  guitar: 'M11.9 12.1l4.514-4.514M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4zM6 16l2 2M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z',
  'cassette-tape': 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM6 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 12h8M14 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 20l.7-2.9A1.4 1.4 0 0 1 8.1 16h7.8a1.4 1.4 0 0 1 1.4 1l.7 3',
  'flame-kindling': 'M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 1 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C8 4.5 11 2 12 2ZM5 22l14-4M5 18l14 4',
});
export function itemGlyph(id) {
  for (const [re, g] of ITEM_GLYPH) if (re.test(id)) return g;
  const it = ITEMS[id] || {};
  return it.food ? 'utensils' : it.fish ? 'fish' : it.loot ? 'gem' : it.pelt ? 'paw-print' : it.game ? 'bone' : it.crafted ? 'shirt' : it.light ? 'flashlight' : it.music ? 'eighth-notes' : it.tool ? 'wrench' : 'package';
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SLOTS = 4;
const usable = (id) => !!(ITEMS[id] && (ITEMS[id].heal || ITEMS[id].buff || ITEMS[id].light || ITEMS[id].music || ITEMS[id].fun || ITEMS[id].ride));   // (ride: a board into your hand, blades on at a bench - server gear.js)
// the categories, in the grid's order: [id, name, test(item def, id)] - an item goes in the first that takes it
export const BAG_CATS = [
  ['weapons', 'Weapons'],
  ['healing', 'Healing', (it, id) => (it.heal && !it.food) || id === 'revivekit'],
  ['food', 'Food & drink', (it) => it.food || it.buff === 'coffee' || it.buff === 'energy' || it.buff === 'wine' || it.stamina],
  ['clothes', 'Clothes', (it) => it.crafted || it.camo],
  ['fishing', 'Fishing', (it) => it.bait || it.rod || it.fish],
  ['music', 'Music', (it) => it.music],
  ['outdoors', 'Outdoors & fun', (it) => it.fun],   // (fireworks, the Campfire Kit: shared/leisure.js)
  ['tools', 'Tools & lights', (it) => it.tool || it.light || it.chute || it.fell || it.buff],
  ['hunting', 'Hunting', (it) => it.game || it.pelt],
  ['garden', 'Garden', (it) => it.seed || it.crop || it.prize],
  ['materials', 'Materials', (it) => it.mat],   // (building stone, scrap metal, iron and copper ore: the home upgrades and the workbench - server homeups.js)
  ['valuables', 'Valuables', (it) => it.loot || it.protected],
  ['other', 'Other', () => true],
];
export function itemCat(id) {
  const it = ITEMS[id];
  if (!it) return 'other';
  for (const [c, , test] of BAG_CATS) if (test && test(it, id)) return c;
  return 'other';
}
const SORTS = [['kind', 'By kind'], ['name', 'A-Z'], ['count', 'Most'], ['value', 'Value']];
// What you carry on you (UI-10, UIC-19; the owner, 11-03): 2 guns, 1 melee weapon and 1 throwable; carry gear adds
// slots - a shoulder holster a gun, a back sling a long gun, a chest rig a throwable and a melee weapon - up to 4 guns,
// 2 melee, 2 throwables, the rest waiting in a home stash. The server doesn't limit it yet: the slots show the first of
// each kind you carry, the gear's slots wait locked, and anything past the slots stays in the grid under Weapons.
export const CARRY = [['gun', 'GUN 1'], ['gun', 'GUN 2'], ['melee', 'MELEE'], ['throw', 'THROWN']];
export const CARRY_GEAR = [['gun', '+1 GUN', 'Shoulder holster'], ['gun', '+1 LONG GUN', 'Back sling'], ['throw', '+1 THROWN · +1 MELEE', 'Chest rig']];
export const CARRY_CAPS = { gun: 4, melee: 2, throw: 2 };
export function carryKind(id) {
  const w = WEAPONS[id];
  if (!w || id === 'fists' || w.type === 'tool') return null;
  return w.type === 'melee' ? 'melee' : w.type === 'grenade' || w.type === 'deploy' ? 'throw' : 'gun';
}

// what an item does, in a line
export function describe(id) {
  const it = ITEMS[id];
  if (!it) return '';
  if (id === 'revivekit') return 'Revive a downed player to full health - never used up.';
  if (id === 'surfboard') return `Yours. In the sea, ${keyName('action')} puts you on it, paddling (faster than you swim) - at a surf break, paddle for the beach as a wave comes, then carve along its face. Use: under your arm.`;
  if (id === 'skateboard') return `Your own board. Use: in your hand (it takes a hand - no fighting), ${keyName('vehicle')} rides it. Each bail wears it; it snaps in the end.`;
  if (id === 'rollerblades') return 'Put them on sitting on a bench: quicker than walking, no sprinting, no vehicles, and keep off the grass.';
  if (id === 'parachute') return `Jump out of a helicopter or a plane high up, then ${keyName('action')} opens it. One jump.`;
  if (id === 'drill') return 'A bank job: set it at a vault door behind the counter. The alarm goes at once; it works through in about a minute.';
  if (id === 'flashlight') return `${keyName('light')} switches it on and off. Held in your free hand; everyone sees the beam.`;
  if (id === 'headlamp' || id === 'hardhat') return `${keyName('light')} switches it on and off - hands free${id === 'hardhat' ? '; the hat takes some of a falling tree or rock' : ''}. Runs on batteries.`;
  if (id === 'lantern') return 'A warm glow all around you, in one hand. Use it again while lit to set it down.';
  if (id === 'flare') return 'Strike it and throw it: a red light for about a minute.';
  if (id === 'glowstick') return 'Snap it and drop it: a little glow for a few minutes.';
  if (id === 'batteries') return 'A fresh set goes into a light by itself when its batteries run down.';
  if (it.fell) return `Hold the action button at a tree to fell it${id === 'hatchet' ? ' (small trees only)' : id === 'axe' ? ' (not the giant redwoods)' : id === 'chainsaw' ? ' - the fastest, loud, runs on fuel' : ''}.`;
  if (id === 'sawfuel') return 'Fills the chainsaw when it runs dry.';
  if (it.heal && !it.food) return `+${it.heal} health, stops bleeding.`;
  if (it.food) return `+${it.heal} health (doesn't stop bleeding)${it.hearty ? ' - a hearty meal' : ''}.`;
  if (it.buff === 'wine') return 'Health comes back faster for 2 minutes.';
  if (it.buff === 'coffee') return 'Refills stamina; faster recovery for 60 s.';
  if (it.buff === 'energy') return 'Extra stamina and speed for 60 s.';
  if (it.buff === 'scent') return 'No animal smells you for a while, whatever the wind.';
  if (it.rod) return 'A fishing rod: cast from the shore, a pier or a boat.';
  if (it.bait) return `Bait for fishing${it.night ? ' - best at night' : ''}.`;
  if (it.fish) return 'A catch: a fish market or a tackle shop buys it.';
  if (it.crafted || it.camo) return it.camo ? 'Camouflage: the animals see you less.' : 'Made from what you hunted. A trading post buys it.';
  if (it.game || it.pelt) return 'From a hunt: a butcher, a lodge or a trapper buys it; cook the meat at home.';
  if (it.seed) return 'Plant it in a garden plot at your home.';
  if (it.mat) return `A building material (${it.mat === 'stone' ? 'stone' : 'scrap metal'}): unload it at your home's garage for its upgrades and the workbench${it.sell ? ', or sell it' : ''}.`;
  if (it.illegal) return 'Illegal to carry - a fence buys it.';
  if (it.desc) return it.desc[0].toUpperCase() + it.desc.slice(1) + '.';   // (the music items: shared/music.js)
  return it.sell ? 'Something to sell.' : '';
}

const loadPref = (k, d) => { try { return localStorage.getItem('cla.bag.' + k) || d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem('cla.bag.' + k, v); } catch { /* storage blocked */ } };

// el: the #inv tab; send(msg); me() the self record; refocus() after a render (the pad's focus)
export function createBag({ el, send, me, refocus }) {
  let open = false, cat = loadPref('cat', 'all'), sort = loadPref('sort', 'kind'), sel = null, armDrop = '';
  el.innerHTML = '<div class="bag"><section class="bag-eq" aria-label="Carried"><h3>EQUIPMENT</h3><div class="bag-slots"></div><div class="bag-gear"></div><p class="bag-caps"></p></section>'
    + `<div class="bag-tools"><h3>BAG</h3><span class="bag-cash"></span><div class="bag-cats" role="tablist" aria-label="Show"></div>`
    + `<label class="bag-sort"><span>Sort</span><select aria-label="Sort">${SORTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label></div>`
    + '<div class="bag-grid" role="list"></div><aside class="bag-detail" aria-live="polite"></aside><div class="bag-wheel"></div>'
    + '<section class="bag-craft" hidden aria-label="Crafting"></section></div>';
  const $q = (s) => el.querySelector(s), grid = $q('.bag-grid');
  $q('.bag-sort select').value = sort;
  $q('.bag-sort select').onchange = (e) => { sort = e.target.value; savePref('sort', sort); render(); };
  grid.addEventListener('scroll', () => cue(grid), { passive: true });

  // everything you carry: [{ k, kind: 'w' | 'i', id, name, n, cat, value }]
  function things(m) {
    const out = [];
    for (const w of m.weapons || []) { const d = WEAPONS[w.id]; if (d) out.push({ k: 'w:' + w.id, kind: 'w', id: w.id, name: d.name, n: 1, cat: 'weapons', value: 0, w, i: d.i }); }
    for (const [id, n] of Object.entries(m.inv || {})) if (n > 0 && ITEMS[id]) out.push({ k: 'i:' + id, kind: 'i', id, name: ITEMS[id].name, n, cat: itemCat(id), value: (ITEMS[id].sell || 0) * n });
    const order = new Map(BAG_CATS.map(([c], i) => [c, i]));
    const by = {
      kind: (a, b) => order.get(a.cat) - order.get(b.cat) || (a.kind === 'w' ? (WEAPONS[a.id].i - WEAPONS[b.id].i) : a.name.localeCompare(b.name)),
      name: (a, b) => a.name.localeCompare(b.name),
      count: (a, b) => b.n - a.n || a.name.localeCompare(b.name),
      value: (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    };
    return out.sort(by[sort] || by.kind);
  }
  function cell(t, m) {
    const pin = t.kind === 'i' ? (m.quick || []).indexOf(t.id) : -1, on = t.kind === 'w' && m.weapon === t.id;
    const b = document.createElement('button');
    b.className = 'bag-cell' + (t.k === sel ? ' sel' : '') + (on ? ' on' : '');
    b.dataset.k = t.k; b.setAttribute('role', 'listitem');
    b.title = t.name;
    b.innerHTML = `<span class="bc-ic">${t.kind === 'i' ? glyph(itemGlyph(t.id), 32) : ''}</span><span class="bc-nm">${esc(t.name)}</span>`
      + (t.kind === 'w' && WEAPONS[t.id].mag ? `<span class="bc-n">${t.w.mag}|${Math.max(0, t.w.ammo - t.w.mag)}</span>` : t.n > 1 ? `<span class="bc-n">×${t.n}</span>` : '')
      + (on ? '<span class="bc-tag">IN HAND</span>' : pin >= 0 ? `<span class="bc-tag">SLOT ${pin + 1}</span>` : '');
    if (t.kind === 'w') b.querySelector('.bc-ic').appendChild(wIcon(t.id, 64, 36));
    b.onclick = () => { sel = sel === t.k && !portrait() ? null : t.k; armDrop = ''; render(); };
    return b;
  }
  const portrait = () => document.body.classList.contains('portrait');

  function detail(t, m) {
    const d = $q('.bag-detail');
    el.querySelector('.bag').classList.toggle('has-sel', !!t);
    if (!t) { d.innerHTML = `<p class="bag-hint">Pick something to see what it does.<br>${wheelHint()}</p>`; return; }
    const quick = m.quick || [];
    const it = t.kind === 'i' ? ITEMS[t.id] : null, def = t.kind === 'w' ? WEAPONS[t.id] : null;
    const what = t.kind === 'w' ? weaponLine(def) : describe(t.id);
    const count = t.kind === 'w' ? (def.mag ? `${t.w.mag} in the gun · ${Math.max(0, t.w.ammo - t.w.mag)} spare` : '') : `${t.n} carried${it.sell ? ` · sells for about $${it.sell} each` : ''}`;
    // (UIC-19: USE, DROP and EQUIP always in the same three places, the ones that don't apply greyed)
    const held = t.kind === 'w' && m.weapon === t.id, canUse = t.kind === 'i' && usable(t.id);
    let acts = '<div class="bd-three">'
      + `<button class="btn btn-1" data-a="use"${canUse ? '' : ' disabled'}>${!canUse ? 'USE' : it.light ? (m.light ? 'TURN OFF' : 'TURN ON') : it.ride === 'blades' ? 'PUT ON' : it.ride ? 'TAKE IN HAND' : 'USE'}</button>`
      + `<button class="btn btn-d" data-a="drop"${t.id === 'fists' ? ' disabled' : ''}>${armDrop === t.k ? 'AGAIN TO DROP' : t.n > 1 ? 'DROP ONE' : 'DROP'}</button>`
      + (held ? `<button class="btn" data-a="holster"${t.id === 'fists' ? ' disabled' : ''}>PUT AWAY</button>` : `<button class="btn" data-a="equip"${t.kind === 'w' ? '' : ' disabled'}>EQUIP</button>`) + '</div>';
    if (t.n > 1 && t.id !== 'fists') acts += `<button class="btn btn-x bd-all" data-a="dropall">${armDrop === t.k + '*' ? `Press again: drop all ${t.n}` : `Drop all ${t.n}`}</button>`;
    if (t.id === 'plasma') acts += `<div class="bag-blade"><small>Blade color</small>${BLADE_COLORS.map((bc, i) => `<button class="sw${i === (m.blade | 0) ? ' on' : ''}" data-blade="${i}" aria-label="${esc(bc.name)}" style="--sw:${esc(bc.c)};--swc:${esc(bc.core)}"></button>`).join('')}</div>`;
    if (canUse) acts += `<div class="bag-pins"><small>Quick bar slot</small>${Array.from({ length: SLOTS }, (_, i) => `<button class="btn bag-pin${quick[i] === t.id ? ' on' : ''}" data-pin="${i}" aria-pressed="${quick[i] === t.id}">${i + 1}</button>`).join('')}</div>`;
    d.innerHTML = `<div class="bd-head"><span class="bd-ic">${t.kind === 'i' ? glyph(itemGlyph(t.id), 48) : ''}</span><div><h3>${esc(t.name)}</h3><small>${esc(BAG_CATS.find((c) => c[0] === t.cat)[1])}</small></div>`
      + '<button class="x bd-x" data-a="close" aria-label="Back to the bag">✕</button></div>'
      + `<p class="bd-what">${esc(what)}</p>${count ? `<p class="bd-n">${esc(count)}</p>` : ''}<div class="bd-acts">${acts}</div>`;
    d.querySelector('.bd-head small').textContent = t.kind === 'w' ? (carryKind(t.id) === 'gun' ? 'Gun' : carryKind(t.id) === 'melee' ? 'Melee' : carryKind(t.id) === 'throw' ? 'Throwable' : 'Weapon') : (usable(t.id) ? 'Consumable · ' : '') + BAG_CATS.find((c) => c[0] === t.cat)[1];
    if (t.kind === 'w') d.querySelector('.bd-ic').appendChild(wIcon(t.id, 96, 54));
    for (const b of d.querySelectorAll('[data-a]')) b.onclick = () => act(b.dataset.a, t);
    for (const b of d.querySelectorAll('[data-pin]')) b.onclick = () => { const i = Number(b.dataset.pin); send({ t: 'inv', a: 'slot', i, id: quick[i] === t.id ? null : t.id }); };
    for (const b of d.querySelectorAll('[data-blade]')) b.onclick = () => send({ t: 'look', a: 'blade', c: Number(b.dataset.blade) });
  }
  function act(a, t) {
    if (a === 'close') { sel = null; armDrop = ''; render(); return; }
    if (a === 'equip') send({ t: 'weapon', id: t.id });
    else if (a === 'holster') send({ t: 'weapon', id: 'fists' });
    else if (a === 'use') send({ t: 'inv', a: 'use', id: t.id });
    else if (a === 'drop' || a === 'dropall') {
      // two presses: dropping isn't something to do by accident (it lands in a bag at your feet: anyone can take it)
      const key = t.k + (a === 'dropall' ? '*' : '');
      if (armDrop !== key) { armDrop = key; render(); return; }
      armDrop = '';
      send({ t: 'inv', a: 'drop', id: t.id, w: t.kind === 'w', n: a === 'dropall' ? t.n : 1 });
      if (a === 'dropall' || t.n <= 1) sel = null;
    }
    render();
  }
  const weaponLine = (d) => (d.type === 'melee' ? 'A melee weapon: up close.' : d.type === 'tool' ? 'A tool you hold.' : d.type === 'throw' ? 'Thrown: aim and let go.' : `${d.mag ? `A ${d.mag}-round magazine. ` : ''}Aim and fire; ${keyName('reload')} reloads.`);
  const wheelHint = () => `${input.device === 'gamepad' ? 'Hold View' : input.device === 'touch' ? 'Hold ITEMS' : `Hold ${keyName('use')}`} for the quick wheel, then let go on a slot.`;

  function render() {
    const m = me();
    if (!open || !m) return;
    const all = things(m), cats = new Set(all.map((t) => t.cat));
    if (cat !== 'all' && !cats.has(cat)) cat = 'all';
    // the filter: All, then each category you have something in
    const cb = $q('.bag-cats');
    cb.innerHTML = [['all', 'All'], ...BAG_CATS.filter(([c]) => cats.has(c))].map(([c, n]) => `<button class="chip${c === cat ? ' on' : ''}" role="tab" aria-selected="${c === cat}" data-cat="${c}">${n}</button>`).join('');
    for (const b of cb.querySelectorAll('[data-cat]')) b.onclick = () => { cat = b.dataset.cat; savePref('cat', cat); render(); };
    $q('.bag-cash').innerHTML = `<b>$${(m.cash || 0).toLocaleString('en-US')}</b><span>${all.length} thing${all.length === 1 ? '' : 's'}${m.creel ? ` · cooler ${m.creel.n}/${m.creel.max} fish (~$${m.creel.v.toLocaleString('en-US')})` : ''}</span>`;
    // the carried slots (UIC-19): the first gun, the second, a melee weapon, a throwable; the gear's slots locked
    const slotted = new Set(), byKind = { gun: [], melee: [], throw: [] };
    for (const t of all) if (t.kind === 'w' && carryKind(t.id)) byKind[carryKind(t.id)].push(t);
    const take = { gun: 0, melee: 0, throw: 0 };
    $q('.bag-slots').innerHTML = CARRY.map(([k, label], si) => {
      const t = byKind[k][take[k]++];
      if (t) slotted.add(t.k);
      return `<button class="bag-slot2${t ? '' : ' empty'}${t && t.k === sel ? ' sel' : ''}${t && m.weapon === t.id ? ' on' : ''}" data-carry="${t ? t.k : ''}" data-si="${si}"${t ? '' : ' disabled'}><small>${label}</small><span class="bc-ic"></span><b>${t ? esc(t.name) : 'empty'}</b></button>`;
    }).join('');
    $q('.bag-slots').querySelectorAll('[data-carry]').forEach((b) => {
      const t = all.find((q) => q.k === b.dataset.carry);
      if (t) { b.querySelector('.bc-ic').appendChild(wIcon(t.id, 64, 36)); b.onclick = () => { sel = sel === t.k && !portrait() ? null : t.k; armDrop = ''; render(); }; }
    });
    $q('.bag-gear').innerHTML = '<small>CARRY GEAR</small>' + CARRY_GEAR.map(([, add, name]) => `<div class="bag-slot2 locked" title="${esc(name)}"><small>${esc(add)}</small><b>${esc(name)}</b></div>`).join('');
    $q('.bag-caps').textContent = `On you: 2 guns, 1 melee, 1 throwable. Carry gear adds slots - up to ${CARRY_CAPS.gun} guns, ${CARRY_CAPS.melee} melee, ${CARRY_CAPS.throw} throwables.`;
    const shown = all.filter((t) => (cat === 'all' || t.cat === cat) && !slotted.has(t.k));
    grid.innerHTML = '';
    let last = '';
    for (const t of shown) {
      if (cat === 'all' && sort === 'kind' && t.cat !== last) { last = t.cat; const h = document.createElement('h4'); h.className = 'bag-h'; h.textContent = BAG_CATS.find((c) => c[0] === t.cat)[1]; grid.appendChild(h); }
      grid.appendChild(cell(t, m));
    }
    if (!shown.length) grid.innerHTML = '<p class="bag-hint">Nothing here yet. Pharmacies sell med kits and bandages; coffee shops and corner stores sell drinks.</p>';
    if (sel && !all.some((t) => t.k === sel)) sel = null;
    detail(all.find((t) => t.k === sel) || null, m);
    // the quick wheel as it stands (a slot picks its item; pin from an item's details)
    const quick = m.quick || [];
    $q('.bag-wheel').innerHTML = `<small>QUICK BAR</small>${Array.from({ length: SLOTS }, (_, i) => { const id = quick[i], n = id ? m.inv[id] || 0 : 0; return `<button class="bag-slot${id ? '' : ' empty'}" data-slot="${i}"${id ? '' : ' disabled'}><b>${i + 1}</b>${id ? `<span class="bq-gl">${glyph(itemGlyph(id), 20)}</span>${esc(ITEMS[id].name)}${n ? '' : ' (none left)'}` : 'empty'}</button>`; }).join('')}`;
    for (const b of el.querySelectorAll('[data-slot]')) b.onclick = () => { const id = quick[Number(b.dataset.slot)]; if (id) { sel = 'i:' + id; render(); } };
    cue(grid);
    refocus?.();
  }
  return {
    get open() { return open; },
    show() { open = true; render(); },
    hide() { open = false; sel = null; armDrop = ''; },
    refresh: render,
    // the pad's B with something picked: back to the grid first
    back() { if (sel) { sel = null; armDrop = ''; render(); return true; } return false; },
  };
}
// a scroller with more below shows a fade at its foot (the scroll cue)
export function cue(el) { el.classList.toggle('cue-down', el.scrollTop + el.clientHeight < el.scrollHeight - 4); }
