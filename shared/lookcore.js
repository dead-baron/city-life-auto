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
//   outfit { top, jacket, bottoms, set, shoes, hat, glasses, jewel, bag, under, socks }: each null or { id (PIECES index), c
//            main colour, t trim colour (CLOTH indexes), p pattern (PATTERNS) }. A set (dresses, suits, tracksuits,
//            swimwear) is worn instead of a top and bottoms. under: the underwear - what shows where there's no top
//            or no bottoms (null: the plain white basics every look had before the slot; 'Nothing on': bare, the
//            renderer's mosaic over the private areas).
// encodeLook(look) -> a short string (66 characters, 71 with underwear picked, 76 with socks) for saving and the network;
// decodeLook(code) -> look or null.
// validLook(look) -> a clamped copy (anything unknown goes back to a default) - the server's check.
// (shared/look.js adds randomLook, CC9's STARTERS, policeLook and lookFromOutfit, and re-exports all of this: the
// game's renderer imports this core alone, the creator and the server look.js.)
// lookToApp(look) -> the old renderer's appearance { s, h, hc, t, tc, tc2, l, sh, ht, htc, b, bd, lk } (lk: the code).
// lookArt(look) -> the art v2 people renderer's app (client/art2/people.js).
// The catalogue is append-only: a piece's index is its id on the wire and in saves.

export const LOOK_VERSION = 1;
export const SLOTS = ['top', 'jacket', 'bottoms', 'set', 'shoes', 'hat', 'glasses', 'jewel', 'bag', 'under', 'socks'];   // (append-only: a slot's place is its place in the code)
export const SLOT_NAMES = { top: 'Tops', jacket: 'Jackets', bottoms: 'Bottoms', set: 'Dresses & sets', shoes: 'Shoes', hat: 'Hats', glasses: 'Glasses & masks', jewel: 'Jewelry', bag: 'Bags', under: 'Underwear', socks: 'Socks' };
export const STYLES = [
  ['hifashion', 'High fashion'], ['business', 'Business'], ['smart', 'Smart casual'], ['streetwear', 'Streetwear'], ['street', 'Street'],
  ['casual', 'Casual'], ['skater', 'Skater'], ['beach', 'Beach'], ['lounge', 'Lounge'], ['nightclub', 'Nightclub'], ['punk', 'Punk'],
  ['alt', 'Alt'], ['athletic', 'Athletic'], ['retro', 'Retro'], ['western', 'Western'], ['outdoors', 'Outdoors'], ['formal', 'Formal'],
  ['winter', 'Winter'], ['festival', 'Festival'], ['preppy', 'Preppy'], ['work', 'Work'], ['disguise', 'Disguise'],
];
export const PATTERNS = ['plain', 'stripes', 'check', 'camo', 'floral', 'tiedye', 'dots', 'pinstripe'];   // (append-only: a look's code holds the place)
export const PASS_PATTERNS = 6;   // (from here on, the polish pass's own: dots, a stripe that runs down - offered while it is on)

// ---- palettes ---------------------------------------------------------------------------------------------------
// skin: the first six are the old renderer's six tones (indexes kept); SKIN_ORDER lists all 16 light to deep
export const SKIN_TONES = ['#f1c9a5', '#e0ac7e', '#c68953', '#a86b3c', '#7d4a26', '#4f2f1a',
  '#f8dcc8', '#ecc0a0', '#e8c08a', '#d8a070', '#c89a6a', '#b87a4a', '#946038', '#6a4024', '#5a3422', '#3e2416'];
export const SKIN_ORDER = [6, 0, 7, 8, 1, 9, 10, 2, 11, 3, 12, 4, 13, 14, 5, 15];
export const HAIR_COLORS = [
  ['#1a1410', 'Black'], ['#2e2422', 'Soft black'], ['#3b2414', 'Dark brown'], ['#6b3e1e', 'Brown'], ['#8a4a26', 'Chestnut'], ['#8a2e1e', 'Auburn'],
  ['#b06a30', 'Ginger'], ['#c8602a', 'Copper'], ['#d8906a', 'Strawberry'], ['#b5862f', 'Dark blonde'], ['#e2c066', 'Blonde'], ['#ece4c8', 'Platinum'],
  ['#8a8a8a', 'Gray'], ['#e8e8e8', 'White'], ['#b8202a', 'Red'], ['#e070a8', 'Pink'], ['#3a5ad8', 'Blue'], ['#7a3ac8', 'Purple'], ['#2a9a5a', 'Green'],
];
export const EYE_COLORS = [['#3a2414', 'Dark brown'], ['#6b4020', 'Brown'], ['#8a6a30', 'Hazel'], ['#b8862a', 'Amber'], ['#4a7a3a', 'Green'], ['#3a6ab8', 'Blue'], ['#7a8a94', 'Gray'], ['#7ab0e0', 'Light blue']];
export const CLOTH = [
  ['#f0eee8', 'White'], ['#e8dcc0', 'Cream'], ['#b8b8bc', 'Light gray'], ['#7a7a80', 'Gray'], ['#3a3a40', 'Charcoal'], ['#1a1a1e', 'Black'],
  ['#1d2a4a', 'Navy'], ['#2a4a8a', 'Denim'], ['#2350c8', 'Royal blue'], ['#6aa8e0', 'Sky'], ['#25b8c0', 'Teal'], ['#2e6a3a', 'Forest'],
  ['#2f9a3a', 'Green'], ['#5a6236', 'Olive'], ['#b8a878', 'Khaki'], ['#c8a070', 'Tan'], ['#6b4a2a', 'Brown'], ['#3e2a1e', 'Chocolate'],
  ['#7a1d2a', 'Burgundy'], ['#c8262b', 'Red'], ['#e2765e', 'Coral'], ['#ef7a1a', 'Orange'], ['#d8a030', 'Mustard'], ['#f2c21b', 'Yellow'],
  ['#b8e02a', 'Lime'], ['#9ad8b0', 'Mint'], ['#a898d8', 'Lavender'], ['#7a3ac8', 'Purple'], ['#5a2a5a', 'Plum'], ['#e04a9a', 'Pink'],
  ['#f0b0b8', 'Blush'], ['#ff5aa8', 'Hot pink'], ['#d9a21b', 'Gold'], ['#c8ccd4', 'Silver'], ['#a84a24', 'Rust'], ['#d8c8a0', 'Sand'],
  ['#4a5a6a', 'Slate'], ['#5a1a2a', 'Wine'], ['#5af04a', 'Neon green'], ['#d8f03a', 'Hi-vis'],
];
const CI = {}; CLOTH.forEach(([, n], i) => { CI[n.toLowerCase()] = i; });
CI.grey = CI.gray; CI['light grey'] = CI['light gray'];   // (the code's colour keys keep the old spelling: the names shown are American)
export const col = (n) => (typeof n === 'number' ? n : CI[n] ?? 0);
export const MAKEUP_COLORS = [['#b8202a', 'Red'], ['#e04a7a', 'Rose'], ['#c87a6a', 'Nude'], ['#7a1d3a', 'Berry'], ['#1a1a1e', 'Black'], ['#7a3ac8', 'Violet'], ['#d9a21b', 'Gold'], ['#3a6ab8', 'Blue']];

// ---- body, face, hair, extras --------------------------------------------------------------------------------------
export const BASES = [['m', 'Men'], ['f', 'Women']];
// (CB1: the builds and the heights well apart, so a street of people reads as different bodies)
export const BUILDS = [
  { name: 'Slim', h: 0.98, w: 0.8, limb: 0.78 }, { name: 'Average', h: 1, w: 1, limb: 1 }, { name: 'Athletic', h: 1, w: 1.1, limb: 1.16, muscle: 1 },
  { name: 'Curvy', h: 0.99, w: 1.16, limb: 1.16, belly: 0.6 }, { name: 'Big', h: 1, w: 1.3, limb: 1.3, belly: 1.5, muscle: 0.3 },
  { name: 'Bodybuilder', h: 1.02, w: 1.2, limb: 1.36, muscle: 1.5, pp: 1, b: 'm' },   // (the concepts' C1; pp: the creator offers it with the polish pass on, random looks never pick it; b: men only for now - on a woman the underwear's cut fails the body check)
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
  ['Box braids', 'mf', 'boxbraids'], ['Space buns', 'f', 'twinbuns'], ['Pigtails', 'f', 'pigtails'], ['Single braid', 'f', 'braid'], ['Curly long', 'mf', 'curlylong'], ['Shag', 'mf', 'shag'],
  ['Cornrows', 'mf', 'cornrows'], ['Fade', 'm', 'fade'], ['Curtains', 'm', 'curtains'], ['Big curls', 'f', 'bigcurls'], ['Half up', 'mf', 'halfup'], ['Shaved side', 'f', 'shavedside'],
  // (pass 2, CB3-M / CB3-F / CC2: shapes the concepts have that the list lacked; drawn by the polish pass)
  // (the fourth field: only with the pass on - the creator lists them then, random looks never pick them; off, each draws as its base style)
  ['Balding', 'm', 'balding', 1], ['Flat top', 'm', 'flattop', 1], ['Pompadour', 'm', 'pompadour', 1], ['Afro puffs', 'f', 'puffs', 1], ['Low ponytail', 'mf', 'lowpony', 1], ['Side fringe', 'mf', 'emo', 1],
  // (11-21, the last hair shapes on the concepts' checklist: 360 waves, a faux-hawk, a loc updo, a receding hairline, pin curls)
  ['Waves', 'm', 'waves', 1], ['Faux-hawk', 'mf', 'fauxhawk', 1], ['Loc updo', 'mf', 'locupdo', 1], ['Receding', 'm', 'receding', 1], ['Pin curls', 'f', 'pincurls', 1],
];
// facial hair (CB4)
export const FACIAL_HAIR = [['None', null], ['Stubble', 'stubble'], ['Short beard', 'short'], ['Full beard', 'full'], ['Long beard', 'long'], ['Goatee', 'goatee'],
  ['Moustache', 'moustache'], ['Handlebar', 'handlebar'], ['Chin strap', 'chinstrap'], ['Mutton chops', 'chops'], ['Soul patch', 'soul'], ['Van Dyke', 'vandyke']];   // (append-only)
