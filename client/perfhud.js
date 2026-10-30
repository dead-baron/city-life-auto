// The performance readout (the debug menu's Performance section; perf work, 2026-10-26): a small panel at the top of the
// screen, twice a second, for reading off a phone screenshot - the frame rate and frame times, the page's own work a
// frame, how the art keeps up (chunks baking, waiting to go up, stand-ins on screen, bake and upload times, sprites
// being made), the canvases' sizes against the screen's, the graphics tier and the device. Loaded the first time it's
// switched on; remembered in this browser (main.js loads it at start while it's on).
import { gfx } from './gfx.js';

const KEY = 'cla.perfhud';
const TIER = ['Low', 'Medium', 'High', 'Ultra'];
const N = 240;
const ft = new Float32Array(N);
let n = 0, last = 0, el = null, on = false, timer = 0, raf = 0, longN = 0, longMs = 0, obs = null, S = null;

export const isOn = () => on;
// the p-th part of a list of frame times (ms)
export function pct(a, cnt, p) {
  const m = Math.min(cnt, a.length), s = Array.from(a.subarray ? a.subarray(0, m) : a.slice(0, m)).sort((x, y) => x - y);
  return m ? s[Math.min(m - 1, Math.floor(m * p))] : 0;
}
function sample(now) {
  if (!on) return;
  if (last && now - last < 250) ft[n++ % N] = now - last;
  last = now;
  raf = requestAnimationFrame(sample);
}
const f1 = (v) => (v || 0).toFixed(1), f0 = (v) => Math.round(v || 0);
function draw() {
  const lines = [], k = Math.min(n, N), p50 = pct(ft, k, 0.5), p95 = pct(ft, k, 0.95), fps = p50 ? 1000 / p50 : 0;
  const main = S.perf ? Object.values(S.perf).reduce((a, b) => a + b, 0) : 0;
  lines.push(`fps ${f0(fps)} · frame p50 ${f1(p50)} p95 ${f1(p95)} ms · page ${f1(main)} ms/frame · long tasks ${longN} (${f0(longMs)} ms)`);
  const w = S.art2;
  if (w && w.stats) {
    const s = w.stats(), t = s.t || {}, nn = s.n || {}, P = s.pool || {}, E = s.engine || {}, W = w.warmth ? w.warmth() : null;
    const up = nn.chunkUp ? (t.upSum || 0) / nn.chunkUp : 0;
    lines.push(`art ${TIER[s.q] || s.q} · workers ${P.workers || 0} · baking ${P.running || 0} queued ${P.queued || 0} · waiting up ${s.results} · on screen ${W ? `${W.scrHave}/${W.scr}` : '-'} (stand-ins ${W ? W.scr - W.scrHave : '-'})`);
    lines.push(`bake avg ${f0(t.bakeAvg)} ms · chunk upload avg ${f1(up)} max ${f1(t.upMax)} ms · kept ${nn.kept || 0} · server ${nn.cdn || 0} · art frame ${f1(t.frameMs)} ms · gpu ${f1(E.msGpuApprox)} ms (${E.timer || '?'})`);
    lines.push(`sprites: making ${s.sprOut} · to upload ${s.upQ} · person ${f1(w.est && w.est.ped)} ms · made here ${nn.sync || 0} · late ${s.late && s.late.of ? f1(100 * s.late.frames / s.late.of) : 0}% · slots ${E.slots || 0} · ${f0(E.gpuMB)} MB`);
    if (E.scene) lines.push(`scene ${E.scene[0]}x${E.scene[1]} world px`);
  } else lines.push(`art: ${S.art2Off ? `off (${S.art2Off})` : 'starting'}`);
  const wc = document.getElementById('world'), vc = document.getElementById('view'), dpr = window.devicePixelRatio || 1;
  lines.push(`canvas ${wc ? `${wc.width}x${wc.height}` : '-'} (overlay ${vc ? `${vc.width}x${vc.height}` : '-'}) for ${innerWidth}x${innerHeight} css @${f1(dpr)} = ${f0(innerWidth * dpr)}x${f0(innerHeight * dpr)} · render ${vc ? f1(vc.width / innerWidth) : '-'}x · ${gfx.preset}`);
  const L = window.CLA && window.CLA.load;
  lines.push(`device ${navigator.hardwareConcurrency || '?'} cores · ${navigator.deviceMemory || '?'} GB · ${L && L.at ? `in ${L.at.warm !== undefined ? f1(L.at.warm / 1000) : '-'} s (waited ${L.ms && L.ms.warm !== undefined ? f1(L.ms.warm / 1000) : '-'}${S.warmEnd ? `, ${S.warmEnd.why}` : ''}) · screen ${L.at.screen !== undefined ? f1(L.at.screen / 1000) : '-'} s` : ''}`);
  el.textContent = lines.join('\n');
}
export function show(s, yes = !on) {
  S = s; on = !!yes;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* blocked */ }
  if (!on) { if (el) el.remove(); el = null; clearInterval(timer); cancelAnimationFrame(raf); if (obs) obs.disconnect(); obs = null; return on; }
  if (!el) {
    el = document.createElement('pre'); el.id = 'perfhud';
    el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 40px);transform:translateX(-50%);z-index:40;margin:0;padding:4px 8px;max-width:calc(100vw - 16px);overflow:hidden;white-space:pre-wrap;background:rgba(8,10,16,.72);color:#e8f0c8;font:10px/1.35 ui-monospace,Menlo,monospace;border-radius:4px;pointer-events:none';
    document.body.appendChild(el);
  }
  n = 0; last = 0; longN = 0; longMs = 0;
  try { obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) { longN++; longMs += e.duration; } }); obs.observe({ type: 'longtask' }); } catch { obs = null; }
  raf = requestAnimationFrame(sample);
  clearInterval(timer); timer = setInterval(draw, 500);
  return on;
}
export const wanted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
