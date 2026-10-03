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
| `npm test` | 19 automated rule tests + a chaos simulation |
| `npm run bots -- 50 60 ws://localhost:8080/ws --spread` | 50 simulated players for 60 s, prints tick time + bandwidth, writes `logs/bots-*.log` |

## Controls

| | Keyboard / mouse | Xbox gamepad | Touch |
|---|---|---|---|
| Move / steer | WASD | Left stick (RT gas, LT brake in cars) | Left stick |
| Aim / attack | Mouse / left click | Right stick (full deflection auto-fires) / RT | Right stick (push far to fire) |
| Interact (shops, crates, loot, arrest, fishing) | E | B | E |
| Enter / exit vehicle | F | X | CAR |
| Sprint | Shift | L3 / LT | RUN (toggle) |
| Dive roll / handbrake | Space | A | ROLL |
| Throw / drop crate | Q | Y | THROW |
| Reload / horn & siren | R / H | — / D-pad up | — / HORN |
| Heal (bandage / medkit) | X | Back | HEAL |
| Weapons | Tab, mouse wheel, 1–9 | LB / RB | WPN |
| City map | M | — | — |

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
| Move / drive (point where to go; further = faster) | WASD / arrows (C or Ctrl = walk) | Left stick | Left thumb anywhere on the left half |
| Aim | Mouse cursor | Right stick | Right stick |
| Fire / punch | Click | RT | FIRE button, or push the aim stick into its red ring |
| Sprint | Shift | LT / L3 | SPRINT |
| Roll / handbrake | Space | A (LT in a car) | ROLL / BRAKE |
| Interact · get in/out · throw | E · F · Q | B · X · Y | ACT · CAR · THROW |
| Weapons · reload · heal | Tab, wheel, 1-9 · R · X | LB/RB · R3 · View | tap the weapon box · RELOAD · HEAL |
| Map | M | Pause menu → Map | tap the radar |
| Pause menu (map, settings, controls, debug/cheats) | Esc | Start / Menu (D-pad or left stick to move, A select, B back) | ⚙ |

Settings (⚙) include classic tank driving for keyboards, the touch fire ring, gamepad stick-fire, vibration and auto-fullscreen.
