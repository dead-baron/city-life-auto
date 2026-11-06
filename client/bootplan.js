// What a returning page fetches again when the build changed (client/boot.js freshen), and whether it must reload.
// Only the code the page runs is waited for: everything it imports could come out of the HTTP cache from the old build
// (GitHub Pages keeps files 10 minutes) and mix old modules with new. The rest is fetched in the background once the
// game is up: the pictures and fonts (an old one for a few minutes is harmless, and the cache re-checks it after ten
// anyway) and server/ (only the offline practice runs it). A deploy changed about 9 of the page's modules, 9 server
// files and a picture now and then (the 69 deploys from 10-28 to 11-04), and the title used to wait for all of them.
// A new stylesheet alone is swapped in place (boot.js); only a new index.html or loader reloads the page (the
// stylesheet changed in 40 of those 69 deploys, alone in 13 of them - each a second start of the page on a phone).
export const RELOAD = new Set(['index.html', 'client/boot.js', 'client/bootplan.js']);
export const CSS = 'client/style.css';
// the classic renderer's picture sheets: only fetched when something asks for them (?art=1)
const V1_SHEET = /^assets\/(atlas\d|prefabs\d|blocks\d|scenes|ground|animals|interiors|chars\/)/;
export const later = (f) => /\.(png|webp|woff)$/.test(f) || /^(assets|server)\//.test(f);

// meta: version.json; had: { file: hash } this browser last ran (null: not known - everything is fetched again);
// classic: the classic renderer's sheets too. -> { now: files to wait for, later: files for the background,
// reload: the page must start again (when not known what changed, it must), css: swap the stylesheet in place }
export function updatePlan(meta, had, classic = false) {
  const files = (meta && meta.files) || [];
  const hashes = meta && Array.isArray(meta.hashes) && meta.hashes.length === files.length ? meta.hashes : null;
  const diff = !!(had && hashes);
  const now = [], bg = [];
  let reload = !diff, css = false;
  files.forEach((f, i) => {
    if (diff && had[f] === hashes[i]) return;
    if (RELOAD.has(f)) reload = true;
    if (f === CSS) css = true;
    if (!classic && V1_SHEET.test(f)) return;
    (later(f) ? bg : now).push(f);
  });
  css = css && !reload;
  return { now: css ? now.filter((f) => f !== CSS) : now, later: bg, reload, css, diff };   // (the swap fetches the new one)
}
