// The numbers for the games of chance and the shows - Lucky Mesa's casinos, the race book, the Starlite Drive-In: the
// server's and the screens' that load later (client/racebook.js, client/drivein.js), kept out of shared/rules.js, which
// every page loads at once (tools/perf.mjs: the page's code).
// The race book (the owner's #310, horse racing: server/systems/racebook.js, shared/racebook.js, client/racebook.js) at
// Lucky Mesa's casinos: a race every everyS seconds of the world's clock, the field posted with its odds at the start of
// that, betting open betS seconds till the off, the race about runS seconds round the oval, the results up till the next
// is posted. A field of six; win bets only, at the posted odds (the house's edge: take x the fair price), the stake one of
// stakes, maxBets bets on a race; luck: how much a horse's pace wanders through the race, form: how far off (or above)
// its class it runs on the day, stumbleP: the chance one stumbles; sims: how many times the book runs the race over to price the field
// (a few at a time while the race before is on: server racebook.js), minP: the least chance it gives any runner
export const RACEBOOK = { everyS: 150, betS: 100, runS: 28, field: 6, take: 0.85, maxBets: 3, stakes: [10, 50, 250, 1000], luck: 0.06, form: 0.035, stumbleP: 0.05, sims: 2400, minP: 0.025 };
// The Starlite Drive-In (the owner's #322: server/systems/drivein.js, shared/drivein.js, client/drivein.js): after dark a
// run of `shows` features back to back on the big screen, the first at dusk, gapS seconds between them (the
// intermission); park in a stall facing the screen and tune in to the speaker for `price` a car - the night's admission
// (stay on for the rest of the bill; the others in your car ride on your ticket)
export const DRIVEIN = { price: 8, gapS: 10, shows: 5 };
export const CASINO = {
  slots: [5, 25, 100], stakes: [10, 50, 250, 1000], bjPays: 1.5, twoCherries: 3,
  // video poker (Jacks or Better): what a hand pays, x the bet - "for one", the bet included (a pair of jacks or better:
  // your bet back) - 8/5 on the full house and the flush, about 96 cents back in the dollar played well
  poker: { royal: 250, straightFlush: 50, four: 25, fullHouse: 8, flush: 5, straight: 4, three: 3, twoPair: 2, jacks: 1 },
  reel: {
    CHERRY: { w: 6, three: 10, icon: '🍒' }, LEMON: { w: 7, three: 7, icon: '🍋' }, BELL: { w: 5, three: 14, icon: '🔔' },
    BAR: { w: 4, three: 25, icon: 'BAR' }, SEVEN: { w: 2, three: 70, icon: '7' }, LOTUS: { w: 1, three: 300, icon: '❀' },
  },
};

