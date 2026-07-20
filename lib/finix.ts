// lib/finix.ts — Finix payment service for RallySphere
import { getFunctions, httpsCallable } from 'firebase/functions';
// Import the same auth instance that lib/firebase initializes with React Native
// persistence — calling getAuth(app) here separately would create a fresh
// instance whose currentUser is null on RN, leading to "unauthenticated" calls.
import { app, auth } from './firebase';

const functions = getFunctions(app, 'us-central1');

// ============================================================================
// INTERFACES
// ============================================================================

export interface PaymentBreakdown {
  ticketPrice: number;
  processingFee: number;
  platformFee: number;
  totalAmount: number;
  clubReceives: number;
}

export interface StoreBreakdown {
  subtotal: number;
  shipping: number;
  tax: number;
  processingFee: number;
  platformFee: number;
  clubReceives: number;
  totalAmount: number;
}

export interface LeaveEventResult {
  success: boolean;
  refundProcessed?: boolean;
  refundAmount?: number;
  creditsForfeited?: number;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  refundAmount?: number;
  error?: string;
}

export interface FinixTokenizationContext {
  applicationId: string;
  environment: 'sandbox' | 'live';
  /** Platform merchant id, used to seed Finix.Auth() for the fraud session id. */
  merchantId?: string;
}

export interface SavedPaymentInstrument {
  piId: string;
  brand: string | null;       // visa, mastercard, amex, discover, etc.
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  type: string;               // PAYMENT_CARD, BANK_ACCOUNT
  isDefault: boolean;
  createdAt: number | null;   // ms epoch
}

const DEFAULT_TOKENIZE_URL = 'https://rally-sphere.web.app/checkout/tokenize.html';

/**
 * Build the URL to load in the checkout WebView. The page hosts the Finix
 * Tokenization Form(s) for card + ACH + wallets; it postMessages a token back
 * to the RN host on success.
 */
export function buildFinixTokenizeUrl(opts: {
  context: FinixTokenizationContext;
  amount?: number;
  ach?: boolean;
  wallets?: boolean;
  walletsOnly?: boolean;
  /** Render ONLY the bank-account form — for collecting a club's payout bank during onboarding. */
  bankOnly?: boolean;
  external?: boolean;
  debug?: boolean;
  supportEmail?: string;
  theme?: 'dark' | 'light';
  overrideBaseUrl?: string;
}): string {
  const base = opts.overrideBaseUrl || process.env.EXPO_PUBLIC_FINIX_CHECKOUT_URL || DEFAULT_TOKENIZE_URL;
  const p = new URLSearchParams();
  p.set('env', opts.context.environment);
  p.set('appId', opts.context.applicationId);
  // Merchant id seeds Finix.Auth() in the form so it can produce a fraud session id.
  if (opts.context.merchantId) p.set('merchantId', opts.context.merchantId);
  if (opts.amount != null) p.set('amount', opts.amount.toFixed(2));
  if (opts.ach) p.set('ach', 'true');
  if (opts.wallets) p.set('wallets', 'true');
  if (opts.walletsOnly) p.set('walletsOnly', 'true');
  if (opts.bankOnly) p.set('bankOnly', 'true');
  if (opts.external) p.set('external', 'true');
  if (opts.debug) p.set('debug', 'true');
  if (opts.supportEmail) p.set('supportEmail', opts.supportEmail);
  if (opts.theme) p.set('theme', opts.theme);
  return `${base}?${p.toString()}`;
}

/**
 * Generate an idempotency key for a payment attempt. Finix dedupes Transfers
 * that share an `idempotency_id`, so reusing one key across retries / double
 * taps of the same charge prevents double-billing. Doesn't need crypto-grade
 * randomness — only uniqueness per checkout — so no extra native dependency.
 */
export function newIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// GET FINIX TOKENIZATION CONTEXT
// Frontend calls before loading the Tokenization Form to learn Application ID
// + environment. No per-payment server round-trip — tokenization happens fully
// client-side.
// ============================================================================

export const getFinixTokenizationContext = async (opts?: { debug?: boolean }): Promise<{
  success: boolean;
  context?: FinixTokenizationContext;
  error?: string;
}> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to make a payment' };
    }
    const fn = httpsCallable(functions, 'getFinixTokenizationContext');
    // debug → staff-only sandbox env (enforced server-side).
    const result = await fn({ debug: opts?.debug });
    const data = result.data as any;
    if (data?.applicationId && data?.environment) {
      return { success: true, context: { applicationId: data.applicationId, environment: data.environment, merchantId: data.merchantId } };
    }
    return { success: false, error: 'Failed to get Finix tokenization context' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to initialize payment' };
  }
};

// ============================================================================
// CREATE EVENT TICKET TRANSACTION
// ============================================================================

