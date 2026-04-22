# RallySphere

A React Native application built with Expo for event management and community engagement.

## Table of Contents
- [Finix Integration](#finix-integration)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Finix Payouts Setup](#finix-payouts-setup)
- [Development](#development)

---

## Finix Integration

RallySphere uses **Finix** for payments and payouts (decision locked 2026-04-21). Full plan lives at `~/.claude/plans/woolly-doodling-falcon.md`. Sandbox certification is tracked against the checklist from Mary Bassek (Finix Customer Delivery Manager).

### Architecture decisions

| Area | Decision |
|---|---|
| Sub-merchant onboarding | Finix **Hosted Onboarding Forms** (Persona selfie + Gov ID) |
| Card tokenization | **WebView + Finix Tokenization Form** hosted on Firebase Hosting at `/checkout/tokenize.html` |
| Buyer fees | **Supplemental Fee** — keep 10% + $0.29 passed to buyer |
| ACH | **Included at launch** with NACHA authorization language |
| Apple Pay / Google Pay | **Included at launch** via Tokenization Form wallet buttons |
| Subscriptions | Finix `subscription_schedules` + enrollments (Rally Pro + club tiers) |

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

# Google Configuration (Maps / Places)
EXPO_PUBLIC_GOOGLE_API_KEY=your_google_api_key
```

Create `functions/.env` for Cloud Functions secrets:

```env
# App environment: "true" = sandbox, "false" = production
TEST_MODE=true

# Finix sandbox API credentials
FINIX_USERNAME=USxxxxxxxxxxxxxxx
FINIX_PASSWORD=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
FINIX_APPLICATION_ID=APxxxxxxxxxxxxxxx
FINIX_PLATFORM_MERCHANT_ID=MUxxxxxxxxxxxxxxx
FINIX_WEBHOOK_SECRET=your_webhook_signing_secret

# Production creds — fill in at live cutover
FINIX_USERNAME_LIVE=
FINIX_PASSWORD_LIVE=
FINIX_APPLICATION_ID_LIVE=
FINIX_PLATFORM_MERCHANT_ID_LIVE=
```

**IMPORTANT:** Never commit `.env` files to version control. They must be listed in `.gitignore`.

## Security

### Secret Management

**NEVER commit API keys, tokens, or secrets to version control.** Always use environment variables and keep them in `.env` files that are excluded from git.

### What to do if a secret is leaked

1. **Immediately rotate/revoke the compromised secret** in the provider's dashboard
2. **Check provider logs for unauthorized access**
3. **Update your application `.env` and any CI/CD secret stores with the new value**
4. **Close any security alert in GitHub**

### How to Rotate Finix API Keys

1. Sign in to the Finix Dashboard
2. Navigate to **Settings → API Keys**
3. **Delete / Disable** the compromised key pair
4. Click **Create API Key** → copy the new ID (`US…`) and secret (UUID) immediately — Finix only shows the secret once
5. Update both `.env` and `functions/.env` with the new `FINIX_USERNAME` and `FINIX_PASSWORD`
6. Redeploy Cloud Functions: `firebase deploy --only functions`
7. Test a sandbox transaction end-to-end to confirm the new key works

### How to Rotate Firebase / Google API Keys

1. Open the Google Cloud Console for the `rally-sphere` project → **APIs & Services → Credentials**
2. Click the affected key → **Regenerate key**
3. Set tight **Application restrictions** (iOS bundle IDs, Android package + SHA-1, HTTP referrers) and **API restrictions** (only the APIs you actually call)
4. Paste the new value into:
   - Local `.env`
   - EAS environment variables (`eas env:update` for each environment)
   - Firebase config files if applicable (`google-services.json` / `GoogleService-Info.plist` — re-download from Firebase Console)
5. Rebuild and redeploy

### Additional Security Best Practices

- Use separate API keys for development, staging, and production
- Rotate API keys regularly (every 90 days recommended)
- Use restricted API keys with minimal permissions when possible
- Enable two-factor authentication on all service accounts
- Monitor GitHub for secret-scanning alerts
- Prefer managed secret stores over plaintext `.env` for production:
  - Google Cloud Secret Manager (recommended for Firebase Functions via `defineSecret`)
  - AWS Secrets Manager
  - HashiCorp Vault
  - Doppler

### Firebase Functions Secrets

For production, migrate sensitive env vars to Google Secret Manager:

```bash
# Set a secret
firebase functions:secrets:set FINIX_PASSWORD

# Reference it in code via defineSecret('FINIX_PASSWORD')
# Deploy
firebase deploy --only functions
```

### Preventing Future Leaks

1. **Use `.gitignore`:** Ensure `.env`, secrets files, and credentials are listed (including `*.bak`)
2. **Use environment variables:** Never hardcode secrets in source code
3. **Enable GitHub secret scanning:** Automatically detect committed secrets
4. **Use pre-commit hooks:** Scan for secrets before committing
5. **Review pull requests:** Check for accidentally committed secrets
6. **Use `.env.example`:** Commit a template file with dummy values

---

## Finix Payouts Setup

RallySphere uses Finix sub-merchant accounts so clubs can receive payouts from paid events. Before clubs can accept payments, they must complete Finix's hosted onboarding flow.

### How It Works

When a club admin sets up payouts in the app:

1. User taps **Set up payouts** in club settings
2. App calls the `createSubMerchantAccount` Cloud Function, which creates a Finix identity and returns a hosted onboarding URL
3. App opens the URL via `expo-web-browser`
4. User completes Finix's onboarding (business details, beneficial owners, bank account, Persona selfie + Gov ID verification)
5. Finix redirects back via deep link: `rallysphere://finix-onboarding/return?clubId=…&identityId=…`
6. Webhook `underwriting.*` updates the club's Firestore doc: `finixMerchantAccountActive: true`

### Testing the Flow (Sandbox)

1. In the app, sign in as a club admin
2. Tap **Set up payouts**
3. Complete the hosted onboarding in the browser — use Finix sandbox test data:
   - SSN: `000-00-0000`
   - Bank routing: `110000000`
   - Bank account: `000123456789`
4. Return to the app and confirm the club shows **Payouts enabled**

### Revenue Split

- **90%** goes to the club
- **10%** platform fee
- Finix processing fees per their pricing schedule (see Finix Dashboard → Settings → Pricing)
- Buyer Supplemental Fee: 10% + $0.29 passed through to the purchaser

Payouts settle to the club's bank account on Finix's standard schedule.

---

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

### Firebase Deployment
```bash
firebase deploy --only functions
firebase deploy --only hosting
```

## License

[Your License Here]
