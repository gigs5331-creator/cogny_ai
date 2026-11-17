import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-text";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  FolderOpen,
  PlayCircle,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  getProgress,
  listMaterials,
  listOfflineDecks,
  listQuizAttempts,
  listSubjects,
  makeOfflineId,
  queueStudyEvent,
  recordLocalAnswer,
  removeMaterial,
  saveQuizAttempt,
  type OfflineMaterial,
  type OfflineProgress,
  type OfflineQuizAttempt,
  type OfflineSubject,
} from "@/lib/offline-storage";
import { syncOfflineResults } from "@/components/connectivity-manager";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "Offline Study | COGNY" },
      { name: "description", content: "Continue studying your saved COGNY decks, subjects and materials without internet." },
      { property: "og:title", content: "Offline Study | COGNY" },
      { property: "og:description", content: "Study saved decks and practice quizzes offline on COGNY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <OfflinePage />
    </RequireAuth>
  ),
});

type Deck = Awaited<ReturnType<typeof listOfflineDecks>>[number];
type QCard = {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  explanation: string | null;
  topic: string | null;
  choices: string[] | null;
};

function shuffle<T>(a: T[]) {
  return [...a].sort(() => Math.random() - 0.5);
}

function toChoices(c: Record<string, unknown>): string[] | null {
  const answer = String(c.answer ?? "");
  const opts = Array.isArray(c.options) ? (c.options as unknown[]).map(String) : null;
  if (opts && opts.length >= 2) return opts;
  const d = Array.isArray(c.distractors) ? (c.distractors as unknown[]).map(String) : null;
  if (d && d.length >= 2) return shuffle([answer, ...d.slice(0, 3)]);
  return null;
}

