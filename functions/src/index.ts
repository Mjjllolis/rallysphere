import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

admin.initializeApp();

const isTestMode = process.env.TEST_MODE !== "false";

// ============================================================================
// FINIX HTTP CLIENT
// Sandbox:  https://finix.sandbox-payments-api.com
// Live:     https://finix.live-payments-api.com
// Auth:     HTTP Basic (username:password)
// All monetary amounts are integer cents.
// ============================================================================

const FINIX_SANDBOX_URL = "https://finix.sandbox-payments-api.com";
const FINIX_LIVE_URL = "https://finix.live-payments-api.com";

interface FinixConfig {
  baseUrl: string;
  username: string;
  password: string;
  applicationId: string;
  platformMerchantId: string;
  webhookSecret: string;
  environment: "sandbox" | "live";
}

let clientInstance: AxiosInstance | null = null;
let configInstance: FinixConfig | null = null;

const getFinixConfig = (): FinixConfig => {
  if (configInstance) return configInstance;

  // TEST_MODE must be exactly "true" or "false" to avoid silent misconfiguration
  // (a typo like TEST_MODE="False" would currently fall through to live mode).
  const rawTestMode = process.env.TEST_MODE;
  if (rawTestMode !== "true" && rawTestMode !== "false") {
    throw new Error(
      `TEST_MODE must be exactly "true" or "false" (got: "${rawTestMode}"). Set in functions/.env.`
    );
  }

  const environment: "sandbox" | "live" = isTestMode ? "sandbox" : "live";
  const suffix = isTestMode ? "" : "_LIVE";

  const username = process.env[`FINIX_USERNAME${suffix}`] || "";
  const password = process.env[`FINIX_PASSWORD${suffix}`] || "";
  const applicationId = process.env[`FINIX_APPLICATION_ID${suffix}`] || "";
  const platformMerchantId = process.env[`FINIX_PLATFORM_MERCHANT_ID${suffix}`] || "";
  const webhookSecret = process.env.FINIX_WEBHOOK_SECRET || "";

  // Fail loud when running in live mode without the *_LIVE creds populated.
  // The default empty-string fallbacks above would otherwise produce confusing
  // 401s from Finix instead of a clear startup error.
  if (!username || !password || !applicationId || !platformMerchantId) {
    const missing = [
      !username && `FINIX_USERNAME${suffix}`,
      !password && `FINIX_PASSWORD${suffix}`,
      !applicationId && `FINIX_APPLICATION_ID${suffix}`,
      !platformMerchantId && `FINIX_PLATFORM_MERCHANT_ID${suffix}`,
    ].filter(Boolean).join(", ");
    throw new Error(
      `Finix ${environment} credentials missing: ${missing}. Set in functions/.env then redeploy.`
    );
  }
  if (!webhookSecret) {
    console.warn(
      `[FinixConfig] FINIX_WEBHOOK_SECRET is empty. Webhook signature verification will be skipped — set this before going live.`
    );
  }

  configInstance = {
    baseUrl: isTestMode ? FINIX_SANDBOX_URL : FINIX_LIVE_URL,
    username,
    password,
    applicationId,
    platformMerchantId,
    webhookSecret,
    environment,
  };
  return configInstance;
};

const getFinixClient = (): AxiosInstance => {
  if (clientInstance) return clientInstance;
  const cfg = getFinixConfig();
  clientInstance = axios.create({
    baseURL: cfg.baseUrl,
    auth: { username: cfg.username, password: cfg.password },
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/hal+json",
      "Finix-Version": "2022-02-01",
    },
    timeout: 30000,
    validateStatus: (s) => s < 500,
  });
  return clientInstance;
};

// Make a POST with an idempotency key. Finix requires this on every mutating request.
async function finixPost<T = any>(path: string, body: any, idempotencyKey?: string): Promise<T> {
  const client = getFinixClient();
  const key = idempotencyKey || uuidv4();
  const res = await client.post(path, body, { headers: { "Idempotency-Key": key } });
  if (res.status >= 400) {
    const errs = res.data?._embedded?.errors || (res.data?.message ? [{ message: res.data.message }] : []);
    const details = errs
      .map((e: any) => `${e.field ? `[${e.field}] ` : ''}${e.message || JSON.stringify(e)}${e.code ? ` (${e.code})` : ''}`)
      .join('; ');
    const msg = details || `Finix ${res.status}`;
    console.error(`Finix ${res.status} on ${res.config?.method?.toUpperCase() || 'REQ'} ${res.config?.url || ''}:`, JSON.stringify(res.data));
    throw new Error(msg);
  }
  return res.data;
}

async function finixGet<T = any>(path: string): Promise<T> {
  const client = getFinixClient();
  const res = await client.get(path);
  if (res.status >= 400) {
    const errs = res.data?._embedded?.errors || (res.data?.message ? [{ message: res.data.message }] : []);
    const details = errs
      .map((e: any) => `${e.field ? `[${e.field}] ` : ''}${e.message || JSON.stringify(e)}${e.code ? ` (${e.code})` : ''}`)
      .join('; ');
    const msg = details || `Finix ${res.status}`;
    console.error(`Finix ${res.status} on ${res.config?.method?.toUpperCase() || 'REQ'} ${res.config?.url || ''}:`, JSON.stringify(res.data));
    throw new Error(msg);
  }
  return res.data;
}

async function finixPatch<T = any>(path: string, body: any): Promise<T> {
  const client = getFinixClient();
  const res = await client.patch(path, body);
  if (res.status >= 400) {
    const errs = res.data?._embedded?.errors || (res.data?.message ? [{ message: res.data.message }] : []);
    const details = errs
      .map((e: any) => `${e.field ? `[${e.field}] ` : ''}${e.message || JSON.stringify(e)}${e.code ? ` (${e.code})` : ''}`)
      .join('; ');
    const msg = details || `Finix ${res.status}`;
    console.error(`Finix ${res.status} on ${res.config?.method?.toUpperCase() || 'REQ'} ${res.config?.url || ''}:`, JSON.stringify(res.data));
    throw new Error(msg);
  }
  return res.data;
}

