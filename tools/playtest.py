#!/usr/bin/env python3
"""tools/playtest.py - headless playtest harness for City Life Auto.

Starts what is missing (a static server for the repo, optionally the local game server), opens the
game in headless Chromium (SwiftShader WebGL), gets past the title / graphics / tutorial prompts,
then runs STEPS in order and reports page errors.

  python3 tools/playtest.py [options] STEP [STEP ...]

Options
  --params 'art=2&diag'   extra URL params (debug is always added so window.__S exists)
  --vp 1280x720           viewport in CSS px
  --dpr 1                 device scale factor
  --preset high           graphics preset stored before the page loads (low|medium|high|ultra)
  --server URL            game server websocket (default ws://127.0.0.1:GAME_PORT/ws); 'practice' plays offline
  --start-server          start a local dev game server on GAME_PORT if none is up, stop it at the end
  --game-port 8080        the game server's port (use your own when several runs share the machine)
  --port 8097             static server port (started if not listening; left running if it was)
  --xbox                  Edge on Xbox as a desktop page (Windows UA, pad-only coarse pointer)
  --mobile                touch + phone user agent
  --timeout 120           seconds to wait for the city
  --quiet                 only print errors and step output
Steps
  wait:MS                 let the game run
  shot:PATH               full-page screenshot (PNG)
  key:KEY[:MS]            press a key, or hold it MS milliseconds (Playwright key names: w, a, s, d, ArrowUp, Shift...)
  keys:K1+K2[:MS]         hold several keys together
  click:SELECTOR          click an element
  dev:CMD[:JSON]          dev command to the server (CLA_DEV=1), e.g. dev:car:{"m":"sports"}
  time:MIN                set the server clock (minutes after midnight, e.g. 720 noon, 1380 night)
  tp:X,Y[,LZ]             teleport the player (world px; LZ 1 = up on the highway deck)
  eval:JS                 evaluate JS (expression or function body with return) and print the result
  waitfor:JS[:MS]         wait until JS is truthy (default 30 s)
  perf:MS                 sample frame times for MS and print avg / p95 / worst ms
Examples
  python3 tools/playtest.py --start-server --vp 844x390 time:720 tp:21000,19000 wait:3000 shot:a.png
  python3 tools/playtest.py key:d:1500 shot:b.png eval:"__S.art2&&__S.art2.stats()"
"""
import argparse, json, os, socket, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)  # the checkout this script lives in (works from a worktree too)


def listening(port):
    try:
        socket.create_connection(('127.0.0.1', port), 0.5).close()
        return True
    except OSError:
        return False


