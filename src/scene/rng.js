// Deterministic seeded PRNG so the city is reproducible across reloads.
// mulberry32: tiny, fast, good enough for layout decisions.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive a stable per-cell seed from the city seed + grid coords, so editing
// one lot's generation doesn't reshuffle the whole city.
export function hashSeed(citySeed, a, b, c = 0) {
  let h = (citySeed ^ 0x9e3779b9) >>> 0;
  for (const v of [a, b, c]) {
    h = Math.imul(h ^ (v >>> 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h >>> 0;
}

// Helpers bound to an rng() function.
export const range    = (rng, lo, hi) => lo + rng() * (hi - lo);
export const rangeInt = (rng, lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
export const pick     = (rng, arr)    => arr[Math.floor(rng() * arr.length)];
export const chance   = (rng, p)      => rng() < p;
