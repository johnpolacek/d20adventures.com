#!/bin/sh
# Installs the D20 Adventures desktop app on a Mac or Linux. Windows uses install.ps1.
# Usage: curl -fsSL https://d20adventures.com/install.sh | sh
# Source: https://github.com/johnpolacek/d20adventures.com/blob/main/public/install.sh
set -eu

RELEASE="https://github.com/johnpolacek/d20adventures.com/releases/latest/download"
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS-$ARCH" in
  Darwin-arm64) ASSET="D20-Adventures-macos-arm64.zip" ;;
  Darwin-x86_64) ASSET="D20-Adventures-macos-x64.zip" ;;
  Linux-x86_64) ASSET="D20-Adventures-linux-x64.AppImage" ;;
  *)
    echo "D20 Adventures has no build for $OS on $ARCH yet." >&2
    exit 1
    ;;
esac

# The app runs its Game Master on Node.js 24 or newer. It takes the first node in these folders, and reads PATH
# only after them. A Mac app does not get the shell's PATH, so a Node from nvm, asdf or mise is not found there.
NODE=""
for DIR in "$HOME/.local/share/fnm/aliases/default/bin" "$HOME/.volta/bin" "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin /usr/bin; do
  if [ -f "$DIR/node" ]; then
    NODE="$DIR/node"
    break
  fi
done
if [ -z "$NODE" ] && [ "$OS" = "Linux" ]; then
  NODE=$(command -v node || true)
fi
NODE_MAJOR=0
if [ -n "$NODE" ]; then
  NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
fi
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Warning: the app needs Node.js 24 or newer, and found ${NODE:-none}. See https://d20adventures.com/host.md" >&2
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading D20 Adventures..."
if ! curl -fL --progress-bar -o "$TMP/$ASSET" "$RELEASE/$ASSET"; then
  echo "The latest release has no $ASSET yet. Try again in a few minutes." >&2
  exit 1
fi

if [ "$OS" = "Linux" ]; then
  DEST="$HOME/.local/bin"
  mkdir -p "$DEST" "$HOME/.local/share/applications"
  install -m 755 "$TMP/$ASSET" "$DEST/d20-adventures"
  printf '[Desktop Entry]\nName=D20 Adventures\nExec=%s\nType=Application\nCategories=Game;\n' "$DEST/d20-adventures" >"$HOME/.local/share/applications/d20-adventures.desktop"
  echo "Installed to $DEST/d20-adventures"
  # AppImages need FUSE 2. On Ubuntu 22.04 and later: sudo apt install libfuse2
  nohup "$DEST/d20-adventures" >/dev/null 2>&1 &
  exit 0
fi

APP="D20 Adventures.app"
DEST=/Applications
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
ditto -x -k "$TMP/$ASSET" "$TMP"

osascript -e 'quit app "D20 Adventures"' >/dev/null 2>&1 || true
rm -rf "$DEST/$APP"
ditto "$TMP/$APP" "$DEST/$APP"
# The app is not notarized by Apple, so clear any download flag before first launch.
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

echo "Installed to $DEST/$APP"
# An agent's sandbox may not be allowed to open apps. The install still succeeded.
open "$DEST/$APP" || echo "Open D20 Adventures from $DEST to start."
