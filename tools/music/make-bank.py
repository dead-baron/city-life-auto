#!/usr/bin/env python3
"""Make a sample bank for a song in the engine (client/sound/banks/NAME.js): short one-shot samples - a kick, a
snare, hats - as the SNES did it, played from the song's score. The one-shots come from an .npz of mono float
arrays at 48 kHz (cut from the owner's own track's drum stem: the most typical hit of each kind, or the hits of a
kind lined up and averaged where they repeat exactly, as a kick does).

  python3 tools/music/make-bank.py ONESHOTS.npz --name menu [--rate 24000] [--rates kick=16000,hat=48000]
                                   [--from "what they were cut from"]

Each one-shot is kept at its own rate (--rates, else --rate: a kick has nothing above 8 kHz, a hat's fizz goes past
16) as 16-bit PCM in base64, stored at full scale. The score's gains are on the one-shot at 48 kHz brought to full
scale (as the transcription fitted them); `norm` is what the stored sound is multiplied by to be that again (its
peak moves a little when it's resampled). `peak` is the one-shot's own peak in the recording. A one-shot changed since
its gains were fitted (the kick given back its sub) brings the peak they were fitted on as NAME_ref in the .npz: it
is brought to scale by that instead, so the gains still hold for the part that was there.
"""
import argparse
import base64
import os
import numpy as np
from scipy.signal import resample_poly

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('npz')
    ap.add_argument('--name', required=True)
    ap.add_argument('--rate', type=int, default=24000)
    ap.add_argument('--rates', default='')
    ap.add_argument('--from', dest='src', default='')
    a = ap.parse_args()
    z = np.load(a.npz)
    rates = {k: int(v) for k, v in (kv.split('=') for kv in a.rates.split(',') if kv)}
    lines, total = [], 0
    for k in sorted(f for f in z.files if not f.endswith('_ref')):
        r = rates.get(k, a.rate)
        x0 = z[k].astype(np.float64); pk48 = float(z[k + '_ref']) if k + '_ref' in z.files else float(np.abs(x0).max())
        x = resample_poly(x0, r, 48000) if r != 48000 else x0.copy()
        n = max(8, int(0.004 * r)); x[-n:] *= np.linspace(1, 0, n)   # (a few ms of fade at the end)
        pk = float(np.abs(x).max())
        pcm = (np.clip(x / max(pk, 1e-9), -1, 1) * 32767).round().astype('<i2')
        b64 = base64.b64encode(pcm.tobytes()).decode()
        total += len(b64)
        lines.append(f'  {k}: {{ rate: {r}, norm: {pk / pk48:.4f}, peak: {pk48:.4f}, pcm: \'{b64}\' }},')
    with open(os.path.join(ROOT, 'client', 'sound', 'banks', f'{a.name}.js'), 'w') as f:
        f.write('// A sample bank (made by tools/music/make-bank.py - edit there, not here): one-shots as 16-bit PCM in base64,\n')
        f.write(f'// each at its own rate and stored at full scale. {a.src}\n')
        f.write('export const BANK = {\n' + '\n'.join(lines) + '\n};\n')
    print(f'wrote client/sound/banks/{a.name}.js: {len(lines)} samples, {total / 1024:.0f} KB of base64')


if __name__ == '__main__':
    main()
