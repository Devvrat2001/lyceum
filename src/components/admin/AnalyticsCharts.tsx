/**
 * Dependency-free chart primitives for the admin analytics dashboard.
 *
 * Everything here is a pure presentational component — no hooks, no
 * event handlers — so it renders entirely on the server inside the
 * `/admin/analytics` server component. We draw raw SVG rather than pull
 * in a charting lib: the data is small (≤52 weekly points), static per
 * request, and the house style is inline-CSS + `var(--wf-*)` tokens.
 */

type Point = { label: string; bar: number; line: number | null };

/** "2026-05-25" → "5/25" for compact x-axis ticks. */
function shortDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/**
 * Grouped weekly bars with an optional overlaid line (0–100 scale, used
 * for accuracy). The bar axis auto-scales to its own max; the line axis
 * is fixed 0–100 so an accuracy line is always read against a full
 * percentage range. Null line points break the polyline (a week with no
 * attempts has no accuracy, so we don't draw a misleading segment).
 */
export function BarLineChart({
  data,
  height = 200,
  barColor = "var(--wf-ai)",
  lineColor = "var(--wf-accent)",
  lineLabel,
  barLabel,
}: {
  data: Point[];
  height?: number;
  barColor?: string;
  lineColor?: string;
  lineLabel?: string;
  barLabel?: string;
}) {
  const n = Math.max(data.length, 1);
  const W = Math.max(n * 26, 360);
  const H = height;
  const padT = 14;
  const padB = 26;
  const padL = 10;
  const padR = 10;
  const plotH = H - padT - padB;
  const plotW = W - padL - padR;
  const slot = plotW / n;
  const barW = Math.min(slot * 0.6, 22);
  const maxBar = Math.max(1, ...data.map((d) => d.bar));
  const hasLine = data.some((d) => d.line !== null);

  const cx = (i: number) => padL + slot * i + slot / 2;
  const barY = (v: number) => padT + plotH * (1 - v / maxBar);
  const lineY = (v: number) => padT + plotH * (1 - Math.min(100, v) / 100);

  // Break the accuracy line into runs of consecutive non-null points.
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  data.forEach((d, i) => {
    if (d.line === null) {
      if (run.length) segments.push(run);
      run = [];
    } else {
      run.push({ x: cx(i), y: lineY(d.line) });
    }
  });
  if (run.length) segments.push(run);

  // x-axis ticks: first, last, and a handful evenly spaced between.
  const step = Math.max(1, Math.ceil(n / 6));
  const tickIdx = new Set<number>([0, n - 1]);
  for (let i = 0; i < n; i += step) tickIdx.add(i);

  return (
    <div>
      {(barLabel || lineLabel) && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 8,
            fontSize: 11,
            color: "var(--wf-mute)",
          }}
        >
          {barLabel && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: barColor,
                }}
              />
              {barLabel}
            </span>
          )}
          {lineLabel && hasLine && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 12,
                  height: 2,
                  background: lineColor,
                }}
              />
              {lineLabel}
            </span>
          )}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${barLabel ?? "Weekly"} chart`}
      >
        {/* baseline */}
        <line
          x1={padL}
          y1={padT + plotH}
          x2={W - padR}
          y2={padT + plotH}
          stroke="var(--wf-hairline)"
          strokeWidth={1}
        />
        {/* bars */}
        {data.map((d, i) => {
          if (d.bar <= 0) return null;
          const h = Math.max(1, plotH * (d.bar / maxBar));
          return (
            <rect
              key={d.label}
              x={cx(i) - barW / 2}
              y={barY(d.bar)}
              width={barW}
              height={h}
              rx={2}
              fill={barColor}
              opacity={0.85}
            >
              <title>{`${shortDate(d.label)} · ${d.bar.toLocaleString()}`}</title>
            </rect>
          );
        })}
        {/* accuracy line segments + dots */}
        {hasLine &&
          segments.map((seg, si) => (
            <polyline
              key={`seg-${si}`}
              points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {hasLine &&
          data.map((d, i) =>
            d.line === null ? null : (
              <circle
                key={`dot-${d.label}`}
                cx={cx(i)}
                cy={lineY(d.line)}
                r={2.5}
                fill={lineColor}
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${shortDate(d.label)} · ${d.line}%`}</title>
              </circle>
            )
          )}
        {/* x ticks */}
        {data.map((d, i) =>
          tickIdx.has(i) ? (
            <text
              key={`tick-${d.label}`}
              x={cx(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize={9}
              fill="var(--wf-mute)"
              fontFamily="var(--font-mono-stack)"
            >
              {shortDate(d.label)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

/**
 * Enrolment funnel — horizontal bars whose width is each step's share of
 * the top of the funnel, fading down the steps so the drop-off reads at
 * a glance.
 */
export function FunnelChart({
  steps,
  color = "var(--wf-good)",
}: {
  steps: Array<{ label: string; count: number; pct: number }>;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {steps.map((s, i) => (
        <div key={s.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 5,
            }}
          >
            <span style={{ fontWeight: 600 }}>{s.label}</span>
            <span
              className="wf-mono"
              style={{ color: "var(--wf-mute)", fontSize: 11 }}
            >
              {s.count.toLocaleString()} · {s.pct}%
            </span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 5,
              background: "var(--wf-fill)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.max(s.pct, s.count > 0 ? 2 : 0)}%`,
                background: color,
                opacity: 1 - i * 0.18,
                borderRadius: 5,
                transition: "none",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
