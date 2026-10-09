// Street personalities (concept sheets NP1-NP3, CC6; task #365): people with a character of their own among the
// passers-by, each with a look recipe (npclooks.js), a walk, props and a way of going about:
//   cane      a senior with a cane: the slow hunched walk                trolley   a senior pulling a shopping trolley
//   couple    the tracksuit couple, walking side by side                 tough     tough guys in vests and gold chains:
//                                                                                  they don't back off (npc.js)
//   gym       the gym regular                                            glam      the glamorous walker: a strut
//   streetw   the confident streetwear woman: a strut                    jogger    running laps of a park or the beach
//   skater    pushing along on a board                                   blader    on rollerblades
//   punk      the punk with a mohawk                                     homeless  a homeless man pushing his cart with a
//                                                                                  blanket in it, camped in the park or by an
//                                                                                  underpass: no cash, no target for anyone
//   phone     the office worker staring at his phone: slow, bumping into people
//   dogs      a dog walker with three dogs on leads                     dancer    a wild dancer (the beach, the Strip at night)
//   swim      the eccentric middle-aged man dancing in a tiny purple swimsuit, flip-flops, a sweatband and a bum bag
// and the street life (NP3, CC6): texting while walking (texter), on a call (caller), sitting on a bench (bench), asleep
// in the park (sleeper), a busker playing for coins (busker: drop a coin - ACT - for a little Samaritan credit), and,
// rarely, a selfie at a landmark (selfie: the owner asked for fewer phones out); and a few more of the city's characters:
// a tourist couple with a map and a phone for photos (tourists), a hot-dog seller at a food cart (vendor), a fisherman at
// a pier's rail (fisher), someone leaning on a wall, a foot up behind them (leaner).
// Clients get a persona's walk and prop in the ped descriptor (net.js: gt, pp; a seat on a bench: sb), drawn by
// client/art2/people.js (the hunch, strut, skate, blade, dance and push poses; the cane, trolley, cart, leads, guitar).
import { K, T, TILE } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { pedStep } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { BUSKER_TIP, BUSKER_SAMARITAN, BUSKER_EVERY_S } from '../../shared/rules.js';
import { item, encodeLook, decodeLook, lookToApp, validLook, CLOTH, HAIR_STYLES } from '../../shared/look.js';
import { RECIPES, dress } from './npclooks.js';
import { inAnyView } from '../view.js';
import { store } from '../store.js';
import * as players from './players.js';
import { BUILDS } from '../entities.js';

