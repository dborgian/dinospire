#!/usr/bin/env tsx
// scripts/generate-relics.ts
// Generates icon-style PNGs for relics (1:1 ratio, 512x512).
// Used by the HUD <RelicBar /> if/when we move beyond Lucide vector icons.
//
// Usage:
//   GEMINI_API_KEY=<key> npx tsx scripts/generate-relics.ts
//   GEMINI_API_KEY=<key> npx tsx scripts/generate-relics.ts --regen
//   GEMINI_API_KEY=<key> npx tsx scripts/generate-relics.ts --only zanna_del_re,uovo_del_primo
//   npx tsx scripts/generate-relics.ts --dry-run

/// <reference path="./node-env.d.ts" />

import * as fs from 'fs';
import * as path from 'path';

const API_KEY  = process.env.GEMINI_API_KEY;
const MODEL    = 'imagen-4.0-fast-generate-001';
const OUT_DIR  = path.join(process.cwd(), 'public', 'art', 'relics');
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
// Relic visual descriptions
// ---------------------------------------------------------------------------

interface RelicEntry {
  subject: string;
  tier: 'starter' | 'common' | 'uncommon' | 'rare' | 'ancestral';
}

const RELIC_DESC: Record<string, RelicEntry> = {
  dente_spezzato: {
    subject: 'a single broken predator tooth, chipped and yellowed with age, bound with crude leather cord at the root',
    tier: 'starter',
  },
  piuma_antica: {
    subject: 'a long iridescent feather from an ancient flying reptile, deep teal fading to bronze, slightly tattered at the tip',
    tier: 'starter',
  },
  scaglia_madre: {
    subject: 'a thick overlapping dinosaur scale plate, jade green with golden veining, edges still glistening with primordial moisture',
    tier: 'starter',
  },
  ambra_predatoria: {
    subject: 'a chunk of polished amber the size of a fist, with a perfectly preserved predator claw frozen inside, internal glow softly pulsing',
    tier: 'common',
  },
  cuore_di_pietra: {
    subject: 'a fossilised dinosaur heart turned to dark obsidian stone, faintly cracked with veins of pulsing red embers visible inside',
    tier: 'common',
  },
  cranio_fossile: {
    subject: 'a small predator skull fossil, weathered ivory with empty eye sockets, intricately preserved teeth, mounted on a flat dark stone base',
    tier: 'uncommon',
  },
  zanna_del_re: {
    subject: 'a massive curved theropod king-tooth crowned with a tiny golden filigree ring, blood-red enamel and razor edge, regal and sinister',
    tier: 'rare',
  },
  pelle_resistente: {
    subject: 'a swatch of thick scaled dinosaur hide tanned to dark leather, mottled green-brown, edges sealed with bronze rivets',
    tier: 'uncommon',
  },
  uovo_del_primo: {
    subject: 'an enormous ancestral dinosaur egg with cracked porcelain-like shell revealing a pulsing fuchsia glow within, the first of its kind',
    tier: 'ancestral',
  },
  lacrima_triassica: {
    subject: 'a single perfect tear-shaped crystal of triassic resin suspended on a delicate silver chain, glowing with electric-blue inner light',
    tier: 'ancestral',
  },
};

// ---------------------------------------------------------------------------
// Prompt builder — icon-style, no text
// ---------------------------------------------------------------------------

function tierAura(tier: RelicEntry['tier']): string {
  switch (tier) {
    case 'starter':   return 'subtle warm grey halo';
    case 'common':    return 'soft cream-coloured halo';
    case 'uncommon':  return 'bright electric-blue magical halo with floating motes';
    case 'rare':      return 'brilliant gold-orange magical halo with sparkling embers';
    case 'ancestral': return 'intense fuchsia-violet primordial aura with swirling cosmic particles';
  }
}

function buildPrompt(id: string): string {
  const entry = RELIC_DESC[id];
  if (!entry) throw new Error(`No description for relic: ${id}`);
  const { subject, tier } = entry;

  return [
    `A high-fidelity fantasy game relic icon, square 1:1 aspect ratio, centered single object on a clean circular gradient backdrop. Painterly Hearthstone-quality illustration style.`,

    `Subject: ${subject}. The object fills 70% of the frame, perfectly centered, slightly angled to show dimensionality.`,

    `Lighting: a strong key light from the upper-left creating dramatic shadow and rim highlights on the object. Materials feel tangible — bone, scale, amber, fossil all reading clearly.`,

    `Background: a soft circular gradient — dark stone-charcoal at the edges fading to a ${tierAura(tier)} centered behind the object. No environment, no scenery, no characters.`,

    `Color treatment: rich saturated subject colors against the muted backdrop. The relic must read as a clear silhouette at small icon size.`,

    `Style: painterly digital illustration, slightly stylised, glossy highlights, soft brushwork on background, sharp brushwork on the relic itself.`,

    `Important rules: no text whatsoever, no labels, no numbers, no card frame, no border, no watermark, no characters or hands holding the relic. Pure icon-style hero shot of the object only.`,
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
        aspectRatio: '1:1',
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

const RELIC_IDS = Object.keys(RELIC_DESC);

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let ids = ONLY ? RELIC_IDS.filter((id) => ONLY.includes(id)) : RELIC_IDS;
  if (ONLY && ids.length === 0) {
    console.error(`No relics matched: ${ONLY.join(', ')}`);
    process.exit(1);
  }

  if (!REGEN) {
    ids = ids.filter((id) => !fs.existsSync(path.join(OUT_DIR, `${id}.png`)));
  }

  console.log(`\n  Generating ${ids.length} relic icons\n`);

  let generated = 0;
  let failed = 0;

  for (const id of ids) {
    const outPath = path.join(OUT_DIR, `${id}.png`);
    const prompt = buildPrompt(id);

    if (DRY_RUN) {
      console.log(`  DRY   ${id}\n---\n${prompt}\n---\n`);
      continue;
    }

    process.stdout.write(`  ${id.padEnd(28)}`);

    const buf = await callImagen(prompt);
    if (!buf) {
      console.log('FAILED');
      failed++;
      continue;
    }

    fs.writeFileSync(outPath, buf);
    const kb = (buf.length / 1024).toFixed(0);
    console.log(`OK (${kb} KB)`);
    generated++;

    if (ids.indexOf(id) < ids.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n  Done: ${generated} generated, ${failed} failed\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
