import { createFileRoute } from "@tanstack/react-router";
import {
  executeLocalDbQuery,
  executeLocalRpc,
  signInLocal,
  signUpLocal,
  verifyLocalToken,
  type LocalDbQuery,
} from "@/lib/local-db.server";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getBearerUser(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;
  return verifyLocalToken(token);
}

export const Route = createFileRoute("/api/local-backend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const kind = body?.kind;

          if (kind === "auth.signUp") {
            const res = signUpLocal({
              email: String(body.email ?? ""),
              password: String(body.password ?? ""),
              options: (body.options as { data?: Record<string, unknown> }) ?? undefined,
            });
            return jsonResponse(res, res.error ? 400 : 200);
          }

          if (kind === "auth.signIn") {
            const res = signInLocal({
              email: String(body.email ?? ""),
              password: String(body.password ?? ""),
            });
            return jsonResponse(res, res.error ? 400 : 200);
          }

          if (kind === "auth.verify") {
            const verified = getBearerUser(request);
            return jsonResponse({ user: verified?.user ?? null });
          }

          if (kind === "db.query") {
            const verified = getBearerUser(request);
            const query = body.query as LocalDbQuery;
            const res = executeLocalDbQuery(query, { userId: verified?.userId ?? null });
            return jsonResponse(res, 200);
          }

          if (kind === "db.rpc") {
            const verified = getBearerUser(request);
            const res = executeLocalRpc(
              String(body.fn ?? ""),
              (body.args as Record<string, unknown>) ?? undefined,
              { userId: verified?.userId ?? null },
            );
            return jsonResponse(res, 200);
          }

          return jsonResponse({ error: { message: "Unsupported backend action" } }, 400);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResponse({ data: null, error: { message } }, 500);
        }
      },
    },
  },
});