let rng = mulberry32(36500);
export function setRng(r) { rng = r; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const HS = {}; HAIR_STYLES.forEach((h, i) => { HS[h[0]] = i; });
const Wt = (s) => s.split(' ').filter(Boolean).map((x) => { const [k, w] = x.split(':'); return [k, +(w || 1)]; });
const NO_INPUT = { bits: 0, mx: 0, my: 0, aim: 0 };

// ---- the looks ---------------------------------------------------------------------------------------------------
const brights = ['red', 'royal blue', 'teal', 'yellow', 'hot pink', 'purple', 'lime', 'orange', 'coral', 'sky', 'mint'];
export const LOOKS = {
  tough: { styles: Wt('street:3 streetwear:1'), fem: 0, age: [3, 4, 2, 1, 0, 0], shade: 0, builds: 'syndicate', pool: 10,
    fix(L, r) {
      L.outfit.set = null; L.outfit.jacket = r() < 0.2 ? item('Leather jacket') : null;
      L.outfit.top = item('Tank top', r() < 0.6 ? 'white' : pick(r, ['black', 'grey']));
      L.outfit.bottoms = item(r() < 0.6 ? 'Joggers' : 'Jeans', r() < 0.5 ? undefined : pick(r, ['black', 'charcoal', 'navy']));
      L.outfit.shoes = item(r() < 0.5 ? 'High-tops' : 'Sneakers', pick(r, ['white', 'black']));
      L.outfit.jewel = item(r() < 0.7 ? 'Gold chain' : 'Chain and watch'); L.outfit.bag = null;
      L.outfit.hat = r() < 0.3 ? item('Snapback', 'black') : null; L.outfit.glasses = r() < 0.5 ? item('Sunglasses') : null;
      L.hair.style = pick(r, [HS['Buzz cut'], HS.Bald, HS.Fade, HS['Crew cut']]); L.hair.facial = pick(r, [0, 1, 2, 5, 5, 8]);
      L.extras.tattoos |= 1 | (r() < 0.5 ? 8 : 0) | (r() < 0.3 ? 4 : 0);
    } },
  gym: { styles: Wt('athletic:1'), fem: 0.45, age: [3, 4, 2, 1, 0, 0], shade: 0, builds: 'athlete', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f'; L.outfit.set = null; L.outfit.jacket = r() < 0.25 ? item('Zip hoodie', pick(r, ['grey', 'black', 'navy'])) : null;
      L.outfit.top = item(f ? pick(r, ['Sports bra', 'Tank top', 'Crop top']) : pick(r, ['Tank top', 'Plain tee', 'Tank top']), pick(r, ['black', 'grey', 'white', 'red', 'navy', 'teal']));
      L.outfit.bottoms = item(f ? pick(r, ['Leggings', 'Leggings', 'Shorts']) : pick(r, ['Shorts', 'Joggers']), pick(r, ['black', 'grey', 'navy', 'charcoal']));
      L.outfit.shoes = item('Running shoes', pick(r, ['white', 'black', 'royal blue'])); L.outfit.bag = r() < 0.7 ? item('Duffel bag', pick(r, ['black', 'navy', 'red'])) : null;
      L.outfit.hat = r() < 0.25 ? item('Headband') : null; L.outfit.glasses = null; L.outfit.jewel = null;
    } },
  glam: { styles: Wt('hifashion:4 nightclub:1'), fem: 0.9, age: [3, 3, 2, 1, 0, 0], shade: 0, builds: 'socialite', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f';
      L.outfit.shoes = item(f ? pick(r, ['Heels', 'Stilettos', 'Knee boots']) : 'Chelsea boots', r() < 0.5 ? undefined : pick(r, ['black', 'red', 'gold', 'cream']));
      L.outfit.glasses = item(f && r() < 0.6 ? 'Cat-eye shades' : 'Sunglasses'); L.outfit.bag = item(f ? pick(r, ['Handbag', 'Clutch']) : 'Crossbody bag', pick(r, ['black', 'cream', 'red', 'gold', 'tan']));
      L.outfit.jewel = item(f ? pick(r, ['Pearl necklace', 'Hoop earrings', 'Gold watch', 'Bangles']) : 'Gold watch'); L.outfit.hat = r() < 0.15 ? item('Sun hat', 'black') : null;
      if (f) { L.extras.makeup = 5; L.extras.makeupColor = pick(r, [0, 1, 3]); L.hair.style = pick(r, [HS['Long waves'], HS['Long straight'], HS['High bun'], HS['Curly long']]); }
    } },
  streetw: { styles: Wt('streetwear:1'), fem: 1, age: [4, 3, 1, 0, 0, 0], shade: 0, builds: 'casual', pool: 10,
    fix(L, r) {
      L.outfit.set = null; L.outfit.top = item(pick(r, ['Crop top', 'Hoodie', 'Graphic tee', 'Crop top']), pick(r, ['black', 'white', 'hot pink', 'lime', 'purple', 'cream']));
      L.outfit.jacket = r() < 0.4 ? item(pick(r, ['Bomber jacket', 'Puffer jacket', 'Varsity jacket'])) : null;
      L.outfit.bottoms = item(pick(r, ['Joggers', 'Ripped jeans', 'Cargo pants']), r() < 0.5 ? undefined : pick(r, ['black', 'grey', 'olive', 'cream']));
      L.outfit.shoes = item(r() < 0.6 ? 'High-tops' : 'Sneakers', pick(r, ['white', 'black', 'red'])); L.outfit.jewel = item('Hoop earrings');
      L.outfit.hat = r() < 0.4 ? item(r() < 0.5 ? 'Snapback' : 'Bucket hat', pick(r, ['black', 'white', 'cream'])) : null;
      L.outfit.glasses = r() < 0.4 ? item('Sunglasses') : null; L.extras.makeup = pick(r, [1, 2, 5]);
    } },
  jogger: { styles: Wt('athletic:1'), fem: 0.5, age: [3, 3, 2, 2, 1, 0], shade: 0, builds: 'athlete', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f'; L.outfit.set = null; L.outfit.jacket = null;
      L.outfit.top = item(f ? pick(r, ['Sports bra', 'Tank top', 'Plain tee']) : pick(r, ['Plain tee', 'Tank top']), pick(r, brights.concat(['white', 'black', 'grey'])));
      L.outfit.bottoms = item(f ? pick(r, ['Leggings', 'Shorts']) : 'Shorts', pick(r, ['black', 'navy', 'grey', 'charcoal']));
      L.outfit.shoes = item('Running shoes', pick(r, ['white', 'royal blue', 'lime', 'orange', 'black']));
      L.outfit.hat = r() < 0.45 ? item(pick(r, ['Headband', 'Visor', 'Baseball cap'])) : null; L.outfit.glasses = r() < 0.3 ? item('Sport shades') : null;
      L.outfit.bag = r() < 0.2 ? item('Belt bag') : null; L.outfit.jewel = null;
    } },
  skater: { styles: Wt('skater:3 streetwear:1'), fem: 0.3, age: [5, 2, 0.5, 0, 0, 0], shade: 0, builds: 'casual', pool: 10,
    fix(L, r) { L.outfit.set = null; if (!L.outfit.top) L.outfit.top = item('Graphic tee'); L.outfit.shoes = item(r() < 0.6 ? 'Skate shoes' : 'High-tops'); L.outfit.hat = r() < 0.5 ? item(r() < 0.5 ? 'Beanie' : 'Snapback', pick(r, ['black', 'red', 'charcoal', 'teal'])) : null; L.outfit.bag = null; } },
  blader: { styles: Wt('athletic:2 beach:1 retro:1'), fem: 0.6, age: [4, 3, 1, 0, 0, 0], shade: 0, builds: 'athlete', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f'; L.outfit.set = null; L.outfit.jacket = null;
      L.outfit.top = item(f ? pick(r, ['Crop top', 'Tank top', 'Sports bra']) : pick(r, ['Tank top', 'Plain tee']), pick(r, brights));
      L.outfit.bottoms = item(pick(r, ['Shorts', 'Denim shorts', f ? 'Leggings' : 'Shorts']), r() < 0.5 ? undefined : pick(r, ['black', 'white', 'sky']));
      L.outfit.shoes = item('Sneakers', pick(r, ['white', 'black', 'hot pink', 'royal blue'])); L.outfit.hat = r() < 0.5 ? item(pick(r, ['Headband', 'Visor', 'Bike helmet']), pick(r, brights)) : null;
      L.outfit.glasses = r() < 0.4 ? item('Sunglasses') : null; L.outfit.bag = null;
    } },
  punk: { styles: Wt('punk:1'), fem: 0.4, age: [5, 3, 1, 0, 0, 0], shade: 0, builds: 'hustler', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f'; L.hair.style = HS.Mohawk; L.hair.color = pick(r, [14, 15, 16, 17, 18, 0, 11]);
      L.outfit.set = null; L.outfit.jacket = item(r() < 0.6 ? 'Leather jacket' : 'Studded vest'); L.outfit.top = item(r() < 0.6 ? 'Graphic tee' : 'Mesh top');
      L.outfit.bottoms = item(f && r() < 0.5 ? 'Plaid skirt' : r() < 0.5 ? 'Ripped jeans' : 'Black jeans'); L.outfit.shoes = item(r() < 0.6 ? 'Combat boots' : 'Platform boots');
      L.outfit.jewel = item(r() < 0.6 ? 'Spiked collar' : 'Silver chain'); L.outfit.hat = null; L.outfit.bag = null;
      L.extras.piercings |= 1 | (r() < 0.5 ? 2 : 0) | (r() < 0.4 ? 8 : 0); L.extras.tattoos |= 1 | (r() < 0.5 ? 4 : 0); if (f) { L.extras.makeup = 6; L.extras.makeupColor = 4; }
    } },
  homeless: { styles: Wt('winter:2 outdoors:2 casual:1'), fem: 0.1, age: [0, 1, 3, 3, 2, 1], shade: 0, builds: 'drunk', pool: 6,
    fix(L, r) {
      const dull = ['brown', 'olive', 'charcoal', 'khaki', 'grey', 'chocolate', 'slate', 'rust'];
      L.outfit.set = null; L.outfit.jacket = item(pick(r, ['Wool coat', 'Puffer jacket', 'Trench coat', 'Rain jacket']), pick(r, dull));
      L.outfit.top = item(pick(r, ['Hoodie', 'Flannel shirt', 'Sweater', 'Thermal top']), pick(r, dull)); L.outfit.bottoms = item(r() < 0.6 ? 'Cargo pants' : 'Jeans', pick(r, dull));
      L.outfit.shoes = item(r() < 0.6 ? 'Work boots' : 'Hiking boots', pick(r, ['brown', 'tan', 'black'])); L.outfit.hat = r() < 0.6 ? item('Beanie', pick(r, dull.concat(['red', 'navy']))) : null;
      L.outfit.glasses = null; L.outfit.jewel = null; L.outfit.bag = null;
      L.hair.style = pick(r, [HS.Shag, HS['Long straight'], HS.Dreadlocks, HS['Shoulder length'], HS['Crew cut']]); L.hair.facial = L.body.base === 'm' ? pick(r, [3, 4, 4, 1]) : 0;
    } },
  phone: { styles: Wt('business:2 smart:3'), fem: 0.25, age: [3, 3, 2, 1, 0, 0], shade: 0, builds: 'executive', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f'; L.outfit.set = null; L.outfit.top = item(f ? pick(r, ['Blouse', 'Button-up shirt']) : 'Button-up shirt', pick(r, ['white', 'sky', 'white', 'lavender', 'cream']));
      L.outfit.jacket = r() < 0.35 ? item('Blazer', pick(r, ['navy', 'charcoal', 'grey'])) : null; L.outfit.bottoms = item(f && r() < 0.4 ? 'Skirt' : r() < 0.6 ? 'Suit trousers' : 'Chinos', pick(r, ['charcoal', 'navy', 'khaki', 'black']));
      L.outfit.shoes = item(f ? pick(r, ['Ballet flats', 'Heels']) : pick(r, ['Loafers', 'Oxfords']), pick(r, ['black', 'brown'])); L.outfit.hat = null; L.outfit.bag = null;
      L.outfit.jewel = r() < 0.5 ? item('Watch') : null; L.outfit.glasses = r() < 0.25 ? item('Round glasses', 'black') : null;
    } },
  dancer: { styles: Wt('festival:3 retro:2 nightclub:2 beach:1'), fem: 0.5, age: [4, 3, 2, 1, 0, 0], shade: 0, builds: 'casual', pool: 8,
    fix(L, r) { for (const s of ['top', 'set', 'bottoms', 'jacket']) if (L.outfit[s] && r() < 0.7) L.outfit[s].c = col(pick(r, brights)); L.outfit.hat = r() < 0.4 ? item('Headband', pick(r, brights)) : L.outfit.hat; L.outfit.glasses = r() < 0.4 ? item('Sunglasses') : null; L.outfit.bag = null; } },
  // the eccentric middle-aged man dancing on the beach: a tiny purple swimsuit, flip-flops, a sweatband and a bum bag
  swim: { styles: Wt('beach:1'), fem: 0, age: [0, 0, 2, 2, 0.5, 0], shade: 0, builds: 'drunk', pool: 3,
    fix(L, r) {
      L.body.build = r() < 0.5 ? 3 : 4; L.outfit.set = null; L.outfit.jacket = null;
      L.outfit.top = item('Bare chest'); L.outfit.bottoms = item('Swim trunks', 'purple', 'purple'); L.outfit.shoes = item('Flip-flops', pick(r, ['black', 'purple', 'yellow']));
      L.outfit.hat = item('Headband', pick(r, ['white', 'purple', 'lime'])); L.outfit.bag = item('Belt bag', pick(r, ['black', 'neon green', 'hot pink']));
      L.outfit.glasses = r() < 0.5 ? item('Sunglasses') : null; L.outfit.jewel = null; L.hair.style = pick(r, [HS['Short back & sides'], HS.Bald, HS.Mullet, HS['Curly crop']]); L.hair.facial = pick(r, [0, 6, 6, 1]);
    } },
  tourist: { styles: Wt('beach:2 casual:2 retro:1'), fem: 0.5, age: [1, 2, 2, 3, 2, 1], shade: 0, builds: 'casual', pool: 10,
    fix(L, r) {
      const f = L.body.base === 'f'; L.outfit.set = null; L.outfit.jacket = null;
      L.outfit.top = item(pick(r, ['Hawaiian shirt', 'Polo shirt', 'Plain tee', 'Hawaiian shirt']), pick(r, ['teal', 'coral', 'white', 'yellow', 'sky', 'red']));
      L.outfit.bottoms = item(f && r() < 0.3 ? 'Denim shorts' : r() < 0.7 ? 'Shorts' : 'Chinos', pick(r, ['khaki', 'sand', 'white', 'navy']));
      L.outfit.shoes = item(r() < 0.5 ? 'Sandals' : 'Sneakers', pick(r, ['white', 'brown'])); L.outfit.hat = item(f ? pick(r, ['Sun hat', 'Bucket hat', 'Visor']) : pick(r, ['Bucket hat', 'Panama hat', 'Baseball cap']), pick(r, ['khaki', 'cream', 'white', 'navy']));
      L.outfit.glasses = r() < 0.6 ? item('Sunglasses') : null; L.outfit.bag = item(r() < 0.5 ? 'Crossbody bag' : 'Backpack', pick(r, ['brown', 'navy', 'black'])); L.outfit.jewel = null;
    } },
  vendor: { styles: Wt('casual:1'), fem: 0.35, age: [1, 2, 3, 2, 1, 0], shade: 0, builds: 'casual', pool: 6,
    fix(L, r) { L.outfit.set = null; L.outfit.jacket = null; L.outfit.top = item(r() < 0.5 ? 'Polo shirt' : 'Plain tee', pick(r, ['white', 'red', 'yellow'])); L.outfit.bottoms = item(r() < 0.5 ? 'Chinos' : 'Jeans', pick(r, ['black', 'khaki', 'denim'])); L.outfit.shoes = item('Sneakers', pick(r, ['white', 'black'])); L.outfit.hat = r() < 0.7 ? item('Baseball cap', pick(r, ['red', 'white', 'yellow'])) : null; L.outfit.glasses = null; L.outfit.bag = null; L.outfit.jewel = null; } },
  fisher: { styles: Wt('outdoors:3 casual:1'), fem: 0.15, age: [0.5, 1, 2, 3, 3, 2], shade: 0, builds: 'casual', pool: 6,
    fix(L, r) { L.outfit.set = null; L.outfit.top = item(r() < 0.5 ? 'Flannel shirt' : 'Thermal top', pick(r, ['red', 'forest', 'navy', 'cream'])); L.outfit.jacket = r() < 0.5 ? item(r() < 0.5 ? 'Puffer vest' : 'Rain jacket', pick(r, ['olive', 'navy', 'yellow', 'khaki'])) : null; L.outfit.bottoms = item('Cargo pants', pick(r, ['olive', 'khaki', 'charcoal'])); L.outfit.shoes = item(r() < 0.5 ? 'Rain boots' : 'Work boots', pick(r, ['yellow', 'olive', 'brown'])); L.outfit.hat = r() < 0.8 ? item(pick(r, ['Bucket hat', 'Trucker cap', 'Beanie']), pick(r, ['khaki', 'olive', 'red', 'navy'])) : null; L.outfit.glasses = r() < 0.3 ? item('Sport shades') : null; L.outfit.bag = null; L.outfit.jewel = null; } },
  busker: { styles: Wt('retro:2 alt:2 casual:1 western:1'), fem: 0.35, age: [2, 3, 2, 1, 1, 0], shade: 0, builds: 'casual', pool: 6,
    fix(L, r) { L.outfit.hat = r() < 0.6 ? item(r() < 0.5 ? 'Fedora' : 'Beanie', pick(r, ['brown', 'charcoal', 'black', 'mustard'])) : null; if (r() < 0.5) L.outfit.jacket = item(r() < 0.5 ? 'Denim jacket' : 'Leather jacket'); L.outfit.bag = null; if (L.body.base === 'm' && r() < 0.6) L.hair.facial = pick(r, [1, 2, 3, 5]); } },
};
const CI = {}; CLOTH.forEach(([, n], i) => { CI[n.toLowerCase()] = i; });
function col(n) { return CI[n] ?? 0; }

