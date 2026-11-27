return new Promise((done) => {
  // (run in the page by tools/nature/waterwatch.sh: read N frames in a row off the game's own canvas - no HUD in it -
  // and say how the water's pixels changed from each to the next)
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const W = cv.width, H = cv.height, c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g = c2.getContext('2d', { willReadFrequently: true }), N = 6, fr = [], ts = [];
  // (the art's clock is stepped by hand - host.js reads globalThis.__claArtTime when it is set - a tenth of a second a
  // frame, however long this machine takes to draw one: what a player sees change in a tenth of a second)
  const T0 = 5000, STEP = 0.1;
  globalThis.__claArtTime = T0;
  let warm = 2;
  const grab = () => {
    if (warm > 0) { warm--; requestAnimationFrame(grab); return; }
    g.drawImage(cv, 0, 0); fr.push(g.getImageData(0, 0, W, H).data); ts.push(performance.now());
    globalThis.__claArtTime = T0 + fr.length * STEP;
    if (fr.length < N) { requestAnimationFrame(grab); return; }
    delete globalThis.__claArtTime;
    // (which pixels are water: told by their colour at noon under a clear sky, then kept for the place's other hours and
    // its rain - at sunset and at night water is not blue. waterwatch.sh sets __wwNew at each new place.)
    const a = fr[0]; let mask = globalThis.__wwMask, n = 0, white = 0;
    if (globalThis.__wwNew || !mask || mask.length !== W * H) {
      mask = globalThis.__wwMask = new Uint8Array(W * H); globalThis.__wwNew = 0;
      for (let i = 0; i < W * H; i++) { const r = a[i * 4], gg = a[i * 4 + 1], b = a[i * 4 + 2]; if (b - r > 12 && gg - b < 40) mask[i] = 1; }
    }
    for (let i = 0; i < W * H; i++) if (mask[i]) { n++; if (a[i * 4] * 0.3 + a[i * 4 + 1] * 0.55 + a[i * 4 + 2] * 0.15 > 215) white++; }
    const L = (d, i) => d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15, jumps = [];
    for (let k = 1; k < N; k++) { let j = 0; for (let i = 0; i < W * H; i++) if (mask[i] && Math.abs(L(fr[k], i) - L(fr[k - 1], i)) > 40) j++; jumps.push(j / (n || 1) * 100); }
    // (to look at: the first frame as it is, and dimmed with every water pixel that jumped between the first two frames
    // in red - kept as two PNGs on the page for waterwatch.sh's save steps: a headless screenshot takes many seconds)
    g.putImageData(new ImageData(new Uint8ClampedArray(a), W, H), 0, 0); const plain = c2.toDataURL('image/png');
    const im = g.createImageData(W, H), o = im.data;
    for (let i = 0; i < W * H; i++) { const j = mask[i] && Math.abs(L(fr[1], i) - L(fr[0], i)) > 40; o[i * 4] = j ? 255 : a[i * 4] * 0.45; o[i * 4 + 1] = j ? 40 : a[i * 4 + 1] * 0.45; o[i * 4 + 2] = j ? 40 : a[i * 4 + 2] * 0.45; o[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); globalThis.__ww = { plain, jumps: c2.toDataURL('image/png') };
    jumps.sort((p, q) => p - q);
    done({ size: W + 'x' + H, frameMs: Math.round((ts[N - 1] - ts[0]) / (N - 1)), water: +(n / (W * H) * 100).toFixed(1), jumpMedian: +jumps[N >> 1 > jumps.length - 1 ? jumps.length - 1 : (jumps.length >> 1)].toFixed(2), jumpMax: +jumps[jumps.length - 1].toFixed(2), glint: +(white / (n || 1) * 100).toFixed(2) });
  };
  requestAnimationFrame(grab);
});
