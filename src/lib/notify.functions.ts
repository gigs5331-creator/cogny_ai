import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESEND_FROM = "Cogny AI <onboarding@resend.dev>";

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
  } catch (e) {
    console.error("Email send failed", e);
  }
}

export const notifyNewDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      deckId: z.string().uuid(),
      deckTitle: z.string().min(1).max(255),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Get the creator's program + name
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("program, display_name")
      .eq("id", userId)
      .single();
    if (!me?.program) return { sent: 0 };

    // Find program-mates (excluding the creator)
    const { data: peers } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("program", me.program)
      .neq("id", userId);
    if (!peers || peers.length === 0) return { sent: 0 };

    // Fetch their emails via admin auth API
    const emails: string[] = [];
    for (const p of peers.slice(0, 200)) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
      if (u?.user?.email) emails.push(u.user.email);
    }

    const url = "https://cogny-ai.lovable.app/decks/" + data.deckId;
    const sharer = me.display_name || "A classmate";
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px">New deck in ${me.program} 🎓</h2>
        <p style="color:#444">${sharer} just shared <strong>${data.deckTitle}</strong> with your program.</p>
        <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open deck</a></p>
        <p style="color:#888;font-size:12px">You're receiving this because you study ${me.program} on Cogny AI.</p>
      </div>`;

    await Promise.all(emails.map((to) => sendEmail(to, `New deck shared: ${data.deckTitle}`, html)));
    return { sent: emails.length };
  });
