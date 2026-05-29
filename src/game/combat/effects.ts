// ---------------------------------------------------------------------------
// Effect resolvers — interpret CardEffect DSL nodes against CombatState.
// All functions are pure: they return a new CombatState without mutation.
// ---------------------------------------------------------------------------

import type {
  CardEffect,
  CardInstance,
  CardInstanceId,
  CardTag,
  CombatState,
  DynExpr,
  EnemyId,
  EnemyInstance,
  Predicate,
  StatusKey,
} from '../types';
import { createSeededRng } from '../rng';

// ---------------------------------------------------------------------------
// DynExpr evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a DynExpr (or plain number) in the context of the current state.
 * `actorIsHero` determines which stat pool "stat" nodes read from.
 */
export function evalExpr(
  expr: number | DynExpr,
  state: CombatState,
  actorIsHero: boolean,
  _targetId?: EnemyId,
): number {
  if (typeof expr === 'number') return expr;

  switch (expr.op) {
    case 'val':
      return expr.v;

    case 'stat': {
      if (expr.stat === 'turn') return state.turn;
      if (actorIsHero) {
        return state.hero.statuses[expr.stat as StatusKey] ?? 0;
      } else {
        // For enemy actors, stat nodes are evaluated against the first live enemy
        // that is acting; callers should prefer passing explicit values for non-hero
        // actors in most cases.
        return 0;
      }
    }

    case 'mul':
      return evalExpr(expr.a, state, actorIsHero, _targetId) *
        evalExpr(expr.b, state, actorIsHero, _targetId);

    case 'add':
      return evalExpr(expr.a, state, actorIsHero, _targetId) +
        evalExpr(expr.b, state, actorIsHero, _targetId);

    case 'div': {
      const divisor = evalExpr(expr.b, state, actorIsHero, _targetId);
      return divisor === 0 ? 0 : evalExpr(expr.a, state, actorIsHero, _targetId) / divisor;
    }

    case 'min':
      return Math.min(
        evalExpr(expr.a, state, actorIsHero, _targetId),
        evalExpr(expr.b, state, actorIsHero, _targetId),
      );

    case 'max':
      return Math.max(
        evalExpr(expr.a, state, actorIsHero, _targetId),
        evalExpr(expr.b, state, actorIsHero, _targetId),
      );
  }
}

// ---------------------------------------------------------------------------
// Predicate evaluator
// ---------------------------------------------------------------------------

export function evalPredicate(
  pred: Predicate,
  state: CombatState,
  actorIsHero: boolean,
  targetId?: EnemyId,
): boolean {
  switch (pred.op) {
    case 'hasStatus': {
      if (pred.target === 'self') {
        if (actorIsHero) {
          return (state.hero.statuses[pred.status] ?? 0) > 0;
        } else {
          const enemy = targetId ? findEnemy(state, targetId) : undefined;
          return (enemy?.statuses[pred.status] ?? 0) > 0;
        }
      } else if (pred.target === 'enemy') {
        const enemy = targetId ? findEnemy(state, targetId) : state.enemies[0];
        return (enemy?.statuses[pred.status] ?? 0) > 0;
      }
      // all_enemies / random_enemy — check if any have it
      return state.enemies.some((e) => (e.statuses[pred.status] ?? 0) > 0);
    }

    case 'gte':
      return evalExpr(pred.a, state, actorIsHero, targetId) >=
        evalExpr(pred.b, state, actorIsHero, targetId);

    case 'lte':
      return evalExpr(pred.a, state, actorIsHero, targetId) <=
        evalExpr(pred.b, state, actorIsHero, targetId);

    case 'and':
      return pred.conditions.every((c) => evalPredicate(c, state, actorIsHero, targetId));

    case 'or':
      return pred.conditions.some((c) => evalPredicate(c, state, actorIsHero, targetId));

    case 'not':
      return !evalPredicate(pred.condition, state, actorIsHero, targetId);

    case 'tagInDeck': {
      const allCards = [
        ...state.piles.draw,
        ...state.piles.hand,
        ...state.piles.discard,
      ];
      // We don't have card definitions here — we tag instances through a content
      // lookup. Since effects.ts must remain pure/no-async, tagInDeck predicates
      // default to false when no tag metadata is available on the instance.
      // Full tag resolution requires the content registry at the call site.
      void allCards; void pred;
      return false;
    }

    case 'cardsPlayedThisTurn':
      return state.cardsPlayedThisTurn >= pred.gte;
  }
}

