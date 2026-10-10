// The Grand Theatre as this page sees it (loaded lazily near the cinema: main.js drawCinema). Inside a screen room the
// room is dark; in your seat, the film you're watching plays on the screen - invented films drawn as plain shapes of
// coloured light, cutting from shot to shot (the title first, THE END last) - and its light falls on the seats. The
// server decides everything (server/systems/cinema.js); this only keeps the film's clock between 'me' updates.
import { FILMS } from '../shared/cinema.js';

const TAU = Math.PI * 2;

export class CinemaView {
  constructor(S) { this.S = S; this.clock = null; }
  draw(g, F, ctx) {
    const S = this.S, C = S.map.cinema, b = ctx.walkInAt(F.sp.x, F.sp.y);
    if (!C || !b || b.id !== C.b) { this.clock = null; return; }
    const now = performance.now() / 1000, me = S.me && S.me.cine;
    if (me) {
      const at = now - (this.clock ? this.clock.t0 : 0);
      if (!this.clock || this.clock.film !== me.film || this.clock.room !== me.room || Math.abs(at - me.at) > 2) this.clock = { film: me.film, room: me.room, t0: now - me.at };
    } else this.clock = null;
    for (const R of C.rooms) {
      const inRoom = F.sp.x >= R.x0 && F.sp.x < R.x1 && F.sp.y >= R.y0 - 8 && F.sp.y < R.y1 + 8;
      const watching = me && me.room === R.i && this.clock;
      if (!inRoom && !watching) continue;
      const sx = R.screen.x0, sw = R.screen.x1 - R.screen.x0, sh = R.screen.h, sy = R.backEdge - R.screen.lift - sh;
      g.save();
      // the dark (the house lights down while a film plays)
      g.fillStyle = watching ? 'rgba(4,4,12,.6)' : 'rgba(6,6,14,.38)';
      g.fillRect(R.x0, sy - 6, R.x1 - R.x0, R.y1 - sy + 6);
      if (watching) {
        const t = now - this.clock.t0, f = FILMS[me.film] || FILMS[0];
        const light = film(g, sx, sy, sw, sh, t, f, me.len || 75);
        // the screen's light on the audience: a soft fan from the screen over the seats
        const gr = g.createLinearGradient(0, R.backEdge - R.screen.lift, 0, R.y1);
        gr.addColorStop(0, rgba(light, 0.4)); gr.addColorStop(1, rgba(light, 0));
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(sx, R.backEdge - R.screen.lift); g.lineTo(sx + sw, R.backEdge - R.screen.lift); g.lineTo(R.x1, R.y1); g.lineTo(R.x0, R.y1); g.closePath(); g.fill();
        g.globalCompositeOperation = 'source-over';
      } else {
        // between films: the screen pale under the house lights
        g.fillStyle = 'rgba(200,206,220,.18)'; g.fillRect(sx, sy, sw, sh);
      }
      g.restore();
    }
  }
}

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// one frame of an invented film in the screen's rect, t seconds in: the title card, shots of plain shapes that cut every
// 6 s, THE END. Returns the colour its light throws on the room.
function film(g, x, y, w, h, t, f, len) {
  const [sky, lit, fig, acc] = f.pal, shot = Math.floor(t / 6), u = (t % 6) / 6;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  let light = hexRGB(lit);
  if (t < 4 || t > len - 3) {
    // the title card / the end
    const end = t > 4;
    g.fillStyle = lit; g.globalAlpha = Math.min(1, end ? (len - t) : t, 1);
    g.font = `bold ${Math.max(7, Math.round(h / 5))}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(end ? 'THE END' : f.title.toUpperCase(), x + w / 2, y + h * 0.45);
    if (!end) { g.font = `${Math.max(5, Math.round(h / 9))}px serif`; g.fillStyle = fig; g.fillText(f.tag, x + w / 2, y + h * 0.72); }
    g.globalAlpha = 1;
    light = hexRGB(fig).map((c) => c * 0.6);
  } else if (f.kind === 'chase') {
    // a night city: towers against the glow, a car racing along the waterfront, its lights streaking
    g.fillStyle = lit; g.globalAlpha = 0.35; g.fillRect(x, y + h * 0.5, w, h * 0.1); g.globalAlpha = 1;
    for (let k = 0; k < 9; k++) { const bx = x + ((k * 23 - t * (shot % 2 ? 30 : 14)) % (w + 30) + w + 30) % (w + 30) - 15, bh = h * (0.25 + ((k * 37) % 5) * 0.06); g.fillStyle = '#05060c'; g.fillRect(bx, y + h * 0.6 - bh, 14, bh); g.fillStyle = acc; for (let r = 0; r < 3; r++) g.fillRect(bx + 3 + (r % 2) * 6, y + h * 0.6 - bh + 4 + r * 6, 2, 2); }
    g.fillStyle = '#0a0c18'; g.fillRect(x, y + h * 0.6, w, h * 0.4);
    const cx = x + w * (shot % 2 ? 1 - u : u) * 1.2 - w * 0.1, cy = y + h * 0.74;
    g.fillStyle = fig; g.fillRect(cx - 12, cy - 4, 24, 7); g.fillRect(cx - 6, cy - 8, 12, 5);
    g.fillStyle = lit; g.globalAlpha = 0.6; g.fillRect(shot % 2 ? cx + 12 : cx - 40, cy - 2, 28, 2); g.globalAlpha = 1;
    light = hexRGB(shot % 2 ? lit : fig);
  } else if (f.kind === 'sea') {
    // a lighthouse on its rock, the beam sweeping, the waves rolling in
    const lx = x + w * (0.3 + (shot % 3) * 0.2), base = y + h * 0.7;
    g.fillStyle = '#0c1626'; g.beginPath(); g.ellipse(lx, base + 2, 18, 6, 0, 0, TAU); g.fill();
    g.fillStyle = fig; g.fillRect(lx - 4, base - 22, 8, 22); g.fillStyle = acc; g.fillRect(lx - 4, base - 16, 8, 3); g.fillRect(lx - 4, base - 8, 8, 3);
    const a = Math.sin(t * 1.4) * 1.3;
    g.fillStyle = lit; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(lx, base - 24); g.lineTo(lx + Math.cos(a) * w, base - 24 + Math.sin(a) * 18 - 8); g.lineTo(lx + Math.cos(a) * w, base - 24 + Math.sin(a) * 18 + 8); g.closePath(); g.fill(); g.globalAlpha = 1;
    g.fillStyle = lit; g.beginPath(); g.arc(lx, base - 24, 2.5, 0, TAU); g.fill();
    g.fillStyle = acc; for (let k = 0; k < 3; k++) { const wy = base + 4 + k * 5; g.beginPath(); for (let wx = 0; wx <= w; wx += 6) g.lineTo(x + wx, wy + Math.sin(wx * 0.15 + t * 2 + k) * 2); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fill(); }
    light = hexRGB(Math.sin(t * 1.4) > 0.6 ? lit : acc);
  } else if (f.kind === 'space') {
    // stars drifting by, a ringed planet, a rider swinging a lasso of light
    for (let k = 0; k < 24; k++) { g.fillStyle = k % 5 ? '#c8d0ff' : acc; g.fillRect(x + ((k * 41 + t * (8 + k % 3 * 6)) % w), y + ((k * 29) % h), 1, 1); }
    const px = x + w * (0.7 - (shot % 2) * 0.4), py = y + h * 0.4;
    g.fillStyle = lit; g.beginPath(); g.arc(px, py, h * 0.22, 0, TAU); g.fill();
    g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.ellipse(px, py, h * 0.36, h * 0.08, -0.3, 0, TAU); g.stroke();
    const rx = x + w * (0.25 + u * 0.2), ry = y + h * 0.7 + Math.sin(t * 2) * 3;
    g.fillStyle = fig; g.beginPath(); g.arc(rx, ry - 6, 3, 0, TAU); g.fill(); g.fillRect(rx - 2, ry - 3, 4, 7);
    g.strokeStyle = fig; g.lineWidth = 1; g.beginPath(); g.ellipse(rx + 4, ry - 14, 9, 3, t * 3, 0, TAU); g.stroke();
    light = hexRGB(lit);
  } else {
    // a diner booth at night: the window and the moon, two figures leaning in, a heart rising now and then
    g.fillStyle = '#1a0c14'; g.fillRect(x, y + h * 0.65, w, h * 0.35);
    g.strokeStyle = acc; g.lineWidth = 2; g.strokeRect(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.45);
    g.fillStyle = fig; g.beginPath(); g.arc(x + w * (0.65 - (shot % 2) * 0.3), y + h * 0.28, 5, 0, TAU); g.fill();
    const lean = Math.min(1, u * 1.6) * 6;
    for (const [k, c] of [[-1, lit], [1, acc]]) { const fx = x + w / 2 + k * (16 - lean); g.fillStyle = c; g.beginPath(); g.arc(fx, y + h * 0.58, 5, 0, TAU); g.fill(); g.fillRect(fx - 5, y + h * 0.62, 10, h * 0.3); }
    if (shot % 3 === 2) { const hy = y + h * (0.5 - u * 0.4); g.fillStyle = lit; g.beginPath(); g.arc(x + w / 2 - 2, hy, 2.2, 0, TAU); g.arc(x + w / 2 + 2, hy, 2.2, 0, TAU); g.fill(); g.beginPath(); g.moveTo(x + w / 2 - 4, hy + 1); g.lineTo(x + w / 2 + 4, hy + 1); g.lineTo(x + w / 2, hy + 6); g.fill(); }
    light = hexRGB(lit);
  }
  // the grain and the odd scratch on the print
  g.fillStyle = 'rgba(255,255,255,.07)'; for (let k = 0; k < 2; k++) g.fillRect(x + ((t * 89 + k * 53) % w), y, 1, h);
  g.restore();
  // the screen's edge
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  return light;
}
