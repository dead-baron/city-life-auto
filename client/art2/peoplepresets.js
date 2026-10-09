// Ready-made people for the art v2 scenes and tools (client/art2/scene.js, waterscenes.js, scene-corner.js, the previews
// in tools/art2/): ARCHETYPES, the first version's sheet of kinds of people, extended, as people.js appearances, and
// randomPerson(seed, kind?) -> one of them, or a random passer-by. (Moved out of people.js on 2026-10-09: the game dresses
// its people from the look system, so these stay out of what the game's renderer loads.)
import { hash } from './gbuf.js';

const PALET = ['white', 'black', 'denim', 'navy', 'red', 'orange', 'yellow', 'green', 'teal', 'purple', 'pink', 'khaki', 'grey', 'brown'];
export const ARCHETYPES = {
  banker: { top: { kind: 'suit', color: 'black', color2: 'white', tie: 'navy' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', carry: 'briefcase', glasses: 'sun' },
  socialite: { fem: true, hair: { style: 'wavy', color: 3 }, top: { kind: 'tank', color: 'white' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown', shoeKind: 'sandal', carry: 'shopping', glasses: 'sun' },
  yachtie: { hair: { style: 'short', color: 4 }, top: { kind: 'polo', color: 'teal' }, bottom: { kind: 'shorts', color: 'white' }, shoes: 'brown', glasses: 'sun' },
  athleisure: { fem: true, hair: { style: 'bun', color: 1 }, top: { kind: 'tank', color: 'pink' }, bottom: { kind: 'leggings', color: 'pink' }, shoes: 'white', carry: 'phone' },
  valet: { top: { kind: 'vest', color: 'black', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black' },
  office: { top: { kind: 'shirt', color: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', carry: 'bag', glasses: 'round' },
  nurse: { fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'scrubs', color: 'denim' }, bottom: { kind: 'pants', color: 'denim' }, shoes: 'white', carry: 'coffee' },
  dad: { hair: { style: 'short', color: 1 }, beard: 'short', top: { kind: 'jacket', color: 'green', color2: 'white' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown', glasses: 'round' },
  student: { hair: { style: 'short', color: 0 }, top: { kind: 'hoodie', color: 'grey' }, bottom: { kind: 'jeans', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'red' }, back: 'backpack' },
  barista: { fem: true, hair: { style: 'bun', color: 2 }, top: { kind: 'apron', color: 'green', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white', carry: 'coffee' },
  mechanic: { build: 2, beard: 'full', top: { kind: 'overalls', color: 'navy', color2: 'navy' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'brown', hat: { kind: 'cap', color: 'navy' } },
  nightshift: { top: { kind: 'hivis', color: 'yellow', color2: 'black' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', hat: { kind: 'beanie', color: 'black' }, carry: 'coffee' },
  punk: { hair: { style: 'mohawk', color: 5 }, top: { kind: 'leather', color: 'black', color2: 'grey' }, bottom: { kind: 'jeans', color: 'denim', pattern: 'ripped' }, shoes: 'black', shoeKind: 'boot', tattoo: true },
  tracksuit: { build: 2, top: { kind: 'tracksuit', color: 'navy', color2: 'white' }, bottom: { kind: 'track', color: 'navy' }, shoes: 'white', hat: { kind: 'cap', color: 'white' }, chain: true },
  surfer: { hair: { style: 'wavy', color: 3 }, top: { kind: 'none' }, bottom: { kind: 'trunks', color: 'teal' }, shoes: 'brown', shoeKind: 'barefoot', carry: 'board' },
  tourist: { build: 2, top: { kind: 'hawaiian', color: 'teal', color2: 'orange', pattern: 'floral' }, bottom: { kind: 'shorts', color: 'khaki' }, shoes: 'brown', shoeKind: 'sandal', hat: { kind: 'bucket', color: 'khaki' }, glasses: 'sun' },
  farmer: { beard: 'full', hair: { style: 'short', color: 4 }, top: { kind: 'overalls', color: 'denim', color2: 'red' }, bottom: { kind: 'pants', color: 'denim' }, shoes: 'brown', shoeKind: 'boot', hat: { kind: 'cowboy', color: 'khaki' } },
  trucker: { build: 2, beard: 'full', top: { kind: 'flannel', color: 'brown', color2: 'white' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', shoeKind: 'boot', hat: { kind: 'trucker', color: 'red' } },
  granny: { fem: true, build: 0, hair: { style: 'bun', color: 4 }, top: { kind: 'cardigan', color: 'purple', color2: 'pink' }, bottom: { kind: 'skirt', color: 'brown' }, shoes: 'brown', carry: 'cane', glasses: 'round' },
  cop: { top: { kind: 'uniform', color: 'navy', color2: 'gold' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'police', color: 'navy' }, glasses: 'sun' },
  swat: { build: 2, top: { kind: 'tactical', color: 'black' }, bottom: { kind: 'cargo', color: 'black' }, shoes: 'black', hat: { kind: 'helmet', color: 'black' }, gloves: 'black' },
  medic: { fem: true, hair: { style: 'pony', color: 1 }, top: { kind: 'uniform', color: 'green' }, bottom: { kind: 'pants', color: 'green' }, shoes: 'black', gloves: '#5a8ad8' },
  firefighter: { build: 2, top: { kind: 'coat', color: 'khaki', color2: 'yellow' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'black', shoeKind: 'boot', hat: { kind: 'hard', color: 'red' }, gloves: 'black' },
  syndicate: { top: { kind: 'vest', color: 'black', color2: 'white', pattern: 'quilt' }, bottom: { kind: 'track', color: 'black' }, shoes: 'purple', hat: { kind: 'cap', color: 'black' }, chain: true, bandana: 'purple', tattoo: true },
  enforcer: { build: 2, hair: { style: 'bald' }, top: { kind: 'puffer', color: 'purple', color2: 'white' }, bottom: { kind: 'track', color: 'black' }, shoes: 'purple', chain: true, glasses: 'sun' },
  robber: { top: { kind: 'hoodie', color: 'black' }, bottom: { kind: 'cargo', color: 'grey' }, shoes: 'black', hat: { kind: 'beanie', color: 'black' }, mask: true },
  driver: { top: { kind: 'leather', color: 'black', color2: 'red' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'red' } },
  bounty: { beard: 'short', top: { kind: 'coat', color: 'brown', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', shoeKind: 'boot', hat: { kind: 'fedora', color: 'brown' }, chain: true },
  clerk: { top: { kind: 'polo', color: 'green' }, bottom: { kind: 'pants', color: 'black' }, hat: { kind: 'cap', color: 'green' } },
  guard: { build: 2, top: { kind: 'tactical', color: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'cap', color: 'grey' } },
  inmate: { hair: { style: 'buzz', color: 0 }, top: { kind: 'scrubs', color: 'orange' }, bottom: { kind: 'pants', color: 'orange' }, shoes: 'white' },
  warden: { build: 2, top: { kind: 'uniform', color: 'grey', color2: 'gold' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'police', color: 'navy' } },
  cook: { top: { kind: 'apron', color: 'white', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black', hat: { kind: 'beanie', color: 'white' } },
  janitor: { top: { kind: 'overalls', color: 'navy', color2: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'brown', hat: { kind: 'cap', color: 'grey' } },
  lifter: { build: 2, body: { h: 1, w: 1.12, limb: 1.2, muscle: 1 }, hair: { style: 'buzz', color: 0 }, top: { kind: 'tank', color: 'grey' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'white' },
  boxer: { build: 0, hair: { style: 'short', color: 0 }, top: { kind: 'tank', color: 'white' }, bottom: { kind: 'shorts', color: 'red' }, shoes: 'black', hat: { kind: 'helmet', color: 'red' } },
  yogi: { fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'tank', color: 'black' }, bottom: { kind: 'leggings', color: 'black' }, shoes: 'white' },
  busker: { beard: 'short', top: { kind: 'jacket', color: 'brown', color2: 'khaki' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'fedora', color: 'brown' } },
  commuter: { top: { kind: 'hoodie', color: 'green' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white', back: 'backpack', backColor: 'brown' },
  courier: { fem: true, top: { kind: 'polo', color: 'pink' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'pink' }, back: 'backpack', backColor: 'pink', glasses: 'sun' },
  dockhand: { top: { kind: 'hivis', color: 'orange', color2: 'denim' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'hard', color: 'yellow' }, gloves: '#c8a050' },
  lifeguard: { hair: { style: 'short', color: 3 }, top: { kind: 'none' }, bottom: { kind: 'trunks', color: 'red' }, shoes: 'brown', shoeKind: 'sandal', glasses: 'sun' },
  swimmer: { fem: true, hair: { style: 'pony', color: 1 }, top: { kind: 'swimsuit', color: 'navy' }, bottom: { kind: 'bikini', color: 'navy' }, shoeKind: 'barefoot' },
  sunbather: { fem: true, hair: { style: 'long', color: 3 }, top: { kind: 'bikini', color: 'coral' }, bottom: { kind: 'bikini', color: 'coral' }, shoeKind: 'sandal', glasses: 'sun' },
  bather: { hair: { style: 'short', color: 0 }, top: { kind: 'none' }, bottom: { kind: 'towel', color: 'white' }, shoeKind: 'sandal' },
  spa: { fem: true, hair: { style: 'bun', color: 1 }, top: { kind: 'towel', color: 'cream' }, bottom: { kind: 'towel', color: 'cream' }, shoeKind: 'sandal' },
};
export function randomPerson(seed, kind = null) {
  const r = (k) => hash(seed, k, 97);
  const pick = (arr, k) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const fem = r(1) < 0.5;
  const app = {
    fem, seed: seed & 0xffff, skin: Math.floor(r(2) * 6), build: r(3) < 0.18 ? 2 : r(3) < 0.4 ? 0 : r(3) > 0.9 ? 3 : 1,
    hair: { style: fem ? pick(['long', 'wavy', 'pony', 'bun', 'braids', 'curly', 'short', 'bob'], 5) : pick(['spiky', 'short', 'buzz', 'afro', 'bald', 'curly', 'dreads', 'slick'], 5), color: Math.floor(r(6) * 6) },
    beard: !fem && r(18) < 0.25 ? pick(['short', 'full', 'stubble'], 19) : null,
    top: { kind: pick(['tee', 'tee', 'hoodie', 'polo', 'shirt', 'jacket', 'tank', 'flannel', 'leather'], 7), color: pick(PALET, 8), color2: pick(PALET, 9) },
    bottom: { kind: fem && r(10) < 0.25 ? 'skirt' : pick(['jeans', 'jeans', 'pants', 'cargo', 'shorts'], 10), color: pick(['denim', 'denim', 'black', 'khaki', 'navy', 'grey', 'brown'], 11) },
    shoes: pick(['white', 'white', 'black', 'brown', 'red'], 12),
    hat: r(13) < 0.2 ? { kind: pick(['cap', 'beanie', 'bucket'], 14), color: pick(PALET, 15) } : null,
    glasses: r(16) < 0.12 ? pick(['sun', 'round'], 17) : null,
    carry: r(20) < 0.15 ? pick(['bag', 'coffee', 'phone', 'shopping'], 21) : null,
  };
  if (kind === 'business') return randomPerson(seed, 'banker');
  if (kind === 'beach') return randomPerson(seed, r(30) < 0.5 ? 'surfer' : 'lifeguard');
  if (kind === 'thug') return randomPerson(seed, 'syndicate');
  if (kind && ARCHETYPES[kind]) {
    const a = ARCHETYPES[kind];
    Object.assign(app, { hat: null, glasses: null, carry: null }, a);
    if (a.fem === undefined && a.top && a.top.kind === 'none') app.fem = false;
    if (a.fem !== undefined && !a.hair) app.hair = { style: a.fem ? 'pony' : 'short', color: app.hair.color };
    if (!app.fem && !a.hair && ['long', 'wavy', 'pony', 'bun', 'braids', 'bob'].includes(app.hair.style)) app.hair = { style: 'short', color: app.hair.color };
    if (app.fem) app.beard = null;
  }
  return app;
}
