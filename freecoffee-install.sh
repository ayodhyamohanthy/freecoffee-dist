#!/bin/zsh
set -euo pipefail
VERSION='1.2.4'
DMG_SHA256='252ebc1719fdd54ba7904b0085ce917718639f22c230bca231cf51e0a2908cf8'
DMG_URL="https://github.com/ayodhyamohanthy/freecoffee-dist/releases/download/v${VERSION}/FreeCoffee.dmg"
APP='/Applications/FreeCoffee.app'
WORK="$(mktemp -d "${TMPDIR:-/tmp}/freecoffee-install.XXXXXX")"
MOUNT="$WORK/mount"
cleanup() { hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT INT TERM
cat <<'NOTICE'
FreeCoffee advanced pilot install

This build is ad-hoc signed and not Apple-notarized. This script verifies the
pinned release checksum and app bundle, copies only FreeCoffee.app to
/Applications, then removes com.apple.quarantine from that app only. That
bypasses Apple's normal first-open warning for this copy of FreeCoffee.

Type exactly: I understand
NOTICE
read 'reply?> '
[[ "$reply" == 'I understand' ]] || { print 'Stopped. Nothing installed.'; exit 1; }
command -v curl >/dev/null && command -v hdiutil >/dev/null && command -v codesign >/dev/null || { print -u2 'Required macOS tools are missing.'; exit 1; }
curl --fail --location --proto '=https' --tlsv1.2 --output "$WORK/FreeCoffee.dmg" "$DMG_URL"
actual="$(shasum -a 256 "$WORK/FreeCoffee.dmg" | awk '{print $1}')"
[[ "$actual" == "$DMG_SHA256" ]] || { print -u2 "Checksum mismatch. Expected $DMG_SHA256, got $actual"; exit 1; }
mkdir "$MOUNT"
hdiutil attach "$WORK/FreeCoffee.dmg" -nobrowse -readonly -mountpoint "$MOUNT" -quiet
SOURCE="$MOUNT/FreeCoffee.app"
[[ -d "$SOURCE" ]] || { print -u2 'FreeCoffee.app is missing from the DMG.'; exit 1; }
codesign --verify --deep --strict --verbose=2 "$SOURCE"
identity="$(codesign -dv --verbose=4 "$SOURCE" 2>&1 | sed -n 's/^Signature=//p')"
[[ "$identity" == 'adhoc' ]] || { print -u2 "Unexpected signature: $identity"; exit 1; }
version="$(defaults read "$SOURCE/Contents/Info" CFBundleShortVersionString)"
bundle_id="$(defaults read "$SOURCE/Contents/Info" CFBundleIdentifier)"
[[ "$version" == "$VERSION" && "$bundle_id" == 'com.freecoffee.demo.menubar' ]] || { print -u2 "Unexpected app identity/version: $bundle_id $version"; exit 1; }
archs="$(lipo -archs "$SOURCE/Contents/MacOS/FreeCoffee")"
[[ " $archs " == *' arm64 '* && " $archs " == *' x86_64 '* ]] || { print -u2 "Unexpected architectures: $archs"; exit 1; }
[[ ! -e "$APP" ]] || { print -u2 "$APP already exists. Remove it first so this script never overwrites an installed copy."; exit 1; }
ditto "$SOURCE" "$APP"
xattr -dr com.apple.quarantine "$APP"
print "Installed verified FreeCoffee v$VERSION at $APP"
print 'Open it from Applications. To uninstall, quit FreeCoffee and move the app to the Bin.'
