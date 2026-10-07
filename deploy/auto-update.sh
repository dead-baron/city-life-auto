#!/usr/bin/env bash
# Auto-deploy: run every 2 minutes by cla-update.timer (installed by setup-oracle.sh).
# If GitHub's main branch has new commits it pulls them. When server code changed it restarts
# the game - after a 60-second in-game countdown if anyone is online (progress is saved first); if the server doesn't come back healthy it rolls
# back to the previous version and restarts that instead. Client-only changes need no restart
# (players get those from GitHub Pages). Log: journalctl -u cla-update
set -euo pipefail
cd "${CLA_APP_DIR:-/home/ubuntu/city-life-auto}"

git fetch -q origin main
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0
BAD_FILE="${CLA_BAD_FILE:-$HOME/.cla-bad-commit}"   # a version that failed to start: don't retry it every 2 minutes
[ -f "$BAD_FILE" ] && [ "$(cat "$BAD_FILE")" = "$NEW" ] && exit 0

# Wait for the page. The moment the new version.json lands here the server tells every player's page about the
# new build, and the pages wait for GitHub Pages to serve it - so don't move until Pages has published it
# (usually 1-3 minutes after a push; this runs every 2). On 2026-10-07 Pages skipped a push: the server moved
# on its own and every page sat on "Updating...". If the published page can't be reached at all, go ahead as
# before; if it still shows an older build after an hour, go ahead too, and say so.
PAGES_URL="${CLA_PAGES_URL:-https://deadbaron.com/city-life-auto}"
ver() { grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4; }
WANT=$(git show origin/main:version.json 2>/dev/null | ver || true)
LIVE=$(curl -sf -m 10 "$PAGES_URL/version.json?b=$(date +%s)" | ver || true)
WAIT_FILE="${CLA_DATA_DIR:-/home/ubuntu/cla-data}/pages-wait"
if [ -n "$WANT" ] && [ -n "$LIVE" ] && [ "$LIVE" != "$WANT" ]; then
  SINCE=$(date +%s)
  if [ -f "$WAIT_FILE" ] && [ "$(cut -d' ' -f1 "$WAIT_FILE")" = "$NEW" ]; then SINCE=$(cut -d' ' -f2 "$WAIT_FILE"); else echo "$NEW $SINCE" > "$WAIT_FILE"; fi
  WAITED=$(( $(date +%s) - SINCE ))
  if [ "$WAITED" -lt 3600 ]; then
    echo "auto-update: ${NEW:0:7} is on GitHub; waiting for Pages to publish build $WANT (it serves $LIVE; ${WAITED}s so far)"
    exit 0
  fi
  echo "auto-update: Pages still serves $LIVE after an hour - updating to ${NEW:0:7} anyway (push again to republish the page)"
fi
rm -f "$WAIT_FILE"

if ! git merge -q --ff-only origin/main; then
  echo "auto-update: local edits on the server block the update - skipping (run: git status)"
  exit 1
fi
CHANGED=$(git diff --name-only "$OLD" "$NEW")

if ! echo "$CHANGED" | grep -qE '^(server/|shared/|package\.json)'; then
  echo "auto-update: ${OLD:0:7} -> ${NEW:0:7} (no server code changed, no restart)"
  exit 0
fi

healthy() {
  for _ in $(seq 1 90); do
    sleep 1
    curl -sf -m 2 http://127.0.0.1:8080/health >/dev/null && return 0
  done
  return 1
}

# Players online? Give them a minute's warning first (the server shows a countdown).
ONLINE=$(curl -sf -m 2 http://127.0.0.1:8080/stats | grep -o '"online":[0-9]*' | cut -d: -f2 || true)
if [ "${ONLINE:-0}" -gt 0 ]; then
  echo "auto-update: ${ONLINE} player(s) online - restarting in 60 s"
  echo $(( ($(date +%s) + 60) * 1000 )) > "${CLA_DATA_DIR:-/home/ubuntu/cla-data}/update-at"
  sleep 60
fi
sudo systemctl restart city-life-auto
if healthy; then
  echo "auto-update: ${OLD:0:7} -> ${NEW:0:7}, server restarted OK"
else
  echo "auto-update: ${NEW:0:7} did not start - rolling back to ${OLD:0:7} (it won't be retried; the next push will)"
  echo "$NEW" > "$BAD_FILE"
  git reset -q --hard "$OLD"
  sudo systemctl restart city-life-auto
  healthy && echo "auto-update: rolled back, server OK on ${OLD:0:7}" || echo "auto-update: server still down after rollback - check: journalctl -u city-life-auto"
fi
if echo "$CHANGED" | grep -qE '^deploy/'; then
  echo "auto-update: deploy files changed - run 'bash deploy/setup-oracle.sh' to apply them"
fi
