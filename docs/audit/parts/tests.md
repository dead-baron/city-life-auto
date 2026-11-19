## 4. The test run (`npm test`, once, 2026-11-19)

**2183 tests: 2124 pass, 52 fail, 7 skipped** (23 min; on the owner's Windows PC, `NODE_OPTIONS=--max-old-space-size=3072`).
All 42 placement-lint tests pass, the audit's new rows included. Most of the 52 come from running on Windows rather than from
the code, but 13 look like real failures - recheck them on Linux (the server, or WSL) before acting.

### 4.1 Likely real (world or game logic) - recheck on Linux first
| Test | What it says |
|---|---|
| World v3: Lucky Mesa - districts, the Strip... (`test/world3mesa*`) | 7 problems: The Golden Lotus, The Neon Saguaro, Mesa Grande, The Silver Lagoon, Starfall Tower (+2): "its porte-cochere" - the 11-14 "no big overhangs over entrances" rule; the casinos still carry them (the `bigCanopy` lint row, which reads `porte` props, sees 0 - so these are drawn another way) |
| World v3: today's wild land's country sites... | "the tracks flagged notraffic (24; others: Northshore / Lucky Mesa / Red Rock / Sandpiper Bay / Southside / Metro Central / Sunset Beach / Airport / Westport Center / Old Quarter / Midtown / Northgate / Willow Valley Station Road)" - more station roads flagged than the test expects |
| World v3: the park block... | "after them only the split towers' new parts" - something else is added after the park block's places |
| no tree's crown over a door, a sign, a chess table... | tree_a at tile 2871, 2569 over (2870, 2568); tree_b at 3810, 1842 over (3809, 1840) |
| by kind, no more hidden than the allowed exceptions (visibility audit) | place doors under trees: Wagon Wheel Casino (5274, 588) 97%, Highland Quick Stop (1924, 1615) 100%, Liberty Kiosk (3388, 2362) 93%; two cola machines hidden (one under a building at 3268, 1681) |
| the businesses: every kind laid out, in the real-estate app... | "each kind, priced, with a place" |
| booked at five stars with a long record... (prison) | "the weapon back": `'fists' !== 'pistol'` - a legal gun not returned after prison |
| live events: off by default; on, a scene near a player within the caps... | "never by a player in their FTUE" - a scene was placed by a new player (may be seed/timing dependent) |
| the modules that hand each other functions load whichever is first | "server/systems/police.js loaded first" (load order - may be Windows path order) |
| the city worker loads the generator without World v3's passes | "the worker still loads the generator" (reads source - may be CRLF) |
| world3 and art3 move with the rules' values... | the hashes differ ('cecc2e53cd89' vs 'b750137b57d1') - hashes over source text, very likely CRLF |

### 4.2 Windows paths (about 22) - environment
The tests and tools turn `import.meta.url` into a path with `new URL(...).pathname`, which on Windows gives `C:\C:\Users\...`
(ENOENT / ERR_MODULE_NOT_FOUND): the perf budgets, the version.json checks, the sound checks (mixer, levels, every event's
sound), the MAP_W guards, no red cross, the title tracks, the cinematic Showcase, staged scenes vs the debug menu, the
snorkelers, one name on a front, name tags on aircraft, main.js's sfx, the module-level helper guard, the live thresholds.
`tools/stamp-version.mjs` fails the same way. (A one-line fix - `fileURLToPath` - would make the suite runnable on Windows.)

### 4.3 Line endings (about 15) - environment
This checkout has `core.autocrlf=true` (CRLF files); tests that match source text with `\n` in the pattern fail: the pause
menu keys, control hint caps, the fishing line frame, the hub's lazy tabs, the job card, the sideways phone, the touch
buttons, the title's loading state, the phone tiles, literal colours, the prompt / action button wiring, the renderer's first
load, the page's start-up code, the debug menu's lazy load, the readout's lazy load, the page reads the map through mapcore.

### 4.4 Timing (1) - environment
"a chunk bakes quickly enough to make a couple a frame": 74.1 ms a chunk, with the machine busy.
