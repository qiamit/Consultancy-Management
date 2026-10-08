#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "Install full Xcode from the App Store, then run this script again."
  echo "Command Line Tools alone cannot convert a Safari Web Extension."
  exit 1
fi

xcrun safari-web-extension-converter "$ROOT" \
  --app-name "QE Consultancy Safari" \
  --bundle-identifier in.qengineering.qe-consultancy.safari \
  --project-location "$ROOT/macos-generated" \
  --macos-only \
  --force

echo "Generated Xcode project at $ROOT/macos-generated"
echo "Open it, Run, then enable QE Consultancy in Safari Settings → Extensions."
