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
// (shared/look.js adds randomLook, CC9's STARTERS, policeLook and lookFromOutfit, and re-exports all of this: the
// game's renderer imports this core alone, the creator and the server look.js.)
// lookToApp(look) -> the old renderer's appearance { s, h, hc, t, tc, tc2, l, sh, ht, htc, b, bd, lk } (lk: the code).
// lookArt(look) -> the art v2 people renderer's app (client/art2/people.js).
// The catalogue is append-only: a piece's index is its id on the wire and in saves.

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
export const col = (n) => (typeof n === 'number' ? n : CI[n] ?? 0);
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
add('shoes', 'Flip-flops', 'mf', 'beach lounge', 12, 'beach', { k: 'sandal', strap: 1 }, 'black');
add('shoes', 'Slides', 'mf', 'lounge athletic streetwear', 30, 'sports', { k: 'sandal', strap: 2 }, 'black');
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
add('glasses', 'Eye patch', 'mf', 'punk disguise', 15, 'costume', { k: 'patch', nostreet: 1 }, 'black');
add('glasses', 'Balaclava', 'mf', 'disguise winter', 25, 'costume', { k: 'balaclava', nostreet: 1 }, 'black');
add('glasses', 'Ski mask', 'mf', 'disguise winter', 30, 'outdoor', { k: 'skimask', nostreet: 1 }, 'charcoal', 'red');
add('glasses', 'Face bandana', 'mf', 'western disguise street', 12, 'clothing', { k: 'bandana' }, 'red');
add('glasses', 'Medical mask', 'mf', 'disguise work', 5, 'workwear', { k: 'medmask', nostreet: 1 }, 'sky');
add('glasses', 'Party mask', 'mf', 'nightclub disguise festival', 20, 'costume', { k: 'domino', nostreet: 1 }, 'black', 'gold');
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
add('bottoms', 'Sarong', 'f', 'beach', 35, 'beach', { k: 'skirt', p: 4 }, 'teal', 'lime');
add('jacket', 'Apron', 'mf', 'work casual', 25, 'workwear', { k: 'apron' }, 'forest', 'cream');
add('jacket', 'Bib overalls', 'mf', 'work western outdoors retro', 65, 'workwear', { k: 'overalls' }, 'denim', 'gold');
add('bag', 'Coffee to go', 'mf', 'casual business smart', 5, 'clothing', { carry: 'coffee' }, 'white');
add('bag', 'Tool bag', 'mf', 'work', 45, 'workwear', { carry: 'toolbag' }, 'red');
// more hats and headwear (CP1, 2026-10-09)
add('hat', 'Cap backwards', 'mf', 'streetwear skater street', 30, 'clothing', { k: 'cap', back: 1 }, 'red', 'white');
add('hat', 'Pom-pom beanie', 'mf', 'winter casual outdoors', 25, 'outdoor', { k: 'beanie', pom: 1 }, 'navy', 'cream');
add('hat', 'Slouchy beanie', 'mf', 'skater alt streetwear', 22, 'clothing', { k: 'beanie', slouch: 1 }, 'burgundy');
add('hat', 'Flat cap', 'mf', 'retro smart preppy', 35, 'boutique', { k: 'flatcap', p: 2 }, 'brown', 'tan');
add('hat', 'Bowler hat', 'mf', 'formal retro', 60, 'boutique', { k: 'bowler' }, 'black');
add('hat', "Chef's hat", 'mf', 'work', 15, 'workwear', { k: 'toque' }, 'white');
add('hat', 'Sailor cap', 'mf', 'beach', 20, 'beach', { k: 'sailor' }, 'white', 'navy');
add('hat', 'Durag', 'mf', 'street streetwear', 15, 'clothing', { k: 'durag' }, 'black');
add('hat', 'Head wrap', 'f', 'festival casual', 25, 'boutique', { k: 'wrap', p: 4 }, 'teal', 'orange');
add('hat', 'Hijab', 'f', 'casual smart business', 30, 'boutique', { k: 'hijab' }, 'charcoal');
add('hat', 'Turban', 'mf', 'formal casual', 30, 'boutique', { k: 'turban' }, 'cream');
add('hat', 'Flower crown', 'f', 'festival', 20, 'clothing', { k: 'flowers' }, 'pink', 'lime');
add('hat', 'Tiara', 'f', 'formal hifashion nightclub', 120, 'jeweller', { k: 'tiara' }, 'silver', 'royal blue');
add('hat', 'Earmuffs', 'mf', 'winter', 20, 'outdoor', { k: 'earmuffs' }, 'cream', 'black');
add('hat', 'Cat ears', 'mf', 'festival nightclub', 12, 'boutique', { k: 'catears' }, 'black', 'pink');
add('hat', 'Moto helmet', 'mf', 'street retro', 90, 'outdoor', { k: 'moto' }, 'white', 'black');
add('hat', 'Skate helmet', 'mf', 'skater athletic', 45, 'sports', { k: 'skatehelmet' }, 'black');
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
// the rest of CP2, CP3 and CP4 (2026-10-09). Glasses that read at the game's size by their colours: square frames a dark
// band with the eyes behind it, browlines a line over them, mirrored and tinted lenses, a shield, goggles on a strap, a
// monocle, a chain. Masks: a neck gaiter, a gas mask with its filters, the costume heads - a pig, a clown, a skull, an
// alien - a masquerade mask with feathers, a welding mask. (nostreet: nobody walks about in it - npclooks.js)
add('glasses', 'Square glasses', 'mf', 'smart business alt preppy', 45, 'boutique', { k: 'frames' }, 'black');
add('glasses', 'Browline glasses', 'mf', 'retro smart business', 55, 'boutique', { k: 'browline' }, 'black', 'gold');
add('glasses', 'Rimless glasses', 'mf', 'business smart formal', 60, 'boutique', { k: 'rimless' }, 'silver');
add('glasses', 'Big frames', 'mf', 'hifashion retro', 70, 'boutique', { k: 'frames', big: 1 }, 'gold');
add('glasses', 'Shield shades', 'mf', 'athletic festival nightclub', 55, 'sports', { k: 'visor' }, 'black');
add('glasses', 'Round shades', 'mf', 'retro festival alt', 45, 'boutique', { k: 'roundsun', lens: 'royal blue' }, 'black');
add('glasses', 'Tinted rounds', 'mf', 'festival retro nightclub', 50, 'boutique', { k: 'roundsun', lens: 'red' }, 'gold');
add('glasses', 'Oversized shades', 'f', 'hifashion beach', 90, 'boutique', { k: 'sun', big: 1 }, 'chocolate');
add('glasses', 'Swim goggles', 'mf', 'beach athletic', 15, 'beach', { k: 'swim', nostreet: 1 }, 'royal blue');
add('glasses', 'Safety goggles', 'mf', 'work', 12, 'workwear', { k: 'safety', nostreet: 1 }, 'white', 'black');
add('glasses', 'Monocle', 'mf', 'formal retro', 80, 'jeweller', { k: 'monocle' }, 'gold');
add('glasses', 'Glasses on a chain', 'mf', 'smart retro', 45, 'boutique', { k: 'round', chain: 1 }, 'black', 'gold');
add('glasses', 'Neck gaiter', 'mf', 'outdoors winter disguise athletic', 18, 'outdoor', { k: 'gaiter' }, 'black');
add('glasses', 'Gas mask', 'mf', 'disguise punk', 60, 'costume', { k: 'gas', nostreet: 1 }, 'black', 'olive');
add('glasses', 'Pig mask', 'mf', 'disguise festival', 25, 'costume', { k: 'pig', nostreet: 1 }, 'blush');
add('glasses', 'Clown mask', 'mf', 'disguise festival', 25, 'costume', { k: 'clown', nostreet: 1 }, 'white', 'red');
add('glasses', 'Skull mask', 'mf', 'disguise festival punk', 25, 'costume', { k: 'skull', nostreet: 1 }, 'cream', 'black');
add('glasses', 'Alien mask', 'mf', 'disguise festival', 25, 'costume', { k: 'alien', nostreet: 1 }, 'lime', 'black');
add('glasses', 'Masquerade mask', 'mf', 'formal nightclub festival', 45, 'boutique', { k: 'masq', nostreet: 1 }, 'gold', 'royal blue');
add('glasses', 'Welding mask', 'mf', 'work disguise', 40, 'workwear', { k: 'welding', nostreet: 1 }, 'charcoal');
// shoes (CP4): chunky soles, a check, socks under slides, fur cuffs, a platform, a buckle, gloss
add('shoes', 'Dad sneakers', 'mf', 'streetwear casual retro', 85, 'shoes', { k: 'sneaker', chunky: 1 }, 'white', 'light grey');
add('shoes', 'Slip-ons', 'mf', 'skater streetwear casual', 50, 'shoes', { k: 'sneaker', p: 2 }, 'black', 'white');
add('shoes', 'Brogues', 'mf', 'smart business preppy retro', 150, 'shoes', { k: 'shoe' }, 'brown');
add('shoes', 'Pumps', 'f', 'business smart formal', 110, 'shoes', { k: 'heel' }, 'black');
add('shoes', 'Mary Janes', 'f', 'alt punk nightclub retro', 130, 'shoes', { k: 'heel', platform: 1 }, 'black');
add('shoes', 'Espadrilles', 'mf', 'beach casual smart', 45, 'beach', { k: 'shoe', flat: 1, sole: 1 }, 'cream', 'tan');
add('shoes', 'Fur slippers', 'mf', 'lounge winter', 30, 'clothing', { k: 'shoe', flat: 1, fur: 1, p: 2 }, 'charcoal', 'grey');
add('shoes', 'Winter boots', 'mf', 'winter outdoors', 140, 'outdoor', { k: 'boot', fur: 1 }, 'black');
add('shoes', 'Wellies', 'mf', 'outdoors work western', 45, 'outdoor', { k: 'boot', tall: 1, gloss: 1 }, 'forest');
add('shoes', 'Biker boots', 'mf', 'punk street western', 160, 'shoes', { k: 'boot', tall: 1, buckle: 1 }, 'black', 'silver');
add('shoes', 'Clogs', 'mf', 'casual work lounge', 60, 'shoes', { k: 'shoe', platform: 1 }, 'tan');
add('shoes', 'Slides and socks', 'mf', 'lounge streetwear athletic', 35, 'sports', { k: 'sandal', strap: 2, socks: 1 }, 'black', 'white');
// jewellery, watches and bags (CP3): a chunky chain, a pendant, pearl drops, ear cuffs, a smartwatch, beads, a leather
// cuff; a tote, a messenger bag, shopping bags, a chest rig, a guitar case on the back
add('jewel', 'Cuban chain', 'mf', 'streetwear nightclub street', 450, 'jeweller', { chain: 2 }, 'gold');
add('jewel', 'Pendant chain', 'mf', 'streetwear street western', 180, 'jeweller', { chain: 1, pendant: 1 }, 'gold');
add('jewel', 'Pearl drops', 'f', 'formal preppy hifashion', 140, 'jeweller', { ear: 2 }, 'white');
add('jewel', 'Ear cuffs', 'mf', 'alt punk hifashion', 45, 'jeweller', { ear: 1, cuff: 1 }, 'gold');
add('jewel', 'Smartwatch', 'mf', 'athletic casual business', 220, 'sports', { watch: 1 }, 'black');
add('jewel', 'Beaded bracelet', 'mf', 'festival casual alt', 15, 'clothing', { bangles: 1 }, 'black');
add('jewel', 'Leather cuff', 'mf', 'western punk alt', 30, 'boutique', { cuffband: 1 }, 'brown');
add('bag', 'Tote bag', 'mf', 'casual beach festival smart', 35, 'clothing', { carry: 'bag', big: 1 }, 'cream');
add('bag', 'Messenger bag', 'mf', 'smart casual streetwear retro', 60, 'boutique', { carry: 'bag', big: 1 }, 'brown');
add('bag', 'Shopping bags', 'mf', 'hifashion smart casual', 10, 'clothing', { carry: 'shopping' }, 'cream', 'red');
add('bag', 'Chest rig', 'mf', 'outdoors work disguise', 55, 'outdoor', { rig: 1 }, 'olive');
add('bag', 'Guitar case', 'mf', 'alt punk retro festival', 80, 'clothing', { back: 2 }, 'black');

