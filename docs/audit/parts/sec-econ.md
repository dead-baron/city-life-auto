# Security audit - money, items and duplication

Scope: the messages that move money or items (`server/session.js` route, `server/launch.js` hooks.message), the shop menu
(`economy.handleMenu` / `execute`), the bag (use, quick slots, drop, give), bail, the phone's money actions, and the money
systems (homes, mortgage, biz, casino, race book, street dice, minigames, FTUE, starter / first car, bounties, crews, valet,
taxi, extraction, hot money). Read on branch `audit-security`; nothing in the game changed.

Proof scripts (report-only, print what happened, never fail):
- `tools/audit/sec-econ-prices.mjs` - every item a counter sells for less than a counter buys it back (no world built; instant).
- `tools/audit/sec-econ-probe.mjs` - builds the small test city once (`test/helpers.js`) and drives the real handlers the
  way a page's messages do: the fruit-stand loop, the build-mismatch hello, odd bag-drop ids, buying far away / in cuffs,
  the FTUE replay, the city-bounty loop. `node --max-old-space-size=3072 tools/audit/sec-econ-probe.mjs`

| # | Issue | Severity | How a player does it | File:line | Suggested fix |
|---|---|---|---|---|---|
| 1 | Shops buy back for more than they sell: apples, oranges, grapes, butcher's meals | **critical** | Normal page: at the Orchard Fruit Stand buy "Crisp Apple x3" ($4), "Sell Crisp Apple" pays $5 each - +$11 per click, same counter, no stock limit. A script at the 10 menu/s rate limit makes ~$350k an hour | `shared/items.js:450` (fruitstand: apple 4/3, sells 5; orange 5/3, sells 6), `:451` + `:449` (grapes 2 for $8 at the market, winery pays 10), `:476` (butcher: venison 28 -> 29, bear stew 34 -> 40, turkey 22 -> 25); paid at `server/systems/economy.js:699-708` | Sell prices below the cheapest buy price per unit, after the "Loved" discount (`REPUTATION.shops.loved` 0.9). Add a test that runs the price check (`sec-econ-prices.mjs` is that check) |
| 2 | FTUE "Replay the arrival" pays the first-goal reward every time | **high** | Normal page (the Guide's Replay button) or `{t:'intro',a:'replay'}`: skip, answer "hustle" standing at a fence with a car of your own out, open the fence's menu: +$100 (`FTUE.reward`) each round, a couple of seconds a round. Probe: 5 rounds, $0 -> $500 | `server/systems/ftue.js:373-379` (`complete` pays with no once-guard), `:403-407` (replay), goal from where you stand `:159-162` | Pay `FTUE.reward` only once a character (a `f.rewarded` flag like `f.paid`, `:329-336`), or never on `f.replay` |
| 3 | A modified hello skips the drop rule and the ghost body (combat logging) | **high** | Modified page: hello with `cb:'x', cbt:0`. The server marks the session "updating"; closing the tab while wanted / carrying cash, hot money, guns or a crate takes the character out at once - no 30 s ghost body to kill or arrest, nothing dropped, the stars gone on return. Probe: wanted 5, $5000 and 3 med kits kept; the honest control dropped everything | `server/session.js:109` (page-supplied `cb`/`cbt`), `server/systems/players.js:291-295` (`updateDue` from them), `:311` (`updating`), `:401-408` (no ghost, `finalizeLogout(…, false)`), `:1141` | Don't trust the page's build for this: only `p.build !== world.build` (the server's own record) or a build announced after the session joined (`announceBuild`) may skip the drop rule; or keep the drop rule whenever `!safeToIdle` |
| 4 | City bounty farmed on a friend: kill, revive, one small crime, kill again | **high** | Two accounts: the friend gets 4-5 stars, a licensed hunter (or on-duty cop) downs them (+$2000-2500 from the city, killing a bounty target is no murder), revives them with a Revive Kit - the stars come back - the friend punches anyone and `cityBounty` is reset to 500 x stars. Probe: 3 rounds, hunter's bank 0 -> $7500, licence kept | `server/systems/law.js:465` (bounty re-set on any heat at 4+ stars), `server/systems/revive.js:163` (stars restored), `server/systems/bounties.js:156-168` (paid from nothing) | Once collected, no city bounty on that player for a while (a `cityPaidAt` cooldown on the target, and none for the same hunter/target pair); or restore the stars on revive without re-arming the city's bounty |
| 5 | Race prize grows with racers who forfeit | medium | Alts (any cheap vehicle) join a race and drive off; the one who finishes gets `prize x n x 0.6` with n counting the forfeits. No entry fee | `server/systems/races.js:76-80` | Count only finishers (or racers past the first checkpoint) in `n` |
| 6 | Soccer / beach-volleyball prize by forfeit | medium | Two accounts on a pitch: the match starts after 5 s, one quits (phone Quit or gets in a car), the other wins $100 (`MATCH_PRIZE`) "last team standing"; ~12 s a round, about $25k an hour - under the anti-cheat's 50k/h flag | `server/systems/minigames.js:218-219, 157-161`; quit `activityquit.js:41` | No prize for a forfeit win (or only once a minimum time / score is played), and a cap a day |
| 7 | Start fresh (and new guests) are a money faucet | medium | Each fresh character: $200 cash + $500 bank (`store.js:25-26`) + FTUE $450 + $100. Withdraw, get killed by your main (death drop: `cargo.js:313-328`) or ride in your main's cab (`taxijob.js` meter paid to the driver). Start fresh has no cooldown (`session.js:173-181`, rate 1/s) | `server/systems/players.js:497-525`, `server/systems/ftue.js:329-336` | A cooldown on Start fresh per account (a day), and a fresh character's grant marked as such (e.g. not droppable / transferable for its first hour) |
| 8 | Buying at a counter in cuffs / under arrest | low | `handleMenu` checks dead / in a vehicle / distance, not `ped.cuffed` or `p.custody`. Probe: a buy went through in cuffs | `server/systems/economy.js:601` | Add `ped.cuffed || p.custody || p.prison` to the guard |
| 9 | Bag Drop accepts object-prototype ids | low | `{t:'inv',a:'drop',id:'constructor'}` (or `toString`, `__proto__`): "accepted", a bag with a NaN junk key spawns; no gain, junk in bags / logs | `server/systems/cargo.js:359-367` (`prof.inventory[id]` reads the prototype; `ITEMS[id]` too) | `Object.hasOwn(ITEMS, id) && Object.hasOwn(prof.inventory, id)` first (the same in `useItem`, `economy.js:1027`) |
| 10 | Arcade scores are the page's word | low | Modified page sends the cap every game: 40 tickets for $2 (STARFALL in ~67 s), $1 skee / pinball. Tickets only buy prizes (glow stick ... skateboard, decor); the prize items sell for $1-14 | `server/systems/arcade.js:218-284` | Known by design (capped). If tickets ever buy anything sellable, revisit |
| 11 | Rhythm-game timing is the page's word | low | `msg.o` decides every grade: perfect sets, more tips. Tips are capped an hour | `server/systems/music.js:336-343, 453-458` | By design (capped); fine for the beta |

## Details

**1. The buy-back loop.** `economy.execute` `'i'` charges the menu's price for `qty` (apples: `i:apple:4:3`), and `'s'`
pays `sellPrice(shop, id) * n` into the bank (`economy.js:699-708`). The fruit stand's own `sellPrice` (apple 5, orange 6)
is above its own per-unit price (1.33, 1.67). The butcher's `payFor(…, 1.8)` puts the cooked meals' buy-back above its own
shelf price. Probe 1: 20 buys then one sell, money $100 -> $320. Being "Liked"/"Loved" in the district (`reputation.js
adjustMenu`) widens every margin by 5-10 %. The money watcher (`moneywatch.js`) notes it as `shop:fruitstand` and the
anti-cheat flags past $50k an hour, but nothing stops it. Both shops exist in World v3 (`shared/world3-towns.js:80, 90`).

**2. FTUE replay.** `pay` (the answer's cash) has `f.paid`; `complete` does not. A replay's goal is chosen from where you
stand (`goalFor(world, ans, st.x, st.y)`), so standing at a fence the goal's steps 2 and 3 are done at once (step 1 is
skipped when you have a car out, `myCar`). For the "work" answer, taking and cancelling a mail round does it too
(`jobDone`). Each round also gives driving XP (`FTUE.xp`).

**3. The drop rule.** `noteClientBuild` sets `p.updateDue` from the hello's `cb` / `cbt`, both the page's. With
`updateDue`, `leave()` calls `finalizeLogout(world, p, false)` straight away: the body is removed, `savePos` keeps the
spot, nothing is jettisoned, and the next join spawns with `wanted = 0` (`spawnPlayerPed`). In custody it still books
them (`custody.onLeave`), so only the chase and the drop are escaped - but that is the robbery / extraction loop's whole
risk. The safe exit (`logoff.js`) is likewise moot. Probe 2 shows it and the honest control.

**4. City bounty.** The kill path is `combat.js:569` `law.onKill` -> `bounties.collect` (pays and zeroes `cityBounty`),
then `players.onPedDeath` saves `downWanted` with city 0. The revive restores `wanted`/`heat`; the next `addHeat` (any
crime, even a punch) sets `cityBounty = 500 x wanted` again (`law.js:465`). The reviver also gets +5 Samaritan each time
(`revive.js:171`), which is what the hunter licence and the police sign-up ask for.

**5-7.** Collusion / alt loops; each needs a second account (guests are free), so medium. They are the same shape:
prizes created from nothing on an outcome other players can hand you.

## Checked and fine

- **Menu picks are whitelisted.** `execute` (`economy.js:616-621`) only runs an option id that is in the menu it builds
  for you right now (prices, amounts and indexes are inside the id), and refuses `dis` rows; biz (`biz.js:490`), home
  upgrades (`homeups.js:381`), at home (`homeinside.js:473`), music (`music.js:173`) do the same. So `Number(msg.poi)` /
  `String(msg.opt)` with NaN, negatives, "1e9", `__proto__`, arrays: "not available". ATM `wd:` / `dep:` amounts come only
  from the menu (`economy.js:297-299`).
- **Distance and state:** `handleMenu` refuses dead / in a vehicle / > r+40 px from the counter (probe 4: 2000 px away
  refused); biz and its truck check reach (`biz.js:480, 486`); homeups (`homeHere`), at-home menus (`ped.hidden`, the
  building's door), looks' counters (`looks.js:147-151`), the FTUE question (`ASK_POI` only in `st === 'ask'`).
- **Selling:** every `s:` row sells your whole stack at the counter's price once, then sets it to 0 (no double sale);
  weapons sell at 40 % of the shop price and only `stashable` ones (police issue can't be sold, `arms.js:45`).
- **Wardrobe buy** (`looks.js:165-194`): ids filtered to integers, sold at that store, not owned, max 12, total charged
  before granting. Cuts charged before wearing.
- **Bag:** use / heal checks the count first (`economy.js:1026-1052`); quick slots validate the index and usable ids;
  drop clamps `n` to 1..have (`-5`, `1e9` fine, probe 3); give needs a crewmate in reach and moves the weapon (no copy).
- **Phone money actions:** valet pays once, refunds once on failure (`mycar.js:116-160`); upkeep / insurance by index go
  through the same payer; bounties: placed only on a 3-kills-in-an-hour killer, from a fixed list of amounts, from the
  bank (`bounties.js:102-113`); crew bank: fixed `CREW.put`, payout only by the lead and floored.
- **Homes / mortgage / biz:** sale = 60 % of the price (penthouse discount is 25 %, so no loop), the mortgage's owed paid
  first; upgrades and materials back at 50 %; a business back at 60 % (`BIZ.sellBack`); the owner gets no cut of their own
  bar or shop (`biz.js:362-367`).
- **Casino:** server-side cards and wheel from `crypto.randomInt` (`casino.js:20`); video poker 8/5 (~96 %), slots ~95 %,
  blackjack 3:2 with no split; a hand open at logoff is played out (`players.js:448`). Race book: seed drawn at the off
  from system randomness, bets only while betting is open, stake from a fixed list, 3 a race (`racebook.js:52-61, 80`).
  Street dice: cash on you, the crew's pot bounded.
- **Second tab / reconnect:** `players.join` reuses the one player object and kicks the old socket; the old session's
  close is ignored (`session.js:208`, `player.conn === conn`). One process, one tick at a time: no two-message races found.
- **Bail** (`custody.js:816-826`): only in a cell, charged before release. Logging off in custody books you; offline
  time doesn't count.
- **Extraction / hot money:** crates pay once and are removed (`extract.js:84-95`); stashed crates keep their stolen flag
  and trip check; hot money is fenced / banked only through menu rows.
- **Free cars:** no vehicle can be sold back for money (dealer, used lot, starter, the alley car), so a free car is not
  cash.
- **Debug / dev commands** pass only in dev mode or for an admin role, asked per command (`session.js:201`).
