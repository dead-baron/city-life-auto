
## 2026-11-01 - The bathhouses: a bathing suit or nothing at all, the Sims' pixelation

The owner asked for this on 11-01: "pixelated instead of a blue square ... like how the sims handled that" and "you shouldn't need a bathing suit for the bathhouse, you can change into a bathing suit or just not wear anything at all".
- **The lockers** (server/systems/bathhouse.js) offer three choices:
  - "Undress - nothing on" (`ba:bare`, s.suit 2)
  - "Change into a bathing suit" (`ba:suit`, s.suit 1)
  - "Get dressed again" (`ba:dress`)

  You can shower and soak in either. The prompts now say "undress at the lockers first (a bathing suit if you like)".
- **The bathers** in the routine go in with nothing on at `BATH.bareShare` (0.6, shared/rules-play.js). The rest wear a bathing suit.
- **Nothing on** is a look piece, the `Nothing` set (shared/lookcore.js). It's issued, so it isn't sold, doesn't appear in the creator and is never in a random look. It draws as a bare body, barefoot.
- **The mosaic** (client/art2/people.js censor) is the Sims' way:
  - chunky 2-art-pixel blocks, each the average of the body's own pixels under it and a pixel round it;
  - neighbours a shade apart, so the squares show;
  - a little larger than what it hides, with rounded corners;
  - no crease or outline line crosses it.

  It replaces the small skin-tinted patch. Before this, the bathing suit (white vest over coloured trunks) read as underwear with a blue square.
