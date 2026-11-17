import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  STUDY_GOALS_EVENT,
  addStudyElapsedSeconds,
  formatStudyClock,
  getStudyGoalConfig,
  getStudyGoalProgress,
  markGoalCelebrated,
  recordDeckStudiedToday,
  resetStudyElapsedTimer,
  setStudyGoalConfig,
  type StudyGoalConfig,
  type StudyGoalProgress,
} from "@/lib/study-goals";

const DURATION_PRESETS = [15, 30, 45, 60, 90] as const;
const DECK_PRESETS = [1, 2, 3, 5] as const;

export function StudyGoalBar({
  deckId,
  nextDeck,
}: {
  deckId: string;
  nextDeck?: { id: string; title: string } | null;
}) {
  const [config, setConfig] = useState<StudyGoalConfig>(() => getStudyGoalConfig());
  const [progress, setProgress] = useState<StudyGoalProgress>(() => getStudyGoalProgress());
  const [running, setRunning] = useState<boolean>(() => getStudyGoalConfig().autoStartTimer);
  const [editing, setEditing] = useState(false);

  // Draft values while editing
  const [draftMins, setDraftMins] = useState<number>(config.durationMinutes);
  const [draftDecks, setDraftDecks] = useState<number>(config.deckTarget);
  const [draftAutoStart, setDraftAutoStart] = useState<boolean>(config.autoStartTimer);

  // Sync across tabs / components (e.g., if user answers a question or resets goal)
  useEffect(() => {
    const sync = () => {
      const latestCfg = getStudyGoalConfig();
      setConfig(latestCfg);
      setProgress(getStudyGoalProgress());
    };
    window.addEventListener(STUDY_GOALS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STUDY_GOALS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Active study timer (pauses cleanly when browser tab is hidden)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const updated = addStudyElapsedSeconds(1);
      setProgress(updated);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Celebrate when reaching duration or deck goal for the first time today
  useEffect(() => {
    const targetSecs = config.durationMinutes * 60;
    if (progress.elapsedSeconds >= targetSecs && !progress.timeGoalCelebrated) {
      markGoalCelebrated("time");
      toast.success(`Study time goal reached (${config.durationMinutes} min)!`);
    }
    if (progress.studiedDeckIds.length >= config.deckTarget && !progress.deckGoalCelebrated) {
      markGoalCelebrated("deck");
      toast.success(
        `Deck goal reached (${progress.studiedDeckIds.length}/${config.deckTarget} decks studied)!`,
      );
    }
  }, [
    progress.elapsedSeconds,
    progress.studiedDeckIds.length,
    progress.timeGoalCelebrated,
    progress.deckGoalCelebrated,
    config.durationMinutes,
    config.deckTarget,
  ]);

  const targetSeconds = config.durationMinutes * 60;
  const timePct = Math.min(100, Math.round((progress.elapsedSeconds / Math.max(1, targetSeconds)) * 100));
  const decksDone = progress.studiedDeckIds.length;
  const deckPct = Math.min(100, Math.round((decksDone / Math.max(1, config.deckTarget)) * 100));
  const currentDeckCounted = progress.studiedDeckIds.includes(deckId);

  const timeMet = progress.elapsedSeconds >= targetSeconds;
  const decksMet = decksDone >= config.deckTarget;
  const bothMet = timeMet && decksMet;

  function openEditor() {
    setDraftMins(config.durationMinutes);
    setDraftDecks(config.deckTarget);
    setDraftAutoStart(config.autoStartTimer);
    setEditing((v) => !v);
  }

  function saveGoal() {
    const updated = setStudyGoalConfig({
      durationMinutes: draftMins,
      deckTarget: draftDecks,
      autoStartTimer: draftAutoStart,
    });
    setConfig(updated);
    setEditing(false);
    toast.success(`Study goal set: ${updated.durationMinutes} min · ${updated.deckTarget} deck${updated.deckTarget === 1 ? "" : "s"}`);
  }

  function handleMarkDeckStudied() {
    const { progress: next, newlyAdded } = recordDeckStudiedToday(deckId);
    setProgress(next);
    if (newlyAdded) {
      toast.success(`Deck counted toward goal (${next.studiedDeckIds.length}/${config.deckTarget})`);
    }
  }

  return (
    <section
      aria-label="Study session goal"
      className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Target className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-foreground">
                Study Session Goal
              </h2>
              {bothMet && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Goal complete
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              Target: {config.durationMinutes} min · {config.deckTarget} deck
              {config.deckTarget === 1 ? "" : "s"} today
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRunning((r) => !r)}
            className="h-8 gap-1.5 text-xs whitespace-nowrap"
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? "Pause timer" : "Resume timer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setProgress(resetStudyElapsedTimer())}
            title="Reset today's timer"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant={editing ? "default" : "outline"}
            size="sm"
            onClick={openEditor}
            className="h-8 gap-1.5 text-xs whitespace-nowrap"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {editing ? "Close" : "Set goal"}
          </Button>
        </div>
      </div>

      {/* Live Dual Progress Bars */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Time Goal */}
        <div className="rounded-lg border border-border bg-background p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" /> Study duration
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {formatStudyClock(progress.elapsedSeconds)}{" "}
              <span className="font-normal text-muted-foreground">
                / {config.durationMinutes}:00
              </span>
            </span>
          </div>
          <Progress value={timePct} className="h-1.5" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{timeMet ? "Time goal achieved" : `${timePct}% of time target`}</span>
            {timeMet && (
              <button
                type="button"
                onClick={() => {
                  const updated = setStudyGoalConfig({
                    durationMinutes: config.durationMinutes + 15,
                  });
                  setConfig(updated);
                }}
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> 15m
              </button>
            )}
          </div>
        </div>

        {/* Decks Goal */}
        <div className="rounded-lg border border-border bg-background p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Layers className="h-3.5 w-3.5 text-primary" /> Decks studied
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {decksDone}{" "}
              <span className="font-normal text-muted-foreground">
                / {config.deckTarget} deck{config.deckTarget === 1 ? "" : "s"}
              </span>
            </span>
          </div>
          <Progress value={deckPct} className="h-1.5" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
            <span>
              {currentDeckCounted
                ? "This deck counted"
                : "Answer a question or mark complete to count this deck"}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {!currentDeckCounted && (
                <button
                  type="button"
                  onClick={handleMarkDeckStudied}
                  className="font-medium text-primary hover:underline"
                >
                  Mark studied
                </button>
              )}
              {currentDeckCounted && !decksMet && nextDeck && (
                <Link
                  to="/decks/$deckId"
                  params={{ deckId: nextDeck.id }}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Next deck <ArrowRight className="h-3 w-3" />
                </Link>
              )}
              {decksMet && (
                <button
                  type="button"
                  onClick={() => {
                    const updated = setStudyGoalConfig({
                      deckTarget: config.deckTarget + 1,
                    });
                    setConfig(updated);
                  }}
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> 1 deck
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline Goal Customizer */}
      {editing && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Duration Picker */}
            <div className="space-y-2">
              <Label htmlFor="goal-duration-input" className="text-xs font-semibold text-foreground">
                How long do you want to study? (minutes)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDraftMins(mins)}
                    className={`rounded-md border px-2.5 py-1.5 font-mono text-xs tabular-nums transition ${
                      draftMins === mins
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <Input
                id="goal-duration-input"
                type="number"
                min={5}
                max={360}
                value={draftMins}
                onChange={(e) =>
                  setDraftMins(Math.max(5, Math.min(360, Number(e.target.value) || 5)))
                }
                className="h-9 font-mono text-sm tabular-nums"
              />
            </div>

            {/* Deck Count Picker */}
            <div className="space-y-2">
              <Label htmlFor="goal-decks-input" className="text-xs font-semibold text-foreground">
                How many decks do you want to study?
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {DECK_PRESETS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setDraftDecks(count)}
                    className={`rounded-md border px-2.5 py-1.5 font-mono text-xs tabular-nums transition ${
                      draftDecks === count
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {count} {count === 1 ? "deck" : "decks"}
                  </button>
                ))}
              </div>
              <Input
                id="goal-decks-input"
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={draftAutoStart}
                onChange={(e) => setDraftAutoStart(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Auto-start timer when opening a deck
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={saveGoal}>
                Save goal
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
