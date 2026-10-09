# City Life Auto

A web-native, top-down multiplayer extraction life-sim sandbox in the spirit of GTA 1 & 2.
Open the page, you're in the city as a guest. No download, no sign-up.

**Status:** milestones M0–M8 built (foundations → economy). See [docs/DEVLOG.md](docs/DEVLOG.md).

## Play without a server: offline practice

Open the page (https://deadbaron.com/city-life-auto/ or a local copy) and press **PRACTICE OFFLINE**. The whole city simulation runs inside your browser, with the cheats panel on and nothing saved.

## Run it on your computer (2 minutes)

You only need **Node.js 20 or newer** (https://nodejs.org). There are **no packages to install**.

```bash
git clone https://github.com/dead-baron/city-life-auto
cd city-life-auto
npm run dev          # dev mode: playtest panel + cheat commands enabled
```

Open **http://localhost:8080** and press **PLAY AS GUEST**. Open a second browser window (or a
private window) to get a second player. Other phones/PCs on your Wi-Fi can join at
`http://<your-computer's-LAN-IP>:8080`.

| Command | What it does |
|---|---|
| `npm run dev` | Server with the dev/playtest panel (press `` ` `` in game) |
| `npm start` | Production server (no cheats) |
| `npm test` | Automated rule tests (100+) + a chaos simulation + the performance budgets |
| `node tools/perf.mjs` | The performance report: code each part of the page loads, building the city, baking chunks, against their budgets |
| `npm run bots -- 50 60 ws://localhost:8080/ws --spread` | 50 simulated players for 60 s, prints tick time + bandwidth, writes `logs/bots-*.log` |

## Controls

| | Keyboard / mouse | Xbox gamepad | Touch |
|---|---|---|---|
| Move / steer | WASD | Left stick (RT gas, LT brake in cars) | Left stick |
| Aim / attack | Mouse / left click | Right stick (full deflection auto-fires) / RT | Right stick (push far to fire) |
| Interact (shops and the countryside counters, crates, loot, arrest, fishing, picking fruit at the orchard and the vineyard, cutting lavender, stripping the boneyard's planes for parts, chipping for gold at the old mine, searching the shipwreck, ringing the old mission's bells, the pier's coin telescope, stargazing at the observatory after dark, the Ferris wheel, balloon flights and the Splash Canyon water slides, teeing off at the golf club) | E | B | E |
| Enter / exit vehicle | F | X | CAR |
| Sprint | Shift | Push the left stick all the way | Push the left thumb all the way |
| Dive roll / handbrake (in a car: e-brake skid turn / drift; held with gas = burnout, + steer = donuts) | Space | A | ROLL / BRAKE |
| Drift: brake while steering at speed | S + A/D (tank) · pull back to one side (point) | LT + stick | pull back to one side |
| Power slide: floor it through a tight turn (hold the gas + counter-steer to keep it sideways, lift to grip) | W + A/D at speed | RT + stick | push far to one side at speed |
| Board a train (anywhere on the platform while it's in; the edge glows green) | E | B | ACT |
| Throw / drop crate | Q | Y | THROW |
| Reload / horn & siren (siren on: traffic pulls over; on a bicycle, the bell) | R / H | — / D-pad up | — / HORN |
| Rob a store (gun on the clerk; lower it to stop) | Hold right mouse / aim at the clerk | LT aimed at the clerk | aim stick at the clerk |
| Kick the ball (soccer) / spike (volleyball) | Click next to the ball | RT next to the ball | FIRE next to the ball |
| Golf: aim, then hold and let go at the top of the meter (by your ball; each shot starts aimed at the flag) | Mouse · hold left click | Right stick · hold RT | Aim stick · hold FIRE |
| Shoot hoops (North Point Courts: E for a ball, then hold and let go in the meter's green band) | E · hold left click | B · hold RT | ACT · hold FIRE |
| Fish over the side (still boat, far out at sea) | E | B | ACT |
| Stalk game: creep (slow is quiet; keep downwind and behind trees and rocks; move while it grazes, freeze when it looks up) | C or Ctrl + move | push the stick gently | push the thumb gently |
| Hunting bow: draw and loose (silent; the next arrow nocks itself; arrows come back when you dress the carcass, and you pick up a miss by walking over it) | hold right mouse, click | LT, RT | aim stick, FIRE |
| Field dress a carcass (a Hunting Knife takes the hide off whole) / cook raw meat at a lit campfire / sell game, make clothing at a trapper's bench | E | B | ACT |
| Blades: slash with a knife, a sword (pawn shops) or a katana (the fence). A killing blow is now and then a finishing stab or slash; the plasma blade cuts clean through and now and then turns a bullet aside | Left click | RT | FIRE |
| Speak to the hooded stranger (rare: at night, somewhere quiet in the wilds; he sells the plasma blade) | E | B | ACT |
| Light a campfire / sit by a lit one to warm up and heal (any step gets you up) / sitting, put it out | E | B | ACT |
| Train: board at a station / hop on alongside · walk through the cars (roof comes off) · get off or leap off · crack the mail-car strongbox | E · WASD · F · E | B · left stick · X · B | ACT · left thumb · CAR · ACT |
| Bus: board at a stop while one waits there (free; the prompt at the stop says when the next comes) · get off at a stop | E · F | B · X | ACT · CAR |
| Ferry (free): walk aboard at the pier while the boat is in · get off at the far pier · car ferry: drive up to its stern and interact to take your car across, interact again to drive off before it leaves | E · F · E | B · X · B | ACT · CAR · ACT |
| Stuck? Get unstuck (stand still 5 s, not wanted, not just after a fight) / Surrender (tap twice: respawn, or turn yourself in when wanted) | Esc → Stuck? / Surrender | Start → Stuck? / Surrender | ☰ → Stuck? / Surrender |
| Players online (names, roles, districts) | Esc → Players online, or M → Players online | Start → Players online | ☰ → Players online |
| Character creator: body, face, hair, outfit (style, slot, piece, colours, pattern), extras, saved looks · Randomise · Undo · Save look · Done (free; not while wanted, except at home). Q turns the preview | Esc → Appearance; arrows / WASD move, Enter picks, Esc done | Start → Appearance; D-pad / stick move, A picks, B done | ☰ → Appearance; tap |
| Quick change at home: your saved looks round a wheel (a change at home is unseen: it drops your public wanted level) · The mirror: the whole creator | E at your home → Quick change / The mirror; ← → pick, Enter apply | B at your home → Quick change; ← → pick, A apply, B close | ACT → Quick change; tap |
| Debug menu (online testing, no password: opening it switches Dev Debug Mode on; your progress carries on - whatever you get in it stays when you leave). Give weapons, teleport, spectate, then a section per feature (weather & time, me, blades and practice dummies, the law, vehicles, trains, jobs, crime, events, shops, hunting and wildlife, homes, nature) that spawns the thing or takes you to the nearest place it happens; everyone online on the right | ` or the pink 🐞 button (grey until dev mode is on); Esc → 🐞 Debug menu | Start → 🐞 Debug menu (the top option); ← → jumps between the commands and the players | the pink 🐞 button at the top |
| Dev give: any weapon (with magazines), tool, item, drink, bait, fish or loot - or everything - to yourself or any player online | ` → 🎁 Give (category, thing, how many, who) | Start → 🐞 Debug menu → 🎁 Give (D-pad / stick, ← → to choose) | 🐞 → 🎁 Give |
| Police HQ: walk in (front desk → armory → motor pool) | E at the door, E inside for the desk | B / A | ACT, or the ▲ Front desk button |
| Navigate menus (pause, phone, shops, settings) | W/S or ↑/↓, Enter / Space / E to pick, A/D or ←/→ change a setting or a volume slider, Esc back | D-pad / stick (left / right changes a setting or a slider), A pick, B back | tap |
| Phone (places, jobs, waypoints, the Transit app with taxis, the bus lines, the ferries and stations; call in a crime you just saw, within a minute). Your phone shows in your hand while it's open | P | D-pad ← | 📱 |
| City tour / tutorial (title screen only, never mid-game) | Title → 📖 VIEW TUTORIAL | Title → VIEW TUTORIAL | title screen |
| Call police cruiser (on duty) | V | D-pad down | COP CAR (shows when you have no cruiser) |
| Tackle a suspect (on duty) | Space (dive) into them | A | ROLL |
| Cuff / book a downed suspect | E | B | ACT |
| Put a cuffed player in the back of your police car (then drive to any station's kerb to book them, for a bonus) | E by them, next to your car | B | ACT |
| Arrested: cuffed, held, walked to a police car and driven to the station (get away if the officer is downed or the car is wrecked or hijacked) · if the car is stuck or doesn't come, make a break for it · in the cell (still there if you log out), pay the bail (from the bank, then cash) or wait it out | E to break for it · B or Enter in the cell | B to break for it · Y in the cell | ACT to break for it · the bail button |
| Lay a spike strip (on duty: select it with the weapon key, then fire toward the road ahead) | Tab, then click | RB, then RT | WPN, then FIRE |
| Bank your cash (walk up to any ATM - automatic) / find the nearest ATM | walk into it · P → Nearest ATM | walk into it · D-pad ← → Nearest ATM | walk into it · 📱 → Nearest ATM |
| Take a lost pet's collar / hand it back to its owner | E | B | ACT |
| City feed (what's happening anywhere) | P → City feed | D-pad ← → City feed | 📱 → City feed |
| Hire a boat / hand it back (at a rental dock) | E at the kiosk · E in the boat by the pier | B | ACT |
| Moor a boat in your boathouse (waterfront homes) / take one out | E in the boat by your slip · E at your door → Take out | B | ACT |
| Bag (inventory: equip weapons, use items, pin them to the quick wheel) | I | D-pad → | 🎒 |
| Flashlight on / off (buy one at a hardware store, corner store or gas station; it takes no hand - you keep your weapon) | L, or the bag / quick wheel | D-pad ↑ on foot | 🔦 (shows once you have one), or the bag |
| Quick wheel (med kits, bandages, drinks) | hold X, point, let go (tap: last used) | hold View, right stick, let go | ITEMS, then tap a slot |
| Revive a downed player (kit: full health, bare-handed: low) / hand them a bandage or med kit after | hold E | hold B | hold ACT |
| Finish off a downed player | hold F (or just hit them) | hold X | hold CAR |
| Downed (the choices come up a few seconds after you go down): Call for help · call an ambulance ($200 from the bank, only if they revive you) · cancel the request (back to the countdown) · where to wake up (where you last woke, unless you pick another) | H · J · C · arrows (or the buttons) | X · Y · B · D-pad | the buttons |
| Close a shop / desk / NPC menu or any panel | Esc, or click off it | B | tap anywhere off it |
| Weapons | Tab, mouse wheel, 1–9 | LB / RB | WPN by the FIRE button (or the weapon box, top right): tap for the next weapon, hold to pick any of them |
| City map + waypoints (click a place's icon or anywhere on the map; or pick a category's name for its places, nearest first) - a yellow GPS line on the map and the radar follows the roads to it | M | Pause → Map (D-pad / stick, A pick, B back; Y sets a waypoint at the cross in the middle) | tap the radar or the map button, then tap |
| Show or hide a kind of place on the city map (Shops, Jobs, Services, Transit, Safehouses, Activities, Gangs) | click its box | ← / → on its line | tap its box |
| Zoom the city map / look around / find yourself | mouse wheel or + / − · drag · C (or the − + and find-me buttons in the panel) | RT / LT · right stick | pinch · drag · − + and find-me buttons |
| The hub tabs along the top of the map and the pause menu: MAP, JOBS (the job board), PEOPLE (who's online), GEAR (your bag), SYS (the pause menu) | click | D-pad / stick to them, A | tap |
| Dev teleport to any district, station or landmark | ` → 📍 Teleport (map or list) | Start → 🐞 Debug menu → 📍 Teleport | 🐞 → 📍 Teleport |
| Dev spectator: free camera over the whole world, art layers, schematic view, PNG / hi-res PNG screenshots | ` → 🎥 Spectator; WASD / arrows fly (Shift faster), E / Q or wheel zoom, drag pans, C find me, P save PNG, H hide panel, Esc exit | Start → 🐞 Debug menu → 🎥 Spectator; left stick flies, RT / LT zoom, X save PNG, Y hide panel, B exit | 🐞 → 🎥 Spectator; drag to fly, pinch to zoom |

## Project layout

```
index.html            game page (also served by GitHub Pages)
client/               browser client: input, prediction, renderer, HUD, audio
shared/               code used by BOTH server and client (map generator, physics, protocol, items)
server/               authoritative Node.js server: world tick, systems/, WebSocket, auth, saving
assets/               sprite atlas cut from the concept art + logo
tools/                bots.js load tester, build_art.py (builds every asset from the concept sheets)
test/                 node:test suites
deploy/               systemd unit, Caddyfile, Oracle setup script
docs/                 DEVLOG, ARCHITECTURE, ART_SPEC, DEPLOY
```

## Docs

- [docs/DEVLOG.md](docs/DEVLOG.md): what was built per milestone, playtest checklists, how to send results back
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): server/client split, tick order, wire protocol, design decisions
- [docs/ART_SPEC.md](docs/ART_SPEC.md): sprite sizes, directions, layers and palette for final art
- [docs/DEPLOY.md](docs/DEPLOY.md): Oracle Cloud server + `play.deadbaron.com` + GitHub Pages at `deadbaron.com/city-life-auto`

## Controls

| | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| Move (further = faster) | WASD / arrows (C or Ctrl = walk) | Left stick | Left thumb anywhere on the left half |
| Drive | WASD: point where to go (or classic tank in Settings) | RT gas · LT brake/reverse · left stick steer · A handbrake (GTA-style; stick-pointing option in Settings) | Left thumb: point where to go |
| Drive-by | Mouse aim + click | Right stick aim, push all the way to fire | Aim stick / FIRE |
| Aim | Mouse cursor | Right stick | Right stick |
| Fire / punch (on foot) | Click | RT | FIRE button, or push the aim stick into its red ring |
| Sprint | Shift | Left stick all the way out | Left thumb all the way out |
| Roll / handbrake | Space | A (LT in a car) | ROLL / BRAKE |
| Interact · get in/out · throw | E · F · Q | B · X · Y | ACT · CAR · THROW |
| Weapons · reload · quick wheel · bag | Tab, wheel, 1-9 · R · hold X · I | LB/RB · R3 · hold View · D-pad → | WPN (tap: next, hold: pick) · RELOAD · ITEMS · 🎒 |
| Flashlight on / off (once you have one) | L | D-pad ↑ (on foot) | 🔦 |
| World map + waypoints (police: dispatch map) | M or the map button | Pause menu → Map (Y: a waypoint at the cross) | tap the radar or the map button |
| Pause menu (debug menu, map, players online, settings, controls) | Esc | Start / Menu (D-pad or left stick to move, A select, B back) | ☰ |

Settings (⚙) include Graphics: a preset (Low / Medium / High / Ultra, picked for your device on first play - phones, tablets and consoles start on Medium, desktops on High or Ultra) plus a switch for each effect (lighting, vegetation off / still / live, vegetation density, wind sway, trampled grass and crops, golden-hour glow, shadows, puddle reflections, rain and fog detail, particles, render sharpness, tilt-shift blur), "Keep it smooth" (on by default: the render size eases off a little while the frame rate can't keep up, and comes back when it can), a performance overlay (the load timeline, frame times and memory, for bug reports), classic tank driving for keyboards, the touch fire ring, gamepad stick-fire, vibration and auto-fullscreen, Sound (sound and music on or off, and the master, effects, ambience and music volumes), plus your account transfer code: copy it on one device and paste it on another to play the same character there.
