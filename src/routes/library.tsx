import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/require-auth";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { extractFromFile } from "@/lib/extract-text";
import { detectChapters, smartSplitText } from "@/lib/question-engine";
import { CORE_SUBJECTS, matchSubjectName } from "@/lib/subjects";
import {
  listMaterials,
  listSubjects,
  listStudyResources,
  makeOfflineId,
  removeMaterial,
  removeStudyResource,
  saveMaterial,
  type OfflineMaterial,
  type OfflineSubject,
  type SavedStudyResource,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Folder,
  Upload,
  Search,
  Sparkles,
  Trash2,
  Eye,
  Clock,
  BookOpen,
  Layers,
  ImageIcon,
  FileSpreadsheet,
  Presentation,
  Loader2,
  FolderPlus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "My Library | COGNY" },
      {
        name: "description",
        content: "Organise your uploaded PDFs, lecture slides, documents, folders, and generated study resources.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <LibraryPage />
    </RequireAuth>
  ),
});

type DeckRow = {
  id: string;
  title: string;
  subject: string | null;
  created_at: string;
  card_count: number;
};

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "Text document";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileIcon(fileType?: string | null) {
  const t = (fileType ?? "").toLowerCase();
  if (t.includes("image")) return ImageIcon;
  if (t.includes("sheet") || t.includes("csv") || t.includes("excel")) return FileSpreadsheet;
  if (t.includes("presentation") || t.includes("ppt")) return Presentation;
  return FileText;
}