// (the owner, 11-21: facial hair that doesn't show clearly at the game's size isn't worth having. Under the polish pass these
// three are drawn as the nearest style that reads - a short beard, a goatee, a goatee - and the creator doesn't offer them;
// a look saved with one keeps its number. With the pass off nothing changes.)
export const FACIAL_RETIRED = ['chinstrap', 'soul', 'vandyke'];
export const MAKEUP = ['None', 'Natural', 'Lipstick', 'Smoky eyes', 'Blush', 'Glam', 'Goth', 'Face paint', 'Eyeshadow'];   // (append-only: a look's code holds the place)
export const TATTOO_AREAS = [['arms', 'Arms'], ['legs', 'Legs'], ['neck', 'Neck'], ['chest', 'Chest & back'], ['face', 'Face']];
export const PIERCINGS = [['ears', 'Ears'], ['nose', 'Nose'], ['brow', 'Brow'], ['lip', 'Lip']];
export const SCARS = ['None', 'Cheek', 'Across the eye', 'Lip', 'Chin', 'Brow', 'Plaster', 'Black eye'];   // (append-only; the last two are the polish pass's: a plaster on the cheek, a black eye)

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
add('jacket', 'Kimono', 'mf', 'festival lounge hifashion', 75, 'boutique', { k: 'coat', p: 4 }, 'plum', 'blush');
add('jacket', 'Bathrobe', 'mf', 'lounge', 40, 'clothing', { k: 'coat', robe: 1 }, 'white');
add('jacket', 'Lab coat', 'mf', 'work disguise', 60, 'workwear', { k: 'coat' }, 'white');
// bottoms
add('bottoms', 'Jeans', 'mf', 'casual streetwear street western punk retro', 55, 'clothing', { k: 'jeans' }, 'denim');
add('bottoms', 'Ripped jeans', 'mf', 'punk streetwear alt festival', 60, 'clothing', { k: 'jeans', ripped: 1 }, 'sky');
add('bottoms', 'Black jeans', 'mf', 'alt punk nightclub', 55, 'clothing', { k: 'jeans' }, 'black');
add('bottoms', 'Chinos', 'mf', 'smart preppy casual', 50, 'clothing', { k: 'pants' }, 'khaki');
add('bottoms', 'Suit pants', 'mf', 'business formal', 90, 'boutique', { k: 'pants' }, 'charcoal');
add('bottoms', 'Cargo pants', 'mf', 'streetwear outdoors work skater', 50, 'clothing', { k: 'cargo' }, 'olive');
add('bottoms', 'Joggers', 'mf', 'athletic street streetwear lounge', 40, 'sports', { k: 'track' }, 'grey', 'white');
add('bottoms', 'Shorts', 'mf', 'casual beach skater athletic', 30, 'clothing', { k: 'shorts' }, 'khaki');
add('bottoms', 'Denim shorts', 'mf', 'festival beach casual', 35, 'clothing', { k: 'shorts' }, 'sky');
add('bottoms', 'Leggings', 'f', 'athletic lounge casual', 32, 'sports', { k: 'leggings' }, 'black');
add('bottoms', 'Mini skirt', 'f', 'nightclub festival punk hifashion', 40, 'boutique', { k: 'skirt', len: 1 }, 'black');
add('bottoms', 'Skirt', 'f', 'smart business preppy casual', 45, 'clothing', { k: 'skirt' }, 'navy');
add('bottoms', 'Maxi skirt', 'f', 'festival hifashion lounge', 55, 'boutique', { k: 'skirt', len: -1 }, 'mustard');
add('bottoms', 'Plaid skirt', 'f', 'preppy punk alt', 45, 'clothing', { k: 'skirt', len: 1, p: 2 }, 'red', 'black');
add('bottoms', 'Work pants', 'mf', 'work', 45, 'workwear', { k: 'cargo' }, 'charcoal');
add('bottoms', 'Leather pants', 'mf', 'nightclub punk hifashion', 140, 'boutique', { k: 'pants', gloss: 1 }, 'black');
add('bottoms', 'Swim trunks', 'm', 'beach', 25, 'beach', { k: 'trunks' }, 'royal blue');
add('bottoms', 'Bikini bottoms', 'f', 'beach', 22, 'beach', { k: 'bikini' }, 'coral');
add('bottoms', 'Flares', 'mf', 'retro festival', 60, 'clothing', { k: 'pants', flare: 1 }, 'denim');
add('bottoms', 'Pajama bottoms', 'mf', 'lounge', 30, 'clothing', { k: 'pants', p: 2 }, 'sky', 'white');
// dresses and sets (instead of a top and bottoms)
add('set', 'Slip dress', 'f', 'nightclub hifashion', 120, 'boutique', { k: 'dress' }, 'wine');
add('set', 'Mini dress', 'f', 'nightclub festival', 90, 'boutique', { k: 'dress', len: 1 }, 'black');
add('set', 'Sundress', 'f', 'beach casual festival', 60, 'clothing', { k: 'dress', p: 4 }, 'yellow', 'white');
add('set', 'Evening gown', 'f', 'formal hifashion', 380, 'boutique', { k: 'gown' }, 'royal blue');
add('set', 'Wedding dress', 'f', 'formal', 900, 'boutique', { k: 'gown' }, 'white');
add('set', 'Business suit', 'mf', 'business formal', 320, 'boutique', { k: 'suit', bk: 'pants' }, 'charcoal', 'burgundy');
add('set', 'Tuxedo', 'mf', 'formal nightclub', 420, 'boutique', { k: 'suit', bk: 'pants', bow: 1 }, 'black', 'black');
add('set', 'Tracksuit', 'mf', 'athletic street streetwear retro', 80, 'sports', { k: 'tracksuit', bk: 'track' }, 'red', 'white');
add('set', 'Overalls', 'mf', 'work western outdoors retro', 60, 'workwear', { k: 'overalls', bk: 'pants' }, 'denim', 'white');
add('set', 'Coveralls', 'mf', 'work disguise', 55, 'workwear', { k: 'longsleeve', bk: 'cargo', zip: 1 }, 'orange', 'charcoal');
add('set', 'Jumpsuit', 'f', 'hifashion nightclub retro', 140, 'boutique', { k: 'longsleeve', bk: 'pants' }, 'olive');
add('set', 'Scrubs', 'mf', 'work disguise', 45, 'workwear', { k: 'scrubs', bk: 'pants' }, 'teal');
add('set', 'Swimsuit', 'f', 'beach athletic', 45, 'beach', { k: 'swimsuit', bk: 'bikini' }, 'red');
add('set', 'Pajamas', 'mf', 'lounge', 45, 'clothing', { k: 'shirt', bk: 'pants', p: 1 }, 'sky', 'white');
add('set', 'Wetsuit', 'mf', 'beach outdoors athletic', 110, 'beach', { k: 'longsleeve', bk: 'leggings' }, 'black', 'teal');
add('set', 'Underwear', 'mf', 'lounge', 15, 'clothing', { k: 'under', bk: 'trunks', basic: 1 }, 'white');   // (the owner, 11-20: just your underwear - the piece you wear under, or the basics: boxers; a bra and panties. The undershirt and trunks it was: 'Undershirt and trunks', the catalogue's last)
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
add('glasses', 'Aviators', 'mf', 'retro western smart', 70, 'boutique', { k: 'sun', lens: 'gold', f: 'avi' }, 'gold');
add('glasses', 'Cat-eye shades', 'f', 'hifashion retro nightclub', 65, 'boutique', { k: 'sun', cat: 1 }, 'black');
add('glasses', 'Sport shades', 'mf', 'athletic outdoors', 50, 'sports', { k: 'sun', lens: 'sky', f: 'wrap' }, 'black');
add('glasses', 'Round glasses', 'mf', 'smart preppy alt retro', 45, 'boutique', { k: 'round' }, 'brown');
add('glasses', 'Reading glasses', 'mf', 'business smart', 25, 'boutique', { k: 'round', f: 'half' }, 'black');
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
add('jewel', 'Pearl necklace', 'f', 'formal preppy hifashion', 300, 'jeweller', { chain: 1, pearl: 1 }, 'white');
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
add('bag', 'Duffel bag', 'mf', 'athletic disguise', 50, 'sports', { carry: 'toolbag', duffel: 1 }, 'black');
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
add('bottoms', 'Uniform pants', 'mf', 'work', 0, 'police', { k: 'pants', issued: 1 }, 'navy');
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
// the people of the wilds' kit (Nature-C4, 2026-10-20: server/systems/wildfolk.js): a park ranger's flat-brimmed hat, the
// birder's and the angler's pocketed field vest, a kayaker's life vest, a dirt biker's jersey, a climber's helmet and a
// backpacker's tall trekking pack with the bedroll on top - all in the outdoor and the sports shops too
add('hat', 'Ranger hat', 'mf', 'outdoors work', 45, 'outdoor', { k: 'cowboy', flat: 1 }, 'tan', 'brown');
add('jacket', 'Field vest', 'mf', 'outdoors work', 55, 'outdoor', { k: 'vest', pockets: 1 }, 'khaki', 'olive');
add('jacket', 'Life vest', 'mf', 'outdoors beach athletic', 60, 'outdoor', { k: 'vest', pfd: 1 }, 'orange', 'black');
add('top', 'MX jersey', 'mf', 'athletic outdoors streetwear', 60, 'sports', { k: 'jersey' }, 'red', 'white');
add('hat', 'Climbing helmet', 'mf', 'outdoors athletic', 55, 'outdoor', { k: 'skatehelmet' }, 'orange');
add('bag', 'Trekking pack', 'mf', 'outdoors', 150, 'outdoor', { back: 1, big: 1 }, 'orange');
// (notes 2: the world concepts' people the catalogue had no clothes for - server/systems/personas.js dresses them)
add('set', 'Tennis dress', 'f', 'athletic preppy', 70, 'sports', { k: 'dress', len: 1 }, 'white', 'navy');
add('bottoms', 'Tennis skirt', 'f', 'athletic preppy', 40, 'sports', { k: 'skirt', len: 1 }, 'white');
add('top', 'Cycling jersey', 'mf', 'athletic', 55, 'sports', { k: 'jersey' }, 'yellow', 'black');
add('bottoms', 'Cycling shorts', 'mf', 'athletic', 40, 'sports', { k: 'shorts' }, 'black');
add('set', 'Chest waders', 'mf', 'outdoors work', 90, 'outdoor', { k: 'overalls', bk: 'pants' }, 'olive', 'brown');
add('top', 'Postal shirt', 'mf', 'work', 30, 'workwear', { k: 'uniform', plain: 1 }, 'sky', 'navy');
add('bag', 'Mail satchel', 'mf', 'work retro', 55, 'workwear', { carry: 'bag', big: 1 }, 'brown');
add('top', 'Chef whites', 'mf', 'work', 40, 'workwear', { k: 'uniform', plain: 1 }, 'white', 'black');
add('hat', 'Paper hat', 'mf', 'work retro', 5, 'workwear', { k: 'paper' }, 'white', 'red');
add('jacket', 'Poncho', 'mf', 'outdoors festival western', 45, 'outdoor', { k: 'coat', p: 1 }, 'rust', 'mustard');
add('jewel', 'Lifeguard whistle', 'mf', 'beach athletic work', 12, 'beach', { chain: 1, pendant: 1, whistle: 1 }, 'red', 'silver');
add('jewel', 'Stethoscope', 'mf', 'work', 60, 'workwear', { chain: 1, pendant: 1, steth: 1 }, 'charcoal', 'silver');
add('jewel', 'Bow tie', 'mf', 'formal business retro', 35, 'boutique', { bow: 1 }, 'black');
add('jewel', 'Work gloves', 'mf', 'work outdoors', 18, 'workwear', { gloves: 1 }, 'tan');
add('bag', 'Rescue tube', 'mf', 'beach work', 40, 'beach', { carry: 'bag', big: 1 }, 'red');
add('bag', 'Delivery pack', 'mf', 'work streetwear', 45, 'workwear', { back: 1, box: 1 }, 'orange');
add('hat', 'Bridal veil', 'f', 'formal', 120, 'boutique', { k: 'veil' }, 'white');
// nothing on at all - the bathhouses' lockers only (server/systems/bathhouse.js barOf): never sold, never in the creator
// (issued), never in a random look (shared/look.js pieceList: never an issued piece); the renderer pixelates the private areas (client/art2/people.js censor)
add('set', 'Nothing', 'mf', 'lounge', 0, 'bathhouse', { k: 'none', bk: 'none', issued: 1 }, 'white');
// the season gifts (d.gift: never sold, not free - only the accounts given one own it: shared/wardrobe.js free; never in
// a random look; the creator shows it only to its owners): Season 0's Founding Citizen jacket (server/systems/cosmetics.js,
// shared/rules.js COSMETICS.beta) - the varsity jacket's art in black and gold, no new sprite art
add('jacket', 'Founding Citizen jacket', 'mf', 'preppy streetwear retro', 0, 'gift', { k: 'jacket', bomber: 1, shine: 1, zipped: 1, gift: 1 }, 'gold', 'black');   // (the owner, 11-20: all gold, a bomber that shines and sparkles - it was the varsity jacket in black with gold sleeves)
// underwear (the owner, 2026-11-19): a slot, seen where there's no top or no bottoms. d.k the top half's art kind
// (none: a woman's gets a plain bra), d.bk the bottom's. 'Nothing on': the mosaic. Never in random looks.
add('under', 'Nothing on', 'mf', 'lounge', 0, 'clothing', { k: 'none', bk: 'none' }, 'white');
add('under', 'Boxers', 'm', 'lounge casual', 10, 'clothing', { bk: 'trunks', band: 1 }, 'sky', 'white');
add('under', 'Briefs', 'mf', 'lounge casual', 8, 'clothing', { bk: 'bikini', band: 1 }, 'white', 'light grey');
add('under', 'Boxer briefs', 'm', 'lounge athletic', 12, 'clothing', { bk: 'trunks', fit: 1, band: 1 }, 'black', 'light grey');
add('under', 'Undershirt and boxers', 'm', 'lounge casual', 16, 'clothing', { k: 'under', bk: 'trunks', band: 1 }, 'white', 'sky');
add('under', 'Tank and briefs', 'mf', 'lounge casual', 14, 'clothing', { k: 'tank', bk: 'bikini', band: 1 }, 'white', 'light grey');
add('under', 'Bra and briefs', 'f', 'lounge casual', 14, 'clothing', { k: 'bra', bk: 'bikini' }, 'white', 'white');
add('under', 'Sports bra and shorts', 'f', 'lounge athletic', 18, 'sports', { k: 'bra', sport: 1, bk: 'trunks', fit: 1, band: 1 }, 'grey', 'white');
add('under', 'Union suit', 'mf', 'lounge winter western', 30, 'outdoor', { k: 'longsleeve', bk: 'leggings' }, 'red', 'white');
add('under', 'Silk boxers', 'm', 'lounge nightclub hifashion', 60, 'boutique', { bk: 'trunks', gloss: 1, band: 1 }, 'burgundy', 'gold');
add('under', 'Fitted trunks', 'm', 'lounge nightclub athletic', 35, 'boutique', { bk: 'trunks', fit: 1, band: 1 }, 'navy', 'white');
add('under', 'Lace bra and panties', 'f', 'lounge nightclub hifashion', 70, 'boutique', { k: 'bra', bk: 'bikini', lace: 1 }, 'black', 'gold');
add('under', 'Bralette set', 'f', 'lounge nightclub casual', 45, 'boutique', { k: 'bra', sport: 1, bk: 'bikini', lace: 1 }, 'forest', 'cream');
add('under', 'Strapless set', 'f', 'lounge nightclub', 50, 'boutique', { k: 'bikini', bk: 'bikini' }, 'red', 'red');
add('under', 'Lace bodysuit', 'f', 'lounge nightclub hifashion alt', 90, 'boutique', { k: 'swimsuit', bk: 'bikini', lace: 1 }, 'navy', 'silver');
add('under', 'Teddy', 'f', 'lounge nightclub hifashion', 95, 'boutique', { k: 'swimsuit', bk: 'bikini', gloss: 1 }, 'wine', 'blush');
add('under', 'Silk slip', 'f', 'lounge nightclub hifashion', 85, 'boutique', { k: 'dress', len: 1, bk: 'bikini', gloss: 1 }, 'cream', 'cream');
// socks (pass 3): d.h where on the leg they start (0 hip .. 1 ankle); d.stripes, d.warm: the polish pass's
add('socks', 'Ankle socks', 'mf', 'casual athletic', 5, 'clothing', { h: 0.9 }, 'white');
add('socks', 'Crew socks', 'mf', 'casual athletic skater', 6, 'clothing', { h: 0.8 }, 'white');
add('socks', 'Striped crew socks', 'mf', 'skater streetwear retro', 8, 'clothing', { h: 0.8, stripes: 1 }, 'white', 'navy');
add('socks', 'Tube socks', 'mf', 'skater retro athletic', 9, 'sports', { h: 0.7, stripes: 2 }, 'white', 'red');
add('socks', 'Knee socks', 'mf', 'preppy alt casual lounge', 12, 'clothing', { h: 0.56, stripes: 1 }, 'white', 'navy');
add('socks', 'Thigh-high socks', 'f', 'alt nightclub lounge', 18, 'boutique', { h: 0.34, stripes: 1 }, 'black', 'white');
add('socks', 'Tights', 'f', 'smart business winter', 15, 'clothing', { h: 0 }, 'black');
add('socks', 'Leg warmers', 'mf', 'retro athletic lounge', 14, 'sports', { h: 0.54, warm: 1 }, 'hot pink', 'white');
// drapes, props, small gear (pass 3): d.dr, d.prop the polish pass's; d.pp: only it draws the piece
add('jacket', 'Hooded cloak', 'mf', 'alt disguise winter', 120, 'boutique', { k: 'coat', dr: 'cloak' }, 'black', 'gold');
add('jacket', 'Cape coat', 'f', 'hifashion smart winter', 220, 'boutique', { k: 'coat', dr: 'cape' }, 'red');
add('set', 'Sari', 'f', 'formal festival hifashion', 260, 'boutique', { k: 'gown', dr: 'sari' }, 'red', 'gold');
add('set', 'Ghillie suit', 'mf', 'outdoors disguise', 150, 'costume', { k: 'hoodie', bk: 'cargo', p: 3, dr: 'ghillie' }, 'olive', 'khaki');
add('set', 'Morning dress', 'm', 'formal', 450, 'boutique', { k: 'coat', bk: 'pants', dr: 'tails' }, 'charcoal', 'light grey');
add('bag', 'Camera', 'mf', 'casual outdoors retro', 140, 'clothing', { carry: 'purse', prop: 'camera', pp: 1 }, 'charcoal', 'silver');
add('bag', 'Bouquet', 'mf', 'formal festival', 25, 'clothing', { carry: 'coffee', prop: 'bouquet', pp: 1 }, 'pink', 'white');
add('bag', 'Parasol', 'mf', 'alt retro hifashion', 60, 'boutique', { carry: 'cane', prop: 'parasol', pp: 1 }, 'black', 'burgundy');
add('jewel', 'Knee pads', 'mf', 'skater work athletic', 22, 'sports', { knee: 1, pp: 1 }, 'charcoal');
add('jewel', 'Elbow pads', 'mf', 'skater athletic', 20, 'sports', { elbow: 1, pp: 1 }, 'charcoal');
add('jewel', 'Skate pads', 'mf', 'skater', 38, 'sports', { knee: 1, elbow: 1, pp: 1 }, 'charcoal');
add('jewel', 'Wallet chain', 'mf', 'skater punk alt', 18, 'clothing', { wchain: 1, pp: 1 }, 'silver');
add('jewel', 'Tool belt', 'mf', 'work', 40, 'workwear', { tbelt: 1, pp: 1 }, 'brown', 'yellow');
add('jewel', 'Climbing harness', 'mf', 'outdoors athletic', 55, 'outdoor', { harness: 1, pp: 1 }, 'orange', 'silver');
// the rest of the concepts' wardrobe (pass 2; docs/characters/CONCEPTS.md): each on a kind the renderer has (d.bands:
// reflective bands, the polish pass's)
add('set', 'Paramedic uniform', 'mf', 'work', 70, 'workwear', { k: 'uniform', plain: 1, bk: 'cargo', bands: 1 }, 'forest', 'white');
add('set', 'Turnout gear', 'mf', 'work', 120, 'workwear', { k: 'jacket', bk: 'cargo', bands: 1 }, 'tan', 'yellow');
add('set', 'Hi-vis coverall', 'mf', 'work', 60, 'workwear', { k: 'longsleeve', bk: 'cargo', zip: 1, bands: 1 }, 'orange', 'silver');
add('hat', 'Fire helmet', 'mf', 'work', 60, 'workwear', { k: 'hard', fire: 1 }, 'red', 'yellow');
add('top', 'Security shirt', 'mf', 'work', 35, 'workwear', { k: 'uniform' }, 'grey', 'gold');
add('top', 'Rash guard', 'mf', 'beach athletic', 35, 'beach', { k: 'longsleeve' }, 'black', 'teal');
add('top', 'Camisole', 'f', 'casual nightclub smart', 24, 'clothing', { k: 'tank' }, 'red');
add('jacket', 'Sweater vest', 'mf', 'preppy retro smart', 45, 'clothing', { k: 'vest' }, 'forest', 'white');
add('jacket', 'Camo jacket', 'mf', 'outdoors disguise street', 85, 'costume', { k: 'jacket', p: 3 }, 'olive', 'khaki');
add('jacket', 'Sherwani', 'm', 'formal hifashion', 260, 'boutique', { k: 'coat' }, 'cream', 'gold');
add('bottoms', 'Kilt', 'mf', 'formal retro punk', 90, 'boutique', { k: 'skirt', p: 2 }, 'forest', 'navy');
add('bottoms', 'Leather chaps', 'mf', 'western punk', 130, 'boutique', { k: 'pants', gloss: 1 }, 'brown');
add('set', 'Onesie', 'mf', 'lounge festival', 55, 'clothing', { k: 'hoodie', bk: 'pants' }, 'brown', 'cream');
add('set', 'Sequin dress', 'f', 'nightclub formal hifashion', 180, 'boutique', { k: 'dress', len: 1, p: 4 }, 'gold', 'cream');
add('jewel', 'Scarf', 'mf', 'winter smart casual', 25, 'clothing', { choker: 1, chain: 2, scarf: 1 }, 'red');
add('jewel', 'Neckerchief', 'mf', 'western work festival', 12, 'clothing', { choker: 1 }, 'red');
add('jewel', 'Bolo tie', 'mf', 'western formal', 45, 'boutique', { chain: 1, pendant: 1, bolo: 1 }, 'teal', 'silver');
add('jewel', 'Lanyard', 'mf', 'work business smart', 6, 'workwear', { chain: 1, pendant: 1, lany: 1 }, 'royal blue', 'white');
add('jewel', 'Evening gloves', 'f', 'formal hifashion nightclub', 60, 'boutique', { gloves: 1 }, 'black');
add('jewel', 'Biker gloves', 'mf', 'punk street western', 35, 'boutique', { gloves: 1 }, 'black');
add('jewel', 'Sweatbands', 'mf', 'athletic retro', 10, 'sports', { cuffband: 1 }, 'white');
add('jewel', 'Glow bracelets', 'mf', 'festival nightclub', 8, 'boutique', { bangles: 1 }, 'neon green');
add('hat', 'Headphones', 'mf', 'streetwear casual skater athletic', 60, 'clothing', { k: 'earmuffs', phones: 1 }, 'black', 'royal blue');
add('hat', 'Towel wrap', 'mf', 'lounge beach', 10, 'clothing', { k: 'turban' }, 'white');
add('hat', 'Boonie hat', 'mf', 'outdoors disguise', 30, 'costume', { k: 'bucket', p: 3 }, 'olive', 'khaki');
add('hat', 'Camo cap', 'mf', 'outdoors disguise street', 25, 'costume', { k: 'cap', p: 3 }, 'olive', 'khaki');
add('glasses', 'Bear mask', 'mf', 'disguise festival', 25, 'costume', { k: 'pig', animal: 'bear', nostreet: 1 }, 'brown');   // (the owner, 11-20: bear and panda masks need their ears and markings - people.js maskPrims)
add('glasses', 'Panda mask', 'mf', 'disguise festival', 25, 'costume', { k: 'pig', animal: 'panda', nostreet: 1 }, 'white', 'black');
add('bag', 'Walking cane', 'mf', 'retro formal smart', 40, 'boutique', { carry: 'cane' }, 'brown');
// pass 5 (docs/characters/CHECKLIST.md): concept pieces that are a pattern or a colour of a piece we draw
add('top', 'Striped tee', 'mf', 'casual skater preppy retro', 24, 'clothing', { k: 'tee', p: 1 }, 'white', 'navy');
add('top', 'Breton top', 'mf', 'preppy hifashion casual', 38, 'clothing', { k: 'longsleeve', p: 1 }, 'cream', 'navy');
add('top', 'Tie-dye tee', 'mf', 'festival retro casual', 26, 'clothing', { k: 'tee', p: 5 }, 'yellow', 'hot pink');
add('top', 'Gingham shirt', 'mf', 'western preppy casual', 42, 'clothing', { k: 'shirt', p: 2 }, 'red', 'white');
add('bottoms', 'Tartan trousers', 'mf', 'punk alt retro', 55, 'clothing', { k: 'pants', p: 2 }, 'red', 'black');
add('bottoms', 'Camo pants', 'mf', 'outdoors street disguise', 55, 'costume', { k: 'cargo', p: 3 }, 'olive', 'khaki');
add('jacket', 'Hunting vest', 'mf', 'outdoors', 60, 'outdoor', { k: 'vest', pockets: 1 }, 'orange', 'charcoal');
add('set', 'Undershirt and trunks', 'mf', 'lounge', 15, 'clothing', { k: 'under', bk: 'trunks' }, 'white');   // (what the 'Underwear' set was until 11-20)
// (the owner, 11-20: "add striped panties/underwear" - cut and striped on the art grid, client/art2/peoplepolish.js under4)
add('under', 'Striped boxers', 'm', 'lounge casual', 12, 'clothing', { bk: 'trunks', band: 1, stripe: 1 }, 'navy', 'white');
add('under', 'Striped briefs', 'mf', 'lounge casual', 10, 'clothing', { bk: 'bikini', stripe: 1 }, 'red', 'white');
add('under', 'Striped bra and panties', 'f', 'lounge casual', 16, 'clothing', { k: 'bra', bk: 'bikini', stripe: 1 }, 'pink', 'white');
// the concepts' missing pieces, 1 (docs/characters/CHECKLIST.md "the next pass's work"; the owner, 11-20 20:53: "start on all of
// it we are missing"): each drawn by the polish pass (pp: not sold, not worn in the city, while it is off). On the chest
// (peoplepolish.js NECK): a tie on a shirt alone, suspenders, a towel round the neck, a sweater over the shoulders (a cravat
// was built and dropped - the owner, 21:55: "probably dont need this as an item by itself").
// On the face (masks): a sleep mask, novelty glasses, a chicken mask. Hats: a feather, a riding helmet, a half helmet
// with goggles. To carry: a newspaper, a clipboard, a laptop sleeve, a parcel, a basketball, glow sticks, trekking poles,
// a yoga mat on the back; boxing gloves.
add('jewel', 'Necktie', 'mf', 'business smart formal preppy', 22, 'boutique', { tie: 1, pp: 1 }, 'red');
add('jewel', 'Suspenders', 'mf', 'retro smart punk business', 18, 'boutique', { braces: 1, pp: 1 }, 'red');
add('jewel', 'Towel round the neck', 'mf', 'athletic beach lounge', 8, 'sports', { ntowel: 1, pp: 1 }, 'sky', 'white');   // (sky by default: a white towel on a white top is not seen)
add('jewel', 'Sweater over the shoulders', 'mf', 'preppy smart casual', 40, 'clothing', { shsweater: 1, pp: 1 }, 'navy');
add('jewel', 'Boxing gloves', 'mf', 'athletic', 45, 'sports', { boxing: 1, pp: 1 }, 'red', 'white');
add('glasses', 'Sleep mask', 'mf', 'lounge', 8, 'clothing', { k: 'sleep', pp: 1, nostreet: 1 }, 'lavender');
add('glasses', 'Novelty glasses', 'mf', 'disguise festival', 10, 'costume', { k: 'novelty', pp: 1, nostreet: 1 }, 'black');
add('glasses', 'Chicken mask', 'mf', 'disguise festival', 25, 'costume', { k: 'pig', animal: 'chicken', pp: 1, nostreet: 1 }, 'white', 'red');
add('hat', 'Feathered hat', 'mf', 'festival hifashion retro western', 70, 'boutique', { k: 'fedora', feather: 1, pp: 1 }, 'olive', 'red');
add('hat', 'Riding helmet', 'mf', 'preppy outdoors', 60, 'sports', { k: 'hard', riding: 1, pp: 1 }, 'black', 'silver');
add('hat', 'Half helmet with goggles', 'mf', 'punk street western', 75, 'outdoor', { k: 'skatehelmet', gog: 1, pp: 1 }, 'black', 'mustard');
add('bag', 'Newspaper', 'mf', 'business smart casual retro', 2, 'clothing', { carry: 'purse', prop: 'paper', pp: 1 }, 'white', 'charcoal');
add('bag', 'Clipboard', 'mf', 'work business', 6, 'workwear', { carry: 'purse', prop: 'clip', pp: 1 }, 'brown', 'white');
add('bag', 'Laptop sleeve', 'mf', 'business smart casual', 35, 'clothing', { carry: 'purse', prop: 'laptop', pp: 1 }, 'charcoal', 'silver');
add('bag', 'Parcel', 'mf', 'work', 5, 'workwear', { carry: 'purse', prop: 'parcel', pp: 1 }, 'tan', 'cream');
add('bag', 'Basketball', 'mf', 'athletic streetwear', 25, 'sports', { carry: 'purse', prop: 'ball', pp: 1 }, 'orange', 'black');
add('bag', 'Glow sticks', 'mf', 'festival nightclub', 6, 'costume', { carry: 'purse', prop: 'glow', pp: 1 }, 'neon green', 'hot pink');
add('bag', 'Trekking poles', 'mf', 'outdoors', 40, 'outdoor', { carry: 'cane', prop: 'poles', pp: 1 }, 'light gray', 'red');
add('bag', 'Yoga mat', 'mf', 'athletic casual', 20, 'sports', { back: 3, pp: 1 }, 'purple');
// the concepts' missing pieces, 2: two patterns the list lacked (dots, a stripe that runs down: PATTERNS) and the pieces that
// wear them; sequins on another bomber; pieces worn another way (a shirt open, a tee over a long sleeve, one strap down, a
// shirt tied at the waist, a towel at the waist or over a shoulder); small shapes of their own (arm warmers, a ripped tee,
// a two-color windbreaker, a trouser's side stripe, a sherpa collar). Then five that are a piece the renderer already
// draws, in the colors and the pattern the concepts show - ordinary pieces, sold and worn in the city like any other.
add('top', 'Polka-dot blouse', 'f', 'retro smart preppy', 50, 'boutique', { k: 'blouse', p: 6, pp: 1 }, 'navy', 'white');
add('set', 'Pinstripe suit', 'mf', 'business formal retro', 360, 'boutique', { k: 'suit', bk: 'pants', p: 7, pp: 1 }, 'navy', 'light gray');
add('jacket', 'Sequin bomber', 'mf', 'nightclub festival hifashion', 180, 'boutique', { k: 'jacket', bomber: 1, shine: 1, pp: 1 }, 'silver', 'black');
add('jacket', 'Open shirt', 'mf', 'beach casual festival', 40, 'clothing', { k: 'openshirt', pp: 1 }, 'white');
add('bottoms', 'Towel round the waist', 'mf', 'beach lounge', 10, 'beach', { k: 'towel', pp: 1 }, 'white');
add('jewel', 'Towel over the shoulder', 'mf', 'beach athletic lounge', 8, 'beach', { shtowel: 1, pp: 1 }, 'sky', 'white');
add('jacket', 'Dungarees, one strap down', 'mf', 'retro casual festival skater', 60, 'clothing', { k: 'overalls', onestrap: 1, pp: 1 }, 'denim');
add('top', 'Tee over a long sleeve', 'mf', 'skater streetwear casual alt', 34, 'clothing', { k: 'layertee', pp: 1 }, 'black', 'white');
add('jewel', 'Shirt tied at the waist', 'mf', 'alt punk casual skater', 30, 'clothing', { waistshirt: 1, pp: 1 }, 'red', 'black');
add('jewel', 'Arm warmers', 'mf', 'alt punk festival', 14, 'clothing', { armw: 1, pp: 1 }, 'black', 'hot pink');
add('top', 'Ripped tee', 'mf', 'punk alt street', 24, 'clothing', { k: 'tee', torn: 1, pp: 1 }, 'charcoal');
add('jacket', 'Color-block windbreaker', 'mf', 'retro athletic streetwear outdoors', 70, 'sports', { k: 'jacket', block: 1, pp: 1 }, 'teal', 'purple');
add('bottoms', 'Side-stripe trousers', 'mf', 'work formal retro', 60, 'boutique', { k: 'pants', sidestripe: 1, pp: 1 }, 'navy', 'gold');
add('jacket', 'Sherpa-collar jacket', 'mf', 'winter outdoors western casual', 120, 'outdoor', { k: 'puffer', sherpa: 1, pp: 1 }, 'brown', 'cream');
add('bottoms', 'Jodhpurs', 'mf', 'preppy outdoors western', 70, 'boutique', { k: 'leggings' }, 'sand');
add('jacket', 'Tweed jacket', 'mf', 'preppy smart retro', 150, 'boutique', { k: 'blazer', p: 2 }, 'brown', 'tan');
add('set', 'T-shirt dress', 'f', 'casual streetwear', 45, 'clothing', { k: 'tee', bk: 'skirt' }, 'black', 'white');
add('set', 'Jersey dress', 'f', 'streetwear athletic', 60, 'sports', { k: 'jersey', bk: 'skirt' }, 'royal blue', 'white');
// the concepts' missing pieces, 3 (the owner, 11-20 22:19: "finish everything missing"): sequins on a jumpsuit, riot gear, a
// racer's suit, a fringed skirt with its concho belt, a cut-out dress, bondage trousers, ragged clothes - the pass's; a
// crochet top is the mesh the renderer already draws.
add('set', 'Sequin jumpsuit', 'f', 'nightclub festival hifashion', 200, 'boutique', { k: 'longsleeve', bk: 'pants', shine: 1, pp: 1 }, 'gold', 'black');
add('hat', 'Riot helmet', 'mf', 'work disguise', 90, 'workwear', { k: 'moto', riot: 1, pp: 1 }, 'navy', 'sky');
add('jacket', 'Riot armor', 'mf', 'work', 150, 'workwear', { k: 'kevlar', riot: 1, pp: 1 }, 'navy', 'charcoal');
add('set', 'Racing suit', 'mf', 'athletic retro', 180, 'sports', { k: 'longsleeve', bk: 'pants', block: 1, sidestripe: 1, pp: 1 }, 'red', 'white');
add('bottoms', 'Fringed skirt', 'f', 'western festival retro', 60, 'boutique', { k: 'skirt', fringe: 1, pp: 1 }, 'tan', 'silver');
add('set', 'Cut-out dress', 'f', 'nightclub hifashion', 110, 'boutique', { k: 'dress', len: 1, cutout: 1, pp: 1 }, 'black');
add('bottoms', 'Bondage trousers', 'mf', 'punk alt', 70, 'clothing', { k: 'pants', straps: 1, pp: 1 }, 'black', 'red');
add('jacket', 'Ragged coat', 'mf', 'street', 5, 'clothing', { k: 'coat', ragged: 1, pp: 1 }, 'olive', 'brown');
add('top', 'Crochet top', 'f', 'festival beach retro', 35, 'boutique', { k: 'tank', mesh: 1 }, 'cream');
// (the last of the concepts' missing pieces, 11-21: the owner - "do everything left for the character/npc characters". All of
// them only the polish pass draws)
add('bottoms', 'Harem trousers', 'mf', 'festival lounge retro', 45, 'boutique', { k: 'pants', harem: 1, pp: 1 }, 'purple', 'gold');
add('set', 'Wetsuit, peeled to the waist', 'mf', 'beach athletic', 110, 'beach', { k: 'none', fk: 'bikini', bk: 'leggings', peel: 1, pp: 1 }, 'black', 'teal');
add('jacket', 'Fur-hood parka', 'mf', 'winter outdoors streetwear', 180, 'outdoor', { k: 'puffer', furhood: 1, pp: 1 }, 'olive', 'cream');
add('jacket', 'Coat over the shoulders', 'mf', 'hifashion business formal', 220, 'boutique', { k: 'coat', dr: 'cape', draped: 1, pp: 1 }, 'navy', 'black');
add('bag', 'Surfboard', 'mf', 'beach athletic', 150, 'beach', { carry: 'purse', prop: 'board', pp: 1 }, 'cream', 'teal');
add('set', 'Crochet cover-up', 'f', 'beach festival', 40, 'beach', { k: 'tee', bk: 'skirt', mesh: 1, pp: 1 }, 'cream');
add('shoes', 'Roller skates', 'mf', 'retro athletic festival', 95, 'sports', { k: 'boot', skate: 1, sole: 1, pp: 1 }, 'white', 'pink');
add('hat', 'Party wig', 'mf', 'festival nightclub disguise', 30, 'costume', { k: 'wig', pp: 1 }, 'pink');

