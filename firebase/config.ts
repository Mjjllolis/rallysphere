import { initializeApp } from 'firebase/app';

const firebaseConfig = {
    apiKey: 'your-api-key',
    authDomain: 'your-app.firebaseapp.com',
    projectId: 'your-app',
    storageBucket: 'your-app.appspot.com',
    messagingSenderId: '...',
    appId: '...',
};

export const firebaseApp = initializeApp(firebaseConfig);