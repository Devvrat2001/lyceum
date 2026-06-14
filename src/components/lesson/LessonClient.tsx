"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Annot,
  Btn,
  Card,
  Eyebrow,
  Icon,
  XPChip,
} from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import {
  BlockReader,
  type BlockReaderProps,
} from "@/components/lesson/BlockReader";

type Step = {
  id: string;
  order: number;
  title: string;
  durationLabel: string | null;
  isAi: boolean;
};

type Question = {
  id: string;
  stem: string;
  answers: { key: string; text: string; correct: boolean }[];
};

type LessonProps = {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  courseSlug: string;
  courseLabel: string;
  steps: Step[];
  questions: Question[];
  blocks: BlockReaderProps[];
};

type Msg = {
  from: "you" | "ai";
  text: string;
  cite?: string;
  step?: string;
  streaming?: boolean;
};

export function LessonClient({ lesson }: { lesson: LessonProps }) {
  const t = useTranslations("LessonReader");
  const [qIdx, setQIdx] = useState(0);
  const question = lesson.questions[qIdx];

  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    points: number;
    correctKey: string | null;
  } | null>(null);
  // Running tallies for the end-of-lesson score card. Each Question is
  // checked exactly once (the answer row locks after "Check answer", and
  // the primary button flips to Next), so incrementing here can't
  // double-count.
  const [correctCount, setCorrectCount] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);

  const attempt = trpc.lesson.attempt.useMutation({
    onSuccess: (res) => {
      setFeedback(res);
      if (res.correct) {
        setCorrectCount((n) => n + 1);
        setXpEarned((x) => x + res.points + (res.bonusPoints ?? 0));
      }
    },
  });

  // Completing a lesson no longer redirects on its own. The old
  // behaviour fired `router.push` straight to the next lesson (or, when
  // the next lesson had no slug, to the course page) — which read as
  // "the quiz dumped me back to the course with no score". Instead we
  // record the result and render an explicit completion card with the
  // score + XP and a Continue action the student drives.
  const router = useRouter();
  const [summary, setSummary] = useState<{
    nextLessonSlug: string | null;
    courseSlug: string;
    completed: boolean;
  } | null>(null);
  const markComplete = trpc.lesson.markComplete.useMutation({
    onSuccess: (data) => {
      setSummary({
        nextLessonSlug: data.nextLessonSlug,
        courseSlug: data.courseSlug,
        completed: data.completed,
      });
    },
  });

  const goAfterLesson = () => {
    if (summary?.nextLessonSlug) {
      router.push(`/student/lesson/${summary.nextLessonSlug}`);
    } else {
      router.push(`/course/${lesson.courseSlug}`);
    }
    router.refresh();
  };

  const initialAi = lesson.intro ?? "Let's break this down step by step.";
  // No fabricated citation on the opening message (R29) — real citations
  // arrive on streamed tutor replies via findCitation. A fake "p. 142"
  // undermines the cite-the-textbook trust story the whole tutor sells.
  const [messages, setMessages] = useState<Msg[]>([
    {
      from: "ai",
      step: "WELCOME",
      text: initialAi,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const tutorSessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || streaming) return;
    setInput("");

    // Build history snapshot for the request *before* we append the new user
    // message — the server adds the new user turn itself.
    const history = messages
      .filter((m): m is Msg & { from: "you" | "ai" } => !!m.text)
      .map((m) => ({
        role: m.from === "you" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      }));

    // Optimistic UI: append user turn + an empty streaming assistant turn.
    setMessages((m) => [
      ...m,
      { from: "you", text: value },
      { from: "ai", text: "", streaming: true },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/tutor/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          lessonId: lesson.id,
          sessionId: tutorSessionIdRef.current,
          message: value,
          history,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // Stream loop. Each line of the body is one NDJSON event.
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: {
            type: string;
            text?: string;
            sessionId?: string;
            citation?: string;
            message?: string;
          };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "start" && ev.sessionId) {
            tutorSessionIdRef.current = ev.sessionId;
          } else if (ev.type === "delta" && ev.text) {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last && last.from === "ai" && last.streaming) {
                next[next.length - 1] = {
                  ...last,
                  text: last.text + ev.text,
                };
              }
              return next;
            });
          } else if (ev.type === "cite" && ev.citation) {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last && last.from === "ai") {
                next[next.length - 1] = { ...last, cite: ev.citation };
              }
              return next;
            });
          } else if (ev.type === "error") {
            throw new Error(ev.message ?? "stream error");
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last && last.from === "ai" && last.streaming) {
          next[next.length - 1] = {
            ...last,
            text: `(Couldn't reach the tutor: ${msg})`,
            streaming: false,
          };
        }
        return next;
      });
    } finally {
      // Clear streaming flag on the final assistant message.
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last && last.streaming) {
          next[next.length - 1] = { ...last, streaming: false };
        }
        return next;
      });
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleCheck = () => {
    if (selected === null || !question) return;
    const chosenKey = question.answers[selected].key;
    setChecked(true);
    attempt.mutate({
      questionId: question.id,
      chosenKey,
      hintsUsed: 0,
      timeMs: 0,
    });
  };

  const next = () => {
    // On the last question, "Next" turns into "Lesson complete →" —
    // fire the completion mutation and let its onSuccess navigate
    // forward. The old version called setQIdx with a Math.min clamp,
    // which on the last question evaluated to the same index, so the
    // button visibly did nothing.
    if (qIdx >= lesson.questions.length - 1) {
      markComplete.mutate({ lessonId: lesson.id });
      return;
    }
    setChecked(false);
    setSelected(null);
    setFeedback(null);
    setQIdx((i) => i + 1);
  };

  const isLastQuestion = qIdx >= lesson.questions.length - 1;
  const isCorrect = feedback?.correct === true;

  return (
    <>
      <div
        style={{
          padding: "14px 28px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <Link
          href={`/course/${lesson.courseSlug}`}
          aria-label="Back"
          style={{ color: "inherit" }}
        >
          <Icon
            name="arrow"
            size={16}
            color="var(--wf-body)"
            style={{ transform: "rotate(180deg)" }}
          />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="wf-mono"
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              letterSpacing: ".04em",
            }}
          >
            {lesson.courseLabel}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{lesson.title}</div>
        </div>
        {/* Live earned XP this lesson — was a hardcoded 120 (R29 honesty
            pass). The Pin/Notes/Offline buttons were dead (Offline now
            lives as the real "Save offline" on the library card) and were
            removed. */}
        <XPChip value={xpEarned} sm />
      </div>

      <div
        className="wf-reader-cols"
        style={{
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* TOC */}
        <aside
          style={{
            borderRight: "1px solid var(--wf-hairline)",
            padding: "18px 16px",
            overflow: "auto",
          }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>In this lesson</Eyebrow>
          {lesson.steps.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "var(--wf-mute)" }}
            >
              No steps defined for this lesson yet.
            </div>
          ) : (
            // Neutral outline (R29): the old version fabricated
            // done/current/locked states ("first 3 done") with no real
            // per-step progress behind them. Until step-level progress is
            // tracked, render the authored steps as a plain list — a
            // hollow marker, the title, AI sparkle, and duration.
            lesson.steps.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--wf-hairline)",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "1px solid var(--wf-hairline)",
                    background: "var(--wf-fillsoft)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--wf-ink)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {s.title}{" "}
                    {s.isAi && (
                      <Icon name="sparkles" size={10} color="var(--wf-ai)" />
                    )}
                  </div>
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--wf-mute)",
                      marginTop: 2,
                    }}
                  >
                    {s.durationLabel ?? ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </aside>

        {/* Content */}
        <main style={{ overflow: "auto", padding: "32px 48px" }}>
          {summary ? (
            <LessonComplete
              summary={summary}
              total={lesson.questions.length}
              correct={correctCount}
              xp={xpEarned}
              onContinue={goAfterLesson}
            />
          ) : (
          <>
          {/* Teacher-authored blocks render first (when present). The
              existing Question flow below stays as the primary
              practice surface until Block-driven attempts ship. */}
          {lesson.blocks.length > 0 && (
            <section style={{ marginBottom: 24, maxWidth: 720 }}>
              {lesson.blocks.map((b) => (
                <BlockReader key={b.id} block={b} />
              ))}
              {/* Blocks-only lessons have no quiz UI underneath, which
                  meant students could read every block but never mark
                  the lesson done — Enrollment.progressPct stayed at
                  whatever it was and the course could never advance.
                  This bottom-of-lesson button is the only completion
                  signal for the modern (Block-authored) lesson shape.
                  Lessons that ALSO have legacy questions use the
                  "Lesson complete →" button at the end of the quiz
                  UI instead. */}
              {lesson.questions.length === 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    borderTop: "1px solid var(--wf-hairline)",
                    paddingTop: 16,
                    marginTop: 8,
                  }}
                >
                  <Btn
                    variant="primary"
                    className="st-pop"
                    onClick={() =>
                      markComplete.mutate({ lessonId: lesson.id })
                    }
                    disabled={markComplete.isPending}
                  >
                    {markComplete.isPending
                      ? t("completing")
                      : t("markComplete")}
                  </Btn>
                </div>
              )}
            </section>
          )}
          {!question ? (
            lesson.blocks.length === 0 && (
              <Card p={32} style={{ textAlign: "center" }}>
                <Eyebrow>{t("emptyTitle")}</Eyebrow>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: "var(--wf-body)",
                  }}
                >
                  {t("emptyBody")}
                </div>
                <Link
                  href={`/course/${lesson.courseSlug}`}
                  style={{ textDecoration: "none" }}
                >
                  <Btn variant="ghost" sm style={{ marginTop: 14 }}>
                    {t("backToCourse")}
                  </Btn>
                </Link>
              </Card>
            )
          ) : (
            <>
              <Annot style={{ marginBottom: 12 }}>
                Practice question {qIdx + 1} of {lesson.questions.length}
              </Annot>
              <h1 className="wf-h1" style={{ fontSize: 24, marginBottom: 8 }}>
                Try it yourself
              </h1>
              <div
                style={{
                  fontSize: 14,
                  marginBottom: 24,
                  maxWidth: 540,
                  color: "var(--wf-body)",
                }}
              >
                {question.stem}
              </div>

              {/* Pizza pie visual aid for the fractions question */}
              {lesson.slug === "multiplying-fractions" && (
                <Card p={20} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <Eyebrow>Drag slices to model the problem</Eyebrow>
                    <Annot>Interactive widget</Annot>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      justifyContent: "center",
                      padding: "20px 0",
                    }}
                  >
                    {[0, 1, 2, 3].map((p) => (
                      <PizzaPie key={p} eaten={3} total={8} />
                    ))}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--wf-mute)",
                    }}
                  >
                    3 + 3 + 3 + 3 ={" "}
                    <b style={{ color: "var(--wf-ink)" }}>?</b> slices
                  </div>
                </Card>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                {question.answers.map((a, i) => {
                  const isSelected = selected === i;
                  const correct = checked && a.key === feedback?.correctKey;
                  const incorrect =
                    checked && isSelected && a.key !== feedback?.correctKey;
                  return (
                    <button
                      key={a.key}
                      className="wf-answer"
                      data-selected={isSelected && !checked}
                      data-correct={correct}
                      data-incorrect={incorrect}
                      disabled={checked}
                      onClick={() => {
                        if (!checked) setSelected(i);
                      }}
                    >
                      <span
                        className="wf-mono"
                        style={{ marginRight: 10, opacity: 0.7 }}
                      >
                        {a.key}
                      </span>
                      · {a.text}
                    </button>
                  );
                })}
              </div>

              {checked && feedback && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 14,
                    borderRadius: 4,
                    background: isCorrect
                      ? "#e7f4ee"
                      : "var(--wf-accent-soft)",
                    border: `1px solid ${
                      isCorrect ? "var(--wf-good)" : "var(--wf-accent)"
                    }`,
                    fontSize: 13,
                    color: "var(--wf-body)",
                  }}
                >
                  <b
                    style={{
                      color: isCorrect
                        ? "var(--wf-good)"
                        : "var(--wf-accent)",
                      marginRight: 6,
                    }}
                  >
                    {isCorrect ? "Correct!" : "Not quite."}
                  </b>
                  {isCorrect
                    ? `+${feedback.points} XP awarded.`
                    : `The right answer was ${feedback.correctKey}. Open the AI tutor for help.`}
                </div>
              )}

              {attempt.isError && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 14,
                    border: "1px solid var(--wf-accent)",
                    background: "var(--wf-accent-soft)",
                    fontSize: 12,
                    color: "var(--wf-accent)",
                    borderRadius: 4,
                  }}
                >
                  Couldn&apos;t record attempt: {attempt.error.message}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--wf-hairline)",
                  paddingTop: 16,
                }}
              >
                <Btn variant="ghost" disabled>
                  ← Back
                </Btn>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn
                    variant="ai"
                    icon={
                      <Icon
                        name="sparkles"
                        size={12}
                        color="var(--wf-ai)"
                      />
                    }
                    onClick={() => send("Give me a hint without the answer")}
                  >
                    Hint from AI
                  </Btn>
                  {!checked ? (
                    <Btn
                      variant="primary"
                      disabled={selected === null || attempt.isPending}
                      onClick={handleCheck}
                    >
                      {attempt.isPending ? "Checking…" : "Check answer →"}
                    </Btn>
                  ) : (
                    <Btn
                      variant="primary"
                      className={isLastQuestion ? "st-pop" : undefined}
                      onClick={next}
                      disabled={markComplete.isPending}
                    >
                      {isLastQuestion
                        ? markComplete.isPending
                          ? t("completing")
                          : t("lessonCompleteBtn")
                        : t("nextQuestion")}
                    </Btn>
                  )}
                </div>
              </div>
            </>
          )}
          </>
          )}
        </main>

        {/* AI Tutor */}
        <aside
          style={{
            borderLeft: "1px solid var(--wf-hairline)",
            display: "flex",
            flexDirection: "column",
            background: "var(--wf-fillsoft)",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "white",
            }}
          >
            <Icon name="sparkles" size={16} color="var(--wf-ai)" />
            <div style={{ flex: 1 }}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--wf-ai)",
                }}
              >
                AI TUTOR
              </div>
              <div style={{ fontSize: 10, color: "var(--wf-mute)" }}>
                Knows this lesson · cites the textbook
              </div>
            </div>
            <Annot ai>Always available</Annot>
          </div>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              padding: 16,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((m, i) =>
              m.from === "you" ? (
                <div
                  key={i}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "var(--wf-ink)",
                    color: "white",
                    fontSize: 12,
                  }}
                >
                  {m.text}
                </div>
              ) : (
                <div key={i}>
                  <div
                    style={{
                      alignSelf: "flex-start",
                      maxWidth: "90%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "white",
                      border: "1px solid var(--wf-hairline)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.step && (
                      <div
                        className="wf-mono"
                        style={{
                          fontWeight: 600,
                          marginBottom: 4,
                          color: "var(--wf-ai)",
                          fontSize: 10,
                          letterSpacing: ".04em",
                        }}
                      >
                        {m.step}
                      </div>
                    )}
                    {m.text || (m.streaming ? "…" : "")}
                    {m.streaming && (
                      <span
                        aria-hidden
                        className="wf-pulse"
                        style={{
                          display: "inline-block",
                          width: 7,
                          height: 12,
                          marginLeft: 2,
                          background: "var(--wf-ai)",
                          verticalAlign: "text-bottom",
                          borderRadius: 1,
                        }}
                      />
                    )}
                  </div>
                  {m.cite && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--wf-mute)",
                        fontStyle: "italic",
                        paddingLeft: 4,
                        marginTop: 4,
                      }}
                    >
                      ↳ {m.cite}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
          <div
            style={{
              padding: 12,
              borderTop: "1px solid var(--wf-hairline)",
              background: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              {["Why × not +?", "Show step 2", "Quiz me"].map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    border: "1px solid var(--wf-hairline)",
                    borderRadius: 999,
                    color: "var(--wf-body)",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                border: "1px solid var(--wf-hairline)",
                borderRadius: 4,
                padding: "8px 10px",
                background: "white",
              }}
            >
              <Icon name="mic" size={14} color="var(--wf-body)" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                placeholder={streaming ? "Tutor is thinking…" : "Ask anything…"}
                style={{
                  flex: 1,
                  fontSize: 11,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  opacity: streaming ? 0.6 : 1,
                }}
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: streaming ? "not-allowed" : "pointer",
                  opacity: streaming ? 0.4 : 1,
                }}
              >
                <Icon name="arrow" size={14} color="var(--wf-body)" />
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * End-of-lesson card. Replaces the abrupt redirect that used to fire
 * the moment a lesson was marked complete. Shows the quiz score (when
 * the lesson had questions) + XP earned, and hands navigation control
 * to the student via an explicit Continue button — to the next lesson
 * when one exists, otherwise back to the course.
 */
