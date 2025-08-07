// firebase/config.ts
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
// import { getStorage } from 'firebase/storage'; // enable later if needed

const firebaseConfig = {
    apiKey: 'AIzaSyDXRHfV-RjRvXH8E7d07XTZi7bv07la7hY',
    authDomain: 'rally-sphere.firebaseapp.com',
    projectId: 'rally-sphere',
    storageBucket: 'rally-sphere.firebasestorage.app',
    messagingSenderId: '335059242542',
    appId: '1:335059242542:web:63a9fe021cbebebb8599bf',
    measurementId: 'G-H2R70NP5NE' // harmless to keep; unused on RN
};

export const app = initializeApp(firebaseConfig);

// Persist session across app restarts in React Native
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
// export const storage = getStorage(app); // uncomment when you need Storage