/**
 * "Engagement over time" — three real daily series for the current
 * analytics window: active learners, new enrollments, and AI tutor
 * sessions. Data comes from `teacher.analytics`; this component only
 * draws it. RSC-safe (no hooks, no browser APIs, no random data).
 */
export type ChartSeries = {
  /** Distinct learners with ≥1 quiz attempt that day. */
  active: number[];
  /** New enrollments that day. */
  enroll: number[];
  /** AI tutor sessions started that day. */
  tutor: number[];
  /** Four evenly-spaced x-axis date labels. */
  axisLabels: string[];
};

export function ChartLine({ series }: { series: ChartSeries }) {
  const W = 720;
  const H = 200;
  const P = 24;
  const { active, enroll, tutor, axisLabels } = series;
  const n = active.length;
  const maxV = Math.max(1, ...active, ...enroll, ...tutor);
  const hasData =
    active.some((v) => v > 0) ||
    enroll.some((v) => v > 0) ||
    tutor.some((v) => v > 0);

  const toPath = (arr: number[]) =>
    arr
      .map((val, i) => {
        const x = P + (n > 1 ? i / (n - 1) : 0) * (W - 2 * P);
        const y = H - P - (val / maxV) * (H - 2 * P);
        return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
      })
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
      {axisLabels.map((label, i) => (
        <text
          key={i}
          x={P + (i * (W - 2 * P)) / 3}
          y={H - 4}
          fontSize="9"
          fill="var(--wf-mute)"
          fontFamily="ui-monospace,monospace"
        >
          {label}
        </text>
      ))}
      {hasData ? (
        <>
          <path
            d={toPath(active)}
            stroke="var(--wf-ink)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d={toPath(enroll)}
            stroke="var(--wf-accent)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d={toPath(tutor)}
            stroke="var(--wf-ai)"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="3,3"
          />
        </>
      ) : (
        <text
          x={W / 2}
          y={H / 2}
          fontSize="11"
          fill="var(--wf-mute)"
          textAnchor="middle"
          fontFamily="ui-monospace,monospace"
        >
          No activity in this range yet
        </text>
      )}
    </svg>
  );
}
