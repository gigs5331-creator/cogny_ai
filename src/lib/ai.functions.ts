import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tryLocalGrade, validateGeneratedCards } from "@/lib/question-types";

const inputSchema = z.object({
  text: z.string().max(200_000).optional(),
  imageBase64: z.string().max(10_000_000).optional(),
  imageMimeType: z.string().max(64).optional(),
  hint: z.string().max(4000).optional(),
  targetCards: z.number().int().min(1).max(2000).optional(),
  exactCount: z.boolean().optional(),
  maxExtraction: z.boolean().optional(),
  questionFormats: z.array(z.string().max(40)).max(10).optional(),
  difficultyFilter: z.enum(["Mixed", "Easy", "Medium", "Hard"]).optional(),
  chapterFocus: z.string().max(300).optional(),
  avoidQuestions: z.array(z.string().max(300)).max(150).optional(),
});

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// Parses the AI's card JSON; if the reply was cut off, keeps every card that finished.
function parseToolArgs(raw: string): any {
  const cleaned = stripJsonFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    /* salvage below */
  }
  const start = cleaned.indexOf("[", cleaned.indexOf('"cards"'));
  const cards: any[] = [];
  if (start >= 0) {
    let depth = 0,
      from = -1,
      inStr = false,
      esc = false;
    for (let i = start + 1; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") {
        if (depth++ === 0) from = i;
      } else if (ch === "}" && --depth === 0 && from >= 0) {
        try {
          cards.push(JSON.parse(cleaned.slice(from, i + 1)));
        } catch {
          /* skip incomplete card */
        }
        from = -1;
      }
    }
  }
  const title = cleaned.match(/"suggested_title"\s*:\s*"([^"]*)"/)?.[1];
  const subject = cleaned.match(/"suggested_subject"\s*:\s*"([^"]*)"/)?.[1];
  if (!cards.length) throw new Error("AI returned no cards");
  return { suggested_title: title, suggested_subject: subject, cards };
}

function toGeminiSchema(node: any): Schema {
  const typeMap: Record<string, Type> = {
    object: Type.OBJECT,
    array: Type.ARRAY,
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
  };
  const out: any = {};
  if (typeof node.type === "string" && typeMap[node.type.toLowerCase()]) {
    out.type = typeMap[node.type.toLowerCase()];
  }
  if (typeof node.description === "string") out.description = node.description;
  if (Array.isArray(node.enum)) out.enum = node.enum;
  if (Array.isArray(node.required)) out.required = node.required;
  if (node.items) out.items = toGeminiSchema(node.items);
  if (node.properties && typeof node.properties === "object") {
    out.properties = {};
    for (const [k, v] of Object.entries(node.properties)) {
      out.properties[k] = toGeminiSchema(v);
    }
  }
  return out as Schema;
}

const GEMINI_MODELS = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"] as const;
const FAST_GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-4-hydrogen"] as const;
const modelCooldown = new Map<string, number>();

let cachedGeminiKey = "";
let cachedGeminiClient: GoogleGenAI | null = null;
function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!cachedGeminiClient || cachedGeminiKey !== apiKey) {
    cachedGeminiKey = apiKey;
    cachedGeminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return cachedGeminiClient;
}

function parseGeminiErrorStatus(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const statusMatch = raw.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  const status = (err as { status?: number })?.status ?? (statusMatch ? Number(statusMatch[1]) : 500);
  return { status, message: raw };
}

