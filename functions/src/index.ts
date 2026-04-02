import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import braintree from "braintree";

// Initialize Firebase Admin
admin.initializeApp();

const isTestMode = process.env.TEST_MODE !== "false"; // default to sandbox

// Initialize Braintree Gateway
let gatewayInstance: braintree.BraintreeGateway | null = null;

const getGateway = (): braintree.BraintreeGateway => {
  if (!gatewayInstance) {
    const merchantId = isTestMode
      ? (process.env.BRAINTREE_MERCHANT_ID || "")
      : (process.env.BRAINTREE_MERCHANT_ID_LIVE || "");
    const publicKey = isTestMode
      ? (process.env.BRAINTREE_PUBLIC_KEY || "")
      : (process.env.BRAINTREE_PUBLIC_KEY_LIVE || "");
    const privateKey = isTestMode
      ? (process.env.BRAINTREE_PRIVATE_KEY || "")
      : (process.env.BRAINTREE_PRIVATE_KEY_LIVE || "");

    if (!merchantId || !publicKey || !privateKey) {
      throw new Error("Braintree credentials not configured");
    }

    gatewayInstance = new braintree.BraintreeGateway({
      environment: isTestMode
        ? braintree.Environment.Sandbox
        : braintree.Environment.Production,
      merchantId,
      publicKey,
      privateKey,
    });
  }
  return gatewayInstance;
};

// ============================================================================
// HELPER: Award Rally Credits
// ============================================================================

