import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import {
  executeLocalDbQuery,
  executeLocalRpc,
  getLocalUserById,
  type LocalDbQuery,
} from '@/lib/local-db.server';

function createLocalAdminClient() {
  const makeBuilder = (table: string) => {
    const state: LocalDbQuery = {
      table,
      action: "select",
      filters: [],
      order: [],
    };
    const builder: Record<string, unknown> = {
      select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
        if (state.action === "insert" || state.action === "update") state.returningSelect = cols;
        else { state.action = "select"; state.select = cols; }
        if (opts?.count) state.count = opts.count;
        if (opts?.head) state.head = opts.head;
        return builder;
      },
      insert(values: unknown) { state.action = "insert"; state.values = values as LocalDbQuery["values"]; return builder; },
      update(values: unknown) { state.action = "update"; state.values = values as LocalDbQuery["values"]; return builder; },
      delete() { state.action = "delete"; return builder; },
      eq(column: string, value: unknown) { state.filters!.push({ type: "eq", column, value }); return builder; },
      neq(column: string, value: unknown) { state.filters!.push({ type: "neq", column, value }); return builder; },
      is(column: string, value: unknown) { state.filters!.push({ type: "is", column, value }); return builder; },
      gte(column: string, value: unknown) { state.filters!.push({ type: "gte", column, value }); return builder; },
      in(column: string, values: unknown[]) { state.filters!.push({ type: "in", column, values }); return builder; },
      order(column: string, opts?: { ascending?: boolean }) { state.order!.push({ column, ascending: opts?.ascending ?? true }); return builder; },
      limit(n: number) { state.limit = n; return builder; },
      single() { state.single = true; return builder; },
      maybeSingle() { state.maybeSingle = true; return builder; },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        return Promise.resolve(executeLocalDbQuery(state, { userId: null, isAdminCall: true })).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    from: (table: string) => makeBuilder(table),
    rpc: async (fn: string, args?: Record<string, unknown>) => executeLocalRpc(fn, args, { userId: null }),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const user = getLocalUserById(id);
          return { data: { user }, error: null };
        },
      },
    },
  } as unknown as ReturnType<typeof createClient<Database>>;
}

function createSupabaseAdminClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return createLocalAdminClient();
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
