// ---------------------------------------------------------------------------
// GameOverScreen — end-of-run summary with stats, score, and meta unlocks.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import { useMetaStore } from '../../stores/metaStore';
import type { RunState } from '../../game/types';

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

function calcScore(run: RunState): number {
  const { stats, evolutionStage, map, gold } = run;
  const maxFloor = Math.max(0, ...map.nodes.filter((n) => n.visited).map((n) => n.floor));
  const stageBonus = evolutionStage === 'prime' ? 100 : evolutionStage === 'adulto' ? 50 : 0;
  return (
    maxFloor * 10 +
    stats.combatsWon * 15 +
    stats.elitesDefeated * 25 +
    Math.floor(stats.damageDealt / 10) +
    Math.floor(gold / 5) +
    stageBonus
  );
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

function ConfettiParticle({ index }: { index: number }) {
  const colours = ['#fbbf24', '#f59e0b', '#d97706', '#fcd34d', '#fef3c7'] as const;
  const colour = colours[index % colours.length] ?? '#fbbf24';
  const xStart = Math.random() * 100;
  const duration = 2 + Math.random() * 2;
  const delay = Math.random() * 1.5;
  return (
    <motion.div
      aria-hidden="true"
      className="absolute w-2 h-2 rounded-sm"
      style={{ backgroundColor: colour, left: `${xStart}%`, top: '-8px' }}
      initial={{ y: 0, opacity: 1, rotate: 0 }}
      animate={{
        y: ['0vh', '110vh'],
        opacity: [1, 1, 0],
        rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
        x: [(Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: 'linear' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Stat row
// ---------------------------------------------------------------------------

function StatRow({ label, value, color = 'text-stone-100' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-stone-800/60 last:border-0">
      <span className="text-sm text-stone-400">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage badge
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  cucciolo: 'Cucciolo',
  adulto:   'Adulto',
  prime:    'Prime',
};
const STAGE_COLOR: Record<string, string> = {
  cucciolo: 'text-stone-400',
  adulto:   'text-blue-400',
  prime:    'text-amber-400',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GameOverScreenProps {
  reason: 'death' | 'victory';
}

export default function GameOverScreen({ reason }: GameOverScreenProps) {
  const run            = useRunStore((s) => s.run);
  const clearRun       = useRunStore((s) => s.clearRun);
  const recordRunEnd   = useMetaStore((s) => s.recordRunEnd);
  const advanceAscension = useMetaStore((s) => s.advanceAscension);
  const metaProfile    = useMetaStore((s) => s.profile);
  const recorded       = useRef(false);

  const isVictory = reason === 'victory';

  // Capture run snapshot before clearRun is called
  const runSnapshot = useRef<RunState | null>(run ?? null);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    recordRunEnd(isVictory);
    if (isVictory) advanceAscension();
  }, [isVictory, recordRunEnd, advanceAscension]);

  const snap = runSnapshot.current;
  const score = snap ? calcScore(snap) : 0;

  const maxFloor = snap
    ? Math.max(0, ...snap.map.nodes.filter((n) => n.visited).map((n) => n.floor))
    : 0;

  const newAscension = isVictory ? metaProfile.ascensionLevel : null;

  return (
    <main
      className={[
        'min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-8 relative overflow-hidden',
        isVictory ? 'bg-amber-950' : 'bg-stone-950',
      ].join(' ')}
      role="main"
      aria-live="assertive"
    >
      {/* Confetti */}
      {isVictory && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {Array.from({ length: 30 }, (_, i) => <ConfettiParticle key={i} index={i} />)}
        </div>
      )}

      {/* Atmospheric glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isVictory
            ? 'radial-gradient(ellipse 50% 35% at 50% 30%, rgba(251,191,36,0.12) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 50% 35% at 50% 30%, rgba(220,38,38,0.08) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Icon + title */}
      <motion.div
        className="z-10 text-center"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <div className="text-7xl mb-3" aria-hidden="true">
          {isVictory ? '🏆' : '💀'}
        </div>
        <h1 className={[
          'font-black text-2xl uppercase tracking-widest',
          isVictory ? 'text-amber-300' : 'text-red-400',
        ].join(' ')}>
          {isVictory ? 'Hai conquistato la Spira!' : 'La Spira ha vinto…'}
        </h1>
        <p className={[
          'mt-1 text-sm',
          isVictory ? 'text-amber-600' : 'text-stone-600',
        ].join(' ')}>
          {isVictory
            ? 'La tua leggenda riecheggerà nei secoli.'
            : 'Ogni sconfitta è un passo verso la gloria.'}
        </p>
      </motion.div>

      {/* Score */}
      {snap && (
        <motion.div
          className="z-10 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">Punteggio</p>
          <p className={[
            'text-5xl font-black tabular-nums',
            isVictory ? 'text-amber-400' : 'text-stone-300',
          ].join(' ')}>
            {score.toLocaleString('it-IT')}
          </p>
        </motion.div>
      )}

      {/* Stats grid */}
      {snap && (
        <motion.div
          className="z-10 w-full max-w-sm bg-stone-900/80 border border-stone-800 rounded-2xl px-5 py-3"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <StatRow label="Piano raggiunto"   value={maxFloor + 1} />
          <StatRow label="Combattimenti vinti" value={snap.stats.combatsWon} color="text-green-400" />
          <StatRow label="Elite sconfitte"   value={snap.stats.elitesDefeated} color="text-purple-400" />
          <StatRow label="Danno inflitto"    value={snap.stats.damageDealt} color="text-red-400" />
          <StatRow label="Danno subito"      value={snap.stats.damageTaken} color="text-orange-400" />
          <StatRow label="Blocco totale"     value={snap.stats.blockTotal} color="text-blue-400" />
          <StatRow label="Carte giocate"     value={snap.stats.cardsPlayed} />
          <StatRow label="Oro accumulato"    value={`${snap.stats.goldEarned} 💰`} color="text-amber-400" />
        </motion.div>
      )}

      {/* Run summary chips */}
      {snap && (
        <motion.div
          className="z-10 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          {/* Evolution */}
          <div className="flex items-center gap-1.5 bg-stone-900/80 border border-stone-700 rounded-full px-3 py-1">
            <span className="text-sm" aria-hidden="true">🦕</span>
            <span className={`text-xs font-bold ${STAGE_COLOR[snap.evolutionStage] ?? 'text-stone-300'}`}>
              {STAGE_LABEL[snap.evolutionStage] ?? snap.evolutionStage}
            </span>
          </div>
          {/* Deck size */}
          <div className="flex items-center gap-1.5 bg-stone-900/80 border border-stone-700 rounded-full px-3 py-1">
            <span className="text-sm" aria-hidden="true">🃏</span>
            <span className="text-xs font-bold text-stone-300">{snap.deck.length} carte</span>
          </div>
          {/* Relics */}
          <div className="flex items-center gap-1.5 bg-stone-900/80 border border-stone-700 rounded-full px-3 py-1">
            <span className="text-sm" aria-hidden="true">🦴</span>
            <span className="text-xs font-bold text-stone-300">{snap.relics.length} reliquie</span>
          </div>
          {/* HP left */}
          <div className="flex items-center gap-1.5 bg-stone-900/80 border border-stone-700 rounded-full px-3 py-1">
            <span className="text-sm" aria-hidden="true">❤</span>
            <span className="text-xs font-bold text-red-400">{snap.hp}/{snap.maxHp} HP</span>
          </div>
        </motion.div>
      )}

      {/* Ascension unlock (victory only) */}
      {isVictory && newAscension !== null && (
        <motion.div
          className="z-10 flex items-center gap-2 bg-amber-900/60 border border-amber-700 rounded-xl px-4 py-2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring' }}
        >
          <span className="text-lg" aria-hidden="true">⬆</span>
          <span className="text-sm font-bold text-amber-300">
            Ascensione sbloccata: livello {newAscension}
          </span>
        </motion.div>
      )}

      {/* New run button */}
      <motion.button
        type="button"
        onClick={clearRun}
        className={[
          'z-10 h-12 px-10 rounded-xl font-black uppercase tracking-wider text-sm transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          'active:scale-95 cursor-pointer',
          isVictory
            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 shadow-lg shadow-amber-600/30'
            : 'bg-stone-800 hover:bg-stone-700 text-stone-100',
        ].join(' ')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        aria-label="Inizia una nuova run"
      >
        Nuova Run
      </motion.button>
    </main>
  );
}
