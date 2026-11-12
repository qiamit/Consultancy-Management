#!/usr/bin/env bash
# Standards Library: copy the Mac's "Oracle Database" folder and index what is new or changed.
#
#   standards-sync.sh server [--weekly] [--dry-run] [--allow-many-removals]   Mac -> live server, then index there
#   standards-sync.sh local  [indexer args]                                  Mac -> Local Host test copy (tc.sh)
#   standards-sync.sh poll [server|local]                                    run a "Sync Now" asked in the app
#   standards-sync.sh server-status [--wait]                                 the last indexing run on the server
#   standards-sync.sh install-schedule | remove-schedule                     Sunday 10 pm + the 10-minute check
#
# One way only: the Mac folder is the master. A file deleted or replaced on the Mac is kept on the server in
# /opt/qe/standards/removed/<date>/, never lost. The run stops (nothing copied) when the folder looks empty or
# when more than 50 files and 10 % of the library would be removed at once; --allow-many-removals overrides that.
#
# The indexing runs on the server by itself (a first run takes hours): the Mac starts it, then checks every minute
# with a short SSH call. A dropped connection or a Mac going to sleep does not stop it; the Mac keeps checking and
# `server-status` shows the result later.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
SRC=${STANDARDS_SRC:-"$HOME/Library/CloudStorage/OneDrive-Personal/Documents/All Standards Databse/Oracle Database"}
SERVER=${QE_SERVER:-ubuntu@129.225.118.1}
KEY=${QE_SERVER_KEY:-$HOME/.ssh/qe_oracle}
REMOTE_BASE=${QE_REMOTE_BASE:-/opt/qe/standards}
REMOTE_APP=${QE_REMOTE_APP:-/opt/qe/app}
REMOTE_LIB=$REMOTE_BASE/library
REMOTE_REMOVED=$REMOTE_BASE/removed
REMOTE_RUNS=$REMOTE_BASE/runs
COMPOSE="docker compose -f deploy/oracle/docker-compose.yml --env-file deploy/oracle/.env"
WAIT_EVERY=${QE_WAIT_EVERY:-60}          # seconds between checks on a running index
WAIT_MAX_FAILS=${QE_WAIT_MAX_FAILS:-30}  # checks in a row the server may be unreachable (30 min)
WAIT_MAX_HOURS=${QE_WAIT_MAX_HOURS:-10}
LOGDIR=$HOME/Library/Logs/qe-standards
LABEL=in.qengineering.standards-sync
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
POLL_LABEL=$LABEL.poll
POLL_PLIST=$HOME/Library/LaunchAgents/$POLL_LABEL.plist
LOCK=${TMPDIR:-/tmp}/qe-standards-sync.lock

stop() { echo "STOP: $*" >&2; exit 1; }
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=4"
# shellcheck disable=SC2206
SSH=(ssh -i "$KEY" $SSH_OPTS)
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

# --- Indexing on the server, detached from the SSH session ---------------------------------------------------------
# Each run keeps <id>.pid, <id>.log and, when it ends, <id>.rc (the indexer's exit code) in $REMOTE_RUNS.

