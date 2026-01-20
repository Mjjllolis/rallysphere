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

  const {eventId, ticketPrice, originalPrice, discountAmount, currency = "usd", discountApplied} = data;

  // Validate input
  if (!eventId || ticketPrice == null) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields: eventId and ticketPrice"
    );
  }

  if (ticketPrice < 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Ticket price cannot be negative"
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

    // Use originalPrice for fee calculations (or ticketPrice if no discount)
    const priceForFees = originalPrice || ticketPrice;

    // Calculate fees
    const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% of ticket price
    const STRIPE_FEE_PERCENTAGE = 0.029; // 2.9%
    const STRIPE_FEE_FIXED = 0.30; // $0.30

    // CRITICAL: Stripe processing fee ALWAYS calculated on ORIGINAL price (before discount)
    const stripeFee = (priceForFees * STRIPE_FEE_PERCENTAGE) + STRIPE_FEE_FIXED;

    // Platform fee is 10% of ORIGINAL ticket price only (not including Stripe fees)
    const platformFee = priceForFees * PLATFORM_FEE_PERCENTAGE;

    // Total amount to charge user (discounted ticket price + stripe fee on original price)
    const totalAmount = ticketPrice + stripeFee;

    // Amount club receives (90% of ORIGINAL ticket price)
    const clubAmount = priceForFees - platformFee;

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
        originalPrice: (originalPrice || ticketPrice).toString(),
        discountAmount: (discountAmount || 0).toString(),
        platformFee: platformFee.toFixed(2),
        clubAmount: clubAmount.toFixed(2),
        stripeAccountId: club.stripeAccountId,
        ...(discountApplied && {
          discountRedemptionId: discountApplied.redemptionId,
          discountRedemptionName: discountApplied.redemptionName,
          creditsUsed: discountApplied.creditsUsed?.toString(),
        }),
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
 * Create a Stripe Payment Intent for store item purchase (for in-app payment)
 * Called from the mobile app when a user wants to purchase a store item
 */
export const createStorePaymentIntent = functions.https.onCall(
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

    const {
      itemId,
      quantity,
      selectedVariants,
      deliveryMethod,
      shippingAddress,
      rewardDiscount,
    } = data;

    // Validate input
    if (!itemId || !quantity || !deliveryMethod) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: itemId, quantity, deliveryMethod"
      );
    }

    if (quantity <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Quantity must be greater than 0"
      );
    }

    try {
      const db = admin.firestore();

      // Get item details from Firestore
      const itemDoc = await db.collection("storeItems").doc(itemId).get();

      if (!itemDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Store item not found"
        );
      }

      const item = itemDoc.data() as any;
      const userId = auth.uid;

      // Get club to check for Stripe Connect account
      const clubDoc = await db.collection("clubs").doc(item.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Club not found"
        );
      }

      const club = clubDoc.data() as any;
      const stripeAccountId = club.stripeAccountId;

      if (!stripeAccountId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Club has not set up payouts yet. Please contact the club organizer."
        );
      }

      // Check stock
      const availableStock = item.inventory - (item.sold || 0);
      if (availableStock < quantity) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not enough items in stock"
        );
      }

      // Calculate pricing
      const itemPrice = item.price * quantity;
      const shipping = deliveryMethod === "shipping" ? (item.shippingCost || 0) : 0;

      // ORIGINAL price before any discount (for fee calculation)
      const originalItemAndShipping = itemPrice + shipping;

      // Apply reward discount if provided
      const discountAmount = rewardDiscount?.discountAmount || 0;
      const subtotal = Math.max(0, itemPrice - discountAmount);
      const itemAndShipping = subtotal + shipping;

      // Calculate tax on item + shipping (after discount)
      const taxRate = item.taxRate || 0;
      const tax = Math.round(itemAndShipping * (taxRate / 100) * 100) / 100;

      // CRITICAL: Stripe processing fee ALWAYS calculated on ORIGINAL price (before discount)
      const STRIPE_FEE_PERCENTAGE = 0.029;
      const STRIPE_FEE_FIXED = 0.30;
      const processingFee = Math.round(((originalItemAndShipping * STRIPE_FEE_PERCENTAGE) + STRIPE_FEE_FIXED) * 100) / 100;

      // Platform fee: 10% of ORIGINAL item subtotal only (not shipping/tax)
      const PLATFORM_FEE_PERCENTAGE = 0.10;
      const platformFee = itemPrice * PLATFORM_FEE_PERCENTAGE;

      // Club receives: 90% of ORIGINAL subtotal + shipping + tax (they remit tax)
      const clubAmount = (itemPrice - platformFee) + shipping + tax;

      // Total: discounted item + shipping + tax + processing fee (on original)
      const totalAmount = Math.round((itemAndShipping + tax + processingFee) * 100) / 100;

      // Create payment intent with Stripe
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // Convert to cents
        currency: "usd",
        metadata: {
          type: "store_purchase",
          itemId,
          clubId: item.clubId,
          userId,
          itemName: item.name || "Store Item",
          clubName: item.clubName || "",
          quantity: quantity.toString(),
          selectedVariants: JSON.stringify(selectedVariants || {}),
          deliveryMethod,
          shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : "",
          subtotal: subtotal.toString(),
          tax: tax.toString(),
          platformFee: platformFee.toFixed(2),
          clubAmount: clubAmount.toFixed(2),
          shipping: shipping.toString(),
          totalAmount: totalAmount.toString(),
          stripeAccountId: stripeAccountId,
          originalItemPrice: itemPrice.toString(),
          discountAmount: discountAmount.toString(),
          ...(rewardDiscount && {
            rewardRedemptionId: rewardDiscount.redemptionId,
            rewardRedemptionName: rewardDiscount.redemptionName,
            creditsUsed: rewardDiscount.creditsRequired?.toString(),
          }),
        },
        description: `${item.name || "Store item"} (x${quantity})`,
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          subtotal,
          shipping,
          tax,
          processingFee,
          platformFee,
          rewardDiscount: discountAmount,
          clubReceives: clubAmount,
          totalAmount,
        },
      };
    } catch (error: any) {
      console.error("Error creating store payment intent:", error);

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

    const {eventId, ticketPrice, currency = "usd", successUrl, cancelUrl} = data;

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

      // Use provided URLs or fall back to deep link scheme for native apps
      const defaultSuccessUrl = `rallysphere://payment-success?session_id={CHECKOUT_SESSION_ID}&event_id=${eventId}`;
      const defaultCancelUrl = `rallysphere://payment-cancel?event_id=${eventId}`;

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
        success_url: successUrl || defaultSuccessUrl,
        cancel_url: cancelUrl || defaultCancelUrl,
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

      // Check if this is a store purchase
      if (paymentIntent.metadata.type === "store_purchase") {
        const {
          userId,
          itemId,
          clubId,
          quantity,
          selectedVariants,
          deliveryMethod,
          shippingAddress,
          subtotal,
          tax,
          platformFee,
          clubAmount,
          shipping,
          totalAmount,
          stripeAccountId,
        } = paymentIntent.metadata;

        if (!userId || !itemId) {
          console.error("Missing metadata in store payment intent");
          break;
        }

        try {
          // Get item and user details
          const itemDoc = await admin.firestore().collection("storeItems").doc(itemId).get();
          const userDoc = await admin.firestore().collection("users").doc(userId).get();

          if (!itemDoc.exists || !userDoc.exists) {
            console.error("Item or user not found");
            break;
          }

          const item = itemDoc.data();
          const user = userDoc.data();

          // Parse shipping address if exists
          let parsedAddress = null;
          if (shippingAddress) {
            try {
              parsedAddress = JSON.parse(shippingAddress);
            } catch (e) {
              console.error("Failed to parse shipping address:", e);
            }
          }

          // Parse selected variants
          let parsedVariants = {};
          if (selectedVariants) {
            try {
              parsedVariants = JSON.parse(selectedVariants);
            } catch (e) {
              console.error("Failed to parse selected variants:", e);
            }
          }

          // Transfer money to club (90% of subtotal + shipping)
          const clubAmountNum = parseFloat(clubAmount || "0");
          let transferSuccessful = false;

          if (stripeAccountId && clubAmountNum > 0) {
            try {
              const stripe = getStripe();
              const transfer = await stripe.transfers.create({
                amount: Math.round(clubAmountNum * 100), // Convert to cents
                currency: paymentIntent.currency,
                destination: stripeAccountId,
                transfer_group: paymentIntent.id,
                metadata: {
                  type: "store_purchase",
                  paymentIntentId: paymentIntent.id,
                  itemId,
                  clubId,
                  userId,
                },
              });
              console.log(`Transfer created for store order: ${transfer.id}`);
              transferSuccessful = true;
            } catch (transferError: any) {
              console.error("Error creating transfer for store order:", transferError);
              // Continue to create the order even if transfer fails
            }
          }

          // Create order
          await admin.firestore().collection("storeOrders").add({
            itemId,
            clubId,
            clubName: item?.clubName || "",
            userId,
            userName: user?.displayName || user?.email || "Unknown",
            userEmail: user?.email || "",
            itemName: item?.name || "",
            itemImage: item?.images?.[0] || null,
            quantity: parseInt(quantity),
            selectedVariants: parsedVariants,
            price: parseFloat(subtotal),
            tax: parseFloat(tax || "0"),
            platformFee: parseFloat(platformFee || "0"),
            clubAmount: clubAmountNum,
            shipping: parseFloat(shipping || "0"),
            totalAmount: parseFloat(totalAmount),
            deliveryMethod,
            shippingAddress: parsedAddress,
            status: "pending",
            paymentIntentId: paymentIntent.id,
            transferredToClub: transferSuccessful,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update item sold count
          await admin.firestore().collection("storeItems").doc(itemId).update({
            sold: admin.firestore.FieldValue.increment(parseInt(quantity)),
          });

          console.log(`Store order created for user ${userId}, item ${itemId}`);
        } catch (error) {
          console.error("Error creating store order:", error);
        }
        break;
      }

      // Extract metadata for event ticket purchase
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

        // Create payment record (legacy)
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

        // Get user details for ticket order
        const userDoc = await admin.firestore().collection("users").doc(userId).get();
        const user = userDoc.exists ? userDoc.data() : null;

        // Calculate processing fee
        const ticketPriceNum = parseFloat(paymentIntent.metadata.ticketPrice || "0");
        const totalAmountNum = paymentIntent.amount / 100;
        const processingFee = totalAmountNum - ticketPriceNum;

        // Create ticket order (new order management system)
        await admin.firestore().collection("ticketOrders").add({
          eventId,
          clubId: paymentIntent.metadata.clubId,
          clubName: eventData?.clubName || "",
          userId,
          userName: user?.displayName || user?.email || "Unknown",
          userEmail: user?.email || "",
          eventName: eventData?.title || "",
          eventImage: eventData?.imageUrl || null,
          eventDate: eventData?.startDate || null,
          quantity: 1,
          ticketPrice: ticketPriceNum,
          processingFee: processingFee,
          platformFee: platformFee,
          totalAmount: totalAmountNum,
          clubAmount: clubAmount,
          currency: paymentIntent.currency,
          status: "confirmed",
          paymentIntentId: paymentIntent.id,
          transferredToClub: clubAmount > 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`User ${userId} added to event ${eventId}. Club receives $${clubAmount}. Ticket order created.`);
      } catch (error) {
        console.error("Error processing payment:", error);
      }
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("Checkout session completed:", session.id);

      // Check if this is a store purchase
      if (session.metadata?.type === "store_purchase") {
        const {
          userId,
          itemId,
          clubId,
          quantity,
          selectedVariants,
          deliveryMethod,
          shippingAddress,
          subtotal,
          tax,
          shipping,
          totalAmount,
        } = session.metadata;

        try {
          // Get item and user details
          const itemDoc = await admin.firestore().collection("storeItems").doc(itemId).get();
          const userDoc = await admin.firestore().collection("users").doc(userId).get();

          if (!itemDoc.exists || !userDoc.exists) {
            console.error("Item or user not found");
            break;
          }

          const item = itemDoc.data();
          const user = userDoc.data();

          // Parse shipping address if exists
          let parsedAddress = null;
          if (shippingAddress) {
            try {
              parsedAddress = JSON.parse(shippingAddress);
            } catch (e) {
              console.error("Failed to parse shipping address:", e);
            }
          }

          // Create order
          await admin.firestore().collection("storeOrders").add({
            itemId,
            clubId,
            clubName: item?.clubName || "",
            userId,
            userName: user?.displayName || user?.email || "Unknown",
            userEmail: user?.email || "",
            itemName: item?.name || "",
            itemImage: item?.images?.[0] || null,
            quantity: parseInt(quantity),
            selectedVariants: selectedVariants ? JSON.parse(selectedVariants) : {},
            price: parseFloat(subtotal),
            tax: parseFloat(tax),
            shipping: parseFloat(shipping),
            totalAmount: parseFloat(totalAmount),
            deliveryMethod,
            shippingAddress: parsedAddress,
            status: "pending",
            paymentIntentId: session.payment_intent as string,
            stripeSessionId: session.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update item sold count
          await admin.firestore().collection("storeItems").doc(itemId).update({
            sold: admin.firestore.FieldValue.increment(parseInt(quantity)),
          });

          console.log(`Store order created for user ${userId}, item ${itemId}`);
        } catch (error) {
          console.error("Error creating store order:", error);
        }
      } else if (!session.metadata?.type || session.metadata?.type === "event_ticket") {
        // Handle event ticket purchase via checkout session
        const {eventId, userId, clubId, ticketPrice} = session.metadata || {};

        if (!eventId || !userId) {
          console.error("Missing metadata in ticket checkout session");
          break;
        }

        try {
          // Get event and user details
          const eventDoc = await admin.firestore().collection("events").doc(eventId).get();
          const userDoc = await admin.firestore().collection("users").doc(userId).get();

          if (!eventDoc.exists) {
            console.error(`Event ${eventId} not found`);
            break;
          }

          const eventData = eventDoc.data();
          const user = userDoc.exists ? userDoc.data() : null;

          // Add user to event attendees
          if (eventData?.maxAttendees && eventData.attendees?.length >= eventData.maxAttendees) {
            await admin.firestore().collection("events").doc(eventId).update({
              waitlist: admin.firestore.FieldValue.arrayUnion(userId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            await admin.firestore().collection("events").doc(eventId).update({
              attendees: admin.firestore.FieldValue.arrayUnion(userId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // Calculate fees
          const ticketPriceNum = parseFloat(ticketPrice || "0");
          const totalAmountNum = (session.amount_total || 0) / 100;
          const processingFee = totalAmountNum - ticketPriceNum;
          const platformFee = ticketPriceNum * 0.10; // 10% platform fee
          const clubAmount = ticketPriceNum - platformFee;

          // Create ticket order
          await admin.firestore().collection("ticketOrders").add({
            eventId,
            clubId: clubId || eventData?.clubId || "",
            clubName: eventData?.clubName || "",
            userId,
            userName: user?.displayName || user?.email || "Unknown",
            userEmail: user?.email || "",
            eventName: eventData?.title || "",
            eventImage: eventData?.imageUrl || null,
            eventDate: eventData?.startDate || null,
            quantity: 1,
            ticketPrice: ticketPriceNum,
            processingFee: processingFee,
            platformFee: platformFee,
            totalAmount: totalAmountNum,
            clubAmount: clubAmount,
            currency: session.currency || "usd",
            status: "confirmed",
            paymentIntentId: session.payment_intent as string,
            stripeSessionId: session.id,
            transferredToClub: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Ticket order created for user ${userId}, event ${eventId}`);
        } catch (error) {
          console.error("Error creating ticket order from checkout:", error);
        }
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

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("Checkout session completed:", session.id);

      // Handle Pro subscription checkout
      if (session.metadata?.type === "pro_subscription") {
        const {clubId, clubName, userId} = session.metadata;

        if (!clubId || !userId) {
          console.error("Missing metadata in pro subscription session");
          break;
        }

        try {
          // Get subscription from Stripe
          const stripeInstance = getStripe();
          const subscription = await stripeInstance.subscriptions.retrieve(
            session.subscription as string
          );

          // Create subscription record
          await admin.firestore().collection("proSubscriptions").add({
            clubId,
            clubName,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            priceId: subscription.items.data[0].price.id,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update club with Pro status
          await admin.firestore().collection("clubs").doc(clubId).update({
            isPro: true,
            proSubscriptionId: subscription.id,
            proSubscriptionStatus: subscription.status,
            proSubscriptionStartDate: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            proSubscriptionEndDate: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Pro subscription activated for club ${clubId}`);
        } catch (error) {
          console.error("Error processing pro subscription:", error);
        }
      }

      // Handle User Pro subscription checkout
      if (session.metadata?.type === "user_pro_subscription") {
        const {userId, userEmail} = session.metadata;

        if (!userId) {
          console.error("Missing metadata in user pro subscription session");
          break;
        }

        try {
          // Get subscription from Stripe
          const stripeInstance = getStripe();
          const subscription = await stripeInstance.subscriptions.retrieve(
            session.subscription as string
          );

          // Create user subscription record
          await admin.firestore().collection("userProSubscriptions").add({
            userId,
            userEmail,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            priceId: subscription.items.data[0].price.id,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update user profile with Pro status
          await admin.firestore().collection("users").doc(userId).update({
            isPro: true,
            proSubscriptionId: subscription.id,
            proSubscriptionStatus: subscription.status,
            proSubscriptionStartDate: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            proSubscriptionEndDate: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            stripeCustomerId: session.customer as string,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`User Pro subscription activated for user ${userId}`);
        } catch (error) {
          console.error("Error processing user pro subscription:", error);
        }
      }

      // Handle Club Subscription checkout (user subscribing to a club)
      if (session.metadata?.type === "club_subscription") {
        const {clubId, clubName, userId} = session.metadata;

        if (!clubId || !userId) {
          console.error("Missing metadata in club subscription session");
          break;
        }

        try {
          // Get subscription from Stripe
          const stripeInstance = getStripe();
          const subscription = await stripeInstance.subscriptions.retrieve(
            session.subscription as string
          );

          // Create club subscription record
          await admin.firestore().collection("clubSubscriptions").add({
            clubId,
            clubName,
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            priceId: subscription.items.data[0].price.id,
            amount: subscription.items.data[0].price.unit_amount ?
              subscription.items.data[0].price.unit_amount / 100 : 0,
            currency: subscription.currency,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Add user to club's subscribers array
          await admin.firestore().collection("clubs").doc(clubId).update({
            subscribers: admin.firestore.FieldValue.arrayUnion(userId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Club subscription activated for user ${userId} to club ${clubId}`);
        } catch (error) {
          console.error("Error processing club subscription:", error);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("Subscription updated:", subscription.id);

      try {
        // Check if this is a club Pro subscription
        const clubSubSnapshot = await admin.firestore()
          .collection("proSubscriptions")
          .where("stripeSubscriptionId", "==", subscription.id)
          .get();

        if (!clubSubSnapshot.empty) {
          const subDoc = clubSubSnapshot.docs[0];
          const subData = subDoc.data();

          // Update subscription record
          await subDoc.ref.update({
            status: subscription.status,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update club status
          await admin.firestore().collection("clubs").doc(subData.clubId).update({
            proSubscriptionStatus: subscription.status,
            proSubscriptionEndDate: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Club subscription ${subscription.id} updated`);
        }

        // Check if this is a user Pro subscription
        const userSubSnapshot = await admin.firestore()
          .collection("userProSubscriptions")
          .where("stripeSubscriptionId", "==", subscription.id)
          .get();

        if (!userSubSnapshot.empty) {
          const subDoc = userSubSnapshot.docs[0];
          const subData = subDoc.data();

          // Update subscription record
          await subDoc.ref.update({
            status: subscription.status,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update user profile status
          await admin.firestore().collection("users").doc(subData.userId).update({
            proSubscriptionStatus: subscription.status,
            proSubscriptionEndDate: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`User subscription ${subscription.id} updated`);
        }

        // Check if this is a club subscription (user subscribing to club)
        const clubMemberSubSnapshot = await admin.firestore()
          .collection("clubSubscriptions")
          .where("stripeSubscriptionId", "==", subscription.id)
          .get();

        if (!clubMemberSubSnapshot.empty) {
          const subDoc = clubMemberSubSnapshot.docs[0];

          // Update subscription record
          await subDoc.ref.update({
            status: subscription.status,
            currentPeriodStart: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_start * 1000)
            ),
            currentPeriodEnd: admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            ),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Club member subscription ${subscription.id} updated`);
        }
      } catch (error) {
        console.error("Error updating subscription:", error);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("Subscription deleted:", subscription.id);

      try {
        // Check if this is a club Pro subscription
        const clubSubSnapshot = await admin.firestore()
          .collection("proSubscriptions")
          .where("stripeSubscriptionId", "==", subscription.id)
          .get();

        if (!clubSubSnapshot.empty) {
          const subDoc = clubSubSnapshot.docs[0];
          const subData = subDoc.data();

          // Update subscription record
          await subDoc.ref.update({
            status: "canceled",
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Remove Pro status from club
          await admin.firestore().collection("clubs").doc(subData.clubId).update({
            isPro: false,
            proSubscriptionStatus: "canceled",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Club Pro subscription canceled for club ${subData.clubId}`);
        }

        // Check if this is a user Pro subscription
        const userSubSnapshot = await admin.firestore()
          .collection("userProSubscriptions")
          .where("stripeSubscriptionId", "==", subscription.id)
          .get();

        if (!userSubSnapshot.empty) {
          const subDoc = userSubSnapshot.docs[0];
          const subData = subDoc.data();

          // Update subscription record
          await subDoc.ref.update({
            status: "canceled",
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Remove Pro status from user
          await admin.firestore().collection("users").doc(subData.userId).update({
            isPro: false,
            proSubscriptionStatus: "canceled",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`User Pro subscription canceled for user ${subData.userId}`);
        }

        // Check if this is a club subscription (user subscribing to club)
        const clubMemberSubSnapshot = await admin.firestore()
          .collection("clubSubscriptions")
          .where("stripeSubscriptionId", "==", subscription.id)
          .get();

        if (!clubMemberSubSnapshot.empty) {
          const subDoc = clubMemberSubSnapshot.docs[0];
          const subData = subDoc.data();

          // Update subscription record
          await subDoc.ref.update({
            status: "canceled",
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Remove user from club's subscribers array
          await admin.firestore().collection("clubs").doc(subData.clubId).update({
            subscribers: admin.firestore.FieldValue.arrayRemove(subData.userId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Club subscription canceled for user ${subData.userId} to club ${subData.clubId}`);
        }
      } catch (error) {
        console.error("Error canceling subscription:", error);
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

/**
 * Create a Stripe Checkout Session for store item purchase
 */
export const createStoreCheckoutSession = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    console.log("CreateStoreCheckoutSession called with auth:", {
      hasAuth: !!auth,
      uid: auth?.uid,
    });

    if (!auth) {
      console.error("Authentication failed");
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {
      itemId,
      quantity,
      selectedVariants,
      deliveryMethod,
      shippingAddress,
    } = data;

    if (!itemId || !quantity || !deliveryMethod) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      const stripe = getStripe();
      const db = admin.firestore();

      // Get item details
      const itemDoc = await db.collection("storeItems").doc(itemId).get();

      if (!itemDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Store item not found"
        );
      }

      const item = itemDoc.data() as any;

      // Get club to check for Stripe Connect account
      const clubDoc = await db.collection("clubs").doc(item.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Club not found"
        );
      }

      const club = clubDoc.data() as any;
      const stripeAccountId = club.stripeAccountId;

      if (!stripeAccountId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Club has not set up payouts yet. Please contact the club organizer."
        );
      }

      // Check stock
      const availableStock = item.inventory - (item.sold || 0);
      if (availableStock < quantity) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not enough items in stock"
        );
      }

      // Calculate pricing
      const subtotal = item.price * quantity;
      const shipping = deliveryMethod === "shipping" ?
        (item.shippingCost || 0) : 0;
      const itemAndShipping = subtotal + shipping;
      const tax = itemAndShipping * (item.taxRate / 100);
      const totalAmount = itemAndShipping + tax;

      // Platform fee: 10% of item subtotal only (not shipping/tax)
      const PLATFORM_FEE_PERCENTAGE = 0.10;
      const platformFee = subtotal * PLATFORM_FEE_PERCENTAGE;

      // Club receives: 90% of subtotal + shipping + tax (they remit tax)
      const clubAmount = (subtotal - platformFee) + shipping + tax;

      // Build line items
      const lineItems: any[] = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: item.name,
              description: item.description,
              images: item.images && item.images.length > 0 ?
                [item.images[0]] : undefined,
            },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: quantity,
        },
      ];

      // Add shipping line item if applicable
      if (shipping > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: "Shipping",
            },
            unit_amount: Math.round(shipping * 100),
          },
          quantity: 1,
        });
      }

      // Add tax line item if applicable
      if (tax > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `Tax (${item.taxRate}%)`,
            },
            unit_amount: Math.round(tax * 100),
          },
          quantity: 1,
        });
      }

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `rallysphere://payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `rallysphere://payment-cancel`,
        customer_email: auth.token.email,
        metadata: {
          type: "store_purchase",
          userId: auth.uid,
          itemId: itemId,
          clubId: item.clubId,
          quantity: quantity.toString(),
          selectedVariants: JSON.stringify(selectedVariants || {}),
          deliveryMethod: deliveryMethod,
          shippingAddress: shippingAddress ?
            JSON.stringify(shippingAddress) : "",
          subtotal: subtotal.toString(),
          tax: tax.toString(),
          shipping: shipping.toString(),
          platformFee: platformFee.toFixed(2),
          clubAmount: clubAmount.toFixed(2),
          stripeAccountId: stripeAccountId,
          totalAmount: totalAmount.toString(),
        },
        payment_intent_data: {
          metadata: {
            type: "store_purchase",
            userId: auth.uid,
            itemId: itemId,
            clubId: item.clubId,
            quantity: quantity.toString(),
            selectedVariants: JSON.stringify(selectedVariants || {}),
            deliveryMethod: deliveryMethod,
            shippingAddress: shippingAddress ?
              JSON.stringify(shippingAddress) : "",
            subtotal: subtotal.toString(),
            tax: tax.toString(),
            shipping: shipping.toString(),
            platformFee: platformFee.toFixed(2),
            clubAmount: clubAmount.toFixed(2),
            stripeAccountId: stripeAccountId,
            totalAmount: totalAmount.toString(),
          },
        },
      });

      console.log("Store checkout session created:", session.id);

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    } catch (error: any) {
      console.error("Error creating store checkout session:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to create checkout session: ${error.message}`
      );
    }
  }
);

// ============================================================================
// PRO SUBSCRIPTION FUNCTIONS
// ============================================================================

/**
 * Create Pro subscription checkout session
 */
export const createProSubscription = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {clubId, userId, clubName} = data;

    if (!clubId || !userId || !clubName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      // Check if club exists
      const clubDoc = await admin.firestore().collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Club not found"
        );
      }

      const club = clubDoc.data();

      // Check if user is admin
      if (!club?.admins || !club.admins.includes(userId)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Only club admins can manage subscriptions"
        );
      }

      // Create or get Stripe customer
      const stripeInstance = getStripe();
      let customerId = club.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeInstance.customers.create({
          email: auth.token.email || undefined,
          metadata: {
            clubId,
            clubName,
            userId,
          },
        });
        customerId = customer.id;

        // Save customer ID to club
        await admin.firestore().collection("clubs").doc(clubId).update({
          stripeCustomerId: customerId,
        });
      }

      // Create checkout session for subscription
      const session = await stripeInstance.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "RallySphere Pro Membership",
                description: "Monthly Pro subscription with premium features",
              },
              unit_amount: 1000, // $10.00
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `rallysphere://subscription-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `rallysphere://subscription-cancel`,
        metadata: {
          type: "pro_subscription",
          clubId,
          clubName,
          userId,
        },
      });

      console.log("Pro subscription session created:", session.id);

      return {sessionUrl: session.url};
    } catch (error: any) {
      console.error("Error creating pro subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to create subscription: ${error.message}`
      );
    }
  }
);

/**
 * Cancel Pro subscription
 */
export const cancelProSubscription = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {clubId, subscriptionId} = data;

    if (!clubId || !subscriptionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      // Check if club exists and user is admin
      const clubDoc = await admin.firestore().collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Club not found"
        );
      }

      const club = clubDoc.data();
      if (!club?.admins || !club.admins.includes(auth.uid)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Only club admins can manage subscriptions"
        );
      }

      // Cancel subscription at period end
      const stripeInstance = getStripe();
      await stripeInstance.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Update Firestore
      await admin.firestore()
        .collection("proSubscriptions")
        .where("clubId", "==", clubId)
        .get()
        .then((snapshot) => {
          snapshot.forEach((doc) => {
            doc.ref.update({
              cancelAtPeriodEnd: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
        });

      console.log("Pro subscription canceled:", subscriptionId);

      return {success: true};
    } catch (error: any) {
      console.error("Error canceling pro subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to cancel subscription: ${error.message}`
      );
    }
  }
);

// ============================================================================
// USER PRO SUBSCRIPTION FUNCTIONS
// ============================================================================

/**
 * Create User Pro subscription checkout session
 */
export const createUserProSubscription = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {userId, userEmail} = data;

    if (!userId || !userEmail) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      // Get user document
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "User not found"
        );
      }

      const userData = userDoc.data();

      // Check if user already has Pro
      if (userData?.isPro && userData?.proSubscriptionStatus === "active") {
        throw new functions.https.HttpsError(
          "already-exists",
          "User already has active Pro subscription"
        );
      }

      // Create or get Stripe customer
      const stripeInstance = getStripe();
      let customerId = userData?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeInstance.customers.create({
          email: userEmail,
          metadata: {
            userId,
            type: "user_pro",
          },
        });
        customerId = customer.id;

        // Save customer ID to user
        await admin.firestore().collection("users").doc(userId).update({
          stripeCustomerId: customerId,
        });
      }

      // Create checkout session for subscription
      const session = await stripeInstance.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "RallySphere Pro Membership",
                description: "Monthly Pro membership with premium features",
              },
              unit_amount: 1000, // $10.00
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `rallysphere://subscription-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `rallysphere://subscription-cancel`,
        metadata: {
          type: "user_pro_subscription",
          userId,
          userEmail,
        },
      });

      console.log("User Pro subscription session created:", session.id);

      return {sessionUrl: session.url};
    } catch (error: any) {
      console.error("Error creating user pro subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to create subscription: ${error.message}`
      );
    }
  }
);

/**
 * Cancel User Pro subscription
 */
export const cancelUserProSubscription = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {userId, subscriptionId} = data;

    if (!userId || !subscriptionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      // Check if user exists and request is from the user
      if (auth.uid !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You can only cancel your own subscription"
        );
      }

      // Cancel subscription at period end
      const stripeInstance = getStripe();
      await stripeInstance.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Update Firestore
      await admin.firestore()
        .collection("userProSubscriptions")
        .where("userId", "==", userId)
        .get()
        .then((snapshot) => {
          snapshot.forEach((doc) => {
            doc.ref.update({
              cancelAtPeriodEnd: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
        });

      console.log("User Pro subscription canceled:", subscriptionId);

      return {success: true};
    } catch (error: any) {
      console.error("Error canceling user pro subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to cancel subscription: ${error.message}`
      );
    }
  }
);

// ============================================================================
// CLUB SUBSCRIPTION FUNCTIONS
// ============================================================================

/**
 * Create Club subscription checkout session
 * Users can subscribe to clubs with recurring monthly payments
 * Platform takes 10% fee, club receives 90%
 */
export const createClubSubscription = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {clubId, userId, userEmail, userName} = data;

    if (!clubId || !userId || !userEmail) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      // Get club document
      const clubDoc = await admin.firestore().collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Club not found"
        );
      }

      const club = clubDoc.data();

      // Check if club has subscription enabled
      if (!club?.subscriptionEnabled || !club?.subscriptionPrice) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Club does not have subscriptions enabled"
        );
      }

      // Check if user is already subscribed
      const existingSub = await admin.firestore()
        .collection("clubSubscriptions")
        .where("userId", "==", userId)
        .where("clubId", "==", clubId)
        .where("status", "==", "active")
        .get();

      if (!existingSub.empty) {
        throw new functions.https.HttpsError(
          "already-exists",
          "User already has active subscription to this club"
        );
      }

      // Get club's Stripe account for transfers
      const stripeAccountId = club.stripeAccountId;
      if (!stripeAccountId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Club has not set up payment receiving"
        );
      }

      // Calculate fees (10% platform fee)
      const subscriptionPrice = club.subscriptionPrice;
      const totalAmount = subscriptionPrice * 100; // Total in cents

      // Create or get Stripe customer
      const stripeInstance = getStripe();

      // Get user doc for existing customer ID
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      let customerId = userDoc.data()?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripeInstance.customers.create({
          email: userEmail,
          name: userName || userEmail,
          metadata: {
            userId,
            type: "club_subscriber",
          },
        });
        customerId = customer.id;

        // Save customer ID to user
        await admin.firestore().collection("users").doc(userId).update({
          stripeCustomerId: customerId,
        });
      }

      // Create checkout session for subscription
      const session = await stripeInstance.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${club.name} Club Subscription`,
                description: club.subscriptionDescription || `Monthly subscription to ${club.name}`,
              },
              unit_amount: totalAmount,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `rallysphere://club-subscription-success?session_id={CHECKOUT_SESSION_ID}&club_id=${clubId}`,
        cancel_url: `rallysphere://club-subscription-cancel`,
        subscription_data: {
          application_fee_percent: 10, // 10% platform fee
          transfer_data: {
            destination: stripeAccountId,
          },
          metadata: {
            type: "club_subscription",
            clubId,
            clubName: club.name,
            userId,
            userName: userName || "",
            userEmail,
            subscriptionPrice: subscriptionPrice.toString(),
            platformFee: (subscriptionPrice * 0.10).toFixed(2),
            clubAmount: (subscriptionPrice * 0.90).toFixed(2),
          },
        },
        metadata: {
          type: "club_subscription",
          clubId,
          clubName: club.name,
          userId,
          userName: userName || "",
          userEmail,
        },
      });

      console.log("Club subscription checkout created:", session.id);

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    } catch (error: any) {
      console.error("Error creating club subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to create subscription: ${error.message}`
      );
    }
  }
);

/**
 * Cancel Club subscription
 */
export const cancelClubSubscription = functions.https.onCall(
  {enforceAppCheck: false},
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {subscriptionId, userId} = data;

    if (!subscriptionId || !userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields"
      );
    }

    try {
      // Verify user owns this subscription
      if (auth.uid !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You can only cancel your own subscription"
        );
      }

      // Cancel subscription at period end
      const stripeInstance = getStripe();
      await stripeInstance.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Update Firestore subscription record
      const subQuery = await admin.firestore()
        .collection("clubSubscriptions")
        .where("stripeSubscriptionId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          cancelAtPeriodEnd: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log("Club subscription canceled:", subscriptionId);

      return {success: true};
    } catch (error: any) {
      console.error("Error canceling club subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to cancel subscription: ${error.message}`
      );
    }
  }
);

/**
 * Webhook handler for Stripe events (store purchases and subscriptions)
 * This needs to be added to the existing stripeWebhook function
 */
// Note: The actual webhook handler should be updated in the existing
// stripeWebhook function to handle store purchase completion