// Convert dollars → cents (integer). Finix API expects cents.
const toCents = (dollars: number): number => Math.round(dollars * 100);
const fromCents = (cents: number): number => Math.round(cents) / 100;

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
  }
}

// ============================================================================
// HELPER: Tokenize Finix token → payment_instrument
// Client sends a tokenId from the Tokenization Form. Finix v1 pattern:
// POST /payment_instruments { token: <tokenId>, type: "TOKEN", identity: <buyerIdentityId> }
// Returns a payment_instrument id that can be used as `source` on a Transfer.
// ============================================================================

async function ensureBuyerIdentity(
  db: admin.firestore.Firestore,
  userId: string,
  user: any
): Promise<string> {
  // Reuse cached Finix buyer identity if we've created one before.
  const userDoc = await db.collection("users").doc(userId).get();
  const existing = userDoc.data()?.finixBuyerIdentityId as string | undefined;
  if (existing) return existing;

  const body = {
    entity: {
      first_name: user?.firstName || user?.displayName?.split(" ")[0] || "RallySphere",
      last_name: user?.lastName || user?.displayName?.split(" ").slice(1).join(" ") || "User",
      email: user?.email || `user-${userId}@rallysphere.app`,
      phone: user?.phone || null,
    },
    tags: { user_id: userId },
  };
  const identity = await finixPost("/identities", body);
  const identityId = identity.id;

  await db.collection("users").doc(userId).set(
    { finixBuyerIdentityId: identityId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return identityId;
}

async function createPaymentInstrumentFromToken(
  tokenId: string,
  buyerIdentityId: string
): Promise<string> {
  const body = {
    token: tokenId,
    type: "TOKEN",
    identity: buyerIdentityId,
  };
  const pi = await finixPost("/payment_instruments", body);
  return pi.id;
}

interface PaymentInstrumentDetails {
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  type?: string | null;
  fingerprint?: string | null;
}

async function fetchPaymentInstrumentDetails(piId: string): Promise<PaymentInstrumentDetails> {
  const pi = await finixGet(`/payment_instruments/${piId}`);
  return {
    brand: pi.brand ? String(pi.brand).toLowerCase() : null,
    last4: pi.last_four ?? null,
    expMonth: pi.expiration_month ?? null,
    expYear: pi.expiration_year ?? null,
    type: pi.instrument_type ?? null,
    fingerprint: pi.fingerprint ?? null,
  };
}

// Resolve the Finix payment_instrument to charge — either an already-saved one
// (verified to belong to the requesting user) or a freshly tokenized one.
async function resolvePaymentInstrument(opts: {
  db: admin.firestore.Firestore;
  userId: string;
  buyerIdentityId: string;
  savedPaymentInstrumentId?: string;
  tokenId?: string;
}): Promise<{ paymentInstrumentId: string; usedSaved: boolean }> {
  if (opts.savedPaymentInstrumentId) {
    const doc = await opts.db
      .collection("users").doc(opts.userId)
      .collection("paymentInstruments").doc(opts.savedPaymentInstrumentId)
      .get();
    if (!doc.exists || doc.data()?.disabled) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Saved payment method not found"
      );
    }
    return { paymentInstrumentId: opts.savedPaymentInstrumentId, usedSaved: true };
  }
  if (!opts.tokenId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Either tokenId or savedPaymentInstrumentId is required"
    );
  }
  const piId = await createPaymentInstrumentFromToken(opts.tokenId, opts.buyerIdentityId);
  return { paymentInstrumentId: piId, usedSaved: false };
}

// Persist a freshly tokenized payment_instrument to the user's saved cards
// (only when the user explicitly opted in). De-dupes by Finix fingerprint so
// re-entering the same card doesn't pile up duplicates.
async function saveInstrumentForUser(
  db: admin.firestore.Firestore,
  userId: string,
  piId: string,
  details: PaymentInstrumentDetails
): Promise<void> {
  if (details.fingerprint) {
    const existing = await db
      .collection("users").doc(userId)
      .collection("paymentInstruments")
      .where("fingerprint", "==", details.fingerprint)
      .limit(1)
      .get();
    if (!existing.empty) return;
  }
  // Auto-mark the user's first saved card as default so they don't have to.
  const otherActive = await db
    .collection("users").doc(userId)
    .collection("paymentInstruments")
    .where("disabled", "==", false)
    .limit(1)
    .get();
  const isFirstCard = otherActive.empty;
  await db
    .collection("users").doc(userId)
    .collection("paymentInstruments").doc(piId)
    .set({
      piId,
      brand: details.brand || null,
      last4: details.last4 || null,
      expMonth: details.expMonth || null,
      expYear: details.expYear || null,
      type: details.type || "PAYMENT_CARD",
      fingerprint: details.fingerprint || null,
      isDefault: isFirstCard,
      disabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ============================================================================
// GET FINIX TOKENIZATION CONTEXT
// Frontend calls this before opening the tokenization form to learn which
// Application ID + environment to load. Replaces getBraintreeClientToken.
// No server round-trip per payment is needed — tokenization happens fully
// client-side against Finix.
// ============================================================================

export const getFinixTokenizationContext = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
      const cfg = getFinixConfig();
      return {
        applicationId: cfg.applicationId,
        environment: cfg.environment,
      };
    } catch (error: any) {
      console.error("Error getting Finix context:", error);
      throw new functions.https.HttpsError("internal", `Failed to get tokenization context: ${error.message}`);
    }
  }
);

