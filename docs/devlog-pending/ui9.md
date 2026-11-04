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
What stays on the screen all the time is what you need at a glance to play (the owner's #4): health, the cash, the
minimap with the clock, the controls - plus, while they apply, stamina, the stars, the job card, the vehicle plate and
the weapon. Everything else comes when it starts or changes and goes on its own.

1. **The status row goes transient** (client/hudinfo.js `hudChips`, `statusOpen`). A chip is in words for STATUS_MS
   (4.5 s) when it starts or changes, then folds to its icon alone on a small round plate; a tap or a click on the row
   brings the words back for 4.5 s. Why: you keep the awareness (an icon says you're bleeding) without words parked
   over the view. The audit, chip by chip:
   - *Role / faction*: Citizen never shows (it's the default). Police · rank, Criminal, Bounty hunter: in words when it
     changes (going on duty, turning criminal), then the badge, the mask or the crosshair. Who you are changes rarely
     and your look says it; the phone has the rest.
   - *Samaritan, Criminal XP*: off the HUD - the phone's Skills ("Standing"). Standing numbers don't help you play the
     next ten seconds.
   - *Record (felonies)*: the phone's Skills, beside them. Same reason.
   - *Bleeding*: words when it starts, then a blood drop that stays while you bleed - an ongoing danger you can act on
     (a shower, a medkit), so it keeps a small mark.
   - *Bounty* (on you): words when it's put on you and again whenever the sum changes; the target icon while it lasts;
     its time left in the words when tapped. The owner named it as transient.
   - *Buffs* (Coffee, Energy, Wine, Scent, Well fed): words when one starts; the countdown ticking is no change (it
     doesn't re-open); the icon while it works.
   - *Light on*: gone. The light in the world and the lit LIGHT button already say it.
   - *Ghost*: gone. It's your body left behind while you're offline - never seen by you while playing.
   - *Misconduct* (police): words whenever the count changes (red at the limit), the warning icon while any.
   - *Police remember you*: gone for good (main, 11-03); its leftover icon entry dropped. The mechanic stays on the
     server.
2. **Stamina only when it matters**: its row folds away once it has been full 2.5 s, and in a vehicle; spend it and
   it's back at once. (The owner: "health (and stamina when it matters)".)
3. **No weapon plate with your fists out and nothing going on** (desktop); it comes with a weapon, a fight or the
   police. On touch the weapon button is a control, so it stays where it is.
4. **The quick weapons** (UIC-11/12's row under the weapon) show for 4 s after a switch, or while the pointer is on the
   plate - not all the time. Tab, the wheel and 1-9 stay the main way; the row is the mouse's shortcut.
5. **One place for the prompt**: bottom centre on every device (on a keyboard and a pad it used to follow you round
   the screen). Why: UIC-11/12; the eye learns one spot, it never covers you or the middle; two lines at most on a
   phone (the ACT button carries the rest - red with "!" for a crime).
6. **The notes (toasts)**: the newest on top, sliding in; gone by themselves in 2.6-6 s by length; two at most on a
   desktop, one on a phone; a long one cut short with LOG › and the whole of it in the phone's Log.
7. **The key-hint line** (UIC-11's "[WASD] Move ..."): the first HINT_TIMES (3) times per state per character, 7 s
   each, then never - a new on-foot line for keyboards and pads joins the driving, flying, riding, boat and board
   lines. A returning player doesn't need it.
8. **The stars** only while wanted and 8 s after (dimmed).
9. **No upright quick bar** (UIC-14's weapon · medkit · phone row): the weapon button already sits by the right thumb,
   the phone is the top-right button, healing is in ITEMS and the bag. One way to do each thing; the bottom centre
   stays clear of both thumbs and the home bar; and the aim stick, kept as it is (#1), holds the corner that row
   would run into.
10. **The round buttons stay a row on a sideways phone** (UIC-13 stacks them): the right edge under them is the
    thumbs' cluster.
11. **The clock stays**, one cluster with the minimap: day and night, shop hours and the rain (the road's grip) change
    how you play.
12. **The bank**: under the cash on a desktop (UIK-00 3B), not on a phone (UIC-14); deposits and payments say
    themselves in a note.
13. **The vehicle plate**: the name, the speed, the condition bar. The concepts' fuel gauge is left out - the game has
    no fuel (#2).
14. **FIRE's cooldown ring is the reload** (UIC-10's "cooling down", wired to the game's reload time); the cop car
    keeps its call-again ring.
15. **The sticks**: restyled only. The move stick and the aim stick with its red inner circle (aim and block inside,
    fire past it) behave exactly as before.
16. **The job card**: big for 5 s when a step comes in (or on a tap), then a one-line chip; upright it is two short
    lines (the job; the clock and how far), as UIC-14.
17. **On a phone one status chip in words at a time** (the newest); the rest are icons. The row stays one line beside
    the minimap, clear of the middle third; a tap opens them all.
18. **No standing "TAB to switch" / "RB / LB" line on the weapon plate**: the on-foot hint line (first three times)
    now teaches the next-weapon key instead, and the plate shows only what you hold and its rounds.
19. **Health stays, numbers and all** - the one vital that's always on (with the white flash and drain on a hit).

### Perf
`node tools/perf.mjs --quick` against main: the page's start-up code 477 -> 485 KB gzipped (budget 520; the icon set,
the kit and the HUD's motion), 83 files as before; the title screen's assets 246 -> 249 KB (budget 290; style.css
28 -> 31 KB); the city, the renderer and the bake unchanged. No budget raised. The icons are built the first time
each is asked for and kept (one SVG string per icon); the motion is CSS transitions and keyframes, the money's
count-up one requestAnimationFrame loop for 300 ms, the reload ring one while reloading.

### Found on the way
- The kit's generic `.chip` (30 px tall) also matched the job card's `#job.chip` and pinned it to one line's height:
  `#job.chip` now sets `height: auto`.
