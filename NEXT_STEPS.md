# Next Steps

## Braintree Marketplace — Enable Sub-Merchant Accounts

Sub-merchant accounts allow clubs to receive automated payouts directly to their bank accounts after ticket/store sales. This requires Braintree Marketplace to be enabled on the account.

**Current status:** Marketplace is not yet enabled on the sandbox account (`qsd85d757skkx7b9`). The master merchant account ID is `rallyspherellc` and is already configured in `functions/.env`.

### How to enable

**Option 1 — Support ticket (recommended)**
1. Log into [sandbox.braintreegateway.com](https://sandbox.braintreegateway.com)
2. Go to **Account → Help / Contact Support**
3. Request: *"Please enable Braintree Marketplace on my sandbox account. Merchant ID: qsd85d757skkx7b9"*

**Option 2 — Email**
Email `dl_marketplace_team@paypal.com`:
> "I'd like to enable Braintree Marketplace on my sandbox account. Merchant ID: qsd85d757skkx7b9"

Once enabled, the "Set Up Payouts" flow in the app will work without any further code changes. Just redeploy functions.

### In the meantime

As a workaround during development/beta:
- All payments collect to the master Braintree account (`rallyspherellc`)
- Track club revenue owed in Firestore manually
- Pay clubs out manually (bank transfer, Venmo, etc.)

This is a common pattern for early-stage platforms before Marketplace is set up.
