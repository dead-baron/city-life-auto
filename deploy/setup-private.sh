#!/usr/bin/env bash
# Run once on the game server when the development repository goes private (docs/PRIVATE-REPO.md has the whole order).
#   bash deploy/setup-private.sh <owner>/<dev repo> <owner>/<public repo>
#   e.g. bash deploy/setup-private.sh dead-baron/city-life-auto-dev dead-baron/city-life-auto
# It makes two keys - one to read the private repository (the updater's pulls), one to write the public page
# repository (deploy/publish-play.sh) - and SSH aliases for them, prints both public keys to paste into GitHub, points
# this checkout at the private repository, and records the public one for the updater. Safe to run again.
set -euo pipefail
DEV="${1:?usage: setup-private.sh <owner>/<dev repo> <owner>/<public repo>}"; PLAY="${2:?usage: setup-private.sh <owner>/<dev repo> <owner>/<public repo>}"
APP="${CLA_APP_DIR:-/home/ubuntu/city-life-auto}"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
for k in cla-dev cla-play; do [ -f "$HOME/.ssh/$k" ] || ssh-keygen -q -t ed25519 -N '' -C "$k@$(hostname)" -f "$HOME/.ssh/$k"; done
CFG="$HOME/.ssh/config"; touch "$CFG" && chmod 600 "$CFG"
add_host() { grep -q "^Host $1\$" "$CFG" || printf '\nHost %s\n  HostName github.com\n  User git\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$1" "$2" >> "$CFG"; }
add_host github-dev "$HOME/.ssh/cla-dev"; add_host github-play "$HOME/.ssh/cla-play"
ssh-keyscan -t ed25519 github.com 2>/dev/null >> "$HOME/.ssh/known_hosts" && sort -u -o "$HOME/.ssh/known_hosts" "$HOME/.ssh/known_hosts"
echo "git@github-play:$PLAY.git" > "$HOME/.cla-play-repo"
echo
echo "1) GitHub -> $DEV -> Settings -> Deploy keys -> Add deploy key, title 'game server', READ ONLY:"
cat "$HOME/.ssh/cla-dev.pub"
echo
echo "2) GitHub -> $PLAY -> Settings -> Deploy keys -> Add deploy key, title 'game server', tick 'Allow write access':"
cat "$HOME/.ssh/cla-play.pub"
echo
read -r -p "Press Enter once both keys are added... " _
git -C "$APP" remote set-url origin "git@github-dev:$DEV.git"
git -C "$APP" fetch -q origin main && echo "ok: the server reads $DEV"
bash "$APP/deploy/publish-play.sh" "$(git -C "$APP" rev-parse HEAD)" && echo "ok: the page is published to $PLAY - turn on its Pages (Settings -> Pages -> main, / root)"
