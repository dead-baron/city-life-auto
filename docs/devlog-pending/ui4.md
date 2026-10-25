## 2026-10-24 - ui4: the HUD's information - the prompt in its slot, one job card, one-line notes and the Log, vitals and status in plain words, the vehicle chip, first-time hint strips, the knocked-out screen, store icons over doors (UI overhaul, phase 4)

The owner approved the UI/UX overhaul on 2026-10-24. Decisions 4 ("information where the eye is") and 5 (the knocked-out
screen) are this phase, held to his bar: "elements that pop up on screen don't take over the view of the game for the
character, especially in mobile portrait mode ... information should come and go as necessary but not linger". The
HUD is laid out again from the mockups (DeskHud, LandFoot, LandDrive, PortFoot, PortHeli, LandDeath); its CSS section
is rewritten rather than layered (the old touch and upright overrides are gone), and what it shows beyond the basics
lives in client/hudinfo.js, fetched as the game opens.

### The prompt
- **One slot.** With a keyboard or a pad it sits just under you on the screen (hudinfo.js keeps it under your feet as
  the camera leads). On a phone on its side it sits low between the move stick and the arc, over the arc's lowest
  buttons and left of the rest; upright, just under you, left of the utility column. client/touchslots.js tells the
  stylesheet where the room is (--lo-r, --lo-b, --lo-c) from the slots' own geometry. A short window with a keyboard
  (under 430 px tall) puts it in the low slot.
- **In and out.** It eases in and out (200 ms) instead of popping, and shows only while the server offers it.
- **A verb and an object, no colon.** The places' prompts were nouns ("Bank teller", "Pawn window", "Counter - ...",
  "Union Square Station: next train ..."). They read "Talk to the bank teller", "Sell at the pawn window", "Shop at the
  counter - ...", "Read the route board at ...", "Use the ATM - $420 on you to deposit", and so on (server
  economy.js poiLabel, trains.js, players.js).
- **Taxi ranks in stations (the known case).** A station's own prompt (its timetable, or World v3's route board) came
  first, so the rank's job card never appeared. Now the prompt says "Check the trains and taxis at ..." and the
  station's menu and the route board both offer "Drive a taxi from here", which brings up the taxi's job card.

### The job card
- **One card under the minimap**, replacing the bottom job line: the job and the call it's on ("TAXI · FARE 2"), the
  time left on the shift, the objective, how far (live), STEP N OF M. The server sends the card's words with the job
  target (phone.js jobCardInfo: k, n, u, step, left, s), each job's steps in order (paramedic: to the patient, at the
  scene, to the hospital; taxi: the pickup, the drop-off; and so on). Waiting for a call has no step.
- **Big, then a chip.** It's big for 5 seconds when a step comes in (a short glow says so), then folds to a one-line
  chip (the objective and the distance). A tap or a click opens it again. On a phone the big card lets touches through,
  so a thumb going for the move stick isn't caught.
- **The pay, then gone.** When a call or the job pays, the card shows PAID +$X (or DONE · +$X) for a few seconds, then
  goes back to the chip or away.

### Notes and the Log
- **One line each, two at most, a few seconds.** A long note shows its first sentence or clause (notelog.js noteLine);
  the server can name the line itself - world.notify's new short argument - and the job intros do ("Taxi shift: your cab
  is the green ring" for the five-line taxi intro). A note cut short ends LOG ›, and a tap or a click opens the phone's
  Log with every note in full. The paging of long notes (client/notepages.js) is gone with its test.
- **Never over you or the middle.** Bottom left on a desktop; top centre under the row on a phone on its side; under
  the job upright. With a robbery, ride or custody bar up they make room (upright they wait in the Log).

### Vitals and status
- **Health and stamina** with a heart and a bolt and their numbers; the words Health and Stamina on a desktop.
- **Plain words:** a status line of chips - who you are (CITIZEN, POLICE · SERGEANT), Samaritan 12, Criminal XP 3,
  Record 15 felonies (on its own, not "CITIZEN · 15 FELONIES"), then what's happening to you now (Bleeding, a bounty, a
  coffee wearing off, Police remember you ★★). A phone shows only what's happening now, and the faction when it isn't a
  citizen's.
- **Progressive disclosure.** The stars only while you're wanted and for 8 seconds after. The weapon plate small with
  your fists out and nothing going on (on a phone gone when there's nothing to switch to). The bank and the clock are
  folded on phones: the clock and the weather on the minimap's foot. UI-1's 12 px exception for the HUD's readouts is
  gone: 14 px is the smallest on a phone (test/hudlayout.test.js measures every word).

### The vehicle chip
- The vehicle's name, its speed in km/h and, in the air, its height in metres, under the cash - only in a vehicle
  (three short lines on a phone).

### First-time hint strips
- Driving, flying, a horse, a boat, a board, swimming and the cinematic mode each get a strip of what to press - key
  chips on a keyboard, the pad's button names, the touch slots' own names (BRAKE, HORN, EXIT; CLIMB, DOWN) - the first 3
  times on this device for this character (localStorage cla.hints, by player id), up 7 seconds or until you stop. They
  sit clear of the controls: bottom centre on a desktop, the strip under the arc's lowest buttons on a phone on its
  side, over the move stick upright. The cinematic mode's shows on the clean screen (its old note couldn't: the clean
  screen hid the notes).

