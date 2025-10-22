// lib/stripe.ts - Stripe payment service for RallySphere
import { initStripe, useStripe } from '@stripe/stripe-react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Constants from 'expo-constants';
import { app } from './firebase';

// Initialize Stripe with publishable key
const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// Initialize Stripe SDK
export const initializeStripe = async () => {
  try {
    await initStripe({
      publishableKey,
      merchantIdentifier: 'merchant.com.rallysphere', // Update with your merchant ID for Apple Pay
      urlScheme: 'rallysphere', // For handling redirects
    });
    console.log('Stripe initialized successfully');
    return { success: true };
  } catch (error: any) {
    console.error('Error initializing Stripe:', error);
    return { success: false, error: error.message };
  }
};

// Get current auth instance
import { getAuth } from 'firebase/auth';
const auth = getAuth(app);

// Firebase functions instance - specify region to match deployment
// If your functions are deployed to a specific region, specify it here
// Default is us-central1
const functions = getFunctions(app, 'us-central1');

// Debug: Log functions URL to verify we're not using emulator
console.log('Firebase Functions URL:', functions.customDomain || 'using default');
console.log('Firebase Auth:', auth.currentUser ? 'User authenticated' : 'No user');

export interface CreatePaymentIntentParams {
  eventId: string;
  ticketPrice: number;
  currency?: string;
}

export interface CreatePaymentIntentResult {
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  breakdown?: {
    ticketPrice: number;
    processingFee: number;
    platformFee: number;
    totalAmount: number;
    clubReceives: number;
  };
  error?: string;
}

/**
 * Create a payment intent for an event ticket
 * This calls the Firebase Cloud Function to securely create the payment intent
 */
export const createPaymentIntent = async (
  params: CreatePaymentIntentParams
): Promise<CreatePaymentIntentResult> => {
  try {
    const createPaymentIntentFn = httpsCallable(functions, 'createPaymentIntent');

    const result = await createPaymentIntentFn({
      eventId: params.eventId,
      ticketPrice: params.ticketPrice,
      currency: params.currency || 'usd',
    });

    const data = result.data as any;

    if (data.clientSecret && data.paymentIntentId) {
      return {
        success: true,
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
        breakdown: data.breakdown,
      };
    } else {
      return {
        success: false,
        error: 'Invalid response from payment service',
      };
    }
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    return {
      success: false,
      error: error.message || 'Failed to create payment intent',
    };
  }
};

export interface ProcessPaymentParams {
  clientSecret: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  error?: string;
}

/**
 * Process a payment using the Stripe SDK
 * This should be called from a component that has access to the useStripe hook
 */
export const processPayment = async (
  stripe: ReturnType<typeof useStripe>,
  params: ProcessPaymentParams
): Promise<ProcessPaymentResult> => {
  try {
    if (!stripe.confirmPayment) {
      return {
        success: false,
        error: 'Stripe is not initialized',
      };
    }

    const { error, paymentIntent } = await stripe.confirmPayment(params.clientSecret, {
      paymentMethodType: 'Card',
    });

    if (error) {
      console.error('Payment confirmation error:', error);
      return {
        success: false,
        error: error.message || 'Payment failed',
      };
    }

    if (paymentIntent && paymentIntent.status === 'Succeeded') {
      return { success: true };
    }

    return {
      success: false,
      error: 'Payment was not successful',
    };
  } catch (error: any) {
    console.error('Error processing payment:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
};

/**
 * Create a Stripe Checkout Session for browser-based payment
 * This will redirect the user to a Stripe-hosted payment page
 */
export interface CreateCheckoutSessionParams {
  eventId: string;
  ticketPrice: number;
  currency?: string;
}

export interface CreateCheckoutSessionResult {
  success: boolean;
  sessionId?: string;
  checkoutUrl?: string;
  error?: string;
}

export const createCheckoutSession = async (
  params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user found');
      return {
        success: false,
        error: 'You must be logged in to purchase tickets',
      };
    }

    console.log('Creating checkout session for:', {
      eventId: params.eventId,
      ticketPrice: params.ticketPrice,
      userId: currentUser.uid,
      email: currentUser.email
    });

    // Get fresh auth token to ensure it's valid
    const idToken = await currentUser.getIdToken(true);
    console.log('Got auth token for checkout, length:', idToken.length);

    const createSessionFn = httpsCallable(functions, 'createCheckoutSession');
    const result = await createSessionFn({
      eventId: params.eventId,
      ticketPrice: params.ticketPrice,
      currency: params.currency || 'usd',
    });

    const data = result.data as any;

    if (data.sessionId && data.checkoutUrl) {
      return {
        success: true,
        sessionId: data.sessionId,
        checkoutUrl: data.checkoutUrl,
      };
    } else {
      return {
        success: false,
        error: 'Invalid response from payment service',
      };
    }
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      customData: error.customData
    });
    return {
      success: false,
      error: error.message || 'Failed to create checkout session',
    };
  }
};

/**
 * Get user's payment history
 */
export const getUserPayments = async () => {
  try {
    const getUserPaymentsFn = httpsCallable(functions, 'getUserPayments');
    const result = await getUserPaymentsFn();
    const data = result.data as any;

    return {
      success: true,
      payments: data.payments || [],
    };
  } catch (error: any) {
    console.error('Error getting user payments:', error);
    return {
      success: false,
      error: error.message,
      payments: [],
    };
  }
};

/**
 * Create a Stripe Connect account for a club
 */
export const createStripeConnectAccount = async (clubId: string, email: string, clubName: string) => {
  try {
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user found');
      return {
        success: false,
        error: 'You must be logged in to connect Stripe',
      };
    }

    console.log('Creating Stripe Connect account for:', { clubId, email, clubName, userId: currentUser.uid });

    // Get fresh auth token to ensure it's valid
    const idToken = await currentUser.getIdToken(true);
    console.log('Got auth token, length:', idToken.length);

    const createAccountFn = httpsCallable(functions, 'createStripeConnectAccount');
    const result = await createAccountFn({ clubId, email, clubName });
    const data = result.data as any;

    return {
      success: true,
      accountId: data.accountId,
      onboardingUrl: data.onboardingUrl,
    };
  } catch (error: any) {
    console.error('Error creating Stripe Connect account:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      customData: error.customData
    });
    return {
      success: false,
      error: error.message || 'Failed to create Stripe account',
    };
  }
};

/**
 * Check Stripe Connect account status
 */
export const checkStripeAccountStatus = async (accountId: string) => {
  try {
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user found');
      return {
        success: false,
        error: 'You must be logged in to check account status',
      };
    }

    const checkStatusFn = httpsCallable(functions, 'checkStripeAccountStatus');
    const result = await checkStatusFn({ accountId });
    const data = result.data as any;

    return {
      success: true,
      ...data,
    };
  } catch (error: any) {
    console.error('Error checking account status:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Export the useStripe hook for use in components
export { useStripe };