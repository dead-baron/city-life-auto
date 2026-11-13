#!/bin/bash
# The launch keys, one question at a time (docs/LAUNCH-SETUP.md). Run on the Oracle server:
#   sudo bash ~/city-life-auto/deploy/set-keys.sh
# It asks for each sign-in / email / analytics key in turn: paste the value and press Enter, or just press Enter to
# keep what's there (or skip it), or type - to clear it. Secrets aren't shown while you paste them, and the values are
# never printed. They go in /etc/city-life-auto.env (readable by root only); the first run also points the game
# service at that file. At the end the game server restarts (players online get a brief reconnect) and the script
# prints which sign-ins are now switched on. Run it again any time to add or change a key.
set -u
ENV_FILE=/etc/city-life-auto.env
DROPIN_DIR=/etc/systemd/system/city-life-auto.service.d
DROPIN=$DROPIN_DIR/keys.conf
SERVICE=city-life-auto

if [ "$(id -u)" -ne 0 ]; then echo "Run it with sudo:  sudo bash $0"; exit 1; fi

[ -f "$ENV_FILE" ] || install -m 600 /dev/null "$ENV_FILE"
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"

# the value a key has in the file now ('' if none)
current() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-; }
# set (or with '' remove) a key in the file, keeping every other line
put() {
  local tmp; tmp=$(mktemp)
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  [ -n "$2" ] && printf '%s=%s\n' "$1" "$2" >> "$tmp"
  install -m 600 -o root -g root "$tmp" "$ENV_FILE"; rm -f "$tmp"
}
changed=0
# ask KEY "what it is" secret(1/0) [spaces(1): a value with spaces, kept in double quotes - the postal address]
ask() {
  local key=$1 what=$2 secret=$3 spaces=${4:-0} now val shown
  now=$(current "$key")
  if [ -z "$now" ]; then shown='not set'; elif [ "$secret" = 1 ]; then shown='set'; else shown="$now"; fi
  printf '\n%s\n  %s (now: %s)\n  > ' "$what" "$key" "$shown"
  if [ "$secret" = 1 ]; then IFS= read -r -s val; echo; else IFS= read -r val; fi
  val=$(printf '%s' "$val" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/')
  if [ -z "$val" ]; then return; fi
  if [ "$val" = "-" ]; then put "$key" ''; echo "  cleared"; changed=1; return; fi
  if [ "$spaces" = 1 ]; then
    val=$(printf '%s' "$val" | tr -d '"\\')
    put "$key" "\"$val\""; echo "  saved"; changed=1; return
  fi
  case "$val" in *[[:space:]]*) echo "  That has a space in it - skipped. Paste just the value."; return;; esac
  put "$key" "$val"; echo "  saved"; changed=1
}

echo "City Life Auto - launch keys"
echo "Paste each value and press Enter. Enter alone keeps the current one (or skips it). Type - to clear one."
echo "Secret values stay hidden while you paste them."

echo; echo "== Google sign-in (docs/LAUNCH-SETUP.md section 1)"
ask GOOGLE_CLIENT_ID "Google client ID (ends in .apps.googleusercontent.com)" 0
ask GOOGLE_CLIENT_SECRET "Google client secret" 1
echo; echo "== Discord sign-in (section 2)"
ask DISCORD_CLIENT_ID "Discord application (client) ID" 0
ask DISCORD_CLIENT_SECRET "Discord client secret" 1
echo; echo "== Email: password resets and the news list (section 3)"
ask RESEND_API_KEY "Resend API key (starts with re_) - sends the password-reset and confirm emails" 1
ask CLA_MAIL_ADDRESS "Your postal address, at the foot of every news email (spaces are fine)" 0 1
echo; echo "== Google Analytics 4 (section 5)"
ask GA_MEASUREMENT_ID "GA4 measurement ID (starts with G-)" 0
ask GA_API_SECRET "GA4 Measurement Protocol API secret" 1
echo; echo "== The owner's account (section 6) - optional"
ask CLA_OWNER_ID "Your account id (in the game: Settings -> Account)" 0

# the service reads the file (once: a small add-on to the service, kept apart from the repo's own unit file)
if [ ! -f "$DROPIN" ] || ! grep -q "EnvironmentFile=$ENV_FILE" "$DROPIN"; then
  mkdir -p "$DROPIN_DIR"
  printf '[Service]\nEnvironmentFile=%s\n' "$ENV_FILE" > "$DROPIN"
  systemctl daemon-reload
  echo; echo "The game service now reads $ENV_FILE."
  changed=1
fi

if [ "$changed" = 0 ]; then echo; echo "Nothing changed - the server wasn't restarted."; exit 0; fi

echo; echo "Restarting the game server (players online get a brief reconnect)..."
systemctl restart "$SERVICE"
for i in $(seq 1 120); do
  out=$(curl -fsS http://127.0.0.1:8080/launch.json 2>/dev/null) && break
  sleep 1
done
if [ -z "${out:-}" ]; then
  echo "The server isn't answering yet. Check it with:  sudo journalctl -u $SERVICE -n 50"
  exit 1
fi
echo "The server is back up. Switched on now:"
providers=$(printf '%s' "$out" | grep -o '"providers":{[^}]*}' | grep -o '"[a-z]*":true' | cut -d'"' -f2 | paste -sd, - | sed 's/,/, /g')
echo "  Sign-ins: passkeys${providers:+, $providers}"
if printf '%s' "$out" | grep -q '"resets":true'; then echo "  Password resets by email: on"; else echo "  Password resets by email: off (no Resend key)"; fi
ga=$(printf '%s' "$out" | grep -o '"ga":"[^"]*"' | cut -d'"' -f4)
echo "  Google Analytics: ${ga:-off}"
