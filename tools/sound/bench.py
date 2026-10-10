#!/usr/bin/env python3
"""The sound bench, headless: serves the repository, opens tools/sound/bench.html in Chromium (Playwright) and runs
the real client/sound/ modules on an OfflineAudioContext (tools/sound/bench.js). Prints the report and writes it as
JSON.

  python3 tools/sound/bench.py [--out report.json] [--only scene,beds,songs,instruments,tyres] [--runs 2]
  python3 tools/sound/bench.py --live       the live path: client/audio.js started by a click, a few seconds of play
  python3 tools/sound/bench.py --levels     measure every instrument's own loudness (before its trim) and write
                                            client/sound/levels.js and test/fixtures/sound-levels.json
  python3 tools/sound/bench.py --render title --seconds 106 --wav title.wav
                                            a song as the game plays it (the real mixer, the default settings), to listen to

The numbers: render time against the scene's 30 s (the audio thread's work, on this machine: a phone is several
times slower), peak (dBFS) and A-weighted loudness (dBA below full scale) for the whole and each bus, how hard the
master's compressor works, and how many sounds were played, dropped (no voice, the rate limit, too far) or cut off.
"""
import argparse
import functools
import http.server
import json
import os
import sys
import threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import levels as LV  # noqa: E402  (the categories and their loudness targets)


def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='')
    ap.add_argument('--only', default='scene,beds,songs,instruments')
    ap.add_argument('--runs', type=int, default=2)
    ap.add_argument('--port', type=int, default=8113)
    ap.add_argument('--levels', action='store_true')
    ap.add_argument('--live', action='store_true', help='the live path: client/audio.js on a real AudioContext, started by a real click')
    ap.add_argument('--retrim', action='store_true', help='recompute the trims from the measurements already in test/fixtures/sound-levels.json')
    ap.add_argument('--render', default='', help='a song to render to --wav')
    ap.add_argument('--seconds', type=float, default=60)
    ap.add_argument('--wav', default='song.wav')
    a = ap.parse_args()
    if a.retrim:
        with open(os.path.join(ROOT, 'test', 'fixtures', 'sound-levels.json')) as f:
            got = json.load(f)['instruments']
        LV.write({n: {'max200': v['loud'], 'peak': v['peak']} for n, v in got.items()}, ROOT)
        return
    from playwright.sync_api import sync_playwright
    srv = serve(a.port)
    rep = {}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
            pg = b.new_page()
            pg.on('console', lambda m: print('[page]', m.text) if m.type in ('error', 'warning') else None)
            pg.on('pageerror', lambda e: print('[page error]', e))
            pg.goto(f'http://127.0.0.1:{a.port}/tools/sound/bench.html?debug')
            pg.wait_for_function('window.bench !== undefined', timeout=30000)
            only = set(a.only.split(','))
            if a.render:
                import base64
                import wave
                got = pg.evaluate(f"window.bench.renderSong({{ song: {json.dumps(a.render)}, seconds: {a.seconds} }})")
                with wave.open(a.wav, 'wb') as w:
                    w.setnchannels(2)
                    w.setsampwidth(2)
                    w.setframerate(got['sr'])
                    w.writeframes(base64.b64decode(got['b64']))
                print('wrote', a.wav)
                only = set()
            if a.live:
                print('before a tap:', pg.evaluate('window.bench.liveImport()'))
                pg.mouse.click(40, 40)
                live = pg.evaluate('window.bench.runLive()')
                for line in live['said']:
                    print('  ', line)
                print('   frames', live['frames'], 'shots', live['shots'], 'samples rendered:', live['samples'])
                rep['live'] = live
                only = set()
            if a.levels:
                raw = pg.evaluate('window.bench.runInstruments({ raw: true })', )
                LV.write(raw, ROOT)
                rep['instrumentsRaw'] = raw
                only = {'instruments'}
            if 'scene' in only:
                for mobile in (True, False):
                    runs, yards = [], []
                    for _ in range(a.runs):   # (the yardstick right before each run: the machine is shared, its speed varies)
                        yards.append(pg.evaluate('window.bench.runYardstick()')['wallMs'])
                        runs.append(pg.evaluate(f'window.bench.runScene({{ mobile: {str(mobile).lower()} }})'))
                    base = pg.evaluate('window.bench.runScene({ silent: true })')
                    for r, y in zip(runs, yards):
                        r['renderMs'] = r['wallMs'] - r['jsMs'] - (base['wallMs'] - base['jsMs'])
                        r['yardMs'] = y
                        r['yardsticks'] = round(r['renderMs'] / max(1, y), 2)
                    best = min(runs, key=lambda r: r['yardsticks'])
                    best['allWallMs'] = [r['wallMs'] for r in runs]
                    best['allYardsticks'] = [r['yardsticks'] for r in runs]
                    best['baselineWallMs'] = base['wallMs']
                    best['cpuPct'] = round(100 * best['renderMs'] / (best['seconds'] * 1000), 1)
                    rep['scene_' + ('phone' if mobile else 'computer')] = best
            if 'beds' in only:
                rep['beds'] = pg.evaluate('window.bench.runBeds()')
            if 'songs' in only:
                rep['songs'] = pg.evaluate('window.bench.runSongs()')
            if 'instruments' in only:
                rep['instruments'] = pg.evaluate('window.bench.runInstruments()')
            if 'tyres' in only:
                rep['tyres'] = pg.evaluate('window.bench.runTyres()')
            b.close()
    finally:
        srv.shutdown()
    report(rep)
    if a.out:
        with open(a.out, 'w') as f:
            json.dump(rep, f, indent=1)
        print('wrote', a.out)


