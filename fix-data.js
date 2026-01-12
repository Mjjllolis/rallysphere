// Script to fix events and recalculate rally credits
// Run with: node fix-data.js

const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Load environment variables from .env file
require('dotenv').config();

// Your Firebase config (loaded from environment variables)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_MEASUREMENT_ID
};

// Validate required config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Error: Missing required Firebase config. Make sure .env file exists with EXPO_PUBLIC_API_KEY and EXPO_PUBLIC_PROJECT_ID');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function runFix() {
  console.log('Calling fixEventsAndCredits Cloud Function...');
  try {
    const fixFunction = httpsCallable(functions, 'fixEventsAndCredits');
    const result = await fixFunction({});
    console.log('Success! Results:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

runFix();
