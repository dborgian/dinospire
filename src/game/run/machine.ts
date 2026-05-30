// ---------------------------------------------------------------------------
// Run state machine — pure reducer: (RunState, RunAction) → RunState
// Governs all top-level phase transitions for a run.
// No side effects; all map generation is deterministic via seeded RNG.
// ---------------------------------------------------------------------------

import type {
  RunState,
  RunPhase,
  NodeId,
  EventId,
  Reward,
  CardInstance,
  CardInstanceId,
  RelicId,
  HeroId,
  EvolutionStage,
  CardEffect,
  RunStats,
} from '@/game/types';
import { generateActMap } from './map';

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

export type RunAction =
  | { type: 'START_RUN'; heroId: HeroId; seed: number; ascensionLevel?: number; starterDeck: CardInstance[]; starterRelic: RelicId; baseHp: number }
  | { type: 'SELECT_NODE'; nodeId: NodeId }
  | { type: 'COMBAT_VICTORY'; rewards: Reward[]; statsDelta: Partial<RunStats>; heroHpAfter: number }
  | { type: 'COMBAT_DEFEAT'; heroHpAfter: number }
  | { type: 'PICK_REWARD'; reward: Reward | null }
  | { type: 'RESOLVE_EVENT'; choiceIndex: number; outcomes: CardEffect[] }
  | { type: 'REST_HEAL' }
  | { type: 'REST_UPGRADE'; cardIid: CardInstanceId }
  | { type: 'BUY'; item: Reward }
  | { type: 'GROWTH_EVOLVE' }
  | { type: 'ACT_COMPLETE'; nextAct: 2 | 3 }
  | { type: 'UPDATE_EVOLUTION_CONDITIONS'; delta: Record<string, number> };

// ---------------------------------------------------------------------------
// Starter run state builder (called by START_RUN)
// ---------------------------------------------------------------------------

function buildInitialRun(
  heroId: HeroId,
  seed: number,
  ascensionLevel: number,
  starterDeck: CardInstance[],
  starterRelic: RelicId,
  baseHp: number,
): RunState {
  const map = generateActMap(1, seed);
  return {
    id: `run_${seed}_${Date.now()}` as RunState['id'],
    seed,
    act: 1,
    ascensionLevel,
    heroId,
    evolutionStage: 'cucciolo',
    evolutionConditions: {},
    deck: starterDeck,
    relics: [starterRelic],
    relicCounters: {},
    hp: baseHp,
    maxHp: baseHp,
    gold: 0,
    map,
    phase: { t: 'map' },
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      blockTotal: 0,
      cardsPlayed: 0,
      combatsWon: 0,
      elitesDefeated: 0,
      goldEarned: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Reward application helpers
// ---------------------------------------------------------------------------

function applyReward(state: RunState, reward: Reward): RunState {
  switch (reward.kind) {
    case 'card': {
      const iid = `${reward.cardId}_${Date.now()}_${Math.random().toString(36).slice(2)}` as CardInstanceId;
      const instance: CardInstance = {
        iid,
        cardId: reward.cardId,
        upgraded: false,
        temporary: false,
      };
      return { ...state, deck: [...state.deck, instance] };
    }
    case 'relic': {
      if (state.relics.includes(reward.relicId)) return state;
      return { ...state, relics: [...state.relics, reward.relicId] };
    }
    case 'gold': {
      return {
        ...state,
        gold: state.gold + reward.amount,
        stats: { ...state.stats, goldEarned: state.stats.goldEarned + reward.amount },
      };
    }
    case 'heal': {
      return { ...state, hp: Math.min(state.maxHp, state.hp + reward.amount) };
    }
  }
}

// ---------------------------------------------------------------------------
// Event effect application helpers
// ---------------------------------------------------------------------------

function applyEventEffect(state: RunState, effect: CardEffect): RunState {
  switch (effect.kind) {
    case 'damage': {
      const amount = typeof effect.amount === 'number' ? effect.amount : 0;
      return { ...state, hp: Math.max(0, state.hp - amount) };
    }
    case 'heal': {
      const amount = typeof effect.amount === 'number' ? effect.amount : 0;
      return { ...state, hp: Math.min(state.maxHp, state.hp + amount) };
    }
    case 'addCardToDeck': {
      const count = effect.count ?? 1;
      const newCards: CardInstance[] = Array.from({ length: count }, (_, i) => ({
        iid: `${effect.cardId}_evt_${Date.now()}_${i}` as CardInstanceId,
        cardId: effect.cardId,
        upgraded: false,
        temporary: effect.temporary ?? false,
      }));
      return { ...state, deck: [...state.deck, ...newCards] };
    }
    case 'gainEnergy':
    case 'draw':
    case 'block':
    case 'applyStatus':
    case 'exhaust':
    case 'conditional':
    case 'synergy':
    case 'repeat':
      // These effects require active combat context; ignored in event resolution
      return state;
  }
}

// ---------------------------------------------------------------------------
// Evolution stage transition
// ---------------------------------------------------------------------------

const STAGE_ORDER: EvolutionStage[] = ['cucciolo', 'adulto', 'prime'];

function nextStage(current: EvolutionStage): EvolutionStage {
  const idx = STAGE_ORDER.indexOf(current);
  return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)] as EvolutionStage;
}

