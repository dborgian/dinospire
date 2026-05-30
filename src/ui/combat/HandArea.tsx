// HandArea.tsx — Renders the player's hand with fan layout.
// Cards fan out with a rotation offset from centre; overlap increases with count.
// Draw/discard pile buttons have been moved to CombatScreen's action fascia.

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
  return (1 - dist) * 8;
}

/** Dynamic overlap based on hand size. */
function overlapRem(n: number): string {
  if (n <= 5) return "0rem";
  if (n <= 7) return "1.5rem";
  if (n <= 9) return "2.5rem";
  return "4rem";
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
}: HandAreaProps) {
  const n = cardInstances.length;
  const negMargin = overlapRem(n);

  return (
    <section
      className="flex items-end justify-center relative w-full h-full"
      aria-label="Mano del giocatore"
      style={{ overflow: "visible" }}
    >
      {/* Card fan */}
      <div
        className="flex items-end justify-center relative"
        style={{ overflow: "visible" }}
      >
        <AnimatePresence mode="popLayout">
          {cardInstances.map((instance, i) => {
            const def = cardDefs.get(instance.cardId);
            if (!def) return null;

            const rotation = fanRotation(i, n);
            const yDip = fanY(i, n);
            const isSelected = selectedIid === instance.iid;
            const isPlayable =
              energyAvailable >=
              (instance.costOverride ?? (typeof def.cost === "number" ? def.cost : 0));

            return (
              <div
                key={instance.iid}
                className={[
                  "origin-bottom transition-transform duration-150",
                  isSelected ? "z-20" : "z-10",
                  "hover:z-50",
                ].join(" ")}
                style={{
                  transform: `rotate(${rotation}deg) translateY(${yDip}px)`,
                  marginLeft: i > 0 ? `-${negMargin}` : undefined,
                  overflow: "visible",
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
    </section>
  );
}
