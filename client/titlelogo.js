// The title's neon logo (the owner's logo, 2026-11-14): the sign switched off (assets/logo/unlit.webp, in the page's
// own HTML so the first paint has it), and over it the four lit layers - the skyline, "City Life", the swoosh, "Auto" -
// each cropped to its own box (tools/build_logo.py makes them and prints LAYERS). Loaded with client/splash.js, which
// plays the entrance; nothing in the game depends on it.
//   mountLogo()          the lit layers, added to #logo switched off (fetched now: 53 KB, after the first paint)
//   neonIntro({ at })    the SNES-style switch-on: each layer buzzes on in turn with a short irregular flicker and a
//                        quiet hum and click, then the sign idles - a soft glow breathing, now and then a tiny flicker.
//                        Any tap, click, key or pad button skips to lit. Reduced motion: just lit, no flicker, no idle.
//                        at: hold that moment (ms into the switch-on) - the captures (?neon=<ms>)
//   showLit()            lit at once, then idle (the tests' captures, ?nosplash)
// The sound is its own few oscillators (the game's sound loads on the first tap, after this has played): silent until
// the page may play sound (a tap - skipping the studio sting counts), and never with the sound off in Settings.

// the layers' boxes in % of the logo's box (1240 x 756 at 2x; tools/build_logo.py)
const LAYERS = [
  { k: 'sky', f: 'sky.webp', x: 31.21, y: 0.132, w: 37.903, px: [470, 189], c: '#2aa8ff' },
  { k: 'city', f: 'city.webp', x: 0, y: 17.063, w: 100, px: [1240, 397], c: '#ff3c50' },
  { k: 'swoosh', f: 'swoosh.webp', x: 14.677, y: 59.259, w: 71.29, px: [884, 96], c: '#ff3c50' },
  { k: 'auto', f: 'auto.webp', x: 14.113, y: 66.005, w: 70.484, px: [874, 257], c: '#ffaa1e' },
];
// when each layer starts to buzz on (ms after the lit layers are in hand), and the hum's pitch for each
const START = { sky: 450, city: 1000, swoosh: 1580, auto: 1960 }, HUM = { sky: 180, city: 120, swoosh: 150, auto: 100 };

