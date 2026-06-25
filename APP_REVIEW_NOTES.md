# App Store Review — Submission Notes (v1.0)

Context: Resubmission addressing rejection of build 49 (Submission ID
0ed5e071-4af5-4850-976c-d6ece3a56e92, reviewed June 23, 2026):
- Guideline 5.1.1(ii) — vague photo library purpose string → fixed in build (new string)
- Guideline 2.1 — Apple Pay (PassKit) could not be located → reviewer steps below

---

## App Store Connect — App Review Information

**Sign-In Information** (Sign-in required = checked)
- User Name: `+1 650-555-1234`
- Password: `123456`

  (This app uses phone-number authentication with an SMS code — there is no
  email/password login. The "username" is the test phone number and the
  "password" is its fixed verification code. Configured as a Firebase test
  phone number, so no real SMS is sent.)

---

## Notes field — paste verbatim

```
TEST SIGN-IN
This app uses phone-number authentication (SMS code) — there is no
email/password login. Use the pre-provisioned test number below; it
needs NO real SMS and the code always works:

   Phone number:        +1 650-555-1234   (enter as 6505551234)
   Verification code:   123456

Steps: Launch app → continue with phone → enter 6505551234 →
enter code 123456 → signed in.

(The Sign-In fields above list this number as the username and the
code as the password, since there is no separate password.)

──────────────────────────────────────────────
GUIDELINE 2.1 — WHERE TO FIND APPLE PAY

Apple Pay is used to pay for purchases through our payment processor
(Finix). The easiest place to see it:

1. Tap the "Store" tab in the bottom navigation.
2. Open any product and tap "Add to Cart".
3. Open the cart and tap "Checkout".
4. The payment sheet opens with the Apple Pay button at the top
   (card and bank options appear below it).

Apple Pay also appears at checkout when buying a ticket for any PAID
event (an event with a ticket price greater than $0). It does not
appear for free events because no payment is required — this is
expected behavior.

──────────────────────────────────────────────
GUIDELINE 5.1.1(ii) — PHOTO LIBRARY

The photo library purpose string has been updated in this build to
clearly describe its use with a specific example (selecting an image
for a profile picture, club logo, or event/store photo).
```

---

## Pre-submission checklist
- [ ] Firebase test phone number `+1 650-555-1234` / `123456` added (Auth → Sign-in method → Phone → Phone numbers for testing) — DONE
- [ ] Verify a fresh sign-in with the test number can reach Apple Pay in the Store
      (Store must have ≥1 purchasable product whose club has active payouts)
- [ ] Photo string fix is in the uploaded binary (app.json + Info.plist) — DONE in repo, needs rebuild
- [ ] New build uploaded (reviewed build was 49; app.json buildNumber is 50)
- [ ] Notes field + Sign-In fields updated in App Store Connect