### The knocked-out screen
- Reworked to the LandDeath mockup: a map of the places to wake up (numbered marks) beside the panel - upright, the map
  over it. The panel: KNOCKED OUT (or WASTED), how it happened (on phones too now), the calls while you're down (call
  for help, the ambulance or the rescue boat, cancel the request), the places nearest first as numbered rows matching
  the marks (tap either), WAKE UP HERE and AUTO IN 12 S. WAKE UP HERE settles the place and folds the choices to the
  slim bar to watch the scene - you still wake when the timer runs out ("whatever you press", RESPAWN_SECONDS).
  Enter / A press it; H, J, C, the arrows, Esc / B as before. Its CSS moved out of style.css into deathscreen.js.

### Store icons over doors
- The shop symbols over the doors near you are round badges with a gold rim and a warm glow and a glyph per trade, in
  the style of the owner's concepts (page 15): a gun, a shirt, a hammer, a cart, a pill, a cross, a badge, scales, a
  bank, a beer, a cocktail, a coffee, a burger, a fuel pump, a shop front, rings, a hood, a wrench, ... - 37 glyphs for
  every kind of shop (client/storeicons.js, loaded the first time one is drawn; art2 host.js draws them a little
  bigger and higher). Off in Settings as before.

### The creator and the desktop hub
- **The starting looks upright:** two to a row, scrolling down, with "12 LOOKS + RANDOM" over them (was one of twelve
  in a sideways strip).
- **Desktop hub targets:** the map's category names and the players row are 44 px tall now (16 targets under 44 px in
  the before shots).

### The numbers
- HUD coverage (scratchpad ui4/cap4.py, the audit's coverage: the share of the screen the HUD and touch controls paint,
  and of the middle third), in each state at desk 1440x900, land 844x390 and port 390x844:
  - **desk** (HUD / middle third, before → after): foot 6/0 → 5.4/0; armed 8/0 → 7.1/0; notes 7.7/0 → 5.9/0; notes-gone 6.5/0 → 5.9/0; prompt 8/4.2 → 7.8/17.2; station 11.6/0 → 9.3/14.4; wanted 8.6/0 → 10/7.5; drive 6.5/0 → 6.2/0; heli 6.5/0 → 7.8/0; job 12.7/0 → 8.4/15.3; job-compact 9.9/0 → 8.4/15.3; death 12.8/0 → 44.9/77.4
  - **land** (HUD / middle third, before → after): foot 34.9/0 → 32.7/4.7; armed 36.2/1 → 35.7/5.7; notes 39/0 → 37/4.7; notes-gone 35.9/0 → 34.8/4.7; prompt 36/15.4 → 35.3/10.9; station 44.8/37 → 36.9/16.5; wanted 38.1/0.8 → 41.7/4.7; drive 27.8/0 → 30/0; heli 27.7/0 → 31.1/0; job 41.4/0 → 38.5/4.7; job-compact 38.4/0 → 38.5/4.7; death 49.2/26.5 → 91.3/98.6
  - **port** (HUD / middle third, before → after): foot 34.2/19.7 → 28.8/19.7; armed 35.5/19.7 → 31.4/19.7; notes 35.2/19.7 → 35.9/19.7; notes-gone 35.2/19.7 → 30.8/19.7; prompt 34.1/19 → 32.6/29.6; station 36.7/25.4 → 32.7/8.9; wanted 36.1/33.8 → 43.4/12.8; drive 26.7/0 → 25.9/0; heli 31.1/0 → 23.7/0; job 44.4/19.7 → 34.8/19.7; job-compact 39.7/19.7 → 34.8/19.7; death 42.4/0 → 90.5/97.2
  - Read: the HUD's share is down in most states (the land and port figures include the touch controls, UI-2's, which
    didn't change). The middle third holds the prompt now - by you on a desktop, under you upright - which is the one
    thing the bar allows there; with no prompt up it's clear but for a bar or the edge arrow. The knocked-out screen
    covers the most by design (the approved LandDeath mockup: the map and the panel); ▾ HIDE or WAKE UP HERE fold it to
    a slim bar to watch the scene.
- Tests: test/hudlayout.test.js measures the prompt slot (by you, or low on touch), the job card's both forms on every
  screen, two one-line notes at most and never in the middle third, 14 px on touch and the HUD's parts clear of each
  other. New: test/hudinfo.test.js (the note → Log path, the hint strips shown 3 times then not, the knocked-out
  screen's choices, an icon for every shop kind, the card's words) and test/jobcardinfo.test.js (the server's card
  words, the intro's short line, the taxi rank in a station).
- The page is 498 of 498 KB: the new code loads after the page (hudinfo.js with the HUD, storeicons.js with the first
  mark, the knocked-out screen with the first knock-out); notepages.js and the HUD code that moved out made the room.
