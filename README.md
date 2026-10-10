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
| Move / steer | WASD (on foot: up, down, left, right on the screen; at the wheel: W gas, S brake / reverse, A/D steer - Settings → Keyboard driving → Controls 2 makes WASD point the way instead) | Left stick (RT gas, LT brake in cars) | Left stick |
| Aim / attack | Mouse / left click | Right stick aims, RT fires (at the wheel RT is the gas: click R3 for a drive-by). Settings → "pushing the right stick all the way also fires" puts the stick-ring fire back (off by default) | Right stick (push far to fire - with the FIRE toggle by the stick on; off, it only aims) |
| Interact (shops and the countryside counters, crates, loot, arrest, fishing, picking fruit at the orchard and the vineyard, cutting lavender, stripping the boneyard's planes for parts, chipping for gold at the old mine, searching the shipwreck, ringing the old mission's bells, the pier's coin telescope, stargazing at the observatory after dark, the Ferris wheel, balloon flights and the Splash Canyon water slides, teeing off at the golf club) | E | B | E |
| Enter / exit vehicle | F | X | CAR |
| Sprint | Shift | Push the left stick all the way | Push the left thumb all the way |
| Dive roll / handbrake (in a car: e-brake skid turn / drift; held with gas = burnout, + steer = donuts) | Space | A | ROLL / BRAKE |
| Drift: brake while steering at speed | S + A/D (car) · pull back to one side (Controls 2) | LT + stick | pull back to one side |
| Power slide: floor it through a tight turn (hold the gas + counter-steer to keep it sideways, lift to grip) | W + A/D at speed | RT + stick | push far to one side at speed |
| Board a train (anywhere on the platform while it's in; the edge glows green) | E | B | ACT |
| Throw / drop crate | Q | Y | THROW |
| Reload / horn & siren (siren on: traffic pulls over; on a bicycle, the bell) | R / H | — / D-pad up | — / HORN |
| Rob a store (gun on the clerk; lower it to stop) | Hold right mouse / aim at the clerk | LT aimed at the clerk | aim stick at the clerk |
| Kick the ball (soccer) / spike (volleyball) | Click next to the ball | RT next to the ball | FIRE next to the ball |
| Golf: aim, then hold and let go at the top of the meter (by your ball; each shot starts aimed at the flag) | Mouse · hold left click | Right stick · hold RT | Aim stick · hold FIRE |
| Shoot hoops (North Point Courts: E for a ball, then hold and let go in the meter's green band) | E · hold left click | B · hold RT | ACT · hold FIRE |
| Fish over the side (still boat, far out at sea) | E | B | ACT |
| Under the ground: climb down a manhole over the sewers (stand on the cover) or go into the cave through the Old Granite Mine's adit · climb a ladder up / through the service door into a subway station / walk out of the cave · switch on a flashlight (it's dark down there) | E · E · L | B · B · D-pad up | ACT · ACT · 🔦 |
| Mine an ore vein (face it with a pickaxe good enough for its ore, stand still while the ring fills; the quarry's assay office buys ore best) | E | B | ACT |
| Stalk game: creep (slow is quiet; keep downwind and behind trees and rocks; move while it grazes, freeze when it looks up) | C or Ctrl + move | push the stick gently | push the thumb gently |
| Hunting bow: draw and loose (silent; the next arrow nocks itself; arrows come back when you dress the carcass, and you pick up a miss by walking over it) | hold right mouse, click | LT, RT | aim stick, FIRE |
| Emberfang Bow (the fire bow - rare: the Highland Hunting Lodge): flaming arrows that hurt more, set a car burning and light a campfire they land by; they burn away | hold right mouse, click | LT, RT | aim stick, FIRE |
| Field dress a carcass (a Hunting Knife takes the hide off whole) / cook raw meat at a lit campfire / sell game, make clothing at a trapper's bench | E | B | ACT |
| Blades: slash with a knife, a sword (pawn shops) or a katana (the fence). A killing blow is now and then a finishing stab or slash; the plasma blade cuts clean through and now and then turns a bullet aside | Left click | RT | FIRE |
| Plasma blade colour: blue to start, or red, green, purple, yellow, orange, cyan, pink or white - kept with your character, everyone sees it (the blade, its light and its arcs) | Esc → Settings → Plasma blade colour, or the swatches under the blade in the bag (I) | Start → Settings → Plasma blade colour, or the bag (D-pad →) | ⚙ → Plasma blade colour, or 🎒 |
| Speak to the hooded stranger (rare: at night, somewhere quiet in the wilds; he sells the plasma blade) | E | B | ACT |
| Light a campfire / sit by a lit one to warm up and heal (any step gets you up) / sitting, put it out | E | B | ACT |
| Train: board at a station / hop on alongside · walk through the cars (roof comes off) · get off or leap off · crack the mail-car strongbox | E · WASD · F · E | B · left stick · X · B | ACT · left thumb · CAR · ACT |
| Bus: board at a stop while one waits there (free; the prompt at the stop says when the next comes) · get off at a stop | E · F | B · X | ACT · CAR |
| Ferry (free): walk aboard at the pier while the boat is in · get off at the far pier · car ferry: drive up to its stern and interact to take your car across, interact again to drive off before it leaves | E · F · E | B · X · B | ACT · CAR · ACT |
| Stuck? Get unstuck (stand still 5 s, not wanted, not just after a fight) / Surrender (tap twice: respawn, or turn yourself in when wanted) | Esc → Stuck? / Surrender | Start → Stuck? / Surrender | ☰ → Stuck? / Surrender |
| Players online (names, roles, districts) | Esc → Players online, or M → Players online | Start → Players online | ☰ → Players online |
| Character creator: body, face, hair, outfit (Owned / All: what isn't yours is padlocked, with the store that sells it; style, slot, piece, colours, pattern; take a jacket off to see the top under it), extras, saved looks · Randomise · Undo · Save look · Done (you wear what you own; the body and face change at the mirror at home, the hair at a barber; your first look is free; not while wanted, except at home). The preview is you as the game draws you, a little bigger; the magnifier doubles it. Q turns the preview | Esc → Appearance; arrows / WASD move, Enter picks, Esc done | Start → Appearance; D-pad / stick move, A picks, B done | ☰ → Appearance; tap |
| A clothing store's fitting room: Outfits, Tops, Jackets, Bottoms, Dresses & sets, Shoes, Hats, Accessories · colours and patterns · take your jacket off to see the top under it (and walk out without it) · Try on · Buy · Buy and wear (cash, then the bank; while wanted and out of sight it's a disguise) | E at the counter → The fitting room; arrows / WASD move, Enter picks, Esc closes | B at the counter → The fitting room; D-pad / stick move, A picks, B closes | ACT → The fitting room; tap |
| Barbershop / hair salon: Cut, Colour, Beard, Moustache (the salon: cuts and colour), seen on you first · Confirm pays | E at the counter → Take a seat; Enter picks, Esc back | B at the counter → Take a seat; A picks, B back | ACT → Take a seat; tap |
| Quick change at home: your saved looks round a wheel (a change at home is unseen: it drops your public wanted level) · The mirror: the whole creator | E at your home → Quick change / The mirror; ← → pick, Enter apply | B at your home → Quick change; ← → pick, A apply, B close | ACT → Quick change; tap |
| Debug menu (online testing, no password: opening it switches Dev Debug Mode on; your progress carries on - whatever you get in it stays when you leave). Give weapons, teleport, spectate, then a section per feature (weather & time, me, blades and practice dummies, the law, vehicles, trains, jobs, crime, events, shops, hunting and wildlife, homes, nature) that spawns the thing or takes you to the nearest place it happens; everyone online on the right | ` or the pink 🐞 button (grey until dev mode is on); Esc → 🐞 Debug menu | Start → 🐞 Debug menu (the top option); ← → jumps between the commands and the players | the pink 🐞 button at the top |
| Dev give: any weapon (with magazines), tool, item, drink, bait, fish or loot - or everything - to yourself or any player online | ` → 🎁 Give (category, thing, how many, who) | Start → 🐞 Debug menu → 🎁 Give (D-pad / stick, ← → to choose) | 🐞 → 🎁 Give |
| Start fresh: erase your character for good (money, bank, homes, cars, clothes, weapons, record - everything) and begin again as a new player: the title screen, the graphics choice, the character creator. Press it twice - the first press arms it with a warning for 5 seconds | Esc → Settings → ⟲ Start fresh (under Repair install; the title screen's Settings too), or the debug menu | Start → Settings → ⟲ Start fresh, or the 🐞 debug menu | ⚙ → ⟲ Start fresh, or 🐞 |
| Police HQ: walk in (front desk → armory → motor pool) | E at the door, E inside for the desk | B / A | ACT, or the ▲ Front desk button |
| Navigate menus (pause, phone, shops, settings) | W/S or ↑/↓, Enter / Space / E to pick, A/D or ←/→ change a setting or a volume slider, Esc back | D-pad / stick (left / right changes a setting or a slider), A pick, B back | tap |
| Phone (places, jobs, waypoints, the Transit app with taxis, the bus lines, the ferries and stations; call in a crime you just saw, within a minute). Your phone shows in your hand while it's open | P | D-pad ← | 📱 |
| City tour / tutorial (title screen only, never mid-game) | Title → 📖 VIEW TUTORIAL | Title → VIEW TUTORIAL | title screen |
| Call police cruiser (on duty) | V | D-pad down | COP CAR (shows when you have no cruiser) |
| Tackle a suspect (on duty) | Space (dive) into them | A | ROLL |
| Cuff / book a downed suspect | E | B | ACT |
| Put a cuffed player in the back of your police car (then drive to any station's kerb to book them, for a bonus) | E by them, next to your car | B | ACT |
| An officer come for a word (1 star from small crimes: a few punches, rams or the like that people saw, or one an officer saw): stand still or talk to them - mostly a warning, sometimes a fine, now and then the cuffs (no tackle); walk or run off and they may come after you, and out of their reach a while it's 2 stars. A hothead goes for the arrest at once | E by them, or stand still | B by them, or stand still | ACT by them, or stand still |
| Get away from a tackle (wanted, 1-3 stars): a tackle at low stars often only trips you (keep running), and a real one puts you down for less - move to scramble up sooner. The officer who dove is down a moment too and the others walk up, so only one who reaches you while you're still down can pin you | WASD | Left stick | Left thumb |
| Fight back when an officer takes you down (wanted: tackled, grabbed, tased or dragged out of a car, before the cuffs go on): punch to fill the FIGHT BACK! bar and work the stick (each swing round to a new direction, and pushing against them) while the officer pushes it down. Fill it and you throw them off - run, or keep fighting (punching an officer adds heat); too slow and you're cuffed. A good chance at 1-2 stars, about half at 3; much harder at 4-5 stars, hurt, with two officers on you, or against SWAT, the FBI or soldiers. The stick alone isn't enough: you have to fight | Left click, mashed · WASD | RT, mashed · left stick | FIRE, mashed · left thumb |
| Arrested: cuffed, held, walked to the officer's own car if it's close (else a car comes for you) and driven to the station (get away if the officer is downed or the car is wrecked or hijacked) · make a break for it while you're held on the ground or walked to the car - no fighting, a try every few seconds: a good chance at 1-2 stars, hardly any at 4-5; the officer stumbles back or goes over, and those who run after you may trip · if the car is stuck or doesn't come, the break always works · two officers walk you in from the car to a cell at the back of the station · in the cell (still there if you log out) walk round, sit on the bench or the toilet, hold the bars (both hands out on them), fight to rattle them or thump the wall - cellmates can't hurt each other · pay the bail (from the bank, then cash) or wait it out, then out of the front door | E to break for it · E in the cell: sit / toilet / hold the bars / get up · click: rattle the bars / thump the wall · B or Enter: bail | B to break for it · B in the cell: sit / toilet / bars · RT: rattle / thump · Y: bail | ACT to break for it · ACT in the cell · FIGHT: rattle / thump · the bail button |
| Lay a spike strip (on duty: select it with the weapon key, then fire toward the road ahead) | Tab, then click | RB, then RT | WPN, then FIRE |
| Bank your cash (walk up to any ATM - automatic) / find the nearest ATM | walk into it · P → Nearest ATM | walk into it · D-pad ← → Nearest ATM | walk into it · 📱 → Nearest ATM |
| Take a lost pet's collar / hand it back to its owner | E | B | ACT |
| Drop a coin for a busker ($2, +1 Samaritan) | E beside them | B | ACT |
| City feed (what's happening anywhere) | P → City feed | D-pad ← → City feed | 📱 → City feed |
| Hire a boat / hand it back (at a rental dock) | E at the kiosk · E in the boat by the pier | B | ACT |
| Moor a boat in your boathouse (waterfront homes) / take one out | E in the boat by your slip · E at your door → Take out | B | ACT |
| Bag (inventory: equip weapons, use items, pin them to the quick wheel) | I | D-pad → | 🎒 |
| Your light on / off: the flashlight, the headlamp or the hard hat's lamp (hands free), the lantern, or the heavy flashlight in your hand (hardware stores, corner stores, gas stations, the outfitters; a light in your hand goes dark while both hands are busy; batteries run down) | L, or the bag / quick wheel (picking a light there makes it the one L switches) | D-pad ↑ on foot | 🔦 (shows once you have one), or the bag |
| Strike and throw a flare · snap and drop a glow stick · set a lit lantern down (it stays lit; E picks it up again) | the bag / quick wheel · E | the bag / quick wheel · B | the bag / ITEMS · ACT |
| Fell a tree (a hatchet, an axe, a felling axe or a chainsaw in your bag; the tree falls away from you - stand clear; in town it's vandalism) · pick up a bundle of logs, load it onto a pickup or a flatbed, sell it at the hardware store | hold E facing the tree · E | hold B · B | hold ACT · ACT |
| Quick wheel (med kits, bandages, drinks) | hold X, point, let go (tap: last used) | hold View, right stick, let go | ITEMS, then tap a slot |
| Revive a downed player (kit: full health, bare-handed: low) / hand them a bandage or med kit after | hold E | hold B | hold ACT |
| Finish off a downed player | hold F (or just hit them) | hold X | hold CAR |
| Downed (the scene first; a few seconds later the choices dock at the bottom): Call for help · call an ambulance ($200 from the bank, only if they revive you) · cancel the request (back to the countdown) · where to wake up (where you last woke, unless you pick another) · hide the choices to watch the scene (a slim bar keeps the countdown) and bring them back | H · J · C · ← → (or the arrows by the spot) · Esc | X · Y · LB · D-pad · B | the buttons · ▾ hide, then tap the bar |
| Close a shop / desk / NPC menu or any panel | Esc, or click off it | B | tap anywhere off it |
| Weapons | Tab, mouse wheel, 1–9 | Tap RB / LB: the next / previous weapon (LB from your fists: the plasma blade, if you have it) · hold either (0.3 s): the weapon wheel - point either stick at one, let go of the bumper to take it out | WPN by the FIRE button (or the weapon box, top right): tap for the next weapon, hold to pick any of them |
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
| Drive | W gas · S brake, then reverse · A/D steer (the wheel eases over; steering in reverse swings the car like a real one) - Settings → Keyboard driving → Controls 2: WASD points where to go | RT gas · LT brake/reverse · left stick steer · A handbrake (GTA-style; stick-pointing option in Settings) | Left thumb: point where to go |
| Drive-by | Mouse aim + click | Right stick aim, R3 (click the stick) to fire - RT is the gas (a passenger fires with RT) | Aim stick / FIRE |
| Aim | Mouse cursor | Right stick | Right stick |
| Fire / punch (on foot) | Click | RT | FIRE button, or push the aim stick into its red ring (the FIRE toggle by the stick: on by default; tap it off and the stick only aims) |
| Block / guard (fists, bat, sword, katana, plasma blade: a blow from in front does little or nothing; guarding you walk slowly and can't strike. The plasma blade turns most bullets and arrows aside facing the shooter - fewer from the side, none from behind) | Hold right mouse | Hold LT (on foot) | Hold the aim stick short of its red ring (anywhere, with the FIRE toggle off) |
| Sprint | Shift | Left stick all the way out | Left thumb all the way out |
| Roll / handbrake | Space | A (LT in a car) | ROLL / BRAKE |
| Interact · get in/out · throw | E · F · Q | B · X · Y | ACT · CAR · THROW |
| Weapons · reload · quick wheel · bag | Tab, wheel, 1-9 · R · hold X · I | RB/LB (tap: next / previous, hold: the weapon wheel) · R3 · hold View · D-pad → | WPN (tap: next, hold: pick) · RELOAD · ITEMS · 🎒 |
| Light on / off (once you have one) · fell a tree (with an axe or a chainsaw) | L · hold E | D-pad ↑ (on foot) · hold B | 🔦 · hold ACT |
| World map + waypoints (police: dispatch map) | M or the map button | Pause menu → Map (Y: a waypoint at the cross) | tap the radar or the map button |
| Pause menu (debug menu, map, players online, settings, controls) | Esc | Start / Menu (D-pad or left stick to move, A select, B back) | ☰ |

Settings (⚙) include Graphics: a preset (Low / Medium / High / Ultra, picked for your device on first play - phones, tablets and consoles start on Medium, desktops on High or Ultra) plus a switch for each effect (lighting, vegetation off / still / live, vegetation density, wind sway, trampled grass and crops, golden-hour glow, shadows, puddle reflections, rain and fog detail, particles, render sharpness, tilt-shift blur), "Keep it smooth" (on by default: the render size eases off a little while the frame rate can't keep up, and comes back when it can), a performance overlay (the load timeline, frame times and memory, for bug reports), classic tank driving for keyboards, the touch fire ring, gamepad stick-fire (off by default: RT fires), the plasma blade's colour, vibration and auto-fullscreen, Sound (sound and music on or off, and the master, effects, ambience and music volumes), plus your account transfer code: copy it on one device and paste it on another to play the same character there, and Start fresh (press twice: your character is erased for good and you come back as a new player).
