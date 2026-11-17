import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getProgress, type OfflineProgress } from "@/lib/offline-storage";
import {
  STUDY_GOALS_EVENT,
  formatStudyClock,
  getStudyGoalConfig,
  getStudyGoalProgress,
  type StudyGoalConfig,
  type StudyGoalProgress,
} from "@/lib/study-goals";
import { CORE_SUBJECTS, matchSubjectName } from "@/lib/subjects";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  Target,
  CheckCircle2,
  XCircle,
  Flame,
  Clock,
  Sparkles,
  AlertTriangle,
  Award,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress & Analytics | COGNY" },
      {
        name: "description",
        content: "Track questions attempted, accuracy, weak topics, study streaks, and subject mastery.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ProgressPage />
    </RequireAuth>
  ),
});

type SessionRow = {
  id: string;
  deck_id: string;
  mode: string;
  score: number;
  total: number;
  completed_at: string;
};

type DeckRow = {
  id: string;
  title: string;
  subject: string | null;
};

type CardRow = {
  id: string;
  deck_id: string;
  topic: string | null;
  status: string;
};

function formatDuration(ms: number) {
  const totalMins = Math.round(ms / 60_000);
  if (totalMins < 1) return "< 1m";
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function ProgressPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [localProgress, setLocalProgress] = useState<OfflineProgress | null>(null);
  const [goalConfig, setGoalConfig] = useState<StudyGoalConfig>(() => getStudyGoalConfig());
  const [goalProgress, setGoalProgress] = useState<StudyGoalProgress>(() => getStudyGoalProgress());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncGoals = () => {
      setGoalConfig(getStudyGoalConfig());
      setGoalProgress(getStudyGoalProgress());
    };
    window.addEventListener(STUDY_GOALS_EVENT, syncGoals);
    window.addEventListener("storage", syncGoals);
    return () => {
      window.removeEventListener(STUDY_GOALS_EVENT, syncGoals);
      window.removeEventListener("storage", syncGoals);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const local = await getProgress(user.id);
        setLocalProgress(local);

        if (navigator.onLine) {
          const [{ data: sess }, { data: deckRows }, { data: cardRows }] = await Promise.all([
            supabase
              .from("study_sessions")
              .select("id, deck_id, mode, score, total, completed_at")
              .eq("user_id", user.id)
              .order("completed_at", { ascending: false })
              .limit(200),
            supabase
              .from("decks")
              .select("id, title, subject")
              .eq("user_id", user.id)
              .is("archived_at", null),
            supabase
              .from("flashcards")
              .select("id, deck_id, topic, status")
              .eq("user_id", user.id),
          ]);
          setSessions((sess ?? []) as SessionRow[]);
          setDecks((deckRows ?? []) as DeckRow[]);
          setCards((cardRows ?? []) as CardRow[]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const deckMap = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);

  // Compute real totals from cloud study_sessions + local offline tracking
  const metrics = useMemo(() => {
    const cloudAttempted = sessions.reduce((s, r) => s + Number(r.total || 0), 0);
    const cloudCorrect = sessions.reduce((s, r) => s + Number(r.score || 0), 0);

    const attempted = Math.max(cloudAttempted, localProgress?.attempted ?? 0);
    const correct = Math.min(attempted, Math.max(cloudCorrect, localProgress?.correct ?? 0));
    const incorrect = Math.max(0, attempted - correct);
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

    // Streak from study_sessions dates
    const days = new Set(sessions.map((s) => new Date(s.completed_at).toDateString()));
    let cloudStreak = 0;
    const cursor = new Date();
    while (days.has(cursor.toDateString())) {
      cloudStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    const streak = Math.max(cloudStreak, localProgress?.streak ?? 0);

    // Study time: recorded duration, active study timer, or estimated from real question attempts
    const activeTodayMs = goalProgress.elapsedSeconds * 1000;
    const estimatedMs = Math.max(
      localProgress?.studyTimeMs ?? 0,
      attempted * 35_000,
      activeTodayMs,
    );

    return { attempted, correct, incorrect, accuracy, streak, studyTimeMs: estimatedMs };
  }, [sessions, localProgress, goalProgress.elapsedSeconds]);

  // Topic breakdown (from real flashcards + localProgress topicMastery)
  const topicStats = useMemo(() => {
    const byTopic = new Map<
      string,
      { topic: string; mastered: number; missed: number; total: number; deckId?: string }
    >();

    for (const c of cards) {
      const topicName = (c.topic ?? "General").trim() || "General";
      const entry = byTopic.get(topicName) ?? {
        topic: topicName,
        mastered: 0,
        missed: 0,
        total: 0,
        deckId: c.deck_id,
      };
      entry.total++;
      if (c.status === "got_it") entry.mastered++;
      else if (c.status === "missed") entry.missed++;
      byTopic.set(topicName, entry);
    }

    const list = Array.from(byTopic.values()).map((t) => ({
      ...t,
      pct: t.total > 0 ? Math.round((t.mastered / t.total) * 100) : 0,
    }));

    const masteredTopics = list.filter((t) => t.pct >= 75 && t.total > 0).sort((a, b) => b.pct - a.pct);
    const weakTopics = list
      .filter((t) => t.missed > 0 || (t.total > 0 && t.pct < 60))
      .sort((a, b) => a.pct - b.pct);

    return { all: list, masteredTopics, weakTopics };
  }, [cards]);

  // Subject performance chart data
  const subjectPerformance = useMemo(() => {
    const coreNames = CORE_SUBJECTS.map((s) => s.name);
    const map = new Map<string, { subject: string; attempted: number; correct: number; masteredCards: number; totalCards: number }>();

    for (const d of decks) {
      const subj = d.subject ? matchSubjectName(d.subject, coreNames) : "General";
      if (!map.has(subj)) {
        map.set(subj, { subject: subj, attempted: 0, correct: 0, masteredCards: 0, totalCards: 0 });
      }
    }

    for (const s of sessions) {
      const d = deckMap.get(s.deck_id);
      const subj = d?.subject ? matchSubjectName(d.subject, coreNames) : "General";
      const entry = map.get(subj) ?? { subject: subj, attempted: 0, correct: 0, masteredCards: 0, totalCards: 0 };
      entry.attempted += Number(s.total || 0);
      entry.correct += Number(s.score || 0);
      map.set(subj, entry);
    }

    for (const c of cards) {
      const d = deckMap.get(c.deck_id);
      const subj = d?.subject ? matchSubjectName(d.subject, coreNames) : "General";
      const entry = map.get(subj) ?? { subject: subj, attempted: 0, correct: 0, masteredCards: 0, totalCards: 0 };
      entry.totalCards++;
      if (c.status === "got_it") entry.masteredCards++;
      map.set(subj, entry);
    }

    return Array.from(map.values())
      .map((row) => ({
        name: row.subject.length > 18 ? `${row.subject.slice(0, 17)}…` : row.subject,
        fullName: row.subject,
        accuracy:
          row.attempted > 0
            ? Math.round((row.correct / row.attempted) * 100)
            : row.totalCards > 0
              ? Math.round((row.masteredCards / row.totalCards) * 100)
              : 0,
        mastery: row.totalCards > 0 ? Math.round((row.masteredCards / row.totalCards) * 100) : 0,
        attempted: row.attempted,
      }))
      .slice(0, 8);
  }, [decks, sessions, cards, deckMap]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Academic Performance
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Progress & Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Computed directly from your completed study sessions, flashcard mastery, and quiz scores.
          </p>
        </div>
        <Button asChild className="shadow-brand whitespace-nowrap">
          <Link to="/create">
            <Sparkles className="h-4 w-4 mr-1.5" /> New Study Session
          </Link>
        </Button>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          {
            label: "Questions Attempted",
            value: metrics.attempted.toLocaleString(),
            sub: `${sessions.length} recorded sessions`,
            icon: Target,
          },
          {
            label: "Correct Answers",
            value: metrics.correct.toLocaleString(),
            sub: `${metrics.incorrect.toLocaleString()} incorrect`,
            icon: CheckCircle2,
          },
          {
            label: "Overall Accuracy",
            value: `${metrics.accuracy}%`,
            sub: metrics.attempted ? "Across attempted questions" : "No sessions yet",
            icon: BarChart3,
          },
          {
            label: "Learning Streak",
            value: `${metrics.streak}d`,
            sub: "Consecutive active days",
            icon: Flame,
          },
          {
            label: "Study Time",
            value: formatDuration(metrics.studyTimeMs),
            sub: `Today: ${formatStudyClock(goalProgress.elapsedSeconds)} / ${goalConfig.durationMinutes}m · ${goalProgress.studiedDeckIds.length}/${goalConfig.deckTarget} decks`,
            icon: Clock,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{kpi.label}</span>
              <kpi.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
              {kpi.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Subject Performance Chart + Actionable Recommendations */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">
                Subject Performance (%)
              </h2>
              <p className="text-xs text-muted-foreground">
                Quiz accuracy vs card mastery per subject
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted/40" />
          ) : subjectPerformance.length === 0 ? (
            <div className="mt-6 grid h-64 place-items-center rounded-lg border border-dashed border-border text-center p-6">
              <div>
                <BarChart3 className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  No subject metrics recorded yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Complete a quiz or flashcard session to see subject performance here.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectPerformance} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="accuracy" name="Accuracy %" fill="#477BFF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="mastery" name="Mastery %" fill="#54D6E8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Actionable Recommendations */}
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" /> Actionable Focus Areas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generated from topics with missed questions or accuracy below 60%.
          </p>

          <div className="mt-4 space-y-3">
            {topicStats.weakTopics.length > 0 ? (
              topicStats.weakTopics.slice(0, 5).map((t) => (
                <div
                  key={t.topic}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{t.topic}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {t.mastered}/{t.total} mastered · {t.missed} missed ({t.pct}%)
                    </div>
                  </div>
                  {t.deckId && (
                    <Button asChild size="sm" variant="outline" className="shrink-0 h-8 text-xs">
                      <Link to="/decks/$deckId" params={{ deckId: t.deckId }}>
                        Review <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </div>
              ))
            ) : cards.length > 0 ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                Great consistency — no weak topics flagged yet. Challenge yourself with a Practice Exam on one of your active decks.
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                Attempt questions in any deck to unlock weak-topic recommendations.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Mastered Topics & Weak Topics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <Award className="h-4 w-4 text-success" /> Topics Mastered
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {topicStats.masteredTopics.length} topics ≥ 75%
            </span>
          </div>
          {topicStats.masteredTopics.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Mark cards as mastered during study or score high in quizzes to fill this list.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {topicStats.masteredTopics.slice(0, 6).map((t) => (
                <div key={t.topic} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-foreground">{t.topic}</span>
                    <span className="font-mono tabular-nums text-success">{t.pct}%</span>
                  </div>
                  <Progress value={t.pct} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" /> Recent Study Sessions
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              Latest {Math.min(sessions.length, 8)}
            </span>
          </div>
          {sessions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No study sessions recorded yet.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {sessions.slice(0, 8).map((s) => {
                const deck = deckMap.get(s.deck_id);
                const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {deck?.title ?? "Study session"}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">
                        {s.mode} · {formatDistanceToNow(new Date(s.completed_at), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-xs tabular-nums">
                      <span className="font-semibold text-foreground">
                        {s.score}/{s.total}
                      </span>{" "}
                      <span className="text-muted-foreground">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
