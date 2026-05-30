#!/usr/bin/env tsx
// scripts/generate-full-cards.ts
// Generates COMPLETE card images (frame + art + text) for a hero's deck.
//
// Usage:
//   GEMINI_API_KEY=<key> tsx scripts/generate-full-cards.ts --hero rex
//   GEMINI_API_KEY=<key> tsx scripts/generate-full-cards.ts --hero rex --regen
//   GEMINI_API_KEY=<key> tsx scripts/generate-full-cards.ts --hero rex --only morso_r,affondo_r
//   tsx scripts/generate-full-cards.ts --hero rex --dry-run

/// <reference path="./node-env.d.ts" />

import * as fs from 'fs';
import * as path from 'path';

const API_KEY  = process.env.GEMINI_API_KEY;
const MODEL    = 'imagen-4.0-fast-generate-001';
const OUT_DIR  = path.join(process.cwd(), 'public', 'art', 'full-cards');
const DELAY_MS = 8000;

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const REGEN    = args.includes('--regen');
const HERO     = args.includes('--hero') ? args[args.indexOf('--hero') + 1] : null;
const ONLY_IDX = args.indexOf('--only');
const ONLY_VAL = ONLY_IDX >= 0 ? args[ONLY_IDX + 1] : undefined;
const ONLY     = ONLY_VAL ? ONLY_VAL.split(',') : null;

if (!HERO) { console.error('Usage: --hero <borea|rex|veloce>'); process.exit(1); }
if (ONLY_IDX >= 0 && !ONLY_VAL) { console.error('Usage: --only <id1,id2,...>'); process.exit(1); }

// ---------------------------------------------------------------------------
// Card data types
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
// Hero dinosaur descriptions
// ---------------------------------------------------------------------------

const HERO_DINO: Record<string, string> = {
  rex: 'a juvenile Tyrannosaurus rex — massive skull with rows of serrated teeth, powerful muscular hindlegs, tiny forelimbs, dark charcoal scales with volcanic orange-red accents on the neck and spine, raw predatory power',
  veloce: 'a young Deinonychus — sleek feathered dromeosaurid, razor-sharp retractable sickle claws on each foot, blue-grey plumage with iridescent teal feather tips, intelligent amber eyes, lightning-fast predator',
  borea: 'a Borealopelta ankylosaur — heavy quadruped covered in stone-like osteoderms and bony armor plates, earth-brown and stone-grey coloring, massive tail club, living fortress',
};

// ---------------------------------------------------------------------------
// Per-card illustration scenes
// These override the generic effect-based scene for a more specific visual.
// ---------------------------------------------------------------------------

