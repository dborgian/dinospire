import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMetaStore } from '../../stores/metaStore';
import { useRunStore } from '../../stores/runStore';
import { loadHeroes } from '../../game/content/index';
import type { HeroDefinition, HeroId, CardInstanceId, CardInstance } from '../../game/types';
import type { RunAction } from '../../game/run/machine';

// ---- Archetype labels derived from taxonGroup ----
const ARCHETYPE_LABELS: Record<string, string> = {
  theropode: 'Tank / DPS',
  dromeosauride: 'DPS / Velocità',
  ankylosauro: 'Tank / Controllo',
  sauropode: 'Supporto',
  ceratopside: 'DPS / Mandria',
  stegosauro: 'Difesa',
  spinosauride: 'Veleno',
};

function archetypeLabel(taxonGroup: string): string {
  return ARCHETYPE_LABELS[taxonGroup] ?? taxonGroup;
}

// ---- Hero art image (generated first, PhyloPic fallback) ----
interface HeroArtProps {
  heroId: string;
  uuid: string | undefined;
  name: string;
}

function HeroArt({ heroId, uuid, name }: HeroArtProps) {
  const [localErr, setLocalErr] = useState(false);
  const [phyloErr, setPhyloErr] = useState(false);

  const localUrl = `/art/heroes/${heroId}_cucciolo.png`;

  if (!localErr) {
    return (
      <img
        src={localUrl}
        alt={`Arte di ${name}`}
        className="w-full h-full object-cover rounded-md"
        loading="lazy"
        onError={() => setLocalErr(true)}
      />
    );
  }
  if (uuid && !phyloErr) {
    return (
      <img
        src={`https://images.phylopic.org/images/${uuid}/raster/512x512.png`}
        alt={`Silhouette di ${name}`}
        className="w-full h-full object-contain opacity-80 invert"
        loading="lazy"
        onError={() => setPhyloErr(true)}
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-stone-600 text-4xl select-none" aria-hidden="true">
      🦕
    </div>
  );
}

// ---- Hero card mini ----
interface HeroCardProps {
  hero: HeroDefinition;
  selected: boolean;
  onSelect: (id: HeroId) => void;
}

function HeroCard({ hero, selected, onSelect }: HeroCardProps) {
  const cucciolo = hero.stages.cucciolo;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(hero.id)}
      aria-pressed={selected}
      aria-label={`Seleziona ${hero.name.it}`}
      className={[
        'flex flex-col items-center rounded-lg p-3 bg-stone-900 border-2 transition-colors',
        'w-32 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        selected ? 'border-amber-400' : 'border-stone-700 hover:border-stone-500',
      ].join(' ')}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Aspect-ratio 2/3 art area */}
      <div className="w-full aspect-[2/3] mb-2 overflow-hidden rounded-md bg-stone-800">
        <HeroArt heroId={hero.id} uuid={hero.art?.phylopicUuid} name={hero.name.it} />
      </div>
      <span className="font-bold text-stone-100 text-sm uppercase tracking-wide truncate w-full text-center">
        {hero.name.it}
      </span>
      <span className="text-stone-400 text-xs mt-0.5 truncate w-full text-center">
        {archetypeLabel(hero.taxonGroup)}
      </span>
      <span className="text-stone-500 text-xs mt-1">
        ❤ {cucciolo.hp} &nbsp;⚡ {cucciolo.energyPerTurn}
      </span>
    </motion.button>
  );
}

// ---- Main TitleScreen ----
export default function TitleScreen() {
  const profile = useMetaStore((s) => s.profile);
  const dispatch = useRunStore((s) => s.dispatch);

  const [heroes, setHeroes] = useState<HeroDefinition[]>([]);
  const [selectedHeroId, setSelectedHeroId] = useState<HeroId | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHeroes().then((defs) => {
      if (!cancelled) {
        setHeroes(defs);
        // Pre-select first unlocked hero if any
        const firstUnlocked = defs.find((h) => profile.unlockedHeroes.includes(h.id));
        if (firstUnlocked) setSelectedHeroId(firstUnlocked.id);
      }
    });
    return () => { cancelled = true; };
  }, [profile.unlockedHeroes]);

  // Determine which heroes are visible: unlocked ones, or all if none unlocked yet
  // (first run — the game defaults to all three heroes available)
  const visibleHeroes = heroes.filter(
    (h) => profile.unlockedHeroes.length === 0 || profile.unlockedHeroes.includes(h.id),
  );

  function handleStart() {
    if (!selectedHeroId) return;

    const heroDef = heroes.find((h) => h.id === selectedHeroId);
    if (!heroDef) return;

    // Build starter deck from hero definition
    const starterDeck: CardInstance[] = heroDef.starterDeck.map((cardId, i) => ({
      iid: `${cardId}_start_${i}` as CardInstanceId,
      cardId,
      upgraded: false,
      temporary: false,
    }));

    const action: RunAction = {
      type: 'START_RUN',
      heroId: selectedHeroId,
      seed: Date.now(),
      starterDeck,
      starterRelic: heroDef.starterRelic,
      baseHp: heroDef.stages.cucciolo.hp,
    };

    dispatch(action);
  }

  return (
    <main
      className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-8 px-4 py-12"
      role="main"
    >
      {/* Title */}
      <header className="text-center">
        <h1
          className="font-serif text-5xl tracking-[0.2em] text-amber-400 uppercase select-none"
          style={{ fontFamily: "'Cinzel', serif" }}
        >
          DinoSpire
        </h1>
        <p className="text-stone-400 text-sm italic mt-2 tracking-wide">
          — Risali la Spira —
        </p>
      </header>

      {/* Hero selection */}
      <section aria-labelledby="hero-selection-heading">
        <h2
          id="hero-selection-heading"
          className="text-stone-400 text-xs uppercase tracking-widest text-center mb-4"
        >
          Scegli il tuo eroe
        </h2>
        {visibleHeroes.length === 0 ? (
          <p className="text-stone-500 text-sm">Caricamento eroi...</p>
        ) : (
          <div
            className="flex flex-wrap gap-4 justify-center"
            role="group"
            aria-label="Eroi disponibili"
          >
            {visibleHeroes.map((hero) => (
              <HeroCard
                key={hero.id}
                hero={hero}
                selected={selectedHeroId === hero.id}
                onSelect={setSelectedHeroId}
              />
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <motion.button
        type="button"
        onClick={handleStart}
        disabled={!selectedHeroId}
        aria-disabled={!selectedHeroId}
        className={[
          'h-14 px-10 rounded-lg font-bold tracking-widest text-lg uppercase transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300',
          selectedHeroId
            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer'
            : 'bg-stone-800 text-stone-600 cursor-not-allowed',
        ].join(' ')}
        whileHover={selectedHeroId ? { scale: 1.03 } : {}}
        whileTap={selectedHeroId ? { scale: 0.97 } : {}}
      >
        Inizia Avventura
      </motion.button>

      {/* Run stats footer */}
      {profile.totalRuns > 0 && (
        <p className="text-stone-600 text-xs">
          {profile.totalRuns} run — {profile.victories} vittorie — Ascesa {profile.ascensionLevel}
        </p>
      )}
    </main>
  );
}
