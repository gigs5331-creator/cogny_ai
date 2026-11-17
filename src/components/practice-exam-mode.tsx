import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { gradeOpenAnswers } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MathText } from "@/components/math-text";
import { Diagram } from "@/components/diagram";
import {
  numericallyEqual,
  parseNumeric,
  resolveQuestion,
  shuffle,
  tryLocalGrade,
  TYPE_LABELS,
} from "@/lib/question-types";
import { Check, Clock, Flag, GraduationCap, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

type ExamCard = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  topic?: string | null;
  diagram?: string | null;
  questionType?: string | null;
  options?: string[] | null;
  distractors?: string[] | null;
};

type ExamResult = {
  score: number;
  max: number;
  feedback: string;
  correct: boolean;
};

export function PracticeExamMode({
  cards,
  onComplete,
}: {
  cards: ExamCard[];
  onComplete: (score: number, total: number, timeTakenMs: number) => void;
}) {
  const gradeBatch = useServerFn(gradeOpenAnswers);

  // Setup configuration before starting exam
  const [started, setStarted] = useState(false);
  const [questionLimit, setQuestionLimit] = useState<number>(Math.min(cards.length, 25));
  const [durationMins, setDurationMins] = useState<number>(20);
  const [shuffleOrder, setShuffleOrder] = useState<boolean>(true);

  // Active exam state
  const [examCards, setExamCards] = useState<ExamCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [markingProgress, setMarkingProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ExamResult[] | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const submitExamRef = useRef<() => Promise<void>>(async () => {});

  const resolvedMeta = useMemo(
    () =>
      examCards.map((c) => {
        const r = resolveQuestion(c);
        return {
          type: r.type,
          options:
            r.type === "true_false"
              ? ["True", "False"]
              : r.options.length
                ? shuffle(r.options)
                : [],
        };
      }),
    [examCards],
  );

  // Timer countdown
  useEffect(() => {
    if (!started || results !== null || durationMins === 0) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [started, results, durationMins]);

  useEffect(() => {
    if (started && results === null && durationMins > 0 && secondsLeft === 0 && !submitting) {
      void submitExamRef.current();
    }
  }, [started, results, durationMins, secondsLeft, submitting]);

  function startExam() {
    const pool = shuffleOrder ? shuffle(cards) : [...cards];
    const selected = pool.slice(0, Math.min(cards.length, Math.max(1, questionLimit)));
    setExamCards(selected);
    setAnswers({});
    setFlagged(new Set());
    setIdx(0);
    setResults(null);
    setSecondsLeft(durationMins * 60);
    startedAtRef.current = Date.now();
    setStarted(true);
  }

  async function submitExam() {
    if (submitting || results !== null) return;
    setSubmitting(true);
    setMarkingProgress(null);
    try {
      const graded: ExamResult[] = new Array(examCards.length);
      const openIndices: number[] = [];

      for (let i = 0; i < examCards.length; i++) {
        const card = examCards[i];
        const meta = resolvedMeta[i];
        const userAns = (answers[i] ?? "").trim();

        if (!userAns) {
          graded[i] = {
            score: 0,
            max: 1,
            correct: false,
            feedback: "No answer submitted.",
          };
          continue;
        }

        if (meta.type === "multiple_choice" || meta.type === "true_false") {
          const right = userAns.toLowerCase() === card.answer.trim().toLowerCase();
          graded[i] = {
            score: right ? 1 : 0,
            max: 1,
            correct: right,
            feedback: right ? "Correct selection." : `Expected "${card.answer}".`,
          };
        } else if (meta.type === "numerical") {
          const exp = parseNumeric(card.answer);
          const got = parseNumeric(userAns);
          if (exp !== null && got !== null) {
            const right = numericallyEqual(exp, got);
            graded[i] = {
              score: right ? 1 : 0,
              max: 1,
              correct: right,
              feedback: right ? "Exact value matched." : `Expected ${card.answer}.`,
            };
          } else {
            openIndices.push(i);
          }
        } else {
          const local = tryLocalGrade(card.question, card.answer, userAns);
          if (local) {
            graded[i] = {
              score: local.score,
              max: local.max_marks,
              correct: local.correct,
              feedback: local.feedback,
            };
          } else {
            openIndices.push(i);
          }
        }
      }

      // Mark ambiguous open-ended questions in parallel batches of 8 (up to 3 concurrent)
      if (openIndices.length > 0) {
        const BATCH_SIZE = 8;
        const PARALLEL_BATCHES = 3;
        const batches: number[][] = [];
        for (let start = 0; start < openIndices.length; start += BATCH_SIZE) {
          batches.push(openIndices.slice(start, start + BATCH_SIZE));
        }

        let done = 0;
        setMarkingProgress({ done: 0, total: openIndices.length });

        let cursor = 0;
        const worker = async () => {
          while (true) {
            const bIdx = cursor++;
            if (bIdx >= batches.length) return;
            const sliceIdx = batches[bIdx];
            try {
              const res = await gradeBatch({
                data: {
                  items: sliceIdx.map((qIdx) => ({
                    question: examCards[qIdx].question,
                    expected: examCards[qIdx].answer,
                    userAnswer: answers[qIdx] ?? "",
                  })),
                },
              });
              sliceIdx.forEach((qIdx, j) => {
                const g = res.grades[j] ?? { score: 0, max_marks: 1, feedback: "Graded." };
                graded[qIdx] = {
                  score: g.score,
                  max: g.max_marks,
                  correct: g.score >= g.max_marks,
                  feedback: g.feedback,
                };
              });
            } catch {
              sliceIdx.forEach((qIdx) => {
                graded[qIdx] = {
                  score: 0,
                  max: 1,
                  correct: false,
                  feedback: "Automatic grader offline — compare against model answer.",
                };
              });
            }
            done += sliceIdx.length;
            setMarkingProgress({ done, total: openIndices.length });
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker),
        );
      }

      setResults(graded);
      const totalScore = graded.reduce((s, r) => s + r.score, 0);
      const totalMax = graded.reduce((s, r) => s + r.max, 0);
      onComplete(totalScore, totalMax, Date.now() - startedAtRef.current);
      toast.success("Practice examination marked.");
    } finally {
      setMarkingProgress(null);
      setSubmitting(false);
    }
  }
  submitExamRef.current = submitExam;

  if (cards.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No questions available.</p>;
  }

  /* ---------- EXAM CONFIGURATION SCREEN ---------- */
  if (!started) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">
              Configure Practice Examination
            </h2>
            <p className="text-sm text-muted-foreground">
              Timed assessment across {cards.length} available question(s) with automatic marking and topic diagnostics.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="exam-count" className="text-xs">
              Number of questions (max {cards.length})
            </Label>
            <Input
              id="exam-count"
              type="number"
              min={1}
              max={cards.length}
              value={questionLimit}
              onChange={(e) =>
                setQuestionLimit(Math.max(1, Math.min(cards.length, Number(e.target.value) || 1)))
              }
              className="mt-1 font-mono tabular-nums"
            />
          </div>
          <div>
            <Label className="text-xs">Time limit</Label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {[
                { label: "15m", mins: 15 },
                { label: "30m", mins: 30 },
                { label: "60m", mins: 60 },
                { label: "None", mins: 0 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDurationMins(opt.mins)}
                  className={`rounded-md border py-2 text-xs font-medium transition ${
                    durationMins === opt.mins
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm">
          <span>Randomise question order</span>
          <input
            type="checkbox"
            checked={shuffleOrder}
            onChange={(e) => setShuffleOrder(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </div>

        <Button onClick={startExam} size="lg" className="w-full shadow-brand">
          Begin Practice Examination
        </Button>
      </div>
    );
  }

  /* ---------- EXAM PERFORMANCE REPORT ---------- */
  if (results) {
    const score = results.reduce((s, r) => s + r.score, 0);
    const max = results.reduce((s, r) => s + r.max, 0);
    const pct = max > 0 ? Math.round((score / max) * 100) : 0;

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Examination Performance Report
          </p>
          <div className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground">
            {score} <span className="text-xl text-muted-foreground">/ {max}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            Final Grade: <span className="font-semibold text-foreground">{pct}%</span> ·{" "}
            {examCards.length} questions assessed
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button onClick={() => setStarted(false)} variant="outline">
              <RotateCcw className="h-4 w-4 mr-1.5" /> Configure New Exam
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {examCards.map((q, i) => {
            const res = results[i];
            return (
              <div key={q.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {res.correct ? (
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    ) : (
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    )}
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">
                        Question {i + 1} · {q.topic ?? "General"}
                      </div>
                      <p className="mt-1 font-mono text-sm text-foreground">
                        <MathText>{q.question}</MathText>
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                    {res.score}/{res.max}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 pl-7 text-sm">
                  <div>
                    <span className="text-muted-foreground">Your answer: </span>
                    <span className="text-foreground">
                      {answers[i] ? <MathText>{answers[i]}</MathText> : <em>(unanswered)</em>}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Model answer: </span>
                    <span className="font-medium text-foreground">
                      <MathText>{q.answer}</MathText>
                    </span>
                  </div>
                  <p className="text-xs text-primary">{res.feedback}</p>
                  {q.explanation && (
                    <p className="text-xs text-muted-foreground">
                      <MathText>{q.explanation}</MathText>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------- ACTIVE TIMED EXAMINATION INTERFACE ---------- */
  const q = examCards[idx];
  const meta = resolvedMeta[idx];
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const answeredCount = Object.keys(answers).filter((k) => answers[Number(k)]?.trim()).length;

  return (
    <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-12">
      {/* Main Question Area */}
      <div className="lg:col-span-8 space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div className="font-mono text-xs font-semibold tabular-nums text-foreground">
            Question {idx + 1} of {examCards.length}
          </div>
          {durationMins > 0 && (
            <div
              className={`flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums ${
                secondsLeft < 120 ? "text-destructive" : "text-primary"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {TYPE_LABELS[meta.type]}
            </span>
            <button
              type="button"
              onClick={() =>
                setFlagged((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                })
              }
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                flagged.has(idx) ? "text-warning" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Flag className="h-3.5 w-3.5" /> {flagged.has(idx) ? "Flagged" : "Flag for review"}
            </button>
          </div>

          <div className="font-mono text-base leading-relaxed text-foreground">
            <MathText>{q.question}</MathText>
          </div>

          <Diagram svg={q.diagram} />

          {meta.type === "multiple_choice" || meta.type === "true_false" ? (
            <div className="grid gap-2.5">
              {meta.options.map((opt, i) => {
                const picked = answers[idx] === opt;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [idx]: opt }))}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                      picked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border bg-card font-mono text-xs font-semibold">
                      {meta.type === "true_false" ? opt[0] : String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">
                      <MathText>{opt}</MathText>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : meta.type === "numerical" ? (
            <Input
              inputMode="decimal"
              value={answers[idx] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
              placeholder="Enter numerical value…"
            />
          ) : (
            <Textarea
              rows={meta.type === "essay" ? 7 : 4}
              value={answers[idx] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
              placeholder="Write your response…"
            />
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            {idx < examCards.length - 1 ? (
              <Button size="sm" onClick={() => setIdx((i) => i + 1)}>
                Next Question
              </Button>
            ) : (
              <Button size="sm" onClick={submitExam} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{" "}
                    {markingProgress
                      ? `Marking ${markingProgress.done}/${markingProgress.total}…`
                      : "Marking Exam…"}
                  </>
                ) : (
                  "Submit Examination"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Question Palette Sidebar */}
      <aside className="lg:col-span-4 rounded-xl border border-border bg-card p-5 space-y-4 h-fit">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Question Navigator</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {answeredCount}/{examCards.length} answered
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {examCards.map((_, i) => {
            const isAnswered = Boolean(answers[i]?.trim());
            const isFlag = flagged.has(i);
            const current = idx === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-8 rounded-md border font-mono text-xs tabular-nums transition ${
                  current
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : isFlag
                      ? "border-warning bg-warning/15 text-foreground"
                      : isAnswered
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <Button
          onClick={submitExam}
          disabled={submitting}
          variant="default"
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{" "}
              {markingProgress
                ? `Marking ${markingProgress.done}/${markingProgress.total}…`
                : "Marking…"}
            </>
          ) : (
            "Finish & Mark Exam"
          )}
        </Button>
      </aside>
    </div>
  );
}
