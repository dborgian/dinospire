// ---------------------------------------------------------------------------
// Firebase configuration — fill in your project values from:
// Firebase Console → Project Settings → General → Your apps → SDK snippet
//
// To create a project:
// 1. console.firebase.google.com → Add project → name "dinospire"
// 2. Add web app → copy the config object below
// 3. Authentication → Sign-in method → Google → Enable
// 4. Firestore Database → Create database → Start in production mode
//    → Add rule: allow read, write: if request.auth != null;
// ---------------------------------------------------------------------------

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? '',
};

// Avoid re-initialising in HMR
const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

/** True only when the env vars are actually provided. */
export const firebaseConfigured = Boolean(firebaseConfig.projectId);
