// Browser-only helpers to extract text from many document types before sending to AI.

async function loadPdfjs() {
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore - worker entry
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return out.trim();
}

// Scanned PDFs have no text layer — render each page to a JPEG so the AI can read it with vision (OCR).
export async function renderPdfPagesToImages(
  file: File,
  maxPages = 40,
): Promise<{ base64: string; mime: string }[]> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages: { base64: string; mime: string }[] = [];
  const count = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(viewport.width, 1600);
    canvas.height = Math.round((canvas.width / viewport.width) * viewport.height);
    const scaled = page.getViewport({ scale: (2 * canvas.width) / viewport.width });
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    pages.push({ base64: dataUrl.split(",")[1], mime: "image/jpeg" });
  }
  return pages;
}


export async function extractDocxText(file: File): Promise<string> {
  const mod: any = await import("mammoth/mammoth.browser.min.js");
  const mammoth = mod?.default ?? mod;
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value ?? "").trim();
}

// PowerPoint — unzip and pull <a:t> text nodes from every slide.
export async function extractPptxText(file: File): Promise<string> {
  const JSZip: any = (await import("jszip")).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });
  let out = "";
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const text = matches.map((m: string) => m.replace(/<[^>]+>/g, "")).join(" ");
    if (text.trim()) out += text + "\n\n";
  }
  return out.trim();
}

// Excel / CSV via SheetJS — works for .xlsx, .xls, .ods, .csv, .tsv.
export async function extractSpreadsheetText(file: File): Promise<string> {
  const XLSX: any = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  let out = "";
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) out += `# ${sheetName}\n${csv}\n\n`;
  }
  return out.trim();
}

// Strip RTF control codes to plain text.
export function extractRtfText(raw: string): string {
  return raw
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\\*/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

// Strip HTML tags and decode common entities.
export function extractHtmlText(raw: string): string {
  const noScript = raw.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = noScript.replace(/<[^>]+>/g, " ");
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      const fallbackMime = file.type || "image/jpeg";
      // Downscale oversized images (> 3.5 MB binary) so base64 always fits server upload limits cleanly.
      if (file.size > 3_500_000 && typeof Image !== "undefined" && typeof document !== "undefined") {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1800;
          const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({ base64: dataUrl.split(",")[1], mime: fallbackMime });
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const jpeg = canvas.toDataURL("image/jpeg", 0.85);
          resolve({ base64: jpeg.split(",")[1], mime: "image/jpeg" });
        };
        img.onerror = () => resolve({ base64: dataUrl.split(",")[1], mime: fallbackMime });
        img.src = dataUrl;
        return;
      }
      resolve({ base64: dataUrl.split(",")[1], mime: fallbackMime });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function readTextFile(file: File) {
  return await file.text();
}

// Single entry point — routes by extension/MIME, falls back to plain text.
// Returns either { text } for text-bearing docs or { imageBase64, imageMimeType } for images.
type Extracted =
  | { kind: "text"; text: string }
  | { kind: "image"; imageBase64: string; imageMimeType: string }
  | { kind: "images"; pages: { base64: string; mime: string }[] };

// Pulls embedded pictures out of Office zip files (slides/Word) so the AI can OCR them.
async function extractZipMedia(file: File, max = 30): Promise<{ base64: string; mime: string }[]> {
  try {
    const JSZip: any = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => /\/media\/.+\.(png|jpe?g|webp|gif)$/i.test(n)).slice(0, max);
    const out: { base64: string; mime: string }[] = [];
    for (const n of names) {
      const ext = n.split(".").pop()!.toLowerCase();
      out.push({ base64: await zip.files[n].async("base64"), mime: `image/${ext === "jpg" ? "jpeg" : ext}` });
    }
    return out;
  } catch { return []; }
}

// Last resort for old/binary formats (.doc, .ppt, unknown): keep readable text runs.
async function extractPrintableRuns(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoders = [new TextDecoder("utf-8", { fatal: false }), new TextDecoder("utf-16le", { fatal: false })];
  let best = "";
  for (const d of decoders) {
    const runs = d.decode(bytes).match(/[\p{L}\p{N}\p{P}\p{Zs}+=<>^$%]{6,}/gu) ?? [];
    const t = runs.filter((r) => /[\p{L}]{3,}/u.test(r)).join("\n");
    if (t.length > best.length) best = t;
  }
  return best.trim();
}

