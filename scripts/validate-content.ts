/// <reference path="./node-env.d.ts" />
// Run with: npx tsx scripts/validate-content.ts
// Validates all JSON files in src/data/ against Zod schemas.
// Exits with code 1 on any validation failure so CI catches broken content.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

// ---- Minimal required schemas ----
// These enforce the fields that the engine cannot function without.
// Optional fields are not checked here — runtime loader handles them.

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

// Maps filename prefix patterns to schemas
const FILE_SCHEMAS: Array<{ pattern: RegExp; schema: z.ZodTypeAny; label: string }> = [
  { pattern: /^cards_act\d\.json$/, schema: z.array(cardSchema), label: 'Card' },
  { pattern: /^heroes\.json$/, schema: z.array(heroSchema), label: 'HeroDefinition' },
  { pattern: /^enemies_act\d\.json$/, schema: z.array(enemySchema), label: 'EnemyDefinition' },
  { pattern: /^relics\.json$/, schema: z.array(relicSchema), label: 'RelicDefinition' },
  { pattern: /^events_act\d\.json$/, schema: z.array(eventSchema), label: 'EventDefinition' },
];

// ---- Runner ----

const dataDir = join(process.cwd(), 'src', 'data');
let files: string[] = [];

try {
  files = readdirSync(dataDir).filter((f: string) => f.endsWith('.json'));
} catch {
  console.error(`[validate] src/data/ not found — nothing to validate`);
  process.exit(0);
}

let totalFiles = 0;
let totalErrors = 0;

for (const file of files) {
  const matched = FILE_SCHEMAS.find((s) => s.pattern.test(file));
  if (matched === undefined) {
    // Dinos export and other data files are not validated here
    continue;
  }

  totalFiles++;
  const filePath = join(dataDir, file);
  let raw: unknown;

  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`[validate] PARSE ERROR ${file}:`, (e as Error).message);
    totalErrors++;
    continue;
  }

  const result = matched.schema.safeParse(raw);
  if (!result.success) {
    const flat = result.error.flatten();
    console.error(`[validate] INVALID ${file} (${matched.label}):`);
    if (flat.formErrors.length > 0) {
      console.error('  root:', flat.formErrors);
    }
    for (const [key, errs] of Object.entries(flat.fieldErrors)) {
      console.error(`  [${key}]:`, errs);
    }
    totalErrors++;
  } else {
    const count = Array.isArray(result.data) ? result.data.length : 1;
    console.log(`[validate] OK ${file} — ${count} ${matched.label}(s)`);
  }
}

if (totalFiles === 0) {
  console.log('[validate] No matching JSON files found in src/data/');
}

if (totalErrors > 0) {
  console.error(`\n[validate] ${totalErrors} file(s) failed validation`);
  process.exit(1);
}

console.log(`\n[validate] All ${totalFiles} file(s) valid`);
