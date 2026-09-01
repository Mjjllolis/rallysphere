# Google Play Launch — TODO

App is in **Draft**. Org account (no 12-tester gate). Build 13 uploaded as draft production release.

## Blockers

- [ ] Build account-deletion web page (Data safety requires a public URL, in-app flow alone isn't enough)
- [ ] Ship build 14 with reporting/blocking — build 13 does NOT have it, can't check the child-safety Terms boxes until it's live

## Deploy

- [x] Website deployed — `rallysphere.com/child-safety` live and verified
- [ ] `firebase deploy --only firestore:rules` — REQUIRED before build 14 ships, or Report writes fail permission-denied (fast; no expo export)
- [ ] `git add android/app/build.gradle app.json && git commit -m "Bump versionCode to 13"`
- [ ] Commit reporting/blocking work
- [ ] `npm run release:android` → build 14

## Play Console

- [x] **Child safety standards** — URL added and verified live
- [ ] Child safety: tick both Terms boxes (ONLY after build 14 with reporting is live)
- [ ] **Advertising ID** — No (verified: no AD_ID in manifest, no ads SDK)
- [ ] **Store listing** — icon, feature graphic, phone + 7"/10" tablet screenshots, short + full description
- [ ] **Privacy policy URL** — `https://rallysphere.com/privacy`
- [ ] **Data safety** — location, photos, phone, name/uid, purchase history; encrypted in transit; account deletion URL. Do NOT mark any data as used for advertising
- [ ] **Content rating** questionnaire
- [ ] **Target audience** — 18+
- [ ] **Ads** — No (must match Advertising ID answer)
- [ ] **Financial features** — payment processing via Finix
- [ ] **App access** — restricted; phone `6505551234`, code `123456`
- [ ] **Release notes** — paste with `<en-US>` tags
- [ ] Send for review

## After build 14 lands

- [ ] Grab App signing key SHA-256 (Protected with Play → Play Store protection → Manage Play app signing)
- [ ] Fix `public/.well-known/assetlinks.json` with real fingerprint, add SHA to Firebase, redeploy hosting

## Optional

- [ ] Cloud Function to email on `reports` where `urgent == true` (currently reports just sit in Firestore)
- [ ] Enable R8 (`android.enableMinifyInReleaseBuilds=true`) for smaller APK — not before launch
- [ ] Link GCP project `rally-sphere` (335059242542) in Play Integrity, then enable App Check enforcement (currently UNENFORCED — leave it until Android is proven in production)
