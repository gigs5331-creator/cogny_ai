import { useEffect, useState } from "react";
import { Download, X, Upload, Brain, Zap, Trophy, WifiOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function InstallBanner() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone;
    if (standalone || localStorage.getItem("cogni:install-dismissed")) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIos(true);
      setHidden(false);
    }
    const onInstalled = () => setHidden(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    localStorage.setItem("cogni:install-dismissed", "1");
    setHidden(true);
  };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
    setHidden(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-16 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-xl lg:bottom-5">
      <div className="flex items-start gap-3">
        <img
          src="/assets/aistudio/cogny_logo_b4165c26.png"
          alt="COGNY"
          className="h-10 w-10 rounded-lg object-cover border border-border"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-foreground">Install COGNY</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ios
              ? "Tap Share in Safari, then “Add to Home Screen” for offline study."
              : "Install COGNY as an app for instant offline access."}
          </p>
          {!ios && (
            <Button size="sm" className="mt-2.5 h-8 text-xs" onClick={install}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Install app
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const steps = [
  {
    icon: Upload,
    title: "1. Organise in My Library",
    body: "Upload PDFs, Word docs, slides, spreadsheets, or handwritten notes. Large textbooks split cleanly on chapter boundaries.",
  },
  {
    icon: Brain,
    title: "2. Create in AI Study Studio",
    body: "Generate exact-count Question Banks, Flashcards, Practice Exams, Summaries, Explanations, or Visual SVG Diagrams.",
  },
  {
    icon: Zap,
    title: "3. Practise & Master",
    body: "Switch between Multiple Choice, Open Quiz, Timed Practice Exams, and Flip Flashcards with LaTeX solutions.",
  },
  {
    icon: Trophy,
    title: "4. Track Real Progress",
    body: "Inspect accuracy, weak topics, study streaks, and subject mastery in Progress & Analytics.",
  },
  {
    icon: WifiOff,
    title: "5. Study Offline Anytime",
    body: "Download any deck or library document for offline access — completed answers sync automatically when back online.",
  },
];

function WelcomeGuide() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const key = user ? `cogni:guide-seen:${user.id}` : "";

  useEffect(() => {
    if (!user) return;
    if (!localStorage.getItem(key)) setOpen(true);
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("cogni:open-guide", reopen);
    return () => window.removeEventListener("cogni:open-guide", reopen);
  }, [user, key]);

  const close = () => {
    if (key) localStorage.setItem(key, "1");
    setOpen(false);
  };
  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Welcome to COGNY</DialogTitle>
          <DialogDescription>Learn Smarter. Understand Deeper.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <s.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-base font-semibold text-foreground">{s.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
        </div>
        <div className="flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={close}>
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? close() : setStep(step + 1))}>
              {last ? "Start studying" : "Next"} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppOnboarding() {
  return (
    <>
      <InstallBanner />
      <WelcomeGuide />
    </>
  );
}
