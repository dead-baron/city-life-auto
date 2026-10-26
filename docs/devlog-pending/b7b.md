## 2026-10-25 - Batch 7b: Tier-4 businesses; two-sided stations

The owner asked to "first get in the features we've already got planned". These are two of them from the design doc's
tracker: "Tier-4 homes that are businesses" (10-06) and "two-sided stations" (queued since 10-07).

### Tier-4 properties: the businesses (server/systems/biz.js)
You buy a business the way you buy a home. Find it in the phone's real-estate app (a new **Businesses** chip, with a
waypoint to each), then buy it at its manager's office. Like a home, it is a place to wake up (on the death screen;
**Wake up here** in its menu) and a place to rest (**Rest in the back room** gives full health). Each in-game day you
are in the city, a day's takings go into its till. The till holds at most three days' worth, so you have a reason to go
back and collect. Each business also earns while you work it, and has upgrades and stock to buy. You can own up to three
(the food truck is not counted). Selling one gives back 60% of what you paid for it, upgrades included. Your businesses
show on the map with gold-rimmed icons and their names. Ownership is stored on the profile (`profile.biz`). If the world
changes and a business's place is gone, you get back what you paid for it, into your bank.
- **Farms:** the World v3 fields grouped into farms (fields close together count as one farm; the ten biggest are for
  sale), with the office by the nearest farmhouse.
  - Every row harvested on its fields pays into the till: $30, or $50 when you drive the tractor yourself. The NPC
    farmhands' tractors count too (hooked in farming.js finishRow).
  - Farmhands (3 levels) sell the crop: $35 a field per level per day.
  - A chicken coop, a pig pen and a dairy herd earn $110, $220 and $340 a day. Each eats a sack of feed a day.
- **Nightclubs:** every club (nightclubs.js). The office is a row in the bar's menu.
  - A night's takings depend on how popular the club is, its sound system and its bar (3 levels each). Without cases
    behind the bar, it takes half.
  - You get $15 cover for everyone the bouncer lets in, and half of what other players spend at the bar.
  - At night, **Take the decks**: the dance floor drops, and the dancers tip for 90 seconds (5-minute cooldown).
