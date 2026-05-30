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
  /** When provided, only cards where filterFn returns true are selectable. */
  filterFn?: (card: CardInstance) => boolean;
  heading?: string;
  confirmLabel?: string;
}

function CardPicker({
  deck,
  onPick,
  onCancel,
  filterFn,
  heading = 'Scegli una carta da potenziare',
}: CardPickerProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-picker-heading"
      className="fixed inset-0 bg-stone-950/90 flex flex-col items-center justify-center z-50 p-4"
    >
      <h2
        id="card-picker-heading"
        className="text-amber-400 font-bold text-xl mb-6 uppercase tracking-wide"
      >
        {heading}
      </h2>
      <div
        className="flex flex-wrap gap-3 justify-center max-w-lg overflow-y-auto max-h-[60vh] pb-4"
        role="list"
        aria-label="Carte nel mazzo"
      >
        {deck.map((card) => {
          const def = getCard(card.cardId);
          const name = def?.name.it ?? card.cardId;
          const isDisabled = filterFn ? !filterFn(card) : card.upgraded;
          return (
            <button
              key={card.iid}
              type="button"
              role="listitem"
              onClick={() => !isDisabled && onPick(card.iid)}
              disabled={isDisabled}
              aria-label={`${name}${card.upgraded ? ' (potenziata)' : ''}`}
              className={[
                'rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                isDisabled
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
        aria-label="Annulla"
      >
        Annulla
      </button>
    </div>
  );
}

type PickerMode = 'upgrade' | 'remove' | null;

// ---- Main RestScreen ----
export default function RestScreen() {
  const run = useRunStore((s) => s.run);
  const dispatch = useRunStore((s) => s.dispatch);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  if (!run) return null;

  const healAmount = Math.ceil(run.maxHp * 0.3);
  const isFullHp = run.hp >= run.maxHp;
  const upgradableCards = run.deck.filter((c) => !c.upgraded);
  const canRemove = run.deck.length > 5;

  function handleHeal() {
    dispatch({ type: 'REST_HEAL' });
  }

  function handleUpgradePick(iid: CardInstanceId) {
    dispatch({ type: 'REST_UPGRADE', cardIid: iid });
    setPickerMode(null);
  }

  function handleRemovePick(iid: CardInstanceId) {
    dispatch({ type: 'REST_REMOVE', cardIid: iid });
    setPickerMode(null);
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
          onClick={() => setPickerMode('upgrade')}
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

        {/* Remove */}
        <button
          type="button"
          onClick={() => setPickerMode('remove')}
          disabled={!canRemove}
          aria-label={
            !canRemove
              ? 'Mazzo troppo piccolo per rimuovere'
              : 'Rimuovi una carta dal mazzo'
          }
          className={[
            'rounded-xl border-2 px-6 py-4 font-semibold text-base transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            !canRemove
              ? 'border-stone-700 text-stone-600 bg-stone-900 cursor-not-allowed'
              : 'border-orange-700 text-orange-300 bg-stone-900 hover:bg-stone-800 cursor-pointer',
          ].join(' ')}
        >
          <span className="block text-2xl mb-1" aria-hidden="true">🗑</span>
          Rimuovi carta
        </button>
      </div>

      {pickerMode === 'upgrade' && (
        <CardPicker
          deck={run.deck}
          onPick={handleUpgradePick}
          onCancel={() => setPickerMode(null)}
        />
      )}

      {pickerMode === 'remove' && (
        <CardPicker
          deck={run.deck}
          onPick={handleRemovePick}
          onCancel={() => setPickerMode(null)}
          filterFn={() => true}
          heading="Scegli una carta da rimuovere"
        />
      )}
    </main>
  );
}
