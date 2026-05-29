// Card.tsx — Single playable card component for DinoSpire.
// Visual language mirrors DinoDex dinosaur-card.tsx (stone palette, border-per-rarity,
// PhyloPic silhouette) adapted for the deckbuilder context (cost, type, effects, tags).

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import type { Card, CardInstance, CardRarity, CardType, CardTag, EnemyId, CardInstanceId } from "@/game/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardProps {
  instance: CardInstance;
  definition: Card;
  state?: "hand" | "reward" | "exhaust" | "deck-preview";
  isSelected?: boolean;
  isPlayable?: boolean;
  onSelect?: () => void;
  onPlay?: (targetId?: EnemyId) => void;
  index?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_STYLES: Record<CardRarity, { border: string; badge: string; badgeText: string }> = {
  starter: { border: "border-stone-600",  badge: "bg-stone-700 text-stone-300",  badgeText: "STARTER"  },
  common:  { border: "border-stone-600",  badge: "bg-stone-700 text-stone-300",  badgeText: "COMUNE"   },
  uncommon: { border: "border-blue-400",  badge: "bg-blue-900  text-blue-300",   badgeText: "NON COMUNE" },
  rare:    { border: "border-amber-400",  badge: "bg-amber-900 text-amber-300",  badgeText: "RARO"     },
};

const TYPE_STYLES: Record<CardType, { label: string; color: string }> = {
  attack: { label: "Attacco", color: "text-red-400"   },
  skill:  { label: "Abilità", color: "text-blue-400"  },
  power:  { label: "Potere",  color: "text-amber-400" },
};

const TAG_LABEL: Record<CardTag, string> = {
  carnivoro:     "🩸 CARNIVORO",
  erbivoro:      "🌿 ERBIVORO",
  theropode:     "🦖 THEROPODE",
  dromeosauride: "⚡ DROMEOSAURIDE",
  sauropode:     "🌍 SAUROPODE",
  ankylosauro:   "🛡 ANKYLOSAURO",
  ceratopside:   "🦏 CERATOPSIDE",
  stegosauro:    "🗡 STEGOSAURO",
  spinosauride:  "💧 SPINOSAURIDE",
  triassico:     "🌑 TRIASSICO",
  giurassico:    "🌿 GIURASSICO",
  cretaceo:      "☄ CRETACEO",
  branco:        "👥 BRANCO",
  compagno:      "🤝 COMPAGNO",
  furtivo:       "👁 FURTIVO",
  predatore:     "🎯 PREDATORE",
  mandria:       "🐘 MANDRIA",
};

// ---------------------------------------------------------------------------
// Effect text renderer (best-effort readable summary from effect list)
// ---------------------------------------------------------------------------

function effectSummary(def: Card): string {
  const parts: string[] = [];
  const effects = def.upgraded ? def.upgraded.effects : def.effects;

  for (const eff of effects) {
    if (eff.kind === "damage") {
      const amt = typeof eff.amount === "number" ? eff.amount : "X";
      parts.push(`Infliggi ${amt} danni.`);
    } else if (eff.kind === "block") {
      const amt = typeof eff.amount === "number" ? eff.amount : "X";
      parts.push(`Guadagna ${amt} blocco.`);
    } else if (eff.kind === "draw") {
      parts.push(`Pesca ${eff.n} ${eff.n === 1 ? "carta" : "carte"}.`);
    } else if (eff.kind === "gainEnergy") {
      parts.push(`+${eff.n} ⚡ Energia.`);
    } else if (eff.kind === "applyStatus") {
      const stacks = typeof eff.stacks === "number" ? eff.stacks : "X";
      parts.push(`Applica ${stacks} ${eff.status}.`);
    } else if (eff.kind === "heal") {
      const amt = typeof eff.amount === "number" ? eff.amount : "X";
      parts.push(`Cura ${amt} HP.`);
    } else if (eff.kind === "exhaust") {
      parts.push("Esaurisci questa carta.");
    } else if (eff.kind === "conditional") {
      parts.push("Effetto condizionale.");
    } else if (eff.kind === "synergy") {
      parts.push("Sinergia di branco.");
    } else if (eff.kind === "repeat") {
      parts.push("Ripeti effetto.");
    }
  }

  return parts.join(" ") || "Effetto speciale.";
}

// ---------------------------------------------------------------------------
// Cost badge
// ---------------------------------------------------------------------------