// ---------------------------------------------------------------------------
// Immutable state helpers
// ---------------------------------------------------------------------------

function findEnemy(state: CombatState, id: EnemyId): EnemyInstance | undefined {
  return state.enemies.find((e) => e.iid === id);
}

function updateEnemy(
  state: CombatState,
  id: EnemyId,
  update: (e: EnemyInstance) => EnemyInstance,
): CombatState {
  return {
    ...state,
    enemies: state.enemies.map((e) => (e.iid === id ? update(e) : e)),
  };
}

function addStatus(
  statuses: Partial<Record<StatusKey, number>>,
  key: StatusKey,
  stacks: number,
): Partial<Record<StatusKey, number>> {
  const current = statuses[key] ?? 0;
  return { ...statuses, [key]: current + stacks };
}

function logEvent(
  state: CombatState,
  kind: string,
  payload: Record<string, unknown>,
): CombatState {
  return {
    ...state,
    log: [
      ...state.log,
      { turn: state.turn, phase: state.phase, kind, payload },
    ],
  };
}

// ---------------------------------------------------------------------------
// Damage pipeline (StS exact rules)
// ---------------------------------------------------------------------------

/**
 * Compute final outgoing damage after all attacker modifiers.
 * Order: base → strength → vigor (consumed) → weak
 */
function computeOutgoingDamage(
  base: number,
  attackerStatuses: Partial<Record<StatusKey, number>>,
): { damage: number; consumeVigor: boolean } {
  let dmg = base;

  // 1. Strength adds flat bonus
  dmg += attackerStatuses['strength'] ?? 0;

  // 2. Vigor adds flat bonus (consumed after)
  const vigor = attackerStatuses['vigor'] ?? 0;
  const consumeVigor = vigor > 0;
  dmg += vigor;

  // 3. Weak reduces by 25%, floor
  if ((attackerStatuses['weak'] ?? 0) > 0) {
    dmg = Math.floor(dmg * 0.75);
  }

  return { damage: Math.max(0, dmg), consumeVigor };
}

/**
 * Apply incoming damage modifiers on the defender, then reduce block and HP.
 * Returns updated defender fields.
 */
function applyDamageToDefender(
  hp: number,
  block: number,
  defenderStatuses: Partial<Record<StatusKey, number>>,
  damage: number,
): { hp: number; block: number } {
  let dmg = damage;

  // Vulnerable: +50%, ceil
  if ((defenderStatuses['vulnerable'] ?? 0) > 0) {
    dmg = Math.ceil(dmg * 1.5);
  }

  // Block absorbs damage
  const damageAfterBlock = Math.max(0, dmg - block);
  const newBlock = Math.max(0, block - dmg);
  const newHp = Math.max(0, hp - damageAfterBlock);

  return { hp: newHp, block: newBlock };
}

// ---------------------------------------------------------------------------
// Card counting by tag (requires card definitions — tags stored on Card not
// CardInstance, so callers with access to definitions should use this after
// resolving instances to definitions)
// ---------------------------------------------------------------------------

/**
 * Count cards in draw+hand+discard whose *instance IDs* are in the provided
 * tagged-instance set. Callers must resolve tags externally when definitions
 * are available. Here we accept a pre-built Set<CardInstanceId> of matching
 * instances to keep effects.ts definition-free.
 */
export function countTaggedInstances(
  state: CombatState,
  taggedIids: ReadonlySet<CardInstanceId>,
): number {
  const pool = [...state.piles.draw, ...state.piles.hand, ...state.piles.discard];
  return pool.filter((iid) => taggedIids.has(iid)).length;
}

/**
 * Count cards in draw+hand with matching tags.
 * Uses the optional tagMap (iid → tags) that callers may supply; falls back to
 * 0 when no map is available (pure fallback when definitions aren't loaded).
 */
