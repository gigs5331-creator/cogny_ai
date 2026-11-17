import { Fragment, useMemo } from "react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

/**
 * Renders text that may contain LaTeX math:
 *   - $$...$$ or \[...\]  → block math
 *   - $...$   or \(...\)  → inline math
 * Plain text is rendered as-is (line breaks preserved).
 */
export function MathText({ children, className }: { children?: string | null; className?: string }) {
  const parts = useMemo(() => parseMath(children ?? ""), [children]);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "block") {
          try {
            return (
              <span key={i} className="my-2 block overflow-x-auto">
                <BlockMath math={p.value} />
              </span>
            );
          } catch {
            return <code key={i}>{p.value}</code>;
          }
        }
        if (p.type === "inline") {
          try {
            return <InlineMath key={i} math={p.value} />;
          } catch {
            return <code key={i}>{p.value}</code>;
          }
        }
        return <Fragment key={i}>{p.value}</Fragment>;
      })}
    </span>
  );
}

type Part = { type: "text" | "inline" | "block"; value: string };

function parseMath(input: string): Part[] {
  if (!input) return [];
  // Normalise \[...\] -> $$...$$ and \(...\) -> $...$
  const src = input
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);

  const parts: Part[] = [];
  const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(src)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: src.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ type: "block", value: match[1].trim() });
    else if (match[2] !== undefined) parts.push({ type: "inline", value: match[2].trim() });
    last = match.index + match[0].length;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  return parts;
}
