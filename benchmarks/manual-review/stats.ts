// Seeded sampling and confidence intervals for the manual-review pass (docs/validation/passes/manual-review.md).

/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: a small deterministic generator, the same on every platform. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws `count` distinct items from `items` (all of them when there are fewer). The draw depends only on the
 * seed, the group name, and the sorted items, so it is the same on any machine and when other groups change.
 */
export function drawSample<T extends string>(items: readonly T[], count: number, seed: string, group: string): T[] {
  const pool = [...items].sort();
  const random = seededRandom(hashSeed(`${seed}:${group}`));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [pool[index], pool[other]] = [pool[other] as T, pool[index] as T];
  }
  return pool.slice(0, count).sort();
}

export interface Interval {
  /** The observed proportion, or null when there was nothing to measure. */
  estimate: number | null;
  low: number | null;
  high: number | null;
}

const Z_95 = 1.959964;

const round = (value: number): number => Number(value.toFixed(4));

/** The Wilson score interval for `successes` out of `total` at 95% confidence. */
export function wilsonInterval(successes: number, total: number): Interval {
  if (total <= 0) return { estimate: null, low: null, high: null };
  const p = successes / total;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (Z_95 * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return { estimate: round(p), low: round(Math.max(0, center - margin)), high: round(Math.min(1, center + margin)) };
}
