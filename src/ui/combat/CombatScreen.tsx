// CombatScreen.tsx — Main combat view for DinoSpire.
// Layout: 3-fascia design — top bar (54px) → arena (flex-1) → action area (clamp).
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
  "radial-gradient(ellipse 100% 70% at 50% 30%, #1f3d1a 0%, #122b10 35%, #0d1a0d 65%, #080f08 100%)";

// Overlay darkens the background image so UI elements remain readable.
const BACKGROUND_OVERLAY =
  "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.65))";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CombatScreenProps {
  onCombatEnd: (result: "victory" | "defeat") => void;
  onAbandon?: () => void;
  /** Act floor label e.g. "Atto 1 · Piano 3" */
  floorLabel?: string;
  gold?: number;
  /** Hero identifier — used to resolve sprite path */
  heroId?: string;
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
        className="rounded-xl object-cover w-full h-full"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="w-full h-full rounded-xl bg-stone-800 flex items-center justify-center">
      <span className="text-7xl select-none" aria-hidden="true">🦖</span>
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

  const shakeAnim = isShaking && !prefersReduced ? { x: [-6, 6, -6, 6, 0] } : {};
  const statuses = Object.entries(enemy.statuses) as [StatusKey, number][];

  const intentBg: Record<IntentType, string> = {
    attack:  "bg-red-900/95 border-red-500 text-red-200",
    defend:  "bg-blue-900/95 border-blue-500 text-blue-200",
    buff:    "bg-amber-900/95 border-amber-500 text-amber-200",
    debuff:  "bg-purple-900/95 border-purple-500 text-purple-200",
    unknown: "bg-stone-800/95 border-stone-500 text-stone-300",
  };

  const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);

  return (
    <motion.div
      animate={shakeAnim}
      transition={{ duration: 0.24, ease: "easeInOut" }}
      className="relative flex flex-col items-center gap-2"
    >
      {/* ── Intent banner — large and readable ── */}
      <motion.div
        variants={intentPulseVariants}
        animate={isEnemyTurn && !prefersReduced ? "pulse" : "idle"}
        className={[
          "flex items-center gap-2 px-4 py-1.5 rounded-full border-2 select-none",
          "text-sm font-black tracking-wide shadow-lg",
          intentBg[enemy.nextIntent.type],
        ].join(" ")}
        aria-label={`Intenzione: ${enemy.nextIntent.description}`}
      >
        <IntentIcon type={enemy.nextIntent.type} size="lg" />
        <span>
          {enemy.nextIntent.type === "attack" && enemy.nextIntent.value !== undefined
            ? `Attacca ${enemy.nextIntent.value}`
            : enemy.nextIntent.type === "defend" && enemy.nextIntent.value !== undefined
            ? `Difende +${enemy.nextIntent.value}`
            : enemy.nextIntent.type === "buff" ? "Si potenzia"
            : enemy.nextIntent.type === "debuff" ? "Ti indebolisce"
            : "???"}
        </span>
      </motion.div>

      {/* ── Main enemy card ── */}
      <button
        type="button"
        onClick={onClick}
        disabled={enemy.hp <= 0}
        aria-label={`${enemy.definitionId}: ${enemy.hp}/${enemy.maxHp} HP. Clicca per bersagliare.`}
        className={[
          "relative rounded-2xl overflow-hidden transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400",
          isPulsing
            ? "ring-4 ring-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.8)]"
            : "shadow-2xl shadow-black/60",
          enemy.hp <= 0 ? "opacity-20 pointer-events-none" : "cursor-pointer",
        ].join(" ")}
        style={{ width: "clamp(180px, 20vw, 300px)", aspectRatio: "2/3" }}
      >
        {/* Art fills entire card */}
        <EnemyArt definitionId={enemy.definitionId} name={enemy.definitionId} />

        {/* Gradient overlay at top for name legibility */}
        <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/80 to-transparent" />

        {/* Name — top of card */}
        <div className="absolute top-2 inset-x-0 px-3 text-center">
          <p className="text-white font-black text-base uppercase tracking-wide truncate drop-shadow-lg"
             style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}>
            {enemy.definitionId.replace(/_/g, " ")}
          </p>
        </div>

        {/* Gradient overlay at bottom for HP bar legibility */}
        <div className="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-black/90 to-transparent" />

        {/* HP bar over image */}
        <div className="absolute bottom-2 inset-x-2" role="progressbar"
             aria-valuenow={enemy.hp} aria-valuemin={0} aria-valuemax={enemy.maxHp}>
          <div className="flex justify-between text-[10px] text-stone-300 mb-0.5 px-0.5">
            <span>❤ {enemy.hp}</span>
            <span className="text-stone-400">{enemy.maxHp}</span>
          </div>
          <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-black/40">
            <div
              className={`h-full rounded-full transition-all duration-400 ${hpBarColor(enemy.hp, enemy.maxHp)}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>

        {/* Block overlay bubble */}
        {enemy.block > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-blue-900/90 border border-blue-400 text-blue-200 text-xs font-black px-1.5 py-0.5 rounded-full shadow">
            <Shield className="w-3 h-3" aria-hidden="true" />
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
// HeroZone — hero sprite + block badge + status row + floating damage numbers
// ---------------------------------------------------------------------------

interface HeroZoneProps {
  heroId: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Partial<Record<StatusKey, number>>;
  heroFlash: boolean;
  heroFloatNums: { id: number; amount: number }[];
}

function HeroZone({ heroId, hp, maxHp, block, statuses, heroFlash, heroFloatNums }: HeroZoneProps) {
  const [spriteErr, setSpriteErr] = useState(false);
  const prefersReduced = useReducedMotion();

  const statusEntries = (Object.entries(statuses) as [StatusKey, number][]).filter(([, v]) => v > 0);

  return (
    <div className="relative flex flex-col items-center justify-end h-full pb-4 gap-2">
      {/* Floating damage numbers */}
      <AnimatePresence>
        {heroFloatNums.map((n) => (
          <motion.span
            key={n.id}
            initial={{ y: 0, opacity: 1, scale: 1.3 }}
            animate={prefersReduced ? { opacity: 0 } : { y: -60, opacity: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none text-2xl font-black text-red-400 select-none z-30"
            style={{ textShadow: "0 0 14px #f87171" }}
            aria-hidden="true"
          >
            -{n.amount}
          </motion.span>
        ))}
      </AnimatePresence>

      {/* Hero sprite */}
      <motion.div
        className="relative"
        animate={heroFlash && !prefersReduced ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {!spriteErr ? (
          <img
            src={`/art/heroes/${heroId}_cucciolo.png`}
            alt={`Eroe ${heroId}`}
            className="h-32 w-auto object-contain drop-shadow-xl select-none"
            onError={() => setSpriteErr(true)}
            draggable={false}
          />
        ) : (
          <span className="text-6xl select-none" aria-label={`Eroe ${heroId}`}>🦕</span>
        )}

        {/* Block badge */}
        {block > 0 && (
          <div
            className="absolute -top-2 -right-2 flex items-center gap-0.5 bg-blue-900/90 border border-blue-400 text-blue-200 text-xs font-black px-1.5 py-0.5 rounded-full shadow"
            aria-label={`Blocco: ${block}`}
          >
            <Shield className="w-3 h-3" aria-hidden="true" />
            {block}
          </div>
        )}
      </motion.div>

      {/* Status effects row — icons 30×30px */}
      {statusEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {statusEntries.map(([key, count]) => (
            <StatusBadge key={key} status={key} stacks={count} size="xs" />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnergyGem — circular energy display
// ---------------------------------------------------------------------------

interface EnergyGemProps {
  energy: number;
  energyMax: number;
}

function EnergyGem({ energy, energyMax }: EnergyGemProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-4 border-amber-500 bg-stone-950/90 shadow-lg shadow-amber-500/20 select-none"
      style={{ width: 120, height: 120 }}
      aria-label={`Energia: ${energy} su ${energyMax}`}
    >
      <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase leading-none">
        Energia
      </span>
      <span className="text-4xl font-black text-amber-300 leading-tight tabular-nums">
        {energy}
      </span>
      <span className="text-xs text-stone-500 font-semibold leading-none">
        /{energyMax}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PileButton — visual card stack + count badge
// ---------------------------------------------------------------------------

interface PileButtonProps {
  count: number;
  label: string;
  onClick: () => void;
}

function PileButton({ count, label, onClick }: PileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${count} carte`}
      className="relative flex flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg group"
    >
      {/* Stacked card visual */}
      <div className="relative" style={{ width: 60, height: 80 }}>
        {/* Back layers for stack effect */}
        <div className="absolute inset-0 rounded-lg bg-stone-700 border border-stone-600 translate-x-1 translate-y-1 opacity-60" />
        <div className="absolute inset-0 rounded-lg bg-stone-700 border border-stone-600 translate-x-0.5 translate-y-0.5 opacity-80" />
        {/* Top card */}
        <div className="absolute inset-0 rounded-lg bg-stone-800 border border-stone-600 flex items-center justify-center transition-all duration-150 group-hover:border-amber-500">
          <span className="text-xl" aria-hidden="true">🃏</span>
        </div>
        {/* Count badge */}
        <div className="absolute -top-2 -right-2 min-w-[20px] h-5 bg-amber-500 text-stone-950 text-xs font-black rounded-full flex items-center justify-center px-1 shadow">
          {count}
        </div>
      </div>
      <span className="text-[10px] text-stone-400 font-semibold group-hover:text-stone-200 transition-colors">
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// EndTurnButton
// ---------------------------------------------------------------------------

