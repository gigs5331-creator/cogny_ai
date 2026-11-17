import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BookOpen, BrainCircuit, GraduationCap, Layers3, Loader2, ShieldCheck, Target, TrendingUp, UserPlus, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { getAdminDashboard, getMyAdminStatus } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Admin Dashboard | Cogni" },
    { name: "description", content: "Private Cogni administration dashboard for student growth, faculties, decks, and study activity." },
    { property: "og:title", content: "Cogni Admin Dashboard" },
    { property: "og:description", content: "Private platform statistics and academic activity for Cogni administrators." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <RequireAuth><AdminDashboard /></RequireAuth>,
});

type AdminData = Awaited<ReturnType<typeof getAdminDashboard>>;

const activityConfig = {
  signups: { label: "New students", color: "var(--color-primary)" },
  answers: { label: "Questions answered", color: "var(--color-warning)" },
} satisfies ChartConfig;

const programConfig = { students: { label: "Students", color: "var(--color-info)" } } satisfies ChartConfig;
const pieColors = ["var(--color-primary)", "var(--color-info)", "var(--color-success)", "var(--color-warning)"];

function Panel({ title, icon: Icon, children, className = "" }: { title: string; icon: typeof Activity; children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-lg border border-border/70 bg-card/70 ${className}`}>
    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="font-display text-sm font-semibold">{title}</h2>
    </div>
    <div className="p-4">{children}</div>
  </section>;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const checkAdmin = useServerFn(getMyAdminStatus);
  const fetchDashboard = useServerFn(getAdminDashboard);
  const [data, setData] = useState<AdminData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await checkAdmin();
        if (!active) return;
        if (!status.isAdmin) { setState("forbidden"); return; }
        const dashboard = await fetchDashboard();
        if (active) { setData(dashboard); setState("ready"); }
      } catch {
        if (active) setState("error");
      }
    })();
    return () => { active = false; };
  }, [checkAdmin, fetchDashboard]);

  const cards = useMemo(() => data ? [
    { label: "Total students", value: data.totals.students, note: `+${data.totals.newStudents} this week`, icon: Users },
    { label: "Study decks", value: data.totals.decks, note: `${data.totals.flashcards.toLocaleString()} flashcards`, icon: Layers3 },
    { label: "Quiz attempts", value: data.totals.quizAttempts, note: `${data.totals.questionsAnswered.toLocaleString()} answers in 14 days`, icon: BrainCircuit },
    { label: "Answer accuracy", value: `${data.totals.accuracy}%`, note: `${data.totals.correctAnswers.toLocaleString()} correct in 14 days`, icon: Target },
  ] : [], [data]);

  if (state === "loading") return <div className="grid min-h-[70vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Loading admin insights…</p></div></div>;
  if (state === "forbidden") return <div className="grid min-h-[70vh] place-items-center"><div className="max-w-md text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 font-display text-2xl font-bold">Admin access only</h1><p className="mt-2 text-sm text-muted-foreground">This page is reserved for authorized Cogni administrators.</p><Button className="mt-5" onClick={() => navigate({ to: "/dashboard" })}>Return to dashboard</Button></div></div>;
  if (state === "error" || !data) return <div className="grid min-h-[70vh] place-items-center"><div className="text-center"><h1 className="font-display text-xl font-semibold">Statistics unavailable</h1><p className="mt-2 text-sm text-muted-foreground">Please try again shortly.</p></div></div>;

  return <div className="mx-auto max-w-[1600px] space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Cogni administration</div><h1 className="font-display text-2xl font-bold sm:text-3xl">Admin dashboard</h1><p className="mt-1 text-sm text-muted-foreground">A live view of students, faculties, content, and learning activity.</p></div>
      <div className="text-right text-xs text-muted-foreground"><div>Last updated</div><div className="mt-1 font-medium text-foreground">{new Date(data.generatedAt).toLocaleString()}</div></div>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((card) => <div key={card.label} className="min-w-0 rounded-lg border border-border/70 bg-card/75 p-4 shadow-brand"><div className="flex items-start justify-between gap-2"><span className="text-xs text-muted-foreground sm:text-sm">{card.label}</span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><card.icon className="h-4 w-4" /></span></div><div className="mt-2 font-display text-2xl font-bold sm:text-3xl">{typeof card.value === "number" ? card.value.toLocaleString() : card.value}</div><div className="mt-1 truncate text-[11px] text-success sm:text-xs">{card.note}</div></div>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
      <Panel title="Platform activity — last 14 days" icon={TrendingUp}>
        <ChartContainer config={activityConfig} className="h-[260px] w-full aspect-auto">
          <AreaChart data={data.activity} margin={{ left: -18, right: 8 }}><defs><linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35}/><stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} /><YAxis tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltipContent />} /><Area type="monotone" dataKey="answers" stroke="var(--color-warning)" fill="transparent" strokeWidth={2} /><Area type="monotone" dataKey="signups" stroke="var(--color-primary)" fill="url(#signupsFill)" strokeWidth={2} /></AreaChart>
        </ChartContainer>
      </Panel>
      <Panel title="Student level" icon={GraduationCap}>
        <ChartContainer config={{ students: { label: "Students" } }} className="mx-auto h-[210px] max-w-[280px] aspect-auto">
          <PieChart><Pie data={data.accountTypes} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>{data.accountTypes.map((entry, index) => <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />)}</Pie><Tooltip content={<ChartTooltipContent nameKey="name" />} /></PieChart>
        </ChartContainer>
        <div className="grid gap-2">{data.accountTypes.map((item, index) => <div key={item.name} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />{item.name}</span><span className="font-mono font-semibold">{item.value}</span></div>)}</div>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Most common faculties & programs" icon={GraduationCap} className="xl:col-span-2">
        {data.programs.length ? <ChartContainer config={programConfig} className="h-[250px] w-full aspect-auto"><BarChart data={data.programs} layout="vertical" margin={{ left: 4, right: 12 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="value" name="students" fill="var(--color-info)" radius={[0, 4, 4, 0]} /></BarChart></ChartContainer> : <p className="text-sm text-muted-foreground">No program information yet.</p>}
      </Panel>
      <Panel title="Top universities" icon={BookOpen}>
        <ol className="space-y-3">{data.universities.map((item, index) => <li key={item.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-muted font-mono text-xs text-primary">{index + 1}</span><span className="truncate text-sm">{item.name}</span><span className="font-mono text-sm font-semibold">{item.value}</span></li>)}</ol>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Recent student signups" icon={UserPlus}>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-3 font-medium">Student</th><th className="pb-3 font-medium">Faculty / program</th><th className="pb-3 font-medium">Institution</th><th className="pb-3 text-right font-medium">Joined</th></tr></thead><tbody className="divide-y divide-border/50">{data.recentStudents.map((student) => <tr key={student.id}><td className="py-3 font-medium">{student.name}</td><td className="max-w-36 truncate py-3 text-muted-foreground">{student.program}</td><td className="max-w-36 truncate py-3 text-muted-foreground">{student.university}</td><td className="py-3 text-right text-muted-foreground">{formatDistanceToNow(new Date(student.createdAt), { addSuffix: true })}</td></tr>)}</tbody></table></div>
      </Panel>
      <Panel title="Recently created decks" icon={Layers3}>
        <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-3 font-medium">Deck</th><th className="pb-3 font-medium">Created by</th><th className="pb-3 font-medium">Cards</th><th className="pb-3 text-right font-medium">Created</th></tr></thead><tbody className="divide-y divide-border/50">{data.recentDecks.map((deck) => <tr key={deck.id}><td className="py-3"><Link to="/decks/$deckId" params={{ deckId: deck.id }} className="block max-w-52 truncate font-medium hover:text-primary">{deck.title}</Link><span className="text-muted-foreground">{deck.subject}</span></td><td className="max-w-32 truncate py-3 text-muted-foreground">{deck.owner}</td><td className="py-3 font-mono">{deck.cards}</td><td className="py-3 text-right text-muted-foreground">{formatDistanceToNow(new Date(deck.createdAt), { addSuffix: true })}</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  </div>;
}