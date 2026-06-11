/**
 * Deterministic card-art for courses without a thumbnail. Hashes a
 * stable seed (the course slug) into a two-stop pastel gradient, so
 * every course gets distinct, stable art with zero assets and no
 * "gray placeholder" wireframe feel — and setting a real thumbnailUrl
 * always wins over it.
 *
 * Plain TS (no React, no server deps): usable from server components,
 * client components, and emails alike.
 */
export function courseGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const h1 = h % 360;
  // Second stop 40-120° away — far enough to read as a gradient,
  // close enough to stay harmonious.
  const h2 = (h1 + 40 + (h % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 45% 80%) 0%, hsl(${h2} 50% 62%) 100%)`;
}
