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

The code is in the tree behind a switch that only the picture tool sets (`globalThis.__CRAG`, tools/nature/darkscan.mjs
`CRAG=1|2|3`): the game draws A until he picks.

## What a pick leads to (in this order)
1. The crags' look he picks, for every granite band (and tried on the desert's sandstone and the coasts' basalt).
2. Talus at a wall's foot: a scree apron and fallen blocks, so a wall does not stand on bare earth.
3. The summits (Cairn Peak, Eagle Knob, Windy Col) are flat ground with a cairn today: each a real knob of rock to
   climb - a world change (what is solid), so with the batched world rebuild.
4. The alpine ground between the crags: rock ribs and the same ledges wherever the land is steep, so a slope reads
   as a slope and not as a brown field.
5. Water in the mountains: the tarns and the falls set into the rock - a rock rim, a spill over a ledge, the stream
   below running out through the talus to the foothills.
