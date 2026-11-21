## 5. Things I couldn't check automatically (need eyes in the game)

- **The casino in the owner's shot** (interior covered by the next building, door from the north, too many lights): most
  likely Wagon Wheel Casino, Old Downtown (5271, 579) - north-facing walk-in, the densest festoon cluster beside it, and its
  door 97% under a tree in the visibility test. interiorOverlap found nothing over its room: check the cover by eye.
- **"Neon Nights" over a pharmacy**: not found by name (`frontNames` found 7 other mismatches). Find the block in the shot
  (Downtown/Midtown, Live DJ / Beer Wine Spirits / Volt) and check whether it's a lot building's sign or a hand plan's.
- **Rider jitter / sound crackle** after the speed fix: needs a play test on the live server (suspect `server/net.js:134`).
- **Water sparkle flicker, koi drawn over the water, birds/animals in lockstep, the seaplane's and fish's long shadows**:
  render timing and draw order; the shadow class is confirmed in code (section 3, cross-cutting) but the look needs a capture.
- **Water creeping up beside docks** (as opposed to `beachWater`'s band over beach planks): the bake's shore blend by
  docks over water - a capture at a few marinas.
- **Car headlights at night on the Neon Strip**: the 96-light cap is confirmed in code (no reserved share); how it looks at
  each quality tier needs a night capture.
- **NPCs on furniture / in fountains / on game areas in use, dancers bunched, the sidewalk pair rocking**: runtime behavior;
  nothing in the code keeps them off (section 3) - a server test that runs the NPCs for a few minutes and checks positions
  against tables, fountains, courts in use would make it a class check.
- **Bar fight staggering, bikers chasing**: behavior, play test.
- **Art quality**: the cinema's lobby and auditoriums, rail bridges, tunnel portals, pool balls, car soccer, the racing
  markers "pasted on" - judged by eye against the concepts.
- **Mobile layouts**: portrait thumb map, the touch cluster, panels with CSS zoom on real phones.
- **The art kept across restarts** (PREBETA F): server logs (`journalctl -u city-life-auto | grep '\[art\]'`), not in the repo.
- **The `plantOnWalk` palms**: the beach towns' promenade palms may be deliberate (a palm-lined promenade); the owner decides
  whether they get grates or move - the row counts them either way.
- **Version stamp**: `tools/stamp-version.mjs` fails on Windows (it joins `C:\` onto a URL path: `C:\C:\Users\...`), so the
  audit commits aren't stamped; they change only `tools/`, `test/` and `docs/`, no shipped file.
