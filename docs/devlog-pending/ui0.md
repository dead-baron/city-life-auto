## 2026-10-24 - ui0: the UI review's quick fixes (P0) - the touch controls off the sticks, 44 px targets, the debug bits back

The UI/UX review of every screen (step 1 of the overhaul) listed nine quick fixes before the redesign. This is those
nine; the redesign (P1 / P2) waits for the mockups and the owner. The owner's example was the first: flying on a phone
held upright, ▲ and ▼ sat on the move stick.

### The touch controls (client/style.css)
- **Upright (390 px wide), every right-hand control right of the middle** - the left half is the move stick's. Over
  the aim stick FIRE and ACT; over them WPN, CAR and THROW; beside the stick ROLL / BRAKE with HORN / RELOAD above it.
  In the air CLIMB and DOWN take those two places (they sat on the move stick); RELOAD at the wheel takes THROW's. The
  cluster reaches no higher than it did (y 548 on 844), the stick itself 12 px nearer the edge to make room.
- **CLIMB / DOWN** written on the buttons under the arrows (they were ▲ / ▼ only). **BRAKE is put away in the air**
  (only a plane on its wheels brakes, and pulling the stick back does that too).
- **FIRE ON** (the aim stick's ring fires) is a small pill top left with ITEMS and the flashlight: on its side by the
  minimap, ITEMS / FIRE ON / 🔦 / COP CAR down a column; upright in a row under the minimap. It sat on the aim stick's
  ring, and a thumb on the stick's edge flipped it.
- **44 px or more to tap, everything on touch**: the round HUD buttons (the 34 px circle drawn inside a clear border),
  the pills (30 px tall drawn, 44 to tap), FIRE ON, WPN and HORN / RELOAD (45 px after a short screen's 0.9 scale -
  the pills keep out of that scale), the panels' ✕ (pause, bag, phone, settings, shop, map), the phone's ◀, the death
  screen's ◀ ▶ and hide, its spawn map's buttons, the title's graphics and tool buttons, the creator's tabs, chips,
  swatches and turn buttons, the settings' selects, switches (drawn 24 px in a 44 px target) and sliders, the map's
  check boxes, rows, zoom buttons, Set Waypoint and ✕, the bag's pins and Use, the hub's tabs, and the cinematic panel and bar.
- **Safe areas**: the aim stick, ROLL / BRAKE and DOWN clear of the home bar (env(safe-area-inset-bottom)), the
  upright column by the right inset, the round buttons by the camera at the top, the phone, the weapon picker and the
  cinematic panel inside the top inset.
- The aim stick's name (AIM · PUNCH) sits under the stick: ACT covered it.
- A phone on its side 800 px wide or less: the round buttons start beside the pills and the cash comes 6 px nearer
  the edge so all of it fits at 740 px with the 44 px targets; the grey 🐞 leaves that row until Dev Debug Mode is on
  (the pause list's Debug menu line still opens it).

### The HUD
- **The weapon and its rounds show on a phone held upright** (compact, top right over the cash; it was hidden). The
  round buttons, the notes and the robbery / train / custody bars moved down to make room; the prompt 14 px lower.
- **The job line upright** sits in the left half over the move stick (it was mid-screen across the buttons' rise).
- **The weapon box is gone from the big map** (its "TAB to switch" / "tap: next · hold: pick" wrapped and was cut
  off). On touch the HUD's weapon plate no longer says "tap: next · hold: pick" - WPN ⇄ says it.
- **The prompt's colon** after the key chip is gone ("E : Enter ..." read as a typo, ": Counter" on touch).
- **#net** (fps, ms, entities) shows only in Dev Debug Mode, on a desktop.
- **The pause list**: Debug menu is the last line, so Resume is first and has the focus.

### The new batch-4 pieces under the same rules
- **The cinematic drift / follow-scenes bar** (client/director.js): on a phone it takes the action buttons' corner,
  bottom right, at most half the screen wide, and the action buttons, the aim stick and FIRE ON are put away while it
  shows (the camera has the controls then; they did nothing). It sat over FIRE, ROLL and both sticks upright. Its
  buttons and the panel's are 44 px on touch.
- **The death screen's spawn map** (client/deathscreen.js) on a phone on its side ends higher, clear of the panel's
  now-taller 44 px buttons (its list had covered the panel's hide button).
- **Going down closes the cinematic panel** and brings the camera back to you (a drift or a follow scene kept the keys
  and the pad from the death screen's choices); the bar hides while you're down. The panel sat over the death panel.
- **The job arrow** (client/jobway.js) keeps on a phone to the open middle of the screen, clear of the HUD at the top,
  the sticks and the buttons (it reached under them at the screen's edge), and points out from you; "SEARCH AREA"
  sits at that part's top.

### Tests
- test/hudlayout.test.js: on every touch screen of the HUD page (844x390, 740x360, 390x844, 1024x768, 1280x720,
  1920x1080; on foot, driving, flying, police, robbing, arrested) no touch control on another, every one 44 px or
  more, and upright the right-hand ones right of the middle - with the H70 checks as before.
- test/touchair.test.js reads the safe-area bottoms and checks BRAKE is away in the air; test/kbdrive.test.js the
  FIRE ON pill's markup.
- Captured on the dev server (World v3), before and after: ui0-shots in the session's scratchpad.
