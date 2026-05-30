import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, firebaseConfigured } from '../lib/firebase';

interface AuthState {
  user:    User | null;
  loading: boolean;
  signIn:  () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  if (firebaseConfigured) {
    onAuthStateChanged(auth, (user) => set({ user, loading: false }));
  }
  return {
    user:    null,
    loading: firebaseConfigured,
    signIn: async () => {
      if (!firebaseConfigured) return;
      await signInWithPopup(auth, googleProvider);
    },
    signOut: async () => {
      if (!firebaseConfigured) return;
      await fbSignOut(auth);
    },
  };
});
