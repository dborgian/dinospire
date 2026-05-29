// ---------------------------------------------------------------------------
// Unlock system — gates heroes, cards, and relics behind run milestones.
// Unlock conditions are pure functions evaluated against MetaProfile.
// ---------------------------------------------------------------------------

import type { MetaProfile, HeroId, CardId, RelicId } from "@/game/types";

export interface UnlockCondition {
  readonly description: string;
  readonly isMet: (profile: MetaProfile) => boolean;
}

export interface Unlockable {
  readonly kind: "hero" | "card" | "relic";
  readonly id: HeroId | CardId | RelicId;
  readonly condition: UnlockCondition;
}

/** Registry of all things that can be unlocked through meta-progression. */
export const UNLOCK_REGISTRY: readonly Unlockable[] = [
  // TODO: populate as heroes and cards are designed
  // Example structure:
  // {
  //   kind: "hero",
  //   id: "raptor_omega" as HeroId,
  //   condition: {
  //     description: "Complete a run with any hero",
  //     isMet: (p) => p.victories >= 1,
  //   },
  // },
];

/**
 * Compute all unlockables newly satisfied by the updated profile.
 * Call this after a run ends to determine what to grant.
 */
export function computeNewUnlocks(
  prevProfile: MetaProfile,
  nextProfile: MetaProfile,
): Unlockable[] {
  return UNLOCK_REGISTRY.filter(
    (u) => !u.condition.isMet(prevProfile) && u.condition.isMet(nextProfile),
  );
}

/**
 * Check if a hero is currently playable (starter heroes are always available).
 */
export function isHeroPlayable(profile: MetaProfile, heroId: HeroId): boolean {
  // Starter heroes (index 0 of each class) are always available
  if (profile.unlockedHeroes.includes(heroId)) return true;
  // TODO: define which heroIds are "starters"
  return false;
}