// ---- who, where ----------------------------------------------------------------------------------------------------------
// arche: their stats (entities.js); look: LOOKS key or an npclooks RECIPES key; where: district styles (weights); day / night
// weights; gt: the walk; pp: the prop; speed (x the archetype's); cap: at most this many round one place
export const PERSONAS = {
  cane:     { arche: 'senior', look: 'senior', gt: 'hunch', pp: 'cane', speed: 0.75, where: 'houses:3 oldtown:3 park:2 commercial:1 apartments:1 civic:1 luxury:1', day: 3, night: 0.3 },
  trolley:  { arche: 'senior', look: 'senior', pp: 'trolley', speed: 0.85, where: 'commercial:3 apartments:2 oldtown:2 houses:1', day: 2, night: 0 },
  couple:   { arche: 'casual', look: 'couple', where: 'apartments:2 southside:2 commercial:1 park:1 houses:1', day: 1.5, night: 0.6, pair: true },
  tough:    { arche: 'hustler', look: 'tough', where: 'southside:3 industrial:2 nightlife:1 redlight:2 harbor:1 rocky:1', day: 1.5, night: 2, tough: true, fight: 1 },
  gym:      { arche: 'athlete', look: 'gym', where: 'commercial:2 apartments:2 park:1 beach:1 houses:1', day: 2, night: 0.5 },
  glam:     { arche: 'socialite', look: 'glam', gt: 'strut', where: 'luxury:3 towers:2 nightlife:2 commercial:1', day: 2, night: 2 },
  streetw:  { arche: 'casual', look: 'streetw', gt: 'strut', where: 'apartments:2 commercial:2 southside:2 nightlife:2', day: 2, night: 1 },
  jogger:   { arche: 'athlete', look: 'jogger', jog: true, where: 'park:5 beach:4 houses:1 luxury:1', day: 3, night: 0.3, cap: 3 },
  skater:   { arche: 'casual', look: 'skater', gt: 'skate', pp: 'board', speed: 1.5, where: 'beach:2 apartments:1 commercial:1 civic:2 park:1', day: 2, night: 0.5 },
  blader:   { arche: 'athlete', look: 'blader', gt: 'blade', speed: 1.45, where: 'beach:4 park:2', day: 2, night: 0 },
  punk:     { arche: 'hustler', look: 'punk', where: 'southside:2 oldtown:2 nightlife:2 redlight:2', day: 1, night: 2 },
  homeless: { arche: 'drunk', look: 'homeless', gt: 'push', pp: 'cart', speed: 0.8, where: 'park:2 southside:2 industrial:1 harbor:1 oldtown:1', day: 1, night: 1, cap: 1, poor: true, camp: true },
  phone:    { arche: 'executive', look: 'phone', pp: 'phone', speed: 0.7, where: 'towers:4 civic:2 commercial:2', day: 3, night: 0.3, bumps: true },
  dogs:     { arche: 'casual', look: 'casual', pp: 'leads', speed: 0.8, where: 'park:3 houses:3 beach:1 luxury:2', day: 2, night: 0.3, cap: 1, dogs: 3 },
  dancer:   { arche: 'casual', look: 'dancer', gt: 'dance', where: 'beach:3 nightlife:3', day: 1, night: 1, cap: 1, dance: true },
  swim:     { arche: 'drunk', look: 'swim', gt: 'dance', where: 'beach:4', day: 1.5, night: 0, cap: 1, dance: true },
  // street life
  texter:   { arche: 'casual', look: 'casual', pp: 'phone', speed: 0.8, where: 'commercial:2 apartments:2 towers:1 civic:1 nightlife:1 houses:1 beach:1 park:1', day: 2, night: 1 },
  caller:   { arche: 'casual', look: 'casual', pp: 'call', speed: 0.85, where: 'commercial:2 towers:2 apartments:1 civic:1', day: 1.5, night: 0.5 },
  bench:    { arche: 'casual', look: 'casual', where: 'park:3 commercial:1 civic:2 beach:1 houses:1 oldtown:1', day: 2.5, night: 0.4, bench: true },
  sleeper:  { arche: 'drunk', look: 'homeless', where: 'park:2 southside:1 civic:1', day: 0.6, night: 0.6, cap: 1, sleep: true, poor: true },
  busker:   { arche: 'casual', look: 'busker', pp: 'guitar', where: 'commercial:2 civic:2 oldtown:2 towers:1 nightlife:1 beach:1', day: 1.5, night: 1, cap: 1, busk: true },
  selfie:   { arche: 'casual', look: 'casual', where: 'civic:2 park:1 beach:1 towers:1', day: 0.4, night: 0.1, cap: 1, selfie: true },
  // more of the city's characters
  tourists: { arche: 'casual', look: 'tourist', pp: 'map', speed: 0.8, where: 'civic:2 beach:2 oldtown:2 towers:1 park:1 commercial:1', day: 1.5, night: 0.3, pair: true, cap: 1 },
  vendor:   { arche: 'casual', look: 'vendor', where: 'commercial:2 civic:2 park:2 beach:2 towers:1', day: 2, night: 0.6, cap: 1, cart: true },
  fisher:   { arche: 'casual', look: 'fisher', where: 'beach:2 harbor:3 park:1', day: 2, night: 0.7, fish: true },
  leaner:   { arche: 'casual', look: 'casual', gt: 'lean', where: 'commercial:2 apartments:2 southside:2 nightlife:2 towers:1 oldtown:1 redlight:1', day: 1, night: 1.4, lean: true },
};
for (const P of Object.values(PERSONAS)) P.w = Wt(P.where);

