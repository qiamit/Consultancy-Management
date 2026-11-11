#!/usr/bin/env bash
# Standards Library: copy the Mac's "Oracle Database" folder and index what is new or changed.
#
#   standards-sync.sh server [--weekly] [--dry-run] [--allow-many-removals]   Mac -> live server, then index there
#   standards-sync.sh local  [indexer args]                                  Mac -> Local Host test copy (tc.sh)
#   standards-sync.sh install-schedule | remove-schedule                     the automatic run, Sunday 10 pm
#
# One way only: the Mac folder is the master. A file deleted or replaced on the Mac is kept on the server in
# /opt/qe/standards/removed/<date>/, never lost. The run stops (nothing copied) when the folder looks empty or
# when more than 50 files and 10 % of the library would be removed at once; --allow-many-removals overrides that.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
SRC=${STANDARDS_SRC:-"$HOME/Library/CloudStorage/OneDrive-Personal/Documents/All Standards Databse/Oracle Database"}
SERVER=${QE_SERVER:-ubuntu@129.225.118.1}
KEY=${QE_SERVER_KEY:-$HOME/.ssh/qe_oracle}
REMOTE_LIB=/opt/qe/standards/library
REMOTE_REMOVED=/opt/qe/standards/removed
LOGDIR=$HOME/Library/Logs/qe-standards
LABEL=in.qengineering.standards-sync
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
LOCK=${TMPDIR:-/tmp}/qe-standards-sync.lock

stop() { echo "STOP: $*" >&2; exit 1; }
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20)
EXCLUDES=(--exclude '.*' --exclude '~$*')

count_pdfs() { find "$SRC" -type f -iname '*.pdf' ! -name '.*' | wc -l | tr -d ' '; }

check_source() {
  [ -d "$SRC" ] || stop "library folder not found: $SRC"
  N=$(count_pdfs)
  [ "$N" -gt 0 ] || stop "the library folder has no PDFs (OneDrive not ready?). Nothing copied."
  echo "Library folder: $N PDFs"
}

case "${1:-}" in
  server)
    shift
    TRIGGER=manual DRY="" ALLOW=""
    for a in "$@"; do
      case "$a" in
        --weekly) TRIGGER=weekly ;;
        --dry-run) DRY=1 ;;
        --allow-many-removals) ALLOW=1 ;;
        *) stop "unknown option: $a" ;;
      esac
    done
    mkdir "$LOCK" 2>/dev/null || stop "another standards-sync is still running ($LOCK)"
    trap 'rmdir "$LOCK"' EXIT
    echo "== $(date '+%Y-%m-%d %H:%M') standards-sync server ($TRIGGER)"
    check_source
    "${SSH[@]}" "$SERVER" "mkdir -p $REMOTE_LIB $REMOTE_REMOVED" || stop "server not reachable"
    RS=(rsync -a --delete "${EXCLUDES[@]}" -e "ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=20")
    # What would be removed on the server, before anything is copied.
    GONE=$("${RS[@]}" -n --itemize-changes "$SRC/" "$SERVER:$REMOTE_LIB/" | grep -c '^\*deleting.*\.pdf$' || true)
    echo "PDFs the server copy would remove: $GONE"
    if [ -z "$ALLOW" ] && [ "$GONE" -gt 50 ] && [ $((GONE * 10)) -gt "$N" ]; then
      stop "$GONE PDFs would be removed at once. Check the folder; if it is meant, run again with --allow-many-removals."
    fi
    if [ -n "$DRY" ]; then
      "${RS[@]}" -n --itemize-changes "$SRC/" "$SERVER:$REMOTE_LIB/" | grep -i '\.pdf$' | head -40
      "${SSH[@]}" "$SERVER" "cd /opt/qe/app && docker compose -f deploy/oracle/docker-compose.yml --env-file deploy/oracle/.env \
        --profile tools run --rm -T standards-indexer --dry-run" | grep -v '^  read:' || true
      exit 0
    fi
    "${RS[@]}" --backup --backup-dir="$REMOTE_REMOVED/$(date +%F)" "$SRC/" "$SERVER:$REMOTE_LIB/"
    echo "Copied. Indexing on the server…"
    "${SSH[@]}" "$SERVER" "cd /opt/qe/app && docker compose -f deploy/oracle/docker-compose.yml --env-file deploy/oracle/.env \
      --profile tools run --rm --build -T standards-indexer --trigger $TRIGGER --host Server" 2>&1 | grep -v '^#\|^ *=>\|Step '
    ;;

  local)
    shift
    STANDARDS_SRC="$SRC" exec "$ROOT/deploy/test-copy/tc.sh" index-standards "$@"
    ;;

  install-schedule)
    mkdir -p "$LOGDIR" "$(dirname "$PLIST")" "$HOME/qe-standards"
    # A copy outside the repo checkout, so the schedule keeps working when a worktree is removed.
    RUN=$HOME/qe-standards/standards-sync.sh
    cp "$HERE/standards-sync.sh" "$RUN"; chmod +x "$RUN"
    # Sunday 10 pm; a Mac that is asleep then runs it at the next wake.
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUN</string><string>server</string><string>--weekly</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>22</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOGDIR/sync.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/sync.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Scheduled: every Sunday 10 pm (log: $LOGDIR/sync.log)"
    ;;

  remove-schedule)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Schedule removed."
    ;;

  *)
    sed -n 2,9p "$0"; exit 1 ;;
esac
