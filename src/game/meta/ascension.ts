// ---------------------------------------------------------------------------
// Ascension system — 20 difficulty modifiers layered onto the base game.
// Each level adds one patch on top of all previous levels.
// ---------------------------------------------------------------------------

import type { AscensionPatch, RunState } from "@/game/types";

/** All 20 ascension patches in order. */
export const ASCENSION_PATCHES: readonly AscensionPatch[] = [
  {
    level: 1,
    description: "Enemies have 10% more HP",
    patches: [{ path: "enemy_hp_mul", value: 1.1 }],
  },
  {
    level: 2,
    description: "Start each run with 1 Curse in your deck",
    patches: [], // TODO: implemented via run init logic
  },
  {
    level: 3,
    description: "Card rewards offer one fewer choice",
    patches: [{ path: "card_reward_count", value: -1 }],
  },
  {
    level: 4,
    description: "Elites appear more frequently",
    patches: [{ path: "elite_frequency_add", value: 5 }],
  },
  {
    level: 5,
    description: "Shop prices are 10% higher",
    patches: [{ path: "shop_price_mul", value: 1.1 }],
  },
  // TODO: levels 6–20
];

/**
 * Collect all patches active at a given ascension level (cumulative).
 */
export function getActivePatches(
  level: number,
): readonly AscensionPatch["patches"][number][] {
  return ASCENSION_PATCHES.filter((p) => p.level <= level).flatMap(
    (p) => p.patches,
  );
}

/**
 * Apply ascension patches to a scalar (e.g. enemy HP multiplier).
 * Returns the final multiplied/added value.
 */
export function applyEnemyHpMul(level: number, baseHp: number): number {
  const patches = getActivePatches(level);
  const mul = patches
    .filter((p) => p.path === "enemy_hp_mul")
    .reduce((acc, p) => acc * (p as { path: "enemy_hp_mul"; value: number }).value, 1);
  return Math.round(baseHp * mul);
}

/**
 * Resolve the number of card reward choices for a given ascension level.
 */
export function cardRewardCount(level: number): number {
  const patches = getActivePatches(level);
  const delta = patches
    .filter((p) => p.path === "card_reward_count")
    .reduce((acc, p) => acc + (p as { path: "card_reward_count"; value: number }).value, 0);
  return Math.max(1, 3 + delta);
}

/**
 * True if the player has unlocked ascension level N for a given run config.
 * Ascension unlocks sequentially: you must beat A(N-1) to attempt A(N).
 */
export function isAscensionUnlocked(
  _run: RunState,
  targetLevel: number,
  highestBeaten: number,
): boolean {
  return targetLevel <= highestBeaten + 1;
}