const CARD_SCENES: Record<string, string> = {
  // Rex cards
  morso_r:          'close-up of the dinosaur lunging forward with its enormous jaws wide open, rows of serrated teeth glistening, the enemy in its grip, ground cracking beneath its feet',
  affondo_r:        'the dinosaur in full sprint lunging, low-angle shot from below looking up, the sheer weight and momentum of the charge, dust cloud and shattered rocks flying outward',
  coda_spazzante_r: 'the dinosaur pivoting fast, its massive tail sweeping a wide arc through the air, shockwave radiating outward, multiple enemies knocked back',
  ruggito_r:        'the dinosaur rearing back with jaws wide open, a thunderous roar erupting from its throat, visible sound waves rippling outward, the enemy shrinking back in fear',
  predatore_alpha_r:'the dinosaur in a dramatic killing strike from above, total domination, the prey pinned beneath its foot, amber sky behind, the apex predator in its full terrifying glory',
  istinto_caccia_r: 'the dinosaur low and stalking silently through tall ferns, eyes narrowed and focused, tracking unseen prey, tension and hunter instinct radiating from its posture',
  morso_potenziato_r:'the dinosaur clamping down with its full jaw force, crushing a massive boulder in its bite to demonstrate raw power, stone fragments exploding outward',
  carica_alpha_r:   'the dinosaur charging forward at full speed, head lowered, thunderous footsteps cracking the ground, dust trails behind, pure unstoppable momentum',
  sentinella_apex_r:'the dinosaur standing tall and alert on high rocky ground, surveying its territory, a glowing amber energy barrier materializing around it, guardian of the land',
  ruggito_sismico_r:'the dinosaur roaring so powerfully that the ground itself fractures and heaves, seismic cracks radiating out in all directions, the enemy off-balance',

  // Veloce cards
  beccata_v:           'the feathered dinosaur striking with its sharp beak in a quick precise jab, feathers ruffled from the speed, a single precise wound on the enemy',
  doppio_artiglio_v:   'the dinosaur leaping with both sickle-clawed feet forward, a double slashing attack mid-air, teal feathers trailing in the motion',
  scatto_v:            'the dinosaur in a blur of speed, leaving a motion trail behind, repositioning in an instant, enemy confused looking left as the attacker appears from the right',
  branco_v:            'three silhouettes of the same feathered dinosaur surrounding an enemy, communicating in perfect pack coordination, glowing teal connecting lines between them',
  sciame_compagni_v:   'a pack of small feathered raptors erupting from the undergrowth, swarming an overwhelmed enemy, feathers and claws everywhere',
  coordinazione_branco_v:'two feathered raptors executing a perfectly timed pincer attack, one high one low, the enemy caught between them with no escape',
  predazione_multipla_v:'the raptor striking three times in rapid succession, motion blur showing multiple strike positions, each hit leaving a glow trail',
  fuga_tattica_v:      'the raptor leaping backwards off a wall with a flip, dodging an incoming strike at the last moment, teal feathers scattered in the evasion',
  compagno_alpha_v:    'a large feathered raptor alpha arriving from above in a dive, golden aura surrounding it, joining its smaller companion in battle',
  trappola_branco_v:   'the raptor setting a shimmering teal energy snare on the ground, the enemy walking into it, the pack closing in from all sides',

  // Borea cards — starter
  carica_b:              'the armored ankylosaur charging forward like a living battering ram, its thick osteoderms absorbing impact while its shoulder slams into the enemy, dust explosion on contact, simultaneous attack and shield',
  colpo_pesante_b:       'the ankylosaur rearing back and swinging its massive bone-studded tail club in a devastating arc, the enemy hit square-on and sent flying, the ground cracking from the shockwave',
  passo_pesante_b:       'the ankylosaur taking one slow deliberate step forward, its enormous weight causing the earth to fracture in radiating cracks, all surrounding enemies staggered by the tremor',
  corazza_b:             'the ankylosaur still and upright, its entire surface of osteoderms suddenly illuminating with warm amber energy, a layered living shield forming over every bony plate, fortress mode activated',
  posizione_bassa_b:     'the ankylosaur pressing its entire body flat against the ground, legs splayed wide, becoming an immovable stone slab, armor fusing with the earth beneath, pure unyielding block',
  scaglia_libera_b:      'a single large osteoderm plate detaching from the ankylosaur and floating in front of it as a quick improvised shield, deflecting a strike at the last second',
  istinto_difensivo_b:   'the ankylosaur closing its eyes in a brief moment of calm focus, its prehistoric survival instincts sharpening, tactical clarity visible in the glow of its eyes reopening',
  vulnerabilita_esposta_b:'the ankylosaur using its tail to knock the enemy off balance, exposing a gap in the enemy\'s armor, cracks visibly spreading along the enemy\'s shell or hide, ready to be exploited',
  // Borea cards — pool
  frantuma_ossa_b:       'the ankylosaur slamming its massive tail club sideways into the enemy, the impact shattering bone and sending shockwaves through the ground, the enemy left cracked and vulnerable',
  placca_ossea_b:        'close-up of the ankylosaur\'s side, new bony dermal plates visibly thickening and layering over existing armor in real time, growing stronger with each passing moment',
  riflesso_corazza_b:    'the ankylosaur deflecting an incoming strike with a brilliant flash off its armor, the reflected force sending the attacker reeling back from their own blow',
  contrattacco_b:        'the ankylosaur absorbing a hit without flinching, then immediately retaliating with a precise tail club swing, the counter-hit more powerful than the original strike',
  fortezza_b:            'the ankylosaur surrounded by an aura of thorned stone walls erupting from the ground around it, every spine and plate sharp and ready, a permanent living fortress',
};