function LessonComplete({
  summary,
  total,
  correct,
  xp,
  onContinue,
}: {
  summary: {
    nextLessonSlug: string | null;
    courseSlug: string;
    completed: boolean;
  };
  total: number;
  correct: number;
  xp: number;
  onContinue: () => void;
}) {
  const t = useTranslations("LessonReader");
  const pct = total > 0 ? Math.round((correct / total) * 100) : null;
  return (
    <Card
      p={32}
      className="st-card"
      style={{ maxWidth: 480, margin: "24px auto 0", textAlign: "center" }}
    >
      {/* Celebration moment (R19): the emoji pops in, the streak-green XP
          chip and Continue button get tactile feedback. */}
      <div
        className="st-celebrate"
        style={{ fontSize: 52, marginBottom: 4, lineHeight: 1 }}
      >
        {summary.completed ? "🎉" : "✅"}
      </div>
      <Eyebrow style={{ marginBottom: 8 }}>
        {summary.completed
          ? t("courseCompleteEyebrow")
          : t("lessonCompleteEyebrow")}
      </Eyebrow>
      <h1 className="wf-h1" style={{ fontSize: 26, marginBottom: 12 }}>
        {summary.completed
          ? t("courseCompleteHeading")
          : t("lessonCompleteHeading")}
      </h1>
      {total > 0 && (
        <div
          style={{
            fontSize: 15,
            color: "var(--wf-body)",
            marginBottom: 6,
          }}
        >
          {t("score", { correct, total })}
          {pct !== null ? ` · ${pct}%` : ""}
        </div>
      )}
      {xp > 0 && (
        <div
          className="st-celebrate wf-mono"
          style={{
            display: "inline-block",
            marginTop: 4,
            marginBottom: 18,
            fontSize: 13,
            padding: "4px 12px",
            borderRadius: 3,
            background: "var(--wf-good)",
            color: "white",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {t("xpEarned", { xp })}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Btn variant="primary" className="st-pop" onClick={onContinue}>
          {summary.nextLessonSlug ? t("nextLesson") : t("backToCourseCta")}
        </Btn>
      </div>
    </Card>
  );
}

function PizzaPie({ eaten, total }: { eaten: number; total: number }) {
  const sliceAngle = 360 / total;
  return (
    <div
      style={{
        width: 100,
        height: 100,
        border: "1.5px solid var(--wf-line)",
        borderRadius: "50%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const a1 = (i * sliceAngle - 90) * (Math.PI / 180);
        const a2 = ((i + 1) * sliceAngle - 90) * (Math.PI / 180);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              background: i < eaten ? "var(--wf-accent-soft)" : "transparent",
              clipPath: `polygon(50% 50%, ${
                50 + 50 * Math.cos(a1)
              }% ${50 + 50 * Math.sin(a1)}%, ${
                50 + 50 * Math.cos(a2)
              }% ${50 + 50 * Math.sin(a2)}%)`,
              border: "0.5px solid var(--wf-hairline)",
            }}
          />
        );
      })}
      {Array.from({ length: total - 1 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 50,
            height: 1,
            background: "var(--wf-hairline)",
            transformOrigin: "0 50%",
            transform: `rotate(${(i + 1) * sliceAngle - 90}deg)`,
          }}
        />
      ))}
    </div>
  );
}
