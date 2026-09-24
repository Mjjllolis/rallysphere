#!/usr/bin/env bash
# scripts/release.sh — one-command release for RallySphere.
#
# Usage:
#   npm run release             # both iOS + Android
#   npm run release:ios         # iOS only (TestFlight)
#   npm run release:android     # Android only (Play internal testing)
#   npm run release minor       # bump version name first, then build + submit
#                               #   (major | minor | patch; works with :ios/:android too)
#
# What this does:
#   1. Pre-flight checks (eas login, service-account key, current version)
#   2. Builds the requested platform(s) on EAS via the production profile
#   3. Auto-submits successful builds to App Store Connect / Google Play
#
# Version handling:
#   - versionCode (Android) and buildNumber (iOS) auto-increment via eas.json.
#   - Version NAME (x.y.z) only changes when you pass major/minor/patch:
#     major 1.1.0 → 2.0.0, minor 1.1.0 → 1.2.0, patch 1.1.0 → 1.1.1.
#     It's written to app.json, ios/RallySphere/Info.plist and
#     android/app/build.gradle (native projects are committed, so all three).

set -euo pipefail

PLATFORM="all"
BUMP=""
for arg in "$@"; do
  case "$arg" in
    major|minor|patch) BUMP="$arg" ;;
    *) PLATFORM="$arg" ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- Colors (skip if not a TTY) ---
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

say()   { printf "%s\n" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
die()   { printf "%s✗ %s%s\n" "$RED" "$*" "$RESET" >&2; exit 1; }

# --- Validate platform arg ---
case "$PLATFORM" in
  all|ios|android) ;;
  *) die "Unknown platform '$PLATFORM'. Use: all | ios | android" ;;
esac

say "${BOLD}RallySphere release${RESET} ${DIM}(platform: $PLATFORM)${RESET}"
say ""

# --- Pre-flight: eas-cli authenticated? ---
if ! npx eas whoami >/dev/null 2>&1; then
  die "Not logged in to EAS. Run: npx eas login"
fi
ok "EAS auth: $(npx eas whoami 2>/dev/null | head -1)"

# --- Pre-flight: Android service-account key (only if needed) ---
if [ "$PLATFORM" = "all" ] || [ "$PLATFORM" = "android" ]; then
  KEY_PATH=$(node -e "
    const c = require('./eas.json');
    const p = c.submit?.production?.android?.serviceAccountKeyPath;
    if (p) console.log(require('path').resolve(p));
  ")
  if [ -z "$KEY_PATH" ]; then
    warn "No Android service-account key configured in eas.json — submit will fail."
  elif [ ! -f "$KEY_PATH" ]; then
    die "Android service-account key not found at: $KEY_PATH"
  else
    ok "Android service-account key: ${DIM}$KEY_PATH${RESET}"
  fi
fi

# --- Show current version & ask before kicking off (~15-20 min cloud build) ---
APP_VERSION=$(node -p "require('./app.json').expo.version")
NEW_VERSION="$APP_VERSION"
if [ -n "$BUMP" ]; then
  NEW_VERSION=$(node -e "
    const [ma, mi, pa] = process.argv[1].split('.').map(Number);
    const b = process.argv[2];
    console.log(b === 'major' ? \`\${ma + 1}.0.0\` : b === 'minor' ? \`\${ma}.\${mi + 1}.0\` : \`\${ma}.\${mi}.\${pa + 1}\`);
  " "$APP_VERSION" "$BUMP")
fi
ANDROID_VC=$(node -p "require('./app.json').expo.android?.versionCode || '?'")
IOS_BN=$(node -p "require('./app.json').expo.ios?.buildNumber || '?'")
say ""
say "${BOLD}Current versions:${RESET}"
if [ "$NEW_VERSION" != "$APP_VERSION" ]; then
  say "  version name:    $APP_VERSION → ${BOLD}$NEW_VERSION${RESET}   ${DIM}($BUMP bump)${RESET}"
else
  say "  version name:    $APP_VERSION   ${DIM}(pass major/minor/patch to bump)${RESET}"
fi
say "  android vc:      $ANDROID_VC    ${DIM}(auto-increments)${RESET}"
say "  ios buildNumber: $IOS_BN     ${DIM}(auto-increments)${RESET}"
say ""

if [ -t 0 ]; then
  read -r -p "Proceed with build + auto-submit? [y/N] " REPLY
  case "$REPLY" in
    y|Y|yes|YES) ;;
    *) say "Aborted."; exit 0 ;;
  esac
fi

# --- Bump version name (only after confirming, so aborting changes nothing) ---
if [ "$NEW_VERSION" != "$APP_VERSION" ]; then
  node -e "
    const fs = require('fs');
    const [from, to] = process.argv.slice(1);
    const edit = (file, re, sub) => {
      const src = fs.readFileSync(file, 'utf8');
      if (!re.test(src)) { console.error('Version not found in ' + file); process.exit(1); }
      fs.writeFileSync(file, src.replace(re, sub));
    };
    edit('app.json', /(\"version\":\s*\")[^\"]+(\")/, '\$1' + to + '\$2');
    edit('ios/RallySphere/Info.plist', /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/, '\$1' + to + '\$2');
    edit('android/app/build.gradle', /(versionName \")[^\"]+(\")/, '\$1' + to + '\$2');
  " "$APP_VERSION" "$NEW_VERSION"
  ok "Version bumped to $NEW_VERSION"
fi

# --- Run it ---
say ""
say "${BOLD}Building & submitting on EAS…${RESET} ${DIM}(this blocks for ~15-20 min)${RESET}"
say ""

npx eas build \
  --platform "$PLATFORM" \
  --profile production \
  --auto-submit \
  --non-interactive

say ""
ok "Done. Commit the version changes so the next build starts from here:"
git status --short app.json ios/RallySphere/Info.plist android/app/build.gradle