function CostBadge({ cost }: { cost: number | "X" }) {
  return (
    <span
      className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-stone-950 text-xs font-black leading-none select-none"
      aria-label={`Costo energia: ${cost}`}
    >
      {cost}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

export function Card({ instance, definition, state = "hand", isSelected = false, isPlayable = true, onSelect, index = 0 }: CardProps) {
  const prefersReduced = useReducedMotion();
  const [imgErr, setImgErr] = useState(false);

  const rarity = RARITY_STYLES[definition.rarity];
  const typeStyle = TYPE_STYLES[definition.type];

  // Local generated art takes priority; PhyloPic as fallback
  const localArtUrl = `/art/cards/${definition.id}.png`;
  const [localArtErr, setLocalArtErr] = useState(false);
  const phylopicUuid = definition.art?.phylopicUuid;
  const silhouetteUrl = !localArtErr
    ? localArtUrl
    : phylopicUuid && !imgErr
      ? `https://images.phylopic.org/images/${phylopicUuid}/thumbnail/192x192.png`
      : null;

  const isExhausted = state === "exhaust";

  // Framer Motion variants — typed explicitly so exactOptionalPropertyTypes
  // doesn't widen the union to include `undefined` for absent keys.
  const drawVariants: Pick<MotionProps, "initial" | "animate"> = prefersReduced
    ? {}
    : {
        initial: { y: 60, opacity: 0 },
        animate: { y: 0, opacity: 1, transition: { delay: index * 0.06, duration: 0.22, ease: "easeOut" } },
      };

  const hoverAnim: Pick<MotionProps, "whileHover"> = prefersReduced
    ? {}
    : { whileHover: { y: -12, scale: 1.08 } };

  const transitionProp: Pick<MotionProps, "transition"> = prefersReduced
    ? {}
    : { transition: { duration: 0.18, ease: "easeOut" } };

  const selectedStyle = isSelected
    ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-stone-950"
    : "";

  const playableStyle = !isPlayable && !isExhausted
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer";

  const exhaustStyle = isExhausted
    ? "grayscale opacity-40 cursor-default"
    : "";

  const selectedYOffset = isSelected && !prefersReduced ? "-translate-y-5" : "";

  function handleClick() {
    if (isExhausted || !onSelect) return;
    onSelect();
  }

  return (
    <motion.article
      {...drawVariants}
      {...hoverAnim}
      {...transitionProp}
      className={[
        // Base dimensions — 140px wide, 3:4.5 aspect ~= 210px tall; scales via rem
        "relative flex flex-col w-[8.75rem] h-[13.125rem] rounded-xl border-2 overflow-hidden select-none",
        "bg-stone-900",
        rarity.border,
        selectedStyle,
        selectedYOffset,
        playableStyle,
        exhaustStyle,
        "transition-all duration-150",
      ].filter(Boolean).join(" ")}
      onClick={handleClick}
      role="button"
      tabIndex={isExhausted ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={!isPlayable || isExhausted}
      aria-label={`${definition.name.it}, costo ${definition.cost}, ${typeStyle.label}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
    >
      {/* ── Top row: cost + rarity badge ── */}
      <div className="flex items-center justify-between px-1.5 pt-1.5 pb-0.5 shrink-0">
        <CostBadge cost={instance.costOverride ?? definition.cost} />
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${rarity.badge} leading-none tracking-wide`}>
          {rarity.badgeText}
        </span>
      </div>

      {/* ── Art area ── */}
      <div className="mx-1.5 rounded-lg bg-stone-800 flex items-center justify-center overflow-hidden"
           style={{ height: "5.5rem" }}>
        {silhouetteUrl ? (
          <img
            src={silhouetteUrl}
            alt={`Arte di ${definition.name.it}`}
            className={[
              "w-full h-full object-cover",
              localArtErr ? "object-contain opacity-85 drop-shadow" : "object-cover",
            ].join(" ")}
            onError={() => {
              if (!localArtErr) {
                setLocalArtErr(true);
              } else {
                setImgErr(true);
              }
            }}
          />
        ) : (
          <span className="text-3xl opacity-30 select-none" aria-hidden="true">🦴</span>
        )}
      </div>

      {/* ── Name ── */}
      <div className="px-2 pt-1 shrink-0">
        <p
          className="text-[11px] font-black text-stone-100 leading-tight line-clamp-1 tracking-wide"
          style={{ fontFamily: "'Cinzel', 'Georgia', serif" }}
        >
          {definition.name.it}
          {instance.upgraded && <span className="text-amber-400">+</span>}
        </p>
      </div>

      {/* ── Type line ── */}
      <div className="px-2 py-0.5 shrink-0">
        <p className={`text-[9px] font-semibold tracking-widest ${typeStyle.color} text-center`}>
          ─── {typeStyle.label} ───
        </p>
      </div>

      {/* ── Effect text ── */}
      <div className="px-2 flex-1 overflow-hidden">
        <p className="text-[10px] text-stone-300 leading-snug line-clamp-3">
          {effectSummary(definition)}
        </p>
      </div>

      {/* ── Tags ── */}
      {definition.tags.length > 0 && (
        <div className="px-1.5 pb-1.5 flex flex-wrap gap-0.5 shrink-0">
          {definition.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[9px] bg-stone-800 text-stone-400 rounded px-1 py-0.5 leading-none"
            >
              {TAG_LABEL[tag]}
            </span>
          ))}
        </div>
      )}
    </motion.article>
  );
}
