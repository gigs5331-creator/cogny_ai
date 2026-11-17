export type StudyGoalConfig = {
  durationMinutes: number;
  deckTarget: number;
  autoStartTimer: boolean;
};

export type StudyGoalProgress = {
  date: string; // YYYY-MM-DD local date
  elapsedSeconds: number;
  studiedDeckIds: string[];
  timeGoalCelebrated: boolean;
  deckGoalCelebrated: boolean;
};

const CONFIG_KEY = "cogni:study-goal-config";
const PROGRESS_KEY = "cogni:study-goal-progress";
export const STUDY_GOALS_EVENT = "cogni:study-goals-updated";

export function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getStudyGoalConfig(): StudyGoalConfig {
  const defaults: StudyGoalConfig = {
    durationMinutes: 30,
    deckTarget: 2,
    autoStartTimer: true,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StudyGoalConfig>;
    const duration = Number(parsed.durationMinutes);
    const decks = Number(parsed.deckTarget);
    return {
      durationMinutes:
        Number.isFinite(duration) && duration >= 5 && duration <= 360 ? Math.round(duration) : 30,
      deckTarget: Number.isFinite(decks) && decks >= 1 && decks <= 25 ? Math.round(decks) : 2,
      autoStartTimer: parsed.autoStartTimer !== false,
    };
  } catch {
    return defaults;
  }
}

export function setStudyGoalConfig(next: Partial<StudyGoalConfig>): StudyGoalConfig {
  const current = getStudyGoalConfig();
  const updated: StudyGoalConfig = {
    durationMinutes:
      next.durationMinutes !== undefined
        ? Math.max(5, Math.min(360, Math.round(Number(next.durationMinutes) || 30)))
        : current.durationMinutes,
    deckTarget:
      next.deckTarget !== undefined
        ? Math.max(1, Math.min(25, Math.round(Number(next.deckTarget) || 2)))
        : current.deckTarget,
    autoStartTimer:
      next.autoStartTimer !== undefined ? Boolean(next.autoStartTimer) : current.autoStartTimer,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(STUDY_GOALS_EVENT));
    } catch {
      /* ignore storage errors */
    }
  }
  return updated;
}

export function getStudyGoalProgress(): StudyGoalProgress {
  const today = getTodayKey();
  const empty: StudyGoalProgress = {
    date: today,
    elapsedSeconds: 0,
    studiedDeckIds: [],
    timeGoalCelebrated: false,
    deckGoalCelebrated: false,
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StudyGoalProgress>;
    if (parsed.date !== today) return empty;
    return {
      date: today,
      elapsedSeconds: Math.max(0, Math.floor(Number(parsed.elapsedSeconds) || 0)),
      studiedDeckIds: Array.isArray(parsed.studiedDeckIds)
        ? Array.from(new Set(parsed.studiedDeckIds.filter((x): x is string => typeof x === "string")))
        : [],
      timeGoalCelebrated: Boolean(parsed.timeGoalCelebrated),
      deckGoalCelebrated: Boolean(parsed.deckGoalCelebrated),
    };
  } catch {
    return empty;
  }
}

function writeProgress(progress: StudyGoalProgress, dispatch = true) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    if (dispatch) window.dispatchEvent(new Event(STUDY_GOALS_EVENT));
  } catch {
    /* ignore */
  }
}

export function addStudyElapsedSeconds(deltaSeconds: number): StudyGoalProgress {
  const current = getStudyGoalProgress();
  const next: StudyGoalProgress = {
    ...current,
    elapsedSeconds: Math.max(0, current.elapsedSeconds + Math.max(0, Math.floor(deltaSeconds))),
  };
  writeProgress(next, false);
  return next;
}

export function resetStudyElapsedTimer(): StudyGoalProgress {
  const current = getStudyGoalProgress();
  const next: StudyGoalProgress = {
    ...current,
    elapsedSeconds: 0,
    timeGoalCelebrated: false,
  };
  writeProgress(next, true);
  return next;
}

export function recordDeckStudiedToday(deckId: string): {
  progress: StudyGoalProgress;
  newlyAdded: boolean;
} {
  const current = getStudyGoalProgress();
  if (!deckId || current.studiedDeckIds.includes(deckId)) {
    return { progress: current, newlyAdded: false };
  }
  const next: StudyGoalProgress = {
    ...current,
    studiedDeckIds: [...current.studiedDeckIds, deckId],
  };
  writeProgress(next, true);
  return { progress: next, newlyAdded: true };
}

export function markGoalCelebrated(type: "time" | "deck"): StudyGoalProgress {
  const current = getStudyGoalProgress();
  const next: StudyGoalProgress = {
    ...current,
    ...(type === "time" ? { timeGoalCelebrated: true } : { deckGoalCelebrated: true }),
  };
  writeProgress(next, true);
  return next;
}

export function formatStudyClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
