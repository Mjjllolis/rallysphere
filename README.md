# RallySphere

A React Native application built with Expo for event management and community engagement.

## Table of Contents
- [Finix Migration](#finix-migration)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Development](#development)

---

## Finix Migration

RallySphere is migrating payments from Braintree to **Finix** (decision locked 2026-04-21). Full plan lives at `~/.claude/plans/woolly-doodling-falcon.md`. Sandbox certification is tracked against the checklist from Mary Bassek (Finix Customer Delivery Manager).

### Locked-in architecture decisions

| Area | Decision |
|---|---|
| Sub-merchant onboarding | Finix **Hosted Onboarding Forms** (Persona selfie + Gov ID) |
| Card tokenization | **WebView + Finix Tokenization Form** hosted on Firebase Hosting at `/checkout/tokenize.html` |
| Buyer fees | **Supplemental Fee** — keep 10% + $0.29 passed to buyer |
| Cutover strategy | **Full rip-and-replace** of Braintree |
| ACH | **Included at launch** with NACHA authorization language |
| Apple Pay / Google Pay | **Included at launch** via Tokenization Form wallet buttons |
| Subscriptions | **Port to Finix now** (Rally Pro + club tiers) |
| Existing clubs | **Wipe Braintree merchant data** — one-time Firestore script, re-onboard all |

### Implementation todo (execute in order)

#### Backend — Cloud Functions (`functions/src/index.ts`)
- [ ] Remove `braintree` from `functions/package.json`; add `uuid` + Finix Node SDK (or `axios`)
- [ ] Add Finix env vars: `FINIX_ENVIRONMENT`, `FINIX_USERNAME`, `FINIX_PASSWORD`, `FINIX_APPLICATION_ID`, `FINIX_PLATFORM_MERCHANT_ID`, `FINIX_WEBHOOK_SECRET` (sandbox + `_LIVE` variants)
- [ ] Replace `getBraintreeClientToken` with `getFinixTokenizationContext` (returns applicationId + environment)
- [ ] Rewrite `createEventTransaction` → `POST /transfers` with idempotency key, fee split, AVS zip, fraud_session_id tag
- [ ] Rewrite `createStoreTransaction` → same pattern
- [ ] Rewrite `createSubMerchantAccount` → creates Finix identity + returns hosted onboarding URL
- [ ] Rewrite `getSubMerchantStatus` → `GET /merchants/{id}`
- [ ] Rewrite `leaveEventWithRefund`, `refundTicketOrder`, `refundStoreOrder` → `POST /transfers/{id}/reversals`
- [ ] Rewrite subscription functions (`createProSubscription`, `createUserProSubscription`, `createClubSubscription` + cancels) → Finix `subscription_schedules` + enrollments
- [ ] Replace `braintreeWebhook` with `finixWebhook`: HMAC signature verification, handle `underwriting.*`, `dispute.*`, `transfer.succeeded/failed`, `subscription_schedule_enrollment.*`; idempotency via `webhookEvents` collection
- [ ] Update all Firestore writes: `provider: "braintree"` → `provider: "finix"`

#### Frontend — `lib/finix.ts` (renamed from `lib/stripe.ts`)
- [ ] Rename `lib/stripe.ts` → `lib/finix.ts`
- [ ] Delete `lib/stripe-web-stub.js`
- [ ] Swap `paymentMethodNonce: string` → `tokenId: string`; add `fraudSessionId?: string`
- [ ] Remove `@deprecated createStripeConnectAccount` and `checkStripeAccountStatus` aliases
- [ ] Update all imports: `'../lib/stripe'` → `'../lib/finix'` (in `PaymentSheet`, `StorePaymentSheet`, `PaymentModal`, `StripeConnectSetup`, `stripe-connect/*.tsx`)

#### Frontend — Tokenization Form (Firebase Hosting)
- [ ] Create `public/checkout/tokenize.html` — loads `js.finix.com/v/1/finix.js`, instantiates `Finix.CardTokenForm` + `Finix.BankAccountTokenForm`, AVS with `postal_code` required, Apple Pay + Google Pay options
- [ ] Add `public/checkout/*` to `firebase.json` hosting config
- [ ] Deploy Firebase Hosting
- [ ] Update `components/PaymentSheet.tsx` — replace `buildDropInHtml` with WebView loading hosted URL, handle `token` + `fraudSessionId` postMessage
- [ ] Update `components/StorePaymentSheet.tsx` — same swap
- [ ] Update `components/PaymentModal.tsx` — same swap

#### Frontend — Onboarding
- [ ] Rename `components/StripeConnectSetup.tsx` → `components/FinixPayoutsSetup.tsx`
- [ ] Add ToS + fee disclosure checkboxes before "Continue to Finix" button
- [ ] Open hosted onboarding URL via `expo-web-browser`
- [ ] Rename `app/stripe-connect/` → `app/finix-onboarding/` (updates `return.tsx` and `refresh.tsx`)
- [ ] Deep link: `rallysphere://finix-onboarding/return?clubId=...&identityId=...`

#### Frontend — ACH
- [ ] New component `components/AchAuthorizationBlock.tsx` with NACHA authorization + confirmation language
- [ ] Render inside `PaymentSheet` + `StorePaymentSheet` when ACH tab selected
- [ ] Update `app/payment-success.tsx` to show "3–5 business day clearing" notice when `paymentMethod === 'ach'`
- [ ] New sandbox-only dev screen `app/dev/finix-ach-test.tsx` for simulated returns

#### Frontend — Apple Pay / Google Pay
- [ ] Register Apple Pay merchant ID `merchant.com.rallysphere.payments` in Apple Developer Portal
- [ ] Add `com.apple.developer.in-app-payments` entitlement via `app.json` or `ios/` config
- [ ] Host `/.well-known/apple-developer-merchantid-domain-association` via Firebase Hosting
- [ ] Register domain with Finix in their dashboard
- [ ] Pass `applePay` + `googlePay` options to Tokenization Form

#### Data migration
- [ ] Write `scripts/wipe-braintree-merchant-data.ts` with `--dry-run` and `--apply` flags
- [ ] Dry-run against production Firestore; review log
- [ ] Apply to wipe `braintreeMerchantAccountId`, `braintreeAccountStatus`, `braintreeOnboardingComplete` from `clubs/*`; initialize `finixMerchantId: null`, `finixIdentityId: null`, `finixOnboardingComplete: false`
- [ ] Email subscribed users asking them to re-subscribe on Finix (Braintree subs stop at cutover)

#### Cleanup
- [ ] Remove Stripe key-rotation section from this README
- [ ] Remove Stripe Connect Setup section from this README
- [ ] Update `.env` example in README: remove `STRIPE_*` and `BRAINTREE_*`, add `FINIX_*`
- [ ] Audit `check-club.js` and `fix-data.js` for stale `braintree*` field references

### Sandbox certification checklist (Mary's email)

Verify each before requesting Finix to check the sandbox:

- [ ] **Onboarding process confirmed**: Hosted Onboarding Forms
- [ ] **Successful transaction**: Finix test card `4000000000000002` → `transfer.succeeded` webhook → `payments` doc `status: "succeeded"`
- [ ] **Failed transaction**: Decline card `4000000000000036` → `transfer.failed` webhook → `payments` doc `status: "failed"`
- [ ] **Successful refund**: Admin refund → reversal in Finix dashboard → `ticketOrders` doc `status: "refunded"`
- [ ] **AVS in Payment Instrument**: zip code (`postal_code`) present on tokenized instrument
- [ ] **Idempotency**: retry same callable with same `idempotencyKey` → single transfer, no double charge
- [ ] **Fraud Session ID**: emitted by Tokenization Form, forwarded, attached to `/transfers` as tag
- [ ] **Finix Tokenization Form**: form origin is `js.finix.com/v/1/finix.js`
- [ ] **Webhooks listening**: disputes + merchant onboarding minimum; confirm `webhookEvents` Firestore docs on test fires
- [ ] **ACH authorization language**: visible before ACH submit, matches NACHA-approved copy
- [ ] **ACH confirmation language**: shown on post-submit screen
- [ ] **ACH returns/reversals tested**: test routing `110000000` + return test → order flips to `failed`

### Post-cert (production launch)

- [ ] Swap sandbox env vars → live (`FINIX_*_LIVE`)
- [ ] Update `public/checkout/tokenize.html` to use production Finix application id
- [ ] Register Apple Pay domain with Finix production
- [ ] Flip `FINIX_ENVIRONMENT=live`
- [ ] Redeploy Functions + Hosting
- [ ] Test $1 live transaction end-to-end

### Open items (user input needed)

- [ ] Finix sandbox credentials (username, password, application id, platform merchant id, webhook secret) from Mary
- [ ] Support email for ACH authorization language (e.g. `support@rallysphere.com`)
- [ ] Apple Pay merchant ID name (suggested `merchant.com.rallysphere.payments`)
- [ ] Exact fee disclosure wording for onboarding form

---

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables (see [Environment Variables](#environment-variables))

3. Run the app:
```bash
npx expo start
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id

# Stripe Configuration (use test keys for development)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

**IMPORTANT:** Never commit the `.env` file to version control. It should be listed in `.gitignore`.

## Security

### Secret Management

**NEVER commit API keys, tokens, or secrets to version control.** Always use environment variables and keep them in `.env` files that are excluded from git.

### What to do if a secret is leaked:

1. **Immediately rotate/revoke the compromised secret**
2. **Check security logs for unauthorized access**
3. **Update your application with the new secret**
4. **Close the security alert in GitHub**

### How to Rotate Stripe API Keys

If your Stripe API key has been compromised, follow these steps:

#### 1. Create a New API Key

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers** → **API keys**
3. For Test Mode:
   - Click **Create secret key** in the Test mode section
   - Give it a descriptive name (e.g., "RallySphere Test Key - 2024-10")
   - Copy the new secret key (starts with `sk_test_`)
4. For Live Mode (production):
   - Switch to **Live mode** using the toggle
   - Click **Create secret key**
   - Give it a descriptive name
   - Copy the new secret key (starts with `sk_live_`)

#### 2. Update Your Application

1. Update your `.env` file with the new key:
   ```env
   STRIPE_SECRET_KEY=sk_test_NEW_KEY_HERE
   ```

2. If using Firebase Functions or backend services, update the environment variables:
   ```bash
   # For Firebase Functions
   firebase functions:config:set stripe.secret_key="sk_test_NEW_KEY_HERE"

   # Deploy the updated config
   firebase deploy --only functions
   ```

3. Restart your development server to load the new environment variable

#### 3. Revoke the Old Key

1. Return to the [Stripe Dashboard](https://dashboard.stripe.com/) → **API keys**
2. Find the compromised key in the list
3. Click the **⋯** (three dots) menu next to the key
4. Select **Delete** or **Roll key**
5. Confirm the deletion

#### 4. Verify the Change

1. Test your application to ensure it's using the new key
2. Check Stripe Dashboard logs to confirm API requests are working
3. Monitor for any errors in your application logs

#### 5. Review Access Logs

1. In Stripe Dashboard, go to **Developers** → **Events**
2. Review recent API activity for any suspicious requests
3. Check for any unauthorized charges or customer data access

### Additional Security Best Practices

- Use separate API keys for development, staging, and production
- Rotate API keys regularly (every 90 days recommended)
- Use restricted API keys with minimal permissions when possible
- Enable two-factor authentication on all service accounts
- Monitor GitHub for secret scanning alerts
- Use environment variable management tools like:
  - AWS Secrets Manager
  - Google Cloud Secret Manager
  - HashiCorp Vault
  - Doppler

### Firebase Security

If you're using Firebase Functions, store secrets using Firebase Functions config:

```bash
# Set a secret
firebase functions:config:set service.api_key="your_api_key"

# View all secrets (values are hidden)
firebase functions:config:get

# Remove a secret
firebase functions:config:unset service.api_key
```

### Preventing Future Leaks

1. **Use `.gitignore`:** Ensure `.env`, secrets files, and credentials are listed
2. **Use environment variables:** Never hardcode secrets in source code
3. **Enable GitHub secret scanning:** Automatically detect committed secrets
4. **Use pre-commit hooks:** Scan for secrets before committing
5. **Review pull requests:** Check for accidentally committed secrets
6. **Use `.env.example`:** Commit a template file with dummy values

Create a `.env.example` file to help other developers:
```env
# .env.example
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

## Stripe Connect Setup

RallySphere uses Stripe Connect to allow clubs to receive payouts from paid events. Before clubs can accept payments, you need to enable Stripe Connect in your Stripe account.

### Enable Stripe Connect

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Make sure you're in **Test Mode** (toggle in the top right)
3. Navigate to **Connect** in the left sidebar
   - Or go directly to: https://dashboard.stripe.com/test/connect/accounts/overview
4. Click **Get Started** to enable Stripe Connect
5. Fill out the required information:
   - **Platform name**: RallySphere (or your app name)
   - **Platform URL**: Your app URL or website
   - **Support email**: Your support email

### Configure Connect Settings

1. Go to **Connect** → **Settings**
2. Under **Branding**:
   - Add your platform name
   - Upload a platform icon/logo
   - Set your brand color
3. Under **Express accounts**:
   - Ensure account onboarding is enabled
   - Required capabilities should include "Transfers"

### How It Works

When a club admin sets up payouts in your app:

1. User taps "Connect Stripe" in the club settings
2. App calls Firebase Function to create a Stripe Connect Express account
3. Function returns an onboarding URL
4. App opens the URL in the device browser
5. User completes Stripe's onboarding process (identity verification, bank details, etc.)
6. Stripe redirects back to your app via deep link: `rallysphere://stripe-connect/return`
7. App checks account status and displays connection success

### Testing the Flow

1. Enable Stripe Connect in test mode (steps above)
2. In your app, navigate to a club you admin
3. Tap "Connect Stripe" or "Set up payouts"
4. Complete the test onboarding in the browser
5. Use Stripe's test data:
   - SSN: `000-00-0000`
   - Bank routing: `110000000`
   - Bank account: `000123456789`

### Revenue Split

- **90%** goes to the club (after Stripe processing fees)
- **10%** platform fee
- Stripe processing fees: 2.9% + $0.30 per transaction

Clubs receive payouts automatically via Stripe's standard payout schedule (typically 2 business days).

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
# iOS
npx expo build:ios

# Android
npx expo build:android
```

### Firebase Deployment
```bash
firebase deploy
```

## License

[Your License Here]
