## 2026-10-30 · Art loads before you see it, and fewer hitches on phones (Pixel 7 Pro)

The owner (10-26): "Any way to make art load better and faster and improve performance on lower end mobile devices
(specifically testing on a Pixel 7 Pro and seems slow to load art and a bit choppy in some places) but without
compromising the quality of the art or changing the art? It's okay to have a longer load time..."

Nothing here changes a sprite, a chunk or the lighting: the same art arrives earlier, or a frame or two later instead of
in one long frame.

### What the Pixel gets today (measured, and worked out from the code)
- **Tier:** a phone with 8 GB (Chrome says 8 at most; the Pixel has 12) is recommended **Medium** (gfx.js).
- **Canvas:** Medium's sharpness is 1, so the world canvas is **412 x 892** for a 1440 x 3120 screen - already well
  under what the screen has (High 618 x 1338, Ultra 824 x 1784; the 2.5 MP cap would be 2.6x). The world's scene is lit
  at its own size, one texel per world px (about 600 x 1300 on Medium upright), whatever the canvas is: the canvas
  only sets how finely the lit frame is put on the screen. So a DPR-3.5 canvas is **not** the cause; nothing to cut
  there without changing the look (see the suggestion below).
- **Workers:** four (8 cores).
- **Loading:** PLAY was pressable as soon as the server said welcome - before the renderer, its workers or any chunk
  existed. In a phone-sized headless run (412 x 892 @ 3.5, Android, 4 workers, Medium) PLAY lit at 1.5 s; the renderer's
  sprite modules took 6.7 s to load, the workers 10.5 s, the first chunk 24 s and the whole screen 35 s: everything in
  between was stand-ins on screen.
- **Hitches (main thread):** a person's sprite made on the page costs ~7 ms on a desktop core (p95 14 ms; node bench),
  so 15-40 ms on a phone - and the budget (3.5 ms on Medium) was checked *before* making one, so one person could blow
  a frame; your own figure was always made on the page, every new pose or heading. An aircraft heading: ~3.4 ms desktop
  (up to 70 ms the first of a model), made on the page with only a count limit (48 a frame). Chunk uploads 0.9 ms p50,
  15 ms max here (one a frame on Medium, two on High/Ultra without a time limit). GC ~1 % of the main thread.
- (SwiftShader makes every frame GPU-bound in the headless browser - 1.5-4.5 s a frame - so frame rates from here mean
  nothing; the numbers above are main-thread costs and the load timeline. The readout below is for the real phone.)

### What changed
- **The loading screen waits for the art** (client/warmup.js). After PLAY the title stays up with a progress bar
  ("Getting the art ready...") while the renderer bakes, reads back or downloads the chunks the view draws, then the
  ring round them, and makes your figure standing/walking/jogging/running/sprinting in all eight directions plus what
  is near you - with the frame's budgets raised (nobody is watching): uploads, sprites made on the page, asks ahead.
  It goes in when the view is ready and the ring is too (the ring waited for until half the cap), or at the cap:
  **12 s on a phone, 8 s elsewhere**. Enter on the title skips it. The first time in per page only.
  The load timeline (and /perf reports) gets a `warm` mark and how long it waited.
- **A jump (teleport, respawn, a taxi ride) fades to dark** under the HUD until what's on screen is baked, "Loading
  the area...", at most **5 s on a phone, 3 s elsewhere**, instead of a screen of stand-ins.
- **Uploads within a time budget** (host.js upBudget): a frame's first upload always goes (the view never waits longer
  than before); more only while the tier's time lasts (Low 3, Medium 4, High 5, Ultra 6 ms, running averages per
  chunk and per sprite). Just after a jump the old JUMP_UP rule still applies.
- **People made on the page only when they fit**: one is made only while its running average fits what's left of the
  frame's budget; others go to the workers (they're asked for ahead within 520 px anyway, so it is rare on screen). Your
  own figure is made here within 8 ms (OWN_MS), else the workers make it first in line and your last frame shows a
  frame or two meanwhile - unless you have none yet. Behind the loading screen your common poses are made ahead.
