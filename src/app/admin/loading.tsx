import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div style={{ padding: "24px 28px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={84} />
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Skeleton height={420} />
        <Skeleton height={420} />
      </div>
    </div>
  );
}
