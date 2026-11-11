#!/usr/bin/env bash
# Standards Library: copy the Mac's "Oracle Database" folder and index what is new or changed.
#
#   standards-sync.sh server [--weekly] [--dry-run] [--allow-many-removals]   Mac -> live server, then index there
#   standards-sync.sh local  [indexer args]                                  Mac -> Local Host test copy (tc.sh)
#   standards-sync.sh poll [server|local]                                    run a "Sync Now" asked in the app
#   standards-sync.sh install-schedule | remove-schedule                     Sunday 10 pm + the 10-minute check
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
POLL_LABEL=$LABEL.poll
POLL_PLIST=$HOME/Library/LaunchAgents/$POLL_LABEL.plist
LOCK=${TMPDIR:-/tmp}/qe-standards-sync.lock

stop() { echo "STOP: $*" >&2; exit 1; }
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20)
EXCLUDES=(--exclude '.*' --exclude '~$*')

count_pdfs() { find "$SRC" -type f -iname '*.pdf' ! -name '.*' | wc -l | tr -d ' '; }

# Files OneDrive has not downloaded to this Mac yet ("dataless"): reading them can hang, so they are left out of
# this copy (the server keeps its older copy) and come with the next run.
not_downloaded() {
  NOT_HERE=$(mktemp)
  (cd "$SRC" && find . -type f -flags +dataless 2>/dev/null | sed 's|^\.|/|; s|^//|/|') > "$NOT_HERE"
  if [ -s "$NOT_HERE" ]; then
    echo "Not yet on this Mac (OneDrive still downloading), left for the next run: $(wc -l < "$NOT_HERE" | tr -d ' ')"
    sed 's|^/|  |' "$NOT_HERE" | head -10
  fi
  EXCLUDES+=(--exclude-from="$NOT_HERE")
}

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
        --app) TRIGGER=app ;;
        --dry-run) DRY=1 ;;
        --allow-many-removals) ALLOW=1 ;;
        *) stop "unknown option: $a" ;;
      esac
    done
    mkdir "$LOCK" 2>/dev/null || stop "another standards-sync is still running ($LOCK)"
    trap 'rmdir "$LOCK"' EXIT
    echo "== $(date '+%Y-%m-%d %H:%M') standards-sync server ($TRIGGER)"
    check_source
    not_downloaded
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

  poll)
    # "Sync Now" in the app (Settings -> Standards Library) only records a request in the database. This check runs
    # every 10 minutes on the Mac: it tells the server the Mac is there, takes the oldest waiting request, runs the
    # sync and writes the result back. Nothing happens when no request waits.
    WHERE=${2:-server}
    case "$WHERE" in server|local) ;; *) stop "poll takes server or local" ;; esac
    sql() {
      if [ "$WHERE" = local ]; then
        docker exec -i qe-test-db-1 psql -U supabase_admin -d postgres -Atq -v ON_ERROR_STOP=1
      else
        "${SSH[@]}" "$SERVER" "cd /opt/qe/app && docker compose -f deploy/oracle/docker-compose.yml --env-file deploy/oracle/.env \
          exec -T db psql -U supabase_admin -d postgres -Atq -v ON_ERROR_STOP=1"
      fi
    }
    AGENT_HOST=$(scutil --get ComputerName 2>/dev/null || hostname -s)
    AGENT_HOST=${AGENT_HOST//\'/}
    # A sync already running here (the weekly one, or one started by hand): leave the request for the next check.
    BUSY=0; [ -d "$LOCK" ] && BUSY=1
    ID=$(sql <<SQL
INSERT INTO public.standard_sync_agent (id, host, last_seen) VALUES (1, '$AGENT_HOST', now())
  ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host, last_seen = now();
UPDATE public.standard_sync_requests
   SET status = 'failed', finished_at = now(), message = 'No Result From the Mac Within 6 Hours.'
 WHERE status = 'running' AND picked_at < now() - interval '6 hours';
UPDATE public.standard_sync_requests SET status = 'running', picked_at = now()
 WHERE $BUSY = 0 AND id = (SELECT id FROM public.standard_sync_requests WHERE status = 'pending'
                            ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING id;
SQL
    ) || stop "database not reachable"
    ID=$(printf '%s\n' "$ID" | grep -E '^[0-9]+$' | tail -1 || true)
    [ -n "$ID" ] || exit 0
    echo "== $(date '+%Y-%m-%d %H:%M') Sync Now request $ID ($WHERE)"
    OUT=$(mktemp)
    RC=0
    if [ "$WHERE" = local ]; then "$0" local --trigger app > "$OUT" 2>&1 || RC=$?; else "$0" server --app > "$OUT" 2>&1 || RC=$?; fi
    cat "$OUT"
    # The indexer's summary line ("done: added …") or the reason the run stopped.
    MSG=$(grep -E '^(done:|STOP:)' "$OUT" | tail -1 || true)
    [ -n "$MSG" ] || MSG=$(grep -v '^\s*$' "$OUT" | tail -1 || true)
    rm -f "$OUT"
    MSG=$(printf '%s' "${MSG:-No Output}" | cut -c1-500 | sed "s/'/''/g")
    STATUS=done; [ "$RC" -eq 0 ] || STATUS=failed
    printf "UPDATE public.standard_sync_requests SET status = '%s', finished_at = now(), message = '%s' WHERE id = %s;\n" \
      "$STATUS" "$MSG" "$ID" | sql || stop "could not write the result of request $ID"
    echo "Request $ID: $STATUS"
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
    # Every 10 minutes: run a "Sync Now" asked in the app (a Mac that is asleep checks at the next wake).
    cat > "$POLL_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$POLL_LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUN</string><string>poll</string><string>server</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOGDIR/poll.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/poll.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$POLL_LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$POLL_PLIST"
    echo "Scheduled: every Sunday 10 pm (log: $LOGDIR/sync.log)"
    echo "Scheduled: Sync Now check every 10 minutes (log: $LOGDIR/poll.log)"
    ;;

  remove-schedule)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootout "gui/$(id -u)/$POLL_LABEL" 2>/dev/null || true
    rm -f "$PLIST" "$POLL_PLIST"
    echo "Schedules removed."
    ;;

  *)
    sed -n 2,10p "$0"; exit 1 ;;
esac
