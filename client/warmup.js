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
export const FADE_MS = 450;                                 // (the loading screen's one fade out, at the end)

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
// ONE loading screen (the owner, 11-06, a Pixel 7 Pro upright: "the message for loading art flips between two messages
// and it just pops in and out over and over, not a smooth loading screen and loading bar"): the title's status line and
// its bar from the first "Connecting..." to the fade into the city are this one record's - its phase only goes forward
// (a message changes only when the load moves on to the next phase), its bar only goes forward and covers every phase:
// the connection, the city, the graphics starting, the chunks on screen, the ring round them and the people. Before
// PLAY the title (client/titlescreen.js) steps it through the first two; after PLAY holdForArt steps it on. The phase it
// reads from the load at any moment may go back (a chunk on screen let go, the sprites a frame behind): the record doesn't.
export const LOAD_PHASES = [
  { id: 'connect', msg: 'Connecting...', k0: 0, k1: 0.1 },
  { id: 'city', msg: 'Building the city...', k0: 0.1, k1: 0.4 },
  { id: 'gfx', msg: 'Starting the graphics...', k0: 0.4, k1: 0.5 },
  { id: 'streets', msg: 'Drawing the streets...', k0: 0.5, k1: 0.85 },
  { id: 'around', msg: 'Almost there...', k0: 0.85, k1: 0.99 },
];
export const PHASE = Object.fromEntries(LOAD_PHASES.map((p, i) => [p.id, i]));
export function loadTracker() { return { ph: 0, k: 0, msg: LOAD_PHASES[0].msg, done: false, steps: 0 }; }
// in: { phase (index - where the load is now), sub (0..1 through it), done } -> the record, moved on (never back)
export function loadStep(T, inp) {
  if (T.done) return T;
  const ph = Math.max(T.ph, Math.min(LOAD_PHASES.length - 1, inp.phase | 0)), P = LOAD_PHASES[ph];
  const sub = (inp.phase | 0) >= ph ? Math.max(0, Math.min(1, +inp.sub || 0)) : 0;   // (read from a phase behind: no news of this one)
  T.k = inp.done ? 1 : Math.max(T.k, Math.min(P.k1, P.k0 + (P.k1 - P.k0) * sub));
  if (ph !== T.ph) { T.ph = ph; T.steps++; }
  T.msg = P.msg; T.done = !!inp.done;
  return T;
}
// where the art's wait is (warmth(), as warmPlan reads it) as a phase and how far through it
export function artPhase(w, p) {
  if (p.done) return { phase: PHASE.around, sub: 1, done: true };
  if (!w || !w.ok) return { phase: PHASE.gfx, sub: w ? 0.5 : 0 };
  const view = w.need ? Math.min(1, (w.have + w.scrHave) / (w.need + w.scr)) : 1;
  if (!(w.have >= w.need && w.scrHave >= w.scr)) return { phase: PHASE.streets, sub: view };
  return { phase: PHASE.around, sub: 0.8 * (w.ring ? w.ringHave / w.ring : 1) + (w.miss ? 0 : 0.2) };
}
// a creep toward the end of a phase with no news of its own (the city's download): 0..1, never reaching it
export const creep = (ms, tau = 6000) => 1 - Math.exp(-Math.max(0, ms) / tau);

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
  // (the one record the title's bar and line follow: on from where the city left it - LOAD_PHASES)
  const T = S.loadT || (S.loadT = loadTracker());
  loadStep(T, { phase: PHASE.gfx, sub: 0 });
  return new Promise((res) => {
    const tick = () => {
      const w = S.art2, t = performance.now() - t0;
      if (w) w.warming = true;
      const wm = w && w.warmth ? w.warmth() : null, p = S.playing ? { done: true, why: 'skipped', k: 1 } : warmPlan(wm, t, cap, off());   // (in already: Enter on the title)
      loadStep(T, artPhase(wm, p));
      const wd = `${Math.round(T.k * 100)}%`;
      if (fill.style.width !== wd) fill.style.width = wd;
      if (st.textContent !== T.msg) st.textContent = T.msg;
      if (!p.done) { requestAnimationFrame(tick); return; }
      if (w) w.warming = false;
      S.warmEnd = { why: p.why, t: Math.round(t), w: w && w.wo ? { ...w.wo } : null, steps: T.steps };   // (the readout, tools)
      // (the bar full, then the title fades out once - main.js enterCity hides it when the fade is over)
      if (p.why !== 'skipped') $('title').classList.add('t-out');
      btns.classList.remove('t-wait');
      setTimeout(() => { bar.classList.add('hidden'); st.textContent = was; }, FADE_MS);
      if (p.why !== 'skipped') go();
      res(p.why);
    };
    tick();
  });
}

// Every frame while playing: the fade over the world after a jump (the renderer bakes behind it at the loading screen's
// pace). Returns whether it's showing.
// The veil doesn't flap (the owner's 11-06 report of the loading screen popping in and out): once up it stays until
// what's on screen has been drawn for VEIL_HOLD ms (a chunk let go and taken back, a second jump a frame later - a
// teleport's window swap - don't take it down and put it up again), and once down it comes back only for a jump that
// still isn't drawn after VEIL_HOLD ms within VEIL_CALM ms of it going (a fresh teleport later shows it at once).
export const VEIL_HOLD = 250, VEIL_CALM = 2000;
export function veilStep(V, want, now) {
  if (want) { V.offAt = 0; if (!V.on) { V.wantAt ||= now; if (!V.downAt || now - V.downAt > VEIL_CALM || now - V.wantAt >= VEIL_HOLD) { V.on = true; V.n = (V.n || 0) + 1; } } }
  else { V.wantAt = 0; if (V.on) { V.offAt ||= now; if (now - V.offAt >= VEIL_HOLD) { V.on = false; V.downAt = now; V.offAt = 0; } } }
  return V.on;
}
let veil = null, veilOn = false;
const VS = { on: false, wantAt: 0, offAt: 0, downAt: 0 };
export function veilTick(S, drawn = true) {
  const w = S.art2, live = !!(w && S.playing && !(S.spec && S.spec.on));
  const on = live && veilStep(VS, !!(drawn && jumpPlan(w.jump, capOf(JUMP_CAP_MS)).veil), performance.now());
  if (!live) { VS.on = false; VS.wantAt = 0; VS.offAt = 0; }
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
