// Test script to verify createCheckoutSession function
const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDqoKwMPfwkIkIxG36pJ3n2TP6EIgQ_bko",
  authDomain: "rally-sphere.firebaseapp.com",
  projectId: "rally-sphere",
  storageBucket: "rally-sphere.firebasestorage.app",
  messagingSenderId: "335059242542",
  appId: "1:335059242542:web:7ae9d9c39d8c9f0a08bc36",
  measurementId: "G-ZNB2RNFR6X"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');
const auth = getAuth(app);

async function testCheckout() {
  try {
    // Sign in first
    console.log('Signing in...');
    const userCredential = await signInWithEmailAndPassword(auth, 'mjjllolis@icloud.com', 'test123');
    console.log('Signed in as:', userCredential.user.email);

    // Get ID token
    const idToken = await userCredential.user.getIdToken(true);
    console.log('Got ID token, length:', idToken.length);

    // Call function
    console.log('Calling createCheckoutSession...');
    const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
    const result = await createCheckoutSession({
      eventId: 'test-event',
      ticketPrice: 10,
      currency: 'usd'
    });

    console.log('Success!', result.data);
  } catch (error) {
    console.error('Error:', error.code, error.message);
    console.error('Details:', error);
  }
}

testCheckout();