export function countCardsWithTags(
  state: CombatState,
  tags: CardTag[],
  tagMap?: ReadonlyMap<CardInstanceId, readonly CardTag[]>,
): number {
  if (!tagMap) return 0;
  const tagSet = new Set<CardTag>(tags);
  const pool = [...state.piles.draw, ...state.piles.hand, ...state.piles.discard];
  return pool.filter((iid) => {
    const cardTags = tagMap.get(iid);
    return cardTags?.some((t) => tagSet.has(t)) ?? false;
  }).length;
}

// ---------------------------------------------------------------------------
// Draw helpers
// ---------------------------------------------------------------------------

/**
 * Draw up to `n` cards from the draw pile into hand (max hand size 10).
 * Reshuffles discard → draw when draw pile runs dry.
 * Returns the updated state.
 */
export function drawCards(state: CombatState, n: number): CombatState {
  const MAX_HAND = 10;
  let s = state;

  for (let i = 0; i < n; i++) {
    if (s.piles.hand.length >= MAX_HAND) break;

    // Reshuffle if draw pile is empty
    if (s.piles.draw.length === 0) {
      if (s.piles.discard.length === 0) break; // nothing left

      const rng = createSeededRng(s.seed + s.turn * 1000 + s.piles.exhaust.length);
      const shuffled = rng.shuffle(s.piles.discard);

      s = logEvent(
        {
          ...s,
          piles: { ...s.piles, draw: shuffled as CardInstanceId[], discard: [] },
          // Advance seed so subsequent reshuffles diverge
          seed: (s.seed + 1) >>> 0,
        },
        'reshuffle',
        { newDrawSize: shuffled.length },
      );
    }

    const [drawn, ...rest] = s.piles.draw;
    if (!drawn) break;

    s = {
      ...s,
      piles: {
        ...s.piles,
        draw: rest as CardInstanceId[],
        hand: [...s.piles.hand, drawn],
      },
    };
  }

  return s;
}

// ---------------------------------------------------------------------------
// Core effect resolver
// ---------------------------------------------------------------------------

export interface EffectContext {
  readonly state: CombatState;
  readonly targetId?: EnemyId;
  /** Resolved value for X-cost cards */
  readonly xValue?: number;
  /** iid of the card being played (needed for exhaust:self) */
  readonly sourceCardIid?: CardInstanceId;
  /** Tag map for synergy predicates: iid → tags array */
  readonly tagMap?: ReadonlyMap<CardInstanceId, readonly CardTag[]>;
}

/**
 * Resolve a single CardEffect, returning the updated state.
 */
export function applyEffect(
  state: CombatState,
  effect: CardEffect,
  actorIsHero: boolean,
  targetId?: EnemyId,
  ctx?: Omit<EffectContext, 'state' | 'targetId'>,
): CombatState {
  const fullCtx: EffectContext = targetId !== undefined
    ? { ...ctx, state, targetId }
    : { ...ctx, state };
  return resolveEffect(fullCtx, effect, actorIsHero);
}

/**
 * Resolve a sequence of effects in order, threading state through each.
 */
export function applyEffects(
  state: CombatState,
  effects: readonly CardEffect[],
  actorIsHero: boolean,
  targetId?: EnemyId,
  ctx?: Omit<EffectContext, 'state' | 'targetId'>,
): CombatState {
  return effects.reduce(
    (s, effect) => applyEffect(s, effect, actorIsHero, targetId, ctx),
    state,
  );
}

