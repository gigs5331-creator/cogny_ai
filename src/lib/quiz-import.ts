import { validateGeneratedCards, type GeneratedCard } from "./question-types";

export const CLAUDE_QUIZ_PROMPT = `Create a university study quiz from my attached document. Read every slide/page and cover every important academic concept. Exclude administrative information. Preserve every question in a question paper. Do not invent claims that are not supported by the source. Include correct answers and detailed explanations. If the document exceeds your limits, tell me exactly which pages remain and return complete JSON for each completed batch; do not claim full coverage.
Return only valid JSON, without commentary, using this structure:
{"title":"Quiz name","subject":"Subject","cards":[{"question":"Question text","answer":"Exact correct option text","explanation":"Why the answer is correct","topic":"Topic","difficulty":"Medium","questionType":"multiple_choice","options":["Exact correct option text","Plausible wrong answer","Another wrong answer","Another wrong answer"]}]}
Supported questionType values: multiple_choice, true_false, short_answer, numerical, essay. Prefer multiple_choice with four distinct options and answer matching one option exactly. For true_false, answer must be True or False. For other types omit options. Use Easy, Medium or Hard for difficulty. Return all questions; Cogny splits the imported quiz into parts of 20 automatically. Escape backslashes in math notation to keep JSON valid.`;

export function parseQuizImport(input: string): { title: string; subject: string; cards: GeneratedCard[] } {
  const text = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error("This isn't valid quiz JSON. Copy Claude's complete JSON response, or ask Claude to fix its JSON."); }
  const object = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const rows = Array.isArray(data) ? data : object?.cards;
  if (!Array.isArray(rows) || !rows.length) throw new Error("The quiz must contain a non-empty cards array.");
  const normalized = rows.map((row: unknown, i: number) => {
    if (!row || typeof row !== "object") throw new Error(`Question ${i + 1} is not a valid question.`);
    const card = row as Record<string, unknown>;
    if (typeof card.question !== "string" || !card.question.trim() || typeof card.answer !== "string" || !card.answer.trim()) {
      throw new Error(`Question ${i + 1} needs a question and a correct answer. Nothing has been imported.`);
    }
    return { ...card, questionType: card.questionType ?? card.question_type, diagram: undefined };
  });
  const cards = validateGeneratedCards(normalized);
  if (cards.length !== rows.length) throw new Error("Some questions could not be read. Nothing has been imported.");
  return {
    title: typeof object?.title === "string" ? object.title.trim() : "",
    subject: typeof object?.subject === "string" ? object.subject.trim() : "",
    cards,
  };
}

export function splitQuizParts<T>(cards: T[]): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < cards.length; i += 20) parts.push(cards.slice(i, i + 20));
  return parts;
}