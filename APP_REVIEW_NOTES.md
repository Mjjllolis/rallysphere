# App Review Notes — v1.0.1 (60)

Resubmission for build 49 rejection (ID 0ed5e071-4af5-4850-976c-d6ece3a56e92, Jun 23 2026):
5.1.1(ii) purpose strings, 2.1 Apple Pay not located.

## Sign-In Information (Sign-in required = checked)
- User Name: `+1 650-555-1234`
- Password: `123456`

## Notes field — paste verbatim

```
TEST SIGN-IN
Phone-number auth (SMS code) — no email/password login. The test
number below needs no real SMS and its code always works:

  Phone: 6505551234    Code: 123456

Launch → continue with phone → 6505551234 → 123456 → signed in.
(The Sign-In fields list the number as username, the code as
password, since there is no separate password.)

────────────────────────────────
2.1 — WHERE TO FIND APPLE PAY

Apple Pay is a payment method for purchases processed through our
processor, Finix.

FASTEST PATH
1. Bottom nav: tap the shopping-bag icon (4th of 5). The tab bar is
   icon-only, no text labels.
2. Tap any product.
3. Tap the green "Buy Now" button at the bottom. This opens checkout
   directly — no cart step.
4. Checkout opens on an order-summary screen. Scroll to the BOTTOM.
   Apple Pay is pinned in the footer, ABOVE an "or" divider:

       [  Apple Pay  ]
       ─────  or  ─────
       [ Continue with Card / Bank — $XX.XX ]

ALSO: open any event with a ticket price over $0, tap "Buy Ticket —
$X.XX + fees" — same footer, same Apple Pay button.

NOT SHOWN WHEN (expected): total is $0 (free events), or the selling
club has not completed processor onboarding. If the first product
does not show it, please try another product or a paid event — the
button depends on the seller being payout-enabled, not the device.

────────────────────────────────
5.1.1(ii) — PURPOSE STRINGS

Photo library rewritten with a specific example (choosing an image
for a profile picture, club logo, or event photo).

We also audited the rest:
- Camera: rewritten with an example (photographing a voided check or
  government ID that our processor requires before a club is paid).
- Location (when in use): rewritten with an example (Local feed
  showing only events within a distance radius you pick).
- Face ID, microphone, background location: keys REMOVED. The app
  does not use them; they were build-tool boilerplate.
```

## Build changes since 49
All in `ios/` (EAS builds the committed dir — `expo prebuild` does not run, so `app.json` alone has no effect); mirrored into `app.json` for future prebuilds.

- `Info.plist` — photo/camera/location strings rewritten with examples; FaceID, microphone, and both location-always keys removed
- `RallySphere.entitlements` — `aps-environment` + `appattest-environment`: development → production
- No Apple Pay code changed; it shipped in 49 and was simply not found

## Checklist
- [x] Firebase test number provisioned (Auth → Sign-in method → Phone → test numbers)
- [x] Plist + entitlement fixes committed to `ios/`
- [ ] Upload build 60 (reviewed was 49)
- [ ] **Seed the reviewer's path** — Store needs ≥1 in-stock product from a payout-enabled club, or "Buy Now" renders no Apple Pay button and 2.1 repeats
- [ ] Walk the Store steps on a clean install with the test account
- [ ] Paste Notes + Sign-In fields into App Store Connect
- [ ] Verify production push (aps-environment changed this build)
