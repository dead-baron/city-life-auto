// The studio sting: Dead Baron's logo, SNES-style, before the title screen (the owner, 11-03: "a short little game
// studio logo when starting the game up ... like an old school retro SNES game studio would show"). The owner's pixel
// sprite (assets/deadbaron.png, 640 x 128: the body, the left and right wings at rest, the left and right wings
// raised 25 degrees about the shoulders - drawn wings first, then the body) on the game's navy, scaled by whole pixels
// (the times below are the timeline's; it plays at SPEED, three quarters, so 4.4 s in all):
//   0.0-0.9 s   the Baron eases in: his opacity rising while he glides smoothly down the last few pixels into
//               place, flapping all the while (a quick downstroke, a slower lift, the tips trailing each stroke; never stopping), riding a gentle hover in
//               step with the wings
//   0.95 s      a glint sweeps across each lens
//   1.15 s      DEAD BARON stamps in under him in the game's pixel lettering, a two-pixel shake, a chime
//   1.4-1.95 s  a sheen sweeps the letters (a broad bright band with a fainter one behind it)
//   2.5-3.3 s   out the SNES way: the screen breaks into a mosaic, the blocks growing as it darkens, then dissolves
//               onto the title screen
// Loaded as its own module beside boot.js, so the game loads underneath while it plays. Any tap, click or key skips
// it. Played once per browser session (a reload or an update's reload goes straight to the title), never with
// ?nosplash or under an automated browser (the tests' captures; ?splash plays it there, ?splash=<ms> holds one moment). Nothing else in the game depends on it.
// Then the title's own entrance: the neon sign switching on (client/titlelogo.js) and the menu's rows stepping up -
// once per page load; ?neon skips the sting and plays it (under an automated browser too), ?neon=<ms> holds one moment.
import { mountLogo, neonIntro, showLit } from './titlelogo.js';
(() => {
  const q = location.search;
  mountLogo();
  let seen = false;
  try { seen = sessionStorage.getItem('cla.splash') === '1'; sessionStorage.setItem('cla.splash', '1'); } catch { seen = false; }
  const force = /[?&]splash\b/.test(q), still = +((q.match(/[?&]splash=(\d+)/) || [])[1] || -1);   // (?splash plays it anyway; ?splash=<ms> holds that moment - the captures)
  const neonQ = q.match(/[?&]neon(?:=(\d+))?(?:&|$)/), neonAt = neonQ && neonQ[1] ? +neonQ[1] : -1;
  if (!force && !neonQ && (/[?&](nosplash|fresh)\b/.test(q) || navigator.webdriver)) { showLit(); return; }
  // the title screen waits, hidden, for its entrance (below): straight away when the sting has played this session
  const title = document.getElementById('title');
  const css = document.createElement('style');
  css.textContent = '#title.cla-in > * { opacity: 0; } #title.cla-in > .cla-up { transform: translateY(12px); }'
    + ' #title.cla-in > .cla-on { opacity: 1; transform: none; transition: opacity 220ms steps(4), transform 220ms steps(4); }';   // (stepped, not glided: the SNES way)
  document.head.appendChild(css);
  if (title) title.classList.add('cla-in');
  let introStarted = false;
  // The title's entrance, SNES-style (the owner, 11-03: "the City Life Auto logo come in with a similar stylized
  // animation ... goes smoothly into the main menu"; 11-14, the neon logo: "start unlit, then ... buzz on in turn"):
  // the sign steps in switched off and its layers buzz on one after another (client/titlelogo.js) while the menu's
  // rows step up into place.
  function titleIntro() {
    if (introStarted || !title) return;
    introStarted = true;
    const logo = document.getElementById('logo'), rows = [...title.children].filter((c) => c !== logo);
    const done = () => { title.classList.remove('cla-in'); for (const r of [logo, ...rows]) if (r) r.classList.remove('cla-on', 'cla-up'); };
    if (title.classList.contains('hidden') || !logo) { done(); showLit(); return; }
    if (neonAt >= 0) { done(); neonIntro({ at: neonAt }); return; }
    logo.classList.add('cla-on');
    rows.forEach((r, i) => { r.classList.add('cla-up'); setTimeout(() => r.classList.add('cla-on'), 520 + i * 70); });
    setTimeout(done, 520 + rows.length * 70 + 400);
    neonIntro();
  }
  if (neonQ) { titleIntro(); return; }
  if (seen && !force) { titleIntro(); return; }

  const NAVY = '#0F1830', T_END = 3300, OUT = 2500;   // (OUT: the mosaic transition starts; in the timeline's own ms)
  const SPEED = 0.75;   // (the timeline plays at three quarters speed: 4.4 s in all - the owner, 11-03: "slow the animation a bit")
  const cv = document.createElement('canvas');
  cv.id = 'splash';
  cv.setAttribute('aria-label', 'Dead Baron');
  cv.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;background:${NAVY};image-rendering:pixelated;cursor:pointer;touch-action:none`;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const sheet = new Image();
  sheet.src = 'assets/deadbaron.png';
  // The wings, posed on the fly: each resting wing split at its elbow (45% of the way from the shoulder to the tip)
  // into an inner and an outer part that overlap by a few pixels; a pose turns the whole wing about the shoulder (a: degrees up from rest) and the
  // outer part a little more about the elbow (b: the bend), nearest-neighbour so it stays pixel art. Poses are kept
  // by whole degrees once drawn. (sprite_manifest.json: the shoulders at (46, 72) and (74, 72); the tips at (5, 41)
  // and (125, 52); the raised cells of the sheet turn 25 degrees, the left clockwise.)
  const WING = { L: { cell: 1, sh: [46.5, 72.5], tip: [5.5, 41.5], sgn: 1 }, R: { cell: 2, sh: [74.5, 72.5], tip: [125.5, 52.5], sgn: -1 } };
  const poses = new Map();
  let wingsReady = false;
  sheet.onload = () => {
    for (const w of Object.values(WING)) {
      w.el = [w.sh[0] + (w.tip[0] - w.sh[0]) * 0.45, w.sh[1] + (w.tip[1] - w.sh[1]) * 0.45];
      const r = Math.hypot(w.el[0] - w.sh[0], w.el[1] - w.sh[1]), rIn = (r + 3) ** 2, rOut = Math.max(0, r - 3) ** 2;   // (the two parts overlap by 3 pixels either side of the elbow)
      const src = document.createElement('canvas'); src.width = src.height = 128;
      const sx = src.getContext('2d'); sx.drawImage(sheet, w.cell * 128, 0, 128, 128, 0, 0, 128, 128);
      const id = sx.getImageData(0, 0, 128, 128);
      const part = (inner) => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const d = new ImageData(new Uint8ClampedArray(id.data), 128, 128);
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          const d2 = (x + 0.5 - w.sh[0]) ** 2 + (y + 0.5 - w.sh[1]) ** 2;
          if (inner ? d2 >= rIn : d2 < rOut) d.data[(y * 128 + x) * 4 + 3] = 0;
        }
        c.getContext('2d').putImageData(d, 0, 0);
        return c;
      };
      w.inner = part(true); w.outer = part(false);
    }
    // every pose the wingbeat reaches, drawn now rather than mid-flight (the flap is the same every beat, so
    // sampling one beat finds them all - about a hundred small canvases)
    for (let i = 0; i < 1000; i++) { const fl = flap(i / 1000 * BEAT); for (const side of ['L', 'R']) wingPose(side, Math.round(fl.a), Math.round(fl.b / 2) * 2); }
    wingsReady = true;
    ready();
  };
  sheet.onerror = () => ready();
  function wingPose(side, a, b) {
    const key = `${side}${a}:${b}`;
    let c = poses.get(key);
    if (c) return c;
    const w = WING[side], rad = (v) => w.sgn * v * Math.PI / 180;
    c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.translate(w.sh[0], w.sh[1]); x.rotate(rad(a)); x.translate(-w.sh[0], -w.sh[1]);
    x.drawImage(w.inner, 0, 0);
    // the outer part at half the bend and then at the bend, over the overlap, so the joint never opens
    for (const f of [0.5, 1]) {
      x.save(); x.translate(w.el[0], w.el[1]); x.rotate(rad(b * f)); x.translate(-w.el[0], -w.el[1]);
      x.drawImage(w.outer, 0, 0); x.restore();
    }
    poses.set(key, c);
    return c;
  }
  // the wingbeat: a quick, strong downstroke (38% of the beat) and a slower recovery up, each eased in and out; the
  // wings sweep from 26 degrees up to 8 below rest. The tips trail the stroke - bent up while the wings drive down,
  // bent down while they lift - and the body rides up on each downstroke.
  const BEAT = 425, DOWN = 0.38, TOP = 26, BOT = -8, BEND = 12;
  const smooth = (v) => v * v * (3 - 2 * v);
  function flap(t) {
    const u = (t / BEAT) % 1;
    if (u < DOWN) { const k = u / DOWN; return { a: TOP + (BOT - TOP) * smooth(k), b: BEND * Math.sin(Math.PI * k) }; }
    const k = (u - DOWN) / (1 - DOWN);
    return { a: BOT + (TOP - BOT) * smooth(k), b: -BEND * 0.7 * Math.sin(Math.PI * k) };
  }

  const txt = document.createElement('canvas'), fill = document.createElement('canvas'), mos = document.createElement('canvas');
  let t0 = 0, done = false, raf = 0, chimed = false;

  const finish = () => {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    removeEventListener('keydown', finish, true);
    cv.remove();
    titleIntro();
  };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(); });
  addEventListener('keydown', finish, true);
  setTimeout(() => { if (!t0) start(); }, 5000);   // (whatever happens - the art never loads, the page never settles - it plays)

  // the chime: four square-wave notes up the chord, SNES-bright, only if the browser lets sound play yet
  function chime() {
    if (chimed) return; chimed = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      if (ac.state !== 'running') { ac.close(); return; }
      const out = ac.createGain(); out.gain.value = 0.08; out.connect(ac.destination);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime + i * 0.07;
        o.type = 'square'; o.frequency.value = f;
        v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(1, t + 0.01); v.gain.exponentialRampToValueAtTime(0.001, t + (i === 3 ? 0.6 : 0.18));
        o.connect(v); v.connect(out); o.start(t); o.stop(t + 0.65);
      });
      setTimeout(() => ac.close(), 1200);
    } catch { /* no sound: the sting plays silent */ }
  }

  const ease = (t) => 1 - (1 - t) * (1 - t) * (1 - t);   // (ease-out cubic)
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let W = 0, H = 0, textKey = '';
  function frame(now) {
    if (done) return;
    if (!t0) t0 = now;
    const t = still >= 0 ? still : (now - t0) * SPEED;
    // the canvas is sized only when the window changes (setting a canvas's size reallocates it - not every frame)
    // (and at one canvas pixel to a CSS pixel wherever that draws the logo just as big: pixel art scaled up looks the
    // same either way, and a phone fills a quarter of the pixels each frame)
    const fit = (k) => Math.floor(Math.min(innerWidth * k * 0.85 / 128, innerHeight * k * 0.75 / 134)) / k, hi = Math.min(2, devicePixelRatio || 1);
    const dpr = fit(1) >= 1 && fit(1) >= fit(hi) ? 1 : hi, w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; textKey = ''; }
    g.imageSmoothingEnabled = false;
    g.fillStyle = NAVY; g.fillRect(0, 0, W, H);
    // one sprite pixel = S screen pixels, as big as fits: the sprite (to row 105) and the lettering under it in three
    // quarters of the height, the sprite in 85% of the width; the block a little above the middle
    const S = Math.max(1, Math.floor(Math.min(W * 0.85 / 128, H * 0.75 / 134)));
    const ox = Math.round((W - 128 * S) / 2), restY = Math.round((H - 134 * S) * 0.45);
    // the entrance: fading in while gliding the last 10 sprite pixels down into place, in screen pixels (smooth, no
    // snap at the end); the wings beat at one steady rate the whole time, and he rides a gentle hover in step with
    // them - a smooth rise and fall of about half a sprite pixel, never a jump
    const kIn = ease(clamp(t / 900));
    const fl = flap(t), u = (t / BEAT) % 1;
    const hover = Math.round(-Math.cos(2 * Math.PI * (u - DOWN)) * S * 0.6);   // (highest as the downstroke ends, smooth)
    const y = Math.round(restY - (1 - kIn) * 10 * S) + hover;
    if (sheet.complete && sheet.naturalWidth) {
      g.globalAlpha = kIn;
      if (wingsReady) for (const side of ['L', 'R']) g.drawImage(wingPose(side, Math.round(fl.a), Math.round(fl.b / 2) * 2), 0, 0, 128, 128, ox, y, 128 * S, 128 * S);
      else for (const k of [1, 2]) g.drawImage(sheet, k * 128, 0, 128, 128, ox, y, 128 * S, 128 * S);
      g.drawImage(sheet, 0, 0, 128, 128, ox, y, 128 * S, 128 * S);
      g.globalAlpha = 1;
      // the glint: a two-pixel streak sweeping left to right across each lens, in whole pixels
      if (t > 950 && t < 1230) {
        const k = Math.floor((t - 950) / 40);
        g.fillStyle = '#FFFFFF';
        for (const lx of [55, 72]) for (let j = 0; j < 5; j++) {
          const px = lx + k * 2 + j, py = 48 - j * 2;
          if (px > lx + 12) continue;
          g.fillRect(ox + px * S, y + py * S, S, 2 * S);
        }
      }
    }
    // DEAD BARON: SNES-title lettering - bold, a dark outline a font pixel wide, cream over gold, a drop shadow, and
    // the sheen (all on its own canvas, so the sheen lights only the letters)
    if (t >= 1150) {
      if (!chimed) chime();
      const fs = 20 * S, fp = fs / 10, F = `700 ${fs}px "CLA Pixel", monospace`;   // (a font pixel = fs / 10 = 2 sprite pixels)
      const shake = t < 1280 ? (Math.floor(t / 30) % 2 ? 1 : -1) * fp : 0;
      g.font = F;
      const mt = g.measureText('DEAD BARON'), ink = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;   // (the letters' ink, not their advance: centred on what you see)
      const tw = Math.ceil(ink + 4 * fp), th = Math.ceil(fs + 4 * fp);
      const tx = Math.round(W / 2) + shake, ty = Math.round(restY + 110 * S);   // (the sprite ends at row 105)
      const sheen = t > 1400 && t < 1950, p = (t - 1400) / 550, bx = Math.round((p * (tw + 3 * fs) - 1.5 * fs) / fp) * fp;
      const key = `${tw}x${th}:${sheen ? bx : '-'}`;
      if (key !== textKey) {   // (the lettering is redrawn only when it changes: a new size, or the sheen moving on a font pixel)
      textKey = key;
      if (txt.width !== tw || txt.height !== th) { txt.width = tw; txt.height = th; }
      if (fill.width !== tw || fill.height !== th) { fill.width = tw; fill.height = th; }
      const c = txt.getContext('2d'), X = 2 * fp + mt.actualBoundingBoxLeft, Y = fp;
      c.clearRect(0, 0, tw, th); c.font = F; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillStyle = '#080D1C';
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) c.fillText('DEAD BARON', X + dx * fp, Y + dy * fp);   // (the outline and, below, the shadow)
      const f = fill.getContext('2d'); f.clearRect(0, 0, tw, th); f.globalCompositeOperation = 'source-over'; f.font = F; f.textAlign = 'left'; f.textBaseline = 'top';
      f.fillStyle = '#F3EAD2'; f.fillText('DEAD BARON', X, Y);
      f.globalCompositeOperation = 'source-atop';
      f.fillStyle = '#E2BD57'; f.fillRect(0, Math.round(Y + fs * 0.45), tw, th);   // (the lower half gold)
      if (sheen) {   // the sheen: a slanted band, bright, a fainter one trailing it, in whole font pixels
        for (const [off, wd, col] of [[0, 4, 'rgba(255,255,255,0.95)'], [-4, 2, 'rgba(255,255,255,0.5)'], [5, 1, 'rgba(255,255,255,0.35)']]) {
          f.fillStyle = col;
          for (let r = 0; r < 12; r++) f.fillRect(bx + off * fp + (11 - r) * fp * 0.5, Y + (r - 1) * fp, wd * fp, fp);
        }
      }
      c.drawImage(fill, 0, 0);
      }
      g.globalAlpha = clamp((t - 1150) / 60);   // (stamped in: there in a frame or two)
      g.drawImage(txt, Math.round(tx - tw / 2), ty);
      g.globalAlpha = 1;
    }
    // the way out, SNES style: the picture breaks into a mosaic whose blocks grow while it darkens, then the whole
    // canvas dissolves onto the title screen beneath
    if (t > OUT) {
      const k = clamp((t - OUT) / (T_END - OUT));
      const block = Math.max(1, Math.round(1 + ease(Math.min(1, k * 1.4)) * 31) * Math.max(1, Math.round(S / 2)));
      const mw = Math.max(1, Math.ceil(W / block)), mh = Math.max(1, Math.ceil(H / block));
      if (mos.width !== mw || mos.height !== mh) { mos.width = mw; mos.height = mh; }
      const m = mos.getContext('2d');
      m.imageSmoothingEnabled = true; m.drawImage(cv, 0, 0, mw, mh);   // (each block the average of what's under it)
      g.drawImage(mos, 0, 0, mw, mh, 0, 0, mw * block, mh * block);
      g.fillStyle = `rgba(15,24,48,${Math.min(1, k * 1.6)})`; g.fillRect(0, 0, W, H);   // (darkening to navy as the blocks grow)
      cv.style.opacity = String(1 - clamp((k - 0.55) / 0.45));
      if (k > 0.5 && still < 0) titleIntro();   // (the title's entrance starts as the sting dissolves onto it)
    } else cv.style.opacity = '1';
    if (t >= T_END && still < 0) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  // Before it plays: plain navy until everything is in hand and the page has finished loading behind it - the sheet,
  // the wing poses, the font, the page's own scripts - and then until the frames come steadily (ten in a row under
  // 20 ms), so the sting never stutters while the game starts up behind it (the owner, 11-03: choppy on a Pixel 7
  // Pro). Capped: it plays within about two and a half seconds whatever the page is doing.
  let need = 3, started = false;
  function ready() { if (--need === 0) settle(); }
  const fontP = document.fonts && document.fonts.load ? document.fonts.load('16px "CLA Pixel"') : Promise.resolve();
  Promise.race([fontP, new Promise((r) => setTimeout(r, 1500))]).then(ready, ready);
  if (document.readyState === 'complete') ready(); else addEventListener('load', ready, { once: true });
  function settle() {
    if (still >= 0) { start(); return; }
    const begin = performance.now();
    let last = 0, calm = 0;
    const tick = (now) => {
      if (done || started) return;
      if (last) calm = now - last < 20 ? calm + 1 : 0;
      last = now;
      if (calm >= 10 || now - begin > 1200) start(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function start() {
    if (started || done) return;
    started = true;
    if (still < 0) setTimeout(finish, T_END / SPEED + 2000);   // (whatever happens - the tab sleeps - the title comes)
    raf = requestAnimationFrame(frame);
  }
})();