def main():
    ap = argparse.ArgumentParser(add_help=True, formatter_class=argparse.RawDescriptionHelpFormatter, description=__doc__)
    ap.add_argument('--params', default='')
    ap.add_argument('--vp', default='1280x720')
    ap.add_argument('--dpr', type=float, default=1)
    ap.add_argument('--preset', default='high')
    ap.add_argument('--server', default='')
    ap.add_argument('--game-port', type=int, default=8080)
    ap.add_argument('--start-server', action='store_true')
    ap.add_argument('--port', type=int, default=8097)
    ap.add_argument('--mobile', action='store_true')
    ap.add_argument('--ua', default='')
    ap.add_argument('--xbox', action='store_true')
    ap.add_argument('--timeout', type=int, default=120)
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('steps', nargs='*')
    a = ap.parse_args()
    if not a.server: a.server = f'ws://127.0.0.1:{a.game_port}/ws'
    GP = a.game_port
    say = (lambda *x: None) if a.quiet else (lambda *x: print('[playtest]', *x, flush=True))

    procs = []
    if not listening(a.port):
        say('starting static server on', a.port)
        procs.append(subprocess.Popen(['python3', '-m', 'http.server', str(a.port)], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True))
        time.sleep(1.0)
    started_game = None
    if a.server != 'practice' and a.start_server and not listening(GP):
        say(f'starting game server on {GP} (dev)')
        env = dict(os.environ, CLA_DEV='1', PORT=str(GP), HOST='127.0.0.1', CLA_DATA_DIR=os.path.join(REPO, '.playtest-data', str(GP)))
        os.makedirs(env['CLA_DATA_DIR'], exist_ok=True)
        log = open(os.path.join(env['CLA_DATA_DIR'], 'server.log'), 'w')
        started_game = subprocess.Popen(['nice', '-n', '10', 'node', 'server/index.js'], cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(240):
            if listening(GP): break
            if started_game.poll() is not None: print('game server exited; see', os.path.join(env['CLA_DATA_DIR'], 'server.log')); sys.exit(1)
            time.sleep(0.5)
        say('game server up')

    from playwright.sync_api import sync_playwright
    W, H = [int(v) for v in a.vp.lower().split('x')]
    q = 'debug' + ('&' + a.params if a.params else '')
    if a.server != 'practice': q += '&server=' + a.server
    url = f'http://127.0.0.1:{a.port}/index.html?{q}'
    errors, logs = [], []
    rc = 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx_opts = dict(viewport={'width': W, 'height': H}, device_scale_factor=a.dpr)
        if a.mobile:
            ctx_opts.update(is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36')
        if a.xbox:  # Edge on Xbox as a desktop page: a Windows UA (no Xbox token), the pad cursor only (coarse)
            ctx_opts.update(has_touch=True, user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0')
        if a.ua:
            ctx_opts.update(user_agent=a.ua)
        ctx = b.new_context(**ctx_opts)
        if a.xbox:
            ctx.add_init_script("""(() => { const mm = window.matchMedia.bind(window); const fake = (q, m) => ({ matches: m, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
              window.matchMedia = (q) => /any-pointer:\\s*fine/.test(q) ? fake(q, false) : /any-hover:\\s*hover/.test(q) ? fake(q, false) : /pointer:\\s*coarse/.test(q) ? fake(q, true) : /pointer:\\s*fine/.test(q) ? fake(q, false) : mm(q); })();""")
        ctx.add_init_script("try { localStorage.setItem('cla.tutorial', '99'); const s = JSON.parse(localStorage.getItem('cla.settings') || '{}'); s.gfxPreset = %s; s.gfxOpts = null; s.autoFullscreen = false; localStorage.setItem('cla.settings', JSON.stringify(s)); } catch (e) {}" % json.dumps(a.preset))
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + (getattr(e, 'stack', '') or '')[:600]))
        pg.on('console', lambda m: (errors if m.type == 'error' else logs).append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning', 'log', 'info') else None)
        say('open', url, f'{W}x{H}')
        pg.goto(url)
        t0 = time.time()
        try:
            if a.server == 'practice':
                pg.wait_for_selector('#practice', timeout=a.timeout * 1000)
                pg.click('#practice')
            else:
                pg.wait_for_function('!document.getElementById("play").disabled', timeout=a.timeout * 1000)
                pg.click('#play')
            pg.wait_for_function('window.__S && __S.playing && __S.welcomed && __S.me && __S.ents.size > 0', timeout=a.timeout * 1000)
        except Exception as e:
            print('could not get into the city:', str(e)[:300])
            pg.screenshot(path=os.path.abspath('playtest_fail.png'))
            rc = 2
        say(f'in the city after {time.time() - t0:.1f}s')
        if rc == 0:
            pg.wait_for_timeout(1500)

        def js(src):
            s = src.strip()
            body = s if ('return' in s or s.startswith('{')) else 'return (' + s + ');'
            return pg.evaluate('() => { ' + body + ' }')

        for st in a.steps if rc == 0 else []:
            op, _, arg = st.partition(':')
            try:
                if op == 'wait': pg.wait_for_timeout(int(arg))
                elif op == 'shot':
                    path = os.path.abspath(arg)
                    pg.screenshot(path=path); say('shot', path)
                elif op == 'key':
                    k, _, ms = arg.partition(':')
                    if ms: pg.keyboard.down(k); pg.wait_for_timeout(int(ms)); pg.keyboard.up(k)
                    else: pg.keyboard.press(k)
                elif op == 'keys':
                    ks, _, ms = arg.partition(':')
                    ks = ks.split('+')
                    for k in ks: pg.keyboard.down(k)
                    pg.wait_for_timeout(int(ms or 500))
                    for k in reversed(ks): pg.keyboard.up(k)
                elif op == 'click': pg.click(arg)
                elif op == 'dev':
                    c, _, extra = arg.partition(':')
                    msg = {'t': 'dev', 'c': c}
                    if extra: msg.update(json.loads(extra))
                    pg.evaluate('(m) => window.CLA.send(m)', msg)
                elif op == 'time': pg.evaluate('(m) => window.CLA.send({ t: "dev", c: "time", m })', int(arg))
                elif op == 'tp':
                    v = [float(x) for x in arg.split(',')]
                    pg.evaluate('(v) => window.CLA.send({ t: "dev", c: "tp", x: v[0], y: v[1], lz: v[2] || 0 })', v)
                elif op == 'eval': print('[eval]', st[5:60], '=>', json.dumps(js(arg), default=str)[:4000], flush=True)
                elif op == 'waitfor':
                    expr, _, ms = arg.rpartition(':') if arg.rsplit(':', 1)[-1].isdigit() else (arg, '', '')
                    expr = expr or arg
                    s = expr.strip()
                    body = s if 'return' in s else 'return (' + s + ');'
                    pg.wait_for_function('() => { ' + body + ' }', timeout=int(ms or 30000))
                elif op == 'profile':
                    # profile:MS[:PATH]  CPU profile of the page's main thread; prints the top self-time functions
                    ms, _, path = arg.partition(':')
                    cdp = ctx.new_cdp_session(pg)
                    cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 500}); cdp.send('Profiler.start')
                    pg.wait_for_timeout(int(ms or 5000))
                    prof = cdp.send('Profiler.stop')['profile']
                    if path: json.dump(prof, open(os.path.abspath(path), 'w'))
                    nodes = {n['id']: n for n in prof['nodes']}
                    dts = prof.get('timeDeltas', []); samples = prof.get('samples', [])
                    self_t = {}
                    for sid, dt in zip(samples, dts):
                        n = nodes[sid]['callFrame']; k = f"{n['functionName'] or '(anon)'} {n['url'].rsplit('/', 1)[-1]}:{n['lineNumber'] + 1}"
                        self_t[k] = self_t.get(k, 0) + dt
                    tot = sum(self_t.values()) or 1
                    print('[profile] total %.0f ms' % (tot / 1000))
                    for k, v in sorted(self_t.items(), key=lambda kv: -kv[1])[:28]: print('   %6.1f ms %4.1f%%  %s' % (v / 1000, v * 100 / tot, k))
                elif op == 'perf':
                    r = pg.evaluate('''(ms) => new Promise((res) => { const f = []; let last = performance.now(); const t0 = last;
                      const tick = (now) => { f.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else { f.shift(); f.sort((x, y) => x - y);
                      res({ n: f.length, avg: f.reduce((x, y) => x + y, 0) / f.length, p95: f[Math.floor(f.length * 0.95)], worst: f[f.length - 1] }); } };
                      requestAnimationFrame(tick); })''', int(arg or 3000))
                    print('[perf]', json.dumps({k: round(v, 1) if isinstance(v, float) else v for k, v in r.items()}), flush=True)
                else: print('unknown step', st)
            except Exception as e:
                print('step failed', st, str(e)[:400]); rc = 3
        b.close()
    for p_ in procs:
        p_.terminate()
    if started_game:
        started_game.terminate()
        try: started_game.wait(5)
        except Exception: started_game.kill()
        say('game server stopped')
    keep = [l for l in logs if 'warning' in l][:12]
    if keep and not a.quiet: print('\n'.join(keep))
    print(f'[playtest] errors: {len(errors)}')
    for e in errors[:20]: print('  ', e[:700])
    sys.exit(rc or (1 if errors else 0))


if __name__ == '__main__':
    main()
