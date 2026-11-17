import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Program Chat | COGNY" },
      { name: "description", content: "Collaborate with COGNY students in your academic program." },
      { property: "og:title", content: "Program Chat | COGNY" },
      { property: "og:description", content: "Connect with students in your academic program on COGNY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ChatPage />
    </RequireAuth>
  ),
});

type Msg = {
  id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
  program: string;
};

function ChatPage() {
  const { user } = useAuth();
  const [program, setProgram] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("Student");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("program, display_name")
        .eq("id", user.id)
        .single();
      setProgram(prof?.program ?? null);
      setDisplayName(prof?.display_name ?? "Student");
      if (prof?.program) {
        const { data } = await supabase
          .from("program_messages" as any)
          .select("*")
          .eq("program", prof.program)
          .order("created_at", { ascending: true })
          .limit(200);
        setMessages((data ?? []) as any);
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!program) return;
    const channel = supabase
      .channel(`program_messages:${program}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "program_messages",
          filter: `program=eq.${program}`,
        },
        (payload) => setMessages((m) => [...m, payload.new as Msg]),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [program]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !program || !text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("program_messages" as any).insert({
      program,
      user_id: user.id,
      display_name: displayName,
      body: text.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
          Set your academic program first
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your degree or program in Settings so we can connect you with classmates.
        </p>
        <Button asChild className="mt-4">
          <Link to="/profile">Open Settings</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Cohort Collaboration
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" /> {program}
        </h1>
        <p className="text-sm text-muted-foreground">
          Coordinate study sessions, share decks, and discuss past papers with classmates.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card h-[62vh] flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              No messages yet — start the conversation for {program}.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-foreground"
                    }`}
                  >
                    {!mine && (
                      <div className="text-xs font-semibold text-primary mb-0.5">
                        {m.display_name}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                    <div
                      className={`text-[10px] mt-1 ${
                        mine ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="border-t border-border p-3 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message your program…"
            maxLength={2000}
          />
          <Button type="submit" disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