export const PERSONA_SHARE = { day: 0.3, night: 0.22 };   // of the townsfolk who come walking along
const CAP_R = 1400;

// ---- benches and landmarks (the map's props), by 512 px cell ---------------------------------------------------------------
const CAT = { bench_m: 'b', bench_a: 'b', bench_b: 'b', pbench: 'b', fountain: 'm', statue: 'm', mapboard: 'm', gazebo: 'm', ferris: 'm', foodcart: 'c', pierrail: 'p', pier: 'p', fishtable: 'p', rods: 'p' };
const BENCH = 'b', MARK = 'm', CART = 'c', PIER = 'p';
const IDX = new WeakMap();
function propsNear(map, x, y, r, cat) {
  let ix = IDX.get(map);
  if (!ix) { ix = {}; for (const q of map.props || []) { const c = CAT[q.t]; if (!c) continue; const g = ix[c] ||= new Map(), k = (Math.floor(q.x / 512) << 16) | Math.floor(q.y / 512); if (!g.has(k)) g.set(k, []); g.get(k).push(q); } IDX.set(map, ix); }
  const g = ix[cat] || new Map(), out = [];
  for (let cx = Math.floor((x - r) / 512); cx <= Math.floor((x + r) / 512); cx++) for (let cy = Math.floor((y - r) / 512); cy <= Math.floor((y + r) / 512); cy++) for (const q of g.get((cx << 16) | cy) || []) if (Math.hypot(q.x - x, q.y - y) < r) out.push(q);
  return out;
}
const walkable = (map, x, y) => { const t = map.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP; };

