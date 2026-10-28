// Small seedable random generator (mulberry32), so melodies can be reproduced in tests.
// Returns a function giving floats in [0, 1), like Math.random.

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextInt(random, n) {
  return Math.floor(random() * n);
}
