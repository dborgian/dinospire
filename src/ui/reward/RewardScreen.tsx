import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useRunStore } from '../../stores/runStore';
import { getRelic, getCard, loadRelics } from '../../game/content/index';
import type { Reward, RelicDefinition, Card } from '../../game/types';

// ---- Individual reward cards ----

interface CardRewardProps {
  reward: Extract<Reward, { kind: 'card' }>;
  onPick: (r: Reward) => void;
}

function CardReward({ reward, onPick }: CardRewardProps) {
  const [cardDef, setCardDef] = useState<Card | null>(null);

  useEffect(() => {
    const def = getCard(reward.cardId);
    if (def) {
      setCardDef(def);
    }
  }, [reward.cardId]);

  const typeColour: Record<string, string> = {
    attack: 'border-red-700',
    skill:  'border-blue-700',
    power:  'border-purple-700',
  };

  return (
    <button
      type="button"
      onClick={() => onPick(reward)}
      aria-label={`Scegli carta: ${cardDef?.name.it ?? reward.cardId}`}
      className={[
        'flex flex-col items-center rounded-xl bg-stone-900 border-2 p-4 w-36 gap-2',
        'cursor-pointer hover:bg-stone-800 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        cardDef ? typeColour[cardDef.type] ?? 'border-stone-600' : 'border-stone-600',
      ].join(' ')}
    >
      <div className="w-full aspect-square flex items-center justify-center bg-stone-800 rounded-lg text-4xl select-none" aria-hidden="true">
        {cardDef?.type === 'attack' ? '⚔' : cardDef?.type === 'skill' ? '🛡' : '✨'}
      </div>
      <span className="font-bold text-stone-100 text-sm text-center leading-tight">
        {cardDef?.name.it ?? reward.cardId}
      </span>
      {cardDef && (
        <span className="text-stone-500 text-xs">
          Costo {cardDef.cost}⚡
        </span>
      )}
      {cardDef && (
        <span className={[
          'text-xs px-1.5 py-0.5 rounded-full',
          cardDef.rarity === 'rare'     ? 'bg-yellow-800 text-yellow-300' :
          cardDef.rarity === 'uncommon' ? 'bg-blue-900 text-blue-300'     :
                                          'bg-stone-700 text-stone-400',
        ].join(' ')}>
          {cardDef.rarity}
        </span>
      )}
    </button>
  );
}

interface RelicRewardProps {
  reward: Extract<Reward, { kind: 'relic' }>;
  onPick: (r: Reward) => void;
}

function RelicReward({ reward, onPick }: RelicRewardProps) {
  const [relicDef, setRelicDef] = useState<RelicDefinition | null>(null);

  useEffect(() => {
    // Try synchronous lookup first; relics may already be cached
    const cached = getRelic(reward.relicId);
    if (cached) {
      setRelicDef(cached);
      return;
    }
    // Fallback: load relics then look up
    loadRelics().then(() => {
      setRelicDef(getRelic(reward.relicId) ?? null);
    });
  }, [reward.relicId]);

  return (
    <button
      type="button"
      onClick={() => onPick(reward)}
      aria-label={`Scegli reliquia: ${relicDef?.name.it ?? reward.relicId}`}
      className={[
        'flex flex-col items-center rounded-xl bg-stone-900 border-2 border-amber-700 p-4 w-36 gap-2',
        'cursor-pointer hover:bg-stone-800 transition-colors',
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

interface GoldRewardProps {
  reward: Extract<Reward, { kind: 'gold' }>;
  onPick: (r: Reward) => void;
}

function GoldReward({ reward, onPick }: GoldRewardProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(reward)}
      aria-label={`Scegli oro: ${reward.amount} monete`}
      className={[
        'flex flex-col items-center rounded-xl bg-stone-900 border-2 border-yellow-700 p-4 w-36 gap-2',
        'cursor-pointer hover:bg-stone-800 transition-colors',
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

// ---- Stagger animation wrapper ----
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
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

  function handlePick(reward: Reward | null) {
    dispatch({ type: 'PICK_REWARD', reward });
  }

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-8 px-4 py-10"
      role="main"
    >
      <h1 className="text-amber-400 font-bold text-2xl uppercase tracking-widest">
        Scegli una Ricompensa
      </h1>

      <motion.div
        className="flex flex-wrap gap-4 justify-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        role="list"
        aria-label="Ricompense disponibili"
      >
        {pool.map((reward, i) => (
          <motion.div key={i} variants={itemVariants} role="listitem">
            {reward.kind === 'card'  && <CardReward  reward={reward} onPick={handlePick} />}
            {reward.kind === 'relic' && <RelicReward reward={reward} onPick={handlePick} />}
            {reward.kind === 'gold'  && <GoldReward  reward={reward} onPick={handlePick} />}
          </motion.div>
        ))}
      </motion.div>

      <button
        type="button"
        onClick={() => handlePick(null)}
        className="text-stone-500 text-sm hover:text-stone-300 transition-colors underline underline-offset-4"
        aria-label="Salta ricompensa"
      >
        Salta
      </button>
    </main>
  );
}
