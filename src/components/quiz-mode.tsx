import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { gradeOpenAnswers } from "@/lib/ai.functions";
import {
  Loader2,
  Sparkles,
  Check,
  X,
  ChevronRight,
  Trophy,
  PartyPopper,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { MathText } from "@/components/math-text";
import { Diagram } from "@/components/diagram";
import {
  resolveQuestion,
  numericallyEqual,
  parseNumeric,
  shuffle,
  tryLocalGrade,
  TYPE_INSTRUCTIONS,
  TYPE_LABELS,
  type QuestionType,
} from "@/lib/question-types";

type Card = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  diagram?: string | null;
  questionType?: string | null;
  options?: string[] | null;
  distractors?: string[] | null;
};

type Grade = { score: number; max_marks: number; feedback: string };

export function QuizMode({
  cards,
  onComplete,
  onAnswered,
}: {
  cards: Card[];
  onComplete: (score: number, total: number) => void;
  onAnswered?: (score: number, total: number) => void;
}) {
  const grade = useServerFn(gradeOpenAnswers);
  const quiz = useMemo(() => cards, [cards]);

  const resolved = useMemo(
    () =>
      quiz.map((c) => {
        const r = resolveQuestion(c);
        return {
          type: r.type as QuestionType,
          options:
            r.type === "true_false" ? ["True", "False"] : r.options.length ? shuffle(r.options) : [],
        };
      }),
    [quiz],
  );
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [finished, setFinished] = useState(false);
  const hasCompletedRef = useRef(false);

  async function submitCurrent() {
    if (grading) return;
    const answer = current.trim();
    if (!answer) return;
    const type = resolved[idx]?.type ?? "short_answer";
    setAnswers((a) => [...a, answer]);

    if (type === "multiple_choice" || type === "true_false") {
      const correct = answer.trim().toLowerCase() === quiz[idx].answer.trim().toLowerCase();
      const g: Grade = {
        score: correct ? 1 : 0,
        max_marks: 1,
        feedback: correct
          ? "Correct — well selected."
          : `Not quite — the correct answer is "${quiz[idx].answer}".`,
      };
      setGrades((gs) => [...gs, g]);
      onAnswered?.(g.score, g.max_marks);
      setRevealed(true);
      return;
    }

    if (type === "numerical") {
      const expected = parseNumeric(quiz[idx].answer);
      const got = parseNumeric(answer);
      if (expected !== null && got !== null) {
        const correct = numericallyEqual(expected, got);
        const g: Grade = {
          score: correct ? 1 : 0,
          max_marks: 1,
          feedback: correct
            ? "Correct — your value matches."
            : `Not quite — the expected value is ${quiz[idx].answer}.`,
        };
        setGrades((gs) => [...gs, g]);
        onAnswered?.(g.score, g.max_marks);
        setRevealed(true);
        return;
      }
    }

    const local = tryLocalGrade(quiz[idx].question, quiz[idx].answer, answer);
    if (local) {
      const g: Grade = {
        score: local.score,
        max_marks: local.max_marks,
        feedback: local.feedback,
      };
      setGrades((gs) => [...gs, g]);
      onAnswered?.(g.score, g.max_marks);
      setRevealed(true);
      return;
    }

    setGrading(true);
    let g: Grade = { score: 0, max_marks: 1, feedback: "Couldn't grade — please try again." };
    try {
      const r = await grade({
        data: { items: [{ question: quiz[idx].question, expected: quiz[idx].answer, userAnswer: answer }] },
      });
      if (r.grades?.[0]) g = r.grades[0];
    } catch (e: any) {
      toast.error(e?.message ?? "Grading failed");
    } finally {
      setGrading(false);
    }
    setGrades((gs) => [...gs, g]);
    onAnswered?.(g.score, g.max_marks);
    setRevealed(true);
  }

  function next() {
    setCurrent("");
    setRevealed(false);
    setIdx((i) => {
      const ni = i + 1;
      if (ni >= quiz.length) setFinished(true);
      return ni;
    });
  }

  const totals = useMemo(() => {
    const score = grades.reduce((s, g) => s + g.score, 0);
    const max = grades.reduce((s, g) => s + g.max_marks, 0);
    return { score, max, pct: max > 0 ? Math.round((score / max) * 100) : 0 };
  }, [grades]);

  useEffect(() => {
    if (!finished || hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    onComplete?.(totals.score, totals.max);
  }, [finished, totals, onComplete]);

  if (quiz.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No questions available yet.</p>;
  }

  if (finished) {
    const { score, max, pct } = totals;
    const tone =
      pct >= 80
        ? "Outstanding work!"
        : pct >= 60
          ? "Solid effort — keep going!"
          : pct >= 40
            ? "Good start — review missed items."
            : "Keep practising — every session strengthens retention.";

    function playAgain() {
      hasCompletedRef.current = false;
      setAnswers([]);
      setCurrent("");
      setIdx(0);
      setGrades([]);
      setFinished(false);
      setRevealed(false);
    }

    function shareOnWhatsApp() {
      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "https://cogny-ai.lovable.app";
      const deckUrl = typeof window !== "undefined" ? window.location.href : baseUrl;
      const msg = encodeURIComponent(
        `I scored ${score}/${max} (${pct}%) on a COGNY quiz! Practise it here: ${deckUrl}`,
      );
      window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
    }

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {pct >= 60 ? <Trophy className="h-6 w-6" /> : <PartyPopper className="h-6 w-6" />}
          </div>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight tabular-nums text-foreground">
            {score} <span className="text-2xl text-muted-foreground">/ {max}</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {pct}% · {tone}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={playAgain} size="lg">
              Practise again
            </Button>
            <Button onClick={shareOnWhatsApp} size="lg" variant="outline">
              <MessageCircle className="h-4 w-4 mr-2 text-success" /> Share on WhatsApp
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {quiz.map((q, i) => {
            const g = grades[i] ?? { score: 0, max_marks: 1, feedback: "Not answered." };
            const full = g.score >= g.max_marks;
            const partial = g.score > 0 && !full;

            return (
              <div key={q.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  {full ? (
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : partial ? (
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-mono text-sm text-foreground">
                        <span className="text-muted-foreground mr-1.5 tabular-nums">#{i + 1}</span>
                        <MathText>{q.question}</MathText>
                      </p>
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                        {g.score}/{g.max_marks}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">Your answer: </span>
                      {answers[i] ? (
                        <MathText>{answers[i]}</MathText>
                      ) : (
                        <em className="text-muted-foreground">(skipped)</em>
                      )}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Model answer: </span>
                      <span className="font-medium text-foreground">
                        <MathText>{q.answer}</MathText>
                      </span>
                    </p>
                    <p className="mt-2 text-xs text-primary">{g.feedback}</p>
                    {q.explanation && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <MathText>{q.explanation}</MathText>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const q = quiz[idx];
  const meta = resolved[idx] ?? { type: "short_answer" as QuestionType, options: [] as string[] };
  const isChoice = meta.type === "multiple_choice" || meta.type === "true_false";
  const progress = ((idx + 1) / quiz.length) * 100;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          Question {idx + 1} / {quiz.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="perspective">
        <div
          className={`preserve-3d flip-transition relative grid w-full rounded-2xl ${
            revealed ? "rotate-y-180" : ""
          }`}
        >
          {/* FRONT */}
          <div className="backface-hidden [grid-area:1/1] flex flex-col rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="font-semibold uppercase text-primary">{TYPE_LABELS[meta.type]}</span>
              <span>· {TYPE_INSTRUCTIONS[meta.type]}</span>
            </div>
            <p className="font-mono text-base sm:text-lg leading-relaxed break-words text-foreground">
              <MathText>{q.question}</MathText>
            </p>
            <Diagram svg={q.diagram} />
            <div className="mt-6 flex-1">
              {isChoice ? (
                <div className={`grid gap-2.5 ${meta.type === "true_false" ? "grid-cols-2" : ""}`}>
                  {meta.options.map((opt, i) => {
                    const isSel = current === opt;
                    return (
                      <button
                        key={`${opt}-${i}`}
                        type="button"
                        onClick={() => setCurrent(opt)}
                        className={`rounded-xl border px-3.5 py-3 text-left transition ${
                          isSel
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`shrink-0 grid h-6 w-6 place-items-center rounded-md border font-mono text-xs font-semibold ${
                              isSel
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-foreground"
                            }`}
                          >
                            {meta.type === "true_false" ? opt[0] : String.fromCharCode(65 + i)}
                          </span>
                          <span className="min-w-0 flex-1 break-words text-sm text-foreground">
                            <MathText>{opt}</MathText>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : meta.type === "numerical" ? (
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCurrent();
                    }
                  }}
                  placeholder="e.g. 12.5"
                  className="text-base"
                />
              ) : (
                <Textarea
                  autoFocus
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      submitCurrent();
                    }
                  }}
                  placeholder={
                    meta.type === "essay"
                      ? "Explain your answer using relevant concepts…"
                      : "Answer briefly and clearly…"
                  }
                  rows={meta.type === "essay" ? 8 : 4}
                  className="text-base"
                />
              )}
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {isChoice
                  ? "Select an option to submit."
                  : meta.type === "numerical"
                    ? "Enter to submit"
                    : "Ctrl/Cmd + Enter to submit"}
              </p>
              <Button onClick={submitCurrent} disabled={!current.trim() || grading} size="lg">
                {grading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Marking…
                  </>
                ) : (
                  "Submit answer"
                )}
              </Button>
            </div>
          </div>

          {/* BACK */}
          <div className="backface-hidden rotate-y-180 [grid-area:1/1] flex flex-col rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Check className="h-4 w-4" /> Answer revealed
              </span>
              {grades[idx] && (
                <span
                  className={`font-mono tabular-nums ${
                    grades[idx].score >= grades[idx].max_marks
                      ? "text-success"
                      : grades[idx].score > 0
                        ? "text-warning"
                        : "text-destructive"
                  }`}
                >
                  {grades[idx].score}/{grades[idx].max_marks} marks
                </span>
              )}
            </div>
            {grades[idx]?.feedback && (
              <p className="mt-3 text-xs text-primary">{grades[idx].feedback}</p>
            )}

            <div className="mt-4">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Your answer
              </span>
              <p className="mt-1 text-sm text-foreground">
                {current ? <MathText>{current}</MathText> : "(blank)"}
              </p>
            </div>

            <div className="mt-4">
              <span className="font-mono text-xs uppercase tracking-wider text-primary">
                Correct answer
              </span>
              <p className="mt-1 font-display text-lg font-semibold text-foreground">
                <MathText>{q.answer}</MathText>
              </p>
              <Diagram svg={q.diagram} />
            </div>

            {q.explanation && (
              <div className="mt-5">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Explanation
                </span>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  <MathText>{q.explanation}</MathText>
                </p>
              </div>
            )}

            <Button onClick={next} className="mt-auto pt-4" size="lg">
              {idx === quiz.length - 1 ? "Finish quiz" : "Next question"}{" "}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
