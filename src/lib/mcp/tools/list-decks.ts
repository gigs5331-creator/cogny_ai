import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_decks",
  title: "List decks",
  description: "List the signed-in student's flashcard decks, newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Maximum decks to return (default 25)."),
    includeArchived: z.boolean().optional().describe("Include decks the student archived."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, includeArchived }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("decks")
      .select("id, title, subject, course_name, is_public, shared_with_program, archived_at, last_studied_at, created_at")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { decks: data ?? [] },
    };
  },
});
