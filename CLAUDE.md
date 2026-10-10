# City Life Auto - working notes

- Authoritative Node server (`server/`), "dumb window" client (`client/`), shared code in `shared/`. Zero runtime dependencies.
- **Pushing to `main` deploys live:** the Oracle server (play.deadbaron.com) pulls `main` every 2 minutes (`deploy/auto-update.sh`, `cla-update.timer`) and restarts when `server/` or `shared/` changed - online players get a brief reconnect. Only push when tests pass, and batch server changes. A version that fails its health check is rolled back automatically. GitHub Pages serves the client.
- Tests: `npm test` (runs `node --test test/*.test.js`). Run `node tools/stamp-version.mjs` before every commit (cache-busting build id).
- Docs: add a `docs/DEVLOG.md` entry for each feature; keep the README controls table current.
- Performance budgets (`test/perf.test.js`, `node tools/perf.mjs` for the report): the code each part of the page loads, building the city and baking chunks (as multiples of a CPU yardstick), what the city and a kept chunk weigh. Keep startup code lazy (main.js must not import the art v2 renderer statically). Raising a budget is a decision: say why in the DEVLOG.
- Browsers keep the city and baked chunks (IndexedDB; `client/worldcache.js`, `client/art2/game/chunkstore.js`) under version.json's `world` / `art` hashes - stamping computes them, so stamp after any change to the world or the art (the perf test checks).
- The map is a window onto the world (World v3, docs/WORLD-V3.md part 8): code that reads a built map indexes its per-tile layers through `m.idx(tx, ty)` / `m.inside(tx, ty)` (`m.row(ty) + m.col(tx)` along a row) and bounds loops by `m.x0`, `m.y0`, `m.w`, `m.h` - never `ty * MAP_W + tx` or `MAP_W` / `MAP_H` (only the generator and whole-frame uses keep them; `test/mapwindow.test.js` checks).
- The world must come out bit-identical in every JS engine (the client checks the map signature on joining; Safari's `Math.sin` & co. differ from V8's): `generateCity` runs under `withDeterministicMath` (`shared/dmath.js`). In shared code, nothing computed while a module loads may use those Math functions (use `dsin` etc.), `**` only squares, never `Math.random`. `test/dmath.test.js` checks.

## The tutorial is paused (user, 2026-10-06)
The tour is disabled in the game (`TUTORIAL_ON` in `client/main.js`) and its tests are skipped: don't spend time
updating it with each change. The user will redesign it later; the rules below apply again once it is back.

## Keep the tutorial in sync (standing rule, paused - see above)
The city tour lives in `shared/tutorial.js` and is played by `client/tutorial.js` over the live map.
- Whenever gameplay, rules, controls, places or the map change, update the tour in the same change.
- Places are referenced by POI kind / district / island, never coordinates; `{{kind}}` / `{{kind:where}}` resolve to live names and districts, and island stops list their places from the map automatically.
- Player-facing numbers belong in `shared/rules.js` (server and tutorial both import them); controls belong in `shared/controls.js`.
- `test/tutorial.test.js` fails if a place type, island, turf, control action or rule is missing from the tour, or if any stop no longer resolves on the map. Don't silence it - teach the new thing.
- Bump `TUTORIAL_VERSION` when the tour changes meaningfully, so returning players are offered the updated tour.
