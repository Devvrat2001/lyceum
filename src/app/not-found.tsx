import Link from "next/link";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";

export default function RootNotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <Card p={32} style={{ maxWidth: 480, width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Icon name="search" size={16} color="var(--wf-mute)" />
          <Eyebrow>404</Eyebrow>
        </div>
        <h1 className="wf-h1" style={{ fontSize: 28, marginBottom: 10 }}>
          We couldn&apos;t find that.
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          The page you&apos;re looking for moved or never existed. Try the
          marketplace, or sign in to your dashboard.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Btn variant="primary">Browse courses</Btn>
          </Link>
          <Link href="/student" style={{ textDecoration: "none" }}>
            <Btn variant="ghost">My dashboard</Btn>
          </Link>
        </div>
      </Card>
    </div>
  );
}
