// ---------------------------------------------------------------------------
// Reward pool generation — post-combat card choices, gold drops, relic picks.
// ---------------------------------------------------------------------------

import type { Reward, CardId, RelicId, HeroId, NodeType } from '@/game/types';
import type { SeededRng } from '@/game/rng';

// ---------------------------------------------------------------------------
// Card rewards
// ---------------------------------------------------------------------------

/**
 * Generate `count` card reward choices from the act pool.
 * Cards already in the player's deck are excluded to avoid duplicates.
 * Returns fewer than `count` entries only when the pool is exhausted.
 */
export function generateCardRewards(
  act: 1 | 2 | 3,
  heroId: HeroId,
  deckCardIds: CardId[],
  rng: SeededRng,
  count = 3,
): CardId[] {
  // In a fully data-driven build this would pull from the loaded card registry.
  // Until the card JSON for each act is wired, we return an empty pool rather
  // than crashing — callers should check the pool before offering rewards.
  void act;
  void heroId;

  const deckSet = new Set(deckCardIds);
  const pool: CardId[] = getActCardPool(act, heroId).filter((id) => !deckSet.has(id));

  if (pool.length === 0) return [];

  // Fisher-Yates sample without replacement
  const picks: CardId[] = [];
  const available = [...pool];
  const n = Math.min(count, available.length);
  for (let i = 0; i < n; i++) {
    const idx = rng.int(0, available.length - 1);
    picks.push(available[idx] as CardId);
    available.splice(idx, 1);
  }
  return picks;
}

/**
 * Synchronous pool access — returns card ids known for the act/hero combination.
 * This is the integration point for the content registry; swap in a real lookup
 * once card JSON files are loaded.
 */
function getActCardPool(_act: 1 | 2 | 3, _heroId: HeroId): CardId[] {
  // TODO: replace with `[...contentRegistry.cards.values()].filter(c => c.act === act ...)`
  // once card JSON data files are available and loaded via loadCards().
  return [];
}

// ---------------------------------------------------------------------------
// Gold drops
// ---------------------------------------------------------------------------

/**
 * Gold drop ranges per node type:
 *   combat: 10–18
 *   elite:  28–35
 *   boss:   50–60
 */
export function goldDrop(
  nodeType: 'combat' | 'elite' | 'boss',
  rng: SeededRng,
): number {
  switch (nodeType) {
    case 'combat': return rng.int(10, 18);
    case 'elite':  return rng.int(28, 35);
    case 'boss':   return rng.int(50, 60);
  }
}

// ---------------------------------------------------------------------------
// Full reward pool builder (used by combat resolution)
// ---------------------------------------------------------------------------

export interface RewardContext {
  readonly nodeType: NodeType;
  readonly act: 1 | 2 | 3;
  readonly heroId: HeroId;
  readonly deckCardIds: CardId[];
  readonly relicPool: readonly RelicId[];
  readonly ascensionLevel: number;
}

/**
 * Build the complete reward pool shown after a combat node.
 * - All nodes: gold
 * - Normal/elite/boss: card choices (fewer at ascension ≥1)
 * - Elite/boss: one relic
 */
export function buildRewardPool(ctx: RewardContext, rng: SeededRng): Reward[] {
  const rewards: Reward[] = [];

  // Gold
  const canDropGold =
    ctx.nodeType === 'combat' || ctx.nodeType === 'elite' || ctx.nodeType === 'boss';
  if (canDropGold) {
    rewards.push({
      kind: 'gold',
      amount: goldDrop(ctx.nodeType as 'combat' | 'elite' | 'boss', rng),
    });
  }

  // Cards (boss nodes skip card rewards — they give a relic directly)
  if (ctx.nodeType !== 'boss') {
    const cardCount = ctx.ascensionLevel >= 1 ? 2 : 3;
    const cardIds = generateCardRewards(ctx.act, ctx.heroId, ctx.deckCardIds, rng, cardCount);
    for (const cardId of cardIds) {
      rewards.push({ kind: 'card', cardId });
    }
  }

  // Relic for elite and boss
  if ((ctx.nodeType === 'elite' || ctx.nodeType === 'boss') && ctx.relicPool.length > 0) {
    rewards.push({ kind: 'relic', relicId: rng.pick(ctx.relicPool) });
  }

  return rewards;
}
