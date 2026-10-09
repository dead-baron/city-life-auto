// The look system (concept sheets CC1-CC10, CB1-CB5, CP1-CP4, SF/SM1-23): what a person looks like, as data the
// server keeps and checks and every client draws. Pure and deterministic (shared-code rules: nothing at load time
// uses Math.sin & co., no Math.random - random looks come from shared/rng.js seeds).
//
// A look (version LOOK_VERSION):
//   body   { base 'm'|'f', build 0-4 (BUILDS), height 0-4, skin 0-15 (SKIN_TONES), age 0-5 (AGES: 20s .. 70s) }
//   face   { shape, eyes, eyeColor, brows, nose, lips (indexes into FACE_OPTS), freckles, mole, dimples (0/1) }
//   hair   { style (HAIR_STYLES index), color (HAIR_COLORS), facial (FACIAL_HAIR index) }
//   extras { makeup (MAKEUP), makeupColor (MAKEUP_COLORS), tattoos (TATTOO_AREAS bits), piercings (PIERCINGS bits),
//            scar (SCARS) }
//   outfit { top, jacket, bottoms, set, shoes, hat, glasses, jewel, bag }: each null or { id (PIECES index), c main
//            colour, t trim colour (CLOTH indexes), p pattern (PATTERNS) }. A set (dresses, suits, tracksuits,
//            swimwear) is worn instead of a top and bottoms.
// encodeLook(look) -> a short string (66 characters) for saving and the network; decodeLook(code) -> look or null.
// validLook(look) -> a clamped copy (anything unknown goes back to a default) - the server's check.
// randomLook(seed, base?, style?) -> a whole random look (Randomise; NPCs later). STARTERS: the 12 CC9 presets.
// lookFromOutfit(old) -> the look an old random outfit (server entities.js playerOutfit) migrates to.
// lookToApp(look) -> the old renderer's appearance { s, h, hc, t, tc, tc2, l, sh, ht, htc, b, bd, lk } (lk: the code).
// lookArt(look) -> the art v2 people renderer's app (client/art2/people.js).
// The catalogue is append-only: a piece's index is its id on the wire and in saves.
import { mulberry32 } from './rng.js';

export const LOOK_VERSION = 1;
export const SLOTS = ['top', 'jacket', 'bottoms', 'set', 'shoes', 'hat', 'glasses', 'jewel', 'bag'];
export const SLOT_NAMES = { top: 'Tops', jacket: 'Jackets', bottoms: 'Bottoms', set: 'Dresses & sets', shoes: 'Shoes', hat: 'Hats', glasses: 'Glasses & masks', jewel: 'Jewellery', bag: 'Bags' };
export const STYLES = [
  ['hifashion', 'High fashion'], ['business', 'Business'], ['smart', 'Smart casual'], ['streetwear', 'Streetwear'], ['street', 'Street'],
  ['casual', 'Casual'], ['skater', 'Skater'], ['beach', 'Beach'], ['lounge', 'Lounge'], ['nightclub', 'Nightclub'], ['punk', 'Punk'],
  ['alt', 'Alt'], ['athletic', 'Athletic'], ['retro', 'Retro'], ['western', 'Western'], ['outdoors', 'Outdoors'], ['formal', 'Formal'],
  ['winter', 'Winter'], ['festival', 'Festival'], ['preppy', 'Preppy'], ['work', 'Work'], ['disguise', 'Disguise'],
];
export const PATTERNS = ['plain', 'stripes', 'check', 'camo', 'floral', 'tiedye'];

// ---- palettes ---------------------------------------------------------------------------------------------------
// skin: the first six are the old renderer's six tones (indexes kept); SKIN_ORDER lists all 16 light to deep
export const SKIN_TONES = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a',
  '#f8dcc8', '#ecc0a0', '#e8c08a', '#d8a070', '#c89a6a', '#b87a4a', '#946038', '#6a4024', '#5a3422', '#3e2416'];
export const SKIN_ORDER = [6, 0, 7, 8, 1, 9, 10, 2, 11, 3, 12, 4, 13, 14, 5, 15];
export const HAIR_COLORS = [
  ['#1a1410', 'Black'], ['#2e2422', 'Soft black'], ['#3b2414', 'Dark brown'], ['#6b3e1e', 'Brown'], ['#8a4a26', 'Chestnut'], ['#8a2e1e', 'Auburn'],
  ['#b06a30', 'Ginger'], ['#c8602a', 'Copper'], ['#d8906a', 'Strawberry'], ['#b5862f', 'Dark blonde'], ['#e2c066', 'Blonde'], ['#ece4c8', 'Platinum'],
  ['#8a8a8a', 'Grey'], ['#e8e8e8', 'White'], ['#b8202a', 'Red'], ['#e070a8', 'Pink'], ['#3a5ad8', 'Blue'], ['#7a3ac8', 'Purple'], ['#2a9a5a', 'Green'],
];
export const EYE_COLORS = [['#3a2414', 'Dark brown'], ['#6b4020', 'Brown'], ['#8a6a30', 'Hazel'], ['#b8862a', 'Amber'], ['#4a7a3a', 'Green'], ['#3a6ab8', 'Blue'], ['#7a8a94', 'Grey'], ['#7ab0e0', 'Light blue']];
export const CLOTH = [
  ['#f0eee8', 'White'], ['#e8dcc0', 'Cream'], ['#b8b8bc', 'Light grey'], ['#7a7a80', 'Grey'], ['#3a3a40', 'Charcoal'], ['#1a1a1e', 'Black'],
  ['#1d2a4a', 'Navy'], ['#2a4a8a', 'Denim'], ['#2350c8', 'Royal blue'], ['#6aa8e0', 'Sky'], ['#25b8c0', 'Teal'], ['#2e6a3a', 'Forest'],
  ['#2f9a3a', 'Green'], ['#5a6236', 'Olive'], ['#b8a878', 'Khaki'], ['#c8a070', 'Tan'], ['#6b4a2a', 'Brown'], ['#3e2a1e', 'Chocolate'],
  ['#7a1d2a', 'Burgundy'], ['#c8262b', 'Red'], ['#e2765e', 'Coral'], ['#ef7a1a', 'Orange'], ['#d8a030', 'Mustard'], ['#f2c21b', 'Yellow'],
  ['#b8e02a', 'Lime'], ['#9ad8b0', 'Mint'], ['#a898d8', 'Lavender'], ['#7a3ac8', 'Purple'], ['#5a2a5a', 'Plum'], ['#e04a9a', 'Pink'],
  ['#f0b0b8', 'Blush'], ['#ff5aa8', 'Hot pink'], ['#d9a21b', 'Gold'], ['#c8ccd4', 'Silver'], ['#a84a24', 'Rust'], ['#d8c8a0', 'Sand'],
  ['#4a5a6a', 'Slate'], ['#5a1a2a', 'Wine'], ['#5af04a', 'Neon green'], ['#d8f03a', 'Hi-vis'],
];
const CI = {}; CLOTH.forEach(([, n], i) => { CI[n.toLowerCase()] = i; });
const col = (n) => (typeof n === 'number' ? n : CI[n] ?? 0);
export const MAKEUP_COLORS = [['#b8202a', 'Red'], ['#e04a7a', 'Rose'], ['#c87a6a', 'Nude'], ['#7a1d3a', 'Berry'], ['#1a1a1e', 'Black'], ['#7a3ac8', 'Violet'], ['#d9a21b', 'Gold'], ['#3a6ab8', 'Blue']];

