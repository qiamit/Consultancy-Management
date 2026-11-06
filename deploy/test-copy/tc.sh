#!/usr/bin/env bash
# Test copy of Consultancy Pro on this Mac (QE - Local Host). Prints no keys, passwords or client data.
#   tc.sh start-docker   start the Docker engine (Colima; shared with the LIMS test copy, kept apart by name)
#   tc.sh settings       write this copy's own keys (once)
#   tc.sh up             build the web app, then build and start everything
#   tc.sh web            build the web app only (after a frontend change), served at http://127.0.0.1:8090
#   tc.sh down           stop, keeping the data
#   tc.sh status         what is running
#   tc.sh use-frontend   write frontend/web/.env.testcopy, for npm run dev on port 5177 (mode testcopy)
#   tc.sh migrate        apply this checkout's new database migrations to the test copy
#   tc.sh fetch          LIVE SERVER: read-only copy, masked in memory, kept in local/ (asks first)
#   tc.sh fetch real     the same, but names and contact details stay real (sign-ins, secrets, mail still removed)
#   tc.sh load           replace this copy's database with the newest saved copy (masked or real)
#   tc.sh placeholders   put a placeholder file behind every stored-file record
#   tc.sh refresh [real] fetch, load, up and placeholders in one go (asks first, like fetch)
#   tc.sh code <user-01> current two-step code of a test account set up here (local/test-2fa-<user>.txt)
#   tc.sh wipe           remove this copy's containers and volumes
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.local/lima/bin:$PATH"
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
LOCAL=$HERE/local
ENVF=$LOCAL/.env
PROJECT=qe-test
DB_IMAGE=supabase/postgres:17.6.1.136
SERVER=ubuntu@129.225.118.1
SERVER_KEY=$HOME/.ssh/qe_oracle
SCHEMAS="-n public -n private -n auth -n storage"
stop() { echo "STOP: $*" >&2; exit 1; }
val() { sed -n "s/^$1=//p" "$ENVF"; }
guard() {
  [ "$(docker context show 2>/dev/null)" = colima ] || stop "Docker is not on the Colima engine of this Mac: run tc.sh start-docker"
  [ -s "$ENVF" ] || stop "no settings: run tc.sh settings"
  [ "$(val TEST_COPY)" = qe ] || stop "$ENVF is not this test copy's settings file"
}
C() { docker compose -p "$PROJECT" --env-file "$ENVF" -f "$HERE/../oracle/docker-compose.yml" -f "$HERE/compose.override.yml" "$@"; }
wait_db() { for _ in $(seq 1 90); do [ "$(C ps db --format '{{.Health}}' 2>/dev/null)" = healthy ] && return 0; sleep 2; done; stop "the database did not start"; }
psql_db() { C exec -T -e PGOPTIONS='-c client_min_messages=warning' db psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 "$@"; }

case "${1:-}" in
  start-docker)
    colima status >/dev/null 2>&1 || colima start --vm-type vz --arch aarch64 --cpu 4 --memory 8 --disk 60 --mount-type virtiofs
    docker context use colima >/dev/null; echo "Docker engine running." ;;
  settings) python3 "$HERE/make-settings.py" ;;
  web)
    guard
    [ -d "$ROOT/frontend/web/node_modules" ] || (cd "$ROOT/frontend/web" && npm ci --no-audit --no-fund --loglevel=error)
    (cd "$ROOT/frontend/web" && VITE_SUPABASE_URL=http://127.0.0.1:54331 VITE_SUPABASE_ANON_KEY="$(val ANON_KEY)" \
      VITE_PDF_SERVICE_URL=http://127.0.0.1:3857/pdf npx vite build --logLevel error --outDir "$LOCAL/web" --emptyOutDir)
    echo "Web app built for the test copy: http://127.0.0.1:8090" ;;
  up)
    guard
    [ -f "$LOCAL/web/index.html" ] || "$0" web
    C up -d --build --remove-orphans; "$0" status ;;
  down) guard; C stop; echo "Stopped. Data kept." ;;
  status) guard; C ps --format '{{.Service}}: {{.State}} {{.Health}}'
    echo "App http://127.0.0.1:8090  API http://127.0.0.1:54331  PDF http://127.0.0.1:3857  (this Mac only)" ;;
  use-frontend)
    guard
    F=$ROOT/frontend/web/.env.testcopy
    { echo "# Test copy on this Mac, written by deploy/test-copy/tc.sh. Not the live app."
      echo "# Used by: npm run dev --prefix frontend/web -- --mode testcopy --port 5177"
      echo "VITE_SUPABASE_URL=http://127.0.0.1:54331"
      echo "VITE_SUPABASE_ANON_KEY=$(val ANON_KEY)"
      echo "VITE_PDF_SERVICE_URL=http://127.0.0.1:3857/pdf"; } > "$F"
    chmod 600 "$F"; echo "frontend/web/.env.testcopy written. Start the dev server in mode testcopy on port 5177." ;;
  migrate)
    guard
    (cd "$ROOT" && [ -d node_modules/pg ] || npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null)
    DATABASE_URL="postgres://supabase_admin:$(val POSTGRES_PASSWORD)@127.0.0.1:54332/postgres" node "$ROOT/backend/scripts/apply-migrations.mjs" ;;
  fetch)
    guard
    case "${2:-}" in real) MODE=real ;; "") MODE=masked ;; *) stop "fetch takes no option but real" ;; esac
    if [ "$MODE" = real ]; then cat <<MSG
