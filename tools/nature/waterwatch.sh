#!/bin/bash
# tools/nature/waterwatch.sh OUTDIR  - film each kind of water body in the running game (a local copy, headless) and
# score it for flicker, at several hours and in rain. For each place: jump there, let the chunks bake, then for each
# hour / weather read six frames in a row off the game's canvas (tools/nature/waterprobe.js) and print how much the
# water's pixels jump from one to the next. Two pictures a look are kept: the place as it is, and the jumping pixels
# in red. Heavy (a local server + headless Chromium): run under flock /tmp/cla-heavy.lock.
#   PLACES="pier marsh tarn"   kinds of place the dev command "near" knows (a poi kind, a landmark type, a nature site
#                              kind - server/dev.js nearTargets)
#   MODES="780:clear 1160:clear 1320:clear 780:rain 1320:rain"   minute of the day : weather. The first must be a
#                              clear midday: which pixels are water is read from their colour then, and kept.
set -e
OUT=${1:-/tmp/waterwatch}; mkdir -p "$OUT"
cd "$(dirname "$0")/../.."
PLACES=${PLACES:-"pier beach surf cove tidepools marina lake tarn river creek pond gardens marsh springs oasis rainforest pool"}
MODES=${MODES:-"780:clear 1160:clear 1320:clear 780:rain 1320:rain"}
# (past the first-time screens: each waits for its button - the smallest visible element with the words - and clicks it)
PROBE=$(grep -v "^ *//" tools/nature/waterprobe.js | tr '\n' ' ')
STEPS=()
for t in "Play as" "Old Town" "Just let me roam"; do STEPS+=("waitfor:const b=[...document.querySelectorAll('button,a,div,span')].filter((e)=>e.offsetParent&&new RegExp('$t','i').test(e.textContent||'')).sort((p,q)=>(p.textContent||'').length-(q.textContent||'').length)[0]; if(b){b.click(); return 1} return 0" "wait:1500"); done
STEPS+=("wait:4000" "dev:clear" "time:780")
for n in $PLACES; do
  # (the dev clock runs fast: the hour is set again at each look. Dry and clear again before each place: under cloud
  # nothing glints, and a first measurement that way looked better than it was)
  STEPS+=("dev:clear" "dev:near:{\"k\":\"$n\"}" "time:780" "wait:3000" "eval:__S.rainK = 0; return 1" "wait:${BAKE_MS:-50000}" "eval:globalThis.__wwNew = 1; return 1")
  for md in $MODES; do
    T=${md%%:*}; W=${md##*:}
    # (how wet the page draws things eases over eight seconds of the game's own time - minutes at a headless page's frame
    # rate: set outright, so a look is all rain or all dry)
    if [ "$W" = rain ]; then STEPS+=("dev:rain:{\"s\":900}" "time:$T" "wait:3000" "eval:__S.rainK = 1; return 1" "wait:6000"); else STEPS+=("dev:clear" "time:$T" "wait:3000" "eval:__S.rainK = 0; return 1" "wait:3000"); fi
    STEPS+=("time:$T" "wait:1500" "eval:console.log('probe $n $T $W'); $PROBE" "save:globalThis.__ww.plain:$OUT/$n-$T-$W.png" "save:globalThis.__ww.jumps:$OUT/$n-$T-$W-jumps.png")
  done
done
python3 tools/playtest.py --start-server --game-port 8171 --port 8172 --ls 'cla.gate={"age17":true,"consent":"essential","at":1}' --params art=2 --preset ${PRESET:-high} --vp ${VP:-960x540} --timeout 500 --quiet "${STEPS[@]}"
