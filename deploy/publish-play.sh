#!/usr/bin/env bash
# The player-only page (docs/PRIVATE-REPO.md): once the development repository is private, GitHub Pages serves the game
# page from a public repository that holds only what a browser needs (tools/build-play.mjs). This builds the page of
# one commit and pushes it there. auto-update.sh calls it with each new commit before it waits for Pages to publish -
# so the page and the server change together, as before.
#   bash deploy/publish-play.sh <commit>
# Settings (deploy/setup-private.sh writes them): ~/.cla-play-repo - the public repository's address (an SSH alias with
# its own write key, e.g. git@github-play:dead-baron/city-life-auto.git). Nothing set: nothing to do.
set -euo pipefail
NEW="${1:?usage: publish-play.sh <commit>}"
APP="${CLA_APP_DIR:-/home/ubuntu/city-life-auto}"
REPO="${CLA_PLAY_REPO:-$(cat "$HOME/.cla-play-repo" 2>/dev/null || true)}"
[ -n "$REPO" ] || exit 0
SRC="${CLA_PLAY_SRC:-$HOME/cla-play-src}"   # the development repository at that commit (a worktree of the server's checkout)
OUT="${CLA_PLAY_DIR:-$HOME/cla-play}"       # the public repository's checkout
DONE="$OUT/.git/cla-published"
[ -f "$DONE" ] && [ "$(cat "$DONE")" = "$NEW" ] && exit 0   # (published already: this runs every 2 minutes while Pages catches up)
cd "$APP"
if [ -d "$SRC" ]; then git -C "$SRC" checkout -q --detach "$NEW"; else git worktree add -q --detach "$SRC" "$NEW"; fi
if [ ! -d "$OUT/.git" ]; then git clone -q "$REPO" "$OUT"; fi
git -C "$OUT" fetch -q origin 2>/dev/null && git -C "$OUT" reset -q --hard origin/main 2>/dev/null || true   # (a new, empty repository has no main yet)
node "$SRC/tools/build-play.mjs" "$OUT"
cd "$OUT"
git add -A
VER=$(grep -o '"version":"[^"]*"' version.json | head -1 | cut -d'"' -f4)
if ! git diff --cached --quiet; then
  git -c user.name="City Life Auto" -c user.email="support@deadbaron.com" commit -q -m "Build $VER (${NEW:0:7})"
  git push -q origin HEAD:main
  echo "publish-play: build $VER (${NEW:0:7}) pushed"
fi
echo "$NEW" > "$DONE"