This reads the LIVE Consultancy Pro database on the Oracle server, read only, and writes nothing there.
REAL DATA, NOT MASKED: client names, contacts, emails and phone numbers are saved as they are in $LOCAL
(this Mac only). Sign-ins get the test password; sessions, authenticators, stored secrets, mail and connector
tokens are still removed. If any check fails, nothing is saved. Stored files are never copied.
MSG
    else cat <<MSG
This reads the LIVE Consultancy Pro database on the Oracle server, read only, and writes nothing there.
Real data stays in the memory of a throwaway container with no network, is masked there, and only the masked
copy is saved in $LOCAL. If any check fails, nothing is saved. Stored files are never copied.
MSG
    fi
    if [ -t 0 ]; then read -r -p "Type COPY to continue: " A; [ "$A" = COPY ] || stop "not confirmed"; fi
    [ -t 0 ] || [ "${TC_CONFIRM:-}" = yes ] || stop "needs a terminal, or TC_CONFIRM=yes"
    RAW=qe-tc-raw; D=$(date +%F)
    trap 'docker rm -f -v qe-tc-raw >/dev/null 2>&1 || true; rm -f "$LOCAL/mask.log" "$LOCAL/restore.err"' EXIT
    (umask 077; : > "$LOCAL/fetch-last.log"); exec > >(tee "$LOCAL/fetch-last.log") 2>&1
    echo "fetch started $(date '+%F %T') ($MODE)"
    docker rm -f -v "$RAW" >/dev/null 2>&1 || true
    docker run -d --name "$RAW" --network none --tmpfs /var/lib/postgresql/data:size=6g -e POSTGRES_PASSWORD=throwaway "$DB_IMAGE" >/dev/null
    for _ in $(seq 1 90); do docker exec "$RAW" pg_isready -q -U postgres -h localhost 2>/dev/null && break; sleep 2; done; sleep 3
    docker exec "$RAW" pg_isready -q -U postgres -h localhost || stop "the throwaway database did not start"
    RQ() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$RAW" psql -U supabase_admin -d postgres -q "$@"; }
    remote() { ssh -n -i "$SERVER_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 "$SERVER" "cd /opt/qe/app/deploy/oracle && DB=\$(docker compose --env-file .env ps -q db) && docker exec -e PGOPTIONS='-c default_transaction_read_only=on' \"\$DB\" $1"; }
    if [ -n "${TC_FAKE_SERVER:-}" ]; then
      # Test of this script only: a local script stands in for the server, so no key or server is used.
      remote() { "$TC_FAKE_SERVER" "$1"; }
      echo "Server key accepted (test: no server)."
    else
      [ -r "$SERVER_KEY" ] || stop "no server key on this Mac ($SERVER_KEY)"
      ssh -i "$SERVER_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 "$SERVER" true 2>/dev/null \
        || stop "the server did not accept the key; run tc.sh fetch from the Mac's Terminal app, or check the key"
      echo "Server key accepted."
    fi
    echo "Preparing the throwaway database..."
    EXT=$(remote "psql -U supabase_admin -d postgres -tAc \"select format('create extension if not exists %I with schema %I;', e.extname, n.nspname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where n.nspname in ('public', 'extensions') order by e.extname\"")
    printf '%s\n' "drop schema if exists private cascade; drop schema if exists public cascade; drop schema if exists auth cascade;" \
      "drop schema if exists storage cascade; create schema public;" "$EXT" | RQ >/dev/null
    echo "Copying the database into memory..."
    # Compressed plain SQL, used only if gzip checks it and it ends with pg_dump's closing line. Padding after
    # the data may be cut instead of the data (a long docker exec output can lose its last bytes). 3 tries.
    R=1
    for TRY in 1 2 3; do
      set +e; remote "sh -c 'pg_dump -U supabase_admin -d postgres $SCHEMAS --no-comments | gzip -1; head -c 4194304 /dev/zero'" \
        | docker exec -i "$RAW" sh -c 'cat > /tmp/db.sql.gz'; RC=("${PIPESTATUS[@]}"); set -e
      [ "${RC[0]}" = 0 ] && [ "${RC[1]}" = 0 ] || { echo "Try $TRY: the read from the server failed (exit ${RC[0]}/${RC[1]})."; continue; }
      echo "Try $TRY: copy received, $(docker exec "$RAW" du -k /tmp/db.sql.gz | cut -f1) KB."
      if ! docker exec "$RAW" sh -c 'gzip -t /tmp/db.sql.gz 2>/dev/null; gzip -dc /tmp/db.sql.gz 2>/dev/null | tail -n 5 | grep -q "PostgreSQL database dump complete"'; then
        echo "Try $TRY: the copy is incomplete."; docker exec "$RAW" rm -f /tmp/db.sql.gz; continue
      fi
      # The schema public is made beforehand (extensions such as citext live in it), so its CREATE line is skipped.
      set +e; docker exec -e PGOPTIONS='-c client_min_messages=warning' "$RAW" sh -c 'gzip -dc /tmp/db.sql.gz 2>/dev/null | sed "/^CREATE SCHEMA public;\$/d" | psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 >/dev/null' 2>"$LOCAL/restore.err"; R=$?; set -e
      docker exec "$RAW" rm -f /tmp/db.sql.gz
      echo "Restore exit $R, $(grep -c 'ERROR' "$LOCAL/restore.err") errors."
      { grep 'ERROR' "$LOCAL/restore.err" || true; } | sed -E 's/: ".*/: <value hidden>/' | cut -c1-170 | head -12 || true
      rm -f "$LOCAL/restore.err"
      [ "$R" = 0 ] && break
      printf '%s\n' "drop schema if exists private cascade; drop schema if exists public cascade; drop schema if exists auth cascade;" \
        "drop schema if exists storage cascade; create schema public;" "$EXT" | RQ >/dev/null
    done
    [ "$R" = 0 ] || stop "no clean copy after 3 tries; nothing saved"
    if [ "$MODE" = real ]; then echo "Removing sign-ins, secrets and mail (names and contacts stay real)..."; MASKING=off; else echo "Masking..."; MASKING=on; fi
    set +e
    docker exec -i "$RAW" psql -U supabase_admin -d postgres -q -v masking=$MASKING -v test_password="$(tr -d '\n' < "$LOCAL/test-password.txt")" < "$HERE/mask.sql" > "$LOCAL/mask.log" 2>&1; M=$?
    set -e
    { grep -E '^(ok |FAILED|map:|emptied:|test accounts|setting columns|changed: )' "$LOCAL/mask.log" || true; } | cut -c1-100
    [ "$M" = 0 ] || { { grep -E '(psql:|ERROR)' "$LOCAL/mask.log" || tail -3 "$LOCAL/mask.log"; } | sed -E 's/: ".*/: <value hidden>/; s/(for type [a-z ]+|value|key|string|Key \(|row contains): .*/\1: <value hidden>/; s/(DETAIL|CONTEXT): .*/\1: <hidden>/' | cut -c1-200; stop "masking failed (exit $M); nothing saved"; }
    ! grep -q '^FAILED' "$LOCAL/mask.log" || stop "a check failed; nothing saved"
    cp "$LOCAL/mask.log" "$LOCAL/mask-$D.log"; chmod 600 "$LOCAL/mask-$D.log"
    RQ -At -F ' | ' -c "select u.email, coalesce(p.role, '-'), coalesce(p.full_name, '-') from auth.users u left join public.user_profiles p on p.id = u.id order by 2, 1" > "$LOCAL/test-accounts.txt"
    RQ -c 'set client_min_messages = warning' -c 'drop schema mask cascade'
    docker exec "$RAW" pg_dump -U supabase_admin -d postgres $SCHEMAS -Fc -f /tmp/masked.dump
    (umask 077; docker exec "$RAW" cat /tmp/masked.dump > "$LOCAL/$MODE-$D.dump"; printf '%s\n' "$EXT" > "$LOCAL/$MODE-$D.extensions.sql")
    chmod 600 "$LOCAL/test-accounts.txt"
    echo "Saved: $MODE-$D.dump ($(du -h "$LOCAL/$MODE-$D.dump" | cut -f1)). Now: tc.sh load" ;;
  load)
    guard
    DUMP=$(ls -t "$LOCAL"/masked-*.dump "$LOCAL"/real-*.dump 2>/dev/null | head -1 || true); [ -n "$DUMP" ] || stop "no saved copy yet: tc.sh fetch"
    # Nothing may write while the data is loaded; the database itself keeps its own roles and Vault.
    C stop auth storage rest functions mcp pdf caddy >/dev/null 2>&1 || true
    C up -d db >/dev/null 2>&1; wait_db
    { echo "drop schema if exists private cascade; drop schema if exists public cascade; drop schema if exists auth cascade;"
      echo "drop schema if exists storage cascade; create schema public;"; cat "${DUMP%.dump}.extensions.sql"; } | psql_db >/dev/null
    C cp "$DUMP" db:/tmp/masked.dump >/dev/null 2>&1
    C exec -T db sh -c "pg_restore -l /tmp/masked.dump | grep -v ' SCHEMA - public ' > /tmp/masked.list"
    set +e; C exec -T db pg_restore -U supabase_admin -d postgres --no-comments --exit-on-error -L /tmp/masked.list /tmp/masked.dump 2>"$LOCAL/load.err"; R=$?; set -e
    C exec -T db rm -f /tmp/masked.dump /tmp/masked.list
    { grep 'error:' "$LOCAL/load.err" || true; } | grep -v -E 'Command was|CONTEXT|DETAIL' | sed -E 's/: ".*/: <value hidden>/' | cut -c1-170 | head -12 || true
    rm -f "$LOCAL/load.err"
    [ "$R" = 0 ] || stop "the saved copy did not load (exit $R)"
    # This copy's own encryption key (Manak passwords, AI keys), kept in its own Vault: the live key never leaves the server.
    psql_db -c "select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'portal_v1', 'Test copy key') where not exists (select 1 from vault.secrets where name = 'portal_v1')" >/dev/null
    psql_db -c "CLUSTER storage.migrations USING migrations_pkey" -c "ANALYZE" >/dev/null
    echo "Loaded $(basename "$DUMP"). Tables: $(psql_db -Atc "select count(*) from information_schema.tables where table_schema = 'public'")."
    echo "Sign-ins: deploy/test-copy/local/test-accounts.txt; password in test-password.txt. Now: tc.sh up, then tc.sh placeholders" ;;
  placeholders)
    guard
    C exec -T db psql -U supabase_admin -d postgres -At -F $'\t' -c "select bucket_id, name, coalesce(metadata->>'mimetype', '') from storage.objects order by 1, 2" \
      | SERVICE_KEY="$(val SERVICE_ROLE_KEY)" python3 "$HERE/placeholders.py" ;;
  code)
    F="$LOCAL/test-2fa-${2:?which account, e.g. user-01}.txt"; [ -f "$F" ] || stop "no two-step key saved for ${2}"
    KEY=$(sed -n 's/^TOTP key: //p' "$F") python3 -I -c 'import base64,hmac,hashlib,os,struct,time
k=base64.b32decode(os.environ["KEY"]); c=int(time.time())//30
h=hmac.new(k,struct.pack(">Q",c),hashlib.sha1).digest(); o=h[-1]&15
print("%06d  (valid %ds more)" % ((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000, 30-int(time.time())%30))' ;;
  refresh)
    # One step after another: set -e stops at the first that fails (an && chain would not, and the line below would lie).
    "$0" fetch ${2:+"$2"}; "$0" load; "$0" up; "$0" placeholders
    echo "Test copy refreshed from the live app ($([ "${2:-}" = real ] && echo 'REAL data, not masked' || echo masked)). App http://127.0.0.1:8090" ;;
  wipe)
    guard
    if [ -t 0 ]; then read -r -p "Type WIPE to remove the test copy's data: " A; [ "$A" = WIPE ] || stop "not confirmed"; fi
    C down -v --remove-orphans; echo "Test copy removed. Settings and masked copies in local/ are kept." ;;
  *) sed -n 2,17p "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
