// Dev-only Zod schemas — this file is never imported in production paths
// (content/index.ts gates the import behind import.meta.env.DEV)

import { z } from 'zod';

const cardSchema = z.object({
  id: z.string().min(1),
  name: z.object({ it: z.string().min(1) }),
  cost: z.union([z.number().int().min(0), z.literal('X')]),
  type: z.enum(['attack', 'skill', 'power']),
  rarity: z.enum(['starter', 'common', 'uncommon', 'rare']),
  act: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  tags: z.array(z.string()),
  effects: z.array(z.record(z.unknown())),
});

const heroSchema = z.object({
  id: z.string().min(1),
  name: z.object({ it: z.string().min(1) }),
  taxonGroup: z.string().min(1),
  diet: z.enum(['carnivoro', 'erbivoro']),
  era: z.enum(['triassico', 'giurassico', 'cretaceo']),
  stages: z.record(z.object({
    hp: z.number().int().positive(),
    energyPerTurn: z.number().int().positive(),
    handSize: z.number().int().positive(),
    passiveDescription: z.string(),
    abilityKeys: z.array(z.string()),
  })),
  starterDeck: z.array(z.string()),
  starterRelic: z.string().min(1),
  primeConditions: z.array(z.string()),
});

const enemySchema = z.object({
  id: z.string().min(1),
  name: z.object({ it: z.string().min(1) }),
  taxonGroup: z.string().min(1),
  diet: z.enum(['carnivoro', 'erbivoro']),
  hp: z.number().int().positive(),
  tier: z.enum(['normal', 'elite', 'boss']),
  moves: z.array(z.object({
    id: z.string(),
    intent: z.object({
      type: z.enum(['attack', 'defend', 'buff', 'debuff', 'unknown']),
      description: z.string(),
    }),
    effects: z.array(z.record(z.unknown())),
  })),
  movePattern: z.enum(['sequential', 'random', 'conditional']),
});

const relicSchema = z.object({
  id: z.string().min(1),
  name: z.object({ it: z.string().min(1) }),
  description: z.string(),
  tier: z.enum(['starter', 'common', 'uncommon', 'rare', 'boss', 'ancestral']),
  trigger: z.string().min(1),
  effects: z.array(z.record(z.unknown())),
});

const eventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  choices: z.array(z.object({
    label: z.string(),
    description: z.string(),
    outcomes: z.array(z.object({
      description: z.string(),
      effects: z.array(z.record(z.unknown())),
    })),
  })),
});

const schemas: Record<string, z.ZodTypeAny> = {
  cards: z.array(cardSchema),
  heroes: z.array(heroSchema),
  enemies: z.array(enemySchema),
  relics: z.array(relicSchema),
  events: z.array(eventSchema),
};

export function getSchema(key: string): z.ZodTypeAny {
  const schema = schemas[key];
  if (schema === undefined) throw new Error(`No schema registered for key: ${key}`);
  return schema;
}
