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
// Constants (used only for HTML fallback rendering)
// ---------------------------------------------------------------------------

const RARITY_STYLES: Record<CardRarity, { border: string; badge: string; badgeText: string }> = {
  starter:  { border: "border-stone-600",  badge: "bg-stone-700 text-stone-300",  badgeText: "STARTER"    },
  common:   { border: "border-stone-600",  badge: "bg-stone-700 text-stone-300",  badgeText: "COMUNE"     },
  uncommon: { border: "border-blue-400",   badge: "bg-blue-900  text-blue-300",   badgeText: "NON COMUNE" },
  rare:     { border: "border-amber-400",  badge: "bg-amber-900 text-amber-300",  badgeText: "RARO"       },
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
// Effect text renderer
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
      parts.push("Esaurisci.");
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
// Cost badge (shown both in full-card overlay and HTML fallback)
// ---------------------------------------------------------------------------

function CostBadge({ cost }: { cost: number | "X" }) {
  return (
    <span
      className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-stone-950 text-sm font-black leading-none select-none shadow-lg shadow-amber-900/60"
      aria-label={`Costo energia: ${cost}`}
    >
      {cost}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FullCard — renders when /art/full-cards/{id}.png exists
// Shows the AI-generated complete card image with a thin dynamic overlay.
// ---------------------------------------------------------------------------

interface FullCardProps {
  cardId: string;
  instance: CardInstance;
  definition: Card;
  selectedStyle: string;
  selectedYOffset: string;
  playableStyle: string;
  exhaustStyle: string;
  drawVariants: Pick<MotionProps, "initial" | "animate">;
  hoverAnim: Pick<MotionProps, "whileHover">;
  transitionProp: Pick<MotionProps, "transition">;
  onFallback: () => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isExhausted: boolean;
  isPlayable: boolean;
  isSelected: boolean;
  displayedCost: number | "X";
}

function FullCard({
  cardId, instance, definition,
  selectedStyle, selectedYOffset, playableStyle, exhaustStyle,
  drawVariants, hoverAnim, transitionProp,
  onFallback, onClick, onKeyDown,
  isExhausted, isPlayable, isSelected, displayedCost,
}: FullCardProps) {
  const typeStyle = TYPE_STYLES[definition.type];
  const costIsOverridden = instance.costOverride !== undefined;

  return (
    <motion.article
      {...drawVariants}
      {...hoverAnim}
      {...transitionProp}
      className={[
        "relative w-[8.75rem] h-[13.125rem] rounded-xl overflow-hidden select-none",
        selectedStyle,
        selectedYOffset,
        playableStyle,
        exhaustStyle,
        "transition-all duration-150",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      role="button"
      tabIndex={isExhausted ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={!isPlayable || isExhausted}
      aria-label={`${definition.name.it}, costo ${displayedCost}, ${typeStyle.label}`}
      onKeyDown={onKeyDown}
    >
      {/* Full card image as background */}
      <img
        src={`/art/full-cards/${cardId}.png`}
        alt={definition.name.it}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
        onError={onFallback}
      />

      {/* ── Dynamic overlay (only visible when values differ from the baked image) ── */}

      {/* Cost override badge — shown only if a relic/effect changed the cost */}
      {costIsOverridden && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <CostBadge cost={displayedCost} />
        </div>
      )}

      {/* Upgraded indicator */}
      {instance.upgraded && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-amber-400 text-stone-950 text-xs font-black flex items-center justify-center shadow">
          +
        </div>
      )}

      {/* Unplayable dark tint (energy too low) — layered above image */}
      {!isPlayable && !isExhausted && (
        <div className="absolute inset-0 bg-stone-950/50 rounded-xl pointer-events-none" />
      )}
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// HtmlCard — classic HTML-rendered card (fallback when no full-card image)
// ---------------------------------------------------------------------------

interface HtmlCardProps {
  instance: CardInstance;
  definition: Card;
  selectedStyle: string;
  selectedYOffset: string;
  playableStyle: string;
  exhaustStyle: string;
  drawVariants: Pick<MotionProps, "initial" | "animate">;
  hoverAnim: Pick<MotionProps, "whileHover">;
  transitionProp: Pick<MotionProps, "transition">;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isExhausted: boolean;
  isPlayable: boolean;
  isSelected: boolean;
  displayedCost: number | "X";
}

function HtmlCard({
  instance, definition,
  selectedStyle, selectedYOffset, playableStyle, exhaustStyle,
  drawVariants, hoverAnim, transitionProp,
  onClick, onKeyDown,
  isExhausted, isPlayable, isSelected, displayedCost,
}: HtmlCardProps) {
  const [imgErr, setImgErr] = useState(false);
  const [localArtErr, setLocalArtErr] = useState(false);

  const rarity = RARITY_STYLES[definition.rarity];
  const typeStyle = TYPE_STYLES[definition.type];

  const localArtUrl = `/art/cards/${definition.id}.png`;
  const phylopicUuid = definition.art?.phylopicUuid;
  const silhouetteUrl = !localArtErr
    ? localArtUrl
    : phylopicUuid && !imgErr
      ? `https://images.phylopic.org/images/${phylopicUuid}/thumbnail/192x192.png`
      : null;

  return (
    <motion.article
      {...drawVariants}
      {...hoverAnim}
      {...transitionProp}
      className={[
        "relative flex flex-col w-[8.75rem] h-[13.125rem] rounded-xl border-2 overflow-hidden select-none",
        "bg-stone-900",
        rarity.border,
        selectedStyle,
        selectedYOffset,
        playableStyle,
        exhaustStyle,
        "transition-all duration-150",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      role="button"
      tabIndex={isExhausted ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={!isPlayable || isExhausted}
      aria-label={`${definition.name.it}, costo ${displayedCost}, ${typeStyle.label}`}
      onKeyDown={onKeyDown}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-1.5 pt-1.5 pb-0.5 shrink-0">
        <CostBadge cost={displayedCost} />
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${rarity.badge} leading-none tracking-wide`}>
          {rarity.badgeText}
        </span>
      </div>

      {/* Art area */}
      <div className="mx-1.5 rounded-lg bg-stone-800 flex items-center justify-center overflow-hidden"
           style={{ height: "5.5rem" }}>
        {silhouetteUrl ? (
          <img
            src={silhouetteUrl}
            alt={`Arte di ${definition.name.it}`}
            className={[
              "w-full h-full",
              localArtErr ? "object-contain opacity-85 drop-shadow" : "object-cover",
            ].join(" ")}
            onError={() => {
              if (!localArtErr) setLocalArtErr(true);
              else setImgErr(true);
            }}
          />
        ) : (
          <span className="text-3xl opacity-30 select-none" aria-hidden="true">🦴</span>
        )}
      </div>

      {/* Name */}
      <div className="px-2 pt-1 shrink-0">
        <p className="text-[11px] font-black text-stone-100 leading-tight line-clamp-1 tracking-wide"
           style={{ fontFamily: "'Cinzel', 'Georgia', serif" }}>
          {definition.name.it}
          {instance.upgraded && <span className="text-amber-400">+</span>}
        </p>
      </div>

      {/* Type line */}
      <div className="px-2 py-0.5 shrink-0">
        <p className={`text-[9px] font-semibold tracking-widest ${typeStyle.color} text-center`}>
          ─── {typeStyle.label} ───
        </p>
      </div>

      {/* Effect text */}
      <div className="px-2 flex-1 overflow-hidden">
        <p className="text-[10px] text-stone-300 leading-snug line-clamp-3">
          {effectSummary(definition)}
        </p>
      </div>

      {/* Tags */}
      {definition.tags.length > 0 && (
        <div className="px-1.5 pb-1.5 flex flex-wrap gap-0.5 shrink-0">
          {definition.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[9px] bg-stone-800 text-stone-400 rounded px-1 py-0.5 leading-none">
              {TAG_LABEL[tag]}
            </span>
          ))}
        </div>
      )}
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Card — smart wrapper: tries full-card image, falls back to HTML
// ---------------------------------------------------------------------------

export function Card({
  instance, definition,
  state = "hand",
  isSelected = false,
  isPlayable = true,
  onSelect,
  index = 0,
}: CardProps) {
  const prefersReduced = useReducedMotion();

  // Try full-card image first; if 404, switch to HTML
  const [useFullCard, setUseFullCard] = useState(true);

  const isExhausted = state === "exhaust";
  const displayedCost: number | "X" =
    instance.costOverride !== undefined
      ? instance.costOverride
      : typeof definition.cost === "number" ? definition.cost : "X";

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); }
  }

  const sharedProps = {
    instance,
    definition,
    selectedStyle,
    selectedYOffset,
    playableStyle,
    exhaustStyle,
    drawVariants,
    hoverAnim,
    transitionProp,
    onClick: handleClick,
    onKeyDown: handleKeyDown,
    isExhausted,
    isPlayable,
    isSelected,
    displayedCost,
  };

  if (useFullCard) {
    return (
      <FullCard
        {...sharedProps}
        cardId={definition.id}
        onFallback={() => setUseFullCard(false)}
      />
    );
  }

  return <HtmlCard {...sharedProps} />;
}
