#!/bin/bash
# tools/nature/waterwatch.sh OUTDIR [TIME_MIN]  - film each kind of water body in the running game (a local copy, headless)
# and score it for flicker. For each place: jump there, let the chunks bake, read six frames in a row off the
# game's canvas (tools/nature/waterprobe.js) and print how much the water's pixels jump from one to the next.
# Heavy (a local server + headless Chromium): run under flock /tmp/cla-heavy.lock. 
set -e
OUT=${1:-/tmp/waterwatch}; T=${2:-780}; mkdir -p "$OUT"
cd "$(dirname "$0")/../.."
PLACES=${PLACES:-"pier beach cove tarn creek pond marsh springs rainforest"}   # (kinds of place the dev command "near" knows: a poi kind, a landmark type or a nature site kind - server/dev.js nearTargets)
# (past the first-time screens: each waits for its button - the smallest visible element with the words - and clicks it)
PROBE=$(grep -v "^ *//" tools/nature/waterprobe.js | tr '\n' ' ')
STEPS=()
for t in "Play as" "Old Town" "Just let me roam"; do STEPS+=("waitfor:const b=[...document.querySelectorAll('button,a,div,span')].filter((e)=>e.offsetParent&&new RegExp('$t','i').test(e.textContent||'')).sort((p,q)=>(p.textContent||'').length-(q.textContent||'').length)[0]; if(b){b.click(); return 1} return 0" "wait:1500"); done
STEPS+=("wait:4000" "time:$T")
for n in $PLACES; do
  STEPS+=("dev:near:{\"k\":\"$n\"}" "wait:${BAKE_MS:-50000}" "dev:clear" "time:$T" "wait:4000")   # (the dev clock runs fast: the hour set again at each place, and the sky cleared - under cloud or rain nothing glints, and a run can't be told from the last)
  # (a headless screenshot takes many seconds: flicker is measured in the page itself, frame after frame - waterprobe.js - and two pictures are kept: the jumping pixels in red, and the place as it is)
  STEPS+=("eval:console.log('probe $n'); $PROBE" "shot:$OUT/$n-$T-jumps.png" "eval:const o=document.getElementById('ww-overlay'); if(o) o.remove(); return 1" "shot:$OUT/$n-$T.png")
done
python3 tools/playtest.py --start-server --game-port 8171 --port 8172 --ls 'cla.gate={"age17":true,"consent":"essential","at":1}' --params art=2 --preset ${PRESET:-high} --vp ${VP:-960x540} --timeout 500 --quiet "${STEPS[@]}"
