## Security: trusting the page in gameplay (sec-play)

Scope: what a modified page can do through `server/session.js` route() and the binary input (`shared/protocol.js`
decodeInput -> `players.queueInput` -> `players.js` inputsOf/applyInput), the anti-cheat (`server/anticheat.js`), combat,
custody, vehicles, the minigames, the first-time experience, and what every page is sent (`server/net.js`). Money/shops,
accounts, chat, admin and HTTP are other parts. Code read at `2b16714f`. **Proved** = a report-only script under
`tools/audit/` shows it on the test city (`node --max-old-space-size=3072 tools/audit/<script>`); nothing in the game was
changed. Unmarked items are from reading the code.

Overall: the server does decide outcomes - no system takes the page's word for who won or where it is - and range, walls,
weapons held, ammo and fire rate are all server-side. The holes are (a) the page controls *how many* simulation steps it
gets, (b) a few page-supplied flags the server believes (the build string, `title`, an input's `seq`), and (c) free resets
of protective or rewarding states.

| # | Issue | Severity | How a player does it | File:line | Suggested fix |
|---|---|---|---|---|---|
| 1 | Combat-logging escape: a page that claims an older build skips the ghost body and the drop rule | **high** (proved) | hello with `cb:'x', cbt:0` -> `updateDue`; then, wanted and mid-fight, close the tab: the body vanishes at once, cash/items/guns kept | `server/session.js:109`, `server/systems/players.js:291-295, 311, 401, 1142` | Only skip the drop rule for sessions the server itself announced a build to (`announceBuild`) after they joined; never from the hello's claim. At least keep the drop rule when `!safeToIdle` |
| 2 | Double-speed stepping: 2 inputs a tick are stepped 2 a tick, under every anti-cheat limit | **high** (proved) | send 40 inputs/s (limit 75): queue stays >3, server steps 2 a tick. Running 350 px/s and sprinting 413 px/s on foot, never flagged (allowance 480); cars at <~70% top speed unflagged; also doubles everything per-step: struggle, fishing clock, stamina, skill XP | `server/systems/players.js:644, 651-664`, `server/anticheat.js:28, 60, 77, 106` | Budget steps by wall clock (at most ticks-elapsed + small slack per player; drop the surplus), or keep the catch-up but subtract it later; cap per-second steps at 20 + jitter |
| 3 | Scripted struggle always breaks free from the police | **medium-high** (proved) | press FIRE every allowed tick, hold between, swing the stick every 3 ticks: free from one cop at 5 stars 33% (1 input/tick) / 77% (2/tick) vs 0% for a human thumb; 4 stars 55% / 98% vs 3% | `server/systems/struggle.js:34, 95-112` | Cap the meter's gain per tick (count each tick once however many inputs), wriggle at most once per tick, press cap ~7/s; fix #2 |
| 4 | Endless damage immunity from the Guide's "Replay the arrival" | **medium** | `{t:'intro',a:'replay'}`, `skip`, `skip`, repeat every 16 s: `homes.protect` each time - immune to all damage and police takedowns; usable mid-fight (only wanted/vehicle/job/inside are refused) | `server/systems/ftue.js:262, 403-408`; `combat.js:519`; `police.js:233` | No protect on a replay; a cooldown; refuse after recent combat (`players.lastFight`) |
| 5 | Any clothing piece (police uniform, season gifts) granted in the free first-session look | **medium** | new account sends `{t:'look',a:'set',c:<code with issued/gift pieces>}` while `lookPicked` is false: `wear(..., give=true)` adds them for good | `server/systems/looks.js:269-275`; `shared/lookcore.js:422-427` | In the free branch reject `issued`, `gift` and unpriced pieces server-side |
| 6 | "Changed at home" disguise works anywhere the ped is hidden | **medium** | open the home wardrobe, commit crimes, be hidden anywhere else within 10 min (a lobby, a ride...), send `look set`: `applyDisguise` clears the wanted level | `server/systems/looks.js:88, 276`; `economy.js:956` | `atHome` = `homes.ownsInside(world,p)` and the same home the wardrobe was opened in |
| 7 | Prisoner can still use counters (sign on for duty, armory exit) | **medium** (unconfirmed reach) | booking clears the stars; during the walk-in/cell stage send `{t:'menu',poi:<station>,opt:'duty:on'}` then `armexit` to the motor pool; `handleMenu` and `goOnDuty` don't check custody | `server/systems/economy.js:592-605`; `law.js:843`; `station.js:68,103`; `custody.js:656` | Refuse every menu (bar bail) and item use while `p.custody`, `ped.cuffed` or `p.struggle`; `goOnDuty` refuses custody |
| 8 | Fishing tells the page a legendary is on the line at cast, recast is free | **medium** | cast, read `leg`/`diff` from the `me` message, reel in (free, bait only used on hook), recast till legendary | `server/systems/fishing.js:307, 317, 382` | Send `leg`/`diff` only once hooked; or spend bait on cast / recast cooldown |
| 9 | Arcade/rematch tickets and STARFALL leaderboard from page-claimed scores | **low-medium** | `{t:'arcade',score: secs*60}` -> max 40 tickets per $2 game and any STARFALL high score (public season board) by keeping a credit open; pool/hockey `again` rematches free, forfeit hands the win (30 tickets) - two accounts farm; pool best = 1 shot | `server/systems/arcade.js:264-283`; `poolmatch.js:110-113,159,175`; `hockeymatch.js:96,139,156`; `seasons.js:107` | Cap a credit's life; drop STARFALL from the board or validate with a server-checked replay; charge rematches, no tickets for forfeits/short games |
| 10 | Perfect meter power from one input with a jumped `seq` | **low** | hold fire, send one input with `seq` + N: charge = `(seq - pressSeq)*DT` - perfect bowling/golf/hoops power | `server/systems/bowling.js:120`, `golf.js:80`, `hoops.js:63`; `players.js:590` | Count server steps, or cap the seq gap per input (+3) |
| 11 | Rhythm game trusts the page's timing offset | **low** | send `{t:'mus',a:'hit',i,o:0}` for each note inside its server window: every hit "perfect", max crowd/tips | `server/systems/music.js:335-345` | Judge by server arrival time with a latency estimate, or cap tips per set |
| 12 | Cinematic follow of "Police helicopter" / "Ambulance" tracks wanted / downed players anywhere | **low** | `{t:'cine',f:'policeair',near:false}`: the camera and net window (x1.9-2.4 zoom) follow the unit that follows a wanted player; position sent in `cinef` and the snapshot | `server/systems/cinefollow.js:97-98, 448-462`; `server/view.js:48, 64-70` | Exclude units whose target is a player (as `anyPlayerIn` does for cars), or no cine follow for players in play |
| 13 | Who's online lists every player's district and wanted level | **low** | `{t:'plist'}` 3/s: role, stars and district of everyone not indoors | `server/devmode.js:125-127` | Drop the district (or only for crewmates/police on duty) |
| 14 | Wallhack/ESP and aimbot are possible | **low** (inherent) | everything in the net window is sent regardless of line of sight, incl. hp, weapon and players hidden indoors (blink 3, with name); the server trusts the aim angle | `server/net.js:62-74, 170-196` | Accept for beta; optionally cull players behind walls / hidden players from strangers |
| 15 | Smaller ones | **low** | melee has no wall check (plasma reach 42+r crosses a 1-tile wall/fence: `combat.js:121-129`); ambulance fee taken later as `max(0, bank-fee)` (`revive.js:85,151`); surrender when not wanted = trip home in ~3 s (`unstuck.js:149`); idle kick reset by any JSON message (`session.js:125`); title flag `!!msg.title` in-world skips barber/mirror rules (`looks.js:126,271`); tennis pro / skate sessions pay with no cost or cooldown (`tennis.js:150`, `skate.js:492-506`) | as listed | as listed: LOS for melee; hold the fee at call; honour `title` only with no `p.ped`; cooldowns |

Already with the economy auditor (only referenced): FTUE replay pays `FTUE.reward` and gear again (`ftue.js:346-354,
373-376`); race prize counts racers who quit (`races.js:77-80`).

### Details

**1. Build claim -> no ghost, no drop (proved: `tools/audit/sec-play-combatlog.mjs`).** `noteClientBuild` sets
`p.updateDue` when the hello's `cb` differs from `world.build` and `cbt` is 0 or older (`players.js:294`). The live server
always has a build (version.json, `server/index.js:66`). `leave` then takes the `updating()` branch (`players.js:401`):
`finalizeLogout(world, p, false)` - the body is removed at once, nothing dropped. Script: wanted, mid-fight, $5000 on
hand. Honest page: 30 s ghost, cash $0 after. Page claiming `cb:'old'`: no ghost, $5000 kept. This defeats the safe-exit
design ("combat-logging never saves you", `logoff.js:5`), robberies and police chases.

**2. Two steps a tick (proved: `tools/audit/sec-play-speed.mjs`).** `inputsOf` steps 2 inputs when more than 3 are
queued (`players.js:644`), so a page that always sends 2 a tick keeps getting 2. The input limiter only drops above 150/s
and flags above 75/s for 3 s (`anticheat.js:102-107`). The movement audit allows `max(aSprint, rollSpeed) * 1.6 = 480 px/s`
on foot (`anticheat.js:60`), so a doubled run (350) or sprint (413) is never flagged; a doubled sedan at full throttle
(1117 px/s) is flagged `speed` - flagged only; `audit()` never stops or corrects (`launch.js:302`, `anticheat.js:4`).
Everything that runs per input step also doubles: `struggle.input` held/stick (`struggle.js:104,108`), the fishing fight
clock (`fishing.js:263`), stamina, `practise` skill XP (`players.js:669-677`), vehicle and aircraft physics.

**3. Struggle bot (proved: `tools/audit/sec-play-struggle.mjs`).** Same harness as `test/struggle.test.js` thumbOdds; 60
tries each, one cop: 3 stars human 32% / bot 100% / 2x bot 100%; 4 stars 3% / 55% / 98%; 5 stars 0% / 33% / 77%. The
custody/vehicles reviewer also notes items (a meal, an energy drink) can be used while held (`session.js:144` ->
`economy.js:1026`), raising strength ~1.0 -> 1.34.

**4. Replay immunity.** `arrive()` always calls `homes.protect(world, ped, FTUE.arriveS + 3)` (`ftue.js:262`), and replay
is allowed whenever the player isn't wanted, driving, on a job or inside (`ftue.js:405`) - not after a fight. Protection
makes `damage()` return early (`combat.js:519`). Skipping twice ends the run so it can be replayed again. A victim not yet
wanted (or a bounty target) is unkillable; while protected the player can't attack on foot (`combat.js:52`) but can drive
into people.

**12. Cinematic follow.** `candidates()` drops players themselves (`cinefollow.js:132`) but `policeair` lists every police
helicopter, and each one is up for, and follows, one wanted player (`policeair.js:67`). `focusOf`/`cineRect` put the
follower's net window on it (`view.js:32, 48`), so the wanted player is in the snapshot wherever they are. Available to
every player (F2/F4, `client/main.js:1716`).

### Checked and fine

- **Input decoding**: axes are int8/127, aim uint16 -> [0, 2pi]; no NaN/Infinity can arrive (`shared/protocol.js:25-33`,
  `shared/input.js:82-84`). Old `seq` values are ignored; the queue is trimmed to 8 with presses kept. No dev-only input bits.
- **`view`**: clamped to 200..1100 x 150..700 (`server/view.js:17-24`) - no whole-map view, no DoS.
- **Combat**: fire rate by `ped.nextAttack` on the server clock (not per step); range from the weapon table; hitscan stops at
  walls (`rayTiles`), spray/flame check LOS; `selectWeapon` only takes weapons you carry (`combat.js:653`); ammo and mags
  server-side; no attacks while dead, down, stunned, rolling, swimming, hidden, spawn-protected or in a cell; cuffed/held
  players' inputs go to custody/struggle only; from a vehicle only guns with AIMING; no damage to hidden, protected or
  crewmates. Grenades: fixed speed/fuse, page gives only the angle.
- **Vehicles**: entry reach, level and locks server-side, called cruisers locked to their officer, police SWAT/air by rank,
  stealing is always a crime (`vehicles.js:595-648`).
- **Custody/law**: breakouts gated by stage, an officer, a retry wait and worsening rolls (`custody.js:495-539`); bail only in
  a cell at the server's amount; surrender refused in custody; leaving mid-struggle/custody cuffs/books you.
- **Revive/down**: every call needs really being down; cancelling never wakes you early; one ambulance per time down.
- **`respawn`**: the string only selects among `h:<i>` (any hospital - all are offered anyway), your own homes and businesses;
  police kills forced to a hospital (`homes.js:286-315`).
- **Unstuck**: refused wanted, in custody, in a fight (20 s), riding, in a vehicle; moves a few metres to street-connected
  ground (gates count as walls) (`unstuck.js:25-35, 156-180`).
- **Logoff**: refused while wanted, down, in custody, within 60 s of combat, in a vehicle/riding; moving or being hurt cancels
  (`logoff.js:24-41, 75-90`). Bounties pause while offline by design.
- **Cruiser call**: officers on duty only, one at a time, cooldown. **Interiors**: need the server's own interior state, cells
  excluded, armory needs a badge, homes need ownership.
- **Minigames**: pool shots, air-hockey puck (mallets clamped), chess legality, bowling/golf/hoops/tennis/surf/skate physics,
  race checkpoints and the fish itself are all decided on the server. FTUE start cash once. Saved looks your own, capped.
  Safety toggle affects only you. Phone valet/taxi/jobs/crime reports server-checked; nothing in the phone teleports or
  reveals other players.
- **Rate limits**: every message kind has a per-second cap, 120 messages/s total, sockets closed after 5 s of flooding
  (`session.js:57-58`, `anticheat.js:22-27`). (Note: `RATES.ftue` is keyed `ftue` but the FTUE route is `intro`, which falls to
  the default 20/s - harmless.)
- No admin "incognito" exists to leak; `ftueHid` hides arriving players from other pages as intended (`net.js:172`).
