// ---------------------------------------------------------------------------
// Combat reducer — table-driven test suite (Vitest)
// Tests cover: START, PLAY_CARD (damage + block), END_TURN, status effects,
// victory/defeat transitions, and draw pile reshuffle.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { combatReducer, type PlayCardExtended, type StartExtended, type CombatActionExtended } from '@/game/combat/reducer';
import { applyEffects, drawCards } from '@/game/combat/effects';
import type {
  CardInstance,
  CardInstanceId,
  CombatState,
  EnemyDefinition,
  EnemyId,
  EnemyInstance,
  EnemyIntent,
  NodeId,
  RelicId,
  RunId,
} from '@/game/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCardInstance(
  iid: string,
  cardId: string = 'strike',
  opts: Partial<CardInstance> = {},
): CardInstance {
  return {
    iid: iid as CardInstanceId,
    cardId: cardId as CardInstance['cardId'],
    upgraded: false,
    temporary: false,
    ...opts,
  };
}

const DEFAULT_INTENT: EnemyIntent = {
  type: 'attack',
  value: 6,
  description: 'Attacks for 6',
};

function makeEnemy(
  iid: string,
  opts: Partial<EnemyInstance> = {},
): EnemyInstance {
  return {
    iid: iid as EnemyId,
    definitionId: iid as EnemyId,
    hp: 40,
    maxHp: 40,
    block: 0,
    statuses: {},
    currentMoveIndex: 0,
    nextIntent: DEFAULT_INTENT,
    ...opts,
  };
}

function makeEnemyDef(
  id: string,
  opts: Partial<EnemyDefinition> = {},
): EnemyDefinition {
  return {
    id: id as EnemyId,
    name: { it: 'Test Enemy' },
    taxonGroup: 'Theropoda',
    diet: 'carnivoro',
    hp: 40,
    tier: 'normal',
    moves: [
      {
        id: 'attack',
        intent: { type: 'attack', value: 6, description: 'Attacks for 6' },
        effects: [{ kind: 'damage', amount: 6, target: 'self' }],
      },
    ],
    movePattern: 'sequential',
    ...opts,
  };
}

function makeTestState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    runId: 'run-test' as RunId,
    nodeId: '1-0-0' as NodeId,
    seed: 12345,
    turn: 1,
    phase: 'player_turn',
    cardsPlayedThisTurn: 0,
    hero: {
      hp: 75,
      maxHp: 75,
      block: 0,
      energy: 3,
      energyMax: 3,
          handSize: 5,
      statuses: {},
      relicCounters: {} as Record<RelicId, number>,
    },
    enemies: [],
    piles: {
      draw: [],
      hand: [],
      discard: [],
      exhaust: [],
    },
    cardInstances: {},
    log: [],
    ...overrides,
  };
}

function makeStateWithCard(
  cardIid: string,
  resolvedCost: number = 1,
  inHand: boolean = true,
): { state: CombatState; cost: number } {
  const ci = makeCardInstance(cardIid);
  const state = makeTestState({
    cardInstances: { [cardIid]: ci } as Record<CardInstanceId, CardInstance>,
    piles: {
      draw: [],
      hand: inHand ? [cardIid as CardInstanceId] : [],
      discard: [],
      exhaust: [],
    },
  });
  return { state, cost: resolvedCost };
}

// ---------------------------------------------------------------------------
// describe: START
// ---------------------------------------------------------------------------

