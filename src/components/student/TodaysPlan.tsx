"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Annot, Btn, Card, Icon } from "@/components/wf/primitives";

type IconName = "play" | "sparkles" | "book" | "mic" | "check" | "arrow";
type PlanState = "done" | "now" | "next";
type PlanItem = {
  ico: IconName;
  tag: string;
  title: string;
  meta: string;
  state: PlanState;
  /** Where "Start" navigates; null = check-off only (e.g. streak saver). */
  href?: string | null;
};

export function TodaysPlan({ initialPlan }: { initialPlan: PlanItem[] }) {
  const t = useTranslations("TodaysPlan");
  const [plan, setPlan] = useState<PlanItem[]>(initialPlan);

  const advance = (idx: number) => {
    setPlan((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], state: "done" };
      const upcoming = next.findIndex((p, i) => i > idx && p.state === "next");
      if (upcoming !== -1)
        next[upcoming] = { ...next[upcoming], state: "now" };
      return next;
    });
  };

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="wf-h2 text-base">{t("title")}</h2>
        {/* Honest label — the plan is rule-built from real progress
            (next lesson / assignments / weakest skill), not AI, and the
            old "· 35 min" estimate + dead Customize button were props. */}
        <Annot>{t("planned")}</Annot>
      </div>
      <Card p={0}>
        {plan.map((row, i) => (
          <div
            key={i}
            className={`flex items-center gap-3.5 border-b border-hairline px-4 py-3 last:border-b-0 ${
              row.state === "done" ? "opacity-55" : ""
            }`}
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded border border-hairline ${
                row.state === "now" ? "bg-ai-soft" : "bg-white"
              }`}
            >
              <Icon
                name={row.ico}
                size={14}
                color={
                  row.state === "now" ? "var(--wf-ai)" : "var(--wf-body)"
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-[3px] flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] tracking-[0.08em] text-mute">
                  {row.tag}
                </span>
                {row.state === "now" && (
                  <span className="wf-ai-pill">{t("now")}</span>
                )}
                {row.tag === "PRACTICE" && (
                  <Annot ai>{t("adaptsDifficulty")}</Annot>
                )}
                {row.tag === "SPEAK" && <Annot ai>{t("aiPartner")}</Annot>}
              </div>
              <div
                className={`text-[13px] ${
                  row.state === "done"
                    ? "font-normal line-through"
                    : "font-semibold"
                }`}
              >
                {row.title}
              </div>
              <div className="mt-0.5 text-[11px] text-mute">{row.meta}</div>
            </div>
            {row.state === "done" ? (
              <Icon name="check" size={16} color="var(--wf-good)" />
            ) : row.state === "now" ? (
              row.href ? (
                <Link
                  href={row.href}
                  className="st-pop no-underline"
                  onClick={() => advance(i)}
                >
                  <Btn sm variant="primary">
                    {t("start")}
                  </Btn>
                </Link>
              ) : (
                <Btn
                  sm
                  variant="primary"
                  className="st-pop"
                  onClick={() => advance(i)}
                >
                  {t("done")}
                </Btn>
              )
            ) : (
              <Icon name="arrow" size={16} color="var(--wf-mute)" />
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}
