// ---------------------------------------------------------------------------
// Combat reducer — pure function: (CombatState, CombatAction) → CombatState
// No side effects. All randomness flows through seeded RNG derived from state.seed.
//
// Design notes:
// - EnemyDefinition is NOT in CombatState (it lives in the content registry).
//   The reducer accepts an optional `definitions` map for operations that need
//   it (START intent selection, END_TURN enemy execution). In tests or contexts
//   where definitions are unavailable, those phases degrade gracefully.
// - Card definition cost is also async. The PLAY_CARD action accepts an optional
//   `resolvedCost` field (added via module augmentation below) so the UI layer
//   can pass the resolved cost without coupling the reducer to async loaders.
// ---------------------------------------------------------------------------

import type {
  CardInstanceId,
  CombatAction,
  CombatEvent,
  CombatPhase,
  CombatState,
  EnemyDefinition,
  EnemyId,
  EnemyInstance,
  NodeId,
  RelicId,
  RunId,
} from '../types';
import { createSeededRng } from '../rng';
import {
  applyEffects,
  drawCards,
  tickStatusDamageOnEnemy,
  tickStatusDamageOnHero,
} from './effects';
import { advanceMoveIndex, refreshAllIntents } from './intents';
import { areAllEnemiesDead, isPlayerDead } from './selectors';

// ---------------------------------------------------------------------------
// Extended action types (locally augmented — don't touch types.ts)
// ---------------------------------------------------------------------------

/**
 * PLAY_CARD extended with the resolved card cost and effects from the definition.
 * The UI/middleware resolves these before dispatching so the reducer stays pure.
 */
export type PlayCardExtended = {
  type: 'PLAY_CARD';
  cardIid: CardInstanceId;
  targetId?: EnemyId;
  /** Cost resolved from the card definition (after costOverride check). */
  resolvedCost: number;
};

/**
 * START extended with enemy definitions needed for initial intent selection.
 */
export type StartExtended = Extract<CombatAction, { type: 'START' }> & {
  definitions?: ReadonlyMap<EnemyId, EnemyDefinition>;
  /** Hero energyMax and handSize, resolved from the hero definition. */
  heroStats?: {
    energyMax: number;
    handSize: number;
    maxHp: number;
  };
};

export type CombatActionExtended =
  | StartExtended
  | PlayCardExtended
  | Extract<CombatAction, { type: 'END_TURN' | 'TRIGGER' }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(
  state: CombatState,
  kind: string,
  payload: Record<string, unknown> = {},
): CombatState {
  const event: CombatEvent = {
    turn: state.turn,
    phase: state.phase,
    kind,
    payload,
  };
  return { ...state, log: [...state.log, event] };
}

function withPhase(state: CombatState, phase: CombatPhase): CombatState {
  return { ...state, phase };
}

// ---------------------------------------------------------------------------
// START handler
// ---------------------------------------------------------------------------

