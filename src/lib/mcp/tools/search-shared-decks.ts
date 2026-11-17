import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_shared_decks",
  title: "Search shared decks",
  description: "Search decks shared publicly or with the student's program, by program, title, subject or course name.",
  inputSchema: {
    query: z.string().trim().optional().describe("Search text; leave empty to list recent shared decks."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("search_decks_by_program", { p_query: query ?? "" });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { decks: data ?? [] },
    };
  },
});