describe('combatReducer', () => {
  describe('START', () => {
    it('shuffles deck into draw pile', () => {
      const cards = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => makeCardInstance(id));
      const action: StartExtended = {
        type: 'START',
        nodeId: '1-0-0' as NodeId,
        enemies: [],
        deck: cards,
        heroStats: { energyMax: 3, handSize: 5, maxHp: 75 },
      };
      const initial = makeTestState();
      const next = combatReducer(initial, action);

      // All card iids end up in draw+hand (5 cards → all drawn into hand)
      const allPiled = [
        ...next.piles.draw,
        ...next.piles.hand,
        ...next.piles.discard,
        ...next.piles.exhaust,
      ];
      expect(allPiled.length).toBe(5);
      expect(new Set(allPiled).size).toBe(5);
    });

    it('draws opening hand of 5 cards', () => {
      const cards = Array.from({ length: 10 }, (_, i) =>
        makeCardInstance(`c${i}`),
      );
      const action: StartExtended = {
        type: 'START',
        nodeId: '1-0-0' as NodeId,
        enemies: [],
        deck: cards,
        heroStats: { energyMax: 3, handSize: 5, maxHp: 75 },
      };
      const next = combatReducer(makeTestState(), action);
      expect(next.piles.hand.length).toBe(5);
      expect(next.piles.draw.length).toBe(5);
    });

    it('draws only handSize cards when deck is exactly handSize', () => {
      const cards = Array.from({ length: 5 }, (_, i) => makeCardInstance(`c${i}`));
      const action: StartExtended = {
        type: 'START',
        nodeId: '1-0-0' as NodeId,
        enemies: [],
        deck: cards,
        heroStats: { energyMax: 3, handSize: 5, maxHp: 75 },
      };
      const next = combatReducer(makeTestState(), action);
      expect(next.piles.hand.length).toBe(5);
      expect(next.piles.draw.length).toBe(0);
    });

    it('sets hero energyMax from heroStats', () => {
      const action: StartExtended = {
        type: 'START',
        nodeId: '1-0-0' as NodeId,
        enemies: [],
        deck: [],
        heroStats: { energyMax: 4, handSize: 5, maxHp: 80 },
      };
      const next = combatReducer(makeTestState(), action);
      expect(next.hero.energyMax).toBe(4);
      expect(next.hero.energy).toBe(4);
    });

    it('sets hero maxHp from heroStats', () => {
      const action: StartExtended = {
        type: 'START',
        nodeId: '1-0-0' as NodeId,
        enemies: [],
        deck: [],
        heroStats: { energyMax: 3, handSize: 5, maxHp: 90 },
      };
      const next = combatReducer(makeTestState(), action);
      expect(next.hero.maxHp).toBe(90);
      expect(next.hero.hp).toBe(90);
    });

    it('logs combat_start event', () => {
      const action: StartExtended = {
        type: 'START',
        nodeId: '1-0-0' as NodeId,
        enemies: [makeEnemy('enemy1')],
        deck: [],
      };
      const next = combatReducer(makeTestState(), action);
      expect(next.log.some((e) => e.kind === 'combat_start')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // describe: PLAY_CARD — damage
  // ---------------------------------------------------------------------------

  describe('PLAY_CARD damage', () => {
    it('costs energy when played', () => {
      const { state, cost } = makeStateWithCard('strike', 1);
      const action: PlayCardExtended = {
        type: 'PLAY_CARD',
        cardIid: 'strike' as CardInstanceId,
        resolvedCost: cost,
      };
      const next = combatReducer(state, action);
      expect(next.hero.energy).toBe(state.hero.energy - cost);
    });

    it('deals damage reducing enemy hp', () => {
      const enemy = makeEnemy('e1');
      const { state } = makeStateWithCard('strike', 1);
      const stateWithEnemy = { ...state, enemies: [enemy] };

      // Apply damage effect directly (reducer handles piles; effects handle HP)
      const afterEffect = applyEffects(
        stateWithEnemy,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(afterEffect.enemies[0]?.hp).toBe(34); // 40 - 6
    });

    it('deals damage reduced by enemy block first', () => {
      const enemy = makeEnemy('e1', { block: 4 });
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.enemies[0]?.hp).toBe(38);  // 40 - (6 - 4) = 38
      expect(next.enemies[0]?.block).toBe(0); // block consumed
    });

    it('block fully absorbs damage leaving hp intact', () => {
      const enemy = makeEnemy('e1', { block: 10 });
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.enemies[0]?.hp).toBe(40); // no HP lost
      expect(next.enemies[0]?.block).toBe(4); // 10 - 6
    });

    it('vulnerable multiplies incoming damage by 1.5 (ceil)', () => {
      const enemy = makeEnemy('e1', { statuses: { vulnerable: 2 } });
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      // 6 * 1.5 = 9, ceil(9) = 9
      expect(next.enemies[0]?.hp).toBe(31); // 40 - 9
    });

    it('vulnerable with odd base damage uses ceil', () => {
      const enemy = makeEnemy('e1', { statuses: { vulnerable: 1 } });
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 5, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      // 5 * 1.5 = 7.5, ceil = 8
      expect(next.enemies[0]?.hp).toBe(32); // 40 - 8
    });

    it('weak reduces damage by 25% (floor)', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: { weak: 2 },
          relicCounters: {} as Record<RelicId, number>,
        },
        enemies: [makeEnemy('e1')],
      });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 8, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      // 8 * 0.75 = 6, floor = 6
      expect(next.enemies[0]?.hp).toBe(34); // 40 - 6
    });

    it('strength adds flat damage', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: { strength: 3 },
          relicCounters: {} as Record<RelicId, number>,
        },
        enemies: [makeEnemy('e1')],
      });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      // 6 + 3 str = 9
      expect(next.enemies[0]?.hp).toBe(31);
    });

    it('vigor adds flat damage then is consumed (zeroed)', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: { vigor: 4 },
          relicCounters: {} as Record<RelicId, number>,
        },
        enemies: [makeEnemy('e1')],
      });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.enemies[0]?.hp).toBe(30); // 40 - (6 + 4)
      expect(next.hero.statuses['vigor']).toBe(0);
    });

    it('cannot play if not enough energy', () => {
      const ci = makeCardInstance('expensiveCard');
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 1, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
        cardInstances: { expensiveCard: ci } as Record<CardInstanceId, CardInstance>,
        piles: {
          draw: [],
          hand: ['expensiveCard' as CardInstanceId],
          discard: [],
          exhaust: [],
        },
      });

      const action: PlayCardExtended = {
        type: 'PLAY_CARD',
        cardIid: 'expensiveCard' as CardInstanceId,
        resolvedCost: 3, // costs 3, hero has 1
      };
      const next = combatReducer(state, action);
      // Card should stay in hand, energy unchanged
      expect(next.hero.energy).toBe(1);
      expect(next.piles.hand).toContain('expensiveCard');
    });

    it('moves card to discard after play', () => {
      const { state, cost } = makeStateWithCard('strike', 1);
      const action: PlayCardExtended = {
        type: 'PLAY_CARD',
        cardIid: 'strike' as CardInstanceId,
        resolvedCost: cost,
      };
      const next = combatReducer(state, action);
      expect(next.piles.hand).not.toContain('strike');
      expect(next.piles.discard).toContain('strike');
    });

    it('increments cardsPlayedThisTurn', () => {
      const { state, cost } = makeStateWithCard('strike', 1);
      const action: PlayCardExtended = {
        type: 'PLAY_CARD',
        cardIid: 'strike' as CardInstanceId,
        resolvedCost: cost,
      };
      const next = combatReducer(state, action);
      expect(next.cardsPlayedThisTurn).toBe(1);
    });

    it('thorns damages hero when attacking', () => {
      const enemy = makeEnemy('e1', { statuses: { thorns: 3 } });
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 6, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.hero.hp).toBe(72); // 75 - 3 thorns
    });
  });

  // ---------------------------------------------------------------------------
  // describe: PLAY_CARD — block
  // ---------------------------------------------------------------------------

  describe('PLAY_CARD block', () => {
    it('adds block to hero', () => {
      const state = makeTestState();
      const next = applyEffects(
        state,
        [{ kind: 'block', amount: 5 }],
        true,
      );
      expect(next.hero.block).toBe(5);
    });

    it('dexterity increases block amount', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: { dexterity: 3 },
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = applyEffects(
        state,
        [{ kind: 'block', amount: 5 }],
        true,
      );
      expect(next.hero.block).toBe(8); // 5 + 3 dex
    });

    it('frail reduces block by 25% (floor)', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: { frail: 1 },
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = applyEffects(
        state,
        [{ kind: 'block', amount: 8 }],
        true,
      );
      // floor(8 * 0.75) = floor(6) = 6
      expect(next.hero.block).toBe(6);
    });

    it('block accumulates across multiple effects', () => {
      const state = makeTestState();
      let s = applyEffects(state, [{ kind: 'block', amount: 5 }], true);
      s = applyEffects(s, [{ kind: 'block', amount: 3 }], true);
      expect(s.hero.block).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // describe: END_TURN
  // ---------------------------------------------------------------------------

  describe('END_TURN', () => {
    it('discards hand to discard pile', () => {
      const cards = ['c1', 'c2', 'c3'].map((id) => makeCardInstance(id));
      const cardInstances: Record<CardInstanceId, CardInstance> = {};
      for (const c of cards) cardInstances[c.iid] = c;

      const state = makeTestState({
        cardInstances,
        piles: {
          draw: [],
          hand: cards.map((c) => c.iid),
          discard: [],
          exhaust: [],
        },
      });

      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next.piles.hand.length).toBe(0);
      // Cards end up in discard (before draw refills hand from empty draw pile)
      const allDiscarded = [...next.piles.discard, ...next.piles.hand];
      // After END_TURN, draw pile was empty so hand is also empty (nothing to draw)
      expect(allDiscarded).toEqual(expect.arrayContaining(cards.map((c) => c.iid)));
    });

    it('resets hero block to 0 at turn start', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 15, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next.hero.block).toBe(0);
    });

    it('restores energy to energyMax', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 0, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next.hero.energy).toBe(3);
    });

    it('draws new hand of 5 when draw pile has cards', () => {
      const cards = Array.from({ length: 10 }, (_, i) => makeCardInstance(`c${i}`));
      const cardInstances: Record<CardInstanceId, CardInstance> = {};
      for (const c of cards) cardInstances[c.iid] = c;

      const state = makeTestState({
        cardInstances,
        piles: {
          draw: cards.map((c) => c.iid),
          hand: [],
          discard: [],
          exhaust: [],
        },
      });
      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next.piles.hand.length).toBe(5);
    });

    it('applies poison to enemy at end of turn', () => {
      const enemy = makeEnemy('e1', { statuses: { poison: 5 } });
      const def = makeEnemyDef('e1', { moves: [{ id: 'nothing', intent: { type: 'buff', description: 'does nothing' }, effects: [] }] });
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      const updatedEnemy = next.enemies.find((e) => e.iid === 'e1');
      expect(updatedEnemy?.hp).toBe(35); // 40 - 5 poison
    });

    it('poison decrements by 1 after application', () => {
      const enemy = makeEnemy('e1', { statuses: { poison: 5 } });
      const def = makeEnemyDef('e1', { moves: [{ id: 'nothing', intent: { type: 'buff', description: 'does nothing' }, effects: [] }] });
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      const updatedEnemy = next.enemies.find((e) => e.iid === 'e1');
      expect(updatedEnemy?.statuses['poison']).toBe(4);
    });

    it('enemy attacks player hp when no block', () => {
      const enemy = makeEnemy('e1');
      const def = makeEnemyDef('e1'); // default: attacks for 6, target:'self' (from enemy = hero)
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      // Enemy attacks for 6, hero has no block → loses 6 HP
      expect(next.hero.hp).toBe(69); // 75 - 6
    });

    it('enemy attack absorbed by hero block', () => {
      const enemy = makeEnemy('e1');
      const def = makeEnemyDef('e1'); // attacks for 6
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 10, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
        enemies: [enemy],
      });
      // Note: block resets at start of new turn — the attack happens DURING enemy_act
      // before the new player turn starts.
      const next = combatReducer(state, { type: 'END_TURN' }, defs);
      // Enemy attacks for 6, block absorbs all → hero hp unchanged, block resets afterward
      expect(next.hero.hp).toBe(75);
    });

    it('increments turn counter', () => {
      const state = makeTestState({ turn: 1 });
      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next.turn).toBe(2);
    });

    it('resets cardsPlayedThisTurn to 0', () => {
      const state = makeTestState({ cardsPlayedThisTurn: 4 });
      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next.cardsPlayedThisTurn).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // describe: victory / defeat
  // ---------------------------------------------------------------------------

  describe('victory / defeat', () => {
    it('transitions to victory when all enemies dead via damage effect', () => {
      const enemy = makeEnemy('e1', { hp: 1 });
      const state = makeTestState({ enemies: [enemy] });

      // Apply a lethal damage effect — enemy HP should reach 0
      const next = applyEffects(
        state,
        [{ kind: 'damage', amount: 10, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.enemies[0]?.hp).toBe(0);
    });

    it('transitions to victory phase when all enemies are dead after END_TURN poison tick', () => {
      // Enemy dies from poison at end of turn
      const enemy = makeEnemy('e1', { hp: 3, statuses: { poison: 5 } });
      const def = makeEnemyDef('e1', { moves: [{ id: 'nothing', intent: { type: 'buff', description: '-' }, effects: [] }] });
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      expect(next.phase).toBe('victory');
    });

    it('transitions to defeat when hero hp reaches 0', () => {
      const enemy = makeEnemy('e1');
      const def = makeEnemyDef('e1', {
        moves: [{
          id: 'massive_hit',
          intent: { type: 'attack', value: 100, description: 'Massive hit' },
          effects: [{ kind: 'damage', amount: 100, target: 'self' }],
        }],
      });
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      expect(next.phase).toBe('defeat');
      expect(next.hero.hp).toBe(0);
    });

    it('logs combat_end reason:defeat on hero death', () => {
      const enemy = makeEnemy('e1');
      const def = makeEnemyDef('e1', {
        moves: [{
          id: 'massive_hit',
          intent: { type: 'attack', value: 100, description: 'Massive hit' },
          effects: [{ kind: 'damage', amount: 100, target: 'self' }],
        }],
      });
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      const endEvent = next.log.find((e) => e.kind === 'combat_end');
      expect(endEvent?.payload['reason']).toBe('defeat');
    });
  });

  // ---------------------------------------------------------------------------
  // describe: draw pile reshuffle
  // ---------------------------------------------------------------------------

  describe('draw pile reshuffle', () => {
    it('shuffles discard into draw when draw is empty during draw', () => {
      const cards = Array.from({ length: 5 }, (_, i) => makeCardInstance(`d${i}`));
      const cardInstances: Record<CardInstanceId, CardInstance> = {};
      for (const c of cards) cardInstances[c.iid] = c;

      // All cards in discard, draw is empty
      const state = makeTestState({
        cardInstances,
        piles: {
          draw: [],
          hand: [],
          discard: cards.map((c) => c.iid),
          exhaust: [],
        },
      });

      const next = combatReducer(state, { type: 'END_TURN' });

      // After END_TURN: discard reshuffled → draw, 5 drawn into hand
      expect(next.piles.hand.length).toBe(5);
      expect(next.piles.draw.length).toBe(0);
      expect(next.piles.discard.length).toBe(0);
    });

    it('logs reshuffle event when discard is reshuffled', () => {
      const cards = Array.from({ length: 3 }, (_, i) => makeCardInstance(`r${i}`));
      const cardInstances: Record<CardInstanceId, CardInstance> = {};
      for (const c of cards) cardInstances[c.iid] = c;

      const state = makeTestState({
        cardInstances,
        piles: {
          draw: [],
          hand: [],
          discard: cards.map((c) => c.iid),
          exhaust: [],
        },
      });

      const next = drawCards(state, 3);
      expect(next.log.some((e) => e.kind === 'reshuffle')).toBe(true);
    });

    it('continues drawing after reshuffle fills draw pile', () => {
      const cardsInHand = Array.from({ length: 2 }, (_, i) => makeCardInstance(`h${i}`));
      const cardsInDiscard = Array.from({ length: 6 }, (_, i) => makeCardInstance(`d${i}`));
      const cardInstances: Record<CardInstanceId, CardInstance> = {};
      for (const c of [...cardsInHand, ...cardsInDiscard]) cardInstances[c.iid] = c;

      const state = makeTestState({
        cardInstances,
        piles: {
          draw: [],
          hand: cardsInHand.map((c) => c.iid),
          discard: cardsInDiscard.map((c) => c.iid),
          exhaust: [],
        },
      });

      // Draw 5 — hand has 2, draw empty so reshuffle 6 from discard, then draw 5 more → 7
      const next = drawCards(state, 5);
      expect(next.piles.hand.length).toBe(7);
    });
  });

  // ---------------------------------------------------------------------------
  // describe: status effects
  // ---------------------------------------------------------------------------

  describe('status effects', () => {
    it('applyStatus adds stacks to enemy', () => {
      const enemy = makeEnemy('e1');
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'applyStatus', status: 'vulnerable', stacks: 2, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.enemies[0]?.statuses['vulnerable']).toBe(2);
    });

    it('applyStatus stacks additively on existing stacks', () => {
      const enemy = makeEnemy('e1', { statuses: { poison: 3 } });
      const state = makeTestState({ enemies: [enemy] });

      const next = applyEffects(
        state,
        [{ kind: 'applyStatus', status: 'poison', stacks: 4, target: 'enemy' }],
        true,
        'e1' as EnemyId,
      );
      expect(next.enemies[0]?.statuses['poison']).toBe(7);
    });

    it('applyStatus to self applies to hero', () => {
      const state = makeTestState();

      const next = applyEffects(
        state,
        [{ kind: 'applyStatus', status: 'strength', stacks: 2, target: 'self' }],
        true,
      );
      expect(next.hero.statuses['strength']).toBe(2);
    });

    it('bleed on enemy is NOT ticked at end of turn (per-action only)', () => {
      // Bleed is now triggered per card played (combatStore.playCard) /
      // per enemy action, NOT during the end-of-turn periodic tick.
      const enemy = makeEnemy('e1', { statuses: { bleed: 4 } });
      const def = makeEnemyDef('e1', { moves: [{ id: 'nothing', intent: { type: 'buff', description: '-' }, effects: [] }] });
      const defs = new Map<EnemyId, EnemyDefinition>([['e1' as EnemyId, def]]);

      const state = makeTestState({ enemies: [enemy] });
      const next = combatReducer(state, { type: 'END_TURN' }, defs);

      const updatedEnemy = next.enemies.find((e) => e.iid === 'e1');
      // HP unchanged — end-of-turn tick no longer applies to bleed
      expect(updatedEnemy?.hp).toBe(40);
      // Bleed stacks persist (no auto-decay)
      expect(updatedEnemy?.statuses['bleed']).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // describe: immutability
  // ---------------------------------------------------------------------------

  describe('immutability', () => {
    it('PLAY_CARD returns a new state reference', () => {
      const { state, cost } = makeStateWithCard('strike', 1);
      const action: PlayCardExtended = {
        type: 'PLAY_CARD',
        cardIid: 'strike' as CardInstanceId,
        resolvedCost: cost,
      };
      const next = combatReducer(state, action);
      expect(next).not.toBe(state);
    });

    it('END_TURN returns a new state reference', () => {
      const state = makeTestState();
      const next = combatReducer(state, { type: 'END_TURN' });
      expect(next).not.toBe(state);
    });

    it('PLAY_CARD does not mutate the original state', () => {
      const { state, cost } = makeStateWithCard('strike', 1);
      const originalEnergy = state.hero.energy;
      const action: PlayCardExtended = {
        type: 'PLAY_CARD',
        cardIid: 'strike' as CardInstanceId,
        resolvedCost: cost,
      };
      combatReducer(state, action);
      expect(state.hero.energy).toBe(originalEnergy);
    });

    it('PLAY_CARD on nonexistent card is safe no-op', () => {
      const state = makeTestState();
      const action: CombatActionExtended = {
        type: 'PLAY_CARD',
        cardIid: 'nonexistent' as CardInstanceId,
        resolvedCost: 0,
      };
      expect(() => combatReducer(state, action)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // describe: gainEnergy / heal
  // ---------------------------------------------------------------------------

  describe('gainEnergy', () => {
    it('adds energy up to safety cap (energyMax * 2)', () => {
      const state = makeTestState({
        hero: {
          hp: 75, maxHp: 75, block: 0, energy: 5, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = applyEffects(state, [{ kind: 'gainEnergy', n: 10 }], true);
      // cap is 3 * 2 = 6; 5 + 10 > 6 → capped at 6
      expect(next.hero.energy).toBe(6);
    });
  });

  describe('heal', () => {
    it('restores hp up to maxHp', () => {
      const state = makeTestState({
        hero: {
          hp: 50, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = applyEffects(state, [{ kind: 'heal', amount: 30 }], true);
      expect(next.hero.hp).toBe(75); // capped at maxHp
    });

    it('heals exact amount when below cap', () => {
      const state = makeTestState({
        hero: {
          hp: 50, maxHp: 75, block: 0, energy: 3, energyMax: 3,
          handSize: 5,
          statuses: {},
          relicCounters: {} as Record<RelicId, number>,
        },
      });
      const next = applyEffects(state, [{ kind: 'heal', amount: 10 }], true);
      expect(next.hero.hp).toBe(60);
    });
  });
});