// Calls the AI: prefers the app's own Google Gemini key (GEMINI_API_KEY / GOOGLE_API_KEY)
// via @google/genai SDK, falling back to LOVABLE_API_KEY only when unset.
async function callChat(body: any, opts?: { fast?: boolean }): Promise<any> {
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (geminiKey) {
    const ai = getGeminiClient(geminiKey);
    const modelsToTry = opts?.fast ? FAST_GEMINI_MODELS : GEMINI_MODELS;
    const thinkingLevel = opts?.fast ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;

    const systemMsg = body.messages?.find((m: any) => m.role === "system");
    const contents = (body.messages ?? [])
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: (Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content) }]).map((p: any) => {
          if (p.type === "image_url") {
            const match = String(p.image_url?.url ?? "").match(/^data:(.*?);base64,(.*)$/);
            return match ? { inlineData: { mimeType: match[1], data: match[2] } } : { text: "" };
          }
          return { text: p.text ?? "" };
        }),
      }));

    const fn = body.tools?.[0]?.function;
    const responseSchema = fn?.parameters ? toGeminiSchema(fn.parameters) : undefined;
    const useJson = Boolean(responseSchema || body.response_format?.type === "json_object");

    let lastStatus = 0;
    let lastMsg = "";

    for (const model of modelsToTry) {
      const cooldown = modelCooldown.get(model);
      if (cooldown && cooldown > Date.now()) continue;

      try {
        const response = await ai.models.generateContent({
          model,
          contents: contents.length === 1 ? { parts: contents[0].parts } : contents,
          config: {
            ...(systemMsg ? { systemInstruction: String(systemMsg.content) } : {}),
            ...(useJson ? { responseMimeType: "application/json" } : {}),
            ...(responseSchema ? { responseSchema } : {}),
            thinkingConfig: { thinkingLevel },
          },
        });

        const text = response.text ?? "";
        if (!text.trim()) {
          lastStatus = 502;
          lastMsg = "Model returned an empty response";
          continue;
        }

        if (fn) {
          return {
            choices: [
              {
                message: {
                  content: text,
                  tool_calls: [{ function: { name: fn.name, arguments: text } }],
                },
              },
            ],
          };
        }
        return { choices: [{ message: { content: text } }] };
      } catch (err) {
        const { status, message } = parseGeminiErrorStatus(err);
        lastStatus = status;
        lastMsg = message;
        console.warn("Gemini error", model, status, message.slice(0, 240));

        if (status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(message))) {
          throw new Error("Gemini API key is invalid or missing permissions. Please check GEMINI_API_KEY in Settings > Secrets.");
        }

        const daily = status === 429 && /per ?day|PerDay/i.test(message);
        modelCooldown.set(
          model,
          Date.now() + (daily ? 60 * 60_000 : status === 429 || status >= 500 ? 30_000 : 5 * 60_000),
        );
      }
    }

    console.error("All Gemini models failed", lastStatus, lastMsg.slice(0, 300));
    if (lastStatus === 429) {
      throw new Error("Gemini rate limit reached — please wait a moment or check your quota in Settings > Secrets.");
    }
    throw new Error(lastMsg ? `AI generation failed: ${lastMsg.slice(0, 140)}` : "The AI service is busy — please try again.");
  }

  const apiKey = (process.env.LOVABLE_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("AI is not configured. Add GEMINI_API_KEY in Settings > Secrets.");
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
  if (!res.ok) {
    const t = await res.text();
    console.error("AI error", res.status, t);
    throw new Error(res.status >= 500 ? "The AI service is busy — retrying with smaller pieces." : `AI generation failed (${res.status})`);
  }
  return res.json();
}