export interface CreateEventTransactionParams {
  tokenId?: string;
  thirdPartyToken?: string;
  billingContact?: any;
  savedPaymentInstrumentId?: string;
  savePaymentMethod?: boolean;
  fraudSessionId?: string;
  paymentMethod?: 'card' | 'ach' | 'apple_pay' | 'google_pay';
  idempotencyKey?: string;
  /** Staff-only: route this charge to Finix sandbox (enforced server-side). */
  debug?: boolean;
  eventId: string;
  ticketPrice: number;
  currency?: string;
  discountApplied?: {
    redemptionId: string;
    redemptionName: string;
    creditsUsed: number;
  };
  originalPrice?: number;
  discountAmount?: number;
}

export interface CreateEventTransactionResult {
  success: boolean;
  transactionId?: string;
  state?: string;
  breakdown?: PaymentBreakdown;
  error?: string;
}

export const createEventTransaction = async (
  params: CreateEventTransactionParams
): Promise<CreateEventTransactionResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to purchase tickets' };
    }
    const fn = httpsCallable(functions, 'createEventTransaction');
    const result = await fn({
      tokenId: params.tokenId,
      thirdPartyToken: params.thirdPartyToken,
      billingContact: params.billingContact,
      savedPaymentInstrumentId: params.savedPaymentInstrumentId,
      savePaymentMethod: params.savePaymentMethod,
      fraudSessionId: params.fraudSessionId,
      paymentMethod: params.paymentMethod || 'card',
      idempotencyKey: params.idempotencyKey,
      eventId: params.eventId,
      ticketPrice: params.ticketPrice,
      currency: params.currency || 'USD',
      discountApplied: params.discountApplied,
      originalPrice: params.originalPrice,
      discountAmount: params.discountAmount,
      debug: params.debug,
    });

    const data = result.data as any;
    if (data.success && data.transactionId) {
      return {
        success: true,
        transactionId: data.transactionId,
        state: data.state,
        breakdown: data.breakdown,
      };
    }
    return { success: false, error: 'Invalid response from payment service' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Payment failed' };
  }
};

// ============================================================================
// CREATE STORE TRANSACTION
// ============================================================================

export interface CreateStoreTransactionParams {
  tokenId?: string;
  thirdPartyToken?: string;
  billingContact?: any;
  savedPaymentInstrumentId?: string;
  savePaymentMethod?: boolean;
  fraudSessionId?: string;
  paymentMethod?: 'card' | 'ach' | 'apple_pay' | 'google_pay';
  idempotencyKey?: string;
  /** Staff-only: route this charge to Finix sandbox (enforced server-side). */
  debug?: boolean;
  itemId: string;
  quantity: number;
  selectedVariants: { [key: string]: string };
  deliveryMethod: 'shipping' | 'pickup';
  shippingAddress?: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    phone: string;
  };
  rewardDiscount?: {
    redemptionId: string;
    redemptionName: string;
    creditsRequired: number;
    discountAmount: number;
  };
}

export interface CreateStoreTransactionResult {
  success: boolean;
  transactionId?: string;
  state?: string;
  breakdown?: StoreBreakdown;
  error?: string;
}

export const createStoreTransaction = async (
  params: CreateStoreTransactionParams
): Promise<CreateStoreTransactionResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to purchase' };
    }
    const fn = httpsCallable(functions, 'createStoreTransaction');
    const result = await fn({
      tokenId: params.tokenId,
      thirdPartyToken: params.thirdPartyToken,
      billingContact: params.billingContact,
      savedPaymentInstrumentId: params.savedPaymentInstrumentId,
      savePaymentMethod: params.savePaymentMethod,
      fraudSessionId: params.fraudSessionId,
      paymentMethod: params.paymentMethod || 'card',
      idempotencyKey: params.idempotencyKey,
      itemId: params.itemId,
      quantity: params.quantity,
      selectedVariants: params.selectedVariants,
      deliveryMethod: params.deliveryMethod,
      shippingAddress: params.shippingAddress,
      rewardDiscount: params.rewardDiscount,
      debug: params.debug,
    });

    const data = result.data as any;
    if (data.success && data.transactionId) {
      return {
        success: true,
        transactionId: data.transactionId,
        state: data.state,
        breakdown: data.breakdown,
      };
    }
    return { success: false, error: 'Invalid response from payment service' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Payment failed' };
  }
};

// ============================================================================
// LEAVE EVENT WITH REFUND
// ============================================================================

export const leaveEventWithRefund = async (eventId: string): Promise<LeaveEventResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to leave events' };
    }
    const fn = httpsCallable(functions, 'leaveEventWithRefund');
    const result = await fn({ eventId });
    const data = result.data as any;
    return {
      success: true,
      refundProcessed: data.refundProcessed,
      refundAmount: data.refundAmount,
      creditsForfeited: data.creditsForfeited,
    };
  } catch (error: any) {
    const errorMessage = error.details?.message || error.message || 'Failed to leave event';
    return { success: false, error: errorMessage };
  }
};

