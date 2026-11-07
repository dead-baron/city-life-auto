# City Life Auto - working notes

- Authoritative Node server (`server/`), "dumb window" client (`client/`), shared code in `shared/`. Zero runtime dependencies.
- **Pushing to `main` deploys live:** the Oracle server (play.deadbaron.com) pulls `main` every 2 minutes (`deploy/auto-update.sh`, `cla-update.timer`) and restarts when `server/` or `shared/` changed - online players get a brief reconnect. Only push when tests pass, and batch server changes. A version that fails its health check is rolled back automatically. GitHub Pages serves the client.
- Tests: `npm test` (runs `node --test test/*.test.js`). Run `node tools/stamp-version.mjs` before every commit (cache-busting build id).
- Docs: add a `docs/DEVLOG.md` entry for each feature; keep the README controls table current.
- The page imports the map's runtime (`shared/mapcore.js`, `roadcore.js`, `layoutcore.js`), never the generator (`shared/map.js`, `naturesites.js`, `worldmask.js`, `countryside.js`, `islands.js`, `metro.js`, `citylayout.js`, `roads.js`): code that reads a built map goes in mapcore.js / roadcore.js (map.js and roads.js re-export them); the page builds a city only through main.js `loadGenerator`. `test/perf.test.js` checks.
- Performance budgets (`test/perf.test.js`, `node tools/perf.mjs` for the report): the code each part of the page loads, building the city and baking chunks (as multiples of a CPU yardstick), what the city and a kept chunk weigh. Keep startup code lazy (main.js must not import the art v2 renderer statically). Raising a budget is a decision: say why in the DEVLOG.
- Browsers keep the city and baked chunks (IndexedDB; `client/worldcache.js`, `client/art2/game/chunkstore.js`) under version.json's `world` / `art` hashes - stamping computes them, so stamp after any change to the world or the art (the perf test checks). A new `art` hash no longer throws every kept chunk away: the server compares each chunk it bakes with the build before's, byte for byte, and pages carry identical ones over (`server/artcdn.js` same, `client/art2/game/chunkcarry.js` - kept out of the art hash on purpose: don't import it from the bake's own modules).
- The map is a window onto the world (World v3, docs/WORLD-V3.md part 8): code that reads a built map indexes its per-tile layers through `m.idx(tx, ty)` / `m.inside(tx, ty)` (`m.row(ty) + m.col(tx)` along a row) and bounds loops by `m.x0`, `m.y0`, `m.w`, `m.h` - never `ty * MAP_W + tx` or `MAP_W` / `MAP_H` (only the generator and whole-frame uses keep them; `test/mapwindow.test.js` checks).
- The world must come out bit-identical in every JS engine (the client checks the map signature on joining; Safari's `Math.sin` & co. differ from V8's): `generateCity` runs under `withDeterministicMath` (`shared/dmath.js`). In shared code, nothing computed while a module loads may use those Math functions (use `dsin` etc.), `**` only squares, never `Math.random`. `test/dmath.test.js` checks.

## Offline practice is paused (user, 2026-10-20)
PRACTICE OFFLINE is hidden on the title screen (`PRACTICE_ON` in `client/main.js`): it plays the old city, not World v3
(`client/practice-worker.js`). Don't build on it until the owner and Claude agree a plan; keep its test passing.

## The first-time experience (FTUE; owner-approved 2026-11-04)
The old city tour is retired (`shared/tutorial.js`, `client/tutorial.js`, `TUTORIAL_ON` are gone). The tutorial IS the
first goal: new characters get the FTUE (`server/systems/ftue.js`, page side `client/ftue.js`) - the arrival by train at
the station they pick (`firstcar.js` `arrivalFor`: one function for the train, the used lot and the steal alley), one
question ("What brings you to town?"), a first goal of at most three steps - the first car earned by the answer's path
(bought at the station's used lot, or stolen in its alley: `server/systems/firstcar.js`; the free starter car stays only
with the players who had one) - then the first-time moments. The phone's Guide (`shared/guide.js`, `client/guide.js`)
is the in-game wiki. The owner: "short and sweet and give people general direction".
- Teach the new thing: when a system changes, update its Guide entry (`shared/guide.js`) and, if it has one, its
  first-time moment (`ftue.js` `MOMENTS`) in the same change. A new job, place, activity or control gets a Guide entry.
- The Guide's numbers come from the data (`shared/rules.js`, `items.js`, `fish.js`, `vehicles.js`) and its controls are
  `[[action]]` names from `shared/controls.js` (the page draws each device's glyph): never type a number or a key into
  it. `test/guide.test.js` checks.
- Player-facing numbers belong in `shared/rules.js` (the FTUE's own: `FTUE`); controls in `shared/controls.js`.
- Keep it light: at most three steps, one fading line each, skippable everywhere, never blocking play; only new
  characters - and every character once: profiles from before were reset (`server/store.js` `PROGRESS_EPOCH`; a future
  full reset is that number bumped). All of it decided on the server; `test/ftue.test.js`.
- `client/ftue.js` and the Guide load lazily (the page is at its file budget).
