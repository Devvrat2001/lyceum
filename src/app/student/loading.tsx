import { Skeleton } from "@/components/ui/Skeleton";

export default function StudentLoading() {
  return (
    <div className="wf-two-col" style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Skeleton width={120} height={10} />
        <Skeleton width="50%" height={32} />
        <div className="wf-grid-cards-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
        <Skeleton height={220} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={140} />
        ))}
      </div>
    </div>
  );
}
