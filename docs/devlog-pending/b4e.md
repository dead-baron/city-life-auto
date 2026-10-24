## 2026-10-24 - Batch 4e: better horses, new cars and boats, more helicopter and plane looks

### The horse (the owner: "Horse animations could be better, can we make the horses look better and have better animation?")
The horse was the four-legged rig every animal shares, given a long neck: a sausage of a body, straight legs swinging
from the hip, two gaits (a 4-frame walk and a 4-frame run), and the saddle 10 px behind where the game sits the rider.
- client/art2/horse.js (new): a model of its own. The body is the chest and shoulder, the barrel and the hindquarters
  blended into one (the withers, the dip of the back, the round of the croup); the neck rises deep at its base to the
  poll; the head is long and angled down (the jowl, the eyes, the nostrils, the ears up, the forelock); the mane falls
  down one side of the neck in locks; the tail hangs from its dock. Each leg has its joints: the forearm to the knee
  and the gaskin to the point of the hock (two-bone IK to where the foot is), the cannon, the fetlock, the pastern
  folding back as the foot comes through, the hoof.
- Eight coats (was six) with markings: chestnut (a blaze, white hind socks), bay (black points, a star), black (a star,
  a sock), dapple grey, palomino (a blaze, white fore socks), paint (patches, four stockings), dun (black points, the
  dorsal stripe, a snip) and appaloosa (the spotted blanket, a stripe). The farms' horses and the co-op's come in all
  eight (server/systems/horses.js COATS, COAT_NAMES; wildlife.js; entities.js).
- Real gaits, each foot on its own beat (horse.js GAITS): the walk (four beats, 8 frames, the head nodding twice a
  stride), the trot (the diagonals together, a moment of suspension), the canter (three beats, the body rocking, the
  head with it) and the gallop (four beats, the body stretched out, the head lower and forward, a moment with no foot
  down) - 6 frames each. The body bobs with how much weight the feet carry; the tail swings, lifts and streams the
  faster it goes and the mane lifts at the gallop. Standing, it rests a hind leg on its toe, swishes its tail, flicks an
  ear and drops its head a little; grazing, its muzzle is in the grass and a foreleg forward. It also rears, falls,
  lies dead on its side, wades and swims.
