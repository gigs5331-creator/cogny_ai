import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_deck",
  title: "Create deck",
  description: "Create a new flashcard deck for the signed-in student, with its cards.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Deck title, e.g. 'Calculus I — Limits'."),
    subject: z.string().trim().optional().describe("Subject, e.g. 'Mathematics'."),
    courseName: z.string().trim().optional().describe("Course name so classmates can find it."),
    shareWithProgram: z.boolean().optional().describe("Share this deck with students in the same program."),
    cards: z
      .array(
        z.object({
          question: z.string().trim().min(1),
          answer: z.string().trim().min(1),
          explanation: z.string().trim().optional(),
          topic: z.string().trim().optional(),
          difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
        }),
      )
      .min(1)
      .max(100)
      .describe("The flashcards to add to the deck."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, subject, courseName, shareWithProgram, cards }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .insert({
        user_id: userId,
        title,
        subject: subject ?? null,
        course_name: courseName ?? null,
        shared_with_program: shareWithProgram ?? false,
        source: "mcp",
      })
      .select("id, title")
      .single();
    if (deckError || !deck) {
      return { content: [{ type: "text", text: deckError?.message ?? "Could not create the deck." }], isError: true };
    }

    const rows = cards.map((c, i) => ({
      deck_id: deck.id,
      user_id: userId,
      question: c.question,
      answer: c.answer,
      explanation: c.explanation ?? null,
      topic: c.topic ?? null,
      difficulty: c.difficulty ?? "Medium",
      position: i,
    }));
    const { error: cardsError } = await supabase.from("flashcards").insert(rows);
    if (cardsError) return { content: [{ type: "text", text: cardsError.message }], isError: true };

    return {
      content: [{ type: "text", text: `Created deck "${deck.title}" with ${rows.length} cards (id ${deck.id}).` }],
      structuredContent: { deckId: deck.id, cardCount: rows.length },
    };
  },
});
