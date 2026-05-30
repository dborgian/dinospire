// ---------------------------------------------------------------------------
// Leaderboard — Firestore helpers for reading and writing run scores.
// Collection: "scores" — one doc per run (auto-id).
// ---------------------------------------------------------------------------

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db, firebaseConfigured } from './firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreEntry {
  uid:            string;
  displayName:    string;
  photoURL:       string;
  heroId:         string;
  score:          number;
  durationMs:     number;   // milliseconds
  floor:          number;
  combatsWon:     number;
  elitesDefeated: number;
  evolutionStage: string;
  ascensionLevel: number;
  victory:        boolean;
  createdAt:      Timestamp | null;
}

export interface ScoreRow extends ScoreEntry {
  id: string;
  rank: number;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function submitScore(entry: Omit<ScoreEntry, 'createdAt'>): Promise<void> {
  if (!firebaseConfigured) return;
  await addDoc(collection(db, 'scores'), {
    ...entry,
    createdAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Read — top 20 by score (victories only for global, all for personal)
// ---------------------------------------------------------------------------

export async function fetchTopScores(count = 20): Promise<ScoreRow[]> {
  if (!firebaseConfigured) return [];
  const q = query(
    collection(db, 'scores'),
    orderBy('score', 'desc'),
    limit(count),
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc, i) => ({
    id:   doc.id,
    rank: i + 1,
    ...(doc.data() as ScoreEntry),
  }));
}
