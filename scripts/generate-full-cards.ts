#!/usr/bin/env tsx
// scripts/generate-full-cards.ts
// Generates COMPLETE card images (frame + art + text + rarity) for a hero's deck.
// The entire card is one PNG — no HTML overlay needed.
//
// Usage:
//   GEMINI_API_KEY=<key> tsx scripts/generate-full-cards.ts --hero borea
//   GEMINI_API_KEY=<key> tsx scripts/generate-full-cards.ts --hero borea --regen
//   tsx scripts/generate-full-cards.ts --hero borea --dry-run

/// <reference path="./node-env.d.ts" />

import * as fs from 'fs';
import * as path from 'path';

const API_KEY  = process.env.GEMINI_API_KEY;
const MODEL    = 'imagen-4.0-fast-generate-001';
const OUT_DIR  = path.join(process.cwd(), 'public', 'art', 'full-cards');
const DELAY_MS = 7000;

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const REGEN    = args.includes('--regen');
const HERO     = args.includes('--hero') ? args[args.indexOf('--hero') + 1] : null;

if (!HERO) { console.error('Usage: --hero <borea|rex|veloce>'); process.exit(1); }

// ---------------------------------------------------------------------------
// Card data types (mirror of game types, enough for prompt generation)
// ---------------------------------------------------------------------------

interface CardEffect {
  kind: string;
  amount?: number | object;
  n?: number;
  stacks?: number;
  status?: string;
  target?: string;
}

interface CardData {
  id: string;
  name: { it: string };
  type: 'attack' | 'skill' | 'power';
  rarity: 'starter' | 'common' | 'uncommon' | 'rare';
  cost: number | 'X';
  tags?: string[];
  effects: CardEffect[];
  flavorIt?: string;
}

// ---------------------------------------------------------------------------
// Rarity → frame color description
// ---------------------------------------------------------------------------

const RARITY_FRAME: Record<string, string> = {
  starter:  'dark stone gray frame with muted amber filigree, simple border, no glow',
  common:   'dark obsidian frame with warm amber border trim, subtle stone texture, clean design',
  uncommon: 'deep navy blue frame with silver-blue filigree, soft cyan inner glow, dual-tone border',
  rare:     'rich golden frame with ornate fossil-bone filigree, amber gems in corners, glowing golden aura, premium metallic sheen',
};

const TYPE_BANNER: Record<string, string> = {
  attack: 'red-crimson "ATTACCO" type banner beneath the art, sword icon on left',
  skill:  'sapphire-blue "ABILITÀ" type banner beneath the art, shield icon on left',
  power:  'amber-gold "POTERE" type banner beneath the art, star icon on left',
};

const HERO_DESCRIPTIONS: Record<string, string> = {
  borea: 'Borealopelta ankylosaur — quadrupedal living fortress, covered in heavy stone-like osteoderms and bony armor plates, earth-brown and stone-grey coloring, massive tail club',
  rex:   'juvenile Tyrannosaurus rex — bipedal apex predator, massive skull with rows of serrated teeth, powerful hindlegs, tiny forelimbs, dark charcoal scales with volcanic red and orange accents, raw predatory power',
  veloce: 'young Deinonychus — agile feathered dromeosaurid, razor-sharp retractable sickle claws on each foot, sleek build, blue-grey plumage with iridescent teal feather tips, lightning-fast pack hunter',
};

// ---------------------------------------------------------------------------
// Effect text builder (plain Italian, concise)
// ---------------------------------------------------------------------------

function effectText(effects: CardEffect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    if (e.kind === 'damage' && typeof e.amount === 'number') parts.push(`Infliggi ${e.amount} danni`);
    else if (e.kind === 'block' && typeof e.amount === 'number') parts.push(`Guadagna ${e.amount} blocco`);
    else if (e.kind === 'draw' && e.n) parts.push(`Pesca ${e.n} carte`);
    else if (e.kind === 'applyStatus') parts.push(`Applica ${e.stacks ?? 1} ${e.status}`);
    else if (e.kind === 'exhaust') parts.push('Esaurisci');
    else if (e.kind === 'gainEnergy') parts.push(`+${e.n} Energia`);
  }
  return parts.join('. ') || 'Effetto speciale';
}

// ---------------------------------------------------------------------------
// Full-card prompt builder
// ---------------------------------------------------------------------------