function OfflinePage() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [subjects, setSubjects] = useState<OfflineSubject[]>([]);
  const [materials, setMaterials] = useState<OfflineMaterial[]>([]);
  const [attempts, setAttempts] = useState<OfflineQuizAttempt[]>([]);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [quiz, setQuiz] = useState<QCard[] | null>(null);

  async function refresh() {
    const [d, s, m, a, p] = await Promise.all([
      listOfflineDecks(),
      listSubjects(),
      listMaterials(),
      listQuizAttempts(),
      user ? getProgress(user.id) : null,
    ]);
    setDecks(d);
    setSubjects(s);
    setMaterials(m.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)));
    setAttempts(a.sort((x, y) => y.date.localeCompare(x.date)));
    setProgress(p);
  }

  useEffect(() => {
    void refresh();
  }, [user?.id]);

  const subjectList = useMemo(() => {
    const map = new Map<string, { name: string; decks: number; cards: number }>();
    for (const s of subjects) map.set(s.name, { name: s.name, decks: 0, cards: 0 });
    for (const d of decks) {
      const name = String(d.deck.subject ?? d.deck.course_name ?? "General");
      const e = map.get(name) ?? { name, decks: 0, cards: 0 };
      e.decks++;
      e.cards += d.cards.length;
      map.set(name, e);
    }
    return [...map.values()];
  }, [subjects, decks]);

  function startQuiz(deckFilter?: string) {
    const pool: QCard[] = decks
      .filter((d) => !deckFilter || d.id === deckFilter)
      .flatMap((d) =>
        d.cards.map((c) => ({
          id: String(c.id),
          deckId: d.id,
          question: String(c.question ?? ""),
          answer: String(c.answer ?? ""),
          explanation: (c.explanation as string) ?? null,
          topic: (c.topic as string) ?? null,
          choices: toChoices(c),
        })),
      );
    if (!pool.length) {
      toast.error("Download a deck while online to practice offline.");
      return;
    }
    setQuiz(shuffle(pool).slice(0, 15));
  }

  const unsynced = attempts.filter((a) => !a.synced).length;
  const lastDeck = progress?.lastDeckId ? decks.find((d) => d.id === progress.lastDeckId) : decks[0];

  if (quiz && user) {
    return (
      <PracticeQuiz
        cards={quiz}
        userId={user.id}
        onDone={() => {
          setQuiz(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Device Storage & Sync
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
            Offline Study
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved materials, question banks, and progress stored locally — synchronised when you reconnect.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const n = await syncOfflineResults();
            toast.success(
              navigator.onLine
                ? `Synced ${n} pending item${n === 1 ? "" : "s"}.`
                : "Offline — results remain queued safely.",
            );
            void refresh();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1.5" /> Sync now {unsynced > 0 && `(${unsynced})`}
        </Button>
      </div>

      {/* Continue studying */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
          <PlayCircle className="h-4 w-4 text-primary" /> Continue offline session
        </h2>
        {lastDeck ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">
                {String(lastDeck.deck.title ?? progress?.lastDeckTitle ?? "Saved deck")}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {progress
                  ? `${progress.attempted} answered · ${progress.accuracy}% accuracy · ${progress.streak}-day streak`
                  : `${lastDeck.cards.length} questions saved locally`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => startQuiz(lastDeck.id)}>
                Quick quiz
              </Button>
              <Button size="sm" asChild>
                <Link to="/decks/$deckId" params={{ deckId: lastDeck.id }}>
                  Open deck
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open any study deck while online and click “Download” to keep a copy on this device.
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <FolderOpen className="h-4 w-4 text-primary" /> Cached Subjects
          </h2>
          {subjectList.length ? (
            <ul className="divide-y divide-border">
              {subjectList.map((s) => {
                const mastery = progress?.topicMastery[s.name];
                return (
                  <li key={s.name} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium text-foreground">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {s.decks} deck{s.decks === 1 ? "" : "s"} · {s.cards} cards
                      {mastery !== undefined && ` · ${mastery}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Downloaded subjects appear here automatically.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" /> Offline Practice Quiz
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Test yourself on up to 15 random questions from all downloaded decks.
          </p>
          <Button onClick={() => startQuiz()} disabled={!decks.length}>
            Start offline practice
          </Button>
          {attempts.length > 0 && (
            <ul className="mt-4 divide-y divide-border text-xs">
              {attempts.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between py-2 text-muted-foreground tabular-nums">
                  <span>{new Date(a.date).toLocaleDateString()}</span>
                  <span>
                    {a.score}/{a.total} ({a.percentage}%) · {a.synced ? "synced" : "queued"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Saved materials */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" /> Saved Library Materials
          </h2>
          <Link to="/library" className="text-xs font-medium text-primary hover:underline">
            Open My Library →
          </Link>
        </div>
        {materials.length ? (
          <ul className="divide-y divide-border">
            {materials.map((m) => (
              <li key={m.id} className="py-2.5 text-sm">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {m.fileName}
                      {m.subject && <span className="text-muted-foreground font-normal"> · {m.subject}</span>}
                    </span>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove material"
                      onClick={async (e) => {
                        e.preventDefault();
                        await removeMaterial(m.id);
                        void refresh();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </summary>
                  <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
                    {m.text.slice(0, 5000)}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Documents uploaded in My Library and Study Studio stay cached here for offline reading.
          </p>
        )}
      </section>
    </div>
  );
}

function PracticeQuiz({ cards, userId, onDone }: { cards: QCard[]; userId: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [start] = useState(Date.now());
  const card = cards[i];

  async function grade(correct: boolean, answer: string) {
    setRevealed(true);
    if (correct) setScore((s) => s + 1);
    setAnswers((a) => [...a, answer]);
    await recordLocalAnswer(userId, {
      correct,
      topic: card.topic,
      deckId: card.deckId,
      scorePct: correct ? 100 : 0,
    });
    await queueStudyEvent({
      id: makeOfflineId(),
      userId,
      deckId: card.deckId,
      mode: "offline_practice",
      score: correct ? 1 : 0,
      total: 1,
      completedAt: new Date().toISOString(),
    });
    if (navigator.onLine) void syncOfflineResults();
  }

  async function next() {
    if (i + 1 < cards.length) {
      setI(i + 1);
      setPicked(null);
      setRevealed(false);
      return;
    }
    const total = cards.length;
    await saveQuizAttempt({
      id: makeOfflineId(),
      deckId: card.deckId,
      questionIds: cards.map((c) => c.id),
      answers,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      date: new Date().toISOString(),
      timeTakenMs: Date.now() - start,
      synced: false,
    });
    if (navigator.onLine) await syncOfflineResults();
    toast.success(`Practice complete: ${score}/${total}`);
    onDone();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          Question {i + 1} of {cards.length}
        </span>
        <button onClick={onDone} className="font-medium hover:text-foreground">
          Exit
        </button>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-base font-medium text-foreground">
          <MathText>{card.question}</MathText>
        </div>
        {card.choices ? (
          <div className="mt-4 grid gap-2">
            {card.choices.map((c) => {
              const isAnswer = c.trim().toLowerCase() === card.answer.trim().toLowerCase();
              const state = revealed
                ? isAnswer
                  ? "border-success bg-success/10"
                  : picked === c
                    ? "border-destructive bg-destructive/10"
                    : "border-border"
                : "border-border hover:border-primary";
              return (
                <button
                  key={c}
                  disabled={revealed}
                  onClick={() => {
                    setPicked(c);
                    void grade(isAnswer, c);
                  }}
                  className={`rounded-lg border px-3.5 py-2.5 text-left text-sm ${state}`}
                >
                  <MathText>{c}</MathText>
                </button>
              );
            })}
          </div>
        ) : (
          !revealed && (
            <Button className="mt-4" variant="outline" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          )
        )}
        {revealed && (
          <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3.5 text-sm">
            <p>
              <span className="font-semibold">Answer: </span>
              <MathText>{card.answer}</MathText>
            </p>
            {card.explanation && (
              <p className="text-muted-foreground text-xs">
                <MathText>{card.explanation}</MathText>
              </p>
            )}
          </div>
        )}
        {revealed && !card.choices && answers.length === i && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => grade(true, "self:correct")}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> I got it
            </Button>
            <Button size="sm" variant="outline" onClick={() => grade(false, "self:missed")}>
              <XCircle className="h-4 w-4 mr-1" /> I missed it
            </Button>
          </div>
        )}
        {revealed && answers.length > i && (
          <Button className="mt-4 w-full" onClick={next}>
            {i + 1 < cards.length ? "Next" : "Finish"}
          </Button>
        )}
      </div>
    </div>
  );
}
