/**
 * Animated placeholder block. Used inside loading.tsx files so the layout
 * shows a recognizable shape while server data fetches.
 */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 4,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="wf-pulse"
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: radius,
        background: "var(--wf-fill)",
        ...style,
      }}
    />
  );
}