// ============================================================================
// CREATE EVENT TICKET TRANSACTION
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
      tokenId,
      fraudSessionId,
      paymentMethod = "card",
      idempotencyKey,
      eventId,
      ticketPrice,
      currency = "USD",
      discountApplied,
      originalPrice,
      discountAmount,
      savedPaymentInstrumentId,
      savePaymentMethod,
    } = data;

    if ((!tokenId && !savedPaymentInstrumentId) || !eventId || ticketPrice == null) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: (tokenId or savedPaymentInstrumentId), eventId, ticketPrice"
      );
    }

    if (ticketPrice < 0) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket price cannot be negative");
    }

    try {
      const db = admin.firestore();
      const userId = auth.uid;

      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Event not found");
      }
      const eventData = eventDoc.data();

      if (eventData?.attendees?.includes(userId)) {
        throw new functions.https.HttpsError("already-exists", "User is already attending this event");
      }

      const clubDoc = await db.collection("clubs").doc(eventData!.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }
      const club = clubDoc.data();
      if (!club?.finixMerchantId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This club has not completed payment setup"
        );
      }

      // Fee calc — supplemental fee passed to buyer: 10% + $0.29
      const SERVICE_FEE_PERCENTAGE = 0.10;
      const SERVICE_FEE_FIXED = 0.29;
      const processingFee = Math.round(((ticketPrice * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
      const totalAmount = ticketPrice + processingFee;
      const clubAmount = ticketPrice;

      // Resolve buyer identity + payment_instrument (either fresh token or saved PI)
      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user);
      const { paymentInstrumentId, usedSaved } = await resolvePaymentInstrument({
        db, userId, buyerIdentityId, savedPaymentInstrumentId, tokenId,
      });

      // Create Finix transfer (charge)
      const transferBody: any = {
        merchant: club.finixMerchantId,
        source: paymentInstrumentId,
        amount: toCents(totalAmount),
        fee: toCents(processingFee),
        currency,
        tags: {
          event_id: eventId,
          user_id: userId,
          club_id: eventData!.clubId,
          ...(fraudSessionId && { fraud_session_id: fraudSessionId }),
        },
      };

      const transfer = await finixPost("/transfers", transferBody, idempotencyKey);

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        const msg = transfer.failure_message || transfer.failure_code || "Payment declined";
        throw new functions.https.HttpsError("internal", msg);
      }

      const transactionId = transfer.id;
      console.log(`Finix transfer created: ${transactionId} state=${transfer.state}`);

      // Persist the freshly tokenized PI as a saved card if user opted in.
      // Skipped when reusing an existing saved PI (it's already saved).
      if (savePaymentMethod && !usedSaved) {
        try {
          const details = await fetchPaymentInstrumentDetails(paymentInstrumentId);
          await saveInstrumentForUser(db, userId, paymentInstrumentId, details);
        } catch (e: any) {
          console.error("Failed to save payment instrument (non-fatal):", e?.message || e);
        }
      }

      // Add user to event (attendees or waitlist)
      const currentAttendeeCount =
        eventData?.attendeeCount ?? eventData?.attendees?.length ?? 0;
      const eventRef = db.collection("events").doc(eventId);
      const batch = db.batch();
      if (eventData?.maxAttendees && currentAttendeeCount >= eventData.maxAttendees) {
        batch.update(eventRef, {
          waitlist: admin.firestore.FieldValue.arrayUnion(userId),
          waitlistCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(eventRef.collection("waitlist").doc(userId), {
          userId,
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        batch.update(eventRef, {
          attendees: admin.firestore.FieldValue.arrayUnion(userId),
          attendeeCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(eventRef.collection("attendees").doc(userId), {
          userId,
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      // ACH settles async; card settles fast. Map Finix state → our status.
      const orderStatus = transfer.state === "SUCCEEDED" ? "confirmed" : "pending";
      const paymentStatus = transfer.state === "SUCCEEDED" ? "succeeded" : "pending";

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
        processingFee,
        clubAmount,
        currency,
        paymentMethod,
        status: paymentStatus,
        finixState: transfer.state,
        provider: "finix",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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
        paymentMethod,
        status: orderStatus,
        finixState: transfer.state,
        transactionId,
        provider: "finix",
        ...(discountApplied && {
          discountRedemptionId: discountApplied.redemptionId,
          discountRedemptionName: discountApplied.redemptionName,
          creditsUsed: discountApplied.creditsUsed,
        }),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await awardRallyCredits(db, userId, eventData!.clubId, eventId, eventData, transactionId);

      return {
        success: true,
        transactionId,
        state: transfer.state,
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
      tokenId,
      fraudSessionId,
      paymentMethod = "card",
      idempotencyKey,
      itemId,
      quantity,
      selectedVariants,
      deliveryMethod,
      shippingAddress,
      rewardDiscount,
      savedPaymentInstrumentId,
      savePaymentMethod,
    } = data;

    if ((!tokenId && !savedPaymentInstrumentId) || !itemId || !quantity || !deliveryMethod) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: (tokenId or savedPaymentInstrumentId), itemId, quantity, deliveryMethod"
      );
    }
    if (quantity <= 0) {
      throw new functions.https.HttpsError("invalid-argument", "Quantity must be greater than 0");
    }

    try {
      const db = admin.firestore();
      const userId = auth.uid;

      const itemDoc = await db.collection("storeItems").doc(itemId).get();
      if (!itemDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Store item not found");
      }
      const item = itemDoc.data() as any;

      const clubDoc = await db.collection("clubs").doc(item.clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }
      const club = clubDoc.data() as any;
      if (!club?.finixMerchantId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This club has not completed payment setup"
        );
      }

      const availableStock = item.inventory - (item.sold || 0);
      if (availableStock < quantity) {
        throw new functions.https.HttpsError("failed-precondition", "Not enough items in stock");
      }

      const itemPrice = item.price * quantity;
      const shipping = deliveryMethod === "shipping" ? (item.shippingCost || 0) : 0;
      const discountAmount = rewardDiscount?.discountAmount || 0;
      const subtotal = Math.max(0, itemPrice - discountAmount);
      const itemAndShipping = subtotal + shipping;
      const taxAmount = 0;

      const SERVICE_FEE_PERCENTAGE = 0.10;
      const SERVICE_FEE_FIXED = 0.29;
      const originalItemAndShipping = itemPrice + shipping;
      const processingFee = Math.round(((originalItemAndShipping * SERVICE_FEE_PERCENTAGE) + SERVICE_FEE_FIXED) * 100) / 100;
      const clubAmount = itemAndShipping + taxAmount;
      const totalAmount = itemAndShipping + taxAmount + processingFee;

      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user);
      const { paymentInstrumentId, usedSaved } = await resolvePaymentInstrument({
        db, userId, buyerIdentityId, savedPaymentInstrumentId, tokenId,
      });

      const transferBody: any = {
        merchant: club.finixMerchantId,
        source: paymentInstrumentId,
        amount: toCents(totalAmount),
        fee: toCents(processingFee),
        currency: "USD",
        tags: {
          item_id: itemId,
          user_id: userId,
          club_id: item.clubId,
          ...(fraudSessionId && { fraud_session_id: fraudSessionId }),
        },
      };

      const transfer = await finixPost("/transfers", transferBody, idempotencyKey);

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        const msg = transfer.failure_message || transfer.failure_code || "Payment declined";
        throw new functions.https.HttpsError("internal", msg);
      }

      const transactionId = transfer.id;
      console.log(`Finix store transfer created: ${transactionId} state=${transfer.state}`);

      if (savePaymentMethod && !usedSaved) {
        try {
          const details = await fetchPaymentInstrumentDetails(paymentInstrumentId);
          await saveInstrumentForUser(db, userId, paymentInstrumentId, details);
        } catch (e: any) {
          console.error("Failed to save payment instrument (non-fatal):", e?.message || e);
        }
      }

      const orderStatus = transfer.state === "SUCCEEDED" ? "pending" : "pending_payment";

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
        processingFee,
        clubAmount,
        shipping,
        totalAmount,
        deliveryMethod,
        shippingAddress: shippingAddress || null,
        paymentMethod,
        status: orderStatus,
        finixState: transfer.state,
        transactionId,
        provider: "finix",
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

      await db.collection("storeItems").doc(itemId).update({
        sold: admin.firestore.FieldValue.increment(parseInt(quantity)),
      });

      console.log(`Store order created for user ${userId}, item ${itemId}`);

      return {
        success: true,
        transactionId,
        state: transfer.state,
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

// ============================================================================
// SAVED PAYMENT METHODS
// Users can opt to save a tokenized card after a successful charge. Listing
// reads from Firestore (no Finix round-trip needed). Deleting marks the
// Firestore doc as disabled so it won't be reusable on future charges.
// ============================================================================

export const listPaymentInstruments = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
      const db = admin.firestore();
      const userId = request.auth.uid;
      const snap = await db
        .collection("users").doc(userId)
        .collection("paymentInstruments")
        .where("disabled", "==", false)
        .get();
      const instruments = snap.docs.map((d) => {
        const v = d.data();
        return {
          piId: v.piId || d.id,
          brand: v.brand || null,
          last4: v.last4 || null,
          expMonth: v.expMonth || null,
          expYear: v.expYear || null,
          type: v.type || "PAYMENT_CARD",
          isDefault: !!v.isDefault,
          createdAt: v.createdAt?.toMillis ? v.createdAt.toMillis() : null,
        };
      });
      // Default first, then newest first
      instruments.sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      return { success: true, instruments };
    } catch (error: any) {
      console.error("listPaymentInstruments error:", error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to list payment methods");
    }
  }
);

export const deletePaymentInstrument = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { piId } = request.data || {};
    if (!piId) {
      throw new functions.https.HttpsError("invalid-argument", "piId is required");
    }
    try {
      const db = admin.firestore();
      const userId = request.auth.uid;
      const col = db.collection("users").doc(userId).collection("paymentInstruments");
      const ref = col.doc(piId);
      const doc = await ref.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Payment method not found");
      }
      const wasDefault = !!doc.data()?.isDefault;
      // Soft-delete: keep the record so historical receipts can still reference it,
      // but exclude from list/charge eligibility.
      await ref.update({
        disabled: true,
        isDefault: false,
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // If we deleted the default card, promote the most recent remaining one.
      if (wasDefault) {
        const remaining = await col.where("disabled", "==", false).get();
        if (!remaining.empty) {
          const sorted = remaining.docs.sort((a, b) => {
            const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
            const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
            return tb - ta;
          });
          await sorted[0].ref.update({ isDefault: true });
        }
      }
      return { success: true };
    } catch (error: any) {
      console.error("deletePaymentInstrument error:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", error.message || "Failed to delete payment method");
    }
  }
);

// Add a new card outside of a checkout flow. Tokenizes the card via the same
// Finix form, then saves the resulting payment_instrument under the user
// without creating a transfer.
export const saveNewPaymentInstrument = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { tokenId } = request.data || {};
    if (!tokenId) {
      throw new functions.https.HttpsError("invalid-argument", "tokenId is required");
    }
    try {
      const db = admin.firestore();
      const userId = request.auth.uid;
      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user);
      const piId = await createPaymentInstrumentFromToken(tokenId, buyerIdentityId);
      const details = await fetchPaymentInstrumentDetails(piId);
      await saveInstrumentForUser(db, userId, piId, details);
      return {
        success: true,
        instrument: {
          piId,
          brand: details.brand || null,
          last4: details.last4 || null,
          expMonth: details.expMonth || null,
          expYear: details.expYear || null,
          type: details.type || "PAYMENT_CARD",
        },
      };
    } catch (error: any) {
      console.error("saveNewPaymentInstrument error:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", error.message || "Failed to save payment method");
    }
  }
);

export const setDefaultPaymentInstrument = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { piId } = request.data || {};
    if (!piId) {
      throw new functions.https.HttpsError("invalid-argument", "piId is required");
    }
    try {
      const db = admin.firestore();
      const userId = request.auth.uid;
      const col = db.collection("users").doc(userId).collection("paymentInstruments");
      const target = await col.doc(piId).get();
      if (!target.exists || target.data()?.disabled) {
        throw new functions.https.HttpsError("not-found", "Payment method not found");
      }
      const all = await col.where("disabled", "==", false).get();
      const batch = db.batch();
      all.docs.forEach((d) => batch.update(d.ref, { isDefault: d.id === piId }));
      await batch.commit();
      return { success: true };
    } catch (error: any) {
      console.error("setDefaultPaymentInstrument error:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", error.message || "Failed to set default");
    }
  }
);

