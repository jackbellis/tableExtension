#!/usr/bin/env bash
# Runs the end-to-end test: loads the extension into Chromium against a local
# stand-in for a Google results page, then drives the whole UI.
# Needs: node, and Playwright with Chromium  (npm install playwright && npx playwright install chromium)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
EXT="$(dirname "$HERE")"
WORK="$(mktemp -d)"
mkdir -p "$WORK/testext"
cp -r "$EXT"/. "$WORK/testext/"
rm -rf "$WORK/testext/test"
# point the test copy at the local stand-in server instead of google.com
node -e '
  const fs = require("fs"), p = process.argv[1] + "/testext/manifest.json";
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.content_scripts[0].matches = ["http://localhost:8765/search*"];
  m.web_accessible_resources[0].matches = ["http://localhost:8765/*"];
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
' "$WORK"
node "$HERE/server.js" > "$WORK/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
echo "Working folder (screenshots land here): $WORK"
node "$HERE/test.js" "$WORK"
