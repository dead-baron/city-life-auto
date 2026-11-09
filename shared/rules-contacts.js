// Contacts and their mission chains (docs/PROGRESSION.md "Contacts and mission chains", owner-approved 2026-11-07; the
// server: server/systems/contacts.js; the Guide: shared/guide.js 'contacts'). Six contacts, two a career, each a chain of
// 6-8 missions built from what the game already has, ending in something you keep; after the chain, short repeatable
// jobs at your rank with a rotating twist. Rosa Vance (crime, early) and Sgt. Dana Okafor (police, early) came first
// (build-order item 3, first half); then Mae Holloway (business, early), "Deacon" Marsh (crime, late), Captain Luis Reyes
// (police, late) and Victor Lin (business, late). Deacon's and Reyes's chains cross: a cop on Reyes's chain is tipped off
// about a criminal on one of Deacon's Port job steps (port: 1), and the criminal is warned (contacts.js cross).
// Kept out of shared/rules.js on purpose: the page's startup code imports that, and only the Guide needs this.
//
// CONTACT: the numbers every contact plays by -
//   reachPx      how near the contact's place counts as being there (a 'visit' step, a handed-over car)
//   repeatGapS   after a repeatable job (done or run out), how long until the contact has the next one
//   rankStep     a repeatable's pay: its cash x (1 + rankStep x your rank in the contact's career)
//   gentleHp     an arrest "without force": the suspect still has this share of their health when cuffed
//   lockupCars, lockupCrates   what a lock-up holds
//   mainFit      the What's next fit of your main career's contact's card (whatsnext.js score: 1 is a plain career card)
//   carCooldownS your own patrol car, lost (wrecked, stolen): dispatch sends it again this soon (the pool's: CALL_COOLDOWN_S)
//   stakePx      a stakeout: this near the dock shipment's quay while the shipment is on
//   portGapS     the Port job's strongroom case, gone without being delivered by you: the next one is in the hold this soon
//   portCaseS    the case left lying (its player gone, say) is cleared away after this long
//   leaseOff     Mae's storefront lease: its daily rent (the business's upkeep) is this much less
//   stakeShare, stakeRent   Victor's tower share (its part of the tower, shown) and the rent it pays a day, into the bank
//   giftCash     a business the chain would give you that can't be had (none free, or you own the most you can): this
//                into the bank instead
//   caseMax      the office's case board: this many wanted suspects at most
// A contact: { id, name (CAREERS[career].contact's spelling), short (on the call button), career, icon, place: { kinds,
// label (a part of its name preferred), district, name (what the contact calls it) }, meet ('crime' | 'police' |
// 'business' | 'late' (from the career's lateFrom rank) | none (any XP in the career, or it's your main): when they first
// text you - contacts.js metOk), gate (their line when the next mission waits for a rank), cross (deacon, reyes: their line when the
// chains cross), steps, end, repeat }
// A step (a mission): { id, rank (the career rank it waits for, 0-based), t (title), sub (what to do), say (the
// contact's one line, texted when it's offered), call (what they say when you call), ev (what counts - careers.js note's
// events, and 'visit' (be at their place), 'handover' (a stolen car driven round to their place), 'have' (an item in
// your bag: item), 'stakeout' (at the dock shipment's quay while it's on)), n (how many; money: n is $), filt (the
// event's data must match: crate (a crate fenced), tier (a crate of this tier or better), src (where the crate came
// from: 'dock', 'armored', 'vault', 'port'), gentle (an arrest without force)), need ('cop': on duty), place (kinds of
// place the card points to; 'home': theirs; 'dock': the dock shipment's quay; 'armored': the armored truck run's van),
// spawn ('port': accepting it puts a carbon-gold case in the cargo ship's strongroom at Port Westport, for you -
// contacts.js portCase), port (1: a Port job step - the crossing), cash, xp }
// end: what the chain's last step gives - { line (the call), title, sub, lockup | car | hideout | office | lease | stake,
// xpTo (the career rank its XP is brought up to: a bump to that rank's threshold, never past it) }
// repeat: { jobs: [{ id, t ({n}), ev, n [by rank tier: 0-2, 3-5, 6-7], money, filt, need, place, cash, xp }], twists:
// [{ id, t (added to the title), mult (the pay), limitS (in this long), turf (counted only in the contact's district),
// twice (n x 2), hurt: false (nobody hurt), gentle, only [job ids] }], say [lines, in turn] }
export const CONTACT = { reachPx: 220, repeatGapS: 120, rankStep: 0.15, gentleHp: 0.85, lockupCars: 2, lockupCrates: 3, carCooldownS: 5, mainFit: 2,
  stakePx: 600, portGapS: 90, portCaseS: 1800, leaseOff: 0.5, stakeShare: 0.05, stakeRent: 750, giftCash: 20000, caseMax: 3 };

