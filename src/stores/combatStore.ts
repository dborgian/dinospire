import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { CardEffect, CardInstanceId, CardTag, CombatAction, CombatState, EnemyDefinition, EnemyId } from "@/game/types";
import { combatReducer, checkCombatOver } from "@/game/combat/reducer";
import { applyEffects, tickStatusDamageOnHero } from "@/game/combat/effects";
import { canPlayCard } from "@/game/combat/selectors";
import { contentRegistry } from "@/game/content/index";
import { fireRelicTrigger } from "@/game/combat/relics";

/**
 * Build a Map<CardInstanceId, CardTag[]> by joining every live card instance
 * (draw + hand + discard + exhaust) with its definition's tag list. Required
 * by `synergy` effects which count tagged cards in the active piles.
 */
function buildTagMap(combat: CombatState): ReadonlyMap<CardInstanceId, readonly CardTag[]> {
  const map = new Map<CardInstanceId, readonly CardTag[]>();
  const pool = [
    ...combat.piles.draw,
    ...combat.piles.hand,
    ...combat.piles.discard,
    ...combat.piles.exhaust,
  ];
  for (const iid of pool) {
    const instance = combat.cardInstances[iid];
    if (!instance) continue;
    const def = contentRegistry.cards.get(instance.cardId);
    if (!def) continue;
    map.set(iid, def.tags);
  }
  return map;
}

interface CombatStore {
  combat: CombatState | null;

  /** Low-level dispatch — used for END_TURN, START, TRIGGER. */
  dispatch: (action: CombatAction) => void;

  /**
   * Full card-play sequence:
   *   1. Deduct energy
   *   2. applyEffects (damage, block, draw, statuses…)
   *   3. Move card hand → discard (unless already exhausted by an effect)
   *   4. checkCombatOver
   *
   * targetId is required for attack cards; omit for skills/powers.
   */
  playCard: (cardIid: CardInstanceId, targetId?: EnemyId) => void;

  /** Initialize combat (called when entering a combat node). */
  initCombat: (combat: CombatState) => void;

  /** Tear down combat state after victory/defeat is handled. */
  clearCombat: () => void;
}

export const useCombatStore = create<CombatStore>()(
  devtools(
    immer((set) => ({
      combat: null,

      dispatch(action) {
        set((state) => {
          if (!state.combat) return;
          // For END_TURN the reducer needs enemy definitions to execute AI moves.
          // Build a flat lookup map from whatever acts are cached in the registry.
          let defs: ReadonlyMap<EnemyId, EnemyDefinition> | undefined;
          if (action.type === "END_TURN") {
            const allDefs = new Map<EnemyId, EnemyDefinition>();
            for (const defList of contentRegistry.enemies.values()) {
              for (const def of defList) {
                allDefs.set(def.id as EnemyId, def);
              }
            }
            defs = allDefs;
          }
          state.combat = combatReducer(state.combat, action, defs);
        });
      },

      playCard(cardIid, targetId) {
        set((state) => {
          const combat = state.combat;
          if (!combat || combat.phase !== "player_turn") return;

          const instance = combat.cardInstances[cardIid];
          if (!instance || !combat.piles.hand.includes(cardIid)) return;

          const def = contentRegistry.cards.get(instance.cardId);
          if (!def) return;

          // Use upgraded version when applicable
          const upgradedDef = instance.upgraded ? def.upgraded : undefined;
          const activeEffects = (upgradedDef?.effects ?? def.effects) as CardEffect[];
          const baseCost =
            upgradedDef?.cost !== undefined
              ? upgradedDef.cost
              : typeof def.cost === "number" ? def.cost : 0;
          const resolvedCost = instance.costOverride !== undefined ? instance.costOverride : baseCost;

          if (!canPlayCard(combat, cardIid, resolvedCost)) return;

          // 1. Deduct energy
          let s: CombatState = {
            ...(combat as CombatState),
            hero: { ...combat.hero, energy: combat.hero.energy - resolvedCost },
            cardsPlayedThisTurn: combat.cardsPlayedThisTurn + 1,
          };

          // 2. Resolve all card effects (upgraded if applicable)
          s = applyEffects(
            s,
            activeEffects,
            true,
            targetId,
            {
              sourceCardIid: cardIid,
              tagMap: buildTagMap(s),
            },
          );

          // 2b. Bleed: hero takes 1 HP per stack each time a card is played
          // (matches the in-combat tooltip; engine end-of-turn tick is for poison/burn).
          if ((s.hero.statuses['bleed'] ?? 0) > 0) {
            s = tickStatusDamageOnHero(s, 'bleed');
          }

          // 3. Move to discard — skip if an exhaust effect already removed it from hand
          if (s.piles.hand.includes(cardIid)) {
            s = {
              ...s,
              piles: {
                ...s.piles,
                hand: s.piles.hand.filter((iid) => iid !== cardIid),
                discard: [...s.piles.discard, cardIid],
              },
            };
          }

          // 4. Check win/loss conditions
          s = checkCombatOver(s);

          state.combat = s;
        });
      },

      initCombat(combat) {
        set((state) => {
          // Apply on_battle_start relic effects after the combat shell is ready
          // so the opening hand / energy / strength buffs reflect them.
          state.combat = fireRelicTrigger(combat, 'on_battle_start');
        });
      },

      clearCombat() {
        set((state) => {
          state.combat = null;
        });
      },
    })),
    { name: "CombatStore" },
  ),
);