// Internal recursive resolver (keeps ctx threading clean)
function resolveEffect(
  ctx: EffectContext,
  effect: CardEffect,
  actorIsHero: boolean,
): CombatState {
  const { state, targetId } = ctx;

  switch (effect.kind) {
    // ------------------------------------------------------------------
    case 'damage': {
      const base = evalExpr(effect.amount, state, actorIsHero, targetId);

      const attackerStatuses = actorIsHero
        ? state.hero.statuses
        : findEnemy(state, targetId ?? ('' as EnemyId))?.statuses ?? {};

      const { damage, consumeVigor } = computeOutgoingDamage(base, attackerStatuses);

      // Consume vigor on the attacker
      let s = consumeVigor
        ? actorIsHero
          ? {
              ...state,
              hero: { ...state.hero, statuses: { ...state.hero.statuses, vigor: 0 } },
            }
          : updateEnemy(state, targetId ?? ('' as EnemyId), (e) => ({
              ...e,
              statuses: { ...e.statuses, vigor: 0 },
            }))
        : state;

      const resolveForTarget = (
        s2: CombatState,
        tid: EnemyId,
      ): CombatState => {
        const enemy = findEnemy(s2, tid);
        if (!enemy) return s2;

        const { hp, block } = applyDamageToDefender(
          enemy.hp,
          enemy.block,
          enemy.statuses,
          damage,
        );

        let next = updateEnemy(s2, tid, (e) => ({ ...e, hp, block }));

        // Thorns: attacker takes thorns damage (no block, direct HP)
        const thorns = enemy.statuses['thorns'] ?? 0;
        if (actorIsHero && thorns > 0) {
          next = {
            ...next,
            hero: {
              ...next.hero,
              hp: Math.max(0, next.hero.hp - thorns),
            },
          };
          next = logEvent(next, 'thorns', { thornsDmg: thorns });
        }

        return logEvent(next, 'damage', {
          actorIsHero,
          targetId: tid,
          baseDmg: base,
          finalDmg: damage,
          hpAfter: hp,
          blockAfter: block,
        });
      };

      if (effect.target === 'all_enemies') {
        for (const enemy of s.enemies.filter((e) => e.hp > 0)) {
          s = resolveForTarget(s, enemy.iid);
        }
        return s;
      } else if (effect.target === 'random_enemy') {
        const live = s.enemies.filter((e) => e.hp > 0);
        if (live.length === 0) return s;
        const rng = createSeededRng(s.seed + s.turn);
        const picked = rng.pick(live);
        return resolveForTarget(s, picked.iid);
      } else if (effect.target === 'enemy' && actorIsHero && targetId) {
        return resolveForTarget(s, targetId);
      } else if (effect.target === 'enemy' && !actorIsHero) {
        // Enemy attacking the hero ("enemy" from the enemy's POV = the player)
        const { hp, block } = applyDamageToDefender(
          s.hero.hp,
          s.hero.block,
          s.hero.statuses,
          damage,
        );
        return logEvent(
          { ...s, hero: { ...s.hero, hp, block } },
          'damage_dealt',
          { actorIsHero: false, targetId: 'hero' as EnemyId, finalDmg: damage, hpAfter: hp, blockAfter: block },
        );
      } else if (effect.target === 'self' && !actorIsHero) {
        // Enemy damaging itself (rare but possible via effects)
        const enemy = targetId ? findEnemy(s, targetId) : undefined;
        if (!enemy) return s;
        const { hp, block } = applyDamageToDefender(
          enemy.hp,
          enemy.block,
          enemy.statuses,
          damage,
        );
        return updateEnemy(s, enemy.iid, (e) => ({ ...e, hp, block }));
      } else if (effect.target === 'self' && actorIsHero) {
        // Self-damage effect on hero
        const { hp, block } = applyDamageToDefender(
          s.hero.hp,
          s.hero.block,
          s.hero.statuses,
          damage,
        );
        return logEvent(
          { ...s, hero: { ...s.hero, hp, block } },
          'self_damage',
          { finalDmg: damage, hpAfter: hp },
        );
      }
      return s;
    }

    // ------------------------------------------------------------------
    case 'block': {
      const base = evalExpr(effect.amount, state, actorIsHero, targetId);

      // Only hero gains block via card effects; enemy block is set by their moves
      let blockAmt = base;

      // Dexterity adds flat bonus
      const dex = state.hero.statuses['dexterity'] ?? 0;
      blockAmt += dex;

      // Frail reduces by 25%, floor
      if ((state.hero.statuses['frail'] ?? 0) > 0) {
        blockAmt = Math.floor(blockAmt * 0.75);
      }

      blockAmt = Math.max(0, blockAmt);

      const next = {
        ...state,
        hero: { ...state.hero, block: state.hero.block + blockAmt },
      };
      return logEvent(next, 'block', { base, blockAmt, heroBlockTotal: next.hero.block });
    }

    // ------------------------------------------------------------------
    case 'applyStatus': {
      const stacks = evalExpr(effect.stacks, state, actorIsHero, targetId);
      if (stacks === 0) return state;

      if (effect.target === 'self') {
        if (actorIsHero) {
          const next = {
            ...state,
            hero: {
              ...state.hero,
              statuses: addStatus(state.hero.statuses, effect.status, stacks),
            },
          };
          return logEvent(next, 'apply_status', {
            target: 'hero',
            status: effect.status,
            stacks,
          });
        } else if (targetId) {
          const next = updateEnemy(state, targetId, (e) => ({
            ...e,
            statuses: addStatus(e.statuses, effect.status, stacks),
          }));
          return logEvent(next, 'apply_status', {
            target: targetId,
            status: effect.status,
            stacks,
          });
        }
        return state;
      }

      const applyToEnemy = (s: CombatState, eid: EnemyId): CombatState => {
        const next = updateEnemy(s, eid, (e) => ({
          ...e,
          statuses: addStatus(e.statuses, effect.status, stacks),
        }));
        return logEvent(next, 'apply_status', {
          target: eid,
          status: effect.status,
          stacks,
        });
      };

      if (effect.target === 'all_enemies') {
        return state.enemies.reduce((s, e) => applyToEnemy(s, e.iid), state);
      } else if (effect.target === 'random_enemy') {
        const live = state.enemies.filter((e) => e.hp > 0);
        if (live.length === 0) return state;
        const rng = createSeededRng(state.seed + state.turn + 7);
        return applyToEnemy(state, rng.pick(live).iid);
      } else if (effect.target === 'enemy' && targetId) {
        return applyToEnemy(state, targetId);
      }

      return state;
    }

    // ------------------------------------------------------------------
    case 'draw':
      return drawCards(state, effect.n);

    // ------------------------------------------------------------------
    case 'gainEnergy': {
      // Safety cap: energyMax * 2 to prevent runaway loops
      const cap = state.hero.energyMax * 2;
      const next = {
        ...state,
        hero: {
          ...state.hero,
          energy: Math.min(cap, state.hero.energy + effect.n),
        },
      };
      return logEvent(next, 'gain_energy', { n: effect.n, energyAfter: next.hero.energy });
    }

    // ------------------------------------------------------------------
    case 'addCardToDeck': {
      const count = effect.count ?? 1;
      let s = state;
      for (let i = 0; i < count; i++) {
        const iid = `${effect.cardId}-tmp-${s.piles.discard.length}-${i}` as CardInstanceId;
        const instance: CardInstance = {
          iid,
          cardId: effect.cardId,
          upgraded: false,
          temporary: effect.temporary ?? false,
        };
        s = {
          ...s,
          piles: { ...s.piles, discard: [...s.piles.discard, iid] },
          cardInstances: { ...s.cardInstances, [iid]: instance },
        };
      }
      return logEvent(s, 'add_card', { cardId: effect.cardId, count });
    }

    // ------------------------------------------------------------------
    case 'exhaust': {
      if (effect.target === 'self') {
        const sourceIid = ctx.sourceCardIid;
        if (!sourceIid) return state;
        // Remove from hand, add to exhaust
        const next = {
          ...state,
          piles: {
            ...state.piles,
            hand: state.piles.hand.filter((iid) => iid !== sourceIid),
            exhaust: [...state.piles.exhaust, sourceIid],
          },
        };
        return logEvent(next, 'exhaust', { target: 'self', iid: sourceIid });
      }

      if (effect.target === 'hand') {
        const exhausted = state.piles.hand;
        const next = {
          ...state,
          piles: {
            ...state.piles,
            hand: [],
            exhaust: [...state.piles.exhaust, ...exhausted],
          },
        };
        return logEvent(next, 'exhaust', { target: 'hand', count: exhausted.length });
      }

      if (effect.target === 'random_hand') {
        if (state.piles.hand.length === 0) return state;
        const rng = createSeededRng(state.seed + state.turn + 13);
        const picked = rng.pick(state.piles.hand);
        const next = {
          ...state,
          piles: {
            ...state.piles,
            hand: state.piles.hand.filter((iid) => iid !== picked),
            exhaust: [...state.piles.exhaust, picked],
          },
        };
        return logEvent(next, 'exhaust', { target: 'random_hand', iid: picked });
      }

      return state;
    }

    // ------------------------------------------------------------------
    case 'heal': {
      const amount = evalExpr(effect.amount, state, actorIsHero, targetId);
      const newHp = Math.min(state.hero.maxHp, state.hero.hp + amount);
      const next = { ...state, hero: { ...state.hero, hp: newHp } };
      return logEvent(next, 'heal', { amount, hpAfter: newHp });
    }

    // ------------------------------------------------------------------
    case 'conditional': {
      const passes = evalPredicate(effect.if, state, actorIsHero, targetId);
      const branch = passes ? effect.then : (effect.else ?? []);
      return branch.reduce(
        (s, e) => resolveEffect({ ...ctx, state: s }, e, actorIsHero),
        state,
      );
    }

    // ------------------------------------------------------------------
    case 'synergy': {
      const count = countCardsWithTags(state, effect.tags, ctx.tagMap);
      if (count >= effect.minCards) {
        return effect.bonus.reduce(
          (s, e) => resolveEffect({ ...ctx, state: s }, e, actorIsHero),
          state,
        );
      }
      return state;
    }

    // ------------------------------------------------------------------
    case 'repeat': {
      const times = evalExpr(effect.times, state, actorIsHero, targetId);
      let s = state;
      for (let i = 0; i < times; i++) {
        s = resolveEffect({ ...ctx, state: s }, effect.effect, actorIsHero);
      }
      return s;
    }

    default:
      effect satisfies never;
      return state;
  }
}

