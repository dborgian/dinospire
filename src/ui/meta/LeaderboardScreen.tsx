// ---------------------------------------------------------------------------
// LeaderboardScreen — top 20 global scores fetched from Firestore.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchTopScores, type ScoreRow } from '../../lib/leaderboard';
import { useAuthStore } from '../../stores/authStore';
import { firebaseConfigured } from '../../lib/firebase';

interface LeaderboardScreenProps {
  onBack: () => void;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const HERO_EMOJI: Record<string, string> = {
  borea:  '🦕',
  rex:    '🦖',
  veloce: '⚡',
};

export default function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const { user, signIn, signOut } = useAuthStore();
  const [rows, setRows]     = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetchTopScores(20)
      .then(setRows)
      .catch(() => setError('Errore nel caricamento della classifica.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center gap-6 px-4 py-10"
      role="main"
    >
      {/* Header */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-stone-400 hover:text-stone-100 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded px-2 py-1"
          aria-label="Torna al menu"
        >
          ← Indietro
        </button>

        <h1 className="text-amber-400 font-black uppercase tracking-widest text-lg">
          Classifica
        </h1>

        {/* Auth */}
        <div className="flex items-center gap-2">
          {!firebaseConfigured ? (
            <span className="text-stone-600 text-xs">Firebase non configurato</span>
          ) : user ? (
            <div className="flex items-center gap-2">
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? 'avatar'}
                  className="w-6 h-6 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-stone-500 hover:text-stone-300 text-xs transition-colors"
              >
                Esci
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signIn()}
              className="text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Accedi con Google
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="w-full max-w-2xl">
        {loading && (
          <p className="text-stone-500 text-sm text-center py-8">Caricamento...</p>
        )}
        {error && (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="text-stone-500 text-sm text-center py-8">
            Nessuna run salvata. Sii il primo!
          </p>
        )}
        {!loading && rows.length > 0 && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem] gap-2 px-4 py-2 border-b border-stone-800 text-stone-500 text-xs uppercase tracking-wider">
              <span>#</span>
              <span>Giocatore</span>
              <span className="text-right">Punteggio</span>
              <span className="text-right">Piano</span>
              <span className="text-right">Durata</span>
              <span className="text-right">Esito</span>
            </div>

            {rows.map((row, i) => (
              <motion.div
                key={row.id}
                className={[
                  'grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem] gap-2 px-4 py-2.5 items-center',
                  'border-b border-stone-800/50 last:border-0',
                  row.uid === user?.uid ? 'bg-amber-950/20' : '',
                ].join(' ')}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                {/* Rank */}
                <span className={[
                  'text-sm font-bold tabular-nums',
                  row.rank === 1 ? 'text-amber-400' :
                  row.rank === 2 ? 'text-stone-300' :
                  row.rank === 3 ? 'text-amber-700' : 'text-stone-500',
                ].join(' ')}>
                  {row.rank}
                </span>

                {/* Player */}
                <div className="flex items-center gap-2 min-w-0">
                  {row.photoURL ? (
                    <img
                      src={row.photoURL}
                      alt=""
                      className="w-5 h-5 rounded-full flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center text-[10px] text-stone-400 flex-shrink-0">
                      {row.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-stone-200 text-sm truncate">{row.displayName}</span>
                  <span className="text-base flex-shrink-0" aria-label={`Eroe: ${row.heroId}`}>
                    {HERO_EMOJI[row.heroId] ?? '🦕'}
                  </span>
                </div>

                {/* Score */}
                <span className="text-amber-400 font-bold text-sm tabular-nums text-right">
                  {row.score.toLocaleString('it-IT')}
                </span>

                {/* Floor */}
                <span className="text-stone-300 text-sm tabular-nums text-right">
                  P.{row.floor}
                </span>

                {/* Duration */}
                <span className="text-stone-400 text-sm tabular-nums text-right">
                  {formatDuration(row.durationMs)}
                </span>

                {/* Victory */}
                <span className={[
                  'text-xs font-bold text-right',
                  row.victory ? 'text-green-400' : 'text-red-500',
                ].join(' ')}>
                  {row.victory ? '✓' : '✗'}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