async function awardRallyCredits(
  db: admin.firestore.Firestore,
  userId: string,
  clubId: string,
  eventId: string,
  eventData: any,
  transactionId: string
) {
  if (!eventData?.rallyCreditsAwarded || eventData.rallyCreditsAwarded <= 0) return;

  try {
    const creditsRef = db.collection("rallyCredits").doc(userId);
    const creditsDoc = await creditsRef.get();

    const creditTransaction = {
      id: `${transactionId}_${Date.now()}`,
      userId,
      clubId,
      clubName: eventData.clubName || "",
      type: "earned",
      amount: eventData.rallyCreditsAwarded,
      eventId,
      eventName: eventData.title || "",
      description: `Earned ${eventData.rallyCreditsAwarded} credits for purchasing ticket to ${eventData.title}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!creditsDoc.exists) {
      await creditsRef.set({
        userId,
        totalCredits: eventData.rallyCreditsAwarded,
        availableCredits: eventData.rallyCreditsAwarded,
        usedCredits: 0,
        clubCredits: { [clubId]: eventData.rallyCreditsAwarded },
        transactions: [creditTransaction],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const currentCredits = creditsDoc.data();
      const clubCredits = currentCredits?.clubCredits || {};
      await creditsRef.update({
        totalCredits: (currentCredits?.totalCredits || 0) + eventData.rallyCreditsAwarded,
        availableCredits: (currentCredits?.availableCredits || 0) + eventData.rallyCreditsAwarded,
        clubCredits: {
          ...clubCredits,
          [clubId]: (clubCredits[clubId] || 0) + eventData.rallyCreditsAwarded,
        },
        transactions: admin.firestore.FieldValue.arrayUnion(creditTransaction),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    console.log(`Awarded ${eventData.rallyCreditsAwarded} Rally Credits to user ${userId}`);
  } catch (err) {
    console.error("Error awarding rally credits:", err);
    // Non-fatal — don't fail the payment
  }
}

// ============================================================================
// GET BRAINTREE CLIENT TOKEN
// ============================================================================

export const getBraintreeClientToken = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      const gateway = getGateway();
      const response = await gateway.clientToken.generate({});
      return { clientToken: response.clientToken };
    } catch (error: any) {
      console.error("Error generating client token:", error);
      throw new functions.https.HttpsError("internal", `Failed to generate client token: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATE EVENT TICKET TRANSACTION
// Replaces createPaymentIntent + stripeWebhook (event branch)
// ============================================================================

export const createEventTransaction = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      paymentMethodNonce,
      eventId,
      ticketPrice,
      currency = "usd",
      discountApplied,
      originalPrice,
      discountAmount,
    } = data;

    if (!paymentMethodNonce || !eventId || ticketPrice == null) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: paymentMethodNonce, eventId, ticketPrice"
      );
    }

    if (ticketPrice < 0) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket price cannot be negative");
    }

    try {
      const db = admin.firestore();
      const userId = auth.uid;

      // Get event
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Event not found");
      }
      const eventData = eventDoc.data();

      // Check already attending
      if (eventData?.attendees?.includes(userId)) {
        throw new functions.https.HttpsError("already-exists", "User is already attending this event");
      }

      // Get club
      const clubDoc = await db.collection("clubs").doc(eventData!.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }
      const club = clubDoc.data();

      // Calculate fees: user pays ticket + 10% + $0.29 service fee
      const SERVICE_FEE_PERCENTAGE = 0.10;
      const SERVICE_FEE_FIXED = 0.29;
      const processingFee = Math.round(((ticketPrice * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
      const totalAmount = ticketPrice + processingFee;
      const clubAmount = ticketPrice;

      // Build Braintree transaction
      const gateway = getGateway();
      const txParams: braintree.TransactionRequest = {
        amount: totalAmount.toFixed(2),
        paymentMethodNonce,
        orderId: `${eventId}_${userId}_${Date.now()}`,
        options: { submitForSettlement: true },
        customFields: {},
      };

      // If club has a Braintree sub-merchant account, route to them
      if (club?.braintreeMerchantAccountId) {
        txParams.merchantAccountId = club.braintreeMerchantAccountId;
        txParams.serviceFeeAmount = processingFee.toFixed(2);
      }

      const result = await gateway.transaction.sale(txParams);

      if (!result.success) {
        const errorMsg = result.message || "Payment declined";
        console.error("Braintree transaction failed:", errorMsg);
        throw new functions.https.HttpsError("internal", errorMsg);
      }

      const transaction = result.transaction;
      const transactionId = transaction.id;
      console.log(`Braintree transaction created: ${transactionId}`);

      // Get user details for ticket order
      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;

      // Add user to event attendees (or waitlist if full)
      if (eventData?.maxAttendees && (eventData.attendees?.length || 0) >= eventData.maxAttendees) {
        await db.collection("events").doc(eventId).update({
          waitlist: admin.firestore.FieldValue.arrayUnion(userId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await db.collection("events").doc(eventId).update({
          attendees: admin.firestore.FieldValue.arrayUnion(userId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Create payment record
      await db.collection("payments").add({
        userId,
        eventId,
        clubId: eventData!.clubId,
        transactionId,
        amount: totalAmount,
        ticketPrice,
        originalPrice: originalPrice || ticketPrice,
        discountAmount: discountAmount || 0,
        platformFee: 0,
        clubAmount,
        currency,
        status: "succeeded",
        provider: "braintree",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create ticket order
      await db.collection("ticketOrders").add({
        eventId,
        clubId: eventData!.clubId,
        clubName: eventData?.clubName || "",
        userId,
        userName: user?.displayName || user?.email || "Unknown",
        userEmail: user?.email || "",
        eventName: eventData?.title || "",
        eventImage: eventData?.imageUrl || null,
        eventDate: eventData?.startDate || null,
        quantity: 1,
        ticketPrice,
        processingFee,
        platformFee: 0,
        totalAmount,
        clubAmount,
        currency,
        status: "confirmed",
        transactionId,
        provider: "braintree",
        ...(discountApplied && {
          discountRedemptionId: discountApplied.redemptionId,
          discountRedemptionName: discountApplied.redemptionName,
          creditsUsed: discountApplied.creditsUsed,
        }),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Award rally credits
      await awardRallyCredits(db, userId, eventData!.clubId, eventId, eventData, transactionId);

      return {
        success: true,
        transactionId,
        breakdown: {
          ticketPrice,
          processingFee,
          platformFee: 0,
          totalAmount,
          clubReceives: clubAmount,
        },
      };
    } catch (error: any) {
      console.error("Error creating event transaction:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Payment failed: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATE STORE TRANSACTION
// Replaces createStorePaymentIntent + stripeWebhook (store branch)
// ============================================================================

export const createStoreTransaction = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      paymentMethodNonce,
      itemId,
      quantity,
      selectedVariants,
      deliveryMethod,
      shippingAddress,
      rewardDiscount,
    } = data;

    if (!paymentMethodNonce || !itemId || !quantity || !deliveryMethod) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: paymentMethodNonce, itemId, quantity, deliveryMethod"
      );
    }

    if (quantity <= 0) {
      throw new functions.https.HttpsError("invalid-argument", "Quantity must be greater than 0");
    }

    try {
      const db = admin.firestore();
      const userId = auth.uid;

      // Get item
      const itemDoc = await db.collection("storeItems").doc(itemId).get();
      if (!itemDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Store item not found");
      }
      const item = itemDoc.data() as any;

      // Get club
      const clubDoc = await db.collection("clubs").doc(item.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }
      const club = clubDoc.data() as any;

      // Check stock
      const availableStock = item.inventory - (item.sold || 0);
      if (availableStock < quantity) {
        throw new functions.https.HttpsError("failed-precondition", "Not enough items in stock");
      }

      // Calculate pricing
      const itemPrice = item.price * quantity;
      const shipping = deliveryMethod === "shipping" ? (item.shippingCost || 0) : 0;
      const discountAmount = rewardDiscount?.discountAmount || 0;
      const subtotal = Math.max(0, itemPrice - discountAmount);
      const itemAndShipping = subtotal + shipping;

      // No Braintree tax API — tax = 0 (add TaxJar/Avalara integration later if needed)
      const taxAmount = 0;

      const SERVICE_FEE_PERCENTAGE = 0.10;
      const SERVICE_FEE_FIXED = 0.29;
      const originalItemAndShipping = itemPrice + shipping;
      const processingFee = Math.round(((originalItemAndShipping * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
      const clubAmount = itemAndShipping + taxAmount;
      const totalAmount = itemAndShipping + taxAmount + processingFee;

      // Create Braintree transaction
      const gateway = getGateway();
      const txParams: braintree.TransactionRequest = {
        amount: totalAmount.toFixed(2),
        paymentMethodNonce,
        orderId: `store_${itemId}_${userId}_${Date.now()}`,
        options: { submitForSettlement: true },
      };

      if (club?.braintreeMerchantAccountId) {
        txParams.merchantAccountId = club.braintreeMerchantAccountId;
        txParams.serviceFeeAmount = processingFee.toFixed(2);
      }

      const result = await gateway.transaction.sale(txParams);

      if (!result.success) {
        const errorMsg = result.message || "Payment declined";
        console.error("Braintree store transaction failed:", errorMsg);
        throw new functions.https.HttpsError("internal", errorMsg);
      }

      const transaction = result.transaction;
      const transactionId = transaction.id;
      console.log(`Braintree store transaction created: ${transactionId}`);

      // Get user details
      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;

      // Parse address for order storage
      const parsedAddress = shippingAddress || null;

      // Create store order
      await db.collection("storeOrders").add({
        itemId,
        clubId: item.clubId,
        clubName: item?.clubName || "",
        userId,
        userName: user?.displayName || user?.email || "Unknown",
        userEmail: user?.email || "",
        itemName: item?.name || "",
        itemImage: item?.images?.[0] || null,
        quantity: parseInt(quantity),
        selectedVariants: selectedVariants || {},
        price: subtotal,
        tax: taxAmount,
        platformFee: 0,
        clubAmount,
        shipping,
        totalAmount,
        deliveryMethod,
        shippingAddress: parsedAddress,
        status: "pending",
        transactionId,
        provider: "braintree",
        originalItemPrice: itemPrice,
        discountAmount,
        ...(rewardDiscount && {
          rewardRedemptionId: rewardDiscount.redemptionId,
          rewardRedemptionName: rewardDiscount.redemptionName,
          creditsUsed: rewardDiscount.creditsRequired,
        }),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update item sold count
      await db.collection("storeItems").doc(itemId).update({
        sold: admin.firestore.FieldValue.increment(parseInt(quantity)),
      });

      console.log(`Store order created for user ${userId}, item ${itemId}`);

      return {
        success: true,
        transactionId,
        breakdown: {
          subtotal,
          shipping,
          tax: taxAmount,
          processingFee,
          platformFee: 0,
          clubReceives: clubAmount,
          totalAmount,
        },
      };
    } catch (error: any) {
      console.error("Error creating store transaction:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Payment failed: ${error.message}`);
    }
  }
);

// Returns the master merchant account ID for Braintree Marketplace sub-merchant creation.
// Set BRAINTREE_MASTER_MERCHANT_ACCOUNT_ID in .env (found in Braintree dashboard → Processing → Merchant Accounts).
// Requires Marketplace to be enabled on your Braintree account by contacting Braintree support.
async function getMasterMerchantAccountId(gateway: braintree.BraintreeGateway): Promise<string> {
  if (process.env.BRAINTREE_MASTER_MERCHANT_ACCOUNT_ID) {
    return process.env.BRAINTREE_MASTER_MERCHANT_ACCOUNT_ID;
  }
  // Auto-detect fallback: fetch first merchant account from Braintree
  const gw = gateway as any;
  const response = await gw.http.get(`${gw.config.baseMerchantPath()}/merchant_accounts`);
  const accounts = response?.merchantAccounts?.merchantAccount;
  if (Array.isArray(accounts) && accounts.length > 0) return accounts[0].id;
  if (accounts?.id) return accounts.id;
  return process.env.BRAINTREE_MERCHANT_ID || "";
}

// ============================================================================
// CREATE SUB-MERCHANT ACCOUNT (Club Payouts)
// Replaces createStripeConnectAccount
// ============================================================================

export const createSubMerchantAccount = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, email, clubName, individual, funding } = data;

    if (!clubId || !email || !clubName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: clubId, email, clubName"
      );
    }

    try {
      const db = admin.firestore();
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }

      const club = clubDoc.data();
      const gateway = getGateway();

      // If already has a Braintree merchant account, just return it
      if (club?.braintreeMerchantAccountId) {
        const accountResult = await gateway.merchantAccount.find(club.braintreeMerchantAccountId);
        return {
          merchantAccountId: club.braintreeMerchantAccountId,
          status: accountResult.status,
        };
      }

      // Build sub-merchant account ID from club ID (sanitize for Braintree)
      const merchantAccountId = `club_${clubId.replace(/[^a-zA-Z0-9_]/g, "_")}`;

      const subMerchantParams: braintree.MerchantAccountCreateRequest = {
        individual: {
          firstName: individual?.firstName || "Club",
          lastName: individual?.lastName || "Owner",
          email: email,
          phone: individual?.phone || "",
          dateOfBirth: individual?.dateOfBirth || "1980-01-01",
          ssn: individual?.ssn || "",
          address: {
            streetAddress: individual?.address?.streetAddress || "123 Main St",
            locality: individual?.address?.locality || "New York",
            region: individual?.address?.region || "NY",
            postalCode: individual?.address?.postalCode || "10001",
          },
        },
        funding: {
          descriptor: clubName.substring(0, 18),
          destination: braintree.MerchantAccount.FundingDestination.Bank,
          accountNumber: funding?.accountNumber || "",
          routingNumber: funding?.routingNumber || "",
        },
        tosAccepted: true,
        masterMerchantAccountId: await getMasterMerchantAccountId(gateway),
        id: merchantAccountId,
      };

      // gateway.merchantAccount.create() was removed in SDK v3 — call the REST endpoint directly
      const gw = gateway as any;
      const response = await gw.http.post(
        `${gw.config.baseMerchantPath()}/merchant_accounts/create_via_api`,
        { merchantAccount: subMerchantParams }
      );

      console.log("Braintree sub-merchant response:", JSON.stringify(response));
      const account = response.merchantAccount;
      if (!account) {
        throw new Error(`No merchant account in response. Full response: ${JSON.stringify(response)}`);
      }

      // Update club in Firestore
      await db.collection("clubs").doc(clubId).update({
        braintreeMerchantAccountId: account.id,
        braintreeAccountStatus: account.status,
        braintreeOnboardingComplete: account.status === "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Sub-merchant account created for club ${clubId}: ${account.id}`);

      return {
        merchantAccountId: account.id,
        status: account.status,
      };
    } catch (error: any) {
      console.error("Error creating sub-merchant account:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to create merchant account: ${error.message}`);
    }
  }
);

// ============================================================================
// GET SUB-MERCHANT STATUS
// Replaces checkStripeAccountStatus
// ============================================================================

export const getSubMerchantStatus = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { merchantAccountId } = data;
    if (!merchantAccountId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing merchantAccountId");
    }

    try {
      const gateway = getGateway();
      const account = await gateway.merchantAccount.find(merchantAccountId);

      const isComplete = account.status === "active";

      return {
        status: account.status,
        isComplete,
        currencyIsoCode: account.currencyIsoCode,
      };
    } catch (error: any) {
      console.error("Error checking sub-merchant status:", error);
      throw new functions.https.HttpsError("internal", `Failed to check account status: ${error.message}`);
    }
  }
);

// ============================================================================
// BRAINTREE WEBHOOK
// Handles sub-merchant account updates and other notifications
// ============================================================================

export const braintreeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const gateway = getGateway();
    const notification = await gateway.webhookNotification.parse(
      req.body.bt_signature,
      req.body.bt_payload
    );

    console.log("Braintree webhook received:", notification.kind);

    switch (notification.kind) {
      case braintree.WebhookNotification.Kind.SubMerchantAccountApproved: {
        const merchantAccount = (notification.subject as any).merchantAccount;
        console.log("Sub-merchant approved:", merchantAccount.id);

        // Find club by merchant account ID and update status
        const db = admin.firestore();
        const clubsQuery = await db.collection("clubs")
          .where("braintreeMerchantAccountId", "==", merchantAccount.id)
          .limit(1)
          .get();

        clubsQuery.forEach(async (doc) => {
          await doc.ref.update({
            braintreeAccountStatus: "active",
            braintreeOnboardingComplete: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        break;
      }

      case braintree.WebhookNotification.Kind.SubMerchantAccountDeclined: {
        const merchantAccount = (notification.subject as any).merchantAccount;
        console.log("Sub-merchant declined:", merchantAccount.id);

        const db = admin.firestore();
        const clubsQuery = await db.collection("clubs")
          .where("braintreeMerchantAccountId", "==", merchantAccount.id)
          .limit(1)
          .get();

        clubsQuery.forEach(async (doc) => {
          await doc.ref.update({
            braintreeAccountStatus: "declined",
            braintreeOnboardingComplete: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        break;
      }

      default:
        console.log(`Unhandled webhook kind: ${notification.kind}`);
    }

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("Braintree webhook error:", error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// ============================================================================
// GET USER PAYMENTS
// ============================================================================

export const getUserPayments = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      const db = admin.firestore();
      const userId = request.auth.uid;

      const paymentsQuery = await db.collection("payments")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const payments = paymentsQuery.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { payments };
    } catch (error: any) {
      console.error("Error getting user payments:", error);
      throw new functions.https.HttpsError("internal", `Failed to get payments: ${error.message}`);
    }
  }
);

// ============================================================================
// LEAVE EVENT WITH REFUND
// ============================================================================

export const leaveEventWithRefund = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { eventId } = data;
    if (!eventId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required field: eventId");
    }

    try {
      const db = admin.firestore();
      const userId = auth.uid;

      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Event not found");
      }
      const eventData = eventDoc.data();

      if (!eventData?.attendees?.includes(userId)) {
        throw new functions.https.HttpsError("failed-precondition", "You are not attending this event");
      }

      // Find the user's ticket order
      const ticketOrdersQuery = await db.collection("ticketOrders")
        .where("eventId", "==", eventId)
        .where("userId", "==", userId)
        .where("status", "==", "confirmed")
        .limit(1)
        .get();

      let refundProcessed = false;
      let refundAmount = 0;

      if (!ticketOrdersQuery.empty) {
        const ticketOrder = ticketOrdersQuery.docs[0];
        const orderData = ticketOrder.data();
        const transactionId = orderData.transactionId;

        if (transactionId) {
          try {
            const gateway = getGateway();
            const refundResult = await gateway.transaction.refund(transactionId);

            if (refundResult.success) {
              console.log(`Refund created for leaving event ${eventId}: ${refundResult.transaction.id}`);
              refundAmount = parseFloat(refundResult.transaction.amount);
              refundProcessed = true;

              await ticketOrder.ref.update({
                status: "refunded",
                refundTransactionId: refundResult.transaction.id,
                refundAmount,
                refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                refundReason: "User left event",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              throw new Error(refundResult.message || "Refund failed");
            }
          } catch (refundError: any) {
            console.error("Error processing refund:", refundError);
            throw new functions.https.HttpsError("internal", `Failed to process refund: ${refundError.message}`);
          }
        }
      }

      // Remove user from event
      await db.collection("events").doc(eventId).update({
        attendees: admin.firestore.FieldValue.arrayRemove(userId),
        waitlist: admin.firestore.FieldValue.arrayRemove(userId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Forfeit rally credits
      if (eventData?.rallyCreditsAwarded && eventData.rallyCreditsAwarded > 0) {
        try {
          const creditsRef = db.collection("rallyCredits").doc(userId);
          const creditsDoc = await creditsRef.get();

          if (creditsDoc.exists) {
            const currentCredits = creditsDoc.data();
            const clubCredits = currentCredits?.clubCredits || {};
            const clubId = eventData.clubId || "";
            const amountToForfeit = Math.min(
              eventData.rallyCreditsAwarded,
              clubCredits[clubId] || 0,
              currentCredits?.availableCredits || 0
            );

            if (amountToForfeit > 0) {
              const creditTransaction = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                userId,
                clubId,
                clubName: eventData.clubName || "",
                type: "forfeited",
                amount: -amountToForfeit,
                eventId,
                eventName: eventData.title || "",
                description: `Forfeited ${amountToForfeit} credits for leaving ${eventData.title}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              };

              await creditsRef.update({
                availableCredits: (currentCredits?.availableCredits || 0) - amountToForfeit,
                clubCredits: {
                  ...clubCredits,
                  [clubId]: (clubCredits[clubId] || 0) - amountToForfeit,
                },
                transactions: admin.firestore.FieldValue.arrayUnion(creditTransaction),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }
        } catch (creditsError) {
          console.error("Error forfeiting rally credits:", creditsError);
        }
      }

      return {
        success: true,
        refundProcessed,
        refundAmount,
        creditsForfeited: eventData?.rallyCreditsAwarded || 0,
      };
    } catch (error: any) {
      console.error("Error leaving event with refund:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to leave event: ${error.message}`);
    }
  }
);

// ============================================================================
// REFUND TICKET ORDER (Admin)
// ============================================================================

export const refundTicketOrder = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { orderId, clubId } = data;
    if (!orderId || !clubId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: orderId, clubId");
    }

    try {
      const db = admin.firestore();

      // Verify user is club admin
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found. Please try again.");
      }
      const club = clubDoc.data();
      const ownerId = club?.owner || club?.clubOwner || club?.createdBy;
      const isOwner = ownerId === auth.uid;
      const isAdmin = club?.admins?.includes(auth.uid);

      if (!isOwner && !isAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Only club owners or admins can process refunds");
      }

      const orderDoc = await db.collection("ticketOrders").doc(orderId).get();
      if (!orderDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Order not found. It may have been deleted.");
      }
      const order = orderDoc.data();

      if (order?.status === "refunded") {
        throw new functions.https.HttpsError("failed-precondition", "Order has already been refunded");
      }

      const transactionId = order?.transactionId;
      if (!transactionId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This order cannot be refunded because it has no transaction ID. Please refund manually through the Braintree dashboard."
        );
      }

      const gateway = getGateway();
      const refundResult = await gateway.transaction.refund(transactionId);

      if (!refundResult.success) {
        throw new Error(refundResult.message || "Refund failed");
      }

      const refundAmount = parseFloat(refundResult.transaction.amount);
      console.log(`Refund created for ticket order ${orderId}: ${refundResult.transaction.id}`);

      await db.collection("ticketOrders").doc(orderId).update({
        status: "refunded",
        refundTransactionId: refundResult.transaction.id,
        refundAmount,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Remove user from event attendees
      if (order?.eventId && order?.userId) {
        await db.collection("events").doc(order.eventId).update({
          attendees: admin.firestore.FieldValue.arrayRemove(order.userId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        refundId: refundResult.transaction.id,
        refundAmount,
      };
    } catch (error: any) {
      console.error("Error processing ticket refund:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to process refund: ${error.message}`);
    }
  }
);

// ============================================================================
// REFUND STORE ORDER (Admin)
// ============================================================================

export const refundStoreOrder = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { orderId, clubId } = data;
    if (!orderId || !clubId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: orderId, clubId");
    }

    try {
      const db = admin.firestore();

      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found. Please try again.");
      }
      const club = clubDoc.data();
      const ownerId = club?.owner || club?.clubOwner || club?.createdBy;
      const isOwner = ownerId === auth.uid;
      const isAdmin = club?.admins?.includes(auth.uid);

      if (!isOwner && !isAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Only club owners or admins can process refunds");
      }

      const orderDoc = await db.collection("storeOrders").doc(orderId).get();
      if (!orderDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Order not found. It may have been deleted.");
      }
      const order = orderDoc.data();

      if (order?.status === "refunded") {
        throw new functions.https.HttpsError("failed-precondition", "Order has already been refunded");
      }

      const transactionId = order?.transactionId;
      if (!transactionId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This order cannot be refunded because it has no transaction ID. Please refund manually through the Braintree dashboard."
        );
      }

      const gateway = getGateway();
      const refundResult = await gateway.transaction.refund(transactionId);

      if (!refundResult.success) {
        throw new Error(refundResult.message || "Refund failed");
      }

      const refundAmount = parseFloat(refundResult.transaction.amount);
      console.log(`Refund created for store order ${orderId}: ${refundResult.transaction.id}`);

      await db.collection("storeOrders").doc(orderId).update({
        status: "refunded",
        refundTransactionId: refundResult.transaction.id,
        refundAmount,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Restore inventory
      if (order?.itemId && order?.quantity) {
        await db.collection("storeItems").doc(order.itemId).update({
          sold: admin.firestore.FieldValue.increment(-order.quantity),
        });
      }

      return {
        success: true,
        refundId: refundResult.transaction.id,
        refundAmount,
      };
    } catch (error: any) {
      console.error("Error processing store refund:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to process refund: ${error.message}`);
    }
  }
);

// ============================================================================
// SUBSCRIPTION FUNCTIONS
// Note: Braintree subscriptions require Plans to be created in the Braintree
// Control Panel first. Plan IDs must match what's configured in the dashboard.
// ============================================================================

export const createProSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, userId, clubName, paymentMethodNonce } = data;
    if (!clubId || !userId || !paymentMethodNonce) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
    }

    try {
      const db = admin.firestore();
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }

      const gateway = getGateway();

      // Create subscription — Plan ID "pro_monthly" must be configured in Braintree dashboard
      const result = await gateway.subscription.create({
        paymentMethodNonce,
        planId: "pro_monthly",
      });

      if (!result.success) {
        throw new Error(result.message || "Subscription creation failed");
      }

      const subscription = result.subscription;
      console.log("Pro subscription created:", subscription.id);

      await db.collection("clubSubscriptions").add({
        clubId,
        clubName: clubName || "",
        userId,
        braintreeSubscriptionId: subscription.id,
        status: subscription.status,
        planId: subscription.planId,
        nextBillingDate: subscription.nextBillingDate,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, subscriptionId: subscription.id };
    } catch (error: any) {
      console.error("Error creating pro subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to create subscription: ${error.message}`);
    }
  }
);

export const cancelProSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionId } = data;
    if (!subscriptionId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing subscriptionId");
    }

    try {
      const gateway = getGateway();
      const result = await gateway.subscription.cancel(subscriptionId);

      if (!result.success) {
        throw new Error(result.message || "Cancellation failed");
      }

      const db = admin.firestore();
      const subQuery = await db.collection("clubSubscriptions")
        .where("braintreeSubscriptionId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          status: "Canceled",
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to cancel subscription: ${error.message}`);
    }
  }
);

export const createUserProSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { userId, paymentMethodNonce } = data;
    if (!userId || !paymentMethodNonce) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
    }

    try {
      const gateway = getGateway();
      // Plan ID "user_pro_monthly" must be configured in Braintree dashboard
      const result = await gateway.subscription.create({
        paymentMethodNonce,
        planId: "user_pro_monthly",
      });

      if (!result.success) {
        throw new Error(result.message || "Subscription creation failed");
      }

      const db = admin.firestore();
      await db.collection("userSubscriptions").add({
        userId,
        braintreeSubscriptionId: result.subscription.id,
        status: result.subscription.status,
        planId: result.subscription.planId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, subscriptionId: result.subscription.id };
    } catch (error: any) {
      console.error("Error creating user pro subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to create subscription: ${error.message}`);
    }
  }
);

export const cancelUserProSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionId, userId } = data;
    if (!subscriptionId || !userId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
    }

    if (auth.uid !== userId) {
      throw new functions.https.HttpsError("permission-denied", "You can only cancel your own subscription");
    }

    try {
      const gateway = getGateway();
      const result = await gateway.subscription.cancel(subscriptionId);

      if (!result.success) {
        throw new Error(result.message || "Cancellation failed");
      }

      const db = admin.firestore();
      const subQuery = await db.collection("userSubscriptions")
        .where("braintreeSubscriptionId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          status: "Canceled",
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error canceling user subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to cancel subscription: ${error.message}`);
    }
  }
);

export const createClubSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, userId, paymentMethodNonce } = data;
    if (!clubId || !userId || !paymentMethodNonce) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
    }

    try {
      const gateway = getGateway();
      // Plan ID "club_monthly" must be configured in Braintree dashboard
      const result = await gateway.subscription.create({
        paymentMethodNonce,
        planId: "club_monthly",
      });

      if (!result.success) {
        throw new Error(result.message || "Subscription creation failed");
      }

      const db = admin.firestore();
      await db.collection("clubSubscriptions").add({
        clubId,
        userId,
        braintreeSubscriptionId: result.subscription.id,
        status: result.subscription.status,
        planId: result.subscription.planId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("clubs").doc(clubId).update({
        subscriptionStatus: "active",
        braintreeSubscriptionId: result.subscription.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, subscriptionId: result.subscription.id };
    } catch (error: any) {
      console.error("Error creating club subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to create subscription: ${error.message}`);
    }
  }
);

export const cancelClubSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionId, userId } = data;
    if (!subscriptionId || !userId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
    }

    if (auth.uid !== userId) {
      throw new functions.https.HttpsError("permission-denied", "You can only cancel your own subscription");
    }

    try {
      const gateway = getGateway();
      const result = await gateway.subscription.cancel(subscriptionId);

      if (!result.success) {
        throw new Error(result.message || "Cancellation failed");
      }

      const db = admin.firestore();
      const subQuery = await db.collection("clubSubscriptions")
        .where("braintreeSubscriptionId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          status: "Canceled",
          cancelAtPeriodEnd: true,
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error canceling club subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to cancel subscription: ${error.message}`);
    }
  }
);

// ============================================================================
// FIX EVENTS AND CREDITS (Admin utility — no payment dependency)
// ============================================================================

export const fixEventsAndCredits = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const db = admin.firestore();

    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    console.log("Starting fixEventsAndCredits...");

    const results = {
      eventsChecked: 0,
      eventsFixed: 0,
      eventErrors: [] as string[],
      creditsReset: 0,
      creditsAwarded: 0,
      creditErrors: [] as string[],
    };

    try {
      const clubsSnapshot = await db.collection("clubs").get();
      const clubsByName = new Map<string, any>();
      const clubsById = new Map<string, any>();

      clubsSnapshot.docs.forEach((doc) => {
        const clubData = doc.data();
        const club = { id: doc.id, name: clubData.clubName || clubData.name, ...clubData };
        clubsById.set(doc.id, club);
        if (club.name) {
          clubsByName.set(club.name.toLowerCase(), club);
        }
      });

      const eventsSnapshot = await db.collection("events").get();

      for (const eventDoc of eventsSnapshot.docs) {
        results.eventsChecked++;
        const event = eventDoc.data();
        const eventId = eventDoc.id;

        try {
          const currentClub = clubsById.get(event.clubId);
          if (!currentClub) {
            const correctClub = clubsByName.get(event.clubName?.toLowerCase());
            if (correctClub) {
              await db.collection("events").doc(eventId).update({
                clubId: correctClub.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              results.eventsFixed++;
            } else {
              results.eventErrors.push(`Event ${eventId}: Club not found - ${event.clubName}`);
            }
          } else if (currentClub.name !== event.clubName) {
            const correctClub = clubsByName.get(event.clubName?.toLowerCase());
            if (correctClub && correctClub.id !== event.clubId) {
              await db.collection("events").doc(eventId).update({
                clubId: correctClub.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              results.eventsFixed++;
            }
          }
        } catch (err: any) {
          results.eventErrors.push(`Event ${eventId}: ${err.message}`);
        }
      }

      const creditsSnapshot = await db.collection("rallyCredits").get();
      for (const creditDoc of creditsSnapshot.docs) {
        try {
          await db.collection("rallyCredits").doc(creditDoc.id).delete();
          results.creditsReset++;
        } catch (err: any) {
          results.creditErrors.push(`Reset ${creditDoc.id}: ${err.message}`);
        }
      }

      const updatedEventsSnapshot = await db.collection("events").get();
      for (const eventDoc of updatedEventsSnapshot.docs) {
        const event = eventDoc.data();
        const eventId = eventDoc.id;

        if (!event.rallyCreditsAwarded || event.rallyCreditsAwarded <= 0) continue;

        for (const userId of (event.attendees || [])) {
          try {
            const creditsRef = db.collection("rallyCredits").doc(userId);
            const creditsDoc = await creditsRef.get();

            const creditTransaction = {
              id: `fix_${eventId}_${Date.now()}`,
              userId,
              clubId: event.clubId,
              clubName: event.clubName,
              type: "earned",
              amount: event.rallyCreditsAwarded,
              eventId,
              eventName: event.title,
              description: `Earned ${event.rallyCreditsAwarded} credits for attending ${event.title}`,
              createdAt: new Date(),
            };

            if (!creditsDoc.exists) {
              await creditsRef.set({
                userId,
                totalCredits: event.rallyCreditsAwarded,
                availableCredits: event.rallyCreditsAwarded,
                usedCredits: 0,
                clubCredits: { [event.clubId]: event.rallyCreditsAwarded },
                transactions: [creditTransaction],
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              const currentCredits = creditsDoc.data();
              const clubCredits = currentCredits?.clubCredits || {};
              const existingTransactions = currentCredits?.transactions || [];
              await creditsRef.update({
                totalCredits: (currentCredits?.totalCredits || 0) + event.rallyCreditsAwarded,
                availableCredits: (currentCredits?.availableCredits || 0) + event.rallyCreditsAwarded,
                clubCredits: {
                  ...clubCredits,
                  [event.clubId]: (clubCredits[event.clubId] || 0) + event.rallyCreditsAwarded,
                },
                transactions: [creditTransaction, ...existingTransactions].slice(0, 100),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
            results.creditsAwarded++;
          } catch (err: any) {
            results.creditErrors.push(`Award ${userId}/${eventId}: ${err.message}`);
          }
        }
      }

      return { success: true, results };
    } catch (error: any) {
      console.error("Error in fixEventsAndCredits:", error);
      throw new functions.https.HttpsError("internal", `Failed to fix data: ${error.message}`);
    }
  }
);
