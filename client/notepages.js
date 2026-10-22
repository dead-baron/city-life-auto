// A note too long for its box shows a page at a time (the owner, 10-16: "Garden plot instructions cut off in the
// popup", "Text cut off in UI containers"): on a phone a note is three lines at most (client/style.css, `.touch .toast
// > .tx`), and a longer one - the garden plot's instructions, the skateboard's, the mail train's - used to lose the
// rest of its words under an ellipsis. Now its three lines scroll on to the next three when they've had time to be
// read, a thin bar along its foot showing how far through it is, and it stays up until its last page has been read.
// A note that fits stays up as long as before. No imports: test/hudpage.js loads it into the HUD's test page as is.

// how long a note stays up: a base and a little per letter, up to `most` (ms); a paged note: `page` plus its share of
// the letters for each page
export const NOTE_READ = { base: 2400, perChar: 45, most: 6500, page: 1400 };

export function noteLife(chars) { return Math.min(NOTE_READ.most, NOTE_READ.base + chars * NOTE_READ.perChar); }

export function pageTimes(chars, pages) {
  const each = Math.round(NOTE_READ.page + (chars / Math.max(1, pages)) * NOTE_READ.perChar);
  return { each, life: each * pages };
}

// how many pages the note's text box (`tx`, its words) takes to show it all: 1 when it fits
export function notePages(tx) {
  const h = tx.clientHeight;
  if (!h || tx.scrollHeight <= h + 1) return 1;
  return Math.ceil((tx.scrollHeight - 1) / h);
}

// page k (from 0) in view: the last page is the last lines, whole
export function showPage(tx, k, smooth = true) {
  const top = Math.max(0, Math.min(k * tx.clientHeight, tx.scrollHeight - tx.clientHeight));
  if (tx.scrollTo) tx.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' }); else tx.scrollTop = top;
}

export function stopNote(el) {
  if (el._pg) { clearInterval(el._pg); el._pg = 0; }
}
// (client/hud.js loads this the first time a note is too long for its box, and keeps the lifetimes of the ones that
// fit itself: noteLife)

// set a note up once it's on the page (its words in `tx`): pages it if it needs them; returns how long it stays up (ms)
export function layNote(el, tx, msg) {
  stopNote(el);
  const n = notePages(tx), chars = msg.length;
  if (n < 2) {
    el.classList.remove('paged');
    el.style.removeProperty('--pg');
    return noteLife(chars);
  }
  const { each, life } = pageTimes(chars, n);
  let k = 0;
  const mark = () => el.style.setProperty('--pg', String((k + 1) / n));
  el.classList.add('paged');
  showPage(tx, 0, false);
  mark();
  el._pg = setInterval(() => {
    k++;
    if (k >= n) { stopNote(el); return; }
    showPage(tx, k);
    mark();
  }, each);
  return life;
}