// Re-export old name for backward compatibility with existing stubs
export { resolveEffect, resolveEffect as resolveEffects };

// Expose resolveEffects (sequence) under the correct name
export function resolveEffectSequence(
  ctx: EffectContext,
  effects: readonly CardEffect[],
  actorIsHero: boolean,
): CombatState {
  return effects.reduce(
    (s, effect) => resolveEffect({ ...ctx, state: s }, effect, actorIsHero),
    ctx.state,
  );
}

// ---------------------------------------------------------------------------
// End-of-turn status tick helpers
// ---------------------------------------------------------------------------

/**
 * Apply periodic status damage directly to HP (bypasses block, as per StS).
 * Returns updated state.
 */
export function tickStatusDamageOnHero(
  state: CombatState,
  status: 'poison' | 'bleed' | 'burn',
): CombatState {
  const stacks = state.hero.statuses[status] ?? 0;
  if (stacks <= 0) return state;

  let s: CombatState = {
    ...state,
    hero: {
      ...state.hero,
      hp: Math.max(0, state.hero.hp - stacks),
    },
  };

  s = logEvent(s, 'status_tick', { status, stacks, target: 'hero', hpAfter: s.hero.hp });

  // Poison decrements by 1 after dealing damage (min 0)
  if (status === 'poison') {
    const newPoison = Math.max(0, stacks - 1);
    s = {
      ...s,
      hero: {
        ...s.hero,
        statuses: { ...s.hero.statuses, poison: newPoison },
      },
    };
  }

  return s;
}

export function tickStatusDamageOnEnemy(
  state: CombatState,
  enemyIid: EnemyId,
  status: 'poison' | 'bleed' | 'burn',
): CombatState {
  const enemy = findEnemy(state, enemyIid);
  if (!enemy) return state;

  const stacks = enemy.statuses[status] ?? 0;
  if (stacks <= 0) return state;

  let s = updateEnemy(state, enemyIid, (e) => ({
    ...e,
    hp: Math.max(0, e.hp - stacks),
  }));

  s = logEvent(s, 'status_tick', {
    status,
    stacks,
    target: enemyIid,
    hpAfter: findEnemy(s, enemyIid)?.hp ?? 0,
  });

  // Poison decrements by 1 after dealing damage (min 0)
  if (status === 'poison') {
    s = updateEnemy(s, enemyIid, (e) => ({
      ...e,
      statuses: { ...e.statuses, poison: Math.max(0, stacks - 1) },
    }));
  }

  return s;
}
