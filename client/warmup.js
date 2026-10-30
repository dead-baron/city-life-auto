// Getting the art ready before you see it (the owner, 2026-10-26: "It's okay to have a longer load time I think if it
// means not having art slow to load"). Two waits, both capped so a slow device still gets in:
//   - joining: PLAY keeps the title screen up, a bar under its status line, while the renderer bakes (or reads back from
//     the browser's store, or downloads from the server) the chunks the view draws and the ring round them, and makes
//     your figure's strides and what's near you - all behind the title (client/art2/game/host.js warming, warmth());
//   - a jump (a teleport, a respawn, a taxi ride): a short dark fade over the world, under the HUD, until what's on
//     screen is baked - not a screen of stand-ins.
// warmPlan / jumpPlan are the decisions (pure: test/warmup.test.js); holdForArt and veilTick put them on screen.
export const WARM_CAP_MS = { phone: 12000, other: 8000 };   // (the longest the title waits for the art on joining)
export const JUMP_CAP_MS = { phone: 5000, other: 3000 };    // (and the fade after a jump)
export const RING_WAIT = 0.5;                               // (the ring round the view, and sprites still on their way, waited for until this part of the cap)

// w: the renderer's warmth() (null: not up yet), t: ms waited, cap: ms, off: no renderer will come (it failed, or the
// classic one draws) -> { done, why, k: 0..1 for the bar }
export function warmPlan(w, t, cap, off = false) {
  if (off) return { done: true, why: 'off', k: 1 };
  if (t >= cap) return { done: true, why: 'cap', k: 1 };
  if (!w || !w.ok) return { done: false, why: 'starting', k: Math.min(0.1, 0.1 * t / Math.max(1, cap * 0.5)) };
  const view = w.need ? w.have / w.need : 1, ring = w.ring ? w.ringHave / w.ring : 1, spr = w.miss ? 0 : 1;
  const soft = t >= cap * RING_WAIT;   // (past it: the ring, and sprites still on their way, are not waited for)
  const viewDone = w.have >= w.need && w.scrHave >= w.scr && (!w.miss || soft);
  const done = viewDone && (ring >= 1 || soft);
  return { done, why: done ? (ring >= 1 ? 'ready' : 'view') : viewDone ? 'ring' : 'view', k: done ? 1 : Math.min(0.99, 0.1 + 0.6 * view + 0.2 * ring + 0.1 * spr) };
}
// after a jump: until what's on screen is drawn (the renderer's jump record), at most cap ms
export function jumpPlan(J, cap) {
  if (!J || J.drawn || J.over || J.frames < 1) return { veil: false };
  return { veil: performance.now() - J.t0 < cap };
}

const isPhoneUA = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
const capOf = (C) => (isPhoneUA() ? C.phone : C.other);

// Joining: the title stays up (its buttons off, the bar under the status line) until warmPlan says done; then go().
// S.art2 may not be there yet (the renderer still loading) or change (restarted): looked up each frame. off(): no
// renderer will come. Resolves with how it ended ('ready', 'view', 'cap', 'off').
export function holdForArt(S, $, go, off) {
  const cap = capOf(WARM_CAP_MS), t0 = performance.now(), st = $('t-status'), was = st.textContent, btns = $('t-buttons');
  let bar = $('t-warm');
  if (!bar) { bar = document.createElement('div'); bar.id = 't-warm'; bar.innerHTML = '<i></i>'; st.after(bar); }
  bar.classList.remove('hidden'); btns.classList.add('t-wait');
  const fill = bar.firstChild;
  return new Promise((res) => {
    const tick = () => {
      const w = S.art2, t = performance.now() - t0;
      if (w) w.warming = true;
      const p = S.playing ? { done: true, why: 'skipped', k: 1 } : warmPlan(w && w.warmth ? w.warmth() : null, t, cap, off());   // (in already: Enter on the title)
      fill.style.width = `${Math.round(p.k * 100)}%`;
      const msg = !w ? 'Starting the graphics...' : p.why === 'ring' ? 'Getting the streets round you ready...' : 'Getting the art ready...';
      if (st.textContent !== msg) st.textContent = msg;
      if (!p.done) { requestAnimationFrame(tick); return; }
      if (w) w.warming = false;
      S.warmEnd = { why: p.why, t: Math.round(t), w: w && w.wo ? { ...w.wo } : null };   // (the readout, tools)
      bar.classList.add('hidden'); btns.classList.remove('t-wait'); st.textContent = was;
      if (p.why !== 'skipped') go();
      res(p.why);
    };
    tick();
  });
}

// Every frame while playing: the fade over the world after a jump (the renderer bakes behind it at the loading screen's
// pace). Returns whether it's showing.
let veil = null, veilOn = false;
export function veilTick(S, drawn = true) {
  const w = S.art2, on = !!(w && drawn && S.playing && !(S.spec && S.spec.on) && jumpPlan(w.jump, capOf(JUMP_CAP_MS)).veil);
  if (on === veilOn) return on;
  veilOn = on;
  if (w) w.warming = on;
  if (!veil) {
    veil = document.createElement('div'); veil.id = 'veil'; veil.innerHTML = '<span>Loading the area...</span>';
    const v = document.getElementById('view');
    if (v) v.after(veil); else document.body.appendChild(veil);
  }
  veil.classList.toggle('on', on);
  return on;
}
