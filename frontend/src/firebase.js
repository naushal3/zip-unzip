import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

console.log('[Firebase Debug] Initializing SDK for Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID || 'MISSING');
console.log('[Firebase Debug] API Key present:', !!import.meta.env.VITE_FIREBASE_API_KEY);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