// ============================================================================
// CREATE SUB-MERCHANT ACCOUNT (Hosted Onboarding)
// Creates a Finix identity shell + onboarding form and returns the hosted URL.
// The club admin completes KYC (Persona selfie, Gov ID, bank) on Finix's site,
// then is redirected back via the deep link. Webhook fires on approval.
// ============================================================================

export const createSubMerchantAccount = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, email, clubName, returnUrl } = data;

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

      // Already onboarded
      if (club?.finixMerchantId && club?.finixOnboardingComplete) {
        return {
          identityId: club.finixIdentityId,
          merchantId: club.finixMerchantId,
          status: "APPROVED",
          onboardingUrl: null,
        };
      }

      const cfg = getFinixConfig();

      // Create (or reuse) the club's Finix identity shell. The identity lets us
      // pre-fill the hosted form and look up the merchant record later by identity.
      let identityId: string = club?.finixIdentityId;
      if (!identityId) {
        const identityBody = {
          entity: {
            business_name: clubName,
            doing_business_as: clubName,
            email,
          },
          tags: { club_id: clubId },
        };
        console.log(`[createSubMerchantAccount] POST /identities body=`, JSON.stringify(identityBody));
        const identity = await finixPost("/identities", identityBody);
        identityId = identity.id;
        console.log(`[createSubMerchantAccount] created identity ${identityId} for club ${clubId}`);
      }

      // Build the onboarding form body per Finix hosted-onboarding spec:
      //   - merchant_processors:      which processor will run KYC + settle (DUMMY_V1 in sandbox, FINIX_V1 in live)
      //   - onboarding_data:          pre-filled identity/merchant fields
      //   - onboarding_link_details:  the return + expired-session URLs
      const returnUrlFinal = returnUrl || `rallysphere://finix-onboarding/return?clubId=${encodeURIComponent(clubId)}`;
      const refreshUrlFinal = `rallysphere://finix-onboarding/refresh?clubId=${encodeURIComponent(clubId)}`;
      const feesUrl = process.env.FINIX_FEE_DETAILS_URL || "https://rally-sphere.web.app/fees.html";
      const processor = isTestMode ? "DUMMY_V1" : "FINIX_V1";
      // Underwriting cap per transaction. $5,000 covers a high-end paid event / store item.
      // Override with FINIX_MAX_TXN_CENTS if you need a different ceiling.
      const maxTxnCents = Number(process.env.FINIX_MAX_TXN_CENTS) || 500000;

      const formBody = {
        application: cfg.applicationId,
        merchant_processors: [{ processor }],
        onboarding_data: {
          max_transaction_amount: maxTxnCents,
          identity: {
            id: identityId,
            entity: {
              business_name: clubName,
              doing_business_as: clubName,
              email,
            },
            tags: { club_id: clubId },
          },
        },
        onboarding_link_details: {
          return_url: returnUrlFinal,
          expired_session_url: refreshUrlFinal,
          fee_details_url: feesUrl,
          fee_ready: true,
          tos_acceptance: true,
        },
        tags: { club_id: clubId },
      };
      console.log(`[createSubMerchantAccount] POST /onboarding_forms body=`, JSON.stringify(formBody));
      const form = await finixPost("/onboarding_forms", formBody);

      // Finix returns the hosted URL + expiry under `onboarding_link` (not `onboarding_link_details`).
      const onboardingUrl =
        form.onboarding_link?.link_url ||
        form.onboarding_link_details?.link_url ||
        form.link_url ||
        form.hosted_url ||
        form.url ||
        form.link;
      if (!onboardingUrl) {
        throw new Error(`Finix did not return a hosted onboarding URL. Response: ${JSON.stringify(form)}`);
      }

      const linkExpiresAt =
        form.onboarding_link?.expires_at || form.onboarding_link_details?.expires_at || null;

      await db.collection("clubs").doc(clubId).update({
        finixIdentityId: identityId,
        finixOnboardingFormId: form.id,
        finixOnboardingUrl: onboardingUrl,
        finixOnboardingLinkExpiresAt: linkExpiresAt,
        finixOnboardingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Finix onboarding form created for club ${clubId}: form=${form.id}`);

      return {
        identityId,
        onboardingFormId: form.id,
        onboardingUrl,
        status: "PENDING",
      };
    } catch (error: any) {
      console.error("Error creating sub-merchant account:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Failed to start onboarding: ${error.message}`);
    }
  }
);