// ---- body, face, hair, extras --------------------------------------------------------------------------------------
export const BASES = [['m', 'Men'], ['f', 'Women']];
// (CB1: the builds and the heights well apart, so a street of people reads as different bodies)
export const BUILDS = [
  { name: 'Slim', h: 0.98, w: 0.8, limb: 0.78 }, { name: 'Average', h: 1, w: 1, limb: 1 }, { name: 'Athletic', h: 1, w: 1.1, limb: 1.16, muscle: 1 },
  { name: 'Curvy', h: 0.99, w: 1.16, limb: 1.16, belly: 0.6 }, { name: 'Big', h: 1, w: 1.3, limb: 1.3, belly: 1.5, muscle: 0.3 },
];
export const HEIGHTS = [0.88, 0.94, 1, 1.06, 1.12];
export const HEIGHT_NAMES = ['Short', 'Below average', 'Average', 'Tall', 'Very tall'];
export const AGES = ['20s', '30s', '40s', '50s', '60s', '70s'];
export const FACE_OPTS = {
  shape: ['Oval', 'Round', 'Square', 'Long', 'Heart', 'Diamond'],
  eyes: ['Almond', 'Round', 'Narrow', 'Hooded', 'Big', 'Sleepy'],
  brows: ['Natural', 'Thick', 'Thin', 'Arched', 'Straight', 'Bushy'],
  nose: ['Straight', 'Small', 'Button', 'Wide', 'Long', 'Hooked'],
  lips: ['Medium', 'Thin', 'Full', 'Wide', 'Bow', 'Small'],
};
// hairstyles (CB3-F / CB3-M): name, bases, how the renderer draws it (an art2 people.js style, plus length / volume)
export const HAIR_STYLES = [
  ['Bald', 'mf', 'bald'], ['Buzz cut', 'mf', 'buzz'], ['Crew cut', 'mf', 'short'], ['Short back & sides', 'm', 'sides'], ['Side part', 'mf', 'sidepart'], ['Slicked back', 'mf', 'slick'],
  ['Spiky', 'mf', 'spiky'], ['Quiff', 'm', 'quiff'], ['Curly crop', 'mf', 'curly'], ['Afro', 'mf', 'afro'], ['Mohawk', 'mf', 'mohawk'], ['Dreadlocks', 'mf', 'dreads'],
  ['Undercut', 'mf', 'undercut'], ['Mullet', 'mf', 'mullet'], ['Man bun', 'm', 'manbun'], ['Shoulder length', 'mf', 'shoulder'], ['Long straight', 'mf', 'long'], ['Long waves', 'mf', 'wavy'],
  ['Pixie', 'f', 'pixie'], ['Bob', 'f', 'bob'], ['Ponytail', 'mf', 'pony'], ['High bun', 'f', 'bun'], ['Top knot', 'mf', 'topknot'], ['Braids', 'f', 'braids'],
  ['Box braids', 'f', 'boxbraids'], ['Space buns', 'f', 'twinbuns'], ['Pigtails', 'f', 'pigtails'], ['Single braid', 'f', 'braid'], ['Curly long', 'f', 'curlylong'], ['Shag', 'mf', 'shag'],
  ['Cornrows', 'mf', 'cornrows'], ['Fade', 'm', 'fade'], ['Curtains', 'm', 'curtains'], ['Big curls', 'f', 'bigcurls'], ['Half up', 'f', 'halfup'], ['Shaved side', 'f', 'shavedside'],
];
// facial hair (CB4)
export const FACIAL_HAIR = [['None', null], ['Stubble', 'stubble'], ['Short beard', 'short'], ['Full beard', 'full'], ['Long beard', 'long'], ['Goatee', 'goatee'],
  ['Moustache', 'moustache'], ['Handlebar', 'handlebar'], ['Chin strap', 'chinstrap'], ['Mutton chops', 'chops'], ['Soul patch', 'soul'], ['Van Dyke', 'vandyke']];
export const MAKEUP = ['None', 'Natural', 'Lipstick', 'Smoky eyes', 'Blush', 'Glam', 'Goth'];
export const TATTOO_AREAS = [['arms', 'Arms'], ['legs', 'Legs'], ['neck', 'Neck'], ['chest', 'Chest & back'], ['face', 'Face']];
export const PIERCINGS = [['ears', 'Ears'], ['nose', 'Nose'], ['brow', 'Brow'], ['lip', 'Lip']];
export const SCARS = ['None', 'Cheek', 'Across the eye', 'Lip', 'Chin', 'Brow'];

