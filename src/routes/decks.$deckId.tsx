import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { AppHeader } from "@/components/app-header";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { StudyMode } from "@/components/study-mode";
import { QuizMode } from "@/components/quiz-mode";
import { MultipleChoiceMode } from "@/components/multiple-choice-mode";
import { PracticeExamMode } from "@/components/practice-exam-mode";
import { StudyGoalBar } from "@/components/study-goal-bar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ListChecks,
  Loader2,
  Trash2,
  Share2,
  MessageCircle,
  Download,
  Check,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import {
  getOfflineDeck,
  makeOfflineId,
  queueStudyEvent,
  recordLocalAnswer,
  removeOfflineDeck,
  saveDeckOffline,
  saveQuizAttempt,
  saveSubject,
} from "@/lib/offline-storage";
import { getStudyGoalProgress, recordDeckStudiedToday } from "@/lib/study-goals";

type Card = Database["public"]["Tables"]["flashcards"]["Row"];
type Deck = Database["public"]["Tables"]["decks"]["Row"];

const QUIZ_SIZE = 20;
const GUEST_LIMIT = 2;

function chunkCards<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export const Route = createFileRoute("/decks/$deckId")({
  head: () => ({
    meta: [
      { title: "Study Deck | COGNY" },
      { name: "description", content: "Practice flashcards, quizzes, and timed exams in COGNY." },
      { property: "og:title", content: "Study Deck | COGNY" },
      { property: "og:description", content: "Practice this question bank on COGNY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:image", content: "/assets/aistudio/cogny_logo_b4165c26.png" },
      { name: "twitter:image", content: "/assets/aistudio/cogny_logo_b4165c26.png" },
    ],
  }),
  component: DeckRoute,
});

function DeckRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (user) {
    return (
      <RequireAuth>
        <DeckPage isGuest={false} />
      </RequireAuth>
    );
  }
  return (
    <div className="min-h-screen bg-grid">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <DeckPage isGuest={true} />
      </main>
    </div>
  );
}