export const PIECE_IDS = {}; for (const p of PIECES) if (p) PIECE_IDS[p.name] = p.i;
export const byName = (n) => PIECE_IDS[n] || 0;
export const fits = (p, base) => !!p && p.b.includes(base);

// ---- a look ----------------------------------------------------------------------------------------------------------
// body.marks (1 freckles, 2 vitiligo), body.limb (a prosthetic): the polish pass's
export const LIMBS = ['None', 'Left arm', 'Right arm', 'Left leg', 'Right leg'];
export const clampI = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
export function emptyLook(base = 'm') {
  const o = {}; for (const s of SLOTS) o[s] = null;
  return {
    v: LOOK_VERSION,
    body: { base, build: 1, height: 2, skin: 1, age: 0, marks: 0, limb: 0 },
    face: { shape: 0, eyes: 0, eyeColor: 0, brows: 0, nose: 0, lips: 0, freckles: 0, mole: 0, dimples: 0 },
    hair: { style: base === 'f' ? 16 : 2, color: 2, facial: 0 },
    extras: { makeup: 0, makeupColor: 0, tattoos: 0, piercings: 0, scar: 0 },
    outfit: o,
  };
}
// A jacket worn open or done up (the owner, 11-20 20:53: "a zipper and unzipped version and give players the option"): the
// jackets with a front that closes - a zip, or buttons on a coat, a cardigan or a blazer. A piece has its own way of being
// worn (d.zipped: the Founding Citizen jacket's is zipped); a look's jacket may carry z: 1, the other way. In the look's
// code it is a spare bit of the jacket's pattern letter, so the code is no longer and old codes read as before.
const ZIP_KINDS = { jacket: 1, leather: 1, puffer: 1, hoodie: 1, coat: 2, fur: 2, cardigan: 2, blazer: 2, openshirt: 2 };
export const canZip = (P) => !!P && P.slot === 'jacket' && !P.d.dr && !P.d.robe && !(P.d.k === 'coat' && P.d.p) ? ZIP_KINDS[P.d.k] || 0 : 0;
export const isZipped = (it) => { const P = it && PIECES[it.id], k = canZip(P); return k && ((P.d.zipped ? 1 : 0) ^ (it.z ? 1 : 0)) ? k : 0; };   // (0 open, 1 zipped, 2 buttoned)
export const setZipped = (it, on) => { const P = it && PIECES[it.id]; if (!canZip(P)) return; if ((on ? 1 : 0) ^ (P.d.zipped ? 1 : 0)) it.z = 1; else delete it.z; };
export const item = (name, c, t, p = 0) => { const id = byName(name), P = PIECES[id]; return id ? { id, c: c === undefined ? P.c : col(c), t: t === undefined ? P.t : col(t), p: p || P.d.p || 0 } : null; };