// ---- the catalogue -------------------------------------------------------------------------------------------------
// [slot, name, bases, style tags, price, store, draw, main colour, trim colour]
// draw: what the renderer needs - k the art2 kind for its slot; set: bk the bottom half; jewel / bag / glasses: flags
export const PIECES = [null];
const add = (slot, name, bases, tags, price, store, d, c = 'black', t = 'white') => {
  PIECES.push({ i: PIECES.length, slot, name, b: bases, tags: tags.split(' '), price, store, d, c: col(c), t: col(t) });
};
// tops
add('top', 'Plain tee', 'mf', 'casual streetwear skater athletic street festival', 20, 'clothing', { k: 'tee' }, 'white');
add('top', 'Graphic tee', 'mf', 'streetwear skater punk casual festival', 28, 'clothing', { k: 'tee', print: 1 }, 'black', 'red');
add('top', 'Long-sleeve tee', 'mf', 'casual skater outdoors', 26, 'clothing', { k: 'longsleeve' }, 'grey');
add('top', 'Tank top', 'mf', 'athletic beach casual festival', 16, 'clothing', { k: 'tank' }, 'white');
add('top', 'Polo shirt', 'mf', 'preppy smart casual', 34, 'clothing', { k: 'polo' }, 'navy');
add('top', 'Button-up shirt', 'mf', 'business smart preppy formal', 45, 'clothing', { k: 'shirt' }, 'white');
add('top', 'Blouse', 'f', 'business smart hifashion', 48, 'boutique', { k: 'blouse' }, 'cream');
add('top', 'Hoodie', 'mf', 'streetwear street skater casual winter', 45, 'clothing', { k: 'hoodie' }, 'grey');
add('top', 'Sweater', 'mf', 'casual preppy winter retro', 50, 'clothing', { k: 'sweater' }, 'burgundy');
add('top', 'Turtleneck', 'mf', 'hifashion smart winter alt', 55, 'boutique', { k: 'turtleneck' }, 'black');
add('top', 'Crop top', 'f', 'nightclub festival beach streetwear', 22, 'clothing', { k: 'crop' }, 'pink');
add('top', 'Tube top', 'f', 'nightclub beach festival', 20, 'clothing', { k: 'tube' }, 'black');
add('top', 'Corset top', 'f', 'nightclub alt hifashion punk', 60, 'boutique', { k: 'corset' }, 'black', 'wine');
add('top', 'Hawaiian shirt', 'mf', 'beach retro casual festival', 38, 'clothing', { k: 'hawaiian', p: 4 }, 'teal', 'yellow');
add('top', 'Flannel shirt', 'mf', 'outdoors western casual alt work', 40, 'clothing', { k: 'flannel', p: 2 }, 'red', 'black');
add('top', 'Football jersey', 'mf', 'athletic streetwear casual', 55, 'sports', { k: 'jersey' }, 'royal blue');
add('top', 'Sports bra', 'f', 'athletic', 30, 'sports', { k: 'bra' }, 'black');
add('top', 'Track jacket', 'mf', 'athletic street streetwear retro', 48, 'sports', { k: 'tracksuit' }, 'navy', 'white');
add('top', 'Hi-vis vest', 'mf', 'work disguise', 25, 'workwear', { k: 'hivis' }, 'hi-vis', 'charcoal');
add('top', 'Work shirt', 'mf', 'work western', 32, 'workwear', { k: 'uniform', plain: 1 }, 'khaki');
add('top', 'Mesh top', 'mf', 'nightclub punk alt festival', 30, 'boutique', { k: 'tank', mesh: 1 }, 'black');
add('top', 'Rugby shirt', 'm', 'preppy retro athletic', 46, 'sports', { k: 'polo', p: 1 }, 'forest', 'cream');
add('top', 'Thermal top', 'mf', 'outdoors winter', 30, 'outdoor', { k: 'longsleeve' }, 'cream');
add('top', 'Bikini top', 'f', 'beach', 28, 'beach', { k: 'bikini' }, 'coral');
add('top', 'Bare chest', 'm', 'beach athletic', 0, 'clothing', { k: 'none' }, 'white');
// jackets (worn open over the top: the top shows down the front)
add('jacket', 'Denim jacket', 'mf', 'casual streetwear retro festival punk', 70, 'clothing', { k: 'jacket' }, 'denim', 'white');
add('jacket', 'Leather jacket', 'mf', 'punk street nightclub alt retro', 160, 'boutique', { k: 'leather' }, 'black');
add('jacket', 'Bomber jacket', 'mf', 'streetwear street casual', 90, 'clothing', { k: 'jacket', bomber: 1 }, 'olive', 'orange');
add('jacket', 'Blazer', 'mf', 'business smart preppy hifashion', 140, 'boutique', { k: 'blazer' }, 'navy');
add('jacket', 'Suit jacket', 'mf', 'business formal', 220, 'boutique', { k: 'blazer' }, 'charcoal');
add('jacket', 'Puffer jacket', 'mf', 'winter streetwear outdoors', 130, 'outdoor', { k: 'puffer' }, 'black');
add('jacket', 'Trench coat', 'mf', 'business hifashion smart retro disguise', 190, 'boutique', { k: 'coat' }, 'tan');
add('jacket', 'Wool coat', 'mf', 'winter smart business formal', 200, 'boutique', { k: 'coat' }, 'charcoal');
add('jacket', 'Fur coat', 'mf', 'hifashion nightclub winter', 480, 'boutique', { k: 'fur' }, 'cream');
add('jacket', 'Cardigan', 'mf', 'preppy casual retro lounge', 60, 'clothing', { k: 'cardigan' }, 'mustard');
add('jacket', 'Zip hoodie', 'mf', 'streetwear skater casual athletic', 50, 'clothing', { k: 'hoodie', open: 1 }, 'grey');
add('jacket', 'Varsity jacket', 'mf', 'preppy streetwear retro', 120, 'sports', { k: 'jacket', varsity: 1 }, 'red', 'cream');
add('jacket', 'Rain jacket', 'mf', 'outdoors winter', 80, 'outdoor', { k: 'jacket', gloss: 1 }, 'yellow');
add('jacket', 'Waistcoat', 'mf', 'formal business retro western', 70, 'boutique', { k: 'vest' }, 'charcoal');
add('jacket', 'Puffer vest', 'mf', 'outdoors winter preppy', 70, 'outdoor', { k: 'vest', quilt: 1 }, 'navy');
add('jacket', 'Studded vest', 'mf', 'punk alt', 85, 'boutique', { k: 'vest', studs: 1 }, 'black', 'silver');
add('jacket', 'Fringe jacket', 'mf', 'western festival retro', 150, 'boutique', { k: 'leather', fringe: 1 }, 'tan');
add('jacket', 'Kimono', 'f', 'festival lounge hifashion', 75, 'boutique', { k: 'coat', p: 4 }, 'plum', 'blush');
add('jacket', 'Bathrobe', 'mf', 'lounge', 40, 'clothing', { k: 'coat', robe: 1 }, 'white');
add('jacket', 'Lab coat', 'mf', 'work disguise', 60, 'workwear', { k: 'coat' }, 'white');
// bottoms
add('bottoms', 'Jeans', 'mf', 'casual streetwear street western punk retro', 55, 'clothing', { k: 'jeans' }, 'denim');
add('bottoms', 'Ripped jeans', 'mf', 'punk streetwear alt festival', 60, 'clothing', { k: 'jeans', ripped: 1 }, 'sky');
add('bottoms', 'Black jeans', 'mf', 'alt punk nightclub', 55, 'clothing', { k: 'jeans' }, 'black');
add('bottoms', 'Chinos', 'mf', 'smart preppy casual', 50, 'clothing', { k: 'pants' }, 'khaki');
add('bottoms', 'Suit trousers', 'mf', 'business formal', 90, 'boutique', { k: 'pants' }, 'charcoal');
add('bottoms', 'Cargo pants', 'mf', 'streetwear outdoors work skater', 50, 'clothing', { k: 'cargo' }, 'olive');
add('bottoms', 'Joggers', 'mf', 'athletic street streetwear lounge', 40, 'sports', { k: 'track' }, 'grey', 'white');
add('bottoms', 'Shorts', 'mf', 'casual beach skater athletic', 30, 'clothing', { k: 'shorts' }, 'khaki');
add('bottoms', 'Denim shorts', 'mf', 'festival beach casual', 35, 'clothing', { k: 'shorts' }, 'sky');
add('bottoms', 'Leggings', 'f', 'athletic lounge casual', 32, 'sports', { k: 'leggings' }, 'black');
add('bottoms', 'Mini skirt', 'f', 'nightclub festival punk hifashion', 40, 'boutique', { k: 'skirt', len: 1 }, 'black');
add('bottoms', 'Skirt', 'f', 'smart business preppy casual', 45, 'clothing', { k: 'skirt' }, 'navy');
add('bottoms', 'Maxi skirt', 'f', 'festival hifashion lounge', 55, 'boutique', { k: 'skirt', len: -1 }, 'mustard');
add('bottoms', 'Plaid skirt', 'f', 'preppy punk alt', 45, 'clothing', { k: 'skirt', len: 1, p: 2 }, 'red', 'black');
add('bottoms', 'Work trousers', 'mf', 'work', 45, 'workwear', { k: 'cargo' }, 'charcoal');
add('bottoms', 'Leather trousers', 'mf', 'nightclub punk hifashion', 140, 'boutique', { k: 'pants', gloss: 1 }, 'black');
add('bottoms', 'Swim trunks', 'm', 'beach', 25, 'beach', { k: 'trunks' }, 'royal blue');
add('bottoms', 'Bikini bottoms', 'f', 'beach', 22, 'beach', { k: 'bikini' }, 'coral');
add('bottoms', 'Flares', 'mf', 'retro festival', 60, 'clothing', { k: 'pants', flare: 1 }, 'denim');
add('bottoms', 'Pyjama bottoms', 'mf', 'lounge', 30, 'clothing', { k: 'pants', p: 2 }, 'sky', 'white');
// dresses and sets (instead of a top and bottoms)
add('set', 'Slip dress', 'f', 'nightclub hifashion', 120, 'boutique', { k: 'dress' }, 'wine');
add('set', 'Mini dress', 'f', 'nightclub festival', 90, 'boutique', { k: 'dress', len: 1 }, 'black');
add('set', 'Sundress', 'f', 'beach casual festival', 60, 'clothing', { k: 'dress', p: 4 }, 'yellow', 'white');
add('set', 'Evening gown', 'f', 'formal hifashion', 380, 'boutique', { k: 'gown' }, 'royal blue');
add('set', 'Wedding dress', 'f', 'formal', 900, 'boutique', { k: 'gown' }, 'white');
add('set', 'Business suit', 'mf', 'business formal', 320, 'boutique', { k: 'suit', bk: 'pants' }, 'charcoal', 'burgundy');
add('set', 'Tuxedo', 'm', 'formal nightclub', 420, 'boutique', { k: 'suit', bk: 'pants', bow: 1 }, 'black', 'black');
add('set', 'Tracksuit', 'mf', 'athletic street streetwear retro', 80, 'sports', { k: 'tracksuit', bk: 'track' }, 'red', 'white');
add('set', 'Overalls', 'mf', 'work western outdoors retro', 60, 'workwear', { k: 'overalls', bk: 'pants' }, 'denim', 'white');
add('set', 'Coveralls', 'mf', 'work disguise', 55, 'workwear', { k: 'longsleeve', bk: 'cargo', zip: 1 }, 'orange', 'charcoal');
add('set', 'Jumpsuit', 'f', 'hifashion nightclub retro', 140, 'boutique', { k: 'longsleeve', bk: 'pants' }, 'olive');
add('set', 'Scrubs', 'mf', 'work disguise', 45, 'workwear', { k: 'scrubs', bk: 'pants' }, 'teal');
add('set', 'Swimsuit', 'f', 'beach athletic', 45, 'beach', { k: 'swimsuit', bk: 'bikini' }, 'red');
add('set', 'Pyjamas', 'mf', 'lounge', 45, 'clothing', { k: 'shirt', bk: 'pants', p: 1 }, 'sky', 'white');
add('set', 'Wetsuit', 'mf', 'beach outdoors athletic', 110, 'beach', { k: 'longsleeve', bk: 'leggings' }, 'black', 'teal');
add('set', 'Underwear', 'mf', 'lounge', 15, 'clothing', { k: 'under', bk: 'trunks' }, 'white');
add('set', 'Ski suit', 'mf', 'winter outdoors', 210, 'outdoor', { k: 'puffer', bk: 'cargo' }, 'red', 'black');
add('set', 'Bodysuit', 'f', 'nightclub athletic alt', 70, 'boutique', { k: 'swimsuit', bk: 'leggings' }, 'black');
// shoes (CP4)
add('shoes', 'Sneakers', 'mf', 'casual streetwear street athletic skater', 70, 'shoes', { k: 'sneaker' }, 'white');
add('shoes', 'High-tops', 'mf', 'streetwear skater street retro', 90, 'shoes', { k: 'sneaker', hi: 1 }, 'red', 'white');
add('shoes', 'Running shoes', 'mf', 'athletic', 95, 'sports', { k: 'sneaker' }, 'royal blue', 'white');
add('shoes', 'Skate shoes', 'mf', 'skater', 60, 'shoes', { k: 'sneaker' }, 'black', 'white');
add('shoes', 'Loafers', 'mf', 'smart preppy business', 110, 'shoes', { k: 'shoe' }, 'brown');
add('shoes', 'Oxfords', 'mf', 'business formal', 140, 'shoes', { k: 'shoe' }, 'black');
add('shoes', 'Boat shoes', 'mf', 'preppy beach', 80, 'shoes', { k: 'shoe' }, 'tan');
add('shoes', 'Ballet flats', 'f', 'smart casual preppy', 60, 'shoes', { k: 'shoe', flat: 1 }, 'black');
add('shoes', 'Heels', 'f', 'nightclub business formal hifashion', 120, 'shoes', { k: 'heel' }, 'black');
add('shoes', 'Stilettos', 'f', 'nightclub hifashion formal', 160, 'shoes', { k: 'heel' }, 'red');
add('shoes', 'Ankle boots', 'mf', 'smart casual alt', 120, 'shoes', { k: 'boot' }, 'brown');
add('shoes', 'Chelsea boots', 'mf', 'smart hifashion retro', 140, 'shoes', { k: 'boot' }, 'black');
add('shoes', 'Combat boots', 'mf', 'punk alt street disguise', 130, 'shoes', { k: 'boot', tall: 1 }, 'black');
add('shoes', 'Work boots', 'mf', 'work outdoors', 110, 'workwear', { k: 'boot' }, 'tan');
add('shoes', 'Cowboy boots', 'mf', 'western festival', 180, 'shoes', { k: 'boot', tall: 1 }, 'brown');
add('shoes', 'Hiking boots', 'mf', 'outdoors winter', 130, 'outdoor', { k: 'boot' }, 'brown');
add('shoes', 'Knee boots', 'f', 'hifashion nightclub winter', 190, 'shoes', { k: 'boot', tall: 2 }, 'black');
add('shoes', 'Rain boots', 'mf', 'outdoors winter festival', 50, 'outdoor', { k: 'boot', tall: 1, gloss: 1 }, 'yellow');
add('shoes', 'Sandals', 'mf', 'beach casual festival', 40, 'shoes', { k: 'sandal' }, 'brown');
add('shoes', 'Flip-flops', 'mf', 'beach lounge', 12, 'beach', { k: 'sandal' }, 'black');
add('shoes', 'Slides', 'mf', 'lounge athletic streetwear', 30, 'sports', { k: 'sandal' }, 'black');
add('shoes', 'Slippers', 'mf', 'lounge', 20, 'clothing', { k: 'shoe', flat: 1 }, 'grey');
add('shoes', 'Platform boots', 'mf', 'punk alt nightclub', 170, 'shoes', { k: 'boot', tall: 1, platform: 1 }, 'black');
add('shoes', 'Barefoot', 'mf', 'beach', 0, 'shoes', { k: 'barefoot' }, 'white');
// hats (CP1)
add('hat', 'Baseball cap', 'mf', 'casual streetwear athletic street', 25, 'clothing', { k: 'cap' }, 'navy');
add('hat', 'Snapback', 'mf', 'streetwear street skater', 30, 'clothing', { k: 'cap' }, 'black', 'gold');
add('hat', 'Trucker cap', 'mf', 'western work casual', 20, 'clothing', { k: 'trucker' }, 'red');
add('hat', 'Beanie', 'mf', 'winter skater street alt disguise', 18, 'clothing', { k: 'beanie' }, 'charcoal');
add('hat', 'Bucket hat', 'mf', 'festival streetwear beach outdoors', 25, 'clothing', { k: 'bucket' }, 'khaki');
add('hat', 'Sun hat', 'f', 'beach festival', 35, 'beach', { k: 'sunhat' }, 'sand');
add('hat', 'Cowboy hat', 'mf', 'western festival', 80, 'clothing', { k: 'cowboy' }, 'tan');
add('hat', 'Fedora', 'mf', 'retro smart nightclub', 60, 'boutique', { k: 'fedora' }, 'charcoal');
add('hat', 'Panama hat', 'mf', 'beach smart retro', 55, 'boutique', { k: 'fedora' }, 'cream');
add('hat', 'Beret', 'mf', 'hifashion alt retro', 35, 'boutique', { k: 'beret' }, 'black');
add('hat', 'Top hat', 'mf', 'formal hifashion', 120, 'boutique', { k: 'tophat' }, 'black');
add('hat', 'Hard hat', 'mf', 'work disguise', 25, 'workwear', { k: 'hard' }, 'yellow');
add('hat', 'Headband', 'mf', 'athletic retro festival', 10, 'sports', { k: 'headband' }, 'white');
add('hat', 'Head bandana', 'mf', 'street punk western', 12, 'clothing', { k: 'bandana' }, 'red');
add('hat', 'Bike helmet', 'mf', 'athletic outdoors', 60, 'sports', { k: 'helmet', plain: 1 }, 'black');
add('hat', 'Hood up', 'mf', 'street disguise winter', 0, 'clothing', { k: 'hood' }, 'grey');
add('hat', 'Visor', 'mf', 'athletic beach retro', 18, 'sports', { k: 'visor' }, 'white');
// glasses and masks (CP2): a balaclava or ski mask hides the hair; the eye patch has one strap round the head
add('glasses', 'Sunglasses', 'mf', 'casual beach nightclub hifashion', 40, 'boutique', { k: 'sun' }, 'black');
add('glasses', 'Aviators', 'mf', 'retro western smart', 70, 'boutique', { k: 'sun', lens: 'gold' }, 'gold');
add('glasses', 'Cat-eye shades', 'f', 'hifashion retro nightclub', 65, 'boutique', { k: 'sun', cat: 1 }, 'black');
add('glasses', 'Sport shades', 'mf', 'athletic outdoors', 50, 'sports', { k: 'sun', lens: 'sky' }, 'black');
add('glasses', 'Round glasses', 'mf', 'smart preppy alt retro', 45, 'boutique', { k: 'round' }, 'brown');
add('glasses', 'Reading glasses', 'mf', 'business smart', 25, 'boutique', { k: 'round' }, 'black');
add('glasses', 'Ski goggles', 'mf', 'winter outdoors', 60, 'outdoor', { k: 'goggles' }, 'black', 'orange');
add('glasses', 'Eye patch', 'mf', 'punk disguise', 15, 'costume', { k: 'patch' }, 'black');
add('glasses', 'Balaclava', 'mf', 'disguise winter', 25, 'costume', { k: 'balaclava' }, 'black');
add('glasses', 'Ski mask', 'mf', 'disguise winter', 30, 'outdoor', { k: 'skimask' }, 'charcoal', 'red');
add('glasses', 'Face bandana', 'mf', 'western disguise street', 12, 'clothing', { k: 'bandana' }, 'red');
add('glasses', 'Medical mask', 'mf', 'disguise work', 5, 'workwear', { k: 'medmask' }, 'sky');
add('glasses', 'Party mask', 'mf', 'nightclub disguise festival', 20, 'costume', { k: 'domino' }, 'black', 'gold');
// jewellery and watches (CP3)
add('jewel', 'Gold chain', 'mf', 'streetwear nightclub street', 250, 'jeweller', { chain: 1 }, 'gold');
add('jewel', 'Silver chain', 'mf', 'streetwear punk alt', 120, 'jeweller', { chain: 1 }, 'silver');
add('jewel', 'Pearl necklace', 'f', 'formal preppy hifashion', 300, 'jeweller', { chain: 1 }, 'white');
add('jewel', 'Choker', 'f', 'alt punk nightclub', 30, 'boutique', { choker: 1 }, 'black');
add('jewel', 'Hoop earrings', 'f', 'nightclub streetwear', 60, 'jeweller', { ear: 1 }, 'gold');
add('jewel', 'Stud earrings', 'mf', 'casual smart', 40, 'jeweller', { ear: 1 }, 'silver');
add('jewel', 'Watch', 'mf', 'business smart', 180, 'jeweller', { watch: 1 }, 'silver');
add('jewel', 'Gold watch', 'mf', 'business hifashion', 600, 'jeweller', { watch: 1 }, 'gold');
add('jewel', 'Bangles', 'f', 'festival hifashion', 50, 'jeweller', { bangles: 1 }, 'gold');
add('jewel', 'Chain and watch', 'mf', 'nightclub streetwear', 700, 'jeweller', { chain: 1, watch: 1 }, 'gold');
add('jewel', 'Spiked collar', 'mf', 'punk alt', 35, 'boutique', { choker: 1, studs: 1 }, 'black', 'silver');
// bags (CP3)
add('bag', 'Backpack', 'mf', 'casual streetwear skater outdoors', 45, 'clothing', { back: 1 }, 'navy');
add('bag', 'Hiking pack', 'mf', 'outdoors', 90, 'outdoor', { back: 1 }, 'forest');
add('bag', 'Crossbody bag', 'mf', 'streetwear casual festival', 50, 'boutique', { carry: 'bag' }, 'brown');
add('bag', 'Handbag', 'f', 'hifashion smart business', 160, 'boutique', { carry: 'purse' }, 'burgundy');
add('bag', 'Clutch', 'f', 'nightclub formal', 90, 'boutique', { carry: 'purse', small: 1 }, 'gold');
add('bag', 'Briefcase', 'mf', 'business', 120, 'boutique', { carry: 'briefcase' }, 'brown');
add('bag', 'Duffel bag', 'mf', 'athletic disguise', 50, 'sports', { carry: 'toolbag' }, 'black');
add('bag', 'Belt bag', 'mf', 'streetwear festival athletic', 30, 'clothing', { belt: 1 }, 'black');
// the starting looks' own (CC9, 2026-10-09): a sarong; an apron and bib overalls, worn over a top like a jacket (the
// top's sleeves and collar show round them); a coffee to go; a tool bag
add('bottoms', 'Sarong', 'f', 'beach festival', 35, 'beach', { k: 'skirt', p: 4 }, 'teal', 'lime');
add('jacket', 'Apron', 'mf', 'work casual', 25, 'workwear', { k: 'apron' }, 'forest', 'cream');
add('jacket', 'Bib overalls', 'mf', 'work western outdoors retro', 65, 'workwear', { k: 'overalls' }, 'denim', 'gold');
add('bag', 'Coffee to go', 'mf', 'casual business smart', 5, 'clothing', { carry: 'coffee' }, 'white');
add('bag', 'Tool bag', 'mf', 'work', 45, 'workwear', { carry: 'toolbag' }, 'red');
// issued, never sold or owned (d.issued: shared/wardrobe.js owns, randomLook and the creator leave them out): the police's
// uniforms by rank (CC5) - the patrol shirt, a sergeant's with chevrons, the dress uniform with a braided cap and white
// gloves for the top ranks, a tactical vest over the shirt (the K9 handler's) - worn on duty (server law.js) and by the
// city's officers (server npclooks.js)
add('top', 'Uniform shirt', 'mf', 'work', 0, 'police', { k: 'uniform', issued: 1 }, 'navy', 'gold');
add('top', "Sergeant's shirt", 'mf', 'work', 0, 'police', { k: 'uniform', chevrons: 1, issued: 1 }, 'navy', 'gold');
add('bottoms', 'Uniform trousers', 'mf', 'work', 0, 'police', { k: 'pants', issued: 1 }, 'navy');
add('set', 'Dress uniform', 'mf', 'work formal', 0, 'police', { k: 'dressuni', bk: 'pants', issued: 1 }, 'navy', 'gold');
add('hat', 'Police cap', 'mf', 'work', 0, 'police', { k: 'police', issued: 1 }, 'navy', 'gold');
add('hat', "Officer's cap", 'mf', 'work', 0, 'police', { k: 'police', braid: 1, issued: 1 }, 'navy', 'gold');
add('jacket', 'Tactical vest', 'mf', 'work', 0, 'police', { k: 'kevlar', issued: 1 }, 'black', 'charcoal');
add('jewel', 'Dress gloves', 'mf', 'work formal', 0, 'police', { gloves: 1, issued: 1 }, 'white');

