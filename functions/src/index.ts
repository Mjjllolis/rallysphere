import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

// Initialize Firebase Admin
admin.initializeApp();

// Get Stripe key from environment variable (set in .env file)
const getStripeKey = () => {
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }
  console.warn("No Stripe key found in environment");
  return "";
};

// Initialize Stripe - this will be called when the function executes, not at load time
let stripeInstance: Stripe | null = null;

const getStripe = () => {
  if (!stripeInstance) {
    const apiKey = getStripeKey();
    if (!apiKey) {
      throw new Error("Stripe API key not configured");
    }
    stripeInstance = new Stripe(apiKey, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return stripeInstance;
};

/**
 * Create a Stripe Connect account for a club
 * This allows clubs to receive payouts
 */
export const createStripeConnectAccount = functions.https.onCall(
  {enforceAppCheck: false}, // Temporarily disable App Check enforcement
  async (request: any) => {
    // Gen 2 functions use request.auth instead of context.auth
    const data = request.data;
    const auth = request.auth;

    // Verify user is authenticated
    console.log("CreateStripeConnectAccount called with auth:", {
      hasAuth: !!auth,
      uid: auth?.uid,
      token: auth?.token ? "present" : "missing"
    });

    if (!auth) {
      console.error("Authentication failed - no auth");
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

  const {clubId, email, clubName} = data;

  if (!clubId || !email || !clubName) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields: clubId, email, clubName"
    );
  }

  try {
    const stripe = getStripe();

    // Create Stripe Express account
    const account = await stripe.accounts.create({
      type: "express",
      email: email,
      business_type: "company",
      company: {
        name: clubName,
      },
      capabilities: {
        transfers: {requested: true},
      },
    });

    // Update club with Stripe account ID
    console.log("Updating club with Stripe account ID:", account.id);
    try {
      await admin.firestore().collection("clubs").doc(clubId).update({
        stripeAccountId: account.id,
        stripeAccountStatus: "pending",
        stripeOnboardingComplete: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Club updated successfully with Stripe account ID");
    } catch (updateError: any) {
      console.error("Failed to update club in Firestore:", updateError);
      throw new functions.https.HttpsError(
        "internal",
        `Stripe account created but failed to update club: ${updateError.message}`
      );
    }

    // Create account link for onboarding
    // Note: Stripe requires HTTPS URLs, not custom schemes
    // Using Cloud Functions URL as intermediary for redirect
    const functionsUrl = process.env.FUNCTIONS_URL || "https://us-central1-rally-sphere.cloudfunctions.net";

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${functionsUrl}/stripeConnectRedirect?type=refresh&clubId=${clubId}`,
      return_url: `${functionsUrl}/stripeConnectRedirect?type=return&clubId=${clubId}`,
      type: "account_onboarding",
    });

    return {
      accountId: account.id,
      onboardingUrl: accountLink.url,
    };
  } catch (error: any) {
    console.error("Error creating Stripe Connect account:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to create Stripe account: ${error.message}`
    );
  }
});

/**
 * Check Stripe Connect account status
 */
export const checkStripeAccountStatus = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

  const {accountId} = data;

  if (!accountId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing accountId");
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);

    const isComplete = account.details_submitted && account.charges_enabled && account.payouts_enabled;

    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      isComplete: isComplete,
    };
  } catch (error: any) {
    console.error("Error checking account status:", error);
    throw new functions.https.HttpsError("internal", `Failed to check account status: ${error.message}`);
  }
});

/**
 * Create a Stripe Payment Intent for event ticket purchase
 * Called from the mobile app when a user wants to join a paid event
 */
