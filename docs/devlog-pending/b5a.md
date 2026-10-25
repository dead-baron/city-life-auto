## 2026-10-24 - b5a: how things are drawn - see-through buildings, the tank's turret, lake glints, wet and foggy weather, standing wheat

The owner's notes, part 2: five drawing fixes.

### See-through buildings (client/art2/game/host.js `_fades`, engine.js STATIC_FS)
"Make the circle around the player much bigger (so it shows an entire vehicle) and have the building slightly more
transparent. Have it ease in and out of transparency. And feather the border."
- **A bigger clear space**: 64 px round you on foot (40 before); in a vehicle half its length + 34 px, up to 130 px
  (a car about 84, a tanker 114; 66 before for every vehicle). Which buildings fade is worked out from the whole
  vehicle too (half its length either side), so the building over a car's bonnet fades, not only the one over its
  driver. Getting in or out, the space grows or shrinks smoothly (eased over a quarter second or so), not in a jump.
- **More see-through**: the ghost shows 60 % of the street behind it (45 % before); a tall thin one (a mast's hut, a
  tree) 30 % (20 %).
- **Eased in and out**: each building's fade runs linearly over `FADE_IN` 0.35 s in and `FADE_OUT` 0.5 s out and is
  drawn through a smoothstep, so it starts and stops gently (it was an exponential that snapped in at the start).
- **Feathered**: the clear space's soft edge is 65 % of its radius (45 %), and the band where whoever is behind the
  building starts drawing over it is dithered over a wide stretch of the clear space (`CLR_SWAP` 0.3 + up to
  `CLR_SWAP_W` 0.55 of it), not a narrow ring - the hole fades into the ghost instead of showing a rim.

### The tank's turret drawn see-through ("the tank top is looking invisible")
The turret is a sprite of its own over the hull. Your own vehicle is outlined where something taller hides it (the
x-ray silhouettes), and the turret, standing taller than the hull, counted as hiding it: the hull's pale blue outline
was drawn over the whole turret. The x-ray now takes a height (`o.xrayTop`, engine.js): only something taller than
that hides the sprite. The hull is drawn with the turret's top (47 px), so the turret no longer counts, while a
building in front of the tank still outlines it.

### Lakes ("water fx is super bugged still")
Reproduced on a big lake in the wind: a regular lattice of glints over the whole lake, lined up into diagonal bands
(the herringbone in the owner's shot) as the wind turns. Lakes and ponds took the three straight swells crossing at
fixed angles that the sea was cured of on 10-23; their glints were never bent or broken up. Now inland still water
does as the sea does - a slow noise bends the swells' crests out of line, the sun catches them only in drifting
patches - and on top only the odd pixel twinkles (a per-art-pixel hash changing three times a second), so a lake
glitters here and there instead of wearing a pattern (client/art2/game/lightgame.js waterSurf).

### Rain, wet streets and fog (lightgame.js)
"A very greyed out surface and very reflective". The wet look darkened every ground texel by 30 % and laid the
sky's grey over all of it, and every bit of ground mirrored what stood on it - the forest floor and the grass came
out a grey mirror.
- **By surface**: how much a wet surface shines goes by how grey it is (`hardOf`: asphalt and paving shine; grass,
  earth, crops, sand and brick hardly). Grass and earth darken a little (to 84 %) and their colour deepens (+30 %
  saturation); paving darkens to 66 % and takes the sky's sheen.
- **Puddles**: patches on the world (`puddle`, value noise repeating over the 8192 px wrap) where paving darkens a
  little more and the sky and the lamps shine in it most; the mirror reflection is strongest there and a fifth of
  that elsewhere on paving.
- **The rain preset** keeps colour and contrast (saturation 0.92 -> 1.04, contrast 1.04 -> 1.1, haze 0.1 -> 0.05,
  sky sheen 0.45 -> 0.35).
- **Fog**: thinner round you and thicker and darker toward the view's edges (the screen position's distance from
  the middle), its base veil thinner (0.1 -> 0.05) so the clear ground between the banks keeps its contrast; the fog
  presets no longer wash the colour out (saturation 0.9 -> 1.0-1.02, contrast 0.95 -> 1.04, lift a third), and the
  day fog is a little less pink.

### Standing wheat that parts and lies flat
"Still not seeing wheatfields or crops of grass or vegetation" - the field's clumps stood 3 px apart in rows 5 px
apart, the same height everywhere, over a bright ground: a golden carpet, read as a flat texture.
- **Clumps** (client/art2/ground.js coverSprite 'wheat'): 4-5 stalks 2 px wide and 2 px apart fanning out from the
  root, the stems dark near the ground, a 5 px golden ear on each brightening to its tip; 10-12 px tall, 13-15 in the
  tall variants. Laid 6 px apart in rows 8 px apart (groundbake.js crops), so each row's ears stand over the stems of
  the row behind: the field reads as rows of standing wheat, bright ears over dark stems, instead of a speckled
  carpet. In patches (a 90 px noise) the wheat stands a head taller, so the field undulates and the gusts roll over
  something with depth. The ground under the crop is a step darker.
- **Parting round you** (engine.js STATIC_FS `uPush`, host.js `_push`): you and up to three people near you push the
  grass and the crops aside - ground cover within 22 px of you (20 of someone else, a vehicle's half width + 16) leans
  away by its tips and is bent over into a darker hollow round you; trees never. Medium and up (Low has no leaning).
- **Lying flat where you went**: the flattened swaths and trodden tracks (render/fx.js crush, since 10-21) were drawn
  at the ground's height, under the standing stalks, so they barely showed. They now lie over the crop
  (`zt` 18 px, as farmart.js CROP_Z), so a track through the wheat shows until it stands back up.
- Cost: the bake code 874.6 KB of 875 (a third as many clumps are stamped, so the bake is no slower).

Renderer code: held at 400 KB - the new code's room came from condensing comments in engine.js, host.js and
lightgame.js (the memory and cost notes, the sway and fog notes, the bake planning notes).

Tests: test/seethrough.test.js (eased in and out with a smoothstep; the clear space round a car and a tanker, the
building over the bonnet, shrinking smoothly when you get out; no hard edge - no step over 4 px larger than 0.06);
test/wind.test.js (a push leans ground cover away, never a crown or bare ground).
