#!/usr/bin/env bash
# Read only: what a release from the live version to a new commit would change, and the steps for it.
# Changes nothing here or on the server.
#   deploy/oracle/release-plan.sh [<live-commit>] [<new-commit>]
# The live commit defaults to the last successful "Deploy to Oracle" run (GitHub), the new one to origin/main.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
G() { git -C "$ROOT" "$@"; }
G fetch --quiet origin main
FROM=${1:-$(gh run list --workflow deploy-oracle.yml --status success --limit 1 --json headSha --jq '.[0].headSha' 2>/dev/null || true)}
[ -n "$FROM" ] || { echo "No live commit found: give it as the first argument."; exit 1; }
TO=${2:-origin/main}
G cat-file -e "$FROM^{commit}" 2>/dev/null || { echo "Unknown commit: $FROM (try git fetch)"; exit 1; }
G cat-file -e "$TO^{commit}" 2>/dev/null || { echo "Unknown commit: $TO"; exit 1; }
G merge-base --is-ancestor "$FROM" "$TO" || echo "Warning: $FROM is not an ancestor of $TO (rollback or diverged branch)."

echo "Release $(G rev-parse --short=7 "$FROM") (live) -> $(G rev-parse --short=7 "$TO")"
echo
echo "Changes:"
G log --oneline --first-parent "$FROM..$TO" | cut -c1-110 | sed 's/^/  /'
CHANGED=$(G diff --name-only "$FROM" "$TO")
[ -n "$CHANGED" ] || { echo; echo "No file changes: nothing to release."; exit 0; }

echo
echo "Database migrations the release applies, in this order:"
MIG=$(G diff --name-only --diff-filter=A "$FROM" "$TO" -- backend/database/migrations | sort)
if [ -n "$MIG" ]; then echo "$MIG" | sed 's/^/  /'; else echo "  none"; fi
EDITED=$(G diff --name-only --diff-filter=M "$FROM" "$TO" -- backend/database/migrations)
[ -z "$EDITED" ] || { echo "  Warning: already-applied migrations were edited (they are not run again):"; echo "$EDITED" | sed 's/^/    /'; }

echo
echo "Parts that change:"
echo "$CHANGED" | grep -q '^frontend/web/' && echo "  web app (rebuilt)"
for d in $(echo "$CHANGED" | grep '^backend/services/' | cut -d/ -f3 | sort -u); do echo "  backend/services/$d (container rebuilt)"; done
echo "$CHANGED" | grep -q '^frontend/extensions/' && echo "  Chrome extension: not deployed by the server; sync the extension folder on each computer"
echo "$CHANGED" | grep -q '^deploy/oracle/Caddyfile' && echo "  Entrance (Caddyfile): checked before the restart, the site stays up if it is invalid"
echo "$CHANGED" | grep -q '^deploy/oracle/docker-compose.yml' && echo "  docker-compose.yml: check which services and settings it affects"
echo "$CHANGED" | grep -q '^deploy/oracle/env.template' && echo "  env.template: a new setting may be needed in the server's .env first"

echo
echo "Steps (only after the owner's go-ahead in chat):"
[ -z "$MIG" ] || echo "  1. Before migrations: take a backup on the server (bash /opt/qe/app/deploy/oracle/scripts/backup.sh)"
echo "  2. gh workflow run deploy-oracle.yml --ref main   (deploys origin/main: web build, containers, migrations)"
echo "  3. gh run watch \$(gh run list --workflow deploy-oracle.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status"
echo "  4. Check https://qengineering.in loads the new build, smoke-test the changed areas, report back to Local Host."
