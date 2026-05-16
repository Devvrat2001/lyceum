import { Skeleton } from "@/components/ui/Skeleton";

export default function TeacherLoading() {
  return (
    <div style={{ padding: "24px 28px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={88} />
        ))}
      </div>
      <Skeleton height={260} style={{ marginBottom: 16 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <Skeleton height={200} />
        <Skeleton height={200} />
      </div>
    </div>
  );
}