export const PIECE_IDS = {}; for (const p of PIECES) if (p) PIECE_IDS[p.name] = p.i;
const byName = (n) => PIECE_IDS[n] || 0;
export const fits = (p, base) => !!p && p.b.includes(base);

// ---- a look ----------------------------------------------------------------------------------------------------------
const clampI = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
export function emptyLook(base = 'm') {
  const o = {}; for (const s of SLOTS) o[s] = null;
  return {
    v: LOOK_VERSION,
    body: { base, build: 1, height: 2, skin: 1, age: 0 },
    face: { shape: 0, eyes: 0, eyeColor: 0, brows: 0, nose: 0, lips: 0, freckles: 0, mole: 0, dimples: 0 },
    hair: { style: base === 'f' ? 16 : 2, color: 2, facial: 0 },
    extras: { makeup: 0, makeupColor: 0, tattoos: 0, piercings: 0, scar: 0 },
    outfit: o,
  };
}
export const item = (name, c, t, p = 0) => { const id = byName(name), P = PIECES[id]; return id ? { id, c: c === undefined ? P.c : col(c), t: t === undefined ? P.t : col(t), p: p || P.d.p || 0 } : null; };

// the clamped copy (or null for something that isn't a look at all)
export function validLook(L) {
  if (!L || typeof L !== 'object') return null;
  const b = L.body || {}, base = b.base === 'f' ? 'f' : 'm';
  const out = emptyLook(base);
  out.body = { base, build: clampI(b.build, 0, BUILDS.length - 1, 1), height: clampI(b.height, 0, HEIGHTS.length - 1, 2), skin: clampI(b.skin, 0, SKIN_TONES.length - 1, 1), age: clampI(b.age, 0, AGES.length - 1, 0) };
  const f = L.face || {};
  for (const k of ['shape', 'eyes', 'brows', 'nose', 'lips']) out.face[k] = clampI(f[k], 0, FACE_OPTS[k].length - 1, 0);
  out.face.eyeColor = clampI(f.eyeColor, 0, EYE_COLORS.length - 1, 0);
  for (const k of ['freckles', 'mole', 'dimples']) out.face[k] = f[k] ? 1 : 0;
  const h = L.hair || {};
  const st = clampI(h.style, 0, HAIR_STYLES.length - 1, out.hair.style);
  out.hair = { style: st, color: clampI(h.color, 0, HAIR_COLORS.length - 1, 2), facial: base === 'm' ? clampI(h.facial, 0, FACIAL_HAIR.length - 1, 0) : 0 };
  const e = L.extras || {};
  out.extras = { makeup: clampI(e.makeup, 0, MAKEUP.length - 1, 0), makeupColor: clampI(e.makeupColor, 0, MAKEUP_COLORS.length - 1, 0), tattoos: clampI(e.tattoos, 0, (1 << TATTOO_AREAS.length) - 1, 0), piercings: clampI(e.piercings, 0, (1 << PIERCINGS.length) - 1, 0), scar: clampI(e.scar, 0, SCARS.length - 1, 0) };
  const o = L.outfit || {};
  for (const s of SLOTS) {
    const it = o[s];
    if (!it || typeof it !== 'object') continue;
    const P = PIECES[clampI(it.id, 0, PIECES.length - 1, 0)];
    if (!P || P.slot !== s) continue;   // (anyone can wear anything: a piece's bases only sort the lists)
    out.outfit[s] = { id: P.i, c: clampI(it.c, 0, CLOTH.length - 1, P.c), t: clampI(it.t, 0, CLOTH.length - 1, P.t), p: clampI(it.p, 0, PATTERNS.length - 1, 0) };
  }
  if (out.outfit.set) { out.outfit.top = null; out.outfit.bottoms = null; }
  return out;
}

