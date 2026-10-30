## 2026-10-30 - UI-7: fishing's meter gets its own spot, one prompt while fishing, big words on one line

The owner, on a phone held upright (2026-10-26): "Fishing UI is hidden behind the weapons selection button. And some
UI text like the 'ACT' in this text looks bad as is. Some text is on two lines with the same style in other cases."
His screenshot showed the fight's meter (the track, the fish, the catch gauge) drawn at a fixed spot right of the
player, on top of the weapon button and FIRE ON, and a big gold "Hold [ACT] to reel" over the water: the ACT chip a
squashed, blurred box and "to / reel" wrapped onto a second line, while the prompt under the player already said
"ACT Hold to reel, let go to ease off".

### The meter has a spot in the HUD
- **index.html `#fishspot`**, an empty box style.css places like any other part of the HUD; client/fishing.js draws
  the meter in it (its box read once per screen size) instead of at `min(W - 90, W / 2 + 90)`.
  - **Keyboard and pad:** right of the player, past the prompt's widest (50% + 300 px, kept on the screen), centred; in
    a short window under the top-right column and shorter.
  - **Touch, upright:** at the right edge, from 36% down (under the notes and the job card, over the thumb).
  - **Touch, sideways:** at the right edge, down to the bottom.
- **The touch slots stand aside while a line is out** - a new state in shared/touchcontrols.js, `fish`: ACT alone
  (it casts, strikes and reels; nothing else does anything then), so the weapon button, the aim stick, FIRE, CAR and
  the utilities leave the right-hand side to the meter. It wins over everything but home (a boat's wheel still steers
  with the move stick, and driving off reels in, as before). client/touchslots.js tells it from `me.fishing`.
  README's touch row says so.

### One prompt at a time
The prompt slot (#helpbox, from the server's fishing.js `interaction`) shows on every device the whole time a line
is out: "Let go to cast", "Waiting for a bite...", "STRIKE!", "Hold to reel, let go to ease off". The big copy
(#fishbar) said the same thing again, so it's gone; what's left of it are the two timing cues the prompt can't flash:
**LET GO!** at the top of the cast's swing and **STRIKE!** on the bite.
- They're one line (nowrap, at most 28 px or 7% of the width).
- The key in them is a proper key cap (`.bigkey`): the UI font at 0.62 of the words round it (never under 14 px),
  padded, 1.9 em tall, with no halo of its own. The halo that big words carry was smearing the old 14 px pixel-font
  chip.

### Big words never on two lines
- **The district's card** (40 px) and **the warning past the map's edge** (28 px) were allowed two balanced lines;
  "LEAVING THE CITY'S WATERS" or a long district name broke in two upright.
- They're one line now. client/hud.js `fitLine` shrinks them to the screen less 24 px when they'd be wider. The
  warning is "LEAVING CITY WATERS" (fitted again when the screen turns).
- The other big-pixel texts are canvas text (never wrapped) or panel titles inside their own panels.

### Tests
- **test/hudlayout.test.js** measures a `fish` state on every screen and device (desktop 1280x720 / 1920x1080 /
  1024x768, sideways 844x390 / 740x360, upright 390x844 / 412x892 with a camera inset):
  - the meter's spot is on the screen;
  - it's tall enough (120 px under 400 px tall, else 150);
  - nothing overlaps it (the touch slots, the prompt, the notes, the job card, the minimap, the top-right column) and
    it's never on the player;
  - the STRIKE! cue is a single line;
  - on touch, the slots are in the fish state.
- **test/touchslots.test.js:** fishing shows ACT alone, on foot or at a boat's wheel, whatever else you hold.

Shots: scratchpad ui7-shots/before (the live game, the charge and the wait, upright and sideways) and after (the HUD's
fish state from test/hudpage.js with the meter's box filled in: upright, a camera inset, sideways, a 740x360 phone and
two desktop windows). Live after shots weren't taken because the shared machine's heavy-work lock was queued for hours.
