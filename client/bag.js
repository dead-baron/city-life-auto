// The Inventory (the hub's 'bag' tab, #inv - the owner, 11-16: "The inventory system needs a huge overhaul ... It doesn't
// need to be called a bag, just Inventory"; concepts U6, U14, U15, UIC-19): three columns on a desktop or a phone on its
// side - your character and what they wear | everything you carry as a grid under tabs | one thing's details - and upright
// the character on top, the grid under it, the details a sheet from the bottom.
//   - Your character: the game's own sprite of your look (client/art2/people.js, as the city draws you - never the close-up
//     renderer), turnable (U15: the arrows, a drag); holding the instrument you play or have picked. The slots round it -
//     Hat, Top, Jacket, Bottoms | Glasses, Accessory, Bag, Shoes - each with an X to take it off, "Remove all", and
//     your saved looks. Health, armor, stamina and cash under it.
//   - The grid: tabs All, Clothes, Weapons, Tools, Food & Meds, Materials, Valuables (they wrap, never cut off); the
//     clothes you own are in it as things you can wear. The quick bar under it: 1-4 your weapon slots (Gun 1, Gun 2, Melee,
//     Thrown: shared/loadout.js), 5-8 four things to use - the number keys take them out or use them in play.
//   - The details: what it is and does, how many; USE, DROP, EQUIP (WEAR / TAKE OFF, PUT AWAY) always in the same three
//     places; a quick bar slot (5-8, or drag it there), hand a gun to a crewmate, the plasma blade's color.
// The client only asks; the server checks and does it (server/session.js inv, weapon; economy.js useItem, setQuick;
// cargo.js dropItem; looks.js off / wear / outfit - clothes change only where the creator's would: never a free disguise).
// A gamepad: LT / RT change the tab, A picks, X equips or wears, Y drops, B backs out (LB / RB stay the hub's screens).
// Loaded the first time the Inventory opens (client/main.js).
import { WEAPONS, ITEMS, BLADE_COLORS } from '../shared/items.js';
import { keyName } from './glyphs.js';
import { input } from './input.js';
import { glyph, glyphOfWeapon, addGlyphs } from './touchicons.js';
import { PIECES, SLOTS as LOOK_SLOTS, CLOTH, decodeLook, encodeLook, lookArt } from '../shared/lookcore.js';
import { loadout, SLOT_NAMES } from '../shared/loadout.js';
import { INSTRUMENTS } from '../shared/music.js';
import { person } from './art2/people.js';
import { packGBuf, downsample2 } from './art2/gbuf.js';
import { itemIcon, weaponIcon } from './itemart.js';

// a weapon's picture in a tile: its class's line icon (pistol, rifle, knife, bat...: the touch buttons' family,
// client/touchicons.js) - the top-down sprites are thin bars or blocks at this size and read as broken art (11-04 review)
function wIcon(id, w, h) {
  const s = document.createElement('span');
  s.className = 'bc-gl';
  s.innerHTML = weaponIcon(id) || glyph(glyphOfWeapon(id, (WEAPONS[id] || {}).type), Math.round(h * 1.15));   // (its own pixel picture - client/itemart.js; the class's line icon for one without)
  return s;
}
// a thing's picture: its own pixel picture (client/itemart.js - the owner, 11-21: "Items are looking good"), and for a
// thing without one its family's line icon (11-05: the emoji went), by the first pattern its id matches, else by what it is
const pic = (id, px) => itemIcon(id) || glyph(itemGlyph(id), px);
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
const SLOTS = 4;   // (the quick bar's four things to use: server economy.js QUICK_SLOTS - keys 5-8)
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

// ---- the Inventory ------------------------------------------------------------------------------------------------
// the tabs (U14), each the categories it shows
export const TABS = [['all', 'All'], ['clothes', 'Clothes'], ['weapons', 'Weapons'], ['tools', 'Tools'], ['food', 'Food & Meds'], ['materials', 'Materials'], ['valuables', 'Valuables']];
const TAB_OF = { weapons: 'weapons', clothes: 'clothes', healing: 'food', food: 'food', tools: 'tools', music: 'tools', fishing: 'tools', outdoors: 'tools', materials: 'materials', hunting: 'materials', garden: 'materials', valuables: 'valuables', other: 'valuables' };
export const tabOf = (cat) => TAB_OF[cat] || 'valuables';
// the paper doll's slots round the figure (U6): [look slot, label] - the left column, then the right
export const DOLL = [[['hat', 'HAT'], ['top', 'TOP'], ['jacket', 'JACKET'], ['bottoms', 'BOTTOMS'], ['under', 'UNDERWEAR']], [['glasses', 'GLASSES'], ['jewel', 'JEWELRY'], ['bag', 'BAG'], ['shoes', 'SHOES'], ['socks', 'SOCKS']]];
const SLOT_WORD = { top: 'Top', jacket: 'Jacket', bottoms: 'Bottoms', set: 'Dress or set', shoes: 'Shoes', hat: 'Hat', glasses: 'Glasses or mask', jewel: 'Accessory', bag: 'Bag', under: 'Underwear', socks: 'Socks' };
// a clothing piece's line icon by its slot (the touch family; the shapes Lucide has no icon for drawn in its manner)
addGlyphs({
  pants: 'M6 2h12l1 20h-5l-2-12-2 12H5zM6 6h12',
  dress: 'M9 2h6l-.5 5 4.5 15H5l4.5-15zM9.5 7h5',
  cap: 'M3 16c0-5 4-9 9-9s9 4 9 9zM12 7V5M3 16h18l2 2',
  glasses: 'M2 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0M14 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0M10 15a2 2 0 0 1 4 0M2.5 13 5 7c.7-1.3 1.4-2 3-2M21.5 13 19 7c-.7-1.3-1.5-2-3-2',
  jacket: 'M8 3 4 6v15h5V9M16 3l4 3v15h-5V9M8 3l4 4 4-4M12 7v14',
});
const SLOT_GLYPH = { top: 'shirt', jacket: 'jacket', bottoms: 'pants', set: 'dress', shoes: 'footprints', hat: 'cap', glasses: 'glasses', jewel: 'gem', bag: 'backpack', under: 'shirt', socks: 'footprints' };
const freePiece = (P) => !!P && P.price === 0 && !P.d.issued && !P.d.gift;   // (shared/wardrobe.js free: everyone's)
const hexOf = (c) => (CLOTH[c] || CLOTH[0])[0];
const pieceTile = (it, px) => `${glyph(SLOT_GLYPH[PIECES[it.id].slot] || 'shirt', px)}<i class="iv-dot" style="--c:${hexOf(it.c)};--t:${hexOf(it.t)}"></i>`;

