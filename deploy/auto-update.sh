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
  for _ in $(seq 1 15); do
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
