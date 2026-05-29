import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import { loadEvents } from '../../game/content/index';
import type { EventDefinition, EventId, CardEffect } from '../../game/types';

interface EventScreenProps {
  eventId: EventId;
  step: number;
}

export default function EventScreen({ eventId }: EventScreenProps) {
  const run = useRunStore((s) => s.run);
  const dispatch = useRunStore((s) => s.dispatch);
  const [eventDef, setEventDef] = useState<EventDefinition | null>(null);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);

  const act = run?.act ?? 1;
  useEffect(() => {
    let cancelled = false;
    loadEvents(act).then((events) => {
      if (!cancelled) {
        setEventDef(events.find((e) => e.id === eventId) ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [eventId, act]);

  if (!run) return null;

  if (!eventDef) {
    return (
      <main className="min-h-screen bg-stone-950 flex items-center justify-center" role="main">
        <p className="text-stone-400 text-sm animate-pulse">Caricamento evento...</p>
      </main>
    );
  }

  function handleChoice(choiceIndex: number) {
    if (!eventDef) return;

    const choice = eventDef.choices[choiceIndex];
    if (!choice) return;

    // Resolve outcome: pick first (deterministic for MVP; random weighting TODO)
    // A proper implementation would use the seeded RNG from run.seed
    const outcome = choice.outcomes[0];
    if (!outcome) return;

    const effects = outcome.effects as CardEffect[];

    setOutcomeText(outcome.description);

    // Small delay so the player reads the outcome before returning to map
    setTimeout(() => {
      dispatch({
        type: 'RESOLVE_EVENT',
        choiceIndex,
        outcomes: effects,
      });
    }, 1600);
  }

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-8 px-4 py-12 max-w-lg mx-auto"
      role="main"
    >
      {/* Event title */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="text-stone-400 text-xs uppercase tracking-widest mb-2">Evento</p>
        <h1 className="text-amber-400 font-bold text-2xl">{eventDef.title}</h1>
      </motion.div>

      {/* Art placeholder */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-7xl select-none"
        aria-hidden="true"
      >
        ❓
      </motion.div>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-stone-300 text-base text-center leading-relaxed max-w-sm"
      >
        {eventDef.description}
      </motion.p>

      {/* Outcome feedback */}
      {outcomeText ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-stone-800 border border-stone-600 rounded-xl px-6 py-4 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-stone-200 text-sm">{outcomeText}</p>
          <p className="text-stone-500 text-xs mt-2 animate-pulse">Torno alla mappa...</p>
        </motion.div>
      ) : (
        /* Choices */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col gap-3 w-full max-w-sm"
          role="list"
          aria-label="Scelte disponibili"
        >
          {eventDef.choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              role="listitem"
              onClick={() => handleChoice(i)}
              aria-label={choice.label}
              className={[
                'w-full text-left rounded-xl border-2 border-stone-700 bg-stone-900 px-5 py-4',
                'hover:border-amber-600 hover:bg-stone-800 transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
              ].join(' ')}
            >
              <p className="text-stone-100 font-semibold text-sm">{choice.label}</p>
              {choice.description && (
                <p className="text-stone-500 text-xs mt-1 leading-relaxed">{choice.description}</p>
              )}
            </button>
          ))}
        </motion.div>
      )}
    </main>
  );
}