export const CONTACTS = {
  rosa: {
    id: 'rosa', name: 'Rosa Vance', short: 'Rosa', career: 'crime', icon: 'rob',
    place: { kinds: ['pawn', 'fence'], label: 'Crown Pawn', district: 'Southside', name: 'Crown Pawn' },
    meet: 'crime',
    gate: 'Make some noise first, {rank}-to-be. I\'ll call you.',
    steps: [
      { id: 'boost', rank: 0, t: 'Boost a car', sub: 'Steal any car.', ev: 'theft', n: 1, cash: 150, xp: 10,
        say: 'Rosa Vance, Crown Pawn, Southside. I need a car and you look like you need money. Funny how that works.',
        call: 'Any car. Four wheels and a key somebody forgot about.' },
      { id: 'shake', rank: 0, t: 'Shake the heat', sub: 'Steal a car at 2 stars, then lose the police.', ev: 'hotEscape', n: 1, cash: 250, xp: 15,
        say: 'This time let them chase you. Then don\'t let them catch you. That\'s the whole job.',
        call: 'Two stars, then nothing. Back streets, a paint shop, a car park - just disappear.' },
      { id: 'till', rank: 0, t: 'Empty a till', sub: 'Rob a store.', ev: 'rob', n: 1, place: ['convenience', 'gasstation'], cash: 250, xp: 15,
        say: 'My landlord wants rent. The corner store has rent. I see a solution.',
        call: 'Gun on the clerk, cash in the bag, out the door. Then lie low.' },
      { id: 'wash', rank: 1, t: 'Wash the money', sub: 'Fence $500 of hot money - her back room takes it.', ev: 'fence', n: 500, money: 1, place: 'home', cash: 200, xp: 15,
        say: 'Hot money burns holes in pockets. Bring it to me. I only take a little. Okay, some.',
        call: 'Rob something, then bring the bag here before the police find you. Not to a bank - to me.' },
      { id: 'cargo', rank: 1, t: 'Hot cargo', sub: 'Steal a crate off a truck and sell it to the Back-Alley Exchange.', ev: 'fence', n: 1, filt: { crate: 1 }, place: ['fence'], cash: 300, xp: 20,
        say: 'Trucks drive round this city with crates just sitting on the back. Honestly, it\'s rude not to.',
        call: 'Flatbeds, pickups, delivery vans - grab a crate, carry it to the Exchange. They pay on the spot.' },
      { id: 'drop', rank: 1, t: 'The delivery', sub: 'Steal a car and drive it round the back of Crown Pawn.', ev: 'handover', n: 1, place: 'home', cash: 400, xp: 20,
        say: 'A buyer wants a car, no questions. Steal one and bring it to my back door. Gently. Gently-ish.',
        call: 'Drive it right up to the shop and hand me the keys. Don\'t park it on the pavement, I have neighbours.' },
      { id: 'drill', rank: 1, t: 'Tools of the trade', sub: 'Buy a thermal drill at the Back-Alley Exchange.', ev: 'have', item: 'drill', n: 1, place: ['fence'], cash: 600, xp: 15,
        say: 'Banks have vaults. Vaults have doors. Doors hate thermal drills. Get one - I\'ll cover half.',
        call: 'The Exchange sells them under the counter. Keep it out of sight - the police take them.' },
      { id: 'keys', rank: 1, t: 'Come by the shop', sub: 'Rosa has something for you at Crown Pawn.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 0,
        say: 'Come by the shop. I got you something. Don\'t get emotional.',
        call: 'Crown Pawn, Southside. Round the back. Bring nobody.' },
    ],
    end: { line: 'It\'s a lock-up. Yours. Cars, crates, whatever - I didn\'t see anything. Welcome to Booster.', title: 'YOUR LOCK-UP', sub: 'A Southside lock-up of your own', lockup: 1, xpTo: 2 },
    repeat: {
      say: ['Got a little something, if you\'re bored.', 'I owe a guy. You owe me. See how this works?', 'Easy money. Mostly easy.', 'Don\'t ask why. Just - this.'],
      jobs: [
        { id: 'getaway', t: 'Steal a car at 2 stars and lose them', ev: 'hotEscape', n: [1, 1, 2], cash: 300, xp: 15 },
        { id: 'till', t: 'Rob {n} store(s)', ev: 'rob', n: [1, 1, 2], place: ['convenience', 'gasstation'], cash: 300, xp: 15 },
        { id: 'wash', t: 'Fence {n} of hot money', ev: 'fence', n: [1000, 2500, 5000], money: 1, place: 'home', cash: 250, xp: 12 },
        { id: 'cargo', t: 'Fence {n} stolen crate(s)', ev: 'fence', n: [1, 1, 2], filt: { crate: 1 }, place: ['fence'], cash: 400, xp: 20 },
      ],
      twists: [
        { id: 'rush', t: 'inside 8 minutes', limitS: 480, mult: 1.5 },
        { id: 'turf', t: 'in Southside', turf: 1, mult: 1.3 },
        { id: 'clean', t: 'and nobody gets hurt', hurt: false, only: ['till'], mult: 1.4 },
        { id: 'twice', t: 'twice over', twice: 1, mult: 1.8 },
      ],
    },
  },
  okafor: {
    id: 'okafor', name: 'Sgt. Dana Okafor', short: 'Sgt. Okafor', career: 'police', icon: 'siren',
    place: { kinds: ['police'], label: 'Midtown', district: 'Midtown', name: 'the Midtown precinct' },
    meet: 'police',
    gate: 'Put in a few more shifts first - make {rank} and I\'ll call you.',
    steps: [
      { id: 'badge', rank: 0, t: 'Report for duty', sub: 'Go on duty at a police station.', ev: 'duty', n: 1, place: 'home', cash: 100, xp: 5,
        say: 'Sgt. Dana Okafor, Midtown precinct. I train the new ones. Come in, sign up, and tuck your shirt in.',
        call: 'The front desk at any station. Ask for a badge. Say please - it helps.' },
      { id: 'calls', rank: 0, t: 'Answer the radio', sub: 'Answer 2 patrol calls (Phone, Jobs).', ev: 'dispatch', n: 2, need: 'cop', cash: 200, xp: 10,
        say: 'Dispatch calls, you answer. Twice. That\'s most of the job, honestly.',
        call: 'On duty, your phone\'s Jobs app has the patrol calls. Find the suspect and stop them.' },
      { id: 'stop', rank: 0, t: 'Traffic stop', sub: 'Lay a spike strip on the road and stop a car with it.', ev: 'spiked', n: 1, need: 'cop', cash: 200, xp: 10,
        say: 'Some drivers won\'t pull over. A spike strip is a very polite way of insisting.',
        call: 'On foot, facing down the road, lay the strip and step back. Let them come to you.' },
      { id: 'gentle', rank: 1, t: 'Easy does it', sub: 'Cuff a suspect without hurting them: taser, tackle or pepper spray.', ev: 'arrest', n: 1, filt: { gentle: 1 }, need: 'cop', cash: 300, xp: 15,
        say: 'Anyone can knock a man down. Bring one in without a scratch.',
        call: 'Taser or tackle, then the cuffs. No fists, no shots. They go home with all their teeth.' },
      { id: 'alive', rank: 1, t: 'Bring them in alive', sub: 'Collect on a bounty with the target alive (the Bounties app).', ev: 'bounty', n: 1, cash: 300, xp: 15,
        say: 'There\'s a price on someone\'s head. I\'d like the rest of them attached.',
        call: 'The Bounties app lists the contracts. Cuffs, not a body bag.' },
      { id: 'escort', rank: 1, t: 'Ride shotgun', sub: 'Escort the armored truck run to its bank (the City feed has the times).', ev: 'escort', n: 1, need: 'cop', cash: 400, xp: 20,
        say: 'IronVault\'s moving gold across town. Stay close to the truck and make it a boring trip.',
        call: 'Every half hour a truck leaves a bank. Stay with it all the way to the other one.' },
      { id: 'recover', rank: 1, t: 'Stolen goods', sub: 'Bring a stolen crate back to a bank or a police station.', ev: 'recover', n: 1, need: 'cop', cash: 400, xp: 20,
        say: 'Somebody took something that wasn\'t theirs. Take it back. Count it twice.',
        call: 'Robbed crates turn up after a heist or a truck job - their gold shows on your map. Bring one home.' },
      { id: 'keys', rank: 1, t: 'Report to the precinct', sub: 'Sgt. Okafor is waiting at the Midtown precinct.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 0,
        say: 'Come by the precinct. I have keys with your name on them.',
        call: 'Midtown precinct. Front lot. Don\'t run the light on the way.' },
    ],
    end: { line: 'Your own patrol car, Corporal - same unit every shift, so keep it clean. I\'m proud of you. Don\'t tell anyone.', title: 'YOUR PATROL CAR', sub: 'An assigned cruiser of your own', car: 1, xpTo: 2 },
    repeat: {
      say: ['Got a shift that needs covering.', 'The new ones need an example. Be it.', 'Quiet day. Let\'s keep it that way.', 'Paperwork can wait. This can\'t.'],
      jobs: [
        { id: 'calls', t: 'Answer {n} patrol calls', ev: 'dispatch', n: [2, 3, 4], need: 'cop', cash: 250, xp: 12 },
        { id: 'arrests', t: 'Make {n} arrest(s)', ev: 'arrest', n: [2, 3, 5], need: 'cop', cash: 250, xp: 12 },
        { id: 'stops', t: 'Stop {n} car(s) with a spike strip', ev: 'spiked', n: [1, 1, 2], need: 'cop', cash: 200, xp: 10 },
        { id: 'bounty', t: 'Bring in {n} bounty target(s) alive', ev: 'bounty', n: [1, 1, 2], cash: 300, xp: 15 },
      ],
      twists: [
        { id: 'rush', t: 'inside 10 minutes', limitS: 600, mult: 1.5 },
        { id: 'gentle', t: 'without force', gentle: 1, only: ['arrests'], mult: 1.4 },
        { id: 'turf', t: 'in Midtown', turf: 1, mult: 1.3 },
        { id: 'twice', t: 'twice over', twice: 1, mult: 1.8 },
      ],
    },
  },
  mae: {
    id: 'mae', name: 'Mae Holloway', short: 'Mae', career: 'business', icon: 'money', meet: 'business',
    place: { kinds: ['usedlot', 'dealer'], label: 'Park West Motors', district: 'Greenfield Park', name: 'Park West Motors' },
    gate: 'Come back when you\'re a {rank}. I don\'t lease to tourists.',
    steps: [
      { id: 'hello', rank: 0, t: 'Come by the lot', sub: 'Mae Holloway wants a look at you at Park West Motors.', ev: 'visit', n: 1, place: 'home', cash: 100, xp: 5,
        say: 'Mae Holloway. I own Park West Motors and half of Park West Lane. Come by - I like to see a face.',
        call: 'The used lot by Greenfield Park. Bunting, seven beaters, me. You can\'t miss it.' },
      { id: 'shift', rank: 0, t: 'Do an honest day', sub: 'Work a shift - any job on your phone\'s board.', ev: 'shift', n: 1, cash: 150, xp: 8,
        say: 'Everybody wants to be a boss. Nobody wants to work a shift. Work a shift.',
        call: 'Phone, Jobs. Deliveries, taxis, a bus - whatever. Finish it and get paid.' },
      { id: 'clean', rank: 0, t: 'Money you can explain', sub: 'Earn $500 of clean money (jobs, fish, honest work).', ev: 'clean', n: 500, money: 1, cash: 200, xp: 10,
        say: 'The bank asks where money comes from. Have an answer that isn\'t a shrug.',
        call: 'Jobs, fishing, the market - anything with a receipt.' },
      { id: 'haul', rank: 1, t: 'Honest freight', sub: 'Hand a crate in at a bank vault - the dock shipment\'s are fair game.', ev: 'haul', n: 1, place: 'dock', cash: 300, xp: 15,
        say: 'Crates come off the ships every hour. Carry one to a bank and they pay you for it. Legally, even.',
        call: 'Port Westport, on the hour. Grab a barrel, take it to any bank\'s vault. Don\'t get robbed.' },
      { id: 'shifts', rank: 1, t: 'A full day', sub: 'Work 3 shifts.', ev: 'shift', n: 3, cash: 300, xp: 15,
        say: 'Three shifts. Then I\'ll know you show up, which is most of business.',
        call: 'Any three jobs off the board. Turn up, finish, repeat.' },
      { id: 'save', rank: 1, t: 'Show me the books', sub: 'Earn $2,000 of clean money.', ev: 'clean', n: 2000, money: 1, cash: 400, xp: 20,
        say: 'Two thousand clean. Then we talk about the storefront. Yes, there\'s a storefront.',
        call: 'Clean money only. I\'ll know. I always know.' },
      { id: 'sign', rank: 1, t: 'Sign the lease', sub: 'Meet Mae at Park West Motors to sign.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 0,
        say: 'Bring a pen. Bring two - the first one never works.',
        call: 'At the lot. I\'ve got the papers and the good coffee.' },
    ],
    end: { line: 'Half the rent, because I like you. Pay it on time, because I\'ll stop liking you. Welcome to Owner.', title: 'YOUR FIRST BUSINESS', sub: 'A storefront lease on the cheap', lease: 1, xpTo: 2 },
    repeat: {
      say: ['A little work, if you want it.', 'Busy week on the lane. Help me out.', 'Money\'s money. Here\'s some.', 'You free? Good.'],
      jobs: [
        { id: 'shifts', t: 'Work {n} shift(s)', ev: 'shift', n: [2, 3, 4], cash: 250, xp: 12 },
        { id: 'clean', t: 'Earn {n} of clean money', ev: 'clean', n: [1000, 3000, 6000], money: 1, cash: 300, xp: 15 },
        { id: 'haul', t: 'Hand {n} crate(s) in at a bank vault', ev: 'haul', n: [1, 1, 2], place: 'dock', cash: 350, xp: 18 },
        { id: 'takings', t: 'Collect {n} from your tills', ev: 'takings', n: [300, 1000, 3000], money: 1, cash: 250, xp: 12 },
      ],
      twists: [
        { id: 'rush', t: 'inside 15 minutes', limitS: 900, mult: 1.4 },
        { id: 'twice', t: 'twice over', twice: 1, mult: 1.8 },
        { id: 'quick', t: 'inside 10 minutes', limitS: 600, only: ['shifts'], mult: 1.6 },
      ],
    },
  },
  deacon: {
    id: 'deacon', name: '"Deacon" Marsh', short: 'Deacon', career: 'crime', icon: 'rob',
    place: { kinds: ['delivery'], label: 'Westport Freight', district: 'Port Westport', name: 'Westport Freight' },
    meet: 'late',
    gate: 'Not yet. A {rank} does this job. Be one.',
    cross: 'A detective has taken an interest in you. Walk, don\'t run.',
    steps: [
      { id: 'quay', rank: 4, t: 'Meet Deacon', sub: 'Come to Westport Freight on the Port Westport docks.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 10,
        say: 'They call me Deacon. Rosa says you can keep quiet. Come to the docks and keep quiet near me.',
        call: 'Westport Freight, Pier Avenue. Walk slowly. Nobody looks at a slow man.' },
      { id: 'unload', rank: 4, t: 'Off the boat', sub: 'Take a crate off the dock shipment and fence it.', ev: 'fence', n: 1, filt: { src: 'dock' }, place: 'dock', port: 1, cash: 800, xp: 30,
        say: 'Every hour a ship unloads. Every hour somebody takes a crate. Be the somebody.',
        call: 'First come, first served. Take one to a fence before the quay gets crowded.' },
      { id: 'iron', rank: 4, t: 'Heavy metal', sub: 'Fence an iron vault (or better).', ev: 'fence', n: 1, filt: { tier: 3 }, place: ['fence'], cash: 1000, xp: 40,
        say: 'Steel is for children. Bring me iron.',
        call: 'The ships carry iron. So do bank vaults. I don\'t mind which.' },
      { id: 'drill', rank: 4, t: 'Practice on a bank', sub: 'Crack a bank vault with a thermal drill.', ev: 'heist', n: 1, place: ['bank'], cash: 1500, xp: 50,
        say: 'The ship\'s strongroom has a bank\'s door. So practise on a bank.',
        call: 'Drill on the vault door, hold them off, take what spills out. Then leave.' },
      { id: 'gold', rank: 5, t: 'Gold on wheels', sub: 'Take carbon-gold off the armored truck run and fence it.', ev: 'fence', n: 1, filt: { src: 'armored' }, place: 'armored', port: 1, cash: 2000, xp: 60,
        say: 'IronVault moves gold every half hour. They think two guards is a lot.',
        call: 'The City feed has the times. The whole city sees the gold - be quick.' },
      { id: 'wheels', rank: 5, t: 'The getaway car', sub: 'Steal a car and drive it to Deacon at the docks.', ev: 'handover', n: 1, place: 'home', port: 1, cash: 1200, xp: 40,
        say: 'The Port job needs a car nobody owns. Steal one. Bring it to me. Clean.',
        call: 'Drive it up and hand me the keys. No sirens behind you.' },
      { id: 'port', rank: 5, t: 'The Port job', sub: 'Take the carbon-gold case from the cargo ship\'s strongroom and fence it.', ev: 'fence', n: 1, filt: { src: 'port' }, spawn: 'port', port: 1, cash: 4000, xp: 100,
        say: 'Tonight. The ship\'s strongroom. One case of carbon-gold. Everyone will see it move.',
        call: 'It\'s on the quay by the ship. Lift it, get it to a fence, don\'t stop for anyone.' },
    ],
    end: { line: 'You did it quietly. That\'s rarer than gold. A hideout is yours, Underboss.', title: 'THE PORT JOB', sub: 'A hideout of your own', hideout: 1, xpTo: 6 },
    repeat: {
      say: ['There\'s a ship in.', 'Quiet work. Good money.', 'Someone owes me a crate.', 'Come by the docks.'],
      jobs: [
        { id: 'unload', t: 'Fence {n} crate(s) off the dock shipment', ev: 'fence', n: [1, 1, 2], filt: { src: 'dock' }, place: 'dock', cash: 900, xp: 30 },
        { id: 'gold', t: 'Fence {n} carbon-gold case(s)', ev: 'fence', n: [1, 1, 2], filt: { tier: 4 }, place: ['fence'], cash: 1500, xp: 50 },
        { id: 'drill', t: 'Crack {n} bank vault(s)', ev: 'heist', n: [1, 1, 2], place: ['bank'], cash: 1200, xp: 40 },
      ],
      twists: [
        { id: 'rush', t: 'inside 12 minutes', limitS: 720, mult: 1.5 },
        { id: 'plain', t: 'for an old friend', mult: 1.1 },
        { id: 'twice', t: 'twice over', twice: 1, mult: 1.8 },
      ],
    },
  },
  reyes: {
    id: 'reyes', name: 'Captain Luis Reyes', short: 'Capt. Reyes', career: 'police', icon: 'siren',
    place: { kinds: ['police'], label: 'Midtown', district: 'Midtown', name: 'the Midtown precinct' },
    meet: 'late',
    gate: 'Make {rank} and I\'ll read you in. Not before.',
    cross: 'Word from the docks: {name} is running a job for Deacon. They\'re on your map - What\'s next.',
    steps: [
      { id: 'squad', rank: 4, t: 'Join the squad', sub: 'Report to Captain Reyes, upstairs at the Midtown precinct.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 10,
        say: 'Captain Luis Reyes, detectives. I\'ve been after one man for eleven years. Come in.',
        call: 'Midtown precinct, upstairs. Knock. I won\'t answer. Come in anyway.' },
      { id: 'stake', rank: 4, t: 'Stakeout', sub: 'Watch the quay at Port Westport while a dock shipment unloads.', ev: 'stakeout', n: 1, place: 'dock', need: 'cop', cash: 500, xp: 20,
        say: 'Deacon\'s people meet every ship. I want to know who. Go and watch.',
        call: 'On the hour a ship unloads. Stand near the quay and look bored.' },
      { id: 'fry', rank: 4, t: 'The small fry', sub: 'Make 3 arrests.', ev: 'arrest', n: 3, need: 'cop', cash: 600, xp: 25,
        say: 'Small fish talk. Bring me three and one of them will mention a deacon.',
        call: 'Anyone with stars, anyone doing something stupid. Cuffs on, then the station.' },
      { id: 'iron', rank: 4, t: 'Follow the metal', sub: 'Recover a stolen iron vault (or better).', ev: 'recover', n: 1, filt: { tier: 3 }, need: 'cop', cash: 800, xp: 30,
        say: 'Stolen iron walks to Deacon. Stop one on the way.',
        call: 'Bank jobs, truck jobs - the heavy crates show on your map. Bring one to a station.' },
      { id: 'escort', rank: 5, t: 'Bait', sub: 'Guard the armored truck run all the way to its bank.', ev: 'escort', n: 1, need: 'cop', place: 'armored', cash: 1000, xp: 40,
        say: 'Deacon likes the armored run. So we ride with it and see who shows up.',
        call: 'Every half hour. Stay with the truck. If someone hits it, you\'re there.' },
      { id: 'alive', rank: 5, t: 'A witness', sub: 'Bring a bounty target in alive.', ev: 'bounty', n: 1, cash: 800, xp: 30,
        say: 'I need someone who talks. Dead men are very bad at that.',
        call: 'The Bounties app. Cuffs, not bullets.' },
      { id: 'port', rank: 5, t: 'Seize the Port haul', sub: 'Deacon\'s carbon-gold case is on the cargo ship - bring it to a police station.', ev: 'recover', n: 1, filt: { src: 'port' }, spawn: 'port', need: 'cop', cash: 3000, xp: 80,
        say: 'Deacon\'s case is in the ship\'s strongroom tonight. Take it before his people do.',
        call: 'On the quay by the ship. The whole city sees gold move - expect company.' },
      { id: 'report', rank: 5, t: 'Close the file', sub: 'Report to Captain Reyes at the Midtown precinct.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 0,
        say: 'Come in. Close the door. Sit down. Not in my chair.',
        call: 'Upstairs at Midtown. There\'s a desk with your name on it. Literally.' },
    ],
    end: { line: 'Deacon\'s crew is done. Your office is down the hall, Captain - the case board\'s yours.', title: 'YOUR OFFICE', sub: 'A detective\'s office and its case board', office: 1, xpTo: 6 },
    repeat: {
      say: ['New file on my desk.', 'Deacon\'s people are regrouping.', 'Got a lead. You want it?', 'Quiet night. I don\'t trust it.'],
      jobs: [
        { id: 'arrests', t: 'Make {n} arrest(s)', ev: 'arrest', n: [2, 3, 4], need: 'cop', cash: 500, xp: 20 },
        { id: 'recover', t: 'Recover {n} stolen crate(s)', ev: 'recover', n: [1, 1, 2], need: 'cop', cash: 700, xp: 25 },
        { id: 'stake', t: 'Stake out the docks', ev: 'stakeout', n: [1, 1, 1], place: 'dock', need: 'cop', cash: 450, xp: 18 },
      ],
      twists: [
        { id: 'rush', t: 'inside 15 minutes', limitS: 900, mult: 1.4, only: ['arrests', 'recover'] },
        { id: 'gentle', t: 'without force', gentle: 1, only: ['arrests'], mult: 1.4 },
        { id: 'twice', t: 'twice over', twice: 1, only: ['arrests', 'recover'], mult: 1.8 },
        { id: 'plain', t: 'by the book', mult: 1.1 },
      ],
    },
  },
  lin: {
    id: 'lin', name: 'Victor Lin', short: 'Victor', career: 'business', icon: 'money',
    place: { kinds: ['delivery'], label: 'Union Trust Tower', district: 'Downtown', name: 'Union Trust Tower' },
    meet: 'late',
    gate: 'A {rank}, then lunch. I don\'t do lunch with less.',
    steps: [
      { id: 'lunch', rank: 4, t: 'Lunch downtown', sub: 'Meet Victor Lin at Union Trust Tower, downtown.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 10,
        say: 'Victor Lin. I build towers. You own a few things - let\'s talk about owning more.',
        call: 'Downtown. I\'ll be the one not looking at the menu.' },
      { id: 'tills', rank: 4, t: 'Show me the takings', sub: 'Collect $3,000 from your businesses\' tills.', ev: 'takings', n: 3000, money: 1, cash: 1000, xp: 40,
        say: 'Revenue. Not plans, not dreams. Revenue.',
        call: 'Your tills fill every day you\'re in town. Go and empty them.' },
      { id: 'clean', rank: 4, t: 'Clean capital', sub: 'Earn $10,000 of clean money.', ev: 'clean', n: 10000, money: 1, cash: 1500, xp: 50,
        say: 'My partners ask where money comes from. Give them a boring answer.',
        call: 'Jobs, takings, honest freight. The duller the better.' },
      { id: 'buy', rank: 5, t: 'Expand', sub: 'Buy a property: a home or a business.', ev: 'prop', n: 1, cash: 2000, xp: 60,
        say: 'Land is the only thing they stopped making. Buy some.',
        call: 'The Real Estate app. A home, a business - anything with a deed.' },
      { id: 'freight', rank: 5, t: 'Gold standard', sub: 'Hand 2 crates in at a bank vault.', ev: 'haul', n: 2, place: 'dock', cash: 1500, xp: 50,
        say: 'Banks trust people who bring them things. Bring them things.',
        call: 'The ships unload every hour. A bank\'s vault pays for what you carry in.' },
      { id: 'week', rank: 6, t: 'Prove it holds', sub: 'Collect $8,000 more in takings.', ev: 'takings', n: 8000, money: 1, cash: 3000, xp: 80,
        say: 'Anyone can have a good day. Show me a good week.',
        call: 'Keep the tills full and keep emptying them.' },
      { id: 'sign', rank: 6, t: 'Sign for the share', sub: 'Meet Victor downtown to sign.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 0,
        say: 'My lawyer\'s waiting. He charges by the minute. Hurry.',
        call: 'Downtown. Sign where the little flags are.' },
    ],
    end: { line: 'A share of my tower. The rent is yours every day. Tycoon suits you.', title: 'YOUR TOWER SHARE', sub: 'A share in a downtown tower, rent every day', stake: 1, xpTo: 7 },
    repeat: {
      say: ['An opportunity.', 'My partners need a favor.', 'Money is moving. Move with it.', 'Lunch? No. Work.'],
      jobs: [
        { id: 'takings', t: 'Collect {n} from your tills', ev: 'takings', n: [2000, 4000, 8000], money: 1, cash: 1000, xp: 40 },
        { id: 'clean', t: 'Earn {n} of clean money', ev: 'clean', n: [5000, 10000, 20000], money: 1, cash: 1200, xp: 45 },
        { id: 'haul', t: 'Hand {n} crate(s) in at a bank vault', ev: 'haul', n: [1, 2, 2], place: 'dock', cash: 900, xp: 35 },
      ],
      twists: [
        { id: 'rush', t: 'inside 20 minutes', limitS: 1200, mult: 1.4 },
        { id: 'twice', t: 'twice over', twice: 1, mult: 1.8 },
        { id: 'turf', t: 'downtown', turf: 1, only: ['haul'], mult: 1.3 },
        { id: 'plain', t: 'by Friday', mult: 1.1 },
      ],
    },
  },
};
// the order they're looked at in (the app's card: your main career's first)
export const CONTACT_ORDER = ['rosa', 'okafor', 'mae', 'deacon', 'reyes', 'lin'];
