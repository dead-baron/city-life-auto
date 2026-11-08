// Contacts and their mission chains (docs/PROGRESSION.md "Contacts and mission chains", owner-approved 2026-11-07; the
// server: server/systems/contacts.js; the Guide: shared/guide.js 'contacts'). Six contacts, two a career, each a chain of
// 6-8 missions built from what the game already has, ending in something you keep; after the chain, short repeatable
// jobs at your rank with a rotating twist. The first two are here (build-order item 3, first half): Rosa Vance (crime,
// early) and Sgt. Dana Okafor (police, early). The other four (Deacon Marsh, Captain Reyes, Mae Holloway, Victor Lin)
// are an entry each in CONTACTS plus, where a mission needs something new counted, a careers.js note at its emit point.
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
// A contact: { id, name, short (first name, on the call button), career, icon, place: { kinds, label (a part of its
// name preferred), district, name (what the contact calls it) }, meet ('crime' | 'police': when they first text you -
// contacts.js metOk), gate (their line when the next mission waits for a rank), steps, end, repeat }
// A step (a mission): { id, rank (the career rank it waits for, 0-based), t (title), sub (what to do), say (the
// contact's one line, texted when it's offered), call (what they say when you call), ev (what counts - careers.js note's
// events, and 'visit' (be at their place), 'handover' (a stolen car driven round to their place), 'have' (an item in
// your bag: item)), n (how many; money: n is $), filt (the event's data must match: crate (a crate fenced), gentle (an
// arrest without force)), need ('cop': on duty), place (kinds of place the card points to; 'home': theirs), cash, xp }
// end: what the chain's last step gives - { line (the call), title, sub, lockup | car, xpTo (the career rank its XP is
// brought up to: a bump to that rank's threshold, never past it) }
// repeat: { jobs: [{ id, t ({n}), ev, n [by rank tier: 0-2, 3-5, 6-7], money, filt, need, place, cash, xp }], twists:
// [{ id, t (added to the title), mult (the pay), limitS (in this long), turf (counted only in the contact's district),
// twice (n x 2), hurt: false (nobody hurt), gentle, only [job ids] }], say [lines, in turn] }
export const CONTACT = { reachPx: 220, repeatGapS: 120, rankStep: 0.15, gentleHp: 0.85, lockupCars: 2, lockupCrates: 3, carCooldownS: 5, mainFit: 2 };

export const CONTACTS = {
  rosa: {
    id: 'rosa', name: 'Rosa Vance', short: 'Rosa', career: 'crime', icon: 'rob',
    place: { kinds: ['pawn', 'fence'], label: 'Lucky Pawn', district: 'Southside', name: 'Lucky Pawn' },
    meet: 'crime',
    gate: 'Make some noise first, {rank}-to-be. I\'ll call you.',
    steps: [
      { id: 'boost', rank: 0, t: 'Boost a car', sub: 'Steal any car.', ev: 'theft', n: 1, cash: 150, xp: 10,
        say: 'Rosa Vance, Lucky Pawn, Southside. I need a car and you look like you need money. Funny how that works.',
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
      { id: 'drop', rank: 1, t: 'The delivery', sub: 'Steal a car and drive it round the back of Lucky Pawn.', ev: 'handover', n: 1, place: 'home', cash: 400, xp: 20,
        say: 'A buyer wants a car, no questions. Steal one and bring it to my back door. Gently. Gently-ish.',
        call: 'Drive it right up to the shop and hand me the keys. Don\'t park it on the pavement, I have neighbours.' },
      { id: 'drill', rank: 1, t: 'Tools of the trade', sub: 'Buy a thermal drill at the Back-Alley Exchange.', ev: 'have', item: 'drill', n: 1, place: ['fence'], cash: 600, xp: 15,
        say: 'Banks have vaults. Vaults have doors. Doors hate thermal drills. Get one - I\'ll cover half.',
        call: 'The Exchange sells them under the counter. Keep it out of sight - the police take them.' },
      { id: 'keys', rank: 1, t: 'Come by the shop', sub: 'Rosa has something for you at Lucky Pawn.', ev: 'visit', n: 1, place: 'home', cash: 0, xp: 0,
        say: 'Come by the shop. I got you something. Don\'t get emotional.',
        call: 'Lucky Pawn, Southside. Round the back. Bring nobody.' },
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
};
// the order they're looked at in (the app's card: your main career's first)
export const CONTACT_ORDER = ['rosa', 'okafor'];
