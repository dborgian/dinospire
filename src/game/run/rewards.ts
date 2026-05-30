// ---------------------------------------------------------------------------
// Reward pool generation — post-combat card choices, gold drops, relic picks.
// ---------------------------------------------------------------------------

import type { Reward, CardId, RelicId, HeroId, NodeType } from '@/game/types';
import type { SeededRng } from '@/game/rng';
import { rewardCardBonus } from '@/game/combat/relics';
import { contentRegistry } from '@/game/content/index';

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
 * Synchronous card pool — filters the already-loaded contentRegistry.
 * CombatWrapper calls loadCards(act) before mounting, so the registry is
 * populated by the time a reward screen is shown.
 */
function getActCardPool(act: 1 | 2 | 3, heroId: HeroId): CardId[] {
  return [...contentRegistry.cards.values()]
    .filter((c) => c.act === act && (c.hero === heroId || !c.hero) && c.rarity !== 'starter')
    .map((c) => c.id);
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
  /** Relics the hero already owns — used to apply pool modifiers (cranio_fossile). */
  readonly ownedRelics?: readonly RelicId[];
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
    const baseCount = ctx.ascensionLevel >= 1 ? 2 : 3;
    const bonus = ctx.ownedRelics ? rewardCardBonus(ctx.ownedRelics) : 0;
    const cardCount = baseCount + bonus;
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
