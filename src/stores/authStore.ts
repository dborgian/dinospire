import { create } from 'zustand';

export interface AuthUser {
  uid:         string;
  displayName: string | null;
  email:       string | null;
  photoURL:    string | null;
}

interface AuthState {
  user:    AuthUser | null;
  loading: boolean;
  signIn:  () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>(() => ({
  user:    null,
  loading: false,
  signIn:  async () => {},
  signOut: async () => {},
}));