// the figure: your look as the city draws it (person() at the game's size, put on the art grid), one canvas a pose, kept
const SPR = new Map();
function figure(code, dir, f, pp) {
  const k = `${code}|${dir}|${f}|${pp || ''}`;
  let S = SPR.get(k);
  if (S) return S;
  const L = decodeLook(code);
  let D = null;
  if (L) {
    let A = lookArt(L, { code });
    if (pp) A = { ...A, pp, carry: pp };   // (an instrument in hand: client/art2/game/peds.js withProp, as the city draws a busker)
    try { D = downsample2(packGBuf(person(A, dir, 'idle', f, { tight: true }))); } catch (e) { console.warn('[inventory] figure', e); }
  }
  const cv = document.createElement('canvas');
  cv.width = D && D.w ? D.w : 1; cv.height = D && D.h ? D.h : 1;
  if (D && D.w && D.h) { const g = cv.getContext('2d'), id = g.createImageData(D.w, D.h); id.data.set(D.p0.subarray(0, D.w * D.h * 4)); g.putImageData(id, 0, 0); }
  S = { cv, w: cv.width, h: cv.height, ax: D ? D.ax : 0, ay: D ? D.ay : 0 };
  SPR.set(k, S);
  if (SPR.size > 160) SPR.delete(SPR.keys().next().value);
  return S;
}
// the figure's reach from the rig's anchor (the point between the feet), the widest and tallest over the eight turns, in art
// px: the scale is fitted to it once a look, so turning never resizes it and a wide look (arms out, a big coat) still fits
const REACH = new Map();
function reach(code, pp) {
  const k = `${code}|${pp || ''}`;
  let R = REACH.get(k);
  if (R) return R;
  R = { side: 6, up: 20, down: 1 };
  for (let d = 0; d < 8; d++) { const S = figure(code, d, 0, pp); R.side = Math.max(R.side, S.ax, S.w - S.ax); R.up = Math.max(R.up, S.ay); R.down = Math.max(R.down, S.h - S.ay); }
  REACH.set(k, R);
  if (REACH.size > 60) REACH.delete(REACH.keys().next().value);
  return R;
}
// your character on its stand: the game's own sprite at its true proportions, made bigger only by whole device pixels an
// art pixel (crisp, nearest-neighbour), as big as the box allows - about 85% of its height - centered, the feet on the
// stand's shadow near the foot. The box's real size on screen (a desktop's --zk zoom included: getBoundingClientRect) is
// the backing store, so one art pixel is exactly s device pixels.
function drawFigure(cv, code, dir, f, pp) {
  if (!cv || !code) return;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)), rc = cv.getBoundingClientRect();
  const W = Math.max(1, Math.round(rc.width * dpr)), H = Math.max(1, Math.round(rc.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  const R = reach(code, pp);
  const s = Math.max(1, Math.floor(Math.min(H * 0.94 / (R.up + R.down + 1), W / (2 * R.side))));
  const cx = Math.round(W / 2), feet = Math.round(Math.min(H - (R.down + 1) * s - 2, H / 2 + (R.up - R.down) * s / 2 + s));
  g.fillStyle = 'rgba(255,236,180,.10)'; g.beginPath(); g.ellipse(cx, feet, Math.min(W / 2, s * R.side * 1.15), s * 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(8,10,24,.45)'; g.beginPath(); g.ellipse(cx, feet, s * 5, s * 1.4, 0, 0, Math.PI * 2); g.fill();
  const S = figure(code, dir, f, pp);
  g.drawImage(S.cv, 0, 0, S.w, S.h, cx - S.ax * s, feet - S.ay * s, S.w * s, S.h * s);
  cv.dataset.fig = `${s}|${feet - R.up * s}|${feet}`;   // (the art px's size, the head's top and the feet: test/invpage.js measures it)
}
export const INST_PP = (id) => (INSTRUMENTS[id] ? INSTRUMENTS[id].pp : null);

const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
const loadPref = (k, d) => { try { return localStorage.getItem('cla.bag.' + k) || d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem('cla.bag.' + k, v); } catch { /* storage blocked */ } };

// el: the #inv tab; send(msg); me() the self record; refocus() after a render (the pad's focus); looks() the looks state
// (server looks.js stateMsg: cur, own, saved); look() the code your ped wears (a vest over it shows); pp() the prop in your
// hands (an instrument you play); stamina() [now, full]; close() puts the Inventory away
const CARRY_NAME = { gun: 'GUN', melee: 'MELEE', throw: 'THROWN' };
// Use on these takes the thing out into the world (the Inventory closes behind it): the tools you hold or set down - an
// instrument, the boombox, a board, a rod, fireworks - but not a light (switched on and off from here) or a consumable
export function leavesBag(id) {
  const it = ITEMS[id];
  return !!it && !it.light && !!(it.tool || it.music || it.ride || it.fun);
}
export function createBag({ el, send, me, refocus, leave, stash = () => null, looks = () => null, look = () => null, pp = () => null, stamina = () => null, close = () => {} }) {
  let view = 'stash', open = false, tab = loadPref('tab', 'all'), sort = loadPref('sort', 'kind'), sel = null, armDrop = '', dir = 0, fr = 0, timer = 0, showLooks = false, trig = [0, 0];
  if (!TABS.some((t) => t[0] === tab)) tab = 'all';
  el.innerHTML = '<div class="bag">'
    + '<section class="iv-me bag-eq" aria-label="Your character"><h3>CHARACTER</h3><div class="iv-doll"><div class="iv-col"></div>'
    + '<div class="iv-fig"><canvas class="iv-cv" aria-label="Your character - turn them with the arrows"></canvas><div class="iv-turn"><button class="btn" data-turn="1" aria-label="Turn left">‹</button><button class="btn" data-turn="-1" aria-label="Turn right">›</button></div></div>'
    + '<div class="iv-col"></div></div><div class="iv-dacts"><button class="btn" data-a="strip">REMOVE ALL</button><button class="btn" data-a="looks">SAVED LOOKS</button></div><div class="iv-stats"></div></section>'
    + '<section class="iv-items"><div class="bag-seg" role="tablist" aria-label="Carried or stash" hidden></div><div class="bag-tools"><div class="bag-cats" role="tablist" aria-label="Show"></div>'
    + `<label class="bag-sort"><span>Sort</span><select aria-label="Sort">${SORTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label><span class="bag-cash"></span></div>`
    + '<div class="bag-grid" role="list"></div><div class="bag-wheel"></div><p class="iv-keys"></p></section>'
    + '<aside class="bag-detail" aria-live="polite"></aside>'
    + '<section class="bag-craft" hidden aria-label="Crafting"></section></div>';
  const $q = (s) => el.querySelector(s), grid = $q('.bag-grid'), cv = $q('.iv-cv');
  $q('.bag-sort select').value = sort;
  $q('.bag-sort select').onchange = (e) => { sort = e.target.value; savePref('sort', sort); render(); };
  grid.addEventListener('scroll', () => cue(grid), { passive: true });
  for (const b of el.querySelectorAll('[data-turn]')) b.onclick = () => { dir = (dir + Number(b.dataset.turn) + 8) % 8; paint(); };
  $q('[data-a="strip"]').onclick = () => send({ t: 'look', a: 'off', s: 'all' });
  $q('[data-a="looks"]').onclick = () => { showLooks = !showLooks; if (showLooks) { tab = 'clothes'; savePref('tab', tab); } render(); };
  // a drag across the figure turns it (U15)
  let dragX = null;
  cv.addEventListener('pointerdown', (e) => { dragX = e.clientX; cv.setPointerCapture?.(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (dragX === null) return; const d = e.clientX - dragX; if (Math.abs(d) >= 24) { dir = (dir + (d > 0 ? -1 : 1) + 8) % 8; dragX = e.clientX; paint(); } });
  cv.addEventListener('pointerup', () => { dragX = null; });
  cv.addEventListener('pointercancel', () => { dragX = null; });

  const outfitOf = () => { const L = decodeLook(look() || (looks() || {}).cur || ''); return L ? L.outfit : null; };
  // what's selected in the grid shows in the hands: an instrument (else the one you're playing)
  const heldProp = () => { const id = sel && sel.startsWith('i:') ? sel.slice(2) : null; return (id && INST_PP(id)) || pp() || null; };
  function paint() { drawFigure(cv, look() || (looks() || {}).cur, dir, fr, heldProp()); }

  // everything you carry: [{ k, kind: 'w' | 'i' | 'p', id, name, n, cat, value }] - weapons, things, the clothes you own
  function things(m) {
    const out = [], O = outfitOf(), worn = new Set(O ? LOOK_SLOTS.map((s) => O[s] && O[s].id).filter(Boolean) : []);
    for (const w of m.weapons || []) { const d = WEAPONS[w.id]; if (d && w.id !== 'fists') out.push({ k: 'w:' + w.id, kind: 'w', id: w.id, name: d.name, n: 1, cat: 'weapons', value: 0, w, i: d.i }); }
    for (const [id, n] of Object.entries(m.inv || {})) if (n > 0 && ITEMS[id]) out.push({ k: 'i:' + id, kind: 'i', id, name: ITEMS[id].name, n, cat: itemCat(id), value: (ITEMS[id].sell || 0) * n });
    const st = looks();
    const own = new Set([...((st && st.own) || []), ...worn]);
    for (const P of PIECES) if (P && P.d.bath) own.add(P.i);   // (the towels: everyone's, worn where you can change - looks.js)
    for (const pid of own) { const P = PIECES[pid]; if (P && (!freePiece(P) || P.d.bath) || (P && worn.has(pid))) out.push({ k: 'p:' + pid, kind: 'p', id: pid, name: P.name, n: 1, cat: 'clothes', value: P.price || 0, worn: worn.has(pid), slot: P.slot }); }
    const order = new Map(BAG_CATS.map(([c], i) => [c, i]));
    const by = {
      kind: (a, b) => order.get(a.cat) - order.get(b.cat) || (a.kind === 'w' && b.kind === 'w' ? (WEAPONS[a.id].i - WEAPONS[b.id].i) : (b.worn ? 1 : 0) - (a.worn ? 1 : 0) || a.name.localeCompare(b.name)),
      name: (a, b) => a.name.localeCompare(b.name),
      count: (a, b) => b.n - a.n || a.name.localeCompare(b.name),
      value: (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    };
    return out.sort(by[sort] || by.kind);
  }
  const slotOfWeapon = (m, id) => loadout((m.weapons || []).map((w) => w.id)).indexOf(id);
  function iconOf(t, px) { return t.kind === 'p' ? pieceTile(O_ITEM(t), px) : t.kind === 'i' ? pic(t.id, px) : ''; }
  // a piece as worn (its colors) or as it comes
  let O_ITEM = (t) => { const O = outfitOf(), it = O && O[t.slot]; return it && it.id === t.id ? it : { id: t.id, c: PIECES[t.id].c, t: PIECES[t.id].t }; };
  // the stash, open (server/systems/stash.js: inside your home, at a gun or pawn counter, at your hideout): what's in it as
  // tiles of their own (k 's:i:<id>' / 's:w:<id>'), under what you carry; clothes stay in your wardrobe
  const sOpen = () => { const so = stash(); return so && so.open ? so : null; };
  const stashable = (t) => !t.inStash && (t.kind === 'i' ? !ITEMS[t.id].ride : t.kind === 'w' && t.id !== 'fists');
  function stashThings(so) {
    const out = [];
    for (const [id, n] of Object.entries(so.weapons || {})) if (WEAPONS[id]) out.push({ k: 's:w:' + id, kind: 'w', id, name: WEAPONS[id].name, n: 1, rounds: n, cat: 'weapons', inStash: 1, w: { mag: 0, ammo: n }, i: WEAPONS[id].i });
    for (const [id, n] of Object.entries(so.items || {})) if (n > 0 && ITEMS[id]) out.push({ k: 's:i:' + id, kind: 'i', id, name: ITEMS[id].name, n, cat: itemCat(id), inStash: 1, value: (ITEMS[id].sell || 0) * n });
    return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'w' ? -1 : 1));
  }
  // ---- press and drag (the owner, 11-23: "click/press and drag things into slots"): a mouse drags once it moves, a finger
  // once it has held still a moment (HOLD_MS: before that the grid scrolls as ever); let go over
  //   a quick bar slot 5-8 - a thing you can use, pinned there; a weapon slot 1-4 - that weapon in your hand;
  //   a clothing slot round your character - a piece for it, worn; CARRIED / STASH (the stash open) - moved there.
  // A pad keeps pick-then-press; every drop has its button in the details too.
  const HOLD_MS = 320, MOVE_PX = 8;
  let drag = null, swallow = false;
  const fits = (doll, slot) => doll === slot || (doll === 'top' && slot === 'set');
  function dropFor(t, at) {
    if (!at) return null;
    const q = at.closest('[data-slot]'), w = at.closest('.iv-w[data-q]'), d = at.closest('.iv-slot[data-s]'), v = at.closest('[data-view]');
    if (q && t.kind === 'i' && !t.inStash && usable(t.id)) return [q, () => send({ t: 'inv', a: 'slot', i: Number(q.dataset.slot), id: t.id })];
    if (w && t.kind === 'w' && !t.inStash) return [w, () => send({ t: 'weapon', id: t.id })];
    if (d && t.kind === 'p' && PIECES[t.id] && fits(d.dataset.s, PIECES[t.id].slot)) return [d, () => send({ t: 'look', a: 'wear', id: t.id })];
    if (v && sOpen() && (v.dataset.view === 'stash') !== !!t.inStash && (t.inStash || stashable(t))) return [v, () => moveTo(t, v.dataset.view === 'stash', false)];
    return null;
  }
  function dragStart(e, t, b) {
    if (e.button > 0 || drag) return;
    drag = { t, b, x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false, touch: e.pointerType !== 'mouse', over: null };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.on) lift(drag.x0, drag.y0); }, HOLD_MS);
    addEventListener('pointermove', dragMove); addEventListener('pointerup', dragEnd); addEventListener('pointercancel', dragEnd);
  }
  function lift(x, y) {
    drag.on = true;
    const g = document.createElement('div'); g.className = 'iv-ghost'; g.innerHTML = drag.b.querySelector('.bc-ic').innerHTML;
    document.body.appendChild(g); drag.g = g; el.classList.add('iv-dragging');
    if (drag.touch && navigator.vibrate) try { navigator.vibrate(12); } catch { /* not allowed */ }
    place(x, y);
  }
  function place(x, y) {
    drag.g.style.transform = `translate(${Math.round(x - 24)}px, ${Math.round(y - 24)}px)`;
    const hit = dropFor(drag.t, document.elementFromPoint(x, y)), on = hit && hit[0];
    if (drag.over !== on) { if (drag.over) drag.over.classList.remove('drop'); if (on) on.classList.add('drop'); drag.over = on; }
  }
  function dragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const far = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > MOVE_PX;
    if (!drag.on) { if (!far) return; if (drag.touch) { dragEnd(e, true); return; } lift(e.clientX, e.clientY); }   // (a finger moving first: a scroll)
    e.preventDefault();
    place(e.clientX, e.clientY);
  }
  function dragEnd(e, cancel = false) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    clearTimeout(drag.timer);
    removeEventListener('pointermove', dragMove); removeEventListener('pointerup', dragEnd); removeEventListener('pointercancel', dragEnd);
    const d = drag; drag = null;
    if (!d.on) return;
    swallow = true; setTimeout(() => { swallow = false; }, 0);   // (the click a drag ends with isn't a pick)
    d.g.remove(); el.classList.remove('iv-dragging'); if (d.over) d.over.classList.remove('drop');
    const hit = !cancel && e && e.type === 'pointerup' ? dropFor(d.t, document.elementFromPoint(e.clientX, e.clientY)) : null;
    if (hit) hit[1]();
  }
  // (a finger held on a tile: no scrolling once it lifts the tile)
  el.addEventListener('touchmove', (e) => { if (drag && drag.on) e.preventDefault(); }, { passive: false });
  el.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  function cell(t, m) {
    const pin = t.kind === 'i' && !t.inStash ? (m.quick || []).indexOf(t.id) : -1, on = t.kind === 'w' && m.weapon === t.id, ws = t.kind === 'w' ? slotOfWeapon(m, t.id) : -1;
    const b = document.createElement('button');
    b.className = 'bag-cell' + (t.k === sel ? ' sel' : '') + (on || t.worn ? ' on' : '');
    b.dataset.k = t.k; b.setAttribute('role', 'listitem');
    b.title = t.name;
    // (the owner, 11-22: the IN HAND chip hung off the tile's corner, the ammo count crowded the name - both in a footer
    // row of the tile's own: the tag at its left, the count at its right)
    // (a gun in hand with its count: its slot number on the gold tag - the tile's own highlight says it's the one in hand;
    // "IN HAND" and "12|36" didn't fit a phone's tile together, 11-23)
    const tag = on ? `<span class="bc-tag bc-held" title="In your hand">${t.kind === 'w' && WEAPONS[t.id].mag && ws >= 0 ? ws + 1 : 'IN HAND'}</span>` : t.worn ? '<span class="bc-tag">WORN</span>' : ws >= 0 ? `<span class="bc-tag">${ws + 1}</span>` : pin >= 0 ? `<span class="bc-tag">${pin + 5}</span>` : '';
    const cnt = t.inStash ? (t.kind === 'w' ? (WEAPONS[t.id].mag ? `<span class="bc-n" title="rounds">${t.rounds}</span>` : '') : t.n > 1 ? `<span class="bc-n">×${t.n}</span>` : '') : t.kind === 'w' && WEAPONS[t.id].mag ? `<span class="bc-n" title="in the gun | spare">${t.w.mag}<i>|</i>${Math.max(0, t.w.ammo - t.w.mag)}</span>` : t.n > 1 ? `<span class="bc-n">×${t.n}</span>` : '';
    b.innerHTML = `<span class="bc-ic">${iconOf(t, 30)}</span><span class="bc-nm">${esc(t.name)}</span><span class="bc-ft">${tag}${cnt}</span>`;
    if (t.kind === 'w') b.querySelector('.bc-ic').appendChild(wIcon(t.id, 64, 32));
    b.onclick = () => { sel = sel === t.k && !portrait() ? null : t.k; armDrop = ''; showLooks = false; render(); };
    // (a mouse: drag a thing you can use onto the quick bar's 5-8 - UIC-19)
    b.addEventListener('pointerdown', (e) => dragStart(e, t, b));   // (press and drag it into a slot: dragStart)
    b.oncontextmenu = (e) => e.preventDefault();   // (a finger's long press is a drag, not the browser's menu)
    if (t.inStash) b.classList.add('in-stash');
    return b;
  }
  // upright on a phone or in a narrow window: stacked, the details a sheet (a tall desktop window keeps three columns)
  const portrait = () => document.body.classList.contains('portrait') && (document.body.classList.contains('touch') || innerWidth < 820);

  // the paper doll: each slot what you wear there (a dress or a set in the top's, its bottoms' slot says so), an X to
  // take it off; a tap shows the piece in the details
  function doll() {
    const O = outfitOf(), cols = el.querySelectorAll('.iv-col');
    DOLL.forEach((col, ci) => {
      cols[ci].innerHTML = col.map(([s, label]) => {
        const it = O && (s === 'top' && O.set ? O.set : O[s]), P = it && PIECES[it.id], under = s === 'bottoms' && O && O.set;
        return `<div class="iv-slot${it ? '' : ' empty'}${it && sel === 'p:' + it.id ? ' sel' : ''}" data-s="${s}"><small>${s === 'top' && O && O.set ? 'OUTFIT' : label}</small>`
          + (it ? `<button class="iv-sb" data-k="p:${it.id}" title="${esc(P.name)}" aria-label="${esc(P.name)}">${pieceTile(it, 26)}</button><button class="iv-off" data-off="${O.set && s === 'top' ? 'set' : s}" aria-label="Take off the ${esc(P.name)}"${s === 'under' ? ' title="At home, a bathhouse or a shower"' : ''}>✕</button>`
            : `<button class="iv-sb" data-k="" disabled aria-label="${label}: nothing">${under ? '<em>with the outfit</em>' : glyph(SLOT_GLYPH[s], 22)}</button>`) + '</div>';
      }).join('');
    });
    for (const b of el.querySelectorAll('.iv-sb[data-k]:not([disabled])')) b.onclick = () => { sel = b.dataset.k; armDrop = ''; render(); };
    for (const b of el.querySelectorAll('[data-off]')) b.onclick = () => send({ t: 'look', a: 'off', s: b.dataset.off === 'set' ? 'top' : b.dataset.off });
  }
  function stats(m) {
    const st = stamina(), arm = m.arm, row = (ic, name, v, max, col) => `<div class="iv-stat"><span class="iv-sl">${glyph(ic, 16)}${name}</span><span class="iv-bar"><i style="width:${max ? Math.round(Math.max(0, Math.min(1, v / max)) * 100) : 0}%;background:${col}"></i></span><b>${max ? Math.round(v) : '-'}</b></div>`;
    $q('.iv-stats').innerHTML = row('heart-pulse', 'HEALTH', m.hp || 0, m.maxHp || 100, 'var(--danger)') + row('shield', 'ARMOR', arm ? arm[0] : 0, arm ? arm[1] : 0, 'var(--info)') + row('footprints', 'STAMINA', st ? st[0] : 0, st ? st[1] : 0, 'var(--money)');
  }

  function detail(t, m) {
    const d = $q('.bag-detail');
    el.querySelector('.bag').classList.toggle('has-sel', !!t);
    if (!t) { d.innerHTML = `<h3>DETAILS</h3><p class="bag-hint">Pick something to see what it does and what you can do with it.</p><p class="bag-hint">${keysHint()}</p>`; return; }
    const quick = m.quick || [];
    const it = t.kind === 'i' ? ITEMS[t.id] : null, def = t.kind === 'w' ? WEAPONS[t.id] : null, P = t.kind === 'p' ? PIECES[t.id] : null;
    const what = t.kind === 'w' ? weaponLine(def) : t.kind === 'p' ? pieceLine(P, t) : describe(t.id);
    const ws = t.kind === 'w' ? slotOfWeapon(m, t.id) : -1;
    if (t.inStash) return stashDetail(d, t);
    const count = t.kind === 'w' ? [def.mag ? `${t.w.mag} in the gun · ${Math.max(0, t.w.ammo - t.w.mag)} spare` : '', ws >= 0 ? `Quick key ${ws + 1} (${SLOT_NAMES[ws].toLowerCase()})` : ''].filter(Boolean).join(' · ')
      : t.kind === 'p' ? (t.worn ? 'You have it on.' : 'In your wardrobe.') : `${t.n} carried${it.sell ? ` · sells for about $${it.sell} each` : ''}`;
    // (UIC-19: USE, DROP and EQUIP always in the same three places, the ones that don't apply greyed)
    const held = t.kind === 'w' && m.weapon === t.id, canUse = t.kind === 'i' && usable(t.id);
    let acts = '<div class="bd-three">'
      + `<button class="btn btn-1" data-a="use"${canUse ? '' : ' disabled'}>${!canUse ? 'USE' : it.music === 'inst' ? 'PLAY' : it.light ? (m.light ? 'TURN OFF' : 'TURN ON') : it.ride === 'blades' ? 'PUT ON' : it.ride ? 'TAKE IN HAND' : 'USE'}</button>`
      + `<button class="btn btn-d" data-a="drop"${t.kind === 'p' ? ' disabled' : ''}>${armDrop === t.k ? 'AGAIN TO DROP' : t.n > 1 ? 'DROP ONE' : 'DROP'}</button>`
      + thirdBtn() + '</div>'
      + (t.kind === 'w' && carryKind(t.id) && !held ? `<small class="bd-eq">EQUIP takes it in hand and puts it in your ${CARRY_NAME[carryKind(t.id)]} slot.</small>` : '');
    function thirdBtn() { return t.kind === 'p' ? `<button class="btn btn-1" data-a="${t.worn ? 'takeoff' : 'wear'}">${t.worn ? 'TAKE OFF' : 'WEAR'}</button>`
      : held ? `<button class="btn" data-a="holster">PUT AWAY</button>` : `<button class="btn${t.kind === 'w' ? ' btn-1' : ''}" data-a="equip"${t.kind === 'w' ? '' : ' disabled'}>EQUIP</button>`; }

    if (sOpen() && stashable(t)) acts = `<div class="bd-stash"><button class="btn btn-1" data-a="tostash">${t.n > 1 ? `ALL ${t.n} TO STASH` : 'TO STASH'}</button>${t.n > 1 ? '<button class="btn" data-a="tostash1">ONE TO STASH</button>' : ''}</div>` + acts;
    if (t.kind === 'w' && m.crew && m.crew.ids && m.crew.ids.length) acts += '<button class="btn btn-x bd-all" data-a="give">Hand to a crewmate close by</button>';   // (server arms.js handTo)
    if (t.n > 1) acts += `<button class="btn btn-x bd-all" data-a="dropall">${armDrop === t.k + '*' ? `Press again: drop all ${t.n}` : `Drop all ${t.n}`}</button>`;
    if (t.id === 'plasma') acts += `<div class="bag-blade"><small>Blade color</small>${BLADE_COLORS.map((bc, i) => `<button class="sw${i === (m.blade | 0) ? ' on' : ''}" data-blade="${i}" aria-label="${esc(bc.name)}" style="--sw:${esc(bc.c)};--swc:${esc(bc.core)}"></button>`).join('')}</div>`;
    if (canUse) acts += `<div class="bag-pins"><small>On the quick bar (keys 5-8)</small>${Array.from({ length: SLOTS }, (_, i) => `<button class="btn bag-pin${quick[i] === t.id ? ' on' : ''}" data-pin="${i}" aria-pressed="${quick[i] === t.id}">${i + 5}</button>`).join('')}</div>`;
    const kind = t.kind === 'w' ? (ws >= 0 ? SLOT_NAMES[ws][0] + SLOT_NAMES[ws].slice(1).toLowerCase() : carryKind(t.id) === 'gun' ? 'Gun' : carryKind(t.id) === 'melee' ? 'Melee' : carryKind(t.id) === 'throw' ? 'Throwable' : 'Weapon')
      : t.kind === 'p' ? `Clothes · ${SLOT_WORD[P.slot]}` : (usable(t.id) ? 'Consumable · ' : '') + BAG_CATS.find((c) => c[0] === t.cat)[1];
    d.innerHTML = `<div class="bd-head"><span class="bd-ic">${iconOf(t, 44)}</span><div><h3>${esc(t.name)}</h3><small>${esc(kind)}</small></div>`
      + '<button class="x bd-x" data-a="close" aria-label="Back to the inventory">✕</button></div>'
      + `<p class="bd-what">${esc(what)}</p>${count ? `<p class="bd-n">${esc(count)}</p>` : ''}<div class="bd-acts">${acts}</div>`;
    if (t.kind === 'w') d.querySelector('.bd-ic').appendChild(wIcon(t.id, 96, 48));
    for (const b of d.querySelectorAll('[data-a]')) b.onclick = () => act(b.dataset.a, t);
    for (const b of d.querySelectorAll('[data-pin]')) b.onclick = () => { const i = Number(b.dataset.pin); send({ t: 'inv', a: 'slot', i, id: quick[i] === t.id ? null : t.id }); };
    for (const b of d.querySelectorAll('[data-blade]')) b.onclick = () => send({ t: 'look', a: 'blade', c: Number(b.dataset.blade) });
  }
  function stashDetail(d, t) {
    const so = sOpen(), what = t.kind === 'w' ? weaponLine(WEAPONS[t.id]) : describe(t.id);
    d.innerHTML = `<div class="bd-head"><span class="bd-ic">${iconOf(t, 44)}</span><div><h3>${esc(t.name)}</h3><small>In your stash</small></div>`
      + '<button class="x bd-x" data-a="close" aria-label="Back to the inventory">✕</button></div>'
      + `<p class="bd-what">${esc(what)}</p><p class="bd-n">${t.kind === 'w' ? (WEAPONS[t.id].mag ? `${t.rounds} rounds with it` : 'In your stash') : `${t.n} in your stash`}${so && so.where ? ` · ${esc(so.where)}` : ''}</p>`
      + `<div class="bd-acts"><div class="bd-stash"><button class="btn btn-1" data-a="take">${t.n > 1 ? `TAKE ALL ${t.n}` : 'TAKE'}</button>${t.n > 1 ? '<button class="btn" data-a="take1">TAKE ONE</button>' : ''}</div></div>`;
    if (t.kind === 'w') d.querySelector('.bd-ic').appendChild(wIcon(t.id, 96, 48));
    for (const b of d.querySelectorAll('[data-a]')) b.onclick = () => act(b.dataset.a, t);
  }
  const moveTo = (t, put, one) => send({ t: 'stash', a: put ? 'put' : 'take', k: t.kind, id: t.id, ...(one ? { n: 1 } : {}) });
  function act(a, t) {
    if (!t) return;
    if (a === 'tostash' || a === 'tostash1' || a === 'take' || a === 'take1') { moveTo(t, a.startsWith('to'), a.endsWith('1')); if (!(a.endsWith('1') && t.n > 1)) sel = null; render(); return; }
    if (a === 'close') { sel = null; armDrop = ''; render(); return; }
    if (a === 'equip') { if (t.kind === 'w') send({ t: 'weapon', id: t.id }); else if (t.kind === 'p') send({ t: 'look', a: 'wear', id: t.id }); }
    else if (a === 'holster') send({ t: 'weapon', id: 'fists' });
    else if (a === 'wear') send({ t: 'look', a: 'wear', id: t.id });
    else if (a === 'takeoff') send({ t: 'look', a: 'off', s: t.slot === 'set' ? 'top' : t.slot });
    else if (a === 'use') {
      send({ t: 'inv', a: 'use', id: t.id });
      // something you take out into the world - an instrument, the boombox, a board, a rod, fireworks: the Inventory gets
      // out of the way so the pad and your character are in view (the owner, 11-22); a light or something eaten keeps it
      if (leavesBag(t.id)) { sel = null; armDrop = ''; (leave || close)(); return; }
    } else if (a === 'give') send({ t: 'inv', a: 'give', id: t.id });
    else if (a === 'drop' || a === 'dropall') {
      if (t.kind === 'p') return;
      // two presses: dropping isn't something to do by accident (it lands in a bag at your feet: anyone can take it)
      const key = t.k + (a === 'dropall' ? '*' : '');
      if (armDrop !== key) { armDrop = key; render(); return; }
      armDrop = '';
      send({ t: 'inv', a: 'drop', id: t.id, w: t.kind === 'w', n: a === 'dropall' ? t.n : 1 });
      if (a === 'dropall' || t.n <= 1) sel = null;
    }
    render();
  }
  const weaponLine = (d) => (d.type === 'melee' ? 'A melee weapon: up close.' : d.type === 'tool' ? 'A tool you hold.' : d.type === 'throw' || d.type === 'grenade' ? 'Thrown: aim and let go.' : `${d.mag ? `A ${d.mag}-round magazine. ` : ''}Aim and fire; ${keyName('reload')} reloads.`);
  const pieceLine = (P, t) => `${SLOT_WORD[P.slot]}${P.tags && P.tags[0] ? ` - ${P.tags[0]}` : ''}. ${t.worn ? 'Take it off here, or put on something else of yours for the slot.' : 'Put it on from here - only where you could change: not while the police are after you, unless you are home.'}`;
  const keysHint = () => (input.device === 'gamepad' ? `Tap ${keyName('nextw')} for the next weapon, hold it for the weapon wheel; hold ${keyName('use')} for the quick wheel.`
    : input.device === 'touch' ? 'Tap the weapon button for the next weapon, hold it for all of them; hold BAG for the quick wheel.'
      : `In play: 1-4 take out your weapons, 5-8 use the quick bar, the mouse wheel or ${keyName('nextw')} steps through, hold ${keyName('nextw')} for the weapon wheel.`);

  // the quick bar (UIC-19, U14): 1-4 your weapon slots, 5-8 the things to use (a tap picks it; drop a thing on 5-8)
  function quickBar(m) {
    const lo = loadout((m.weapons || []).map((w) => w.id)), quick = m.quick || [];
    const qb = $q('.bag-wheel');
    qb.innerHTML = '<small>QUICK BAR</small><div class="iv-qb">' + lo.map((id, i) => `<button class="bag-slot iv-w${id ? '' : ' empty'}${id && m.weapon === id ? ' on' : ''}${id && sel === 'w:' + id ? ' sel' : ''}" data-q="w:${id || ''}"${id ? '' : ' disabled'} title="${esc(id ? WEAPONS[id].name : SLOT_NAMES[i])}"><b>${i + 1}</b><span class="bq-gl"></span><small>${SLOT_NAMES[i]}</small></button>`).join('')
      + Array.from({ length: SLOTS }, (_, i) => { const id = quick[i], n = id ? (m.inv || {})[id] || 0 : 0; return `<button class="bag-slot${id ? '' : ' empty'}${!n && id ? ' none' : ''}${id && sel === 'i:' + id ? ' sel' : ''}" data-q="i:${id || ''}" data-slot="${i}" title="${esc(id ? ITEMS[id].name : 'Empty')}"><b>${i + 5}</b><span class="bq-gl">${id ? glyph(itemGlyph(id), 20) : ''}</span>${n > 1 ? `<i class="bq-n">×${n}</i>` : ''}<small>${id ? esc(ITEMS[id].name) : 'empty'}</small></button>`; }).join('') + '</div>';
    qb.querySelectorAll('.iv-w[data-q]').forEach((b, i) => { if (lo[i]) b.querySelector('.bq-gl').appendChild(wIcon(lo[i], 40, 20)); });
    for (const b of qb.querySelectorAll('[data-q]')) {
      b.onclick = () => { const k = b.dataset.q; if (k.length > 2 && things(m).some((t) => t.k === k)) { sel = k; armDrop = ''; render(); } };
    }
    $q('.iv-keys').textContent = input.device === 'touch' ? 'Tap the weapon button: next weapon - hold it for the wheel.' : input.device === 'gamepad' ? `${keyName('nextw')}: next weapon - hold it for the wheel. Hold ${keyName('use')}: the quick wheel.` : `Keys 1-8 in play · mouse wheel or ${keyName('nextw')}: next weapon · hold ${keyName('nextw')}: the wheel`;
  }
  // the saved looks (CC10): each a small figure in it, a tap puts its clothes on
  function savedLooks() {
    const st = looks(), saved = (st && st.saved) || [];
    const box = document.createElement('div'); box.className = 'iv-looks';
    box.innerHTML = `<h4 class="bag-h">SAVED LOOKS</h4>${saved.length ? '' : '<p class="bag-hint">No saved looks yet. The creator saves them: your home\'s wardrobe, or Settings > Help > Change your look.</p>'}`;
    saved.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'iv-look'; b.dataset.look = i;
      const c = document.createElement('canvas'); c.className = 'iv-lcv'; b.appendChild(c);
      const nm = document.createElement('span'); nm.textContent = s.n; b.appendChild(nm);
      b.onclick = () => send({ t: 'look', a: 'outfit', i });
      box.appendChild(b);
      requestAnimationFrame(() => { const cur = decodeLook((st && st.cur) || ''), S = decodeLook(s.c); if (cur && S) { cur.outfit = S.outfit; drawFigure(c, encodeLook(cur), 0, 0, null); } });
    });
    return box;
  }

  let lastSig = '';
  function render(force) {
    const m = me();
    if (!open || !m) return;
    // the server's 'me' comes many times a second: rebuild only when something shown changed (a button swapped under
    // the pointer between press and release loses the click), else just the bars
    const st0 = looks();
    const sig = JSON.stringify([view, stash(), m.weapons, m.weapon, m.inv, m.quick, m.cash, m.crew && m.crew.ids, m.blade, m.light, m.creel, st0 && st0.cur, st0 && st0.own, st0 && st0.saved, look(), pp(), tab, sort, sel, armDrop, showLooks, input.device, portrait()]);
    if (sig === lastSig && force !== true) { stats(m); return; }
    lastSig = sig;
    if (DEBUG) { window.__invSig = sig; window.__invRenders = (window.__invRenders || 0) + 1; }   // (the capture scripts: what a rebuild was for)
    const all = things(m);
    el.querySelector('.bag').classList.toggle('stack', portrait());
    const cb = $q('.bag-cats');
    cb.innerHTML = TABS.map(([c, n]) => `<button class="chip${c === tab ? ' on' : ''}" role="tab" aria-selected="${c === tab}" data-cat="${c}">${n}</button>`).join('');
    for (const b of cb.querySelectorAll('[data-cat]')) b.onclick = () => { tab = b.dataset.cat; savePref('tab', tab); if (tab !== 'clothes') showLooks = false; render(); };
    $q('.bag-cash').innerHTML = `<b>$${(m.cash || 0).toLocaleString('en-US')}</b>${m.creel ? `<span>cooler ${m.creel.n}/${m.creel.max} fish</span>` : ''}`;
    doll(); stats(m); quickBar(m);
    $q('[data-a="looks"]').classList.toggle('on', showLooks);
    const shown = all.filter((t) => tab === 'all' || tabOf(t.cat) === tab);
    grid.innerHTML = '';
    if (showLooks && tab === 'clothes') grid.appendChild(savedLooks());
    let last = '';
    for (const t of shown) {
      if ((tab === 'all' || tab === 'tools' || tab === 'materials' || tab === 'food' || tab === 'valuables') && sort === 'kind' && t.cat !== last) { last = t.cat; const h = document.createElement('h4'); h.className = 'bag-h'; h.textContent = BAG_CATS.find((c) => c[0] === t.cat)[1]; grid.appendChild(h); }
      grid.appendChild(cell(t, m));
    }
    if (!shown.length && !(showLooks && tab === 'clothes')) grid.insertAdjacentHTML('beforeend', `<p class="bag-hint">${tab === 'clothes' ? 'The clothes you own show here. Clothes stores sell more; the fitting room puts them in your wardrobe.' : tab === 'weapons' ? 'No weapons on you. Gun shops and pawn shops sell them; your stash keeps the rest.' : 'Nothing here yet. Pharmacies sell med kits and bandages; coffee shops and corner stores sell drinks.'}</p>`);
    // the stash, open: CARRIED | STASH over the tabs (the grid shows one side, the same tabs); drop a tile on the other
    // side's button to move it there - or pick it and TO STASH / TAKE
    const so = sOpen(), seg = $q('.bag-seg');
    seg.hidden = !so;
    if (so) {
      const sAll = stashThings(so), nOf = (L) => L.reduce((a, t) => a + (t.kind === 'w' ? 1 : t.n), 0);
      seg.innerHTML = [['carried', 'CARRIED', nOf(all.filter(stashable))], ['stash', 'STASH', nOf(sAll)]].map(([v, n, c]) => `<button class="chip${view === v ? ' on' : ''}" role="tab" aria-selected="${view === v}" data-view="${v}">${n}<small>${c}</small></button>`).join('')
        + `<button class="btn bag-shx" type="button" data-sx="1" title="Close the stash (${esc(so.where || 'your stash')})" aria-label="Close the stash">CLOSE</button>`;
      for (const b of seg.querySelectorAll('[data-view]')) {
        b.onclick = () => { view = b.dataset.view; sel = null; render(); };
      }
      seg.querySelector('[data-sx]').onclick = () => send({ t: 'stash', a: 'close' });
      if (view === 'stash') {
        grid.innerHTML = '';
        const inSt = sAll.filter((t) => tab === 'all' || tabOf(t.cat) === tab);
        for (const t of inSt) grid.appendChild(cell(t, m));
        if (!inSt.length) grid.innerHTML = `<p class="bag-hint">${tab === 'clothes' ? 'Your clothes stay in your wardrobe - wear them from CARRIED.' : 'Nothing here yet. In CARRIED pick something and press TO STASH - or drag it onto STASH.'}</p>`;
      }
    } else view = 'stash';   // (the next time it opens: the stash first)
    const every = so ? [...all, ...stashThings(so)] : all;
    if (sel && !every.some((t) => t.k === sel)) sel = null;
    detail(every.find((t) => t.k === sel) || null, m);
    paint();
    cue(grid);
    refocus?.();
  }
  function step(d) { const i = TABS.findIndex((t) => t[0] === tab); tab = TABS[(i + d + TABS.length) % TABS.length][0]; savePref('tab', tab); showLooks = false; render(); }
  return {
    get open() { return open; },
    show() {
      open = true; dir = 0; render(true);
      send({ t: 'look', a: 'get' });   // (what you own and your saved looks, fresh)
      clearInterval(timer);
      timer = setInterval(() => { if (!open) return; fr = (fr + 1) % 4; paint(); }, 420);   // (the idle: breathing, an instrument played)
    },
    hide() { if (sOpen()) send({ t: 'stash', a: 'close' }); open = false; sel = null; armDrop = ''; showLooks = false; clearInterval(timer); timer = 0; },
    refresh: () => render(),
    // the pad's B with something picked: back to the grid first
    back() { if (sel || showLooks) { sel = null; armDrop = ''; showLooks = false; render(); return true; } return false; },
    // the pad (client/main.js overlayPad): LT / RT the tabs, X equips or wears (or takes off), Y drops
    pad(inp) {
      const ax = inp.padAxes || {}, lt = ax.lt > 0.5 ? 1 : 0, rt = ax.rt > 0.5 ? 1 : 0;
      const tl = lt && !trig[0], tr = rt && !trig[1];
      trig = [lt, rt];
      if (tl || tr) { step(tr ? 1 : -1); return true; }
      const m = me(), t = m && sel ? things(m).find((q) => q.k === sel) : null;
      if (inp.padX && t) { act(t.kind === 'p' ? (t.worn ? 'takeoff' : 'wear') : m.weapon === t.id ? 'holster' : t.kind === 'w' ? 'equip' : 'use', t); return true; }
      if (inp.padY && t && t.kind !== 'p') { act('drop', t); return true; }
      return false;
    },
    // a number key with the Inventory open: 5-8 put the picked thing on that quick slot (1-4 are your weapon slots)
    numberKey(n) {
      const m = me(), id = sel && sel.startsWith('i:') ? sel.slice(2) : null;
      if (!m || !id || !usable(id) || n < 4 || n > 7) return false;
      send({ t: 'inv', a: 'slot', i: n - 4, id });
      return true;
    },
    tab: () => tab,
  };
}
// a scroller with more below shows a fade at its foot (the scroll cue)
export function cue(el) { el.classList.toggle('cue-down', el.scrollTop + el.clientHeight < el.scrollHeight - 4); }
