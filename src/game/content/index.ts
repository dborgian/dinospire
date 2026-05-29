/// <reference types="vite/client" />
import type {
  Card,
  CardId,
  EnemyDefinition,
  EventDefinition,
  HeroDefinition,
  HeroId,
  RelicDefinition,
  RelicId,
} from '../types';

// ---- Cache ----
// Populated on first load of each resource; keys match resource+act combination

const cardCache = new Map<string, Card>();
const heroCache = new Map<HeroId, HeroDefinition>();
const enemyCache = new Map<string, EnemyDefinition[]>();
const relicCache = new Map<RelicId, RelicDefinition>();
const eventCache = new Map<string, EventDefinition[]>();

let relicsLoaded = false;
let heroesLoaded = false;

// Act-level card load tracking — avoids re-importing when cards are already cached
const cardsLoadedByAct = new Set<number>();

export const contentRegistry = {
  cards: cardCache,
  heroes: heroCache,
  enemies: enemyCache,
  relics: relicCache,
  events: eventCache,
} as const;

// ---- Dev-only Zod validation ----
// Imported lazily so the bundle never includes Zod in production

async function maybeValidate<T>(data: unknown, schemaKey: string): Promise<T> {
  if (import.meta.env.DEV) {
    const { getSchema } = await import('./schemas');
    const schema = getSchema(schemaKey);
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(`[content] Validation failed for "${schemaKey}":`, result.error.flatten());
      throw new Error(`Content validation failed: ${schemaKey}`);
    }
    return result.data as T;
  }
  return data as T;
}

// ---- Loaders ----

export async function loadCards(act: 1 | 2 | 3): Promise<Card[]> {
  if (cardsLoadedByAct.has(act)) {
    return [...cardCache.values()].filter((c) => c.act === act);
  }

  let raw: unknown;

  if (act === 1) {
    // Split into per-hero files to keep each file focused and tree-shakeable
    const [rex, veloce, borea, neutral] = await Promise.all([
      import('../../data/cards/act1/rex.json').then((m) => m.default as unknown as Card[]),
      import('../../data/cards/act1/veloce.json').then((m) => m.default as unknown as Card[]),
      import('../../data/cards/act1/borea.json').then((m) => m.default as unknown as Card[]),
      import('../../data/cards/act1/neutral.json').then((m) => m.default as unknown as Card[]),
    ]);
    raw = [...rex, ...veloce, ...borea, ...neutral];
  } else {
    // Acts 2 and 3 still use the monolithic file when it exists
    raw = (await import(`../../data/cards_act${act}.json`)).default;
  }

  const validated = await maybeValidate<Card[]>(raw, 'cards');

  for (const card of validated) {
    cardCache.set(card.id, card);
  }

  cardsLoadedByAct.add(act);
  return validated;
}

export async function loadHeroes(): Promise<HeroDefinition[]> {
  if (heroesLoaded) {
    return [...heroCache.values()];
  }

  const raw: unknown = (await import('../../data/heroes.json')).default;
  const validated = await maybeValidate<HeroDefinition[]>(raw, 'heroes');

  for (const hero of validated) {
    heroCache.set(hero.id, hero);
  }

  heroesLoaded = true;
  return validated;
}

export async function loadEnemies(act: 1 | 2 | 3): Promise<EnemyDefinition[]> {
  const key = `act${act}`;
  const cached = enemyCache.get(key);
  if (cached !== undefined) return cached;

  const raw: unknown = (await import(`../../data/enemies_act${act}.json`)).default;
  const validated = await maybeValidate<EnemyDefinition[]>(raw, 'enemies');

  enemyCache.set(key, validated);
  return validated;
}

export async function loadRelics(): Promise<RelicDefinition[]> {
  if (relicsLoaded) {
    return [...relicCache.values()];
  }

  const raw: unknown = (await import('../../data/relics.json')).default;
  const validated = await maybeValidate<RelicDefinition[]>(raw, 'relics');

  for (const relic of validated) {
    relicCache.set(relic.id, relic);
  }

  relicsLoaded = true;
  return validated;
}

export async function loadEvents(act: 1 | 2 | 3): Promise<EventDefinition[]> {
  const key = `act${act}`;
  const cached = eventCache.get(key);
  if (cached !== undefined) return cached;

  const raw: unknown = (await import(`../../data/events_act${act}.json`)).default;
  const validated = await maybeValidate<EventDefinition[]>(raw, 'events');

  eventCache.set(key, validated);
  return validated;
}

// ---- Synchronous lookups (valid only after the corresponding loader has resolved) ----

export function getCard(id: string): Card | undefined {
  return cardCache.get(id as CardId);
}

export function getHero(id: string): HeroDefinition | undefined {
  return heroCache.get(id as HeroId);
}

export function getRelic(id: string): RelicDefinition | undefined {
  return relicCache.get(id as RelicId);
}

// ---- Eager warm-up ----
// Call once at app boot (e.g. in main.tsx) so all synchronous lookups resolve
// without awaiting individual loaders elsewhere.

export async function initContent(): Promise<void> {
  await Promise.all([
    loadCards(1),
    loadHeroes(),
    loadRelics(),
  ]);
}
