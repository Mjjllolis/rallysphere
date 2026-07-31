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

// Finix documents PUT (not PATCH) for updating an Identity, and its update
// model binds ONLY `entity` + `tags`. Kept separate from finixPatch so the
// subscription-enrollment calls below keep their verb.
async function finixPut<T = any>(path: string, body: any): Promise<T> {
  const client = getFinixClient();
  const res = await client.put(path, body);
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
    // DEPRECATED (2026-06-30): hosted onboarding was replaced by the in-app
    // direct-API wizard (createClubIdentity → addClubBankAccount →
    // provisionClubMerchant). This handler used to mint a Finix identity SHELL
    // (business_name/dba/email only) plus a hosted onboarding_form — but such
    // shells come back with identity_role UNKNOWN and can never be provisioned,
    // which silently strands the club (see the RallySphere JsBOR… incident).
    //
    // It now hard-fails instead of creating anything, so a stale/old app build
    // that still calls this endpoint can't stamp another dead shell onto a club.
    // Kept reachable (not deleted) so old clients get a clear "update the app"
    // message rather than an opaque not-found error.
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    console.warn(
      `createSubMerchantAccount is deprecated but was called by uid=${request.auth.uid} ` +
        `for club=${request.data?.clubId} — almost certainly a stale app build.`
    );
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Payout setup has moved. Please update RallySphere to the latest version, then set up payouts from Manage Payouts."
    );
  }
);

