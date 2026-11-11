#!/bin/sh
# Builds the desktop app and publishes it as a GitHub release that public/install.sh downloads.
# Usage: pnpm desktop:release
set -eu

cd "$(dirname "$0")/.."
VERSION=$(node -p 'require("./apps/desktop/src-tauri/tauri.conf.json").version')
TAG="desktop-v$VERSION"
APP="apps/desktop/src-tauri/target/release/bundle/macos/D20 Adventures.app"
ZIP="apps/desktop/src-tauri/target/release/bundle/D20-Adventures-macos-arm64.zip"

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "$TAG already exists. Raise the version in apps/desktop/src-tauri/tauri.conf.json." >&2
  exit 1
fi

pnpm desktop:build
# Apple Silicon refuses to run code with no signature at all, so make sure the free ad-hoc one is there.
codesign --force --deep --sign - "$APP"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

gh release create "$TAG" "$ZIP" --title "D20 Adventures $VERSION" --notes "Install: curl -fsSL https://d20adventures.com/install.sh | sh" --latest
