## 2026-10-24 - Batch 4b of the owner's notes: lost pets with posters, someone collapsing in front of you

### Lost pets, redone (the owner: "a 'lost pet' poster are hung up and if you actually read the poster gives an approximate area where the pet was last seen ... These should pay a lot more ... a way to get the pet to stop following you")
- server/systems/pets.js, rewritten round a real home. Now and then (PET_EVERY_S, at most PET_MAX_LOST = 3 at once) a
  dog or a cat goes missing from a house, a cottage or a flat nobody plays in, 400-2600 px from someone on foot. Its
  owner stands at their door the whole time ("Lost my dog!" over them for anyone within 700 px); killed or cleared, the
  next from the house comes out once nobody's looking. No more owners or pets popping up at random spots.
- Its last-seen area (PET_AREA_R = 320 px) is 900-2200 px from home (PET_LOST_PX), on the same island, in town; the pet
  is in it where a lost pet ends up - the best of 50 looks scored for a yard or a park (grass), an alley's asphalt,
  under a porch (beside a house, off the pavement), the pavement least; never the road, the water or indoors
  (petGround). Lost, it sniffs about at half pace, sitting a while now and then, and never leaves the area.
- The posters (PET_POSTERS = 4): by the home, a third and two thirds of the way to the area and at its near edge, each
  on the nearest pole within 220 px (street lamps, utility and signal poles, posts, bus stops, finger posts, road signs
  - a neighbourhood map board counts as a noticeboard) whose foot isn't in the road, else a wall's face over the
  pavement; 120 px apart at least, put up out of everyone's sight. The page draws them as props (client/lostposter.js,
  loaded the first time one is near: a sheet up the pole with a red LOST band, the pet's picture in its own colours, the
  tear-off tabs, stirring a little) - the server sends the ones within 900 px in the event list (k 'poster').
- Reading one (ACT at it: "Read the "Lost dog" poster") gives a note: its name, what it looks like, where it was last
  seen ("Pine Hills, a short walk north-east of here - marked on your map") and the owner's address (the home's name
  and district). From then on the area is a dashed circle on the minimap, the big map and the ground (k 'petarea', r)
  with a lasting arrow to it, wherever you are, till someone has the pet at heel.
- Found: take its collar (the label names its home). It trots at your heel and the way to its door is marked (k
  'petret', as before). Handed back at the door it pays PET_REWARD = $300 + $8 a metre from where you found it to the
  door, at most $1,200 (rewardFor; about $500-900 for the usual walk - it was a flat $220), and 12 Samaritan points
  (was 8). The happy reunion and the adoption offer (task #427, H71) are as they were; the posters come down.
- Let it go: with it at heel and nothing else to do, ACT is "Let Biscuit go (stop walking it home)" (pets.letGo, the
  last of players.js findInteraction - anything else near you comes first). Let go, or lost (a car, a teleport, 900 px
  off), it sniffs about where it is now: the area moves there with it (for everyone who read a poster) and the posters
  stay up. Take it again any time.
- Nobody brings it home in PET_LOST_S (30 minutes): once nobody sees it, it finds its own way back and the posters come
  down. The lost pets no longer count as happenings (no radar blip on the pet itself, nothing for the calm streets).
- shared/rules.js: PET_MAX_LOST, PET_LOST_PX, PET_AREA_R, PET_POSTERS, PET_LOST_S, PET_REWARD { base, perM, max }
  (PET_OWNER_PX gone). shared/worldevents.js: the 'poster' and 'petarea' kinds. The paused tour's lost-pet stop still
  reads PET_REWARD as a number - it wants its words redone when the tour comes back.

### Someone collapses in front of you (the owner: "you actually see them trip and fall or pass out or something and you can go help them up?")
- server/systems/happenings.js: the collapse now happens where you can see it - someone walking along the pavement well
  inside your view (90-460 px off; nobody there yet: the next one who walks into sight, within 40 s). They sway, weave
  and slow for 1.6 s - a stagger back on their heels, then forward - and go down face first, still (a 'collapse'
  event: k 's' the stagger, k 'F' face down; the page: client/main.js, the existing stagger and face-down poses; the
  thud of a body falling). Then the note: "hold ACT beside them to help them up".
- Hold ACT FAINT_HELP_HOLD_S (1.5 s) beside them ("Helping them up... 0.8s (keep holding)", the prompt's bar; let go or
  walk off and it stops) and they're back on their feet, turn to you, thank you ("Thank you!" over them) and press $40
  on you, +6 Samaritan, as before.
- Left lying FAINT_EMS_S (30 s), someone calls an ambulance: server/systems/ems.js dispatchFor sends one the usual way
  for a living patient (emsPatient - drive() and the scene take one as they take a body); the paramedics treat them and
  wheel them off on the stretcher. Helped up meanwhile, it turns round. No road to them: after FAINT_S they come round
  and limp off as before. The ambulance also keeps clear of anyone passed out on the ground now, not only bodies.
- The weakest of the random happenings, the one that just dropped someone on the spot, is gone with this; the fight
  and the dropped wallet are unchanged.

### Tests
- test/lostpets.test.js (new): the posters by the home and along the way, on a pole or a wall, never in the road,
  spread out; reading one (the note, the area marked for that reader only, wherever they are); the pet in its area, off
  the road, staying there sniffing about for a minute; found, followed, the way home marked, handed back - the reward
  from the walk; let go - it stays round there, the area moved, the posters up, taken again; lost from a car; nobody
  brings it home - gone, the posters down.
- test/happenings.test.js: the collapse in sight - the stagger on the wire, down face first, a tap isn't enough, held:
  up, paid, thanked; left lying - the ambulance takes them away (or they come round); helped up while it's coming - it
  turns round; lost pets from real homes, their areas a walk away. test/pets.test.js, test/world.test.js,
  test/lobby.test.js: their lost pets now come from a home near the player.
- Page code: 498.2 KB of the 498 budget (the rules' new numbers with short comments; the posters' drawing loads when
  first near). README: rows for the lost pets and helping someone up (ACT, no new control).
