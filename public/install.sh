#!/bin/sh
# Installs the D20 Adventures desktop app on a Mac.
# Usage: curl -fsSL https://d20adventures.com/install.sh | sh
# Source: https://github.com/johnpolacek/d20adventures.com/blob/main/public/install.sh
set -eu

APP="D20 Adventures.app"
URL="https://github.com/johnpolacek/d20adventures.com/releases/latest/download/D20-Adventures-macos-arm64.zip"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "D20 Adventures runs on macOS only." >&2
  exit 1
fi
if [ "$(uname -m)" != "arm64" ]; then
  echo "D20 Adventures needs an Apple Silicon Mac." >&2
  exit 1
fi

# The app runs its Game Master on Node.js 24 or newer.
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Warning: the app needs Node.js 24 or newer. Get it at https://nodejs.org" >&2
fi

DEST=/Applications
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading D20 Adventures..."
curl -fL --progress-bar -o "$TMP/app.zip" "$URL"
ditto -x -k "$TMP/app.zip" "$TMP"

osascript -e 'quit app "D20 Adventures"' >/dev/null 2>&1 || true
rm -rf "$DEST/$APP"
ditto "$TMP/$APP" "$DEST/$APP"
# The app is not notarized by Apple, so clear any download flag before first launch.
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

echo "Installed to $DEST/$APP"
open "$DEST/$APP"
