#!/bin/bash
# Installs dependencies so the app, linters and typecheck work in Claude Code cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Chromium is pre-installed in the cloud image; never download browsers here.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Root (db scripts), frontend, backend scripts and PDF service.
npm install --no-audit --no-fund
npm install --no-audit --no-fund --prefix frontend/web
npm install --no-audit --no-fund --prefix backend
npm install --no-audit --no-fund --prefix backend/services/pdf-service

# Vite needs frontend/web/.env; seed it from the example (placeholder keys) if absent.
if [ ! -f frontend/web/.env ]; then
  cp frontend/web/.env.example frontend/web/.env
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1'
    echo 'export PLAYWRIGHT_NO_SANDBOX=1'
    # The pdf-service's pinned Playwright may not match the image's browser build.
    if [ -x /opt/pw-browsers/chromium ]; then
      echo 'export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium'
    fi
  } >> "$CLAUDE_ENV_FILE"
fi
