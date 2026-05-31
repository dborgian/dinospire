import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRunStore } from '../../stores/runStore';
import { getCard, loadCards, getRelic, loadRelics } from '../../game/content/index';
import { Card } from '../shared/Card';
import type { Reward, Card as CardDef, RelicDefinition, CardInstanceId } from '../../game/types';

// ---- Relic reward ----

interface RelicRewardProps {
  reward: Extract<Reward, { kind: 'relic' }>;
  onPick: (r: Reward) => void;
  disabled: boolean;
}

function RelicReward({ reward, onPick, disabled }: RelicRewardProps) {
  const [relicDef, setRelicDef] = useState<RelicDefinition | null>(null);

  useEffect(() => {
    const cached = getRelic(reward.relicId);
    if (cached) { setRelicDef(cached); return; }
    loadRelics().then(() => setRelicDef(getRelic(reward.relicId) ?? null));
  }, [reward.relicId]);

  return (
    <button
      type="button"
      onClick={() => onPick(reward)}
      disabled={disabled}
      aria-label={`Scegli reliquia: ${relicDef?.name.it ?? reward.relicId}`}
      className={[
        'flex flex-col items-center rounded-xl bg-stone-900 border-2 border-amber-700 p-4 w-36 gap-2',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:bg-stone-800 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
      ].join(' ')}
    >
      <div className="w-full aspect-square flex items-center justify-center bg-stone-800 rounded-lg text-4xl select-none" aria-hidden="true">
        {relicDef?.art?.icon ?? '🦴'}
      </div>
      <span className="font-bold text-amber-300 text-sm text-center leading-tight">
        {relicDef?.name.it ?? reward.relicId}
      </span>
      {relicDef && (
        <p className="text-stone-400 text-xs text-center line-clamp-3 leading-tight">
          {relicDef.description}
        </p>
      )}
    </button>
  );
}

// ---- Gold reward ----

interface GoldRewardProps {
  reward: Extract<Reward, { kind: 'gold' }>;
  onPick: (r: Reward) => void;
  disabled: boolean;
}

function GoldReward({ reward, onPick, disabled }: GoldRewardProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(reward)}
      disabled={disabled}
      aria-label={`Prendi oro: ${reward.amount} monete`}
      className={[
        'flex flex-col items-center rounded-xl bg-stone-900 border-2 border-yellow-700 p-4 w-36 gap-2',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:bg-stone-800 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
      ].join(' ')}
    >
      <div className="w-full aspect-square flex items-center justify-center bg-stone-800 rounded-lg text-5xl select-none" aria-hidden="true">
        💰
      </div>
      <span className="font-bold text-yellow-400 text-xl">{reward.amount}</span>
      <span className="text-stone-400 text-xs">monete</span>
    </button>
  );
}

// ---- Card reward — uses the full Card component ----

interface CardRewardProps {
  reward: Extract<Reward, { kind: 'card' }>;
  cardDefs: Map<string, CardDef>;
  onPick: (r: Reward) => void;
  disabled: boolean;
}

function CardReward({ reward, cardDefs, onPick, disabled }: CardRewardProps) {
  const def = cardDefs.get(reward.cardId);
  if (!def) {
    // Definition not loaded yet — show placeholder
    return (
      <div className="flex flex-col items-center rounded-xl bg-stone-900 border-2 border-stone-600 p-4 w-36 gap-2 animate-pulse">
        <div className="w-full aspect-[5/7] bg-stone-800 rounded-lg" />
        <span className="text-stone-500 text-xs">{reward.cardId}</span>
      </div>
    );
  }

  const instance = {
    iid: `reward_${reward.cardId}` as CardInstanceId,
    cardId: reward.cardId,
    upgraded: false,
    temporary: false,
  };

  const selectHandler = disabled ? {} : { onSelect: () => onPick(reward) };

  return (
    <Card
      instance={instance}
      definition={def}
      state="hand"
      isPlayable={!disabled}
      {...selectHandler}
    />
  );
}

// ---- Stagger animation ----

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const itemVariants = {
  hidden:  { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: 'spring' as const, stiffness: 280, damping: 22 } },
};

