import type { GeneratedCard, QuestionType } from "@/lib/question-types";
import { normaliseBool, resolveQuestion } from "@/lib/question-types";

export type StudioFormat =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "essay"
  | "numerical"
  | "application"
  | "scenario";

export type ChapterSegment = {
  id: string;
  title: string;
  startIndex: number;
  endIndex: number;
  text: string;
  wordCount: number;
};

/**
 * Splits a large document intelligently on chapter, heading, or paragraph boundaries
 * with overlap so no definition or multi-part question gets sliced in half.
 */
export function smartSplitText(text: string, chunkSize = 7_500, overlap = 1_200): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const parts: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + chunkSize, clean.length);
    if (end < clean.length) {
      const candidates = [
        clean.lastIndexOf("\n\n\n", end),
        clean.lastIndexOf("\n## ", end),
        clean.lastIndexOf("\n# ", end),
        clean.lastIndexOf("\nChapter ", end),
        clean.lastIndexOf("\nTopic ", end),
        clean.lastIndexOf("\nUnit ", end),
        clean.lastIndexOf("\nModule ", end),
        clean.lastIndexOf("\n\n", end),
        clean.lastIndexOf(". ", end),
      ].filter((n) => n > i + chunkSize * 0.45);
      if (candidates.length) end = Math.max(...candidates);
    }
    parts.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return parts.filter((p) => p.length > 0);
}

/**
 * Extracts chapters / topics / section headings with their slice of text
 * so students in Study Studio can focus on a single chapter or the entire document.
 */
export function detectChapters(text: string): ChapterSegment[] {
  const clean = text.trim();
  if (!clean) return [];
  const lines = clean.split("\n");
  const headingMatches: { title: string; offset: number }[] = [];

  let cursor = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading =
      /^(chapter|topic|section|unit|part|module|lesson|lecture)\s+[\dIVXA-Z]+[:.\-\s]*.{0,90}$/i.test(trimmed) ||
      /^#{1,3}\s+.{2,90}$/.test(trimmed) ||
      (/^[A-Z0-9][A-Z0-9\s:&,\-]{4,70}$/.test(trimmed) && !/\d+\s*(marks?|pts?)/i.test(trimmed));

    if (isHeading && trimmed.length >= 4 && trimmed.length <= 100) {
      const cleanTitle = trimmed.replace(/^#+\s+/, "").trim();
      if (headingMatches.length === 0 || headingMatches[headingMatches.length - 1].title !== cleanTitle) {
        headingMatches.push({ title: cleanTitle, offset: cursor });
      }
    }
    cursor += line.length + 1;
  }

  if (headingMatches.length === 0) {
    const words = clean.split(/\s+/).filter(Boolean).length;
    return [
      {
        id: "all",
        title: "Full Document",
        startIndex: 0,
        endIndex: clean.length,
        text: clean,
        wordCount: words,
      },
    ];
  }

  const segments: ChapterSegment[] = [];
  for (let i = 0; i < headingMatches.length; i++) {
    const start = headingMatches[i].offset;
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].offset : clean.length;
    const slice = clean.slice(start, end).trim();
    if (slice.length < 40) continue;
    segments.push({
      id: `chap-${i + 1}`,
      title: headingMatches[i].title,
      startIndex: start,
      endIndex: end,
      text: slice,
      wordCount: slice.split(/\s+/).filter(Boolean).length,
    });
  }

  return segments.slice(0, 45);
}

/**
 * Counts numbered questions (e.g. "1.", "Q2)", "12 -") via longest ascending sequence.
 */
export function countNumberedQuestions(text: string): number {
  const nums: number[] = [];
  const re = /(^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) nums.push(parseInt(m[2], 10));
  if (nums.length === 0) return 0;
  let best = 0;
  let run = 0;
  let expect = 1;
  for (const n of nums) {
    if (n === expect) {
      run++;
      expect++;
    } else if (n === 1) {
      run = 1;
      expect = 2;
    } else if (n === expect - 1) {
      /* sub-part repeat */
    } else {
      best = Math.max(best, run);
      run = 0;
      expect = 1;
    }
    best = Math.max(best, run);
  }
  return Math.max(best, nums.length >= 5 && best < 5 ? 0 : best);
}

/**
 * Broad question/concept candidate detector so dense documents generate maximum questions.
 */
