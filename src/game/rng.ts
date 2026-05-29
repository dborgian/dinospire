export type RngFn = () => number;

// djb2 — fast non-crypto hash, good enough for seed derivation
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

// mulberry32 — deterministic across platforms, same algorithm as DinoDex
export function mulberry32(seed: number): RngFn {
  let s = seed >>> 0;
  return (): number => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeededRng = ReturnType<typeof createSeededRng>;

export function createSeededRng(seed: number): {
  next: RngFn;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  shuffle: <T>(arr: readonly T[]) => T[];
  fork: (id: string) => SeededRng;
} {
  const rng = mulberry32(seed);

  return {
    next: rng,

    int(min: number, max: number): number {
      return Math.floor(rng() * (max - min + 1)) + min;
    },

    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new RangeError('pick called on empty array');
      return arr[Math.floor(rng() * arr.length)] as T;
    },

    shuffle<T>(arr: readonly T[]): T[] {
      const out = [...arr];
      // Fisher-Yates
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },

    // XOR seed with hash so fork('combat_a') and fork('combat_b') diverge immediately
    fork(id: string): SeededRng {
      return createSeededRng((seed ^ hashString(id)) >>> 0);
    },
  };
}