- **Generated sprites within 4 ms a frame** (GEN_MS: aircraft headings, rotors, doors, water life, farm rows...);
  an aircraft past it takes the nearest heading made, or makes this one if there is none. Your own aircraft's
  headings either side are made ahead while the frame has time.
- **8 GB devices keep more:** six more chunk slots on the GPU (Medium 20 -> 26, ~13.5 MB), 160 baked chunks kept in
  the browser on such a phone (90 before; desktops 180), and baking ahead into the store further (ring 4, 6000 px of
  road, 96 chunks; 3 / 4800 / 64 on other phones). The workers' memory caches stay as they were (test/pool.test.js:
  four workers on a phone within 300 MB - a long drive ran a phone out of memory before).
- Bake workers stay at four on 8-core phones: the Tensor G2 has 2 big, 2 middle and 4 little cores, the page, the GPU
  process and the compositor want the big ones, and each worker holds its own ~65 MB copy of the world.
- Small per-frame allocations gone from the chunk upload loop and the tail lights.

### The readout (for the owner's phone)
Debug menu -> **📈 Performance -> Performance readout on / off**. A small panel at the top: fps, frame p50/p95, the
page's own ms a frame, long tasks; the art tier, workers, chunks baking/queued, waiting to go up, on screen and how many
are stand-ins; bake avg, chunk upload avg/max, kept and from-the-server counts, the renderer's ms and GPU ms; sprites
being made / to upload, what a person costs here, how often a chunk on screen was late; the canvas's size against the
screen's and the render scale; cores, memory, and how long the loading screen waited. It stays on in that browser (also
after a reload) until switched off. Loaded only when switched on (client/perfhud.js).

### Suggestion (not done: it changes the look)
On Medium the Pixel's canvas is 412 x 892, so each 2-world-px art pixel gets ~1.5 canvas pixels, which the browser then
stretches 3.5x: art pixels come out 1 or 2 canvas pixels wide. "Render sharpness: Sharp" (High's 1.5) gives 618 x 1338,
over one canvas pixel per world px - crisper pixel art for a little more fill. Worth a try on the Pixel with the readout on.

### Before / after (headless Chromium, 412 x 892 @ 3.5, Android UA, 4 workers, Medium, local server)
| | before | after |
|---|---|---|
| what you see after PLAY | the city at once, mostly stand-ins | the title and its bar, up to the cap (12 s on a phone) |
| frames shown with stand-ins on screen, first 20 s in | 11 of 26 (42 %) | 0 of 13 |
| whole screen first drawn (load timeline `screen`) | 35.0 s | 39.6 s (a busier machine: the city took 9.9 s, not 1.3) |
| a person made on the page (node, desktop core) | 6.8 ms p50, 14 ms p95, always | same cost, only when it fits |
| stand-in frames after a teleport / in flight (15 s each) | 0 / 0 | 0 / 0 |
| main-thread GC | ~1 % | ~1 % |

On that busy machine the loading screen ran to its cap (13.6 s: its frames came 2-5 s apart under SwiftShader, so
what's on screen plus its margins wasn't all baked yet). A phone's frames come every 16-33 ms, so it should end on
'ready' well inside the cap: the readout's last line says how long it waited and why (ready, view, cap) - the first
thing to read off the Pixel. If it always says 'cap', the cap or what it waits for wants a look.

### Budgets
Renderer code 401 of 401 KB (401.5): room made by trimming history notes out of comments in host.js, engine.js and
lightgame.js and moving the loading screen's look at the art to hostextra.js (loaded with it). Page 470 of 520 KB
(client/warmup.js, 2 KB). Nothing raised.

### Tests
test/warmup.test.js (new): the loading screen's plan and cap, the jump fade, the upload budget in _chunks, the person
rule, keepCap and the GPU slots on 8 GB devices, gfx.js renderDpr on the Pixel, the readout's laziness.