export function countQuestionCandidates(text: string): number {
  const numbered = countNumberedQuestions(text);
  const questionMarks = (text.match(/\?/g) || []).length;
  const lettered = (text.match(/(^|\n)\s*\(?[a-z]\)\s+\S/gi) || []).length;
  const roman = (text.match(/(^|\n)\s*\(?(?:i|ii|iii|iv|v|vi)\)\s+\S/gi) || []).length;
  const bulleted = (text.match(/(^|\n)\s*[-•*]\s+.{15,}/g) || []).length;
  const stems = (
    text.match(
      /(^|\n)\s*(which|what|why|how|when|where|who|define|explain|describe|calculate|state|list|compare|discuss|outline|prove|derive|evaluate|analyse|analyze|determine)\b/gi,
    ) || []
  ).length;
  return Math.max(numbered, questionMarks, lettered + roman, bulleted, stems);
}

export function normalizeQuestionKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/^(?:q(?:uestion)?\s*\d+[.):\-\s]*|\d+[.):\-\s]+)/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeQuestionKey(s)
      .split(" ")
      .filter((w) => w.length > 2),
  );
}

export function isNearDuplicateQuestion(a: string, b: string): boolean {
  const na = normalizeQuestionKey(a);
  const nb = normalizeQuestionKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.slice(0, 110) === nb.slice(0, 110) && na.length > 35 && nb.length > 35) return true;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size < 4 || tb.size < 4) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  const jaccard = overlap / (ta.size + tb.size - overlap);
  return jaccard >= 0.84;
}

/**
 * Deduplicates generated cards while preserving order and detecting near-identical paraphrases.
 */
export function dedupeGeneratedCards<T extends { question: string; answer?: string }>(cards: T[]): {
  unique: T[];
  duplicatesRemoved: number;
} {
  const unique: T[] = [];
  const exactKeys = new Set<string>();

  for (const card of cards) {
    const key = normalizeQuestionKey(card.question);
    if (!key) continue;
    if (exactKeys.has(key)) continue;

    let nearDup = false;
    // Check last 250 items for fast near-duplicate detection on large banks
    const windowStart = Math.max(0, unique.length - 250);
    for (let i = windowStart; i < unique.length; i++) {
      if (isNearDuplicateQuestion(card.question, unique[i].question)) {
        nearDup = true;
        break;
      }
    }
    if (nearDup) continue;

    exactKeys.add(key);
    unique.push(card);
  }

  return {
    unique,
    duplicatesRemoved: Math.max(0, cards.length - unique.length),
  };
}

/**
 * Ensures consistent numbering metadata & valid answer/option integrity before saving.
 */
export function validateAndNumberCards(
  cards: GeneratedCard[],
  opts?: { stripLeadingNumbers?: boolean },
): GeneratedCard[] {
  const valid: GeneratedCard[] = [];
  for (const raw of cards) {
    let q = (raw.question ?? "").trim();
    const a = (raw.answer ?? "").trim();
    if (!q || !a) continue;

    if (opts?.stripLeadingNumbers) {
      q = q.replace(/^(?:Question\s*\d+[:.\-\s]*|Q\d+[:.\-\s]*|\d+\.\s+)/i, "").trim();
    }

    const resolved = resolveQuestion({
      question: q,
      answer: a,
      questionType: raw.questionType,
      options: raw.options,
      distractors: raw.distractors,
    });

    const type: QuestionType = resolved.type;
    const answer = type === "true_false" ? normaliseBool(a) : a;
    const options =
      type === "true_false"
        ? ["True", "False"]
        : type === "multiple_choice"
          ? resolved.options
          : null;

    valid.push({
      ...raw,
      question: q,
      answer,
      explanation: (raw.explanation ?? "").trim() || `Correct answer: ${answer}.`,
      topic: (raw.topic ?? "General").trim() || "General",
      difficulty: ["Easy", "Medium", "Hard"].includes(raw.difficulty) ? raw.difficulty : "Medium",
      questionType: type,
      options,
      distractors: Array.isArray(raw.distractors) ? raw.distractors.slice(0, 3) : [],
    });
  }
  return valid;
}

export function buildKnowledgeMap(text: string): string[] {
  const lines = text.split(/\n+/);
  const found = new Set<string>();
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    const m = t.match(/^(chapter|topic|section|unit|part|module|lesson)\s+[\dIVX]+[:.\-]?\s*(.{0,80})/i);
    if (m) found.add(t.slice(0, 100));
    else if (/^#{1,3}\s+.{1,80}$/.test(t)) found.add(t.replace(/^#+\s+/, "").slice(0, 100));
  }
  return Array.from(found).slice(0, 45);
}
