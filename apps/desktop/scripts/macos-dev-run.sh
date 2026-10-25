#!/bin/sh
# Cargo runner for macOS debug builds. An ad-hoc signature changes on every rebuild, so the Keychain forgets
# "Always Allow". Signing with the local Apple Development certificate keeps one identity across rebuilds.
# D20_SIGNING_IDENTITY overrides the certificate.
identity="${D20_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | awk '/Apple Development/ { print $2; exit }')}"
if [ -z "$identity" ]; then
  echo "d20: no Apple Development certificate. The Keychain will ask again after each rebuild." >&2
elif ! codesign --force --sign "$identity" --identifier com.d20adventures.desktop.dev "$1" 2>/dev/null; then
  echo "d20: could not sign $1 with $identity" >&2
fi
exec "$@"
