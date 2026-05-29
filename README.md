# DinoSpire

A dinosaur-themed deckbuilder roguelike for the browser, inspired by Slay the Spire. Build a deck across a procedurally generated map, battle dinosaur enemies, and evolve your hero to its Prime form.

## Setup

**Prerequisites:** Node.js 20+, pnpm 9+

```bash
pnpm install
pnpm dev          # start dev server at http://localhost:5173
pnpm build        # type-check + production build
pnpm test         # run Vitest in watch mode
pnpm validate:content  # validate all JSON content files against Zod schemas
```

## Usage

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Vite dev server with HMR |
| `pnpm build` | TypeScript check + Vite production build |
| `pnpm test` | Vitest (watch mode) |
| `pnpm test --run` | Vitest single-pass (CI) |
| `pnpm validate:content` | Zod-validate all JSON content in `src/data/` |
| `tsx scripts/sync-dinos.ts` | Sync dino data from DinoDex export |

## Architecture

```
src/
├── game/           # Pure game logic (no React, no I/O)
│   ├── combat/     # Reducer, effect resolver, intent gen, selectors
│   ├── run/        # State machine, map gen, reward pools
│   ├── meta/       # Unlocks, ascension patches
│   ├── content/    # Registry + async loaders for cards/heroes/enemies/relics
│   ├── rng.ts      # Seeded Mulberry32 RNG (deterministic, forkable)
│   └── types.ts    # All domain types (branded IDs, DSL nodes, discriminated unions)
├── stores/         # Zustand stores (runStore, combatStore, metaStore, uiStore)
├── three/          # React Three Fiber scenes (BossReveal, PrimeEvolution)
├── ui/             # React components by domain (combat, map, reward, meta, shared)
├── data/           # Static JSON content (cards, heroes, enemies, relics, events)
└── App.tsx         # Root component (router entry point once views exist)

tests/              # Vitest test suites (mirrors src/ structure)
scripts/            # Content tooling (sync-dinos, validate-content)
```

**State flow:** game logic lives in `src/game/` as pure functions. Zustand stores wrap them and expose actions to React components. Three.js scenes are triggered by `uiStore` flags. Content is loaded lazily via async loaders in `src/game/content/`.
