## 2026-10-30 - b8d: home upgrades, the firewood's uses, a proper fall, materials for crafting

The owner's notes 2 (10-24): "House upgrades, be able to add new rooms, new floors, basement, customize, expand garden,
decorate, etc. You can do this by gathering materials like wood or stone or other things across the world, or you can
purchase them with money outright. I dont think it needs to change the outside of the house but you can just expand the
inside ... For apartments I think you just pull up to the garage still and able to upgrade the interior with different
amenities or add-ons" - and of the trees: "Trees falling still has placeholder animation ... chop the whole tree up and
then it puts the wood into bundles ... deliver that somewhere that purchases wood, or is part of a job, or you can take
it to your home and driving up to the home's garage with the wood will give an option to store that wood there or put it
towards an upgrade to the home."

### What was there
b5c had already made the felled trunk stay, cut into rounds, each a Firewood crate (sold at hardware stores, more at a
sawmill; stacked at your garage as a count). The fall was drawn in canvas strokes. Homes had their plans, decorating
(H67), gardens (H61); nothing grew. No tent, cardboard-box or sewer homes exist yet (they're in DESIGN-NOTES as proposals),
so their few fitting upgrades wait for them - the catalogue takes a plan list per upgrade, ready for them.

### Home upgrades (shared/homeups.js, server/systems/homeups.js, rules-play.js HOME_UPS)
- **Your garage**: E by its door on foot, or stopped at the wheel, opens its menu: the materials kept there (firewood,
  stone, scrap metal - profile.homeMats, up to the garage's room: HOME_STORE), unload the bag's stone and scrap, take a
  bundle back out, and the upgrades. Firewood you bring (carried, or on the bed) gives the owner's choice: **stack it,
  or put it towards an upgrade**.
- **An upgrade's card**: what it is, what it takes (firewood/stone/metal and the builders' labour), what's in already;
  put in what you have (the garage's first, then the bag's), or pay for the rest - labour plus the missing materials at
  MAT_PRICE - and it's built at once. Bought outright = paying for all of it. Inside, the hall table lists them too.
- **Floors and a basement** (houses and mansions; a trailer gets a storm cellar): a level of its own up or down new
  stairs (`^`, in the hall / the great room / by the trailer's kitchen; furniture standing there goes back into
  storage). Each level is a hall with rooms along it (3 a house, 4 a mansion, 2 the cellar), the first fitted as built (a
  bedroom upstairs, a study on the third floor, a storeroom below); the rest are bare concrete behind a wall until you add
  a room: bedroom, bathroom, study, home gym, games room, home cinema, sunroom upstairs; workshop, wine cellar, storeroom,
  gym, games, cinema, bath below. The outside never changes. Decorate works on every level (decor keyed id@level).
- **Amenities** for every kind of home, apartments too: a fireplace (burns a bundle from the garage: everyone in the home
  heals while it burns - the page draws the flames and the glow), a hot tub (heals and refills stamina fast), a home bar
  (a glass: the wine's faster healing), an exercise bike (stamina skill, capped a day: skills 'bike'). Each goes into your
  furniture storage to place with Decorate; Act uses it where it stands.
- **More**: two (then two more) garden beds dug in the yard where there's room (gardening.js plotsOf - the first four
  are the same spots as ever), parking spaces (homes.garageCap), garage shelving; a storeroom and the basement keep more.
- **Sold**: the upgrades fetch half what they'd cost now, the materials kept there half their price; a world rebuilt
  under a home buys them back in full (homes.checkWorld).
- The plans are specs (plan~level~rooms) both sides lay out the same way (shared/homelayout.js layout); a home with
  nothing built is its plan's key as before.

### Materials, the crafting foundation
- **Building Stone** (new bag item, mat 'stone'): knocked loose with the ore from every vein you mine (more at the
  quarry's faces), sold at the hardware store. **Scrap metal**: Component Scrap and the caves' iron and copper ore count.
- The bag has a **Materials** category (client/bag.js; shared/items.js itemCat 'materials').
- **The workbench** (a workshop's, or one you place) makes furniture from the home's materials (HOME_CRAFTS: bookshelves,
  tables, chairs, a couch, pots, storage shelves, woodpiles...) into storage - recipes as data, for the crafting the bag
  will grow into.

### Firewood orders (server/systems/woodjob.js, WOODJOB)
"Or is part of a job": at a sawmill or lumber yard (Act: the job's card), the hardware store's counter or the phone's
Jobs, a diner, cafe, bar, hotel or camp wants 3-6 bundles: fell, cut, bring them (carried or on the bed) - $95 a bundle
(the mill pays $65), $160 for the lot. Two steps on the HUD: cut the wood, take it there.

### The fall (client/render/carryfx.js)
The falling tree is now the tree that stood there: the bake workers draw its own sprite (statics.js propSprite, worker
sprite kind 'prop'), lit for the time of day, and it tips over turned and drawn out along its fall, bounces, settles and
shakes; lying there only the uncut rounds are drawn, the crown till the last, each cut face showing. The classic view
(and the moment before the sprite arrives) keeps the strokes.

### Budgets
Bake: the worker's 'prop' sprite kind and propSprite (+0.2 KB) and the stone item (+0.25) took it to 906.9 of 906 -
trimmed back to 904.7 by dropping 56 long trailing comments in client/art2/game/statics.js (no code changed). Page
468.4 (shared/items.js, rules-base.js, rules-page.js's 'bike' skill line), renderer untouched. Everything new on the
page side loads lazily (homeview, homeart2, props-home, carryfx, jobcard, bag).

### Controls
README: four rows - your garage's menu, upgrading the home, the things inside (stairs, fire, tub, bar, bike,
workbench, shelves), a firewood order. All on Act (E / B / ACT).

### Tests
New: test/homeups.test.js (every room kind in every slot of every level walkable from the stairs, the ground floors with
their stairs as walkable as ever, the specs; the catalogue; the garage menu - firewood on the bed put towards the second
floor, stacked on foot, the bag unloaded, put in and paid for the rest - up and down the stairs, a room added, a parking
space, the sale; the fireplace, bar, hot tub, bike and the workbench; garden beds, stone from mining, a guest on the
stairs) and test/woodjob.test.js. Updated: felling (the garage's menu), homedecor (amenity pieces have no counter price),
hub (the bag's Materials category). Run with the home, felling, garden, lobby, real-estate, mining, bathhouse, arcade,
sound, HUD (hudlayout, touchslots, hub, hudinfo), jobs and perf tests: all pass.
