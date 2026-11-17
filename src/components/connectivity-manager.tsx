import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listQuizAttempts, listStudyEvents, removeStudyEvent, saveQuizAttempt } from "@/lib/offline-storage";
import { registerCogniPwa } from "@/lib/pwa-registration";
import { toast } from "sonner";

let syncInFlight = false;

export async function syncOfflineResults(): Promise<number> {
  if (syncInFlight || !navigator.onLine) return 0;
  syncInFlight = true;
  let synced = 0;
  try {
    const events = await listStudyEvents();
    let failed = false;
    for (const event of events) {
      const { error } = await supabase.from("study_sessions").insert({
        id: event.id,
        user_id: event.userId,
        deck_id: event.deckId,
        mode: event.mode,
        score: event.score,
        total: event.total,
        completed_at: event.completedAt,
      });
      if (!error || error.code === "23505") {
        await removeStudyEvent(event.id);
        synced++;
      } else {
        failed = true;
      }
    }
    if (!failed) {
      const attempts = await listQuizAttempts();
      for (const a of attempts) if (!a.synced) await saveQuizAttempt({ ...a, synced: true });
      localStorage.setItem("cogni:last-sync", new Date().toISOString());
    }
  } finally {
    syncInFlight = false;
  }
  return synced;
}

export function ConnectivityManager() {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    void registerCogniPwa();
    const sync = async () => {
      setOnline(true);
      setSyncing(true);
      try {
        const n = await syncOfflineResults();
        if (n > 0) toast.success(`Synced ${n} saved answer${n > 1 ? "s" : ""}.`);
      } finally {
        setSyncing(false);
      }
    };
    const offline = () => setOnline(false);
    window.addEventListener("online", sync);
    window.addEventListener("offline", offline);
    if (navigator.onLine) void sync();
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", offline);
    };
  }, []);

  if (online && !syncing) return null;
  return (
    <div
      className="fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs shadow-lg lg:bottom-4"
      role="status"
    >
      {syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : (
        <CloudOff className="h-3.5 w-3.5 text-primary" />
      )}
      <span>{syncing ? "Syncing progress…" : "Offline — progress saved locally"}</span>
    </div>
  );
}
