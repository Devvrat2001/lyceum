import { Skeleton } from "@/components/ui/Skeleton";

export default function RootLoading() {
  return (
    <div
      style={{
        padding: "60px 28px",
        maxWidth: 1600,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <Skeleton width={140} height={12} />
      <Skeleton width="60%" height={36} />
      <Skeleton width="80%" height={14} />
      <Skeleton width="70%" height={14} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginTop: 24,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={180} />
        ))}
      </div>
    </div>
  );
}
