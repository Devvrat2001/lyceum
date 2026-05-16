import * as React from "react";

export const WF = {
  ink: "var(--wf-ink)",
  body: "var(--wf-body)",
  mute: "var(--wf-mute)",
  line: "var(--wf-line)",
  hairline: "var(--wf-hairline)",
  fill: "var(--wf-fill)",
  fillSoft: "var(--wf-fillsoft)",
  bg: "var(--wf-bg)",
  accent: "var(--wf-accent)",
  accentSoft: "var(--wf-accent-soft)",
  ai: "var(--wf-ai)",
  aiSoft: "var(--wf-ai-soft)",
  good: "var(--wf-good)",
} as const;

type IconName =
  | "home"
  | "book"
  | "chart"
  | "user"
  | "flame"
  | "trophy"
  | "star"
  | "play"
  | "plus"
  | "search"
  | "bell"
  | "cog"
  | "chat"
  | "grid"
  | "spark"
  | "lock"
  | "arrow"
  | "download"
  | "dot"
  | "drag"
  | "check"
  | "sparkles"
  | "mic"
  | "bolt"
  | "branch";

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 9 L10 3 L17 9 V16 H3 Z" />,
  book: (
    <>
      <path d="M4 4 H16 V16 H4 Z" />
      <path d="M10 4 V16" />
    </>
  ),
  chart: (
    <>
      <path d="M3 16 V4" />
      <path d="M3 16 H17" />
      <path d="M6 12 V14" />
      <path d="M9 9 V14" />
      <path d="M12 11 V14" />
      <path d="M15 7 V14" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17 C4 13 7 11 10 11 C13 11 16 13 16 17" />
    </>
  ),
  flame: (
    <path d="M10 17 C6 17 4 14 5 11 C5.5 9.5 7 8.5 7.5 7 C8 5.5 7.5 4 9 3 C9 5 11 5 11 7 C13 7 14 9 14 11 C15 13 13 17 10 17 Z" />
  ),
  trophy: (
    <>
      <path d="M6 4 H14 V8 C14 11 12 13 10 13 C8 13 6 11 6 8 Z" />
      <path d="M6 6 H3 V8 C3 9 4 10 5 10" />
      <path d="M14 6 H17 V8 C17 9 16 10 15 10" />
      <path d="M8 17 H12" />
      <path d="M10 13 V17" />
    </>
  ),
  star: (
    <path d="M10 2 L12 8 L18 8.5 L13.5 12.5 L15 18 L10 14.5 L5 18 L6.5 12.5 L2 8.5 L8 8 Z" />
  ),
  play: <path d="M5 3 L15 10 L5 17 Z" />,
  plus: (
    <>
      <path d="M10 4 V16" />
      <path d="M4 10 H16" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.5 12.5 L17 17" />
    </>
  ),
  bell: (
    <>
      <path d="M5 14 V9 C5 6 7 4 10 4 C13 4 15 6 15 9 V14" />
      <path d="M3 14 H17" />
      <path d="M8 14 V15 C8 16 9 17 10 17 C11 17 12 16 12 15 V14" />
    </>
  ),
  cog: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2 V4 M10 16 V18 M2 10 H4 M16 10 H18 M4 4 L5.5 5.5 M14.5 14.5 L16 16 M4 16 L5.5 14.5 M14.5 5.5 L16 4" />
    </>
  ),
  chat: <path d="M3 4 H17 V13 H10 L6 16 V13 H3 Z" />,
  grid: (
    <>
      <rect x="3" y="3" width="6" height="6" />
      <rect x="11" y="3" width="6" height="6" />
      <rect x="3" y="11" width="6" height="6" />
      <rect x="11" y="11" width="6" height="6" />
    </>
  ),
  spark: <path d="M10 3 L11 8 L16 9 L11 10 L10 15 L9 10 L4 9 L9 8 Z" />,
  lock: (
    <>
      <rect x="4" y="9" width="12" height="8" />
      <path d="M6 9 V6 C6 4 8 3 10 3 C12 3 14 4 14 6 V9" />
    </>
  ),
  arrow: <path d="M4 10 H16 M12 6 L16 10 L12 14" />,
  download: (
    <>
      <path d="M10 3 V13 M5 9 L10 14 L15 9" />
      <path d="M3 17 H17" />
    </>
  ),
  dot: <circle cx="10" cy="10" r="2.5" />,
  drag: (
    <>
      <circle cx="7" cy="6" r="1" />
      <circle cx="13" cy="6" r="1" />
      <circle cx="7" cy="10" r="1" />
      <circle cx="13" cy="10" r="1" />
      <circle cx="7" cy="14" r="1" />
      <circle cx="13" cy="14" r="1" />
    </>
  ),
  check: <path d="M3 10 L8 15 L17 5" />,
  sparkles: (
    <>
      <path d="M10 3 L11 7 L15 8 L11 9 L10 13 L9 9 L5 8 L9 7 Z" />
      <path d="M16 12 L16.5 14 L18 14.5 L16.5 15 L16 17 L15.5 15 L14 14.5 L15.5 14 Z" />
    </>
  ),
  mic: (
    <>
      <rect x="8" y="3" width="4" height="9" rx="2" />
      <path d="M5 11 C5 14 7 16 10 16 C13 16 15 14 15 11" />
      <path d="M10 16 V18" />
    </>
  ),
  bolt: <path d="M11 2 L4 11 H9 L8 18 L15 9 H10 Z" />,
  branch: (
    <>
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="5" cy="16" r="1.5" />
      <circle cx="15" cy="10" r="1.5" />
      <path d="M5 5.5 V14.5" />
      <path d="M5 10 H13.5" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  color,
  style,
  className,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={`wf-icon ${className ?? ""}`}
      style={{ width: size, height: size, color, ...style }}
    >
      <svg viewBox="0 0 20 20">{ICON_PATHS[name] ?? ICON_PATHS.dot}</svg>
    </span>
  );
}

