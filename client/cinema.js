// The Grand Theatre as this page sees it (loaded lazily near the cinema: main.js drawCinema). Inside a screen room the
// room is dark and the film on (the one you're watching in your seat, else the audience's) plays on the screen -
// invented films drawn as plain shapes of coloured light, cutting from shot to shot (the title first, THE END last) -
// and its light falls on the seats. The server decides everything (server/systems/cinema.js: the 'me' payload's cine);
// this only keeps each film's clock between 'me' updates.
import { FILMS } from '../shared/cinema.js';

const TAU = Math.PI * 2;

export class CinemaView {
  constructor(S) { this.S = S; this.clocks = []; }
  draw(g, F, ctx) {
    const S = this.S, C = S.map.cinema, b = ctx.walkInAt(F.sp.x, F.sp.y);
    if (!C || !b || b.id !== C.b) { this.clocks = []; return; }
    const now = performance.now() / 1000, me = S.me && S.me.cine;
    for (const R of C.rooms) {
      // what's on in this room (yours in your seat, else what the room's audience is watching), its clock kept here
      const show = me ? (me.room >= 0 ? (me.room === R.i ? [me.film, me.at] : null) : me.shows && me.shows[R.i]) : null;
      let k = this.clocks[R.i];
      if (!show) k = null;
      else if (!k || k.film !== show[0] || Math.abs(now - k.t0 - show[1]) > 2) k = { film: show[0], t0: now - show[1] };
      this.clocks[R.i] = k;
      const inRoom = F.sp.x >= R.x0 && F.sp.x < R.x1 && F.sp.y >= R.y0 - 8 && F.sp.y < R.y1 + 8;
      if (!inRoom && !(me && me.room === R.i)) continue;
      const sx = R.screen.x0, sw = R.screen.x1 - R.screen.x0, sh = R.screen.h, sy = R.backEdge - R.screen.lift - sh;
      g.save();
      // the dark (the house lights down while a film plays)
      g.fillStyle = k ? 'rgba(4,4,12,.6)' : 'rgba(6,6,14,.38)';
      g.fillRect(R.x0, sy - 6, R.x1 - R.x0, R.y1 - sy + 6);
      if (k) {
        const light = film(g, sx, sy, sw, sh, now - k.t0, FILMS[k.film] || FILMS[0], (me && me.len) || 75);
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

// a flying saucer at (x, y): the hull, the dome, the lights running round its rim
function saucer(g, x, y, k, t, lit, acc) {
  g.fillStyle = '#c8ccd8'; g.beginPath(); g.ellipse(x, y, 16 * k, 4.5 * k, 0, 0, TAU); g.fill();
  g.fillStyle = lit; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(x, y - 3 * k, 6 * k, 5 * k, 0, Math.PI, TAU); g.fill(); g.globalAlpha = 1;
  for (let i = 0; i < 6; i++) { const a = t * 4 + i * 1.05, c = Math.cos(a); if (Math.sin(a) < 0) continue; g.fillStyle = i % 2 ? acc : lit; g.fillRect(x + c * 13 * k - 1, y + 1, 2, 2); }
}
// between the features (the drive-in's intermission, client/drivein.js): the card - TONIGHT before the first, else
// INTERMISSION; a popcorn box and a soda dancing for the snack bar; what's next and how long till it. Returns its light.
export function intermission(g, x, y, w, h, toGo, next, first, t) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#3a0c14'; g.fillRect(x, y, w, h);
  g.fillStyle = '#ffd23a'; g.globalAlpha = 0.25; for (let k = 0; k < 10; k++) g.fillRect(x + ((k * w / 10 + t * 20) % w), y, 2, h); g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd23a'; fit(g, first ? 'TONIGHT AT THE STARLITE' : 'INTERMISSION', Math.max(7, Math.round(h / 7)), w * 0.92, 'bold ');
  g.fillText(first ? 'TONIGHT AT THE STARLITE' : 'INTERMISSION', x + w / 2, y + h * 0.16);
  // the snack bar's dancers
  const bob = (k) => Math.abs(Math.sin(t * 4 + k)) * h * 0.06;
  const px = x + w * 0.22, py = y + h * 0.62 - bob(0);
  g.fillStyle = '#e8e2d0'; g.fillRect(px - 8, py - 12, 16, 18); g.fillStyle = '#c8262b'; g.fillRect(px - 6, py - 12, 3, 18); g.fillRect(px + 3, py - 12, 3, 18);
  g.fillStyle = '#fff6c0'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(px - 6 + k * 3, py - 14 - (k % 2) * 2, 2.5, 0, TAU); g.fill(); }
  const cx = x + w * 0.78, cy = y + h * 0.62 - bob(1.6);
  g.fillStyle = '#2350c8'; g.fillRect(cx - 6, cy - 12, 12, 18); g.fillStyle = '#e8e2d0'; g.fillRect(cx - 6, cy - 6, 12, 3); g.fillRect(cx + 1, cy - 20, 2, 9);
  g.fillStyle = '#ffffff'; fit(g, 'VISIT THE SNACK BAR!', Math.max(5, Math.round(h / 11)), w * 0.5);
  g.fillText('VISIT THE SNACK BAR!', x + w / 2, y + h * 0.4);
  if (next) {
    g.fillStyle = '#ffd23a'; fit(g, next.toUpperCase(), Math.max(5, Math.round(h / 10)), w * 0.5, 'bold ');
    g.fillText(next.toUpperCase(), x + w / 2, y + h * 0.62);
    g.font = `${Math.max(5, Math.round(h / 11))}px serif`;
    const s = Math.max(0, Math.ceil(toGo));
    g.fillStyle = '#e8e2d0'; g.fillText(`STARTS IN ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x + w / 2, y + h * 0.82);
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  return [200, 60, 40];
}

// the font at size px, smaller if the text would run wider than maxW
function fit(g, text, size, maxW, wt = '') {
  g.font = `${wt}${size}px serif`;
  const tw = g.measureText(text).width;
  if (tw > maxW) g.font = `${wt}${Math.max(4, Math.floor(size * maxW / tw))}px serif`;
}
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// one frame of an invented film in the screen's rect, t seconds in: the title card, shots of plain shapes that cut every
// 6 s, THE END. Returns the colour its light throws on the room. (Also the Starlite Drive-In's: client/drivein.js - its
// own creature features and westerns, shared/drivein.js FEATURES.)
export function film(g, x, y, w, h, t, f, len) {
  const [sky, lit, fig, acc] = f.pal, shot = Math.floor(t / 6), u = (t % 6) / 6;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  let light = hexRGB(lit);
  if (t < 4 || t > len - 3) {
    // the title card / the end
    const end = t > 4;
    g.fillStyle = lit; g.globalAlpha = Math.min(1, end ? (len - t) : t, 1);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, end ? 'THE END' : f.title.toUpperCase(), Math.max(7, Math.round(h / 5)), w * 0.92, 'bold ');
    g.fillText(end ? 'THE END' : f.title.toUpperCase(), x + w / 2, y + h * 0.45);
    if (!end) { fit(g, f.tag, Math.max(5, Math.round(h / 9)), w * 0.92); g.fillStyle = fig; g.fillText(f.tag, x + w / 2, y + h * 0.72); }
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
  } else if (f.kind === 'monster') {
    // a little desert town at night, a cactus the size of a water tower stomping through it, searchlights, cars fleeing
    const wide = shot % 3 !== 1, ground = y + h * 0.78;
    for (let k = 0; k < 18; k++) { g.fillStyle = '#c8d0ff'; g.fillRect(x + ((k * 53) % w), y + ((k * 31) % (h * 0.5)), 1, 1); }
    if (wide) {
      for (let k = 0; k < 2; k++) { const a = Math.sin(t * (0.9 + k * 0.4) + k * 2) * 0.5; g.fillStyle = lit; g.globalAlpha = 0.16; g.beginPath(); g.moveTo(x + w * (0.2 + k * 0.6), ground); g.lineTo(x + w * (0.2 + k * 0.6) + Math.sin(a) * h - 8, y); g.lineTo(x + w * (0.2 + k * 0.6) + Math.sin(a) * h + 8, y); g.closePath(); g.fill(); g.globalAlpha = 1; }
      const cx = x + w * (shot % 2 ? 0.75 - u * 0.4 : 0.25 + u * 0.4), step = Math.abs(Math.sin(t * 3)) * 3, ch = h * 0.62;
      g.fillStyle = fig;
      g.fillRect(cx - 7, ground - ch + step, 14, ch);                                            // (the trunk)
      g.fillRect(cx - 20, ground - ch * 0.62 + step, 13, 6); g.fillRect(cx - 20, ground - ch * 0.85 + step, 6, ch * 0.25);   // (an arm up)
      g.fillRect(cx + 7, ground - ch * 0.5 + step, 12, 6); g.fillRect(cx + 13, ground - ch * 0.72 + step, 6, ch * 0.24);
      g.fillStyle = acc; g.fillRect(cx - 4, ground - ch * 0.86 + step, 3, 2); g.fillRect(cx + 2, ground - ch * 0.86 + step, 3, 2);   // (its eyes)
      g.fillStyle = '#05060c';
      for (let k = 0; k < 7; k++) { const bx = x + k * w / 7 + 3, bh = h * (0.08 + ((k * 29) % 4) * 0.03); g.fillRect(bx, ground - bh, w / 7 - 6, bh); g.fillStyle = lit; if ((k + shot) % 2) g.fillRect(bx + 3, ground - bh + 3, 2, 2); g.fillStyle = '#05060c'; }
      g.fillStyle = '#0a0812'; g.fillRect(x, ground, w, y + h - ground);
      for (let k = 0; k < 3; k++) { const vx = x + ((k * 47 + t * 60) % (w + 20)) - 10; g.fillStyle = '#e8e2d0'; g.fillRect(vx, ground + 5 + k * 3, 8, 3); g.fillStyle = lit; g.fillRect(vx + 8, ground + 6 + k * 3, 3, 1); }
    } else {
      // the close-up: the spines, the glare, the roar
      const sh = Math.sin(t * 40) * (u > 0.5 ? 1.5 : 0);
      g.fillStyle = fig; g.fillRect(x + w * 0.25 + sh, y, w * 0.5, h);
      g.fillStyle = '#e8e2d0'; for (let k = 0; k < 14; k++) g.fillRect(x + w * 0.25 + ((k * 37) % (w * 0.5)) + sh, y + ((k * 23) % h), 2, 1);
      g.fillStyle = acc; g.beginPath(); g.ellipse(x + w * 0.4 + sh, y + h * 0.35, 6, 4, 0, 0, TAU); g.ellipse(x + w * 0.6 + sh, y + h * 0.35, 6, 4, 0, 0, TAU); g.fill();
      g.fillStyle = '#05060c'; g.beginPath(); g.ellipse(x + w * 0.5 + sh, y + h * 0.65, 12, 3 + Math.min(1, u * 2) * 9, 0, 0, TAU); g.fill();
    }
    light = hexRGB(wide ? lit : acc);
  } else if (f.kind === 'saucer') {
    // a field under the stars, a cow, a saucer over it - the beam, up she goes; or the saucer streaking across
    for (let k = 0; k < 26; k++) { g.fillStyle = k % 6 ? '#c8d0ff' : acc; g.fillRect(x + ((k * 41) % w), y + ((k * 29) % (h * 0.6)), 1, 1); }
    const ground = y + h * 0.8;
    g.fillStyle = '#0a1a10'; g.fillRect(x, ground, w, y + h - ground);
    if (shot % 2 === 0) {
      const sx = x + w * 0.5 + Math.sin(t * 0.8) * w * 0.1, sy = y + h * 0.22 + Math.sin(t * 2.1) * 2, lift = Math.min(1, u * 1.25);
      g.fillStyle = lit; g.globalAlpha = 0.28; g.beginPath(); g.moveTo(sx - 8, sy + 4); g.lineTo(sx + 8, sy + 4); g.lineTo(sx + 26, ground + 2); g.lineTo(sx - 26, ground + 2); g.closePath(); g.fill(); g.globalAlpha = 1;
      const cy = ground - 6 - lift * (ground - sy - 18);
      g.fillStyle = fig; g.fillRect(sx - 9, cy - 5, 18, 8); g.fillRect(sx + 7, cy - 8, 6, 5);   // (the cow, legs dangling)
      g.fillStyle = '#05060c'; g.fillRect(sx - 6, cy - 4, 4, 3); g.fillRect(sx + 1, cy - 2, 4, 3); g.fillRect(sx - 8, cy + 3, 2, 3 + lift * 2); g.fillRect(sx + 5, cy + 3, 2, 3 + lift * 2);
      saucer(g, sx, sy, 1, t, lit, acc);
      light = hexRGB(lit);
    } else {
      const sx = x - 30 + (w + 60) * u, sy = y + h * (0.5 - u * 0.25);
      g.fillStyle = lit; g.globalAlpha = 0.3; g.fillRect(sx - 60, sy - 1, 50, 2); g.globalAlpha = 1;
      saucer(g, sx, sy, 0.8, t, lit, acc);
      g.fillStyle = '#05060c'; for (let k = 0; k < 4; k++) g.fillRect(x + w * (0.1 + k * 0.22), ground - 10, 14, 10);   // (the farm's sheds)
      light = hexRGB(acc).map((c) => c * 0.7);
    }
  } else if (f.kind === 'western') {
    // sundown on the main street: the sun, the false fronts, two gunfighters, a tumbleweed - and the draw
    const ground = y + h * 0.74, g2 = g.createLinearGradient(0, y, 0, ground);
    g2.addColorStop(0, sky); g2.addColorStop(1, lit);
    g.fillStyle = g2; g.fillRect(x, y, w, ground - y);
    g.fillStyle = lit; g.beginPath(); g.arc(x + w * 0.5, ground - 4 + u * 4, h * 0.2, 0, TAU); g.fill();
    g.fillStyle = fig;
    for (const [fx, fw, fh] of [[0.02, 0.16, 0.34], [0.2, 0.12, 0.26], [0.7, 0.14, 0.3], [0.86, 0.13, 0.38]]) g.fillRect(x + w * fx, ground - h * fh, w * fw, h * fh);
    g.fillStyle = '#5a3a20'; g.fillRect(x, ground, w, y + h - ground);
    const close = shot % 3 === 1, d = close ? 0.18 : 0.32;
    for (const [k, fx] of [[-1, 0.5 - d], [1, 0.5 + d]]) {
      const px = x + w * fx, hh = close ? h * 0.5 : h * 0.3, top = ground + 2 - hh;
      g.fillStyle = fig; g.fillRect(px - hh * 0.09, top + hh * 0.2, hh * 0.18, hh * 0.8); g.beginPath(); g.arc(px, top + hh * 0.12, hh * 0.1, 0, TAU); g.fill();
      g.fillRect(px - hh * 0.2, top + hh * 0.04, hh * 0.4, hh * 0.04);   // (the hat's brim)
      if (u > 0.82 && (k < 0) === (shot % 2 === 0)) { g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(px - k * hh * 0.25, top + hh * 0.5, 3 + (u - 0.82) * 20, 0, TAU); g.fill(); light = [255, 246, 192]; }
    }
    const tw = x + ((t * 22) % (w + 20)) - 10, ty0 = ground + 6 - Math.abs(Math.sin(t * 4)) * 5;
    g.strokeStyle = '#a07040'; g.lineWidth = 1; g.beginPath(); g.arc(tw, ty0, 4, 0, TAU); g.arc(tw, ty0, 2, 1, 5); g.stroke();
    if (!(u > 0.82)) light = hexRGB(lit);
  } else if (f.kind === 'surf') {
    // a summer beach: the sun, the swell rolling in, a surfer riding the face; a beach party on the sand
    g.fillStyle = lit; g.beginPath(); g.arc(x + w * 0.8, y + h * 0.2, h * 0.12, 0, TAU); g.fill();
    const sea = y + h * 0.45;
    g.fillStyle = fig; g.fillRect(x, sea, w, h - (sea - y));
    if (shot % 3 !== 2) {
      const cx = x + w * (shot % 2 ? 1 - u : u), crest = sea + h * 0.08;
      g.fillStyle = '#2a6aa8'; g.beginPath(); g.moveTo(x, y + h); for (let wx = 0; wx <= w; wx += 4) g.lineTo(x + wx, crest + Math.sin(wx * 0.06 - t * 2) * 4 + (wx < cx - x ? 6 : 0)); g.lineTo(x + w, y + h); g.closePath(); g.fill();
      g.fillStyle = '#e8f4ff'; for (let wx = 0; wx <= w; wx += 3) g.fillRect(x + wx, crest + Math.sin(wx * 0.06 - t * 2) * 4 - 1, 2, 2);
      const by = crest + h * 0.12 + Math.sin(t * 3) * 2;
      g.fillStyle = acc; g.fillRect(cx - 9, by, 18, 3);                                            // (the board)
      g.fillStyle = '#3a2010'; g.fillRect(cx - 2, by - 13, 4, 10); g.beginPath(); g.arc(cx, by - 15, 3, 0, TAU); g.fill();
      g.fillRect(cx - 8, by - 11, 16, 2);                                                          // (arms out)
    } else {
      g.fillStyle = '#f0d890'; g.fillRect(x, y + h * 0.66, w, h * 0.34);
      g.fillStyle = acc; g.beginPath(); g.moveTo(x + w * 0.2, y + h * 0.5); g.lineTo(x + w * 0.36, y + h * 0.62); g.lineTo(x + w * 0.04, y + h * 0.62); g.closePath(); g.fill();
      g.fillStyle = '#5a3a20'; g.fillRect(x + w * 0.2 - 1, y + h * 0.5, 2, h * 0.3);
      for (let k = 0; k < 4; k++) { const dx = x + w * (0.48 + k * 0.12), jump = Math.abs(Math.sin(t * 5 + k)) * 5; g.fillStyle = [acc, '#3a2010', lit, '#e8e2d0'][k]; g.fillRect(dx - 2, y + h * 0.72 - jump, 5, 12); g.beginPath(); g.arc(dx + 0.5, y + h * 0.69 - jump, 3, 0, TAU); g.fill(); }
    }
    light = hexRGB(sky);
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
