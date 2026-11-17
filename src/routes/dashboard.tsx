import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  BookOpen,
  Sparkles,
  Flame,
  Target,
  TrendingUp,
  Trophy,
  Crown,
  Medal,
  Users,
  Share2,
  Search,
  Loader2,
  MessageCircle,
  Trash2,
  ArrowRight,
  Library,
  FileText,
  Layers,
  GraduationCap,
  Lightbulb,
  Shapes,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  getDailyGoalTarget,
  getDashboardSnapshot,
  listMaterials,
  listOfflineDecks,
  saveDashboardSnapshot,
  setDailyGoalTarget as saveDailyGoalTarget,
  type OfflineMaterial,
} from "@/lib/offline-storage";
import {
  STUDY_GOALS_EVENT,
  formatStudyClock,
  getStudyGoalConfig,
  getStudyGoalProgress,
  setStudyGoalConfig,
  type StudyGoalConfig,
  type StudyGoalProgress,
} from "@/lib/study-goals";
import { CORE_SUBJECTS, matchSubjectName } from "@/lib/subjects";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Home | COGNY" },
      {
        name: "description",
        content:
          "COGNY academic command centre — continue studying, launch Study Studio, track daily goals and subject progress.",
      },
      { property: "og:title", content: "COGNY Study Command Centre" },
      {
        property: "og:description",
        content: "Your personalised academic workspace for materials, question banks, exams, and analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

type Deck = {
  id: string;
  title: string;
  subject: string | null;
  last_studied_at: string | null;
  created_at: string;
  card_count: number;
};
type SessionSummary = {
  id: string;
  deck_id: string;
  mode: string;
  score: number;
  total: number;
  completed_at: string;
};
type WeakCard = { id: string; deck_id: string; topic: string | null; status: string };
type LeaderRow = {
  user_id: string;
  display_name: string;
  university: string | null;
  mastered_count: number;
  avg_score: number;
};
type SharedDeck = {
  id: string;
  title: string;
  subject: string | null;
  course_name: string | null;
  created_at: string;
  user_id: string;
  sharer_name: string;
  card_count: number;
};

function timeGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return "Good morning";
  if (hr < 17) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [materials, setMaterials] = useState<OfflineMaterial[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [allCards, setAllCards] = useState<WeakCard[]>([]);
  const [stats, setStats] = useState({ mastered: 0, avgScore: 0, streak: 0, totalCards: 0 });
  const [dailyGoalTarget, setDailyGoalTarget] = useState(20);
  const [goalConfig, setGoalConfig] = useState<StudyGoalConfig>(() => getStudyGoalConfig());
  const [goalProgress, setGoalProgress] = useState<StudyGoalProgress>(() => getStudyGoalProgress());
  const [editingGoal, setEditingGoal] = useState(false);
  const [draftDuration, setDraftDuration] = useState(goalConfig.durationMinutes);
  const [draftDecks, setDraftDecks] = useState(goalConfig.deckTarget);
  const [draftQuestions, setDraftQuestions] = useState(20);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [sharedDecks, setSharedDecks] = useState<SharedDeck[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(SharedDeck & { program: string | null })[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const syncGoals = () => {
      setDailyGoalTarget(getDailyGoalTarget());
      setGoalConfig(getStudyGoalConfig());
      setGoalProgress(getStudyGoalProgress());
    };
    syncGoals();
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
      const localMats = await listMaterials();
      setMaterials(
        localMats
          .sort((a, b) =>
            (b.lastAccessedAt ?? b.updatedAt).localeCompare(a.lastAccessedAt ?? a.updatedAt),
          )
          .slice(0, 5),
      );

      if (!navigator.onLine) {
        const snapshot = await getDashboardSnapshot(user.id);
        const savedDecks = await listOfflineDecks();
        if (snapshot) {
          setDecks(snapshot.decks as Deck[]);
          setStats(snapshot.stats);
        } else {
          setDecks(
            savedDecks.map((item) => ({
              id: item.id,
              title: String(item.deck.title ?? "Saved deck"),
              subject: typeof item.deck.subject === "string" ? item.deck.subject : null,
              last_studied_at:
                typeof item.deck.last_studied_at === "string" ? item.deck.last_studied_at : null,
              created_at: typeof item.deck.created_at === "string" ? item.deck.created_at : item.savedAt,
              card_count: item.cards.length,
            })),
          );
        }
        setOffline(true);
        setLoading(false);
        return;
      }

      const { data: deckRows } = await supabase
        .from("decks")
        .select("id, title, subject, last_studied_at, created_at, flashcards(count)")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      const mapped: Deck[] = (deckRows ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        subject: d.subject,
        last_studied_at: d.last_studied_at,
        created_at: d.created_at,
        card_count: d.flashcards?.[0]?.count ?? 0,
      }));
      setDecks(mapped);

      const [{ data: cardRows }, { data: sessionRows }] = await Promise.all([
        supabase.from("flashcards").select("id, deck_id, topic, status").eq("user_id", user.id),
        supabase
          .from("study_sessions")
          .select("id, deck_id, mode, score, total, completed_at")
          .eq("user_id", user.id)
          .order("completed_at", { ascending: false })
          .limit(50),
      ]);

      const cardsArr = (cardRows ?? []) as WeakCard[];
      const sessArr = (sessionRows ?? []) as SessionSummary[];
      setAllCards(cardsArr);
      setSessions(sessArr);

      const masteredCount = cardsArr.filter((c) => c.status === "got_it").length;
      const totalCount = cardsArr.length;
      let avg = 0;
      if (sessArr.length) {
        const ratios = sessArr.map((s) => (s.total > 0 ? s.score / s.total : 0));
        avg = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100);
      }
      const days = new Set(sessArr.map((s) => new Date(s.completed_at).toDateString()));
      let streak = 0;
      const cur = new Date();
      while (days.has(cur.toDateString())) {
        streak++;
        cur.setDate(cur.getDate() - 1);
      }
      const nextStats = {
        mastered: masteredCount,
        avgScore: avg,
        streak,
        totalCards: totalCount,
      };
      setStats(nextStats);
      await saveDashboardSnapshot({
        userId: user.id,
        decks: mapped,
        stats: nextStats,
        savedAt: new Date().toISOString(),
      });

      const [{ data: lb }, { data: shared }] = await Promise.all([
        supabase.rpc("get_leaderboard" as any),
        supabase.rpc("get_program_shared_decks" as any),
      ]);
      setLeaderboard(
        ((lb ?? []) as any[]).map((r) => ({
          user_id: r.user_id,
          display_name: r.display_name,
          university: r.university,
          mastered_count: Number(r.mastered_count ?? 0),
          avg_score: Number(r.avg_score ?? 0),
        })),
      );
      setSharedDecks(
        ((shared ?? []) as any[]).map((r) => ({
          id: r.id,
          title: r.title,
          subject: r.subject,
          course_name: r.course_name,
          created_at: r.created_at,
          user_id: r.user_id,
          sharer_name: r.sharer_name,
          card_count: Number(r.card_count ?? 0),
        })),
      );
      setLoading(false);
    })();
  }, [user]);

  // Daily goal progress computed from today's sessions
  const todayAnswered = useMemo(() => {
    const today = new Date().toDateString();
    return sessions
      .filter((s) => new Date(s.completed_at).toDateString() === today)
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [sessions]);
  const dailyPct = Math.min(100, Math.round((todayAnswered / Math.max(1, dailyGoalTarget)) * 100));
  const timeGoalPct = Math.min(
    100,
    Math.round((goalProgress.elapsedSeconds / Math.max(1, goalConfig.durationMinutes * 60)) * 100),
  );
  const decksDoneToday = goalProgress.studiedDeckIds.length;
  const deckGoalPct = Math.min(
    100,
    Math.round((decksDoneToday / Math.max(1, goalConfig.deckTarget)) * 100),
  );

  function openGoalEditor() {
    setDraftDuration(goalConfig.durationMinutes);
    setDraftDecks(goalConfig.deckTarget);
    setDraftQuestions(dailyGoalTarget);
    setEditingGoal((prev) => !prev);
  }

  function saveDashboardGoals() {
    const updated = setStudyGoalConfig({
      durationMinutes: draftDuration,
      deckTarget: draftDecks,
    });
    const nextQuestions = Math.max(5, Math.min(200, Math.round(Number(draftQuestions) || 20)));
    saveDailyGoalTarget(nextQuestions);
    setGoalConfig(updated);
    setDailyGoalTarget(nextQuestions);
    setEditingGoal(false);
    toast.success(
      `Study goal updated: ${updated.durationMinutes} min · ${updated.deckTarget} deck${updated.deckTarget === 1 ? "" : "s"} · ${nextQuestions} questions`,
    );
  }

  // Subject progress (real aggregation)
  const subjectProgress = useMemo(() => {
    const coreNames = CORE_SUBJECTS.map((s) => s.name);
    const deckSubjMap = new Map<string, string>();
    const map = new Map<string, { subject: string; mastered: number; total: number; deckCount: number }>();

    for (const d of decks) {
      const subj = d.subject ? matchSubjectName(d.subject, coreNames) : "General";
      deckSubjMap.set(d.id, subj);
      const entry = map.get(subj) ?? { subject: subj, mastered: 0, total: 0, deckCount: 0 };
      entry.deckCount++;
      map.set(subj, entry);
    }

    for (const c of allCards) {
      const subj = deckSubjMap.get(c.deck_id);
      if (!subj) continue;
      const entry = map.get(subj);
      if (!entry) continue;
      entry.total++;
      if (c.status === "got_it") entry.mastered++;
    }

    return Array.from(map.values())
      .map((s) => ({
        ...s,
        pct: s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0,
      }))
      .slice(0, 4);
  }, [decks, allCards]);

  // Study recommendations from real missed/unstudied decks
  const recommendations = useMemo(() => {
    const deckMap = new Map(decks.map((d) => [d.id, d]));
    const missedByDeck = new Map<string, { count: number; topic: string | null }>();
    for (const c of allCards) {
      if (c.status === "missed" || c.status === "review_later") {
        const cur = missedByDeck.get(c.deck_id) ?? { count: 0, topic: c.topic };
        cur.count++;
        if (!cur.topic && c.topic) cur.topic = c.topic;
        missedByDeck.set(c.deck_id, cur);
      }
    }
    const items: { id: string; title: string; reason: string }[] = [];
    for (const [deckId, info] of missedByDeck.entries()) {
      const d = deckMap.get(deckId);
      if (!d) continue;
      items.push({
        id: deckId,
        title: d.title,
        reason: `${info.count} question${info.count === 1 ? "" : "s"} needing review${info.topic ? ` in ${info.topic}` : ""}`,
      });
    }
    for (const d of decks) {
      if (items.length >= 3) break;
      if (!d.last_studied_at && !items.some((x) => x.id === d.id)) {
        items.push({
          id: d.id,
          title: d.title,
          reason: `${d.card_count} questions ready for first study pass`,
        });
      }
    }
    return items.slice(0, 3);
  }, [decks, allCards]);

  const deckTitleMap = useMemo(() => new Map(decks.map((d) => [d.id, d.title])), [decks]);
  const myRankIndex = leaderboard.findIndex((r) => r.user_id === user?.id);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Learning Command Centre
          </p>
          <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {timeGreeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resume your coursework, launch Study Studio, or review high-priority topics.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" className="whitespace-nowrap">
            <Link to="/library">
              <Library className="h-4 w-4 mr-1.5" /> My Library
            </Link>
          </Button>
          <Button asChild className="shadow-brand whitespace-nowrap">
            <Link to="/create">
              <Plus className="h-4 w-4 mr-1.5" /> New Study Session
            </Link>
          </Button>
        </div>
      </div>

      {offline && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          Offline mode active — displaying cached decks and local study materials. Progress will sync automatically when connected.
        </div>
      )}

      {/* Primary KPIs + Daily Goal */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Cards Mastered</span>
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
            {stats.mastered}
          </div>
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            of {stats.totalCards} questions
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Quiz Accuracy</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
            {stats.avgScore}%
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Last 50 sessions</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Study Streak</span>
            <Flame className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
            {stats.streak}d
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Daily consistency</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-primary" /> Daily Study Goal
            </span>
            <button
              type="button"
              onClick={openGoalEditor}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <SlidersHorizontal className="h-3 w-3" />
              {editingGoal ? "Close" : "Set goal"}
            </button>
          </div>
          <div className="mt-2 font-display text-xl font-bold tabular-nums text-foreground sm:text-2xl">
            {formatStudyClock(goalProgress.elapsedSeconds)}
            <span className="text-xs font-normal text-muted-foreground">
              {" "}
              / {goalConfig.durationMinutes}m
            </span>
          </div>
          <Progress
            value={Math.round((timeGoalPct + deckGoalPct + dailyPct) / 3)}
            className="mt-2 h-1.5"
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
            <span>
              {decksDoneToday}/{goalConfig.deckTarget} deck{goalConfig.deckTarget === 1 ? "" : "s"}
            </span>
            <span>
              {todayAnswered}/{dailyGoalTarget} qs
            </span>
          </div>
        </div>
      </div>

      {editingGoal && (
        <section
          aria-label="Configure study goals"
          className="rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">
                Set Today&apos;s Study Goal
              </h2>
              <p className="text-xs text-muted-foreground">
                Choose how long you want to study, how many decks to cover, and your question target.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingGoal(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={saveDashboardGoals}>
                Save goal
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dash-goal-duration" className="text-xs font-semibold text-foreground">
                Study duration (minutes)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[15, 30, 45, 60, 90].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDraftDuration(mins)}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums transition ${
                      draftDuration === mins
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <Input
                id="dash-goal-duration"
                type="number"
                min={5}
                max={360}
                value={draftDuration}
                onChange={(e) =>
                  setDraftDuration(Math.max(5, Math.min(360, Number(e.target.value) || 5)))
                }
                className="h-9 font-mono text-sm tabular-nums"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dash-goal-decks" className="text-xs font-semibold text-foreground">
                Decks to study
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setDraftDecks(count)}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums transition ${
                      draftDecks === count
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {count} {count === 1 ? "deck" : "decks"}
                  </button>
                ))}
              </div>
              <Input
                id="dash-goal-decks"
                type="number"
                min={1}
                max={25}
                value={draftDecks}
                onChange={(e) =>
                  setDraftDecks(Math.max(1, Math.min(25, Number(e.target.value) || 1)))
                }
                className="h-9 font-mono text-sm tabular-nums"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dash-goal-questions" className="text-xs font-semibold text-foreground">
                Daily questions target
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[10, 20, 30, 50].map((qs) => (
                  <button
                    key={qs}
                    type="button"
                    onClick={() => setDraftQuestions(qs)}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums transition ${
                      draftQuestions === qs
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {qs}
                  </button>
                ))}
              </div>
              <Input
                id="dash-goal-questions"
                type="number"
                min={5}
                max={200}
                value={draftQuestions}
                onChange={(e) =>
                  setDraftQuestions(Math.max(5, Math.min(200, Number(e.target.value) || 5)))
                }
                className="h-9 font-mono text-sm tabular-nums"
              />
            </div>
          </div>
        </section>
      )}

      {/* Quick Access to AI Study Studio */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              AI Study Studio
            </h2>
            <p className="text-xs text-muted-foreground">
              Transform any document or chapter into targeted academic study resources.
            </p>
          </div>
          <Link to="/create" className="text-xs font-semibold text-primary hover:underline">
            Launch full studio →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Question Bank", mode: "question_bank", icon: Layers },
            { label: "Flashcards", mode: "flashcards", icon: BookOpen },
            { label: "Practice Exam", mode: "exam", icon: GraduationCap },
            { label: "Explanations", mode: "explanation", icon: Lightbulb },
            { label: "Summaries", mode: "summary", icon: FileText },
            { label: "Visual Diagrams", mode: "visual", icon: Shapes },
          ].map((tool) => (
            <Link
              key={tool.mode}
              to="/create"
              search={{ mode: tool.mode }}
              className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-3.5 transition hover:border-primary/50 hover:bg-accent/50"
            >
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                <tool.icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-foreground group-hover:text-primary">
                {tool.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Main 2-Column Command Grid */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Left 7 Columns */}
        <div className="space-y-6 xl:col-span-7">
          {/* Continue Learning */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">
                  Continue learning
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pick up right where you left off.
                </p>
              </div>
              <Link to="/library" className="text-xs font-medium text-primary hover:underline">
                View all →
              </Link>
            </div>
            <div className="mt-4 divide-y divide-border">
              {decks.slice(0, 4).map((deck, index) => (
                <Link
                  key={deck.id}
                  to="/decks/$deckId"
                  params={{ deckId: deck.id }}
                  className="flex items-center justify-between gap-3 py-3 group"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                      {deck.title}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                      {deck.subject ?? "General study"} · {deck.card_count} questions
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                    {index === 0 ? "Continue" : "Study"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
              {!loading && decks.length === 0 && (
                <Link
                  to="/create"
                  className="mt-2 block rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground hover:border-primary/40"
                >
                  Upload your first document to create a study deck
                </Link>
              )}
            </div>
          </section>

          {/* Recently Accessed Materials + Recent Sessions */}
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Recent Materials
                </h2>
                <Link to="/library" className="text-xs text-primary hover:underline">
                  Library
                </Link>
              </div>
              {materials.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Uploaded PDFs, Word docs, and notes appear here for quick access.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-border">
                  {materials.slice(0, 4).map((m) => (
                    <Link
                      key={m.id}
                      to="/create"
                      search={{ materialId: m.id, subject: m.subject ?? undefined }}
                      className="flex items-center justify-between gap-2 py-2.5 group"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground group-hover:text-primary">
                          {m.fileName}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {m.subject ?? "General"}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-primary">
                        Studio
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Recent Study Sessions
                </h2>
                <Link to="/progress" className="text-xs text-primary hover:underline">
                  Analytics
                </Link>
              </div>
              {sessions.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Answer questions in any deck to log your session history.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-border">
                  {sessions.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground">
                          {deckTitleMap.get(s.deck_id) ?? "Study session"}
                        </div>
                        <div className="text-[11px] text-muted-foreground uppercase">
                          {s.mode} · {formatDistanceToNow(new Date(s.completed_at), { addSuffix: true })}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                        {s.score}/{s.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Search Shared Decks */}
          {!offline && (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Find shared decks
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Search across university programs, courses, subjects, or deck titles.
              </p>
              <form
                className="mt-4 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSearching(true);
                  const { data, error } = await supabase.rpc("search_decks_by_program" as any, {
                    p_query: searchQuery,
                  });
                  setSearching(false);
                  if (error) return;
                  setSearchResults(
                    ((data ?? []) as any[]).map((r) => ({
                      id: r.id,
                      title: r.title,
                      subject: r.subject,
                      course_name: r.course_name,
                      created_at: r.created_at,
                      user_id: r.user_id,
                      sharer_name: r.sharer_name,
                      program: r.program,
                      card_count: Number(r.card_count ?? 0),
                    })),
                  );
                }}
              >
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search shared study material…"
                  className="min-w-0"
                />
                <Button type="submit" disabled={searching} className="shrink-0">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </form>
              {searchResults !== null && (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {searchResults.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No matching shared decks found.</p>
                  ) : (
                    searchResults.map((d) => (
                      <Link
                        key={d.id}
                        to="/decks/$deckId"
                        params={{ deckId: d.id }}
                        className="rounded-lg border border-border bg-background p-3 hover:border-primary/40"
                      >
                        <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {d.card_count} questions · by {d.sharer_name}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right 5 Columns */}
        <div className="space-y-6 xl:col-span-5">
          {/* Subject Progress */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-foreground">
                Subject progress
              </h2>
              <Link to="/subjects" className="text-xs font-medium text-primary hover:underline">
                Manage →
              </Link>
            </div>
            {subjectProgress.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Create or tag decks with your academic subjects to track per-subject mastery.
              </p>
            ) : (
              <div className="mt-4 space-y-3.5">
                {subjectProgress.map((sp) => (
                  <div key={sp.subject} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground">{sp.subject}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {sp.pct}% ({sp.mastered}/{sp.total})
                      </span>
                    </div>
                    <Progress value={sp.pct} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Study Recommendations */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Recommended next
            </h2>
            {recommendations.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                All caught up! Start a Practice Exam or generate questions on a new chapter.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-border">
                {recommendations.map((rec) => (
                  <Link
                    key={rec.id}
                    to="/decks/$deckId"
                    params={{ deckId: rec.id }}
                    className="flex items-center justify-between gap-3 py-2.5 group"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {rec.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{rec.reason}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Global Leaderboard */}
          {!offline && (
            <section className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                    <Crown className="h-4 w-4 text-primary" /> Global leaderboard
                  </h2>
                  <p className="text-xs text-muted-foreground">Top 10 by correct answers</p>
                </div>
                <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                  {myRank ? `Rank #${myRank}` : "Unranked"}
                </span>
              </div>
              <ol className="mt-4 divide-y divide-border">
                {leaderboard.length === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">No rankings yet — be the first.</p>
                ) : (
                  leaderboard.slice(0, 10).map((row, i) => {
                    const isMe = row.user_id === user?.id;
                    const rankIcon =
                      i === 0 ? (
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                      ) : i === 1 ? (
                        <Medal className="h-3.5 w-3.5 text-slate-400" />
                      ) : i === 2 ? (
                        <Medal className="h-3.5 w-3.5 text-amber-700" />
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {i + 1}
                        </span>
                      );
                    return (
                      <li
                        key={row.user_id}
                        className={`flex items-center justify-between gap-3 py-2.5 ${
                          isMe ? "text-primary font-semibold" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-background">
                            {rankIcon}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-foreground">
                              {row.display_name}
                              {isMe && <span className="ml-1.5 text-xs text-primary">(you)</span>}
                            </div>
                            {row.university && (
                              <div className="truncate text-xs text-muted-foreground">
                                {row.university}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <div className="font-mono text-sm font-bold text-foreground">
                            {row.mastered_count}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{row.avg_score}% avg</div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ol>
            </section>
          )}
        </div>
      </div>

      {/* Shared in Your Program */}
      {!offline && (
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Shared in your program
              </h2>
              <p className="text-xs text-muted-foreground">
                Question banks and past papers contributed by classmates in your degree.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
              <Link to="/chat">
                <MessageCircle className="h-4 w-4 mr-1.5" /> Open program chat
              </Link>
            </Button>
          </div>
          {sharedDecks.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No shared decks yet. Add your program in{" "}
              <Link to="/profile" className="font-medium text-primary hover:underline">
                Settings
              </Link>{" "}
              to collaborate with classmates.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sharedDecks.map((d) => (
                <Link
                  key={d.id}
                  to="/decks/$deckId"
                  params={{ deckId: d.id }}
                  className="group rounded-xl border border-border bg-background p-4 transition hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
                      {d.title}
                    </h3>
                    <Share2 className="h-4 w-4 shrink-0 text-primary" />
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {[d.course_name, d.subject].filter(Boolean).join(" · ") || "Program resource"}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                    <span>{d.card_count} questions</span>
                    <span>by {d.sharer_name}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Your Decks */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Your Study Decks</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{decks.length} total</span>
        </div>
        {loading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : decks.length === 0 ? (
          <Link
            to="/create"
            className="mt-4 grid place-items-center rounded-xl border border-dashed border-border bg-card p-12 text-center hover:border-primary/50"
          >
            <Plus className="h-7 w-7 text-primary" />
            <p className="mt-3 font-display text-base font-semibold text-foreground">
              Create your first study deck
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a PDF, paste lecture notes, or snap a photo in Study Studio.
            </p>
          </Link>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d) => (
              <div
                key={d.id}
                className="group relative rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
              >
                <Link to="/decks/$deckId" params={{ deckId: d.id }} className="block">
                  <div className="flex items-start justify-between pr-8">
                    <h3 className="font-display text-base font-semibold leading-snug text-foreground group-hover:text-primary">
                      {d.title}
                    </h3>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {d.subject ?? "General"}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                    <span>{d.card_count} questions</span>
                    <span>
                      {d.last_studied_at
                        ? `Studied ${formatDistanceToNow(new Date(d.last_studied_at), { addSuffix: true })}`
                        : "Not studied yet"}
                    </span>
                  </div>
                </Link>
                <button
                  aria-label="Remove deck from your dashboard"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (
                      !confirm(
                        "Remove this deck from your dashboard? Classmates with the link can still access it.",
                      )
                    )
                      return;
                    const { error } = await supabase
                      .from("decks")
                      .update({ archived_at: new Date().toISOString() } as any)
                      .eq("id", d.id);
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    setDecks((ds) => ds.filter((x) => x.id !== d.id));
                    toast.success("Deck removed");
                  }}
                  className="absolute top-3.5 right-3.5 grid h-8 w-8 place-items-center rounded-lg border border-border bg-background text-destructive transition hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
