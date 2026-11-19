#!/usr/bin/env bash
# Deploy the `testing` branch to the preview site (https://$PREVIEW_DOMAIN) on the Oracle server.
# The preview uses the LIVE database through the live API (docs/workflow.md). It never applies migrations:
# migrations reach the database only with a release of `main` (scripts/deploy.sh).
#
# Run on the server (the "Deploy preview" GitHub workflow calls it over SSH after a push to `testing`):
#   bash /opt/qe/app/deploy/oracle/scripts/preview-deploy.sh
#
# What it does:
#   1. Checks out origin/testing in its own folder (PREVIEW_SRC, default /opt/qe/preview); the live checkout
#      (/opt/qe/app) is not touched.
#   2. Builds the web app against the live API and swaps it into $DATA_DIR/preview/web (no Caddy restart).
#   3. (Re)starts the preview functions / PDF containers from `testing`. They always run: Caddy sends every preview
#      functions / PDF call to them, and its fallback to the live containers did not work for POST requests (502).
#   4. Lists migrations that `testing` has and the database does not (they are NOT applied).
set -euo pipefail

APP=/opt/qe/app
ORACLE="$APP/deploy/oracle"
BRANCH=testing

set -a
# shellcheck disable=SC1091
. "$ORACLE/.env"
set +a
PREVIEW_SRC=${PREVIEW_SRC:-/opt/qe/preview}
PREVIEW_DOMAIN=${PREVIEW_DOMAIN:-preview.$APP_DOMAIN}
export PREVIEW_SRC PREVIEW_DOMAIN
compose() { docker compose -f "$ORACLE/docker-compose.yml" --env-file "$ORACLE/.env" "$@"; }
preview_compose() { docker compose -f "$ORACLE/preview/docker-compose.yml" --env-file "$ORACLE/.env" "$@"; }

echo "== Checkout origin/$BRANCH"
git -C "$APP" fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" "+refs/heads/main:refs/remotes/origin/main"
if [ ! -d "$PREVIEW_SRC/.git" ] && [ ! -f "$PREVIEW_SRC/.git" ]; then
  git -C "$APP" worktree prune
  git -C "$APP" worktree add --quiet --detach "$PREVIEW_SRC" "origin/$BRANCH"
fi
git -C "$PREVIEW_SRC" checkout --quiet --detach "origin/$BRANCH"
git -C "$PREVIEW_SRC" reset --quiet --hard "origin/$BRANCH"
git -C "$PREVIEW_SRC" clean -fdq -e node_modules
echo "Preview: $(git -C "$PREVIEW_SRC" log -1 --format='%h %s')"

echo "== Web app build"
docker run --rm \
  -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PREVIEW_SRC/frontend/web":/web -w /web \
  -e VITE_SUPABASE_URL="https://$API_DOMAIN" \
  -e VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
  -e VITE_PDF_SERVICE_URL="https://$PDF_DOMAIN/pdf" \
  -e VITE_APP_CHANNEL=preview \
  node:22.23-bookworm-slim sh -c "npm ci --no-audit --no-fund --loglevel=error && npx vite build --outDir /web/dist-preview --emptyOutDir"
# Caddy serves $DATA_DIR/preview (mounted once); swapping the web folder inside it needs no restart.
mkdir -p "$DATA_DIR/preview"
# Docker creates a missing bind-mount folder as root (it did on the first release with the preview mount):
# give it back to this user so the deploy can write into it.
[ -w "$DATA_DIR/preview" ] || sudo -n chown "$(id -u):$(id -g)" "$DATA_DIR/preview"
rm -rf "$DATA_DIR/preview/web.next" && cp -a "$PREVIEW_SRC/frontend/web/dist-preview" "$DATA_DIR/preview/web.next"
rm -rf "$DATA_DIR/preview/web.prev" && { [ -d "$DATA_DIR/preview/web" ] && mv "$DATA_DIR/preview/web" "$DATA_DIR/preview/web.prev" || true; }
mv "$DATA_DIR/preview/web.next" "$DATA_DIR/preview/web"

echo "== Preview backend (functions and PDF from $BRANCH; scheduled jobs off)"
for dir in backend/services/functions backend/services/pdf-service; do
  git -C "$APP" diff --quiet "origin/main" "origin/$BRANCH" -- "$dir" || echo "  $BRANCH changes $dir"
done
preview_compose up -d --build --remove-orphans
preview_compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'

echo "== Migrations in $BRANCH that the database does not have (NOT applied here)"
APPLIED=$(compose exec -T db psql -U supabase_admin -d postgres -tAc "select filename from public.app_schema_migrations" 2>/dev/null || true)
PENDING=0
for f in "$PREVIEW_SRC"/backend/database/migrations/*.sql; do
  name=$(basename "$f")
  if ! grep -qxF "$name" <<<"$APPLIED"; then
    echo "  $name"
    PENDING=1
  fi
done
if [ "$PENDING" = 1 ]; then
  echo "  The preview may show errors where it needs these. They are applied only by a release of main"
  echo "  (merge testing -> main), together with all the testing work (docs/workflow.md)."
else
  echo "  none"
fi

docker image prune -f >/dev/null
echo "== Done: https://$PREVIEW_DOMAIN"