- The gait is picked by the speed (client/art2/game/actors.js horseGait): the walk from 6 px/s, the trot from 66, the
  canter from 172 (the horse's own pace is HORSE.canter of its top speed: 273), the gallop from 300 - 8 px/s past an
  edge to change up and below it to change down, so it never flickers. The legs' cycle runs by the ground covered
  (a stride a cycle: 42 px at the walk to 150 at the gallop - host.js _horse), and the rider rises and falls with the
  gait (twice a stride at the walk and the trot).
- The saddle sits at the model's middle, where the game puts the rider (the def's seat): the saddle cloth, the saddle
  (the seat at 37-38 px, the people's 'saddle' pose height), the cantle, the horn, the fenders and stirrups, the girth,
  the bridle, the bit and the reins to the horn.
- The classic view keeps its simpler horse (the farm animal's sprite, walking or running by speed).

### New cars and boats (the owner: "Add more vehicle and boat types")
shared/vehicles.js: seven cars and five boats, each with its stats, seats, crate slots (the open beds and decks carry
more: the 4x4's tub 2, the pontoon's and the trawler's decks 4) and a classic-view stand-in (sprite).
- The Riviera Convertible (a fifties droptop: the open cockpit, cream benches, the folded top, tail fins, the chrome
  spear, whitewalls), the Bajito Lowrider (long and slammed on gold or chrome wire wheels, pinstripes, flames on some,
  a continental kit on others), the Stallion 440 muscle car (fastback, hood scoop, ducktail, racing stripes), the
  Zipper GTi hot hatch (roof spoiler, sill stripe, twin pipes), the Trailcat 4x4 (open top, roll bar, buckets and a
  bench, the spare on the back, round lamps, a slotted grille; rough 0.35: at home off the road), the Haul-Away Moving
  Van (a cab-over box van in the firm's colour, the loft over the cab, the arrow down the side, the roll-up door) and
  the Mr. Frosty Ice Cream Van (pastel and white, a striped roof, the serving hatch lit under its awning, the menu, a
  giant cone on the roof).
- The Gull 26 Sailboat (the sloop's mainsail set on its boom, the jib, the cabin trunk, the cockpit and tiller), the
  Sunday Pontoon (two aluminium tubes, a carpeted deck, the fence, couches, the bimini, the helm), the Fishing Trawler
  (a deep hull, the wheelhouse, the outrigger booms, the net drum and the gantry, fish boxes), the Seaview 32 Cruiser
  (the cabin, the flybridge and its radar arch, the cockpit, the swim platform) and the Sport RIB (the rescue boat's
  hull without its kit, its tubes in its paint). Riders show at their seats in the open boats (crew).
- Where they turn up (server/systems/traffic.js): the town's traffic and parked cars take a district's own on top of
  the mix (DISTRICT_MIX: convertibles, 4x4s and ice-cream vans by the beach, lowriders and muscle cars on the south side
  and the strips, hot hatches and moving vans among the homes and flats, the ice-cream van by the park, moving vans in
  the industrial districts and the harbour - not in the busy centre, where one long van in the kerb bays and the
  junctions tipped Midtown into a jam in test/calmstreets.test.js), the country's roads the 4x4s (COUNTRY_MIX). The boaters take the new boats
  out (boats.js MODELS) - on big water only, as all of them. At the marinas, two berths in five of a speedboat or a
  dinghy take one of the new boats (marinaModel: the trawlers at the harbours), only on big water and only where the
  bigger hull clears the pier.
- Sold at the dealership (the cars) and the marina (the boats); the sea rental docks hire the RIB, the pontoon and the
  sailboat too (shared/rules.js BOAT_RENTAL_PRICE); the dealers' lots stock the cars; the debug menu spawns each.
- The engines' sounds (client/sound/vehicles.js ENGINE_CLASS): the V8s for the convertible, the lowrider and the muscle
  car; the sailboat under sail is quiet.

### More helicopter and plane looks (the owner: "Add more helicopter and plane looks")
- New models (client/art2/aircraft.js, render/aircraft.js for the classic view): the Channel 7 SkyCam (the news crew's
  own: deep blue and gold, the camera turret under the nose, the dish on the roof, the mast) - the news flights over a
  chase fly it now (airtraffic.js); the Mercy Air Ambulance (white with a green band, the blue star of life on its
  doors, its beacon on a call) - waiting on the hospital's pad (aircraft.js); and the Otter Floatplane on its floats,
  moored off a few marinas on big water (aircraft.js seaplaneSpots) - it floats (no sinking, no ditching: def.floats),
  and takes off and lands on the water (it lifts off at 320 px/s, under what the water lets it roll at).
- Liveries by the variant (LIVERIES): the Skylark (the private and charter helicopter - no longer dressed as the news
  one) in five, the Larkspur light plane in five, the floatplane in three. The rescue helicopter keeps its SAR look; the
  police, the gunship and the crop duster theirs.

### Loading and the budgets
The new models load when first needed, out of the startup code (the renderer was at 400 of 400 KB and a bake worker at
856 of 860): client/art2/fleet.js (the cars' and boats' models, which add themselves to vehicles.js's tables) and
client/art2/horse.js. The page's host loads the fleet the first time one is seen (until then it draws a stand-in under
the stand-in's own key); the workers are told where both are (pool.js init) and load them the first time a sprite wants
them (actors.js needsArt) - like the aircraft's art. Comments trimmed in shared/vehicles.js and client/art2/vehicles.js to
make room for the new types' entries and the hooks. Measured after: the page 497.3 KB of 498 (was 497.9), the renderer
400.2 of 400 (was 400.0), a bake worker 855.8 of 860 (was 856.3), its files 73 of 73 - no budget raised.

Tests: test/fleet.test.js (the new types, their models and states, the liveries, crate slots, sold and hired, kept out
of the startup code; the horse's coats, its gait by speed with the margin at each edge, every frame its own, the
gallop's moment in the air, the saddle's height), test/world3fleet.test.js (World v3: every new car on some road and
at some kerb, the new boats only on big water, the floatplanes' moorings and one floating, the air ambulance's pad).
Pictures: tools/art2/model-shot.mjs (new: a model's sprites at headings or a pose's frames, lit, to a PNG);
tools/art2/horse-preview.html shows the new horse.