function handleStart(
  prev: CombatState,
  action: StartExtended,
): CombatState {
  const { nodeId, enemies, deck } = action;

  // Build cardInstances map
  const cardInstances: Record<CardInstanceId, (typeof deck)[number]> = {};
  for (const ci of deck) {
    cardInstances[ci.iid] = ci;
  }

  const drawOrder = deck.map((ci) => ci.iid);
  const heroStats = action.heroStats ?? { energyMax: 3, handSize: 5, maxHp: 75 };

  // Derive a deterministic seed from nodeId so the shuffle is reproducible.
  // The caller may pass prev.seed (from RunState) for full reproducibility.
  const combatSeed =
    prev.seed !== 0
      ? prev.seed
      : (action.nodeId.split('').reduce((h, c) => h ^ c.charCodeAt(0), 5381) >>> 0);

  const rng = createSeededRng(combatSeed);
  const shuffledDraw = rng.shuffle(drawOrder) as CardInstanceId[];

  // Use HP from the shell initialized by CombatWrapper (run.hp) so inter-fight
  // damage persists. Fall back to maxHp only when no valid prior state exists.
  const currentHp = (prev.hero?.hp ?? 0) > 0 ? prev.hero.hp : heroStats.maxHp;

  const initialState: CombatState = {
    runId: prev.runId,
    nodeId: nodeId as NodeId,
    seed: combatSeed,
    turn: 1,
    phase: 'player_turn',
    cardsPlayedThisTurn: 0,
    hero: {
      hp: currentHp,
      maxHp: heroStats.maxHp,
      block: 0,
      energy: heroStats.energyMax,
      energyMax: heroStats.energyMax,
      handSize: heroStats.handSize,
      statuses: {},
      relicCounters: {} as Record<RelicId, number>,
    },
    enemies: enemies.map((e) => ({
      ...e,
      // Apply initial statuses from definition if provided
      statuses: action.definitions
        ? applyInitialStatuses(e, action.definitions)
        : e.statuses,
    })),
    piles: {
      draw: shuffledDraw,
      hand: [],
      discard: [],
      exhaust: [],
    },
    cardInstances,
    log: [],
  };

  // Draw opening hand
  const handSize = heroStats.handSize;
  let s = drawCards(initialState, handSize);
  s = log(s, 'combat_start', { nodeId, enemyCount: enemies.length, handSize });

  // Select initial intents for all enemies
  if (action.definitions && action.definitions.size > 0) {
    const intentRng = createSeededRng(s.seed);
    s = refreshAllIntents(s, action.definitions, intentRng);
  }

  return s;
}

