# Task: character polish, pass 4 - underwear that looks good, and the owner's last calls (for Fable, ~$35)

Passes 1-3 are on this branch (notes, sheets, the concept catalogue in `docs/characters/`). Same rules as
`docs/tasks/CHARACTERS3.md`. **The renderer's budget may go up to 430 KB** (the owner, 11-19: "I'd rather this all
looks better... not cut corners"): don't squeeze the drawing to fit - give pieces the geometry they need, raise the
limit in `test/perf.test.js` / `tools/perf.mjs` to what's used (rounded up, at most 430) and say why in the DEVLOG.
Small credit budget: do these in order, commit each, stop at finished work.

1. **The owner's calls (11-19):** sergeants stay navy (rank reads); pieces that only draw with the pass on are **not
   sold** (out of the stores' stock) while the pass is off; the five draped pieces (cloak, cape-coat, sari, ghillie,
   tails) **out of the city's random looks** until they read better.
2. **Underwear and bras that look good** (the owner: "bras and underwear could look better"): compare the 17 pieces
   with the concepts (SF23-A..G, SM23 and the others the catalogue lists) and redraw them on the new body (proportions
   A) - cut and shape that read at sprite size (straps, cups, waistband, leg line, the lingerie's lace edge as a
   dither or a lighter band), shading that follows the body, clean colours on every skin tone, every direction and
   the walk. Opaque, never see-through; nothing on stays under the mosaic. Sheet: `docs/characters/pass4/underwear.png`
   (pass 3 | pass 4, both bases, 4 directions).
3. If credit remains, **the pieces that read weakly** (pass 3's notes), with real geometry now: the sari's drape over
   one shoulder and its sash, the cape-coat's cape apart from the coat, the open parasol, a thinner prosthetic limb,
   elbow pads, the wallet chain and the bouquet that read; sheet `pass4/weak.png`.
4. Update `docs/characters/NOTES.md` (a "Pass 4" section) and say what's left.
