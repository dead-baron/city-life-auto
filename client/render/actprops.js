// People going about their lives (task #423, server/systems/activities.js), in the classic view: what they have by them
// - the descriptor's pp (the painter's easel, the angler's cooler, the chess board, the car washer's sponge and bucket,
// the picker's crate, the hunter's slung rifle, the neighbours' garden fence, a pool cue stood up) and the pool player's
// cue (gt 'cue'). Loaded with the first person at an activity (main.js drawUpright), not with the page. The poses: sat,
// kneeling and bent over the table are drawn low there, like a kneel.
// Drawn in world px after the figure, on the ground plane (y down) with heights lifted up the screen.

const at = (p, fwd, side, z) => { const c = Math.cos(p.ra), s = Math.sin(p.ra); return [p.rx + c * fwd - s * side, p.ry + 6 + s * fwd + c * side - z]; };
function box(g, x, y, w, h, top, side) { g.fillStyle = side; g.fillRect(x - w / 2, y - h, w, h); g.fillStyle = top; g.fillRect(x - w / 2, y - h, w, Math.max(1, h * 0.3)); }
function line(g, a, b, c, w) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }

const PROPS = {
  easel(g, p) {   // three legs, the canvas on its ledge (sky over grass), facing the painter
    const f = at(p, 15, 0, 0), t = at(p, 17, 0, 34);
    for (const s of [-5, 5]) line(g, at(p, 14, s, 0), t, '#8a5a2a', 1.2);
    line(g, at(p, 22, 0, 0), t, '#8a5a2a', 1.2);
    g.fillStyle = '#efe7d2'; g.fillRect(f[0] - 7, f[1] - 33, 14, 11);
    g.fillStyle = '#86b8e4'; g.fillRect(f[0] - 6, f[1] - 32, 12, 5);
    g.fillStyle = '#6a9a52'; g.fillRect(f[0] - 6, f[1] - 27, 12, 4);
    g.fillStyle = '#8a5a2a'; g.fillRect(f[0] - 8, f[1] - 22, 16, 1.5);
  },
  cooler(g, p) { const c = at(p, -1, -11, 0); box(g, c[0], c[1], 9, 7, '#f0f0ec', '#2f68c8'); },
  chess(g, p) {   // the board on the table between the players, a few pieces
    const c = at(p, 15, 0, 18);
    g.fillStyle = '#5a3a22'; g.fillRect(c[0] - 6, c[1] - 5, 12, 10);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = (i + j) & 1 ? '#3a2a20' : '#efe2c4'; g.fillRect(c[0] - 5 + i * 2.5, c[1] - 4 + j * 2, 2.5, 2); }
    g.fillStyle = '#f4efe4'; g.fillRect(c[0] - 3, c[1] - 6, 1.5, 2.5); g.fillStyle = '#1e1e22'; g.fillRect(c[0] + 2, c[1] - 6, 1.5, 2.5);
  },
  sponge(g, p, now) {   // the sponge going round on the car's side, the bucket of suds at their feet
    const h = at(p, 9 + Math.sin(now * 3 + p.id) * 1.5, Math.cos(now * 3 + p.id) * 2, 18);
    g.fillStyle = '#f2d23a'; g.fillRect(h[0] - 2, h[1] - 1.5, 4, 3);
    const b = at(p, -1, -10, 0); box(g, b[0], b[1], 8, 8, '#f4f6fa', '#3a7ad0');
  },
  crate(g, p) {
    const c = at(p, 4, -10, 0); box(g, c[0], c[1], 10, 7, '#a8743c', '#8a5a2c');
    g.fillStyle = '#d8382a'; for (const [x, y] of [[-3, -7], [0, -8], [3, -7]]) g.fillRect(c[0] + x - 1, c[1] + y - 1, 2.5, 2.5);
  },
  rifle(g, p) { line(g, at(p, -4, -5, 18), at(p, -4, 5, 42), '#3a2a1c', 2); line(g, at(p, -4, 3, 38), at(p, -4, 6, 46), '#1c1c22', 1.2); },
  fence(g, p) {   // a short run of white garden fence between the neighbours, square to them
    const L = at(p, 11, -14, 0), R = at(p, 11, 14, 0);
    for (let k = 0; k <= 8; k++) { const u = k / 8, x = L[0] + (R[0] - L[0]) * u, y = L[1] + (R[1] - L[1]) * u; line(g, [x, y], [x, y - (k % 8 ? 20 : 23)], k % 8 ? '#f2efe6' : '#d8d2c2', k % 8 ? 2 : 2.6); }
    for (const z of [7, 17]) line(g, [L[0], L[1] - z], [R[0], R[1] - z], '#d8d2c2', 1.4);
  },
  cueup(g, p) { const b = at(p, 2, 7, 0); line(g, b, [b[0] + 1, b[1] - 46], '#c08a4a', 1.4); g.fillStyle = '#3a6ad0'; g.fillRect(b[0], b[1] - 48, 2, 2); },
};
// gt 'cue': bent over the table, the cue from behind the drawing hand out over the felt toward the cue ball
function cue(g, p, now) {
  const k = [0, -2, -3.5, 1.5][Math.floor(now * 4 + p.id) & 3], a = at(p, -6 + k, 3, 15), b = at(p, 24 + k, 1, 13);
  line(g, a, b, '#c08a4a', 1.5); g.fillStyle = '#3a6ad0'; g.fillRect(b[0] - 1, b[1] - 1, 2, 2);
}

export function draw(g, p, now) {
  const d = p.d, f = PROPS[d.pp];
  if (f) f(g, p, now);
  if (d.gt === 'cue') cue(g, p, now);
}