- **Criminal hideouts:** six plain buildings in the rough, industrial, poor and country ends of the world, at least
  4,000 px apart. They are laid out for sale by the server; nothing is added to the map.
  - The grow room (lamps, levels 0 to 3) makes $300 to $1,400 of product a day, using nutrients.
  - **Take the product** gives it to you as hot money (hotmoney.js: clean it as usual). Or **Run the product to a buyer**:
    a waypoint to a buyer at least 6,000 px away (another hideout, the fence, a smuggler's den, a pawn shop, a gang HQ)
    pays clean cash at 1.3x. If you are killed or cuffed on the way, the product is lost.
  - Syndicate soldiers (2, plus 1 for each **More guards** level, plus 1 if you are a member) stand at the door while
    someone is near. An outsider who comes into the yard is warned, then shot at after 3 seconds. Anyone who hurts the
    owner there is attacked. Your crewmates are left alone. If they are all killed, new guards come after 3 minutes.
  - Not for sale to someone wearing a badge.
- **Auto shops:** the Fresh Coat garage (its office is a row in the counter's menu) and every Spray & Go paint bay.
  - 3 customers' cars a day, plus 2 for each lift level. Each pays $70, plus $25 for each tools level, and uses a part.
  - You get 60% of what other drivers pay at that counter or bay. Your own respray and repairs there are free (hooked in
    economy.js and paint.js).
  - **Bring a customer's car in**: a damaged car is left on the lot. Stand by it for 8 seconds to fix it, for $220 plus
    the tools bonus.
- **Food truck:** bought at the dealership (a row in its menu), with your own Mr. Frosty van.
  - Take the van out, park it where people are, step out and open the hatch. Each sale is a meal at the menu's price
    ($8, $11 or $15), quicker with a crowd (up to 3x) and with a bigger grill.
  - People walk up to the hatch. The hatch comes down when you drive off or walk away. If the van is wrecked, a new one
    costs $1,500.
- **The numbers** are in `shared/rules-games.js` `BIZ`, not `shared/rules.js`. rules.js loads with every page and the
  page's budget is full; rules-games.js is where the casinos' and the drive-in's numbers already went.
- **Menus:** a business's menu is the page's ordinary menu with a negative poi (economy.js handleMenu hands it to
  biz.js). The page needed no new code for it. client/realestate.js (Businesses) and client/worldmap.js (the icons) both
  load lazily.

### Two-sided stations (shared/world3-rail.js stationFootbridges)
Every open-air World v3 main-line station already had a platform on each side of its double track (each direction's on
its outer side), with a footbridge between them drawn as a wooden plank on the ground. That footbridge is now one you
walk over:
- A steel span crosses above both tracks at deck height (lz 1). A stair flight on each platform runs along the platform,
  from its middle up to the span. They are part of the levels' people-only corridors, like the El's stairs, so the trains
  pass under anyone up there.
- The platform furniture (benches, canopies, lamps, the name sign) is kept off the flights.
- Passengers who get off on the platform away from the station house walk up and over the footbridge to it.
- On one platform, with the train in at the other, the prompt says so: "The train to X is in on the other platform - up
  the stairs and over the footbridge". At a flight's foot it reads "Up the footbridge - to the other platform".
- You can board a train from either platform.
- All 12 open-air stations have one. Midtown's El station already had its stair towers on both sides of Trestle Street.
- Known: in the art renderer, a train standing under the span is drawn over it rather than under it (the baked
  footbridge sorts by where it stands on the ground). Someone walking over it is drawn up on it as they should be.

Screenshots: the scratchpad's b7b-shots/ (the app's Businesses list, a hideout for sale, bought and guarded, a club's
bar with its office, the map's business icons; Metro Central's, Northshore's and Lucky Mesa's footbridges, and a player
up on one).

### Budgets
- The bake went from 905 to 906 KB (905.8 measured) for the footbridge's model (client/art2/props-road.js
  stationBridge), its stairs and the platform furniture kept off them (game/statics.js onFlight). I trimmed the new
  comments first.
- The renderer is unchanged (401).
- The page is still within 498 (498.2 measured): shared/levels.js now skips a level segment the page's window doesn't
  hold. The levels' grid is the whole world's, but a window holds only its own regions' segments. Just after a teleport,
  before the new window arrives, the grid pointed at a station's stairs the page didn't have yet and threw (the first
  capture run, in levelStep).
- Server-side code (biz.js and the hooks) and the lazily loaded realestate.js and worldmap.js cost the page nothing.

### Controls
No new controls: everything is on the action button and the menus. The README controls table is unchanged.

### Tests
- New:
  - test/biz.test.js (7 tests): every kind laid out, listed in the app, bought at its office, with its manager's menu,
    on the map and the death screen; the cap of three; selling. Each one earning: the day's takings, collecting them (the
    hideout's as hot money), the till's cap, short of stock. A farm's row harvested; a club's cover, its bar's cut and the
    DJ's tips; the auto shop's customer car fixed by hand, another driver's cut and your own repair free; the food truck
    selling to a crowd and shutting; the hideout's guards warning, then attacking an outsider, never the owner, and
    leaving when nobody is about; a business whose place is gone, refunded.
  - test/world3rail.test.js: two-sided stations. Every open-air station has a footbridge with a flight on each platform
    and a walkable span. A player boards on one platform; the other way's train comes in at the far platform and the
    prompt says so; the player walks up, across above the tracks and down onto the far platform, and boards there.
  - test/world3server.test.js: World v3's businesses. Every kind is there, the hideouts are spread out, and every office
    stands on open ground.
