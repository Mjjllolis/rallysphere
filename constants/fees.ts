// constants/fees.ts
// The app's entry point for transaction fees. Import fees from HERE, not from
// functions/src.
//
// The numbers themselves are defined once, in functions/src/fees.ts, and
// re-exported below — that file is the only place both the app build and the
// Cloud Functions build already compile, so a single definition can serve both
// without changing either build's output layout. See the comment there.
//
// What's added here is presentation: copy and links that only the app needs,
// derived from the same constants so a disclosure can never state a fee we
// don't actually charge.

export { SERVICE_FEE_PERCENTAGE, SERVICE_FEE_FIXED, calcServiceFee } from '../functions/src/fees';

import { SERVICE_FEE_PERCENTAGE, SERVICE_FEE_FIXED } from '../functions/src/fees';

/** e.g. "10% + $0.29" — for inline copy that must match what we actually charge. */
export const SERVICE_FEE_LABEL =
  `${Math.round(SERVICE_FEE_PERCENTAGE * 100)}% + $${SERVICE_FEE_FIXED.toFixed(2)}`;

/** Public, human-readable fee schedule (public/fees.html). */
export const FEE_SCHEDULE_URL =
  `${process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://rally-sphere.web.app'}/fees.html`;

/**
 * Shown to clubs during payout onboarding to satisfy Finix's "Presenting Fees"
 * requirement. Reworded copy is fine; the numbers must stay derived from the
 * constants above so the disclosure can never drift from the actual charge.
 */
export const SELLER_FEE_DISCLOSURE =
  `RallySphere charges your club nothing to receive payments. A ${SERVICE_FEE_LABEL} ` +
  `service fee is added to each order and paid by the buyer — your club receives 100% ` +
  `of your listed price. Card processing costs are paid by RallySphere out of that fee. ` +
  `We’ll notify you before these fees change.`;
