import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { CORE_SUBJECTS, matchSubjectName, slugifySubject } from "@/lib/subjects";
import {
  getProgress,
  listMaterials,
  listSubjects,
  makeOfflineId,
  removeSubject,
  saveSubject,
  type OfflineMaterial,
  type OfflineProgress,
  type OfflineSubject,
} from "@/lib/offline-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  BookOpen,
  FileText,
  Sparkles,
  Trash2,
  ArrowRight,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/subjects")({
  head: () => ({
    meta: [
      { title: "My Subjects | COGNY" },
      {
        name: "description",
        content: "Manage your university and academic subjects, topics, study materials, and performance.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SubjectsPage />
    </RequireAuth>
  ),
});

type DeckRow = {
  id: string;
  title: string;
  subject: string | null;
  card_count: number;
};

type FlashcardStat = {
  deck_id: string;
  status: string;
  topic: string | null;
};

function SubjectsPage() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [customSubjects, setCustomSubjects] = useState<OfflineSubject[]>([]);
  const [materials, setMaterials] = useState<OfflineMaterial[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [cardStats, setCardStats] = useState<FlashcardStat[]>([]);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSubject, setSelectedSubject] = useState<string>(CORE_SUBJECTS[0].name);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectTopics, setNewSubjectTopics] = useState("");
  const [newTopicInput, setNewTopicInput] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const [subjs, mats, prog] = await Promise.all([
        listSubjects(),
        listMaterials(),
        user ? getProgress(user.id) : null,
      ]);
      setCustomSubjects(subjs);
      setMaterials(mats);
      setProgress(prog);

      if (user && navigator.onLine) {
        const [{ data: deckRows }, { data: cardsRows }] = await Promise.all([
          supabase
            .from("decks")
            .select("id, title, subject, flashcards(count)")
            .eq("user_id", user.id)
            .is("archived_at", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("flashcards")
            .select("deck_id, status, topic")
            .eq("user_id", user.id),
        ]);
        setDecks(
          (deckRows ?? []).map((d: any) => ({
            id: d.id,
            title: d.title,
            subject: d.subject,
            card_count: d.flashcards?.[0]?.count ?? 0,
          })),
        );
        setCardStats((cardsRows ?? []) as FlashcardStat[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [user?.id]);

  // Combine the 9 default subjects + any user-created custom subjects + deck subjects
  const subjects = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        code: string;
        description: string;
        isDefault: boolean;
        topics: string[];
      }
    >();

    for (const core of CORE_SUBJECTS) {
      map.set(core.name, { ...core, topics: [...core.topics] });
    }

    for (const cs of customSubjects) {
      const existing = map.get(cs.name);
      if (existing) {
        const merged = Array.from(new Set([...existing.topics, ...(cs.topics ?? [])]));
        existing.topics = merged;
      } else {
        map.set(cs.name, {
          id: cs.id,
          name: cs.name,
          code: cs.name.slice(0, 3).toUpperCase(),
          description: "Custom subject workspace.",
          isDefault: false,
          topics: cs.topics ?? [],
        });
      }
    }

    const knownNames = Array.from(map.keys());
    for (const d of decks) {
      if (!d.subject) continue;
      const matched = matchSubjectName(d.subject, knownNames);
      if (!map.has(matched)) {
        map.set(matched, {
          id: slugifySubject(matched),
          name: matched,
          code: matched.slice(0, 3).toUpperCase(),
          description: "Course materials & question banks.",
          isDefault: false,
          topics: [],
        });
      }
    }

    return Array.from(map.values());
  }, [customSubjects, decks]);

  const allSubjectNames = useMemo(() => subjects.map((s) => s.name), [subjects]);

  const subjectMetrics = useMemo(() => {
    const deckToSubject = new Map<string, string>();
    const map = new Map<
      string,
      { decks: DeckRow[]; materials: OfflineMaterial[]; mastered: number; totalCards: number }
    >();

    for (const s of subjects) {
      map.set(s.name, { decks: [], materials: [], mastered: 0, totalCards: 0 });
    }

    for (const d of decks) {
      const matched = d.subject ? matchSubjectName(d.subject, allSubjectNames) : "General";
      deckToSubject.set(d.id, matched);
      const entry = map.get(matched);
      if (entry) entry.decks.push(d);
    }

    for (const m of materials) {
      const matched = m.subject ? matchSubjectName(m.subject, allSubjectNames) : "General";
      const entry = map.get(matched);
      if (entry) entry.materials.push(m);
    }

    for (const c of cardStats) {
      const subj = deckToSubject.get(c.deck_id);
      if (!subj) continue;
      const entry = map.get(subj);
      if (!entry) continue;
      entry.totalCards++;
      if (c.status === "got_it") entry.mastered++;
    }

    return map;
  }, [subjects, decks, materials, cardStats, allSubjectNames]);

  const activeSubject =
    subjects.find((s) => s.name === selectedSubject) ?? subjects[0];
  const activeMetrics = activeSubject
    ? subjectMetrics.get(activeSubject.name)
    : undefined;

  async function handleCreateSubject(e: React.FormEvent) {
    e.preventDefault();
    const name = newSubjectName.trim();
    if (!name) return;
    const topics = newSubjectTopics
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    await saveSubject({
      id: makeOfflineId(),
      name,
      topics,
      updatedAt: new Date().toISOString(),
    });
    setNewSubjectName("");
    setNewSubjectTopics("");
    setCreateOpen(false);
    setSelectedSubject(name);
    toast.success(`Created subject "${name}"`);
    await refresh();
  }

  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSubject || !newTopicInput.trim()) return;
    const nextTopic = newTopicInput.trim();
    const updatedTopics = Array.from(new Set([...activeSubject.topics, nextTopic]));

    const existing = customSubjects.find((s) => s.name === activeSubject.name);
    await saveSubject({
      id: existing?.id ?? activeSubject.id,
      name: activeSubject.name,
      topics: updatedTopics,
      updatedAt: new Date().toISOString(),
    });
    setNewTopicInput("");
    toast.success(`Added topic "${nextTopic}"`);
    await refresh();
  }

  async function handleDeleteCustomSubject(name: string) {
    const match = customSubjects.find((s) => s.name === name);
    if (!match) return;
    if (!confirm(`Remove custom subject "${name}"? Your decks will remain safe.`)) return;
    await removeSubject(match.id);
    toast.success(`Removed "${name}"`);
    setSelectedSubject(CORE_SUBJECTS[0].name);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Academic Disciplines
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            My Subjects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organise course materials, topics, question banks, and mastery across your subjects.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shadow-brand whitespace-nowrap">
          <Plus className="h-4 w-4 mr-1.5" /> Create subject
        </Button>
      </div>

      {/* Subject Grid + Detail Workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-2.5">
          {loading ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
            ))
          ) : (
            subjects.map((s) => {
              const m = subjectMetrics.get(s.name);
              const masteryPct =
                m && m.totalCards > 0
                  ? Math.round((m.mastered / m.totalCards) * 100)
                  : progress?.topicMastery[s.name] ?? 0;
              const isSelected = activeSubject?.name === s.name;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setSelectedSubject(s.name)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-primary bg-accent/60 dark:bg-accent/40 shadow-sm"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-primary">
                          {s.code}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {s.isDefault ? "Core" : "Custom"}
                        </span>
                      </div>
                      <h3 className="mt-0.5 truncate font-display text-sm font-semibold text-foreground">
                        {s.name}
                      </h3>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {masteryPct}%
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                    <span>
                      {m?.decks.length ?? 0} deck{(m?.decks.length ?? 0) === 1 ? "" : "s"} ·{" "}
                      {m?.materials.length ?? 0} file{(m?.materials.length ?? 0) === 1 ? "" : "s"}
                    </span>
                    <span>{s.topics.length} topics</span>
                  </div>
                  <Progress value={masteryPct} className="mt-2 h-1.5" />
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail Panel */}
        {activeSubject && (
          <div className="lg:col-span-7 space-y-6">
            <section className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <FolderKanban className="h-4 w-4" />
                    <span className="font-mono">{activeSubject.code}</span>
                    <span className="text-muted-foreground font-normal">
                      · {activeSubject.isDefault ? "University Core Discipline" : "Custom Subject"}
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-2xl font-bold text-foreground">
                    {activeSubject.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{activeSubject.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!activeSubject.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteCustomSubject(activeSubject.name)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      nav({ to: "/create", search: { subject: activeSubject.name } })
                    }
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Study Studio
                  </Button>
                </div>
              </div>

              {/* Metrics Strip */}
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5">
                <div>
                  <div className="text-xs text-muted-foreground">Decks</div>
                  <div className="mt-0.5 font-display text-xl font-bold tabular-nums text-foreground">
                    {activeMetrics?.decks.length ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cards Mastered</div>
                  <div className="mt-0.5 font-display text-xl font-bold tabular-nums text-foreground">
                    {activeMetrics?.mastered ?? 0}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      / {activeMetrics?.totalCards ?? 0}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Library Files</div>
                  <div className="mt-0.5 font-display text-xl font-bold tabular-nums text-foreground">
                    {activeMetrics?.materials.length ?? 0}
                  </div>
                </div>
              </div>
            </section>

            {/* Topics Organisation */}
            <section className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Topics & Syllabus Outline
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {activeSubject.topics.length} topics
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {activeSubject.topics.map((topic) => (
                  <div
                    key={topic}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium text-foreground">{topic}</span>
                    <button
                      type="button"
                      onClick={() =>
                        nav({
                          to: "/create",
                          search: { subject: `${activeSubject.name} — ${topic}` },
                        })
                      }
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Generate →
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddTopic} className="mt-4 flex gap-2">
                <Input
                  value={newTopicInput}
                  onChange={(e) => setNewTopicInput(e.target.value)}
                  placeholder="Add a topic (e.g. Week 4 — Neural Networks)…"
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="outline" className="h-9 whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-1" /> Add topic
                </Button>
              </form>
            </section>

            {/* Subject Decks & Uploaded Materials */}
            <div className="grid gap-6 sm:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" /> Subject Question Banks
                </h3>
                {activeMetrics && activeMetrics.decks.length > 0 ? (
                  <div className="mt-3 divide-y divide-border">
                    {activeMetrics.decks.map((d) => (
                      <Link
                        key={d.id}
                        to="/decks/$deckId"
                        params={{ deckId: d.id }}
                        className="flex items-center justify-between gap-2 py-2.5 group"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                            {d.title}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {d.card_count} questions
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No question banks linked to {activeSubject.name} yet.
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Linked Materials
                  </h3>
                  <Link to="/library" className="text-xs font-medium text-primary hover:underline">
                    Upload →
                  </Link>
                </div>
                {activeMetrics && activeMetrics.materials.length > 0 ? (
                  <div className="mt-3 divide-y divide-border">
                    {activeMetrics.materials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          nav({
                            to: "/create",
                            search: { materialId: m.id, subject: activeSubject.name },
                          })
                        }
                        className="flex w-full items-center justify-between gap-2 py-2.5 text-left group"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                            {m.fileName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.folder ?? "Lecture Notes"}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-primary">Studio →</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Add lecture notes or PDFs in My Library and assign them to {activeSubject.name}.
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Create Subject Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Create custom subject</DialogTitle>
            <DialogDescription>
              Add a dedicated workspace for any course, module, or exam syllabus.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubject} className="space-y-4">
            <div>
              <Label htmlFor="subj-name">Subject name</Label>
              <Input
                id="subj-name"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="e.g. Organic Chemistry II"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="subj-topics">Initial topics (comma-separated)</Label>
              <Input
                id="subj-topics"
                value={newSubjectTopics}
                onChange={(e) => setNewSubjectTopics(e.target.value)}
                placeholder="Stereochemistry, Carbonyl Reactions, Spectroscopy"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create subject</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
