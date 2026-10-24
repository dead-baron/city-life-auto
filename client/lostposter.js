// Lost pets on the page (server/systems/pets.js targetFor; client/main.js drawEventArrows loads this the first time one
// is near): the posters drawn as props where they're put up - on a pole, a noticeboard or a wall over the pavement - and
// the area a pet you've read about was last seen in, a dashed circle on the ground. World px, over the city.
//   poster  { x, y, w: 'dog' | 'puppy' | 'cat', a: its art ('dog_golden'...) }: a sheet up the pole, a red LOST band, the
//           pet's picture in its colours, the tear-off tabs; fluttering a little
//   petarea { x, y, r }
const FUR = { dog_golden: '#d9a441', dog_black: '#2b2b30', dog_spaniel: '#8a5a34', dog_pup: '#e8d6b0', cat_black: '#232326', cat_grey: '#8d9096', cat_ginger: '#e07a2c' };
const PAPER = '#f2ead2', EDGE = '#4a4234', RED = '#c8343a';

export function mark(g, ev, kind, z, now) {
  if (ev.k === 'poster') { poster(g, ev, z, now); return; }
  g.save();
  g.globalAlpha = 0.2 + 0.08 * Math.sin(now * 3);
  g.fillStyle = kind.color; g.beginPath(); g.arc(ev.x, ev.y, ev.r, 0, 6.28); g.globalAlpha *= 0.35; g.fill();
  g.globalAlpha = 0.5; g.strokeStyle = kind.color; g.lineWidth = 4 / z; g.setLineDash([12 / z, 10 / z]); g.stroke(); g.setLineDash([]);
  g.restore();
}

function poster(g, ev, z, now) {
  const W = 14, H = 18, up = 30;   // (its size; how far up the pole - px of screen above its foot)
  const fl = Math.sin(now * 2.1 + ev.x * 0.01) * 0.05;   // (the paper stirring)
  g.save();
  g.translate(ev.x, ev.y - up);
  g.rotate(fl);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-W / 2 + 1, -H / 2 + 1.5, W, H);   // (its shadow on the pole)
  g.fillStyle = PAPER; g.strokeStyle = EDGE; g.lineWidth = Math.max(0.5, 1 / z);
  g.fillRect(-W / 2, -H / 2, W, H); g.strokeRect(-W / 2, -H / 2, W, H);
  g.fillStyle = RED; g.fillRect(-W / 2 + 1, -H / 2 + 1, W - 2, 3.5);   // the LOST band, its letters a row of white
  g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) g.fillRect(-4.5 + i * 2.6, -H / 2 + 2, 1.6, 1.5);
  // the picture: the pet in its colours
  const fur = FUR[ev.a] || '#b08a5a', cat = ev.w === 'cat';
  g.fillStyle = '#d9cfb4'; g.fillRect(-W / 2 + 2, -H / 2 + 5.5, W - 4, 7);
  g.fillStyle = fur;
  g.beginPath(); g.ellipse(-0.5, -H / 2 + 10, 3.4, 1.9, 0, 0, 6.28); g.fill();   // body
  g.beginPath(); g.arc(3, -H / 2 + 8.2, 1.8, 0, 6.28); g.fill();                 // head
  g.beginPath();
  if (cat) { g.moveTo(1.8, -H / 2 + 7.4); g.lineTo(2.2, -H / 2 + 5.8); g.lineTo(3, -H / 2 + 7); g.moveTo(3.2, -H / 2 + 7); g.lineTo(4, -H / 2 + 5.8); g.lineTo(4.4, -H / 2 + 7.4); }
  else g.ellipse(1.6, -H / 2 + 8.6, 0.8, 1.4, 0.3, 0, 6.28);                       // (a cat's pointed ears, a dog's floppy one)
  g.fill();
  g.fillRect(-4.2, -H / 2 + 10.5, 0.9, 1.6); g.fillRect(1.6, -H / 2 + 10.5, 0.9, 1.6);   // legs
  g.strokeStyle = fur; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-3.8, -H / 2 + 9.6); g.lineTo(-5.2, cat ? -H / 2 + 7.2 : -H / 2 + 8.6); g.stroke();   // tail
  // the writing and the tear-off tabs with the number
  g.fillStyle = '#7a7060'; g.fillRect(-W / 2 + 2, H / 2 - 5, W - 4, 0.8);
  g.strokeStyle = '#9a917e'; g.lineWidth = 0.5; g.beginPath();
  for (let i = 1; i < 5; i++) { const x = -W / 2 + i * W / 5; g.moveTo(x, H / 2 - 3.2); g.lineTo(x, H / 2); }
  g.stroke();
  g.fillStyle = '#b9b3a2'; g.fillRect(-1, -H / 2 - 1.2, 2, 2);   // (the tape at the top)
  g.restore();
}
