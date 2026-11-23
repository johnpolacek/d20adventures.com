#!/bin/sh
# Cargo runner for macOS debug builds. The binary runs from inside a small app bundle, "D20 Adventures Dev.app" beside
# it, so macOS knows it by name and bundle id (com.d20adventures.desktop.dev): computer-use tools can then ask for it, as
# they can't for a bare binary. Debug builds read their resources from the source tree, so the bundle needs none.
#
# An ad-hoc signature changes on every rebuild, so the Keychain forgets "Always Allow". Signing with the local Apple
# Development certificate keeps one identity across rebuilds. D20_SIGNING_IDENTITY overrides the certificate.
bin="$1"
shift
app="$(dirname "$bin")/D20 Adventures Dev.app"
mkdir -p "$app/Contents/MacOS"
cp "$bin" "$app/Contents/MacOS/d20-desktop"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.d20adventures.desktop.dev</string>
  <key>CFBundleName</key><string>D20 Adventures Dev</string>
  <key>CFBundleExecutable</key><string>d20-desktop</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST
identity="${D20_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | awk '/Apple Development/ { print $2; exit }')}"
if [ -z "$identity" ]; then
  echo "d20: no Apple Development certificate. The Keychain will ask again after each rebuild." >&2
elif ! codesign --force --sign "$identity" --identifier com.d20adventures.desktop.dev "$app" 2>/dev/null; then
  echo "d20: could not sign $app with $identity" >&2
fi
exec "$app/Contents/MacOS/d20-desktop" "$@"
