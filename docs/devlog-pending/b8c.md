## 2026-10-30 - Batch 8c: chess at the park, fireworks, a campfire of your own, grapes for the ducks

From the owner's notes, part 2:
> Feed ducks grapes and it gives you good samaritan points (has a daily cap but still significant, have to buy the grapes)

> Fireworks you can set off

> Chess at the park (chess tables you can play against NPCs or other players that come up to it)

> Build a campfire, lets you create a campfire anywhere which stacks some logs and a few log seats. Just as long as it
> cant be used to exploit anything, like block an entrance or something. We can just make it so it can be passed
> through. And it despawns if the player walks away after a certain amount of time

> You can catch on fire standing in a campfire but i think it should take a few seconds of standing in it before you
> catch on fire, not catch on fire so quickly.

**What was there already:** the town ponds' tame ducks and geese (wildlife.js parkDucks) and grapes (picked in the
vineyard, sold at the Old Town Market); the old men's chess games at the parks' and squares' tables (activities.js
'chess', the board prop and the sit pose); the map's campfires (light, sit, warm up, cook); and the campfire's delay
before you catch fire was already in from batch 7 (`BURN.campS`, 2.5 s in the flames, cooling off twice as fast out of
them). Nothing for fireworks. Everything below builds on those; the numbers are in the new shared/rules-leisure.js
(kept out of shared/rules.js, which every page loads at once).

**Chess at the park** (server/systems/chess.js; the rules shared/chess.js; the regular server/systems/chessai.js; the
board client/leisure/chess.js):
- Every table the old men play at is a chess table. Walk up: "Sit down at the chess table". Two of them already at it:
  "Challenge the chess players" - the one with the board gets up for you and the other plays you (you have white).
- Sat alone you wait for an opponent: another player walking up gets "Play chess with <you>" and sits across (colours
  drawn at random). Or "Play the regular": an old man shuffles over, sits down across from you and plays.
- The rules are complete and the server's: only a legal move is made (castling, en passant, promotion, pins), and
  check, checkmate, stalemate, the fifty-move rule, threefold repetition and not enough material are all decided there.
  Checked against the standard perft counts (the start, "Kiwipete" and position 3).
- **The regular**: a small alpha-beta search, two plies plus captures to the end, material and piece-square tables, a
  little whim so no two games are the same. He finds a mate in one and never leaves a queen hanging, but a careful
  player beats him. He thinks a root move at a time, three milliseconds a server tick, and takes 1.6-4.5 s over a move
  as a man in the park would. He takes a draw when he's worse off.
- **The board** sits on the arcade's overlay, low on the screen (bottom-centre upright, bottom-right sideways) so the
  table and the players stay in view. It has pixel pieces, the last move, check in red, dots for a piece's moves and
  rings round captures, a promotion picker and the last few moves in notation. Tap a piece, then where it goes; the
  arrows / WASD and Enter / Space; the d-pad and A. Below the board: Resign (press twice), Draw (offer it, or take one
  offered), Play the regular / Rematch (colours swapped), Get up. Esc / B gets you up: a game against another player
  in progress is resigned.
- Sat down you hold the sit pose at the table, and the west seat has the board in front of it, as the old men's games
  show it, so passers-by see the game. Your record (won-lost-drawn) is kept and told after each game.

**Fireworks** (server/systems/fireworks.js; the shows shared/leisure.js `fwShow`; drawn by client/leisure/stage.js):
- Skyrocket ($15 for 3), Fountain ($10), Firework Cake ($45, twelve shots) at the corner stores and gas stations.
- Bag → Use (or the quick wheel) sets it down at your feet and lights the fuse: 2.5 s of fizzing, then the show. The
  rocket climbs on a trail of sparks and bursts over the rooftops (peony, ring, gold willow, crackle, palm; one or two
  colours). The fountain throws a cone of sparks that changes colour. The cake fires a barrage, ending on a big one.
- Everyone sees the same show: the server sends the kind, the place, the fuse and a seed, and each page works out the
  shots from the seed. Someone coming in mid-show sees the rest of it.
- **The light:** each burst lights the city round it in its colour through the renderer's lights (a hook of one line
  in art2/game/host.js, `S.xlights`). The stars are drawn additively with a soft glow round each, a bloom of their
  own on the overlay layer. Sounds: the fuse struck, a whoosh going up, the bang and its crackle, the fountain's hiss.
- **The rules:** fireworks hurt nobody and break nothing. Three of yours at most at once, 1.5 s between two. Not
  indoors, underground, in the water or from a vehicle. In town after dark (not in the country, not by day) it's a new
  small crime, "Setting off fireworks in town after dark": if someone sees it, a little heat, and an officer may come for
  a word (law.js `fireworks`).

**A campfire of your own** (server/systems/campfires.js `build`):
- The Campfire Kit ($25: hardware stores, gas stations, the sports shop, the hunting lodge and camps). Bag → Use builds
  it 30 px ahead of you on open ground (not a road, the water, a bridge or indoors). It's a ring of stones with logs
  stacked in it, burning, and three log seats round the far side.
- It's the same fire as the map's: sit by it to warm up and heal ("Sit by the fire" puts you on the nearest free log
  seat), cook game over it, light it with a fire arrow, and stand in its flames for 2.5 s and you catch fire. Its
  embers rise and its light flickers on the ground.
- **Nothing about it is solid**, so it can't block a door or trap anyone. One a player (a new one puts the old one
  out). Walk 700 px away for a minute, or leave the game, and it burns out; it lasts 20 minutes at most. Sat at it, the
  action button kicks dirt over it.

**Feeding the ducks** (server/systems/ducks.js; wildlife.js states 'tograpes', 'nibble'):
- Grapes are now on the corner stores' and gas stations' shelves ($8 for two), as well as the market's.
- By a town pond's ducks or geese with grapes in your bag: "Feed the ducks some grapes". You throw them in; the
  nearest few paddle (or waddle) over to where they land and dabble, heads down, eating. Near them without grapes,
  you're told once where to buy some.
- **+3 Samaritan a feed, up to 15 a day** (the real day, UTC) - over half a police badge's 25 in a day. After that they
  still eat, for nothing. One feed every 10 s.

**Debug**: the dev command `park` (k 'chess' or 'ducks') takes you to the nearest chess table, or to the bank of the
nearest town pond with three tame ducks on the water in front of you. Fireworks and the kit also refuse a walk-in shop's
floor (a building's tile), not just a roof or a tunnel.

**The page**: everything new loads after the page. client/leisure/stage.js loads at the start (as client/music/stage.js
does) and registers the new items. The board, client/leisure/chess.js with shared/chess.js, loads the first time you sit
down. The bag has a new shelf, Outdoors & fun. Budgets: page 468 of 520 KB, renderer 401.2 of 401 (rounded; the
host.js hook was paid for by condensing its header comment), bake 906 of 906 - none raised.

**Tests**: test/leisure.test.js (new): perft, mate, stalemate, the draws, the notation; the regular taking a mate and a
free queen, thinking a root move at a time, a game against himself all legal; two players at a table (illegal moves
refused, the fool's mate, the record, a rematch, leaving resigns); the regular called over and answering; challenging
the old men; the ducks fed, the cap and a new day; fireworks lit, harmless, one at a time, the same show from a seed, a
crime in town after dark; a campfire built, sat at on a log seat, catching fire after a few seconds in it, burning out
once you walk off; the page's hooks. test/hub.test.js: the bag's new shelf.

Left for later: the regular plays one strength (an easy / hard choice would be a small step: `CHESS.depth`); nobody
watching a player's game stands round the table yet.