// ---- compact code: one character a field (two for a piece), 64-letter alphabet ---------------------------------------------
const AB = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
const AV = {}; for (let i = 0; i < 64; i++) AV[AB[i]] = i;
export function encodeLook(L) {
  L = validLook(L);
  if (!L) return '';
  const b = L.body, f = L.face, h = L.hair, e = L.extras;
  const n = [LOOK_VERSION, b.base === 'f' ? 1 : 0, b.build, b.height, b.skin, b.age, f.shape, f.eyes, f.eyeColor, f.brows, f.nose, f.lips, f.freckles | (f.mole << 1) | (f.dimples << 2),
    h.style, h.color, h.facial, e.makeup, e.makeupColor, e.tattoos, e.piercings, e.scar];
  let s = '';
  for (const v of n) s += AB[v & 63];
  for (const k of SLOTS) {
    const it = L.outfit[k];
    if (!it) { s += '00000'; continue; }
    s += AB[(it.id >> 6) & 63] + AB[it.id & 63] + AB[it.c & 63] + AB[it.t & 63] + AB[it.p & 63];
  }
  return s;
}
export const LOOK_CODE_LEN = 21 + SLOTS.length * 5;
export function decodeLook(s) {
  if (typeof s !== 'string' || s.length !== LOOK_CODE_LEN) return null;
  const v = [];
  for (let i = 0; i < s.length; i++) { const x = AV[s[i]]; if (x === undefined) return null; v.push(x); }
  if (v[0] !== LOOK_VERSION) return null;
  const L = {
    v: LOOK_VERSION,
    body: { base: v[1] ? 'f' : 'm', build: v[2], height: v[3], skin: v[4], age: v[5] },
    face: { shape: v[6], eyes: v[7], eyeColor: v[8], brows: v[9], nose: v[10], lips: v[11], freckles: v[12] & 1, mole: (v[12] >> 1) & 1, dimples: (v[12] >> 2) & 1 },
    hair: { style: v[13], color: v[14], facial: v[15] },
    extras: { makeup: v[16], makeupColor: v[17], tattoos: v[18], piercings: v[19], scar: v[20] },
    outfit: {},
  };
  SLOTS.forEach((k, j) => { const o = 21 + j * 5, id = v[o] * 64 + v[o + 1]; L.outfit[k] = id ? { id, c: v[o + 2], t: v[o + 3], p: v[o + 4] } : null; });
  return validLook(L);
}