// ---- spawning ---------------------------------------------------------------------------------------------------------------
function lookFor(world, P, key, x, y, night) {
  const rec = LOOKS[P.look] || RECIPES[P.look];
  return dress(world, LOOKS[P.look] ? 'p:' + P.look : P.look, x, y, night, rng, rec);
}
// Someone with a character of their own, for a new passer-by at (x, y) - or null (nobody fits here now; an ordinary
// passer-by comes instead). spawnNpc: npc.js's (passed in: this module doesn't import npc.js).
export function spawnHere(world, spawnNpc, x, y, night) {
  const d = world.map.districtAt(x, y), list = [], have = new Map();
  let tot = 0;
  for (const e of world.query(x, y, CAP_R, K.PED)) if (e.npc && e.npc.persona && !e.dead) have.set(e.npc.persona, (have.get(e.npc.persona) || 0) + 1);
  for (const [k, P] of Object.entries(PERSONAS)) {
    const dw = P.w.find(([s]) => s === d.style), tw = night ? P.night : P.day;
    if (!dw || !tw || (have.get(k) || 0) >= (P.cap || 2)) continue;
    const w = dw[1] * tw;
    list.push([k, w]); tot += w;
  }
  if (!tot) return null;
  let r = rng() * tot, key = list[0][0];
  for (const [k, w] of list) { r -= w; if (r <= 0) { key = k; break; } }
  return spawnPersona(world, spawnNpc, key, x, y, night, true);
}
// offView: a passer-by from the density manager (spawnHere), whose spot (x, y) was picked off everyone's screen - one
// who'd sit on a bench, lean on a wall, push a cart or fish from a rail near it isn't put there if that's in someone's
// view (they'd pop up on screen: test/view.test.js)
export function spawnPersona(world, spawnNpc, key, x, y, night = !!(world.clock && world.clock.isNight), offView = false) {
  const P = PERSONAS[key];
  if (!P) return null;
  let at = { x, y };
  if (P.bench || P.sleep) {   // on the bench's seat, facing the way it faces (asleep: on the grass in front of it)
    const b = propsNear(world.map, x, y, 520, BENCH).find((q) => !benchTaken(world, q)); if (!b) return null;
    const fa = benchFacing(world.map, b), k = P.sleep ? 18 : 0;
    at = { x: b.x + Math.cos(fa) * k, y: b.y + Math.sin(fa) * k, a: fa };
  }
  if (P.selfie) { const m = propsNear(world.map, x, y, 600, MARK)[0]; if (!m) return null; at = spotNear(world, m.x, m.y, 40, 80) || null; if (!at) return null; at.mark = m; }
  if (P.lean) { at = wallSpot(world, x, y); if (!at) return null; }
  if (P.cart) { const c = propsNear(world.map, x, y, 700, CART).find((q) => !world.query(q.x, q.y + 18, 24, K.PED).some((e) => e.npc && e.npc.persona === key)); if (!c || !walkable(world.map, c.x, c.y + 18)) return null; at = { x: c.x, y: c.y + 18 }; }
  if (P.fish) {   // at a pier's rail, facing the water
    const rails = propsNear(world.map, x, y, 800, PIER);
    let spot = null;
    for (let k = 0; k < rails.length && !spot; k++) { const q = rails[(k + Math.floor(rng() * rails.length)) % rails.length], s2 = spotNear(world, q.x, q.y, 6, 26); if (s2 && !world.query(s2.x, s2.y, 30, K.PED).some((e) => e.npc && e.npc.persona === key)) spot = s2; }
    if (!spot) return null;
    at = spot; at.water = waterward(world.map, spot.x, spot.y);
    if (at.water === null) return null;
  }
  if (offView && (at.x !== x || at.y !== y) && inAnyView(world, at.x, at.y, 64)) return null;
  const ped = spawnNpc(world, P.arche, at.x, at.y, 'civ');
  apply(world, ped, key, night);
  const n = ped.npc;
  if (P.bench || P.sleep) n.bench = { x: at.x, y: at.y, a: at.a };
  if (at.mark) {   // a photo of themselves with the fountain (the statue, the big wheel) behind them - npc.js's filming, the phone held
    // up, facing away from it, a flash now and then - then on they go like anyone
    const now = world.time;
    n.state = 'film'; n.fx = 2 * at.x - at.mark.x; n.fy = 2 * at.y - at.mark.y; n.until = now + 20 + rng() * 20; n.filmedAt = now; n.photo = true; n.nextFlash = now + 1;
    ped.filming = 2; ped.phoneOut = now; ped.appVer = (ped.appVer || 0) + 1; ped.a = Math.atan2(n.fy - at.y, n.fx - at.x);
  }
  if (P.sleep) { n.state = 'passed'; ped.passedOut = true; ped.downUntil = 0; ped.sleeping = true; }
  if (P.cart) { n.spot = { x: at.x, y: at.y }; ped.a = Math.PI / 2; }
  if (P.lean) { n.spot = { x: at.x, y: at.y, a: at.a }; ped.a = at.a; n.until = world.time + 30 + rng() * 60; }
  if (P.fish) { n.spot = { x: at.x, y: at.y, a: at.water }; ped.a = at.water; ped.fishing = { npc: true }; }
  if (P.pair) {   // the other half: the same tracksuit (the tourists: snapping photos), a step to the side
    const p2 = spawnNpc(world, P.arche, at.x + 14, at.y + 4, 'civ');
    apply(world, p2, key, night, ped);
    p2.npc.with = ped.id; ped.npc.with2 = p2.id;
    if (P.look !== 'couple') p2.pp = 'phone';
  }
  if (P.dogs) {
    ped.dogs = [];
    const kinds = ['dog_golden', 'dog_black', 'dog_spaniel', 'dog_pup'];
    for (let i = 0; i < P.dogs; i++) {
      const dog = world.spawnPed(at.x + 20, at.y + (i - 1) * 8, { hp: 40, archetype: 'pet:' + pick(rng, kinds), name: 'a dog', a: ped.a, app: { bd: 1 } });
      dog.pet = { walked: ped.id, kind: 'dog', name: 'a dog', i };
      ped.dogs.push(dog.id);
    }
  }
  return ped;
}
// a spot with its back to a building's wall, near (x, y): { x, y, a: facing away from the wall } or null
function wallSpot(world, x, y) {
  const m = world.map, tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  for (let k = 0; k < 40; k++) {
    const tx = tx0 + Math.floor((rng() - 0.5) * 18), ty = ty0 + Math.floor((rng() - 0.5) * 18), t = m.tileAt(tx, ty);
    if (t !== T.SIDEWALK && t !== T.PLAZA) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      if (!PED_BLOCK[m.tileAt(tx + dx, ty + dy)] || !m.buildingAtPx((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE)) continue;
      const px = (tx + 0.5) * TILE + dx * (TILE / 2 - 12), py = (ty + 0.5) * TILE + dy * (TILE / 2 - 12);
      if (world.query(px, py, 40, K.PED).some((e) => e.npc && e.npc.persona === 'leaner')) continue;
      return { x: px, y: py, a: Math.atan2(-dy, -dx) };
    }
  }
  return null;
}
// which way the water is from a spot on the pier (radians), or null when there's none in reach
function waterward(map, x, y) {
  for (const r of [24, 40, 60]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, t = map.tileAtPx(x + Math.cos(a) * r, y + Math.sin(a) * r); if (t === T.WATER || t === T.DEEP) return a; }
  return null;
}
const benchTaken = (world, b) => world.query(b.x, b.y, 30, K.PED).some((e) => e.npc && (e.npc.bench || e.sitBench));
// the way a bench faces, as the art draws it (client/art2/game/statics.js 'bench', props.js bench(): the seat's front at +y,
// turned by its heading): as its place set it, else toward the road beside it, else one of four ways by its position
const ahash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2, qa4 = (a) => (((Math.round((((a % TAU) + TAU) % TAU) / TAU * 4) % 4) + 4) % 4) * TAU / 4;
export function benchFacing(map, b) {
  let hd;
  if (b.a !== undefined) hd = qa4(b.a);
  else {
    const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
    let rd = null;
    for (let k = 1; k <= 3 && rd === null; k++) for (const [dx, dy, a] of [[0, 1, Math.PI / 2], [0, -1, -Math.PI / 2], [1, 0, 0], [-1, 0, Math.PI]]) { const t = map.tileAt(tx + dx * k, ty + dy * k); if (t === T.ROAD || t === T.BRIDGE) { rd = a; break; } }
    hd = rd !== null ? qa4(rd - Math.PI / 2) : qa4(Math.floor(ahash(Math.floor(b.x), Math.floor(b.y), 7) * 4) * Math.PI / 2);
  }
  return hd + Math.PI / 2;
}
function spotNear(world, x, y, r0, r1) {
  for (let k = 0; k < 16; k++) { const a = rng() * Math.PI * 2, d = r0 + rng() * (r1 - r0), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (walkable(world.map, px, py)) return { x: px, y: py }; }
  return null;
}

