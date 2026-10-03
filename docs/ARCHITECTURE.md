# Architecture

## Principles

- **Authoritative headless server.** Every game rule runs on the server: movement collision, combat, heat, faction state, drops, timers, saving. The browser sends input vectors and draws what it is told.
- **Shared deterministic code.** `shared/` holds the city generator, movement physics and wire protocol. Both sides generate the identical map from a seed, so the map is never downloaded. The client runs the *same* physics only to predict its own character or car between snapshots. The server still decides.
- **Zero dependencies.** The WebSocket server (`server/ws.js`), renderer, math and audio are hand-written. Nothing needs installing beyond Node.js.
- **Object pooling.** Particles (900) and decals (700) are fixed pools; character sprites are composited once per outfit/pose/frame and cached.

## Tick (20 Hz, `server/world.js`)

Each system runs isolated in a try/catch; one failure never stalls snapshots.

| # | System | File | Responsibility |
|---|---|---|---|
| 1 | environment | systems/environment.js | 20-min chrono loop announcements, rare rain |
| 2 | inputs | systems/players.js | apply queued player inputs, context interactions |
| 3 | npc | systems/npc.js | pedestrian demographics, wandering, reflex dives, fight/flight, gangs, snatch-and-grab |
| 4 | traffic | systems/traffic.js | lane-following drivers obeying lights, parked cars, docked boats |
| 5 | police | systems/police.js | dispatch to search circles, pursuit, tasers → firearms → SWAT, arrests |
| 6 | ems | systems/ems.js | ambulance dispatch, 3 s revival, 45 s hard despawn |
| 7 | vehicles | systems/vehicles.js | vehicle physics, ramming, ped strikes, bikes, hydrants, wrecks |
| 8 | combat | systems/combat.js | projectiles, reloads, bleeding + blood footprints, regen |
| 9 | cargo | systems/cargo.js | crate physics, slots, carried crates, loot bag expiry |
| 10 | law | systems/law.js | heat decay, search radius growth, camera pings, contraband checks |
| 11 | jobs | systems/jobs.js | contraband drops, job expiry, fishing bites |
| 12 | economy | systems/economy.js | ER reception auto-heal |
| 13 | players | systems/players.js | ghost timers, respawns, prompts, position saves |
| — | net | net.js | culling + snapshot fan-out |

## Net-culling (GDD §15)

The world is split into 24×24-tile chunks (768 px). A client receives entities, spawn descriptors and positional events only from its chunk + the 8 neighbours. Each entity is encoded once per tick; a client gets a record only if it changed since that client's last snapshot, with a 1 Hz refresh for static things (parked cars, bodies, crates).

Measured on this dev container with `npm run bots -- 100 40 <url> --spread`:
100 players, ~1,300 entities, **avg tick ~19 ms of a 50 ms budget**, ~35 KB/s per player, 0 errors.

## Wire protocol (`shared/protocol.js`)

Binary frames (little-endian):

**Input, client → server, 11 bytes, 20/s**
| off | type | field |
|---|---|---|
| 0 | u8 | 1 = MSG_INPUT |
| 1 | u32 | seq |
| 5 | u16 | action bits (`shared/input.js` IN.*) |
| 7 | i8 | move x ×127 |
| 8 | i8 | move y ×127 |
| 9 | u16 | aim angle (0..65535 = 0..2π) |

**Snapshot, server → client, 20/s**: header 68 bytes (tick, acked input seq, chrono loop time, weather, control kind + id, own authoritative state for reconciliation, entity count) followed by 23-byte entity records:
`u32 id, u8 kind, u16 flags, f32 x, f32 y, u16 angle, u8 hp%, u32 parent, u8 extra`.
`flags` meanings are `PF.*` (peds) and `VF.*` (vehicles) in `shared/constants.js`.

JSON text frames:
| `t` | direction | purpose |
|---|---|---|
| `hello` / `welcome` | c→s / s→c | guest token handshake (`{token}` → `{token,pid,name,seed,dev}`) |
| `sp` / `ds` | s→c | spawn descriptors (appearance, model, paint, tier) / despawns for culling |
| `ev` | s→c | positional events (shots, blood, crashes, explosions, cameras, toasts) |
| `me` | s→c | personal HUD state (money, stars, weapons, inventory, prompt, radar, job) |
| `menu` | both | storefront menu payload / option chosen |
| `weapon`, `ping`, `dev` | c→s | weapon select, latency probe, playtest commands (dev servers only) |

## Accounts and saving

- Guest token = `base64url(payload).HMAC-SHA256(secret)`, stored in the browser's localStorage. Forged or edited tokens are rejected, and a new guest is created.
- Profiles (cash, bank, Criminal EXP, Samaritan points, felonies, peak wanted memory, weapons, inventory, outfit, owned vehicles, position) live in `data/profiles.json`. The file is written atomically (temp + rename) every 5 s when anything changed, and on SIGTERM/SIGINT.
- Next step (M9): Discord / Google sign-in that attaches an existing guest profile to an account.

## Rules decided during the build (tunable)

| Topic | Decision |
|---|---|
| Disconnect | 30 s ghost body (GDD §9). Reconnecting inside the window resumes it; otherwise everything carried drops in a value-tiered bag. Bank money is always safe. |
| Death | Respawn at St. Neon General after 5 s; badge and hunter license stripped; peak wanted memory reset. |
| Self-defense | Whoever is struck first may retaliate for 60 s without a report. Attacking flagged outlaws/bounty targets and gang members in turf is immune. Turf attacks alert the gang. |
| Heat | Stars at 10/30/60/100/160 heat. Out of sight 3 s → search circle grows; heat decays, faster after 20 s unseen. |
| Peak wanted | Survives logout; cleared by death or arrest; decays one star per 10 min clean. |
| Disguise | Clothing store or garage respray clears public stars only if no cop has eyes on you. The next witnessed infraction snaps heat back to the cached peak. |
| Enforcer badge | 25+ Samaritan points and zero felonies. Misconduct costs Samaritan points; dropping below 25 fires you for 10 min. |
| Bounty | Only on someone who attacked/robbed you in the last 30 min, paid from your bank, expires after 30 min; criminals can't place them. 4+ stars adds a city bounty. |
| Carjack | 50% of NPC drivers flee screaming, 50% fight back and can drag you out of the seat. |
| NPC simulation LOD | NPCs, traffic and parked cars only exist near players and despawn when nobody is around. |
