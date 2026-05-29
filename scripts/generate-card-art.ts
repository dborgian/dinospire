#!/usr/bin/env tsx
// scripts/generate-card-art.ts
// Generates art for ALL game assets: cards, enemies, heroes, relics.
//
// Usage:
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts                     # all assets
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts --type cards        # only cards
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts --type enemies      # only enemies
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts --type heroes       # only heroes
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts --type relics       # only relics
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts --id morso_r        # single asset
//   GEMINI_API_KEY=<key> tsx scripts/generate-card-art.ts --regen             # overwrite all
//   tsx scripts/generate-card-art.ts --dry-run                                # show prompts

/// <reference path="./node-env.d.ts" />

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY      = process.env.GEMINI_API_KEY;
const MODEL        = 'imagen-4.0-fast-generate-001';
const OUT_BASE     = path.join(process.cwd(), 'public', 'art');

// Imagen 4 aspect ratios by asset type
const RATIOS = {
  cards:   '3:4'  as const,   // portrait — card frame 2:3
  enemies: '3:4'  as const,   // portrait — combat area (top of screen)
  heroes:  '3:4'  as const,   // portrait — character select
  relics:  '1:1'  as const,   // square   — icon/badge
} satisfies Record<string, '1:1' | '3:4' | '4:3' | '9:16' | '16:9'>;

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const REGEN     = args.includes('--regen');
const SINGLE_ID = args.includes('--id')   ? args[args.indexOf('--id')   + 1] : null;
const ONLY_TYPE = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;

