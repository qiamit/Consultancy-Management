#!/usr/bin/env bash
# Copy the Consultancy Pro database from Railway into the Oracle server's Postgres.
# Railway is only read (pg_dump); nothing there changes. Run on the server:
#   bash /opt/qe/app/deploy/oracle/scripts/migrate-db.sh           # full copy (replaces the Oracle data)
#   bash /opt/qe/app/deploy/oracle/scripts/migrate-db.sh --verify  # only compare row counts
#
# Both sides run the same images, but Railway's auth / storage tables were created by newer GoTrue and storage-api
# releases than the ones running now (extra tables such as auth.oauth_clients, no storage.prefixes). So nothing is
# rebuilt on Oracle; Railway's database is reproduced as it is:
#   1. the structure of public, private, auth and storage is copied from Railway;
#   2. their data is copied (triggers and FK checks off while loading);
#   3. every table's row count is compared with Railway.
# GoTrue and storage-api then find every migration already applied, exactly as on Railway.
set -euo pipefail

APP=/opt/qe/app
ORACLE="$APP/deploy/oracle"
set -a
# shellcheck disable=SC1091
. "$ORACLE/.env"
set +a
compose() { docker compose -f "$ORACLE/docker-compose.yml" --env-file "$ORACLE/.env" "$@"; }
psql_local() { compose exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
psql_source() { compose exec -T db psql -v ON_ERROR_STOP=1 "$SOURCE_DATABASE_URL" "$@"; }

DATA_SCHEMAS=(public private auth storage)
SCHEMA_ARGS=$(printf -- '-n %s ' "${DATA_SCHEMAS[@]}")
WORK="$BACKUP_DIR/migration"
mkdir -p "$WORK"

count_rows() {
  # Exact row count of every table in the data schemas, one "schema.table count" per line (read-only query).
  local runner=$1
  $runner -tA <<'SQL'
SELECT schemaname || '.' || tablename || ' ' ||
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, tablename), false, true, '')))[1]::text
FROM pg_tables
WHERE schemaname IN ('public', 'private', 'auth', 'storage')
ORDER BY 1;
SQL
}

verify() {
  echo "== Comparing row counts (Railway vs Oracle)"
  count_rows psql_source > "$WORK/counts-railway.txt"
  count_rows psql_local > "$WORK/counts-oracle.txt"
  if diff -u "$WORK/counts-railway.txt" "$WORK/counts-oracle.txt" > "$WORK/counts.diff"; then
    echo "All $(wc -l < "$WORK/counts-railway.txt") tables match."
  else
    echo "Differences (Railway vs Oracle) — see $WORK/counts.diff:"
    head -40 "$WORK/counts.diff"
    return 1
  fi
}

if [ "${1:-}" = "--verify" ]; then
  verify
  exit $?
fi

echo "== 1. Database only (nothing else may write while the data is loaded)"
compose stop auth storage rest functions mcp pdf caddy >/dev/null 2>&1 || true
compose up -d db
until compose exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done

echo "== 2. Extensions (same as Railway)"
psql_source -tAc "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname not in ('plpgsql')" \
  | psql_local -q

echo "== 3. Dump from Railway (read only)"
# shellcheck disable=SC2086
compose exec -T db pg_dump "$SOURCE_DATABASE_URL" --schema-only $SCHEMA_ARGS -Fc > "$WORK/schema.dump"
# shellcheck disable=SC2086
compose exec -T db pg_dump "$SOURCE_DATABASE_URL" --data-only $SCHEMA_ARGS -Fc > "$WORK/data.dump"
ls -lh "$WORK"/schema.dump "$WORK"/data.dump

echo "== 4. Replace public / private / auth / storage on Oracle with Railway's structure"
# Start from empty schemas (safe to re-run). Extensions living in public (citext) come back first.
PUBLIC_OWNER=$(psql_source -tAc "select nspowner::regrole from pg_namespace where nspname = 'public'")
psql_local -q <<SQL
DROP SCHEMA IF EXISTS private CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS storage CASCADE;
CREATE SCHEMA public;
ALTER SCHEMA public OWNER TO ${PUBLIC_OWNER:-pg_database_owner};
SQL
psql_source -tAc "select format('create extension if not exists %I with schema public;', e.extname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where n.nspname = 'public'" \
  | psql_local -q
# The dump may or may not carry "CREATE SCHEMA public"; the schema already exists, so that entry is skipped.
compose exec -T db pg_restore -l < "$WORK/schema.dump" | grep -v ' SCHEMA - public ' > "$WORK/schema.list"
compose cp "$WORK/schema.list" db:/tmp/schema.list
compose cp "$WORK/schema.dump" db:/tmp/schema.dump
compose exec -T db pg_restore -U supabase_admin -d postgres --exit-on-error -L /tmp/schema.list /tmp/schema.dump \
  || { echo "Structure restore failed"; exit 1; }

echo "== 5. Load all data"
compose cp "$WORK/data.dump" db:/tmp/data.dump
compose exec -T db pg_restore -U supabase_admin -d postgres --data-only --disable-triggers --single-transaction \
  --exit-on-error /tmp/data.dump || { echo "Data restore failed"; exit 1; }
compose exec -T db rm -f /tmp/data.dump /tmp/schema.dump /tmp/schema.list

echo "== 6. Row order and statistics"
# storage-api reads storage.migrations without ORDER BY; keep it in id order (see the storage-api CLUSTER note).
psql_local -q -c "CLUSTER storage.migrations USING migrations_pkey;" -c "ANALYZE;"

verify

echo "== 7. Start everything"
compose up -d
echo "Database copy complete."
