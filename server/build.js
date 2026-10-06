// Which build this server is running: version.json (tools/stamp-version.mjs writes it on every commit; the
// version is a hash of every file the browser loads). Read at boot and checked again every few seconds:
// deploy/auto-update.sh pulls client-only changes without restarting the server, and players' pages still
// have to hear about those. Node only (the offline practice worker never imports this).
import { readFileSync, statSync } from 'node:fs';

// { v: version id, at: build time (epoch ms) } or null when the file is missing or unreadable
export function readBuild(file) {
  try {
    const m = JSON.parse(readFileSync(file, 'utf8'));
    return m && m.version ? { v: String(m.version), at: Date.parse(m.built) || 0 } : null;
  } catch { return null; }
}

// Looks at the file every everyMs (only reading it when its modification time or size changed) and calls
// onChange(build) when it holds a version other than the last one seen (starting from `known`, the version
// read at boot). A half-written file (git mid-checkout) is simply read again on the next look.
export function watchBuild(file, everyMs, onChange, known = null) {
  let sig = null, last = known;
  const look = () => {
    let st;
    try { st = statSync(file); } catch { return; }
    const s = `${st.mtimeMs}:${st.size}`;
    if (s === sig) return;
    const b = readBuild(file);
    if (!b) return;
    sig = s;
    if (b.v !== last) { last = b.v; onChange(b); }
  };
  look();
  return setInterval(look, everyMs).unref();
}
