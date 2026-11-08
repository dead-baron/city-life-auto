# City Life Auto: progression and long-term design (owner-approved 2026-11-07, "Yea I think this works let's put it in")

Source: the Claude Doc "City Life Auto — Progression & Long-Term Design" (https://claude.ai/artifact/1poBqkLF2df5QHPXsbHwB1).
The owner approved it as written, including every default in "Decisions needed".

## The problem and the answer
The game has many systems, but nothing turns them into a reason to come back tomorrow. This plan adds that, built almost
entirely from systems that already exist. The first ten minutes now work (train arrival, question, first car); after that
the game goes quiet: no rank to climb, no one asking for anything, no event tonight, and money with nothing to spend it on.
There are three loops, one inside the other:
- **Minutes:** the next job, crime or activity (already works).
- **Session:** a career rank you can see climbing, a contact's next mission, and tonight's scheduled event. The
  "What's next" app points at all three.
- **Week/season:** daily and weekly goals, district reputation, property upkeep, and seasons with leaderboards and
  permanent cosmetics.

The big money stays with carrying valuables across town in the open.

## Careers and ranks
Three careers, each with 8 ranks. Rank comes from career XP, which the game already hands out.

| Career | Ranks, low to high | XP from | Unlocks |
| --- | --- | --- | --- |
| Crime | Corner Kid, Hustler, Booster, Enforcer, Lieutenant, Captain, Underboss, Kingpin | Criminal EXP (robberies, car theft, fencing, heists, hot cargo) | Better fence prices, black-market stock (drill, armor tiers), own crew, heist contracts, a hideout, the Kingpin title over your name |
| Police | Recruit, Officer, Corporal, Sergeant, Detective, Lieutenant, Captain, Chief | Arrests, bounties brought in alive, dispatch calls, on-duty Samaritan points | Motor pool vehicles (interceptor, K9, helicopter at Captain), dispatch priority, detective tracking tools, a station office |
| Business | Vendor, Shopkeeper, Owner, Proprietor, Landlord, Investor, Mogul, Tycoon | Clean money earned (jobs, shop takings, rents), property owned | Bigger loans, commercial property, 2nd/3rd business, staff to run a shop while away, a penthouse |

- **Side careers** (fishing, mining, racing, farming, arcade) keep their own skills and records. They feed the main
  three through money and XP, with no ladder at launch.
- **One character can climb all three.** Crime and police pull against each other: a high wanted rating locks police
  duty, and a cop who commits crimes loses police XP.
- **Each rank-up is a moment:** a phone call from your contact, a title card, the unlock shown right there.
- **Existing police ranks** become the first five of the police ladder, so nothing is lost.

## The "What's next" app
A phone app that always shows three cards, picked for your rank, path and location. It takes over when the first-time
experience's third step is done.
- **The three cards:** one from the main career ("Captain Reyes has a job: ..."), one from daily goals, and one
  happening near you ("Armored truck leaves First Pixel Bank in 4:00").
- **One button per card:** waypoint, call the contact, or accept.
- **Ranking:** the server ranks by fit to rank/path, distance, novelty and pay per time. A card skipped twice drops
  for the day.
- **New activities:** one card in five suggests something never tried.
- **HUD:** a dot on the phone icon when cards change, plus one fading line the first time each session. Nothing more.
- **Progress:** each career's rank bar and next unlock sit at the top of the app.

## Daily and weekly goals
|  | Daily | Weekly |
| --- | --- | --- |
| How many | 3 | 1 |
| Size | 5-15 min each | 1-2 h over the week |
| Picked from | main career (1), any career (1), a side activity (1) | main career, scaled to rank |
| Reward | cash + career XP; all 3 adds a bonus | a crate of your career's tier delivered home, plus a cosmetic token |
| Reroll | one free a day | none |

**Examples:**
- **Crime:** fence $2,000 hot money; steal a car at 2 stars and lose them; rob a store without hurting anyone.
- **Police:** 3 arrests; a bounty alive; 2 dispatch calls.
- **Business:** rent from 2 properties; a forklift shift; sell $1,500 of fish.
- **Side:** a 10 lb+ fish; win car soccer; bowl a strike.

**Rules:**
- A streak builds the bonus up to day 7. A missed day pauses the streak for one day before it resets.
- No goal requires another player; there's always a solo route.
- Skill XP keeps its daily caps.

## Contacts and mission chains
Six contacts, two per career, each with 6-8 missions built from existing systems, ending in something you keep.

| Contact | Career | Who | Chain ends with |
| --- | --- | --- | --- |
| Rosa Vance | Crime (early) | Runs Lucky Pawn in Southside; sharp, funny, owes everyone | A Southside lock-up of your own + Hustler-to-Booster |
| "Deacon" Marsh | Crime (late) | Old-school fixer at Port Westport docks; never raises his voice | The Port job: a heist chain on a cargo ship, a carbon-gold haul, the Underboss title |
| Sgt. Dana Okafor | Police (early) | Training sergeant, Midtown precinct; by the book, quietly kind | Your own patrol car + the Corporal badge |
| Captain Luis Reyes | Police (late) | Runs the detective squad; long game against Deacon | Bringing down Deacon's crew (mirror of the crime chain), a detective's office, the Captain rank |
| Mae Holloway | Business (early) | Owns Park West Motors and half of Park West Lane | A discounted storefront lease + your first business |
| Victor Lin | Business (late) | Developer with towers downtown | A share in a tower, rent you collect, the Tycoon title |

- **Missions are gated by rank.** Contacts call or text you, and each mission then shows as a card in "What's next".
- **Deacon's and Reyes's chains cross:** a cop and a criminal on those chains at once are pointed at each other.
- **After the chain,** each contact keeps giving short repeatable jobs at rank, with rotating twists.

## Extraction and scheduled events
Big money comes from visible, vulnerable trips, and announced events make the trips cross.
- **Payouts:** tiered crates carry the big payouts, paid only on delivery (a fence for criminals; the bank vault for
  police and honest haulers; or home to stash). Losing a crate on the way loses the payout.
- **Visibility:** a gold-tier carrier shows on every player's minimap for the whole trip (route hidden). Iron and steel
  show only nearby. The owner accepted this default.
- **Three sides:** criminals take crates, police recover them for a reward, and bounty hunters escort or chase.
- **Safe passage costs money:** an armored courier van or an escort contract (a money sink).

**Event calendar** (on the phone, as a countdown in "What's next", and as a line in the city feed):

| Event | How often | What happens |
| --- | --- | --- |
| Armored truck run | every 30 min | a truck leaves a bank with gold crates on a set route; rob it or guard it |
| Dock shipment | hourly | a cargo ship unloads steel/iron crates at Port Westport; first come, first served |
| Gang war | 2-3 a day | two gangs fight over a block; join a side or police it |
| District crackdown | daily | police double in one district for an hour; criminals pay more, cops earn more |
| Street race night | evenings | a chain of races with a cash pot |
| Car soccer cup | weekends | a short bracket at Waves Arena |

Events build on today's happenings, heist and cargo code: scheduled, announced, and big.

## Visible consequences and identity
Each district keeps a reputation score per player, from feared to loved.

| You've been | The city responds |
| --- | --- |
| Robbing shops in a district | its shopkeepers raise prices, then refuse service; a few pull a shotgun |
| A repeat offender | officers recognize you on sight at 1+ star without a witness |
| Feared (high crime, high rank) | pedestrians cross the street, small-time crooks pay respect money, gang members nod |
| A Samaritan | people wave and thank you, shopkeepers give a small discount, a witness may vouch for you once |
| A landlord/owner there | your name on the storefront sign, tenants greet you |

- Reputation fades over about a week of good behavior.
- It's per district, not global.
- The hooks exist (witnesses, Samaritan points, shop menus, NPC reactions).

## Money sinks
- **Property upkeep:** a small daily cost. Skipping it a few days makes the place shabby; after a week it's
  repossessed, with the furniture kept in storage. The owner accepted this default.
- **Vehicle insurance:** optional. An insured car comes back from the impound or a wreck for a fee; an uninsured one
  is gone. The fee rises with value and recent wrecks.
- **Safe-passage services:** courier vans and escorts for crate runs.
- **Status and cosmetics:** clothes, paint and parts, furniture, name color, title plate. Priced as goals; no combat
  power.
- **Crew costs:** hideout, upgrades, members' cut.
- **Existing fees** (bail, medical, fines, fence cut, tolls) stay and scale with rank.

Rule: a sink should feel like care, never a tax. A typical day of play covers a modest lifestyle with some left over.

## Seasons, the beta gift and the wipe
- **Length:** about 10 weeks (owner accepted).
- **Resets:** money, property, ranks and career XP, crews' holdings, district reputation (the progress-epoch reset;
  accounts, names and looks kept).
- **Carries over:** cosmetics, titles earned at the top of a ladder (with their season), skill levels at a reduced
  rate, and a season badge per season played.
- **Each season:** a theme, a new district event, one new contact or chain, a limited cosmetic set, and a few rule
  changes (e.g. a "Gold Rush" season).
- **Leaderboards:** per career (top Kingpin, Chief, Tycoon) plus side boards. The top 10 get a unique cosmetic.
- **Public beta = Season 0**, ending with the wipe before the official launch. **Launch = Season 1.**
- **Beta gift:** a "Founding Citizen" jacket and a gold "Beta" plate by your name, tied to the account so it survives
  the wipe (owner accepted).

## Build order
1. Careers and ranks, plus the "What's next" app.
2. Daily and weekly goals, inside the app.
3. The first two contacts (Rosa Vance, Sgt. Okafor) and their chains; then the other four, one at a time.
4. Extraction payouts and the event calendar, starting with the armored truck run and the dock shipment.
5. District reputation and its reactions.
6. Money sinks: upkeep, insurance, cosmetics.
7. Seasons and leaderboards, with the beta as Season 0.
