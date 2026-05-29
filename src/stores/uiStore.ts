// ---------------------------------------------------------------------------
// UI store — transient interface state (not persisted).
// Modals, selected cards, hover targets, animation flags, etc.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { CardInstanceId, EnemyId } from "@/game/types";

type ModalKey =
  | "deck_viewer"
  | "map"
  | "settings"
  | "card_upgrade"
  | "boss_reveal"
  | null;

interface UIStore {
  /** Which card the player is currently hovering (for tooltip). */
  hoveredCardId: CardInstanceId | null;

  /** Which enemy the player is targeting (for targeted cards). */
  targetedEnemyId: EnemyId | null;

  /** Which card is being dragged toward play. */
  draggingCardId: CardInstanceId | null;

  /** Currently open modal, if any. */
  openModal: ModalKey;

  /** True while the boss 3D reveal animation plays. */
  bossRevealActive: boolean;

  /** True while a prime-evolution animation is in progress. */
  primeEvolutionActive: boolean;

  /** Card selected in hand for play (tap-to-select pattern). */
  selectedCardIid: CardInstanceId | null;

  /** True while enemy turn is resolving — blocks player interaction. */
  isEnemyTurn: boolean;

  setHoveredCard: (id: CardInstanceId | null) => void;
  setTargetedEnemy: (id: EnemyId | null) => void;
  setDraggingCard: (id: CardInstanceId | null) => void;
  openModalKey: (key: NonNullable<ModalKey>) => void;
  closeModal: () => void;
  setBossReveal: (active: boolean) => void;
  setPrimeEvolution: (active: boolean) => void;
  selectCard: (iid: CardInstanceId | null) => void;
  setEnemyTurn: (active: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    immer((set) => ({
      hoveredCardId: null,
      targetedEnemyId: null,
      draggingCardId: null,
      openModal: null,
      bossRevealActive: false,
      primeEvolutionActive: false,
      selectedCardIid: null,
      isEnemyTurn: false,

      setHoveredCard(id) {
        set((s) => { s.hoveredCardId = id; });
      },
      setTargetedEnemy(id) {
        set((s) => { s.targetedEnemyId = id; });
      },
      setDraggingCard(id) {
        set((s) => { s.draggingCardId = id; });
      },
      openModalKey(key) {
        set((s) => { s.openModal = key; });
      },
      closeModal() {
        set((s) => { s.openModal = null; });
      },
      setBossReveal(active) {
        set((s) => { s.bossRevealActive = active; });
      },
      setPrimeEvolution(active) {
        set((s) => { s.primeEvolutionActive = active; });
      },
      selectCard(iid) {
        set((s) => { s.selectedCardIid = iid; });
      },
      setEnemyTurn(active) {
        set((s) => { s.isEnemyTurn = active; });
      },
    })),
    { name: "UIStore" },
  ),
);
