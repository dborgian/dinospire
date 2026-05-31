// Leaderboard stub — Firebase not configured.

export interface ScoreEntry {
  uid:            string;
  displayName:    string;
  photoURL:       string;
  heroId:         string;
  score:          number;
  durationMs:     number;
  floor:          number;
  combatsWon:     number;
  elitesDefeated: number;
  evolutionStage: string;
  ascensionLevel: number;
  victory:        boolean;
  createdAt:      null;
}

export interface ScoreRow extends ScoreEntry {
  id:   string;
  rank: number;
}

export async function submitScore(_entry: Omit<ScoreEntry, 'createdAt'>): Promise<void> {}

export async function fetchTopScores(_count = 20): Promise<ScoreRow[]> {
  return [];
}