// ============================================================================
// REFUND FUNCTIONS (Admin)
// ============================================================================

export const refundTicketOrder = async (orderId: string, clubId: string): Promise<RefundResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to process refunds' };
    }
    const fn = httpsCallable(functions, 'refundTicketOrder');
    const result = await fn({ orderId, clubId });
    const data = result.data as any;
    return { success: true, refundId: data.refundId, refundAmount: data.refundAmount };
  } catch (error: any) {
    const errorMessage = error.details?.message || error.message || 'Failed to process refund';
    return { success: false, error: errorMessage };
  }
};

export const refundStoreOrder = async (orderId: string, clubId: string): Promise<RefundResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to process refunds' };
    }
    const fn = httpsCallable(functions, 'refundStoreOrder');
    const result = await fn({ orderId, clubId });
    const data = result.data as any;
    return { success: true, refundId: data.refundId, refundAmount: data.refundAmount };
  } catch (error: any) {
    const errorMessage = error.details?.message || error.message || 'Failed to process refund';
    return { success: false, error: errorMessage };
  }
};

// ============================================================================
// SUB-MERCHANT ACCOUNT (Club Payouts)
//
// DEPRECATED (2026-06-30): hosted onboarding was removed in favor of the in-app
// direct-API wizard (createClubIdentity → addClubBankAccount →
// provisionClubMerchant, below). The `createSubMerchantAccount` wrapper and its
// StartOnboardingResult type were deleted; the backend callable now hard-fails
// for any stale client that still calls it. Use the wizard flow instead.
// getSubMerchantStatus (below) is retained — it's a read-only status check still
// used by the return screen.
// ============================================================================

export interface SubMerchantStatusResult {
  success: boolean;
  status?: string;
  isComplete?: boolean;
  processingEnabled?: boolean;
  settlementEnabled?: boolean;
  merchantId?: string;
  identityId?: string;
  error?: string;
}

export const getSubMerchantStatus = async (
  args: { identityId?: string; merchantId?: string; clubId?: string }
): Promise<SubMerchantStatusResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in' };
    }
    const fn = httpsCallable(functions, 'getSubMerchantStatus');
    const result = await fn(args);
    const data = result.data as any;
    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// ============================================================================
// CUSTOM (DIRECT-API) ONBOARDING — in-app wizard
// Replaces hosted onboarding. The wizard collects KYC and calls these in order:
//   createClubIdentity → addClubBankAccount → provisionClubMerchant
// Sensitive fields (SSN/EIN/bank#) are sent straight through to the callable;
// they are forwarded to Finix server-side and never persisted.
// ============================================================================

export interface FinixAddressInput {
  line1: string;
  line2?: string;
  city: string;
  region: string;      // 2-letter state, e.g. "TX"
  postalCode: string;
  country?: string;    // default "USA"
}

export interface FinixBusinessInput {
  businessName: string;
  doingBusinessAs?: string;
  businessType: string;          // LLC / INDIVIDUAL_SOLE_PROPRIETORSHIP / CORPORATION / ...
  taxId: string;                 // EIN
  phone: string;
  email: string;
  url?: string;
  mcc?: string;
  ownershipType?: string;        // PRIVATE / PUBLIC
  defaultStatementDescriptor?: string;
  maxTransactionAmount?: number; // cents
  annualCardVolume?: number;     // cents
  incorporationDate?: string;    // "YYYY-MM-DD"
  address: FinixAddressInput;
}

export interface FinixPersonInput {
  firstName: string;
  lastName: string;
  title?: string;
  principalPercentageOwnership?: number;
  taxId?: string;                // SSN
  dob?: string;                  // "YYYY-MM-DD"
  phone?: string;
  email?: string;
  address?: FinixAddressInput;
}

export interface FinixUnderwritingInput {
  annualAchVolume?: number;
  averageAchTransferAmount?: number;
  averageCardTransferAmount?: number;
  businessDescription?: string;
  refundPolicy?: string;
  cardVolumeDistribution?: {
    ecommercePercentage?: number;
    cardPresentPercentage?: number;
    mailOrderTelephoneOrderPercentage?: number;
  };
  volumeDistributionByBusinessType?: Record<string, number>;
}

export interface CreateClubIdentityParams {
  clubId: string;
  business: FinixBusinessInput;
  controlPerson: FinixPersonInput;
  owners?: FinixPersonInput[];
  underwriting?: FinixUnderwritingInput;
  consent?: { ip?: string; userAgent?: string; merchantAgreementAccepted?: boolean; timestamp?: string };
}