// ---------------------------------------------------------------------------
// Main reducer
// ---------------------------------------------------------------------------

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'START_RUN': {
      return buildInitialRun(
        action.heroId,
        action.seed,
        action.ascensionLevel ?? 0,
        action.starterDeck,
        action.starterRelic,
        action.baseHp,
      );
    }

    case 'SELECT_NODE': {
      const node = state.map.nodes.find((n) => n.id === action.nodeId);
      // Guard: node must exist and be available
      if (!node || !node.available || node.visited) return state;

      // Mark node visited and make its connections available
      const updatedNodes = state.map.nodes.map((n) => {
        if (n.id === action.nodeId) {
          return { ...n, visited: true, available: true };
        }
        // Unlock nodes connected from the selected node
        if (node.connections.includes(n.id)) {
          return { ...n, available: true };
        }
        // All previously-available-but-unvisited nodes on the same floor lose availability
        // (player chose a path; siblings on the same floor close off)
        if (n.floor === node.floor && n.id !== action.nodeId && !n.visited) {
          return { ...n, available: false };
        }
        return n;
      });

      const updatedMap = {
        ...state.map,
        nodes: updatedNodes,
        currentNodeId: action.nodeId,
      };

      let nextPhase: RunPhase;
      switch (node.type) {
        case 'combat':
        case 'elite':
        case 'boss':
          nextPhase = { t: 'combat', nodeId: action.nodeId };
          break;
        case 'event':
          nextPhase = node.eventId
            ? { t: 'event', eventId: node.eventId, step: 0 }
            : { t: 'map' };
          break;
        case 'rest':
          nextPhase = { t: 'rest' };
          break;
        case 'shop':
          nextPhase = { t: 'shop' };
          break;
        case 'growth':
          nextPhase = { t: 'growth' };
          break;
        default:
          nextPhase = { t: 'map' };
      }

      return { ...state, map: updatedMap, phase: nextPhase };
    }

    case 'COMBAT_VICTORY': {
      const mergedStats: RunStats = {
        damageDealt: state.stats.damageDealt + (action.statsDelta.damageDealt ?? 0),
        damageTaken: state.stats.damageTaken + (action.statsDelta.damageTaken ?? 0),
        blockTotal: state.stats.blockTotal + (action.statsDelta.blockTotal ?? 0),
        cardsPlayed: state.stats.cardsPlayed + (action.statsDelta.cardsPlayed ?? 0),
        combatsWon: state.stats.combatsWon + (action.statsDelta.combatsWon ?? 1),
        elitesDefeated: state.stats.elitesDefeated + (action.statsDelta.elitesDefeated ?? 0),
        goldEarned: state.stats.goldEarned + (action.statsDelta.goldEarned ?? 0),
      };
      // Sync hero HP from combat result, then heal 5 HP post-fight
      const hpAfterCombat = Math.max(1, action.heroHpAfter);
      const hpHealed = Math.min(state.maxHp, hpAfterCombat + 5);
      return {
        ...state,
        hp: hpHealed,
        stats: mergedStats,
        phase: { t: 'reward', pool: action.rewards },
      };
    }

    case 'COMBAT_DEFEAT': {
      return { ...state, hp: 0, phase: { t: 'gameOver', reason: 'death' } };
    }

    case 'PICK_REWARD': {
      if (state.phase.t !== 'reward') return state;
      const currentPool = state.phase.pool;

      // Apply reward if not skipping
      const stateAfterReward = action.reward !== null
        ? applyReward(state, action.reward)
        : state;

      // Remove the picked/skipped reward from pool
      const remainingPool = action.reward !== null
        ? currentPool.filter(
            (r) => !(r.kind === action.reward!.kind &&
              JSON.stringify(r) === JSON.stringify(action.reward)),
          )
        : [];

      // If pool is empty, return to map; otherwise show remaining rewards
      const nextPhase: RunPhase = remainingPool.length === 0
        ? { t: 'map' }
        : { t: 'reward', pool: remainingPool };

      return { ...stateAfterReward, phase: nextPhase };
    }

    case 'RESOLVE_EVENT': {
      if (state.phase.t !== 'event') return state;

      // Apply all outcome effects in sequence
      const stateAfterEffects = action.outcomes.reduce(
        (s, effect) => applyEventEffect(s, effect),
        state,
      );

      return { ...stateAfterEffects, phase: { t: 'map' } };
    }

    case 'REST_HEAL': {
      if (state.phase.t !== 'rest') return state;
      const healAmount = Math.ceil(state.maxHp * 0.3);
      return {
        ...state,
        hp: Math.min(state.maxHp, state.hp + healAmount),
        phase: { t: 'map' },
      };
    }

    case 'REST_UPGRADE': {
      if (state.phase.t !== 'rest') return state;
      const updatedDeck = state.deck.map((card) =>
        card.iid === action.cardIid ? { ...card, upgraded: true } : card,
      );
      return { ...state, deck: updatedDeck, phase: { t: 'map' } };
    }

    case 'BUY': {
      if (state.phase.t !== 'shop') return state;
      return applyReward(state, action.item);
    }

    case 'GROWTH_EVOLVE': {
      if (state.phase.t !== 'growth') return state;
      const newStage = nextStage(state.evolutionStage);
      return {
        ...state,
        evolutionStage: newStage,
        phase: { t: 'map' },
      };
    }

    case 'ACT_COMPLETE': {
      const newMap = generateActMap(action.nextAct, state.seed ^ (action.nextAct * 0xf00dcafe));
      return {
        ...state,
        act: action.nextAct,
        map: newMap,
        phase: { t: 'map' },
      };
    }

    case 'UPDATE_EVOLUTION_CONDITIONS': {
      const merged = { ...state.evolutionConditions };
      for (const [key, value] of Object.entries(action.delta)) {
        merged[key] = (merged[key] ?? 0) + value;
      }
      return { ...state, evolutionConditions: merged };
    }

    default:
      action satisfies never;
      return state;
  }
}