// dress and set up an NPC as a persona (partner: the other half of a couple, whose tracksuit they match)
export function apply(world, ped, key, night = false, partner = null) {
  const P = PERSONAS[key], n = ped.npc;
  let g;
  if (P.look === 'couple') g = coupleLook(world, ped, partner);
  else g = lookFor(world, P, key, ped.x, ped.y, night);
  if (g) {   // (the body comes with its build: the hit points and the fight follow the new one)
    const old = ped.build, nb = BUILDS[g.bi] || old;
    ped.app = g.app; ped.app.bd = g.bi; ped.appVer = (ped.appVer || 0) + 1;
    if (old && nb && nb !== old) { ped.maxHp = ped.hp = Math.max(20, Math.round(ped.maxHp / old.hp * nb.hp)); n.fight = Math.max(0, Math.min(1, n.fight - old.fight + nb.fight)); ped.build = nb; }
  }
  n.persona = key;
  if (P.gt) ped.gt = P.gt;
  if (P.pp) ped.pp = P.pp;
  if (P.speed) n.speed *= P.speed;
  if (P.tough) { n.tough = true; n.fight = 1; n.reflex = Math.max(n.reflex, 0.5); }
  if (P.poor) n.poor = true;   // (no cash, nothing to drop: npc.js onDeath)
  if (P.camp) n.camp = { x: ped.x, y: ped.y };
  if (P.camp || P.dance) n.sway = false;   // (their stats are a drunk's, but they walk straight)
  if (P.jog) { n.laps = lapRoute(world, ped.x, ped.y); n.lap = 0; }
  if (P.dance) n.spot = { x: ped.x, y: ped.y };
  if (P.busk) { n.spot = { x: ped.x, y: ped.y }; n.tips = new Map(); }
  n.umbrellaType = false;
  return ped;
}
// the tracksuit couple: him and her in the same tracksuit
const TRACK = ['red', 'navy', 'royal blue', 'black', 'purple', 'teal', 'burgundy', 'forest', 'hot pink', 'grey'];
const COUPLE = { styles: Wt('athletic:1 street:1'), fem: 0, age: [2, 3, 3, 2, 1, 0], shade: 0, builds: 'casual', pool: 8,
  fix(L, r) { L.outfit.top = L.outfit.bottoms = L.outfit.jacket = null; L.outfit.set = item('Tracksuit', pick(r, TRACK), pick(r, ['white', 'white', 'gold', 'black'])); L.outfit.shoes = item('Sneakers', 'white'); L.outfit.bag = null; L.outfit.hat = r() < 0.3 ? item('Baseball cap', 'white') : null; L.outfit.glasses = r() < 0.3 ? item('Sunglasses') : null; } };
