# Shopping cart concepts CC01-CC04: the catalogue

The owner's shopping cart concepts of 2026-10-18 (10:16), filed as `CCnn.jpg`. They are for the shopping cart vehicle
(task #329, shipped the same morning: kicked along from the back and ridden on its back rail, one in the basket, thrown
out in a crash) and they refine it.

Each entry gives what it shows, then what it feeds.

- **CC01**: a market's car park at golden hour:
  - two loaded carts head on in the middle of the lot, both riders flying, the shopping (cans, cartons, an orange) and
    the riders' caps thrown out round the impact;
  - two more carts coming, a rider pushing one in each with a friend in the basket;
  - the market behind: striped awning, produce stands by the doors, bollards, a corral of nested carts with its rail
    along the storefront, another corral out in the lot with a cart sign, the "MARKET" sign.
  - **Feeds:** the shopping flying out in a crash (the page's `cartcrash` effect: client/main.js); the corrals (not yet:
    they'd be props in the map - a world change).
- **CC02**: the rider and the one in the basket:
  - *ride in cart* (8 frames): pushing at a run, the friend sitting in the basket, knees up, laughing, one frame a fist
    up;
  - *hit kerb and throw out* (3-frame arc): the cart stops at the kerb, the friend flies forward over its front, the hat
    off, and lands sprawled on the pavement; the pusher stumbles into the handle;
  - the pair from the four sides: east, south (the friend's arms up), north (the pusher's back), west.
  - **Feeds:** the one in the basket sitting low with both arms up now and then at speed (client/art2/people.js
    `cartsit` frame 1; host.js picks it); the throw-out uses the game's own fling.
- **CC03**: the driver alone:
  - *push and kick off* (8 frames) from the four sides: leaning into the handle, one foot driving the ground back;
  - *stand on cart (coast)* (2 frames) from the four sides: both feet up on the back rail, leaning on the handle.
  - **Feeds:** the poses the game already has (`cartkick`, eight frames; `cartride`, two), the hands moved up to the
    new handle's height.
- **CC04**: the cart itself from eight headings, and two states:
  - a deep galvanised wire basket on a frame, the front leaning out, narrowing to the front, the bottom rack, four
    casters; red plastic on the handle and its end caps, the folding child seat's flap and the front corners;
  - *tipped over (on side)*;
  - *crushed (after crash)*: the basket buckled, a caster off.
  - **Feeds:** the cart's model (client/art2/vehicles.js shoppingCart) and its two states: tipped over after a hard
    crash (server vehicles.js cartCrash; whoever takes it next stands it up) and crushed when it's wrecked.

## Original file names
CC01-CC04: the owner's uploads of 2026-10-18 10:16, in the order 66a6723a, f9e1bbe9, a7464dfa, 2793000a
(`-image.png`).