// ---- random looks -------------------------------------------------------------------------------------------------------
const rint = (r, n) => Math.floor(r() * n) % n;
const rpick = (r, a) => a[rint(r, a.length)];
const pieceList = (slot, base, style) => PIECES.filter((p) => p && p.slot === slot && fits(p, base) && !p.d.issued && (!style || p.tags.includes(style)));   // (never an issued uniform)
const NEUTRAL = ['white', 'black', 'charcoal', 'grey', 'navy', 'denim', 'cream', 'khaki', 'brown', 'tan', 'olive'].map(col);
// A whole random look from a seed. base: 'm' | 'f' | null (either); style: a STYLES id to dress in (null: any).
export function randomLook(seed, base = null, style = null) {
  const r = mulberry32((seed >>> 0) ^ 0x5eed1001);
  base = base === 'm' || base === 'f' ? base : r() < 0.5 ? 'm' : 'f';
  const L = emptyLook(base);
  L.body = { base, build: rpick(r, [0, 1, 1, 1, 2, 2, 3, 4]), height: rpick(r, [0, 1, 2, 2, 2, 3, 4]), skin: rint(r, SKIN_TONES.length), age: rpick(r, [0, 0, 1, 1, 2, 3, 4, 5]) };
  for (const k of ['shape', 'eyes', 'brows', 'nose', 'lips']) L.face[k] = rint(r, FACE_OPTS[k].length);
  L.face.eyeColor = rpick(r, [0, 0, 1, 1, 2, 3, 4, 5, 6, 7]);
  L.face.freckles = r() < 0.15 ? 1 : 0; L.face.mole = r() < 0.12 ? 1 : 0; L.face.dimples = r() < 0.15 ? 1 : 0;
  const styles = HAIR_STYLES.map((h, i) => [h, i]).filter(([h]) => h[1].includes(base));
  L.hair.style = rpick(r, styles)[1];
  L.hair.color = L.body.age >= 4 && r() < 0.7 ? rpick(r, [12, 13]) : r() < 0.08 ? 14 + rint(r, 5) : rint(r, 12);
  L.hair.facial = base === 'm' && r() < 0.45 ? 1 + rint(r, FACIAL_HAIR.length - 1) : 0;
  if (base === 'f' && r() < 0.5) { L.extras.makeup = 1 + rint(r, MAKEUP.length - 1); L.extras.makeupColor = rint(r, MAKEUP_COLORS.length); }
  if (r() < 0.2) L.extras.tattoos = 1 + rint(r, (1 << TATTOO_AREAS.length) - 1) & 0b01111;
  if (r() < 0.25) L.extras.piercings = base === 'f' ? 1 | (r() < 0.3 ? 2 : 0) : rpick(r, [1, 2, 4, 8]);
  if (r() < 0.08) L.extras.scar = 1 + rint(r, SCARS.length - 1);
  const st = style || rpick(r, STYLES)[0];
  const pickPiece = (slot, chance = 1) => {
    if (r() > chance) return null;
    let list = pieceList(slot, base, st);
    if (!list.length) list = pieceList(slot, base, null).filter((p) => p.tags.includes('casual'));
    if (!list.length) return null;
    const P = rpick(r, list);
    const c = r() < 0.55 ? P.c : r() < 0.5 ? rpick(r, NEUTRAL) : rint(r, CLOTH.length);
    return { id: P.i, c, t: r() < 0.6 ? P.t : rint(r, CLOTH.length), p: P.d.p || (r() < 0.1 ? 1 + rint(r, PATTERNS.length - 1) : 0) };
  };
  const sets = pieceList('set', base, st).filter((p) => p.name !== 'Underwear');
  if (sets.length && r() < (base === 'f' ? 0.35 : 0.15)) L.outfit.set = pickPiece('set');
  if (!L.outfit.set || L.outfit.set && PIECES[L.outfit.set.id].name === 'Underwear') { L.outfit.set = null; L.outfit.top = pickPiece('top'); L.outfit.bottoms = pickPiece('bottoms'); }
  L.outfit.jacket = pickPiece('jacket', 0.4);
  L.outfit.shoes = pickPiece('shoes');
  L.outfit.hat = pickPiece('hat', 0.3);
  L.outfit.glasses = st === 'disguise' ? pickPiece('glasses', 0.6) : r() < 0.25 ? (() => { const l = pieceList('glasses', base, null).filter((p) => p.d.k === 'sun' || p.d.k === 'round'); const P = rpick(r, l); return { id: P.i, c: P.c, t: P.t, p: 0 }; })() : null;
  L.outfit.jewel = pickPiece('jewel', 0.25);
  L.outfit.bag = pickPiece('bag', 0.2);
  return validLook(L);
}

// ---- the twelve starting looks (CC9) ---------------------------------------------------------------------------------------
// CC9's own twelve, by name and line (2026-10-09; the first set only shared its idea): the skater, the beachgoer, the
// rancher, the club-goer, the executive, the barista, the punk, the jogger, the outdoorsy, the local, the blue-collar, the
// trendsetter - five women and seven men, as drawn
const mk = (name, sub, base, body, face, hair, extras, outfit) => {
  const L = emptyLook(base);
  Object.assign(L.body, body); Object.assign(L.face, face); Object.assign(L.hair, hair); Object.assign(L.extras, extras);
  for (const [k, v] of Object.entries(outfit)) L.outfit[k] = v;
  return { name, sub, look: validLook(L) };
};
export const STARTERS = [
  mk('The Skater', 'Street kid', 'm', { build: 1, skin: 1 }, { eyeColor: 1 }, { style: 6, color: 3 }, {}, { top: item('Plain tee', 'white'), jacket: item('Puffer jacket', 'red', 'black'), bottoms: item('Black jeans', 'black'), shoes: item('High-tops', 'white', 'white'), glasses: item('Sunglasses') }),
  mk('The Beachgoer', 'Sun chaser', 'f', { build: 3, skin: 11 }, { eyeColor: 1, lips: 2 }, { style: 20, color: 2 }, {}, { top: item('Tank top', 'black'), bottoms: item('Sarong', 'teal', 'lime', 4), shoes: item('Flip-flops', 'black'), glasses: item('Sunglasses'), jewel: item('Hoop earrings', 'gold') }),
  mk('The Rancher', 'Country roots', 'm', { build: 4, skin: 7, age: 4 }, { shape: 2, brows: 5 }, { style: 3, color: 3, facial: 3 }, {}, { top: item('Flannel shirt', 'red', 'black'), jacket: item('Bib overalls', 'denim', 'gold'), bottoms: item('Jeans'), shoes: item('Work boots', 'brown'), hat: item('Cowboy hat', 'tan') }),
  mk('The Club-goer', 'Night owl', 'f', { build: 0, skin: 9 }, { eyes: 4, lips: 2 }, { style: 26, color: 15 }, { makeup: 2, makeupColor: 1 }, { top: item('Crop top', 'black'), bottoms: item('Denim shorts', 'denim'), shoes: item('Skate shoes', 'black', 'white'), hat: item('Baseball cap', 'black'), jewel: item('Bangles', 'silver') }),
  mk('The Executive', 'Big ambitions', 'm', { build: 1, skin: 1, age: 1 }, { shape: 3 }, { style: 7, color: 3, facial: 1 }, {}, { set: item('Business suit', 'black', 'navy'), shoes: item('Oxfords', 'black'), glasses: item('Sunglasses'), bag: item('Briefcase', 'brown'), jewel: item('Watch', 'silver') }),
  mk('The Barista', 'Local favourite', 'f', { build: 1, skin: 8 }, { eyeColor: 4, freckles: 1 }, { style: 21, color: 9 }, {}, { top: item('Plain tee', 'black'), jacket: item('Apron', 'forest', 'cream'), bottoms: item('Chinos', 'black'), shoes: item('High-tops', 'black', 'white'), bag: item('Coffee to go') }),
  mk('The Punk', 'Outsider', 'm', { build: 2, skin: 1 }, { brows: 2 }, { style: 10, color: 14, facial: 1 }, { tattoos: 0b00101, piercings: 0b0001 }, { top: item('Tank top', 'black'), jacket: item('Studded vest', 'black', 'silver'), bottoms: item('Ripped jeans', 'black'), shoes: item('Combat boots', 'black'), jewel: item('Watch', 'black') }),
  mk('The Jogger', 'Disciplined', 'f', { build: 2, skin: 10 }, { shape: 4 }, { style: 20, color: 1 }, {}, { top: item('Sports bra', 'hot pink'), bottoms: item('Leggings', 'plum'), shoes: item('Running shoes', 'white', 'white'), jewel: item('Hoop earrings', 'gold') }),
  mk('The Outdoorsy', 'Hard worker', 'm', { build: 2, skin: 13 }, { shape: 2 }, { style: 1, color: 0, facial: 2 }, {}, { top: item('Hi-vis vest', 'hi-vis', 'black'), bottoms: item('Cargo pants', 'black'), shoes: item('Work boots', 'brown'), hat: item('Beanie', 'black') }),
  mk('The Local', 'Good vibes', 'm', { build: 4, skin: 0, age: 4 }, { shape: 1 }, { style: 8, color: 13, facial: 3 }, {}, { top: item('Hawaiian shirt', 'royal blue', 'orange'), bottoms: item('Shorts', 'khaki'), shoes: item('Flip-flops', 'navy'), glasses: item('Sunglasses') }),
  mk('The Blue-collar', 'Keeps it real', 'm', { build: 2, skin: 2, age: 1 }, { shape: 2 }, { style: 2, color: 1, facial: 2 }, {}, { top: item('Work shirt', 'royal blue', 'navy'), bottoms: item('Work trousers', 'royal blue'), shoes: item('Work boots', 'brown'), hat: item('Baseball cap', 'navy', 'orange'), bag: item('Tool bag', 'red') }),
  mk('The Trendsetter', 'Ahead of the curve', 'f', { build: 0, skin: 15 }, { eyes: 1, lips: 4 }, { style: 24, color: 0 }, {}, { top: item('Crop top', 'black'), bottoms: item('Cargo pants', 'tan'), shoes: item('Sneakers', 'white'), jewel: item('Bangles', 'gold') }),
];

