// The HUD's lines for riding (loaded the first time you're on a surfboard or a horse: main.js) - out of the page's
// first load.
//   drawSurfHud(g, W, H, S, sf, now)   surfing (server surf.js, me.surf): riding a wave, its points so far big over you;
//                                      the ride just done, its points rising away; your best ride under them
//   drawHorseHud(g, W, H, S, h, now)   on a horse (#325, server horses.js, me.horse): its wind under the money - a bar
//                                      running down as it gallops (Sprint), BLOWN when it's spent (a canter till it's got
//                                      its breath back) - and a hired one's time left

export function drawHorseHud(g, W, H, S, h, now) {
  const P = S.pred, st = P && P.def && P.def.horse && P.s.stam !== undefined ? P.s.stam : h.st, blown = P && P.def && P.def.horse ? !!P.s.blown : !!h.bl;
  g.save();
  // (low in the middle of the screen: clear of the money and the stars down the right, the sticks and buttons at the sides)
  const w = 120, x = Math.round(W / 2 - w / 2), y = H - Math.max(70, H * 0.13), lab = blown ? 'BLOWN - LET IT BREATHE' : 'HORSE · SPRINT TO GALLOP';
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = '700 11px system-ui, sans-serif';
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(lab, W / 2 + 1, y - 2 + 1);
  g.fillStyle = blown ? '#ff9a6a' : '#f2e2c4'; g.fillText(lab, W / 2, y - 2);
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - 1, y - 1, w + 2, 8);
  g.fillStyle = blown ? (Math.floor(now * 3) % 2 ? '#c8502a' : '#8a3a22') : st > 0.35 ? '#e8c27a' : '#e0803a';
  g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, st))), 6);
  if (h.hire !== null && h.hire !== undefined) { g.textBaseline = 'top'; g.fillStyle = h.hire < 60 ? '#ff9a6a' : '#f2e2c4'; g.fillText(`HIRED · ${Math.floor(h.hire / 60)}:${String(h.hire % 60).padStart(2, '0')}`, W / 2, y + 10); }
  g.restore();
}

export function drawSurfHud(g, W, H, S, sf, now) {
  if (!sf.st && !sf.pts) return;
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = W / 2, top = Math.max(64, H * 0.14), shadow = (t, x, y, c) => { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(t, x + 1.5, y + 1.5); g.fillStyle = c; g.fillText(t, x, y); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  if (sf.pts !== null && sf.pts !== undefined) {
    g.font = '700 13px system-ui, sans-serif'; shadow(sf.st === 'air' ? 'AIR!' : 'RIDING', cx, top, sf.st === 'air' ? '#ffd34a' : '#bfefff');
    g.font = '800 22px system-ui, sans-serif'; shadow(fmt(sf.pts), cx, top + 22, '#fff');
    S.surfBank = null;
  } else if (sf.last) {
    if (!S.surfBank || S.surfBank.pts !== sf.last) S.surfBank = { pts: sf.last, at: now };
    const k = Math.min(1, (now - S.surfBank.at) / 2);
    if (k < 1) { g.globalAlpha = 1 - k * k; g.font = '800 22px system-ui, sans-serif'; shadow(`+${fmt(sf.last)}`, cx, top + 10 - k * 14, '#7fe07f'); g.globalAlpha = 1; }
  }
  if (sf.st && sf.best) { g.font = '700 11px system-ui, sans-serif'; shadow(`BEST RIDE ${fmt(sf.best)}`, cx, top + 44, '#e8f4ff'); }   // (under the points: clear of the money and the stars down the right)
  g.restore();
}