// ---- Main RewardScreen ----

interface RewardScreenProps {
  pool: Reward[];
}

export default function RewardScreen({ pool }: RewardScreenProps) {
  const dispatch = useRunStore((s) => s.dispatch);
  const run      = useRunStore((s) => s.run);
  const [cardDefs, setCardDefs] = useState<Map<string, CardDef>>(new Map());
  // Prevent double-dispatch: once any reward is picked, lock the UI until the
  // pool prop updates (which happens synchronously after the store update).
  const pickingRef = useRef(false);

  // Reset the lock whenever the pool changes (a pick was processed and the
  // store emitted a new pool).
  useEffect(() => {
    pickingRef.current = false;
  }, [pool]);

  // Load definitions for all card rewards in the pool
  useEffect(() => {
    const cardRewards = pool.filter((r): r is Extract<Reward, { kind: 'card' }> => r.kind === 'card');
    if (cardRewards.length === 0) return;

    // Try synchronous lookup first (registry already populated by combat)
    const map = new Map<string, CardDef>();
    let allFound = true;
    for (const r of cardRewards) {
      const def = getCard(r.cardId);
      if (def) { map.set(r.cardId, def); }
      else { allFound = false; }
    }
    if (allFound) { setCardDefs(map); return; }

    // Fallback: async load
    const act = run?.act ?? 1;
    loadCards(act).then((cards) => {
      const full = new Map<string, CardDef>();
      for (const r of cardRewards) {
        const def = cards.find((c) => c.id === r.cardId);
        if (def) full.set(r.cardId, def);
      }
      setCardDefs(full);
    });
  }, [pool, run?.act]);

  const cardRewards  = pool.filter((r): r is Extract<Reward, { kind: 'card' }>  => r.kind === 'card');
  const goldRewards  = pool.filter((r): r is Extract<Reward, { kind: 'gold' }>  => r.kind === 'gold');
  const relicRewards = pool.filter((r): r is Extract<Reward, { kind: 'relic' }> => r.kind === 'relic');

  function handlePick(reward: Reward | null) {
    // UI-level guard: reject any click that arrives while we're waiting for
    // the store to process the previous pick (machine.ts has a matching pool
    // guard as a second line of defence).
    if (pickingRef.current) return;
    pickingRef.current = true;
    dispatch({ type: 'PICK_REWARD', reward });
  }

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-8 px-4 py-10"
      role="main"
    >
      {/* Gold + relic — auto-pick row */}
      {(goldRewards.length > 0 || relicRewards.length > 0) && (
        <motion.div
          className="flex flex-wrap gap-4 justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {goldRewards.map((r, i) => (
            <motion.div key={`gold-${i}`} variants={itemVariants}>
              <GoldReward reward={r} onPick={handlePick} disabled={pickingRef.current} />
            </motion.div>
          ))}
          {relicRewards.map((r, i) => (
            <motion.div key={`relic-${i}`} variants={itemVariants}>
              <RelicReward reward={r} onPick={handlePick} disabled={pickingRef.current} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Card choice */}
      {cardRewards.length > 0 && (
        <>
          <h1 className="text-amber-400 font-bold text-2xl uppercase tracking-widest">
            Scegli una carta
          </h1>
          <motion.div
            className="flex flex-wrap gap-6 justify-center"
            role="list"
            aria-label="Carte disponibili"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {cardRewards.map((r, i) => (
              <motion.div key={`card-${i}`} variants={itemVariants} role="listitem">
                <CardReward reward={r} cardDefs={cardDefs} onPick={handlePick} disabled={pickingRef.current} />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}

      <button
        type="button"
        onClick={() => handlePick(null)}
        disabled={pickingRef.current}
        className={[
          'text-stone-500 text-sm transition-colors underline underline-offset-4',
          pickingRef.current ? 'opacity-50 cursor-not-allowed' : 'hover:text-stone-300',
        ].join(' ')}
        aria-label="Salta ricompensa"
      >
        Salta
      </button>
    </main>
  );
}
