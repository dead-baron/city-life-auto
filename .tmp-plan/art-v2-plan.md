# Art v2: full visual overhaul plan

Goal: every asset rebuilt from scratch in one style. That style is 16-bit SNES-era pixel art with modern dynamic lighting and atmosphere, taking heavy inspiration from Eastward and Octopath Traveler 1 and 2, with the GTA attitude. The world layout, game systems and server stay as they are. Status: approved 2026-10-05. Decisions: vehicles move to the 3/4 view (voxel models rendered at 32 to 64 angles); code generators are the backbone, with the user's ChatGPT style frames as targets (prompt pack: the "City Life Auto - Concept Art Prompt Pack" doc, 57 images, Round 1 hero frame first); v2 is built behind `?art=2` on the live game. PixelLab is optional and deferred until after Round 1. Camera: high top-down (about 30 degrees from vertical) like GTA 1 and 2; Eastward and Octopath I and II are references for art, lighting and atmosphere only.

**Checkpoint:** the current build is saved as the branch `checkpoint/art-v1` on GitHub, at commit 42420e0. The older pre-3/4 build is at `checkpoint-pre-art-overhaul`.

## Why it looks mixed today
1. **Four art sources:**
   - Painted concept sheets upscaled with Real-ESRGAN, which look painterly rather than pixel art: building lots, blocks, scenes.
   - Top-down concept-sheet props and vehicles.
   - Code-drawn 3/4 characters on a 32x44 grid.
   - The new procedural vegetation at 2 art px per world px.
2. **Two camera angles:** roofs, props and vehicles are straight top-down, while people and facades are 3/4.
3. **Different pixel sizes** from layer to layer.
4. **Lighting can't follow shapes:** it's a screen-space overlay on Canvas2D, so it can't light the shape of the art.

## Target look
- **Eastward** is the closest match for our camera: a 3/4 top-down pixel world with dense, lived-in towns and rich lighting.
- **Octopath (HD-2D)** contributes the lighting and atmosphere: per-pixel lit sprites, bloom, light shafts, depth haze and soft focus, and cinematic colour grading. HD-2D uses real 3D geometry; we fake it with a normal map and a height map for every sprite.
- **GTA:** dense districts, fictional brands, grit versus glamour.

## Pipeline: the art compiler
- **A style bible written as code** (`shared/art/`):
  - Camera: one 3/4 oblique projection for everything.
  - One pixel size everywhere.
  - A master palette with district and material ramps.
  - Light direction, outline and dither rules, and animation timing.
- **Generators:** characters, animals, vehicles, buildings and interiors, ground and roads, props, and vegetation (re-tuned to the spec).
- **Every generator outputs four maps:** colour, normal, height and emissive. Code-drawn art knows its own 3D shape, so it gets the normal and height maps for free; that is what makes HD-2D-style lighting possible.
- **Renderer:** a WebGL2 sprite batcher with deferred lighting covering the sun, point lights, height-map shadows, bloom, fog and colour grading. The Low preset keeps a Canvas2D fallback. Batched WebGL is also faster than thousands of Canvas2D draws on phones and Xbox.
- **Build and review:** atlas packing and caching (generated in the browser, or baked to webp to save phone CPU), a preview page for each generator, and a screenshot suite per district and time of day for review.

## Systems
- **Characters:**
  - A modular rig: build and height, skin tones, faces, hair styles and colours, tops, outerwear, bottoms, shoes, hats, glasses, bags, jewellery and tattoos.
  - 8 directions.
  - A keyframed part rig rendered to pixel frames and cached per outfit.
  - Animations: idles, walk, jog, sprint, 4-frame dive roll, punch combo, melee, aim and shoot per weapon class, reload, throw, carry crate, enter and exit vehicles, ride, swim, hit, knockdown, get up, limp, death, sit, phone, fish, talk, and clerk idles.
  - A player creator screen.
- **NPCs:** an archetype grammar driven by the server's data (district wealth, temperament, job and gang), which picks outfit pools, palettes, accessories, gait and idle behaviours. Gang colours and police, EMS and clerk uniforms.
- **Animals:** a parametric quadruped rig (dog breeds from size, legs, snout, ears, tail and coat pattern; cats; farm animals; wildlife), plus birds (pigeons and gulls). Walk, trot, run, sit, lie, sniff, bark and flee.
- **Vehicles:** 3/4 view with free rotation.
  - Each vehicle is a voxel model rendered to pixel art at 32 to 64 angles and cached (fewer on Low and Xbox).
  - Parametric classes cover every current model, plus paint, trims, fictional liveries, damage states, opening doors, emissive lights and sirens, steering wheels, suspension lean, crates on beds and decks, boats, bikes with riders, and trains.
  - Collision boxes stay the server's, and the art fits them.