function buildFullCardPrompt(card: CardData, hero: string): string {
  const frame    = RARITY_FRAME[card.rarity] ?? RARITY_FRAME.common;
  const typeBnr  = TYPE_BANNER[card.type] ?? TYPE_BANNER.skill;
  const cost     = card.cost === 'X' ? 'X' : String(card.cost);
  const effDesc  = effectText(card.effects);
  const flavor   = card.flavorIt ? `"${card.flavorIt.slice(0, 60)}"` : '';
  const heroDesc = HERO_DESCRIPTIONS[hero] ?? HERO_DESCRIPTIONS.borea;

  const primaryEff = card.effects[0]?.kind ?? 'skill';
  const sceneMap: Record<string, string> = {
    damage:      'powerful impact strike, shockwave, ground crack, debris flying',
    block:       'crystalline shield barrier forming, glowing protective aura materializing',
    applyStatus: 'swirling status effect aura — thorns as thorn vines, vulnerable as red fracture lines',
    draw:        'glowing energy vortex, cards swirling in arcane light',
    gainEnergy:  'amber lightning crackling, floating energy orbs',
    exhaust:     'card dissolving into embers and ash',
    heal:        'emerald healing light rising',
  };
  const scene = sceneMap[primaryEff] ?? 'tactical stance, focused energy';

  return [
    `A complete fantasy trading card game card for a dinosaur deckbuilder game.`,
    `Card frame and border: ${frame}.`,
    `Top-left corner: circular amber energy gem badge with the number "${cost}" in bold white — this is the mana/energy cost.`,
    `Top-right corner: small rectangular rarity label "${card.rarity.toUpperCase()}" in matching frame color.`,
    `Card name plate at top center: decorative banner with the bold text "${card.name.it}" in fantasy serif font.`,
    `Central illustration (fills ~55% of card height): ${heroDesc}. Scene: ${scene}. Dramatic chiaroscuro lighting, painterly digital art, Hearthstone quality.`,
    `Below illustration: ${typeBnr}.`,
    `Effect text box: dark parchment texture background, legible fantasy font, text reads: "${effDesc}."`,
    flavor ? `Flavor text in italics at bottom: ${flavor}.` : '',
    `Overall card size: portrait 3:4 ratio (like a standard TCG card). Highly detailed, professional game card design.`,
    `Art style: painterly digital illustration. Color palette: obsidian black, volcanic amber, warm gold, stone grey.`,
    `Complete card — all elements visible and readable. NO watermarks. NO lorem ipsum.`,
  ].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Imagen API
// ---------------------------------------------------------------------------

interface ImagenResponse {
  predictions?: Array<{ bytesBase64Encoded?: string }>;
  error?: { message: string };
}

async function callImagen(prompt: string): Promise<Buffer | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${API_KEY!}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '3:4',
        safetyFilterLevel: 'block_some',
        personGeneration: 'dont_allow',
        outputMimeType: 'image/png',
      },
    }),
  });

  const data = await res.json() as ImagenResponse;
  if (data.error) throw new Error(data.error.message);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) return null;
  return Buffer.from(b64, 'base64');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!DRY_RUN && !API_KEY) {
    console.error('❌  Set GEMINI_API_KEY env var (or use --dry-run)');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Load cards for the chosen hero
  const cardFile = path.join(process.cwd(), 'src', 'data', 'cards', 'act1', `${HERO}.json`);
  if (!fs.existsSync(cardFile)) {
    console.error(`❌  Card file not found: ${cardFile}`);
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(cardFile, 'utf-8')) as CardData[];
  console.log(`\n🎴  Generating ${cards.length} full cards for hero: ${HERO}\n`);

  let generated = 0, skipped = 0, failed = 0;

  for (const card of cards) {
    const outPath = path.join(OUT_DIR, `${card.id}.png`);

    if (fs.existsSync(outPath) && !REGEN) {
      console.log(`  ⏭  ${card.id} already exists — skip`);
      skipped++;
      continue;
    }

    const prompt = buildFullCardPrompt(card, HERO);

    if (DRY_RUN) {
      console.log(`  [DRY] ${card.id}:\n    ${prompt.slice(0, 120)}…\n`);
      continue;
    }

    process.stdout.write(`  Generating ${card.id} (${card.name.it})…`);

    try {
      const buf = await callImagen(prompt);
      if (!buf) { console.log(' ⚠  no image returned'); failed++; }
      else {
        fs.writeFileSync(outPath, buf);
        console.log(` ✅  Saved ${card.id}.png`);
        generated++;
      }
    } catch (err) {
      console.log(` ❌  Error: ${(err as Error).message}`);
      failed++;
    }

    if (generated + failed < cards.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n✨  Done. Generated: ${generated}, Failed: ${failed}, Skipped: ${skipped}`);
  console.log(`   Full cards saved to: ${OUT_DIR}\n`);
}

main().catch(console.error);
