## 2026-10-24 - ui2: the touch controls by slots, round the aim stick (UI overhaul, phase 2)

The approved overhaul's decision 2 (the mockups LandFoot, LandDrive, PortFoot and PortHeli). The touch controls had
grown one button at a time, each placed by its own `calc()` offset in style.css, with a row of small pills by the
minimap - FIRE ON among them. Now there is one layout on the right whose slots each state fills, built round the aim
stick.

A first cut replaced the aim stick with drag-to-aim on FIRE. On seeing it the owner asked for the stick back
(2026-10-24: "still want the right joystick to work as it did before, that you can aim without shooting but if you
push it outside the red circle it will fire, but you can toggle that on or off as it worked before"). The stick, its
ring fire, the FIRE ON toggle and its setting now work exactly as before; dragging FIRE and the AIM button are gone.

### The layout (client/touchslots.js, shared/touchcontrols.js)
- **The left 40% is the move stick's**: it comes up where the thumb lands (from 36% of the height down on its side,
  from the middle down upright). Nothing else sits there.
- **The aim stick** has a fixed place in the bottom-right corner, as before (132 px on its side, 116 upright), with
  its red ring.
- **The arc round the stick**: fixed slots **1 FIRE** (80 px, red, beside the stick), **2 ROLL**, **3 ACT** (gold) and
  **4 CAR** (over the stick), all round. Two **context slots, C1 / C2**, have an orange dashed rim. Four small
  **utility slots** hold ITEMS, LIGHT, COP CAR and **FIRE ON**; FIRE ON sits clear of the stick's ring (off the ring
  was the ui0 overlap fix). C and U are rounded squares, so RELOAD, GALLOP and COP CAR fit inside them. Every button
  has an icon and its label.
- **Each state fills the slots** (`TOUCH_STATES`; a button shows only while it does something, and the same role
  always sits in the same slot):
  - on foot: HIT, ROLL, ACT, CAR, BLOCK (with fists, a bat or a blade);
  - armed: FIRE, RELOAD;
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
  - at home: ACT and no stick.
  
  ITEMS shows while there's something in the bag, LIGHT while you own a light, COP CAR while you can call one. The
  stick and FIRE ON show everywhere but at home.
- **Placed per orientation from one table** (`GEO`, centres in from the bottom-right corner at a phone's 390 px short
  side), scaled to the room inside the safe areas: 0.86x on a 360 px phone, up to 1.3x on a tablet, never under 44 px.
  The safe areas are read from `env(safe-area-inset-*)`. The job line keeps left of the arc (`--arc-w`). **The
  per-button `calc()` offsets are gone from style.css**, and so are the pills under the minimap, the WPN button and
  the hidden MAP button. The weapon plate top right is the weapon switch on touch: tap for the next weapon, hold to
  pick; it has a 44 px tap area now.
- **Kept clear of you**: nothing of the stick or the arc is over the middle of the screen (a box a third of the width
  and a quarter of the height round you). Upright, all of it is right of the middle (an old 667 px-tall phone upright
  is the exception for the utility slots: there's no room under the middle for everything).
- **They dim when left alone** (5 s without a touch: the buttons to 50%, the stick to 60%) and come straight back at a
  touch.
- One button per action stays in index.html's `#tbtns` (the stick and FIRE ON in there too), so client/hud.js still
  pulses the one the prompt names (green, red for a crime), and the cinematic bar and the knocked-out screen still put
  them away.

### Aiming and firing (client/input.js, shared/input.js touchStick, shared/touchcontrols.js touchAim)
- **The aim stick, as before**: held a fifth of the way out it aims without firing; pushed into its red ring it fires
  too, while **FIRE ON** is on. FIRE ON is on by default; with it off the stick only aims. The toggle and Settings'
  "Touch: aim stick outer ring fires" stay in step and are kept with the other settings. Held short of the ring with
  fists, a bat or a blade, the stick guards, as before.
- **FIRE**: a tap fires where the stick aims while it's held. With a gun out the stick's aim also stays for 1.2 s after
  you let go, as before, and FIRE uses it. Otherwise a tap fires at the **auto-target**, which is new: the nearest
  person standing ahead in reach (within 0.7 rad either side of where you face; all round at the wheel, not anyone
  aboard with you; never your crew or the down). With nobody there it fires where you face, and a drive-by goes
  straight ahead. Before, a tap without the stick fired where you faced.
- **BLOCK** (C1 with fists, a bat or a blade) is held to guard, as well as the stick.
- **Golf, hoops, bowling, tennis, the fire hose, the bow** use the stick again, as they did. There is no auto-target
  by your golf ball, on a court or a lane, with a crate, fishing or on a board, so a golf shot still starts aimed at
  the flag. The aim line is the stick's, as before.
- Keyboard and gamepad are unchanged.

### Page weight
- The slot tables, the auto-target and the placing load with the touch controls (shared/touchcontrols.js,
  client/touchslots.js: a dynamic import the first time the device is touch), not with the page. The page is 498.1 KB
  (budget 498, unchanged). style.css is smaller: 22 KB gzipped (it was 23).

### Tests
- test/hudlayout.test.js: every touch state on every screen of the HUD page (844x390, 740x360, 390x844, 1024x768,
  1280x720, 1920x1080; the six H70 states plus unarmed, horse, board, boat, swimming, passenger, surfing, home). It
  checks that no two controls overlap - the aim stick and its ring included - that each is 44 px or more, that nothing
  is in the left 40% or over the middle or on the HUD (the minimap, the vitals, the cash, the weapon, the round
  buttons), that upright everything is right of the middle, and that each slot holds what shared/touchcontrols.js says
  it does.
- test/touchslots.test.js (new):
  - the slot contents per state, and the same role in the same slot;
  - the stick and FIRE ON everywhere but at home;
  - every action's button, binding, icon and README row;
  - the FIRE ON markup and setting;
  - the geometry on eleven sizes, with and without a notch's safe areas;
  - touchStick and touchAim: the stick aims without firing; past the ring with FIRE ON it fires, with it off it
    doesn't; FIRE taps where the stick aims, else at the auto-target; golf keeps its aim;
  - the auto-target, and the angle and the bits on the wire;
  - in a real headless page, touches on the stick, the toggle and FIRE go through client/input.js's sample().
- test/touchair.test.js reads the slot geometry: the rocker is clear of the stick, FIRE, ACT, EXIT, ITEMS and FIRE ON,
  and BRAKE, HORN and RELOAD are put away in the air.
- test/kbdrive.test.js and test/gamepad.test.js are back to their checks of the stick's ring and the FIRE ON toggle;
  only the toggle's markup is new.
- Captured on the dev server (World v3), before and after, every touch state at 844x390 and 390x844, plus armed and
  driving again with the stick back: ui2-shots (before, after, after2) in the session's scratchpad.
