import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { ClaudeQuizImport } from "@/components/claude-quiz-import";
import { Diagram } from "@/components/diagram";
import { MathText } from "@/components/math-text";
import { StudioPipelineVisual } from "@/components/studio-pipeline-visual";
import { splitQuizParts } from "@/lib/quiz-import";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateFlashcards, classifyDocument, generateStudyResource } from "@/lib/ai.functions";
import { notifyNewDeck } from "@/lib/notify.functions";
import { extractFromFile } from "@/lib/extract-text";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ImageIcon,
  Sparkles,
  Upload,
  Trash2,
  Save,
  Users,
  CheckCircle2,
  Layers,
  BookOpen,
  GraduationCap,
  Lightbulb,
  FileText,
  Shapes,
  Library,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMaterial,
  listGenerations,
  listMaterials,
  makeOfflineId,
  queueGeneration,
  removeGeneration,
  saveMaterial,
  saveStudyResource,
  type OfflineMaterial,
  type PendingGeneration,
} from "@/lib/offline-storage";
import {
  buildKnowledgeMap,
  countNumberedQuestions,
  countQuestionCandidates,
  dedupeGeneratedCards,
  detectChapters,
  smartSplitText,
  validateAndNumberCards,
  type ChapterSegment,
} from "@/lib/question-engine";
import { CORE_SUBJECTS } from "@/lib/subjects";

type StudioMode =
  | "question_bank"
  | "flashcards"
  | "exam"
  | "summary"
  | "explanation"
  | "visual";

