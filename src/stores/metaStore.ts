// ---------------------------------------------------------------------------
// Meta store — Zustand slice for cross-run progression (MetaProfile).
// Persisted to IndexedDB via Dexie; loaded on app mount.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { MetaProfile, HeroId, CardId, RelicId } from "@/game/types";

const DEFAULT_PROFILE: MetaProfile = {
  version: 1,
  totalRuns: 0,
  victories: 0,
  unlockedHeroes: [],
  unlockedCards: [],
  unlockedRelics: [],
  ascensionLevel: 0,
};

interface MetaStore {
  profile: MetaProfile;

  /** Call after a run ends (win or loss) to update stats. */
  recordRunEnd: (won: boolean) => void;

  /** Grant a new unlock (hero, card, or relic). */
  grantUnlock: (
    kind: "hero" | "card" | "relic",
    id: HeroId | CardId | RelicId,
  ) => void;

  /** Advance ascension level after a victory at the current level. */
  advanceAscension: () => void;

  /** Reset meta-progression (debug / new-game+ use only). */
  resetMeta: () => void;
}

export const useMetaStore = create<MetaStore>()(
  devtools(
    persist(
      immer((set) => ({
        profile: DEFAULT_PROFILE,

        recordRunEnd(won) {
          set((state) => {
            state.profile.totalRuns += 1;
            if (won) state.profile.victories += 1;
          });
        },

        grantUnlock(kind, id) {
          set((state) => {
            const { profile } = state;
            if (kind === "hero" && !profile.unlockedHeroes.includes(id as HeroId)) {
              profile.unlockedHeroes.push(id as HeroId);
            } else if (kind === "card" && !profile.unlockedCards.includes(id as CardId)) {
              profile.unlockedCards.push(id as CardId);
            } else if (kind === "relic" && !profile.unlockedRelics.includes(id as RelicId)) {
              profile.unlockedRelics.push(id as RelicId);
            }
          });
        },

        advanceAscension() {
          set((state) => {
            state.profile.ascensionLevel = Math.min(
              20,
              state.profile.ascensionLevel + 1,
            );
          });
        },

        resetMeta() {
          set((state) => {
            state.profile = { ...DEFAULT_PROFILE };
          });
        },
      })),
      { name: "dinospire-meta" },
    ),
    { name: "MetaStore" },
  ),
);
