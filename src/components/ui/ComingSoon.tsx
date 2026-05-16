import Link from "next/link";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";

type IconName =
  | "user"
  | "book"
  | "grid"
  | "chart"
  | "cog"
  | "star"
  | "bolt"
  | "chat"
  | "trophy"
  | "sparkles"
  | "spark";

/**
 * Shared "this section ships in Phase X" surface for sidebar items
 * we've nav'd to but haven't built out yet. Renders inside whichever
 * chrome the consumer wraps it in.
 */
export function ComingSoon({
  eyebrow,
  title,
  description,
  icon = "sparkles",
  phase = "Phase 2",
  bullets = [],
  backHref = "/",
  backLabel = "Back",
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: IconName;
  phase?: string;
  bullets?: string[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: "32px 28px 40px",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--wf-ai-soft)",
              border: "1px solid var(--wf-ai)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--wf-ai)",
            }}
          >
            <Icon name={icon} size={18} color="currentColor" />
          </div>
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1
              className="wf-h1"
              style={{ fontSize: 26, marginTop: 4 }}
            >
              {title}
            </h1>
          </div>
        </div>

        <Card p={20}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span className="wf-ai-pill">{phase}</span>
            <span
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-mute)" }}
            >
              IN BUILD
            </span>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--wf-body)",
              lineHeight: 1.6,
              marginBottom: bullets.length ? 14 : 0,
            }}
          >
            {description}
          </p>

          {bullets.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {bullets.map((b) => (
                <div
                  key={b}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--wf-body)",
                  }}
                >
                  <Icon
                    name="check"
                    size={14}
                    color="var(--wf-good)"
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href={backHref} style={{ textDecoration: "none" }}>
            <Btn variant="primary">{backLabel}</Btn>
          </Link>
        </div>
      </div>
    </div>
  );
}