// ============================================================================
// GET SUB-MERCHANT STATUS
// After the club returns from hosted onboarding, poll this to check if Finix
// has created/approved the merchant record. Webhook is authoritative but the
// return screen uses this to show immediate status.
// ============================================================================

export const getSubMerchantStatus = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { identityId, merchantId, clubId } = data;
    if (!identityId && !merchantId && !clubId) {
      throw new functions.https.HttpsError("invalid-argument", "Provide identityId, merchantId, or clubId");
    }

    try {
      const db = admin.firestore();

      // Prefer direct merchant lookup if we have the id
      if (merchantId) {
        const merchant = await finixGet(`/merchants/${merchantId}`);
        return {
          status: merchant.onboarding_state || merchant.processing_enabled ? "APPROVED" : "PENDING",
          isComplete: merchant.processing_enabled === true && merchant.settlement_enabled === true,
          processingEnabled: merchant.processing_enabled === true,
          settlementEnabled: merchant.settlement_enabled === true,
          merchantId: merchant.id,
          identityId: merchant.identity,
        };
      }

      // Otherwise, look up merchants for the identity
      const lookupIdentityId = identityId || (clubId ? (await db.collection("clubs").doc(clubId).get()).data()?.finixIdentityId : null);
      if (!lookupIdentityId) {
        return { status: "PENDING", isComplete: false };
      }

      const list = await finixGet(`/identities/${lookupIdentityId}/merchants`);
      const merchants = list?._embedded?.merchants || [];
      if (merchants.length === 0) {
        return { status: "PENDING", isComplete: false, identityId: lookupIdentityId };
      }
      const merchant = merchants[0];
      return {
        status: merchant.processing_enabled ? "APPROVED" : "PENDING",
        isComplete: merchant.processing_enabled === true && merchant.settlement_enabled === true,
        processingEnabled: merchant.processing_enabled === true,
        settlementEnabled: merchant.settlement_enabled === true,
        merchantId: merchant.id,
        identityId: lookupIdentityId,
      };
    } catch (error: any) {
      console.error("Error checking sub-merchant status:", error);
      throw new functions.https.HttpsError("internal", `Failed to check status: ${error.message}`);
    }
  }
);

