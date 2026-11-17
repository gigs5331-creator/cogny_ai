import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ProfileRow = {
  id: string;
  display_name: string | null;
  university: string | null;
  program: string | null;
  account_type: "university" | "high_school";
  created_at: string;
};

type StudyRow = { score: number; total: number; completed_at: string };

function countValues(values: Array<string | null>, fallback: string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim() || fallback;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error("Unable to verify admin access");
    return { isAdmin: Boolean(data) };
  });

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setUTCDate(now.getUTCDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setUTCDate(now.getUTCDate() - 13);

    const [
      profilesResult,
      recentProfilesResult,
      decksCountResult,
      cardsCountResult,
      sessionsCountResult,
      recentSessionsResult,
      recentDecksResult,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, university, program, account_type, created_at").order("created_at", { ascending: false }).limit(5000),
      supabaseAdmin.from("profiles").select("id, display_name, university, program, account_type, created_at").order("created_at", { ascending: false }).limit(8),
      supabaseAdmin.from("decks").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("flashcards").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("study_sessions").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("study_sessions").select("score, total, completed_at").gte("completed_at", fourteenDaysAgo.toISOString()).order("completed_at", { ascending: true }).limit(10000),
      supabaseAdmin.from("decks").select("id, title, subject, course_name, created_at, user_id, flashcards(count)").order("created_at", { ascending: false }).limit(8),
    ]);

    const failed = [profilesResult, recentProfilesResult, decksCountResult, cardsCountResult, sessionsCountResult, recentSessionsResult, recentDecksResult].find((result) => result.error);
    if (failed?.error) throw new Error("Unable to load admin statistics");

    const profiles = (profilesResult.data ?? []) as ProfileRow[];
    const recentProfiles = (recentProfilesResult.data ?? []) as ProfileRow[];
    const recentSessions = (recentSessionsResult.data ?? []) as StudyRow[];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const newStudents = profiles.filter((profile) => new Date(profile.created_at) >= sevenDaysAgo).length;
    const questionsAnswered = recentSessions.reduce((sum, session) => sum + session.total, 0);
    const correctAnswers = recentSessions.reduce((sum, session) => sum + session.score, 0);
    const allAnswered = recentSessions.reduce((sum, session) => sum + session.total, 0);

    const activity = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(fourteenDaysAgo);
      date.setUTCDate(fourteenDaysAgo.getUTCDate() + index);
      const key = dayKey(date);
      return {
        date: key,
        label: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }),
        signups: profiles.filter((profile) => profile.created_at.slice(0, 10) === key).length,
        answers: recentSessions.filter((session) => session.completed_at.slice(0, 10) === key).reduce((sum, session) => sum + session.total, 0),
      };
    });

    return {
      generatedAt: now.toISOString(),
      totals: {
        students: profiles.length,
        newStudents,
        decks: decksCountResult.count ?? 0,
        flashcards: cardsCountResult.count ?? 0,
        quizAttempts: sessionsCountResult.count ?? 0,
        questionsAnswered,
        correctAnswers,
        accuracy: allAnswered > 0 ? Math.round((correctAnswers / allAnswered) * 100) : 0,
      },
      activity,
      programs: countValues(profiles.map((profile) => profile.program), "Not specified").slice(0, 7),
      universities: countValues(profiles.map((profile) => profile.university), "Not specified").slice(0, 6),
      accountTypes: countValues(profiles.map((profile) => profile.account_type === "high_school" ? "High school" : "University"), "Other"),
      recentStudents: recentProfiles.map((profile) => ({
        id: profile.id,
        name: profile.display_name || "Student",
        university: profile.university || "Not specified",
        program: profile.program || "Not specified",
        createdAt: profile.created_at,
      })),
      recentDecks: (recentDecksResult.data ?? []).map((deck) => ({
        id: deck.id,
        title: deck.title,
        subject: deck.subject || deck.course_name || "General",
        owner: profileById.get(deck.user_id)?.display_name || "Student",
        cards: deck.flashcards?.[0]?.count ?? 0,
        createdAt: deck.created_at,
      })),
      commonProgram: countValues(profiles.map((profile) => profile.program), "Not specified")[0]?.name ?? "No data",
    };
  });