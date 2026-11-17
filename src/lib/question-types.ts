export type QuestionType = "multiple_choice" | "true_false" | "short_answer" | "numerical" | "essay";

export const QUESTION_TYPES: QuestionType[] = ["multiple_choice", "true_false", "short_answer", "numerical", "essay"];

export type RawCard = {
  question: string;
  answer: string;
  explanation?: string | null;
  questionType?: string | null;
  question_type?: string | null;
  options?: unknown;
  distractors?: unknown;
};

const MCQ_WORDING =
  /(which of the following|which one of these|which of these|all of the following except|which statement is (correct|true|false)|choose the (correct|best)|select the (correct|best)|none of the above|all of the above)/i;

const TF_WORDING = /^\s*(true or false|state whether the following (statement )?is true or false)/i;

export function isTrueFalseAnswer(answer: string): boolean {
  return /^\s*(true|false|t|f)\s*\.?\s*$/i.test(answer);
}

export function normaliseBool(answer: string): "True" | "False" {
  return /^\s*(true|t)\s*\.?\s*$/i.test(answer) ? "True" : "False";
}

export function parseNumeric(s: string): number | null {
  if (!s) return null;
  const cleaned = s
    .replace(/[,\s]/g, "")
    .replace(/[^0-9eE+\-./]/g, "");
  const frac = cleaned.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    if (!d) return null;
    return Number(frac[1]) / d;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Accepts answers within 1% (or 1e-6 absolute) of the expected value. */
export function numericallyEqual(expected: number, got: number): boolean {
  const tol = Math.max(Math.abs(expected) * 0.01, 1e-6);
  return Math.abs(expected - got) <= tol;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

/**
 * Resolves the effective question type + options for a card, repairing broken data:
 * an MCQ without usable options is downgraded to short answer so the student never
 * sees "Which of the following…" with no choices.
 */
export function resolveQuestion(card: RawCard): { type: QuestionType; options: string[] } {
  const answer = (card.answer ?? "").trim();
  const declared = (card.questionType ?? card.question_type ?? "") as string;
  let type: QuestionType = QUESTION_TYPES.includes(declared as QuestionType)
    ? (declared as QuestionType)
    : inferType(card.question ?? "", answer);

  let options = toStringArray(card.options);
  if (options.length === 0) {
    const distractors = toStringArray(card.distractors);
    if (distractors.length >= 3 && answer) options = [answer, ...distractors.slice(0, 3)];
  }
  options = Array.from(new Set(options));

  if (type === "true_false") {
    if (!isTrueFalseAnswer(answer)) type = options.length >= 2 ? "multiple_choice" : "short_answer";
    else return { type: "true_false", options: ["True", "False"] };
  }

  if (type === "multiple_choice") {
    const hasCorrect = options.some((o) => o.trim().toLowerCase() === answer.toLowerCase());
    if (options.length < 2 || !hasCorrect) {
      // Broken MCQ — never render it without valid choices.
      return { type: MCQ_WORDING.test(card.question ?? "") ? "short_answer" : "short_answer", options: [] };
    }
    return { type, options: options.slice(0, 6) };
  }

  return { type, options: [] };
}

function inferType(question: string, answer: string): QuestionType {
  if (TF_WORDING.test(question) || isTrueFalseAnswer(answer)) return "true_false";
  if (MCQ_WORDING.test(question)) return "multiple_choice";
  if (answer && parseNumeric(answer) !== null && answer.length <= 24) return "numerical";
  if (answer.split(/\s+/).length > 45) return "essay";
  return "short_answer";
}

export const TYPE_INSTRUCTIONS: Record<QuestionType, string> = {
  multiple_choice: "Select the best answer.",
  true_false: "Choose True or False.",
  short_answer: "Answer briefly and clearly.",
  numerical: "Enter your numerical answer.",
  essay: "Explain your answer using relevant concepts.",
};

export const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
  numerical: "Numerical",
  essay: "Essay",
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type GeneratedCard = {
  question: string;
  answer: string;
  explanation: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  questionType: QuestionType;
  options: string[] | null;
  distractors?: string[];
  diagram?: string;
};

/**
 * Validates + repairs every generated card so the UI can trust questionType/options:
 * - MCQs must carry >= 3 non-empty options that include the correct answer, otherwise
 *   they are rebuilt from distractors or downgraded to short_answer.
 * - True/False answers are normalised to "True"/"False".
 * - Cards without a usable question/answer are dropped.
 */
export function validateGeneratedCards(cards: any[]): GeneratedCard[] {
  const out: GeneratedCard[] = [];
  for (const raw of cards ?? []) {
    const question = String(raw?.question ?? "").trim();
    const answer = String(raw?.answer ?? "").trim();
    if (!question || !answer) continue;

    const distractors = Array.isArray(raw?.distractors)
      ? raw.distractors.map((d: unknown) => String(d ?? "").trim()).filter(Boolean)
      : [];

    const resolved = resolveQuestion({
      question,
      answer,
      questionType: raw?.questionType,
      options: raw?.options,
      distractors,
    });

    let type = resolved.type;
    let options: string[] | null = resolved.options.length ? resolved.options : null;

    if (type === "true_false") {
      out.push({
        question,
        answer: normaliseBool(answer),
        explanation: String(raw?.explanation ?? "").trim(),
        topic: String(raw?.topic ?? "General").trim() || "General",
        difficulty: (["Easy", "Medium", "Hard"].includes(raw?.difficulty) ? raw.difficulty : "Medium"),
        questionType: "true_false",
        options: ["True", "False"],
        distractors: distractors.slice(0, 3),
        diagram: typeof raw?.diagram === "string" ? raw.diagram : undefined,
      });
      continue;
    }

    if (type === "multiple_choice") {
      const unique = Array.from(new Set([answer, ...(options ?? [])].map((o) => o.trim()).filter(Boolean)));
      if (unique.length < 4) {
        for (const d of distractors) {
          if (unique.length >= 4) break;
          if (!unique.some((u) => u.toLowerCase() === d.toLowerCase())) unique.push(d);
        }
      }
      if (unique.length >= 3) {
        options = shuffle(unique.slice(0, 4));
      } else {
        type = "short_answer";
        options = null;
      }
    } else {
      options = null;
    }

    out.push({
      question,
      answer,
      explanation: String(raw?.explanation ?? "").trim(),
      topic: String(raw?.topic ?? "General").trim() || "General",
      difficulty: (["Easy", "Medium", "Hard"].includes(raw?.difficulty) ? raw.difficulty : "Medium"),
      questionType: type,
      options,
      distractors: distractors.slice(0, 3),
      diagram: typeof raw?.diagram === "string" ? raw.diagram : undefined,
    });
  }
  return out;
}

export type LocalGradeResult = {
  score: number;
  max_marks: number;
  correct: boolean;
  feedback: string;
};

function normaliseTextForMatch(raw: string): string {
  return raw
    .replace(/\$\$?/g, "")
    .replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, "$1")
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^\p{L}\p{N}\s./+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingArticle(s: string): string {
  return s.replace(/^(?:the|an|a)\s+/i, "").trim();
}

/**
 * Instant 0ms deterministic grader for clear-cut cases:
 * - Blank or "idk"/"?"/"-" non-answers -> 0 marks immediately
 * - True/False equivalence -> exact match immediately
 * - Pure numerical / fraction equivalence -> tolerance match immediately
 * - Exact normalised text match (ignoring case, LaTeX $ wrappers, outer punctuation, leading article) -> full marks immediately
 * Returns null for paraphrased, multi-concept, or ambiguous answers so the AI grader evaluates nuance.
 */
export function tryLocalGrade(
  _question: string,
  expected: string,
  userAnswer: string,
): LocalGradeResult | null {
  const userTrim = (userAnswer ?? "").trim();
  const expTrim = (expected ?? "").trim();

  if (
    userTrim.length === 0 ||
    /^(idk|i don'?t know|dont know|no idea|not sure|n\/?a|none|\?+|\.+|-+)$/i.test(userTrim)
  ) {
    return {
      score: 0,
      max_marks: 1,
      correct: false,
      feedback: "No answer submitted — review the model answer below.",
    };
  }

  if (!expTrim) return null;

  if (isTrueFalseAnswer(expTrim) && isTrueFalseAnswer(userTrim)) {
    const right = normaliseBool(expTrim) === normaliseBool(userTrim);
    return {
      score: right ? 1 : 0,
      max_marks: 1,
      correct: right,
      feedback: right ? "Correct selection." : `Expected ${normaliseBool(expTrim)}.`,
    };
  }

  // Exact normalised string comparison (safe fast-path when student matches key phrase verbatim)
  const normExp = normaliseTextForMatch(expTrim);
  const normUser = normaliseTextForMatch(userTrim);
  if (
    normExp &&
    normUser &&
    (normExp === normUser ||
      (normExp.length <= 120 && stripLeadingArticle(normExp) === stripLeadingArticle(normUser)))
  ) {
    return {
      score: 1,
      max_marks: 1,
      correct: true,
      feedback: "Exact match — well answered.",
    };
  }

  // Pure numeric / fraction fast-path (avoid false positives on sentences containing stray digits)
  const expCleanUnits = expTrim
    .replace(/\$\$?/g, "")
    .replace(/\b(?:mol|kg|km|cm|mm|mg|ml|hz|khz|mhz|ghz|pa|kpa|mpa|ev|rad|deg|sec|min|hr|hrs|hours|mins|ms|us|ns|km\/h|m\/s)\b/gi, "")
    .trim();
  const userCleanUnits = userTrim
    .replace(/\$\$?/g, "")
    .replace(/\b(?:mol|kg|km|cm|mm|mg|ml|hz|khz|mhz|ghz|pa|kpa|mpa|ev|rad|deg|sec|min|hr|hrs|hours|mins|ms|us|ns|km\/h|m\/s)\b/gi, "")
    .trim();

  if (
    expCleanUnits.length <= 24 &&
    userCleanUnits.length <= 24 &&
    !/[a-df-z]{2,}/i.test(expCleanUnits) &&
    !/[a-df-z]{2,}/i.test(userCleanUnits)
  ) {
    const expNum = parseNumeric(expCleanUnits);
    const gotNum = parseNumeric(userCleanUnits);
    if (expNum !== null && gotNum !== null) {
      const right = numericallyEqual(expNum, gotNum);
      return {
        score: right ? 1 : 0,
        max_marks: 1,
        correct: right,
        feedback: right
          ? "Correct numerical value."
          : `Incorrect value — expected ${expTrim}.`,
      };
    }
  }

  return null;
}
