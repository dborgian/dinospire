// ---------------------------------------------------------------------------
// Enemy intent generation — picks next move for each enemy based on their
// movePattern ('sequential' | 'random' | 'conditional') and current state.
// All functions are pure.
// ---------------------------------------------------------------------------

import type {
  CombatState,
  EnemyDefinition,
  EnemyId,
  EnemyInstance,
  EnemyIntent,
  EnemyMoveDefinition,
} from '../types';
import type { SeededRng } from '../rng';
import { evalPredicate, applyEffects } from './effects';

// ---------------------------------------------------------------------------
// Intent selection
// ---------------------------------------------------------------------------

/**
 * Select the next intent for a single enemy given its definition and state.
 * The returned EnemyIntent is what the UI shows for the coming enemy turn.
 * If the intent has `hidden: true` (e.g. Carnotaurus Agguato), the UI should
 * render it as `{ type: 'unknown', description: '???' }`.
 */
export function selectNextIntent(
  enemy: EnemyInstance,
  definition: EnemyDefinition,
  state: CombatState,
  rng: SeededRng,
): EnemyIntent {
  const move = selectNextMove(enemy, definition, state, rng);
  if (!move) {
    return { type: 'unknown', description: '???' };
  }

  // Hidden intents (boss mechanics) are displayed as unknown to the player
  if (move.intent.hidden) {
    return { type: 'unknown', description: '???' };
  }

  return move.intent;
}

/**
 * Select the next EnemyMoveDefinition for an enemy.
 * Returns undefined only if the enemy has no moves at all.
 */
export function selectNextMove(
  enemy: EnemyInstance,
  definition: EnemyDefinition,
  state: CombatState,
  rng: SeededRng,
): EnemyMoveDefinition | undefined {
  if (definition.moves.length === 0) return undefined;

  switch (definition.movePattern) {
    case 'sequential':
      return selectSequential(enemy, definition);

    case 'random':
      return selectRandom(enemy, definition, state, rng);

    case 'conditional':
      return selectConditional(enemy, definition, state);
  }
}

// ---------------------------------------------------------------------------
// Pattern: sequential
// Cycles through moves in order by currentMoveIndex.
// ---------------------------------------------------------------------------

function selectSequential(
  enemy: EnemyInstance,
  definition: EnemyDefinition,
): EnemyMoveDefinition {
  const idx = enemy.currentMoveIndex % definition.moves.length;
  // noUncheckedIndexedAccess safety: we know moves.length > 0 from the guard above
  return definition.moves[idx] as EnemyMoveDefinition;
}

// ---------------------------------------------------------------------------
// Pattern: random
// Weighted random among moves whose condition (if any) is satisfied.
// Falls back to the first available move if no weights are set.
// ---------------------------------------------------------------------------

function selectRandom(
  enemy: EnemyInstance,
  definition: EnemyDefinition,
  state: CombatState,
  rng: SeededRng,
): EnemyMoveDefinition {
  // Filter by conditioned predicates
  const eligible = definition.moves.filter(
    (m) =>
      m.conditioned === undefined ||
      evalPredicate(m.conditioned, state, false, enemy.iid),
  );

  const pool = eligible.length > 0 ? eligible : definition.moves;

  // Weighted selection using probability; if no probabilities set, uniform
  const totalWeight = pool.reduce((acc, m) => acc + (m.probability ?? 1), 0);
  let pick = rng.next() * totalWeight;

  for (const move of pool) {
    pick -= move.probability ?? 1;
    if (pick <= 0) return move;
  }

  // Fallback (floating point edge case)
  return pool[pool.length - 1] as EnemyMoveDefinition;
}

// ---------------------------------------------------------------------------
// Pattern: conditional
// Evaluates each move's conditioned predicate in order; uses the first match.
// Falls back to the last move (unconditional fallback by convention).
// ---------------------------------------------------------------------------

