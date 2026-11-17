import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/integrations/supabase/client";
import {
  clearOfflineData,
  formatBytes,
  getDailyGoalTarget,
  getOfflineStorageStats,
  setDailyGoalTarget,
} from "@/lib/offline-storage";
import { getStudyGoalConfig, setStudyGoalConfig } from "@/lib/study-goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Loader2, Sun, Moon, HardDrive, Trash2, HelpCircle, Target } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Settings & Profile | COGNY" },
      { name: "description", content: "Manage your COGNY student profile, appearance, daily goal, and offline storage." },
      { property: "og:title", content: "Settings & Profile | COGNY" },
      { property: "og:description", content: "Manage your COGNY student profile and study preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  ),
});

function Profile() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [durationGoal, setDurationGoal] = useState<number>(30);
  const [deckGoal, setDeckGoal] = useState<number>(2);
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    decksCount: number;
    materialsCount: number;
    resourcesCount: number;
    pendingSync: number;
  } | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    university: "",
    program: "",
    year_part: "",
    subjects: "",
  });

  async function loadStorageStats() {
    const s = await getOfflineStorageStats();
    setStorageInfo({
      usedBytes: s.usedBytes,
      decksCount: s.decks.length,
      materialsCount: s.materials.length,
      resourcesCount: s.resources.length,
      pendingSync: s.pendingSync,
    });
  }

  useEffect(() => {
    setDailyGoal(getDailyGoalTarget());
    const sg = getStudyGoalConfig();
    setDurationGoal(sg.durationMinutes);
    setDeckGoal(sg.deckTarget);
    void loadStorageStats();
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data) {
        setForm({
          display_name: data.display_name ?? "",
          university: data.university ?? "",
          program: (data as any).program ?? "",
          year_part: data.year_part ?? "",
          subjects: (data.subjects ?? []).join(", "),
        });
      }
      setLoading(false);
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    const subjects = form.subjects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name,
        university: form.university,
        program: form.program,
        year_part: form.year_part,
        subjects,
      } as any)
      .eq("id", user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  }

  function handleSaveGoal() {
    setDailyGoalTarget(dailyGoal);
    setStudyGoalConfig({
      durationMinutes: durationGoal,
      deckTarget: deckGoal,
    });
    toast.success(
      `Study goals updated: ${durationGoal} min · ${deckGoal} deck${deckGoal === 1 ? "" : "s"} · ${dailyGoal} questions/day`,
    );
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Workspace Preferences
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your academic profile, color theme, daily learning goals, and offline cache.
        </p>
      </div>

      {/* Appearance & Daily Goal */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Appearance</h2>
            <p className="text-xs text-muted-foreground">
              Choose Light Mode (default) or Midnight Navy Dark Mode.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                theme === "light"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sun className="h-4 w-4" /> Light
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                theme === "dark"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon className="h-4 w-4" /> Dark
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Daily Learning Goals
            </h2>
            <p className="text-xs text-muted-foreground">
              Set your study duration, decks per session/day, and daily question target.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="settings-mins" className="text-[11px] text-muted-foreground">
                Minutes
              </Label>
              <Input
                id="settings-mins"
                type="number"
                min={5}
                max={360}
                value={durationGoal}
                onChange={(e) =>
                  setDurationGoal(Math.max(5, Math.min(360, Number(e.target.value) || 30)))
                }
                className="mt-1 font-mono tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="settings-decks" className="text-[11px] text-muted-foreground">
                Decks
              </Label>
              <Input
                id="settings-decks"
                type="number"
                min={1}
                max={25}
                value={deckGoal}
                onChange={(e) =>
                  setDeckGoal(Math.max(1, Math.min(25, Number(e.target.value) || 2)))
                }
                className="mt-1 font-mono tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="settings-qs" className="text-[11px] text-muted-foreground">
                Questions
              </Label>
              <Input
                id="settings-qs"
                type="number"
                min={5}
                max={200}
                value={dailyGoal}
                onChange={(e) =>
                  setDailyGoal(Math.max(5, Math.min(200, Number(e.target.value) || 20)))
                }
                className="mt-1 font-mono tabular-nums"
              />
            </div>
          </div>
          <Button onClick={handleSaveGoal} variant="outline" size="sm" className="w-full">
            Update goals
          </Button>
        </section>
      </div>

      {/* Academic Profile */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold text-foreground">Academic Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Display name</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>University / School</Label>
            <Input
              value={form.university}
              onChange={(e) => setForm({ ...form, university: e.target.value })}
              placeholder="e.g. University of Cape Town"
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Program / Degree</Label>
            <Input
              value={form.program}
              onChange={(e) => setForm({ ...form, program: e.target.value })}
              placeholder="e.g. BSc Computer Science, MBChB"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Links you with classmates in Program Chat & shared decks.
            </p>
          </div>
          <div>
            <Label>Year / Part</Label>
            <Input
              value={form.year_part}
              onChange={(e) => setForm({ ...form, year_part: e.target.value })}
              placeholder="e.g. 2nd year"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label>Subjects (comma-separated)</Label>
          <Textarea
            value={form.subjects}
            onChange={(e) => setForm({ ...form, subjects: e.target.value })}
            rows={2}
            placeholder="Computer Science, Informatics, Applied Physics"
            className="mt-1"
          />
        </div>
        <div className="text-xs text-muted-foreground">Signed in as {user?.email}</div>
        <Button onClick={save} disabled={busy} className="w-full sm:w-auto">
          <Save className="h-4 w-4 mr-2" /> Save profile
        </Button>
      </section>

      {/* Offline Storage & Onboarding Guide */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" /> Local & Offline Cache
            </h2>
            <p className="text-xs text-muted-foreground">
              Stored on this device for offline study. Clearing cache never removes your cloud decks.
            </p>
          </div>
          {storageInfo && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {formatBytes(storageInfo.usedBytes)} used · {storageInfo.decksCount} decks ·{" "}
              {storageInfo.materialsCount} files
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new Event("cogni:open-guide"))}
          >
            <HelpCircle className="h-4 w-4 mr-1.5" /> Open Welcome Guide
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (!confirm("Clear cached offline materials, study guides, and downloaded decks on this device?")) {
                return;
              }
              await clearOfflineData();
              await loadStorageStats();
              toast.success("Offline cache cleared");
            }}
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Clear local cache
          </Button>
        </div>
      </section>
    </div>
  );
}