const COUPLE_F = { ...COUPLE, fem: 1 };
function coupleLook(world, ped, partner) {
  if (!partner) return dress(world, 'p:couple', ped.x, ped.y, false, rng, COUPLE);
  const g = dress(world, 'p:couplef', ped.x, ped.y, false, rng, COUPLE_F), mine = partner.app && partner.app.lk;
  if (!g || !mine) return g;
  const L = validLook(JSON.parse(JSON.stringify(g.look))), them = decodeLook(mine);
  if (them && them.outfit.set && L.outfit.set) { L.outfit.set.c = them.outfit.set.c; L.outfit.set.t = them.outfit.set.t; }
  const code = encodeLook(L);
  return { app: lookToApp(L, code), look: L, code, bi: g.bi };
}

// a jogger's laps: a loop of points round where they started, on open ground
function lapRoute(world, x, y) {
  const pts = [], R = 140 + rng() * 120, a0 = rng() * Math.PI * 2, dir = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < 8; i++) {
    const a = a0 + dir * i * Math.PI / 4;
    for (const k of [1, 0.75, 0.5]) { const px = x + Math.cos(a) * R * k, py = y + Math.sin(a) * R * k; if (walkable(world.map, px, py)) { pts.push({ x: px, y: py }); break; } }
  }
  return pts.length >= 3 ? pts : null;
}

// ---- going about it (npc.js update: steer, for a persona wandering or standing about) ------------------------------------
// -> { inp, factor } (factor: the walk's share of a run, as npc.js) or null: walk about like anyone
const seekTo = (ped, tx, ty, s = 1) => { const dx = tx - ped.x, dy = ty - ped.y, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 24) * s; return { bits: 0, mx: dx / d * m, my: dy / d * m, aim: Math.atan2(dy, dx) }; };
export function steer(world, ped, now) {
  const n = ped.npc, P = PERSONAS[n.persona];
  if (!P) return null;
  if (n.with) {   // the other half of a couple: alongside the first, a step to their right
    const a = world.get(n.with);
    if (!a || a.dead || a.removed || !a.npc || a.npc.state === 'flee' || a.npc.state === 'fight') { n.with = 0; return null; }
    const h = a.a, tx = a.x - Math.sin(h) * 15, ty = a.y + Math.cos(h) * 15, d = Math.hypot(tx - ped.x, ty - ped.y);
    if (d < 4) { ped.a = h; return { inp: NO_INPUT, factor: 0.55 }; }
    return { inp: seekTo(ped, tx, ty, d > 40 ? 1 : 0.9), factor: d > 60 ? 0.9 : 0.6 };
  }
  if (P.jog && n.laps) {
    const p = n.laps[n.lap % n.laps.length];
    if (Math.hypot(p.x - ped.x, p.y - ped.y) < 18) n.lap++;
    return { inp: seekTo(ped, p.x, p.y), factor: 0.7 };   // (a jog, ~90 px/s: the client's jogging stride)
  }
  if (P.dance) {   // dancing on the spot, now and then a shuffle along
    if (now >= (n.moveAt || 0)) { n.moveAt = now + 6 + rng() * 10; const s = spotNear(world, n.spot.x, n.spot.y, 0, 50); if (s) { n.wx = s.x; n.wy = s.y; } }
    if (Math.hypot(n.wx - ped.x, n.wy - ped.y) > 8) return { inp: seekTo(ped, n.wx, n.wy, 0.6), factor: 0.4 };
    ped.a += Math.sin(now * 1.7 + ped.id) * 0.02;
    return { inp: NO_INPUT, factor: 0.55 };
  }
  if (P.lean && n.spot) {   // leaning on the wall a while, then off like anyone
    if (now > n.until) { n.spot = null; ped.gt = null; ped.appVer = (ped.appVer || 0) + 1; return null; }
    if (Math.hypot(n.spot.x - ped.x, n.spot.y - ped.y) > 6) return { inp: seekTo(ped, n.spot.x, n.spot.y), factor: 0.5 };
    ped.vx = ped.vy = 0; ped.a = n.spot.a;
    return { inp: NO_INPUT, factor: 0.55 };
  }
  if ((P.busk || P.cart || P.fish) && n.spot) {   // the busker, the hot-dog seller and the fisherman keep their spot
    if (P.fish) { ped.a = n.spot.a; if (!ped.fishing) ped.fishing = { npc: true }; return { inp: NO_INPUT, factor: 0.55 }; }
    if (Math.hypot(n.spot.x - ped.x, n.spot.y - ped.y) > 10) return { inp: seekTo(ped, n.spot.x, n.spot.y), factor: 0.5 };
    ped.vx = ped.vy = 0; if (P.cart) ped.a = Math.PI / 2;
    return { inp: NO_INPUT, factor: 0.55 };
  }
  if (P.bench && n.bench) {   // to the bench, sit a while, then off they go like anyone
    if (!ped.sitBench) {
      if (Math.hypot(n.bench.x - ped.x, n.bench.y - ped.y) > 6) return { inp: seekTo(ped, n.bench.x, n.bench.y, 0.8), factor: 0.5 };
      ped.sitBench = true; ped.x = n.bench.x; ped.y = n.bench.y; ped.a = n.bench.a; n.upAt = now + 25 + rng() * 50; ped.appVer = (ped.appVer || 0) + 1;
    }
    if (now < n.upAt) { ped.vx = ped.vy = 0; ped.a = n.bench.a; return { inp: NO_INPUT, factor: 0.55 }; }
    ped.sitBench = false; ped.appVer = (ped.appVer || 0) + 1; n.bench = null; n.persona = 'texter'; ped.pp = rng() < 0.5 ? 'phone' : null; if (!ped.pp) n.persona = null;
    return null;
  }
  if (P.camp && n.camp) {   // round his camp: pushing the cart a little way, then sitting by it a good while
    if (ped.sit) { if (now < n.upAt) { ped.vx = ped.vy = 0; return { inp: NO_INPUT, factor: 0.55 }; } ped.sit = false; ped.appVer = (ped.appVer || 0) + 1; }
    if (Math.hypot(n.wx - ped.x, n.wy - ped.y) < 10 || now > (n.until || 0)) {
      if (rng() < 0.35) { ped.sit = true; n.upAt = now + 20 + rng() * 40; ped.appVer = (ped.appVer || 0) + 1; return { inp: NO_INPUT, factor: 0.55 }; }
      const s = spotNear(world, n.camp.x, n.camp.y, 20, 140) || n.camp; n.wx = s.x; n.wy = s.y; n.until = now + 14;
    }
    return { inp: seekTo(ped, n.wx, n.wy), factor: 0.45 };
  }
  if (P.bumps && now >= (n.bumpAt || 0)) {   // eyes on the phone: walks into people
    for (const e of world.query(ped.x, ped.y, 16, K.PED)) {
      if (e === ped || e.dead || e.vehId || e.pet) continue;
      const da = Math.atan2(e.y - ped.y, e.x - ped.x) - ped.a;
      if (Math.cos(da) < 0.5) continue;
      n.bumpAt = now + 6; n.state = 'idle'; n.until = now + 1.2; n.lookAt = now + 1.2; ped.vx = ped.vy = 0;
      world.emit(ped.x, ped.y, { e: 'yelp', x: ped.x, y: ped.y });
      return { inp: NO_INPUT, factor: 0.55 };
    }
  }
  return null;
}

