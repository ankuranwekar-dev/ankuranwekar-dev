/**
 * Small deterministic PRNG utilities.
 *
 * Forecasts and nudge plans must be stable: the same inputs on his phone and
 * hers, today and tomorrow, must produce the same output, or the UI flickers
 * and the two devices disagree. Every random draw therefore comes from a
 * seeded generator, never from Math.random.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: fast, well-distributed 32-bit generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(...parts: (string | number)[]): () => number {
  return mulberry32(hashString(parts.join('|')));
}

/** Standard normal via Box–Muller. */
export function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Draw an index from unnormalised non-negative weights. Returns -1 if all weights are zero. */
export function sampleIndex(weights: readonly number[], rand: () => number): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return -1;
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}
