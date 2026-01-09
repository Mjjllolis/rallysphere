// Script to fix events and recalculate rally credits
// Run with: node fix-data.js

const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Your Firebase config
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_API_KEY || "AIzaSyCxvUPdONfTKsAYi1vZzJAibXpfR_0c6mo",
  authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN || "rally-sphere.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID || "rally-sphere",
  storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET || "rally-sphere.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID || "632908002651",
  appId: process.env.EXPO_PUBLIC_APP_ID || "1:632908002651:web:f71f3f49a5bbc1dc8cfaa0",
  measurementId: process.env.EXPO_PUBLIC_MEASUREMENT_ID || "G-LC2YEK6NX1"
};

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
