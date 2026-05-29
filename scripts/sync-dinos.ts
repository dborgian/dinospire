/// <reference path="./node-env.d.ts" />
// Run with: npx tsx scripts/sync-dinos.ts
// Reads a DinoDex export and writes the projected dino data to src/data/dinos.json.
// Does NOT download images — only JSON projection.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ---- Source shape (what DinoDex exports) ----

interface DinoExportEntry {
  slug?: string;
  nameLa?: string;
  nameIt?: string;
  period?: string;
  era?: string;
  diet?: string;
  lengthM?: number;
  taxonGroup?: string;
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
  abilityKey?: string;
  rarity?: string;
  cardNumber?: number;
  imageUrl?: string;
  phylopicUuid?: string;
  italianOrigin?: boolean;
  lesserKnown?: boolean;
  [key: string]: unknown;
}

// ---- Output shape (what DinoSpire stores) ----

export interface DinoRecord {
  slug: string;
  nameLa: string;
  nameIt: string;
  period: string | null;
  era: string | null;
  diet: string | null;
  lengthM: number | null;
  taxonGroup: string | null;
  atk: number | null;
  def: number | null;
  hp: number | null;
  spd: number | null;
  abilityKey: string | null;
  rarity: string | null;
  cardNumber: number | null;
  imageUrl: string | null;
  phylopicUuid: string | null;
  italianOrigin: boolean;
  lesserKnown: boolean;
}

// ---- Config ----

const sourcePath =
  process.env['DINODEX_EXPORT_PATH'] ?? join('..', 'dinodex', 'out', 'dinos.export.json');
const outPath = join(process.cwd(), 'src', 'data', 'dinos.json');

// ---- Main ----

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(sourcePath, 'utf-8'));
} catch (e) {
  console.error(`[sync-dinos] Cannot read source: ${sourcePath}`);
  console.error((e as Error).message);
  process.exit(1);
}

if (!Array.isArray(raw)) {
  console.error('[sync-dinos] Source is not a JSON array');
  process.exit(1);
}

const entries = raw as DinoExportEntry[];
const projected: DinoRecord[] = [];
const skipped: string[] = [];

for (const entry of entries) {
  if (!entry.slug || !entry.nameLa) {
    skipped.push(entry.slug ?? '(no slug)');
    continue;
  }

  projected.push({
    slug: entry.slug,
    nameLa: entry.nameLa,
    nameIt: entry.nameIt ?? entry.nameLa,
    period: entry.period ?? null,
    era: entry.era ?? null,
    diet: entry.diet ?? null,
    lengthM: entry.lengthM ?? null,
    taxonGroup: entry.taxonGroup ?? null,
    atk: entry.atk ?? null,
    def: entry.def ?? null,
    hp: entry.hp ?? null,
    spd: entry.spd ?? null,
    abilityKey: entry.abilityKey ?? null,
    rarity: entry.rarity ?? null,
    cardNumber: entry.cardNumber ?? null,
    imageUrl: entry.imageUrl ?? null,
    phylopicUuid: entry.phylopicUuid ?? null,
    italianOrigin: entry.italianOrigin ?? false,
    lesserKnown: entry.lesserKnown ?? false,
  });
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(projected, null, 2));

console.log(`[sync-dinos] Processed: ${projected.length} dinos`);
if (skipped.length > 0) {
  console.warn(`[sync-dinos] Skipped ${skipped.length} entries missing slug/nameLa: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
}
console.log(`[sync-dinos] Written: ${outPath}`);