- **World:**
  - Modular building kits per district, built from the server's footprints and door positions.
  - Doors that animate open, interior cutaways, and clerks at the server's counter tiles, visible through glass shopfronts.
  - District kits: luxury, downtown towers, mid-income, rough (graffiti, chain-link, boarded windows), suburbs, farms (barns, silos), beach (boardwalk, lifeguard tower), parks and soccer, industrial and docks, and country (gas stations, motels).
  - A consistent road kit and district blending bands.
  - All concept-sheet lots and paintings are replaced.
- **Atmosphere:** the existing weather, time-of-day, wind and vegetation systems move onto per-pixel lighting, with district colour grades, volumetric light, optional depth of field, and pooled particles.

## Scale and variety (user direction, 2026-10-05)
- **True-to-life heights:** trees are much taller than people (street trees 6 to 12 m, palms 10 to 20 m, pines 15 to 25 m) and buildings run from one-storey shops to multi-storey walk-ups and towers. Today the trees are about person-height; v2 fixes that.
- **The view stays clear:** anything tall that covers the player or nearby action fades or cuts away around them. Upper floors and roofs go see-through with a soft cutout, tree crowns thin out, and the player and other characters show as a silhouette when hidden. Walk-in interiors use the cutaway view.
- **Variety everywhere:** many species and sizes of trees, shrubs, flowers and crops per biome and district, and many building types, heights, materials, colours and states of repair per district, so the world feels believable and never tiled.
- **Prompts stay as they are:** the ChatGPT style anchor's scale line already produces the right proportions; these notes guide the generators, not the prompts.

## Rollout
- **Preview flag:** v2 is built behind a `?art=2` flag (and a Settings toggle) on the live game, so it can be tested on real devices, including the Xbox, while players keep v1.
- **Switching over:** the default flips when v2 is ready, and v1 art is removed at the end.
- **Layout:** stays as it is. Footprints change only where the new art needs it, through shared map data, with tests.

## Phases
0. Checkpoint. Done.
1. **Style bible and style frame.** One street corner rendered by the real generators: a lineup of characters, a car at several angles, a shopfront with an open door and a clerk, and vegetation, shown by day, at golden hour and at night. This is the decision point where the look is locked.
2. **Renderer.** The WebGL2 lit-sprite pipeline, the Canvas2D fallback, and performance budgets for Xbox and phones.
3. **Vertical slice.** One playable block in v2.
4. **Characters:** the animation system, the player creator and the NPC archetypes.
5. **Vehicles.**
6. **Buildings and world kit**, district by district.
7. **Animals.**
8. **Finishing:** effects, UI, map rebake, QA, flip the default, remove v1.

