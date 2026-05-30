import Link from "next/link";
import { StudentChrome } from "@/components/layouts/StudentChrome";
import { Annot, Btn, Eyebrow, Icon } from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { WhyPathButton } from "@/components/student/WhyPathButton";

type NodeState = "done" | "now" | "unlocked" | "locked";

export default async function SkillTreePage() {
  const trpc = await getServerCaller();
  const tree = await trpc.skill.tree();

  const W = 1080;
  const H = 540;
  const colX = (c: number) => 80 + c * 170;
  const rowY = (r: number) => 60 + r * 100;
  const nodeById = new Map(tree.nodes.map((n) => [n.id, n] as const));

  const PALETTE: Record<
    NodeState,
    { bg: string; fg: string; bd: string }
  > = {
    done: { bg: "var(--wf-ink)", fg: "white", bd: "var(--wf-ink)" },
    now: { bg: "var(--wf-accent)", fg: "white", bd: "var(--wf-accent)" },
    unlocked: { bg: "white", fg: "var(--wf-ink)", bd: "var(--wf-line)" },
    locked: {
      bg: "var(--wf-fill)",
      fg: "var(--wf-mute)",
      bd: "var(--wf-hairline)",
    },
  };

  return (
    <StudentChrome active="paths">
      <div
        style={{
          padding: "20px 28px 0",
          flexShrink: 0,
          borderBottom: "1px solid var(--wf-hairline)",
        }}
      >
        <Eyebrow>Math 6 · Personalized Path</Eyebrow>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            marginTop: 6,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <h1 className="wf-h1" style={{ fontSize: 24 }}>
            Your skill journey
          </h1>
          <Annot ai>Your next skill advances as you answer questions correctly</Annot>
          <div style={{ flex: 1 }} />
          <Link href="/student/library" style={{ textDecoration: "none" }}>
            <Btn variant="ghost">Continue learning →</Btn>
          </Link>
          <WhyPathButton />
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            paddingBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <Stat
            value={tree.stats.mastered.toString()}
            suffix={`/${tree.stats.total}`}
            label="SKILLS MASTERED"
          />
          <Stat value={`L${tree.stats.level}`} label="LEVEL" />
          <Stat
            value={`${tree.stats.streak}d`}
            label="STREAK"
            accent
          />
          <Stat
            value={`~${tree.stats.progressToNextPct}%`}
            label={`TO LEVEL ${tree.stats.level + 1}`}
          />
          <div style={{ flex: 1 }} />
          <Annot>Branching scenarios · gated by mastery</Annot>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 40,
          position: "relative",
          background: "var(--wf-fillsoft)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: W,
            height: H,
            margin: "0 auto",
          }}
        >
          <svg
            width={W}
            height={H}
            style={{ position: "absolute", inset: 0 }}
          >
            {tree.edges.map((e, i) => {
              const A = nodeById.get(e.fromId);
              const B = nodeById.get(e.toId);
              if (!A || !B) return null;
              const x1 = colX(A.col) + 60;
              const y1 = rowY(A.row) + 20;
              const x2 = colX(B.col);
              const y2 = rowY(B.row) + 20;
              const mx = (x1 + x2) / 2;
              const isDone =
                A.state === "done" &&
                (B.state === "done" ||
                  B.state === "now" ||
                  B.state === "unlocked");
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  stroke={isDone ? "var(--wf-ink)" : "var(--wf-hairline)"}
                  strokeWidth={isDone ? 1.5 : 1}
                  fill="none"
                  strokeDasharray={isDone ? "" : "3,3"}
                />
              );
            })}
          </svg>
          {tree.nodes.map((n) => {
            const pal = PALETTE[n.state];
            return (
              <div
                key={n.id}
                title={`Mastery: ${n.masteryPct}%`}
                style={{
                  position: "absolute",
                  left: colX(n.col),
                  top: rowY(n.row),
                  width: 130,
                  padding: "10px 12px",
                  background: pal.bg,
                  color: pal.fg,
                  border: `1.5px solid ${pal.bd}`,
                  borderRadius: n.isBoss ? 30 : 4,
                  boxShadow: n.current
                    ? "0 0 0 4px var(--wf-accent-soft)"
                    : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 3,
                  }}
                >
                  <Icon
                    name={
                      n.state === "done"
                        ? "check"
                        : n.state === "locked"
                        ? "lock"
                        : n.isBoss
                        ? "trophy"
                        : "star"
                    }
                    size={11}
                    color="currentColor"
                  />
                  <span
                    className="wf-mono"
                    style={{
                      fontSize: 8,
                      opacity: 0.7,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {n.isBoss
                      ? "BOSS · UNIT TEST"
                      : n.state === "now"
                      ? "IN PROGRESS"
                      : n.state.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}
                >
                  {n.title}
                </div>
                {n.state === "now" && (
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 9,
                      marginTop: 3,
                      opacity: 0.85,
                    }}
                  >
                    {n.masteryPct}% mastered
                  </div>
                )}
                {n.current && (
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 9,
                      marginTop: 3,
                      opacity: 0.85,
                    }}
                  >
                    Up next
                  </div>
                )}
              </div>
            );
          })}
          {(() => {
            const upNext = tree.nodes.find((n) => n.current);
            if (!upNext) return null;
            return (
              <div
                className="wf-mono"
                style={{
                  position: "absolute",
                  left: colX(upNext.col) + 60,
                  top: rowY(upNext.row) + 70,
                  fontSize: 10,
                  background: "var(--wf-ai-soft)",
                  color: "var(--wf-ai)",
                  padding: "4px 8px",
                  borderRadius: 3,
                  letterSpacing: "0.04em",
                }}
              >
                ↑ Up next — correct answers move this toward mastery
              </div>
            );
          })()}
        </div>
      </div>
    </StudentChrome>
  );
}

function Stat({
  value,
  suffix,
  label,
  accent,
}: {
  value: string;
  suffix?: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="wf-serif"
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ? "var(--wf-accent)" : "var(--wf-ink)",
        }}
      >
        {value}
        {suffix && (
          <span style={{ color: "var(--wf-mute)", fontSize: 14 }}>
            {suffix}
          </span>
        )}
      </div>
      <div
        className="wf-mono"
        style={{ fontSize: 10, color: "var(--wf-mute)" }}
      >
        {label}
      </div>
    </div>
  );
}
