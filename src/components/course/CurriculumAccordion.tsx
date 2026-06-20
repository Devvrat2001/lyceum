"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, Icon } from "@/components/wf/primitives";

type Lesson = {
  id: string;
  slug: string | null;
  title: string;
  isPreview: boolean;
};

type Unit = {
  id: string;
  order: number;
  title: string;
  estLabel: string | null;
  lessons: Lesson[];
};

export function CurriculumAccordion({ units }: { units: Unit[] }) {
  const t = useTranslations("Curriculum");
  const [open, setOpen] = useState<number>(0);

  return (
    <Card p={0} style={{ marginBottom: 0 }}>
      {units.map((u, i) => {
        const isOpen = open === i;
        return (
          <div
            key={u.id}
            style={{
              borderBottom:
                i < units.length - 1 ? "1px solid var(--wf-hairline)" : "none",
            }}
          >
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={{
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                width: "100%",
                background: "transparent",
                border: "none",
                textAlign: "left",
              }}
            >
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  width: 50,
                }}
              >
                {t("unit", { order: u.order })}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.title}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--wf-mute)",
                    marginTop: 2,
                  }}
                >
                  {u.estLabel ?? t("lessonsCount", { count: u.lessons.length })}
                </div>
              </div>
              <Icon
                name="arrow"
                size={14}
                color="var(--wf-mute)"
                style={{
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s",
                }}
              />
            </button>
            {isOpen && u.lessons.length > 0 && (
              <div style={{ padding: "0 18px 14px 80px" }}>
                {u.lessons.map((l) => {
                  const href = l.slug ? `/student/lesson/${l.slug}` : "#";
                  const inner = (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "6px 0",
                        fontSize: 12,
                        color: "var(--wf-body)",
                      }}
                    >
                      <Icon name="play" size={12} color="var(--wf-mute)" />
                      <span style={{ flex: 1 }}>{l.title}</span>
                      {l.isPreview && (
                        <span
                          className="wf-mono"
                          style={{
                            fontSize: 10,
                            color: "var(--wf-mute)",
                          }}
                        >
                          {t("freePreview")}
                        </span>
                      )}
                    </div>
                  );
                  return l.slug ? (
                    <Link
                      key={l.id}
                      href={href}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={l.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
