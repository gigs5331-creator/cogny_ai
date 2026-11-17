import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, Layers, Loader2 } from "lucide-react";

export type PipelineStageKey =
  | "ingest"
  | "ocr"
  | "index"
  | "chunk"
  | "process"
  | "dedupe"
  | "coverage"
  | "save";

export type PipelineStageState = "pending" | "running" | "done" | "skipped" | "failed";

export type PipelineProgressState = {
  stages: Record<PipelineStageKey, PipelineStageState>;
  processed: number;
  total: number;
  generatedCount: number;
  targetTotal: number | null;
  failedChunks: number[];
  message: string;
};

const NODES: {
  key: PipelineStageKey;
  code: string;
  label: string;
  detail: string;
}[] = [
  { key: "ingest", code: "01", label: "Ingest", detail: "Reading source file & decoding structure" },
  { key: "ocr", code: "02", label: "Vision OCR", detail: "Scanning raster pages & diagrams" },
  { key: "index", code: "03", label: "Knowledge Map", detail: "Isolating academic content & topics" },
  { key: "chunk", code: "04", label: "Chunking", detail: "Splitting along chapter boundaries" },
  { key: "process", code: "05", label: "Synthesis", detail: "Parallel question & distractor generation" },
  { key: "dedupe", code: "06", label: "Verify", detail: "Deduplicating & validating answers" },
  { key: "coverage", code: "07", label: "Coverage", detail: "Auditing topic distribution" },
  { key: "save", code: "08", label: "Persist", detail: "Partitioning & saving deck" },
];

