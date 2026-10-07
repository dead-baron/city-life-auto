# World v2: the world rebuilt

The world is rebuilt from scratch with the new art and a new layout logic. The user's original world map
concept (the land mask, coastlines, islands and district placement the current generator reads) is the rough
reference, not a template: roads, blocks, lots, buildings, water, transit and special places are all laid out
again. The old world is archived as the branch `checkpoint-world-v1`.

**Shipping:** World v2 goes live as it is built, district by district. There is no switching between old and
new: each stage replaces part of the world on `main` and stays. Every push keeps the game playable and
`npm test` green.

## Decisions so far (user, 2026-10-05 / 06)
- **No perfect grids.** Streets vary: long blocks, short blocks, offsets, T-junctions, the occasional
  diagonal or curving boulevard, alleys behind long rows of buildings. Every district type has its own
  pattern (below).
- **Realistic layout:** a believable city that blends dense downtown, commercial strips, old town,
  apartments, rough districts, nightlife, industry and the port, suburbs at every income level, and then the
  country, farms, forests, desert, mountains, beaches and islands ("all the way out to the boonies").
- **Realistic sizes:** houses 10-15 m wide on real lots, shopfronts 6-12 m, downtown towers 20-40 m wide.
  (Scale: a person is 42 px, about 1.75 m, so 1 m is about 24 px; a lane is 80 px.)
- **Sidewalks:** 112 px downtown, 96 px commercial, 64 px residential, none (a shoulder) in the country.
- **Highways:** two lanes each way by default, especially in dense urban areas; three where on- and off-ramps
  merge or over longer stretches, then back to two. On- and off-ramps follow the real-road rules (below).
- **No old art anywhere,** not even as a fallback. The hand-painted downtown blocks and every painted lot are
  replaced by the art v2 generators.
- **Prison island** out in the open sea, far enough that a breakout means a long swim. Sharks are rare
  everywhere, likeliest round the prison, with fins seen now and then; bleeding in the water draws them.

## The camera constraint every layout must respect
The game is drawn in a 3/4 oblique view (screen y = Y - Z). A building shows its south face and its roof; its
north, east and west faces cannot be seen. So:
- On an east-west street, the north side shows shopfronts and doors; the south side shows the backs and roofs
  of buildings whose fronts face north. Those north-facing fronts get roof signs and pavement markers at their
  doors (as art v2 already does).
- Buildings are axis-aligned boxes. Along a diagonal or curving street they step along the curve.
- Plan districts so the important frontages (main streets, plazas, shops) face south where possible.

## Road hierarchy and cross-sections (`shared/roads.js` ROAD_KINDS, widths in px)
| Class | Lanes each way | Median | Sidewalk | Where |
|---|---|---|---|---|
| Highway | 2 (3 at merges / long runs) | Barrier or grass | none (shoulders) | Ring, cross-island, coast and country highways |
| Ramp | 1 (2 where it meets the street) | - | none | Interchanges |
| Major arterial / boulevard | 2 | 14+ (planted on boulevards) | by district | Between districts, bridges |
| Minor arterial / collector | 1 + turn lane or parking | - | by district | Through districts |
| Street | 1 | - | by district | Inside districts |
| Residential local | 1 | - | 64 | Suburbs, cul-de-sacs, loops |
| Alley | 1 shared, no sidewalk | - | - | Behind building rows downtown, old town, commercial |
| County road | 1 | - | shoulder | Country |
| Dirt track | 1 | - | - | Forest, farm, desert, beach access |
Plus parking lots, driveways, docks, and beach and park paths.

**Highway ramps and junctions** (user, 2026-10-05; previews `interchange` and `highwayFlat` in
`tools/art2/district-preview.html`):
- **Off-ramps:** a deceleration lane peels off the outer lane along a long taper, bends away in a gentle curve
  while it eases down the embankment, levels out, and only then meets the street, square-on at a signal or
  stop line well clear of the bridge. It never ends in the middle of a street.
- **On-ramps:** the mirror image: a level start, an eased climb through a smooth curve, then an acceleration
  lane that tapers into the outer lane.
- At-grade highways (country, desert) use the same tapers and curves on flat ground.
- Interchanges: diamond by default; partial cloverleaf or cloverleaf for big junctions; trumpet where a highway
  ends. Ramps are at least one full lane plus shoulders.

## District patterns
- **Downtown:** an irregular grid. Block lengths vary (about 120 to 260 m), a few streets jog or end in T's,
  one or two diagonal or curving boulevards, plazas, towers, long building rows with service alleys behind.
  112 px sidewalks. Subway entrances on the plazas.
- **Midtown / commercial:** main streets lined with continuous shopfronts (long rows, varied widths and
  heights), side streets, alleys behind. 96 px sidewalks. Strip malls with parking out on the edges.
