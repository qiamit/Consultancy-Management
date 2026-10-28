#!/usr/bin/env bash
# Deploy the latest main on the Oracle server: pull, build the web app, (re)start the containers, apply DB
# migrations. Run on the server (GitHub Actions calls it over SSH after a merge to main):
#   bash /opt/qe/app/deploy/oracle/scripts/deploy.sh            # latest origin/main
#   bash /opt/qe/app/deploy/oracle/scripts/deploy.sh --no-pull  # the checkout as it is
set -euo pipefail

APP=/opt/qe/app
ORACLE="$APP/deploy/oracle"
cd "$APP"

if [ "${1:-}" != "--no-pull" ]; then
  git fetch --quiet origin main
  git reset --quiet --hard origin/main
fi
echo "== Deploying $(git log -1 --format='%h %s')"

set -a
# shellcheck disable=SC1091
. "$ORACLE/.env"
set +a
compose() { docker compose -f "$ORACLE/docker-compose.yml" --env-file "$ORACLE/.env" "$@"; }

echo "== Web app build"
docker run --rm \
  -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$APP/frontend/web":/web -w /web \
  -e VITE_SUPABASE_URL="https://$API_DOMAIN" \
  -e VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
  -e VITE_PDF_SERVICE_URL="https://$PDF_DOMAIN/pdf" \
  node:22-bookworm-slim sh -c "npm ci --no-audit --no-fund --loglevel=error && npx vite build --outDir /web/dist-oracle --emptyOutDir"
# Swap the served folder in one step so visitors never see a half-copied build.
rm -rf "$DATA_DIR/web.next" && cp -a "$APP/frontend/web/dist-oracle" "$DATA_DIR/web.next"
rm -rf "$DATA_DIR/web.prev" && { [ -d "$DATA_DIR/web" ] && mv "$DATA_DIR/web" "$DATA_DIR/web.prev" || true; }
mv "$DATA_DIR/web.next" "$DATA_DIR/web"

echo "== Containers"
# A broken Caddyfile must not take the site down: validate it first.
compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null \
  || { echo "Caddyfile is invalid — deploy stopped, the running site is unchanged."; exit 1; }
compose up -d --build --remove-orphans
# Caddy keeps the bind-mounted web folder open; restart it so it serves the new one.
compose restart caddy >/dev/null

echo "== Database migrations"
if compose exec -T db psql -U supabase_admin -d postgres -tAc "select to_regclass('public.app_schema_migrations') is not null" | grep -q t; then
  (cd "$APP" && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
  DATABASE_URL="postgres://supabase_admin:${POSTGRES_PASSWORD}@127.0.0.1:5432/postgres" node "$APP/backend/scripts/apply-migrations.mjs"
else
  echo "Skipped: the database has not been restored from Railway yet (scripts/migrate-db.sh)."
fi

echo "== Health"
sleep 3
compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
curl -fsS --max-time 10 "https://$API_DOMAIN/health" && echo " <- api ok" || echo "api health check failed"

docker image prune -f >/dev/null
echo "== Done"