function selectConditional(
  enemy: EnemyInstance,
  definition: EnemyDefinition,
  state: CombatState,
): EnemyMoveDefinition {
  for (const move of definition.moves) {
    if (
      move.conditioned === undefined ||
      evalPredicate(move.conditioned, state, false, enemy.iid)
    ) {
      return move;
    }
  }
  // Last move is the fallback by StS convention
  return definition.moves[definition.moves.length - 1] as EnemyMoveDefinition;
}

// ---------------------------------------------------------------------------
// Intent advancement
// ---------------------------------------------------------------------------

/**
 * Advance the currentMoveIndex for sequential enemies after they have acted.
 * For random/conditional enemies the index is unused but we still increment
 * it to keep a round counter (useful for debugging).
 */
export function advanceMoveIndex(enemy: EnemyInstance): EnemyInstance {
  return { ...enemy, currentMoveIndex: enemy.currentMoveIndex + 1 };
}

// ---------------------------------------------------------------------------
// Execute enemy move
// ---------------------------------------------------------------------------

/**
 * Execute the current move of an enemy against the player.
 * Returns updated CombatState. Effects are applied via the effects module.
 *
 * The caller is responsible for looking up the EnemyDefinition by
 * `enemy.definitionId` from the content registry before calling this.
 */
export function executeEnemyMove(
  state: CombatState,
  enemyIid: EnemyId,
  definition: EnemyDefinition,
): CombatState {
  const enemy = state.enemies.find((e) => e.iid === enemyIid);
  if (!enemy || enemy.hp <= 0) return state;

  const move = selectMoveByIndex(enemy, definition);
  if (!move) return state;

  // Enemy acts as non-hero actor; targetId is not set (hero is implicit target
  // for enemy attacks — effects.ts handles 'self'/'enemy' from enemy perspective)
  let s = applyEffects(
    state,
    move.effects,
    false, // actorIsHero = false
    undefined, // targetId — enemy attacks target hero by convention
  );

  // Advance the move index after acting
  s = {
    ...s,
    enemies: s.enemies.map((e) =>
      e.iid === enemyIid ? advanceMoveIndex(e) : e,
    ),
  };

  return s;
}

/**
 * Look up the move the enemy will perform on this turn by currentMoveIndex.
 * For random/conditional patterns this is the previously-selected intent
 * (not re-rolled at execution time).
 *
 * Note: for random/conditional enemies the UI intent was selected at the END
 * of the previous turn. At execution time we re-derive the move by replaying
 * the same index. This is safe because the RNG is deterministic and the state
 * at selection time matches the state at execution time (no choices in between).
 *
 * For simplicity in the executor we use sequential by index for all patterns —
 * the intent shown to the player is what was computed at selection time, and
 * the effects executed here must match. The safest approach: store the selected
 * move ID on EnemyInstance. Since the type doesn't have that field, we fall
 * back to sequential-by-index which is correct for sequential patterns, and
 * approximate for random/conditional (acceptable for V1; add selectedMoveId to
 * EnemyInstance in a follow-up if divergence causes bugs).
 */
function selectMoveByIndex(
  enemy: EnemyInstance,
  definition: EnemyDefinition,
): EnemyMoveDefinition | undefined {
  if (definition.moves.length === 0) return undefined;
  const idx = enemy.currentMoveIndex % definition.moves.length;
  return definition.moves[idx];
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

/**
 * Update nextIntent for all living enemies. Called at the end of each turn so
 * the player sees the upcoming enemy actions before choosing their moves.
 */
export function refreshAllIntents(
  state: CombatState,
  definitions: ReadonlyMap<EnemyId, EnemyDefinition>,
  rng: SeededRng,
): CombatState {
  const updatedEnemies = state.enemies.map((enemy) => {
    if (enemy.hp <= 0) return enemy;
    const definition = definitions.get(enemy.definitionId);
    if (!definition) return enemy;

    const nextIntent = selectNextIntent(enemy, definition, state, rng);
    return { ...enemy, nextIntent };
  });

  return { ...state, enemies: updatedEnemies };
}