export const PIECE_IDS = {}; for (const p of PIECES) if (p) PIECE_IDS[p.name] = p.i;
export const byName = (n) => PIECE_IDS[n] || 0;
export const fits = (p, base) => !!p && p.b.includes(base);

// ---- a look ----------------------------------------------------------------------------------------------------------
export const clampI = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
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


// colours as [r, g, b] (lookArt's mixes; lookgen's nearest cloth)
export const hexRgb = (h) => { let s = String(h || '#888').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ---- the old renderer's appearance (client/render/, server law.js descriptions) ------------------------------------------------
const HEX = (i) => CLOTH[i] ? CLOTH[i][0] : '#888888';
const FMASKS = ['gaiter', 'gas', 'pig', 'clown', 'skull', 'alien', 'welding'];   // (masks drawn as their own: people.js A.fmask)
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
    ht: hat ? ({ cap: 1, trucker: 1, visor: 1, hood: 1, hard: 2, sunhat: 3, cowboy: 3, fedora: 3, tophat: 3, bucket: 3, beanie: 4, beret: 4, bandana: 4, headband: 0, helmet: 5, flatcap: 4, bowler: 3, toque: 4, sailor: 1, durag: 4, wrap: 4, hijab: 4, turban: 4, flowers: 0, tiara: 0, earmuffs: 0, catears: 0, moto: 5, skatehelmet: 5 }[hat.d.k] ?? 1) : 0,
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
  if (sh) {
    A.shoes = HEX(O.shoes.c); A.shoeKind = sh.d.k; A.shoeTrim = HEX(O.shoes.t); if (sh.d.tall) A.bootTall = sh.d.tall; if (sh.d.hi) A.hiTop = 1;
    // (CP4: a sandal's straps, socks, a fur cuff, a platform or chunky sole, gloss, a buckle, a sole in the trim colour, a check)
    for (const f of ['strap', 'socks', 'fur', 'platform', 'chunky', 'gloss', 'buckle', 'sole']) if (sh.d[f]) A['shoe_' + f] = sh.d[f];
    if (O.shoes.p) A.shoePat = PATTERNS[O.shoes.p];
  }
  else { A.shoes = '#d8c8b0'; A.shoeKind = 'barefoot'; }
  const hat = P('hat');
  if (hat) A.hat = { kind: hat.d.k, color: HEX(O.hat.c), trim: HEX(O.hat.t), braid: hat.d.braid ? 1 : 0, back: hat.d.back ? 1 : 0, pom: hat.d.pom ? 1 : 0, slouch: hat.d.slouch ? 1 : 0, pattern: pat(O.hat) };
  if (hat && hat.d.k === 'hood') A.hat.color = A.top.color;
  const gl = P('glasses');
  if (gl) {
    const k = gl.d.k;
    if (k === 'balaclava' || k === 'skimask') { A.mask = HEX(O.glasses.c); A.maskTrim = k === 'skimask' ? HEX(O.glasses.t) : null; }
    else if (k === 'bandana') A.bandana = HEX(O.glasses.c);
    else if (k === 'medmask') A.medmask = HEX(O.glasses.c);
    else if (FMASKS.includes(k)) A.fmask = { k, c: HEX(O.glasses.c), t: HEX(O.glasses.t) };   // (the rest of CP2's masks)
    else {
      A.glasses = k === 'masq' ? 'domino' : k; A.glassColor = HEX(O.glasses.c); A.lens = gl.d.lens ? HEX(col(gl.d.lens)) : null; A.glassTrim = HEX(O.glasses.t);
      if (gl.d.big) A.glassBig = 1;
      if (gl.d.cat) A.glassCat = 1;
      if (gl.d.chain) A.glassChain = 1;
      if (k === 'masq') A.masq = HEX(O.glasses.t);   // (its feathers)
    }
  }
  const jw = P('jewel');
  if (jw) A.jewel = { ...jw.d, color: HEX(O.jewel.c), trim: HEX(O.jewel.t) };
  if (jw && jw.d.chain) A.chain = HEX(O.jewel.c);
  if (jw && jw.d.gloves) A.gloves = HEX(O.jewel.c);
  const bg = P('bag');
  if (bg) {
    if (bg.d.back) { A.back = bg.d.back === 2 ? 'guitarcase' : 'backpack'; A.backColor = HEX(O.bag.c); }
    else if (bg.d.belt) A.beltBag = HEX(O.bag.c);
    else if (bg.d.rig) A.rig = HEX(O.bag.c);
    else { A.carry = bg.d.carry; A.bagColor = HEX(O.bag.c); if (bg.d.small) A.bagSmall = 1; if (bg.d.big) A.bagBig = 1; }
  }
  return A;
}
