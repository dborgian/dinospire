import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import { loadHeroes } from '../../game/content/index';
import type { HeroDefinition, EvolutionStage } from '../../game/types';

const NEXT_STAGE: Record<EvolutionStage, EvolutionStage> = {
  cucciolo: 'adulto',
  adulto:   'prime',
  prime:    'prime', // already max
};

const STAGE_LABELS: Record<EvolutionStage, string> = {
  cucciolo: 'Cucciolo',
  adulto:   'Adulto',
  prime:    'Prime',
};

export default function GrowthScreen() {
  const run = useRunStore((s) => s.run);
  const dispatch = useRunStore((s) => s.dispatch);
  const [heroDef, setHeroDef] = useState<HeroDefinition | null>(null);

  useEffect(() => {
    if (!run) return;
    loadHeroes().then((heroes) => {
      setHeroDef(heroes.find((h) => h.id === run.heroId) ?? null);
    });
  }, [run?.heroId]);

  if (!run) return null;

  const currentStage = run.evolutionStage;
  const nextStage = NEXT_STAGE[currentStage];
  const isMaxStage = currentStage === 'prime';

  const currentStats = heroDef?.stages[currentStage];
  const nextStats    = heroDef?.stages[nextStage];

  function handleContinue() {
    if (!nextStats) return;
    dispatch({ type: 'GROWTH_EVOLVE', newMaxHp: nextStats.hp });
  }

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-8 px-4 text-center"
      role="main"
    >
      {/* Animated header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <p className="text-stone-400 text-sm uppercase tracking-widest mb-2">Nodo di Evoluzione</p>
        <h1 className="text-amber-400 font-bold text-3xl uppercase tracking-wide">
          La Crescita
        </h1>
      </motion.div>

      {/* Dino silhouette pulsing */}
      <motion.div
        className="text-7xl select-none"
        aria-hidden="true"
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
      >
        🌿
      </motion.div>

      {/* Hero name + evolution narrative */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="flex flex-col gap-2"
      >
        <p className="text-stone-200 text-lg">
          <span className="text-amber-300 font-bold">{heroDef?.name.it ?? run.heroId}</span>
          {isMaxStage
            ? ' ha già raggiunto la forma Prime.'
            : ` evolve da ${STAGE_LABELS[currentStage]} a ${STAGE_LABELS[nextStage]}.`}
        </p>
      </motion.div>

      {/* Stats delta */}
      {currentStats && nextStats && !isMaxStage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="bg-stone-900 border border-stone-700 rounded-xl px-8 py-5 flex flex-col gap-3 text-sm min-w-[200px]"
          aria-label="Statistiche evoluzione"
        >
          <h2 className="text-stone-400 uppercase tracking-widest text-xs mb-1">Statistiche</h2>
          <StatRow label="HP" before={currentStats.hp} after={nextStats.hp} />
          <StatRow label="⚡ Energia" before={currentStats.energyPerTurn} after={nextStats.energyPerTurn} />
          <StatRow label="Carte in mano" before={currentStats.handSize} after={nextStats.handSize} />
        </motion.div>
      )}

      {/* Passive description for next stage */}
      {nextStats && !isMaxStage && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="text-stone-400 text-xs max-w-xs italic"
        >
          "{nextStats.passiveDescription}"
        </motion.p>
      )}

      {/* Continue button */}
      <motion.button
        type="button"
        onClick={handleContinue}
        className={[
          'h-12 px-8 rounded-lg font-bold uppercase tracking-widest text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          'bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer',
        ].join(' ')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        aria-label="Continua dopo l'evoluzione"
      >
        Continua →
      </motion.button>
    </main>
  );
}

// ---- Stat row ----
interface StatRowProps {
  label: string;
  before: number;
  after: number;
}

function StatRow({ label, before, after }: StatRowProps) {
  const delta = after - before;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-stone-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-stone-300">{before}</span>
        <span className="text-stone-600">→</span>
        <span className={delta > 0 ? 'text-green-400 font-bold' : delta < 0 ? 'text-red-400 font-bold' : 'text-stone-300'}>
          {after}
        </span>
        {delta !== 0 && (
          <span className={`text-xs ${delta > 0 ? 'text-green-500' : 'text-red-500'}`}>
            ({delta > 0 ? '+' : ''}{delta})
          </span>
        )}
      </span>
    </div>
  );
}