function DeckPage({ isGuest }: { isGuest: boolean }) {
  const { deckId } = Route.useParams();
  const { user } = useAuth();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"mc" | "quiz" | "study" | "exam">("mc");
  const [filter, setFilter] = useState<"all" | "review" | "Easy" | "Medium" | "Hard">("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [quizPart, setQuizPart] = useState(0);
  const [availableOffline, setAvailableOffline] = useState(false);
  const [nextDeck, setNextDeck] = useState<{ id: string; title: string } | null>(null);

  const topics = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.topic) set.add(c.topic);
    });
    return Array.from(set);
  }, [cards]);

  const topicCards = useMemo(
    () => (topicFilter === "all" ? cards : cards.filter((c) => c.topic === topicFilter)),
    [cards, topicFilter],
  );
  const quizParts = useMemo(() => chunkCards(topicCards, QUIZ_SIZE), [topicCards]);
  const totalQuizParts = quizParts.length;

  useEffect(() => {
    setQuizPart(0);
  }, [mode, topicFilter]);

  async function load() {
    try {
      const cached = await getOfflineDeck(deckId);
      setAvailableOffline(Boolean(cached));
      if (!navigator.onLine && cached) {
        setDeck(cached.deck as Deck);
        setCards(cached.cards as Card[]);
        return;
      }
      const { data: d, error: deckError } = await supabase
        .from("decks")
        .select("*")
        .eq("id", deckId)
        .single();
      if (deckError) throw deckError;
      const { data: c, error: cardsError } = await supabase
        .from("flashcards")
        .select("*")
        .eq("deck_id", deckId)
        .order("position");
      if (cardsError) throw cardsError;
      setDeck(d);
      setCards(c ?? []);
      if (user && navigator.onLine) {
        supabase
          .from("decks")
          .select("id, title")
          .eq("user_id", user.id)
          .is("archived_at", null)
          .neq("id", deckId)
          .order("last_studied_at", { ascending: true, nullsFirst: true })
          .limit(10)
          .then(({ data: otherDecks }) => {
            const list = (otherDecks ?? []) as { id: string; title: string }[];
            if (!list.length) {
              setNextDeck(null);
              return;
            }
            const studied = new Set(getStudyGoalProgress().studiedDeckIds);
            const unstudied = list.find((item) => !studied.has(item.id));
            setNextDeck(unstudied ?? list[0]);
          });
      }
      if (cached && d) {
        await saveDeckOffline(deckId, {
          deck: d,
          cards: c ?? [],
          savedAt: new Date().toISOString(),
        });
      }
    } catch {
      const cached = await getOfflineDeck(deckId);
      if (cached) {
        setDeck(cached.deck as Deck);
        setCards(cached.cards as Card[]);
        setAvailableOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [deckId]);

  async function markCard(id: string, status: Card["status"]) {
    recordDeckStudiedToday(deckId);
    let updatedCards: Card[] = [];
    setCards((cs) => {
      updatedCards = cs.map((c) => (c.id === id ? { ...c, status } : c));
      return updatedCards;
    });
    if (navigator.onLine) {
      await supabase.from("flashcards").update({ status }).eq("id", id);
      await supabase
        .from("decks")
        .update({ last_studied_at: new Date().toISOString() })
        .eq("id", deckId);
    }
    if (availableOffline && deck) {
      await saveDeckOffline(deckId, {
        deck,
        cards: updatedCards,
        savedAt: new Date().toISOString(),
      });
    }
  }

  async function onAnswered(score: number, total: number) {
    recordDeckStudiedToday(deckId);
    if (!user) return;
    const sessionMode = mode === "mc" ? "mcq" : mode === "exam" ? "exam" : "quiz";
    const event = {
      id: makeOfflineId(),
      userId: user.id,
      deckId,
      mode: sessionMode,
      score,
      total,
      completedAt: new Date().toISOString(),
    };
    const topic = topicFilter !== "all" ? topicFilter : cards[0]?.topic ?? deck?.subject ?? null;
    void recordLocalAnswer(user.id, {
      correct: score > 0,
      topic,
      deckId,
      deckTitle: deck?.title ?? null,
      scorePct: total > 0 ? Math.round((score / total) * 100) : null,
    }).catch(() => {});
    if (deck?.subject) {
      void saveSubject({
        id: deck.subject,
        name: deck.subject,
        topics,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    if (!navigator.onLine) {
      await queueStudyEvent(event);
      return;
    }
    const { error } = await supabase.from("study_sessions").insert({
      id: event.id,
      user_id: user.id,
      deck_id: deckId,
      mode: sessionMode,
      score,
      total,
      completed_at: event.completedAt,
    });
    if (error) {
      await queueStudyEvent(event);
      toast.info("Answer saved locally and will sync when you're online.");
      return;
    }
    supabase
      .from("decks")
      .update({ last_studied_at: new Date().toISOString() })
      .eq("id", deckId)
      .then(() => {});
  }

  async function onQuizComplete(score: number, total: number) {
    recordDeckStudiedToday(deckId);
    if (!user) return;
    void saveQuizAttempt({
      id: makeOfflineId(),
      deckId,
      questionIds: [],
      answers: [],
      score,
      total,
      percentage: total > 0 ? Math.round((score / total) * 100) : 0,
      date: new Date().toISOString(),
      timeTakenMs: 0,
      synced: navigator.onLine,
    }).catch(() => {});
    if (score > 0) {
      toast.success(
        navigator.onLine
          ? `+${score} recorded to your progress & leaderboard`
          : `+${score} saved offline — will sync when connected`,
      );
    }
  }

  async function onExamComplete(score: number, total: number, timeTakenMs: number) {
    recordDeckStudiedToday(deckId);
    if (!user) return;
    const event = {
      id: makeOfflineId(),
      userId: user.id,
      deckId,
      mode: "exam",
      score,
      total,
      completedAt: new Date().toISOString(),
    };
    void recordLocalAnswer(user.id, {
      correct: score > 0,
      topic: topicFilter !== "all" ? topicFilter : deck?.subject ?? null,
      deckId,
      deckTitle: deck?.title ?? null,
      scorePct: total > 0 ? Math.round((score / total) * 100) : 0,
      durationMs: timeTakenMs,
    }).catch(() => {});
    void saveQuizAttempt({
      id: makeOfflineId(),
      deckId,
      questionIds: [],
      answers: [],
      score,
      total,
      percentage: total > 0 ? Math.round((score / total) * 100) : 0,
      date: event.completedAt,
      timeTakenMs,
      synced: navigator.onLine,
    }).catch(() => {});
    if (navigator.onLine) {
      await supabase.from("study_sessions").insert({
        id: event.id,
        user_id: user.id,
        deck_id: deckId,
        mode: "exam",
        score,
        total,
        completed_at: event.completedAt,
      });
    } else {
      await queueStudyEvent(event);
    }
  }

  async function deleteDeck() {
    if (!deck) return;
    const isShared = deck.is_public || (deck as any).shared_with_program;
    const msg = isShared
      ? "Remove this deck from your dashboard? It will stay available to classmates who already have the link."
      : "Delete this deck? It will be removed from your dashboard.";
    if (!confirm(msg)) return;
    const { error } = await supabase
      .from("decks")
      .update({ archived_at: new Date().toISOString() } as any)
      .eq("id", deckId);
    if (error) return toast.error(error.message);
    toast.success("Deck removed");
    window.location.href = "/dashboard";
  }

  function shareOnWhatsApp() {
    if (!deck) return;
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "https://cogny-ai.lovable.app";
    const deckUrl = `${baseUrl}/decks/${deckId}`;
    const sample = cards[0];
    const lines = [
      `*${deck.title}* — study deck on COGNY`,
      deck.subject ? `Subject: ${deck.subject}` : null,
      `${cards.length} questions`,
      "",
      sample ? `Sample: ${sample.question}` : null,
      "",
      `Practise the full set:`,
      deckUrl,
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank", "noopener,noreferrer");
  }

  async function togglePublic() {
    if (!deck) return;
    const { error } = await supabase
      .from("decks")
      .update({ is_public: !deck.is_public })
      .eq("id", deckId);
    if (error) return toast.error(error.message);
    setDeck({ ...deck, is_public: !deck.is_public });
    toast.success(deck.is_public ? "Deck is now private" : "Deck is now public");
  }

  async function toggleOffline() {
    if (!deck) return;
    if (availableOffline) {
      await removeOfflineDeck(deckId);
      setAvailableOffline(false);
      toast.success("Offline copy removed");
    } else {
      await saveDeckOffline(deckId, { deck, cards, savedAt: new Date().toISOString() });
      setAvailableOffline(true);
      toast.success("Saved offline");
    }
  }

  const filtered = cards.filter((c) => {
    if (filter === "all") return true;
    if (filter === "review") return c.status === "missed" || c.status === "review_later";
    return c.difficulty === filter;
  });

  if (loading) {
    return (
      <div className="grid place-items-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!deck) return <p className="text-sm text-muted-foreground">Deck not found.</p>;
  if (isGuest && !(deck.is_public || (deck as any).shared_with_program)) {
    return <Navigate to="/login" />;
  }

  const isOwner = user?.id === deck.user_id;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Home
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {deck.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span>{deck.subject ?? "General"}</span>
            <span>·</span>
            <span>{cards.length} questions</span>
            {deck.is_public && (
              <>
                <span>·</span>
                <span className="text-primary font-medium">Public</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isGuest && (
            <Button variant="outline" size="sm" onClick={toggleOffline}>
              {availableOffline ? (
                <Check className="h-4 w-4 mr-1.5 text-success" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              {availableOffline ? "Available offline" : "Download"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={shareOnWhatsApp}>
            <MessageCircle className="h-4 w-4 mr-1.5 text-success" /> WhatsApp
          </Button>
          {isOwner && (
            <>
              <Button variant="outline" size="sm" onClick={togglePublic}>
                <Share2 className="h-4 w-4 mr-1.5" />
                {deck.is_public ? "Make private" : "Make public"}
              </Button>
              <Button variant="outline" size="sm" onClick={deleteDeck} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Study Session Goal & Timer */}
      <StudyGoalBar deckId={deckId} nextDeck={nextDeck} />

      {/* Mode Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="inline-flex w-full sm:w-auto overflow-x-auto rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setMode("mc")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap transition ${
              mode === "mc"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> Multiple choice
          </button>
          {!isGuest && (
            <button
              onClick={() => setMode("quiz")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap transition ${
                mode === "quiz"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brain className="h-3.5 w-3.5" /> Open quiz
            </button>
          )}
          {!isGuest && (
            <button
              onClick={() => setMode("exam")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap transition ${
                mode === "exam"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" /> Practice exam
            </button>
          )}
          {!isGuest && (
            <button
              onClick={() => setMode("study")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap transition ${
                mode === "study"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" /> Flashcards
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {topics.length > 1 && (
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger className="w-56 h-9">
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics ({cards.length})</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t} ({cards.filter((c) => c.topic === t).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "study" && (
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cards</SelectItem>
                <SelectItem value="review">Needs review</SelectItem>
                <SelectItem value="Easy">Easy</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {(mode === "mc" || mode === "quiz") && totalQuizParts > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Section:</span>
          {quizParts.map((_, i) => (
            <button
              key={i}
              onClick={() => setQuizPart(i)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border tabular-nums transition ${
                quizPart === i
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Part {i + 1}
            </button>
          ))}
        </div>
      )}

      {mode === "study" && (
        <StudyMode
          cards={
            topicFilter === "all"
              ? filtered
              : topicCards.filter((c) =>
                  filter === "all"
                    ? true
                    : filter === "review"
                      ? c.status === "missed" || c.status === "review_later"
                      : c.difficulty === filter,
                )
          }
          onMark={markCard}
        />
      )}

      {mode === "exam" && (
        <PracticeExamMode
          cards={topicCards.map((c) => ({
            id: c.id,
            question: c.question,
            answer: c.answer,
            explanation: c.explanation,
            topic: c.topic,
            diagram: (c as any).diagram ?? null,
            questionType: (c as any).question_type ?? null,
            options: ((c as any).options as string[] | null) ?? null,
            distractors: (c as any).distractors ?? null,
          }))}
          onComplete={onExamComplete}
        />
      )}

      {mode === "quiz" && (
        <QuizMode
          cards={(quizParts[quizPart] ?? []).map((c) => ({
            id: c.id,
            question: c.question,
            answer: c.answer,
            explanation: c.explanation,
            diagram: (c as any).diagram ?? null,
            questionType: (c as any).question_type ?? null,
            options: ((c as any).options as string[] | null) ?? null,
            distractors: (c as any).distractors ?? null,
          }))}
          onAnswered={onAnswered}
          onComplete={onQuizComplete}
        />
      )}

      {mode === "mc" && (
        <MultipleChoiceMode
          deckId={`${deckId}:${topicFilter}${isGuest ? ":guest" : ""}`}
          part={quizPart}
          cards={(quizParts[quizPart] ?? []).map((c) => ({
            id: c.id,
            question: c.question,
            answer: c.answer,
            explanation: c.explanation,
            topic: c.topic,
            distractors: (c as any).distractors ?? null,
            diagram: (c as any).diagram ?? null,
            questionType: (c as any).question_type ?? null,
            options: ((c as any).options as string[] | null) ?? null,
          }))}
          onAnswered={onAnswered}
          onComplete={onQuizComplete}
          guestLimit={isGuest ? GUEST_LIMIT : undefined}
        />
      )}
    </div>
  );
}
