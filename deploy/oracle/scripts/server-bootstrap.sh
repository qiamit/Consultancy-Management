#!/usr/bin/env bash
# One-time setup of a fresh Oracle Cloud Ubuntu 24.04 (ARM64) server for Consultancy Pro.
# Run as the default "ubuntu" user:  bash server-bootstrap.sh
# Safe to run again (each step checks what is already done).
set -euo pipefail

QE_ROOT=/opt/qe
REPO_SSH=git@github.com:qiamit/Consultancy-Management.git

echo "== Packages and automatic security updates"
sudo timedatectl set-timezone Asia/Kolkata
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg git attr jq unattended-upgrades fail2ban netfilter-persistent iptables-persistent rclone
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker (official repository)"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "== Node.js 22 (for the migration and backup scripts)"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "== Firewall: open 80/443 (Oracle Ubuntu images reject everything except SSH by default)"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
if ! sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
fi
sudo netfilter-persistent save

echo "== Swap (4 GB safety margin)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== SSH protection (fail2ban)"
sudo systemctl enable --now fail2ban

echo "== Folders"
sudo mkdir -p "$QE_ROOT"/data/{db,storage,web,caddy} "$QE_ROOT"/backups
sudo chown -R "$USER":"$USER" "$QE_ROOT"

echo "== GitHub read-only deploy key"
if [ ! -f ~/.ssh/github_deploy ]; then
  ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "oracle-qe-deploy" -q
  cat >> ~/.ssh/config <<'CFG'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
CFG
  chmod 600 ~/.ssh/config
fi
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts

if [ ! -d "$QE_ROOT/app/.git" ]; then
  if git clone "$REPO_SSH" "$QE_ROOT/app" 2>/dev/null; then
    echo "Repository cloned to $QE_ROOT/app"
  else
    echo
    echo "Add this key in GitHub → qiamit/Consultancy-Management → Settings → Deploy keys (read-only), then run this script again:"
    cat ~/.ssh/github_deploy.pub
    exit 0
  fi
fi

echo "== Nightly backup at 02:30 IST"
CRON_LINE="30 2 * * * bash $QE_ROOT/app/deploy/oracle/scripts/backup.sh >> $QE_ROOT/backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'deploy/oracle/scripts/backup.sh' ; echo "$CRON_LINE" ) | crontab -

echo
echo "Done. Log out and back in once (docker group), then copy deploy/oracle/.env to $QE_ROOT/app/deploy/oracle/.env"
