// A bank's vault door as this page sees it (loaded the first time you walk into a bank: main.js drawVault). On the back
// wall behind the counter (shared/heist.js vaultOf): a round steel door in its frame with the bank's brass plate - shut;
// with the thermal drill on it (its bit glowing, sparks, the ring of how far it's through; a jam: the red light and
// JAMMED); or swung open, the vault dark behind it with a few gold bars left on the shelves. The server decides it all
// (server/systems/heist.js) and says the state every few seconds ('vault' events: main.js S.vaults).
import { vaultOf, VAULT } from '../shared/heist.js';
import { HEIST } from '../shared/rules.js';

const STALE_MS = 10000, SWING_MS = 1300, TAU = Math.PI * 2;

export function draw(g, b, S) {
  const v = vaultOf(b);
  if (!v) return;
  const now = performance.now();
  let st = S.vaults && S.vaults.get(b.id);
  if (st && now - st.at > STALE_MS) { S.vaults.delete(b.id); st = null; }   // (not heard of in a while: shut)
  const up = v.dir > 0 ? -1 : 1;   // (the door's drawn up the wall from its foot)
  const x = v.x, fy = v.y + up * VAULT.up, cy = fy + up * VAULT.h / 2, W2 = VAULT.w / 2;   // (fy: the frame's foot, up the wall)
  g.save();
  // the frame and the brass plate over it
  g.fillStyle = '#2c3037'; g.fillRect(x - W2, Math.min(fy, fy + up * VAULT.h), VAULT.w, VAULT.h);
  g.fillStyle = '#4c535d'; g.fillRect(x - W2 + 2, Math.min(fy, fy + up * VAULT.h) + 2, VAULT.w - 4, VAULT.h - 4);
  g.fillStyle = '#c9a640'; g.fillRect(x - 6, fy + up * (VAULT.h - 1) - 1.5, 12, 3);
  const open = st && st.st === 'open';
  if (open) {
    // the dark vault, the shelves, what's left on them
    g.fillStyle = '#101216'; circle(g, x, cy, VAULT.r);
    g.fillStyle = '#2a2e35'; g.fillRect(x - 8, cy - 4, 16, 1.2); g.fillRect(x - 8, cy + 3, 16, 1.2);
    g.fillStyle = '#e8c34a'; g.fillRect(x - 6, cy - 6.5, 4, 2.2); g.fillRect(x + 2, cy + 0.6, 4, 2.2);
    g.fillStyle = 'rgba(255,240,170,.9)'; g.fillRect(x - 5.5, cy - 6.3, 1.2, 0.8);
    // the door swung out to the side (eased open over SWING_MS)
    const k = Math.min(1, (now - (st.op || 0)) / SWING_MS), e = 1 - (1 - k) * (1 - k);
    const dx = x - VAULT.r * 1.35 * e, rx = Math.max(2.5, VAULT.r * (1 - e * 0.78));
    g.fillStyle = '#9ea6b0'; g.beginPath(); g.ellipse(dx, cy, rx, VAULT.r, 0, 0, TAU); g.fill();
    g.strokeStyle = '#6c737d'; g.lineWidth = 1.5; g.stroke();
  } else door(g, x, cy);
  if (st && st.st === 'drill') {
    const k = Math.min(1, st.k + (st.j ? 0 : (now - st.at) / 1000 / HEIST.drillS));
    // the ring: how far through
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(x, cy, VAULT.r + 2.5, 0, TAU); g.stroke();
    g.strokeStyle = st.j ? '#ff4a3a' : '#ffd23a'; g.lineWidth = 2; g.beginPath(); g.arc(x, cy, VAULT.r + 2.5, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
    // the drill on its legs to the left of the door (where you stand to work it), the bit at the lock
    const bx = x - 3, dy = cy - up * 1;
    g.strokeStyle = '#1d2026'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 10, dy + 3); g.lineTo(x - 6, v.y - up * 4); g.moveTo(x - 13, dy + 3); g.lineTo(x - 17, v.y - up * 4); g.stroke();
    g.fillStyle = '#b8382a'; g.fillRect(x - 19, dy - 4, 12, 8);
    g.fillStyle = '#e25a3a'; g.fillRect(x - 19, dy - 4, 12, 2);
    g.fillStyle = '#d8dde2'; g.fillRect(x - 7, dy - 1, bx - (x - 7), 2);
    const blink = st.j && Math.floor(now / 300) % 2 === 0;
    g.fillStyle = st.j ? (blink ? '#ff3020' : '#5a1410') : '#3dff7a'; g.fillRect(x - 18, dy - 3, 2, 2);
    if (!st.j) {
      // the bit glowing white-hot, the sparks off it
      g.fillStyle = `rgba(255,${170 + Math.floor(Math.random() * 60)},70,.95)`; circle(g, bx, dy, 2.2);
      g.strokeStyle = 'rgba(255,214,120,.9)'; g.lineWidth = 0.8; g.beginPath();
      for (let i = 0; i < 5; i++) { const a = Math.PI * (0.1 + Math.random() * 0.8), r = 3 + Math.random() * 7; g.moveTo(bx, dy); g.lineTo(bx + Math.cos(a) * r, dy + Math.sin(a) * r); }
      g.stroke();
    } else {
      g.font = 'bold 6px sans-serif'; g.textAlign = 'center';
      g.fillStyle = blink ? '#ff5a4a' : '#ffd0c8'; g.fillText('JAMMED', x, Math.min(fy, fy + up * VAULT.h) - 3);
    }
  }
  g.restore();
}

// the shut door: the steel disc, its bolts, the wheel and its brass hub
function door(g, x, y) {
  const r = VAULT.r;
  g.fillStyle = '#7d858f'; circle(g, x, y, r);
  g.fillStyle = '#aab2bb'; circle(g, x, y, r - 1.5);
  g.fillStyle = '#5d646d';
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.fillRect(x + Math.cos(a) * (r - 3) - 0.7, y + Math.sin(a) * (r - 3) - 0.7, 1.4, 1.4); }
  g.fillStyle = '#c6ccd3'; circle(g, x, y, r - 5);
  g.strokeStyle = '#4a5058'; g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (r - 5.5), y + Math.sin(a) * (r - 5.5)); }
  g.stroke();
  g.fillStyle = '#d9b44a'; circle(g, x, y, 1.8);
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
