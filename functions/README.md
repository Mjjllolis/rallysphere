# RallySphere Firebase Cloud Functions

This directory contains Firebase Cloud Functions for handling Stripe payments securely.

## Setup Instructions

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Initialize Firebase in Your Project (if not already done)

```bash
# Go back to project root
cd ..

# Install Firebase CLI globally (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init functions

# Select your existing Firebase project (rally-sphere)
# Choose TypeScript
# Use existing functions directory
# Install dependencies
```

### 3. Set Environment Variables

You need to set your Stripe secret key in Firebase config:

```bash
# Set Stripe secret key
firebase functions:config:set stripe.secret_key="sk_test_51SFhMjBbmMSsSxvpGbVcGJ6g70mc8GI3ehzSSOb6ZJ6ixaqvu7OIelxmC1dd5bzAb50Mf73G7IvPwm8W63ALJ2P800HsEyAmmh"
```

### 4. Build and Deploy Functions

```bash
# Build TypeScript
cd functions
npm run build

# Deploy to Firebase
firebase deploy --only functions
```

### 5. Set Up Stripe Webhook (After Deployment)

After deploying your functions, you need to set up the Stripe webhook:

1. Go to your Firebase Console
2. Navigate to Functions
3. Copy the URL for the `stripeWebhook` function (it will look like: `https://us-central1-rally-sphere.cloudfunctions.net/stripeWebhook`)

4. Go to Stripe Dashboard: https://dashboard.stripe.com/test/webhooks
5. Click "Add endpoint"
6. Paste your function URL
7. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
8. Click "Add endpoint"
9. Copy the "Signing secret" (starts with `whsec_`)

10. Set the webhook secret in Firebase:
```bash
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"
```

11. Redeploy functions:
```bash
firebase deploy --only functions
```

## Testing Locally

To test functions locally with the Firebase emulator:

```bash
# Start emulator
cd functions
npm run serve
```

## Available Functions

### `createPaymentIntent`
- **Type**: Callable HTTPS function
- **Purpose**: Creates a Stripe Payment Intent for event ticket purchase
- **Authentication**: Required
- **Parameters**:
  - `eventId`: string
  - `amount`: number (in dollars, e.g., 10.00)
  - `currency`: string (optional, defaults to "usd")

### `stripeWebhook`
- **Type**: HTTPS function
- **Purpose**: Webhook endpoint for Stripe events
- **Authentication**: Verified via Stripe signature
- **Handles**:
  - Payment success: Adds user to event attendees
  - Payment failure: Logs failed payment

### `getUserPayments`
- **Type**: Callable HTTPS function
- **Purpose**: Get payment history for the authenticated user
- **Authentication**: Required
- **Returns**: Array of user's payments

## Security Notes

- Never commit your Stripe secret keys to version control
- Always use Firebase config for production keys
- The `.env` file is for local development only
- Webhook signature verification is required for production
