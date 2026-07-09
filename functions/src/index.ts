import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

admin.initializeApp();
// Skip undefined fields on writes instead of throwing. Optional form fields
// (e.g. a business with no DBA) arrive as undefined; without this, update()
// rejects the whole write.
admin.firestore().settings({ ignoreUndefinedProperties: true });

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
  // Webhook auth — Basic (what the Finix dashboard webhook form configures) is
  // preferred; HMAC signing-key (webhookSecret) is supported as a fallback.
  webhookBasicUser: string;
  webhookBasicPass: string;
  webhookSecret: string;
  environment: "sandbox" | "live";
}

type FinixEnv = "sandbox" | "live";

// The environment a request uses unless a (staff) caller overrides it. Driven by
// TEST_MODE: sandbox in test builds, live in production. Must NOT throw at module
// load — Firebase's deploy-time source analysis loads this file without injecting
// .env, so strict validation happens lazily in buildFinixConfig() at runtime.
const DEFAULT_ENV: FinixEnv = process.env.TEST_MODE === "false" ? "live" : "sandbox";

// Finix credentials live in Cloud Secret Manager (not in .env), so teammates can
// deploy without ever holding the secret values. Declared here and attached to
// every Finix-touching function via `secrets: FINIX_SECRETS`; at runtime their
// values are injected into process.env, so the reads in buildFinixConfig() work
// unchanged. Non-secret config (TEST_MODE, application/merchant IDs) stays in the
// committed functions/.env. Set/rotate with: firebase functions:secrets:set NAME
const FINIX_SECRETS = [
  defineSecret("FINIX_USERNAME"),
  defineSecret("FINIX_PASSWORD"),
  defineSecret("FINIX_USERNAME_LIVE"),
  defineSecret("FINIX_PASSWORD_LIVE"),
  defineSecret("FINIX_WEBHOOK_BASIC_USER_LIVE"),
  defineSecret("FINIX_WEBHOOK_BASIC_PASS_LIVE"),
];

const clientInstances: Partial<Record<FinixEnv, AxiosInstance>> = {};
const configInstances: Partial<Record<FinixEnv, FinixConfig>> = {};

// One-time startup visibility into which Finix envs are fully configured, so the
// live cutover is verifiable from the function logs. Reads env vars directly
// (no throw) — actual config building still validates lazily per request.
(() => {
  const check = (env: FinixEnv) => {
    const s = env === "live" ? "_LIVE" : "";
    const has = (k: string) => !!process.env[k];
    const creds = ["FINIX_USERNAME", "FINIX_PASSWORD", "FINIX_APPLICATION_ID", "FINIX_PLATFORM_MERCHANT_ID"]
      .every((k) => has(k + s));
    const webhookAuth = has(`FINIX_WEBHOOK_BASIC_USER${s}`) || has(`FINIX_WEBHOOK_SECRET${s}`);
    return `creds=${creds} webhookAuth=${webhookAuth}`;
  };
  console.log(`[FinixConfig] default=${DEFAULT_ENV} | sandbox: ${check("sandbox")} | live: ${check("live")}`);
})();

const buildFinixConfig = (environment: FinixEnv): FinixConfig => {
  // Strict TEST_MODE validation, lazily at runtime (env is injected by then).
  const rawTestMode = process.env.TEST_MODE;
  if (rawTestMode !== "true" && rawTestMode !== "false") {
    throw new Error(
      `TEST_MODE must be exactly "true" or "false" (got: "${rawTestMode}"). Set in functions/.env.`
    );
  }

  const suffix = environment === "live" ? "_LIVE" : "";

  const username = process.env[`FINIX_USERNAME${suffix}`] || "";
  const password = process.env[`FINIX_PASSWORD${suffix}`] || "";
  const applicationId = process.env[`FINIX_APPLICATION_ID${suffix}`] || "";
  const platformMerchantId = process.env[`FINIX_PLATFORM_MERCHANT_ID${suffix}`] || "";
  // Webhook Basic-auth creds you set when creating the webhook in the dashboard.
  const webhookBasicUser =
    process.env[`FINIX_WEBHOOK_BASIC_USER${suffix}`] || process.env.FINIX_WEBHOOK_BASIC_USER || "";
  const webhookBasicPass =
    process.env[`FINIX_WEBHOOK_BASIC_PASS${suffix}`] || process.env.FINIX_WEBHOOK_BASIC_PASS || "";
  // Per-env HMAC signing key (only if you use the signature auth type instead).
  const webhookSecret =
    process.env[`FINIX_WEBHOOK_SECRET${suffix}`] || process.env.FINIX_WEBHOOK_SECRET || "";

  // Fail loud when the requested env's creds aren't populated, instead of
  // producing confusing 401s from Finix.
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
  if (!webhookBasicUser && !webhookBasicPass && !webhookSecret) {
    console.warn(
      `[FinixConfig] No webhook auth configured for ${environment}. Webhook verification will be skipped — set FINIX_WEBHOOK_BASIC_USER${suffix}/FINIX_WEBHOOK_BASIC_PASS${suffix} (or FINIX_WEBHOOK_SECRET${suffix}) before going live.`
    );
  }

  return {
    baseUrl: environment === "live" ? FINIX_LIVE_URL : FINIX_SANDBOX_URL,
    username,
    password,
    applicationId,
    platformMerchantId,
    webhookBasicUser,
    webhookBasicPass,
    webhookSecret,
    environment,
  };
};