interface EndTurnButtonProps {
  disabled: boolean;
  onClick: () => void;
}

function EndTurnButton({ disabled, onClick }: EndTurnButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Fine turno"
      className={[
        "rounded-xl text-lg font-black tracking-wide transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
        disabled
          ? "bg-stone-700 text-stone-500 cursor-not-allowed"
          : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/30 active:scale-95",
      ].join(" ")}
      style={{ width: 180, height: 70 }}
    >
      Fine Turno
    </button>
  );
}

// ---------------------------------------------------------------------------
// CombatScreen
// ---------------------------------------------------------------------------

export function CombatScreen({
  onCombatEnd,
  onAbandon,
  floorLabel = "Atto 1 · Piano 1",
  gold = 0,
  heroId = "borea",
}: CombatScreenProps) {
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

  const prefersReduced = useReducedMotion();

  // ---------------------------------------------------------------------------
  // Background — pick once per combat, stable across re-renders.
  // ---------------------------------------------------------------------------

  const backgroundPath = useMemo(() => {
    const seed = combat?.turn ?? 0;
    const idx = Math.abs(seed) % ARENA_BACKGROUNDS.length;
    return ARENA_BACKGROUNDS[idx] ?? ARENA_BACKGROUNDS[0];
  // Re-pick only when combat first loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!combat]);

  const [bgError, setBgError] = useState(false);

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
            setHeroFlash(true);
            setTimeout(() => setHeroFlash(false), 400);
            setHeroFloatNums((prev) => [...prev, { id: numId, amount: finalDmg }]);
            setTimeout(() => setHeroFloatNums((prev) => prev.filter((n) => n.id !== numId)), 800);
          } else if (targetId) {
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

    await sleep(400);
    setEnemyTurn(false);
  }, [combat, isEnemyTurn, dispatch, selectCard, setEnemyTurn, setEnemyTurnBanner]);

  // ---------------------------------------------------------------------------
  // Card select / play
  // ---------------------------------------------------------------------------

  const handleCardSelect = useCallback((iid: CardInstanceId) => {
    if (isEnemyTurn || !combat) return;

    if (selectedCardIid === iid) {
      const instance = combat.cardInstances[iid];
      const def = instance ? cardDefs.get(instance.cardId) : null;
      const needsTarget = def?.effects.some(
        (e) => e.kind === "damage" && e.target === "enemy",
      ) ?? false;

      if (!needsTarget) {
        playCard(iid);
        selectCard(null);
      } else {
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

  const selectedInstance = selectedCardIid ? combat.cardInstances[selectedCardIid] : undefined;
  const selectedDef = selectedInstance ? cardDefs.get(selectedInstance.cardId) : null;
  const selectedNeedsTarget = selectedDef?.effects.some(
    (e) => e.kind === "damage" && e.target === "enemy",
  ) ?? false;

  const endTurnDisabled = isEnemyTurn || combat.phase !== "player_turn";

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

      {/* ── Enemy turn banner (absolute, always on top) ── */}
      <AnimatePresence>
        {enemyTurnBanner && (
          <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? {} : { opacity: 0, y: -10 }}
            className="absolute top-16 inset-x-0 z-40 flex justify-center pointer-events-none"
            role="status"
            aria-live="polite"
          >
            <span className="bg-red-900 border border-red-600 text-red-100 text-sm font-bold px-6 py-2 rounded-full shadow-xl">
              Turno Nemico
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════
          FASCIA 1 — TOP BAR (54px fissi)
          ══════════════════════════════════════════════════ */}
      <header
        className="relative z-10 flex items-center justify-between px-4 bg-stone-950/80 backdrop-blur border-b border-stone-800/60 shrink-0"
        style={{ height: 54 }}
      >
        {/* Left: HP bar + gold */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-0.5" aria-label={`Vita: ${combat.hero.hp} su ${combat.hero.maxHp}`}>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-red-400" aria-hidden="true">❤</span>
              <span className="font-bold tabular-nums text-xs">
                {combat.hero.hp}
                <span className="text-stone-500 font-normal">/{combat.hero.maxHp}</span>
              </span>
            </div>
            <div
              className="rounded-full overflow-hidden bg-stone-700"
              style={{ width: 180, height: 14 }}
              role="progressbar"
              aria-valuenow={combat.hero.hp}
              aria-valuemin={0}
              aria-valuemax={combat.hero.maxHp}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${hpBarColor(combat.hero.hp, combat.hero.maxHp)}`}
                style={{ width: `${Math.max(0, (combat.hero.hp / combat.hero.maxHp) * 100)}%` }}
              />
            </div>
          </div>
          <span
            className="text-xs text-amber-400 font-bold flex items-center gap-1"
            aria-label={`Oro: ${gold}`}
          >
            <span aria-hidden="true">💰</span>
            {gold}
          </span>
        </div>

        {/* Center: floor label */}
        <span className="absolute left-1/2 -translate-x-1/2 text-sm text-stone-300 font-semibold tracking-wide">
          {floorLabel}
        </span>

        {/* Right: exit button */}
        {onAbandon && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Abbandonare la run in corso?")) onAbandon();
            }}
            className="text-stone-500 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded p-1 text-sm font-bold"
            aria-label="Abbandona la run"
          >
            ✕ Esci
          </button>
        )}
      </header>

      {/* ══════════════════════════════════════════════════
          FASCIA 2 — ARENA (flex-1, min-h-0)
          ══════════════════════════════════════════════════ */}
      <div className="relative z-10 flex flex-1 min-h-0">
        {/* Sinistra — HeroZone (35%) */}
        <div className="w-[35%] relative">
          <HeroZone
            heroId={heroId}
            hp={combat.hero.hp}
            maxHp={combat.hero.maxHp}
            block={combat.hero.block}
            statuses={combat.hero.statuses}
            heroFlash={heroFlash}
            heroFloatNums={heroFloatNums}
          />
        </div>

        {/* Destra — nemici centrati verticalmente */}
        <section
          className="flex-1 flex items-center justify-center gap-12 px-6"
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
      </div>

      {/* ══════════════════════════════════════════════════
          FASCIA 3 — AREA AZIONE
          ══════════════════════════════════════════════════ */}
      <div
        className="relative z-10 shrink-0 flex items-end"
        style={{
          height: "clamp(280px, 36vh, 420px)",
          background: "linear-gradient(to top, rgb(7 7 5 / 0.97), rgb(7 7 5 / 0.80), transparent)",
        }}
      >
        <div className="flex items-end w-full px-4 pb-4 gap-2">

          {/* LEFT column — EnergyGem + PileButton Mazzo */}
          <div className="flex flex-col items-center gap-3 shrink-0" style={{ width: 150 }}>
            <EnergyGem energy={combat.hero.energy} energyMax={combat.hero.energyMax} />
            <PileButton
              count={combat.piles.draw.length}
              label="Mazzo"
              onClick={() => setPilePreview("draw")}
            />
          </div>

          {/* CENTER — HandArea only (fan cards) */}
          <div className="flex-1 flex items-end justify-center min-w-0" style={{ overflow: "visible" }}>
            <HandArea
              cardInstances={handInstances}
              cardDefs={cardDefs}
              selectedIid={selectedCardIid}
              energyAvailable={combat.hero.energy}
              onCardSelect={handleCardSelect}
            />
          </div>

          {/* RIGHT column — EndTurnButton + PileButton Scarti */}
          <div className="flex flex-col items-center gap-3 shrink-0" style={{ width: 150 }}>
            <EndTurnButton
              disabled={endTurnDisabled}
              onClick={() => { void handleEndTurn(); }}
            />
            <PileButton
              count={combat.piles.discard.length}
              label="Scarti"
              onClick={() => setPilePreview("discard")}
            />
          </div>
        </div>
      </div>

      {/* ── Pile preview sheet ── */}
      <AnimatePresence>
        {pilePreview && (
          <>
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
