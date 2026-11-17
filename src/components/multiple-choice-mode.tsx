import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check, X, Trophy, PartyPopper, MessageCircle, RotateCcw, ChevronRight, Sparkles, Lock } from "lucide-react";
import { MathText } from "@/components/math-text";
import { Diagram } from "@/components/diagram";
import { resolveQuestion, TYPE_INSTRUCTIONS, TYPE_LABELS } from "@/lib/question-types";

type Card = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  topic?: string | null;
  distractors?: string[] | null;
  diagram?: string | null;
  questionType?: string | null;
  options?: string[] | null;
};

type Option = { text: string; correct: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normaliseLen(s: string, target: number): string {
  const max = Math.max(target + 30, Math.round(target * 1.4));
  if (s.length > max) return s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

function buildOptions(card: Card, all: Card[]): Option[] {
  const resolved = resolveQuestion(card);

  if (resolved.options.length >= 2) {
    const answer = card.answer.trim().toLowerCase();
    const opts = resolved.options.map((text) => ({
      text,
      correct: text.trim().toLowerCase() === answer,
    }));
    if (!opts.some((o) => o.correct)) opts[0] = { text: card.answer, correct: true };
    return resolved.type === "true_false" ? opts : shuffle(opts);
  }

  let distractors: string[] = [];
  if (card.distractors && card.distractors.length >= 3) {
    distractors = card.distractors.slice(0, 3);
  } else {
    const sameTopic = all
      .filter((c) => c.id !== card.id && c.topic && card.topic && c.topic === card.topic)
      .map((c) => c.answer);
    const others = all.filter((c) => c.id !== card.id).map((c) => c.answer);
    const pool =
      sameTopic.length >= 3
        ? sameTopic
        : [...sameTopic, ...others.filter((a) => !sameTopic.includes(a))];
    distractors = shuffle(pool).slice(0, 3);
    while (distractors.length < 3) distractors.push("—");
  }
  const target = card.answer.length;
  const opts: Option[] = [
    { text: card.answer, correct: true },
    ...distractors.map((t) => ({ text: normaliseLen(t, target), correct: false })),
  ];
  return shuffle(opts);
}

export function MultipleChoiceMode({
  deckId,
  cards,
  onComplete,
  onAnswered,
  part = 0,
  guestLimit,
}: {
  deckId: string;
  cards: Card[];
  onComplete: (score: number, total: number) => void;
  onAnswered?: (score: number, total: number) => void;
  part?: number;
  guestLimit?: number;
}) {
  const quiz = useMemo(() => cards, [cards]);
  const storageKey = `mc:${deckId}:p${part}`;

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [resumed, setResumed] = useState(false);
  const optionsRef = useRef<Option[][]>([]);
  const completedRef = useRef(false);

  if (optionsRef.current.length === 0 && quiz.length > 0) {
    optionsRef.current = quiz.map((c) => buildOptions(c, quiz));
  }

  useEffect(() => {
    if (resumed || quiz.length === 0) return;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s.idx === "number" && Array.isArray(s.answers) && s.total === quiz.length) {
          setIdx(s.idx);
          setAnswers(s.answers);
        }
      }
    } catch {
      /* ignore */
    }
    setResumed(true);
  }, [resumed, quiz.length, storageKey]);

  useEffect(() => {
    if (!resumed || finished) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ idx, answers, total: quiz.length, ts: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }, [idx, answers, quiz.length, storageKey, resumed, finished]);

  function pick(optionIdx: number) {
    if (selected !== null) return;
    setSelected(optionIdx);
    setAnswers((a) => {
      const next = [...a];
      next[idx] = optionIdx;
      return next;
    });
    setRevealed(true);
    const isCorrect = Boolean(optionsRef.current[idx]?.[optionIdx]?.correct);
    onAnswered?.(isCorrect ? 1 : 0, 1);
  }

  function next() {
    setSelected(null);
    setRevealed(false);
    setIdx((i) => {
      const ni = i + 1;
      if (ni >= quiz.length) setFinished(true);
      return ni;
    });
  }

  function restart() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    optionsRef.current = quiz.map((c) => buildOptions(c, quiz));
    completedRef.current = false;
    setAnswers([]);
    setSelected(null);
    setIdx(0);
    setFinished(false);
    setRevealed(false);
  }

  const score = useMemo(() => {
    let s = 0;
    answers.forEach((a, i) => {
      if (a !== null && a !== undefined && optionsRef.current[i]?.[a]?.correct) s++;
    });
    return s;
  }, [answers]);

  useEffect(() => {
    if (!finished || completedRef.current) return;
    completedRef.current = true;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    onComplete?.(score, quiz.length);
  }, [finished, score, quiz.length, onComplete, storageKey]);

  if (quiz.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No questions in this deck yet.</p>;
  }

  if (finished) {
    const pct = Math.round((score / quiz.length) * 100);
    const tone =
      pct >= 80
        ? "Outstanding!"
        : pct >= 60
          ? "Solid work — keep going!"
          : pct >= 40
            ? "Good start — review missed items."
            : "Keep practising — consistency pays off.";
    function shareWA() {
      const url = typeof window !== "undefined" ? window.location.href : "";
      const msg = encodeURIComponent(
        `I scored ${score}/${quiz.length} (${pct}%) on a COGNY quiz! Practise it here: ${url}`,
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
            {score} <span className="text-2xl text-muted-foreground">/ {quiz.length}</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {pct}% · {tone}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={restart} size="lg">
              <RotateCcw className="h-4 w-4 mr-2" /> Play again
            </Button>
            <Button onClick={shareWA} size="lg" variant="outline">
              <MessageCircle className="h-4 w-4 mr-2 text-success" /> Share on WhatsApp
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {quiz.map((q, i) => {
            const pickIdx = answers[i];
            const opts = optionsRef.current[i] ?? [];
            const correctIdx = opts.findIndex((o) => o.correct);
            const right = pickIdx !== null && pickIdx !== undefined && opts[pickIdx]?.correct;
            return (
              <div key={q.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  {right ? (
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-foreground">
                      <span className="mr-1.5 text-muted-foreground tabular-nums">#{i + 1}</span>
                      <MathText>{q.question}</MathText>
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">Your answer: </span>
                      {pickIdx !== null && pickIdx !== undefined ? (
                        <MathText>{opts[pickIdx]?.text}</MathText>
                      ) : (
                        <em className="text-muted-foreground">(skipped)</em>
                      )}
                    </p>
                    {!right && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">Correct: </span>
                        <span className="font-medium text-foreground">
                          <MathText>{opts[correctIdx]?.text}</MathText>
                        </span>
                      </p>
                    )}
                    {q.explanation && (
                      <p className="mt-2 text-xs text-muted-foreground">
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
  const opts = optionsRef.current[idx] ?? [];
  const progress = ((idx + 1) / quiz.length) * 100;

  if (guestLimit !== undefined && idx >= guestLimit) {
    const nextPath =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "";
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
            Create a free account to continue
          </h2>
          <p className="mt-2 mx-auto max-w-md text-sm text-muted-foreground">
            You completed {guestLimit} preview questions. Sign up free to unlock the entire bank, save analytics, and access Study Studio.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="lg">
              <Link to="/login" search={{ mode: "signup", ...(nextPath ? { next: nextPath } : {}) }}>
                <Sparkles className="h-4 w-4 mr-2" /> Sign up free
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login" search={{ mode: "signin", ...(nextPath ? { next: nextPath } : {}) }}>
                Sign in
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
              <span className="font-semibold uppercase text-primary">
                {TYPE_LABELS[resolveQuestion(q).type === "true_false" ? "true_false" : "multiple_choice"]}
              </span>
              <span>
                ·{" "}
                {resolveQuestion(q).type === "true_false"
                  ? TYPE_INSTRUCTIONS.true_false
                  : TYPE_INSTRUCTIONS.multiple_choice}
              </span>
            </div>
            <p className="font-mono text-base sm:text-lg leading-relaxed break-words text-foreground">
              <MathText>{q.question}</MathText>
            </p>
            <Diagram svg={q.diagram} />
            <div className="mt-5 flex-1 grid gap-2.5 auto-rows-fr">
              {opts.map((o, i) => {
                const isSel = selected === i;
                return (
                  <button
                    key={i}
                    disabled={selected !== null}
                    onClick={() => pick(i)}
                    className={`h-full rounded-xl border px-3.5 py-3 text-left transition ${
                      isSel
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/50"
                    } disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="shrink-0 grid h-6 w-6 place-items-center rounded-md border border-border bg-card font-mono text-xs font-semibold text-foreground">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-sm text-foreground [&_.katex]:whitespace-normal [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:max-w-full">
                        <MathText>{o.text}</MathText>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BACK */}
          <div className="backface-hidden rotate-y-180 [grid-area:1/1] flex flex-col rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {selected !== null && opts[selected]?.correct ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <Check className="h-4 w-4" /> Correct
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <X className="h-4 w-4" /> Incorrect
                </span>
              )}
            </div>

            <div className="mt-4">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Your answer
              </span>
              <p className="mt-1 text-sm text-foreground">
                {selected !== null ? <MathText>{opts[selected]?.text}</MathText> : "(none)"}
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
