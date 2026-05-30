#!/usr/bin/env tsx
// scripts/generate-arena-backgrounds.ts
// Generates 6 atmospheric arena backgrounds for DinoSpire combat screen.
//
// Usage:
//   GEMINI_API_KEY=<key> tsx scripts/generate-arena-backgrounds.ts          # all backgrounds
//   GEMINI_API_KEY=<key> tsx scripts/generate-arena-backgrounds.ts --regen  # overwrite existing
//   tsx scripts/generate-arena-backgrounds.ts --dry-run                     # show prompts only

/// <reference path="./node-env.d.ts" />

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY  = process.env.GEMINI_API_KEY;
const MODEL    = 'imagen-4.0-fast-generate-001';
const OUT_DIR  = path.join(process.cwd(), 'public', 'art', 'backgrounds');
const RATIO    = '16:9' as const;

// Imagen 4 Fast → ~10 req/min free tier. 7s gap keeps us safe.
const DELAY_MS = 7000;

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REGEN   = args.includes('--regen');

// ---------------------------------------------------------------------------
// Background definitions
// ---------------------------------------------------------------------------

interface Background {
  id:     string;
  label:  string;
  prompt: string;
}

// Shared suffix: keeps all backgrounds tonally consistent as game backdrops.
// Dark vignette + desaturated palette ensures UI elements remain readable.
const BG_STYLE = [
  'Matte painting style, cinematic quality, concept art.',
  'Color treatment: deeply desaturated, dark atmospheric palette.',
  'Vignette: strong dark gradient on all four edges fading to near-black.',
  'Mood: foreboding, prehistoric, oppressive scale.',
  'Suitable as a full-screen game combat background — content in foreground must remain readable.',
  'NO characters, NO dinosaurs, NO UI, NO text, NO watermarks.',
  'Full bleed to edges. Wide landscape 16:9.',
].join(' ');

const BACKGROUNDS: Background[] = [
  {
    id:    'arena_forest',
    label: 'Cretaceous Forest',
    prompt: [
      'Dark prehistoric jungle at dusk, dense cretaceous forest.',
      'Massive ancient ferns, giant cycads, towering conifer trunks disappearing into fog.',
      'Shafts of fading amber light pierce the canopy, heavy mist on the forest floor.',
      'Atmosphere: humid, oppressive, ancient — the air feels thick with moisture and age.',
      BG_STYLE,
    ].join(' '),
  },
  {
    id:    'arena_volcano',
    label: 'Volcanic Wasteland',
    prompt: [
      'Active prehistoric volcanic landscape at night.',
      'Distant erupting volcano silhouetted against a blood-red sky, rivers of slow lava far in the background.',
      'Foreground: cracked obsidian ground, glowing fissures of magma, drifting ash and cinder.',
      'Atmosphere: hellish, scorched earth, sulfurous haze, ember wisps floating upward.',
      BG_STYLE,
    ].join(' '),
  },
  {
    id:    'arena_swamp',
    label: 'Prehistoric Swamp',
    prompt: [
      'Dark prehistoric swamp at dusk.',
      'Murky stagnant water reflecting a bruised purple sky, dead tree trunks rising from the mire.',
      'Dense low fog rolling across the water surface, hanging Spanish moss, rotting vegetation.',
      'Atmosphere: eerie silence, decay, the sense of something lurking beneath the surface.',
      BG_STYLE,
    ].join(' '),
  },
  {
    id:    'arena_savanna',
    label: 'Storm Savanna',
    prompt: [
      'Open prehistoric savanna under a dramatic storm.',
      'Vast flat plain stretching to the horizon, dead twisted trees silhouetted against churning storm clouds.',
      'Forked lightning in the distant sky, dry grass, cracked earth.',
      'Atmosphere: isolation, scale, imminent violence of nature.',
      BG_STYLE,
    ].join(' '),
  },
  {
    id:    'arena_cave',
    label: 'Ancient Cave',
    prompt: [
      'Interior of a vast ancient cave, looking deeper into darkness.',
      'Massive stalactites hanging from an unseen ceiling, clusters of faintly bioluminescent moss on cave walls.',
      'Deep blue-green bioluminescence, pools of still black water on the cave floor.',
      'Atmosphere: claustrophobic yet vast, ancient geological time, alien quiet.',
      BG_STYLE,
    ].join(' '),
  },
  {
    id:    'arena_coast',
    label: 'Jurassic Coastline',
    prompt: [
      'Dramatic Jurassic sea cliff coastline during a storm.',
      'Towering dark rock cliffs plunging into a violent grey-green ocean, massive waves crashing.',
      'Stormy overcast sky with breaks of dim light on the horizon, sea spray, dark rock formations.',
      'Atmosphere: raw power of nature, isolation, the edge of the known world.',
      BG_STYLE,
    ].join(' '),
  },
];

// ---------------------------------------------------------------------------
// Imagen 4 API call
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
        sampleCount:       1,
        aspectRatio:       RATIO,
        safetyFilterLevel: 'block_some',
        personGeneration:  'dont_allow',
        outputMimeType:    'image/png',
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
    console.error('Set GEMINI_API_KEY before running.');
    process.exit(1);
  }

  let targets = [...BACKGROUNDS];

  // Skip existing unless --regen
  if (!REGEN && !DRY_RUN) {
    targets = targets.filter((bg) => {
      const outPath = path.join(OUT_DIR, `${bg.id}.png`);
      if (fs.existsSync(outPath)) {
        console.log(`  skip  ${bg.id} — already exists`);
        return false;
      }
      return true;
    });
  }

  const total  = targets.length;
  const estMin = Math.ceil((total * DELAY_MS) / 60000);
  console.log(`\nImagen 4 Fast — ${total} backgrounds to generate (~${estMin} min)\n`);
  if (DRY_RUN) console.log('  (dry-run — no API calls)\n');

  let ok = 0, fail = 0;

  for (let i = 0; i < targets.length; i++) {
    const bg = targets[i]!;

    if (DRY_RUN) {
      console.log(`[${i + 1}/${total}] ${bg.id} — "${bg.label}"`);
      console.log(`  Prompt (${bg.prompt.length} chars): ${bg.prompt.slice(0, 120)}…\n`);
      continue;
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`  [${i + 1}/${total}] ${bg.id} (${RATIO})…`);

    try {
      const buf = await callImagen(bg.prompt);
      if (buf) {
        fs.writeFileSync(path.join(OUT_DIR, `${bg.id}.png`), buf);
        console.log(`  ok    ${bg.id}.png`);
        ok++;
      } else {
        console.warn(`  warn  no data returned for ${bg.id}`);
        fail++;
      }
    } catch (err) {
      console.error(`  err   ${bg.id}:`, err instanceof Error ? err.message : err);
      fail++;
    }

    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (!DRY_RUN) {
    console.log(`\nDone — ok: ${ok}, failed: ${fail}`);
    console.log(`Output: ${OUT_DIR}/`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