// Imagen 4 Fast → ~10 req/min free tier. 7s gap keeps us safe.
const DELAY_MS  = 7000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface ArtAsset {
  id:     string;
  name:   string;
  type:   'cards' | 'enemies' | 'heroes' | 'relics';
  prompt: string;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

// ---- Shared style block used in all prompts --------------------------------
const STYLE_SUFFIX = [
  'Art style: painterly digital illustration, Hearthstone / Slay-the-Spire quality.',
  'Color palette: obsidian black, volcanic amber, warm gold.',
  'Lighting: dramatic chiaroscuro — bright amber rim light, deep ink shadows.',
  'Background: volcanic obsidian cavern, amber ember wisps, fossil fragments in stone walls.',
  'NO text. NO UI. NO card border. NO watermarks. Full bleed to edges. Cinematic quality.',
].join(' ');

// ---- CARD prompts ----------------------------------------------------------

interface CardData {
  id: string;
  name: { it: string };
  type: 'attack' | 'skill' | 'power';
  rarity: string;
  tags?: string[];
  effects: Array<{ kind: string; amount?: number | object; n?: number; stacks?: number; status?: string; target?: string }>;
  hero?: string;
  flavorIt?: string;
}

const CARD_HERO: Record<string, string> = {
  rex:    'Tyrannosaurus Rex — massive bipedal predator, tiny arms, enormous jaws, volcanic red and charcoal scales',
  veloce: 'Deinonychus raptor — agile, large sickle claws, feathered, emerald green and midnight black',
  borea:  'Borealopelta ankylosaur — quadrupedal, thick osteoderms, earth-brown rocky armor, tail club',
};

const CARD_MOOD: Record<string, string> = {
  attack: 'fierce aggressive action shot — mid-strike, jaws open, claws extended, motion blur on impact, shockwave explosion',
  skill:  'composed tactical stance — focused glow around limbs, calm strategic energy, deliberate motion',
  power:  'transcendent awakening — ancient primal energy radiating outward, glowing runes, amber god-rays, epic scale',
};

const CARD_RARITY_LIGHT: Record<string, string> = {
  starter:  'simple amber rim light',
  common:   'warm amber fill light, clean stone-gray ambient',
  uncommon: 'cool sapphire accent + warm amber highlight, dual-tone',
  rare:     'dramatic golden volumetric god-rays, particle sparkles, premium metallic sheen',
};

const CARD_EFFECT_VISUAL: Record<string, string> = {
  damage:      'kinetic impact shockwave, ground cracking, debris flying',
  block:       'crystalline force-field materializing, protective aura shield',
  draw:        'glowing card vortex in background, arcane swirl',
  gainEnergy:  'amber lightning crackling, floating energy orbs',
  heal:        'emerald healing particles rising upward, warm glow',
  applyStatus: 'swirling status aura (poison=green mist, strength=red surge, vulnerable=red cracks, weak=shadow drain)',
  exhaust:     'card dissolving into ash and glowing embers',
  addCardToDeck: 'new card materializing from light',
};

function buildCardPrompt(card: CardData): string {
  const hero    = card.hero ? CARD_HERO[card.hero] ?? 'prehistoric dinosaur' : 'prehistoric dinosaur';
  const mood    = CARD_MOOD[card.type] ?? CARD_MOOD.skill;
  const light   = CARD_RARITY_LIGHT[card.rarity] ?? CARD_RARITY_LIGHT.common;
  const effKind = card.effects[0]?.kind ?? '';
  const effViz  = CARD_EFFECT_VISUAL[effKind] ?? '';
  const flavor  = card.flavorIt ? `Flavor: "${card.flavorIt.slice(0, 70)}".` : '';
  const tagStr  = (card.tags ?? [])
    .filter((t) => ['branco','mandria','predatore','veleno','theropode','ankylosauro'].includes(t))
    .join(', ');

  return [
    `Fantasy dinosaur deckbuilder card art — ${card.type} card, ${card.rarity} rarity.`,
    `Subject: ${hero}.`,
    `Scene: ${mood}.`,
    effViz ? `Visual effect in foreground: ${effViz}.` : '',
    tagStr ? `Thematic context: ${tagStr}.` : '',
    flavor,
    `Lighting: ${light}.`,
    `Composition: subject centered, fills 75% of frame, slight heroic low-angle.`,
    `Portrait 3:4 artwork (840×1120px target).`,
    STYLE_SUFFIX,
  ].filter(Boolean).join(' ');
}

// ---- ENEMY prompts ---------------------------------------------------------

interface EnemyData {
  id: string;
  name: { it: string };
  taxonGroup: string;
  diet: string;
  hp: number;
  tier: 'normal' | 'elite' | 'boss';
  moves: Array<{ intent: { type: string; description: string } }>;
}

const ENEMY_SPECIES: Record<string, string> = {
  compy_sciame:         'pack of tiny Compsognathus, no larger than chickens, dozens of them swarming, sharp little teeth',
  dilophosaurus:        'Dilophosaurus with double crests on skull, slender build, toxic green frills flared, venomous spit',
  pachycephalosaurus:   'Pachycephalosaurus with dome-shaped skull, bipedal, charging headbutt pose',
  triceratops_giovane:  'juvenile Triceratops, three horns not fully grown, frill with red markings, defensive crouch',
  utahraptor_coppia:    'pair of Utahraptors flanking, coordinated pack hunters, large sickle claws, feathered',
  carnotaurus_boss:     'Carnotaurus with bull-like horns, massive muscular build, dark charcoal scales with red underbelly, terrifying apex predator, boss aura',
};

const ENEMY_TIER_TREATMENT: Record<string, string> = {
  normal: 'mid-distance portrait, neutral aggressive stance, standard combat lighting',
  elite:  'dramatic low-angle, glowing eyes, scars and battle marks, intense amber spotlight',
  boss:   'full epic reveal, towering presence fills the frame, ominous dark red lighting, ground cracking under weight, death aura, ultra-dramatic',
};

function buildEnemyPrompt(enemy: EnemyData): string {
  const species  = ENEMY_SPECIES[enemy.id] ?? `${enemy.taxonGroup} dinosaur, ${enemy.diet}`;
  const tier     = ENEMY_TIER_TREATMENT[enemy.tier] ?? ENEMY_TIER_TREATMENT.normal;
  const mainMove = enemy.moves[0]?.intent.description ?? '';

  return [
    `Fantasy dinosaur enemy character art — ${enemy.tier} tier enemy.`,
    `Subject: ${species}.`,
    `Stance: combat-ready, facing viewer menacingly. ${tier}.`,
    mainMove ? `Telegraphing action: ${mainMove}.` : '',
    `HP: ${enemy.hp} — visual weight should reflect this (${enemy.hp < 20 ? 'small and numerous' : enemy.hp < 50 ? 'medium threat' : 'hulking and imposing'}).`,
    `Portrait 3:4 (840×1120px). Subject fills 80% of frame.`,
    STYLE_SUFFIX,
  ].filter(Boolean).join(' ');
}

// ---- HERO prompts ----------------------------------------------------------

interface HeroData {
  id: string;
  name: { it: string };
  taxonGroup: string;
  diet: string;
  era: string;
  stages: Record<string, { hp: number; passiveDescription: string }>;
}

const HERO_SPECIES: Record<string, string> = {
  rex:    'Tyrannosaurus Rex — the apex predator, bipedal, tiny arms, enormous skull with rows of serrated teeth, volcanic red and dark charcoal scales, battle-scarred, regal and terrifying',
  veloce: 'Deinonychus — intelligent raptor, large hand-sickle claw raised, feathered in deep emerald with midnight black stripes, cunning eyes, agile hunting pose',
  borea:  'Borealopelta ankylosaur — living fortress, quadrupedal, covered head-to-tail in osteoderms and armor plates, tail club ready, earth-brown and stone-grey, unbreakable',
};

const HERO_STAGE_CONTEXT: Record<string, string> = {
  cucciolo: 'young juvenile — smaller, bright fresh scales, eager expression, full of untapped potential, slight glow of awakening power',
  adulto:   'mature adult — battle-worn, scars, confident dominant stance, glowing energy patterns in scales, peak physical form',
  prime:    'transcendent Prime form — larger than natural, scales gleaming with ancient power, energy runes floating around body, eyes glowing amber, godlike dinosaur champion',
};

function buildHeroPrompt(hero: HeroData, stage: string): string {
  const species     = HERO_SPECIES[hero.id] ?? `${hero.taxonGroup} dinosaur hero`;
  const stageCtx    = HERO_STAGE_CONTEXT[stage] ?? '';
  const stageData   = hero.stages[stage];
  const passive     = stageData?.passiveDescription.slice(0, 80) ?? '';

  return [
    `Fantasy dinosaur hero character art — ${stage} evolution stage.`,
    `Character: ${species}.`,
    `Stage context: ${stageCtx}.`,
    `Passive hint: "${passive}".`,
    `Pose: heroic three-quarter stance, slight upward gaze, dominant presence.`,
    `Lighting: strong amber rim light from behind (backlight halo), cool fill from front.`,
    `Portrait 3:4 (840×1120px). Character fills 85% of frame, ground visible at feet.`,
    STYLE_SUFFIX,
  ].filter(Boolean).join(' ');
}

// ---- RELIC prompts ---------------------------------------------------------

interface RelicData {
  id: string;
  name: { it: string };
  description: string;
  tier: string;
  trigger: string;
}

const RELIC_VISUAL: Record<string, string> = {
  dente_spezzato:   'a single cracked dinosaur tooth, amber-encrusted, glowing faint red, floating on dark velvet',
  piuma_antica:     'an ancient iridescent feather from a raptor, preserved in amber, magical shimmer',
  scaglia_madre:    'a large armored scute/scale, moss-covered, ancient runes etched in stone-grey surface',
  ambra_predatoria: 'a fist-sized chunk of amber with a prehistoric insect trapped inside, glowing deep orange',
  cuore_di_pietra:  'a stylized stone heart, cracked with glowing magma veins, pulsing amber light',
  cranio_fossile:   'a small fossilized dinosaur skull, crystallized, gem-like quality, on a worn leather cord',
  zanna_del_re:     'an enormous curved carnivore fang, silver-tipped, wrapped in red cord, floating with energy',
  pelle_resistente: 'a piece of thick armored dinosaur hide, leather-like, embossed with natural patterns',
  uovo_del_primo:   'a speckled egg with golden cracks, warm light glowing from within, resting on ancient stones',
  lacrima_triassica:'a crystalline teardrop gem, deep blue-green, with swirling prehistoric mist trapped inside',
};

function buildRelicPrompt(relic: RelicData): string {
  const visual = RELIC_VISUAL[relic.id] ?? `a mysterious ancient dinosaur artifact — ${relic.name.it}`;
  const tierLight: Record<string, string> = {
    starter:   'simple amber lighting, clean dark background',
    common:    'warm golden glow, soft shadows',
    uncommon:  'cool blue magic aura, dual-tone lighting',
    rare:      'brilliant golden sparkles, god-rays, premium jewel quality',
    boss:      'ominous red-black glow, boss-tier energy',
    ancestral: 'transcendent white-gold radiance, ancient mystical energy, particle effects',
  };
  const light = tierLight[relic.tier] ?? tierLight.common;

  return [
    `Fantasy game relic / item icon art — ${relic.tier} tier.`,
    `Object: ${visual}.`,
    `Effect hint: "${relic.description.slice(0, 80)}".`,
    `Lighting: ${light}. Object floats centered in frame against dark void background.`,
    `Square 1:1 composition (512×512px). Object fills 70% of frame. Highly detailed texture.`,
    `Art style: detailed digital painting, game item icon quality. NO text. NO UI. NO background clutter.`,
    `Color palette: obsidian black void background, amber and gold accent. Cinematic quality.`,
  ].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Imagen 4 API call
// ---------------------------------------------------------------------------

interface ImagenResponse {
  predictions?: Array<{ bytesBase64Encoded?: string }>;
  error?: { message: string };
}

async function callImagen(prompt: string, aspectRatio: string): Promise<Buffer | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${API_KEY!}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount:       1,
        aspectRatio,
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
// Load all assets
// ---------------------------------------------------------------------------

function collectAssets(): ArtAsset[] {
  const assets: ArtAsset[] = [];
  const dataDir = path.join(process.cwd(), 'src', 'data');

  // Cards
  const cardDir = path.join(dataDir, 'cards', 'act1');
  for (const file of fs.readdirSync(cardDir).filter((f: string) => f.endsWith('.json'))) {
    const cards = JSON.parse(fs.readFileSync(path.join(cardDir, file), 'utf-8')) as CardData[];
    for (const c of cards) {
      assets.push({ id: c.id, name: c.name.it, type: 'cards', prompt: buildCardPrompt(c) });
    }
  }

  // Enemies (act 1)
  const enemies = JSON.parse(fs.readFileSync(path.join(dataDir, 'enemies_act1.json'), 'utf-8')) as EnemyData[];
  for (const e of enemies) {
    assets.push({ id: e.id, name: e.name.it, type: 'enemies', prompt: buildEnemyPrompt(e) });
  }

  // Heroes — one image per hero (base/cucciolo stage for selection screen)
  const heroes = JSON.parse(fs.readFileSync(path.join(dataDir, 'heroes.json'), 'utf-8')) as HeroData[];
  for (const h of heroes) {
    // Generate all 3 evolution stages
    for (const stage of ['cucciolo', 'adulto', 'prime'] as const) {
      const id = `${h.id}_${stage}`;
      assets.push({ id, name: `${h.name.it} (${stage})`, type: 'heroes', prompt: buildHeroPrompt(h, stage) });
    }
  }

  // Relics
  const relics = JSON.parse(fs.readFileSync(path.join(dataDir, 'relics.json'), 'utf-8')) as RelicData[];
  for (const r of relics) {
    assets.push({ id: r.id, name: r.name.it, type: 'relics', prompt: buildRelicPrompt(r) });
  }

  return assets;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!DRY_RUN && !API_KEY) {
    console.error('❌  Set GEMINI_API_KEY before running.');
    process.exit(1);
  }

  let assets = collectAssets();

  // Filter by type
  if (ONLY_TYPE) {
    assets = assets.filter((a) => a.type === ONLY_TYPE);
  }

  // Filter by id
  if (SINGLE_ID) {
    assets = assets.filter((a) => a.id === SINGLE_ID);
    if (!assets.length) {
      console.error(`❌  Asset "${SINGLE_ID}" not found.`);
      process.exit(1);
    }
  }

  // Skip existing unless --regen
  if (!REGEN && !DRY_RUN) {
    assets = assets.filter((a) => {
      const outPath = path.join(OUT_BASE, a.type, `${a.id}.png`);
      if (fs.existsSync(outPath)) {
        console.log(`  ⏭  ${a.type}/${a.id} exists — skip`);
        return false;
      }
      return true;
    });
  }

  const total = assets.length;
  const estMin = Math.ceil((total * DELAY_MS) / 60000);
  console.log(`\n🎨  Imagen 4 Fast — ${total} assets to generate (~${estMin} min)`);
  if (DRY_RUN) console.log('   (dry-run — no API calls)\n');

  // Group summary
  const byType = assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
  for (const [type, count] of Object.entries(byType)) {
    console.log(`   ${type}: ${count}`);
  }
  console.log();

  let ok = 0, fail = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]!;
    const outDir = path.join(OUT_BASE, asset.type);

    if (DRY_RUN) {
      console.log(`[${i + 1}/${total}] ${asset.type}/${asset.id} — "${asset.name}"`);
      console.log(`  Prompt (${asset.prompt.length} chars): ${asset.prompt.slice(0, 120)}…\n`);
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });

    const ratio = RATIOS[asset.type];
    console.log(`  [${i + 1}/${total}] ${asset.type}/${asset.id} (${ratio})…`);

    try {
      const buf = await callImagen(asset.prompt, ratio);
      if (buf) {
        fs.writeFileSync(path.join(outDir, `${asset.id}.png`), buf);
        console.log(`  ✅  Saved ${asset.type}/${asset.id}.png`);
        ok++;
      } else {
        console.warn(`  ⚠  No data returned for ${asset.id}`);
        fail++;
      }
    } catch (err) {
      console.error(`  ❌  ${asset.id}:`, err instanceof Error ? err.message : err);
      fail++;
    }

    if (i < assets.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (!DRY_RUN) {
    console.log(`\n✨  Done — ok: ${ok}, failed: ${fail}, skipped: ${total - ok - fail}`);
    console.log(`   Output: ${OUT_BASE}/`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
