# RallySphere

A React Native application built with Expo for event management and community engagement.

## Table of Contents
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Development](#development)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables (see [Environment Variables](#environment-variables))

3. Run the app:
```bash
npx expo start
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id

# Stripe Configuration (use test keys for development)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

**IMPORTANT:** Never commit the `.env` file to version control. It should be listed in `.gitignore`.

## Security

### Secret Management

**NEVER commit API keys, tokens, or secrets to version control.** Always use environment variables and keep them in `.env` files that are excluded from git.

### What to do if a secret is leaked:

1. **Immediately rotate/revoke the compromised secret**
2. **Check security logs for unauthorized access**
3. **Update your application with the new secret**
4. **Close the security alert in GitHub**

### How to Rotate Stripe API Keys

If your Stripe API key has been compromised, follow these steps:

#### 1. Create a New API Key

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers** → **API keys**
3. For Test Mode:
   - Click **Create secret key** in the Test mode section
   - Give it a descriptive name (e.g., "RallySphere Test Key - 2024-10")
   - Copy the new secret key (starts with `sk_test_`)
4. For Live Mode (production):
   - Switch to **Live mode** using the toggle
   - Click **Create secret key**
   - Give it a descriptive name
   - Copy the new secret key (starts with `sk_live_`)

#### 2. Update Your Application

1. Update your `.env` file with the new key:
   ```env
   STRIPE_SECRET_KEY=sk_test_NEW_KEY_HERE
   ```

2. If using Firebase Functions or backend services, update the environment variables:
   ```bash
   # For Firebase Functions
   firebase functions:config:set stripe.secret_key="sk_test_NEW_KEY_HERE"

   # Deploy the updated config
   firebase deploy --only functions
   ```

3. Restart your development server to load the new environment variable

#### 3. Revoke the Old Key

1. Return to the [Stripe Dashboard](https://dashboard.stripe.com/) → **API keys**
2. Find the compromised key in the list
3. Click the **⋯** (three dots) menu next to the key
4. Select **Delete** or **Roll key**
5. Confirm the deletion

#### 4. Verify the Change

1. Test your application to ensure it's using the new key
2. Check Stripe Dashboard logs to confirm API requests are working
3. Monitor for any errors in your application logs

#### 5. Review Access Logs

1. In Stripe Dashboard, go to **Developers** → **Events**
2. Review recent API activity for any suspicious requests
3. Check for any unauthorized charges or customer data access

### Additional Security Best Practices

- Use separate API keys for development, staging, and production
- Rotate API keys regularly (every 90 days recommended)
- Use restricted API keys with minimal permissions when possible
- Enable two-factor authentication on all service accounts
- Monitor GitHub for secret scanning alerts
- Use environment variable management tools like:
  - AWS Secrets Manager
  - Google Cloud Secret Manager
  - HashiCorp Vault
  - Doppler

### Firebase Security

If you're using Firebase Functions, store secrets using Firebase Functions config:

```bash
# Set a secret
firebase functions:config:set service.api_key="your_api_key"

# View all secrets (values are hidden)
firebase functions:config:get

# Remove a secret
firebase functions:config:unset service.api_key
```

### Preventing Future Leaks

1. **Use `.gitignore`:** Ensure `.env`, secrets files, and credentials are listed
2. **Use environment variables:** Never hardcode secrets in source code
3. **Enable GitHub secret scanning:** Automatically detect committed secrets
4. **Use pre-commit hooks:** Scan for secrets before committing
5. **Review pull requests:** Check for accidentally committed secrets
6. **Use `.env.example`:** Commit a template file with dummy values

Create a `.env.example` file to help other developers:
```env
# .env.example
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
# iOS
npx expo build:ios

# Android
npx expo build:android
```

### Firebase Deployment
```bash
firebase deploy
```

## License

[Your License Here]
