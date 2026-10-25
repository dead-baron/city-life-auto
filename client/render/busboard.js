// The bus shelters' arrival boards (the owner, notes 2: "a clock or information saying when the next bus should be
// there"): an LED panel on each shelter's stop pole (client/art2/props-district.js busShelter) counting down to the
// next bus of the line that calls there - its colour on the left, "3 MIN", "DUE" as it comes in, "--" with none out.
// The server sends the times about once a second (server/systems/transit.js stopBoards); counted down in between.
// bt: { l: [[prop index, s, line], ...], c: the lines' colours, at: when it came (s) }
export function drawBusBoards(g, map, bt, view, now) {
  const since = performance.now() / 1000 - bt.at, best = new Map();
  for (const [pi, eta, li] of bt.l) {
    const p = map.props[pi];
    if (!p || p.x < view.x0 - 200 || p.x > view.x1 + 200 || p.y < view.y0 - 200 || p.y > view.y1 + 200) continue;
    const secs = eta < 0 ? -1 : Math.max(0, eta - since), o = best.get(pi);
    if (!o || (secs >= 0 && (o.secs < 0 || secs < o.secs))) best.set(pi, { p, secs, col: bt.c[li] || '#2a5ab8' });
  }
  for (const { p, secs, col } of best.values()) board(g, p, secs, col, now);
}
function board(g, p, secs, col, now) {
  // the pole stands past the shelter's east end (west, turned round to face north), the board up it
  const n = p.face === 'N', x = p.x + (n ? -43 : 43), y = p.y + (n ? -4 : 4) - 36;
  let text = '--', tc = '#ffb020';
  if (secs >= 0 && secs < 20) { text = 'DUE'; tc = Math.floor(now * 2) % 2 ? '#7dff7a' : '#4ad048'; }
  else if (secs >= 0) text = `${Math.max(1, Math.round(secs / 60))} MIN`;
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-15, -5, 32, 14);
  g.fillStyle = '#16181c'; g.fillRect(-16, -7, 32, 14);
  g.fillStyle = '#050607'; g.fillRect(-15, -6, 30, 12);
  g.fillStyle = col; g.fillRect(-15, -6, 5, 12);
  g.fillStyle = '#fff'; g.font = 'bold 3.6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(-12.5, 0); g.rotate(-Math.PI / 2); g.fillText('BUS', 0, 0.3); g.restore();
  g.fillStyle = 'rgba(255,176,32,.1)'; g.fillRect(-10, -6, 25, 12);
  g.fillStyle = '#8a8f99'; g.font = 'bold 3px sans-serif'; g.fillText('NEXT BUS', 2.5, -3);
  g.fillStyle = tc; g.font = `bold ${text.length > 4 ? 5.5 : 6.5}px monospace`; g.fillText(text, 2.5, 2.4);
  g.restore();
}
