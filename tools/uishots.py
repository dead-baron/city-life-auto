#!/usr/bin/env python3
"""tools/uishots.py - the UI pass's pictures: every screen of the real game at four sizes (pre-beta item 7).

The owner's plan, 11-23: "the UI screen pass at four sizes". The game played as tools/playtest.py plays it (a local dev
server, headless Chromium), the first-time arrival skipped, then each screen opened the way a player opens it (the hub's
tabs: window.CLA.hub, the same function the HUD's buttons call) and shot, with an audit of what's on it:

  sizes   desk 1440x900 (mouse and keyboard), laptop 1280x720, land 844x390 and port 390x844 (a phone, touch)
  screens looks (the starting looks), hud, pause, settings, map, phone, phone-jobs, phone-transit, phone-skills, phone-guide, bag, people, death
  audit   per shot (<size>-<screen>.json), of what a player can press (on top at its middle; buttons, links, anything with
          a pointer): under 44 px (touch) or 24 px (desk); a corner (22% in: a round button's too) covered or off the screen (offscreen: the mask's
          bars, a panel past the bottom, another button over it); one over another; text cut off (past its own box or a
          box that hides what overflows it, with no scrolling); and the fonts in use

  flock /tmp/heavy.lock python3 tools/uishots.py OUTDIR [--sizes land,port] [--screens map,phone]

Heavy (a server and a browser): one run at a time, under the heavy lock. The shots are DPR 1 (sizes and positions
exact, text softer than on a phone). Compare runs with each other; the owner's concepts are in docs/art-v2/targets/ui.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = {'desk': ('1440x900', False), 'laptop': ('1280x720', False), 'land': ('844x390', True), 'port': ('390x844', True)}
APPS = ['jobs', 'transit', 'skills', 'guide']

# the audit, run in the page for each shot: what a player can press that's too small, what's cut off, what overlaps
AUDIT = r"""
const touch = matchMedia('(pointer: coarse)').matches, MIN = touch ? 44 : 24, out = { small: [], clipped: [], overlap: [], fonts: {} };
const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
const top = (e) => { const r = e.getBoundingClientRect(), x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h) || h.contains(e)); };
const clipBox = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return a; } return null; };
const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (e.textContent ? ' "' + e.textContent.trim().slice(0, 24) + '"' : '');
const hits = [...new Set([...document.querySelectorAll('button, a, [role=button], input, select, .btn, [onclick], [data-act], [data-opt]'), ...[...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).cursor === 'pointer' && !(e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer'))])].filter((e) => vis(e) && top(e));   /* (what a player can reach: on top at its middle) */
out.offscreen = [];
for (const e of hits) {
  const r = e.getBoundingClientRect();
  if (r.width < MIN || r.height < MIN) out.small.push([name(e), Math.round(r.width), Math.round(r.height)]);
  /* partly off the screen, or under the screen's own frame (the 16:9 mask's bars): a corner not its own */
  const ix = Math.max(3, r.width * 0.22), iy = Math.max(3, r.height * 0.22), k = [[r.left + ix, r.top + iy], [r.right - ix, r.top + iy], [r.left + ix, r.bottom - iy], [r.right - ix, r.bottom - iy]].filter(([x, y]) => { if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true; const h = document.elementFromPoint(x, y); return !h || !(h === e || e.contains(h) || h.contains(e)); }).length;
  if (k) out.offscreen.push([name(e), k]);
}
for (const e of document.querySelectorAll('body *')) {
  if (!vis(e) || !e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
  const s = getComputedStyle(e);
  out.fonts[s.fontFamily.split(',')[0].replace(/["']/g, '')] = (out.fonts[s.fontFamily.split(',')[0].replace(/["']/g, '')] || 0) + 1;
  if (!top(e)) continue;
  if ((e.scrollWidth > e.clientWidth + 2 && s.overflowX !== 'auto' && s.overflowX !== 'scroll') && e.clientWidth > 0) { out.clipped.push([name(e), e.clientWidth, e.scrollWidth]); continue; }
  /* its text running past a box that hides what overflows it (a card, a row): cut off where the player can't scroll to it */
  const a = clipBox(e), rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect();
  if (a && getComputedStyle(a).overflowX !== 'auto' && getComputedStyle(a).overflowX !== 'scroll') { const b = a.getBoundingClientRect(); if (r.left < b.left - 1 || r.right > b.right + 1) out.clipped.push([name(e), Math.round(b.width), Math.round(r.width)]); }
}
for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
  const a = hits[i].getBoundingClientRect(), b = hits[j].getBoundingClientRect();
  if (hits[i].contains(hits[j]) || hits[j].contains(hits[i])) continue;
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (ox > 4 && oy > 4) out.overlap.push([name(hits[i]), name(hits[j]), Math.round(ox), Math.round(oy)]);
}
out.n = { small: out.small.length, clipped: out.clipped.length, overlap: out.overlap.length, covered: out.offscreen.length }; out.offscreen = out.offscreen.slice(0, 20);
out.small = out.small.slice(0, 25); out.clipped = out.clipped.slice(0, 15); out.overlap = out.overlap.slice(0, 15);
return out;
"""


def steps_for(size, screens, outdir):
    shot = lambda n: [f'shot:{os.path.join(outdir, f"{size}-{n}.png")}', 'eval:' + AUDIT.replace('\n', ' ')]
    st = [
        # past the first-time arrival: the station card, the arrival, the question (server/systems/ftue.js handle)
        # (a new character: the starting looks first - shot, then the first one played)
        'eval:return new Promise((r) => { let n = 0; const t = setInterval(() => { if (document.querySelector("[data-act=play-as]") || ++n > 80) { clearInterval(t); r(n <= 80); } }, 250); })',
        'wait:800',
        *(shot('looks') if (not screens or 'looks' in screens) else []),
        'eval:const b = document.querySelector("[data-act=play-as]"); if (b) b.click(); return !!b', 'wait:2500',
        # (the page's own Skip while its arrival plays - the server's skip alone leaves the page's scene running)
        'eval:for (let i = 0; i < 8; i++) setTimeout(() => { const k = document.getElementById("arr-skip"); if (k && k.offsetParent) k.click(); else CLA.send({ t: "intro", a: "skip" }); }, i * 1500); return 1',
        'wait:13000', 'eval:const c = document.getElementById("m-close"); if (c && c.offsetParent) c.click(); return !!c', 'wait:1500',   # (the question's menu, if it's still up: closed - skipped; a tap, not a key: touch stays touch) 'time:720', 'wait:2500',
    ]
    want = lambda n: not screens or n in screens
    if want('hud'): st += shot('hud')
    for tab in ['pause', 'settings', 'map', 'phone', 'bag', 'people']:
        if not want(tab) and not (tab == 'phone' and any(want('phone-' + a) for a in APPS)): continue
        st += [f'eval:CLA.hub("{tab}"); return 1', 'wait:700', f'eval:CLA.hub("{tab}"); return 1', 'wait:' + (os.environ.get('UISHOT_WAIT', '3000') if tab in ('bag', 'map') else '900')]   # (twice: the first can land while a card is closing)   # (the Inventory loads the first time it opens: client/bag.js)
        if want(tab): st += shot(tab)
        if tab == 'phone':
            for a in APPS:
                if want('phone-' + a): st += [f'eval:CLA.hub("phone", "{a}"); return 1', 'wait:900'] + shot('phone-' + a)
        st += ['eval:CLA.unhub(); return 1', 'wait:500']
    if want('death'): st += ['dev:die', 'wait:1800'] + shot('death')
    return st


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('--'):
        print(__doc__); sys.exit(1)
    outdir = os.path.abspath(args[0]); os.makedirs(outdir, exist_ok=True)
    opt = lambda k: args[args.index(k) + 1].split(',') if k in args else None
    sizes, screens = opt('--sizes') or list(SIZES), opt('--screens')
    for size in sizes:
        vp, mobile = SIZES[size]
        cmd = [sys.executable, os.path.join(HERE, 'playtest.py'), '--start-server', '--game-port', '8131', '--port', '8132', '--vp', vp, '--quiet', '--timeout', '240']
        if mobile: cmd.append('--mobile')
        cmd += steps_for(size, screens, outdir)
        print(f'[uishots] {size} {vp}', flush=True)
        # (the page from the static server, the game at its own port: the game lets that page's origin in)
        env = dict(os.environ, CLA_PAGE_ORIGINS='http://127.0.0.1:8132,http://localhost:8132')
        r = subprocess.run(cmd, capture_output=True, text=True, env=env)
        log = r.stdout + r.stderr
        open(os.path.join(outdir, f'{size}.log'), 'w').write(log)
        # each audit's printed result, beside its shot
        names = [s.split(':', 1)[1] for s in cmd if s.startswith('shot:')]
        # (playtest prints each eval '[eval] <its first 55 chars> => <the result as JSON, at most 4000 chars>')
        res = [l.split('=> ', 1)[1] for l in log.splitlines() if l.startswith('[eval]') and '"small"' in l]
        for n, j in zip(names, res):
            open(n[:-4] + '.json', 'w').write(j)
        print(f'[uishots] {size}: {len(res)} of {len(names)} audited; errors: {log.count("pageerror")}', flush=True)


if __name__ == '__main__':
    main()
