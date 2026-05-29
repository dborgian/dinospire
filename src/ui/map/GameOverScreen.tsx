import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import { useMetaStore } from '../../stores/metaStore';

interface GameOverScreenProps {
  reason: 'death' | 'victory';
}

// ---- Simple confetti particle ----
function ConfettiParticle({ index }: { index: number }) {
  const colours = ['#fbbf24', '#f59e0b', '#d97706', '#fcd34d', '#fef3c7'] as const;
  // noUncheckedIndexedAccess: modulo guarantees in-bounds but TS doesn't know that
  const colour = colours[index % colours.length] ?? '#fbbf24';
  const xStart = Math.random() * 100;
  const duration = 2 + Math.random() * 2;
  const delay = Math.random() * 1.5;

  return (
    <motion.div
      aria-hidden="true"
      className="absolute w-2 h-2 rounded-sm"
      style={{
        backgroundColor: colour,
        left: `${xStart}%`,
        top: '-8px',
      }}
      initial={{ y: 0, opacity: 1, rotate: 0 }}
      animate={{
        y: ['0vh', '110vh'],
        opacity: [1, 1, 0],
        rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
        x: [(Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

export default function GameOverScreen({ reason }: GameOverScreenProps) {
  const clearRun = useRunStore((s) => s.clearRun);
  const recordRunEnd = useMetaStore((s) => s.recordRunEnd);
  const recorded = useRef(false);

  // Record outcome exactly once per mount
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    recordRunEnd(reason === 'victory');
  }, [reason, recordRunEnd]);

  const isVictory = reason === 'victory';

  return (
    <main
      className={[
        'min-h-screen flex flex-col items-center justify-center gap-8 px-4 relative overflow-hidden',
        isVictory ? 'bg-amber-950' : 'bg-red-950',
      ].join(' ')}
      role="main"
      aria-live="assertive"
    >
      {/* Confetti for victory */}
      {isVictory && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {Array.from({ length: 30 }, (_, i) => (
            <ConfettiParticle key={i} index={i} />
          ))}
        </div>
      )}

      {/* Icon */}
      <motion.div
        className="text-8xl select-none"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        aria-hidden="true"
      >
        {isVictory ? '🏆' : '💀'}
      </motion.div>

      {/* Title */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h1 className={[
          'font-bold text-3xl uppercase tracking-widest',
          isVictory ? 'text-amber-300' : 'text-red-300',
        ].join(' ')}>
          {isVictory ? 'Hai conquistato la Spira!' : 'La Spira ha vinto...'}
        </h1>
        <p className={[
          'mt-2 text-sm',
          isVictory ? 'text-amber-500' : 'text-red-700',
        ].join(' ')}>
          {isVictory
            ? 'La tua leggenda riecheggerà nei secoli.'
            : 'Ogni sconfitta è un passo verso la gloria.'}
        </p>
      </motion.div>

      {/* New run button */}
      <motion.button
        type="button"
        onClick={clearRun}
        className={[
          'h-12 px-8 rounded-lg font-bold uppercase tracking-widest text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          isVictory
            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950'
            : 'bg-red-800 hover:bg-red-700 text-stone-100',
          'cursor-pointer',
        ].join(' ')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        aria-label="Inizia una nuova run"
      >
        Nuova Run
      </motion.button>
    </main>
  );
}
