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

gh release create "$TAG" "$ZIP" --title "D20 Adventures $VERSION" --notes "Mac or Linux: curl -fsSL https://d20adventures.com/install.sh | sh
Windows: irm https://d20adventures.com/install.ps1 | iex" --latest

# The Intel Mac, Windows and Linux builds run on GitHub and join this release when done.
gh workflow run desktop-builds.yml -f tag="$TAG" || echo "Could not start the other builds. Run: gh workflow run desktop-builds.yml -f tag=$TAG" >&2
echo "Released $TAG for Apple Silicon. The other builds join it in about 20 minutes: gh run list -w desktop-builds.yml"
