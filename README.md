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
| `npm test` | Automated rule tests (100+) + a chaos simulation |
| `npm run bots -- 50 60 ws://localhost:8080/ws --spread` | 50 simulated players for 60 s, prints tick time + bandwidth, writes `logs/bots-*.log` |

## Controls

| | Keyboard / mouse | Xbox gamepad | Touch |
|---|---|---|---|
| Move / steer | WASD | Left stick (RT gas, LT brake in cars) | Left stick |
| Aim / attack | Mouse / left click | Right stick (full deflection auto-fires) / RT | Right stick (push far to fire) |
| Interact (shops, crates, loot, arrest, fishing) | E | B | E |
| Enter / exit vehicle | F | X | CAR |
| Sprint | Shift | L3 / LT | RUN (toggle) |
| Dive roll / handbrake (in a car: e-brake skid turn / drift; held with gas = burnout, + steer = donuts) | Space | A | ROLL / BRAKE |
| Drift: brake while steering at speed | S + A/D (tank) · pull back to one side (point) | LT + stick | pull back to one side |
| Power slide: floor it through a tight turn (hold the gas + counter-steer to keep it sideways, lift to grip) | W + A/D at speed | RT + stick | push far to one side at speed |
| Board a train (anywhere on the platform while it's in; the edge glows green) | E | B | ACT |
| Throw / drop crate | Q | Y | THROW |
| Reload / horn & siren (siren on: traffic pulls over) | R / H | — / D-pad up | — / HORN |
| Rob a store (gun on the clerk; lower it to stop) | Hold right mouse / aim at the clerk | LT aimed at the clerk | aim stick at the clerk |
| Kick the ball (soccer) / spike (volleyball) | Click next to the ball | RT next to the ball | FIRE next to the ball |
| Fish over the side (still boat, far out at sea) | E | B | ACT |
| Train: board at a station / hop on alongside · walk through the cars (roof comes off) · get off or leap off · crack the mail-car strongbox | E · WASD · F · E | B · left stick · X · B | ACT · left thumb · CAR · ACT |
| Stuck? Get unstuck (stand still 5 s, not wanted, not just after a fight) / Surrender (tap twice: respawn, or turn yourself in when wanted) | Esc → Stuck? / Surrender | Start → Stuck? / Surrender | ☰ → Stuck? / Surrender |
| Players online (names, roles, districts) | Esc → Players online, or M → Players online | Start → Players online | ☰ → Players online |
| Dev Debug Mode (online testing, no password; nothing is saved) | Esc → Dev Debug Mode (opens the debug menu; ` or the 🛠 button toggles it) | Start → Dev Debug Mode | ☰ → Dev Debug Mode, then the 🛠 button |
| Police HQ: walk in (front desk → armory → motor pool) | E at the door, E inside for the desk | B / A | ACT, or the ▲ Front desk button |
| Navigate menus (pause, phone, shops, settings) | W/S or ↑/↓, Enter / Space / E to pick, Esc back | D-pad / stick, A pick, B back | tap |
| Phone (places, jobs, waypoints) | P | D-pad ← | 📱 |
| City tour / tutorial (title screen only, never mid-game) | Title → 📖 VIEW TUTORIAL | Title → VIEW TUTORIAL | title screen |
| Call police cruiser (on duty) | V | D-pad down | COP CAR (shows when you have no cruiser) |
| Tackle a suspect (on duty) | Space (dive) into them | A | ROLL |
| Cuff / book a downed suspect | E | B | ACT |
| Lay a spike strip (on duty: select it with the weapon key, then fire toward the road ahead) | Tab, then click | RB, then RT | WPN, then FIRE |
| Bank your cash (walk up to any ATM - automatic) / find the nearest ATM | walk into it · P → Nearest ATM | walk into it · D-pad ← → Nearest ATM | walk into it · 📱 → Nearest ATM |
| Take a lost pet's collar / hand it back to its owner | E | B | ACT |
| City feed (what's happening anywhere) | P → City feed | D-pad ← → City feed | 📱 → City feed |
| Hire a boat / hand it back (at a rental dock) | E at the kiosk · E in the boat by the pier | B | ACT |
| Moor a boat in your boathouse (waterfront homes) / take one out | E in the boat by your slip · E at your door → Take out | B | ACT |
| Bag (inventory: equip weapons, use items, pin them to the quick wheel) | I | D-pad → | 🎒 |
| Quick wheel (med kits, bandages, drinks) | hold X, point, let go (tap: last used) | hold View, right stick, let go | ITEMS, then tap a slot |
| Revive a downed player (kit: full health, bare-handed: low) / hand them a bandage or med kit after | hold E | hold B | hold ACT |
| Finish off a downed player | hold F (or just hit them) | hold X | hold CAR |
| Downed: Call for Help · ambulance ($200 from the bank) · cancel and wake up | H · J · C (or the buttons) | X · Y · B | the buttons |
| Close a shop / desk / NPC menu or any panel | Esc, or click off it | B | tap anywhere off it |
| Weapons | Tab, mouse wheel, 1–9 | LB / RB | WPN |
| City map + waypoints (pick a category / place, or click the map) | M | Pause → Map (D-pad / stick, A pick, B back) | tap the radar or ▦, then tap |
| Zoom the city map / look around / find yourself | mouse wheel or + / − · drag · C (or the + − ⌖ buttons) | RT / LT · right stick | pinch · drag · + − ⌖ buttons |
| Dev teleport to any district, station or landmark | ` → 📍 Teleport (map or list) | Start → Dev Debug Mode → 📍 Teleport | 🛠 → 📍 Teleport |

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
| Sprint | Shift | LT / L3 | SPRINT |
| Roll / handbrake | Space | A (LT in a car) | ROLL / BRAKE |
| Interact · get in/out · throw | E · F · Q | B · X · Y | ACT · CAR · THROW |
| Weapons · reload · quick wheel · bag | Tab, wheel, 1-9 · R · hold X · I | LB/RB · R3 · hold View · D-pad → | tap the weapon box · RELOAD · ITEMS · 🎒 |
| World map + waypoints (police: dispatch map) | M or ▦ | Pause menu → Map | tap the radar or ▦ |
| Pause menu (map, players online, settings, controls, Dev Debug Mode) | Esc | Start / Menu (D-pad or left stick to move, A select, B back) | ☰ |

Settings (⚙) include classic tank driving for keyboards, the touch fire ring, gamepad stick-fire, vibration and auto-fullscreen, plus your account transfer code: copy it on one device and paste it on another to play the same character there.