export const createPaymentIntent = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    // Verify user is authenticated
    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to create payment intent"
      );
    }

  const {eventId, ticketPrice, currency = "usd"} = data;

  // Validate input
  if (!eventId || !ticketPrice) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields: eventId and ticketPrice"
    );
  }

  if (ticketPrice <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Ticket price must be greater than 0"
    );
  }

  try {
    // Get event and club details from Firestore
    const eventDoc = await admin.firestore().collection("events").doc(eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const event = eventDoc.data();
    const userId = auth.uid;

    // Check if user is already attending
    if (event?.attendees?.includes(userId)) {
      throw new functions.https.HttpsError(
        "already-exists",
        "User is already attending this event"
      );
    }

    // Get club details
    const clubDoc = await admin.firestore().collection("clubs").doc(event.clubId).get();
    if (!clubDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Club not found");
    }

    const club = clubDoc.data();

    // Check if club has Stripe account connected
    if (!club?.stripeAccountId || !club?.stripeOnboardingComplete) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Club has not set up payouts yet. Please contact the club organizer."
      );
    }

    // Calculate fees
    const PLATFORM_FEE_PERCENTAGE = 0.10; // 10%
    const STRIPE_FEE_PERCENTAGE = 0.029; // 2.9%
    const STRIPE_FEE_FIXED = 0.30; // $0.30

    // Calculate Stripe processing fee
    const stripeFee = (ticketPrice * STRIPE_FEE_PERCENTAGE) + STRIPE_FEE_FIXED;

    // Total amount to charge user (ticket + stripe fee, tax calculated on frontend)
    const totalAmount = ticketPrice + stripeFee;

    // Platform fee is 10% of total collected
    const platformFee = totalAmount * PLATFORM_FEE_PERCENTAGE;

    // Amount club receives (total - platform fee - actual stripe fee paid)
    const clubAmount = totalAmount - platformFee - stripeFee;

    // Create payment intent with Stripe
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        eventId,
        clubId: event.clubId,
        userId,
        eventTitle: event?.title || "Event Ticket",
        clubName: event?.clubName || "",
        ticketPrice: ticketPrice.toString(),
        platformFee: platformFee.toFixed(2),
        clubAmount: clubAmount.toFixed(2),
        stripeAccountId: club.stripeAccountId,
      },
      description: `Ticket for ${event?.title || "event"}`,
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      breakdown: {
        ticketPrice: ticketPrice,
        processingFee: stripeFee,
        platformFee: platformFee,
        totalAmount: totalAmount,
        clubReceives: clubAmount,
      },
    };
  } catch (error: any) {
    console.error("Error creating payment intent:", error);

    // If it's already a HttpsError, rethrow it
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Otherwise, wrap it in a generic error
    throw new functions.https.HttpsError(
      "internal",
      `Failed to create payment intent: ${error.message}`
    );
  }
});

/**
 * Create a Stripe Checkout Session for event ticket purchase (browser-based)
 * This creates a hosted checkout page that opens in the browser
 */
export const createCheckoutSession = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    // Log auth details
    console.log("CreateCheckoutSession called with auth:", {
      hasAuth: !!auth,
      uid: auth?.uid,
      token: auth?.token ? "present" : "missing",
      data: data
    });

    // Verify user is authenticated
    if (!auth) {
      console.error("Authentication failed - no auth");
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to create checkout session"
      );
    }

    const {eventId, ticketPrice, currency = "usd"} = data;

    // Validate input
    if (!eventId || !ticketPrice) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: eventId and ticketPrice"
      );
    }

    if (ticketPrice <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Ticket price must be greater than 0"
      );
    }

    try {
      // Get event and club details from Firestore
      const eventDoc = await admin.firestore().collection("events").doc(eventId).get();

      if (!eventDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Event not found"
        );
      }

      const event = eventDoc.data();
      const userId = auth.uid;

      // Check if user is already attending
      if (event?.attendees?.includes(userId)) {
        throw new functions.https.HttpsError(
          "already-exists",
          "User is already attending this event"
        );
      }

      // Get club details
      const clubDoc = await admin.firestore().collection("clubs").doc(event.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }

      const club = clubDoc.data();

      // Check if club has Stripe account connected
      if (!club?.stripeAccountId || !club?.stripeOnboardingComplete) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Club has not set up payouts yet. Please contact the club organizer."
        );
      }

      // Calculate fees
      const PLATFORM_FEE_PERCENTAGE = 0.10; // 10%

      // Create Stripe Checkout Session
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `${event?.title || "Event"} - Ticket`,
                description: `Event by ${event?.clubName || ""}`,
              },
              unit_amount: Math.round(ticketPrice * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `rallysphere://payment-success?session_id={CHECKOUT_SESSION_ID}&event_id=${eventId}`,
        cancel_url: `rallysphere://payment-cancel?event_id=${eventId}`,
        metadata: {
          eventId,
          clubId: event.clubId,
          userId,
          eventTitle: event?.title || "Event Ticket",
          clubName: event?.clubName || "",
          ticketPrice: ticketPrice.toString(),
          platformFeePercentage: PLATFORM_FEE_PERCENTAGE.toString(),
          stripeAccountId: club.stripeAccountId,
        },
        payment_intent_data: {
          metadata: {
            eventId,
            clubId: event.clubId,
            userId,
            eventTitle: event?.title || "Event Ticket",
            clubName: event?.clubName || "",
            ticketPrice: ticketPrice.toString(),
            platformFeePercentage: PLATFORM_FEE_PERCENTAGE.toString(),
            stripeAccountId: club.stripeAccountId,
          },
          description: `Ticket for ${event?.title || "event"}`,
        },
      });

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    } catch (error: any) {
      console.error("Error creating checkout session:", error);

      // If it's already a HttpsError, rethrow it
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      // Otherwise, wrap it in a generic error
      throw new functions.https.HttpsError(
        "internal",
        `Failed to create checkout session: ${error.message}`
      );
    }
  });