// the clamped copy (or null for something that isn't a look at all)
export function validLook(L) {
  if (!L || typeof L !== 'object') return null;
  const b = L.body || {}, base = b.base === 'f' ? 'f' : 'm';
  const out = emptyLook(base);
  out.body = { base, build: ((bi) => (BUILDS[bi].b && BUILDS[bi].b !== base ? 2 : bi))(clampI(b.build, 0, BUILDS.length - 1, 1)), height: clampI(b.height, 0, HEIGHTS.length - 1, 2), skin: clampI(b.skin, 0, SKIN_TONES.length - 1, 1), age: clampI(b.age, 0, AGES.length - 1, 0), marks: clampI(b.marks, 0, 3, 0), limb: clampI(b.limb, 0, LIMBS.length - 1, 0), ...(b.stoop ? { stoop: 1 } : null) };
  const f = L.face || {};
  for (const k of ['shape', 'eyes', 'brows', 'nose', 'lips']) out.face[k] = clampI(f[k], 0, FACE_OPTS[k].length - 1, 0);
  out.face.eyeColor = clampI(f.eyeColor, 0, EYE_COLORS.length - 1, 0);
  for (const k of ['freckles', 'mole', 'dimples']) out.face[k] = f[k] ? 1 : 0;
  const h = L.hair || {};
  const st = clampI(h.style, 0, HAIR_STYLES.length - 1, out.hair.style);
  out.hair = { style: st, color: clampI(h.color, 0, HAIR_COLORS.length - 1, 2), facial: base === 'm' ? clampI(h.facial, 0, FACIAL_HAIR.length - 1, 0) : 0, ...(clampI(h.tip, 0, HAIR_COLORS.length, 0) ? { tip: clampI(h.tip, 0, HAIR_COLORS.length, 0) } : null), ...(base === 'm' && clampI(h.bcol, 0, HAIR_COLORS.length, 0) ? { bcol: clampI(h.bcol, 0, HAIR_COLORS.length, 0) } : null) };   // (tip, bcol: 0 none, else a hair color + 1 - dyed tips, a beard in its own color; 11-21)
  const e = L.extras || {};
  out.extras = { makeup: clampI(e.makeup, 0, MAKEUP.length - 1, 0), makeupColor: clampI(e.makeupColor, 0, MAKEUP_COLORS.length - 1, 0), tattoos: clampI(e.tattoos, 0, (1 << TATTOO_AREAS.length) - 1, 0), piercings: clampI(e.piercings, 0, (1 << PIERCINGS.length) - 1, 0), scar: clampI(e.scar, 0, SCARS.length - 1, 0) };
  const o = L.outfit || {};
  for (const s of SLOTS) {
    const it = o[s];
    if (!it || typeof it !== 'object') continue;
    const P = Number.isInteger(Number(it.id)) && it.id > 0 && it.id < PIECES.length ? PIECES[Number(it.id)] : null;   // (an id past the list's end is no piece - clamped, it was the last piece, whatever that was)
    if (!P || P.slot !== s) continue;   // (anyone can wear anything: a piece's bases only sort the lists)
    out.outfit[s] = { id: P.i, c: clampI(it.c, 0, CLOTH.length - 1, P.c), t: clampI(it.t, 0, CLOTH.length - 1, P.t), p: clampI(it.p, 0, PATTERNS.length - 1, 0) };
    if (it.z && canZip(P)) out.outfit[s].z = 1;
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
    s += it ? AB[(it.id >> 6) & 63] + AB[it.id & 63] + AB[it.c & 63] + AB[it.t & 63] + AB[(it.p & 31) | (it.z ? 32 : 0)] : '00000';
  }
  // (11-21: three more things a look can say, each off by default so every older code reads as before - a stoop, in the spare
  // bit of the marks' letter; dyed tips and a beard's own color, a letter each after it)
  if (h.tip || h.bcol) return s + AB[b.marks | (b.limb << 2) | (b.stoop ? 32 : 0)] + AB[h.tip | 0] + AB[h.bcol | 0];
  if (b.marks || b.limb || b.stoop) return s + AB[b.marks | (b.limb << 2) | (b.stoop ? 32 : 0)];
  while (s.length > LOOK_CODE_LEN && s.endsWith('00000')) s = s.slice(0, -5);
  return s;
}
export const LOOK_CODE_LEN = 21 + 9 * 5, LOOK_CODE_MAX = 22 + SLOTS.length * 5, LOOK_CODE_MAX2 = LOOK_CODE_MAX + 2;
export function decodeLook(s) {
  if (typeof s !== 'string' || s.length < LOOK_CODE_LEN || (s.length > LOOK_CODE_MAX && s.length !== LOOK_CODE_MAX2) || (s.length < LOOK_CODE_MAX && (s.length - LOOK_CODE_LEN) % 5)) return null;
  s = s.padEnd(LOOK_CODE_MAX2, '0');
  const v = [];
  for (let i = 0; i < s.length; i++) { const x = AV[s[i]]; if (x === undefined) return null; v.push(x); }
  if (v[0] !== LOOK_VERSION) return null;
  const L = {
    v: LOOK_VERSION,
    body: { base: v[1] ? 'f' : 'm', build: v[2], height: v[3], skin: v[4], age: v[5], marks: v[LOOK_CODE_MAX - 1] & 3, limb: (v[LOOK_CODE_MAX - 1] >> 2) & 7, stoop: v[LOOK_CODE_MAX - 1] >> 5 },
    face: { shape: v[6], eyes: v[7], eyeColor: v[8], brows: v[9], nose: v[10], lips: v[11], freckles: v[12] & 1, mole: (v[12] >> 1) & 1, dimples: (v[12] >> 2) & 1 },
    hair: { style: v[13], color: v[14], facial: v[15], tip: v[LOOK_CODE_MAX], bcol: v[LOOK_CODE_MAX + 1] },
    extras: { makeup: v[16], makeupColor: v[17], tattoos: v[18], piercings: v[19], scar: v[20] },
    outfit: {},
  };
  SLOTS.forEach((k, j) => { const o = 21 + j * 5, id = v[o] * 64 + v[o + 1]; L.outfit[k] = id ? { id, c: v[o + 2], t: v[o + 3], p: v[o + 4] & 31, ...(v[o + 4] & 32 ? { z: 1 } : null) } : null; });
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
  const A = { fem, skin: L.body.skin, age, lk: opt.code || encodeLook(L) };
  A.seed = 0; for (let i = 0; i < A.lk.length; i++) A.seed = (A.seed * 31 + A.lk.charCodeAt(i)) & 0xffff;
  A.body = { h: B.h * H, w: B.w, limb: B.limb, belly: (B.belly || 0) + (age >= 3 && L.body.build >= 3 ? 0.3 : 0), muscle: B.muscle || 0 };
  // hair: greys with age (dyed colours stay)
  let hc = HAIR_COLORS[L.hair.color]?.[0] || '#3b2414';
  if (L.hair.color < 12) { if (age === 3) hc = mix(hc, '#9a9a9a', 0.25); else if (age === 4) hc = mix(hc, '#a8a8a8', 0.55); else if (age === 5) hc = mix(hc, '#d0d0d0', 0.8); }
  A.hair = { style: HAIR_STYLES[L.hair.style]?.[2] || 'short', color: hc };
  const fh = FACIAL_HAIR[L.hair.facial]?.[1];
  if (fh && !fem) A.beard = fh;
  if (L.hair.tip) A.hair.tip = HAIR_COLORS[L.hair.tip - 1]?.[0];
  if (L.hair.bcol && A.beard) A.beardColor = HAIR_COLORS[L.hair.bcol - 1]?.[0];
  if (L.body.stoop) A.stoop = 1;
  A.face = { ...L.face, eyeColor: EYE_COLORS[L.face.eyeColor]?.[0] };
  const ex = L.extras;
  if (ex.makeup) A.makeup = { kind: MAKEUP[ex.makeup].toLowerCase(), color: MAKEUP_COLORS[ex.makeupColor]?.[0] };
  if (ex.tattoos) A.tattoo = ex.tattoos;
  if (ex.piercings) A.piercings = ex.piercings;
  if (ex.scar) A.scar = ex.scar;
  // clothes
  const set = P('set'), top = P('top'), jk = P('jacket'), bot = P('bottoms'), un = P('under');
  const pat = (o) => PATTERNS[o.p] && o.p ? PATTERNS[o.p] : undefined;
  // the underwear: its halves stand in where there's no top or no bottoms (A.under: what the polish pass draws finer)
  const uc = un && HEX(O.under.c), ut = un && HEX(O.under.t);
  if (un) A.under = { ...un.d, color: uc, trim: ut };
  const uTop = un && { kind: un.d.k || (fem ? 'bra' : 'none'), color: uc, color2: ut, trim: ut, pattern: pat(O.under), len: un.d.len || 0, under: 1 };
  const uBot = un && { kind: un.d.bk, color: uc, color2: ut, trim: ut, pattern: pat(O.under), gloss: un.d.gloss ? 1 : 0, under: 1 };
  if (set && set.d.basic) {   // (the 'Underwear' set: the underwear worn under, or the basics in the set's colour)
    const c = HEX(O.set.c);
    if (!un) A.under = { k: fem ? 'bra' : undefined, bk: fem ? 'bikini' : 'trunks', band: 1, color: c, trim: HEX(O.set.t) };
    A.top = uTop || { kind: fem ? 'bra' : 'none', color: c, under: 1 };
    A.bottom = uBot || { kind: fem ? 'bikini' : 'trunks', color: c, under: 1 };
  } else if (set) {
    A.top = { kind: fem && set.d.fk ? set.d.fk : set.d.k, color: HEX(O.set.c), color2: HEX(O.set.t), trim: HEX(O.set.t), pattern: pat(O.set), len: set.d.len || 0, bow: set.d.bow ? 1 : 0, zip: set.d.zip ? 1 : 0, plain: set.d.plain ? 1 : 0, bands: set.d.bands ? 1 : 0 , ...(set.d.shine ? { shine: 1 } : null), ...(set.d.mesh ? { mesh: 1 } : null), ...(set.d.block ? { block: 1 } : null), ...(set.d.cutout ? { cutout: 1 } : null) };
    A.bottom = { kind: set.d.bk || 'pants', color: HEX(O.set.c), color2: HEX(O.set.t), trim: HEX(O.set.t), pattern: pat(O.set), stripe: set.d.bk === 'track' ? HEX(O.set.t) : undefined , ...(set.d.sidestripe ? { sidestripe: HEX(O.set.t) } : null), ...(set.d.peel ? { peel: 1 } : null) };
  } else {
    A.top = top ? { kind: top.d.k, color: HEX(O.top.c), color2: HEX(O.top.t), trim: HEX(O.top.t), pattern: pat(O.top), print: top.d.print ? 1 : 0, mesh: top.d.mesh ? 1 : 0, plain: top.d.plain ? 1 : 0, chevrons: top.d.chevrons ? 1 : 0, ...(top.d.torn ? { torn: 1 } : null) } : uTop || { kind: fem ? 'bra' : 'none', color: '#e8e4dc' };   // (no underwear picked: boxers; a bra and panties - the owner, 11-19)
    A.bottom = bot ? { ...(bot.d.sidestripe ? { sidestripe: HEX(O.bottoms.t) } : null), ...(bot.d.harem ? { harem: 1 } : null), ...(bot.d.fringe ? { fringe: 1 } : null), ...(bot.d.straps ? { straps: 1 } : null), kind: bot.d.k, color: HEX(O.bottoms.c), color2: HEX(O.bottoms.t), trim: HEX(O.bottoms.t), pattern: pat(O.bottoms) || (bot.d.ripped ? 'ripped' : undefined), len: bot.d.len || 0, gloss: bot.d.gloss ? 1 : 0, stripe: bot.d.k === 'track' ? HEX(O.bottoms.t) : undefined } : uBot || { kind: fem ? 'bikini' : 'trunks', color: '#e8e4dc' };
  }
  if (jk) {   // worn open over the top: the top's colour down the front
    const under = A.top;
    A.top = { kind: jk.d.k === 'hoodie' ? 'ziphoodie' : jk.d.k, color: HEX(O.jacket.c), color2: HEX(O.jacket.t), trim: HEX(O.jacket.t), inner: under.kind === 'none' ? null : under.color, innerKind: under.kind, pattern: pat(O.jacket), quilt: jk.d.quilt ? 1 : 0, studs: jk.d.studs ? 1 : 0, fringe: jk.d.fringe ? 1 : 0, bomber: jk.d.bomber ? 1 : 0, varsity: jk.d.varsity ? 1 : 0, gloss: jk.d.gloss ? 1 : 0, robe: jk.d.robe ? 1 : 0, len: under.len || 0, under: under.kind, ...(jk.d.pockets ? { pockets: 1 } : null), ...(jk.d.pfd ? { pfd: 1 } : null), ...(jk.d.shine ? { shine: 1 } : null), ...(isZipped(O.jacket) ? { zipped: isZipped(O.jacket) } : null), ...(jk.d.onestrap ? { onestrap: 1 } : null), ...(jk.d.block ? { block: 1 } : null), ...(jk.d.sherpa ? { sherpa: 1 } : null), ...(jk.d.riot ? { riot: 1 } : null), ...(jk.d.ragged ? { ragged: 1 } : null), ...(jk.d.furhood ? { furhood: 1 } : null), ...(jk.d.draped ? { draped: 1, sleeve: ['none', 'tank', 'tube', 'bra', 'crop', 'bikini'].includes(under.kind) ? 'skin' : under.color, innerKind: under.kind, bareUnder: ['none', 'tank', 'tube', 'bra', 'crop', 'bikini'].includes(under.kind) ? 1 : 0 } : null) };
    if (jk.d.k === 'vest') A.top.sleeve = under.kind === 'none' || under.kind === 'tank' || under.kind === 'tube' || under.kind === 'bra' || under.kind === 'crop' || under.kind === 'bikini' ? 'skin' : under.color;
    if (jk.d.k === 'kevlar') { A.top.kind = 'kevlar'; A.top.color = under.color || A.top.color; A.top.color2 = HEX(O.jacket.c); A.top.sleeve = under.kind === 'none' || under.kind === 'tank' ? 'skin' : under.color; A.top.chevrons = under.chevrons || 0; }   // (the plates over the shirt, the shirt's sleeves)
    if (jk.d.k === 'apron' || jk.d.k === 'overalls') {   // (worn over the top: the shirt round them is the top - its colour, its sleeves, a flannel's check - or bare skin)
      const bare = under.kind === 'none' || under.kind === 'tank' || under.kind === 'tube' || under.kind === 'bra' || under.kind === 'bikini';
      A.top.color2 = bare ? null : under.color; A.top.bareUnder = bare ? 1 : 0; A.top.sleeve = bare ? 'skin' : under.color;
    }
    if (set && (set.d.k === 'dress' || set.d.k === 'gown')) A.top.dressUnder = set.d.k === 'gown' ? -1 : set.d.len || 0;
  }
  if (L.body.marks) A.bmarks = L.body.marks;
  if (L.body.limb) A.limb = L.body.limb;
  const so = P('socks');
  if (so) A.socks = { ...so.d, color: HEX(O.socks.c), trim: HEX(O.socks.t) };
  const sh = P('shoes');
  if (sh) {
    A.shoes = HEX(O.shoes.c); A.shoeKind = sh.d.k; A.shoeTrim = HEX(O.shoes.t); if (sh.d.tall) A.bootTall = sh.d.tall; if (sh.d.hi) A.hiTop = 1;
    // (CP4: a sandal's straps, socks, a fur cuff, a platform or chunky sole, gloss, a buckle, a sole in the trim colour, a check)
    for (const f of ['strap', 'socks', 'fur', 'platform', 'chunky', 'gloss', 'buckle', 'sole', 'skate']) if (sh.d[f]) A['shoe_' + f] = sh.d[f];
    if (O.shoes.p) A.shoePat = PATTERNS[O.shoes.p];
  }
  else { A.shoes = '#d8c8b0'; A.shoeKind = 'barefoot'; }
  const hat = P('hat');
  if (hat) A.hat = { kind: hat.d.k, color: HEX(O.hat.c), trim: HEX(O.hat.t), braid: hat.d.braid ? 1 : 0, back: hat.d.back ? 1 : 0, pom: hat.d.pom ? 1 : 0, slouch: hat.d.slouch ? 1 : 0, pattern: pat(O.hat), ...(hat.d.flat ? { flat: 1 } : null), ...(hat.d.fire ? { fire: 1 } : null), ...(hat.d.phones ? { phones: 1 } : null), ...(hat.d.feather ? { feather: 1 } : null), ...(hat.d.riding ? { riding: 1 } : null), ...(hat.d.gog ? { gog: 1 } : null), ...(hat.d.riot ? { riot: 1 } : null) };   // (fire: a fire helmet's crest, shield and neck brim; phones: headphones, not earmuffs - people.js hatPrims)
  if (hat && hat.d.k === 'hood') A.hat.color = A.top.color;
  if (hat && hat.d.k === 'wig') { A.hair = { style: 'afro', color: HEX(O.hat.c) }; delete A.hat; }   // (a wig is hair: a big round one in the piece's color, over whatever is under it)
  A.drape = (jk || set || A).d?.dr;
  if (!hat && (A.drape === 'cloak' || A.drape === 'ghillie')) A.hat = { kind: 'hood', color: A.top.color };
  const gl = P('glasses');
  if (gl) {
    const k = gl.d.k;
    if (k === 'balaclava' || k === 'skimask') { A.mask = HEX(O.glasses.c); A.maskTrim = k === 'skimask' ? HEX(O.glasses.t) : null; }
    else if (k === 'bandana') A.bandana = HEX(O.glasses.c);
    else if (k === 'medmask') A.medmask = HEX(O.glasses.c);
    else if (FMASKS.includes(k)) { A.fmask = { k, c: HEX(O.glasses.c), t: HEX(O.glasses.t) }; if (gl.d.animal) A.fmask.animal = gl.d.animal; }   // (the rest of CP2's masks; animal: which head a 'pig' is - a bear, a panda)
    else {
      A.glasses = k === 'masq' ? 'domino' : k; A.glassColor = HEX(O.glasses.c); A.lens = gl.d.lens ? HEX(col(gl.d.lens)) : null; A.glassTrim = HEX(O.glasses.t);
      if (gl.d.big) A.glassBig = 1;
      if (gl.d.cat) A.glassCat = 1;
      if (gl.d.chain) A.glassChain = 1;
      if (gl.d.f) A.glassForm = gl.d.f;   // (aviators, wraparounds, half-moons: client/art2/people.js GLS)
      if (k === 'masq') A.masq = HEX(O.glasses.t);   // (its feathers)
    }
  }
  const jw = P('jewel');
  if (jw) A.jewel = { ...jw.d, color: HEX(O.jewel.c), trim: HEX(O.jewel.t) };
  if (jw && jw.d.chain) A.chain = HEX(O.jewel.c);
  if (jw && jw.d.gloves) A.gloves = HEX(O.jewel.c);
  const bg = P('bag');
  if (bg) {
    if (bg.d.back) { A.back = bg.d.back === 2 ? 'guitarcase' : bg.d.back === 3 ? 'yogamat' : 'backpack'; A.backColor = HEX(O.bag.c); if (bg.d.big) A.backBig = 1; if (bg.d.box) A.backBox = 1; }
    else if (bg.d.belt) A.beltBag = HEX(O.bag.c);
    else if (bg.d.rig) A.rig = HEX(O.bag.c);
    else { A.carry = bg.d.carry; A.bagColor = HEX(O.bag.c); if (bg.d.prop) A.prop = [bg.d.prop, HEX(O.bag.t)]; if (bg.d.small) A.bagSmall = 1; if (bg.d.big) A.bagBig = 1; if (bg.d.duffel) A.duffel = 1; }
  }
  return A;
}