let els = null, ready = null, state = 'off', idleT = 0;
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function mountLogo() {
  if (els) return ready;
  const box = document.getElementById('logo');
  if (!box) { els = []; ready = Promise.resolve(); return ready; }
  els = LAYERS.map((L) => {
    const i = document.createElement('i'), img = new Image(L.px[0], L.px[1]);
    i.className = 'lg'; i.dataset.k = L.k;
    i.style.cssText = `left:${L.x}%;top:${L.y}%;width:${L.w}%;--g:${L.c};opacity:0`;
    img.alt = ''; img.decoding = 'async'; img.src = `assets/logo/${L.f}`;
    i.appendChild(img); box.appendChild(i);
    return { L, i, img };
  });
  // in hand once every layer is decoded (or failed, or 4 s have passed: the sign never waits on the network forever)
  ready = Promise.race([
    Promise.all(els.map(({ img }) => (img.decode ? img.decode() : new Promise((r) => { img.onload = img.onerror = r; })).catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  return ready;
}

const setOn = (e, v) => { e.i.style.opacity = String(v); };

export function showLit() {
  mountLogo();
  if (state === 'lit') return;
  state = 'lit';
  for (const e of els) setOn(e, 1);
  idle();
}

// the soft glow breathing (client/style.css #logo.lg-idle), and now and then one layer gives a tiny flicker
function idle() {
  const box = document.getElementById('logo');
  if (!box || reduced()) return;
  box.classList.add('lg-idle');
  clearTimeout(idleT);
  const next = () => {
    idleT = setTimeout(() => {
      const title = document.getElementById('title');
      if (!document.hidden && title && !title.classList.contains('hidden') && els.length) {
        const e = els[(Math.random() * els.length) | 0], dips = 1 + ((Math.random() * 3) | 0);
        let t = 0;
        for (let d = 0; d < dips; d++) {
          const lo = 0.35 + Math.random() * 0.35, len = 35 + Math.random() * 45;
          setTimeout(() => setOn(e, lo), t); t += len;
          setTimeout(() => setOn(e, 1), t); t += 40 + Math.random() * 90;
        }
      }
      next();
    }, 6000 + Math.random() * 9000);
  };
  next();
}

// a small seeded random (the captures hold a moment across page loads: the same flicker every time)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// each layer's switch-on: a few irregular blips (on a moment, off a moment, not always full), then on for good -
// [[ms from its start, opacity, blip: a click and a hum]...]
function pattern(r) {
  const out = [];
  let t = 0;
  const n = 2 + ((r() * 3) | 0);
  for (let b = 0; b < n; b++) {
    out.push([t, b === 0 ? 0.55 + r() * 0.45 : 0.4 + r() * 0.6, 1]); t += 25 + r() * 55;
    out.push([t, r() < 0.3 ? 0.12 : 0]); t += 45 + r() * (b === n - 1 ? 150 : 110);
  }
  out.push([t, 0.75, 1]); out.push([t + 50, 1]);
  return out;
}
const levelAt = (pat, t) => { let v = 0; for (const [at, o] of pat) if (t >= at) v = o; return v; };

export function neonIntro({ at = -1 } = {}) {
  mountLogo();
  if (state !== 'off') return;
  if (reduced()) { showLit(); return; }
  state = 'intro';
  const r = rng(at >= 0 ? 1337 : (Math.random() * 4294967296) >>> 0);
  const pats = els.map((e) => ({ e, start: START[e.L.k], pat: pattern(r), next: 0 }));
  const end = Math.max(...pats.map((p) => p.start + p.pat[p.pat.length - 1][0])) + 20;
  if (at >= 0) {   // (a held moment: drawn once the layers are in, and left there)
    ready.then(() => { for (const p of pats) setOn(p.e, levelAt(p.pat, at - p.start)); });
    return;
  }
  const snd = hum();
  let raf = 0, t0 = 0, over = false;
  const finish = () => {
    if (over) return;
    over = true; cancelAnimationFrame(raf);
    for (const ev of SKIP) removeEventListener(ev, finish, true);
    if (snd) snd.stop();
    state = 'off'; showLit();
  };
  const SKIP = ['pointerdown', 'keydown'];
  for (const ev of SKIP) addEventListener(ev, finish, true);
  const pad = () => { try { for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g && g.buttons.some((b) => b.pressed)) return true; } catch { /* none */ } return false; };
  const frame = (now) => {
    if (over) return;
    if (!t0) t0 = now;
    const t = now - t0;
    if (pad()) { finish(); return; }
    for (const p of pats) {
      const lt = t - p.start;
      while (p.next < p.pat.length && lt >= p.pat[p.next][0]) {
        const [, o, blip] = p.pat[p.next++];
        if (blip && snd) snd.blip(HUM[p.e.L.k], p.next >= p.pat.length - 1);
      }
      setOn(p.e, levelAt(p.pat, lt));
    }
    if (t >= end) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  // (starts once the lit layers are in hand, the sign showing switched off meanwhile; the tab asleep - it's just lit)
  ready.then(() => { if (over) return; if (document.hidden) { finish(); return; } raf = requestAnimationFrame(frame); });
}

// the neon's sound: a tiny click of the starter and a short hum (a buzzy saw low in the mains' harmonics, muffled),
// the last one of each layer a little longer as it settles. Quiet: well under the game's own sounds.
function hum() {
  let vol = 1;
  try {
    const s = JSON.parse(localStorage.getItem('cla.settings') || '{}').sound || {};
    if (s.on === false) return null;
    const m = typeof s.master === 'number' ? s.master : 0.8, f = typeof s.sfx === 'number' ? s.sfx : 0.8;
    vol = m * m * f * f / 0.4096;   // (squared like the mixer's sliders; 1 at the defaults)
  } catch { /* the defaults */ }
  if (vol < 0.02) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ac;
  try { ac = new AC(); } catch { return null; }
  if (ac.state !== 'running') { try { ac.close(); } catch { /* gone */ } return null; }   // (no tap yet: the browser keeps it silent anyway)
  const out = ac.createGain(); out.gain.value = 0.05 * vol; out.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
  const noise = ac.createBuffer(1, Math.round(ac.sampleRate * 0.03), ac.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  let closeT = 0;
  return {
    blip(hz, last) {
      try {
        const t = ac.currentTime, len = last ? 0.42 : 0.07;
        const o = ac.createOscillator(), v = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = (Math.random() - 0.5) * 30;
        v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(last ? 0.9 : 0.6, t + 0.008);
        v.gain.setValueAtTime(last ? 0.9 : 0.6, t + len * 0.4); v.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(v); v.connect(lp); o.start(t); o.stop(t + len + 0.02);
        const n = ac.createBufferSource(), nb = ac.createBiquadFilter(), ng = ac.createGain();
        n.buffer = noise; nb.type = 'bandpass'; nb.frequency.value = 2600; nb.Q.value = 1.2; ng.gain.value = 0.5;
        n.connect(nb); nb.connect(ng); ng.connect(out); n.start(t);
        clearTimeout(closeT); closeT = setTimeout(() => { try { ac.close(); } catch { /* gone */ } }, 1500);
      } catch { /* silent */ }
    },
    stop() { try { out.gain.setTargetAtTime(0, ac.currentTime, 0.03); } catch { /* gone */ } clearTimeout(closeT); closeT = setTimeout(() => { try { ac.close(); } catch { /* gone */ } }, 400); },
  };
}