// ---------------------------------------------------------------------------
// Rarity frame descriptions
// ---------------------------------------------------------------------------

const RARITY_FRAME: Record<string, string> = {
  starter:  'dark stone-grey frame, simple warm amber border trim, no glow, clean and functional',
  common:   'dark obsidian frame, warm amber border trim, subtle fossil-bone texture on the edges',
  uncommon: 'deep navy blue frame, silver-blue filigree patterns, soft cyan inner glow along the border',
  rare:     'rich golden frame, ornate fossil-bone filigree in corners, glowing amber gems inlaid, premium golden aura',
};

const TYPE_BANNER: Record<string, string> = {
  attack: 'crimson red banner labeled ATTACCO with a sword icon on the left',
  skill:  'sapphire blue banner labeled ABILITÀ with a shield icon on the left',
  power:  'amber gold banner labeled POTERE with a star/sparkle icon on the left',
};

// ---------------------------------------------------------------------------
// Effect text builder (Italian, concise and readable)
// ---------------------------------------------------------------------------

const STATUS_IT: Record<string, string> = {
  strength:    'Forza',
  weak:        'Debole',
  vulnerable:  'Vulnerabile',
  poison:      'Veleno',
  vigor:       'Vigore',
  thorns:      'Spine',
  regen:       'Rigenerazione',
  frail:       'Fragile',
  burn:        'Bruciatura',
};

function statusName(key: string): string {
  return STATUS_IT[key] ?? capitalize(key);
}

