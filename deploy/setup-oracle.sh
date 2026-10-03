#!/usr/bin/env bash
# One-time setup for an Oracle Cloud Ubuntu 22.04/24.04 instance (Ampere ARM or AMD).
# Usage (on the server):  bash deploy/setup-oracle.sh
set -euo pipefail

echo "== packages =="
sudo apt-get update -y
sudo apt-get install -y curl git ufw unattended-upgrades fail2ban debian-keyring debian-archive-keyring apt-transport-https

echo "== Node.js 22 LTS =="
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "== Caddy (automatic HTTPS) =="
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

echo "== firewall: Oracle images block 80/443 in iptables even when the VCN allows them =="
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || sudo sh -c 'iptables-save > /etc/iptables/rules.v4'

echo "== data dir + service =="
mkdir -p /home/ubuntu/cla-data
sudo cp deploy/city-life-auto.service /etc/systemd/system/city-life-auto.service
sudo systemctl daemon-reload
sudo systemctl enable --now city-life-auto
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy

echo "== nightly backup of player profiles (keeps 14 days) =="
( crontab -l 2>/dev/null | grep -v cla-backup ; echo "15 4 * * * mkdir -p /home/ubuntu/cla-backups && cp /home/ubuntu/cla-data/profiles.json /home/ubuntu/cla-backups/profiles-\$(date +\%F).json && find /home/ubuntu/cla-backups -mtime +14 -delete # cla-backup" ) | crontab -

echo "Done. Check: curl -s http://127.0.0.1:8080/stats"