## Inputs that would help
- **Style frames** from the user: a few target screens of this game in the Octopath and Eastward look, from any image generator or an artist. The generators are built to hit them, the way the original concept sheets were used, but as targets rather than cut-ups.
- **PixelLab** (official MCP server, https://www.pixellab.ai/mcp): AI pixel-art characters with 4 or 8 rotations and animations. Optional, for concept and hero assets; the code generators stay the backbone, for consistency, normal maps and endless variation. It's a paid service.
- **Reference only:** no assets are copied from Octopath or Eastward. Free asset packs would reintroduce the style mixing.

## Honest limits
- **Detail:** code-drawn art is consistent, fully lit and endlessly variable, but it won't have hand-painted storytelling detail in every corner. Hero landmarks can get artist or AI-assisted pieces later, cleaned up to the spec.
- **HD-2D:** this is an approximation (normal and height maps), not real 3D.
- **Performance:** per-pixel lighting needs WebGL2; Low keeps a simpler path. Xbox memory limits how big the atlases can be.
- **Scale:** this is the largest effort in the project, spread over many sessions, each about the size of the vegetation pass. Every phase ends with something you can see and play.

## World v2 and new systems (user direction, 2026-10-05)
These come with the art overhaul, scheduled after the art pipeline is in the game. They are not tied to the current map.

**Adults only:** there are no children anywhere in the game: no child NPCs, players, sprites, props or concept art.

- **Rebuilt world:**
  - The world is laid out again, still based on the user's world layout concepts and keeping all their layout notes, with freedom to restructure it so it works like a real city.
  - Road hierarchy:
    - highways with on- and off-ramps;
    - major and minor arterials, streets and alleys;
    - county roads and dirt roads;
    - beach and park paths;
    - parking lots, driveways and cul-de-sacs;
    - docks.
  - Development clusters around train stations. The art is not squeezed into the current layout.
- **Transit:**
  - **Rail and metro:** trains, an underground metro (with light rail as part of it) and walkable underground stations, reached by stairs from the street. Players and NPCs can go down to the platforms and onto the tracks on foot or in vehicles, and riding underground shows the tunnel view.
  - **Ferries:** ferry stations linking the main world to the islands.
  - **Buses:** bus routes with stops that move NPCs around. Players can ride, steal the bus (with its passengers aboard) or work as a bus driver.
  - **Taxis:** taxis pick NPCs up and drop them off. Players can hail one or jump in, pick a destination on the map and be driven there for a small fee, or work as a taxi driver.
- **Islands are separate places:** the gang compound island and the palm cove with the beach cabin (both from D16) sit in different parts of the sea, not side by side. The prison island is a third.
- **Prison island:** reached after a high number of arrests or felonies, or by an admin.
  - A short sentence (at most about 5 minutes).
  - A breakout attempt; success opens the doors for everyone for a short window, and inmates can swim to shore.
  - Prison-break quests for freeing a friend.
- **Public pool:** an outdoor and indoor pool complex with a locker room, showers and a sauna (concepts L1 and L2 in the prompt pack). Shower stalls sit behind frosted glass with steam. In the showers (stalls and big open shower areas), adult characters are shown with only a small rectangular pixel blur over their private areas, the classic censor-blur look, not a full-body blur; elsewhere people wear swimwear or towels, and NPCs walk about in towels. A settings option can switch the shower look to swimwear. The blur and steam are only visual: showers and stalls are not safe places, so anyone in them can still be seen by NPCs and the server, targeted and hurt like anywhere else. Swimming and using the sauna count toward the player's stats. The concept prompts stay in swimwear and towels (image generators tend to refuse nudity), and the in-game censor blur is built from the character generator.
- **Water park:** a separate water park (concept L3) with its own changing rooms, showers and lockers, a slide tower, tube and flume slides, a lazy river, a wave pool and a kids' area. The slide is an activity: climb the stairs, take a slide and ride it down into the splash pool.
- **Player stats:** walking, running, swimming, strength, agility, health, conviction and dexterity, levelled through play.
  - A daily gym mini-game boosts strength (melee damage).
  - Gains stay modest; they add long-term progression, not a big power gap.
  - **Constitution (overall health)**, nurtured by healthy living: cooking and eating home-cooked meals (a cooking system at the player's home), eating healthy food out in the world, working out, swimming, the sauna and drinking water. The reward is a slightly higher maximum health.
- **Concept prompts added to the pack:** T1 underground metro station, T2 tunnel, T3 ferry terminal, T4 buses, taxis and trams, J1 prison island, J2 prison interiors, G1 gym.

## Progress (2026-10-05)
- **Targets in:** Round 1, C1-C7, V1-V6, B1-B6, A1-A3 and D1-D17 (two D15 versions: the bridge, signs and quarry from A; the road, campfire, dock and lookout from B). T1-T4, J1-J3 and G1 received. Next from the user: the rest of the pack (roads, props, effects, UI, extras).
- **Built so far:** the style frame, characters, vehicles (now including the tram, ferry, tug, tractor, combine, plane and excavator), the building kit, animals, the scene composer, and district blocks for all of D1-D17 plus T3 and T4 (19 blocks in `tools/art2/district-preview.html`; comparison sheets `docs/art-v2/districts-v1..v4.png`). Cut-away interiors are in (metro station, tunnel, gym, prison interiors, prison island; `cutaways-v1.png`). Doors: shopfronts facing the camera have them; buildings whose fronts face away get roof signs and pavement markers. Working doors, entering, and the roof fade near the player come with the game integration.
- **Scale finding from the D targets:** the district concepts frame a wider view than R1, and their buildings are about twice as large as ours relative to people and cars (real houses are 15-20 m wide; ours are 7-9 m). This fits the user's "real heights" direction and should be settled when the world is rebuilt (World v2), not with a zoom change alone.
