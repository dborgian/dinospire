// StatusBadge.tsx — Icon + stack count for a single status/buff on hero or enemy.
// Tooltip on hover shows a human-readable description.

import { useState } from "react";
import type { StatusKey } from "@/game/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusBadgeProps {
  status: StatusKey;
  stacks: number;
  size?: "sm" | "xs";
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

const STATUS_META: Record<StatusKey, { icon: string; label: string; description: string; positive: boolean }> = {
  strength:    { icon: "⚔",  label: "Forza",       description: "Aumenta il danno di attacco di X.",              positive: true  },
  dexterity:   { icon: "🛡",  label: "Destrezza",   description: "Aumenta il blocco guadagnato di X.",             positive: true  },
  vigor:       { icon: "⚡",  label: "Vigore",       description: "Il prossimo attacco infligge X danni extra.",    positive: true  },
  poison:      { icon: "☠",  label: "Veleno",       description: "Perde X HP a fine turno, poi diminuisce.",       positive: false },
  burn:        { icon: "🔥", label: "Bruciatura",   description: "Perde X HP a fine turno.",                       positive: false },
  bleed:       { icon: "🩸", label: "Sanguinamento", description: "Perde X HP quando gioca una carta.",            positive: false },
  vulnerable:  { icon: "🔻", label: "Vulnerabile",  description: "Riceve il 50% di danni in più.",                 positive: false },
  weak:        { icon: "💢", label: "Debole",        description: "Infligge il 25% di danni in meno.",             positive: false },
  frail:       { icon: "🫧", label: "Fragile",       description: "Guadagna il 25% di blocco in meno.",            positive: false },
  dodge:       { icon: "👁",  label: "Schivata",     description: "Schiva il prossimo attacco.",                    positive: true  },
  thorns:      { icon: "🌵", label: "Spine",         description: "Infligge X danni a chi attacca.",               positive: true  },
  hex_rotten_egg: { icon: "💀", label: "Uovo Marcio", description: "Maledizione: effetto negativo speciale.",      positive: false },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusBadge({ status, stacks, size = "sm" }: StatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const meta = STATUS_META[status];

  const sizeClass = size === "xs"
    ? "w-5 h-5 text-[10px]"
    : "w-6 h-6 text-xs";

  const bgClass = meta.positive
    ? "bg-stone-700 text-stone-200"
    : "bg-red-950 text-red-300";

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <div
        className={[
          "flex items-center justify-center rounded cursor-default",
          sizeClass,
          bgClass,
          "border border-stone-600",
        ].join(" ")}
        role="img"
        aria-label={`${meta.label}: ${stacks}`}
        tabIndex={0}
      >
        <span aria-hidden="true" className="leading-none">{meta.icon}</span>
        <span className="absolute -bottom-1 -right-1 text-[8px] font-black bg-stone-950 text-stone-200 rounded-full w-3.5 h-3.5 flex items-center justify-center border border-stone-600 leading-none">
          {stacks}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
          role="tooltip"
        >
          <div className="bg-stone-800 border border-stone-600 rounded-lg px-2 py-1.5 shadow-xl w-36">
            <p className="text-[10px] font-bold text-stone-100 mb-0.5">{meta.icon} {meta.label} ({stacks})</p>
            <p className="text-[9px] text-stone-400 leading-snug">
              {meta.description.replace("X", String(stacks))}
            </p>
          </div>
          {/* Tooltip arrow */}
          <div className="w-2 h-2 bg-stone-800 border-r border-b border-stone-600 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}
