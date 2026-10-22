// How this device is doing, out of the page's first load (main.js loads it when it's needed):
//  - perfPayload: the report sent once a page (twenty seconds after the screen was first fully drawn, or two minutes in
//    if it never was: the load timeline, the frame rate, the sharpness it settled on, what the device is) and a second
//    four minutes into play (how well the art kept up as they went round) - the server keeps the latest and lists them
//    at /perf (server/perfreports.js);
//  - diagDraw: the diagnostics overlay (?diag, or Settings) - frame rate and where the frame goes, the render size,
//    memory, the controller, how often the input device flips. Made for reading off a TV or a phone screenshot.

export function perfPayload(c, stage) {
  const { S, LOAD, W, H, DPR, GOV, gfx, getDevice, framePct } = c, d = getDevice();
  const base = {
    kind: d.kind, gpu: (d.gpu || '').slice(0, 80), ua: navigator.userAgent.slice(0, 160), cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0,
    preset: gfx.preset, w: W, h: H, dpr: +DPR.toFixed(2), scale: +GOV.scale.toFixed(2), steps: GOV.steps,
  };
  if (stage === 'play') {
    const a2 = S.art2.stats(), L = a2.late || {};
    return {
      stage: 'play', ...base, fps: S.fps, p50: +framePct(0.5).toFixed(1), p95: +framePct(0.95).toFixed(1),
      bake: a2.t ? Math.round(a2.t.bakeAvg || 0) : 0, kept: a2.n ? a2.n.kept || 0 : 0, workers: a2.pool ? a2.pool.workers : 0,
      late: L.of ? +(100 * L.frames / L.of).toFixed(1) : 0, lateMove: L.moving ? +(100 * L.movingLate / L.moving).toFixed(1) : 0, lateMax: +(L.max || 0).toFixed(1), moving: L.of ? +(100 * L.moving / L.of).toFixed(0) : 0,
      ahead: a2.ahead ? a2.ahead.baked : 0,
      cdn: a2.n ? a2.n.cdn || 0 : 0, cdnMs: a2.n && a2.n.cdn && a2.t ? Math.round((a2.t.cdnSum || 0) / a2.n.cdn) : 0,
      fetched: a2.fetched ? a2.fetched.got + a2.fetched.had : 0, fetchMiss: a2.fetched ? a2.fetched.miss : 0, cdnOff: a2.fetched && a2.fetched.off ? 1 : 0,
    };
  }
  const a2 = S.art2 ? S.art2.stats() : null;
  return {
    ...base,
    at: LOAD.at, ms: LOAD.ms, city: LOAD.city || '', fps: S.fps, p50: +framePct(0.5).toFixed(1), p95: +framePct(0.95).toFixed(1),
    bake: a2 && a2.t ? Math.round(a2.t.bakeAvg || 0) : 0, kept: a2 && a2.n ? a2.n.kept || 0 : 0, workers: a2 && a2.pool ? a2.pool.workers : 0,
  };
}

export function diagDraw(diag, c) {
  const { S, W, H, DPR, GOV, canvas, input, deviceStats, canvasStats, loadLine, CHUNK_PX, ART2_WANTED, IS_CONSOLE, now, gfx, framePct, LOW_MEM } = c;
  if (!diag.el) { diag.el = document.createElement('pre'); diag.el.id = 'diag'; document.body.appendChild(diag.el); }
  const f = diag.frames.slice().sort((a, b) => a - b), avg = f.reduce((a, b) => a + b, 0) / (f.length || 1);
  const p = S.perf || {};
  const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1e6)}/${Math.round(performance.memory.jsHeapSizeLimit / 1e6)} MB` : 'n/a';
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
  const swRate = (deviceStats.switches - diag.sw0) / Math.max(1, (now - diag.swAt) / 60000);
  if (now - diag.swAt > 60000) { diag.sw0 = deviceStats.switches; diag.swAt = now; }
  const cacheMB = (S.ground ? S.ground.cache.size : 0) * CHUNK_PX * CHUNK_PX * 4 / 1e6;
  const cs = canvasStats();
  diag.el.textContent = [
    `fps ${S.fps}  frame avg ${avg.toFixed(1)} ms  worst ${(f[f.length - 1] || 0).toFixed(0)} ms  >50ms: ${diag.long}`,
    `parts ${Object.entries(p).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`,
    `screen ${W}x${H} @${DPR.toFixed(2)} (device ${(window.devicePixelRatio || 1).toFixed(2)}${GOV.scale < 1 ? `, eased to ${Math.round(GOV.scale * 100)}% to keep it smooth` : ''}) = ${(canvas.width * canvas.height / 1e6).toFixed(1)} MP  gfx ${gfx.preset} (light ${gfx.lighting}, flora ${gfx.flora})  frames p50 ${framePct(0.5).toFixed(1)} p95 ${framePct(0.95).toFixed(1)} ms`,
    `ground cache ${S.ground ? S.ground.cache.size : 0}/${S.ground ? S.ground.max : 0} chunks (${cacheMB.toFixed(0)} MB)  canvases ${cs.n} (${cs.mb.toFixed(0)} MB)  js heap ${mem}  gfx lost ${diag.lost}${LOW_MEM ? '  low-memory mode' : ''}`,
    ...(ART2_WANTED ? [S.art2 ? `art2 ${S.art2.diag()}` : `art2 off: ${S.art2Off || 'starting'}`] : []),
    `load ${loadLine()}`,
    `input ${input.device}  flips/min ${swRate.toFixed(0)}  pad ${pads.length ? `${pads[0].id.slice(0, 40)} [${pads[0].mapping || 'no mapping'}]` : 'none'}  emulation ${navigator.gamepadInputEmulation ?? 'n/a'}`,
    `${IS_CONSOLE ? 'console · ' : ''}${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 110)}`,
  ].join('\n');
}
