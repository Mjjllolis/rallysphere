// functions/src/fees.ts
// CANONICAL definition of what RallySphere charges on a transaction.
//
// The fee is added ON TOP of the seller's listed price and paid by the buyer —
// the club receives 100% of what it listed (see `clubAmount` in index.ts).
// Card-processing costs come out of this fee, not out of the club's money.
//
// This lives under functions/src rather than constants/ for one reason: it is
// the only directory BOTH builds already compile. The app's tsconfig includes
// `**/*.ts` (so it sees this file), while functions/tsconfig.json includes only
// `src` — and widening that shifts tsc's inferred rootDir, which relocates the
// output to lib/functions/src/index.js and breaks `main: lib/index.js`.
// Verified, not assumed.
//
// App code should NOT import this path directly — import from constants/fees,
// which re-exports these and adds the presentation-layer pieces. There is
// exactly one definition of the numbers, so the two can no longer drift.

export const SERVICE_FEE_PERCENTAGE = 0.10;
export const SERVICE_FEE_FIXED = 0.29;

/** Buyer-paid service fee on a given subtotal, rounded to whole cents. */
export const calcServiceFee = (subtotal: number): number =>
  Math.round(((subtotal * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
