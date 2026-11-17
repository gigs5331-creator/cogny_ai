// Client database/auth adapter: uses Supabase when configured, otherwise our built-in SQLite API backend.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const SESSION_KEY = "cogni:local-auth-session";

type LocalSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    email: string;
    user_metadata: Record<string, unknown>;
    created_at: string;
  };
};

type AuthListener = (event: string, session: LocalSession | null) => void;
const authListeners = new Set<AuthListener>();

function readStoredSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSession;
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    if (parsed.expires_at && parsed.expires_at < Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: LocalSession | null, event: string) {
  if (typeof window !== "undefined") {
    try {
      if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
  for (const listener of authListeners) {
    try {
      listener(event, session);
    } catch {
      /* ignore listener errors */
    }
  }
}

async function callLocalBackend(payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return { data: null, error: null };
  }
  const session = readStoredSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch("/api/local-backend", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return res.json();
}

function createLocalBackendClient() {
  const notAvailable = { message: "OAuth provider is not configured in this environment." };

  const notifyBroadcast = (table: string, row: unknown) => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    try {
      const bc = new BroadcastChannel(`cogni-db:${table}`);
      bc.postMessage({ event: "INSERT", new: row });
      bc.close();
    } catch {
      /* ignore */
    }
  };

  const makeBuilder = (table: string) => {
    const state: {
      action: "select" | "insert" | "update" | "delete";
      select?: string;
      returningSelect?: string;
      values?: unknown;
      filters: Array<Record<string, unknown>>;
      order: Array<{ column: string; ascending: boolean }>;
      limit?: number;
      count?: "exact";
      head?: boolean;
      single?: boolean;
      maybeSingle?: boolean;
    } = {
      action: "select",
      filters: [],
      order: [],
    };

    const exec = async () => {
      const res = await callLocalBackend({ kind: "db.query", query: { table, ...state } });
      if (state.action === "insert" && !res?.error && res?.data && table === "program_messages") {
        const rows = Array.isArray(res.data) ? res.data : [res.data];
        for (const r of rows) notifyBroadcast(table, r);
      }
      return res;
    };

    const builder: Record<string, unknown> = {
      select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
        if (state.action === "insert" || state.action === "update") {
          state.returningSelect = cols;
        } else {
          state.action = "select";
          state.select = cols;
        }
        if (opts?.count) state.count = opts.count;
        if (opts?.head) state.head = opts.head;
        return builder;
      },
      insert(values: unknown) {
        state.action = "insert";
        state.values = values;
        // Broadcast program_messages cleanly even when caller doesn't chain .select()
        if (table === "program_messages") state.returningSelect = "*";
        return builder;
      },
      update(values: unknown) {
        state.action = "update";
        state.values = values;
        return builder;
      },
      delete() {
        state.action = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ type: "eq", column, value });
        return builder;
      },
      neq(column: string, value: unknown) {
        state.filters.push({ type: "neq", column, value });
        return builder;
      },
      is(column: string, value: unknown) {
        state.filters.push({ type: "is", column, value });
        return builder;
      },
      gte(column: string, value: unknown) {
        state.filters.push({ type: "gte", column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        state.filters.push({ type: "in", column, values });
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        state.order.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      maybeSingle() {
        state.maybeSingle = true;
        return builder;
      },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        return exec().then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    auth: {
      async getSession() {
        const session = readStoredSession();
        return { data: { session }, error: null };
      },
      onAuthStateChange(cb: AuthListener) {
        authListeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authListeners.delete(cb);
              },
            },
          },
        };
      },
      async signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
        const res = await callLocalBackend({
          kind: "auth.signUp",
          email: input.email,
          password: input.password,
          options: input.options,
        });
        if (!res?.error && res?.data?.session) {
          writeStoredSession(res.data.session, "SIGNED_IN");
        }
        return res;
      },
      async signInWithPassword(input: { email: string; password: string }) {
        const res = await callLocalBackend({
          kind: "auth.signIn",
          email: input.email,
          password: input.password,
        });
        if (!res?.error && res?.data?.session) {
          writeStoredSession(res.data.session, "SIGNED_IN");
        }
        return res;
      },
      async signOut() {
        writeStoredSession(null, "SIGNED_OUT");
        return { error: null };
      },
      async setSession(tokens: { access_token?: string }) {
        if (!tokens?.access_token) return { data: { user: null, session: null }, error: notAvailable };
        return { data: { user: null, session: null }, error: notAvailable };
      },
      oauth: {
        getAuthorizationDetails: async () => ({ data: null, error: notAvailable }),
        approveAuthorization: async () => ({ data: null, error: notAvailable }),
        denyAuthorization: async () => ({ data: null, error: notAvailable }),
      },
    },
    from: (table: string) => makeBuilder(table),
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      return callLocalBackend({ kind: "db.rpc", fn, args });
    },
    channel(name: string) {
      let bc: BroadcastChannel | null = null;
      let timer: ReturnType<typeof setInterval> | null = null;
      const seenIds = new Set<string>();
      let handlerFn: ((payload: { new: Record<string, unknown> }) => void) | null = null;
      let filterProgram: string | null = null;

      if (name.startsWith("program_messages:")) {
        filterProgram = name.slice("program_messages:".length);
      }

      const ch: Record<string, unknown> = {
        on(_type: string, opts: { table?: string; filter?: string }, cb: (payload: { new: Record<string, unknown> }) => void) {
          handlerFn = cb;
          const table = opts?.table ?? "program_messages";
          if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
            bc = new BroadcastChannel(`cogni-db:${table}`);
            bc.onmessage = (ev) => {
              const row = ev.data?.new as Record<string, unknown> | undefined;
              if (!row) return;
              if (filterProgram && String(row.program ?? "") !== filterProgram) return;
              const id = String(row.id ?? "");
              if (id && seenIds.has(id)) return;
              if (id) seenIds.add(id);
              cb({ new: row });
            };
          }
          return ch;
        },
        subscribe() {
          if (typeof window !== "undefined" && filterProgram && handlerFn) {
            let lastSeen = new Date().toISOString();
            timer = setInterval(async () => {
              const res = await callLocalBackend({
                kind: "db.query",
                query: {
                  table: "program_messages",
                  action: "select",
                  select: "*",
                  filters: [
                    { type: "eq", column: "program", value: filterProgram },
                    { type: "gte", column: "created_at", value: lastSeen },
                  ],
                  order: [{ column: "created_at", ascending: true }],
                  limit: 50,
                },
              });
              const rows = Array.isArray(res?.data) ? (res.data as Record<string, unknown>[]) : [];
              for (const row of rows) {
                const id = String(row.id ?? "");
                if (id && seenIds.has(id)) continue;
                if (id) seenIds.add(id);
                if (typeof row.created_at === "string" && row.created_at > lastSeen) {
                  lastSeen = row.created_at;
                }
                handlerFn?.({ new: row });
              }
            }, 3000);
          }
          return ch;
        },
        __cleanup() {
          if (bc) { bc.close(); bc = null; }
          if (timer) { clearInterval(timer); timer = null; }
        },
      };
      return ch;
    },
    removeChannel: async (ch: { __cleanup?: () => void }) => {
      ch?.__cleanup?.();
      return "ok";
    },
  } as unknown as ReturnType<typeof createClient<Database>>;
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY : undefined);
  return Boolean(url && key);
}

function createSupabaseClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY : undefined);

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return createLocalBackendClient();
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createClient<Database>> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
