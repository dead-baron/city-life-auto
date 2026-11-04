## 2026-11-03 · UI-9: the UI kit, the HUD and the touch controls (stage 1 of the owner's UI concepts)

The owner's concepts of 2026-11-03 (docs/art-v2/targets/ui: UIK-00 the kit, UIC-09 the icons, UIC-10 the touch
controls, UIC-11..14 the HUD, UIC-20 the motion) built into the page, with his four decisions over them: the two touch
sticks keep exactly their behaviour; build on systems the game has; a director-level UX pass, every call written down;
and a minimal, clean HUD where nothing lingers that the player doesn't need at a glance.

### What's in
- **The kit as code** (client/style.css `:root` and "the parts"): UIK-00's swatches exactly (the navy plate #0F1830 at
  85%, the panel #15223F -> #0D162D, gold #E2BD57, cream, dim, money green, danger red, info blue, heat orange, steel
  blue), the type scale 40/28/20/16/14/12, one plate (navy, the gold rim, an ink line, a soft shadow) for every HUD
  plate, the buttons (primary gold, secondary navy, danger red) in normal / hover-focus / pressed (92%) / disabled
  grey, the round icon button with its key badge, tabs, toggle, slider, segmented, text box, checkbox, dropdown, the
  progress bar, the cooldown ring and the count badge. test/uikit.test.js pins them.
- **The icon set** (client/touchicons.js): UIC-09's sheet drawn in code on the 24 x 24 grid - navigation, status,
  actions, phone apps, map blips, plus the touch buttons' own and the status chips' (mask, coffee, wine, a meal) -
  each with the sheet's one-pixel ink outline, emitted as crisp whole-pixel SVG (or onto a canvas for the minimap).
  They replace the HUD's line icons (the round buttons, the vitals, the bank, the clock's sun and moon, the stars, the
  notes, the job card, the prompt and hint chips) and every touch button's.
- **The HUD** to UIC-11..14: top left the minimap with the clock's plate and the status beside it, the job card and the
  notes under it; top right the phone / map / menu round buttons (key badges on a keyboard), the stats plate (health,
  stamina, the cash, the bank on a desktop), the stars while wanted, the vehicle plate, the weapon plate with the quick
  weapons; the prompt and its progress bottom centre on every device; the first-time key hints bottom left.
- **The touch controls** to UIC-10: FIRE 72 px (red rim, red when pressed, its ring filling while you reload), ACT 60
  (gold rim, gold when pressed), the secondary buttons 44, disabled grey, the cop car's cooldown ring, the auto-fire
  switch red when on. The sticks restyled only: the move stick and the aim stick with its red inner circle keep their
  behaviour and their sizes (client/input.js untouched; test/touchair.test.js passes as it was).
- **The motion** (UIC-20): a note slides in 8 px and fades in 150 ms, the newest on top pushing the older down, the old
  fading out; the cash counts up over 300 ms with the difference floating up beside it; a hit shows the lost health
  white for a moment, then drains in 400 ms; a button presses to 92% and back; the prompt pops in from 90%, the key's
  ring lights as Act is pressed, and a green tick shows when what it offered is done.

### The UX decisions (each with its reason)
UX_DECISIONS

### Perf
PERF_NOTES
