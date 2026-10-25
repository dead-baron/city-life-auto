## 2026-10-24 - ui1: one UI system - the tokens and the parts, the old GTA look retired (the UI overhaul, phase UI-1)

The owner approved the UI/UX overhaul ("I think the UI/UX proposal is looking good let's move forward with that
overhaul"). Phase UI-1 is the foundation: one look for every screen, built from a small set of tokens and parts, with
the screens moved onto it and their layouts left as they are. The touch slots (UI-2), the hub (UI-3) and the HUD's
information (UI-4) build on it.

### What the player sees
- **One look everywhere**: navy panels with a 2 px gold rim, one gold, CLA Pixel for titles and numbers and Barlow
  Condensed for everything you read. The phone, the bag, the quick wheel, the weapon wheel and picker, the shop and
  counter menus, the pause list, settings, players online, install help, the map screen, the cinematic panel and bar,
  the debug menu and free camera, the creator and its starting looks, the knocked-out panel and its map, the jail
  plate and the title screen all wear it. The pink-to-purple GTA headers, Anton, the black outlines, the slate "app"
  style and the cinematic panel's system font are gone.
- **The title screen**: PLAY a gold button with ink words; the graphics choice one segmented control (a check and
  "recommended" readable inside the button, not a 9 px tag cut by its edge); Install, Settings and Fullscreen 44 px
  secondary buttons; the background solid navy (the world no longer ghosts through it); the build line readable.
- **Buttons by role**: primary (gold, ink words), secondary (navy, gold rim), destructive (a red outline - Start fresh,
  Leave Dev Debug Mode), icon buttons; the close ✕ a gold-rimmed square (44 px on touch).
- **Settings' switches are toggles** (a knob that slides, gold when on, 52 x 44 on touch), the sliders gold, the
  selects navy with a gold edge.
- **Colours mean one thing each**: money green, danger red (health, FIRE, crimes), info blue (stamina, the bank,
  waypoints, the police), heat orange (the stars, warnings, the HOT cash). The stars are heat orange.
- **Notes fade out** instead of vanishing (250 ms), panels arrive with a short eased rise, and nothing animates for
  someone whose device asks for reduced motion.
- **Canvas text** over the game - the minimap's letters, the floating numbers and speech, names over people, the
  horse / skateboard / fishing cards, the ATM sign, the home's names, the knocked-out map, the debug teleport map, the
  stargazing names - in CLA Pixel or Barlow (it was monospace, system-ui, Rubik or Anton). The art's own painted signs
  and the arcade cabinets' screens keep their pixels.
- Behaviour, contents and layouts are unchanged: the same buttons in the same places, the same lists.

### The system (client/style.css)
- **Tokens** on `:root`: the eleven colours (ink, navy, navy2, navy3, gold, cream, dim, money, danger, info, heat), the
  see-through steps made from them (glass, shade, scrim, gold washes), the six type sizes 12 / 14 / 16 / 20 / 28 / 40
  (`body.touch` lifts the smallest to 14), the radii 4 / 10 / round, the spacing 4 / 8 / 12 / 16 / 24, the 44 / 48 px
  targets, the motion 150 / 200 / 250 ms with one easing. "What things are" colours (a pad's buttons, a casino's felt
  and cards, the map's sea, the rail and ferry lines, an arcade cabinet's neon) are tokens too.
- **Parts**: `.panel` and `.mhead`, the list row (`.row` / `.opt`), `.btn` / `.btn-1` / `.btn-x` / `.ibtn` / `.x`,
  `.chip` and the key chip (`.kchip`, `.g-key`, `.g-touch`), `.toggle`, `.slider`, `.stepper`, `.tabs` / `.tab`, `.seg`,
  `.field`, and for coming and going `.enter`, `.out` and `.foldable` (a compact and an expanded state, `.open`). The
  existing panels use them by selector list, so their markup and the tests that read it stay as they were.
- **No literals in the rules**: every colour, type size and radius is a token. test/uitokens.test.js checks it, here
  and in the CSS the lazily loaded panels carry (director.js, devmenu.js, spectator.js, creator.js, deathscreen.js),
  checks the two faces are the shipped ones, and that the UI's canvas text uses them.
- **One exception, for UI-4**: the HUD's small readouts (bank, status, faction, clock, the weapon line on a phone) use
  `--fs-hud` (12 px) on a phone as well - at 14 px they pushed the top-right column onto the prompt and the notes onto
  the pills (test/hudlayout.test.js). UI-4 lays the HUD out again and retires it.
- **Moved out of the page's stylesheet**: the debug menu's look into client/devmenu.js and the free camera's into
  client/spectator.js (both load only when used); the old debug side panel's dead rules dropped.

### Sizes
- client/style.css: **134,131 -> 114,897 bytes** (30 -> 23 KB as sent).
- Title screen assets: **273 -> 241 KB** (budget 290): Anton (26 KB) is no longer shipped - assets/fonts/Anton-Regular.woff
  and its licence are removed - and index.html preloads Barlow Condensed SemiBold instead.
- The page: 497.5 -> 497.7 KB (budget 498, not raised): the canvas font names and the notes' fade. The renderer is untouched (400).

### HUD coverage (the owner's UX bar)
The capture audit now measures how much of the screen the HUD paints over the game (`coverage`: hud, the middle third,
and everything over the world with panels open), before -> after, per size:
- Over the eleven in-game states (on foot, the prompt, wanted, a taxi job, driving, a boat, the heli and the plane, the
  horse and two bikes), the average share HUD covers:
  - desk: 7.0 -> 7.8 % (the middle third 0.5 -> 0); the rise is the notes in Barlow 16 (were the pixel face at 14) and
    the prompt at 20, the mockups' sizes;
  - land: 34.4 -> 33.2 % (the middle third 9.0 -> 6.4);
  - port: 35.7 -> 34.7 % (the middle third 9.2 -> 7.4).
- Most of a phone's share is the touch controls and the sticks (UI-2's to bring down) and the top band (UI-4's).
- Targets under 44 px on touch, from the audit: the bag 44 -> 9, settings 18 -> 0, pause 12 -> 0, controls 12 -> 0,
  the debug page 778 -> 1, the title's settings 8 -> 1.

### Checked
- Every screen in cap.py's list at desk 1440x900, land 844x390 and port 390x844, before and after
  (scratchpad/ui1-shots/).
- Tests: hudlayout, hudlayers, titlemenu, phones, director, loadorder, gamepad, touchair, spawnmap, lazypage,
  startfresh, campfire-ui, crush, fishing, homeart, homeprompt, jobway, kbdrive, shadowing, worldmap, devtp, mapwindow,
  worldframe, perf and the new uitokens: 94 / 94 pass. `node tools/perf.mjs`: all within budget.

### Left for later phases
- The pause list on a phone on its side shows five lines, not six (its lines are 44 px now); the hub (UI-3) replaces it.
- `--fs-hud` (above), the round HUD buttons' look and the touch buttons' places are UI-2 / UI-3 / UI-4's.
- Seen while capturing, not from this change: the renderer's foraging pass can throw "Cannot read properties of
  undefined (reading 'k')" (client/art2/game/host.js `_forage`: its cached grid `_fgrid` indexes an older forage list
  after the list changes), which shows "Something went wrong drawing the game" once.