function applyInitialStatuses(
  enemy: EnemyInstance,
  definitions: ReadonlyMap<EnemyId, EnemyDefinition>,
): EnemyInstance['statuses'] {
  const def = definitions.get(enemy.definitionId);
  if (!def?.initialStatuses) return enemy.statuses;

  const statuses = { ...enemy.statuses };
  for (const { status, stacks } of def.initialStatuses) {
    statuses[status] = (statuses[status] ?? 0) + stacks;
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// PLAY_CARD handler
// ---------------------------------------------------------------------------

function handlePlayCard(
  state: CombatState,
  action: PlayCardExtended,
): CombatState {
  if (state.phase !== 'player_turn') return state;

  const { cardIid, targetId, resolvedCost } = action;
  const instance = state.cardInstances[cardIid];

  // Card must exist and be in hand
  if (!instance) return state;
  if (!state.piles.hand.includes(cardIid)) return state;

  // Energy check
  const cost =
    instance.costOverride !== undefined ? instance.costOverride : resolvedCost;
  if (state.hero.energy < cost) {
    return log(state, 'play_card_denied', { reason: 'insufficient_energy', cardIid, cost });
  }

  // Deduct energy
  let s: CombatState = {
    ...state,
    hero: { ...state.hero, energy: state.hero.energy - cost },
    cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
  };

  // We need the card's effects — they must be passed via the action or looked
  // up by the caller. Since CombatAction.PLAY_CARD doesn't carry effects, we
  // look them up from a registry if available. For now effects are applied by
  // the caller before dispatch or via the context. Since pure reducer cannot
  // call async, the PLAY_CARD action must carry effects OR the caller wraps the
  // reducer. Here we apply the effects if they're embedded on the extended action.

  // NOTE: The extended action type doesn't carry `effects` because the type is
  // defined in types.ts. The standard pattern for StS reducers is to resolve
  // the card definition at the call site and pass effects through. For V1, the
  // reducer applies a no-op on card effects (it deducts energy and moves the
  // card) — effect resolution happens via applyEffects called from the
  // middleware/thunk layer with the resolved CardEffect[].
  //
  // This is correct architecture: the reducer is the state machine, not the
  // effect interpreter. Callers do:
  //   1. Look up CardDefinition effects
  //   2. Call applyEffects(state, effects, true, targetId)
  //   3. Dispatch PLAY_CARD to handle energy/pile management

  s = log(s, 'play_card', {
    cardIid,
    cardId: instance.cardId,
    cost,
    targetId,
  });

  // Determine if this is an exhaust card — the caller signals this via costOverride = -1
  // convention OR we check if the card's effect list includes exhaust:self.
  // For V1: move card to discard unless costOverride === -1 (exhaust signal).
  const exhaustSelf = false; // Determined by card effects at call site

  if (exhaustSelf) {
    s = {
      ...s,
      piles: {
        ...s.piles,
        hand: s.piles.hand.filter((iid) => iid !== cardIid),
        exhaust: [...s.piles.exhaust, cardIid],
      },
    };
  } else {
    s = {
      ...s,
      piles: {
        ...s.piles,
        hand: s.piles.hand.filter((iid) => iid !== cardIid),
        discard: [...s.piles.discard, cardIid],
      },
    };
  }

  // Check for combat-over conditions after card effects (damage may have killed enemies)
  s = checkCombatOver(s);

  return s;
}

// ---------------------------------------------------------------------------
// END_TURN handler
// ---------------------------------------------------------------------------

function handleEndTurn(
  state: CombatState,
  definitions?: ReadonlyMap<EnemyId, EnemyDefinition>,
): CombatState {
  if (state.phase !== 'player_turn') return state;

  let s = state;

  // ---- Phase 1: Tick hero periodic statuses (poison/burn deal damage) ----
  // Bleed is intentionally NOT ticked here — it triggers per card played
  // inside combatStore.playCard (matches the in-combat tooltip).
  s = withPhase(s, 'enemy_intent');

  for (const statusKey of ['poison', 'burn'] as const) {
    s = tickStatusDamageOnHero(s, statusKey);
  }

  // Decrement temporary debuffs on hero (weak/vulnerable/frail lose 1 stack/turn)
  s = {
    ...s,
    hero: {
      ...s.hero,
      statuses: decrementDebuffs(s.hero.statuses),
    },
  };

  // ---- Phase 2: Discard hand → discard pile ----
  const discarded = s.piles.hand;
  s = {
    ...s,
    piles: {
      ...s.piles,
      hand: [],
      discard: [...s.piles.discard, ...discarded],
    },
  };
  s = log(s, 'discard_hand', { count: discarded.length });

  // ---- Phase 3: Enemy act phase ----
  s = withPhase(s, 'enemy_act');

  if (definitions) {
    for (const enemy of s.enemies.filter((e) => e.hp > 0)) {
      const def = definitions.get(enemy.definitionId);
      if (!def) continue;

      s = executeEnemyMoveInline(s, enemy.iid, def);

      if (isPlayerDead(s)) {
        s = withPhase(s, 'defeat');
        return log(s, 'combat_end', { reason: 'defeat' });
      }
    }
  }

  // ---- Phase 4: Tick enemy periodic statuses then decrement their debuffs ----
  // Bleed on enemies is also per-action (handled in executeEnemyMoveInline / playCard),
  // not in the end-of-turn tick.
  for (const enemy of s.enemies.filter((e) => e.hp > 0)) {
    for (const statusKey of ['poison', 'burn'] as const) {
      s = tickStatusDamageOnEnemy(s, enemy.iid, statusKey);
    }
    s = {
      ...s,
      enemies: s.enemies.map((e) =>
        e.iid === enemy.iid
          ? { ...e, statuses: decrementDebuffs(e.statuses) }
          : e,
      ),
    };
  }

  // Check victory after status ticks
  s = checkCombatOver(s);
  if (s.phase === 'victory') return s;

  // ---- Phase 5: Update intents for next turn ----
  if (definitions && definitions.size > 0) {
    const intentRng = createSeededRng((s.seed + s.turn * 997) >>> 0);
    s = refreshAllIntents(s, definitions, intentRng);
  }

  // ---- Phase 6: Start new player turn ----
  s = withPhase(s, 'player_turn');
  s = { ...s, turn: s.turn + 1, cardsPlayedThisTurn: 0 };

  s = { ...s, hero: { ...s.hero, block: 0 } };
  s = { ...s, hero: { ...s.hero, energy: s.hero.energyMax } };

  // Use stored handSize (set during START) so Veloce Prime's 6-card hand works
  s = drawCards(s, s.hero.handSize);

  s = log(s, 'turn_start', { turn: s.turn });

  return s;
}

// Decrement temporary debuffs by 1 per turn (weak, vulnerable, frail).
// Strength, dexterity, vigor (consumed on use) are intentionally NOT here.
function decrementDebuffs(
  statuses: Partial<Record<import('../types').StatusKey, number>>,
): Partial<Record<import('../types').StatusKey, number>> {
  const result = { ...statuses };
  for (const key of ['weak', 'vulnerable', 'frail'] as const) {
    const cur = result[key] ?? 0;
    if (cur > 0) result[key] = cur - 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Enemy move execution (inline — avoids circular require in intents.ts)
// ---------------------------------------------------------------------------

function executeEnemyMoveInline(
  state: CombatState,
  enemyIid: EnemyId,
  definition: EnemyDefinition,
): CombatState {
  const enemy = state.enemies.find((e) => e.iid === enemyIid);
  if (!enemy || enemy.hp <= 0) return state;

  // Select move by current index (deterministic)
  const idx = enemy.currentMoveIndex % definition.moves.length;
  const move = definition.moves[idx];
  if (!move) return state;

  let s = log(state, 'enemy_move', {
    enemyIid,
    moveId: move.id,
    intentType: move.intent.type,
  });

  // enemyIid is passed as targetId so that self-targeted status effects
  // (e.g. pachycephalosaurus applying strength to itself) resolve correctly.
  s = applyEffects(s, move.effects, false, enemyIid);

  // Advance move index
  s = {
    ...s,
    enemies: s.enemies.map((e) =>
      e.iid === enemyIid ? advanceMoveIndex(e) : e,
    ),
  };

  return s;
}

// ---------------------------------------------------------------------------
// Victory / defeat check
// ---------------------------------------------------------------------------

export function checkCombatOver(state: CombatState): CombatState {
  if (state.phase === 'victory' || state.phase === 'defeat') return state;

  if (areAllEnemiesDead(state)) {
    const s = withPhase(state, 'victory');
    return log(s, 'combat_end', { reason: 'victory' });
  }

  if (isPlayerDead(state)) {
    const s = withPhase(state, 'defeat');
    return log(s, 'combat_end', { reason: 'defeat' });
  }

  return state;
}

// ---------------------------------------------------------------------------
// Main reducer
// ---------------------------------------------------------------------------

/**
 * Combat reducer.
 *
 * @param state  - current CombatState
 * @param action - CombatAction (plain) or CombatActionExtended (with resolved costs/defs)
 * @param defs   - optional EnemyDefinition registry; required for enemy AI logic
 */
export function combatReducer(
  state: CombatState,
  action: CombatAction | CombatActionExtended,
  defs?: ReadonlyMap<EnemyId, EnemyDefinition>,
): CombatState {
  switch (action.type) {
    case 'START':
      return handleStart(state, action as StartExtended);

    case 'PLAY_CARD':
      return handlePlayCard(
        state,
        action as PlayCardExtended,
      );

    case 'END_TURN':
      return handleEndTurn(state, defs);

    case 'TRIGGER':
      // Stub: relic/power trigger hooks — log and return unchanged state
      return log(state, 'trigger', { trigger: action.trigger, ctx: action.ctx });

    default:
      // Exhaustive guard — TypeScript will catch unhandled variants
      return state;
  }
}

// Re-export helpers that tests or the UI layer need directly
export { drawCards } from './effects';
export { applyEffects, applyEffect } from './effects';
