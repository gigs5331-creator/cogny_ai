import { useState } from "react";
import { Copy, ExternalLink, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CLAUDE_QUIZ_PROMPT, parseQuizImport } from "@/lib/quiz-import";

export function ClaudeQuizImport({ onImport }: { onImport: (quiz: ReturnType<typeof parseQuizImport>) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  function importQuiz(text: string) {
    try { const quiz = parseQuizImport(text); setError(""); onImport(quiz); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read this quiz."); }
  }
  return <section className="space-y-5 border-t border-border pt-6">
    <div><h2 className="font-display text-xl font-semibold">Import from Claude</h2>
      <p className="mt-1 text-sm text-muted-foreground">No AI API fees for importing. Claude account and upload limits still apply.</p></div>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
      <li>Copy the prompt below.</li><li>Open Claude and attach your document with the prompt.</li><li>Paste the complete JSON response here, or upload its JSON file.</li>
    </ol>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(CLAUDE_QUIZ_PROMPT); toast.success("Quiz prompt copied."); }
        catch { toast.error("Couldn't copy. Select and copy the prompt below."); }
      }}><Copy />Copy quiz prompt</Button>
      <Button variant="outline" asChild><a href="https://claude.ai" target="_blank" rel="noopener noreferrer"><ExternalLink />Open Claude</a></Button>
    </div>
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Quiz prompt</summary><pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{CLAUDE_QUIZ_PROMPT}</pre></details>
    <div><Label htmlFor="claude-json">Claude quiz JSON</Label><Textarea id="claude-json" className="mt-2 font-mono text-sm" rows={8} value={value} onChange={e => { setValue(e.target.value); setError(""); }} placeholder={'{"title":"My quiz","cards":[…]}'} /></div>
    <div><Label htmlFor="claude-file" className="mb-2 flex items-center gap-2"><FileUp className="h-4 w-4" />Or upload a JSON file</Label>
      <InputFile onRead={text => { setValue(text); importQuiz(text); }} onError={setError} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button onClick={() => importQuiz(value)} disabled={!value.trim()} className="w-full"><FileUp />Review imported quiz</Button>
  </section>;
}

function InputFile({ onRead, onError }: { onRead: (text: string) => void; onError: (text: string) => void }) {
  return <input id="claude-file" type="file" accept=".json,application/json" className="block w-full min-w-0 text-sm" onChange={async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { onRead(await file.text()); } catch { onError("Could not read this file. Try pasting the JSON instead."); }
  }} />;
}