def report(rep):
    for k in ('scene_phone', 'scene_computer'):
        s = rep.get(k)
        if not s:
            continue
        print(f"== {k}: render {s['renderMs']} ms for {s['seconds']} s = {s['cpuPct']}% of real time = {s['yardsticks']} yardsticks (yardstick {s['yardMs']} ms; runs {s['allYardsticks']}; wall {s['allWallMs']}, js {s['jsMs']} ms, baseline {s['baselineWallMs']} ms)")
        made = s['made']
        print('   nodes made:', sum(made.values()), {k2: v for k2, v in made.items()})
        for bus in ('whole', 'preComp', 'sfx', 'amb', 'mus'):
            m = s[bus]
            print(f"   {bus:8s} peak {m['peak']:6.1f} dBFS  rms {m['rmsA']:6.1f} dBA  loudest 400ms {m['max400']:6.1f}  p95 {m['p95']:6.1f}  p50 {m['p50']:6.1f}")
        c = s['comp']
        print(f"   compressor: make-up {c['makeupDb']} dB (fixed gain after it {c.get('postDb', 0)} dB); reduction max {c['maxReduction']} dB, >3 dB in {c['over3dB']}% of the 20 ms blocks with sound, >6 dB in {c['over6dB']}%")
        pl = s['plays']
        print(f"   plays: {pl['calls']} asked, {pl['played']} played; dropped: {pl['pool']} no voice, {pl['gap']} rate limit, {pl.get('budget', 0)} over the background's budget, {pl['far']} too far; cut off: {pl['stolen']} ({pl['stolenMine']} of yours)")
        top = sorted(pl['stolenFrom'].items(), key=lambda kv: -kv[1])[:8]
        print('   cut off:', top)
        top = sorted(pl['droppedBy'].items(), key=lambda kv: -kv[1])[:10]
        print('   dropped:', top)
        print('   by priority:', pl['byPri'])
        e = s['events']
        print(f"   events: {e['n']}, heard {e['heard']}, silent {e['silent']} {e['silentKinds']}")
    if rep.get('beds'):
        print('== beds at gain 1 (dBA rms):', {k: v['rmsA'] for k, v in rep['beds'].items()})
    if rep.get('tyres'):
        print('== your car, the effects bus (dBA rms; loudest 400 ms):', {k: (v['rmsA'], v['max400']) for k, v in rep['tyres'].items()})
    if rep.get('songs'):
        for k, v in rep['songs'].items():
            print(f"== song {k}: rms {v['rmsA']} dBA, peak {v['peak']}, loudest 400ms {v['max400']}, {v['nodesPerSec']} nodes/s, {v['wallMs']} ms")
    if rep.get('instruments'):
        rows = rep['instruments']
        cats = {}
        for n, v in rows.items():
            cats.setdefault(LV.category(n), []).append((n, v))
        for c, lst in cats.items():
            lst.sort(key=lambda x: -x[1]['max200'])
            lo, hi = LV.RANGE[c]
            print(f"== {c} (target {lo}..{hi} dBA, loudest 200 ms):")
            print('   ' + ', '.join(f"{n} {v['max200']}/{v['peak']}" + ('' if lo <= v['max200'] <= hi else '!') for n, v in lst))


if __name__ == '__main__':
    main()
