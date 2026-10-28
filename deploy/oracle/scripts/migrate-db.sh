#!/usr/bin/env bash
# Copy the Consultancy Pro database from Railway into the Oracle server's Postgres.
# Railway is only read (pg_dump); nothing there changes. Run on the server:
#   bash /opt/qe/app/deploy/oracle/scripts/migrate-db.sh           # full copy (replaces the Oracle data)
#   bash /opt/qe/app/deploy/oracle/scripts/migrate-db.sh --verify  # only compare row counts
#
# Both sides run the same versions (Postgres 17.6.1.136, GoTrue v2.174.0, storage-api v1.24.7), so:
#   1. GoTrue and storage-api create their own auth / storage tables on Oracle (same structure as Railway);
#   2. the structure of public and private is copied from Railway;
#   3. the data of public, private, auth and storage is copied (triggers and FK checks off while loading);
#   4. every table's row count is compared with Railway.
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

echo "== 1. Database and auth / storage tables on Oracle"
compose up -d db
until compose exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
compose up -d auth storage
echo "Waiting for GoTrue and storage-api to create their tables…"
for _ in $(seq 1 60); do
  ready=$(psql_local -tAc "select (to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null)::int" || echo 0)
  [ "$ready" = "1" ] && break
  sleep 3
done
sleep 5
# Nothing else may write while the data is loaded.
compose stop auth storage rest functions mcp pdf caddy >/dev/null 2>&1 || true

echo "== 2. Extensions (same as Railway)"
psql_source -tAc "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname not in ('plpgsql')" \
  | psql_local -q

echo "== 3. Dump from Railway (read only)"
compose exec -T db pg_dump "$SOURCE_DATABASE_URL" --schema-only -n public -n private -Fc > "$WORK/schema.dump"
compose exec -T db pg_dump "$SOURCE_DATABASE_URL" --data-only \
  $(printf -- '-n %s ' "${DATA_SCHEMAS[@]}") -Fc > "$WORK/data.dump"
ls -lh "$WORK"/schema.dump "$WORK"/data.dump

echo "== 4. Replace public / private on Oracle with Railway's structure"
# Start from an empty public schema (safe to re-run). Extensions living in public (citext) come back first.
PUBLIC_OWNER=$(psql_source -tAc "select nspowner::regrole from pg_namespace where nspname = 'public'")
psql_local -q <<SQL
DROP SCHEMA IF EXISTS private CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
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

echo "== 5. Empty Oracle's auth / storage tables, then load all data"
psql_local -q <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('auth','storage') LOOP
    EXECUTE format('TRUNCATE %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;
SQL
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
