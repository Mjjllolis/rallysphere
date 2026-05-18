#!/usr/bin/env bash
# scripts/prod-check.sh — pre-flight before any production action.
#
# Run with:    npm run prod:check
#
# Verifies that everything you need to ship to production is in place. Prints
# a checklist with PASS/WARN/FAIL for each item. Does not change anything.
#
# Exit codes:
#   0 = all critical items pass (warnings allowed)
#   1 = at least one critical item failed
#
# Note: this only checks LOCAL state — it can't tell you whether the deployed
# functions are using the right env, only what would happen if you deployed now.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -t 1 ]; then
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  GREEN=""; YELLOW=""; RED=""; BOLD=""; DIM=""; RESET=""
fi

FAILED=0
WARNED=0

pass()  { printf "  %sPASS%s  %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "  %sWARN%s  %s\n" "$YELLOW" "$RESET" "$*"; WARNED=$((WARNED+1)); }
fail()  { printf "  %sFAIL%s  %s\n" "$RED" "$RESET" "$*"; FAILED=$((FAILED+1)); }
section() { printf "\n%s%s%s\n" "$BOLD" "$*" "$RESET"; }

# Helper to read a value from a .env file
envval() {
  local file="$1"; local key="$2"
  [ -f "$file" ] || { echo ""; return; }
  grep -E "^${key}=" "$file" | head -1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' || echo ""
}

# ----------------------------------------------------------------------------
section "Repository state"
# ----------------------------------------------------------------------------

if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
  pass "Working tree is clean"
else
  warn "Uncommitted changes present (won't make it into the build)"
fi

# ----------------------------------------------------------------------------
section "Functions environment (functions/.env)"
# ----------------------------------------------------------------------------

ENV_FILE="$ROOT/functions/.env"
if [ ! -f "$ENV_FILE" ]; then
  fail "functions/.env not found"
else
  pass "functions/.env present"

  TEST_MODE_VAL=$(envval "$ENV_FILE" "TEST_MODE")
  if [ "$TEST_MODE_VAL" = "true" ]; then
    warn "TEST_MODE=true — sandbox/dev mode (flip to false for live)"
  elif [ "$TEST_MODE_VAL" = "false" ]; then
    pass "TEST_MODE=false — live mode"
  else
    fail "TEST_MODE has invalid value: \"$TEST_MODE_VAL\" (must be \"true\" or \"false\")"
  fi

  # Required Finix vars based on TEST_MODE
  if [ "$TEST_MODE_VAL" = "false" ]; then
    REQUIRED=(FINIX_USERNAME_LIVE FINIX_PASSWORD_LIVE FINIX_APPLICATION_ID_LIVE FINIX_PLATFORM_MERCHANT_ID_LIVE)
    LABEL="live"
  else
    REQUIRED=(FINIX_USERNAME FINIX_PASSWORD FINIX_APPLICATION_ID FINIX_PLATFORM_MERCHANT_ID)
    LABEL="sandbox"
  fi
  for K in "${REQUIRED[@]}"; do
    V=$(envval "$ENV_FILE" "$K")
    if [ -z "$V" ]; then
      fail "$K is empty (required for $LABEL)"
    else
      pass "$K is set ($DIM${V:0:6}…${RESET})"
    fi
  done

  WEBHOOK=$(envval "$ENV_FILE" "FINIX_WEBHOOK_SECRET")
  if [ -z "$WEBHOOK" ]; then
    warn "FINIX_WEBHOOK_SECRET is empty — webhook signature verification will be skipped"
  else
    pass "FINIX_WEBHOOK_SECRET is set"
  fi
fi

# ----------------------------------------------------------------------------
section "App configuration"
# ----------------------------------------------------------------------------

APP_VERSION=$(node -p "require('./app.json').expo.version" 2>/dev/null || echo "?")
ANDROID_VC=$(node -p "require('./app.json').expo.android?.versionCode || '?'" 2>/dev/null || echo "?")
IOS_BN=$(node -p "require('./app.json').expo.ios?.buildNumber || '?'" 2>/dev/null || echo "?")
pass "Version: $APP_VERSION (android vc=$ANDROID_VC, ios buildNumber=$IOS_BN)"

# ----------------------------------------------------------------------------
section "EAS submission setup"
# ----------------------------------------------------------------------------

if npx eas whoami >/dev/null 2>&1; then
  WHO=$(npx eas whoami 2>/dev/null | head -1)
  pass "EAS auth: $WHO"
else
  fail "Not logged in to EAS — run: npx eas login"
fi

KEY_PATH=$(node -p "
  const c = require('./eas.json');
  const p = c.submit?.production?.android?.serviceAccountKeyPath;
  p ? require('path').resolve(p) : ''
" 2>/dev/null || echo "")
if [ -n "$KEY_PATH" ] && [ -f "$KEY_PATH" ]; then
  pass "Android service-account key present ($DIM$KEY_PATH$RESET)"
elif [ -n "$KEY_PATH" ]; then
  fail "Android service-account key missing at $KEY_PATH"
else
  warn "No Android service-account key configured in eas.json"
fi

ASC_APP_ID=$(node -p "require('./eas.json').submit?.production?.ios?.ascAppId || ''" 2>/dev/null || echo "")
if [ -n "$ASC_APP_ID" ]; then
  pass "App Store Connect app ID configured ($ASC_APP_ID)"
else
  warn "No App Store Connect app ID in eas.json"
fi

# ----------------------------------------------------------------------------
section "Hosting (Finix fee schedule + Apple Pay)"
# ----------------------------------------------------------------------------

if [ -f "$ROOT/public/fees.html" ]; then
  pass "public/fees.html present (Finix fee disclosure)"
else
  fail "public/fees.html missing — required by Finix hosted onboarding"
fi

if [ -f "$ROOT/public/checkout/tokenize.html" ]; then
  pass "public/checkout/tokenize.html present"
else
  fail "public/checkout/tokenize.html missing — payment form won't load"
fi

APPLE_DOMAIN_FILE="$ROOT/public/.well-known/apple-developer-merchantid-domain-association"
if [ -f "$APPLE_DOMAIN_FILE" ]; then
  pass "Apple Pay domain association file present"
else
  warn "Apple Pay domain association file missing at public/.well-known/ (only needed if shipping Apple Pay via web tokenization)"
fi

# ----------------------------------------------------------------------------
section "Firebase tooling"
# ----------------------------------------------------------------------------

if command -v firebase >/dev/null 2>&1; then
  pass "firebase CLI installed: $(firebase --version 2>/dev/null | head -1)"
else
  fail "firebase CLI not found — install with: npm install -g firebase-tools"
fi

if [ -f "$ROOT/firebase.json" ]; then
  pass "firebase.json present"
else
  fail "firebase.json missing"
fi

# ----------------------------------------------------------------------------
section "Summary"
# ----------------------------------------------------------------------------

if [ "$FAILED" -eq 0 ] && [ "$WARNED" -eq 0 ]; then
  printf "\n%s✓ All checks passed%s\n" "$GREEN" "$RESET"
  exit 0
elif [ "$FAILED" -eq 0 ]; then
  printf "\n%s✓ Critical checks passed%s (with %d warning%s)\n" "$GREEN" "$RESET" "$WARNED" "$([ "$WARNED" = "1" ] || echo s)"
  exit 0
else
  printf "\n%s✗ %d failure%s, %d warning%s%s — fix before shipping\n" "$RED" "$FAILED" "$([ "$FAILED" = "1" ] || echo s)" "$WARNED" "$([ "$WARNED" = "1" ] || echo s)" "$RESET"
  exit 1
fi
