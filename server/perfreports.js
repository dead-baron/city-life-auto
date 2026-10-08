// How players' devices load and run the game. Every page sends one report (client/main.js perfReport) twenty seconds
// after its screen was first fully drawn: what the device is, the graphics preset, the load timeline (the code, the
// server's welcome, the city - built or read back -, the renderer and its bake workers, the first art, the whole
// screen), the frame rate and the sharpness it settled on. The latest are kept in memory (nothing personal: no name,
// no address) and listed, newest first, at /perf - so how phones and tablets out there do can be read off one page
// (the user's ask, 2026-10-07: "make sure everything is optimizing across all devices").
const MAX = 60;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0; };
const str = (v, n) => (typeof v === 'string' ? v.replace(/[^\x20-\x7e]/g, '').slice(0, n) : '');
const KEYS = /^[a-z]{1,12}$/;
const times = (o) => {
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o).slice(0, 24)) if (KEYS.test(k)) out[k] = Math.round(num(v, 0, 3.6e6));
  return out;
};

// a report as the page sent it, cleaned up; null when it isn't one
export function cleanReport(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    kind: str(r.kind, 12), gpu: str(r.gpu, 80), ua: str(r.ua, 160), cores: num(r.cores, 0, 256) | 0, mem: num(r.mem, 0, 64),
    preset: str(r.preset, 10), w: num(r.w, 0, 10000) | 0, h: num(r.h, 0, 10000) | 0, dpr: +num(r.dpr, 0, 8).toFixed(2), scale: +num(r.scale, 0, 1).toFixed(2), steps: num(r.steps, 0, 99) | 0,
    at: times(r.at), ms: times(r.ms), city: str(r.city, 8), fps: num(r.fps, 0, 300) | 0, p50: +num(r.p50, 0, 1000).toFixed(1), p95: +num(r.p95, 0, 1000).toFixed(1),
    bake: num(r.bake, 0, 60000) | 0, kept: num(r.kept, 0, 99999) | 0, workers: num(r.workers, 0, 16) | 0,
    // the second report, four minutes into play: how well the art kept up (main.js perfReport)
    ...(r.stage === 'play' ? { stage: 'play', late: +num(r.late, 0, 100).toFixed(1), lateMove: +num(r.lateMove, 0, 100).toFixed(1), lateMax: +num(r.lateMax, 0, 3600).toFixed(1), moving: num(r.moving, 0, 100) | 0, ahead: num(r.ahead, 0, 99999) | 0 } : null),
  };
}

// "Android 14 Pixel 7 Pro" / "iPhone · iOS 17.4" / "Windows NT 10.0", and the browser
export function deviceName(r) {
  const ua = r.ua || '';
  const m = ua.match(/\(([^)]*)\)/);
  const parts = m ? m[1].split(';').map((x) => x.trim()).filter((x) => x && !/^(Linux|U|K|wv|Mobile|X11)$/.test(x)) : [];
  const ios = ua.match(/(iPhone|iPad|iPod).*? OS (\d+[_\d]*)/);
  const os = ios ? `${ios[1]} · iOS ${ios[2].replace(/_/g, '.')}` : parts.slice(0, 2).join(' ').replace(/^Macintosh Intel Mac OS X/, 'Mac').replace(/_/g, '.');
  const pick = (re, name) => { const v = ua.match(re); return v ? `${name} ${v[1]}` : null; };
  const br = pick(/Edg\/(\d+)/, 'Edge') || pick(/CriOS\/(\d+)/, 'Chrome (iOS)') || pick(/FxiOS\/(\d+)/, 'Firefox (iOS)') || pick(/Firefox\/(\d+)/, 'Firefox')
    || pick(/SamsungBrowser\/(\d+)/, 'Samsung Internet') || pick(/Chrome\/(\d+)/, 'Chrome') || pick(/Version\/(\d+[.\d]*).*Safari/, 'Safari') || 'a browser';
  return `${os || r.kind || 'a device'} · ${br}`;
}

const s1 = (ms) => (ms === undefined ? '-' : (ms / 1000).toFixed(1));
export function reportLine(r) {
  const a = r.at || {};
  if (r.stage === 'play') return [
    `${deviceName(r)} · ${r.cores || '?'} cores${r.mem ? ` · ${r.mem} GB` : ''} · ${r.preset} · ${r.w}x${r.h}@${r.dpr}${r.gpu ? ` · ${r.gpu}` : ''} · four minutes in`,
    `   art on screen not ready yet: ${r.late}% of frames (${r.lateMove}% on the move; moving ${r.moving}% of the time), longest ${r.lateMax} s`,
    `   frames: ${r.fps} fps, ${r.p50} ms typical, ${r.p95} ms slow (95th) · sharpness ${Math.round(r.scale * 100)}% · bakes ${r.bake} ms avg on ${r.workers} worker${r.workers === 1 ? '' : 's'} · ${r.kept} chunks from the browser's store · ${r.ahead} baked ahead`,
  ].join('\n');
  const city = r.city === 'cache' ? 'read back' : r.city === 'built' ? 'built in a worker' : r.city === 'page' ? 'built on the page' : '';
  return [
    `${deviceName(r)} · ${r.cores || '?'} cores${r.mem ? ` · ${r.mem} GB` : ''} · ${r.preset} · ${r.w}x${r.h}@${r.dpr}${r.gpu ? ` · ${r.gpu}` : ''}`,
    `   whole screen drawn at ${s1(a.screen)} s: code ${s1(a.code)} · welcome ${s1(a.welcome)} · city ${s1(a.city)}${city ? ` (${city}${r.ms && r.ms.city ? `, ${s1(r.ms.city)} s` : ''})` : ''} · renderer ${s1(a.renderer)} · workers ${s1(a.workers)} · first art ${s1(a.art)}`,
    `   frames: ${r.fps} fps, ${r.p50} ms typical, ${r.p95} ms slow (95th) · sharpness ${Math.round(r.scale * 100)}%${r.steps ? ` (${r.steps} step${r.steps > 1 ? 's' : ''} down)` : ''} · bakes ${r.bake} ms avg on ${r.workers} worker${r.workers === 1 ? '' : 's'} · ${r.kept} chunks from the browser's store`,
  ].join('\n');
}

export function addReport(world, r) {
  const c = cleanReport(r);
  if (!c) return null;
  c.when = Date.now();
  (world.perfReports ||= []).unshift(c);
  if (world.perfReports.length > MAX) world.perfReports.length = MAX;
  if (c.stage === 'play') console.log(`[perf] ${deviceName(c)} · ${c.preset} · four minutes in: stand-ins on screen ${c.late}% of frames (${c.lateMove}% moving), longest ${c.lateMax} s · bakes ${c.bake} ms · ${c.ahead} baked ahead`);
  else console.log(`[perf] ${deviceName(c)} · ${c.preset} · screen ${s1(c.at.screen)} s · city ${c.city} ${s1(c.ms.city)} s · ${c.fps} fps p95 ${c.p95} ms · sharpness ${Math.round(c.scale * 100)}%`);
  return c;
}

export function reportsText(world) {
  const list = world.perfReports || [];
  const head = `City Life Auto - how devices loaded and ran the game, newest first (the last ${MAX} since the server started; ${list.length} so far)\n`;
  return head + '\n' + list.map((r) => `${new Date(r.when).toISOString().slice(0, 16).replace('T', ' ')} UTC  ${reportLine(r)}`).join('\n\n') + '\n';
}
