/**
 * Pure client-side decorative chart. Real time-series data lands in P2.
 * Pulled out of the page so the page can be a Server Component.
 */
export function ChartLine() {
  const W = 720;
  const H = 200;
  const P = 24;
  const points = (seed: number, mul = 1, off = 0) => {
    const rng = (n: number) => (Math.sin(seed * 9999 + n * 1.3) + 1) / 2;
    return Array.from({ length: 30 }, (_, i) => {
      const x = P + (i / 29) * (W - 2 * P);
      const y = H - P - rng(i) * (H - 2 * P) * 0.85 * mul - off;
      return [x, y] as const;
    });
  };
  const toPath = (pts: readonly (readonly [number, number])[]) =>
    pts
      .map(
        (p, i) =>
          (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)
      )
      .join(" ");
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%" }}
    >
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1={P}
          x2={W - P}
          y1={P + (i * (H - 2 * P)) / 3}
          y2={P + (i * (H - 2 * P)) / 3}
          stroke="var(--wf-hairline)"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <text
          key={i}
          x={P + (i * (W - 2 * P)) / 3}
          y={H - 4}
          fontSize="9"
          fill="var(--wf-mute)"
          fontFamily="ui-monospace,monospace"
        >
          {["Apr 8", "Apr 15", "Apr 22", "Apr 29"][i]}
        </text>
      ))}
      <path
        d={toPath(points(1, 0.95, 0))}
        stroke="var(--wf-ink)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d={toPath(points(2, 0.65, 30))}
        stroke="var(--wf-accent)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d={toPath(points(3, 0.45, 70))}
        stroke="var(--wf-ai)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="3,3"
      />
    </svg>
  );
}