/**
 * Webhook handler for Stripe events
 * This ensures payment is verified server-side before adding user to event
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    console.error("No Stripe signature found");
    res.status(400).send("No signature");
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    if (!webhookSecret) {
      console.error("Webhook secret not configured");
      res.status(500).send("Webhook secret not configured");
      return;
    }

    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("PaymentIntent succeeded:", paymentIntent.id);

      // Extract metadata
      const {eventId, userId} = paymentIntent.metadata;

      if (!eventId || !userId) {
        console.error("Missing metadata in payment intent");
        break;
      }

      try {
        // Add user to event attendees
        const eventRef = admin.firestore().collection("events").doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
          console.error(`Event ${eventId} not found`);
          break;
        }

        const eventData = eventDoc.data();

        // Check if there's space
        if (eventData?.maxAttendees &&
            eventData.attendees?.length >= eventData.maxAttendees) {
          // Add to waitlist
          await eventRef.update({
            waitlist: admin.firestore.FieldValue.arrayUnion(userId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // Add to attendees
          await eventRef.update({
            attendees: admin.firestore.FieldValue.arrayUnion(userId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Extract metadata
        const stripeAccountId = paymentIntent.metadata.stripeAccountId;
        const clubAmount = parseFloat(paymentIntent.metadata.clubAmount || "0");
        const platformFee = parseFloat(paymentIntent.metadata.platformFee || "0");

        // Transfer money to club immediately via Stripe Transfer
        if (stripeAccountId && clubAmount > 0) {
          try {
            const stripe = getStripe();
            const transfer = await stripe.transfers.create({
              amount: Math.round(clubAmount * 100), // Convert to cents
              currency: paymentIntent.currency,
              destination: stripeAccountId,
              transfer_group: paymentIntent.id,
              metadata: {
                eventId,
                paymentIntentId: paymentIntent.id,
                clubId: paymentIntent.metadata.clubId,
              },
            });

            console.log(`Transfer created: ${transfer.id} for $${clubAmount} to club`);
          } catch (transferError) {
            console.error("Error creating transfer to club:", transferError);
            // Don't fail the whole process, just log it
          }
        }

        // Create payment record
        await admin.firestore().collection("payments").add({
          userId,
          eventId,
          clubId: paymentIntent.metadata.clubId,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          ticketPrice: parseFloat(paymentIntent.metadata.ticketPrice || "0"),
          platformFee: platformFee,
          clubAmount: clubAmount,
          currency: paymentIntent.currency,
          status: "succeeded",
          transferredToClub: clubAmount > 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`User ${userId} added to event ${eventId}. Club receives $${clubAmount}`);
      } catch (error) {
        console.error("Error processing payment:", error);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("PaymentIntent failed:", paymentIntent.id);

      // Log the failed payment
      const {eventId, userId} = paymentIntent.metadata;
      if (eventId && userId) {
        await admin.firestore().collection("payments").add({
          userId,
          eventId,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: "failed",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

/**
 * Redirect handler for Stripe Connect onboarding
 * Stripe requires HTTPS URLs, so this endpoint receives the callback
 * and redirects to the app via deep link
 */
export const stripeConnectRedirect = functions.https.onRequest((req, res) => {
  const {type, clubId} = req.query;

  if (!type || !clubId) {
    res.status(400).send("Missing required parameters");
    return;
  }

  // Redirect to app using deep link
  const deepLink = `rallysphere://stripe-connect/${type}?clubId=${clubId}`;

  // Send HTML that automatically redirects
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Redirecting to RallySphere...</title>
        <meta http-equiv="refresh" content="0;url=${deepLink}">
      </head>
      <body>
        <p>Redirecting to RallySphere...</p>
        <p>If you are not redirected automatically, <a href="${deepLink}">click here</a>.</p>
        <script>
          window.location.href = "${deepLink}";
        </script>
      </body>
    </html>
  `);
});

/**
 * Get payment history for a user
 */
export const getUserPayments = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const auth = request.auth;

    // Verify user is authenticated
    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

  const userId = auth.uid;

  try {
    const paymentsSnapshot = await admin
      .firestore()
      .collection("payments")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const payments = paymentsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {payments};
  } catch (error: any) {
    console.error("Error getting user payments:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to get payments: ${error.message}`
    );
  }
});
