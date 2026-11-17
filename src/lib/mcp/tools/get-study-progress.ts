import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_study_progress",
  title: "Get study progress",
  description: "Summarise the signed-in student's study progress: questions answered, correct answers and accuracy.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("study_sessions")
      .select("mode, score, total, deck_id, completed_at")
      .eq("user_id", ctx.getUserId())
      .order("completed_at", { ascending: false })
      .limit(1000);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const correct = rows.reduce((s, r) => s + (r.score ?? 0), 0);
    const answered = rows.reduce((s, r) => s + (r.total ?? 0), 0);
    const summary = {
      sessionsRecorded: rows.length,
      questionsAnswered: answered,
      correctAnswers: correct,
      accuracyPercent: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      lastStudiedAt: rows[0]?.completed_at ?? null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