// ============================================================================
// FINIX WEBHOOK
// Events we subscribe to in Finix dashboard:
//   - merchant.underwriting.approved / .declined
//   - transfer.updated (state transitions: PENDING → SUCCEEDED / FAILED)
//   - dispute.created / .updated
//   - subscription_schedule_enrollment.updated
//
// Signature verification: Finix signs webhooks with HMAC-SHA256 of the raw
// body using FINIX_WEBHOOK_SECRET. Header: `Finix-Signature`.
// ============================================================================

export const finixWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const cfg = getFinixConfig();
    const signature = (req.headers["finix-signature"] || req.headers["Finix-Signature"]) as string | undefined;
    const rawBody = (req as any).rawBody ? (req as any).rawBody.toString("utf8") : JSON.stringify(req.body);

    if (cfg.webhookSecret) {
      if (!signature) {
        res.status(400).send("Missing signature");
        return;
      }
      const expected = crypto
        .createHmac("sha256", cfg.webhookSecret)
        .update(rawBody)
        .digest("hex");
      const provided = signature.replace(/^.*v1=/, "").trim();
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
        console.error("Invalid Finix webhook signature");
        res.status(400).send("Invalid signature");
        return;
      }
    }

    const event = req.body;
    const eventId: string = event?.id || event?._embedded?.event?.id || uuidv4();

    // Finix sends entity + type as two fields (e.g. entity="merchants", type="underwritten").
    // Older docs use a dotted form. Normalize into a single matcher string and keep the
    // raw action string separately for sub-matching (e.g. "approved" vs "declined").
    const rawEntity: string = String(event?.entity || event?.entity_type || "").toLowerCase();
    const rawAction: string = String(event?.type || event?.event_type || "").toLowerCase();
    const eventType: string = rawEntity && rawAction
      ? `${rawEntity}.${rawAction}`
      : (rawAction || rawEntity || "unknown");

    const db = admin.firestore();

    // Idempotency: skip if we've already processed this event id
    const eventRef = db.collection("webhookEvents").doc(eventId);
    const existing = await eventRef.get();
    if (existing.exists) {
      console.log(`Duplicate webhook ${eventId} — skipping`);
      res.status(200).send("OK");
      return;
    }

    console.log(`Finix webhook: ${eventType} (${eventId})`);

    // Route by event type. Finix entity names are plural ("merchants", "transfers", etc.)
    // but we also tolerate the older singular/dotted forms.
    switch (true) {
      case /^merchants?\./.test(eventType) && /underwritten|underwriting/.test(eventType):
      case /^underwriting\.merchant/.test(eventType):
      case /^merchant\.underwriting/.test(eventType): {
        const merchant = event._embedded?.merchants?.[0] || event.entity || event.data;
        if (merchant?.id) {
          const approved = merchant.processing_enabled === true || /approved/i.test(rawAction);
          const declined = /declined|rejected/i.test(rawAction) || merchant.onboarding_state === "REJECTED";
          const clubs = await db
            .collection("clubs")
            .where("finixIdentityId", "==", merchant.identity)
            .limit(1)
            .get();
          clubs.forEach((doc) => {
            doc.ref.update({
              finixMerchantId: merchant.id,
              finixOnboardingComplete: approved,
              finixOnboardingDeclined: declined,
              finixOnboardingStatus: approved ? "APPROVED" : declined ? "DECLINED" : "PENDING",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
        }
        break;
      }

      case /^transfers?\./.test(eventType):
      case /^transfer_attempts?\./.test(eventType):
      case /^transfer/.test(eventType): {
        const transfer = event._embedded?.transfers?.[0] || event.entity || event.data;
        if (transfer?.id) {
          const newStatus =
            transfer.state === "SUCCEEDED"
              ? "succeeded"
              : transfer.state === "FAILED" || transfer.state === "CANCELED"
              ? "failed"
              : "pending";
          // Update matching payments + ticketOrders + storeOrders
          const paymentsQ = await db.collection("payments").where("transactionId", "==", transfer.id).get();
          paymentsQ.forEach((d) => d.ref.update({ status: newStatus, finixState: transfer.state, updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
          const ticketQ = await db.collection("ticketOrders").where("transactionId", "==", transfer.id).get();
          ticketQ.forEach((d) =>
            d.ref.update({
              status: newStatus === "succeeded" ? "confirmed" : newStatus === "failed" ? "failed" : d.data().status,
              finixState: transfer.state,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          );
          const storeQ = await db.collection("storeOrders").where("transactionId", "==", transfer.id).get();
          storeQ.forEach((d) =>
            d.ref.update({
              status: newStatus === "failed" ? "failed" : d.data().status,
              finixState: transfer.state,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          );
        }
        break;
      }

      case /^disputes?\./.test(eventType):
      case /^dispute/.test(eventType): {
        const dispute = event._embedded?.disputes?.[0] || event.entity || event.data;
        if (dispute?.id) {
          await db.collection("disputes").doc(dispute.id).set(
            {
              finixDisputeId: dispute.id,
              transactionId: dispute.transfer,
              amount: dispute.amount ? fromCents(dispute.amount) : null,
              reason: dispute.reason,
              state: dispute.state,
              respondBy: dispute.respond_by,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        break;
      }

      case /^subscriptions?\./.test(eventType):
      case /^subscription_schedule_enrollments?\./.test(eventType):
      case /^subscription/.test(eventType): {
        const enrollment = event._embedded?.subscription_schedule_enrollments?.[0] || event.entity || event.data;
        if (enrollment?.id) {
          const status = enrollment.state || enrollment.status || "unknown";
          const subQ1 = await db
            .collection("clubSubscriptions")
            .where("finixEnrollmentId", "==", enrollment.id)
            .get();
          subQ1.forEach((d) =>
            d.ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
          );
          const subQ2 = await db
            .collection("userSubscriptions")
            .where("finixEnrollmentId", "==", enrollment.id)
            .get();
          subQ2.forEach((d) =>
            d.ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
          );
        }
        break;
      }

      default:
        // Log the full payload so we can see exactly what Finix sent and extend handlers.
        console.log(
          `Unhandled Finix event: ${eventType}`,
          JSON.stringify({ entity: rawEntity, action: rawAction, body: event }).slice(0, 4000)
        );
    }

    await eventRef.set({
      eventId,
      eventType,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("Finix webhook error:", error);
    res.status(500).send(`Webhook Error: ${error.message}`);
  }
});

// ============================================================================
// GET USER PAYMENTS (Firestore-only, provider-agnostic)
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

async function reverseTransfer(transferId: string, idempotencyKey?: string, amountCents?: number) {
  const body: any = {};
  if (amountCents != null) body.refund_amount = amountCents;
  return finixPost(`/transfers/${transferId}/reversals`, body, idempotencyKey);
}

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
            const reversal = await reverseTransfer(transactionId);
            refundAmount = fromCents(reversal.amount || 0);
            refundProcessed = true;

            await ticketOrder.ref.update({
              status: "refunded",
              refundTransactionId: reversal.id,
              refundAmount,
              refundedAt: admin.firestore.FieldValue.serverTimestamp(),
              refundReason: "User left event",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (refundError: any) {
            console.error("Error processing refund:", refundError);
            throw new functions.https.HttpsError("internal", `Failed to process refund: ${refundError.message}`);
          }
        }
      }

      const leaveEventRef = db.collection("events").doc(eventId);
      const leaveBatch = db.batch();
      leaveBatch.update(leaveEventRef, {
        attendees: admin.firestore.FieldValue.arrayRemove(userId),
        waitlist: admin.firestore.FieldValue.arrayRemove(userId),
        attendeeCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      leaveBatch.delete(leaveEventRef.collection("attendees").doc(userId));
      // Defensive: also remove any waitlist subcollection doc in case state is inconsistent
      leaveBatch.delete(leaveEventRef.collection("waitlist").doc(userId));
      await leaveBatch.commit();

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
          "This order cannot be refunded because it has no transaction ID. Please refund manually through the Finix dashboard."
        );
      }

      const reversal = await reverseTransfer(transactionId);
      const refundAmount = fromCents(reversal.amount || 0);
      console.log(`Refund created for ticket order ${orderId}: ${reversal.id}`);

      await db.collection("ticketOrders").doc(orderId).update({
        status: "refunded",
        refundTransactionId: reversal.id,
        refundAmount,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (order?.eventId && order?.userId) {
        await db.collection("events").doc(order.eventId).update({
          attendees: admin.firestore.FieldValue.arrayRemove(order.userId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        refundId: reversal.id,
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
// CANCEL EVENT (Admin) — refunds all paid attendees and marks event cancelled
// ============================================================================

export const cancelEvent = functions.https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 540, memory: "512MiB" },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { eventId, reason } = data || {};
    if (!eventId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required field: eventId");
    }

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Event not found");
    }
    const event = eventSnap.data() as any;

    if (event.status === "cancelled") {
      throw new functions.https.HttpsError("failed-precondition", "Event is already cancelled");
    }

    // Authorize: event creator OR club admin/owner
    const isCreator = event.createdBy === auth.uid;
    let isAuthorized = isCreator;
    if (!isAuthorized && event.clubId) {
      const clubSnap = await db.collection("clubs").doc(event.clubId).get();
      if (clubSnap.exists) {
        const club = clubSnap.data() as any;
        const admins: string[] = club?.clubAdmins || club?.admins || [];
        const owner = club?.clubOwner || club?.owner;
        isAuthorized = admins.includes(auth.uid) || owner === auth.uid;
      }
    }
    if (!isAuthorized) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the event creator or a club admin can cancel this event"
      );
    }

    // Collect refundable ticket orders for this event
    const ordersSnap = await db
      .collection("ticketOrders")
      .where("eventId", "==", eventId)
      .get();

    let paidRefunded = 0;
    let freeCancelled = 0;
    let totalRefunded = 0;
    const failures: Array<{ orderId: string; error: string }> = [];

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() as any;
      if (order.status === "cancelled" || order.status === "refunded") {
        continue; // already handled
      }
      const transactionId = order.transactionId;
      const isPaid = !!transactionId && (order.totalAmount || 0) > 0;

      if (isPaid) {
        try {
          const reversal = await reverseTransfer(transactionId);
          const refundAmount = fromCents(reversal.amount || 0);
          totalRefunded += refundAmount;
          paidRefunded += 1;
          await orderDoc.ref.update({
            status: "refunded",
            refundTransactionId: reversal.id,
            refundAmount,
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            refundedBy: auth.uid,
            refundReason: reason || "Event cancelled",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (err: any) {
          console.error(`Failed to refund order ${orderDoc.id}:`, err?.message || err);
          failures.push({ orderId: orderDoc.id, error: err?.message || String(err) });
        }
      } else {
        // Free or unpaid — just mark cancelled
        await orderDoc.ref.update({
          status: "cancelled",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelledBy: auth.uid,
          cancelledReason: reason || "Event cancelled",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        freeCancelled += 1;
      }
    }

    // Clear attendees/waitlist subcollections so the event no longer shows attendees
    const subcollections = ["attendees", "waitlist"];
    for (const sub of subcollections) {
      const subSnap = await eventRef.collection(sub).get();
      let batch = db.batch();
      let ops = 0;
      for (const d of subSnap.docs) {
        batch.delete(d.ref);
        ops++;
        if (ops >= 400) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    // Mark the event cancelled and reset counters/arrays
    await eventRef.update({
      status: "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelledBy: auth.uid,
      cancelledReason: reason || null,
      attendees: [],
      waitlist: [],
      attendeeCount: 0,
      waitlistCount: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      paidRefunded,
      freeCancelled,
      totalRefunded,
      failures,
    };
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
          "This order cannot be refunded because it has no transaction ID. Please refund manually through the Finix dashboard."
        );
      }

      const reversal = await reverseTransfer(transactionId);
      const refundAmount = fromCents(reversal.amount || 0);
      console.log(`Refund created for store order ${orderId}: ${reversal.id}`);

      await db.collection("storeOrders").doc(orderId).update({
        status: "refunded",
        refundTransactionId: reversal.id,
        refundAmount,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (order?.itemId && order?.quantity) {
        await db.collection("storeItems").doc(order.itemId).update({
          sold: admin.firestore.FieldValue.increment(-order.quantity),
        });
      }

      return {
        success: true,
        refundId: reversal.id,
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
// SUBSCRIPTIONS (Finix)
// Finix subscription model differs from Braintree:
//   1. A `subscription_schedule` defines recurrence (name, interval, amount).
//      Create once in the Finix dashboard per plan; store the schedule id as an
//      env var.
//   2. An enrollment (`subscription_schedule_enrollments`) attaches a buyer +
//      payment_instrument to the schedule. That's what we create here.
//   3. Cancel = PATCH enrollment → state=INACTIVE.
//
// Env vars to set:
//   FINIX_SCHEDULE_PRO_MONTHLY         — club "pro" plan
//   FINIX_SCHEDULE_USER_PRO_MONTHLY    — individual user "pro" plan
//   FINIX_SCHEDULE_CLUB_MONTHLY        — generic club-tier plan
// ============================================================================

async function createEnrollment(
  scheduleId: string,
  tokenId: string,
  buyerIdentityId: string,
  tags: Record<string, string>,
  idempotencyKey?: string
) {
  const paymentInstrumentId = await createPaymentInstrumentFromToken(tokenId, buyerIdentityId);
  const enrollment = await finixPost(
    "/subscription_schedule_enrollments",
    {
      subscription_schedule: scheduleId,
      payment_instrument: paymentInstrumentId,
      buyer_identity: buyerIdentityId,
      tags,
    },
    idempotencyKey
  );
  return enrollment;
}

export const createProSubscription = functions.https.onCall(
  { enforceAppCheck: false },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, userId, clubName, tokenId, idempotencyKey } = data;
    if (!clubId || !userId || !tokenId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: clubId, userId, tokenId");
    }

    const scheduleId = process.env.FINIX_SCHEDULE_PRO_MONTHLY;
    if (!scheduleId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Pro subscription schedule not configured (FINIX_SCHEDULE_PRO_MONTHLY)"
      );
    }

    try {
      const db = admin.firestore();
      const clubDoc = await db.collection("clubs").doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Club not found");
      }

      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user);

      const enrollment = await createEnrollment(
        scheduleId,
        tokenId,
        buyerIdentityId,
        { club_id: clubId, user_id: userId, plan: "pro_monthly" },
        idempotencyKey
      );

      await db.collection("clubSubscriptions").add({
        clubId,
        clubName: clubName || "",
        userId,
        finixEnrollmentId: enrollment.id,
        finixScheduleId: scheduleId,
        status: enrollment.state || "ACTIVE",
        planId: "pro_monthly",
        provider: "finix",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, subscriptionId: enrollment.id };
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
      await finixPatch(`/subscription_schedule_enrollments/${subscriptionId}`, { state: "INACTIVE" });

      const db = admin.firestore();
      const subQuery = await db.collection("clubSubscriptions")
        .where("finixEnrollmentId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          status: "INACTIVE",
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

    const { userId, tokenId, idempotencyKey } = data;
    if (!userId || !tokenId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: userId, tokenId");
    }

    const scheduleId = process.env.FINIX_SCHEDULE_USER_PRO_MONTHLY;
    if (!scheduleId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User Pro subscription schedule not configured (FINIX_SCHEDULE_USER_PRO_MONTHLY)"
      );
    }

    try {
      const db = admin.firestore();
      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user);

      const enrollment = await createEnrollment(
        scheduleId,
        tokenId,
        buyerIdentityId,
        { user_id: userId, plan: "user_pro_monthly" },
        idempotencyKey
      );

      await db.collection("userSubscriptions").add({
        userId,
        finixEnrollmentId: enrollment.id,
        finixScheduleId: scheduleId,
        status: enrollment.state || "ACTIVE",
        planId: "user_pro_monthly",
        provider: "finix",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, subscriptionId: enrollment.id };
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
      await finixPatch(`/subscription_schedule_enrollments/${subscriptionId}`, { state: "INACTIVE" });

      const db = admin.firestore();
      const subQuery = await db.collection("userSubscriptions")
        .where("finixEnrollmentId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          status: "INACTIVE",
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

    const { clubId, userId, tokenId, idempotencyKey } = data;
    if (!clubId || !userId || !tokenId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: clubId, userId, tokenId");
    }

    const scheduleId = process.env.FINIX_SCHEDULE_CLUB_MONTHLY;
    if (!scheduleId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Club subscription schedule not configured (FINIX_SCHEDULE_CLUB_MONTHLY)"
      );
    }

    try {
      const db = admin.firestore();
      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.exists ? userDoc.data() : null;
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user);

      const enrollment = await createEnrollment(
        scheduleId,
        tokenId,
        buyerIdentityId,
        { club_id: clubId, user_id: userId, plan: "club_monthly" },
        idempotencyKey
      );

      await db.collection("clubSubscriptions").add({
        clubId,
        userId,
        finixEnrollmentId: enrollment.id,
        finixScheduleId: scheduleId,
        status: enrollment.state || "ACTIVE",
        planId: "club_monthly",
        provider: "finix",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("clubs").doc(clubId).update({
        subscriptionStatus: "active",
        finixEnrollmentId: enrollment.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, subscriptionId: enrollment.id };
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
      await finixPatch(`/subscription_schedule_enrollments/${subscriptionId}`, { state: "INACTIVE" });

      const db = admin.firestore();
      const subQuery = await db.collection("clubSubscriptions")
        .where("finixEnrollmentId", "==", subscriptionId)
        .get();

      subQuery.forEach((doc) => {
        doc.ref.update({
          status: "INACTIVE",
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
// FIX EVENTS AND CREDITS (Admin utility — no payment dependency, untouched)
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

        // Read attendees from subcollection (source of truth post-migration);
        // fall back to legacy array if the subcollection is empty.
        const attendeesSubSnap = await eventDoc.ref.collection("attendees").get();
        const attendeeIds: string[] = attendeesSubSnap.empty
          ? (event.attendees || [])
          : attendeesSubSnap.docs.map((d) => d.id);

        for (const userId of attendeeIds) {
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