const getFinixConfig = (environment: FinixEnv = DEFAULT_ENV): FinixConfig => {
  if (!configInstances[environment]) configInstances[environment] = buildFinixConfig(environment);
  return configInstances[environment]!;
};

const getFinixClient = (environment: FinixEnv = DEFAULT_ENV): AxiosInstance => {
  if (!clientInstances[environment]) {
    const cfg = getFinixConfig(environment);
    clientInstances[environment] = axios.create({
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
  }
  return clientInstances[environment]!;
};

// Master switch for the staff sandbox override. OFF = the app is production-only;
// every request runs against DEFAULT_ENV regardless of the Debug toggle. The full
// env-switching plumbing (getFinixConfig(env), per-request env, staff check) is
// kept intact, so sandbox testing can be re-enabled later by flipping this to
// `true` and redeploying — no other code changes needed.
const ALLOW_SANDBOX_OVERRIDE = false;

// Decide which Finix environment a request runs against. When the override is on,
// only verified @rallysphere.com staff may force sandbox (via the in-app Debug
// toggle); everyone else always uses the deployment default. This is the security
// boundary that prevents a normal user from forcing sandbox to get free goods.
const isRallysphereStaff = (request: any): boolean => {
  const token = request?.auth?.token || {};
  const email = String(token.email || "").toLowerCase();
  return token.email_verified === true && email.endsWith("@rallysphere.com");
};

const resolveFinixEnv = (request: any, wantSandbox?: boolean): FinixEnv => {
  if (ALLOW_SANDBOX_OVERRIDE && wantSandbox && isRallysphereStaff(request)) return "sandbox";
  return DEFAULT_ENV;
};

// Make a POST, attaching idempotency where Finix supports it. Finix reads
// idempotency from the `idempotency_id` field in the request BODY (an
// Idempotency-Key header is ignored). It's supported on Transfers and their
// reversals — the money-movement calls that must be safe to retry — so we
// inject it there and leave other endpoints (identities, onboarding_forms,
// payment_instruments, enrollments) untouched to avoid rejected-field errors.
async function finixPost<T = any>(path: string, body: any, idempotencyKey?: string, env?: FinixEnv): Promise<T> {
  const client = getFinixClient(env);
  const supportsIdempotency =
    path === "/transfers" || /^\/transfers\/[^/]+\/reversals$/.test(path);
  const finalBody = supportsIdempotency
    ? { idempotency_id: idempotencyKey || uuidv4(), ...body }
    : body;
  const res = await client.post(path, finalBody);
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

async function finixGet<T = any>(path: string, env?: FinixEnv): Promise<T> {
  const client = getFinixClient(env);
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
      // serverTimestamp() is a sentinel and is rejected inside array elements;
      // use a concrete Timestamp so arrayUnion / [..] writes succeed.
      createdAt: admin.firestore.Timestamp.now(),
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
  user: any,
  env: FinixEnv = DEFAULT_ENV
): Promise<string> {
  // Buyer identities are env-specific (a sandbox identity 404s in live), so
  // cache them under separate fields per environment. NOTE: we deliberately do
  // NOT reuse the legacy bare `finixBuyerIdentityId` field — it holds SANDBOX
  // identities created during pre-launch testing, which 404 against the live
  // API. Using `_live`/`_sandbox` makes live mint a fresh identity on demand.
  const field = env === "sandbox" ? "finixBuyerIdentityId_sandbox" : "finixBuyerIdentityId_live";
  const userDoc = await db.collection("users").doc(userId).get();
  const existing = userDoc.data()?.[field] as string | undefined;
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
  const identity = await finixPost("/identities", body, undefined, env);
  const identityId = identity.id;

  await db.collection("users").doc(userId).set(
    { [field]: identityId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return identityId;
}

async function createPaymentInstrumentFromToken(
  tokenId: string,
  buyerIdentityId: string,
  env: FinixEnv = DEFAULT_ENV
): Promise<string> {
  const body = {
    token: tokenId,
    type: "TOKEN",
    identity: buyerIdentityId,
  };
  const pi = await finixPost("/payment_instruments", body, undefined, env);
  return pi.id;
}

// The Apple Pay token is encrypted to the Finix merchant whose Apple Pay
// certificate was used to create the apple_pay_session. That is our platform
// merchant's identity — cache it so we don't refetch on every charge.
const platformIdentityCache: Partial<Record<FinixEnv, string>> = {};
async function getPlatformMerchantIdentity(env: FinixEnv = DEFAULT_ENV): Promise<string> {
  if (platformIdentityCache[env]) return platformIdentityCache[env]!;
  const cfg = getFinixConfig(env);
  const merchant = await finixGet(`/merchants/${cfg.platformMerchantId}`, env);
  if (!merchant?.identity) {
    throw new Error("Could not resolve platform merchant identity for Apple Pay");
  }
  platformIdentityCache[env] = merchant.identity as string;
  return platformIdentityCache[env]!;
}

// Create a payment_instrument from an Apple Pay token. The frontend passes the
// stringified `{ token: <ApplePayPaymentToken> }` plus the billing contact.
// Apple Pay tokens are single-use, so these PIs are never saved for reuse.
async function createPaymentInstrumentFromApplePay(opts: {
  thirdPartyToken: string;
  buyerIdentityId: string;
  name?: string | null;
  address?: any | null;
  env?: FinixEnv;
}): Promise<string> {
  const env = opts.env || DEFAULT_ENV;
  const merchantIdentity = await getPlatformMerchantIdentity(env);
  const body: any = {
    third_party_token: opts.thirdPartyToken,
    type: "APPLE_PAY",
    identity: opts.buyerIdentityId,
    merchant_identity: merchantIdentity,
  };
  if (opts.name) body.name = opts.name;
  if (opts.address) body.address = opts.address;
  const pi = await finixPost("/payment_instruments", body, undefined, env);
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

async function fetchPaymentInstrumentDetails(piId: string, env: FinixEnv = DEFAULT_ENV): Promise<PaymentInstrumentDetails> {
  const pi = await finixGet(`/payment_instruments/${piId}`, env);
  // Finix returns `last_four` for CARDS but not for BANK_ACCOUNTs — those carry
  // a `masked_account_number` like "XXXXXX3123". Fall back to its trailing 4
  // digits so payout bank accounts get a last4 too.
  const maskedLast4 = pi.masked_account_number
    ? String(pi.masked_account_number).replace(/\D/g, "").slice(-4) || null
    : null;
  return {
    brand: pi.brand ? String(pi.brand).toLowerCase() : null,
    last4: pi.last_four ?? maskedLast4,
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
  applePay?: { thirdPartyToken: string; name?: string | null; address?: any | null };
  env?: FinixEnv;
}): Promise<{ paymentInstrumentId: string; usedSaved: boolean }> {
  const env = opts.env || DEFAULT_ENV;
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
  if (opts.applePay?.thirdPartyToken) {
    const piId = await createPaymentInstrumentFromApplePay({
      thirdPartyToken: opts.applePay.thirdPartyToken,
      buyerIdentityId: opts.buyerIdentityId,
      name: opts.applePay.name,
      address: opts.applePay.address,
      env,
    });
    return { paymentInstrumentId: piId, usedSaved: false };
  }
  if (!opts.tokenId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Either tokenId, savedPaymentInstrumentId, or an Apple Pay token is required"
    );
  }
  const piId = await createPaymentInstrumentFromToken(opts.tokenId, opts.buyerIdentityId, env);
  return { paymentInstrumentId: piId, usedSaved: false };
}

// Map Apple's billingContact (from onpaymentauthorized) to a Finix address.
function applePayAddressFromContact(contact: any): any | null {
  if (!contact) return null;
  const lines = contact.addressLines || [];
  const addr: any = {
    line1: lines[0] || undefined,
    line2: lines[1] || undefined,
    city: contact.locality || undefined,
    region: contact.administrativeArea || undefined,
    postal_code: contact.postalCode || undefined,
    country: contact.countryCode ? String(contact.countryCode).toUpperCase() : undefined,
  };
  // Drop undefined keys so we don't send a half-empty object.
  Object.keys(addr).forEach((k) => addr[k] === undefined && delete addr[k]);
  return Object.keys(addr).length ? addr : null;
}

function applePayNameFromContact(contact: any): string | null {
  if (!contact) return null;
  const name = [contact.givenName, contact.familyName].filter(Boolean).join(" ").trim();
  return name || null;
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
      // Staff debug toggle → sandbox; everyone else → deployment default. The
      // tokenization form must load the SAME env the charge will run against.
      const finixEnv = resolveFinixEnv(request, request.data?.debug);
      const cfg = getFinixConfig(finixEnv);
      return {
        applicationId: cfg.applicationId,
        environment: cfg.environment,
        // Platform merchant id, used client-side to seed Finix.Auth() for the
        // fraud session id passed back on the transfer.
        merchantId: cfg.platformMerchantId,
      };
    } catch (error: any) {
      console.error("Error getting Finix context:", error);
      throw new functions.https.HttpsError("internal", `Failed to get tokenization context: ${error.message}`);
    }
  }
);

// ============================================================================
// APPLE PAY — MERCHANT SESSION VALIDATION
// Called by the hosted tokenization form (rally-sphere.web.app) from inside the
// ApplePaySession `onvalidatemerchant` callback. The form can't hold Finix
// credentials, so it posts Apple's validation_url here and we proxy it to
// Finix's /apple_pay_sessions endpoint, returning the merchant session for
// session.completeMerchantValidation().
// ============================================================================

const APPLE_PAY_DOMAIN = "rally-sphere.web.app";
const APPLE_PAY_ALLOWED_ORIGINS = [`https://${APPLE_PAY_DOMAIN}`, "https://rally-sphere.firebaseapp.com"];

export const createApplePaySession = functions.https.onRequest({ secrets: FINIX_SECRETS }, async (req, res) => {
  const origin = req.headers.origin || "";
  if (APPLE_PAY_ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const validationUrl = req.body?.validation_url || req.body?.validationURL;
    const displayName = req.body?.display_name || "RallySphere";

    if (!validationUrl || typeof validationUrl !== "string") {
      res.status(400).json({ error: "validation_url is required" });
      return;
    }
    // Only allow Apple's own domains as the validation target (anti-SSRF).
    let host = "";
    try { host = new URL(validationUrl).hostname; } catch { /* invalid url */ }
    if (!/(^|\.)apple\.com$/.test(host)) {
      res.status(400).json({ error: "validation_url must be an apple.com domain" });
      return;
    }

    const merchantIdentity = await getPlatformMerchantIdentity();
    const session = await finixPost("/apple_pay_sessions", {
      validation_url: validationUrl,
      merchant_identity: merchantIdentity,
      domain: APPLE_PAY_DOMAIN,
      display_name: displayName,
    });

    // Finix returns session_details as a JSON string — parse it so the browser
    // can hand the object straight to completeMerchantValidation().
    let merchantSession: any = session?.session_details;
    if (typeof merchantSession === "string") {
      try { merchantSession = JSON.parse(merchantSession); } catch { /* leave as-is */ }
    }
    res.status(200).json({ merchantSession });
  } catch (error: any) {
    console.error("Apple Pay session validation failed:", error?.message || error);
    res.status(500).json({ error: error?.message || "Apple Pay session validation failed" });
  }
});

// ============================================================================
// CREATE EVENT TICKET TRANSACTION
// ============================================================================

export const createEventTransaction = functions.https.onCall(
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      tokenId,
      thirdPartyToken,
      billingContact,
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
      debug,
    } = data;

    // Staff-only sandbox override (driven by the in-app Debug toggle). Enforced
    // server-side: non-staff always run live regardless of what they send.
    const finixEnv = resolveFinixEnv(request, debug);

    if ((!tokenId && !savedPaymentInstrumentId && !thirdPartyToken) || !eventId || ticketPrice == null) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: (tokenId, savedPaymentInstrumentId, or Apple Pay token), eventId, ticketPrice"
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
      // In sandbox (staff debug) charges route to the platform sandbox merchant,
      // so a club without a live merchant is still testable. Live requires it.
      const merchantId = finixEnv === "sandbox"
        ? getFinixConfig("sandbox").platformMerchantId
        : club?.finixMerchantId;
      if (finixEnv === "live" && !club?.finixMerchantId) {
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
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user, finixEnv);
      const { paymentInstrumentId, usedSaved } = await resolvePaymentInstrument({
        db, userId, buyerIdentityId, savedPaymentInstrumentId, tokenId, env: finixEnv,
        applePay: thirdPartyToken ? {
          thirdPartyToken,
          name: applePayNameFromContact(billingContact),
          address: applePayAddressFromContact(billingContact),
        } : undefined,
      });

      // Create Finix transfer (charge)
      const transferBody: any = {
        merchant: merchantId,
        source: paymentInstrumentId,
        amount: toCents(totalAmount),
        fee: toCents(processingFee),
        currency,
        // fraud_session_id is a top-level field Finix uses for fraud screening;
        // it must not be nested inside tags or it's treated as plain metadata.
        ...(fraudSessionId && { fraud_session_id: fraudSessionId }),
        tags: {
          event_id: eventId,
          user_id: userId,
          club_id: eventData!.clubId,
        },
      };

      const transfer = await finixPost("/transfers", transferBody, idempotencyKey, finixEnv);

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        const msg = transfer.failure_message || transfer.failure_code || "Payment declined";
        throw new functions.https.HttpsError("internal", msg);
      }

      const transactionId = transfer.id;
      console.log(`Finix transfer created: ${transactionId} state=${transfer.state}`);

      // Persist the freshly tokenized PI as a saved card if user opted in.
      // Skipped when reusing an existing saved PI (it's already saved).
      // Never persist a sandbox PI as a reusable card — it would 404 in live.
      if (savePaymentMethod && !usedSaved && finixEnv === "live") {
        try {
          const details = await fetchPaymentInstrumentDetails(paymentInstrumentId, finixEnv);
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
        finixEnv,
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
        finixEnv,
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    const data = request.data;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      tokenId,
      thirdPartyToken,
      billingContact,
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
      debug,
    } = data;

    // Staff-only sandbox override (in-app Debug toggle), enforced server-side.
    const finixEnv = resolveFinixEnv(request, debug);

    if ((!tokenId && !savedPaymentInstrumentId && !thirdPartyToken) || !itemId || !quantity || !deliveryMethod) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: (tokenId, savedPaymentInstrumentId, or Apple Pay token), itemId, quantity, deliveryMethod"
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
      // Sandbox (staff debug) charges route to the platform sandbox merchant.
      const merchantId = finixEnv === "sandbox"
        ? getFinixConfig("sandbox").platformMerchantId
        : club?.finixMerchantId;
      if (finixEnv === "live" && !club?.finixMerchantId) {
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
      const buyerIdentityId = await ensureBuyerIdentity(db, userId, user, finixEnv);
      const { paymentInstrumentId, usedSaved } = await resolvePaymentInstrument({
        db, userId, buyerIdentityId, savedPaymentInstrumentId, tokenId, env: finixEnv,
        applePay: thirdPartyToken ? {
          thirdPartyToken,
          name: applePayNameFromContact(billingContact),
          address: applePayAddressFromContact(billingContact),
        } : undefined,
      });

      const transferBody: any = {
        merchant: merchantId,
        source: paymentInstrumentId,
        amount: toCents(totalAmount),
        fee: toCents(processingFee),
        currency: "USD",
        // fraud_session_id is a top-level field Finix uses for fraud screening;
        // it must not be nested inside tags or it's treated as plain metadata.
        ...(fraudSessionId && { fraud_session_id: fraudSessionId }),
        tags: {
          item_id: itemId,
          user_id: userId,
          club_id: item.clubId,
        },
      };

      const transfer = await finixPost("/transfers", transferBody, idempotencyKey, finixEnv);

      if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
        const msg = transfer.failure_message || transfer.failure_code || "Payment declined";
        throw new functions.https.HttpsError("internal", msg);
      }

      const transactionId = transfer.id;
      console.log(`Finix store transfer created: ${transactionId} state=${transfer.state}`);

      // Never persist a sandbox PI as a reusable card — it would 404 in live.
      if (savePaymentMethod && !usedSaved && finixEnv === "live") {
        try {
          const details = await fetchPaymentInstrumentDetails(paymentInstrumentId, finixEnv);
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
        finixEnv,
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
// CUSTOM (DIRECT-API) MERCHANT ONBOARDING
// Replaces Finix hosted onboarding_forms. The app collects KYC in-app and we
// drive Finix's API directly:
//   1. createClubIdentity     POST /identities            (business + control person + owners)
//   2. addClubBankAccount     POST /payment_instruments   (payout bank, tokenized)
//   3. provisionClubMerchant  POST /identities/{id}/merchants  (start underwriting)
// Result (APPROVED / PROVISIONING / UPDATE_REQUESTED / REJECTED) arrives via the
// finixWebhook below. The merchant id + active flags are written there and by
// getSubMerchantStatus polling.
//
// SECURITY: SSN/EIN/bank numbers are forwarded straight to Finix and are NEVER
// persisted to Firestore. We only store non-sensitive draft fields (business
// name/address) for resume, plus last4 of the payout bank for display.
//
// NOTE: Finix tunes the exact required-vs-optional field set per application /
// processor / risk profile. The mapping below covers the documented fields; if
// Finix returns a `[field] is required` error, surface it to the form and add
// the field here. Validate end-to-end against sandbox (DUMMY_V1) first.
// ============================================================================

// Finix dates are objects: { day, month, year }. Accepts "YYYY-MM-DD" or an
// already-split object; returns undefined when nothing usable was provided.
const toFinixDate = (v: any): { day: number; month: number; year: number } | undefined => {
  if (!v) return undefined;
  if (typeof v === "object" && v.year) {
    return { day: Number(v.day), month: Number(v.month), year: Number(v.year) };
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

// Map our client address shape to Finix's snake_case address.
const toFinixAddress = (a: any) => {
  if (!a) return undefined;
  const out: any = {
    line1: a.line1,
    line2: a.line2 || undefined,
    city: a.city,
    region: a.region, // 2-letter state
    postal_code: a.postalCode,
    country: a.country || "USA",
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
};

// Build a Finix person-entity (used for the control person on the primary
// identity and for each beneficial-owner associated identity).
const toFinixPersonFields = (p: any) => {
  const out: any = {
    first_name: p.firstName,
    last_name: p.lastName,
    title: p.title,
    principal_percentage_ownership:
      p.principalPercentageOwnership != null ? Number(p.principalPercentageOwnership) : undefined,
    tax_id: p.taxId, // SSN — forwarded, never stored
    dob: toFinixDate(p.dob),
    phone: p.phone,
    email: p.email,
    personal_address: toFinixAddress(p.address),
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
};

// Compose the full Identity `entity` (business KYC + control person) for the
// club's merchant identity.
const toFinixIdentityEntity = (business: any, controlPerson: any) => {
  const out: any = {
    // Business
    business_name: business.businessName,
    doing_business_as: business.doingBusinessAs || business.businessName,
    business_type: business.businessType, // enum, e.g. LLC / INDIVIDUAL_SOLE_PROPRIETORSHIP / CORPORATION
    business_tax_id: business.taxId, // EIN — forwarded, never stored
    business_phone: business.phone,
    business_address: toFinixAddress(business.address),
    incorporation_date: toFinixDate(business.incorporationDate),
    ownership_type: business.ownershipType, // PRIVATE / PUBLIC
    mcc: business.mcc,
    default_statement_descriptor: business.defaultStatementDescriptor || business.businessName,
    max_transaction_amount:
      business.maxTransactionAmount != null ? Number(business.maxTransactionAmount) : undefined,
    annual_card_volume:
      business.annualCardVolume != null ? Number(business.annualCardVolume) : undefined,
    url: business.url,
    email: business.email,
    phone: business.phone,
    // Control person
    ...toFinixPersonFields(controlPerson || {}),
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
};

// Map our underwriting payload + consent metadata to Finix's
// additional_underwriting_data block.
const toFinixUnderwriting = (u: any, consent: any) => {
  if (!u && !consent) return undefined;
  u = u || {};
  const nowIso = new Date().toISOString();
  const out: any = {
    annual_ach_volume: u.annualAchVolume != null ? Number(u.annualAchVolume) : undefined,
    average_ach_transfer_amount:
      u.averageAchTransferAmount != null ? Number(u.averageAchTransferAmount) : undefined,
    average_card_transfer_amount:
      u.averageCardTransferAmount != null ? Number(u.averageCardTransferAmount) : undefined,
    business_description: u.businessDescription,
    refund_policy: u.refundPolicy, // e.g. NO_REFUNDS / MERCHANDISE_EXCHANGE_ONLY / WITHIN_THIRTY_DAYS
    card_volume_distribution: u.cardVolumeDistribution
      ? {
          ecommerce_percentage: Number(u.cardVolumeDistribution.ecommercePercentage ?? 0),
          card_present_percentage: Number(u.cardVolumeDistribution.cardPresentPercentage ?? 0),
          mail_order_telephone_order_percentage: Number(
            u.cardVolumeDistribution.mailOrderTelephoneOrderPercentage ?? 0
          ),
        }
      : undefined,
    volume_distribution_by_business_type: u.volumeDistributionByBusinessType,
    // Consent records — Finix wants these with IP / timestamp / user-agent.
    merchant_agreement_accepted: consent?.merchantAgreementAccepted ?? true,
    merchant_agreement_ip_address: consent?.ip,
    merchant_agreement_timestamp: consent?.timestamp || nowIso,
    merchant_agreement_user_agent: consent?.userAgent,
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
};

// Persist only the NON-sensitive parts of the form so the wizard can resume
// without re-entering everything. Never includes tax_id / SSN / bank numbers.
const buildClubOnboardingDraft = (business: any, controlPerson: any, underwriting: any) => {
  const scrub = (p: any) =>
    p
      ? {
          firstName: p.firstName,
          lastName: p.lastName,
          title: p.title,
          principalPercentageOwnership: p.principalPercentageOwnership,
          phone: p.phone,
          email: p.email,
          address: p.address,
          // dob/taxId intentionally omitted
        }
      : undefined;
  return {
    business: business
      ? {
          businessName: business.businessName,
          doingBusinessAs: business.doingBusinessAs,
          businessType: business.businessType,
          phone: business.phone,
          email: business.email,
          url: business.url,
          mcc: business.mcc,
          ownershipType: business.ownershipType,
          defaultStatementDescriptor: business.defaultStatementDescriptor,
          maxTransactionAmount: business.maxTransactionAmount,
          annualCardVolume: business.annualCardVolume,
          incorporationDate: business.incorporationDate,
          address: business.address,
          // taxId (EIN) intentionally omitted
        }
      : undefined,
    controlPerson: scrub(controlPerson),
    underwriting,
  };
};

// ---------------------------------------------------------------------------
// 1) Create / update the club's Finix merchant identity (+ beneficial owners)
// ---------------------------------------------------------------------------
export const createClubIdentity = functions.https.onCall(
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    const auth = request.auth;
    if (!auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");

    const { clubId, business, controlPerson, owners, underwriting, consent } = request.data || {};
    if (!clubId || !business?.businessName || !controlPerson?.firstName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: clubId, business.businessName, controlPerson.firstName"
      );
    }

    const db = admin.firestore();
    const clubRef = db.collection("clubs").doc(clubId);
    const clubSnap = await clubRef.get();
    if (!clubSnap.exists) throw new functions.https.HttpsError("not-found", "Club not found");
    const club = clubSnap.data() || {};

    // Authorization: only a club admin/owner may onboard payouts.
    const isAdmin =
      (club.clubAdmins || club.admins || []).includes(auth.uid) ||
      club.clubOwner === auth.uid ||
      club.owner === auth.uid;
    if (!isAdmin) throw new functions.https.HttpsError("permission-denied", "Only club admins can set up payouts");

    try {
      const entity = toFinixIdentityEntity(business, controlPerson);
      const additional = toFinixUnderwriting(underwriting, consent);
      const body: any = { entity, tags: { club_id: clubId } };
      if (additional) body.additional_underwriting_data = additional;

      // Reuse the existing identity (PATCH) on resume / correction; otherwise create.
      let identityId: string = club.finixIdentityId;
      if (identityId) {
        await finixPatch(`/identities/${identityId}`, body);
      } else {
        const identity = await finixPost("/identities", body);
        identityId = identity.id;
        // Persist the id RIGHT AWAY. If anything below fails (owners, draft
        // write), a retry then PATCHes this same identity instead of minting a
        // new orphan in Finix.
        await clubRef.update({
          finixIdentityId: identityId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Beneficial owners (>25%) become associated identities under the merchant
      // identity. We replace-on-resume only when none recorded yet to avoid dupes.
      const ownerIds: string[] = Array.isArray(club.finixOwnerIdentityIds)
        ? [...club.finixOwnerIdentityIds]
        : [];
      if (Array.isArray(owners) && owners.length && ownerIds.length === 0) {
        for (const o of owners) {
          if (!o?.firstName) continue;
          const assoc = await finixPost(`/identities/${identityId}/associated_identities`, {
            entity: toFinixPersonFields(o),
            tags: { club_id: clubId },
          });
          if (assoc?.id) ownerIds.push(assoc.id);
        }
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      await clubRef.update({
        finixIdentityId: identityId,
        finixOwnerIdentityIds: ownerIds,
        finixOnboardingStatus: "PENDING",
        finixOnboardingStartedAt: club.finixOnboardingStartedAt || now,
        finixOnboardingDraft: buildClubOnboardingDraft(business, controlPerson, underwriting),
        finixTosAcceptedAt: club.finixTosAcceptedAt || now,
        finixFeesAcceptedAt: club.finixFeesAcceptedAt || now,
        finixAcceptedByUid: club.finixAcceptedByUid || auth.uid,
        updatedAt: now,
      });

      return { identityId, ownerIdentityIds: ownerIds };
    } catch (error: any) {
      console.error("createClubIdentity error:", error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to create identity");
    }
  }
);

// ---------------------------------------------------------------------------
// 2) Attach the payout bank account (tokenized via the Finix BankTokenForm).
//    A bank account MUST exist on the identity before a merchant can be
//    provisioned/verified.
// ---------------------------------------------------------------------------
export const addClubBankAccount = functions.https.onCall(
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    const auth = request.auth;
    if (!auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");

    const { clubId, tokenId, ssnLast4 } = request.data || {};
    if (!clubId || !tokenId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: clubId, tokenId");
    }
    // Last 4 of the account owner's SSN — collected on the bank step to verify
    // the account. Required; kept in-memory only, never written to Firestore.
    const ssnLast4Clean = typeof ssnLast4 === "string" ? ssnLast4.replace(/\D/g, "") : "";
    if (ssnLast4Clean.length !== 4) {
      throw new functions.https.HttpsError("invalid-argument", "ssnLast4 must be 4 digits");
    }

    const db = admin.firestore();
    const clubRef = db.collection("clubs").doc(clubId);
    const clubSnap = await clubRef.get();
    if (!clubSnap.exists) throw new functions.https.HttpsError("not-found", "Club not found");
    const club = clubSnap.data() || {};

    const isAdmin =
      (club.clubAdmins || club.admins || []).includes(auth.uid) ||
      club.clubOwner === auth.uid ||
      club.owner === auth.uid;
    if (!isAdmin) throw new functions.https.HttpsError("permission-denied", "Only club admins can set up payouts");
    if (!club.finixIdentityId) {
      throw new functions.https.HttpsError("failed-precondition", "Create the club identity before adding a bank account");
    }

    try {
      // Tokenized bank → payment_instrument on the club's identity.
      const piId = await createPaymentInstrumentFromToken(tokenId, club.finixIdentityId);
      const details = await fetchPaymentInstrumentDetails(piId).catch(() => ({ last4: null } as any));

      await clubRef.update({
        finixPayoutPiId: piId,
        finixPayoutBankLast4: details.last4 || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { paymentInstrumentId: piId, last4: details.last4 || null };
    } catch (error: any) {
      console.error("addClubBankAccount error:", error?.message || error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to add bank account");
    }
  }
);

// ---------------------------------------------------------------------------
// 3) Provision the merchant — submits the identity to underwriting. Returns the
//    onboarding_state; the terminal result comes back via the webhook.
// ---------------------------------------------------------------------------
export const provisionClubMerchant = functions.https.onCall(
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    const auth = request.auth;
    if (!auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");

    const { clubId } = request.data || {};
    if (!clubId) throw new functions.https.HttpsError("invalid-argument", "Missing required field: clubId");

    const db = admin.firestore();
    const clubRef = db.collection("clubs").doc(clubId);
    const clubSnap = await clubRef.get();
    if (!clubSnap.exists) throw new functions.https.HttpsError("not-found", "Club not found");
    const club = clubSnap.data() || {};

    const isAdmin =
      (club.clubAdmins || club.admins || []).includes(auth.uid) ||
      club.clubOwner === auth.uid ||
      club.owner === auth.uid;
    if (!isAdmin) throw new functions.https.HttpsError("permission-denied", "Only club admins can set up payouts");
    if (!club.finixIdentityId) {
      throw new functions.https.HttpsError("failed-precondition", "Create the club identity first");
    }
    if (!club.finixPayoutPiId) {
      throw new functions.https.HttpsError("failed-precondition", "Add a payout bank account first");
    }

    // Already provisioned — don't create a duplicate merchant (the bug we're fixing).
    if (club.finixMerchantId) {
      return { merchantId: club.finixMerchantId, onboardingState: club.finixOnboardingState || "PROVISIONING" };
    }

    try {
      const processor = isTestMode ? "DUMMY_V1" : "FINIX_V1";
      const merchant = await finixPost(`/identities/${club.finixIdentityId}/merchants`, {
        processor,
        tags: { club_id: clubId },
      });

      const onboardingState: string = merchant.onboarding_state || "PROVISIONING";
      const approved = onboardingState === "APPROVED";
      const active = merchant.processing_enabled === true && merchant.settlement_enabled === true;

      await clubRef.update({
        finixMerchantId: merchant.id,
        finixOnboardingState: onboardingState,
        finixOnboardingStatus: approved ? "APPROVED" : onboardingState === "REJECTED" ? "DECLINED" : "PENDING",
        finixOnboardingComplete: approved,
        finixMerchantAccountActive: active,
        finixOnboardingDeclined: onboardingState === "REJECTED",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        merchantId: merchant.id,
        onboardingState,
        processingEnabled: merchant.processing_enabled === true,
        settlementEnabled: merchant.settlement_enabled === true,
      };
    } catch (error: any) {
      console.error("provisionClubMerchant error:", error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to provision merchant");
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

export const finixWebhook = functions.https.onRequest({ secrets: FINIX_SECRETS }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const cfg = getFinixConfig();
    const sigHeader = (req.headers["finix-signature"] || req.headers["Finix-Signature"]) as string | undefined;
    const rawBody = (req as any).rawBody ? (req as any).rawBody.toString("utf8") : JSON.stringify(req.body);

    const constantTimeEq = (a: string, b: string): boolean => {
      const ab = Buffer.from(a, "utf8");
      const bb = Buffer.from(b, "utf8");
      return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
    };

    // Primary auth: HTTP Basic (the auth type the Finix dashboard webhook form
    // configures — Finix sends our chosen creds in the Authorization header).
    if (cfg.webhookBasicUser || cfg.webhookBasicPass) {
      const authz = String(req.headers["authorization"] || "");
      const expected = "Basic " + Buffer.from(`${cfg.webhookBasicUser}:${cfg.webhookBasicPass}`).toString("base64");
      if (!constantTimeEq(authz, expected)) {
        console.error("Invalid Finix webhook Basic auth");
        res.status(401).send("Unauthorized");
        return;
      }
    } else if (cfg.webhookSecret) {
      if (!sigHeader) {
        res.status(400).send("Missing signature");
        return;
      }
      // Finix-Signature: "timestamp=<epoch-seconds>, sig=<lowercase hex>"
      // The HMAC-SHA256 is computed over "<timestamp>:<raw_body>" using the
      // webhook's secret_signing_key (as a UTF-8 string, not hex-decoded).
      const parts: Record<string, string> = {};
      for (const kv of sigHeader.split(",")) {
        const i = kv.indexOf("=");
        if (i > 0) parts[kv.slice(0, i).trim().toLowerCase()] = kv.slice(i + 1).trim();
      }
      const timestamp = parts["timestamp"];
      const provided = (parts["sig"] || "").toLowerCase();
      if (!timestamp || !provided) {
        res.status(400).send("Malformed signature");
        return;
      }
      // Replay protection: reject signatures older than 5 minutes.
      const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
      if (!Number.isFinite(ageSec) || ageSec > 300) {
        console.error("Stale Finix webhook signature");
        res.status(400).send("Stale signature");
        return;
      }
      const expected = crypto
        .createHmac("sha256", cfg.webhookSecret)
        .update(`${timestamp}:${rawBody}`)
        .digest("hex");
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(provided, "utf8");
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
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
      // Any merchant lifecycle event: created / provisioned / updated / enabled /
      // underwritten. Hosted-form onboarding fired underwriting-only events, but
      // direct-API onboarding (and provisioning completion) come through as
      // merchant.created/updated, so we handle the whole merchant entity here.
      case /^merchants?\./.test(eventType):
      case /^underwriting\.merchant/.test(eventType):
      case /^merchant\.underwriting/.test(eventType): {
        const merchant = event._embedded?.merchants?.[0] || event.entity || event.data;
        if (merchant?.id) {
          const onboardingState: string = merchant.onboarding_state || "";
          // "Active" = the merchant can actually process AND settle. This is the
          // only signal that should flip the club to fully active.
          const active = merchant.processing_enabled === true && merchant.settlement_enabled === true;
          const approved = active || onboardingState === "APPROVED" || /approved/i.test(rawAction);
          const declined =
            onboardingState === "REJECTED" || /declined|rejected/i.test(rawAction);
          const status = approved ? "APPROVED" : declined ? "DECLINED" : "PENDING";

          // Match the club back: prefer the identity link, fall back to the
          // tags.club_id we stamp on every identity/merchant (covers cases where
          // the provisioned merchant's identity differs from the shell identity).
          const clubIdTag = merchant.tags?.club_id;
          let clubDocs = await db
            .collection("clubs")
            .where("finixIdentityId", "==", merchant.identity)
            .limit(1)
            .get();
          if (clubDocs.empty && clubIdTag) {
            const byTag = await db.collection("clubs").doc(clubIdTag).get();
            clubDocs = { empty: !byTag.exists, docs: byTag.exists ? [byTag] : [] } as any;
          }
          if (clubDocs.empty) {
            console.warn(`Finix merchant ${merchant.id} (identity=${merchant.identity}) matched no club`);
          }
          for (const doc of clubDocs.docs) {
            await doc.ref.update({
              finixMerchantId: merchant.id,
              finixOnboardingState: onboardingState || (doc.data()?.finixOnboardingState ?? null),
              finixOnboardingComplete: approved,
              finixMerchantAccountActive: active,
              finixOnboardingDeclined: declined,
              finixOnboardingStatus: status,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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

async function reverseTransfer(transferId: string, idempotencyKey?: string, amountCents?: number, env?: FinixEnv) {
  const body: any = {};
  if (amountCents != null) body.refund_amount = amountCents;
  // A refund must run against the same environment the original charge used.
  return finixPost(`/transfers/${transferId}/reversals`, body, idempotencyKey, env);
}

export const leaveEventWithRefund = functions.https.onCall(
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
            const reversal = await reverseTransfer(transactionId, `refund-${transactionId}`, undefined, orderData.finixEnv);
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
                // serverTimestamp() sentinel is rejected inside array elements.
                createdAt: admin.firestore.Timestamp.now(),
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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

      const reversal = await reverseTransfer(transactionId, `refund-${transactionId}`, undefined, order?.finixEnv);
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
  { enforceAppCheck: false, timeoutSeconds: 540, memory: "512MiB", secrets: FINIX_SECRETS },
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
          const reversal = await reverseTransfer(transactionId, `refund-${transactionId}`, undefined, order.finixEnv);
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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

      const reversal = await reverseTransfer(transactionId, `refund-${transactionId}`, undefined, order?.finixEnv);
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
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