// ---- the police's uniform (CC5) --------------------------------------------------------------------------------------------
// A look in the uniform by rank (shared/rules.js POLICE_RANKS: 0 Officer .. 5 Chief of Police), keeping the body, face and
// hair: the patrol shirt and the police cap; a sergeant's chevrons; from lieutenant the dress uniform and the braided cap;
// the chief's white gloves. kind 'rookie': a light blue shirt and a ball cap; 'k9': a tactical vest over the shirt and a
// ball cap. shades: sunglasses (half the street's officers wear them).
export function policeLook(L, rank = 0, kind = null, shades = false) {
  const V = validLook(L) || emptyLook('m'), O = V.outfit;
  for (const s of SLOTS) O[s] = null;
  if (rank >= 3) {
    O.set = item('Dress uniform'); O.hat = item("Officer's cap"); O.shoes = item('Oxfords', 'black');
    if (rank >= 5) O.jewel = item('Dress gloves');
  } else {
    O.top = item(rank >= 2 ? "Sergeant's shirt" : 'Uniform shirt', kind === 'rookie' ? 'sky' : 'navy', 'gold');
    O.bottoms = item('Uniform trousers', 'navy');
    O.shoes = item('Work boots', 'black');
    O.hat = kind === 'rookie' || kind === 'k9' ? item('Baseball cap', 'navy', 'gold') : item('Police cap');
    if (kind === 'k9') O.jacket = item('Tactical vest', 'black');
  }
  if (shades) O.glasses = item('Sunglasses');
  return validLook(V);
}

