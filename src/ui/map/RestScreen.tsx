import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import type { CardInstance, CardInstanceId } from '../../game/types';
import { getCard } from '../../game/content/index';

// ---- Card picker for upgrade selection ----
interface CardPickerProps {
  deck: CardInstance[];
  onPick: (iid: CardInstanceId) => void;
  onCancel: () => void;
}

function CardPicker({ deck, onPick, onCancel }: CardPickerProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-picker-heading"
      className="fixed inset-0 bg-stone-950/90 flex flex-col items-center justify-center z-50 p-4"
    >
      <h2
        id="upgrade-picker-heading"
        className="text-amber-400 font-bold text-xl mb-6 uppercase tracking-wide"
      >
        Scegli una carta da potenziare
      </h2>
      <div
        className="flex flex-wrap gap-3 justify-center max-w-lg overflow-y-auto max-h-[60vh] pb-4"
        role="list"
        aria-label="Carte nel mazzo"
      >
        {deck.map((card) => {
          const def = getCard(card.cardId);
          const name = def?.name.it ?? card.cardId;
          return (
            <button
              key={card.iid}
              type="button"
              role="listitem"
              onClick={() => onPick(card.iid)}
              disabled={card.upgraded}
              aria-label={`Potenzia ${name}${card.upgraded ? ' (già potenziata)' : ''}`}
              className={[
                'rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                card.upgraded
                  ? 'border-stone-700 text-stone-600 cursor-not-allowed bg-stone-900'
                  : 'border-stone-600 text-stone-200 bg-stone-800 hover:border-amber-500 hover:bg-stone-700 cursor-pointer',
              ].join(' ')}
            >
              {name}
              {card.upgraded && (
                <span className="ml-1 text-amber-500 text-xs">+</span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-6 text-stone-500 text-sm hover:text-stone-300 transition-colors"
        aria-label="Annulla potenziamento"
      >
        Annulla
      </button>
    </div>
  );
}

// ---- Main RestScreen ----
export default function RestScreen() {
  const run = useRunStore((s) => s.run);
  const dispatch = useRunStore((s) => s.dispatch);
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!run) return null;

  const healAmount = Math.ceil(run.maxHp * 0.3);
  const isFullHp = run.hp >= run.maxHp;
  const upgradableCards = run.deck.filter((c) => !c.upgraded);

  function handleHeal() {
    dispatch({ type: 'REST_HEAL' });
  }

  function handleUpgradePick(iid: CardInstanceId) {
    dispatch({ type: 'REST_UPGRADE', cardIid: iid });
    setShowUpgrade(false);
  }

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-8 px-4"
      role="main"
    >
      {/* Campfire icon */}
      <motion.div
        className="text-7xl select-none"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        🔥
      </motion.div>

      <div className="text-center">
        <h1 className="text-amber-400 font-bold text-2xl uppercase tracking-widest">
          Campo di Riposo
        </h1>
        <p className="text-stone-400 text-sm mt-1">
          ❤ {run.hp} / {run.maxHp}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Heal */}
        <button
          type="button"
          onClick={handleHeal}
          disabled={isFullHp}
          aria-label={isFullHp ? 'HP già al massimo' : `Cura ${healAmount} HP`}
          className={[
            'rounded-xl border-2 px-6 py-4 font-semibold text-base transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            isFullHp
              ? 'border-stone-700 text-stone-600 bg-stone-900 cursor-not-allowed'
              : 'border-red-700 text-red-300 bg-stone-900 hover:bg-stone-800 cursor-pointer',
          ].join(' ')}
        >
          <span className="block text-2xl mb-1" aria-hidden="true">❤</span>
          Cura (+{healAmount} HP)
        </button>

        {/* Upgrade */}
        <button
          type="button"
          onClick={() => setShowUpgrade(true)}
          disabled={upgradableCards.length === 0}
          aria-label={
            upgradableCards.length === 0
              ? 'Nessuna carta da potenziare'
              : 'Potenzia una carta del mazzo'
          }
          className={[
            'rounded-xl border-2 px-6 py-4 font-semibold text-base transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            upgradableCards.length === 0
              ? 'border-stone-700 text-stone-600 bg-stone-900 cursor-not-allowed'
              : 'border-blue-700 text-blue-300 bg-stone-900 hover:bg-stone-800 cursor-pointer',
          ].join(' ')}
        >
          <span className="block text-2xl mb-1" aria-hidden="true">⬆</span>
          Potenzia carta
        </button>
      </div>

      {showUpgrade && (
        <CardPicker
          deck={run.deck}
          onPick={handleUpgradePick}
          onCancel={() => setShowUpgrade(false)}
        />
      )}
    </main>
  );
}