export const generateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const userContent: any[] = [];
    if (data.text) userContent.push({ type: "text", text: `Source material:\n\n${data.text}` });
    if (data.imageBase64 && data.imageMimeType) {
      userContent.push({ type: "image_url", image_url: { url: `data:${data.imageMimeType};base64,${data.imageBase64}` } });
    }
    if (data.chapterFocus) {
      userContent.push({ type: "text", text: `Chapter / Topic focus: Focus thoroughly on "${data.chapterFocus}".` });
    }
    if (data.hint) userContent.push({ type: "text", text: `Additional context: ${data.hint}` });

    if (data.questionFormats?.length) {
      userContent.push({
        type: "text",
        text: `REQUIRED QUESTION FORMATS: Distribute questions across ONLY these requested styles: ${data.questionFormats.join(", ")}. Note: For "application" or "scenario" styles, craft realistic clinical/technical/real-world scenario questions and set questionType to "multiple_choice", "short_answer", or "essay" as appropriate.`,
      });
    }

    if (data.difficultyFilter && data.difficultyFilter !== "Mixed") {
      userContent.push({
        type: "text",
        text: `DIFFICULTY REQUIREMENT: Set difficulty to "${data.difficultyFilter}" and calibrate question cognitive complexity accordingly.`,
      });
    }

    if (data.avoidQuestions?.length) {
      userContent.push({
        type: "text",
        text: `DO NOT DUPLICATE OR PARAPHRASE ANY OF THESE ALREADY-GENERATED QUESTIONS:\n${data.avoidQuestions.slice(0, 120).map((q) => `- ${q}`).join("\n")}`,
      });
    }

    if (typeof data.targetCards === "number") {
      if (data.exactCount) {
        userContent.push({
          type: "text",
          text: `CRITICAL EXACT COUNT REQUIREMENT: Return EXACTLY ${data.targetCards} distinct, high-quality academic questions in the "cards" array — no fewer, no duplicates. Extract every explicit question first (including every sub-part a, b, i, ii) and synthesize additional deep concept/application/scenario questions from the source material until you reach EXACTLY ${data.targetCards} cards.`,
        });
      } else if (data.maxExtraction) {
        userContent.push({
          type: "text",
          text: `MAXIMUM EXTRACTION MODE: Extract AS MANY high-quality, non-duplicate questions as possible from this source (aim for at least ${data.targetCards} cards if supported by the content). Mine every single definition, theorem, formula, mechanism, comparison, cause-effect link, worked example, table entry, and sub-question. Do NOT summarize away details or skip minor facts.`,
        });
      } else {
        userContent.push({
          type: "text",
          text: `IMPORTANT: Generate approximately ${data.targetCards} flashcards from this material (±10%). Cover every distinct concept — do not leave any topic out.`,
        });
      }
    }
    if (userContent.length === 0) throw new Error("Provide text or an image");

    const system = `You are an expert university tutor that turns study material into high-quality, EXAM-GRADE flashcards and questions.

CONTENT FILTER — READ FIRST (mandatory):
Before writing anything, silently classify every part of the source as either ADMINISTRATIVE/METADATA or ACADEMIC CONTENT, and then generate questions ONLY from the ACADEMIC CONTENT.
- ADMINISTRATIVE/METADATA (NEVER turn into a question, never ask "who", "when", "how many marks" about it): university / faculty / department names, course codes and course titles, examiner / moderator / lecturer / invigilator names, exam dates, duration, venue, session, student number fields, exam or section instructions ("Answer any three questions", "Write in ink", "Calculators allowed", "Turn over"), marks allocation ("[10 marks]"), question numbering, page numbers, headers, footers, copyright lines, submission or answer-sheet instructions, plagiarism declarations, table-of-contents entries.
- ACADEMIC CONTENT: definitions, concepts, theories, principles, formulas, derivations, worked calculations, examples, case studies, comparisons, causes/effects, processes, classifications, relationships and data that test real knowledge.
- If the source is a past examination paper: first separate the examination instructions from the ACTUAL EXAMINABLE QUESTIONS, then build cards from every single examinable question and sub-question.
- Strip marks annotations, numbering and instruction fragments out of the question text you output — keep only the academic question itself.
- If a section contains nothing but administrative material, return no cards for it rather than inventing questions about it.

Rules:
- Extract EVERY distinct ACADEMIC question, concept, formula, definition, comparison, and sub-question in the source. If answers are present, use them; otherwise generate accurate answers from your knowledge.
- Each card MUST have: question, concise answer, a 3-5 sentence explanation that TEACHES the concept, a topic tag (preserve "Topic X" / "Chapter X" if present), a difficulty (Easy, Medium, or Hard), a questionType, and EXACTLY 3 distractors.
- QUESTION TYPE — mandatory and explicit. Set "questionType" to exactly one of: multiple_choice, true_false, short_answer, numerical, essay. Never leave it out.
  * multiple_choice: you MUST also return an "options" array of EXACTLY 4 non-empty options, and the "answer" MUST be character-for-character identical to one of those options.
  * If the question wording is "Which of the following…", "Which one of these…", "All of the following except…", "Which statement is correct…" or similar, it MUST be multiple_choice WITH 4 options.
  * true_false: the answer MUST be exactly "True" or "False". Do not return options.
  * numerical: the answer is a number (with units if relevant) — short factual computation.
  * essay: long-form / application / scenario answer; the explanation must contain the marking points / model answer.
  * short_answer: concise sentence or phrase answer.
- DISTRACTORS — critical for exam quality:
  * Each distractor MUST be plausible and based on a COMMON STUDENT MISCONCEPTION, a near-miss calculation, or a closely-related-but-wrong concept on the same topic.
  * Distractors MUST be similar in length, tone, and formatting to the correct answer. Do NOT use "None of the above" or "All of the above".
- MATH & SCIENCE: ALWAYS write equations, variables, fractions, integrals, matrices, units and Greek letters using LaTeX ($...$ inline, $$...$$ displayed). For math/word problems, the explanation MUST show numbered step-by-step calculations.
- DIAGRAMS: when a visual clarifies the question (geometry, graphs, free-body diagrams, circuits, biology anatomy, chemistry structures, flowcharts), include a crisp inline SVG (<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">…</svg>, no scripts/foreignObject) in "diagram". Otherwise OMIT "diagram".
- EXHAUSTIVENESS: Do not compress multiple concepts into 1 question — split multi-part topics and sub-questions (a), (b), (i), (ii) into separate cards so the student gets maximum coverage.`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_flashcards",
            description: "Save the generated flashcards",
            parameters: {
              type: "object",
              properties: {
                suggested_title: { type: "string" },
                suggested_subject: { type: "string" },
                cards: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                      explanation: { type: "string" },
                      topic: { type: "string" },
                      difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
                      questionType: { type: "string", enum: ["multiple_choice", "true_false", "short_answer", "numerical", "essay"] },
                      options: { type: "array", items: { type: "string" }, description: "Exactly 4 options — REQUIRED when questionType is multiple_choice. The answer must be one of them. Omit for other types." },
                      distractors: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
                      diagram: { type: "string", description: "Optional inline SVG diagram. Omit if not needed." },
                    },
                    required: ["question", "answer", "explanation", "topic", "difficulty", "questionType", "distractors"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggested_title", "suggested_subject", "cards"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_flashcards" } },
    };

    const json = await callChat(body);
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments ?? json.choices?.[0]?.message?.content;
    if (!rawArgs) throw new Error("AI returned no cards");
    const parsed = parseToolArgs(rawArgs);
    const validated = validateGeneratedCards(parsed?.cards ?? []);
    if (!validated.length) throw new Error("AI returned no valid flashcards for this material.");
    return {
      suggested_title: String(parsed?.suggested_title ?? "Untitled deck"),
      suggested_subject: String(parsed?.suggested_subject ?? ""),
      cards: validated,
    };
  });

