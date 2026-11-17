import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  Home,
  Library,
  Sparkles,
  FolderKanban,
  BarChart3,
  Settings,
  LogOut,
  MessageCircle,
  ShieldCheck,
  WifiOff,
  Plus,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyAdminStatus } from "@/lib/admin.functions";

const primaryNav = [
  { label: "Home", to: "/dashboard", icon: Home },
  { label: "My Library", to: "/library", icon: Library },
  { label: "Study Studio", to: "/create", icon: Sparkles },
  { label: "My Subjects", to: "/subjects", icon: FolderKanban },
  { label: "Progress", to: "/progress", icon: BarChart3 },
] as const;

const secondaryNav = [
  { label: "Offline Study", to: "/offline", icon: WifiOff },
  { label: "Program Chat", to: "/chat", icon: MessageCircle },
  { label: "Settings", to: "/profile", icon: Settings },
] as const;

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const checkAdmin = useServerFn(getMyAdminStatus);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      return () => {
        active = false;
      };
    }
    checkAdmin()
      .then((result) => {
        if (active) setIsAdmin(result.isAdmin);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [checkAdmin, user]);

  if (user) {
    const adminItems = isAdmin
      ? [{ label: "Admin", to: "/admin", icon: ShieldCheck } as const]
      : [];
    const workspaceNav = [...secondaryNav, ...adminItems];

    return (
      <>
        {/* Desktop Sidebar */}
        <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:sticky lg:top-0 lg:flex">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
              <img
                src="/assets/aistudio/cogny_logo_b4165c26.png"
                alt="COGNY"
                className="h-9 w-9 shrink-0 rounded-lg object-cover border border-border"
              />
              <div className="min-w-0">
                <div className="font-display text-base font-bold tracking-tight text-foreground">
                  COGNY
                </div>
                <div className="truncate text-[11px] font-medium text-muted-foreground">
                  Learn Smarter
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={theme === "light" ? "Dark mode" : "Light mode"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>

          <div className="px-3 pt-4 pb-2">
            <Button asChild className="w-full justify-center gap-2 whitespace-nowrap shadow-brand">
              <Link to="/create">
                <Plus className="h-4 w-4 shrink-0" />
                <span>New Study Session</span>
              </Link>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
            <div>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspace
              </div>
              <nav className="space-y-0.5">
                {primaryNav.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                        active
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tools & Account
              </div>
              <nav className="space-y-0.5">
                {workspaceNav.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                        active
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="border-t border-border p-3">
            <div className="mb-2 min-w-0 px-2.5">
              <div className="truncate text-sm font-semibold text-foreground">
                {user.user_metadata?.full_name ?? "Student"}
              </div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground whitespace-nowrap"
              onClick={async () => {
                await signOut();
                nav({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign out</span>
            </Button>
          </div>
        </aside>

        {/* Mobile Top Bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
              <img
                src="/assets/aistudio/cogny_logo_b4165c26.png"
                alt="COGNY"
                className="h-8 w-8 shrink-0 rounded-lg object-cover border border-border"
              />
              <span className="font-display text-base font-bold tracking-tight text-foreground">
                COGNY
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground"
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
              <Button asChild variant="ghost" size="icon" title="Offline study">
                <Link to="/offline">
                  <WifiOff className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" title="Settings">
                <Link to="/profile">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="ghost" size="icon" title="Admin">
                  <Link to="/admin">
                    <ShieldCheck className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Fixed Bottom Navigation */}
        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
        >
          <div className="grid h-14 grid-cols-5 items-center px-1">
            {primaryNav.map((item) => {
              const active = pathname === item.to;
              const shortLabel =
                item.label === "My Library"
                  ? "Library"
                  : item.label === "Study Studio"
                    ? "Studio"
                    : item.label === "My Subjects"
                      ? "Subjects"
                      : item.label;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium transition ${
                    active ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate max-w-full px-1">{shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </>
    );
  }

  /* Public 3-zone header: Brand Lockup — Inline Nav — Primary CTA */
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <img
            src="/assets/aistudio/cogny_logo_b4165c26.png"
            alt="COGNY"
            className="h-8 w-8 rounded-lg object-cover border border-border"
          />
          <span className="font-display text-lg font-bold tracking-tight text-foreground">
            COGNY
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#platform" className="whitespace-nowrap transition hover:text-foreground">
            Platform
          </a>
          <a href="#studio" className="whitespace-nowrap transition hover:text-foreground">
            Study Studio
          </a>
          <a href="#subjects" className="whitespace-nowrap transition hover:text-foreground">
            Subjects
          </a>
          <Link to="/high-school" className="whitespace-nowrap transition hover:text-foreground">
            High School
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <Button asChild size="sm" className="whitespace-nowrap">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
