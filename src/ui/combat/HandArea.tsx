// HandArea.tsx — Renders the player's hand with fan layout.
// Cards fan out with a rotation offset from centre; on mobile (>5 cards)
// they scale down slightly to remain tappable.

import { AnimatePresence } from "framer-motion";
import { Card } from "../shared/Card";
import type { Card as CardDef, CardId, CardInstance, CardInstanceId } from "@/game/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandAreaProps {
  cardInstances: CardInstance[];
  cardDefs: Map<CardId, CardDef>;
  selectedIid: CardInstanceId | null;
  energyAvailable: number;
  onCardSelect: (iid: CardInstanceId) => void;
  drawCount: number;
  discardCount: number;
  onDrawPileClick?: () => void;
  onDiscardClick?: () => void;
}

// ---------------------------------------------------------------------------
// Fan layout helpers
// ---------------------------------------------------------------------------

/** Rotation in degrees for card at position i in a hand of size n. */
function fanRotation(i: number, n: number): number {
  if (n <= 1) return 0;
  const spread = Math.min(12, (n - 1) * 4); // max ±12°
  const step = (spread * 2) / (n - 1);
  return -spread + i * step;
}

/** Vertical offset (px) to arc the fan — centre cards dip slightly. */
function fanY(i: number, n: number): number {
  if (n <= 1) return 0;
  const mid = (n - 1) / 2;
  const dist = Math.abs(i - mid) / mid; // 0 at centre, 1 at edges
  // Centre card is highest (y=0 relative), edges dip down
  return (1 - dist) * 8;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HandArea({
  cardInstances,
  cardDefs,
  selectedIid,
  energyAvailable,
  onCardSelect,
  drawCount,
  discardCount,
  onDrawPileClick,
  onDiscardClick,
}: HandAreaProps) {
  const n = cardInstances.length;
  // On mobile with many cards, shrink slightly
  const manyCards = n > 5;

  return (
    <section
      className="flex items-end justify-center gap-2 relative w-full px-4 pb-4"
      aria-label="Mano del giocatore"
    >
      {/* Draw pile counter */}
      <button
        type="button"
        onClick={onDrawPileClick}
        className="flex-shrink-0 flex flex-col items-center gap-0.5 mb-2 text-stone-400 hover:text-stone-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        aria-label={`Mazzo: ${drawCount} carte`}
      >
        <span className="text-lg" aria-hidden="true">📥</span>
        <span className="text-xs font-bold tabular-nums">{drawCount}</span>
      </button>

      {/* Card fan — overlap on mobile via per-card negative marginLeft */}
      <div className="flex items-end justify-center relative gap-1">
        <AnimatePresence mode="popLayout">
          {cardInstances.map((instance, i) => {
            const def = cardDefs.get(instance.cardId);
            if (!def) return null;

            const rotation = fanRotation(i, n);
            const yDip = fanY(i, n);
            const isSelected = selectedIid === instance.iid;
            const isPlayable = energyAvailable >= (instance.costOverride ?? (typeof def.cost === "number" ? def.cost : 0));

            return (
              <div
                key={instance.iid}
                className={[
                  "origin-bottom transition-transform duration-150",
                  // Selected card rises above fan
                  isSelected ? "z-20" : "z-10",
                  manyCards ? "scale-90" : "",
                ].join(" ")}
                style={{
                  transform: `rotate(${rotation}deg) translateY(${yDip}px)`,
                  // Negative margin to overlap on mobile
                  marginLeft: manyCards && i > 0 ? "-1.25rem" : undefined,
                }}
              >
                <Card
                  instance={instance}
                  definition={def}
                  state="hand"
                  isSelected={isSelected}
                  isPlayable={isPlayable}
                  onSelect={() => onCardSelect(instance.iid)}
                  index={i}
                />
              </div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Discard pile counter */}
      <button
        type="button"
        onClick={onDiscardClick}
        className="flex-shrink-0 flex flex-col items-center gap-0.5 mb-2 text-stone-400 hover:text-stone-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        aria-label={`Scarti: ${discardCount} carte`}
      >
        <span className="text-lg" aria-hidden="true">📤</span>
        <span className="text-xs font-bold tabular-nums">{discardCount}</span>
      </button>
    </section>
  );
}
