import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { CORE_SUBJECTS } from "@/lib/subjects";
import {
  Brain,
  BookOpen,
  Upload,
  GraduationCap,
  ArrowRight,
  Check,
  Layers,
  FileCheck2,
  BarChart3,
  WifiOff,
  Sparkles,
} from "lucide-react";
import studentsStudying from "@/assets/students-studying.jpg";
import studentFocus from "@/assets/student-focus.jpg";
import studyDesk from "@/assets/study-desk.jpg";
import graduation from "@/assets/graduation.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "COGNY — Learn Smarter. Understand Deeper." },
      {
        name: "description",
        content:
          "AI-powered academic learning intelligence that transforms lecture notes, PDFs, and past papers into exact-count question banks, flashcards, practice exams, explanations, and visual study guides.",
      },
      { property: "og:title", content: "COGNY — Learn Smarter. Understand Deeper." },
      {
        property: "og:description",
        content: "Transform academic documents into deep understanding, practice exams, and verified mastery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:image", content: "/assets/aistudio/cogny_logo_b4165c26.png" },
      { name: "twitter:image", content: "/assets/aistudio/cogny_logo_b4165c26.png" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-grid text-foreground">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Hero */}
        <section className="grid items-center gap-12 pt-12 pb-16 lg:grid-cols-12 lg:pt-20 lg:pb-24">
          <div className="lg:col-span-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Academic Learning Intelligence
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.06] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Learn Smarter. <br />
              <span className="text-primary">Understand Deeper.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              COGNY turns dense textbooks, lecture slides, and past exam papers into structured question banks, adaptive flashcards, worked explanations, and timed practice exams — built for serious university mastery.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                to="/login"
                search={{ mode: "signup" }}
                className="group flex flex-col justify-between rounded-xl border border-primary/30 bg-card p-4 shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    University Account
                  </span>
                  <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Collaborate across your degree program and sync progress everywhere.
                </p>
              </Link>

              <Link
                to="/high-school"
                search={{ mode: "signup" }}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <BookOpen className="h-4 w-4 text-primary" />
                    High School Account
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Organise school subjects, build revision banks, and track streaks.
                </p>
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
              <Link
                to="/login"
                search={{ mode: "signin" }}
                className="font-medium text-muted-foreground hover:text-foreground"
              >
                University sign in →
              </Link>
              <Link
                to="/high-school"
                search={{ mode: "signin" }}
                className="font-medium text-muted-foreground hover:text-foreground"
              >
                High school sign in →
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              <img
                src={studentsStudying}
                alt="University students reviewing academic materials on laptops"
                width={1536}
                height={1024}
                referrerPolicy="no-referrer"
                className="aspect-[16/10] w-full object-cover"
              />
              <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-card px-4 py-3.5 text-center">
                <div>
                  <div className="font-display text-lg font-bold tabular-nums text-foreground">
                    Exact-Count
                  </div>
                  <div className="text-[11px] text-muted-foreground">Verified question banks</div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold tabular-nums text-foreground">
                    6 Formats
                  </div>
                  <div className="text-[11px] text-muted-foreground">Studio study modes</div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold tabular-nums text-foreground">
                    Offline Ready
                  </div>
                  <div className="text-[11px] text-muted-foreground">Syncs when online</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Platform Capabilities */}
        <section id="platform" className="border-t border-border py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              The Platform
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Built like an academic workspace, powered by intelligence.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              No generic chatbot wrapper. Dedicated workspaces for organizing files, generating exact-count assessments, studying visually, and diagnosing weak topics.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Upload,
                title: "Intelligent Document Ingestion",
                body: "Upload PDFs, Word docs, slides, spreadsheets, or scanned pages. Large textbooks split cleanly on chapter boundaries with zero lost questions.",
              },
              {
                icon: FileCheck2,
                title: "Exact Question Count Engine",
                body: "Request 50 questions and receive 50 validated, numbered, duplicate-checked items — or extract every single question present in a past paper.",
              },
              {
                icon: Sparkles,
                title: "Six Learning Modalities",
                body: "Generate Question Banks, interactive Flashcards, step-by-step Explanations, chapter Summaries, Practice Exams, and SVG Visual Diagrams.",
              },
              {
                icon: Layers,
                title: "Structured Academic Library",
                body: "Organise uploads by subject, folder, and chapter. Preview documents, track chunking coverage, and launch any file into Study Studio.",
              },
              {
                icon: BarChart3,
                title: "Evidence-Based Analytics",
                body: "Track real accuracy, question attempts, weak topics, study streaks, and subject performance computed directly from your study sessions.",
              },
              {
                icon: WifiOff,
                title: "Offline Continuity",
                body: "Download decks and notes directly to your device, continue answering without Wi-Fi, and synchronise scores automatically on reconnect.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border bg-card p-6 transition hover:border-primary/40"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Study Studio Spotlight */}
        <section id="studio" className="border-t border-border py-16 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <img
                  src={studentFocus}
                  alt="Student studying textbook with focused notes"
                  loading="lazy"
                  width={1024}
                  height={1280}
                  referrerPolicy="no-referrer"
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                AI Study Studio
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Every chapter turned into verifiable mastery.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Focus on an entire module or isolate a single chapter. Choose your difficulty and question format — multiple choice, true/false, numerical, short answer, scenario, or long-form essay — and review step-by-step LaTeX solutions with grounded distractors.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  "Batch continuation guarantees requested counts",
                  "Duplicate & near-paraphrase filtering",
                  "Timed practice examinations with AI marking",
                  "Custom SVG diagrams for complex systems",
                  "Chapter-level summaries & key definitions",
                  "Program-wide deck sharing & classmate chat",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  to="/login"
                  search={{ mode: "signup" }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:opacity-95"
                >
                  Open Study Studio <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Academic Disciplines */}
        <section id="subjects" className="border-t border-border py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Academic Coverage
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
                Structured across core disciplines.
              </h2>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Pre-configured subject spaces ready for your lecture notes, with support for custom subjects and nested topics.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_SUBJECTS.map((subj) => (
              <div
                key={subj.id}
                className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {subj.code}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {subj.topics.length} core topics
                  </span>
                </div>
                <h3 className="mt-2 font-display text-base font-semibold text-foreground">
                  {subj.name}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {subj.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Campus & Outcomes Visuals */}
        <section className="border-t border-border py-16">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <img
                src={studyDesk}
                alt="Study desk with structured notes"
                loading="lazy"
                width={1280}
                height={896}
                referrerPolicy="no-referrer"
                className="aspect-[16/10] w-full object-cover"
              />
              <div className="p-6">
                <h3 className="font-display text-lg font-semibold text-foreground">
                  From raw lecture notes to structured retention
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Drop in messy handouts or multi-chapter PDFs and immediately generate cleanly organised question banks.
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <img
                src={graduation}
                alt="Graduates celebrating achievement"
                loading="lazy"
                width={1280}
                height={896}
                referrerPolicy="no-referrer"
                className="aspect-[16/10] w-full object-cover"
              />
              <div className="p-6">
                <h3 className="font-display text-lg font-semibold text-foreground">
                  Consistent preparation built into your week
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Daily study goals, timed practice exams, and weak-topic diagnostics keep your revision focused before finals.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-12 pb-20">
          <div className="rounded-2xl border border-border bg-secondary/70 dark:bg-card p-8 sm:p-12 text-center">
            <Brain className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              COGNY — Learn Smarter. Understand Deeper.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Start your digital academic library and transform your course materials into interactive mastery today.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                to="/login"
                search={{ mode: "signup" }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:opacity-95"
              >
                Get started — University <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/high-school"
                search={{ mode: "signup" }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                High school sign up
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:px-6">
          <div className="font-display font-semibold text-foreground">
            COGNY · Learn Smarter. Understand Deeper.
          </div>
          <div>Academic Learning & Intelligence Platform</div>
        </div>
      </footer>
    </div>
  );
}
