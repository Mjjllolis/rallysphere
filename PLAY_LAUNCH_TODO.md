# Google Play Launch — TODO

App is in **Draft**. Org account (no 12-tester gate). Build 13 uploaded as draft production release.

## Blockers

- [ ] Create `safety@rallysphere.com` inbox — child-safety page points at it
- [ ] Build account-deletion web page (Data safety requires a public URL, in-app flow alone isn't enough)
- [ ] Ship build 14 with reporting/blocking — build 13 does NOT have it, can't check the child-safety Terms boxes until it's live

## Deploy

- [ ] `cd rallyspherewebsite && vercel --prod` → `rallysphere.com/child-safety`
- [ ] `firebase deploy --only hosting,firestore:rules` (slow — runs full `expo export` first)
- [ ] `git add android/app/build.gradle app.json && git commit -m "Bump versionCode to 13"`
- [ ] Commit reporting/blocking work
- [ ] `npm run release:android` → build 14

## Play Console

- [ ] **Child safety standards** — URL `https://rallysphere.com/child-safety`, contact = developer email, both Terms boxes (only after build 14 is live)
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
