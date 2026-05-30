// ---------------------------------------------------------------------------
// Relic system — combat-side helpers + trigger dispatcher.
//
// Two flavours of relic effect application:
//
//   A. TRIGGER-BASED — fires once per discrete event (battle start, enemy kill).
//      Applied via `fireRelicTrigger`. Used for one-shot effects whose JSON
//      `effects` array fully describes the behaviour (e.g. draw a card, gain
//      energy, +1 strength on kill).
//
//   B. INLINE — checked directly inside the damage / block / tick pipelines.
//      Used for effects that would loop if expressed as triggers (every block
//      adds +3 → infinite recursion), or that need modifier-style behaviour
//      (halve DoT damage, double the first attack).
//
// We DO NOT fire `on_attack` / `on_block` triggers because their idiomatic
// relics modify already-running effects rather than spawn new ones; inline is
// both simpler and recursion-free.
// ---------------------------------------------------------------------------

import type {
  CombatState,
  RelicTrigger,
  RelicId,
  RunState,
} from '@/game/types';
import { getRelic } from '@/game/content/index';
import { applyEffects } from './effects';

// ---------------------------------------------------------------------------
// Combat-side: trigger dispatcher (battle_start, kill, act_start)
// ---------------------------------------------------------------------------

const COMBAT_TRIGGER_SUPPORTED: ReadonlySet<RelicTrigger> = new Set<RelicTrigger>([
  'on_battle_start',
  'on_kill',
  'on_act_start',
  'on_turn_start',
  'on_turn_end',
  'on_shuffle',
]);

export function fireRelicTrigger(
  state: CombatState,
  trigger: RelicTrigger,
): CombatState {
  if (!COMBAT_TRIGGER_SUPPORTED.has(trigger)) return state;

  let s = state;
  for (const relicId of s.hero.relics) {
    const def = getRelic(relicId);
    if (!def || def.trigger !== trigger) continue;

    // counterMax gates total firings across a run (e.g. zanna_del_re: 5 max)
    if (def.counterMax !== undefined) {
      const fired = s.hero.relicCounters[relicId] ?? 0;
      if (fired >= def.counterMax) continue;
      s = bumpCounter(s, relicId);
    }

    if (def.effects.length > 0) {
      s = applyEffects(s, def.effects, true);
    }
  }
  return s;
}

function bumpCounter(state: CombatState, relicId: RelicId): CombatState {
  return {
    ...state,
    hero: {
      ...state.hero,
      relicCounters: {
        ...state.hero.relicCounters,
        [relicId]: (state.hero.relicCounters[relicId] ?? 0) + 1,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Combat-side: inline modifier helpers
// ---------------------------------------------------------------------------

/**
 * `ambra_predatoria` — the first hero attack of combat deals double damage.
 * Caller doubles `base` damage when this returns true, then immediately calls
 * `consumeAmbraPredatoria` to mark the counter so subsequent attacks don't.
 */
export function shouldDoubleFirstAttack(state: CombatState): boolean {
  if (!state.hero.relics.includes('ambra_predatoria' as RelicId)) return false;
  const fired = state.hero.relicCounters['ambra_predatoria' as RelicId] ?? 0;
  return fired < 1;
}

export function consumeAmbraPredatoria(state: CombatState): CombatState {
  return bumpCounter(state, 'ambra_predatoria' as RelicId);
}

/**
 * `pelle_resistente` — DoT (poison/bleed/burn) deals 25% less to the hero.
 */
export function dotMultiplier(state: CombatState): number {
  if (state.hero.relics.includes('pelle_resistente' as RelicId)) return 0.75;
  return 1.0;
}

/**
 * `scaglia_madre` — every hero block effect gains +3 block (before frail).
 */
export function blockBonusFromRelics(state: CombatState): number {
  if (state.hero.relics.includes('scaglia_madre' as RelicId)) return 3;
  return 0;
}

// ---------------------------------------------------------------------------
// Run-side: equip-time effects (apply to RunState, not CombatState)
// ---------------------------------------------------------------------------

/**
 * `cranio_fossile` — gives +1 reward card.
 */
export function rewardCardBonus(relics: readonly RelicId[]): number {
  if (relics.includes('cranio_fossile' as RelicId)) return 1;
  return 0;
}

/**
 * Apply equip-time effects to RunState when a relic is granted.
 *  - `cuore_di_pietra`  → +8 maxHp and full +8 heal
 *  - `uovo_del_primo`   → starts the run already at the next evolution stage
 *
 * Idempotency: callers should only invoke this once per relic acquisition
 * (it does not check for prior application).
 */
export function applyRelicEquipEffects(run: RunState, relicId: RelicId): RunState {
  let next = run;

  if (relicId === ('cuore_di_pietra' as RelicId)) {
    next = {
      ...next,
      maxHp: next.maxHp + 8,
      hp: Math.min(next.maxHp + 8, next.hp + 8),
    };
  }

  if (relicId === ('uovo_del_primo' as RelicId)) {
    // Skip cucciolo → start at adulto if still at cucciolo
    if (next.evolutionStage === 'cucciolo') {
      next = { ...next, evolutionStage: 'adulto' };
    }
  }

  return next;
}
