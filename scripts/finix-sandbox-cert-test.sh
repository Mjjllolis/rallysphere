#!/usr/bin/env bash
#
# Finix Sandbox Certification — evidence generator
# ------------------------------------------------
# Runs end-to-end against the Finix SANDBOX and prints copy/paste-able evidence
# for the certification data points Finix checks:
#
#   #2  Successful transaction        (Transfer -> SUCCEEDED)
#   #3  Failed transaction            (decline-trigger amount -> FAILED)
#   #4/#11 Successful refund/reversal (POST /transfers/{id}/reversals)
#   #5  Address verification          (postal_code on the Payment Instrument)
#   #6  Idempotency                   (same idempotency_id -> same Transfer, no double charge)
#   #7  Fraud session id              (top-level fraud_session_id on the Transfer)
#
# NOTE: This creates the card Payment Instrument via the API purely to produce
# test evidence quickly. In the live app, cards are tokenized with Finix's
# hosted Tokenization Form (cert item #8) — this script does not change that.
#
# Usage:
#   export FINIX_USERNAME='USsandbox...'        # sandbox API user
#   export FINIX_PASSWORD='...'                 # sandbox API password
#   export FINIX_MERCHANT_ID='MU...'            # an onboarded SANDBOX merchant (a club)
#   # optional: export FRAUD_SESSION_ID='...'   # from the form's getSessionKey(); else a placeholder
#   ./scripts/finix-sandbox-cert-test.sh
#
set -euo pipefail

BASE="https://finix.sandbox-payments-api.com"
: "${FINIX_USERNAME:?Set FINIX_USERNAME (sandbox API user)}"
: "${FINIX_PASSWORD:?Set FINIX_PASSWORD (sandbox API password)}"
: "${FINIX_MERCHANT_ID:?Set FINIX_MERCHANT_ID (an onboarded sandbox merchant, e.g. MU...)}"
FRAUD_SESSION_ID="${FRAUD_SESSION_ID:-test_fraud_session}"

# Finix sandbox test values (docs.finix.com -> Testing Your Integration)
SUCCESS_CARD="4895142232120006"   # Visa — approved on DUMMY_V1 sandbox processor
DECLINE_AMOUNT_CENTS=102          # 102 = "declined" (others: 193 insufficient, 194 invalid, 889986 AVS, 889987 CVC)
SUCCESS_AMOUNT_CENTS=1299         # any non-trigger amount succeeds

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required (brew install jq)"; exit 1; }

OUT_DIR="scripts/finix-evidence"
mkdir -p "$OUT_DIR"

AUTH=(-u "${FINIX_USERNAME}:${FINIX_PASSWORD}")
HDR=(-H "Content-Type: application/json" -H "Accept: application/hal+json")

api() { # method path body  -> response saved to last_response.json, echoed to stdout
  curl -sS "${AUTH[@]}" "${HDR[@]}" -X "$1" "${BASE}$2" ${3:+-d "$3"} | tee "$OUT_DIR/last_response.json"
}

save() { cp "$OUT_DIR/last_response.json" "$OUT_DIR/$1.json"; }

section() { printf '\n\033[1;36m=== %s ===\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
section "1. Create buyer Identity"
IDENTITY=$(api POST /identities '{
  "entity": { "first_name": "Cert", "last_name": "Tester", "email": "cert-test@rallysphere.com" }
}'); save 1-identity
IDENTITY_ID=$(echo "$IDENTITY" | jq -r '.id')
echo "identity: $IDENTITY_ID"

# ---------------------------------------------------------------------------
section "2. Create Payment Instrument with address (AVS / #5)"
PI=$(api POST /payment_instruments "$(jq -n --arg id "$IDENTITY_ID" --arg num "$SUCCESS_CARD" '{
  type: "PAYMENT_CARD",
  name: "Cert Tester",
  number: $num,
  expiration_month: 12,
  expiration_year: 2030,
  security_code: "123",
  address: { line1: "1 Market St", city: "San Francisco", region: "CA", postal_code: "94105", country: "USA" },
  identity: $id
}')"); save 2-payment-instrument
PI_ID=$(echo "$PI" | jq -r '.id')
echo "payment_instrument: $PI_ID"
echo "address on PI (AVS evidence):"
echo "$PI" | jq '{postal_code: .address.postal_code, region: .address.region, country: .address.country, avs: .address_verification}'

# ---------------------------------------------------------------------------
section "3. SUCCESSFUL Transfer with idempotency_id + fraud_session_id (#2, #6, #7)"
IDEM_KEY="cert-success-$(echo "$PI_ID" | tr -d 'PI')"
TRANSFER_BODY=$(jq -n \
  --arg m "$FINIX_MERCHANT_ID" --arg s "$PI_ID" --arg idem "$IDEM_KEY" --arg fraud "$FRAUD_SESSION_ID" \
  --argjson amt "$SUCCESS_AMOUNT_CENTS" '{
    merchant: $m, source: $s, amount: $amt, currency: "USD",
    idempotency_id: $idem,
    fraud_session_id: $fraud,
    tags: { purpose: "cert-test" }
  }')
TRANSFER=$(api POST /transfers "$TRANSFER_BODY"); save 3-transfer-success
TRANSFER_ID=$(echo "$TRANSFER" | jq -r '.id')
echo "transfer: $TRANSFER_ID"
echo "$TRANSFER" | jq '{id, state, amount, currency, fraud_session_id, idempotency_id}'

# ---------------------------------------------------------------------------
section "4. REPLAY same idempotency_id -> Finix must reject the duplicate (#6)"
REPLAY=$(api POST /transfers "$TRANSFER_BODY"); save 4-idempotency-replay
DUP_MSG=$(echo "$REPLAY" | jq -r '._embedded.errors[0].message // empty')
if echo "$DUP_MSG" | grep -qi "idempotency"; then
  echo "✅ idempotent: $DUP_MSG"
else
  echo "⚠️  expected a duplicate-idempotency rejection; got:"; echo "$REPLAY" | jq '.'
fi

# ---------------------------------------------------------------------------
section "5. FAILED Transfer via decline-trigger amount ${DECLINE_AMOUNT_CENTS} (#3)"
FAIL=$(api POST /transfers "$(jq -n \
  --arg m "$FINIX_MERCHANT_ID" --arg s "$PI_ID" --arg idem "cert-decline-$IDEM_KEY" --arg fraud "$FRAUD_SESSION_ID" \
  --argjson amt "$DECLINE_AMOUNT_CENTS" '{
    merchant: $m, source: $s, amount: $amt, currency: "USD",
    idempotency_id: $idem, fraud_session_id: $fraud, tags: { purpose: "cert-decline" }
  }')"); save 5-transfer-failed
echo "$FAIL" | jq '{id, state, failure_code, failure_message, error: ._embedded.errors[0].message?}'

# ---------------------------------------------------------------------------
section "6. REFUND / reversal of the successful transfer (#4, #11)"
REVERSAL=$(api POST "/transfers/${TRANSFER_ID}/reversals" "$(jq -n --arg idem "refund-$TRANSFER_ID" '{ idempotency_id: $idem }')"); save 6-refund-reversal
echo "$REVERSAL" | jq '{id, state, type, amount, parent_transfer: .transfer}'

section "DONE"
echo "Transfer (success):  $BASE/transfers/$TRANSFER_ID"
echo "Raw evidence JSON saved under $OUT_DIR/"
echo "Open the transfer in the Finix sandbox dashboard for screenshots."