export type BtnVariant = "default" | "primary" | "accent" | "ai" | "ghost";

export const Btn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    sm?: boolean;
    full?: boolean;
    icon?: React.ReactNode;
  }
>(function Btn(
  { variant = "default", sm, full, icon, className = "", children, ...rest },
  ref
) {
  const cls = ["wf-btn"];
  if (variant !== "default") cls.push(`wf-btn--${variant}`);
  if (sm) cls.push("wf-btn--sm");
  if (full) cls.push("wf-btn--full");
  return (
    <button ref={ref} className={`${cls.join(" ")} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
});

export function Avatar({
  initials = "AB",
  size = 28,
  style,
  className,
}: {
  initials?: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`wf-avatar ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: size * 0.36, ...style }}
    >
      {initials}
    </div>
  );
}

export function Annot({
  children,
  ai,
  style,
}: {
  children: React.ReactNode;
  ai?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`wf-annot ${ai ? "wf-annot--ai" : ""}`} style={style}>
      {children}
    </span>
  );
}

export function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="wf-eyebrow" style={style}>
      {children}
    </div>
  );
}

export function Card({
  children,
  style,
  p = 16,
  className = "",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  p?: number | string;
  className?: string;
}) {
  return (
    <div className={`wf-card ${className}`} style={{ padding: p, ...style }}>
      {children}
    </div>
  );
}

export function Meter({
  value = 50,
  variant,
  style,
}: {
  value?: number;
  variant?: "accent" | "ai";
  style?: React.CSSProperties;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`wf-meter ${variant ? `wf-meter--${variant}` : ""}`}
      style={style}
    >
      <i style={{ width: `${v}%` }} />
    </div>
  );
}

export function XPChip({ value = 1240, sm }: { value?: number; sm?: boolean }) {
  return (
    <span
      className="wf-chip wf-chip--accent"
      style={{
        fontSize: sm ? 9 : 10,
        padding: sm ? "2px 6px" : "3px 8px",
      }}
    >
      <Icon name="bolt" size={sm ? 10 : 12} color="currentColor" />{" "}
      {value.toLocaleString()} XP
    </span>
  );
}

export function StreakChip({ days = 14, sm }: { days?: number; sm?: boolean }) {
  return (
    <span
      className="wf-chip"
      style={{
        fontSize: sm ? 9 : 10,
        padding: sm ? "2px 6px" : "3px 8px",
        color: "var(--wf-accent)",
        borderColor: "var(--wf-accent)",
      }}
    >
      <Icon name="flame" size={sm ? 10 : 12} color="currentColor" /> {days} day
      streak
    </span>
  );
}

export function AIPill({
  children = "AI",
}: {
  children?: React.ReactNode;
}) {
  return <span className="wf-ai-pill">{children}</span>;
}

export function ImageBox({
  w = "100%",
  h = 100,
  label,
  style,
  kind = "image",
  className,
}: {
  w?: number | string;
  h?: number;
  label?: string;
  style?: React.CSSProperties;
  kind?: "image" | "video";
  className?: string;
}) {
  return (
    <div
      className={`wf-img ${className ?? ""}`}
      style={{ width: w, height: h, ...style }}
    >
      {label && (
        <span
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            fontFamily: "var(--font-mono-stack)",
            fontSize: 9,
            color: "var(--wf-mute)",
            letterSpacing: ".04em",
            textTransform: "uppercase",
            background: "var(--wf-bg)",
            padding: "1px 4px",
            borderRadius: 2,
            zIndex: 1,
          }}
        >
          {label}
        </span>
      )}
      {kind === "video" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "white",
              border: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--wf-ink)">
              <path d="M2 1 L8 5 L2 9 Z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

export function Hatch({
  children,
  style,
  className,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div className={`wf-hatch ${className ?? ""}`} style={style}>
      {children}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="wf-toggle"
      data-on={on}
      onClick={() => onChange?.(!on)}
      aria-pressed={on}
    />
  );
}
