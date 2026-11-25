# The mountains' look: three variants for the owner's eye (2026-11-25)

The owner's note (PDF, with a picture of a crag in Granite Peaks): "Mountain areas can look better than this right? We
need to get some big rock structure and mountain side and cliffs and rocky terrain systems in because this doesnt look
good when we create these mountainous areas with a group of 4 similar shaped rocks stacked in a row ... water chunks
that blend into the mountainous area above and foothills below and just a better looking mountain cliff rocky area in
general and across the other mountain/cliff/rocky areas that are put together like this."

## What he saw, and why
The land has heights (shared/world3-relief.js): where open wild ground is steeper than 2.2 m a tile it becomes a band
of solid rock, and each run of up to eight tiles along a band's south edge gets a `cliff` piece. The piece was drawn
as a stepped lump (three tiers, a wedding cake), each on its own, and the solid rock behind it as flat cobbles at
ground level. So a cliff read as a row of similar lumps in front of a cobbled yard. 197 such pieces stand in Granite
Peaks; the desert's and the coasts' bands are built the same way.

## The variants (art only - what is solid does not change)
Picture: the crag at tiles 684, 588, game pixel, noon light - `report-38.png`.
- **A** - as it is.
- **B** - one cliff wall: each piece a sheer face half as tall again, its top the grey of the rock behind it, its
  clefts a tone deeper instead of a drawn line; the rock behind in big slabs, lighter, rising in ledges that follow
  the land's own contours (a bench every 4 m of height, its face where the ground falls toward you).
- **C** - B with snow lying on the benches above 150 m.

(Until his pick the code sat behind a switch only the picture tool set.)

## His pick (11-25 07:19): B, and no snow
"B for the mountain/cliffs is best, also were not doing snow yet so let's not do any snow for now." B is in: the
switch is gone (statics.js `cliffH` / `CRAG_TALL`, terrain.js style `crag`, ground.js `crag`, groundbake.js `LEDGE`);
C's snow is taken out; test/crags.test.js. There is no other snow: since 10-17 the ground above the snow line is
drawn as pale granite (the quarry's cut slabs) and scree - it reads as neither snow nor a summit; natural slabs for it
go with the summits' build.

## What a pick leads to (in this order)
1. The crags' look he picks, for every granite band (and tried on the desert's sandstone and the coasts' basalt).
2. Talus at a wall's foot: a scree apron and fallen blocks, so a wall does not stand on bare earth.
3. The summits (Cairn Peak, Eagle Knob, Windy Col) are flat ground with a cairn today: each a real knob of rock to
   climb - a world change (what is solid), so with the batched world rebuild.
4. The alpine ground between the crags: rock ribs and the same ledges wherever the land is steep, so a slope reads
   as a slope and not as a brown field.
5. Water in the mountains: the tarns and the falls set into the rock - a rock rim, a spill over a ledge, the stream
   below running out through the talus to the foothills.

## Done after the pick (11-25 08:30)
- **Talus** (item 2): south of rock that stands 3 m or more over the ground, the ground is pale broken stone for 54
  to 100 px, thinning out, the earth showing between, fallen stones strewn over it thickest by the wall
  (groundbake.js `talus`, `TALUS`). A flat slab in a meadow sheds nothing.
- **The open slopes** (item 4, a first step): the mountains' open ground (scree) shows the rock's ledges too where it
  is steeper than 0.4 m a tile, at under half strength (`LEDGE.rib`, `LEDGE.soft`).
- **Short runs**: a cliff piece under five tiles wide keeps its own height (half as tall again it stood like a pillar).

## The summits as knobs - BUILT 11-25 (his word, 09:03: "Build the summit from plans")
What stands (shared/world3-peaks.js `PEAKS3.knob`; the DEVLOG's entry of 11-25 has the numbers): a level shelf for the
cairn, the bench and the telescope; solid rock round it, raised 16 m; a straight foot on the south with a crag wall on
each half and stone steps in a cleft between them; the walked granite on the shelf and the steps; the Summit Trail
routed to the cleft. A summit is now chosen as a top of the land's own relief: Eagle Knob (358 m, the trail's, with the
telescope) and Windy Col (340 m) are; Cairn Peak stays on its spur at 106 m. Found on the way: the relief layer had
no room over 255 m (a quarter of Granite Peaks was flat to the art) - mended (mapcore.js `RELIEF`). Not built from the
plan below: the switchbacks (a straight cleft), the bench turned to the longest view. Pictures: `report-46`, `-47`, `-49`.

### The plan as written (for the record)
Today Cairn Peak, Eagle Knob and Windy Col are level ground with a cairn, a bench and (the highest) a telescope
(shared/world3-peaks.js `summits`): nothing says "top". Proposed, for the batched world rebuild:
1. **A knob of rock at each**: the relief raised 14-20 m over a round of about 14 tiles (the search's own `knob`
   radius), steep on three sides so the relief makes its cliff band there - the crag wall, the ledges and the talus
   above then draw themselves - and a ramp left on the side the Summit Trail arrives from.
2. **The trail climbs it**: the last 20-30 tiles of the Summit Trail routed up the ramp in two or three switchbacks,
   with stone steps where it is steepest (the `stairs` prop the cliffs' test already knows).
3. **The top**: a level shelf 6-8 tiles across for the cairn, the bench and the telescope, the bench facing the
   longest view; nothing planted on it.
4. **Checks**: every summit reached on foot from its trailhead (the trails' reachability test), nobody walks into
   drawn rock (test/cliffs.test.js), the telescope's and the bench's interactions still in reach.
Cost: a world change (the relief, three trails' ends), so the art re-bakes there; about half a day with its tests.
