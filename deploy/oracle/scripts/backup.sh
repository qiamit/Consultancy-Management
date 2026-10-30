#!/usr/bin/env bash
# Nightly backup on the Oracle server (cron 02:30 IST, installed by server-bootstrap.sh):
#   - full database dump every night, kept 14 days;
#   - files (storage) snapshot every Sunday, kept 4 weeks;
#   - off the server when BACKUP_RCLONE_REMOTE is set (an rclone crypt remote over the Oracle Object Storage bucket,
#     see README): every night's dump (kept 30 days there) and a daily sync of the files — changed or deleted files
#     move to files-old/<date> (kept 60 days), so a deletion on the server never wipes the off-site copy.
set -euo pipefail

ORACLE=/opt/qe/app/deploy/oracle
set -a
# shellcheck disable=SC1091
. "$ORACLE/.env"
set +a
compose() { docker compose -f "$ORACLE/docker-compose.yml" --env-file "$ORACLE/.env" "$@"; }

STAMP=$(date +%Y-%m-%d_%H%M)
DB_DIR="$BACKUP_DIR/db"
FILES_DIR="$BACKUP_DIR/files"
mkdir -p "$DB_DIR" "$FILES_DIR"

echo "[$(date)] database dump"
compose exec -T db pg_dump -U supabase_admin -d postgres -Fc \
  -n public -n private -n auth -n storage -n vault > "$DB_DIR/qe-$STAMP.dump.part"
mv "$DB_DIR/qe-$STAMP.dump.part" "$DB_DIR/qe-$STAMP.dump"
find "$DB_DIR" -name 'qe-*.dump' -mtime +14 -delete
# Content-Type / Cache-Control of every stored file live in xattrs, which the off-site file sync cannot carry:
# keep a list to put back after a restore (cd "$DATA_DIR" && sudo setfattr --restore=<list>).
(cd "$DATA_DIR" && sudo getfattr -R -d -m '^user\.' storage) | gzip > "$DB_DIR/xattrs-$STAMP.txt.gz"
find "$DB_DIR" -name 'xattrs-*.txt.gz' -mtime +14 -delete

if [ "$(date +%u)" = "7" ]; then
  echo "[$(date)] files snapshot"
  # Files belong to the storage-api container user, so read them with sudo.
  sudo tar --xattrs --xattrs-include='user.*' -czf "$FILES_DIR/files-$STAMP.tar.gz.part" -C "$DATA_DIR" storage
  sudo chown "$(id -u):$(id -g)" "$FILES_DIR/files-$STAMP.tar.gz.part"
  mv "$FILES_DIR/files-$STAMP.tar.gz.part" "$FILES_DIR/files-$STAMP.tar.gz"
  find "$FILES_DIR" -name 'files-*.tar.gz' -mtime +28 -delete
fi

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  REMOTE="${BACKUP_RCLONE_REMOTE%/}"
  echo "[$(date)] copy off the server → $REMOTE"
  rclone copy "$DB_DIR" "$REMOTE/db" --include 'qe-*.dump' --include 'xattrs-*.txt.gz' --max-age 3d
  rclone delete "$REMOTE/db" --min-age 30d
  # Vault root key: without it the vault.secrets rows in the dumps cannot be decrypted.
  sudo rclone --config "$HOME/.config/rclone/rclone.conf" copy "${SECRETS_DIR:-/opt/qe/secrets}/pgsodium_root.key" "$REMOTE/keys"
  # Storage files belong to the container user, so sudo reads them with this user's rclone config.
  sudo rclone --config "$HOME/.config/rclone/rclone.conf" sync "$DATA_DIR/storage" "$REMOTE/files" \
    --backup-dir "$REMOTE/files-old/$STAMP" --transfers 4
  # files-old/<stamp> folders go by their date (a file's own time can be years old).
  CUTOFF=$(date -d '60 days ago' +%Y-%m-%d)
  { rclone lsf --dirs-only "$REMOTE/files-old" 2>/dev/null || true; } | while read -r d; do
    if [[ "${d%%_*}" < "$CUTOFF" ]]; then rclone purge "$REMOTE/files-old/${d%/}"; fi
  done
fi

df -h "$BACKUP_DIR" | tail -1
echo "[$(date)] backup done"