// ============================================================================
// PUSH NOTIFICATIONS (Expo)
// Expo's push service is a plain HTTP POST — no SDK needed. Tokens are written
// to users/{uid}.expoPushTokens[] by the client on launch.
// ============================================================================

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const sendExpoPush = async (
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> => {
  const valid = [...new Set(tokens)].filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"));
  if (!valid.length) return;
  // Expo caps a request at 100 messages.
  for (let i = 0; i < valid.length; i += 100) {
    const messages = valid.slice(i, i + 100).map((to) => ({ to, title, body, data, sound: "default" }));
    try {
      await axios.post(EXPO_PUSH_URL, messages, {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 10000,
      });
    } catch (e: any) {
      // Never let a failed push break the webhook that triggered it.
      console.warn("sendExpoPush failed:", e?.message || e);
    }
  }
};

const clubAdminUids = (club: any): string[] => {
  const ids = [...(club?.clubAdmins || club?.admins || []), club?.clubOwner, club?.owner];
  return [...new Set(ids.filter((v: any) => typeof v === "string" && v))];
};

const pushTokensForUids = async (
  db: admin.firestore.Firestore,
  uids: string[]
): Promise<string[]> => {
  if (!uids.length) return [];
  const snaps = await db.getAll(...uids.map((u) => db.collection("users").doc(u)));
  return snaps.flatMap((s) => {
    const d = s.data() || {};
    const list = Array.isArray(d.expoPushTokens) ? d.expoPushTokens : d.expoPushToken ? [d.expoPushToken] : [];
    return list.filter((t: any) => typeof t === "string");
  });
};

// Tell the club's admins when their payout application moves. Without this the
// only way to learn Finix wants something is to open the app and tap "Check
// status" — which nobody does, so applications sit dead for weeks.
const notifyClubAdminsOfPayoutStatus = async (
  db: admin.firestore.Firestore,
  clubDoc: FirebaseFirestore.DocumentSnapshot,
  info: { status: string; onboardingState?: string | null; action?: { items: FinixActionItem[] } | null }
): Promise<void> => {
  try {
    const club = clubDoc.data() || {};
    // Only fire on a genuine transition — merchant webhooks repeat constantly.
    const stateKey = `${info.status}:${info.onboardingState || ""}`;
    if (club.finixLastNotifiedState === stateKey) return;

    let title: string | null = null;
    let body = "";
    if (info.onboardingState === "UPDATE_REQUESTED") {
      const items = info.action?.items || [];
      title = "Finix needs a bit more information";
      body = items.length
        ? `To finish setting up payouts: ${items.map((i) => i.label).join("; ")}.`
        : "Open RallySphere to see what's needed to finish setting up payouts.";
    } else if (info.status === "APPROVED") {
      title = "Payouts are live";
      body = `${club.name || "Your club"} can now receive payments.`;
    } else if (info.status === "DECLINED") {
      title = "Payout application declined";
      body = "Finix couldn't approve your payout account. Open RallySphere for details.";
    }
    if (!title) return;

    const tokens = await pushTokensForUids(db, clubAdminUids(club));
    await sendExpoPush(tokens, title, body, { type: "payout_status", clubId: clubDoc.id });
    await clubDoc.ref.update({ finixLastNotifiedState: stateKey });
  } catch (e: any) {
    console.warn("notifyClubAdminsOfPayoutStatus failed:", e?.message || e);
  }
};

// ============================================================================
// "FINIX NEEDS SOMETHING" — turning UPDATE_REQUESTED into a to-do list
//
// When underwriting stalls, Finix puts the merchant in UPDATE_REQUESTED and
// records WHY on the merchant's Verification: `outcomes[]`, each with an
// `outcome_code` and `remediation_details` saying whether a file must be
// uploaded or a field corrected. Finix does not tell the seller any of this —
// so unless we read it and show it, both we and the club are staring at the
// word "UPDATE_REQUESTED" with no idea what it wants.
// ============================================================================

// Plain-English labels for the outcome codes we expect to see. Anything not
// listed falls back to a de-snaked version of the code, so a new code from
// Finix degrades to readable rather than blank.
const FINIX_OUTCOME_LABELS: Record<string, string> = {
  BANK_STATEMENT_ONE_MONTH_REQUESTED: "A bank statement from the last month",
  BANK_STATEMENT_THREE_MONTH_REQUESTED: "Bank statements from the last three months",
  VOIDED_CHECK_REQUESTED: "A voided check for your payout account",
  INVALID_BANK_ACCOUNT: "Correct payout bank account details",
  INVALID_BUSINESS_TAX_ID: "A corrected business tax ID (EIN)",
  INVALID_TAX_ID: "A corrected Social Security number",
  BUSINESS_LICENSE_REQUESTED: "A copy of your business license",
  ARTICLES_OF_INCORPORATION_REQUESTED: "Your articles of incorporation",
  GOVERNMENT_ID_REQUESTED: "A photo of the owner's government-issued ID",
  PROOF_OF_ADDRESS_REQUESTED: "Proof of your business address",
  PROCESSING_STATEMENT_REQUESTED: "A recent card-processing statement",
  WEBSITE_REQUESTED: "A working website or social page for the club",
  INVALID_WEBSITE: "A corrected website address",
  BUSINESS_DESCRIPTION_REQUESTED: "A fuller description of what your club sells",
};

const humanizeOutcomeCode = (code: string): string =>
  FINIX_OUTCOME_LABELS[code] ||
  code
    .replace(/_REQUESTED$/, "")
    .replace(/^INVALID_/, "Corrected ")
    .split("_")
    .join(" ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export interface FinixActionItem {
  code: string;
  label: string;
  action: "upload" | "correct" | "unknown";
  fileType?: string;
  fieldName?: string;
}

// Read the merchant's current verification and reduce it to a to-do list.
// Returns null when there's nothing outstanding (or we can't tell).
const fetchMerchantActionRequired = async (
  merchantId: string
): Promise<{ verificationId: string; summary: string | null; items: FinixActionItem[] } | null> => {
  try {
    const merchant: any = await finixGet(`/merchants/${merchantId}`);
    const verificationId: string | undefined = merchant?.verification;
    if (!verificationId) return null;

    const v: any = await finixGet(`/verifications/${verificationId}`);
    const outcomes: any[] = Array.isArray(v?.outcomes) ? v.outcomes : [];
    if (!outcomes.length) return null;

    const items: FinixActionItem[] = outcomes.map((o: any) => {
      const rd = o?.remediation_details || {};
      return {
        code: o?.outcome_code || "UNKNOWN",
        label: humanizeOutcomeCode(o?.outcome_code || "UNKNOWN"),
        action: rd.type === "FILE_UPLOAD" ? "upload" : rd.type === "FIELD_UPDATE" ? "correct" : "unknown",
        ...(rd.file_type ? { fileType: rd.file_type } : {}),
        ...(rd.field_name ? { fieldName: rd.field_name } : {}),
      };
    });

    return { verificationId, summary: v?.outcome_summary || null, items };
  } catch (e: any) {
    console.warn(`fetchMerchantActionRequired(${merchantId}) failed:`, e?.message || e);
    return null;
  }
};

// Write the to-do list onto the club (or clear it once Finix is satisfied).
// Returns what it wrote so callers can hand it straight back to the client.
const syncClubActionRequired = async (
  clubRef: FirebaseFirestore.DocumentReference,
  merchantId: string | null | undefined,
  onboardingState: string | null | undefined
) => {
  if (!merchantId) return null;
  const stalled = onboardingState === "UPDATE_REQUESTED";
  if (!stalled) {
    // Resolved (or never stalled) — don't leave a stale to-do list behind.
    await clubRef.update({ finixActionRequired: admin.firestore.FieldValue.delete() }).catch(() => {});
    return null;
  }
  const action = await fetchMerchantActionRequired(merchantId);
  if (!action) return null;
  await clubRef.update({
    finixActionRequired: { ...action, fetchedAt: admin.firestore.FieldValue.serverTimestamp() },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return action;
};

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
        // If Finix is waiting on the club, find out exactly what for.
        const actionRequired = clubId
          ? await syncClubActionRequired(
              db.collection("clubs").doc(clubId),
              merchant.id,
              merchant.onboarding_state
            )
          : merchant.onboarding_state === "UPDATE_REQUESTED"
          ? await fetchMerchantActionRequired(merchant.id)
          : null;
        return {
          status: merchant.onboarding_state || merchant.processing_enabled ? "APPROVED" : "PENDING",
          isComplete: merchant.processing_enabled === true && merchant.settlement_enabled === true,
          processingEnabled: merchant.processing_enabled === true,
          settlementEnabled: merchant.settlement_enabled === true,
          merchantId: merchant.id,
          identityId: merchant.identity,
          onboardingState: merchant.onboarding_state || null,
          actionRequired,
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
//
// EVERY field here is filled, by default if the client didn't supply one. An
// application that arrives with a blank underwriting block is what forces a
// human at Finix to go ask the merchant questions by hand — which, since Finix
// doesn't contact our sellers, lands on us. The defaults below describe what a
// RallySphere club actually is: card-not-present dues / tickets / merch, sold
// business-to-consumer through the app. Anything the wizard collects overrides.
const toFinixUnderwriting = (u: any, consent: any, ctx?: { businessName?: string; annualCardVolume?: number }) => {
  u = u || {};
  const nowIso = new Date().toISOString();

  // Fallback average ticket. Prefer what the club told us; otherwise assume a
  // mid-size club (~500 transactions/yr) against their stated annual volume,
  // floored at $25 so a blank/zero volume can't produce a nonsense 0.
  const derivedAvgCard =
    ctx?.annualCardVolume && ctx.annualCardVolume > 0
      ? Math.max(2500, Math.round(ctx.annualCardVolume / 500))
      : 5000;

  const name = ctx?.businessName || "This club";
  const defaultDescription =
    `${name} is a sports and recreation club that collects membership dues, event and ` +
    `tournament entry fees, and merchandise orders from its own members through the ` +
    `RallySphere mobile app. All payments are card-not-present and initiated by the member ` +
    `in-app; there is no in-person terminal, no phone or mail ordering, and no resale to ` +
    `third parties.`;

  const dist = u.cardVolumeDistribution;
  const bizDist = u.volumeDistributionByBusinessType;

  const out: any = {
    annual_ach_volume: Number(u.annualAchVolume ?? 0),
    average_ach_transfer_amount: Number(u.averageAchTransferAmount ?? derivedAvgCard),
    average_card_transfer_amount: Number(u.averageCardTransferAmount ?? derivedAvgCard),
    business_description: u.businessDescription || defaultDescription,
    // NO_REFUNDS / MERCHANDISE_EXCHANGE_ONLY / WITHIN_30_DAYS / OTHER
    refund_policy: u.refundPolicy || "WITHIN_30_DAYS",
    // 100% ecommerce: every charge originates in the app, card-not-present.
    card_volume_distribution: {
      ecommerce_percentage: Number(dist?.ecommercePercentage ?? 100),
      card_present_percentage: Number(dist?.cardPresentPercentage ?? 0),
      mail_order_telephone_order_percentage: Number(dist?.mailOrderTelephoneOrderPercentage ?? 0),
    },
    // Clubs sell to their own members — business-to-consumer, end to end.
    volume_distribution_by_business_type: {
      business_to_business_volume_percentage: Number(bizDist?.businessToBusinessVolumePercentage ?? 0),
      business_to_consumer_volume_percentage: Number(bizDist?.businessToConsumerVolumePercentage ?? 100),
      consumer_to_consumer_volume_percentage: Number(bizDist?.consumerToConsumerVolumePercentage ?? 0),
      person_to_person_volume_percentage: Number(bizDist?.personToPersonVolumePercentage ?? 0),
      other_volume_percentage: Number(bizDist?.otherVolumePercentage ?? 0),
    },
    // Consent records — Finix wants these with IP / timestamp / user-agent.
    // The IP is captured server-side from the callable request; a consent record
    // without one is itself a reason to kick an application to manual review.
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

// Finix identity_roles that can back a merchant. An identity created only as a
// hosted-onboarding shell (createSubMerchantAccount) or as a buyer comes back
// with role UNKNOWN and CANNOT be provisioned — and PATCHing business data onto
// it does not upgrade the role. So such an identity must be discarded, not reused.
const MERCHANT_PROVISIONABLE_ROLES = new Set([
  "APPLICATION_OWNER",
  "SENDER",
  "RECIPIENT",
  "SELLER",
]);

// true  -> Finix reports a role that can be provisioned as a merchant (reuse it)
// false -> role is UNKNOWN / BUYER / none (discard and mint a fresh identity)
// null  -> identity can't be fetched (404 / wrong env / transient) -> discard too
const finixIdentityIsProvisionable = async (identityId: string): Promise<boolean | null> => {
  try {
    const identity: any = await finixGet(`/identities/${identityId}`);
    const roles: string[] = Array.isArray(identity?.identity_roles)
      ? identity.identity_roles
      : identity?.identity_role
      ? [identity.identity_role]
      : [];
    return roles.some((r) => MERCHANT_PROVISIONABLE_ROLES.has(r));
  } catch (e) {
    return null;
  }
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
      // The client can't see its own public IP; take it from the request. Falls
      // back to whatever the client guessed, then to nothing.
      const consentIp =
        (request.rawRequest?.headers?.["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
        request.rawRequest?.ip ||
        consent?.ip ||
        undefined;
      const additional = toFinixUnderwriting(
        underwriting,
        { ...(consent || {}), ip: consentIp },
        { businessName: business.businessName, annualCardVolume: Number(business.annualCardVolume) || 0 }
      );
      // CREATE takes the full payload. UPDATE takes `entity` + `tags` ONLY —
      // Finix's update model has no `additional_underwriting_data` binding, and
      // sending it fails the whole request with an unnamed parse error
      // ("Invalid Field: null; Error near line: 1, column: N", where N points
      // into that block). That 400 hit every club editing an existing profile.
      const createBody: any = { entity, tags: { club_id: clubId } };
      if (additional) createBody.additional_underwriting_data = additional;
      const updateBody: any = { entity, tags: { club_id: clubId } };

      // Reuse the existing identity (PUT) on resume / correction — but ONLY if
      // Finix still considers it provisionable. A stale hosted-onboarding shell
      // or buyer identity comes back with role UNKNOWN; PATCHing never upgrades
      // that role, so provisioning would fail forever. In that case discard it
      // and mint a fresh identity (this is what strands a club otherwise).
      let identityId: string = club.finixIdentityId;
      let reuseOwners = true;
      if (identityId) {
        const provisionable = await finixIdentityIsProvisionable(identityId);
        if (provisionable === true) {
          await finixPut(`/identities/${identityId}`, updateBody);
        } else {
          console.warn(
            `createClubIdentity: club ${clubId} identity ${identityId} is not provisionable ` +
              `(${provisionable === null ? "unfetchable" : "role UNKNOWN/buyer"}); minting a fresh identity`
          );
          identityId = "";
          // Old associated identities were attached to the discarded identity, so
          // don't carry them over — the owners get re-attached to the new one.
          reuseOwners = false;
        }
      }
      if (!identityId) {
        const identity = await finixPost("/identities", createBody);
        identityId = identity.id;
        // Persist the id RIGHT AWAY. If anything below fails (owners, draft
        // write), a retry then PUTs to this same identity instead of minting a
        // new orphan in Finix.
        await clubRef.update({
          finixIdentityId: identityId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Beneficial owners (>25%) become associated identities under the merchant
      // identity. We replace-on-resume only when none recorded yet to avoid dupes.
      const ownerIds: string[] = reuseOwners && Array.isArray(club.finixOwnerIdentityIds)
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

      // If Finix was waiting on a correction, updating the identity alone does
      // NOT re-open underwriting — a new Verification has to be created. Without
      // this, a club fixes exactly what was asked for and nothing happens.
      let resubmitted = false;
      if (club.finixMerchantId && club.finixOnboardingState === "UPDATE_REQUESTED") {
        try {
          const v = await createMerchantVerification(club.finixMerchantId);
          resubmitted = true;
          await clubRef.update({
            finixLastVerificationId: v.verificationId,
            finixLastResubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`createClubIdentity: resubmitted club ${clubId} for review (${v.verificationId})`);
        } catch (e: any) {
          // The correction still saved — don't fail the call over the resubmit.
          console.warn(`createClubIdentity: resubmit failed for club ${clubId}:`, e?.message || e);
        }
      }

      return { identityId, ownerIdentityIds: ownerIds, resubmitted };
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
// 2b) Corrections to an ALREADY-SUBMITTED merchant.
//
// Updating an Identity does NOT re-open underwriting. Finix only re-reviews
// when a new Verification is created — so without this, a club that fixes what
// was asked for (an SSN, an address) sits in UPDATE_REQUESTED forever and
// nobody can see why. `createClubIdentity` calls this automatically after an
// update, and it's exposed directly for the manual cases.
// ---------------------------------------------------------------------------
const createMerchantVerification = async (merchantId: string) => {
  const verification: any = await finixPost(`/merchants/${merchantId}/verifications`, {});
  return {
    verificationId: verification?.id || null,
    state: verification?.state || null,
  };
};

export const resubmitClubVerification = functions.https.onCall(
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
    if (!isAdmin && !isRallysphereStaff(request)) {
      throw new functions.https.HttpsError("permission-denied", "Only club admins can resubmit");
    }
    if (!club.finixMerchantId) {
      throw new functions.https.HttpsError("failed-precondition", "This club has no merchant to resubmit");
    }

    try {
      const result = await createMerchantVerification(club.finixMerchantId);
      await clubRef.update({
        finixLastVerificationId: result.verificationId,
        finixLastResubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return result;
    } catch (error: any) {
      console.error("resubmitClubVerification error:", error?.message || error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to resubmit for review");
    }
  }
);

// ---------------------------------------------------------------------------
// 2c) Attach an additional beneficial owner (>=25%) to an existing identity.
//
// Finix requires every 25%+ owner to be on the application. The in-app wizard
// only ever collects ONE person and hard-codes 100% ownership, so a co-owned
// business gets rejected — which is one reason the hosted form is now the
// default path. This exists to repair the clubs already caught by it, without
// making them start over.
// ---------------------------------------------------------------------------
export const addClubBeneficialOwner = functions.https.onCall(
  { enforceAppCheck: false, secrets: FINIX_SECRETS },
  async (request: any) => {
    const auth = request.auth;
    if (!auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");

    const { clubId, owner, resubmit } = request.data || {};
    if (!clubId || !owner?.firstName || !owner?.lastName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: clubId, owner.firstName, owner.lastName"
      );
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
    if (!isAdmin && !isRallysphereStaff(request)) {
      throw new functions.https.HttpsError("permission-denied", "Only club admins can add owners");
    }
    if (!club.finixIdentityId) {
      throw new functions.https.HttpsError("failed-precondition", "Create the club identity first");
    }

    try {
      // SSN/DOB are forwarded to Finix and never written to Firestore — same
      // rule as the control person.
      const assoc: any = await finixPost(`/identities/${club.finixIdentityId}/associated_identities`, {
        entity: toFinixPersonFields(owner),
        tags: { club_id: clubId },
      });
      if (!assoc?.id) throw new Error("Finix did not return an associated identity id");

      await clubRef.update({
        finixOwnerIdentityIds: admin.firestore.FieldValue.arrayUnion(assoc.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Adding an owner to a merchant that's already under review does nothing
      // until a new verification is created.
      let verification = null;
      if (resubmit !== false && club.finixMerchantId) {
        verification = await createMerchantVerification(club.finixMerchantId).catch((e: any) => {
          console.warn(`addClubBeneficialOwner: resubmit failed for club ${clubId}:`, e?.message || e);
          return null;
        });
      }

      return { ownerIdentityId: assoc.id, verification };
    } catch (error: any) {
      console.error("addClubBeneficialOwner error:", error?.message || error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to add beneficial owner");
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
// HOSTED ONBOARDING FORM — the "set up on Finix's site" alternative
//
// The in-app wizard above (createClubIdentity → addClubBankAccount →
// provisionClubMerchant) keeps the admin inside RallySphere but makes US the
// middleman for everything Finix asks for afterwards: when underwriting wants
// more documents the merchant gets no notification and can't respond, so a
// human on our side has to relay it.
//
// A Finix-hosted Onboarding Form flips that. The admin completes it in a
// browser outside the app, and — critically — when Finix later needs more info
// the SAME form moves to UPDATE_REQUESTED with the requested fields highlighted
// and file uploaders attached. The merchant re-opens their link and resolves it
// themselves; no action required from us.
//
// The two paths are mutually exclusive per club: a submitted form mints its own
// Identity + Merchant + Payment Instrument, so it can't be grafted onto a club
// that already has an identity from the wizard. The club picks one up front and
// `finixOnboardingMode` records the choice.
//
// Deliberately NOT pre-creating an identity shell to attach here: that's what
// the old createSubMerchantAccount did, and those shells came back with
// identity_role UNKNOWN, which can never be provisioned as a merchant (see
// MERCHANT_PROVISIONABLE_ROLES above). Letting the form mint its own identity
// is what produces a provisionable one.
// ============================================================================

// Public pages Finix requires on the hosted form. Fees page is served from
// Firebase Hosting; terms is the app's own /legal/terms route on the web build.
const ONBOARDING_FEE_DETAILS_URL =
  process.env.FINIX_FEE_DETAILS_URL || "https://rally-sphere.web.app/fees.html";
const ONBOARDING_TERMS_URL =
  process.env.FINIX_TERMS_URL || "https://rally-sphere.web.app/legal/terms";
// Links are short-lived by design (Finix defaults to 60 min). We mint a fresh
// one every time the admin taps through, so expiry is never a dead end.
const ONBOARDING_LINK_MINUTES = 120;

const onboardingLinkDetails = (clubId: string, maxTxnCents: number) => ({
  return_url: `rallysphere://finix-onboarding/return?clubId=${encodeURIComponent(clubId)}`,
  expired_session_url: `rallysphere://finix-onboarding/refresh?clubId=${encodeURIComponent(clubId)}`,
  fee_details_url: ONBOARDING_FEE_DETAILS_URL,
  terms_of_service_url: ONBOARDING_TERMS_URL,
  expiration_in_minutes: ONBOARDING_LINK_MINUTES,
  merchant_max_transaction_amount: maxTxnCents,
});

// Finix returns the hosted URL under `onboarding_link` on create and at the top
// level on the /links endpoint. Tolerate both plus older shapes.
const extractOnboardingLink = (r: any): { url: string | null; expiresAt: string | null } => ({
  url:
    r?.onboarding_link?.link_url || r?.link_url || r?.onboarding_link_details?.link_url ||
    r?.hosted_url || r?.url || null,
  expiresAt: r?.onboarding_link?.expires_at || r?.expires_at || null,
});

// Pull the merchant the form created (if it's got that far) so the club doc
// reflects real Finix state without waiting on a webhook.
const syncMerchantFromIdentity = async (identityId: string) => {
  try {
    const list: any = await finixGet(`/identities/${identityId}/merchants`);
    const merchant = list?._embedded?.merchants?.[0];
    if (!merchant?.id) return null;
    return {
      merchantId: merchant.id,
      onboardingState: merchant.onboarding_state || "PROVISIONING",
      active: merchant.processing_enabled === true && merchant.settlement_enabled === true,
    };
  } catch {
    return null;
  }
};

// One callable covers create / resume / update-request re-entry. The client
// always just asks for "the link" and gets a fresh one plus current status.
export const getClubOnboardingFormLink = functions.https.onCall(
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

    // The one thing we must never do is mint a SECOND merchant for a club that
    // already has a working one — that's the duplicate-merchant bug that has
    // bitten this integration before. So:
    //   - already has a merchant  -> refuse; corrections go through support
    //     (or the merchant's own Finix dashboard) until Finix confirms a hosted
    //     form can be attached to an API-created merchant.
    //   - identity but no merchant -> SAFE to hand them a hosted form. There's
    //     nothing to duplicate, and this is precisely the stuck-mid-setup club
    //     we want to unblock.
    if (club.finixMerchantId && club.finixOnboardingMode !== "hosted") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This club's payout account already exists. Contact support to make changes to it."
      );
    }

    const maxTxnCents = Number(process.env.FINIX_MAX_TXN_CENTS) || 500000;
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      // ---- Existing form: sync state, then mint a fresh link ----
      if (club.finixOnboardingFormId) {
        const form: any = await finixGet(`/onboarding_forms/${club.finixOnboardingFormId}`);
        const formStatus: string = form?.status || "IN_PROGRESS";
        const identityId: string | null = form?.identity_id || club.finixIdentityId || null;

        const update: any = { finixOnboardingFormStatus: formStatus, updatedAt: now };
        if (identityId && !club.finixIdentityId) update.finixIdentityId = identityId;

        let merchantId: string | null = club.finixMerchantId || null;
        let onboardingState: string | null = club.finixOnboardingState || null;
        if (identityId) {
          const m = await syncMerchantFromIdentity(identityId);
          if (m) {
            merchantId = m.merchantId;
            onboardingState = m.onboardingState;
            update.finixMerchantId = m.merchantId;
            update.finixOnboardingState = m.onboardingState;
            update.finixMerchantAccountActive = m.active;
            update.finixOnboardingComplete = m.onboardingState === "APPROVED" || m.active;
            update.finixOnboardingDeclined = m.onboardingState === "REJECTED";
            update.finixOnboardingStatus =
              m.onboardingState === "APPROVED" || m.active
                ? "APPROVED"
                : m.onboardingState === "REJECTED"
                ? "DECLINED"
                : "PENDING";
          }
        }

        // Finix hard-refuses link generation on a COMPLETED form:
        //   409 "Cannot generate link for Completed onboarding forms"
        // So the form link is an ONBOARDING door, not a permanent one. That's
        // survivable because Finix moves the form OUT of Completed and back to
        // UPDATE_REQUESTED whenever underwriting wants something — i.e. links
        // exist exactly when the club has something to do. In the steady state
        // there's nothing to open, and the club's ongoing access is the Finix
        // dashboard instead. Don't even attempt the call while Completed;
        // it's a guaranteed 409 on every screen load.
        let link: { url: string | null; expiresAt: string | null } = { url: null, expiresAt: null };
        if (formStatus !== "COMPLETED") {
          try {
            const res = await finixPost(
              `/onboarding_forms/${club.finixOnboardingFormId}/links`,
              onboardingLinkDetails(clubId, maxTxnCents)
            );
            link = extractOnboardingLink(res);
            if (link.url) {
              update.finixOnboardingUrl = link.url;
              update.finixOnboardingLinkExpiresAt = link.expiresAt;
            }
          } catch (e: any) {
            console.warn(`onboarding form link refused for club ${clubId}:`, e?.message || e);
          }
        }

        await clubRef.update(update);
        // Same to-do list as the in-app path — the hosted form is where they'll
        // resolve it, but they still need to know what "it" is before tapping.
        const actionRequired = await syncClubActionRequired(clubRef, merchantId, onboardingState);
        return {
          linkUrl: link.url,
          expiresAt: link.expiresAt,
          formStatus,
          identityId,
          merchantId,
          onboardingState,
          actionRequired,
          // Finix moves the form here when underwriting wants more from the
          // merchant — the whole reason this path exists.
          updateRequested: formStatus === "UPDATE_REQUESTED",
        };
      }

      // ---- First time: create the form, prefilled with what we already know ----
      const draft = club.finixOnboardingDraft || {};
      const entity: any = {
        business_name: draft.business?.businessName || club.name,
        doing_business_as: draft.business?.doingBusinessAs || club.name,
        email: draft.business?.email || club.contactEmail || undefined,
        phone: draft.business?.phone || undefined,
        url: draft.business?.url || club.socialLinks?.website || undefined,
        // This application only permits MCCs [5045, 7997]; 7997 = Membership
        // Clubs (Sports/Recreation/Athletic).
        mcc: draft.business?.mcc || "7997",
      };
      Object.keys(entity).forEach((k) => entity[k] === undefined && delete entity[k]);

      // Prefill the underwriting narrative here too. The seller accepts terms on
      // the form itself, so leave the merchant_agreement_* consent record to
      // Finix — we only seed the descriptive fields that otherwise arrive blank
      // and trigger manual questions.
      const seeded = toFinixUnderwriting(draft.underwriting, null, {
        businessName: draft.business?.businessName || club.name,
        annualCardVolume: Number(draft.business?.annualCardVolume) || 0,
      });
      delete seeded.merchant_agreement_accepted;
      delete seeded.merchant_agreement_timestamp;
      delete seeded.merchant_agreement_ip_address;
      delete seeded.merchant_agreement_user_agent;

      const baseForm: any = {
        merchant_processors: [{ processor: isTestMode ? "DUMMY_V1" : "FINIX_V1" }],
        onboarding_data: {
          country: "USA",
          max_transaction_amount: maxTxnCents,
          entity,
          additional_underwriting_data: seeded,
        },
        onboarding_link_details: onboardingLinkDetails(clubId, maxTxnCents),
        tags: { club_id: clubId },
      };

      // If the club already built an identity in the wizard, try to hang the
      // form off it so their typing isn't wasted. This attach is undocumented —
      // the retired hosted flow passed `onboarding_data.identity.id` — so if
      // Finix rejects it, fall back to a plain form, which mints its own
      // (correctly-roled) identity. Either way the club ends up with a working
      // link; the orphaned identity is harmless since it has no merchant.
      let form: any;
      let attached = false;
      if (club.finixIdentityId) {
        try {
          form = await finixPost("/onboarding_forms", {
            ...baseForm,
            onboarding_data: {
              ...baseForm.onboarding_data,
              identity: { id: club.finixIdentityId, tags: { club_id: clubId } },
            },
          });
          attached = true;
        } catch (e: any) {
          console.warn(
            `onboarding form attach to identity ${club.finixIdentityId} rejected (${e?.message || e}); ` +
              `creating a standalone form for club ${clubId}`
          );
        }
      }
      if (!form) form = await finixPost("/onboarding_forms", baseForm);
      console.log(`onboarding form ${form?.id} created for club ${clubId} (attached=${attached})`);
      const link = extractOnboardingLink(form);
      if (!link.url) {
        throw new Error(`Finix did not return a hosted onboarding URL. Response: ${JSON.stringify(form)}`);
      }

      await clubRef.update({
        finixOnboardingMode: "hosted",
        // A standalone form mints its own identity on submission, so drop the
        // stale wizard one — otherwise status lookups chase an identity that
        // will never have a merchant.
        ...(attached ? {} : { finixIdentityId: admin.firestore.FieldValue.delete() }),
        finixOnboardingFormId: form.id,
        finixOnboardingFormStatus: form.status || "IN_PROGRESS",
        finixOnboardingUrl: link.url,
        finixOnboardingLinkExpiresAt: link.expiresAt,
        finixOnboardingStatus: "PENDING",
        finixOnboardingStartedAt: club.finixOnboardingStartedAt || now,
        finixAcceptedByUid: club.finixAcceptedByUid || auth.uid,
        updatedAt: now,
      });

      return {
        linkUrl: link.url,
        expiresAt: link.expiresAt,
        formStatus: form.status || "IN_PROGRESS",
        identityId: form.identity_id || null,
        merchantId: null,
        onboardingState: null,
        updateRequested: false,
      };
    } catch (error: any) {
      console.error("getClubOnboardingFormLink error:", error?.message || error);
      throw new functions.https.HttpsError("internal", error.message || "Failed to open Finix onboarding");
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
            // Underwriting stalled → pull the specific items Finix wants and
            // put them on the club doc; resolved → clear them. This is the only
            // moment we learn what's being asked for, since Finix tells nobody else.
            const action = await syncClubActionRequired(doc.ref, merchant.id, onboardingState);
            await notifyClubAdminsOfPayoutStatus(db, doc, { status, onboardingState, action });
          }
        }
        break;
      }

      // Hosted onboarding form lifecycle. The status that matters is
      // UPDATE_REQUESTED — Finix wants more from the merchant, and they can
      // resolve it themselves by re-opening their form link. Recording it lets
      // the app show "action needed" instead of a silent stall.
      case /^onboarding_forms?\./.test(eventType): {
        const form = event._embedded?.onboarding_forms?.[0] || event.entity || event.data;
        if (form?.id) {
          let formDocs = await db
            .collection("clubs")
            .where("finixOnboardingFormId", "==", form.id)
            .limit(1)
            .get();
          const clubIdTag = form.tags?.club_id;
          if (formDocs.empty && clubIdTag) {
            const byTag = await db.collection("clubs").doc(clubIdTag).get();
            formDocs = { empty: !byTag.exists, docs: byTag.exists ? [byTag] : [] } as any;
          }
          if (formDocs.empty) {
            console.warn(`Finix onboarding form ${form.id} matched no club`);
          }
          for (const doc of formDocs.docs) {
            const update: any = {
              finixOnboardingFormStatus: form.status || null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            // The form mints its own identity on submission — capture it so
            // status lookups and payouts resolve without a manual backfill.
            if (form.identity_id && !doc.data()?.finixIdentityId) {
              update.finixIdentityId = form.identity_id;
            }
            await doc.ref.update(update);
            // Hosted clubs can fix this themselves — but only if they're told.
            if (form.status === "UPDATE_REQUESTED") {
              const merchantId = doc.data()?.finixMerchantId;
              const action = merchantId ? await fetchMerchantActionRequired(merchantId) : null;
              await notifyClubAdminsOfPayoutStatus(db, doc, {
                status: "PENDING",
                onboardingState: "UPDATE_REQUESTED",
                action,
              });
            }
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
