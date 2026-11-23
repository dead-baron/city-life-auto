#!/usr/bin/env bash
# Nightly backup of the game server's data (cla-backup.timer, about 03:30 server time; installed by setup-oracle.sh -
# deploy/auto-update.sh installs it too on its next run). One tar.gz of the data dir - profiles.json (every player's
# progress and the accounts), secret.key (keeps every login token valid), the admin log, the news list, the analytics,
# the bug reports' list - into ~/cla-backups/cla-YYYY-MM-DD.tar.gz, readable by its owner only (600); the newest 14
# kept. Left out: what the server builds again by itself (the baked art, the region files, the low-detail picture) and
# the bug reports' screenshots (up to 200 MB: CLA_BACKUP_SHOTS=1 takes them too). Restore: docs/DEPLOY.md.
# Run it by hand any time:  bash ~/city-life-auto/deploy/backup.sh      Log: journalctl -u cla-backup
set -euo pipefail
umask 077
DATA="${CLA_DATA_DIR:-/home/ubuntu/cla-data}"
OUT="${CLA_BACKUP_DIR:-$HOME/cla-backups}"
KEEP="${CLA_BACKUP_KEEP:-14}"
[ -d "$DATA" ] || { echo "backup: no data dir at $DATA"; exit 1; }
mkdir -p "$OUT"; chmod 700 "$OUT"
NAME="cla-$(date +%F).tar.gz"
EXCL=(--exclude=./art --exclude=./artlow --exclude=./world --exclude=./update-at --exclude=./pages-wait --exclude='./*.tmp')
[ "${CLA_BACKUP_SHOTS:-0}" = 1 ] || EXCL+=(--exclude=./reports/img)
# (the server writes its files whole - a temp file renamed over - so a copy taken while it runs is consistent per file;
# a file changing as tar reads it is a warning, not a failure: exit code 1 from GNU tar)
TMP="$OUT/.$NAME.part"
rc=0; tar -czf "$TMP" -C "$DATA" "${EXCL[@]}" . || rc=$?
if [ "$rc" -gt 1 ]; then rm -f "$TMP"; echo "backup: tar failed ($rc)"; exit "$rc"; fi
chmod 600 "$TMP"; mv -f "$TMP" "$OUT/$NAME"
# the newest $KEEP kept (and the old cron's profiles-*.json copies once they're two weeks old)
ls -1t "$OUT"/cla-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
find "$OUT" -maxdepth 1 -name 'profiles-*.json' -mtime +14 -delete 2>/dev/null || true
echo "backup: $OUT/$NAME ($(du -h "$OUT/$NAME" | cut -f1)); $(ls -1 "$OUT"/cla-*.tar.gz | wc -l) kept"
# (for the owner's console, its Status tab: server/status.js readBackup - "epoch<TAB>size<TAB>kept")
printf '%s\t%s\t%s\n' "$(date +%s)" "$(du -h "$OUT/$NAME" | cut -f1)" "$(ls -1 "$OUT"/cla-*.tar.gz | wc -l)" > "$DATA/backup-last" 2>/dev/null || true
