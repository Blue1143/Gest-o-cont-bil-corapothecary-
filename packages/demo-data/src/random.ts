/** Deterministic pseudo-random helpers so synthetic data is reproducible across runs and tests. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poisson sample (Knuth) for the small rates of infection counts. */
export function poisson(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0;
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

/** Binomial-like count: n trials at probability p, approximated for speed. */
export function binomial(n: number, p: number, rand: () => number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}