// ---- the old random outfit (server entities.js playerOutfit) -> a look -----------------------------------------------------
const hexRgb = (h) => { let s = String(h || '#888').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function nearest(list, hex) {
  const [r, g, b] = hexRgb(hex);
  let best = 0, bd = Infinity;
  list.forEach((e, i) => { const [R, G, B] = hexRgb(Array.isArray(e) ? e[0] : e); const d = (r - R) * (r - R) + (g - G) * (g - G) + (b - B) * (b - B); if (d < bd) { bd = d; best = i; } });
  return best;
}
export const nearestCloth = (hex) => nearest(CLOTH, hex);
export function lookFromOutfit(o) {
  o = o || {};
  const fem = o.h === 2 || o.h === 5 || o.t === 5;
  const base = fem ? 'f' : 'm';
  const L = emptyLook(base);
  L.body.skin = clampI(o.s, 0, 5, 1);
  L.body.build = [0, 1, 2, 4][clampI(o.bd, 0, 3, 1)];
  L.hair.color = nearest(HAIR_COLORS, o.hc || '#3b2414');
  L.hair.style = fem ? [19, 20, 16, 21, 17, 21][clampI(o.h, 0, 5, 0)] : [2, 6, 16, 0, 5, 20][clampI(o.h, 0, 5, 0)];
  const tc = nearestCloth(o.tc || '#888888'), tc2 = nearestCloth(o.tc2 || '#ffffff');
  const topName = ['Plain tee', 'Business suit', 'Hoodie', 'Hi-vis vest', 'Cardigan', 'Slip dress', 'Work shirt', 'Fur coat'][clampI(o.t, 0, 7, 0)];
  const P = PIECES[byName(topName)];
  if (P.slot === 'set') L.outfit.set = { id: P.i, c: tc, t: tc2, p: 0 };
  else if (P.slot === 'jacket') { L.outfit.jacket = { id: P.i, c: tc, t: tc2, p: 0 }; L.outfit.top = item('Plain tee', tc2); }
  else L.outfit.top = { id: P.i, c: tc, t: tc2, p: 0 };
  if (!L.outfit.set) L.outfit.bottoms = { id: byName(nearestCloth(o.l || '#2a4a8a') === col('denim') ? 'Jeans' : 'Chinos'), c: nearestCloth(o.l || '#2a4a8a'), t: 0, p: 0 };
  const sh = nearestCloth(o.sh || '#222222');
  L.outfit.shoes = { id: byName(sh === col('white') ? 'Sneakers' : fem && o.t === 5 ? 'Heels' : 'Oxfords'), c: sh, t: 0, p: 0 };
  const ht = clampI(o.ht, 0, 5, 0);
  if (ht) L.outfit.hat = { id: byName(['', 'Baseball cap', 'Hard hat', fem ? 'Sun hat' : 'Fedora', 'Beanie', 'Bike helmet'][ht]), c: nearestCloth(o.htc || '#222222'), t: 0, p: 0 };
  if (o.b === 1) L.outfit.bag = item('Briefcase');
  else if (o.b === 2 && fem) L.outfit.bag = item('Handbag');
  else if (o.b === 3) L.outfit.bag = item('Duffel bag');
  else if (o.b === 4) L.outfit.glasses = item('Sunglasses');
  return validLook(L);
}
// a preset for a brand-new player (until they pick their own): one of the starters, by their id
export function starterFor(n) { return STARTERS[(n >>> 0) % STARTERS.length].look; }

// ---- the old renderer's appearance (client/render/, server law.js descriptions) ------------------------------------------------
const HEX = (i) => CLOTH[i] ? CLOTH[i][0] : '#888888';
const OLD_SKIN = [0, 1, 2, 3, 4, 5, 0, 0, 1, 1, 2, 2, 3, 4, 4, 5];
export function lookToApp(L, code = null) {
  L = L || emptyLook('m');
  const O = L.outfit, P = (s) => (O[s] ? PIECES[O[s].id] : null), fem = L.body.base === 'f';
  const set = P('set'), top = P('top'), jk = P('jacket'), hat = P('hat'), bag = P('bag'), gl = P('glasses');
  const hs = HAIR_STYLES[L.hair.style] ? HAIR_STYLES[L.hair.style][2] : 'short';
  const h = fem ? (['long', 'wavy', 'curlylong', 'braids', 'dreads', 'halfup', 'boxbraids', 'bigcurls', 'shoulder'].includes(hs) ? 2 : ['bun', 'topknot', 'manbun', 'twinbuns', 'pony', 'pigtails', 'braid'].includes(hs) ? 5 : 2)
    : hs === 'bald' ? 3 : hs === 'slick' || hs === 'sidepart' || hs === 'mohawk' ? 4 : ['spiky', 'quiff', 'curly', 'afro', 'dreads', 'long', 'wavy', 'curlylong', 'shoulder'].includes(hs) ? 1 : 0;   // (2 and 5 read as a woman's)
  let t = 0;
  const tk = (set || top || {}).d?.k;
  if (set && set.d.k === 'suit') t = 1;
  else if (set && (set.d.k === 'dress' || set.d.k === 'gown')) t = 5;
  else if (jk && jk.d.k === 'fur') t = 7;
  else if (jk && jk.d.k === 'blazer') t = 1;
  else if (jk) t = 4;
  else if (tk === 'hoodie') t = 2;
  else if (tk === 'hivis') t = 3;
  else if (tk === 'uniform' || tk === 'scrubs') t = 6;
  const main = jk ? O.jacket : set ? O.set : O.top;
  const a = {
    s: OLD_SKIN[L.body.skin] ?? 1, h, hc: HAIR_COLORS[L.hair.color]?.[0] || '#3b2414',
    t, tc: main ? HEX(main.c) : '#d0c8c0', tc2: main ? HEX(main.t) : '#ffffff',
    l: set ? HEX(O.set.c) : O.bottoms ? HEX(O.bottoms.c) : '#334455', sh: O.shoes ? HEX(O.shoes.c) : '#222222',
    ht: hat ? ({ cap: 1, trucker: 1, visor: 1, hood: 1, hard: 2, sunhat: 3, cowboy: 3, fedora: 3, tophat: 3, bucket: 3, beanie: 4, beret: 4, bandana: 4, headband: 0, helmet: 5 }[hat.d.k] ?? 1) : 0,
    htc: hat ? HEX(O.hat.c) : '#222222',
    b: bag && bag.d.carry === 'briefcase' ? 1 : bag && bag.d.carry === 'purse' ? 2 : bag && bag.d.carry === 'toolbag' ? 3 : gl && gl.d.k === 'sun' ? 4 : 0,
    bd: [0, 1, 2, 2, 3][L.body.build] ?? 1,
  };
  if (gl && (gl.d.k === 'bandana')) a.bandana = true;
  a.lk = code || encodeLook(L);
  return a;
}

// ---- the art v2 people renderer's app (client/art2/people.js) ----------------------------------------------------------------
const mix = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
export function lookArt(L, opt = {}) {
  L = L || emptyLook('m');
  const O = L.outfit, P = (s) => (O[s] ? PIECES[O[s].id] : null), fem = L.body.base === 'f', B = BUILDS[L.body.build] || BUILDS[1];
  const H = HEIGHTS[L.body.height] ?? 1, age = L.body.age;
  const A = { fem, skin: L.body.skin, age, censored: !!opt.censored, lk: opt.code || encodeLook(L) };
  A.seed = 0; for (let i = 0; i < A.lk.length; i++) A.seed = (A.seed * 31 + A.lk.charCodeAt(i)) & 0xffff;
  A.body = { h: B.h * H, w: B.w, limb: B.limb, belly: (B.belly || 0) + (age >= 3 && L.body.build >= 3 ? 0.3 : 0), muscle: B.muscle || 0 };
  // hair: greys with age (dyed colours stay)
  let hc = HAIR_COLORS[L.hair.color]?.[0] || '#3b2414';
  if (L.hair.color < 12) { if (age === 3) hc = mix(hc, '#9a9a9a', 0.25); else if (age === 4) hc = mix(hc, '#a8a8a8', 0.55); else if (age === 5) hc = mix(hc, '#d0d0d0', 0.8); }
  A.hair = { style: HAIR_STYLES[L.hair.style]?.[2] || 'short', color: hc };
  const fh = FACIAL_HAIR[L.hair.facial]?.[1];
  if (fh && !fem) A.beard = fh;
  A.face = { ...L.face, eyeColor: EYE_COLORS[L.face.eyeColor]?.[0] };
  const ex = L.extras;
  if (ex.makeup) A.makeup = { kind: MAKEUP[ex.makeup].toLowerCase(), color: MAKEUP_COLORS[ex.makeupColor]?.[0] };
  if (ex.tattoos) A.tattoo = ex.tattoos;
  if (ex.piercings) A.piercings = ex.piercings;
  if (ex.scar) A.scar = ex.scar;
  // clothes
  const set = P('set'), top = P('top'), jk = P('jacket'), bot = P('bottoms');
  const pat = (o) => PATTERNS[o.p] && o.p ? PATTERNS[o.p] : undefined;
  if (set) {
    A.top = { kind: set.d.k, color: HEX(O.set.c), color2: HEX(O.set.t), trim: HEX(O.set.t), pattern: pat(O.set), len: set.d.len || 0, bow: set.d.bow ? 1 : 0, zip: set.d.zip ? 1 : 0 };
    A.bottom = { kind: set.d.bk || 'pants', color: HEX(O.set.c), color2: HEX(O.set.t), trim: HEX(O.set.t), pattern: pat(O.set), stripe: set.d.bk === 'track' ? HEX(O.set.t) : undefined };
  } else {
    A.top = top ? { kind: top.d.k, color: HEX(O.top.c), color2: HEX(O.top.t), trim: HEX(O.top.t), pattern: pat(O.top), print: top.d.print ? 1 : 0, mesh: top.d.mesh ? 1 : 0, plain: top.d.plain ? 1 : 0, chevrons: top.d.chevrons ? 1 : 0 } : { kind: fem ? 'tank' : 'none', color: '#e8e4dc' };
    A.bottom = bot ? { kind: bot.d.k, color: HEX(O.bottoms.c), color2: HEX(O.bottoms.t), trim: HEX(O.bottoms.t), pattern: pat(O.bottoms) || (bot.d.ripped ? 'ripped' : undefined), len: bot.d.len || 0, gloss: bot.d.gloss ? 1 : 0, stripe: bot.d.k === 'track' ? HEX(O.bottoms.t) : undefined } : { kind: fem ? 'bikini' : 'trunks', color: '#e8e4dc' };
  }
  if (jk) {   // worn open over the top: the top's colour down the front
    const under = A.top;
    A.top = { kind: jk.d.k === 'hoodie' ? 'ziphoodie' : jk.d.k, color: HEX(O.jacket.c), color2: HEX(O.jacket.t), trim: HEX(O.jacket.t), inner: under.kind === 'none' ? null : under.color, innerKind: under.kind, pattern: pat(O.jacket), quilt: jk.d.quilt ? 1 : 0, studs: jk.d.studs ? 1 : 0, fringe: jk.d.fringe ? 1 : 0, bomber: jk.d.bomber ? 1 : 0, varsity: jk.d.varsity ? 1 : 0, gloss: jk.d.gloss ? 1 : 0, robe: jk.d.robe ? 1 : 0, len: under.len || 0, under: under.kind };
    if (jk.d.k === 'vest') A.top.sleeve = under.kind === 'none' || under.kind === 'tank' || under.kind === 'tube' || under.kind === 'bra' || under.kind === 'crop' || under.kind === 'bikini' ? 'skin' : under.color;
    if (jk.d.k === 'kevlar') { A.top.kind = 'kevlar'; A.top.color = under.color || A.top.color; A.top.color2 = HEX(O.jacket.c); A.top.sleeve = under.kind === 'none' || under.kind === 'tank' ? 'skin' : under.color; A.top.chevrons = under.chevrons || 0; }   // (the plates over the shirt, the shirt's sleeves)
    if (jk.d.k === 'apron' || jk.d.k === 'overalls') {   // (worn over the top: the shirt round them is the top - its colour, its sleeves, a flannel's check - or bare skin)
      const bare = under.kind === 'none' || under.kind === 'tank' || under.kind === 'tube' || under.kind === 'bra' || under.kind === 'bikini';
      A.top.color2 = bare ? null : under.color; A.top.bareUnder = bare ? 1 : 0; A.top.sleeve = bare ? 'skin' : under.color;
    }
    if (set && (set.d.k === 'dress' || set.d.k === 'gown')) A.top.dressUnder = set.d.k === 'gown' ? -1 : set.d.len || 0;
  }
  const sh = P('shoes');
  if (sh) { A.shoes = HEX(O.shoes.c); A.shoeKind = sh.d.k; A.shoeTrim = HEX(O.shoes.t); if (sh.d.tall) A.bootTall = sh.d.tall; if (sh.d.hi) A.hiTop = 1; }
  else { A.shoes = '#d8c8b0'; A.shoeKind = 'barefoot'; }
  const hat = P('hat');
  if (hat) A.hat = { kind: hat.d.k, color: HEX(O.hat.c), trim: HEX(O.hat.t), braid: hat.d.braid ? 1 : 0 };
  if (hat && hat.d.k === 'hood') A.hat.color = A.top.color;
  const gl = P('glasses');
  if (gl) {
    const k = gl.d.k;
    if (k === 'balaclava' || k === 'skimask') { A.mask = HEX(O.glasses.c); A.maskTrim = k === 'skimask' ? HEX(O.glasses.t) : null; }
    else if (k === 'bandana') A.bandana = HEX(O.glasses.c);
    else if (k === 'medmask') A.medmask = HEX(O.glasses.c);
    else A.glasses = k, A.glassColor = HEX(O.glasses.c), A.lens = gl.d.lens ? HEX(col(gl.d.lens)) : null, A.glassTrim = HEX(O.glasses.t);
  }
  const jw = P('jewel');
  if (jw) A.jewel = { ...jw.d, color: HEX(O.jewel.c), trim: HEX(O.jewel.t) };
  if (jw && jw.d.chain) A.chain = HEX(O.jewel.c);
  if (jw && jw.d.gloves) A.gloves = HEX(O.jewel.c);
  const bg = P('bag');
  if (bg) {
    if (bg.d.back) { A.back = 'backpack'; A.backColor = HEX(O.bag.c); }
    else if (bg.d.belt) A.beltBag = HEX(O.bag.c);
    else { A.carry = bg.d.carry; A.bagColor = HEX(O.bag.c); if (bg.d.small) A.bagSmall = 1; }
  }
  return A;
}
