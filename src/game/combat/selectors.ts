// ---------------------------------------------------------------------------
// Combat selectors — derived data from CombatState.
// All are pure functions suitable for memoisation.
// ---------------------------------------------------------------------------

import type {
  CardInstance,
  CardInstanceId,
  CombatState,
  EnemyId,
  EnemyInstance,
  StatusKey,
} from '../types';

// ---------------------------------------------------------------------------
// Card / hand selectors
// ---------------------------------------------------------------------------

/** Cards currently in hand, in draw order. */
export function getHandCards(state: CombatState): CardInstance[] {
  return state.piles.hand.map((iid) => {
    const card = state.cardInstances[iid];
    if (!card) throw new Error(`CardInstance ${iid} not found`);
    return card;
  });
}

/**
 * Effective cost of a card taking costOverride into account.
 * Falls back to 0 when the base definition cost is unknown (definition lookup
 * is async; callers that need real costs must pass a resolved cost map).
 */
export function getEffectiveCardCost(
  state: CombatState,
  cardIid: CardInstanceId,
  resolvedCost?: number,
): number {
  const instance = state.cardInstances[cardIid];
  if (!instance) return 0;
  if (instance.costOverride !== undefined) return instance.costOverride;
  return resolvedCost ?? 0;
}

/**
 * Whether the card can be played right now.
 * Requires the resolved card cost from the definition (or 0 as safe default).
 */
export function canPlayCard(
  state: CombatState,
  cardIid: CardInstanceId,
  resolvedCost?: number,
): boolean {
  if (state.phase !== 'player_turn') return false;
  const instance = state.cardInstances[cardIid];
  if (!instance) return false;
  if (!state.piles.hand.includes(cardIid)) return false;
  const cost = getEffectiveCardCost(state, cardIid, resolvedCost);
  return state.hero.energy >= cost;
}

// ---------------------------------------------------------------------------
// Enemy selectors
// ---------------------------------------------------------------------------

/** Living enemies (hp > 0). */
export function getLiveEnemies(state: CombatState): EnemyInstance[] {
  return state.enemies.filter((e) => e.hp > 0);
}

/** All enemies regardless of HP. */
export function getAllEnemies(state: CombatState): EnemyInstance[] {
  return state.enemies;
}

/** Find a specific enemy by instance id. */
export function selectEnemy(
  state: CombatState,
  id: EnemyId,
): EnemyInstance | undefined {
  return state.enemies.find((e) => e.iid === id);
}

// ---------------------------------------------------------------------------
// Status selectors
// ---------------------------------------------------------------------------

/** Stack count of a status on the hero (0 if absent). */
export function selectHeroStatus(state: CombatState, key: StatusKey): number {
  return state.hero.statuses[key] ?? 0;
}

/** Stack count of a status on a specific enemy (0 if absent). */
export function selectEnemyStatus(
  state: CombatState,
  id: EnemyId,
  key: StatusKey,
): number {
  const enemy = selectEnemy(state, id);
  return enemy?.statuses[key] ?? 0;
}

// ---------------------------------------------------------------------------
// Combat-over checks
// ---------------------------------------------------------------------------

/** True when the hero's HP has reached 0. */
export function isPlayerDead(state: CombatState): boolean {
  return state.hero.hp <= 0;
}

/** True when every enemy has 0 HP. */
export function areAllEnemiesDead(state: CombatState): boolean {
  return state.enemies.length > 0 && state.enemies.every((e) => e.hp <= 0);
}

/** True when the combat is over (victory or defeat). */
export function isCombatOver(state: CombatState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat';
}

// ---------------------------------------------------------------------------
// Deck / pile selectors
// ---------------------------------------------------------------------------

/** Total cards remaining in draw + discard (excludes hand and exhaust). */
export function getDeckSize(state: CombatState): number {
  return state.piles.draw.length + state.piles.discard.length;
}

// ---------------------------------------------------------------------------
// Damage preview
// ---------------------------------------------------------------------------

/**
 * Preview the final damage a card would deal to a target before playing it.
 * Returns 0 if the card isn't a damage card or if no damage effect is found.
 *
 * This is a best-effort preview: it applies attacker modifiers only (strength,
 * weak, vigor) but does NOT consume state (vigor is not zeroed).
 * Requires the resolved base damage value from the card definition.
 */
export function previewDamage(
  state: CombatState,
  targetId: EnemyId,
  baseDamage: number,
): number {
  const hero = state.hero;
  const enemy = selectEnemy(state, targetId);
  if (!enemy) return 0;

  let dmg = baseDamage;

  // Strength
  dmg += hero.statuses['strength'] ?? 0;

  // Vigor (add but do not consume)
  dmg += hero.statuses['vigor'] ?? 0;

  // Weak
  if ((hero.statuses['weak'] ?? 0) > 0) {
    dmg = Math.floor(dmg * 0.75);
  }

  // Vulnerable on target
  if ((enemy.statuses['vulnerable'] ?? 0) > 0) {
    dmg = Math.ceil(dmg * 1.5);
  }

  return Math.max(0, dmg);
}

// ---------------------------------------------------------------------------
// Legacy aliases (match original selector names from stub)
// ---------------------------------------------------------------------------

/** @deprecated Use getHandCards */
export const selectHand = getHandCards;

/** @deprecated Use canPlayCard */
export const selectCanPlayCard = (
  state: CombatState,
  iid: CardInstanceId,
): boolean => canPlayCard(state, iid);

/** @deprecated Use getLiveEnemies */
export const selectLivingEnemies = getLiveEnemies;

/** @deprecated Use isCombatOver */
export const selectCombatOver = isCombatOver;

/** @deprecated Use getDeckSize */
export const selectDeckSize = getDeckSize;