# Prints "BUSY <id>" when an earlier run is still going, else starts a new run and prints "STARTED <id>".
REMOTE_START='set -eu
RUNS=$1; ID=$2; TRIGGER=$3; APP=$4; shift 4; COMPOSE="$*"
mkdir -p "$RUNS"
for p in "$RUNS"/*.pid; do
  [ -e "$p" ] || continue
  b=${p%.pid}
  if [ ! -e "$b.rc" ] && kill -0 "$(cat "$p")" 2>/dev/null; then echo "BUSY $(basename "$b")"; exit 0; fi
done
[ "$ID" = "-" ] && { echo "IDLE"; exit 0; }
ls -t "$RUNS"/*.log 2>/dev/null | tail -n +21 | while read -r f; do rm -f "${f%.log}".*; done
cd "$APP"
setsid nohup bash -c "$COMPOSE --profile tools run --rm --build -T standards-indexer --trigger $TRIGGER --host Server \
  > \"$RUNS/$ID.log\" 2>&1; echo \$? > \"$RUNS/$ID.rc\"" < /dev/null > /dev/null 2>&1 &
echo $! > "$RUNS/$ID.pid"
echo "STARTED $ID"'

# Prints the log lines after line <from>, then "@@ LINES <n>" and "@@ RC <code>", "@@ RUNNING" or "@@ LOST".
# With <hb> = 1 it also records the Mac's check for the app (Sync Now), as the 10-minute check cannot run meanwhile.
REMOTE_STATUS='set -u
RUNS=$1; ID=$2; FROM=$3; HB=$4; APP=$5; shift 5; COMPOSE="$*"
[ "$ID" = "-" ] && ID=$(ls -t "$RUNS"/*.log 2>/dev/null | head -1 | xargs -r basename | sed "s/\.log$//")
[ -n "$ID" ] || { echo "@@ NONE"; exit 0; }
echo "@@ ID $ID"
f="$RUNS/$ID.log"; n=0
[ -e "$f" ] && n=$(wc -l < "$f" | tr -d " ")
[ "$n" -gt "$FROM" ] && sed -n "$((FROM + 1)),${n}p" "$f"
echo "@@ LINES $n"
if [ -e "$RUNS/$ID.rc" ]; then echo "@@ RC $(cat "$RUNS/$ID.rc")"
elif kill -0 "$(cat "$RUNS/$ID.pid" 2>/dev/null || echo 0)" 2>/dev/null; then echo "@@ RUNNING"
else echo "@@ LOST"; fi
if [ "$HB" != "-" ]; then
  cd "$APP" && echo "UPDATE public.standard_sync_agent SET last_seen = now() WHERE id = 1;" \
    | $COMPOSE exec -T db psql -U supabase_admin -d postgres -Atq >/dev/null 2>&1 || true
fi'

remote() { local script=$1; shift; "${SSH[@]}" "$SERVER" bash -s -- "$@" <<< "$script"; }
build_noise() { grep -v '^#\|^ *=>\|Step ' || true; }

# Follows run <id> ("-" = the latest) until it ends; returns the indexer's exit code.
wait_server_run() {
  local id=$1 from=0 fails=0 started out line state hb
  started=$(date +%s)
  hb=-; [ -z "${QE_SYNC_HEARTBEAT:-}" ] || hb=1
  while :; do
    if out=$(remote "$REMOTE_STATUS" "$REMOTE_RUNS" "$id" "$from" "$hb" "$REMOTE_APP" "$COMPOSE" 2>/dev/null); then
      fails=0
      printf '%s\n' "$out" | grep -v '^@@ ' | build_noise
      line=$(printf '%s\n' "$out" | grep '^@@ ID ' | tail -1 || true); [ -z "$line" ] || id=${line#@@ ID }
      line=$(printf '%s\n' "$out" | grep '^@@ LINES ' | tail -1 || true); [ -z "$line" ] || from=${line#@@ LINES }
      state=$(printf '%s\n' "$out" | grep -E '^@@ (RC|RUNNING|LOST|NONE)' | tail -1 || true)
      case "$state" in
        "@@ RC "*) return "${state#@@ RC }" ;;
        "@@ LOST") stop "the indexing on the server ended without a result (server restarted?). Run the sync again." ;;
        "@@ NONE") stop "no indexing run found on the server" ;;
      esac
    else
      fails=$((fails + 1))
      echo "Server not reachable (check $fails of $WAIT_MAX_FAILS); the indexing keeps running there."
      [ "$fails" -lt "$WAIT_MAX_FAILS" ] ||
        stop "server not reachable for $fails checks. The indexing may still be running: see 'standards-sync.sh server-status'."
    fi
    [ $(( $(date +%s) - started )) -lt $((WAIT_MAX_HOURS * 3600)) ] ||
      stop "indexing still running after $WAIT_MAX_HOURS hours: see 'standards-sync.sh server-status'."
    sleep "$WAIT_EVERY"
  done
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
    "${SSH[@]}" "$SERVER" "mkdir -p $REMOTE_LIB $REMOTE_REMOVED $REMOTE_RUNS" || stop "server not reachable"
    # An earlier indexing still running there (its Mac connection dropped): let it finish before copying again.
    BUSY=$(remote "$REMOTE_START" "$REMOTE_RUNS" - - "$REMOTE_APP" "$COMPOSE") || stop "server not reachable"
    case "$BUSY" in
      "BUSY "*) [ -z "$DRY" ] || stop "an indexing run is still going on the server (${BUSY#BUSY }); try later."
                echo "An earlier indexing run is still going on the server (${BUSY#BUSY }); waiting for it…"
                wait_server_run "${BUSY#BUSY }" || echo "That run ended with code $?; going on." ;;
    esac
    RS=(rsync -a --delete "${EXCLUDES[@]}" -e "ssh -i $KEY $SSH_OPTS")
    # What would be removed on the server, before anything is copied.
    check_removals() {
      GONE=$("${RS[@]}" -n --itemize-changes "$SRC/" "$SERVER:$REMOTE_LIB/" | grep -c '^\*deleting.*\.pdf$' || true)
      echo "PDFs the server copy would remove: $GONE"
      if [ -z "$ALLOW" ] && [ "$GONE" -gt 50 ] && [ $((GONE * 10)) -gt "$N" ]; then
        stop "$GONE PDFs would be removed at once. Check the folder; if it is meant, run again with --allow-many-removals."
      fi
    }
    check_removals
    if [ -n "$DRY" ]; then
      "${RS[@]}" -n --itemize-changes "$SRC/" "$SERVER:$REMOTE_LIB/" | grep -i '\.pdf$' | head -40
      "${SSH[@]}" "$SERVER" "cd $REMOTE_APP && $COMPOSE --profile tools run --rm -T standards-indexer --dry-run" \
        | grep -v '^  read:' || true
      exit 0
    fi
    # Files moved in the folder while copying (rsync 23/24) or a dropped connection: copy again, up to 3 times.
    TRY=1
    while :; do
      RC=0
      "${RS[@]}" --backup --backup-dir="$REMOTE_REMOVED/$(date +%F)" "$SRC/" "$SERVER:$REMOTE_LIB/" || RC=$?
      [ "$RC" -ne 0 ] || break
      case "$RC" in
        23|24) WHY="files changed or moved in the folder while copying" ;;
        10|12|30|35|255) WHY="the connection dropped" ;;
        *) stop "copy failed (rsync $RC)" ;;
      esac
      [ "$TRY" -lt 3 ] || stop "copy did not finish after 3 tries ($WHY, rsync $RC)"
      echo "Copy try $TRY: $WHY (rsync $RC). Copying again in 1 minute…"
      TRY=$((TRY + 1)); sleep "${QE_RETRY_WAIT:-60}"
      check_removals
    done
    RUN_ID=$(date +%Y%m%d-%H%M%S)-$TRIGGER
    STARTED=$(remote "$REMOTE_START" "$REMOTE_RUNS" "$RUN_ID" "$TRIGGER" "$REMOTE_APP" "$COMPOSE") ||
      stop "could not start the indexing on the server"
    case "$STARTED" in
      "STARTED "*) ;;
      "BUSY "*) stop "another indexing run started on the server meanwhile (${STARTED#BUSY })" ;;
      *) stop "could not start the indexing on the server: $STARTED" ;;
    esac
    echo "Copied. Indexing on the server (run $RUN_ID); it goes on even if this Mac disconnects…"
    RC=0; wait_server_run "$RUN_ID" || RC=$?
    [ "$RC" -eq 0 ] || stop "the indexer ended with code $RC (log on the server: $REMOTE_RUNS/$RUN_ID.log)"
    ;;

  server-status)
    # The last indexing run on the server; --wait follows it to the end.
    if [ "${2:-}" = "--wait" ]; then RC=0; wait_server_run - || RC=$?; echo "Exit code: $RC"; exit "$RC"; fi
    OUT=$(remote "$REMOTE_STATUS" "$REMOTE_RUNS" - 0 - "$REMOTE_APP" "$COMPOSE") || stop "server not reachable"
    printf '%s\n' "$OUT" | grep -v '^@@ ' | build_noise | tail -15
    printf '%s\n' "$OUT" | grep -E '^@@ (ID|RC|RUNNING|LOST|NONE)' | sed 's/^@@ //'
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
        "${SSH[@]}" "$SERVER" "cd $REMOTE_APP && $COMPOSE exec -T db psql -U supabase_admin -d postgres -Atq -v ON_ERROR_STOP=1"
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
    if [ "$WHERE" = local ]; then "$0" local --trigger app > "$OUT" 2>&1 || RC=$?; else QE_SYNC_HEARTBEAT=1 "$0" server --app > "$OUT" 2>&1 || RC=$?; fi
    cat "$OUT"
    # The indexer's summary line ("done: added …") or the reason the run stopped.
    MSG=$(grep -E '^(done:|STOP:)' "$OUT" | tail -1 || true)
    [ -n "$MSG" ] || MSG=$(grep -v '^\s*$' "$OUT" | tail -1 || true)
    rm -f "$OUT"
    MSG=$(printf '%s' "${MSG:-No Output}" | cut -c1-500 | sed "s/'/''/g")
    STATUS=done; [ "$RC" -eq 0 ] || STATUS=failed
    # The server may be briefly unreachable: try for up to 10 minutes.
    for T in 1 2 3 4 5 6 7 8 9 10 11; do
      printf "UPDATE public.standard_sync_requests SET status = '%s', finished_at = now(), message = '%s' WHERE id = %s;\n" \
        "$STATUS" "$MSG" "$ID" | sql && break
      [ "$T" -lt 11 ] || stop "could not write the result of request $ID"
      sleep "${QE_RETRY_WAIT:-60}"
    done
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
