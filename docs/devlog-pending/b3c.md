## 2026-10-24 - b3c: the shops where you need them, again after batch 3

Batch 3 broke test/world3server.test.js "shops where you need them": Pine Hills' and Sunset Beach's south-west streets
were 433 and 462 tiles from a gun shop (the reach is 400), and The Strip had no food of its own.
- The cause (World v3 built at batch 2 and at batch 3, the shop places compared): not the clinics. Batch 2's Sunset
  Beach gun shop stood in a plain roof block behind the houses at (2774, 3158); batch 3a's back gardens (map.js
  `fillerInner`) put a garden there instead, and no plain building, generic storefront or open lot was left within reach
  of that corner, so the shops pass gave up. The Strip's snack cart was put on the pavement's last row, its map point one
  tile further south, in Mesa Flats. It counted as Mesa Flats' food, and the pass made one try only.
- shared/world3-shops.js:
  - where nothing else will do (no plain building, no generic storefront, no open ground near), a named business's
    storefront is taken over, by the rules the clinics take theirs (world3-medics.js `STORE_KEYS` / `NOT_INTO`, now
    exported): a shop, restaurant or small office lot building with only storefront doors in it. Never a home's, a
    handcrafted district's or a painted one (`fixed`), and one need to a building. Sunset Beach now has Marksman Firearms
    and Home Run Sports this way.
  - Failing that, a gun shop or a hardware store (not for a remote village) goes farther off, just inside the reach and
    over the district's edge: in a plain building, a named storefront or on open ground in a built-up district (past the
    park and the wild land). Downtown, built by hand to its edges between the park and the handcrafted districts, had
    its south-east corner's hardware store from Pine Hills' pass by luck (394 tiles at the worst). The first fix moved
    Pine Hills' shops and took it to 411; a hardware store now goes up for it on open ground in Pine Hills, where batch 2's gun shop stood (366).
  - A snack cart's or an ATM kiosk's map point must be in the district it is for. A district gets up to three tries at a
    place of its own, each at the street then farthest from one; a try that finds nothing ends them.
- After (tools/world3b/shops.mjs): Pine Hills weapons 340 at the worst, Sunset Beach 318, Pelican Key 317 (was 371),
  Downtown equipment 366; The Strip has its own Lemonade Stand. The Gull Harbor and Egret Point equipment
  give-ups are as at batch 2 (the test doesn't ask a village for reach).
- test/world3shops.test.js has a new case: a street built up with named restaurants, the water across it, gets its gun
  shop, hardware store and corner store in three of them.
