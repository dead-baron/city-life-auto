## 2026-10-25 - Batch 6c: waves that swell and curl, doors that open, dressed-up facades, the world concepts' people

From the owner's notes, part 2 (pages 7 and 16, and two of the general notes).

**Surf** ("more natural looking waves for surfing, not just a straight line that disappears at the shoreline ... smaller
waves and bigger waves, have them swell and curl over"):
- **Sets of different sizes** (shared/surf.js). A set has three to five waves, building to the biggest in the middle.
  Each set has its own strength, so some sets are small and some are big. A wave's size runs from 0.45 to 1.6, and a
  bigger wave breaks further out (`brkOf`).
- **The crest is a curve, not a ruler line.** It bows back toward the ends of the beach and wanders in and out along its
  length (`crestD`), less so as it comes in. It also stands higher in some places than others (`heightAt`). The low
  sections (under 70 % of the wave's size: `gapAt`) show as gaps in the lip, and you can't catch the wave there.
- **Its life, as client/art2/game/surfart.js draws it:**
  - far out, a low swell (the light back, a faint face, no lip yet);
  - nearer its break line, the face darkens and stands up, the lip forms, and spray feathers off the highest sections;
  - just ahead of the break as it peels along, the lip throws forward over a dark tube;
  - behind the break, churning white water with an uneven front and foam lace trailing behind it;
  - a wave that reaches the beach unbroken breaks on it (a shorebreak);
  - at the sand, a thin uneven swash that runs up the beach in tongues and scallops (`runupAt`), slows, drains back and
    leaves the sand dark and wet for a moment. Where the water ends is found on the map, piece by piece, so the swash
    follows the real waterline.
  - Each piece is turned along the crest's own line. The pieces come in three sizes with four variants each, and they
    thin out toward their ends, so the pieces along a crest blend into one line instead of a row of blocks.
- **The server rides you on the same crest the page draws** (server/systems/surf.js and the follow scenes' surfer,
  cinefollow.js). You can't catch a wave in a gap in its lip. A wave in its swash can't be ridden. Your points scale
  with how high the crest stood where you caught it.

**Doors** ("better than a glowing square, can we create sliding doors or doors that open ... a bell ring when you walk
in?"):
- The doors on street fronts are now baked shut (client/art2/buildings.js `liveDoor`): sliding glass in a steel frame,
  or a painted door with a glass light, a brass knob and a kick plate. Before, they were baked open as a lit square.
- The chunk bakes record where each door is (statics.js `liveDoors`, the chunk's `live.doors`). The page opens each
  door as someone comes up to it and closes it behind them (client/art2/game/doorart.js, loaded the first time a door
  is in view). That someone can be you, another player or anyone in the city.
  - A sliding door's two leaves part into the wall.
  - A hinged door swings in, narrowing as it turns. A wide doorway has a pair of doors that part in the middle.
  - A sliding door's sensor sees anyone near it. A hinged door opens only for someone in line with it coming in or out,
    not for someone walking past along the pavement.
  - From inside a walk-in seen cut away, its doors aren't drawn.
- **The door is drawn at the doorway now** ("Some building entrances are still not put in correctly"). A hand-planned
  front (b.art.shop: 'left' / 'right') put a walk-in's door a tile or more away from the doorway you walk through, and
  so did the banks, whose doors sat in the middle of the front. Now the walk-in's own doorway decides. On World v3, 945
  of 958 walk-ins' doors are at their doorways; before, about 1 in 50 was. The other 13 are strip malls whose row of
  shops still shares one front.
- **Which slide and which swing** (shared/doors.js): sliding glass for the grocery, the gas station's mart, the
  pharmacy, the bank, the hospital, the police station, the sports and clothes shops, the lobbies, and the fronts that
  look like a mart. Hinged doors for the corner store, the pawn shop, the barber, the hardware store, bait and tackle,
  the fish market, the diners and cafes, the bars, the homes and the halls.
- **The bell** rings as anyone goes in or out of the small shops: the corner store, the pawn shop, the diner and the
  cafe, the barber, the hardware store, bait and tackle, the fish market, a bakery. The sound system already had a brass
  shop bell that rang for four of these (client/sound/places.js, from the walk-ins' doorways). It now uses
  shared/doors.js for which shops ring. A sliding door sighs open, and a hinged door without a bell clicks (the
  `housedoor` latch).
- **Doors never block anyone.** They are only a picture, and the doorway's tiles are the walk-in's floor as before.

**Facade dressing by the district** ("graffiti or street art or fire escape stairs or vines or things in the window or
balconies"). client/art2/facadedress.js is seeded by each building (its id and section), so the street looks the same
in every bake and browser. It never uses Math.random.
- `dressPlan` (statics.js, per street-facing section) uses more of what buildings.js already painted, where the district
  wants it:
  - fire escapes up most of the brick walk-ups (two floors and up);
  - balconies on the flats;
  - ivy and vines in the old town and the leafy streets;
  - tags in the rough districts, now and then in the low ones and the arts district (never over a shop's sign, never in
    the rich districts);
  - murals and tags on the blank side walls in the arts district, the rough streets, by the beach and the clubs.
- `dressFacade` (buildings.js, after the walls and windows) paints new pieces:
  - drainpipes down a corner;
  - striped canvas awnings over the windows (the beach, the rich streets, the old town);
  - window AC units, more of them in the rough and dense districts;
  - satellite dishes;
  - washing strung between windows;
  - geraniums and ferns in pots on the sills;
  - posters pasted on the ground floor (rough streets, the arts district, the clubs);
  - roller shutters pulled part or all the way down over the closed shops on the rough streets;
  - planters either side of a front door.
- **Things in the windows** (buildings.js `sash`): blinds half down, a plant on the inside sill, a cat, a lamp, a flag
  or a poster on the glass, and curtains drawn to one side or both.

**The world concepts' people** ("Have we added all the player and NPC human customizations for outfits that we can pull
from all of the concepts?"):
- **The audit.** The character sheets (CB1-5, CC1-10, CP1-4, SF/SM) were already covered in full (the devlog's
  2026-10-08/09 entries, 236 pieces). The world concepts (docs/art-v2/world-concepts/CATALOGUE.md) show people the
  wardrobe had nothing for:
  - lifeguards (on 26 of the beach concepts);
  - the tennis club's players;
  - mail carriers and delivery couriers;
  - the cooks and the diner's counter staff;
  - nurses;
  - cyclists;
  - anglers in the rivers;
  - weddings;
  - valets at the hotels;
  - gardeners.
  The owner's notes 2 also name the mailman.
- **Seventeen pieces added** (shared/lookcore.js, appended, so every old id is kept). Each is sold where it belongs and
  drawn at game size:
  - a tennis dress and a tennis skirt;
  - a cycling jersey and cycling shorts;
  - chest waders;
  - a postal shirt and a mail satchel;
  - chef whites and a diner's paper hat (the chef's toque was already there);
  - a striped poncho;
  - a lifeguard's whistle and a rescue tube;
  - a stethoscope;
  - a bow tie;
  - work gloves;
  - a courier's insulated delivery pack;
  - a bridal veil.

  New drawing in client/art2/people.js: the courier's box on the back, the bow tie at the collar, the paper hat's fold
  and the veil falling behind. The rest reuse shapes the renderer already draws.
- **Eleven new kinds of people walk the city** (server/systems/personas.js), dressed from these pieces:
  - lifeguards on the beaches;
  - mail carriers in the neighbourhoods by day;
  - couriers with their boxes downtown and in the nightlife, day and night;
  - cooks leaning on a wall on their break;
  - diner servers;
  - nurses near the civic center;
  - tennis players in the rich districts and the parks;
  - cyclists doing laps of the parks and the beachfront;
  - valets outside the towers and the clubs;
  - gardeners in the suburbs;
  - now and then a bride and groom (a pair: he in a tux and bow tie, she in the wedding dress and veil).

  Anglers sometimes wear chest waders and wellies. The debug dummies can wear the new looks
  (`{ t: 'dev', c: 'dummy', looks: 'new' | 'new2' }`).

**Budgets:**
- The renderer went from 400 to 402 KB (401.1 measured), for the new pieces' drawing (people.js) and their catalogue
  entries (lookcore.js): every figure is drawn from those two files.
- The bake went from 875 to 883 KB and 75 to 77 files (882.7 measured), for client/art2/facadedress.js and
  shared/doors.js, the doors baked shut, the window contents, and the same people pieces (the bake draws people in its
  scenes).
- The doors' and the waves' drawing load lazily (doorart.js, surfart.js) and cost neither budget.
- The page is unchanged (497.9 KB).

**Tests:**
- New:
  - test/doors.test.js: which slide and which swing; the bell on the right shops; a door opening for someone coming up
    and shutting behind them, and not opening for a passer-by; each opening step showing more of the doorway; baked
    shut.
  - test/doorsbake.test.js (builds the city): the bakes' door records at the walk-ins' doorways, none cut away; walking
    in through a doorway.
  - test/world3doors.test.js (builds World v3): every walk-in's door is drawn at its doorway (over 97%) and is of its
    trade's kind.
  - test/facades.test.js: deterministic and varied dressing; by the district; painted on the wall.
  - test/outfits.test.js: the new pieces appended and drawn; the new people wearing them.
  - test/surf.test.js, four more: small and big sets, a big wave breaking further out; the curved, broken crest that
    straightens; a wave through every stage to the swash and back; the server riding you on the drawn crest, and no
    catching it in a gap.
- Passing: surf, doors, doorsbake, world3doors, facades, outfits, sound, shoprooms, homeart, dmath, mapwindow, art2, look, wardrobe,
  peoplelook, doorways, npcpeople, passersby, view, director, gameplay, skate and ambience.
