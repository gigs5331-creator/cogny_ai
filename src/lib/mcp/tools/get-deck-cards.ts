import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_deck_cards",
  title: "Get deck cards",
  description: "Read the flashcards (question, answer, explanation, topic, difficulty) of a deck the student can access.",
  inputSchema: {
    deckId: z.string().uuid().describe("The deck id, from list_decks or search_shared_decks."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum cards to return (default 60)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deckId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("id, title, subject, course_name")
      .eq("id", deckId)
      .maybeSingle();
    if (deckError) return { content: [{ type: "text", text: deckError.message }], isError: true };
    if (!deck) return { content: [{ type: "text", text: "Deck not found or not accessible." }], isError: true };

    const { data: cards, error } = await supabase
      .from("flashcards")
      .select("id, question, answer, explanation, topic, difficulty, distractors, position")
      .eq("deck_id", deckId)
      .order("position", { ascending: true })
      .limit(limit ?? 60);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ deck, cards: cards ?? [] }) }],
      structuredContent: { deck, cards: cards ?? [] },
    };
  },
});