// Stage 0 — split raw document text into administrative metadata vs academic content.
export const classifyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(200_000) }).parse(d))
  .handler(async ({ data }) => {
    const system = `You are a document structuring engine. Split the given document extract into two parts and return them as JSON.

ADMINISTRATIVE INFORMATION (metadata — never study material): university / faculty / department, course code and title, examiner / moderator / lecturer / invigilator names, exam date, duration, venue, session, student-number fields, exam and section instructions ("Answer any three questions", "Calculators permitted", "Turn over"), marks allocation, question numbering, page numbers, headers, footers, copyright, plagiarism declarations, submission/answer-sheet instructions, table of contents.

ACADEMIC CONTENT: everything that carries real subject knowledge — the actual examinable questions, definitions, concepts, theories, principles, formulas, derivations, worked examples, data, cases, tables and figures with meaning.

Rules:
- Reproduce the ACADEMIC CONTENT VERBATIM and IN FULL. Never summarise, shorten, reorder or omit any academic sentence, question or sub-question — completeness matters more than tidiness.
- Remove marks annotations, page numbers, running headers/footers and instruction lines from the academic text, but keep the questions themselves intact.
- Keep the topic/chapter/section headings that describe subject matter (e.g. "Topic 2: Derivatives") inside the academic content.
- If the extract is entirely administrative, return an empty academic_content string.`;

    const json = await callChat({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: data.text },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_structure",
            parameters: {
              type: "object",
              properties: {
                administrative: {
                  type: "object",
                  properties: {
                    course_code: { type: "string" },
                    course_title: { type: "string" },
                    examiner: { type: "string" },
                    exam_instructions: { type: "array", items: { type: "string" } },
                    section_instructions: { type: "array", items: { type: "string" } },
                  },
                  additionalProperties: false,
                },
                academic_content: { type: "string" },
                topics: { type: "array", items: { type: "string" } },
                is_exam_paper: { type: "boolean" },
              },
              required: ["academic_content", "topics"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_structure" } },
    });
    const tc = json.choices?.[0]?.message?.tool_calls?.[0];
    const raw = tc?.function?.arguments ?? json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Document analysis returned nothing");
    const parsed = JSON.parse(stripJsonFences(raw));
    return {
      academicContent: String(parsed?.academic_content ?? ""),
      topics: Array.isArray(parsed?.topics) ? parsed.topics.map((t: unknown) => String(t)).slice(0, 60) : [],
      isExamPaper: Boolean(parsed?.is_exam_paper),
      administrative: parsed?.administrative ?? {},
    };
  });

// Study Studio: Generate structured Summaries, Detailed Explanations, or Visual Learning Diagrams
export const generateStudyResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      resourceType: z.enum(["summary", "explanation", "visual"]),
      text: z.string().min(10).max(120_000),
      chapterFocus: z.string().max(300).optional(),
      hint: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const focusLine = data.chapterFocus ? `\nChapter / Topic focus: ${data.chapterFocus}` : "";
    const hintLine = data.hint ? `\nAdditional instructions: ${data.hint}` : "";

    if (data.resourceType === "summary") {
      const json = await callChat({
        messages: [
          {
            role: "system",
            content:
              "You are an expert university academic summariser. Produce crisp, exam-ready chapter summaries, topic summaries, key definitions, key concepts, and high-yield revision notes. Use LaTeX ($...$ / $$...$$) for formulas.",
          },
          { role: "user", content: `Source material:${focusLine}${hintLine}\n\n${data.text.slice(0, 60_000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_summary",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  subject: { type: "string" },
                  overview: { type: "string" },
                  chapterSummaries: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        heading: { type: "string" },
                        summary: { type: "string" },
                        keyTakeaways: { type: "array", items: { type: "string" } },
                      },
                      required: ["heading", "summary", "keyTakeaways"],
                    },
                  },
                  definitions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        term: { type: "string" },
                        definition: { type: "string" },
                      },
                      required: ["term", "definition"],
                    },
                  },
                  revisionNotes: { type: "array", items: { type: "string" } },
                },
                required: ["title", "subject", "overview", "chapterSummaries", "definitions", "revisionNotes"],
              },
            },
          },
        ],
      });
      const tc = json.choices?.[0]?.message?.tool_calls?.[0];
      const raw = tc?.function?.arguments ?? json.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Summary generation returned empty output");
      return { kind: "summary" as const, data: JSON.parse(stripJsonFences(raw)) };
    }

    if (data.resourceType === "explanation") {
      const json = await callChat({
        messages: [
          {
            role: "system",
            content:
              "You are a master university lecturer. Break down complex material into intuitive simplified explanations, numbered step-by-step solutions, worked examples, and common student misconceptions. Use LaTeX ($...$ / $$...$$) for math and science equations.",
          },
          { role: "user", content: `Source material:${focusLine}${hintLine}\n\n${data.text.slice(0, 60_000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_explanation",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  subject: { type: "string" },
                  simplifiedExplanation: { type: "string" },
                  stepByStepBreakdown: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        stepNumber: { type: "integer" },
                        title: { type: "string" },
                        explanation: { type: "string" },
                        formula: { type: "string" },
                      },
                      required: ["stepNumber", "title", "explanation"],
                    },
                  },
                  workedExamples: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        problem: { type: "string" },
                        solution: { type: "string" },
                        takeaway: { type: "string" },
                      },
                      required: ["problem", "solution", "takeaway"],
                    },
                  },
                  commonMisconceptions: { type: "array", items: { type: "string" } },
                },
                required: ["title", "subject", "simplifiedExplanation", "stepByStepBreakdown", "workedExamples", "commonMisconceptions"],
              },
            },
          },
        ],
      });
      const tc = json.choices?.[0]?.message?.tool_calls?.[0];
      const raw = tc?.function?.arguments ?? json.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Explanation generation returned empty output");
      return { kind: "explanation" as const, data: JSON.parse(stripJsonFences(raw)) };
    }

    const json = await callChat({
      messages: [
        {
          role: "system",
          content:
            'You are an academic visual illustrator. Create 2 to 4 crisp, accurate educational SVG diagrams (<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">...</svg>) that visually explain the core processes, architectures, graphs, cycles, or relationships in the material. Use clean strokes (stroke="#477BFF", stroke="#54D6E8", stroke="currentColor"), legible <text> labels, and NO <script> or <foreignObject>. Also provide structured visual breakdown steps for each diagram.',
        },
        { role: "user", content: `Source material:${focusLine}${hintLine}\n\n${data.text.slice(0, 60_000)}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_visual_guide",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                subject: { type: "string" },
                conceptSummary: { type: "string" },
                diagrams: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      caption: { type: "string" },
                      svg: { type: "string" },
                      breakdownSteps: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "caption", "svg", "breakdownSteps"],
                  },
                },
              },
              required: ["title", "subject", "conceptSummary", "diagrams"],
            },
          },
        },
      ],
    });
    const tc = json.choices?.[0]?.message?.tool_calls?.[0];
    const raw = tc?.function?.arguments ?? json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Visual guide generation returned empty output");
    return { kind: "visual" as const, data: JSON.parse(stripJsonFences(raw)) };
  });

// Generate a quiz from existing cards (turns answers into MCQs with distractors)
export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    cards: z.array(z.object({ question: z.string(), answer: z.string() })).min(1).max(50),
  }).parse(d))
  .handler(async ({ data }) => {
    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Turn flashcards into a multiple-choice quiz. For each card, write 3 plausible but incorrect distractor options. Keep the correct answer concise." },
        { role: "user", content: JSON.stringify(data.cards) },
      ],
      tools: [{
        type: "function",
        function: {
          name: "save_quiz",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    correct: { type: "string" },
                    distractors: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
                  },
                  required: ["question", "correct", "distractors"],
                  additionalProperties: false,
                },
              },
            },
            required: ["questions"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "save_quiz" } },
    };

    const json = await callChat(body);
    const tc = json.choices?.[0]?.message?.tool_calls?.[0];
    const raw = tc?.function?.arguments ?? json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No quiz returned");
    return JSON.parse(stripJsonFences(raw)) as {
      questions: { question: string; correct: string; distractors: string[] }[];
    };
  });

// Grade open-ended answers leniently with partial credit (out of 5 per question based on complexity)
export const gradeOpenAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    items: z.array(z.object({
      question: z.string(),
      expected: z.string(),
      userAnswer: z.string(),
    })).min(1).max(50),
  }).parse(d))
  .handler(async ({ data }) => {
    const resolved: ({ score: number; max_marks: number; feedback: string } | null)[] =
      data.items.map((item) => {
        const local = tryLocalGrade(item.question, item.expected, item.userAnswer);
        if (!local) return null;
        return { score: local.score, max_marks: local.max_marks, feedback: local.feedback };
      });

    const ambiguousIndices: number[] = [];
    resolved.forEach((entry, i) => {
      if (entry === null) ambiguousIndices.push(i);
    });

    if (ambiguousIndices.length === 0) {
      return {
        grades: resolved as { score: number; max_marks: number; feedback: string }[],
      };
    }

    const ambiguousItems = ambiguousIndices.map((idx) => data.items[idx]);
    const system = `You are a fair, accurate university examiner grading student answers. Return grades in the exact same order as the input array.
- Choose max_marks (1–5) from expected answer depth: 1=recall, 2=short concept, 3=multi-part, 4–5=detailed/essay.
- 0 marks: blank, gibberish, "idk", wrong entity/number/formula/sign, or unrelated.
- Full max_marks: conveys the same core facts/result (synonyms & paraphrasing accepted; math 1/2 = 0.5).
- Partial marks: demonstrates clear correct knowledge, step, or sub-part. Never reward mere topic keywords.
- Keep feedback to one crisp, honest sentence (LaTeX $...$ allowed for formulas).`;

    const body = {
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(ambiguousItems) },
      ],
      tools: [{
        type: "function",
        function: {
          name: "save_grades",
          parameters: {
            type: "object",
            properties: {
              grades: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    max_marks: { type: "number" },
                    feedback: { type: "string" },
                  },
                  required: ["score", "max_marks", "feedback"],
                  additionalProperties: false,
                },
              },
            },
            required: ["grades"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "save_grades" } },
    };

    const json = await callChat(body, { fast: true });
    const tc = json.choices?.[0]?.message?.tool_calls?.[0];
    const raw = tc?.function?.arguments ?? json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No grades returned");
    const parsed = JSON.parse(stripJsonFences(raw)) as {
      grades: { score: number; max_marks: number; feedback: string }[];
    };

    ambiguousIndices.forEach((origIdx, j) => {
      const g = parsed.grades?.[j];
      const max = Math.max(1, Math.round(Number(g?.max_marks) || 1));
      const score = Math.max(0, Math.min(max, Number(g?.score) || 0));
      resolved[origIdx] = {
        score,
        max_marks: max,
        feedback: String(g?.feedback ?? "Graded."),
      };
    });

    return {
      grades: resolved.map(
        (g) => g ?? { score: 0, max_marks: 1, feedback: "Graded." },
      ),
    };
  });

// Judge a single typed answer semantically (synonyms, paraphrasing, partial credit)
export const judgeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    question: z.string().min(1).max(4000),
    correctAnswer: z.string().min(1).max(4000),
    userAnswer: z.string().max(4000),
  }).parse(d))
  .handler(async ({ data }) => {
    const userAns = (data.userAnswer ?? "").trim();
    const local = tryLocalGrade(data.question, data.correctAnswer, userAns);
    if (local) {
      return { correct: local.correct, feedback: local.feedback };
    }

    const prompt = `Q: ${data.question}\nKEY: ${data.correctAnswer}\nSTUDENT: ${userAns}\nReturn JSON only: {"correct":true|false,"feedback":"one short sentence"}`;

    const json = await callChat({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `Strict, fair flashcard grader. Mark "correct": true ONLY if student conveys the same core meaning or equivalent math/numeric form as KEY (synonyms/paraphrasing OK). Mark "correct": false for gibberish, contradictions, wrong entity/sign, tangents, or missing the main required fact. Respond ONLY with JSON: {"correct":boolean,"feedback":string}.`,
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }, { fast: true });
    const raw: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = stripJsonFences(raw);
    try {
      const parsed = JSON.parse(cleaned);
      return {
        correct: Boolean(parsed.correct),
        feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
      };
    } catch {
      throw new Error("Could not parse grader response");
    }
  });