export const createClubIdentity = async (
  params: CreateClubIdentityParams
): Promise<{ success: boolean; identityId?: string; ownerIdentityIds?: string[]; error?: string }> => {
  try {
    if (!auth.currentUser) return { success: false, error: 'You must be logged in' };
    const fn = httpsCallable(functions, 'createClubIdentity');
    const result = await fn(params);
    const data = result.data as any;
    return { success: true, identityId: data.identityId, ownerIdentityIds: data.ownerIdentityIds };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save business details' };
  }
};

export const addClubBankAccount = async (
  clubId: string,
  tokenId: string,
  ssnLast4?: string
): Promise<{ success: boolean; paymentInstrumentId?: string; last4?: string | null; error?: string }> => {
  try {
    if (!auth.currentUser) return { success: false, error: 'You must be logged in' };
    const fn = httpsCallable(functions, 'addClubBankAccount');
    const result = await fn({ clubId, tokenId, ssnLast4 });
    const data = result.data as any;
    return { success: true, paymentInstrumentId: data.paymentInstrumentId, last4: data.last4 };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to add bank account' };
  }
};

export const provisionClubMerchant = async (
  clubId: string
): Promise<{ success: boolean; merchantId?: string; onboardingState?: string; error?: string }> => {
  try {
    if (!auth.currentUser) return { success: false, error: 'You must be logged in' };
    const fn = httpsCallable(functions, 'provisionClubMerchant');
    const result = await fn({ clubId });
    const data = result.data as any;
    return { success: true, merchantId: data.merchantId, onboardingState: data.onboardingState };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to submit application' };
  }
};

// ============================================================================
// SUBSCRIPTIONS (Finix)
// ============================================================================

export interface CreateSubscriptionParams {
  tokenId: string;
  idempotencyKey?: string;
}

export const createProSubscription = async (
  clubId: string,
  userId: string,
  clubName: string,
  params: CreateSubscriptionParams
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> => {
  try {
    const fn = httpsCallable(functions, 'createProSubscription');
    const result = await fn({
      clubId, userId, clubName,
      tokenId: params.tokenId,
      idempotencyKey: params.idempotencyKey,
    });
    const data = result.data as any;
    return { success: true, subscriptionId: data.subscriptionId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const cancelProSubscription = async (
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fn = httpsCallable(functions, 'cancelProSubscription');
    await fn({ subscriptionId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const createUserProSubscription = async (
  userId: string,
  params: CreateSubscriptionParams
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> => {
  try {
    const fn = httpsCallable(functions, 'createUserProSubscription');
    const result = await fn({ userId, tokenId: params.tokenId, idempotencyKey: params.idempotencyKey });
    const data = result.data as any;
    return { success: true, subscriptionId: data.subscriptionId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const cancelUserProSubscription = async (
  subscriptionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fn = httpsCallable(functions, 'cancelUserProSubscription');
    await fn({ subscriptionId, userId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const createClubSubscription = async (
  clubId: string,
  userId: string,
  params: CreateSubscriptionParams
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> => {
  try {
    const fn = httpsCallable(functions, 'createClubSubscription');
    const result = await fn({ clubId, userId, tokenId: params.tokenId, idempotencyKey: params.idempotencyKey });
    const data = result.data as any;
    return { success: true, subscriptionId: data.subscriptionId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const cancelClubSubscription = async (
  subscriptionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fn = httpsCallable(functions, 'cancelClubSubscription');
    await fn({ subscriptionId, userId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// ============================================================================
// SAVED PAYMENT METHODS
// ============================================================================

export const listSavedPaymentInstruments = async (): Promise<{
  success: boolean;
  instruments?: SavedPaymentInstrument[];
  error?: string;
}> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in' };
    }
    const fn = httpsCallable(functions, 'listPaymentInstruments');
    const result = await fn({});
    const data = result.data as any;
    return { success: true, instruments: data.instruments || [] };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load payment methods' };
  }
};

export const deleteSavedPaymentInstrument = async (
  piId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in' };
    }
    const fn = httpsCallable(functions, 'deletePaymentInstrument');
    await fn({ piId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete payment method' };
  }
};

export const saveNewPaymentMethod = async (
  tokenId: string
): Promise<{ success: boolean; instrument?: SavedPaymentInstrument; error?: string }> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in' };
    }
    const fn = httpsCallable(functions, 'saveNewPaymentInstrument');
    const result = await fn({ tokenId });
    const data = result.data as any;
    if (data?.success && data?.instrument) {
      return { success: true, instrument: data.instrument };
    }
    return { success: false, error: 'Failed to save payment method' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save payment method' };
  }
};

export const setDefaultSavedPaymentInstrument = async (
  piId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in' };
    }
    const fn = httpsCallable(functions, 'setDefaultPaymentInstrument');
    await fn({ piId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to set default' };
  }
};
