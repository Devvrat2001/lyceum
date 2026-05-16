import { Skeleton } from "@/components/ui/Skeleton";

export default function CourseLoading() {
  return (
    <div
      style={{
        padding: "20px 28px 40px",
        maxWidth: 1600,
        margin: "0 auto",
        width: "100%",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 360px",
        gap: 28,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Skeleton width={200} height={10} />
        <Skeleton width="80%" height={36} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="90%" height={14} />
        <Skeleton height={300} />
        <Skeleton width={200} height={20} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={18} />
          ))}
        </div>
      </div>
      <Skeleton height={420} />
    </div>
  );
}
