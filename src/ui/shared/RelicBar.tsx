import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sword, Shield, Wind, Gem, Heart, Skull, Crown, Droplet, Egg, HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { getRelic, loadRelics } from '../../game/content/index';
import type { RelicDefinition, RelicId } from '../../game/types';

interface RelicBarProps {
  relicIds: RelicId[];
  /** Visual orientation. Map header uses horizontal, combat uses vertical. */
  orientation?: 'horizontal' | 'vertical';
  /** Pixel size of each icon button. */
  size?: number;
  /** Optional className applied to the container. */
  className?: string;
}

// Lucide icon registry — relics declare `art.icon` as a Lucide name (string)
const ICONS: Record<string, LucideIcon> = {
  Sword, Shield, Wind, Gem, Heart, Skull, Crown, Droplet, Egg,
};

const TIER_RING: Record<string, string> = {
  starter:   'border-stone-500',
  common:    'border-stone-400',
  uncommon:  'border-blue-400',
  rare:      'border-amber-400',
  ancestral: 'border-fuchsia-400',
};

const TIER_BG: Record<string, string> = {
  starter:   'bg-stone-800',
  common:    'bg-stone-800',
  uncommon:  'bg-blue-950',
  rare:      'bg-amber-950',
  ancestral: 'bg-fuchsia-950',
};

interface RelicChipProps {
  relicId: RelicId;
  size: number;
}

function RelicChip({ relicId, size }: RelicChipProps) {
  const [showTip, setShowTip] = useState(false);
  const [def, setDef] = useState<RelicDefinition | undefined>(() => getRelic(relicId));

  useEffect(() => {
    if (def) return;
    loadRelics().then(() => setDef(getRelic(relicId)));
  }, [relicId, def]);

  const iconName = def?.art?.icon ?? '';
  const Icon = ICONS[iconName] ?? HelpCircle;
  const tier = def?.tier ?? 'common';
  const name = def?.name.it ?? relicId;
  const desc = def?.description ?? '';

  // Icon scales relative to button size
  const iconPx = Math.round(size * 0.6);

  return (
    <div className="relative inline-block">
      <motion.button
        type="button"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        aria-label={`Reliquia: ${name}. ${desc}`}
        className={[
          'flex items-center justify-center rounded-full border-2 shadow-lg',
          'transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          TIER_RING[tier] ?? 'border-stone-400',
          TIER_BG[tier] ?? 'bg-stone-800',
        ].join(' ')}
        style={{ width: size, height: size }}
      >
        <Icon
          width={iconPx}
          height={iconPx}
          className={tier === 'rare' ? 'text-amber-300' : tier === 'uncommon' ? 'text-blue-200' : tier === 'ancestral' ? 'text-fuchsia-200' : 'text-stone-200'}
          aria-hidden="true"
        />
      </motion.button>

      {showTip && (
        <div
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-stone-900 border border-stone-600 rounded-lg px-2 py-1.5 shadow-xl text-[11px] text-stone-200 pointer-events-none"
        >
          <p className="font-bold text-amber-300 mb-0.5">{name}</p>
          <p className="text-stone-300 leading-snug">{desc}</p>
        </div>
      )}
    </div>
  );
}

export default function RelicBar({
  relicIds,
  orientation = 'horizontal',
  size = 28,
  className = '',
}: RelicBarProps) {
  if (relicIds.length === 0) return null;

  const layoutClass = orientation === 'vertical'
    ? 'flex flex-col gap-1.5'
    : 'flex flex-row gap-1.5 flex-wrap';

  return (
    <div
      className={`${layoutClass} ${className}`}
      role="list"
      aria-label="Reliquie possedute"
    >
      {relicIds.map((id) => (
        <div key={id} role="listitem">
          <RelicChip relicId={id} size={size} />
        </div>
      ))}
    </div>
  );
}