// Tier-4 properties - the businesses (server/systems/biz.js; the owner's tracker, 10-06: "Tier-4 homes that are
// businesses: farm, nightclub, criminal hideout with gang guards; auto shop, food truck etc."), kept here with the games'
// numbers - out of shared/rules.js, which every page loads at once. Each in-game day you're in the city a business you
// own puts a day's takings in its till (no more than tillDays' worth waits there: go and collect it), and some of them
// earn as you work them. max: businesses at once (the food truck not counted); sellBack: what selling one brings back of
// what was paid for it, its upgrades included. A business is a place to wake up and to rest, as a home is.
//   farm: the fields round it - every row harvested there (the farmhands' tractors too) pays `row` into the till, `own` more
//     when you drive it yourself; hands: hired farmhands selling the crop, `handsDay` a day for each field and level;
//     the animals (bought once each): `day` a day each, eating a sack of feed a day each (stock: feed)
//   club: a night's takings - `night` x (0.6 + how popular the club is) x (1 + up for each level of the sound system and
//     the bar), half without stock behind the bar (cases: a case a night and one more for each bar level); `cover` for
//     every one the bouncer lets in while you own it, `barCut` of what's spent at its bar; dj: you on the decks at night
//     - the floor drops, and `tip` a dancer every `every` seconds for `s` seconds, then `cool` seconds before the next
//     brawl: most nights (chance) a drunk starts a fight on the floor, `after` s after you're in; knock them down within `s`
//     seconds and the patrons tip `thanks`, else the bouncers throw them out and `loss` walks out of the till; `slips`: a
//     few blows that land on your own patrons by accident each night are let go (shooting one never is - law.js)
//   hideout: the grow room's lamps (level 0..3) - `grow[level]` of product a day, eating `level + 1` bags of nutrients a
//     day (stock); taken as hot money (server/systems/hotmoney.js), or run to a buyer at least runPx away for clean cash
//     x runMult; guards: `guards0` of the Syndicate's soldiers at the door (+1 a level, +1 for a member) - an outsider in
//     the yard (yardPx) is warned, then shot at after warnS seconds; they're back respawnS after they're all down
//   shop: an auto shop (the Fresh Coat garage: garagePrice; a Spray & Go) - `jobs` customers a day, `perLift` more for
//     each level of the lift, each paying `perJob` + `perTools` a tools level and using a part (stock: parts); `cut` of
//     what other players pay at its counter or its paint bay (yours is free); fix: a customer's car brought in - stand by
//     it `s` seconds and it pays `pay` (+ `perTools` a tools level), `cool` seconds before the next
//   truck: a food truck (the Mr. Frosty van, bought at the dealership: its commissary) - park it, open the hatch and
//     sell a meal at `meal[menu level]` every serveS seconds (less with a grill: grillCut a level; quicker with a crowd
//     within crowdR px - up to 3x), one meal of stock each; `replace`: a new van when yours is wrecked
export const BIZ = {
  max: 3, tillDays: 3, sellBack: 0.6,
  farm: { price: 85000, row: 30, own: 20, hands: [6000, 12000, 20000], handsDay: 35, feed: { price: 300, qty: 10 },
    animals: { chickens: { name: 'A chicken coop', price: 3000, day: 110 }, pigs: { name: 'A pig pen', price: 7000, day: 220 }, cows: { name: 'A dairy herd', price: 12000, day: 340 } } },
  club: { price: 150000, night: 1400, up: 0.35, cover: 15, barCut: 0.5, sound: [8000, 16000, 28000], bar: [6000, 12000, 22000], stock: { price: 400, qty: 10 },
    dj: { s: 90, tip: 3, every: 10, cool: 300 },
    brawl: { chance: 0.7, after: [20, 90], s: 60, thanks: 250, loss: 200, slips: 3 } },
  hideout: { price: 60000, grow: [300, 600, 950, 1400], lamps: [5000, 11000, 19000], guards: [4000, 9000, 15000], guards0: 2, nutrients: { price: 250, qty: 10 },
    runPx: 6000, runMult: 1.3, yardPx: 320, warnS: 3, respawnS: 180 },
  shop: { price: 70000, garagePrice: 110000, jobs: 3, perLift: 2, perJob: 70, perTools: 25, lift: [7000, 14000, 24000], tools: [5000, 10000, 18000], parts: { price: 250, qty: 10 },
    cut: 0.6, fix: { s: 8, pay: 220, cool: 45 } },
  truck: { price: 18000, replace: 1500, meal: [8, 11, 15], menu: [6000, 12000], grill: [4000, 9000], grillCut: 0.25, serveS: 7, crowdR: 450, food: { price: 90, qty: 20 } },
};

// Car soccer at the Waves Arena (the owner, 10-16: "Rocket League-style car soccer arena (boosts, banked walls, a giant
// ball)": server/systems/carsoccer.js, shared/carsoccer.js, client/carsoccer.js). Join at the gate (on foot, within
// joinR px): a match fills to teamMin a side (up to teamMax with more players) with the city's drivers, lobbyS s after
// the first joins; each player is put in an arena car (model, in the team's paint). Kick-off: kickS s held at the
// spots; matchS s of play (the clock stops for goals and kick-offs), most goals wins - a draw goes to overtime, the
// next goal wins (otS s of it at most, then a draw); goalS s for the goal's replay and the cheering, overS s of the result; prize dollars to the bank of
// each player on the winning side. The ball (r px): drag and roll (per second, in the air and on the ground), bounce
// off the walls and the floor, g its gravity (px/s/s), hit how lively it comes off a car, kick px/s more on top, lift
// the share of a hit that goes up, max its top speed. The banked walls: w px wide along every wall (none in a goal's
// mouth), h px high at the top (how high a car's drawn up there), g how hard they pull back down to the pitch (px/s/s
// at the top). Boost (the Sprint button at the wheel): acc px/s/s forward while held, drain a second, start at
// kick-off; the pads give small (refilled smallS s later) or big (bigS) within r px. goalW px the goals' mouths.
// nearR: the arena's state goes to players this close; cheer: the crowd's roar's reach (px)
export const CARSOCCER = {
  teamMin: 2, teamMax: 3, lobbyS: 20, kickS: 3, matchS: 180, otS: 60, goalS: 4, overS: 8, prize: 150, model: 'hothatch', joinR: 120, nearR: 2600,
  ball: { r: 44, drag: 0.25, roll: 0.45, bounce: 0.72, g: 900, hit: 1.2, kick: 160, lift: 0.28, max: 1500 },
  bank: { w: 96, h: 40, g: 1500 },
  boost: { acc: 650, drain: 34, start: 34, small: 12, big: 100, smallS: 4, bigS: 10, r: 36 },
  goalW: 320,
};
