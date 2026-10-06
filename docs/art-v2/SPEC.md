# Art v2 spec

Every v2 asset follows these rules. The numbers were measured from the approved Round 1 targets (`targets/R1-A`, `R1-B`, `R1-C`, `R1-D`). The targets show the game at about 2 image pixels per world pixel.

## Projection
- **Oblique 3/4, the A Link to the Past projection.** Screen `x = X` and screen `y = Y - Z`, where X runs east, Y runs south and Z is height, all in world pixels. The ground is drawn 1:1, vertical surfaces are drawn at full height, and only south faces and tops are visible.
- **Depth:** larger `Y + Z` is nearer the camera. Sprites are drawn back to front by their base Y.
- **Positions don't change:** the server's top-down world coordinates are the ground plane, unchanged.

## Scale
- **1 art pixel = 1 world pixel ≈ 4.5 cm** (22 px per metre). A tile is 32 px.
- **People:** an adult is 38–42 px tall, about 3.5–4 heads, with big readable silhouettes. People are not shrunk next to buildings: a door (2.1 m) is about 46 px, and a person reaches about 85% of a door.
- **Vehicles:** a sedan is 100×48 px on the ground and its body about 30 px high. Every vehicle keeps its server footprint.
- **Buildings:** about 66 px per storey (3 m). A one-storey shop is about 70–80 px to the parapet; a three-storey walk-up about 200 px.
- **Trees:** street trees are 6–12 m (130–260 px) and palms 10–20 m (220–440 px). The targets show palms of 100–130 px; tall ones get the see-through cutaway when they cover the player.
- **Kerbs** are 3 px high, sidewalk slabs about 22 px, a lane 3.5 m (77 px).

## Roads and pavements
Widths are in world px (a sedan is 100 x 48) and live in `client/art2/road-spec.js`. That table moves to `shared/` when the world is rebuilt, so the road network and the art read the same numbers.

| Road | Width | Notes |
|---|---|---|
| Lane | 80 | about 1.7 car widths, close to a real 3.6 m lane, so cars can weave and pass |
| Alley or one-lane road | 96 | two cars wide, so you can still squeeze past |
| Two-lane street | 192 | 280 with parking on both sides |
| One-way street | 160 | two lanes |
| Avenue | 344 | four lanes and a 24 px median |
| Boulevard | 384 | four lanes round a planted median |
| Highway lane | 88 | |
| County road | 160 | |
| Dirt track | 120 | |

| Sidewalk | Width |
|---|---|
| Residential | 64 |
| Commercial | 96 |
| Downtown | 112 |
| Plaza edge | 128 or more |

Kerb returns at corners have a radius of about 22. The district kits are laid out in compact design coordinates and widened along their roads by a layout warp (`client/art2/warp.js`). Objects keep their size; only their positions move.

## Light
- **Sun direction:** the sun is from the upper left of the screen, in world terms from the west-north-west and a little toward the viewer. Shadows fall right and slightly down. South faces get some sun, with the most light on roofs and west faces.
- **Golden hour:** warm key light (#ffb46a range) and long shadows tinted blue-violet (#3a3a6e range).
- **Noon:** neutral white key, short shadows, sky-blue fill.
- **Night:**
  - Ambient deep indigo (#1b1d3a range).
  - Lamps sodium amber, windows warm with some cool exceptions, neon magenta, cyan and violet.
  - Bloom on every emissive source.
  - Wet streaky reflections in the rain.
- **Art carries colour and shape; the renderer adds light.** Each sprite is drawn as colour (albedo), normal, height and emissive maps. The renderer adds sun, ambient, cast shadows, point lights, bloom, grading, haze and rain.
- **Pixel look:** direct light is quantised to about 5 bands with a 4×4 ordered dither, so lighting itself looks hand-shaded.

## Drawing rules
- **Hue-shifted ramps** of 5–7 steps per material: darker steps shift toward blue-violet, lighter ones toward warm yellow. Palette: `client/art2/palette.js` (first measured pass in `palette-v0.json`).
- **Outlines:** characters, vehicles and props get a 1 px outline in a dark, hue-tinted tone of the neighbouring colour, never black. Inner lines are one ramp step darker. Ground, roads and roofs have no outlines.
- **Texture:** sparse ordered dither for texture, never smooth gradients in the albedo. Edges are hard, with no anti-aliasing.
- **Brands:** no real brands; signs show invented short names or icons.
- **Variety:** every generator takes a seed and has several variants per kind (species, sizes, materials, colours, wear) so streets never look tiled.

## Rendering budget (targets for the game)
- Sprites are generated once and cached in atlases. Vehicles are cached at 32 headings (64 on Ultra, 16 on Low and Xbox).
- **High and Ultra:** WebGL2 deferred light pass at native resolution.
- **Medium:** fewer shadow steps and no light banding.
- **Low:** Canvas2D with baked, flat-lit albedo.