- **Old town:** organic, narrow, irregular streets, small squares, cobbles, narrow lots.
- **Apartments / rough districts (low income):** dense walk-ups and row housing, small lots, alleys, corner
  stores, chain-link, vacant lots, the shanty edges.
- **Nightlife / red light:** a strip with neon frontages, clubs, bars, back alleys.
- **Suburbs (middle income):** curvilinear streets, loops and lollipop cul-de-sacs, houses on real lots with
  driveways, garages and yards, a commercial strip on the arterial.
- **Luxury (high income):** large lots on winding roads, hillside and waterfront estates, gated communities
  (open gates), private docks.
- **Industrial / port:** big parcels on a coarse grid, warehouses, yards, rail spurs, docks, cranes.
- **Country:** county roads following the terrain, farms with field patterns, small towns at crossroads,
  forest and mountain roads, desert highways, beach access tracks.

## Nature is designed, not scattered (user, 2026-10-06)
Today's wild areas are open ground with small rocks scattered at random: hard to see, easy to crash into, and
big stretches with nothing in them. The country stage lays nature out like the city:
1. **Skeleton first.** County roads follow the terrain; dirt tracks and hiking trails branch off them. All of
   them are kept clear of anything solid.
2. **Destinations along them,** so there is always something ahead: trailheads with car parks and map boards,
   campsites with fire pits, lookouts, lakes and creeks with footbridges, cabins, ranches, ruins, waterfalls and
   fire towers.
3. **Set pieces,** not single props. Each is a small composed scene authored once as a recipe and placed many
   times with variation by biome (species, rock type, mirroring, seed): a big rock outcrop with a pine and
   wildflowers round it, a fallen log in ferns, a creek crossing with stepping stones, a grove, a desert wash with
   boulders and palo verde, a cliff edge with a view.
4. **Ground cover between them:** living grass, wheat and flowers (they sway in the wind and bend as you drive
   through), plus big landmarks you can see from a distance. Open land stays open only on purpose (fields,
   prairie), and even then it has fences, hay bales, a windmill or a lone tree.
5. **Rules:**
   - Anything solid is big and easy to read: car-sized and up, tall, casting a clear shadow.
   - Small stones are ground detail you drive over.
   - Nothing solid stands near a road, track or trail.
   - No stretch of a route goes much more than about 100 m without a feature.
6. **Concepts:** the user's nature concepts (N1-N10, E2, E3a-f, the biome scenes) and the new prompts in the
   prompt pack ("Nature areas": NA1 layouts, NS1 set pieces, NR1 big rocks, NT1 trails), area by area.

## Water (procedural; `client/art2/rivergen.js` has the art-side generator)
Rivers traced downhill over the height map by flow accumulation, widening as they collect water, meandering in
flat country, with creeks, lakes, rapids where the slope steepens and waterfalls at cliffs. Bridges where roads
cross rivers, culverts and small bridges for creeks, fords on dirt roads. Deterministic in shared code so the
server (swimming, boats, current) and every client agree.

## Transit
- **Rail:** surface lines with stations that development clusters round.
- **Subway:** lines under the dense districts, walkable stations reached by stairs from plazas and sidewalks.
- **Ferries:** terminals linking the main island to the other islands.
- **Buses:** routes along arterials with stops; NPC riders; players can ride, drive or steal the bus.
- **Taxis and the rideshare app** (see `docs/DESIGN-NOTES.md`).
- **Live transit map:** routes and the vehicles on them shown on the big map.

## Special places to keep or add
Hospitals and clinics spread evenly (respawn points), police stations, the airport, quarry, raceway, marina,
docks, beaches and tidepools, campsites and campfires, parks and gardens, pools and bathhouses, gyms, farms,
the prison island, gang hideouts, and every player property type in `docs/DESIGN-NOTES.md` (all tiers, each
with vehicle access, a bed and a place to cook; waterfront ones with a dock and boat storage).

## Stages (each one goes live)
0. **Groundwork:** a world version in shared code. Profiles store it, and on a change homes and garages from the
   old world are released, so no one ends up owning the wrong house. The road spec gets its new
   cross-sections (sidewalk classes, lane counts).
1. **Metro City core:** downtown, midtown and old town re-laid (non-grid, alleys, real lot sizes); the
   hand-painted blocks go; highway through the core with real ramps.
2. **Residential belts:** apartments, rough districts, suburbs, luxury hills, Southbank.
3. **Industry, port, harbor, airport.**
4. **Country:** farms, forest, desert, mountains, small towns, rivers, creeks and waterfalls.
5. **Islands:** the other islands, ferries, the prison island and sharks.
6. **Transit:** subway lines and stations, buses, the live transit map.
7. **Properties:** every home and business tier placed across the world.

## Testing a stage
- `npm test` (the tour test checks that every place type still exists and every tour stop resolves).
- Top-down previews of the whole map and of each changed district (before / after) from a node script, so the
  layout can be judged without the browser.
