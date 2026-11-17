/**
 * Renders an AI-generated inline SVG diagram safely.
 * - Strips <script>, event handlers and external references.
 * - Centres the SVG and lets it scale responsively.
 */
export function Diagram({ svg, caption }: { svg?: string | null; caption?: string | null }) {
  if (!svg || typeof svg !== "string") return null;
  const cleaned = sanitiseSvg(svg);
  if (!cleaned) return null;
  return (
    <figure className="my-4 rounded-2xl border border-border bg-background/40 p-4">
      <div
        className="mx-auto flex w-full max-w-md items-center justify-center overflow-x-auto [&>svg]:h-auto [&>svg]:max-h-72 [&>svg]:w-full"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground italic">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

function sanitiseSvg(input: string): string {
  let s = input.trim();
  const fence = s.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const m = s.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return "";
  s = m[0];
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  s = s.replace(/\son\w+="[^"]*"/gi, "");
  s = s.replace(/\son\w+='[^']*'/gi, "");
  s = s.replace(/href\s*=\s*"(?:javascript:|data:text\/html)[^"]*"/gi, "");
  if (!/viewBox=/.test(s)) {
    s = s.replace(/<svg\b/i, '<svg viewBox="0 0 400 300"');
  }
  s = s.replace(/<svg\b([^>]*)\swidth="[^"]*"/i, "<svg$1");
  s = s.replace(/<svg\b([^>]*)\sheight="[^"]*"/i, "<svg$1");
  return s;
}
