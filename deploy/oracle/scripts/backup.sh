#!/usr/bin/env bash
# Nightly backup on the Oracle server (cron 02:30 IST, installed by server-bootstrap.sh):
#   - full database dump every night, kept 14 days;
#   - files (storage) snapshot every Sunday, kept 4 weeks;
#   - optional copy off the server when BACKUP_RCLONE_REMOTE is set (e.g. Oracle Object Storage or Cloudflare R2).
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
  -n public -n private -n auth -n storage > "$DB_DIR/qe-$STAMP.dump.part"
mv "$DB_DIR/qe-$STAMP.dump.part" "$DB_DIR/qe-$STAMP.dump"
find "$DB_DIR" -name 'qe-*.dump' -mtime +14 -delete

if [ "$(date +%u)" = "7" ]; then
  echo "[$(date)] files snapshot"
  # Files belong to the storage-api container user, so read them with sudo.
  sudo tar --xattrs --xattrs-include='user.*' -czf "$FILES_DIR/files-$STAMP.tar.gz.part" -C "$DATA_DIR" storage
  sudo chown "$(id -u):$(id -g)" "$FILES_DIR/files-$STAMP.tar.gz.part"
  mv "$FILES_DIR/files-$STAMP.tar.gz.part" "$FILES_DIR/files-$STAMP.tar.gz"
  find "$FILES_DIR" -name 'files-*.tar.gz' -mtime +28 -delete
fi

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  echo "[$(date)] copy off the server → $BACKUP_RCLONE_REMOTE"
  rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --include 'db/**' --include 'files/**' --max-age 8d
fi

df -h "$BACKUP_DIR" | tail -1
echo "[$(date)] backup done"
