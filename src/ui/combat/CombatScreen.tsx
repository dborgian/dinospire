// CombatScreen.tsx — Main combat view for DinoSpire.
// Layout: header → enemy row → hero stats bar → hand area.
// Tap-to-select pattern: tap card → highlight, tap enemy → play card.

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Sword, Shield, Sparkles, Skull, HelpCircle,
} from "lucide-react";

import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import {
  getHandCards,
  getLiveEnemies,
} from "@/game/combat/selectors";
import { contentRegistry } from "@/game/content/index";
import { HandArea } from "./HandArea";
import { StatusBadge } from "./StatusBadge";

import type {
  EnemyInstance,
  EnemyId,
  CardInstanceId,
  CardId,
  Card as CardDef,
  IntentType,
  StatusKey,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Arena background paths — populated by `npm run generate:backgrounds`
// Falls back gracefully to the gradient if images are missing.
// ---------------------------------------------------------------------------

const ARENA_BACKGROUNDS = [
  "/art/backgrounds/arena_forest.png",
  "/art/backgrounds/arena_volcano.png",
  "/art/backgrounds/arena_swamp.png",
  "/art/backgrounds/arena_savanna.png",
  "/art/backgrounds/arena_cave.png",
  "/art/backgrounds/arena_coast.png",
] as const;

const FALLBACK_GRADIENT =
  "radial-gradient(ellipse 80% 60% at 50% 20%, #1a2e1a 0%, #0d1f0d 40%, #0a0f0a 100%)";

// Overlay darkens the background image so UI elements remain readable.
const BACKGROUND_OVERLAY =
  "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.65))";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CombatScreenProps {
  onCombatEnd: (result: "victory" | "defeat") => void;
  /** Act floor label e.g. "Atto 1 · Piano 3" */
  floorLabel?: string;
  gold?: number;
}

// ---------------------------------------------------------------------------
// Floating damage number
// ---------------------------------------------------------------------------

interface DamageNumberProps {
  amount: number;
  isBlock?: boolean;
  id: number;
}

function DamageNumber({ amount, isBlock = false, id }: DamageNumberProps) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.span
      key={id}
      initial={{ y: 0, opacity: 1, scale: 1.2 }}
      animate={prefersReduced ? { opacity: 0 } : { y: -60, opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={[
        "absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none",
        "text-2xl font-black select-none z-30",
        isBlock
          ? "text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.9)]"
          : "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.9)]",
      ].join(" ")}
      style={{ textShadow: isBlock ? "0 0 12px #93c5fd" : "0 0 12px #f87171" }}
      aria-hidden="true"
    >
      {isBlock ? "+" : "-"}{amount}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Intent icon — two size variants
// ---------------------------------------------------------------------------

function IntentIcon({ type, size = "sm" }: { type: IntentType; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-5 h-5" : "w-4 h-4";
  switch (type) {
    case "attack":  return <Sword  className={`${cls} text-red-300`}    aria-hidden="true" />;
    case "defend":  return <Shield className={`${cls} text-blue-300`}   aria-hidden="true" />;
    case "buff":    return <Sparkles className={`${cls} text-amber-300`} aria-hidden="true" />;
    case "debuff":  return <Skull  className={`${cls} text-purple-300`} aria-hidden="true" />;
    case "unknown": return <HelpCircle className={`${cls} text-stone-300`} aria-hidden="true" />;
  }
}

// Framer Motion variants for intent pulse (enemy turn)
const intentPulseVariants: Variants = {
  idle: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.25, 1],
    opacity: [1, 0.7, 1],
    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" },
  },
};

// ---------------------------------------------------------------------------
// HP bar colour
// ---------------------------------------------------------------------------

function hpBarColor(hp: number, maxHp: number): string {
  const pct = hp / maxHp;
  if (pct > 0.5) return "bg-green-500";
  if (pct > 0.25) return "bg-yellow-500";
  return "bg-red-500";
}

// ---------------------------------------------------------------------------
// Enemy art with local fallback
// ---------------------------------------------------------------------------

function EnemyArt({ definitionId, name }: { definitionId: string; name: string }) {
  const [err, setErr] = useState(false);
  if (!err) {
    return (
      <img
        src={`/art/enemies/${definitionId}.png`}
        alt={name}
        // 3:4 aspect ratio — 112px wide × 150px tall
        className="w-28 rounded-lg object-cover"
        style={{ aspectRatio: "3 / 4" }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div
      className="w-28 rounded-lg bg-stone-700 flex items-center justify-center"
      style={{ aspectRatio: "3 / 4" }}
    >
      <span className="text-5xl select-none" aria-hidden="true">🦖</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enemy card
// ---------------------------------------------------------------------------

interface EnemyCardProps {
  enemy: EnemyInstance;
  onClick: () => void;
  isPulsing: boolean;
  isShaking: boolean;
  isEnemyTurn: boolean;
}

function EnemyCard({ enemy, onClick, isPulsing, isShaking, isEnemyTurn }: EnemyCardProps) {
  const prefersReduced = useReducedMotion();

  const shakeAnim = isShaking && !prefersReduced
    ? { x: [-4, 4, -4, 4, 0] }
    : {};

  const statuses = Object.entries(enemy.statuses) as [StatusKey, number][];

  // Intent badge colours per type
  const intentBg: Record<IntentType, string> = {
    attack:  "bg-red-900/90 border-red-700",
    defend:  "bg-blue-900/90 border-blue-700",
    buff:    "bg-amber-900/90 border-amber-700",
    debuff:  "bg-purple-900/90 border-purple-700",
    unknown: "bg-stone-800/90 border-stone-600",
  };

  return (
    <motion.div
      animate={shakeAnim}
      transition={{ duration: 0.24, ease: "easeInOut" }}
      className="relative flex flex-col items-center"
    >
      {/* ── Intent badge — floats above the art ── */}
      <div
        className={[
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full border mb-1.5",
          "text-xs font-bold select-none",
          intentBg[enemy.nextIntent.type],
        ].join(" ")}
        aria-label={`Intenzione: ${enemy.nextIntent.description}`}
      >
        {/* Pulse the icon when it's the enemy's turn */}
        <motion.span
          variants={intentPulseVariants}
          animate={isEnemyTurn && !prefersReduced ? "pulse" : "idle"}
          className="flex items-center"
        >
          <IntentIcon type={enemy.nextIntent.type} size="lg" />
        </motion.span>
        {enemy.nextIntent.value !== undefined && (
          <span className={enemy.nextIntent.type === "attack" ? "text-red-200" : "text-blue-200"}>
            {enemy.nextIntent.value}
          </span>
        )}
        {enemy.nextIntent.type === "unknown" && (
          <span className="text-stone-300">???</span>
        )}
      </div>

      <button
        type="button"
        onClick={onClick}
        className={[
          "relative flex flex-col items-center gap-2 px-3 py-3 rounded-xl",
          "bg-stone-900/80 backdrop-blur transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
          isPulsing
            ? "border-[3px] border-amber-400 shadow-[0_0_32px_rgba(251,191,36,0.7)]"
            : "border-2 border-stone-700 hover:border-stone-500 shadow-lg shadow-black/40",
          enemy.hp <= 0 ? "opacity-30 pointer-events-none" : "",
        ].join(" ")}
        aria-label={`Nemico: HP ${enemy.hp}/${enemy.maxHp}. Clicca per selezionare come bersaglio.`}
        disabled={enemy.hp <= 0}
      >
        {/* Enemy art — large and visually dominant */}
        <EnemyArt definitionId={enemy.definitionId} name={enemy.definitionId} />

        {/* HP bar */}
        <div className="w-full">
          <div className="flex justify-between text-[10px] text-stone-400 mb-0.5">
            <span>❤ {enemy.hp}</span>
            <span>{enemy.maxHp}</span>
          </div>
          <div className="w-full h-2 bg-stone-700 rounded-full overflow-hidden" role="progressbar"
               aria-valuenow={enemy.hp} aria-valuemin={0} aria-valuemax={enemy.maxHp}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${hpBarColor(enemy.hp, enemy.maxHp)}`}
              style={{ width: `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%` }}
            />
          </div>
        </div>

        {/* Block bubble */}
        {enemy.block > 0 && (
          <div className="flex items-center gap-1 text-blue-300 text-xs font-bold" aria-label={`Blocco: ${enemy.block}`}>
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            {enemy.block}
          </div>
        )}
      </button>

      {/* Statuses row */}
      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
          {statuses.map(([key, count]) =>
            count > 0 ? (
              <StatusBadge key={key} status={key} stacks={count} size="xs" />
            ) : null
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pile preview sheet (draw / discard)
// ---------------------------------------------------------------------------

interface PilePreviewProps {
  title: string;
  iids: CardInstanceId[];
  cardDefs: Map<CardId, CardDef>;
  onClose: () => void;
}

function PilePreview({ title, iids, cardDefs, onClose }: PilePreviewProps) {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-x-0 bottom-0 z-50 bg-stone-900 border-t-2 border-stone-700 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
      role="dialog"
      aria-label={title}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-stone-100">{title} ({iids.length})</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-stone-400 hover:text-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded px-2 py-1"
          aria-label="Chiudi anteprima"
        >
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {iids.map((iid) => {
          // We only have the CardInstanceId here; look up name via registry
          // The card instance → cardId lookup must come from combat state.
          // We pass card names directly via the cardDefs map by iid-as-key trick.
          // In practice the parent passes a map keyed by iid.
          const def = cardDefs.get(iid as unknown as CardId);
          return (
            <li key={iid} className="flex items-center gap-2 text-xs text-stone-300 py-0.5 border-b border-stone-800">
              <span className="font-semibold">{def?.name.it ?? iid}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CombatScreen
// ---------------------------------------------------------------------------

export function CombatScreen({ onCombatEnd, floorLabel = "Atto 1 · Piano 1", gold = 0 }: CombatScreenProps) {
  const combat = useCombatStore((s) => s.combat);
  const dispatch = useCombatStore((s) => s.dispatch);
  const playCard = useCombatStore((s) => s.playCard);

  const selectedCardIid = useUIStore((s) => s.selectedCardIid);
  const isEnemyTurn = useUIStore((s) => s.isEnemyTurn);
  const selectCard = useUIStore((s) => s.selectCard);
  const setEnemyTurn = useUIStore((s) => s.setEnemyTurn);

  // Enemy shaking state (iid → boolean)
  const shakingRef = useRef<Set<EnemyId>>(new Set());

  // Floating damage numbers keyed per enemy iid
  interface FloatNum { id: number; amount: number; isBlock: boolean; enemyIid: EnemyId }
  const [floatNums, setFloatNums] = useState<FloatNum[]>([]);
  const floatCounter = useRef(0);

  // Hero damage flash
  const [heroFlash, setHeroFlash] = useState(false);
  // Hero floating damage numbers
  interface HeroFloat { id: number; amount: number }
  const [heroFloatNums, setHeroFloatNums] = useState<HeroFloat[]>([]);

  // Pile preview state
  const [pilePreview, setPilePreview] = useState<"draw" | "discard" | null>(null);
  const [enemyTurnBanner, setEnemyTurnBanner] = useState(false);

  // content registry uses string keys internally; cast is safe after loadCards resolves
  const cardDefs = contentRegistry.cards as unknown as Map<CardId, CardDef>;

  // Build a map from CardInstanceId → CardDef for pile previews
  const iidToDefMap = new Map<CardId, CardDef>();
  if (combat) {
    for (const [iid, instance] of Object.entries(combat.cardInstances)) {
      const def = cardDefs.get(instance.cardId);
      if (def) iidToDefMap.set(iid as CardId, def);
    }
  }

  // Prefersreduced for child components that need it (banner uses CSS only)
  const prefersReduced = useReducedMotion();

  // ---------------------------------------------------------------------------
  // Background — pick once per combat, stable across re-renders.
  // Falls back to the gradient if the PNG returns 404.
  // ---------------------------------------------------------------------------

  const backgroundPath = useMemo(() => {
    // Pick background based on turn count as a stable-ish seed
    const seed = combat?.turn ?? 0;
    const idx = Math.abs(seed) % ARENA_BACKGROUNDS.length;
    return ARENA_BACKGROUNDS[idx] ?? ARENA_BACKGROUNDS[0];
  // Re-pick only when combat first loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!combat]);

  const [bgError, setBgError] = useState(false);

  // Reset error state whenever the path changes (new combat)
  useEffect(() => { setBgError(false); }, [backgroundPath]);

  const wrapperBackground = bgError
    ? FALLBACK_GRADIENT
    : `${BACKGROUND_OVERLAY}, url("${backgroundPath}") center / cover no-repeat`;

  // ---------------------------------------------------------------------------
  // Combat log watcher — spawn floating damage numbers
  // ---------------------------------------------------------------------------

  const lastLogLenRef = useRef(0);

  useEffect(() => {
    if (!combat) return;
    const log = combat.log;
    if (log.length <= lastLogLenRef.current) return;

    const newEvents = log.slice(lastLogLenRef.current);
    lastLogLenRef.current = log.length;

    for (const evt of newEvents) {
      if (evt.kind === "damage_dealt") {
        const targetId = evt.payload["targetId"] as string | undefined;
        const finalDmg = (evt.payload["finalDmg"] ?? evt.payload["amount"]) as number | undefined;
        const actorIsHero = evt.payload["actorIsHero"] as boolean | undefined;

        if (typeof finalDmg === "number" && finalDmg > 0) {
          const numId = ++floatCounter.current;

          if (targetId === "hero" || actorIsHero === false) {
            // Enemy hit the hero
            setHeroFlash(true);
            setTimeout(() => setHeroFlash(false), 400);
            setHeroFloatNums((prev) => [...prev, { id: numId, amount: finalDmg }]);
            setTimeout(() => setHeroFloatNums((prev) => prev.filter((n) => n.id !== numId)), 800);
          } else if (targetId) {
            // Hero hit an enemy
            setFloatNums((prev) => [...prev, { id: numId, amount: finalDmg, isBlock: false, enemyIid: targetId as EnemyId }]);
            setTimeout(() => setFloatNums((prev) => prev.filter((n) => n.id !== numId)), 800);
          }
        }
      }
    }
  }, [combat?.log.length]);

  // ---------------------------------------------------------------------------
  // Phase transition effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!combat) return;

    if (combat.phase === "victory") {
      // Small delay so last damage animation can finish
      const t = setTimeout(() => onCombatEnd("victory"), 800);
      return () => clearTimeout(t);
    }
    if (combat.phase === "defeat") {
      const t = setTimeout(() => onCombatEnd("defeat"), 800);
      return () => clearTimeout(t);
    }
  }, [combat?.phase, onCombatEnd]);

  // ---------------------------------------------------------------------------
  // End turn handler
  // ---------------------------------------------------------------------------

  const handleEndTurn = useCallback(async () => {
    if (!combat || isEnemyTurn || combat.phase !== "player_turn") return;

    selectCard(null);
    setEnemyTurn(true);
    setEnemyTurnBanner(true);

    await sleep(500);
    setEnemyTurnBanner(false);

    dispatch({ type: "END_TURN" });

    // Brief pause after reducer runs enemy actions
    await sleep(400);
    setEnemyTurn(false);
  }, [combat, isEnemyTurn, dispatch, selectCard, setEnemyTurn, setEnemyTurnBanner]);

  // ---------------------------------------------------------------------------
  // Card select / play
  // ---------------------------------------------------------------------------

  const handleCardSelect = useCallback((iid: CardInstanceId) => {
    if (isEnemyTurn || !combat) return;

    if (selectedCardIid === iid) {
      // Second tap on same card: play if it doesn't need an enemy target (skill/power)
      const instance = combat.cardInstances[iid];
      const def = instance ? cardDefs.get(instance.cardId) : null;
      const needsTarget = def?.effects.some(
        (e) => e.kind === "damage" && e.target === "enemy",
      ) ?? false;

      if (!needsTarget) {
        playCard(iid);
        selectCard(null);
      } else {
        // Attack card: deselect (user must tap an enemy)
        selectCard(null);
      }
    } else {
      selectCard(iid);
    }
  }, [isEnemyTurn, combat, selectedCardIid, selectCard, cardDefs, playCard]);

  const handleEnemyClick = useCallback((enemyId: EnemyId) => {
    if (!combat || !selectedCardIid || isEnemyTurn) return;
    playCard(selectedCardIid, enemyId);
    selectCard(null);
  }, [combat, selectedCardIid, isEnemyTurn, playCard, selectCard]);

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (!combat) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-950 text-stone-400" role="status">
        Caricamento combattimento…
      </div>
    );
  }

  const handInstances = getHandCards(combat);
  const liveEnemies = getLiveEnemies(combat);

  // Pulsing highlight on enemies when an attack card is selected
  const selectedInstance = selectedCardIid ? combat.cardInstances[selectedCardIid] : undefined;
  const selectedDef = selectedInstance ? cardDefs.get(selectedInstance.cardId) : null;
  const selectedNeedsTarget = selectedDef?.effects.some(
    (e) => e.kind === "damage" && e.target === "enemy",
  ) ?? false;

  return (
    <div
      className="flex flex-col h-screen text-stone-100 overflow-hidden relative"
      role="main"
      style={{ background: wrapperBackground }}
    >
      {/* Hidden probe image — detects 404 on the background PNG and triggers fallback */}
      {!bgError && (
        <img
          key={backgroundPath}
          src={backgroundPath}
          alt=""
          aria-hidden="true"
          className="hidden"
          onError={() => setBgError(true)}
        />
      )}

      {/* Atmospheric fog layer */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 35%, rgba(30,60,20,0.35) 0%, transparent 70%), radial-gradient(ellipse 100% 50% at 50% 100%, rgba(0,0,0,0.6) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />
      {/* Hero damage flash overlay */}
      <AnimatePresence>
        {heroFlash && (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute inset-0 pointer-events-none z-20 border-4 border-red-500"
            style={{ boxShadow: "inset 0 0 60px rgba(239,68,68,0.5)" }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-4 py-2 bg-stone-950/70 backdrop-blur border-b border-stone-800/60 shrink-0">
        <span className="text-xs text-stone-400 font-semibold tracking-wide">{floorLabel}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-amber-400 font-bold" aria-label={`Oro: ${gold}`}>💰 {gold}</span>
          <button
            type="button"
            className="text-stone-400 hover:text-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded p-1"
            aria-label="Impostazioni"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* ── Enemy turn banner ── */}
      <AnimatePresence>
        {enemyTurnBanner && (
          <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? {} : { opacity: 0, y: -10 }}
            className="absolute top-12 inset-x-0 z-40 flex justify-center pointer-events-none"
            role="status"
            aria-live="polite"
          >
            <span className="bg-red-900 border border-red-600 text-red-100 text-sm font-bold px-6 py-2 rounded-full shadow-xl">
              Turno Nemico
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Enemy area (top ~40%) ── */}
      <section
        className="relative z-10 flex-1 flex items-end justify-center gap-8 px-6 pb-6 pt-2"
        aria-label="Area nemici"
      >
        {liveEnemies.map((enemy) => (
          <div key={enemy.iid} className="relative">
            <EnemyCard
              enemy={enemy}
              onClick={() => handleEnemyClick(enemy.iid)}
              isPulsing={!!selectedCardIid && selectedNeedsTarget && enemy.hp > 0}
              isShaking={shakingRef.current.has(enemy.iid)}
              isEnemyTurn={isEnemyTurn}
            />
            {/* Floating damage numbers for this enemy */}
            <AnimatePresence>
              {floatNums
                .filter((n) => n.enemyIid === enemy.iid)
                .map((n) => (
                  <DamageNumber key={n.id} id={n.id} amount={n.amount} isBlock={n.isBlock} />
                ))}
            </AnimatePresence>
          </div>
        ))}
        {liveEnemies.length === 0 && combat.phase !== "victory" && (
          <span className="text-stone-600 text-sm">Tutti i nemici sconfitti…</span>
        )}
      </section>

      {/* ── Hero stats bar ── */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 bg-stone-950/80 backdrop-blur border-t border-stone-800/60 shrink-0">
        {/* Hero floating damage numbers */}
        <AnimatePresence>
          {heroFloatNums.map((n) => (
            <motion.span
              key={n.id}
              initial={{ y: 0, opacity: 1, scale: 1.3 }}
              animate={{ y: -50, opacity: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="absolute left-8 top-0 pointer-events-none text-2xl font-black text-red-400 select-none z-30"
              style={{ textShadow: "0 0 14px #f87171" }}
              aria-hidden="true"
            >
              -{n.amount}
            </motion.span>
          ))}
        </AnimatePresence>
        {/* HP */}
        <div className="flex flex-col gap-0.5 min-w-[80px]">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-red-400 text-base" aria-hidden="true">❤</span>
            <span className="font-bold tabular-nums" aria-label={`Vita: ${combat.hero.hp} su ${combat.hero.maxHp}`}>
              {combat.hero.hp}
              <span className="text-stone-500 font-normal">/{combat.hero.maxHp}</span>
            </span>
          </div>
          <div className="w-20 h-1.5 bg-stone-700 rounded-full overflow-hidden" role="progressbar"
               aria-valuenow={combat.hero.hp} aria-valuemin={0} aria-valuemax={combat.hero.maxHp}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${hpBarColor(combat.hero.hp, combat.hero.maxHp)}`}
              style={{ width: `${Math.max(0, (combat.hero.hp / combat.hero.maxHp) * 100)}%` }}
            />
          </div>
        </div>

        {/* Block + Energy */}
        <div className="flex items-center gap-3 text-sm">
          {combat.hero.block > 0 && (
            <span className="flex items-center gap-1 text-blue-300 font-bold" aria-label={`Blocco: ${combat.hero.block}`}>
              <Shield className="w-4 h-4" aria-hidden="true" />
              {combat.hero.block}
            </span>
          )}
          <span
            className="flex items-center gap-1 text-amber-400 font-bold"
            aria-label={`Energia: ${combat.hero.energy} su ${combat.hero.energyMax}`}
          >
            <span aria-hidden="true">⚡</span>
            {combat.hero.energy}/{combat.hero.energyMax}
          </span>

          {/* Hero statuses */}
          {(Object.entries(combat.hero.statuses) as [StatusKey, number][])
            .filter(([, v]) => v > 0)
            .map(([key, count]) => (
              <StatusBadge key={key} status={key} stacks={count} size="xs" />
            ))}
        </div>

        {/* End turn button */}
        <button
          type="button"
          onClick={() => { void handleEndTurn(); }}
          disabled={isEnemyTurn || combat.phase !== "player_turn"}
          className={[
            "px-3 py-1.5 rounded-lg text-sm font-bold transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
            isEnemyTurn || combat.phase !== "player_turn"
              ? "bg-stone-700 text-stone-500 cursor-not-allowed"
              : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/20",
          ].join(" ")}
          aria-label="Fine turno"
        >
          Fine Turno
        </button>
      </div>

      {/* ── Hand area (bottom ~40%) ── */}
      <div className="relative z-10 shrink-0 bg-stone-950/80 backdrop-blur border-t border-stone-800/60 pt-2">
        <HandArea
          cardInstances={handInstances}
          cardDefs={cardDefs}
          selectedIid={selectedCardIid}
          energyAvailable={combat.hero.energy}
          onCardSelect={handleCardSelect}
          drawCount={combat.piles.draw.length}
          discardCount={combat.piles.discard.length}
          onDrawPileClick={() => setPilePreview("draw")}
          onDiscardClick={() => setPilePreview("discard")}
        />
      </div>

      {/* ── Pile preview sheet ── */}
      <AnimatePresence>
        {pilePreview && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setPilePreview(null)}
              aria-hidden="true"
            />
            <PilePreview
              title={pilePreview === "draw" ? "Mazzo (pescaggio)" : "Scarti"}
              iids={pilePreview === "draw" ? combat.piles.draw : combat.piles.discard}
              cardDefs={iidToDefMap}
              onClose={() => setPilePreview(null)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