- Headless playtests with `tools/playtest.py` (drive the new streets and ramps; walk the sidewalks).

## Progress
- **Stage 0 (done, 2026-10-06):** `WORLD_VERSION` in `shared/constants.js` (1 until something moves), stored on profiles as `wv`; a
  profile from an older world has its homes bought back (deeds from now on, `server/systems/legacy-homes.js`
  for the original world), its respawn home and saved spot cleared, cars and stash kept
  (`server/systems/homes.js` `checkWorld`). `ROAD_KINDS[...].walk` + `SIDEWALK` / `sidewalkPx` in
  `shared/roads.js`: pavements 112 / 96 / 64 px by district class, none on alleys, highways, ramps, county roads
  and tracks; every ground edge carries its `walk` (map) and the art v2 ground bake draws it (the district classes
  switched on with stage 1; stage 0 left the world unchanged). Highway lane
  counts are unchanged so far (3 each way on the ring): the deck art and levels depend on them, they change with
  the highway stage. Previews: `tools/world2/preview.mjs` -> `docs/world-v2/`.
- **Stage 1 (done, 2026-10-06):** Metro City's streets come from `shared/metro.js` (avenues + Broadway kept as
  the skeleton, `PATTERNS` per district between them: varied block depths and lengths, staggered side streets with
  jogs and T-junctions, service alleys behind the rows, plazas, Old Town's wandering lanes); the central island and
  Southside are filled with real-sized lots (`LOT`, `v2Block`, `fillRowV2` in `shared/map.js`); pavements by
  district class are on everywhere; the hand-painted blocks are gone; `WORLD_VERSION` 2. Block sizes are the low
  end of the spec (50-130 m): the island is ~650 m across, at 120-260 m Downtown would be two or three blocks.
  Fronts face south; the north half of a block backs onto its alley (plain `back` buildings, no doors shown).
  Junctions along a street are one crossroads or at least 14 tiles apart (`MINSEP` in `metroRoads`), Broadway
  goes through the avenue crossings it meets (three big squares), and of two signalled junctions closer than a
  car length the smaller gives way (`SIGNAL_GAP` in `shared/roads.js`): traffic flows downtown again.
  Still to do in the core: the highway through the core with real ramps (the ring keeps its slip ramps, 3 lanes
  each way), roof signs / door markers for north-facing fronts (renderer), more homes in Metro City (stage 7).
  Rule for every later stage: lay new streets so that junctions keep the same spacing (the ring's frontage
  roads and the crescents in Bayside Heights still meet some streets a few metres apart; their lights are
  merged by `SIGNAL_GAP` but the geometry wants redoing with the highway stage).
  Big businesses whose district is too narrow name a second home (`alt` in `SPECIALS`): the Westside Clinic
  sits in Midtown, Portside Logistics in The Yards or Southside. Known gaps for stage 2: Pine Hills keeps its
  old plan and has no home for sale (one in the original world); Metro City has few homes (Southside 13, a
  handful elsewhere; 116 world-wide against 125 in the original world).
- **Stage 1b (done, 2026-10-06): the highway.**
  - **Lanes:** two each way, 81 px each (`ROAD_KINDS.hwy`: 11 tiles with a 28 px median), on the ring and on the
    island highways. Where a ramp joins or leaves, its acceleration or deceleration lane runs alongside the deck as
    a third lane.
  - **Diamond interchanges** where the ring crosses an avenue (`citylayout.js` `diamondRamp`, `map.js`
    `layoutRoads`). They sit at 4 avenues (Bay, Central x2, Northbridge); 2 of them have ramps on one side only,
    where the sea or the river leaves no room on the outer side.
  - **Off-ramps:** a 350 px taper off the outer lane, 300 px alongside the deck, an eased descent over ~800 px
    (`zr`: level before and after the climb), a 450 px level run-out, then the avenue at the ramps' own junction,
    320 px out from the ring's centre line. It is signalled, or a stop line where the frontage road's junction is
    too close.
  - **On-ramps:** the mirror image. A slanted crossing leans its run-out toward the ring, never under 45 degrees
    to the avenue.
  - **Ramp checks:** no ramp foot stands in the water or crosses another street.
  - **The old slip ramps onto the frontage roads are gone;** the frontage roads stay as one-way streets.
  - **Traffic:** a car heading for an off-ramp drifts over to the outer lane along the way (`traffic.js`
    `laneChangePath`). A ramp's foot is an ordinary junction, so you can turn either way onto the avenue or go
    straight on to the other ramp. Queued cars keep a gap that varies per driver.
  - **The deck stands 88 px up** (was 44), so trucks, buses and trains pass under it without showing through.
  - **`WORLD_VERSION` 4.**
  - **Still open:** a third lane over long stretches between interchanges (needs lane drops in the traffic AI)
    and partial cloverleafs for the biggest crossings.
