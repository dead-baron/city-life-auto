# NPC reactions: a ladder instead of fight-or-flee (design for the owner's call, 2026-11-26)

His note (11-25 00:33): "more animated and complex ... not just automatically attack (right now it seems like an instant
pull out weapon and shoot reaction) ... sometimes take cover, react not with violence first, react scared and run off,
react cautious, react professional and skilled ... interactions and violence and fighting and driving and being police
or on the job". Logged as "a design first". This is that design. Nothing is built yet.

## What the NPCs do today (server/systems/npc.js, entities.js)
- **Hit by someone** (`onAttacked`): a civilian rolls once against their archetype's `fight` (0 for a medic, 0.4 for a
  hiker, 1 for SWAT). Win and they fight at once; lose and they run. Gang members always fight and call the gang.
  Bouncers, bikers and armored-van guards all come for you. Cops answer only through the wanted level.
- **Shots near them** (`onGunfire`): civilians run, or now and then film it from far off. "Tough" ones turn and stare.
  Gang members on their turf open fire on anyone who isn't aligned with them.
- **Carjacked:** a coin flip, flee screaming or fight.
- There's no middle step: nobody warns, backs off, hides, calls it in on the spot, puts their hands up, or takes cover.
  Everyone armed draws at once.

## The ladder
Every reaction walks up the same steps. An NPC's temperament decides how far up it goes and how fast:

| Step | What you see | Who stops here |
|---|---|---|
| 1. Notice | They turn and look; an "!" over the head for a beat | everyone who sees it |
| 2. Back off / warn | Step back, hands up, "Whoa, easy!" (a word bubble); a tough one: "Back off." | most civilians, for a shove or a brandished weapon |
| 3. Flee / hide / call | Run, duck behind the nearest car or wall and crouch, or phone it in (the call is the witness report law.js already makes) | most civilians once there's real violence; shop staff duck behind their counter |
| 4. Draw | An armed one pulls their weapon and holds it on you: no shot yet, a warning ("Drop it!") | armed civilians, guards, rookie police |
| 5. Cover | Into cover first (a car, a corner, a planter), then fire from it | guards, police, gang soldiers |
| 6. Fight | Close in or shoot | the brave, the angry, gang members on their turf, police at 2+ stars |

- **Temperament** = role + district + a small personal spread (one seeded number per NPC, like `snitch` today):
  - *Timid:* seniors, socialites, executives. Top out at step 3.
  - *Ordinary:* most people. Usually step 3, sometimes 2.
  - *Tough:* construction, athletes, bikers. Steps 2 and 6: warn, then fight with fists.
  - *Armed:* hustlers, guards, gang. Step 4, then 5 or 6.
  - The district shifts it a notch: rough districts are bolder, rich ones more timid.
- **What's escalating:** a shove isn't a shooting. The ladder starts from the severity law.js already gives every
  crime (`sev`), so a punch starts at 1-2 and gunfire at 3.
- **Skill tiers** for anyone on the job (police, guards, SWAT, soldiers):
  - *Rookie* (1-2 stars, a mall guard): slow to draw, poor aim, little use of cover.
  - *Regular* (3 stars): uses cover, calls for backup.
  - *Veteran* (4 stars, armored-van crews): quick, accurate, flanks.
  - *SWAT / agents* (5 stars): moves as a team, suppresses, pushes you out of cover.
  - The police already scale with stars (DECISIONS: 1-3 stars worse drivers, slower to cuff). This puts the same tiers
    into how they fight.
- **Driving:** the same ladder on the road. Honk, swerve, stop and get out to argue (step 2). Drive off in a panic (step
  3). Box you in or ram you (police at 3+ stars, gang cars).
- **The page:** the "!" mark (already there), word bubbles (chat's own), a crouch (an existing pose), hands up (a new
  pose, art), and drawing with the weapon held down (the 11-23 aiming rule, for NPCs too).

## The numbers and the guards
- Every threshold, chance and delay goes in `shared/rules.js` (`REACT`): the steps per temperament, the district
  shift, the tiers' draw time, aim and how often they use cover.
- Tests: each temperament's top step for a punch, a brandished weapon and gunfire. A rookie draws slower than a
  veteran. Nobody fires before step 4. Everything there today still works (bouncers, biker clubs, gang turf, the
  armored van's guards, street fights): each keeps its current test first, as his rule for animal groups asks.

## Size and order (if he says go)
1. The ladder and temperaments for civilians on foot: about a day. Server only, except the hands-up pose (art).
2. Cover for anyone who fights from step 5: finding cover from the map's solids and vehicles, about a day.
3. The skill tiers for police and guards: half a day, on top of 2.
4. The road ladder: about a day.

Each is a server change (one restart per batch). None touches the world or the art keys.

## Also from the same night's notes (11-25 00:47), not built yet
More dog walkers by district, and cats on stoops and in alleys. The dog runs themselves are built (`dogrun.js`, 11-26).
The rule for animal groups stands: a group's behaviour is decided for the group, variety is between groups.