const MODE_NAMES: Record<string, string> = {
  question_bank: "Question Bank",
  flashcards: "Flashcards",
  exam: "Practice Exam",
  summary: "Summaries",
  explanation: "Explanations",
  visual: "Visual Learning",
};

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StudioPipelineVisual({
  progress,
  startedAt,
  sourceName,
  resourceMode,
  difficultyFilter,
  formatCount,
  concurrencyLimit = 4,
}: {
  progress: PipelineProgressState;
  startedAt: number;
  sourceName: string;
  resourceMode: string;
  difficultyFilter: string;
  formatCount: number;
  concurrencyLimit?: number;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PipelineStageKey | null>(null);

  useEffect(() => {
    setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const activeStageKey =
    NODES.find((n) => progress.stages[n.key] === "running")?.key ??
    NODES.find((n) => progress.stages[n.key] === "failed")?.key ??
    "process";

  const inspectedNode = NODES.find((n) => n.key === (selectedNode ?? activeStageKey)) ?? NODES[0];

  const completedStages = NODES.filter(
    (n) => progress.stages[n.key] === "done" || progress.stages[n.key] === "skipped",
  ).length;
  const stageRatio = completedStages / NODES.length;

  const sectionPct =
    progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : Math.round(stageRatio * 100);

  const targetRemaining =
    progress.targetTotal !== null
      ? Math.max(0, progress.targetTotal - progress.generatedCount)
      : null;

  const targetRatio =
    progress.targetTotal && progress.targetTotal > 0
      ? Math.min(1, progress.generatedCount / progress.targetTotal)
      : progress.total > 0
        ? progress.processed / progress.total
        : stageRatio;

  const ratePerMin =
    elapsedSec >= 2 && progress.generatedCount > 0
      ? Math.round((progress.generatedCount / elapsedSec) * 60)
      : null;

  // SVG Radial ring math
  const outerR = 54;
  const outerCirc = 2 * Math.PI * outerR;
  const outerRatio = progress.total > 0 ? progress.processed / progress.total : stageRatio;
  const outerOffset = outerCirc * (1 - Math.max(0.04, Math.min(1, outerRatio)));

  const innerR = 40;
  const innerCirc = 2 * Math.PI * innerR;
  const innerOffset = innerCirc * (1 - Math.max(0.04, Math.min(1, targetRatio)));

  // Chunk Matrix computation
  const totalChunks = progress.total;
  const failedSet = new Set(progress.failedChunks);
  const inFlightWindowEnd =
    progress.stages.process === "running" && totalChunks > 0
      ? Math.min(totalChunks, progress.processed + concurrencyLimit)
      : progress.processed;

  // SVG Schematic node coordinates (880 x 176 viewBox)
  const nodeSpacing = 104;
  const startX = 76;
  const centerY = 78;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Top Blueprint Header + Schematic Pipeline */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground truncate">
                Study Studio Synthesis Pipeline
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate max-w-[220px] font-medium text-foreground">
                  {sourceName || "Study Material"}
                </span>
                <span aria-hidden="true">·</span>
                <span>{MODE_NAMES[resourceMode] ?? resourceMode}</span>
                <span aria-hidden="true">·</span>
                <span>{difficultyFilter}</span>
                {formatCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatCount} formats</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-[11px] font-medium text-muted-foreground">Elapsed</div>
              <div className="font-mono text-base font-semibold tabular-nums text-foreground">
                {formatElapsed(elapsedSec)}
              </div>
            </div>
            {ratePerMin !== null && (
              <div className="border-l border-border pl-4 text-right">
                <div className="text-[11px] font-medium text-muted-foreground">Throughput</div>
                <div className="font-mono text-base font-semibold tabular-nums text-primary">
                  {ratePerMin} <span className="text-xs font-normal text-muted-foreground">q/min</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Technical SVG Node Graph */}
        <div className="relative bg-background/60 px-3 py-4 sm:px-6">
          <svg
            viewBox="0 0 880 168"
            className="w-full h-auto select-none"
            role="img"
            aria-label="Live document processing pipeline schematic"
          >
            <defs>
              <pattern id="cogny-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                <path
                  d="M 22 0 L 0 0 0 22"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.06"
                  strokeWidth="1"
                />
              </pattern>
              <linearGradient id="cogny-trace" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#477BFF" />
                <stop offset="100%" stopColor="#54D6E8" />
              </linearGradient>
              <linearGradient id="cogny-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#477BFF" />
                <stop offset="100%" stopColor="#54D6E8" />
              </linearGradient>
            </defs>

            {/* Technical Coordinate Mesh */}
            <rect width="880" height="168" rx="10" fill="url(#cogny-grid)" className="text-foreground" />

            {/* Signal Traces Between Stage Nodes */}
            {NODES.slice(0, -1).map((node, i) => {
              const x1 = startX + i * nodeSpacing + 22;
              const x2 = startX + (i + 1) * nodeSpacing - 22;
              const nextNode = NODES[i + 1];
              const state = progress.stages[node.key];
              const nextState = progress.stages[nextNode.key];
              const isCompletedEdge = state === "done" || state === "skipped";
              const isActiveEdge =
                state === "running" || (isCompletedEdge && nextState === "running");
              const edgePath = `M ${x1} ${centerY} L ${x2} ${centerY}`;

              return (
                <g key={`edge-${node.key}`}>
                  <path
                    d={edgePath}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.16"
                    strokeWidth="2.5"
                    strokeDasharray={nextState === "skipped" ? "4 4" : undefined}
                    className="text-muted-foreground"
                  />
                  {(isCompletedEdge || isActiveEdge) && (
                    <path
                      d={edgePath}
                      fill="none"
                      stroke="url(#cogny-trace)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={nextState === "skipped" ? "4 4" : undefined}
                    />
                  )}
                  {isActiveEdge && (
                    <circle r="3.5" fill="#54D6E8">
                      <animateMotion dur="1.15s" repeatCount="indefinite" path={edgePath} />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* Stage Nodes */}
            {NODES.map((node, i) => {
              const cx = startX + i * nodeSpacing;
              const cy = centerY;
              const state = progress.stages[node.key];
              const isSelected = inspectedNode.key === node.key;

              const strokeColor =
                state === "done"
                  ? "#477BFF"
                  : state === "running"
                    ? "#54D6E8"
                    : state === "failed"
                      ? "#DC2626"
                      : "currentColor";

              return (
                <g
                  key={node.key}
                  transform={`translate(${cx}, ${cy})`}
                  onClick={() => setSelectedNode(node.key)}
                  className="cursor-pointer"
                >
                  {/* Selection halo */}
                  {isSelected && (
                    <circle
                      r="29"
                      fill="none"
                      stroke="#477BFF"
                      strokeOpacity="0.32"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Orbital active spinner ring */}
                  {state === "running" && (
                    <circle
                      r="25"
                      fill="none"
                      stroke="url(#cogny-ring)"
                      strokeWidth="2.2"
                      strokeDasharray="46 112"
                      strokeLinecap="round"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 0 0"
                        to="360 0 0"
                        dur="1.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Node Socket */}
                  <rect
                    x="-20"
                    y="-20"
                    width="40"
                    height="40"
                    rx="11"
                    className={
                      state === "done"
                        ? "fill-primary/15"
                        : state === "running"
                          ? "fill-primary/20"
                          : state === "failed"
                            ? "fill-destructive/15"
                            : "fill-card"
                    }
                    stroke={strokeColor}
                    strokeOpacity={state === "pending" || state === "skipped" ? 0.28 : 0.95}
                    strokeWidth={state === "running" || state === "done" ? 2 : 1.25}
                    strokeDasharray={state === "skipped" ? "3 3" : undefined}
                  />

                  {/* Center Icon / Stage Code */}
                  {state === "done" ? (
                    <path
                      d="M -6.5 0.5 L -2 5 L 7 -4.5"
                      fill="none"
                      stroke="#477BFF"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : state === "failed" ? (
                    <path
                      d="M -5 -5 L 5 5 M 5 -5 L -5 5"
                      fill="none"
                      stroke="#DC2626"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  ) : state === "skipped" ? (
                    <line
                      x1="-6"
                      y1="0"
                      x2="6"
                      y2="0"
                      stroke="currentColor"
                      strokeOpacity="0.45"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  ) : (
                    <text
                      x="0"
                      y="4.5"
                      textAnchor="middle"
                      className={
                        state === "running"
                          ? "fill-primary font-mono text-[12px] font-bold"
                          : "fill-muted-foreground font-mono text-[11px] font-semibold"
                      }
                    >
                      {node.code}
                    </text>
                  )}

                  {/* Label */}
                  <text
                    x="0"
                    y="38"
                    textAnchor="middle"
                    className={
                      state === "running" || isSelected
                        ? "fill-foreground font-sans text-[11px] font-semibold"
                        : state === "done"
                          ? "fill-foreground font-sans text-[11px] font-medium"
                          : "fill-muted-foreground font-sans text-[11px]"
                    }
                  >
                    {node.label}
                  </text>

                  {/* Active State Tag */}
                  <text
                    x="0"
                    y="53"
                    textAnchor="middle"
                    className={
                      state === "running"
                        ? "fill-primary font-mono text-[9px] font-semibold"
                        : state === "done"
                          ? "fill-cyan font-mono text-[9px]"
                          : "fill-muted-foreground/70 font-mono text-[9px]"
                    }
                  >
                    {state === "done"
                      ? "OK"
                      : state === "running"
                        ? "ACTIVE"
                        : state === "skipped"
                          ? "SKIP"
                          : state === "failed"
                            ? "ERR"
                            : "WAIT"}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Active Stage Readout */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <span className="font-mono font-medium text-foreground truncate">
                {progress.message || inspectedNode.detail}
              </span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground shrink-0">
              Stage {inspectedNode.code} · {inspectedNode.label}
            </span>
          </div>
        </div>
      </section>

      {/* Telemetry Split: Concentric Dial Gauge & Chunk Partition Matrix */}
      <div className="grid gap-5 md:grid-cols-12">
        {/* Left: Concentric Radial Dial & Exact Question Counter */}
        <section className="md:col-span-5 rounded-2xl border border-border bg-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Extraction Telemetry
            </h3>
            <span className="font-mono text-xs tabular-nums text-primary font-semibold">
              {sectionPct}%
            </span>
          </div>

          <div className="my-4 flex items-center gap-5">
            <div className="relative h-32 w-32 shrink-0">
              <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
                <defs>
                  <linearGradient id="cogny-dial-outer" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#477BFF" />
                    <stop offset="100%" stopColor="#54D6E8" />
                  </linearGradient>
                </defs>
                {/* Outer Track */}
                <circle
                  cx="66"
                  cy="66"
                  r={outerR}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.1"
                  strokeWidth="8"
                  className="text-muted-foreground"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={outerR}
                  fill="none"
                  stroke="url(#cogny-dial-outer)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={outerCirc}
                  strokeDashoffset={outerOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out"
                />

                {/* Inner Track */}
                <circle
                  cx="66"
                  cy="66"
                  r={innerR}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.1"
                  strokeWidth="6"
                  className="text-muted-foreground"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={innerR}
                  fill="none"
                  stroke="#54D6E8"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={innerCirc}
                  strokeDashoffset={innerOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-2xl font-bold tabular-nums text-foreground leading-none">
                  {progress.generatedCount}
                </span>
                <span className="mt-1 text-[10px] font-mono text-muted-foreground">
                  {progress.targetTotal !== null ? `of ${progress.targetTotal}` : "items"}
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground">Sections Completed</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {progress.total > 0 ? `${progress.processed} / ${progress.total}` : `${completedStages} / ${NODES.length} stages`}
                </div>
              </div>

              {progress.targetTotal !== null ? (
                <div>
                  <div className="text-[11px] text-muted-foreground">Remaining Target</div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {targetRemaining} remaining
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[11px] text-muted-foreground">Extraction Policy</div>
                  <div className="font-mono text-sm font-semibold text-foreground">
                    Max Coverage Sweep
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] text-muted-foreground">Pipeline Stages</div>
                <div className="font-mono text-xs tabular-nums text-muted-foreground">
                  {completedStages} of {NODES.length} complete
                </div>
              </div>
            </div>
          </div>

          {/* Harmonic Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#477BFF] to-[#54D6E8] transition-all duration-500"
              style={{ width: `${Math.max(4, sectionPct)}%` }}
            />
          </div>
        </section>

        {/* Right: Chunk Partition Matrix + Live Stage Checklist */}
        <section className="md:col-span-7 rounded-2xl border border-border bg-card p-5 space-y-4">
          {totalChunks > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Section Worker Matrix
                  </h3>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {concurrencyLimit}x parallel workers · {totalChunks} section{totalChunks === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                {Array.from({ length: Math.min(totalChunks, 40) }, (_, idx) => {
                  const chunkNo = idx + 1;
                  const isFailed = failedSet.has(chunkNo);
                  const isDone = idx < progress.processed && !isFailed;
                  const isActive =
                    progress.stages.process === "running" &&
                    idx >= progress.processed &&
                    idx < inFlightWindowEnd;

                  return (
                    <div
                      key={chunkNo}
                      title={`Section ${chunkNo}: ${
                        isFailed ? "Failed" : isDone ? "Completed" : isActive ? "Synthesizing" : "Queued"
                      }`}
                      className={`relative flex h-8 items-center justify-center rounded-md border font-mono text-[11px] tabular-nums transition-colors ${
                        isFailed
                          ? "border-destructive/60 bg-destructive/15 text-destructive font-semibold"
                          : isDone
                            ? "border-[#477BFF]/60 bg-[#477BFF]/15 text-primary font-semibold"
                            : isActive
                              ? "border-[#54D6E8] bg-[#54D6E8]/15 text-foreground font-semibold"
                              : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-md ring-1 ring-[#54D6E8]/60 animate-pulse"
                        />
                      )}
                      {String(chunkNo).padStart(2, "0")}
                    </div>
                  );
                })}
                {totalChunks > 40 && (
                  <div className="col-span-2 flex h-8 items-center justify-center rounded-md border border-border bg-background font-mono text-[11px] text-muted-foreground tabular-nums">
                    +{totalChunks - 40} more
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="font-display text-sm font-semibold text-foreground mb-2.5">
              Execution Sequence
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {NODES.map((node) => {
                const state = progress.stages[node.key];
                return (
                  <div
                    key={node.key}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                      state === "running"
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border/70 bg-background/60 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {state === "done" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      {state === "running" && (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#54D6E8]" />
                      )}
                      {state === "pending" && (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
                      )}
                      {state === "skipped" && (
                        <span className="w-3.5 shrink-0 text-center font-mono text-[10px]">—</span>
                      )}
                      {state === "failed" && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span
                        className={`truncate ${
                          state === "running" || state === "done"
                            ? "font-medium text-foreground"
                            : ""
                        }`}
                      >
                        {node.code}. {node.label}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] shrink-0">
                      {state === "done"
                        ? "Done"
                        : state === "running"
                          ? "Running"
                          : state === "skipped"
                            ? "Bypassed"
                            : state === "failed"
                              ? "Failed"
                              : "Queued"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