export const Route = createFileRoute("/create")({
  validateSearch: (s: Record<string, unknown>): { materialId?: string; subject?: string; mode?: string } => ({
    ...(typeof s.materialId === "string" ? { materialId: s.materialId } : {}),
    ...(typeof s.subject === "string" ? { subject: s.subject } : {}),
    ...(typeof s.mode === "string" ? { mode: s.mode } : {}),
  }),
  component: () => (
    <RequireAuth>
      <StudyStudio />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Study Studio | COGNY" },
      {
        name: "description",
        content:
          "Transform learning materials into exact-count question banks, flashcards, practice exams, explanations, summaries, and visual diagrams.",
      },
      { property: "og:title", content: "COGNY AI Study Studio" },
      {
        property: "og:description",
        content: "AI-powered academic resource studio for university and high school students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Card = {
  question: string;
  answer: string;
  explanation: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  questionType?: string;
  options?: string[] | null;
  distractors?: string[];
  diagram?: string;
};

const PARALLEL_LIMIT = 4;
const MAX_RETRIES = 2;

type StageKey =
  | "ingest"
  | "ocr"
  | "index"
  | "chunk"
  | "process"
  | "dedupe"
  | "coverage"
  | "save";
type StageState = "pending" | "running" | "done" | "skipped" | "failed";

type ProgressState = {
  stages: Record<StageKey, StageState>;
  processed: number;
  total: number;
  generatedCount: number;
  targetTotal: number | null;
  failedChunks: number[];
  message: string;
};

const RESOURCE_MODES: {
  id: StudioMode;
  label: string;
  desc: string;
  icon: typeof Layers;
}[] = [
  { id: "question_bank", label: "Question Bank", desc: "Exhaustive mixed questions", icon: Layers },
  { id: "flashcards", label: "Flashcards", desc: "Active recall Q&A cards", icon: BookOpen },
  { id: "exam", label: "Practice Exam", desc: "Timed test preparation", icon: GraduationCap },
  { id: "explanation", label: "Explanations", desc: "Step-by-step solutions", icon: Lightbulb },
  { id: "summary", label: "Summaries", desc: "Notes & definitions", icon: FileText },
  { id: "visual", label: "Visual Learning", desc: "Diagrams & breakdowns", icon: Shapes },
];

const FORMAT_OPTIONS = [
  { id: "multiple_choice", label: "Multiple Choice" },
  { id: "true_false", label: "True / False" },
  { id: "short_answer", label: "Short Answer" },
  { id: "essay", label: "Long-form / Essay" },
  { id: "application", label: "Application-based" },
  { id: "scenario", label: "Scenario-based" },
  { id: "numerical", label: "Numerical" },
] as const;

async function saveDeckParts(opts: {
  userId: string;
  baseTitle: string;
  subject: string | null;
  source: string;
  courseName: string;
  shareWithProgram: boolean;
  cards: Card[];
}): Promise<{ id: string; title: string }[]> {
  const groups = splitQuizParts(opts.cards);
  const created: { id: string; title: string }[] = [];
  for (let g = 0; g < groups.length; g++) {
    const title = groups.length > 1 ? `${opts.baseTitle} — Part ${g + 1}` : opts.baseTitle;
    const { data: deck, error } = await supabase
      .from("decks")
      .insert({
        user_id: opts.userId,
        title,
        subject: opts.subject,
        source: opts.source,
        course_name: opts.courseName,
        shared_with_program: opts.shareWithProgram,
      } as any)
      .select()
      .single();
    if (error) throw error;
    const rows = groups[g].map((c, i) => ({
      deck_id: deck.id,
      user_id: opts.userId,
      question: c.question,
      answer: c.answer,
      explanation: c.explanation,
      topic: c.topic,
      difficulty: c.difficulty,
      position: i,
      question_type: c.questionType ?? "short_answer",
      options: c.options ?? null,
      distractors: c.distractors ?? null,
      diagram: c.diagram ?? null,
    }));

    const { error: e2 } = await supabase.from("flashcards").insert(rows as any);
    if (e2) throw e2;
    created.push({ id: deck.id, title });
  }
  return created;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pump));
  return results;
}

function StudyStudio() {
  const nav = useNavigate();
  const searchParams = Route.useSearch();
  const { user } = useAuth();
  const generate = useServerFn(generateFlashcards);
  const classify = useServerFn(classifyDocument);
  const generateGuide = useServerFn(generateStudyResource);
  const notify = useServerFn(notifyNewDeck);

  // Source inputs
  const [libraryDocs, setLibraryDocs] = useState<OfflineMaterial[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("none");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");

  // Studio configuration
  const [resourceMode, setResourceMode] = useState<StudioMode>(
    (["question_bank", "flashcards", "exam", "summary", "explanation", "visual"].includes(
      searchParams.mode ?? "",
    )
      ? (searchParams.mode as StudioMode)
      : "question_bank"),
  );
  const [chapterId, setChapterId] = useState<string>("all");
  const [countMode, setCountMode] = useState<"max" | "exact">("max");
  const [exactCount, setExactCount] = useState<number>(30);
  const [difficultyFilter, setDifficultyFilter] = useState<"Mixed" | "Easy" | "Medium" | "Hard">("Mixed");
  const [selectedFormats, setSelectedFormats] = useState<string[]>([
    "multiple_choice",
    "true_false",
    "short_answer",
    "application",
  ]);

  // Metadata
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(searchParams.subject ?? "");
  const [courseName, setCourseName] = useState("");
  const [shareWithProgram, setShareWithProgram] = useState(true);

  // Processing & output states
  const [processing, setProcessing] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [progress, setProgress] = useState<ProgressState>({
    stages: {
      ingest: "pending",
      ocr: "pending",
      index: "pending",
      chunk: "pending",
      process: "pending",
      dedupe: "pending",
      coverage: "pending",
      save: "pending",
    },
    processed: 0,
    total: 0,
    generatedCount: 0,
    targetTotal: null,
    failedChunks: [],
    message: "",
  });

  const [cards, setCards] = useState<Card[]>([]);
  const [guideResult, setGuideResult] = useState<{
    kind: "summary" | "explanation" | "visual";
    data: any;
  } | null>(null);
  const [coverage, setCoverage] = useState<{ topics: string[]; percent: number } | null>(null);
  const [pendingJobs, setPendingJobs] = useState<PendingGeneration[]>([]);
  const [queuedInput, setQueuedInput] = useState<PendingGeneration | null>(null);
  const [online, setOnline] = useState(true);
  const [imported, setImported] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load library & queued jobs + optional ?materialId=
  useEffect(() => {
    void listMaterials().then((mats) => {
      setLibraryDocs(mats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    });
    if (searchParams.materialId) {
      void getMaterial(searchParams.materialId).then((m) => {
        if (!m) return;
        setSelectedDocId(m.id);
        setText(m.text);
        if (m.subject && !subject) setSubject(m.subject);
        if (!courseName) setCourseName(m.fileName.replace(/\.[^.]+$/, ""));
      });
    }
  }, [searchParams.materialId]);

  useEffect(() => {
    if (searchParams.mode && ["question_bank", "flashcards", "exam", "summary", "explanation", "visual"].includes(searchParams.mode)) {
      setResourceMode(searchParams.mode as StudioMode);
    }
  }, [searchParams.mode]);

  useEffect(() => {
    if (!user) return;
    const refresh = () =>
      listGenerations().then((jobs) => setPendingJobs(jobs.filter((job) => job.userId === user.id)));
    const markOnline = () => {
      setOnline(true);
      void refresh();
    };
    const markOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    void refresh();
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [user]);

  // Chapter detection on current text
  const chapters: ChapterSegment[] = useMemo(() => {
    if (!text.trim()) return [];
    return detectChapters(text);
  }, [text]);

  useEffect(() => {
    setChapterId("all");
  }, [text]);

  function setStage(key: StageKey, state: StageState, msg?: string) {
    setProgress((p) => ({
      ...p,
      stages: { ...p.stages, [key]: state },
      message: msg ?? p.message,
    }));
  }

  function toggleFormat(id: string) {
    setSelectedFormats((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((f) => f !== id) : prev;
      }
      return [...prev, id];
    });
  }

  async function selectLibraryDoc(id: string) {
    setSelectedDocId(id);
    setFile(null);
    if (id === "none") return;
    const doc = libraryDocs.find((d) => d.id === id);
    if (!doc) return;
    setText(doc.text);
    if (doc.subject) setSubject(doc.subject);
    setCourseName(doc.fileName.replace(/\.[^.]+$/, ""));
    await saveMaterial({ ...doc, lastAccessedAt: new Date().toISOString() });
    toast.success(`Loaded "${doc.fileName}"`);
  }

  async function handleGenerate() {
    setStartedAt(Date.now());
    setProcessing(true);
    setGuideResult(null);
    setCoverage(null);
    const requestedTarget =
      resourceMode === "summary" || resourceMode === "explanation" || resourceMode === "visual"
        ? null
        : countMode === "exact"
          ? Math.max(1, Math.min(500, exactCount || 20))
          : null;

    setProgress({
      stages: {
        ingest: "running",
        ocr: "pending",
        index: "pending",
        chunk: "pending",
        process: "pending",
        dedupe: "pending",
        coverage: "pending",
        save: "pending",
      },
      processed: 0,
      total: 0,
      generatedCount: 0,
      targetTotal: requestedTarget,
      failedChunks: [],
      message: "Reading and indexing your document…",
    });

    try {
      let derivedCourse = courseName.trim();
      let extractedText = "";
      let imagePages: { base64: string; mime: string }[] = [];
      const selectedDoc = selectedDocId !== "none" ? libraryDocs.find((d) => d.id === selectedDocId) : undefined;
      let sourceName = file?.name ?? selectedDoc?.fileName ?? "pasted text";

      if (queuedInput) {
        extractedText = queuedInput.text;
        imagePages = queuedInput.imagePages;
        sourceName = queuedInput.source;
        if (!derivedCourse) derivedCourse = queuedInput.courseName;
        setStage("ingest", "done");
        setStage(
          "ocr",
          imagePages.length ? "running" : "skipped",
          imagePages.length ? `Reading ${imagePages.length} saved page(s) with OCR…` : undefined,
        );
      } else if (file) {
        if (!derivedCourse) derivedCourse = file.name.replace(/\.[^.]+$/, "");
        const extracted = await extractFromFile(file);
        if (extracted.kind === "image") {
          imagePages = [{ base64: extracted.imageBase64, mime: extracted.imageMimeType }];
          if (text) extractedText = text;
          setStage("ingest", "done");
          setStage("ocr", "running", "Running vision OCR on image…");
        } else if (extracted.kind === "images") {
          imagePages = extracted.pages;
          if (text) extractedText = text;
          setStage("ingest", "done");
          setStage("ocr", "running", `Scanned PDF — reading ${imagePages.length} page(s) with OCR…`);
        } else {
          extractedText = (text ? text + "\n\n" : "") + extracted.text;
          setStage("ingest", "done");
          setStage("ocr", "skipped");
        }
      } else if (selectedDoc?.imagePages?.length && text.startsWith("[")) {
        imagePages = selectedDoc.imagePages;
        setStage("ingest", "done");
        setStage("ocr", "running", "Reading scanned library document…");
      } else if (text.trim()) {
        extractedText = text;
        setStage("ingest", "done");
        setStage("ocr", "skipped");
      } else {
        throw new Error("Select a document, upload a file, or paste study text first.");
      }

      // Narrow to chosen chapter if selected
      const chosenChapter =
        chapterId !== "all" ? chapters.find((c) => c.id === chapterId) : undefined;
      if (chosenChapter && !imagePages.length) {
        extractedText = chosenChapter.text;
      }

      const usingImages = imagePages.length > 0;

      // Auto-save newly uploaded file / text into My Library
      if (extractedText.trim() && file) {
        const docChapters = detectChapters(extractedText).map((c) => c.title);
        const chunksCount = smartSplitText(extractedText).length;
        const newMat: OfflineMaterial = {
          id: makeOfflineId(),
          subject: subject.trim() || derivedCourse || null,
          folder: "Lecture Notes",
          topic: chosenChapter?.title ?? docChapters[0] ?? null,
          fileName: file.name,
          fileType: file.type || file.name.split(".").pop() || "document",
          sizeBytes: file.size,
          chapters: docChapters,
          text: extractedText.slice(0, 500_000),
          imagePages: usingImages ? imagePages : undefined,
          metadata: {
            wordCount: extractedText.split(/\s+/).filter(Boolean).length,
            chunkCount: chunksCount || 1,
            chars: extractedText.length,
          },
          saved: true,
          lastAccessedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        void saveMaterial(newMat).catch(() => {});
      }

      if (!navigator.onLine) {
        if (!user) throw new Error("Sign in online once before queuing a document.");
        const job: PendingGeneration = {
          id: makeOfflineId(),
          userId: user.id,
          source: sourceName,
          text: extractedText,
          imagePages,
          hint,
          courseName: derivedCourse,
          createdAt: new Date().toISOString(),
        };
        await queueGeneration(job);
        setPendingJobs((jobs) => [...jobs, job]);
        toast.success("Saved offline. Generation will resume when you're connected.");
        return;
      }

      // NON-QUESTION STUDY RESOURCES (Summary, Explanation, Visual Diagram)
      if (resourceMode === "summary" || resourceMode === "explanation" || resourceMode === "visual") {
        if (!extractedText.trim()) {
          throw new Error("Summaries, Explanations, and Visual guides require extractable text.");
        }
        setStage("index", "done");
        setStage("chunk", "done");
        setStage("process", "running", `Generating ${resourceMode} guide…`);
        setProgress((p) => ({ ...p, total: 1, processed: 0 }));

        const res = await generateGuide({
          data: {
            resourceType: resourceMode,
            text: extractedText.slice(0, 100_000),
            chapterFocus: chosenChapter?.title,
            hint: hint.trim() || undefined,
          },
        });
        setProgress((p) => ({ ...p, processed: 1 }));
        setStage("process", "done");
        setStage("dedupe", "skipped");
        setStage("coverage", "done");
        setStage("save", "running", "Saving to your library…");

        const resourceTitle = String((res.data as any)?.title || sourceName || "Study Guide");
        const resourceSubject = subject.trim() || String((res.data as any)?.subject || "General");

        await saveStudyResource({
          id: makeOfflineId(),
          type: res.kind,
          title: resourceTitle,
          subject: resourceSubject,
          materialId: selectedDoc?.id ?? null,
          chapter: chosenChapter?.title ?? null,
          content: res.data,
          createdAt: new Date().toISOString(),
        });
        setStage("save", "done");
        setGuideResult(res);
        toast.success(`Generated & saved ${resourceMode} guide to My Library!`);
        return;
      }

      // QUESTION BANK / FLASHCARDS / PRACTICE EXAM PIPELINE
      setStage("index", "running", "Identifying chapters, topics, and core concepts…");
      const knowledgeMap = buildKnowledgeMap(extractedText);
      setStage("index", "done");

      setStage("chunk", "running", "Splitting large document on chapter boundaries…");
      let chunks = usingImages
        ? imagePages.map(() => extractedText)
        : smartSplitText(extractedText, 8_000, 1_200);
      setStage("chunk", "done");
      if (usingImages) setStage("ocr", "done");

      const rawQuestionCount = usingImages ? 0 : countNumberedQuestions(extractedText);
      const rawChunks = chunks.slice();
      const looksLikeQuestionPaper = rawQuestionCount >= 3;

      const classifiedTopics: string[] = [];
      if (!usingImages && !looksLikeQuestionPaper) {
        setStage("index", "running", "Separating metadata from core academic content…");
        const structured = await runWithConcurrency(chunks, PARALLEL_LIMIT, async (chunk) => {
          try {
            const res = await classify({ data: { text: chunk } });
            classifiedTopics.push(...res.topics);
            const academic = (res.academicContent || "").trim();
            return academic.length >= Math.min(200, chunk.length * 0.25) ? academic : chunk;
          } catch {
            return chunk;
          }
        });
        const kept = structured.filter((c) => c.trim().length > 40);
        if (kept.length) chunks = kept;
        extractedText = chunks.join("\n\n");
        setStage("index", "done", "Academic content isolated.");
      } else if (looksLikeQuestionPaper) {
        chunks = rawChunks;
        setStage("index", "done", "Question paper detected — preserving every question.");
      }

      const detectedQuestions = Math.max(rawQuestionCount, countNumberedQuestions(extractedText));
      const desiredTotal = requestedTarget ?? 0;

      // Calculate per-chunk targets
      const chunkTargets = chunks.map((c) => {
        if (countMode === "exact" && desiredTotal > 0) {
          return Math.max(4, Math.ceil((desiredTotal / chunks.length) * 1.25));
        }
        // Maximum Extraction Mode: dense target (~1 per 95 words + candidate count)
        const detected = usingImages ? 0 : countQuestionCandidates(c);
        const words = c.split(/\s+/).filter(Boolean).length;
        const byLength = Math.max(10, Math.round(words / 95));
        return Math.max(detected, byLength);
      });

      setStage(
        "process",
        "running",
        countMode === "exact"
          ? `Generating exact ${desiredTotal} questions across ${chunks.length} section(s)…`
          : `Maximum extraction across ${chunks.length} section(s)…`,
      );
      setProgress((p) => ({
        ...p,
        total: chunks.length,
        processed: 0,
        generatedCount: 0,
        targetTotal: countMode === "exact" ? desiredTotal : null,
      }));

      let firstTitle = "";
      let firstSubject = "";
      const failed: number[] = [];
      let runningCount = 0;

      const buildPayload = (chunk: string, idx: number, extraHint?: string, overrideTarget?: number) => {
        const defaultTarget = Math.max(5, Math.min(40, chunkTargets[idx] ?? 18));
        const target = overrideTarget ?? defaultTarget;
        const modeHint =
          resourceMode === "exam"
            ? "Format as formal university practice examination questions."
            : resourceMode === "flashcards"
              ? "Craft crisp active-recall flashcard questions & answers."
              : "Extract maximum possible distinct academic questions.";
        const payload: any = {
          hint: [modeHint, hint, extraHint].filter(Boolean).join(" ") || undefined,
          targetCards: target,
          exactCount: countMode === "exact" || looksLikeQuestionPaper,
          maxExtraction: countMode === "max",
          questionFormats: selectedFormats,
          difficultyFilter,
          chapterFocus: chosenChapter?.title,
        };
        if (usingImages && imagePages[idx]) {
          payload.imageBase64 = imagePages[idx].base64;
          payload.imageMimeType = imagePages[idx].mime;
          payload.hint =
            [
              hint,
              extraHint,
              imagePages.length > 1
                ? `Page ${idx + 1} of ${imagePages.length}. Extract EVERY question visible on this page.`
                : "Extract EVERY question visible in this image.",
            ]
              .filter(Boolean)
              .join(" ") || undefined;
          if (chunk) payload.text = chunk;
        } else {
          payload.text = chunks.length > 1 ? `[Section ${idx + 1} of ${chunks.length}]\n\n${chunk}` : chunk;
        }
        return payload;
      };

      const rescueSection = async (chunk: string, idx: number): Promise<any | null> => {
        if (usingImages || chunk.length < 1200) return null;
        const pieces: string[] = [];
        const size = Math.ceil(chunk.length / 3);
        for (let i = 0; i < chunk.length; i += size) pieces.push(chunk.slice(i, i + size + 300));
        const recovered: Card[] = [];
        let t = "",
          s = "";
        for (const piece of pieces) {
          const words = piece.split(/\s+/).filter(Boolean).length;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const r = await generate({
                data: {
                  text: piece,
                  hint: hint || undefined,
                  targetCards: Math.max(5, Math.min(15, Math.round(words / 100))),
                  maxExtraction: countMode === "max",
                  questionFormats: selectedFormats,
                  difficultyFilter,
                },
              });
              recovered.push(...r.cards);
              t ||= r.suggested_title;
              s ||= r.suggested_subject;
              break;
            } catch {
              await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
            }
          }
        }
        return recovered.length ? { suggested_title: t, suggested_subject: s, cards: recovered } : null;
      };

      const chunkResults = await runWithConcurrency(chunks, PARALLEL_LIMIT, async (chunk, idx) => {
        const payload = buildPayload(chunk, idx);
        let lastErr: any = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const result = await generate({ data: payload });
            runningCount += result.cards.length;
            setProgress((p) => ({
              ...p,
              processed: p.processed + 1,
              generatedCount: runningCount,
              message:
                countMode === "exact" && desiredTotal > 0
                  ? `Generated ${Math.min(runningCount, desiredTotal)} / ${desiredTotal} · ${Math.max(0, desiredTotal - runningCount)} remaining`
                  : `Extracted ${runningCount} questions (${p.processed + 1}/${chunks.length} sections)`,
            }));
            return { ok: true as const, idx, result };
          } catch (e) {
            lastErr = e;
            const busy = /rate limit|429|busy/i.test(String((e as any)?.message ?? e));
            await new Promise((r) => setTimeout(r, (busy ? 5000 : 1500) * (attempt + 1)));
          }
        }
        const rescued = await rescueSection(chunk, idx);
        if (rescued) {
          runningCount += rescued.cards.length;
          setProgress((p) => ({
            ...p,
            processed: p.processed + 1,
            generatedCount: runningCount,
          }));
          return { ok: true as const, idx, result: rescued };
        }
        failed.push(idx + 1);
        setProgress((p) => ({
          ...p,
          processed: p.processed + 1,
          failedChunks: [...p.failedChunks, idx + 1],
        }));
        return { ok: false as const, idx, error: lastErr };
      });

      const successful = chunkResults.filter((r) => r.ok) as Array<{
        ok: true;
        idx: number;
        result: any;
      }>;
      if (successful.length === 0) {
        const reason = String((chunkResults[0] as any)?.error?.message ?? "");
        throw new Error(reason || "All sections failed to process — please try again.");
      }

      successful.sort((a, b) => a.idx - b.idx);
      firstTitle = successful[0].result.suggested_title;
      firstSubject = successful[0].result.suggested_subject;
      let pool: Card[] = successful.flatMap((r) => r.result.cards);

      // Gap-fill sweeps in Max Extraction mode (or question papers) to capture any missed questions
      if (countMode === "max") {
        const sectionCards: Card[][] = chunks.map(() => []);
        for (const r of successful) sectionCards[r.idx] = (r.result.cards as Card[]).slice();

        const maxSweeps = looksLikeQuestionPaper ? 3 : 1;
        for (let sweep = 0; sweep < maxSweeps; sweep++) {
          const threshold = looksLikeQuestionPaper ? 1 : 0.85;
          const gapSections = successful
            .map((r) => ({
              idx: r.idx,
              got: sectionCards[r.idx].length,
              want: chunkTargets[r.idx] ?? 0,
              cards: sectionCards[r.idx],
            }))
            .filter((s) => s.want > 0 && s.got < Math.ceil(s.want * threshold));
          if (gapSections.length === 0) break;

          setProgress((p) => ({
            ...p,
            message: `Re-scanning ${gapSections.length} section(s) for remaining questions…`,
          }));
          const extra = await runWithConcurrency(gapSections, PARALLEL_LIMIT, async (s) => {
            const covered = s.cards.slice(0, 100).map((c) => c.question);
            const missing = Math.max(4, s.want - s.got);
            try {
              const res = await generate({
                data: {
                  ...buildPayload(
                    chunks[s.idx],
                    s.idx,
                    `PASS ${sweep + 2}: Extract all remaining concepts and sub-parts not covered yet.`,
                    Math.min(35, missing),
                  ),
                  avoidQuestions: covered,
                },
              });
              return { idx: s.idx, cards: res.cards as Card[] };
            } catch {
              return { idx: s.idx, cards: [] as Card[] };
            }
          });
          let recovered = 0;
          for (const e of extra) {
            if (!e.cards.length) continue;
            sectionCards[e.idx].push(...e.cards);
            pool.push(...e.cards);
            recovered += e.cards.length;
          }
          if (!recovered) break;
          setProgress((p) => ({ ...p, generatedCount: p.generatedCount + recovered }));
        }
      }

      // Deduplicate before checking exact-count shortage
      setStage("dedupe", "running", "Deduplicating & validating answers…");
      let { unique: deduped } = dedupeGeneratedCards(pool);

      // EXACT COUNT ENFORCEMENT CONTINUATION LOOP:
      // If Exact Count mode was requested and we have fewer than `desiredTotal`,
      // run continuation batches until we reach `desiredTotal` (never silently under-deliver!)
      if (countMode === "exact" && desiredTotal > 0 && deduped.length < desiredTotal && !usingImages) {
        let attempts = 0;
        while (deduped.length < desiredTotal && attempts < 6) {
          attempts++;
          const remaining = desiredTotal - deduped.length;
          const batchWant = Math.min(25, remaining + 2);
          const sourceSlice = chunks[attempts % chunks.length] || extractedText.slice(0, 12_000);
          const avoidList = deduped.slice(-110).map((c) => c.question);

          setStage(
            "process",
            "running",
            `Continuation batch ${attempts}: generated ${deduped.length} of ${desiredTotal} (${remaining} remaining)…`,
          );
          setProgress((p) => ({
            ...p,
            generatedCount: deduped.length,
            message: `Generated ${deduped.length} / ${desiredTotal} · ${remaining} remaining`,
          }));

          try {
            const extra = await generate({
              data: {
                text: sourceSlice,
                hint: [
                  hint,
                  `CONTINUATION BATCH: Generate ${batchWant} brand-new, non-overlapping questions covering different nuances, edge cases, applications, or scenarios.`,
                ]
                  .filter(Boolean)
                  .join(" "),
                targetCards: batchWant,
                exactCount: true,
                questionFormats: selectedFormats,
                difficultyFilter,
                chapterFocus: chosenChapter?.title,
                avoidQuestions: avoidList,
              },
            });
            pool = [...deduped, ...(extra.cards as Card[])];
            deduped = dedupeGeneratedCards(pool).unique;
          } catch {
            // brief backoff before trying next chunk
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }

      // Trim cleanly if Exact Count exceeded requested total
      if (countMode === "exact" && desiredTotal > 0 && deduped.length > desiredTotal) {
        deduped = deduped.slice(0, desiredTotal);
      }

      // Validate options, answers, and numbering integrity
      const validatedCards = validateAndNumberCards(deduped as any, {
        stripLeadingNumbers: false,
      }) as Card[];

      setProgress((p) => ({
        ...p,
        generatedCount: validatedCards.length,
        message: `Verified ${validatedCards.length} question${validatedCards.length === 1 ? "" : "s"}.`,
      }));
      setStage("dedupe", "done");

      // Coverage Report
      setStage("coverage", "running");
      const conceptSeen = new Set(validatedCards.map((c) => (c.topic || "General").trim().toLowerCase()));
      const coveredTopics = Array.from(conceptSeen);
      const mapTopics =
        knowledgeMap.length > 0
          ? knowledgeMap
          : Array.from(new Set(classifiedTopics)).slice(0, 40);
      const expectedTopics = mapTopics.length > 0 ? mapTopics.map((t) => t.toLowerCase()) : coveredTopics;
      const hit = expectedTopics.filter((t) =>
        coveredTopics.some((c) => c.includes(t.slice(0, 20)) || t.includes(c.slice(0, 20))),
      ).length;
      const percent = expectedTopics.length
        ? Math.min(100, Math.round((hit / expectedTopics.length) * 100))
        : 100;
      setCoverage({
        topics: mapTopics.length ? mapTopics : Array.from(conceptSeen).slice(0, 20),
        percent,
      });
      setStage("coverage", "done");

      const safeTitle = (
        title.trim() ||
        firstTitle ||
        derivedCourse ||
        sourceName.replace(/\.[^.]+$/, "") ||
        "Untitled study set"
      ).trim();
      const safeSubject = (subject.trim() || firstSubject || "General").trim();
      const safeCourse = (derivedCourse || safeSubject || "General").trim();

      setCards(validatedCards);
      setTitle(safeTitle);
      setSubject(safeSubject);
      setCourseName(safeCourse);

      if (countMode === "exact" && desiredTotal > 0 && validatedCards.length < desiredTotal) {
        toast.warning(
          `Generated ${validatedCards.length} of ${desiredTotal} requested questions (source material exhausted). You can add or refine questions below.`,
        );
      } else {
        toast.success(
          looksLikeQuestionPaper
            ? `Extracted ${validatedCards.length} questions (${detectedQuestions} numbered detected).`
            : `Generated ${validatedCards.length} verified questions covering ${conceptSeen.size} topic(s).`,
        );
      }

      // Auto-save
      if (user && validatedCards.length > 0) {
        setStage("save", "running", "Saving deck…");
        try {
          const created = await saveDeckParts({
            userId: user.id,
            baseTitle: safeTitle,
            subject: safeSubject || null,
            source: sourceName,
            courseName: safeCourse,
            shareWithProgram,
            cards: validatedCards,
          });
          setStage("save", "done");
          toast.success(
            created.length > 1
              ? `Saved ${created.length} linked parts!`
              : "Study set saved and ready to practise!",
          );
          if (shareWithProgram) {
            for (const d of created) {
              notify({ data: { deckId: d.id, deckTitle: d.title } }).catch(() => {});
            }
          }
          nav({ to: "/decks/$deckId", params: { deckId: created[0].id } });
          return;
        } catch (saveErr) {
          setStage("save", "failed");
          console.error("Auto-save failed", saveErr);
          toast.error("Auto-save failed — review your generated items and save manually below.");
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally {
      setProcessing(false);
    }
  }

  async function handleSave() {
    if (!user || cards.length === 0 || saving) return;
    if (!title.trim()) {
      toast.error("Please enter a title for this study set.");
      return;
    }
    if (!courseName.trim()) {
      toast.error("Please enter a course name or code.");
      return;
    }
    setSaving(true);
    try {
      const created = await saveDeckParts({
        userId: user.id,
        baseTitle: title.trim(),
        subject: subject.trim() || null,
        source: imported ? "Manual JSON import" : queuedInput?.source ?? file?.name ?? "Study Studio",
        courseName: courseName.trim(),
        shareWithProgram,
        cards,
      });
      toast.success(
        created.length > 1 ? `Saved ${created.length} parts.` : "Deck saved!",
      );
      if (shareWithProgram) {
        for (const d of created) {
          notify({ data: { deckId: d.id, deckTitle: d.title } }).catch(() => {});
        }
      }
      nav({ to: "/decks/$deckId", params: { deckId: created[0].id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- PROCESSING VIEW ---------- */
  if (processing) {
    const selectedDoc =
      selectedDocId !== "none" ? libraryDocs.find((d) => d.id === selectedDocId) : undefined;
    const activeSourceName =
      queuedInput?.source ?? file?.name ?? selectedDoc?.fileName ?? "Pasted study notes";

    return (
      <div className="py-4 sm:py-8">
        <StudioPipelineVisual
          progress={progress}
          startedAt={startedAt}
          sourceName={activeSourceName}
          resourceMode={resourceMode}
          difficultyFilter={difficultyFilter}
          formatCount={selectedFormats.length}
          concurrencyLimit={PARALLEL_LIMIT}
        />
      </div>
    );
  }

  /* ---------- GENERATED SUMMARY / EXPLANATION / VISUAL GUIDE RESULT ---------- */
  if (guideResult) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => setGuideResult(null)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Study Studio
          </Button>
          <span className="text-xs font-medium text-success flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Saved to My Library
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {guideResult.kind} · {guideResult.data.subject || subject || "General"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
              {guideResult.data.title}
            </h1>
          </div>

          {guideResult.kind === "summary" && (
            <>
              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="font-display text-sm font-semibold text-foreground">Overview</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <MathText>{guideResult.data.overview}</MathText>
                </p>
              </div>

              {Array.isArray(guideResult.data.chapterSummaries) && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Chapter & Topic Summaries
                  </h2>
                  {guideResult.data.chapterSummaries.map((cs: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-border bg-background p-4">
                      <h3 className="font-display text-sm font-semibold text-foreground">
                        {idx + 1}. {cs.heading}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        <MathText>{cs.summary}</MathText>
                      </p>
                      {Array.isArray(cs.keyTakeaways) && cs.keyTakeaways.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-foreground list-disc pl-5">
                          {cs.keyTakeaways.map((kt: string, j: number) => (
                            <li key={j}>
                              <MathText>{kt}</MathText>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(guideResult.data.definitions) && guideResult.data.definitions.length > 0 && (
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Key Definitions
                  </h2>
                  <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
                    {guideResult.data.definitions.map((def: any, i: number) => (
                      <div key={i} className="p-3.5 text-sm">
                        <span className="font-semibold text-foreground">{def.term}: </span>
                        <span className="text-muted-foreground">
                          <MathText>{def.definition}</MathText>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(guideResult.data.revisionNotes) && (
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground">
                    High-Yield Revision Notes
                  </h2>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                    {guideResult.data.revisionNotes.map((n: string, i: number) => (
                      <li key={i}>
                        <MathText>{n}</MathText>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {guideResult.kind === "explanation" && (
            <>
              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  Simplified Intuition
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <MathText>{guideResult.data.simplifiedExplanation}</MathText>
                </p>
              </div>

              {Array.isArray(guideResult.data.stepByStepBreakdown) && (
                <div className="space-y-3">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Step-by-Step Breakdown
                  </h2>
                  {guideResult.data.stepByStepBreakdown.map((step: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border bg-background p-4">
                      <div className="font-mono text-xs font-semibold text-primary">
                        Step {step.stepNumber ?? i + 1}
                      </div>
                      <h3 className="mt-0.5 font-display text-sm font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        <MathText>{step.explanation}</MathText>
                      </p>
                      {step.formula && (
                        <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
                          <MathText>{step.formula}</MathText>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(guideResult.data.workedExamples) &&
                guideResult.data.workedExamples.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-display text-base font-semibold text-foreground">
                      Worked Examples
                    </h2>
                    {guideResult.data.workedExamples.map((ex: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-background p-4 space-y-2">
                        <div className="text-sm font-semibold text-foreground">
                          Example {i + 1}: <MathText>{ex.problem}</MathText>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <MathText>{ex.solution}</MathText>
                        </div>
                        <div className="text-xs font-medium text-primary">
                          Key Takeaway: <MathText>{ex.takeaway}</MathText>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              {Array.isArray(guideResult.data.commonMisconceptions) && (
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Common Pitfalls to Avoid
                  </h2>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                    {guideResult.data.commonMisconceptions.map((m: string, i: number) => (
                      <li key={i}>
                        <MathText>{m}</MathText>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {guideResult.kind === "visual" && (
            <>
              <p className="text-sm text-muted-foreground">
                <MathText>{guideResult.data.conceptSummary}</MathText>
              </p>
              <div className="space-y-6">
                {(guideResult.data.diagrams ?? []).map((d: any, idx: number) => (
                  <div key={idx} className="rounded-xl border border-border bg-background p-5 space-y-3">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {idx + 1}. {d.title}
                    </h3>
                    <Diagram svg={d.svg} caption={d.caption} />
                    {Array.isArray(d.breakdownSteps) && (
                      <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-5">
                        {d.breakdownSteps.map((s: string, j: number) => (
                          <li key={j}>
                            <MathText>{s}</MathText>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ---------- REVIEW & EDIT CARDS VIEW ---------- */
  if (cards.length > 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Verification & Numbering
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-foreground">
              Review your study set
            </h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {cards.length} validated items {imported ? "imported" : "generated"}. Edit anything before saving.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setCards([]);
                setCoverage(null);
                setImported(false);
              }}
            >
              Discard
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving…" : "Save deck"}
            </Button>
          </div>
        </div>

        {coverage && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-display text-sm font-semibold text-foreground">
                  Document coverage
                </div>
                <p className="text-xs text-muted-foreground">
                  Topics detected and represented across this question bank.
                </p>
              </div>
              <div className="font-mono text-xl font-bold tabular-nums text-primary">
                {coverage.percent}%
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${coverage.percent}%` }} />
            </div>
            {coverage.topics.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                Topics: {coverage.topics.slice(0, 18).join(" · ")}
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>
                Deck title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Anatomy — Cardiovascular System"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Radiography"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>
              Course code / name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. CSC2001F — Data Structures"
              className="mt-1"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4">
            <div className="flex gap-3">
              <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">Share with my program</div>
                <p className="text-xs text-muted-foreground">
                  Allow classmates in your program to access and study this deck.
                </p>
              </div>
            </div>
            <Switch checked={shareWithProgram} onCheckedChange={setShareWithProgram} />
          </div>
        </div>

        <div className="space-y-3">
          {cards.map((c, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs text-muted-foreground tabular-nums">
                  #{i + 1} · {c.topic} · {c.difficulty} · {c.questionType ?? "short_answer"}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCards(cards.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Textarea
                className="mt-3 font-mono text-sm"
                value={c.question}
                onChange={(e) => {
                  const v = [...cards];
                  v[i] = { ...c, question: e.target.value };
                  setCards(v);
                }}
                rows={2}
              />
              <Textarea
                className="mt-2 text-sm"
                value={c.answer}
                onChange={(e) => {
                  const v = [...cards];
                  v[i] = { ...c, answer: e.target.value };
                  setCards(v);
                }}
                rows={2}
              />
              <Textarea
                className="mt-2 text-xs text-muted-foreground"
                value={c.explanation}
                onChange={(e) => {
                  const v = [...cards];
                  v[i] = { ...c, explanation: e.target.value };
                  setCards(v);
                }}
                rows={2}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- MAIN STUDIO WORKSPACE ---------- */
  const isQuestionBased =
    resourceMode === "question_bank" ||
    resourceMode === "flashcards" ||
    resourceMode === "exam";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          AI Generation Workspace
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          AI Study Studio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a document or paste notes, choose your study format, and generate exact-count assessments, flashcards, summaries, explanations, or visual diagrams.
        </p>
      </div>

      {pendingJobs.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="text-sm font-semibold text-foreground">
            {pendingJobs.length} queued offline document(s) ready to process
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingJobs.map((job) => (
              <Button
                key={job.id}
                variant="outline"
                size="sm"
                disabled={!online}
                onClick={async () => {
                  setText(job.text);
                  setHint(job.hint);
                  setCourseName(job.courseName);
                  setQueuedInput(job);
                  await removeGeneration(job.id);
                  setPendingJobs((jobs) => jobs.filter((item) => item.id !== job.id));
                  toast.info("Restored queued document.");
                }}
              >
                {job.source}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Resource Type Selector */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          1. Choose Learning Resource
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {RESOURCE_MODES.map((m) => {
            const active = resourceMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setResourceMode(m.id)}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <m.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                <span className="mt-2 text-xs font-semibold text-foreground">{m.label}</span>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{m.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Source Material Selection */}
        <section className="space-y-5 rounded-xl border border-border bg-card p-5 lg:col-span-7">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            2. Source Material
          </div>

          {libraryDocs.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Library className="h-3.5 w-3.5 text-primary" /> Pick from My Library
              </Label>
              <Select value={selectedDocId} onValueChange={selectLibraryDoc}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose a previously uploaded document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Upload or paste new material —</SelectItem>
                  {libraryDocs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fileName} {d.subject ? `(${d.subject})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-xl border border-dashed border-border bg-background p-5">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                {file?.type.startsWith("image/") ? (
                  <ImageIcon className="h-5 w-5" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
              </div>
              <div className="text-sm font-medium text-foreground">
                {file ? file.name : "Drop a file or click to upload"}
              </div>
              <div className="text-xs text-muted-foreground">
                PDF, Word, PowerPoint, Excel, CSV, text, images — split intelligently across chapters
              </div>
              <input
                type="file"
                className="hidden"
                accept="*/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) {
                    setSelectedDocId("none");
                    if (!courseName) setCourseName(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </label>
          </div>

          <div>
            <Label htmlFor="studio-paste">Or paste notes, syllabus, or past paper text</Label>
            <Textarea
              id="studio-paste"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste lecture notes, textbook chapters, or exam questions…"
              className="mt-1.5 font-mono text-xs"
            />
          </div>

          {chapters.length > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground">Focus chapter or topic</Label>
              <Select value={chapterId} onValueChange={setChapterId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Entire Document ({chapters.length} detected sections)
                  </SelectItem>
                  {chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title} ({c.wordCount.toLocaleString()} words)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>

        {/* Right: Generation Controls */}
        <section className="space-y-5 rounded-xl border border-border bg-card p-5 lg:col-span-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            3. Configuration
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Subject</Label>
              <Select value={subject || "custom"} onValueChange={(v) => v !== "custom" && setSubject(v)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Auto-detect</SelectItem>
                  {CORE_SUBJECTS.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="studio-course" className="text-xs">
                Course / Module
              </Label>
              <Input
                id="studio-course"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. CSC2001F"
                className="mt-1 h-9"
              />
            </div>
          </div>

          {isQuestionBased && (
            <>
              {/* Question Count Strategy */}
              <div className="space-y-2.5 rounded-lg border border-border bg-background p-3.5">
                <Label className="text-xs font-semibold text-foreground">
                  Question Count Accuracy
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCountMode("max")}
                    className={`rounded-md border px-2.5 py-2 text-xs font-medium transition ${
                      countMode === "max"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Extract Maximum
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountMode("exact")}
                    className={`rounded-md border px-2.5 py-2 text-xs font-medium transition ${
                      countMode === "exact"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Exact Count
                  </button>
                </div>

                {countMode === "exact" ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {[10, 20, 30, 50, 75, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setExactCount(preset)}
                          className={`rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums ${
                            exactCount === preset
                              ? "border-primary bg-primary/15 text-primary font-semibold"
                              : "border-border bg-card text-muted-foreground"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="exact-num" className="text-xs text-muted-foreground shrink-0">
                        Custom exact count:
                      </Label>
                      <Input
                        id="exact-num"
                        type="number"
                        min={1}
                        max={500}
                        value={exactCount}
                        onChange={(e) => setExactCount(Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 font-mono text-xs tabular-nums"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Runs batch continuation until exactly {exactCount} verified questions are reached.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Extracts every explicit question, sub-part, formula, and concept across the entire document.
                  </p>
                )}
              </div>

              {/* Difficulty */}
              <div>
                <Label className="text-xs">Difficulty level</Label>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {(["Mixed", "Easy", "Medium", "Hard"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficultyFilter(lvl)}
                      className={`rounded-md border py-1.5 text-xs font-medium transition ${
                        difficultyFilter === lvl
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formats */}
              <div>
                <Label className="text-xs">Question formats</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {FORMAT_OPTIONS.map((f) => {
                    const active = selectedFormats.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFormat(f.id)}
                        className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                          active
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="studio-hint" className="text-xs">
              Academic instructions or focus (optional)
            </Label>
            <Input
              id="studio-hint"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. 2nd-year pathophysiology, focus on mechanisms"
              className="mt-1 h-9"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!file && !text.trim() && !queuedInput && selectedDocId === "none"}
            className="w-full shadow-brand"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {resourceMode === "summary"
              ? "Generate Summaries"
              : resourceMode === "explanation"
                ? "Generate Explanations"
                : resourceMode === "visual"
                  ? "Generate Visual Diagrams"
                  : countMode === "exact"
                    ? `Generate Exact ${exactCount} Questions`
                    : "Extract Maximum Questions"}
          </Button>
        </section>
      </div>

      {/* Preserved Claude JSON Import */}
      <ClaudeQuizImport
        onImport={(quiz) => {
          setCards(quiz.cards);
          setTitle(quiz.title);
          setSubject(quiz.subject);
          setCoverage(null);
          setImported(true);
          toast.success(`Imported all ${quiz.cards.length} questions. Review and save your deck.`);
        }}
      />
    </div>
  );
}