// ---- every tick: the walked dogs at heel (out in front on their leads), the persona props on the descriptor ---------------
const LEAD = [[24, -8], [27, 0], [24, 8]];   // where each dog trots, in front of the walker (ahead, to the side) - the leads in
                                             // the walker's sprite (people.js 'leads') end here
export function update(world, dt) {
  for (const dog of world.entities.values()) {
    if (dog.kind === K.PED && dog.fishing && dog.fishing.npc && dog.npc && (dog.dead || (dog.npc.state !== 'wander' && dog.npc.state !== 'idle'))) dog.fishing = null;   // (trouble: the rod goes down)
    if (dog.kind !== K.PED || !dog.pet || !dog.pet.walked) continue;
    const w = world.get(dog.pet.walked);
    if (!w || w.removed || w.dead || w.vehId) {
      if (!inAnyView(world, dog.x, dog.y, 40)) { world.remove(dog); continue; }
      const mods = players.pedMods(world, dog); mods.speedMul *= 0.9;
      pedStep(dog, w && !w.removed ? { bits: 0, mx: 0, my: 0, aim: dog.a } : { bits: 0, mx: Math.cos(dog.a), my: Math.sin(dog.a), aim: dog.a }, dt, world.map, mods);
      world.place(dog);
      continue;
    }
    const [f, s] = LEAD[dog.pet.i % 3], c = Math.cos(w.a), sn = Math.sin(w.a);
    const tx = w.x + c * f - sn * s, ty = w.y + sn * f + c * s, d = Math.hypot(tx - dog.x, ty - dog.y);
    if (d > 90) { dog.x = tx; dog.y = ty; dog.vx = dog.vy = 0; }
    else if (d > 3) {
      const mods = players.pedMods(world, dog); mods.speedMul *= Math.min(1.6, 0.4 + d / 20); mods.canSwim = false;
      pedStep(dog, { bits: 0, mx: (tx - dog.x) / d, my: (ty - dog.y) / d, aim: 0 }, dt, world.map, mods);
      dog.a = Math.hypot(w.vx, w.vy) > 5 ? w.a : Math.atan2(ty - dog.y, tx - dog.x);
    } else { dog.vx = dog.vy = 0; dog.a = w.a; }
    world.place(dog);
  }
}

// ---- the busker: drop a coin in the guitar case (ACT beside them) ----------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  for (const e of world.query(ped.x, ped.y, 56, K.PED)) {
    if (!e.npc || e.dead || e.npc.persona !== 'busker' || e.npc.state !== 'idle' && e.npc.state !== 'wander') continue;
    const last = e.npc.tips && e.npc.tips.get(p.profile.pid);
    if (last !== undefined && world.time - last < BUSKER_EVERY_S) return null;
    if ((p.profile.cash || 0) < BUSKER_TIP) return null;
    return { label: `Drop a coin for the busker ($${BUSKER_TIP})`, run: () => tip(world, p, e) };
  }
  return null;
}
function tip(world, p, busker) {
  if ((p.profile.cash || 0) < BUSKER_TIP) return;
  p.profile.cash -= BUSKER_TIP; p.profile.samaritan = (p.profile.samaritan || 0) + BUSKER_SAMARITAN;
  busker.npc.tips.set(p.profile.pid, world.time);
  store.touch(); p.meDirty = true;
  busker.a = Math.atan2(p.ped.y - busker.y, p.ped.x - busker.x);
  world.notify(p, `The busker nods along: "Thank you kindly!" -$${BUSKER_TIP}, +${BUSKER_SAMARITAN} Samaritan.`, 'good');
}
