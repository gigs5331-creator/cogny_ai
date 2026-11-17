export type OfflineDeck = {
  deck: Record<string, unknown>;
  cards: Record<string, unknown>[];
  savedAt: string;
};

export type DashboardSnapshot = {
  userId: string;
  decks: unknown[];
  stats: { mastered: number; avgScore: number; streak: number; totalCards: number };
  savedAt: string;
};

export type PendingStudyEvent = {
  id: string;
  userId: string;
  deckId: string;
  mode: string;
  score: number;
  total: number;
  completedAt: string;
};

export type PendingGeneration = {
  id: string;
  userId: string;
  source: string;
  text: string;
  imagePages: { base64: string; mime: string }[];
  hint: string;
  courseName: string;
  createdAt: string;
};

const DB_NAME = "cogni-offline";
const DB_VERSION = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [
        "decks",
        "dashboard",
        "studyQueue",
        "generationQueue",
        "subjects",
        "materials",
        "questions",
        "quizAttempts",
        "progress",
        "studyResources",
      ] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(store: string, value: Record<string, unknown>) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(store: string, id: string): Promise<T | null> {
  const db = await openDb();
  const result = await new Promise<T | null>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  const result = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function remove(store: string, id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export const saveDeckOffline = (id: string, value: OfflineDeck) => put("decks", { id, ...value });
export const getOfflineDeck = (id: string) => get<OfflineDeck & { id: string }>("decks", id);
export const removeOfflineDeck = (id: string) => remove("decks", id);
export const listOfflineDecks = () => getAll<OfflineDeck & { id: string }>("decks");

export const saveDashboardSnapshot = (value: DashboardSnapshot) => put("dashboard", { id: value.userId, ...value });
export const getDashboardSnapshot = (userId: string) => get<DashboardSnapshot & { id: string }>("dashboard", userId);

export const queueStudyEvent = (event: PendingStudyEvent) => put("studyQueue", { ...event });
export const listStudyEvents = () => getAll<PendingStudyEvent>("studyQueue");
export const removeStudyEvent = (id: string) => remove("studyQueue", id);

export const queueGeneration = (job: PendingGeneration) => put("generationQueue", { ...job });
export const listGenerations = () => getAll<PendingGeneration>("generationQueue");
export const removeGeneration = (id: string) => remove("generationQueue", id);

export function makeOfflineId() {
  return crypto.randomUUID();
}

/* ---------- Subjects / materials / resources / questions / attempts / progress ---------- */

export type OfflineSubject = {
  id: string;
  name: string;
  topics: string[];
  updatedAt: string;
};

export type OfflineMaterial = {
  id: string;
  subject: string | null;
  folder?: string | null;
  topic: string | null;
  fileName: string;
  fileType?: string | null;
  sizeBytes?: number;
  chapters?: string[];
  text: string;
  imagePages?: { base64: string; mime: string }[];
  metadata: Record<string, unknown>;
  saved: boolean;
  lastAccessedAt?: string;
  updatedAt: string;
};

export type SavedStudyResource = {
  id: string;
  type: "summary" | "explanation" | "visual";
  title: string;
  subject: string | null;
  materialId?: string | null;
  chapter?: string | null;
  content: Record<string, unknown>;
  createdAt: string;
};

export type OfflineQuestion = {
  id: string;
  subject: string | null;
  topic: string | null;
  question: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: string | null;
  sourceMaterialId: string | null;
  createdAt: string;
};

export type OfflineQuizAttempt = {
  id: string;
  deckId: string;
  questionIds: string[];
  answers: string[];
  score: number;
  total: number;
  percentage: number;
  date: string;
  timeTakenMs: number;
  synced: boolean;
};

export type OfflineProgress = {
  id: string; // userId
  attempted: number;
  correct: number;
  accuracy: number;
  topicMastery: Record<string, number>;
  streak: number;
  studyTimeMs: number;
  lastStudiedAt: string | null;
  lastDeckId?: string | null;
  lastDeckTitle?: string | null;
  lastTopic?: string | null;
  lastScorePct?: number | null;
  updatedAt: string;
};

export const saveSubject = (value: OfflineSubject) => put("subjects", { ...value });
export const listSubjects = () => getAll<OfflineSubject>("subjects");
export const removeSubject = (id: string) => remove("subjects", id);

export const saveMaterial = (value: OfflineMaterial) => put("materials", { ...value });
export const getMaterial = (id: string) => get<OfflineMaterial>("materials", id);
export const listMaterials = () => getAll<OfflineMaterial>("materials");
export const removeMaterial = (id: string) => remove("materials", id);

export const saveStudyResource = (value: SavedStudyResource) => put("studyResources", { ...value });
export const listStudyResources = () => getAll<SavedStudyResource>("studyResources");
export const removeStudyResource = (id: string) => remove("studyResources", id);

export const saveQuestion = (value: OfflineQuestion) => put("questions", { ...value });
export const listQuestions = () => getAll<OfflineQuestion>("questions");
export const removeQuestion = (id: string) => remove("questions", id);
export async function saveQuestions(values: OfflineQuestion[]) {
  for (const value of values) await saveQuestion(value);
}

export const saveQuizAttempt = (value: OfflineQuizAttempt) => put("quizAttempts", { ...value });
export const listQuizAttempts = () => getAll<OfflineQuizAttempt>("quizAttempts");
export const removeQuizAttempt = (id: string) => remove("quizAttempts", id);

export const getProgress = (userId: string) => get<OfflineProgress>("progress", userId);
export const saveProgress = (value: OfflineProgress) => put("progress", { ...value });

/** Merge an answered question into the locally-stored progress record. */
export async function recordLocalAnswer(
  userId: string,
  input: {
    correct: boolean;
    topic?: string | null;
    deckId?: string | null;
    deckTitle?: string | null;
    scorePct?: number | null;
    durationMs?: number;
  },
) {
  const existing = await getProgress(userId);
  const now = new Date().toISOString();
  const attempted = (existing?.attempted ?? 0) + 1;
  const correct = (existing?.correct ?? 0) + (input.correct ? 1 : 0);
  const topicMastery = { ...(existing?.topicMastery ?? {}) };
  if (input.topic) {
    const prev = topicMastery[input.topic] ?? 0;
    topicMastery[input.topic] = Math.round(prev * 0.7 + (input.correct ? 100 : 0) * 0.3);
  }
  let streak = existing?.streak ?? 0;
  const lastDay = existing?.lastStudiedAt ? new Date(existing.lastStudiedAt).toDateString() : null;
  const today = new Date().toDateString();
  if (lastDay !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streak = lastDay === yesterday.toDateString() ? streak + 1 : 1;
  }
  await saveProgress({
    id: userId,
    attempted,
    correct,
    accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    topicMastery,
    streak,
    studyTimeMs: (existing?.studyTimeMs ?? 0) + (input.durationMs ?? 25_000),
    lastStudiedAt: now,
    lastDeckId: input.deckId ?? existing?.lastDeckId ?? null,
    lastDeckTitle: input.deckTitle ?? existing?.lastDeckTitle ?? null,
    lastTopic: input.topic ?? existing?.lastTopic ?? null,
    lastScorePct: input.scorePct ?? existing?.lastScorePct ?? null,
    updatedAt: now,
  });
}

const DAILY_GOAL_KEY = "cogni:daily-goal";

export function getDailyGoalTarget(): number {
  if (typeof window === "undefined") return 20;
  try {
    const val = Number(window.localStorage.getItem(DAILY_GOAL_KEY));
    return Number.isFinite(val) && val >= 5 && val <= 200 ? val : 20;
  } catch {
    return 20;
  }
}

export function setDailyGoalTarget(count: number) {
  if (typeof window === "undefined") return;
  try {
    const clamped = Math.max(5, Math.min(200, Math.round(count)));
    window.localStorage.setItem(DAILY_GOAL_KEY, String(clamped));
  } catch {
    /* ignore */
  }
}

/* ---------- Storage management ---------- */

export async function getOfflineStorageStats() {
  const [decks, materials, questions, attempts, pendingStudy, pendingJobs, resources] = await Promise.all([
    listOfflineDecks(),
    listMaterials(),
    listQuestions(),
    listQuizAttempts(),
    listStudyEvents(),
    listGenerations(),
    listStudyResources(),
  ]);
  let usedBytes = 0;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      usedBytes = estimate.usage ?? 0;
    }
  } catch {
    /* estimate unavailable */
  }
  const savedQuestions = decks.reduce((sum, d) => sum + d.cards.length, 0) + questions.length;
  return {
    usedBytes,
    decks,
    materials,
    resources,
    savedQuestions,
    quizzes: attempts.length,
    pendingSync: pendingStudy.length + pendingJobs.length,
    lastSyncedAt: typeof localStorage !== "undefined" ? localStorage.getItem("cogni:last-sync") : null,
  };
}

/** Removes locally cached study content only — cloud data is untouched. */
export async function clearOfflineData() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const stores = [
      "decks",
      "dashboard",
      "materials",
      "questions",
      "quizAttempts",
      "progress",
      "subjects",
      "studyResources",
    ] as const;
    const tx = db.transaction(stores as unknown as string[], "readwrite");
    for (const name of stores) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
