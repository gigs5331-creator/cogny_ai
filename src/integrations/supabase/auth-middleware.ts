import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import {
  executeLocalDbQuery,
  executeLocalRpc,
  verifyLocalToken,
  type LocalDbQuery,
} from '@/lib/local-db.server';

function createLocalServerClient(userId: string) {
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
        return Promise.resolve(executeLocalDbQuery(state, { userId })).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    from: (table: string) => makeBuilder(table),
    rpc: async (fn: string, args?: Record<string, unknown>) => executeLocalRpc(fn, args, { userId }),
  } as unknown as ReturnType<typeof createClient<Database>>;
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Unauthorized: Please sign in first.');
    }
    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    let supabase: ReturnType<typeof createClient<Database>>;
    let userId: string;
    let claims: Record<string, unknown> & { sub: string; email?: string };

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const verified = verifyLocalToken(token);
      if (!verified) {
        throw new Error('Unauthorized: Invalid or expired session. Please sign in again.');
      }
      supabase = createLocalServerClient(verified.userId);
      userId = verified.userId;
      claims = { sub: verified.userId, email: verified.email };
    } else {
      const client = createClient<Database>(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        },
      );

      const { data, error } = await client.auth.getClaims(token);
      if (error || !data?.claims?.sub) {
        throw new Error('Unauthorized: Invalid token');
      }
      supabase = client;
      userId = data.claims.sub;
      claims = data.claims as Record<string, unknown> & { sub: string; email?: string };
    }

    return next({
      context: {
        supabase,
        userId,
        claims,
      },
    });
  },
);
