# RallySphere — Production To Do

## App Check — missing Android fingerprints

Registered in Firebase App Check → Android app → Play Integrity:
- ✅ Local debug keystore: `BD:96:7D:FB:0B:EF:AA:7E:FD:3F:E7:54:3C:45:E6:5C:98:94:38:D8:71:A9:9F:B3:BD:BB:E9:B9:7A:0A:CD:97`
- ✅ EAS `development` keystore: `7F:59:9F:98:6F:AD:E1:53:CA:79:F5:3E:9B:83:1E:40:0D:AB:0A:F7:6A:4F:FE:96:5C:48:06:41:45:87:04:D6`

Still to add via **Add another fingerprint** in Firebase App Check → Android:

- [ ] **EAS `production` keystore SHA-256** — run `eas credentials` → Android → `production` → Keystore. Copy SHA-256, add to Firebase.
- [ ] **Google Play App Signing key SHA-256** — after first Play Console upload. Play Console → Setup → **App integrity** → **App signing** → copy "App signing key certificate" SHA-256. Add to Firebase.

Without these, production Android builds fail App Check once enforcement is on.

## App Check — iOS production entitlement

- [ ] Change `app.json` before TestFlight / App Store builds:
  ```
  "com.apple.developer.devicecheck.appattest-environment": "production"
  ```
  (Currently `"development"` — correct for local/dev-client builds, wrong for store builds.)

## App Check — activation workflow (do in order)

- [ ] `npm install` — install `@react-native-firebase/*` and `expo-build-properties`.
- [ ] `npx expo prebuild --clean` — regenerate `ios/` + `android/` with new plugins and entitlements.
- [ ] Build a new dev client:
  - iOS: `eas build --profile development --platform ios` (or `npx expo run:ios --device`)
  - Android: `eas build --profile development --platform android` (or `npx expo run:android --device`)
- [ ] Launch the built app on a real device. Watch the log for `[Firebase/AppCheck]` — copy the debug token.
- [ ] In Firebase Console → App Check → [app] → ⋮ → **Manage debug tokens** → Add. Name it "Mishawn iOS dev" / "Mishawn Android dev".
  - Alternative: add to `.env` as `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN=...` for a persistent dev token across rebuilds.
- [ ] In Firebase Console → App Check dashboard, watch **Verified requests** climb. If you see only **Unverified**, debug before moving on.
- [ ] Once healthy, click **Enforce** on each service: Firestore, Auth, Storage, Functions.

## MFA — activation workflow

- [ ] Firebase Console → Authentication → **Settings** → **Sign-in method** tab → scroll to **Multi-factor Authentication** → ensure **SMS** is **Enabled**.
- [ ] (Recommended for smoother iOS phone auth) Firebase Console → Project settings → **Cloud Messaging** → upload an **APNs Authentication Key** (.p8 from Apple Developer Portal). Without this, phone auth falls back to reCAPTCHA modal — it works but less seamless. Required for silent device verification.
- [ ] Android: verify SHA-1 fingerprints are registered in **Project settings → Your apps → Android app → Add fingerprint** (separate from App Check's Play Integrity fingerprints). Without SHA-1, Android phone auth fails.
- [ ] Test flow on device:
  1. Sign up with email+password (new user).
  2. Check email inbox → click verification link.
  3. In app: Profile tab → Settings → **Security** → tap "I verified" → **Enable two-factor auth** → enter phone → enter SMS code → done.
  4. Sign out. Sign back in with email+password. You should be routed to the MFA challenge screen → enter SMS code → in.

## Firebase / GCP hardening

- [ ] Auth → Settings → **SMS region policy** — allow only countries you serve.
- [ ] GCP → Billing → **Budget alert** at $25–50/mo with email on 50/90/100%.
- [ ] Auth → Settings → **Phone numbers for testing** — add `+15555551234` / `123456` for QA without real SMS.

## Nice-to-haves (not blocking launch)

- [ ] "Set password" screen for existing phone-auth users — call `linkEmailPassword(email, password)` from Security settings so phone signups can later add a password and enable MFA.
- [ ] Home-screen banner prompting users to verify email + enable MFA.
