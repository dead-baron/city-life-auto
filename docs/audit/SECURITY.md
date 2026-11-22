# Security and exploit audit (before the public beta)

Branch `audit-security`, code at `2b16714f`. Find and report only: no game code changed. Three focused parts carry the
full working, each with its own table, details and "checked and fine" list:
[money and items](parts/sec-econ.md) (E#), [trusting the page in play](parts/sec-play.md) (P#),
[accounts, chat, admin, HTTP](parts/sec-acct.md) (A#). Each row below names its part's item.

**Proved** = a report-only script under `tools/audit/` shows it on a local copy (127.0.0.1, temp data dir; it prints what
happened, never fails, never fixes). Run with `node --max-old-space-size=3072 tools/audit/<script>`.

## The table

| # | Issue | Severity | How a player does it | File:line | Suggested fix |
|---|---|---|---|---|---|
| 1 | One game message stops the server (proved: `sec-acct-wscrash.mjs`, `sec-acct-fuzz.mjs`) | **critical** | Join as a guest, send `{"t":{"toString":1}}`: `String(msg.t)` throws, nothing catches it, the process exits. 47 more message fields do the same. Repeat after each restart and the city stays down. A crash also skips the shutdown save (up to 5 s of progress, race-book refunds, jail sentences) | `server/session.js:95`; `server/ws.js:59,85`; no `uncaughtException` handler anywhere in `server/` (A1) | try/catch in `ws.js _deliver` (drop and log the message); process-level `uncaughtException`/`unhandledRejection` loggers; `typeof x === 'string'` instead of `String(x)` on message fields |
| 2 | One HTTP request stops the server (proved: `sec-acct-badpath.mjs`) | **critical** | `GET /%FF` - no join needed. `decodeURIComponent` throws in the async handler; the unhandled rejection ends the process | `server/index.js:95-97` (A2) | try/catch round the handler body (400 on a bad path) + the handlers from #1 |
| 3 | Shops buy items back for more than they sell them (proved: `sec-econ-prices.mjs`, `sec-econ-probe.mjs`) | **critical** | An unmodified page: Orchard Fruit Stand, "Crisp Apple x3" $4, "Sell Crisp Apple" $5 each - +$11 a click, no stock limit. Also oranges, grapes (market -> winery), butcher's meals. ~$350k/hour scripted | `shared/items.js:449-451, 476`; paid at `server/systems/economy.js:699-708` (E1) | Every sell price below the cheapest per-unit buy price after the "Loved" discount; turn `sec-econ-prices.mjs` into a test |
| 4 | Combat logging: a page that claims an old build leaves with everything (proved: `sec-econ-probe.mjs`, `sec-play-combatlog.mjs`) | **high** | hello with `cb:'x', cbt:0` marks the session "updating"; close the tab wanted / mid-fight / carrying cash, guns, a crate: no 30 s ghost body, nothing dropped, stars gone on return | `server/session.js:109`; `server/systems/players.js:291-295, 311, 401` (E3, P1) | Skip the drop rule only for a build the server announced after the join (`announceBuild`), never the hello's claim; or keep the rule whenever `!safeToIdle` |
| 5 | Double-speed stepping (proved: `sec-play-speed.mjs`) | **high** | Send 40 inputs a second (limit 75): the server steps 2 a tick for good. Running and sprinting at double speed is under the movement audit's 480 px/s; it also doubles struggle, fishing, stamina and skill XP. The audit only flags, never stops | `server/systems/players.js:644, 651-664`; `server/anticheat.js:28, 60, 77, 106` (P2) | Budget steps by wall clock per player (ticks elapsed + small slack, drop the surplus) |
| 6 | No limit on new guests; per-address limits off (proved: `sec-acct-guests.mjs`) | **high** | A script sends hellos with no token: every one makes and keeps a profile (20,000 from one address, none refused). Bots fill the 100 places and the 200-place line; at ~0.7 M profiles `profiles.json` passes V8's string limit and saving stops for good | `server/launch.js:113-121`; `server/config.js:38-40, 86`; `deploy/city-life-auto.service` (limits commented out); `server/file-store.js:51-72` (A3) | Set `CLA_MAX_PER_IP`, `CLA_CONN_PER_MIN`, `CLA_GUESTS_PER_HOUR` (e.g. 200) for the beta; keep a guest's profile only once it has played, or purge untouched guests; alert on a failed save |
| 7 | The open debug mode is on unless someone turns it off | **high** (config) | `CLA_DEV_OPEN` defaults to `1` and the deploy unit doesn't set it. If the setting is missed, every stranger can `bring`/`goto` anyone, give money and guns, and see every player's position (`plist`) - in a 13+ game | `server/config.js:63`; `server/devmode.js:18-25, 119-128` (A4) | Default closed in code (`'0'`), open it on purpose on test boxes; log the mode loudly at start |
| 8 | FTUE "Replay the arrival": the reward again, and 16 s of immunity, on repeat (proved: `sec-econ-probe.mjs`) | **high** | Guide's Replay (no modified page needed) or `{t:'intro',a:'replay'}`: each run pays `FTUE.reward` $100 + XP + a free rod and worms; `arrive()` protects for 16 s, and replay / skip / skip every 16 s keeps a player unkillable mid-fight | `server/systems/ftue.js:262, 346-354, 373-379, 403-408`; `combat.js:519` (E2, P4) | Pay the reward and gear once a character (`f.rewarded`, like `f.paid`); no protect on a replay; a cooldown; refuse after recent combat |
| 9 | City bounty farmed on a friend (proved: `sec-econ-probe.mjs`) | **high** | Friend at 4-5 stars; a licensed hunter downs them (+$2,000-2,500 from the city), revives them (the stars come back, +5 Samaritan), the friend punches anyone and the bounty re-arms. $0 -> $7,500 in 3 rounds | `server/systems/law.js:465`; `revive.js:163`; `bounties.js:156-168` (E4) | No city bounty on a player for a while after one is collected (and none for the same hunter/target pair); or restore stars on revive without re-arming it |
| 10 | Scripted struggle breaks free from the police (proved: `sec-play-struggle.mjs`) | **medium** | Press every allowed tick, hold between, swing the stick every 3 ticks: free at 5 stars 33% (77% with #5) vs 0% for a human thumb; a meal and an energy drink can be used while held | `server/systems/struggle.js:34, 95-112`; `economy.js:1026` (P3) | Cap the meter's gain per tick, wriggle once per tick, presses ~7/s; no item use while held |
| 11 | Counters and items while cuffed or in custody | **medium** | `handleMenu` checks dead / in a vehicle / distance only: buying in cuffs works (proved); a booked prisoner may sign on for duty (`duty:on`) and leave through the armory (`armexit`) - the desk's reach from a cell is unconfirmed | `server/systems/economy.js:592-605`; `law.js:843`; `station.js:68, 103` (E8, P7) | Refuse every menu but bail, and item use, while `p.custody`, `ped.cuffed`, `p.struggle` or `p.prison`; `goOnDuty` refuses custody |
| 12 | A new character's free first look grants any piece, including the police uniform and season gifts | **medium** | While `lookPicked` is false, `{t:'look',a:'set',c:<code>}` with issued/gift pieces: `wear(..., give=true)` adds them to the wardrobe for good | `server/systems/looks.js:269-275`; `shared/lookcore.js:422-427` (P5) | In the free branch reject `issued`, `gift` and unpriced pieces |
| 13 | The "changed at home" disguise works anywhere the ped is hidden | **medium** | Open the home wardrobe, commit crimes, get hidden anywhere within 10 min, `look set`: the wanted level is wiped | `server/systems/looks.js:88, 276`; `economy.js:956` (P6) | `atHome` = `homes.ownsInside(world, p)`, the same home the wardrobe was opened in |
| 14 | Fishing reveals a legendary at the cast; recasting is free | **medium** | Cast, read `leg`/`diff` in `me`, reel in, recast until legendary (server-wide broadcast, records, value) | `server/systems/fishing.js:307, 317, 382` (P8) | Send `leg`/`diff` only once hooked, or spend bait on the cast |
| 15 | Bans and mutes end with a new guest (proved: `sec-acct-guests.mjs`) | **medium** | Clear site data / private window, connect with no token (leave out the device marker `dm`): let in, chats freely | `server/launch.js:113-121`; `server/accounts.js:236, 262-267` (A5) | A short-lived list of hashed addresses for a ban's first hours; new guests from it start muted / out of chat |
| 16 | Pre-account takeover via an unconfirmed email (proved: `sec-acct-prehijack.mjs`) | **medium** | Sign up with the victim's email, link your own Google; the victim later resets the password and plays there - your Google still signs in | `server/authhttp.js:232-247, 287-313`; `server/accounts.js:96-112` (A6) | A reset/verify that confirms a never-confirmed address removes the other sign-ins (or asks); or no linking before the email is confirmed |
| 17 | Throwaway guests flush open safety items off the Review list (proved: `sec-acct-reviews.mjs`) | **medium** | 500 fresh guests report once each: the newest-500 cut drops open "asked someone's age" flags | `server/moderation.js:28-37`; `server/chat.js:422-430` (A7) | Never drop open items; fold weight-0 reports into the target's existing item |
| 18 | Names passing as the founder or staff (proved: `sec-acct-names.mjs`) | **medium** | A free email sign-up (a member) takes `Dead8aron`, `TheDeadBaron`, `St3ve`, `Admln`, `Owner`, `GameMaster`... | `server/launch.js:182`; `shared/names.js:7-8, 20-22` (A8) | Lookalike check for members too; reserved words matched anywhere in `lookKey` |
| 19 | Crew names and tags skip the word filter (proved: `sec-acct-names.mjs`) | **medium** | Found a crew named after a slur: 86 of 96 listed words pass; the tag shows by every member's name | `server/systems/crews.js:234-238, 254-262` (A9) | `filter().nameOk` on the name and the tag |
| 20 | Chat filter and contact masking bypasses (proved: `sec-acct-chatfilter.mjs`) | **medium** (13+) | Phone numbers in fullwidth / Arabic-Indic digits or with U+2060 between digits; `evil．com`; `s n a p bob_99`; `@bobby99`; one unknown look-alike letter passes 89/96 words; a split word 55/96 | `server/chat.js:157`; `server/chatfilter.js:11, 21, 153-158` (A10) | NFKC + strip every `\p{Cf}`/`\p{Mn}` before both filters; contact masking on the folded copy; a confusables fold; mask bare `gg/` codes and `@handles` |
| 21 | Collusion prizes: race forfeits, soccer/volleyball forfeits, pool/hockey rematches | **medium** | Alts join and quit: race prize `x n` counts quitters; a quitting side hands $100 (~$25k/h, under the econ flag); free `again` rematches + forfeit wins farm 30 tickets each | `server/systems/races.js:76-80`; `minigames.js:157-161, 218-219`; `poolmatch.js:110-113, 159, 175`; `hockeymatch.js:96, 139, 156` (E5, E6, P9) | Count finishers only; no prize/tickets for a forfeit or a very short game; charge rematches; daily caps |
| 22 | Start fresh and new guests are a money faucet | **medium** | Each fresh character ~$1,250 (start + FTUE); pass it to a main (death drop, taxi meter). Start fresh has no cooldown | `server/systems/players.js:497-525`; `ftue.js:329-336`; `session.js:173-181` (E7) | A day's cooldown on Start fresh; a fresh grant not transferable for its first hour |
| 23 | Arcade scores, the STARFALL board and rhythm timing are the page's word | low | `{t:'arcade',score}` at the cap: 40 tickets per $2 game, any STARFALL season high score; `mus` hit offsets all "perfect" (tips capped) | `server/systems/arcade.js:218-284`; `seasons.js:107`; `music.js:335-345` (E10, E11, P9, P11) | Drop STARFALL from the public board or check it; fine for the beta otherwise |
| 24 | Perfect meter power from one input with a jumped `seq` | low | Hold fire, send one input with `seq + N`: exact bowling / golf / hoops power (golf's $500 ace once a hole) | `server/systems/bowling.js:120`; `golf.js:80`; `hoops.js:63`; `players.js:590` (P10) | Count server steps, or cap the seq gap per input |
| 25 | Cinematic follow of the police helicopter / ambulance tracks wanted or downed players anywhere | low | `{t:'cine',f:'policeair'}`: the net window follows the unit following a wanted player | `server/systems/cinefollow.js:97-98, 448-462`; `server/view.js:48, 64-70` (P12) | Leave out units whose target is a player |
| 26 | Who's online gives every player's district and stars; wallhack/ESP inherent | low | `{t:'plist'}`; everything in the net window is sent regardless of walls (incl. hidden players) | `server/devmode.js:125-127`; `server/net.js:62-74, 170-196` (P13, P14) | Drop the district from `plist`; accept the rest for the beta |
| 27 | The WebSocket echoes pings of any size, unthrottled (proved: `sec-ws-ping.mjs`) | low | Send 60 KB ping frames (RFC limit 125 B): each comes back in full, metered against the month's data cap, not seen by the flood guard | `server/ws.js:65` | Close on a control frame over 125 B; count pings in the flood guard |
| 28 | Bug reports: one address uses the server's whole hourly allowance; text unfiltered to Discord | low | 6 per 10 min per address against 30 an hour for everyone | `server/bugreports.js:86-94, 123-125` (A11) | A per-address cap well under the global one; word + contact filter on the Discord text |
| 29 | Admin log: junk "refused" lines from guests; the hash chain is unkeyed | low | Each new guest may add a line a minute; anyone with file access can rebuild the chain | `server/admin.js:77, 129-132`; `server/adminlog.js:12` (A12) | Count refusals from role-less accounts instead of logging them; HMAC the chain |
| 30 | Sign-in lockout as a denial of service; global caps one script can use up | low | 8 wrong passwords lock an address 15 min, renewable forever; `/auth/transfer` 200 per 10 min for everyone; the passkey challenge map evicts others' | `server/authhttp.js:186-189, 277, 461`; `server/webauthn.js:186` (A13, A14) | Lock per (address, network); per-address caps only |
| 31 | Smaller ones | low | Anyone's address on the news list without confirming (A15); `/stats` public with `ACAO: *` (A16); age gate off by default and self-declared, LAUNCH-SETUP.md still says 17+ (A17); tokens never expire (A18); admins can unban/undelete what the owner did (A19); `diag` writes player text with newlines to the log (A20); melee crosses a 1-tile wall (`combat.js:121-129`); ambulance fee taken later as `max(0, bank - fee)` (`revive.js:85, 151`); surrender = a free trip home (`unstuck.js:149`); `title` flag skips barber rules in the world (`looks.js:126, 271`); tennis pro / skate sessions pay with no cost or cooldown; bag Drop accepts `constructor` as an id (E9) | see the parts | see the parts |

## Details

**The two crashes (#1, #2) come first:** either takes the whole city down from one guest, again and again, and each crash
also loses what the shutdown path would have saved. Both close at two choke points - a try/catch in `ws.js _deliver` and
one round the HTTP handler - plus process-level loggers. `sec-acct-fuzz.mjs` lists the 47 throwing fields in the launch
hooks; the game systems likely have more, which the choke points cover too. The live server restarts (`Restart=always`),
but World v3 takes about a minute to start.

**The money loop (#3)** needs no modified page and no skill. The money watcher and the $50k/hour econ flag only note it.

**Trusting what the page says it is (#4, #5, #10, #24):** the server decides every outcome, but a page chooses how many
simulation steps it gets (#5, which doubles #10) and the server believes its claimed build (#4) and its input `seq`
(#24). #4 defeats the safe-exit rule ("combat-logging never saves you") and so every robbery's and chase's risk.

**Repeatable free states (#8, #9, #21, #22):** each turns a reset or a hand-off into money, XP or immunity. They need a
second account at most, and guests are free (#6).

**Config before the beta (#6, #7, and A17):** `CLA_DEV_OPEN=0`, the per-address limits, a guest cap and
`CLA_REQUIRE_AGE=1` are environment settings in `deploy/city-life-auto.service` / the env file - DECISIONS line 31 already
calls for the first.

The parts carry the working for every row: [sec-econ.md](parts/sec-econ.md), [sec-play.md](parts/sec-play.md),
[sec-acct.md](parts/sec-acct.md).

## Checked and fine

- **Server authority over outcomes:** pool shots, the air-hockey puck (mallets clamped), chess legality, bowling / golf /
  hoops / tennis / surf / skate physics, race checkpoints, which fish bites, casino cards and wheels (`crypto.randomInt`),
  the race book's draw - all decided on the server.
- **Combat:** fire rate on the server clock, range from the weapon table, hitscan stops at walls, `selectWeapon` only takes
  weapons you carry, ammo server-side, no attacks while dead / down / cuffed / hidden / protected / in a cell.
- **Input decoding:** axes int8, aim uint16 - no NaN or Infinity can arrive; old `seq` ignored; queue trimmed to 8.
- **Menus are whitelisted:** a pick runs only if it's an option the server built for you right now (prices and amounts are
  inside the id); NaN, negatives, `1e9`, `__proto__` refused; distance to the counter checked (2000 px away refused).
  Selling sets the stack to 0 (no double sale); bag drop clamps `n`; give moves a weapon, no copy.
- **No two-message races found:** one process, one tick at a time; a second tab reuses the player object and kicks the
  old socket; the old session's close is ignored.
- **Homes, mortgage, businesses, upgrades:** sell-backs below cost; the owner earns no cut of their own shop.
- **Vehicles, custody, revive, unstuck, logoff, cruiser:** entry reach and locks server-side, breakouts gated by stage and
  rolls, bail only in a cell, unstuck and logoff refused while wanted / in custody / after a fight.
- **`view`** clamped (no whole-map view); **`respawn`** only picks among hospitals and your own homes; police kills forced to
  a hospital.
- **Debug powers at `CLA_DEV_OPEN=0`:** `dev` commands re-check the role per command; `devMode` never saved; the old
  `GODMODE` password is dead code; `grant` refuses non-admins. Roles are checked on the server for every admin message,
  ranks for kick / ban / mute; only the owner grants roles.
- **Sign-in:** OAuth `state` + nonce cookie + PKCE, listed redirect origins only; scrypt passwords, constant-time compare,
  one error for every failure; single-use HMAC'd reset links; passkeys checked properly; tokens HMAC-SHA256 with
  sign-out-everywhere generations; bans checked at every endpoint.
- **Admin web:** one-time link -> HttpOnly Strict Secure cookie, role re-checked per request, CSRF tokens, everything
  escaped, CSP; no IP, email or account id on the console. `/perf` and `/clienterrors` behind the staff login.
- **HTTP:** `/art/` and `/world/` by strict regex (no traversal); static files refuse `..` and the config / auth / word list
  files; `/capture/` only on 127.0.0.1 with `CLA_CAPTURE=1`. WS frames capped at 64 KB (fragments too), 120 messages a
  second, flooders closed after 5 s; per-kind message rates.
- **Privacy to other players:** chat ids are keyed hashes; crew, bounty and contact lists carry names, not pids; no IP or
  email reaches another player; the country only reaches the staff console.
- **Secrets:** no API keys, webhooks, client secrets, private keys or `.env` files in the repo or client code; `CLA_SECRET`
  generated 0600 when unset; nothing logs tokens, emails or addresses.
- **Proxy:** the server binds 127.0.0.1 behind Caddy (>= 2.5 replaces a client's `X-Forwarded-For`).
