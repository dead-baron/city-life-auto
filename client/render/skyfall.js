// Someone falling from an aircraft (server skydive.js): their shadow on the ground under them, smaller and fainter the
// higher they are, the canopy's wider (art v2 draws them up in the sky: art2/game/host.js _ped); the classic renderer
// draws them on the ground, so it gets the canopy here, over them
export function drawSkyShadows(g, F, v2) {
  for (const e of F.peds) {
    if (!e.sky) continue;
    const h = e.rsky || e.sky, k = Math.max(0.2, 1 - h / 1400), so = 3 + h * 0.05;
    g.save();
    g.globalAlpha = 0.3 * k; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(e.rx + so, e.ry + so * 0.6, e.chute ? 26 : 9, e.chute ? 11 : 5, e.chute ? e.ra + Math.PI / 2 : e.ra, 0, Math.PI * 2); g.fill();
    if (!v2 && e.chute) {
      g.globalAlpha = 1; g.translate(e.rx, e.ry - 34); g.rotate(e.ra + Math.PI / 2);
      for (let i = 0; i < 8; i++) { g.fillStyle = i & 1 ? '#f0ece4' : (e.id & 1 ? '#285cb4' : '#d6342c'); g.fillRect(-29 + i * 7.25, -11, 7.3, 22); }
      g.strokeStyle = 'rgba(20,20,24,.6)'; g.lineWidth = 1; g.strokeRect(-29, -11, 58, 22);
    }
    g.restore();
  }
}
