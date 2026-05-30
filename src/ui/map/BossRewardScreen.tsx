// ---------------------------------------------------------------------------
// BossRewardScreen — shown after beating the boss: pick one ancestral relic.
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import { contentRegistry, loadRelics } from '../../game/content/index';
import type { RelicId, RelicDefinition } from '../../game/types';

interface RelicCardProps {
  relic: RelicDefinition;
  selected: boolean;
  onSelect: () => void;
}

function RelicCard({ relic, selected, onSelect }: RelicCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className={[
        'relative flex flex-col gap-3 rounded-2xl border-2 p-5 text-left transition-all cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        'w-64',
        selected
          ? 'bg-amber-900/80 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.5)]'
          : 'bg-stone-900/90 border-stone-600 hover:border-amber-600',
      ].join(' ')}
      aria-pressed={selected}
      aria-label={`Scegli ${relic.name.it}`}
    >
      {/* Tier badge */}
      <span className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-700">
        Ancestrale
      </span>

      {/* Icon */}
      <div className="text-5xl" aria-hidden="true">
        {relic.art?.icon === 'Egg'          ? '🥚'
        : relic.art?.icon === 'Droplets'    ? '💧'
        : relic.art?.icon === 'Crown'       ? '👑'
        : relic.art?.icon === 'Gem'         ? '💎'
        : '🦴'}
      </div>

      {/* Name */}
      <h3 className="font-black text-lg text-amber-300 leading-tight">
        {relic.name.it}
      </h3>

      {/* Description */}
      <p className="text-sm text-stone-300 leading-relaxed">
        {relic.description}
      </p>
    </motion.button>
  );
}

export default function BossRewardScreen() {
  const run       = useRunStore((s) => s.run);
  const dispatch  = useRunStore((s) => s.dispatch);
  const [relicDefs, setRelicDefs] = useState<RelicDefinition[]>([]);
  const [picked, setPicked] = useState<RelicId | null>(null);

  const options = run?.phase.t === 'bossReward' ? run.phase.options : [];

  // Ensure relics are loaded (they should be from initContent, but just in case)
  useEffect(() => {
    void loadRelics().then(() => {
      const defs = options
        .map((id) => contentRegistry.relics.get(id))
        .filter((d): d is RelicDefinition => d !== undefined);
      setRelicDefs(defs);
    });
  // options changes when run phase changes — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.join(',')]);

  function handleConfirm() {
    dispatch({ type: 'PICK_BOSS_REWARD', relicId: picked });
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 bg-stone-950 relative overflow-hidden"
      role="main"
    >
      {/* Atmospheric glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(251,191,36,0.08) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Header */}
      <motion.div
        className="text-center z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-2">
          Reliquia Ancestrale
        </p>
        <h1 className="text-3xl font-black text-amber-300 uppercase tracking-widest">
          Scegli il tuo Retaggio
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Il boss è caduto. Una reliquia delle ere primordiali ti attende.
        </p>
      </motion.div>

      {/* Relic choices */}
      <div className="flex flex-wrap justify-center gap-6 z-10">
        {relicDefs.map((relic) => (
          <RelicCard
            key={relic.id}
            relic={relic}
            selected={picked === relic.id}
            onSelect={() => setPicked(relic.id)}
          />
        ))}
        {relicDefs.length === 0 && (
          <p className="text-stone-600 text-sm animate-pulse">Caricamento reliquie…</p>
        )}
      </div>

      {/* Confirm / Skip */}
      <motion.div
        className="flex gap-4 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={picked === null}
          className={[
            'h-12 px-8 rounded-xl font-black uppercase tracking-wider text-sm transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            picked !== null
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/30 active:scale-95 cursor-pointer'
              : 'bg-stone-800 text-stone-600 cursor-not-allowed',
          ].join(' ')}
          aria-label={picked ? `Prendi ${contentRegistry.relics.get(picked)?.name.it ?? 'reliquia'}` : 'Seleziona una reliquia'}
        >
          {picked ? 'Prendi' : 'Scegli una reliquia'}
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'PICK_BOSS_REWARD', relicId: null })}
          className="h-12 px-6 rounded-xl font-semibold text-sm text-stone-500 hover:text-stone-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 cursor-pointer"
          aria-label="Salta reliquia"
        >
          Salta
        </button>
      </motion.div>
    </main>
  );
}
