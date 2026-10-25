## 2026-10-24 - ui2: the touch controls by slots, and aiming by dragging FIRE (UI overhaul, phase 2)

The approved overhaul's decision 2 (the mockups LandFoot, LandDrive, PortFoot and PortHeli). The touch controls had
grown one button at a time, each placed by its own `calc()` offset in style.css, with a fixed aim stick bottom right,
its FIRE ON pill and a row of small pills by the minimap. Now there is one arc on the right whose slots each state
fills, and FIRE is dragged to aim.

### The layout (client/touchslots.js, shared/touchcontrols.js)
- **The left 40% is the move stick's**: it comes up where the thumb lands (from 36% of the height down on its side,
  from the middle down upright). Nothing else sits there.
- **The arc on the right**: fixed slots **1 FIRE** (80 px, red), **2 ROLL**, **3 ACT** (gold), **4 CAR** (60 px, round),
  two **context slots C1 / C2** (an orange dashed rim) and three small **utility slots U1-U3** (ITEMS, LIGHT, COP CAR).
  C and U are rounded squares, so RELOAD, GALLOP and COP CAR fit inside them. Every button has an icon and its label.
- **Each state fills the slots** (`TOUCH_STATES`; a button shows only while it does something, and the same role
  always sits in the same slot):
  - on foot: HIT, ROLL, ACT, CAR, BLOCK (with fists, a bat or a blade);
  - armed: FIRE, AIM, RELOAD;
  - carrying a crate: THROW in FIRE's slot;
  - at the wheel: FIRE (only with a gun), BRAKE, ACT (only with something to do), EXIT, HORN (SIREN in a police car,
    a fire engine or an ambulance), RELOAD with a gun;
  - a passenger: FIRE, ACT, EXIT, RELOAD;
  - flying: CLIMB / DOWN as one rocker in C1 / C2, EXIT, FIRE (a gun or the gunship's missiles);
  - on a boat: as at the wheel;
  - on a horse: STOP, OFF, GALLOP;
  - on a board: TRICK, OLLIE, OFF;
  - surfing: AIR;
  - swimming: ACT, CAR;
  - at home: ACT.
  
  ITEMS shows while there's something in the bag, LIGHT while you own a light, COP CAR while you can call one.
- **Placed per orientation from one table** (`GEO`, centres in from the bottom-right corner at a phone's 390 px short
  side), scaled to the room inside the safe areas: 0.86x on a 360 px phone, up to 1.3x on a tablet, never under 44 px.
  The safe areas are read from `env(safe-area-inset-*)`. The job line keeps left of the arc (`--arc-w`). **The
  per-button `calc()` offsets are gone from style.css**, and so are the old pills under the minimap, the WPN button
  (the weapon plate top right is the switch on touch: tap for the next weapon, hold to pick) and the hidden MAP button.
- **Kept clear of you**: nothing of the arc is over the middle of the screen (a box a third of the width and a quarter
  of the height round you). Upright, all of it is right of the middle, and the top band and the middle stay clear.
- **They dim when left alone** (5 s without a touch, to 50%) and come straight back at a touch.
- One button per action stays in index.html's `#tbtns`, so client/hud.js still pulses the one the prompt names
  (green, red for a crime), and the cinematic bar and the knocked-out screen still put them away.

### Drag-to-aim FIRE (client/input.js, shared/touchcontrols.js touchAim)
- **A tap fires at the auto-target.** There was no aim assist before: a tap fired where you faced, or along the aim
  stick's last aim. Now it fires at the nearest person standing ahead in reach (within 0.7 rad either side of where you
  face; all round at the wheel, not anyone aboard with you; never your crew or the down). With nobody there it fires
  where you face, and a drive-by goes straight ahead.
- **Press and drag** from FIRE aims the way you drag (past a 12 px dead zone) and fires while held, with a short aim
  line from you (110 px on touch). **Letting go stops.** The aim stays for 0.7 s, so the next tap fires the same way.
- **AIM** (C1 with a gun out) does the same without firing. It is the right mouse button's place: a gun held on a
  shop's clerk for a robbery, which the aim stick did before. **BLOCK** (C1 with fists, a bat or a blade) is held to
  guard; it replaces holding the aim stick short of its ring.
- **The aim stick, the FIRE ON pill and its setting are gone.** Settings' "Touch: aim stick outer ring fires" is
  removed and `touchEdgeFire` is dropped from what a browser kept. The pad's "right stick full push fires" is
  unchanged. Keyboard and gamepad are unchanged.
- **Golf, hoops, bowling, tennis, the fire hose, the bow**: drag FIRE wherever the aim stick was used. There is no
  auto-target by your golf ball, on a court or a lane, with a crate, fishing or on a board, so a golf shot still starts
  aimed at the flag. On a board FIRE is TRICK and doesn't drag (the stick picks the trick). "DRAG TO AIM" shows under
  FIRE the first five times a gun comes out, for 8 s each time.

### Page weight
- The slot tables, the aiming and the placing load with the touch controls (shared/touchcontrols.js,
  client/touchslots.js: a dynamic import the first time the device is touch), not with the page. The page stays at
  497.7 KB (budget 498, unchanged). style.css is smaller: 22 KB gzipped (it was 23).

### Tests
- test/hudlayout.test.js: every touch state on every screen of the HUD page (844x390, 740x360, 390x844, 1024x768,
  1280x720, 1920x1080; the six H70 states plus unarmed, horse, board, boat, swimming, passenger, surfing, home). It
  checks that no two controls overlap, that each is 44 px or more, that nothing is in the left 40% or over the middle
  or on the HUD (the minimap, the vitals, the cash, the weapon, the round buttons), that upright everything is right of
  the middle, and that each slot holds what shared/touchcontrols.js says it does.
- test/touchslots.test.js (new): the slot contents per state and the same role in the same slot; every action's
  button, binding, icon and README row; the geometry on eleven sizes, with and without a notch's safe areas; touchAim
  (a tap at the auto-target, a drag's angle and FIRE, AIM without FIRE, letting go stops, golf keeps its aim); the
  auto-target; the angle and the bits on the wire. In a real headless page, touches on FIRE and AIM go through
  client/input.js's sample(): a tap fires, a drag aims and fires while held, letting go stops.
- test/touchair.test.js reads the slot geometry (the rocker clear of FIRE, ACT, EXIT and ITEMS; BRAKE, HORN and RELOAD
  put away in the air). test/kbdrive.test.js and test/gamepad.test.js check that the aim stick and FIRE ON are gone
  cleanly.
- Captured on the dev server (World v3), before and after, every touch state at 844x390 and 390x844: ui2-shots in the
  session's scratchpad.
