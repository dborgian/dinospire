#!/usr/bin/env tsx
// scripts/generate-enemies.ts
// Generates pure illustration images for each enemy in enemies_act1.json.
// No text, no UI elements — the game engine overlays stats and intent.
//
// Usage:
//   GEMINI_API_KEY=<key> npx tsx scripts/generate-enemies.ts
//   GEMINI_API_KEY=<key> npx tsx scripts/generate-enemies.ts --regen
//   GEMINI_API_KEY=<key> npx tsx scripts/generate-enemies.ts --only compy_sciame,dilophosaurus
//   npx tsx scripts/generate-enemies.ts --dry-run

/// <reference path="./node-env.d.ts" />

import * as fs from 'fs';
import * as path from 'path';

const API_KEY  = process.env.GEMINI_API_KEY;
const MODEL    = 'imagen-4.0-fast-generate-001';
const OUT_DIR  = path.join(process.cwd(), 'public', 'art', 'enemies');
const DELAY_MS = 8000;

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const REGEN    = args.includes('--regen');
const ONLY_IDX = args.indexOf('--only');
const ONLY_VAL = ONLY_IDX >= 0 ? args[ONLY_IDX + 1] : undefined;
const ONLY     = ONLY_VAL ? ONLY_VAL.split(',') : null;

if (ONLY_IDX >= 0 && !ONLY_VAL) { console.error('Usage: --only <id1,id2,...>'); process.exit(1); }
if (!DRY_RUN && !API_KEY) { console.error('Set GEMINI_API_KEY'); process.exit(1); }

// ---------------------------------------------------------------------------
// Enemy visual descriptions
// ---------------------------------------------------------------------------

interface EnemyEntry {
  dino: string;
  scene: string;
  /** Optional short trait shown as a small italic label at the bottom of the image. Max 40 chars. */
  traitLabel?: string;
}

const ENEMY_DESC: Record<string, EnemyEntry> = {
  compy_sciame: {
    dino: 'A swarm of eight to twelve Compsognathus dinosaurs — small, agile, chicken-sized bipedal carnivores with olive-green scales, long thin necks, sharp tiny teeth, bright amber eyes, and whip-like tails',
    scene: 'The swarm surges forward as a chaotic wave across cracked volcanic rock, mouths open and snapping, legs a blur of motion, amber eyes gleaming in the lava-lit darkness of a prehistoric cave',
  },
  dilophosaurus: {
    dino: 'A Dilophosaurus — a slender mid-sized carnivorous dinosaur with two bony parallel crests on its skull, iridescent teal-green scales fading to cream on the throat, a fan-like frill that flares open when threatened, and twin poison glands behind its jaw',
    scene: 'The Dilophosaurus rears back on its hind legs, crests flaring bright crimson, a luminescent yellow-green venom arc spraying forward from its open jaws, throat frill fully extended, against a misty jungle background with bioluminescent foliage',
    traitLabel: 'Predatore Velenoso',
  },
  pachycephalosaurus: {
    dino: 'A Pachycephalosaurus — a robust bipedal herbivore with a massively thick domed skull of solid bone, grey-brown pebbly skin, short powerful arms, and a stout muscular body built like a living battering ram',
    scene: 'The Pachycephalosaurus lowers its massive domed head and charges, hooves leaving craters in the earth, neck muscles tensed, a cloud of dust and broken rock exploding around its feet as it accelerates across a sun-baked prehistoric plain',
    traitLabel: 'Telegrafato',
  },
  triceratops_giovane: {
    dino: 'A juvenile Triceratops — smaller than an adult but still imposing, with three sharp horns not yet fully grown, a wide bony neck frill edged with orange and red spots, dusty brown skin with lighter underbelly, and determined dark eyes',
    scene: 'The young Triceratops plants all four legs firmly in the red clay soil, neck frill spread wide, the three horns catching the afternoon light, snorting a cloud of breath into the cool air as it holds a defensive stance in a sparse prehistoric forest clearing',
    traitLabel: 'Corazzato',
  },
  utahraptor_coppia: {
    dino: 'Two Utahraptors — large feathered raptors the size of a bear, with dark charcoal-grey feathers tipped electric blue, deadly sickle-shaped killing claws on each foot raised mid-stride, and bright intelligent yellow eyes that move in perfect coordination',
    scene: 'The pair of Utahraptors flank from both sides simultaneously, one leaping from the left with claws extended and the other crouching low from the right, their feathers ruffled and electric-blue tips glowing, set against the amber glow of a volcanic sunset',
    traitLabel: 'Caccia in Coppia',
  },
  carnotaurus_boss: {
    dino: 'A massive Carnotaurus — a heavily built theropod with two thick bull-like horns above its eyes, jet-black scales with deep crimson banding along the flanks, tiny vestigial arms, a barrel-thick neck, and burning red eyes that glow like embers in the dark',
    scene: 'The Carnotaurus steps forward from absolute darkness, only its glowing red eyes and the outline of its horns visible at first, the ground cracking under each footfall, heat shimmering around its body as if the very air burns near it — a true apex predator revealing itself from the shadows of a ruined volcanic arena',
    traitLabel: 'Boss — Predatore Furtivo',
  },
};