/** Never fails for a readable file: tries the specific reader, then images, then raw text. */
export async function extractFromFile(file: File): Promise<Extracted> {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  let firstError: unknown;
  try {
    const r = await extractFromFileStrict(file);
    if (r.kind !== "text" || r.text.trim().length >= 40) return r;
    // Too little text (e.g. picture-only slides) — add images for OCR.
    const media = await extractZipMedia(file);
    if (media.length) return { kind: "images", pages: media };
    if (r.text.trim()) return r;
  } catch (e) { firstError = e; }
  if (["pptx", "docx", "xlsx", "odt", "odp"].includes(ext)) {
    const media = await extractZipMedia(file);
    if (media.length) return { kind: "images", pages: media };
  }
  if (ext === "pdf" || file.type === "application/pdf") {
    try {
      const pages = await renderPdfPagesToImages(file);
      if (pages.length) return { kind: "images", pages };
    } catch { /* fall through */ }
  }
  const raw = await extractPrintableRuns(file).catch(() => "");
  if (raw.length >= 20) return { kind: "text", text: raw };
  throw firstError instanceof Error ? firstError : new Error("We couldn't find any readable text in this file. Try exporting it as PDF.");
}

async function extractFromFileStrict(file: File): Promise<
  | { kind: "text"; text: string }
  | { kind: "image"; imageBase64: string; imageMimeType: string }
  | { kind: "images"; pages: { base64: string; mime: string }[] }
> {
  const name = file.name.toLowerCase();
  const mime = file.type;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";

  // Images — pass through to the AI's vision model.
  if (mime.startsWith("image/")) {
    const { base64, mime: m } = await fileToBase64(file);
    return { kind: "image", imageBase64: base64, imageMimeType: m };
  }

  // PDF
  if (mime === "application/pdf" || ext === "pdf") {
    const t = await extractPdfText(file);
    if (t && t.length >= 20) return { kind: "text", text: t };
    // Scanned PDF — no text layer. Render pages and let the AI read them (OCR).
    const pages = await renderPdfPagesToImages(file);
    if (!pages.length) throw new Error("Couldn't read this PDF — it may be corrupted or password-protected.");
    return { kind: "images", pages };
  }


  // Word
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const t = await extractDocxText(file);
    if (!t || t.length < 5) throw new Error("Couldn't extract text from this Word document.");
    return { kind: "text", text: t };
  }
  if (ext === "doc") {
    return { kind: "text", text: await extractPrintableRuns(file) };
  }

  // PowerPoint
  if (ext === "pptx" || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    const t = await extractPptxText(file);
    if (!t || t.length < 5) throw new Error("Couldn't extract text from this PowerPoint file.");
    return { kind: "text", text: t };
  }
  if (ext === "ppt") {
    return { kind: "text", text: await extractPrintableRuns(file) };
  }

  // Spreadsheets & CSV/TSV
  if (
    ["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(ext) ||
    mime.includes("spreadsheet") ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values"
  ) {
    const t = await extractSpreadsheetText(file);
    if (!t || t.length < 3) throw new Error("Couldn't read data from this spreadsheet.");
    return { kind: "text", text: t };
  }

  // RTF
  if (ext === "rtf" || mime === "application/rtf" || mime === "text/rtf") {
    const raw = await readTextFile(file);
    return { kind: "text", text: extractRtfText(raw) };
  }

  // HTML
  if (ext === "html" || ext === "htm" || mime === "text/html") {
    const raw = await readTextFile(file);
    return { kind: "text", text: extractHtmlText(raw) };
  }

  // JSON, XML, YAML, Markdown, plain text, source code — read as text.
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/x-yaml" ||
    ["txt", "md", "markdown", "json", "xml", "yaml", "yml", "log", "csv", "tsv", "srt", "vtt"].includes(ext)
  ) {
    const t = await readTextFile(file);
    if (!t.trim()) throw new Error("This file appears to be empty.");
    return { kind: "text", text: t };
  }

  // Last-resort fallback — try reading as UTF-8 text.
  try {
    const t = await readTextFile(file);
    // Heuristic: if it's mostly printable, accept it.
    const printable = t.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, "");
    if (t.length > 0 && printable.length / t.length > 0.85 && t.trim().length >= 20) {
      return { kind: "text", text: t };
    }
  } catch {
    /* ignore */
  }

  throw new Error(`Unsupported file type${ext ? ` (.${ext})` : ""}. Try PDF, Word, PowerPoint, Excel, CSV, text, or an image.`);
}
