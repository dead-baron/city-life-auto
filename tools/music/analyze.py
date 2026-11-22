#!/usr/bin/env python3
"""Measure a song recording for the game: beats, bar lines, phrases, a seamless loop and a clean ending.

  python3 tools/music/analyze.py MASTER.flac --id T03 --title "Sunburnt Tape" [--cap SECONDS] [--out DIR]

Writes DIR/ID.json with what it measured and chose, and (with --render) two preview files for the owner's ear:
  ID-loop3.opus  - the loop played three times in a row (the seam heard twice),
  ID-ending.opus - the last stretch of the song into the chosen ending.
Claude cannot hear: everything here is measured. The picks are proposals; the owner's ear approves them.

How (numpy and scipy only, no beat-tracking library):
  1. onset strength from a log spectrum's rise frame to frame (plus a low band for the kick),
  2. tempo by autocorrelation weighted toward a moderate pace, then beats by dynamic programming (Ellis 2007), so a
     tempo that creeps over a generated take is followed rather than forced to a grid,
  3. the downbeat: the beat phase (of four) where the kick and the chord changes land,
  4. bar features (chroma, spectrum shape, loudness); a loop is the run of bars, on a phrase line, whose bar after its
     end sounds most like its first bar and whose last bar sounds most like the bar before its start - the seam is
     then a join the song itself nearly makes,
  5. the ending: a take that ends quietly keeps its own ending; one cut off (at the generator's limit or not) ends on
     the downbeat after its last full phrase, that first beat left ringing and faded over two beats.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
from scipy.signal import stft

SR = 22050
HOP = 512
FPS = SR / HOP


def decode(path, sr, channels):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(channels), '-ar', str(sr), '-'],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32)
    return a.reshape(-1, channels) if channels > 1 else a


def features(y):
    _, _, Z = stft(y, fs=SR, nperseg=2048, noverlap=2048 - HOP, boundary=None, padded=False)
    mag = np.abs(Z)
    freqs = np.fft.rfftfreq(2048, 1 / SR)
    # 40 log-spaced bands 40 Hz - 10 kHz
    edges = np.geomspace(40, 10000, 41)
    bands = np.stack([mag[(freqs >= edges[i]) & (freqs < edges[i + 1])].sum(0) for i in range(40)])
    logb = np.log1p(100 * bands)
    flux = np.maximum(0, np.diff(logb, axis=1, prepend=logb[:, :1]))
    onset = flux.sum(0)
    low = flux[:6].sum(0)                                     # (40-100 Hz: the kick and the bass)
    # chroma: fold 55 Hz - 4 kHz into 12 pitch classes
    sel = (freqs > 55) & (freqs < 4000)
    pc = np.round(12 * np.log2(freqs[sel] / 440.0)).astype(int) % 12
    chroma = np.zeros((12, mag.shape[1]))
    for k in range(12):
        chroma[k] = mag[sel][pc == k].sum(0)
    chroma /= chroma.sum(0, keepdims=True) + 1e-9
    rms = np.sqrt(np.mean(mag ** 2, axis=0))
    return onset, low, chroma, logb, rms


def smooth(x, n):
    k = np.hanning(n * 2 + 1)
    return np.convolve(x, k / k.sum(), mode='same')


def tempo_of(onset, hint=None):
    o = onset - smooth(onset, 16)
    o = np.maximum(o, 0)
    o = (o - o.mean()) / (o.std() + 1e-9)
    ac = np.correlate(o, o, mode='full')[len(o) - 1:]
    lags = np.arange(len(ac))
    bpm = np.where(lags > 0, 60 * FPS / np.maximum(lags, 1), 0)
    # the weight: toward the tempo the score was written at when there is one (it picks between the recording's own
    # peaks - double, half, two-thirds - the value itself is still measured), else toward a moderate pace
    w = np.exp(-0.5 * (np.log2(np.maximum(bpm, 1) / (hint or 110)) / (0.2 if hint else 0.9)) ** 2)
    ok = (bpm >= 50) & (bpm <= 210)
    score = np.where(ok, ac * w, -np.inf)
    lag = int(np.argmax(score))
    # parabolic refinement
    if 1 <= lag < len(ac) - 1:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
        lagf = lag + d
    else:
        lagf = lag
    return 60 * FPS / lagf, lagf


def track_beats(onset, period, tight=100.0):
    o = onset - smooth(onset, 16)
    o = np.maximum(o, 0)
    o /= o.std() + 1e-9
    n = len(o)
    score = o.copy()
    back = -np.ones(n, dtype=int)
    lo, hi = int(round(period * 0.5)), int(round(period * 2))
    for t in range(lo, n):
        p = np.arange(max(0, t - hi), t - lo + 1)
        if not len(p):
            continue
        pen = -tight * np.log((t - p) / period) ** 2
        cand = score[p] + pen
        j = int(np.argmax(cand))
        if cand[j] > 0:
            score[t] = o[t] + cand[j]
            back[t] = p[j]
    # the last beat: the best score in the final beat period
    tail = np.arange(max(0, n - int(period) - 1), n)
    t = int(tail[np.argmax(score[tail])])
    beats = [t]
    while back[t] >= 0:
        t = back[t]
        beats.append(t)
    return np.array(beats[::-1])


def zs(x):
    return (x - x.mean()) / (x.std() + 1e-9)


def analyze(path, cap, hint=None, bpb=4):
    y = decode(path, SR, 1)
    dur = len(y) / SR
    onset, low, chroma, logb, rms = features(y)
    bpm, period = tempo_of(onset, hint)
    beats = track_beats(onset, period)
    bt = beats / FPS
    # local tempo spread (creep)
    ibi = np.diff(bt)
    # downbeat phase: kick + chord change at the beat, over the four phases
    lowo = smooth(np.maximum(low - smooth(low, 16), 0), 1)
    bchroma = np.stack([chroma[:, max(0, beats[i] - 2):beats[i] + int(period) - 2].mean(1) if i < len(beats) else chroma[:, -1]
                        for i in range(len(beats))], axis=1)
    change = np.r_[0, np.abs(np.diff(bchroma, axis=1)).sum(0)]
    kick = lowo[np.minimum(beats, len(lowo) - 1)]
    acc = zs(kick) + zs(change)
    phase = int(np.argmax([acc[p::bpb].mean() for p in range(bpb)]))
    down = beats[phase::bpb]
    bars = [(int(down[i]), int(down[i + 1])) for i in range(len(down) - 1)]
    # bar features
    F, R = [], []
    for a, b in bars:
        c = chroma[:, a:b].mean(1)
        s = logb[:, a:b].mean(1)
        F.append(np.r_[c / (np.linalg.norm(c) + 1e-9), 0.5 * s / (np.linalg.norm(s) + 1e-9)])
        R.append(20 * np.log10(rms[a:b].mean() + 1e-9))
    F, R = np.array(F), np.array(R)
    nb = len(bars)
    body = np.median(R) if nb else -99
    # tail: the last half second, against the body
    tail_db = 20 * np.log10(np.sqrt(np.mean(y[-SR // 2:] ** 2)) + 1e-9)
    body_db = 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-9)
    capped = cap is not None and dur >= cap - 0.05
    natural = tail_db < -30 or tail_db < body_db - 20      # (a take fading out on its own)
    # phrase lines: bars counted from the first bar whose loudness reaches the body (the intro's pickup aside)
    first = next((i for i in range(nb) if R[i] > body - 6), 0)

    def sim(i, j):
        return float(np.dot(F[i], F[j]) / (np.linalg.norm(F[i]) * np.linalg.norm(F[j]) + 1e-9))

    # loop: s..e (e exclusive); the seam joins bar e-1 to bar s. Last usable bar: two bars before a cut-off end.
    last_ok = nb - (1 if natural else 3)
    best = None
    for L in (8, 12, 16, 24, 32):
        for s in range(max(first, 1), nb):
            e = s + L
            if e > last_ok or s - 1 < 0:
                continue
            secs = (bars[e - 1][1] - bars[s][0]) / FPS
            if secs < 20 or secs > 75:
                continue
            on_line = (s - first) % 4 == 0
            loud = np.mean(R[s:e]) > body - 3 and R[s] > body - 10 and R[e - 1] > body - 10   # (breaks inside are the music's; a quiet intro or outro is not a loop)
            if not loud:
                continue
            sc = sim(e, s) + sim(e - 1, s - 1) - 0.02 * abs(R[e] - R[s]) - 0.02 * abs(R[e - 1] - R[s - 1])
            sc += 0.03 if on_line else -0.05
            sc += 0.02 if L == 16 else 0
            if best is None or sc > best[0]:
                best = (sc, s, e, L, secs, sim(e, s), sim(e - 1, s - 1))
    loop = None
    if best:
        sc, s, e, L, secs, a, b = best
        loop = {'bar_start': s, 'bar_end': e, 'bars': L, 'start': round(bars[s][0] / FPS, 3), 'end': round(bars[e][0] / FPS, 3),
                'seconds': round(secs, 3), 'score': round(sc, 3), 'next_bar_like_first': round(a, 3), 'last_bar_like_before': round(b, 3),
                'on_phrase_line': (s - first) % 4 == 0}
    # ending
    if natural:
        ending = {'kind': 'own', 'at': round(dur, 3), 'why': f'ends quietly on its own (last 0.5 s {tail_db:.1f} dB, body {body_db:.1f} dB)'}
    else:
        # the last phrase line (every 4 bars from `first`) at least a full bar before the end of the audio
        cands = [i for i in range(first + 4, nb) if (i - first) % 4 == 0 and bars[i][0] / FPS + 2 * period / FPS < dur - 0.2]
        k = cands[-1] if cands else max(0, nb - 1)
        at = bars[k][0] / FPS
        ending = {'kind': 'cut', 'bar': k, 'at': round(at, 3), 'ring_s': round(2 * period / FPS, 3),
                  'why': ('stops at the generator limit with sound still playing' if capped else 'stops with sound still playing')
                  + f' (last 0.5 s {tail_db:.1f} dB): ends on the downbeat after its last full phrase, that beat ringing, faded over two beats'}
    return {
        'seconds': round(dur, 3), 'bpm': round(float(bpm), 2), 'bpm_first_half': round(float(60 / np.median(ibi[:len(ibi) // 2])), 2) if len(ibi) > 4 else None,
        'bpm_second_half': round(float(60 / np.median(ibi[len(ibi) // 2:])), 2) if len(ibi) > 4 else None,
        'beat_jitter_ms': round(float(np.std(ibi - np.median(ibi)) * 1000), 1) if len(ibi) > 4 else None,
        'beats': len(beats), 'bars': nb, 'downbeat_phase': phase, 'first_bar': first, 'first_downbeat': round(down[0] / FPS, 3) if len(down) else None,
        'bar_lines': [round(a / FPS, 3) for a, _ in bars] + ([round(bars[-1][1] / FPS, 3)] if bars else []),
        'tail_db': round(float(tail_db), 1), 'body_db': round(float(body_db), 1), 'capped': capped, 'loop': loop, 'ending': ending,
    }


def stereo_alike(path):
    y = decode(path, 44100, 2)
    l, r = y[:, 0], y[:, 1]
    return float(np.dot(l, r) / (np.linalg.norm(l) * np.linalg.norm(r) + 1e-9))


def align(y, at, ref, sr, win=0.012):
    """the sample near `at` whose next few ms best match those at `ref` (the end's downbeat against the start's)"""
    w = int(win * sr)
    a0, r0 = int(at * sr), int(ref * sr)
    seg = y[r0:r0 + 4 * w].mean(1)
    best, bi = -1e18, a0
    for d in range(-w, w + 1):
        c = y[a0 + d:a0 + d + 4 * w].mean(1)
        if len(c) < len(seg):
            break
        v = float(np.dot(c, seg))
        if v > best:
            best, bi = v, a0 + d
    return bi


def render(path, info, out, oid):
    sr = 44100
    y = decode(path, sr, 2)
    files = {}
    if info['loop']:
        s0 = int(info['loop']['start'] * sr)
        e0 = align(y, info['loop']['end'], info['loop']['start'], sr)
        body = y[s0:e0].copy()
        xf = int(0.09 * sr)                                   # the 90 ms before the seam blended into what comes before the start
        if s0 - xf >= 0:
            t = np.linspace(0, 1, xf)[:, None]
            body[-xf:] = body[-xf:] * (1 - t) + y[s0 - xf:s0] * t
        three = np.concatenate([y[max(0, s0 - int(2 * sr)):s0], body, body, body])
        f = os.path.join(out, f'{oid}-loop3.opus')
        enc(three, sr, f)
        files['loop3'] = os.path.basename(f)
        info['loop']['end_aligned'] = round(e0 / sr, 4)
        # the seam's jump against the music's own: sample step at the join vs the median step
        # the seam's jump against the music's own sharpest: the step across the join over the 99.9th percentile of the
        # loop's sample steps (under 1: no sharper than the music already is - a downbeat's own attack counts as music)
        step = np.abs(np.diff(np.concatenate([body[-2:], body[:2]]).mean(1)))
        own = np.percentile(np.abs(np.diff(body.mean(1))), 99.9)
        info['loop']['seam_vs_sharpest'] = round(float(step.max() / (own + 1e-12)), 3)
        # and the loudness either side of the join (the last 50 ms against the first 50 ms), in dB
        n50 = int(0.05 * sr)
        lv = lambda a: 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)
        info['loop']['seam_level_jump_db'] = round(float(lv(body[:n50]) - lv(body[-n50:])), 1)
    e = info['ending']
    if e['kind'] == 'own':
        start = max(0.0, e['at'] - 30)
        seg = y[int(start * sr):]
    else:
        at = e['at']
        ring = e['ring_s']
        start = max(0.0, at - 30)
        a, b = int(start * sr), int((at + ring) * sr)
        seg = y[a:b].copy()
        f0 = int((at + 0.06) * sr) - a
        n = len(seg) - f0
        if n > 0:
            seg[f0:] *= (np.linspace(1, 0, n) ** 2)[:, None]
        e['ends_at'] = round(at + ring, 3)
    f = os.path.join(out, f'{oid}-ending.opus')
    enc(seg, sr, f)
    files['ending'] = os.path.basename(f)
    e['preview_from'] = round(start, 3)
    # the song from the top: the whole take, its intro and all, to its ending (its own, or the new one) - for a boombox,
    # a jukebox, a radio starting a song fresh
    if e['kind'] == 'own':
        whole = y
    else:
        b = int((e['at'] + e['ring_s']) * sr)
        whole = y[:b].copy()
        f0 = int((e['at'] + 0.06) * sr)
        n = len(whole) - f0
        if n > 0:
            whole[f0:] *= (np.linspace(1, 0, n) ** 2)[:, None]
    f = os.path.join(out, f'{oid}-full.opus')
    enc(whole, sr, f)
    files['full'] = os.path.basename(f)
    return files


def enc(a, sr, f):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-i', '-', '-c:a', 'libopus', '-b:a', '96k', f],
                       input=np.ascontiguousarray(a, dtype=np.float32).tobytes(), capture_output=True)
    if p.returncode:
        sys.exit(p.stderr.decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('master')
    ap.add_argument('--id', required=True)
    ap.add_argument('--title', default='')
    ap.add_argument('--cap', type=float, default=None)
    ap.add_argument('--out', default='.')
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--bpm-hint', type=float, default=None, help="the tempo the score was written at (SCORE.txt Q:)")
    ap.add_argument('--bpb', type=int, default=4, help='beats to a bar as counted here (4; 3 for a 6/8 counted in quarters)')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    info = analyze(a.master, a.cap, a.bpm_hint, a.bpb)
    info['bpm_written'] = a.bpm_hint
    info['id'], info['title'] = a.id, a.title
    info['stereo_alike'] = round(stereo_alike(a.master), 3)
    if a.render:
        info['files'] = render(a.master, info, a.out, a.id)
    with open(os.path.join(a.out, a.id + '.json'), 'w') as fh:
        json.dump(info, fh, indent=1, default=float)
    lp = info['loop']
    print(a.id, a.title, f"{info['seconds']}s {info['bpm']}bpm bars={info['bars']} jitter={info['beat_jitter_ms']}ms",
          'loop', (f"{lp['start']}-{lp['end']} {lp['bars']}b {lp['seconds']}s sc={lp['score']}" if lp else 'none'),
          'end', info['ending']['kind'], info['ending']['at'])


if __name__ == '__main__':
    main()