function LibraryPage() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [materials, setMaterials] = useState<OfflineMaterial[]>([]);
  const [customSubjects, setCustomSubjects] = useState<OfflineSubject[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [resources, setResources] = useState<SavedStudyResource[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [uploadSubject, setUploadSubject] = useState<string>(CORE_SUBJECTS[0].name);
  const [uploadFolder, setUploadFolder] = useState<string>("Lecture Notes");

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<OfflineMaterial | null>(null);
  const [previewResource, setPreviewResource] = useState<SavedStudyResource | null>(null);

  const allSubjectNames = useMemo(() => {
    const names = new Set<string>(CORE_SUBJECTS.map((s) => s.name));
    customSubjects.forEach((s) => names.add(s.name));
    materials.forEach((m) => {
      if (m.subject) names.add(m.subject);
    });
    return Array.from(names);
  }, [customSubjects, materials]);

  const allFolders = useMemo(() => {
    const set = new Set<string>(["Lecture Notes", "Past Papers", "Textbooks", "Assignments"]);
    materials.forEach((m) => {
      if (m.folder) set.add(m.folder);
    });
    return Array.from(set);
  }, [materials]);

  async function refresh() {
    setLoading(true);
    try {
      const [mats, subjs, resList] = await Promise.all([
        listMaterials(),
        listSubjects(),
        listStudyResources(),
      ]);
      setMaterials(mats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setCustomSubjects(subjs);
      setResources(resList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      if (user && navigator.onLine) {
        const { data } = await supabase
          .from("decks")
          .select("id, title, subject, created_at, flashcards(count)")
          .eq("user_id", user.id)
          .is("archived_at", null)
          .order("created_at", { ascending: false });
        setDecks(
          (data ?? []).map((d: any) => ({
            id: d.id,
            title: d.title,
            subject: d.subject,
            created_at: d.created_at,
            card_count: d.flashcards?.[0]?.count ?? 0,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [user?.id]);

  async function handleFileUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadProgress(15);
    setUploadStage(`Reading ${file.name}…`);

    try {
      const extracted = await extractFromFile(file);
      setUploadProgress(55);
      setUploadStage("Indexing chapters & intelligent chunking…");

      let text = "";
      let imagePages: { base64: string; mime: string }[] | undefined;
      if (extracted.kind === "text") {
        text = extracted.text;
      } else if (extracted.kind === "image") {
        imagePages = [{ base64: extracted.imageBase64, mime: extracted.imageMimeType }];
        text = `[Image document: ${file.name}]`;
      } else if (extracted.kind === "images") {
        imagePages = extracted.pages;
        text = `[Scanned PDF with ${extracted.pages.length} page(s): ${file.name}]`;
      }

      const chapters =
        extracted.kind === "text"
          ? detectChapters(text).map((c) => c.title)
          : imagePages?.map((_, idx) => `Page ${idx + 1}`) ?? [];
      const chunks = extracted.kind === "text" ? smartSplitText(text) : [];
      const wordCount = extracted.kind === "text" ? text.split(/\s+/).filter(Boolean).length : 0;

      setUploadProgress(85);
      setUploadStage("Saving to library…");

      const item: OfflineMaterial = {
        id: makeOfflineId(),
        subject: matchSubjectName(uploadSubject, allSubjectNames),
        folder: uploadFolder.trim() || "Lecture Notes",
        topic: chapters[0] ?? null,
        fileName: file.name,
        fileType: file.type || file.name.split(".").pop() || "document",
        sizeBytes: file.size,
        chapters,
        text: text.slice(0, 500_000),
        imagePages,
        metadata: {
          wordCount,
          chunkCount: chunks.length || imagePages?.length || 1,
          chars: text.length,
        },
        saved: true,
        lastAccessedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveMaterial(item);
      setUploadProgress(100);
      setUploadStage("Complete");
      toast.success(`Added "${file.name}" (${chapters.length || 1} section${chapters.length === 1 ? "" : "s"}) to My Library.`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not process document.");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadStage("");
      }, 400);
    }
  }

  async function openPreview(m: OfflineMaterial) {
    const updated: OfflineMaterial = { ...m, lastAccessedAt: new Date().toISOString() };
    await saveMaterial(updated);
    setMaterials((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    setPreviewDoc(updated);
  }

  async function launchInStudio(m: OfflineMaterial) {
    const updated: OfflineMaterial = { ...m, lastAccessedAt: new Date().toISOString() };
    await saveMaterial(updated);
    nav({ to: "/create", search: { materialId: m.id, subject: m.subject ?? undefined } });
  }

  async function reassignMaterial(m: OfflineMaterial, field: "subject" | "folder", value: string) {
    const updated: OfflineMaterial = {
      ...m,
      [field]: value,
      updatedAt: new Date().toISOString(),
    };
    await saveMaterial(updated);
    setMaterials((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    if (previewDoc?.id === m.id) setPreviewDoc(updated);
    toast.success(`Updated ${field}`);
  }

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (subjectFilter !== "all" && (m.subject ?? "General") !== subjectFilter) return false;
      if (folderFilter !== "all" && (m.folder ?? "Lecture Notes") !== folderFilter) return false;
      if (!q) return true;
      return (
        m.fileName.toLowerCase().includes(q) ||
        (m.subject ?? "").toLowerCase().includes(q) ||
        (m.folder ?? "").toLowerCase().includes(q) ||
        m.text.slice(0, 4000).toLowerCase().includes(q)
      );
    });
  }, [materials, search, subjectFilter, folderFilter]);

  const recentlyUploaded = useMemo(() => materials.slice(0, 4), [materials]);
  const recentlyAccessed = useMemo(
    () =>
      materials
        .filter((m) => Boolean(m.lastAccessedAt))
        .sort((a, b) => (b.lastAccessedAt ?? "").localeCompare(a.lastAccessedAt ?? ""))
        .slice(0, 4),
    [materials],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Digital Academic Library
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            My Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, preview, and organise course materials with chapter detection and chunking.
          </p>
        </div>
        <Button asChild className="shadow-brand whitespace-nowrap">
          <Link to="/create">
            <Sparkles className="h-4 w-4 mr-1.5" /> Open Study Studio
          </Link>
        </Button>
      </div>

      {/* Upload & Organise Panel */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-foreground">
              Upload study material
            </h2>
            <p className="text-xs text-muted-foreground">
              Supports PDF, DOCX, PPTX, XLSX, CSV, TXT, Markdown, and handwritten note images. Large documents are automatically indexed by chapter.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Assign to subject</Label>
                <Select value={uploadSubject} onValueChange={setUploadSubject}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allSubjectNames.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Folder</Label>
                <Input
                  value={uploadFolder}
                  onChange={(e) => setUploadFolder(e.target.value)}
                  placeholder="Lecture Notes"
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/60 px-6 py-8 text-center transition hover:border-primary/60 hover:bg-accent/40">
              {uploading ? (
                <div className="w-full max-w-sm space-y-2.5">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{uploadStage}</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              ) : (
                <>
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Upload className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    Drop a document here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Multi-hundred-page textbooks, past exam papers, slides, or images
                  </p>
                </>
              )}
              <input
                type="file"
                className="hidden"
                accept="*/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void handleFileUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </section>

      {/* Recently Uploaded & Recently Accessed */}
      {materials.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" /> Recently uploaded
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {recentlyUploaded.length} items
              </span>
            </div>
            <div className="mt-3 divide-y divide-border">
              {recentlyUploaded.map((m) => {
                const Icon = fileIcon(m.fileType);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => openPreview(m)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left group"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {m.fileName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.subject ?? "General"} · {m.folder ?? "Lecture Notes"} · {formatFileSize(m.sizeBytes)}
                        </div>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-xs text-primary"
                      onClick={() => launchInStudio(m)}
                    >
                      Study Studio
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Recently accessed
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {recentlyAccessed.length} items
              </span>
            </div>
            <div className="mt-3 divide-y divide-border">
              {(recentlyAccessed.length ? recentlyAccessed : recentlyUploaded).map((m) => {
                const Icon = fileIcon(m.fileType);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => openPreview(m)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left group"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {m.fileName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.chapters?.length ? `${m.chapters.length} chapters` : "1 section"} ·{" "}
                          {formatDistanceToNow(new Date(m.lastAccessedAt ?? m.updatedAt), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 text-xs"
                      onClick={() => openPreview(m)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Search & Folder Filters + All Materials */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">
            All documents{" "}
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              ({filteredMaterials.length})
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, subject, text…"
                className="pl-9 h-9"
              />
            </div>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {allSubjectNames.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={folderFilter} onValueChange={setFolderFilter}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All folders</SelectItem>
                {allFolders.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-36 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <Folder className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-base font-semibold text-foreground">
              No matching documents
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a file above or adjust your subject/folder filters.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMaterials.map((m) => {
              const Icon = fileIcon(m.fileType);
              const words = Number((m.metadata as any)?.wordCount ?? 0);
              const chunks = Number((m.metadata as any)?.chunkCount ?? 1);
              return (
                <div
                  key={m.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition hover:border-primary/40"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-sm font-semibold text-foreground">
                            {m.fileName}
                          </h3>
                          <div className="truncate text-xs text-muted-foreground">
                            {m.subject ?? "General"} · {m.folder ?? "Lecture Notes"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete material"
                        onClick={async () => {
                          if (!confirm(`Delete "${m.fileName}" from your library?`)) return;
                          await removeMaterial(m.id);
                          setMaterials((prev) => prev.filter((x) => x.id !== m.id));
                          toast.success("Material deleted");
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                      <span>{words ? `${words.toLocaleString()} words` : formatFileSize(m.sizeBytes)}</span>
                      <span>{m.chapters?.length ?? 1} chapter{(m.chapters?.length ?? 1) === 1 ? "" : "s"}</span>
                      <span>{chunks} AI chunk{chunks === 1 ? "" : "s"}</span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-border pt-3.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => openPreview(m)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Details
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => launchInStudio(m)}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved AI Summaries, Explanations, Visuals & Decks */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Saved Study Guides & Diagrams
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {resources.length} saved
            </span>
          </div>
          {resources.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Generate Summaries, Step-by-Step Explanations, or Visual Diagrams in Study Studio to store them here.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {resources.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setPreviewResource(r)}
                    className="min-w-0 flex-1 text-left group"
                  >
                    <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {r.title}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {r.type} · {r.subject ?? "General"}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete guide"
                    onClick={async () => {
                      await removeStudyResource(r.id);
                      setResources((prev) => prev.filter((x) => x.id !== r.id));
                      toast.success("Study guide removed");
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> Question Banks & Decks
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {decks.length} total
            </span>
          </div>
          {decks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No saved question banks yet. Generate your first set in Study Studio.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {decks.slice(0, 8).map((d) => (
                <Link
                  key={d.id}
                  to="/decks/$deckId"
                  params={{ deckId: d.id }}
                  className="flex items-center justify-between gap-3 py-2.5 group"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {d.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.subject ?? "General"} · <span className="tabular-nums">{d.card_count}</span> questions
                    </div>
                  </div>
                  <span className="text-xs font-medium text-primary">Open →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Document Detail & Preview Modal */}
      <Dialog open={Boolean(previewDoc)} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {previewDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{previewDoc.fileName}</DialogTitle>
                <DialogDescription>
                  {formatFileSize(previewDoc.sizeBytes)} ·{" "}
                  {Number((previewDoc.metadata as any)?.wordCount ?? 0).toLocaleString()} words ·{" "}
                  {Number((previewDoc.metadata as any)?.chunkCount ?? 1)} chunks indexed
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <Select
                    value={previewDoc.subject ?? "General"}
                    onValueChange={(v) => reassignMaterial(previewDoc, "subject", v)}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allSubjectNames.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <FolderPlus className="h-3.5 w-3.5" /> Folder
                  </Label>
                  <Input
                    className="mt-1 h-9"
                    value={previewDoc.folder ?? ""}
                    onChange={(e) => reassignMaterial(previewDoc, "folder", e.target.value)}
                  />
                </div>
              </div>

              {previewDoc.chapters && previewDoc.chapters.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Detected Chapters / Topics ({previewDoc.chapters.length})
                  </div>
                  <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
                    {previewDoc.chapters.map((c, idx) => (
                      <div key={idx} className="truncate text-foreground">
                        {idx + 1}. {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Document Preview
                </div>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
                  {previewDoc.text.slice(0, 12_000)}
                  {previewDoc.text.length > 12_000 ? "\n\n… (truncated in preview — full document is available in Study Studio)" : ""}
                </pre>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPreviewDoc(null)}>
                  Close
                </Button>
                <Button onClick={() => launchInStudio(previewDoc)}>
                  <Sparkles className="h-4 w-4 mr-1.5" /> Open in Study Studio
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Saved Study Resource Viewer Modal */}
      <Dialog open={Boolean(previewResource)} onOpenChange={(o) => !o && setPreviewResource(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {previewResource && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{previewResource.title}</DialogTitle>
                <DialogDescription className="capitalize">
                  {previewResource.type} · {previewResource.subject ?? "General"}
                </DialogDescription>
              </DialogHeader>
              <pre className="mt-2 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground">
                {JSON.stringify(previewResource.content, null, 2)}
              </pre>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