// ---------------------------------------------------------------------------
// Prompt builder — pure illustration, absolutely no text
// ---------------------------------------------------------------------------

function buildPrompt(id: string): string {
  const entry = ENEMY_DESC[id];
  if (!entry) throw new Error(`No description for enemy: ${id}`);
  const { dino, scene, traitLabel } = entry;
  const isBoss = id.includes('boss');

  const traitLine = traitLabel
    ? `At the very bottom of the image, a narrow dark parchment strip spanning the full width contains only this short italicized label in legible fantasy serif font: "${traitLabel}". No other text appears on the image.`
    : `The image contains no text, no labels, no numbers — pure illustration only.`;

  return [
    `A dramatic full-bleed digital painting for a fantasy card game, portrait orientation (2:3 aspect ratio). Painterly Hearthstone-quality illustration style.`,

    `Subject: ${dino}.`,

    `Scene: ${scene}.`,

    isBoss
      ? `This is a boss encounter — the image must feel overwhelming and cinematic. Use a wider dramatic angle, more intense atmospheric lighting, and a sense of scale that dwarfs the viewer.`
      : `The dinosaur fills most of the frame, centered and imposing, with a dynamic action pose that conveys its nature.`,

    `Lighting: dramatic chiaroscuro — deep shadows, one strong directional light source (volcanic amber, bioluminescent blue, or harsh midday sun depending on the scene). Rich contrast, painterly brushwork.`,

    `Color palette: dark and atmospheric — obsidian blacks, volcanic amber, deep forest greens, volcanic reds, bone white accents. The dinosaur's colors stand out from the dark background.`,

    traitLine,

    `Important rules: no health bars, no damage numbers, no move descriptions, no HP values, no card frame borders, no watermarks, no random text or letters. ${traitLabel ? `The only text allowed is the label "${traitLabel}" at the very bottom in the parchment strip.` : 'No text of any kind.'}`,
  ].join('\n\n');
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
        aspectRatio: '2:3',
        outputMimeType: 'image/png',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`\n  API error ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const data = (await res.json()) as ImagenResponse;
  if (data.error) {
    console.error(`\n  API error: ${data.error.message}`);
    return null;
  }

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) return null;
  return Buffer.from(b64, 'base64');
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ENEMY_IDS = Object.keys(ENEMY_DESC);

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let ids = ONLY ? ENEMY_IDS.filter((id) => ONLY.includes(id)) : ENEMY_IDS;
  if (ONLY && ids.length === 0) {
    console.error(`No enemies matched: ${ONLY.join(', ')}`);
    process.exit(1);
  }

  // Skip already-generated unless --regen
  if (!REGEN) {
    ids = ids.filter((id) => !fs.existsSync(path.join(OUT_DIR, `${id}.png`)));
  }

  console.log(`\n  Generating ${ids.length} enemy images\n`);

  let generated = 0;
  let failed = 0;

  for (const id of ids) {
    const outPath = path.join(OUT_DIR, `${id}.png`);
    const prompt = buildPrompt(id);

    if (DRY_RUN) {
      console.log(`  DRY   ${id}\n---\n${prompt}\n---\n`);
      continue;
    }

    process.stdout.write(`  GEN   ${id}…`);

    const buf = await callImagen(prompt);
    if (buf) {
      fs.writeFileSync(outPath, buf);
      console.log(` OK`);
      generated++;
    } else {
      console.log(` FAIL`);
      failed++;
    }

    if (generated + failed < ids.length) await sleep(DELAY_MS);
  }

  console.log(`\n  Done. Generated: ${generated}  Failed: ${failed}`);
  console.log(`  Output: ${OUT_DIR}\n`);
}

void main();
