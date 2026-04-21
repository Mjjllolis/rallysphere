// lib/finix.ts — Finix payment service for RallySphere
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
import { getAuth } from 'firebase/auth';

const auth = getAuth(app);
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
  external?: boolean;
  supportEmail?: string;
  overrideBaseUrl?: string;
}): string {
  const base = opts.overrideBaseUrl || process.env.EXPO_PUBLIC_FINIX_CHECKOUT_URL || DEFAULT_TOKENIZE_URL;
  const p = new URLSearchParams();
  p.set('env', opts.context.environment);
  p.set('appId', opts.context.applicationId);
  if (opts.amount != null) p.set('amount', opts.amount.toFixed(2));
  if (opts.ach) p.set('ach', 'true');
  if (opts.wallets) p.set('wallets', 'true');
  if (opts.external) p.set('external', 'true');
  if (opts.supportEmail) p.set('supportEmail', opts.supportEmail);
  return `${base}?${p.toString()}`;
}

// ============================================================================
// GET FINIX TOKENIZATION CONTEXT
// Frontend calls before loading the Tokenization Form to learn Application ID
// + environment. No per-payment server round-trip — tokenization happens fully
// client-side.
// ============================================================================

export const getFinixTokenizationContext = async (): Promise<{
  success: boolean;
  context?: FinixTokenizationContext;
  error?: string;
}> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in to make a payment' };
    }
    const fn = httpsCallable(functions, 'getFinixTokenizationContext');
    const result = await fn({});
    const data = result.data as any;
    if (data?.applicationId && data?.environment) {
      return { success: true, context: { applicationId: data.applicationId, environment: data.environment } };
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
  tokenId: string;
  fraudSessionId?: string;
  paymentMethod?: 'card' | 'ach' | 'apple_pay' | 'google_pay';
  idempotencyKey?: string;
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
      fraudSessionId: params.fraudSessionId,
      paymentMethod: params.paymentMethod || 'card',
      idempotencyKey: params.idempotencyKey,
      eventId: params.eventId,
      ticketPrice: params.ticketPrice,
      currency: params.currency || 'USD',
      discountApplied: params.discountApplied,
      originalPrice: params.originalPrice,
      discountAmount: params.discountAmount,
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
  tokenId: string;
  fraudSessionId?: string;
  paymentMethod?: 'card' | 'ach' | 'apple_pay' | 'google_pay';
  idempotencyKey?: string;
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
      fraudSessionId: params.fraudSessionId,
      paymentMethod: params.paymentMethod || 'card',
      idempotencyKey: params.idempotencyKey,
      itemId: params.itemId,
      quantity: params.quantity,
      selectedVariants: params.selectedVariants,
      deliveryMethod: params.deliveryMethod,
      shippingAddress: params.shippingAddress,
      rewardDiscount: params.rewardDiscount,
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
// SUB-MERCHANT ACCOUNT (Club Payouts) — Finix Hosted Onboarding
// ============================================================================

export interface StartOnboardingResult {
  success: boolean;
  identityId?: string;
  merchantId?: string;
  onboardingFormId?: string;
  onboardingUrl?: string | null;
  status?: string;
  error?: string;
}

/**
 * Starts (or resumes) hosted onboarding for a club. Returns a URL the club
 * admin should open to complete KYC on Finix's hosted form. Finix redirects
 * to the deep link `rallysphere://finix-onboarding/return?clubId=...` on
 * completion.
 */
export const createSubMerchantAccount = async (
  clubId: string,
  email: string,
  clubName: string,
  returnUrl?: string
): Promise<StartOnboardingResult> => {
  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be logged in' };
    }
    const fn = httpsCallable(functions, 'createSubMerchantAccount');
    const result = await fn({ clubId, email, clubName, returnUrl });
    const data = result.data as any;
    return {
      success: true,
      identityId: data.identityId,
      merchantId: data.merchantId,
      onboardingFormId: data.onboardingFormId,
      onboardingUrl: data.onboardingUrl,
      status: data.status,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to start onboarding' };
  }
};

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
