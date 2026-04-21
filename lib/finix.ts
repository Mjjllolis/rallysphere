// lib/stripe.ts — Braintree payment service for RallySphere
// File kept as stripe.ts to avoid import changes throughout the app.
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

// ============================================================================
// GET BRAINTREE CLIENT TOKEN
// Call this before showing the payment UI to initialize Braintree Drop-in.
// ============================================================================

export const getBraintreeClientToken = async (): Promise<{ success: boolean; clientToken?: string; error?: string }> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in to make a payment' };
    }

    const fn = httpsCallable(functions, 'getBraintreeClientToken');
    const result = await fn({});
    const data = result.data as any;

    if (data.clientToken) {
      return { success: true, clientToken: data.clientToken };
    }
    return { success: false, error: 'Failed to get payment token' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to initialize payment' };
  }
};

// ============================================================================
// CREATE EVENT TICKET TRANSACTION
// Called after the Braintree Drop-in returns a nonce.
// ============================================================================

export interface CreateEventTransactionParams {
  paymentMethodNonce: string;
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
  breakdown?: PaymentBreakdown;
  error?: string;
}

export const createEventTransaction = async (
  params: CreateEventTransactionParams
): Promise<CreateEventTransactionResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in to purchase tickets' };
    }

    const fn = httpsCallable(functions, 'createEventTransaction');
    const result = await fn({
      paymentMethodNonce: params.paymentMethodNonce,
      eventId: params.eventId,
      ticketPrice: params.ticketPrice,
      currency: params.currency || 'usd',
      discountApplied: params.discountApplied,
      originalPrice: params.originalPrice,
      discountAmount: params.discountAmount,
    });

    const data = result.data as any;
    if (data.success && data.transactionId) {
      return {
        success: true,
        transactionId: data.transactionId,
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
// Called after the Braintree Drop-in returns a nonce.
// ============================================================================

export interface CreateStoreTransactionParams {
  paymentMethodNonce: string;
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
  breakdown?: StoreBreakdown;
  error?: string;
}

export const createStoreTransaction = async (
  params: CreateStoreTransactionParams
): Promise<CreateStoreTransactionResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in to purchase' };
    }

    const fn = httpsCallable(functions, 'createStoreTransaction');
    const result = await fn({
      paymentMethodNonce: params.paymentMethodNonce,
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
    const currentUser = auth.currentUser;
    if (!currentUser) {
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
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in to process refunds' };
    }

    const fn = httpsCallable(functions, 'refundTicketOrder');
    const result = await fn({ orderId, clubId });
    const data = result.data as any;

    return {
      success: true,
      refundId: data.refundId,
      refundAmount: data.refundAmount,
    };
  } catch (error: any) {
    const errorMessage = error.details?.message || error.message || 'Failed to process refund';
    return { success: false, error: errorMessage };
  }
};

export const refundStoreOrder = async (orderId: string, clubId: string): Promise<RefundResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in to process refunds' };
    }

    const fn = httpsCallable(functions, 'refundStoreOrder');
    const result = await fn({ orderId, clubId });
    const data = result.data as any;

    return {
      success: true,
      refundId: data.refundId,
      refundAmount: data.refundAmount,
    };
  } catch (error: any) {
    const errorMessage = error.details?.message || error.message || 'Failed to process refund';
    return { success: false, error: errorMessage };
  }
};

// ============================================================================
// SUB-MERCHANT ACCOUNT (Club Payouts)
// ============================================================================

export interface SubMerchantIndividual {
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  ssn?: string;         // last 4 digits or full SSN (required for production)
  address?: {
    streetAddress: string;
    locality: string;  // city
    region: string;    // state
    postalCode: string;
  };
}

export interface SubMerchantFunding {
  accountNumber: string;
  routingNumber: string;
}

export const createSubMerchantAccount = async (
  clubId: string,
  email: string,
  clubName: string,
  individual?: SubMerchantIndividual,
  funding?: SubMerchantFunding
) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in' };
    }

    const fn = httpsCallable(functions, 'createSubMerchantAccount');
    const result = await fn({ clubId, email, clubName, individual, funding });
    const data = result.data as any;

    return {
      success: true,
      merchantAccountId: data.merchantAccountId,
      status: data.status,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create merchant account' };
  }
};

export const getSubMerchantStatus = async (merchantAccountId: string) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be logged in' };
    }

    const fn = httpsCallable(functions, 'getSubMerchantStatus');
    const result = await fn({ merchantAccountId });
    const data = result.data as any;

    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// ============================================================================
// LEGACY ALIASES
// These names are used in older screens — keep them pointing to the new fns.
// ============================================================================

/** @deprecated Use createSubMerchantAccount */
export const createStripeConnectAccount = async (clubId: string, email: string, clubName: string) =>
  createSubMerchantAccount(clubId, email, clubName);

/** @deprecated Use getSubMerchantStatus */
export const checkStripeAccountStatus = async (merchantAccountId: string) =>
  getSubMerchantStatus(merchantAccountId);