function effectText(effects: CardEffect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    const allEnemies = e.target === 'all_enemies';
    if (e.kind === 'damage' && typeof e.amount === 'number') {
      parts.push(allEnemies ? `Infliggi ${e.amount} danni a tutti i nemici` : `Infliggi ${e.amount} danni`);
    } else if (e.kind === 'block' && typeof e.amount === 'number') {
      parts.push(`Guadagna ${e.amount} Blocco`);
    } else if (e.kind === 'draw' && e.n) {
      parts.push(`Pesca ${e.n} ${e.n === 1 ? 'carta' : 'carte'}`);
    } else if (e.kind === 'applyStatus' && e.stacks && e.status) {
      const target = e.target === 'self' ? 'a te stesso' : allEnemies ? 'a tutti i nemici' : 'al nemico';
      parts.push(`Applica ${e.stacks} ${statusName(e.status)} ${target}`);
    } else if (e.kind === 'exhaust') {
      parts.push('Esaurisci');
    } else if (e.kind === 'gainEnergy' && e.n) {
      parts.push(`+${e.n} Energia`);
    } else if (e.kind === 'heal' && typeof e.amount === 'number') {
      parts.push(`Cura ${e.amount} HP`);
    }
  }
  return parts.join('. ') + '.';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Full-card prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(card: CardData, hero: string): string {
  const frame    = RARITY_FRAME[card.rarity] ?? RARITY_FRAME.common;
  const typeBnr  = TYPE_BANNER[card.type] ?? TYPE_BANNER.skill;
  const cost     = card.cost === 'X' ? 'X' : String(card.cost);
  const effText  = effectText(card.effects);
  const flavor   = card.flavorIt ? card.flavorIt.slice(0, 80) : null;
  const heroDesc = HERO_DINO[hero] ?? HERO_DINO.borea;
  const scene    = CARD_SCENES[card.id] ?? 'the dinosaur in a powerful combat stance, dramatic action pose';
  const cardName = card.name.it;

  const flavorLine = flavor
    ? `At the very bottom of the card, below a thin horizontal separator, a small italicized flavor quote: "${flavor}"`
    : '';

  return [
    `A professional fantasy trading card game card. Portrait orientation, 3:4 aspect ratio. Hearthstone visual quality.`,

    `The card frame uses ${frame} styling and surrounds the entire card.`,

    `At the top of the card, three elements appear side by side on a single row: on the left a circular gem badge with the bold number "${cost}" in white (the energy cost); in the center a stone nameplate with the card title "${cardName}" in large bold fantasy serif lettering (Cinzel style), clearly legible; on the right a small rounded badge reading "${card.rarity.toUpperCase()}" in the frame's accent color.`,

    `The central illustration occupies roughly half the card height. It shows: ${heroDesc}. Scene: ${scene}. Dramatic chiaroscuro lighting, dark background, painterly digital art style. The dinosaur is the dominant visual focus.`,

    `Immediately below the illustration, a full-width banner ribbon in ${typeBnr} style marks the card type.`,

    `Below that ribbon, a text box with a dark parchment-brown textured background displays in large legible fantasy font the following words and nothing else: "${effText}"`,

    flavorLine,

    `Important rules: do not add any label, heading, keyword, or extra word beyond those listed above. The only text on the card is the card title "${cardName}", the cost number "${cost}", the rarity word "${card.rarity.toUpperCase()}", the type ribbon text, the effect sentence "${effText}"${flavor ? `, and the flavor quote "${flavor}"` : ''}. No other text, no watermarks, no lorem ipsum, no placeholder labels. Painterly digital art, dark palette (obsidian, volcanic amber, warm gold, stone grey). All text must be sharp and fully legible.`,
  ].filter(Boolean).join('\n\n');
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
    console.error('Set GEMINI_API_KEY env var (or use --dry-run)');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const cardFile = path.join(process.cwd(), 'src', 'data', 'cards', 'act1', `${HERO}.json`);
  if (!fs.existsSync(cardFile)) {
    console.error(`Card file not found: ${cardFile}`);
    process.exit(1);
  }

  let cards = JSON.parse(fs.readFileSync(cardFile, 'utf-8')) as CardData[];

  if (ONLY) {
    cards = cards.filter((c) => ONLY.includes(c.id));
    console.log(`\nFiltered to: ${cards.map((c) => c.id).join(', ')}`);
  }

  // Sort: starter → common → uncommon → rare (cheaper to generate simpler cards first)
  const rarityOrder = { starter: 0, common: 1, uncommon: 2, rare: 3 };
  cards.sort((a, b) => (rarityOrder[a.rarity] ?? 1) - (rarityOrder[b.rarity] ?? 1));

  console.log(`\n  Generating ${cards.length} cards for hero: ${HERO}\n`);
  let generated = 0, skipped = 0, failed = 0;

  for (const card of cards) {
    const outPath = path.join(OUT_DIR, `${card.id}.png`);

    if (fs.existsSync(outPath) && !REGEN) {
      console.log(`  SKIP  ${card.id} (already exists)`);
      skipped++;
      continue;
    }

    const prompt = buildPrompt(card, HERO!);

    if (DRY_RUN) {
      console.log(`\n  [DRY] ${card.id} — ${card.name.it}\n${prompt.slice(0, 200)}…\n`);
      continue;
    }

    process.stdout.write(`  GEN   ${card.id} (${card.name.it})…`);

    try {
      const buf = await callImagen(prompt);
      if (!buf) {
        console.log('  WARNING: no image returned');
        failed++;
      } else {
        fs.writeFileSync(outPath, buf);
        console.log(` OK`);
        generated++;
      }
    } catch (err) {
      console.log(`  ERROR: ${(err as Error).message}`);
      failed++;
    }

    if (generated + failed < cards.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n  Done. Generated: ${generated}  Failed: ${failed}  Skipped: ${skipped}`);
  console.log(`  Output: ${OUT_DIR}\n`);
}

main().catch(console.error);
