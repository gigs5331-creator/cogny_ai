import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ADMIN_EMAIL = "gigs5331@gmail.com";

export type LocalUser = {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    university?: string;
    program?: string;
    account_type?: "university" | "high_school";
    student_number?: string;
  };
  created_at: string;
};

export type LocalSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: LocalUser;
};

type FilterOp =
  | { type: "eq"; column: string; value: unknown }
  | { type: "neq"; column: string; value: unknown }
  | { type: "is"; column: string; value: unknown }
  | { type: "gte"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] };

export type LocalDbQuery = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  select?: string;
  values?: Record<string, unknown> | Record<string, unknown>[];
  filters?: FilterOp[];
  order?: { column: string; ascending: boolean }[];
  limit?: number;
  count?: "exact";
  head?: boolean;
  single?: boolean;
  maybeSingle?: boolean;
  returningSelect?: string;
};

const DATA_DIR = path.resolve(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "cogni.db");
const SECRET_PATH = path.join(DATA_DIR, ".auth-secret");

let _db: DatabaseSync | null = null;
let _secret: string | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getAuthSecret(): string {
  if (process.env.SESSION_SECRET?.trim()) return process.env.SESSION_SECRET.trim();
  if (_secret) return _secret;
  ensureDataDir();
  if (fs.existsSync(SECRET_PATH)) {
    _secret = fs.readFileSync(SECRET_PATH, "utf8").trim();
    if (_secret) return _secret;
  }
  _secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SECRET_PATH, _secret, { mode: 0o600 });
  return _secret;
}

export function getLocalDb(): DatabaseSync {
  if (_db) return _db;
  ensureDataDir();
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      user_metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      display_name TEXT,
      university TEXT,
      program TEXT,
      year_part TEXT,
      subjects TEXT NOT NULL DEFAULT '[]',
      student_number TEXT,
      account_type TEXT NOT NULL DEFAULT 'university',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, role)
    );

    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT,
      description TEXT,
      source TEXT,
      course_name TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      shared_with_program INTEGER NOT NULL DEFAULT 0,
      last_studied_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT,
      topic TEXT,
      difficulty TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'new',
      position INTEGER NOT NULL DEFAULT 0,
      question_type TEXT NOT NULL DEFAULT 'short_answer',
      options TEXT,
      distractors TEXT,
      diagram TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'quiz',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS program_messages (
      id TEXT PRIMARY KEY,
      program TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS flashcards_deck_idx ON flashcards(deck_id);
    CREATE INDEX IF NOT EXISTS decks_user_idx ON decks(user_id);
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON study_sessions(user_id);
    CREATE INDEX IF NOT EXISTS messages_program_idx ON program_messages(program, created_at);
  `);
  _db = db;
  return db;
}

const VALID_TABLES = new Set([
  "profiles",
  "user_roles",
  "decks",
  "flashcards",
  "study_sessions",
  "program_messages",
]);

const ALLOWED_COLUMNS: Record<string, Set<string>> = {
  profiles: new Set([
    "id",
    "display_name",
    "university",
    "program",
    "year_part",
    "subjects",
    "student_number",
    "account_type",
    "created_at",
    "updated_at",
  ]),
  user_roles: new Set(["id", "user_id", "role", "created_at"]),
  decks: new Set([
    "id",
    "user_id",
    "title",
    "subject",
    "description",
    "source",
    "course_name",
    "is_public",
    "shared_with_program",
    "last_studied_at",
    "archived_at",
    "created_at",
    "updated_at",
  ]),
  flashcards: new Set([
    "id",
    "deck_id",
    "user_id",
    "question",
    "answer",
    "explanation",
    "topic",
    "difficulty",
    "status",
    "position",
    "question_type",
    "options",
    "distractors",
    "diagram",
    "created_at",
    "updated_at",
  ]),
  study_sessions: new Set(["id", "user_id", "deck_id", "mode", "score", "total", "completed_at"]),
  program_messages: new Set(["id", "program", "user_id", "display_name", "body", "created_at"]),
};

function assertCol(table: string, col: string): string {
  const allowed = ALLOWED_COLUMNS[table];
  if (!allowed || !allowed.has(col)) {
    throw new Error(`Invalid column "${col}" on table "${table}"`);
  }
  return col;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signToken(userId: string, email: string): { token: string; expiresAt: number } {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const payload = base64UrlEncode(JSON.stringify({ sub: userId, email, exp: expiresAt }));
  const signature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");
  return { token: `${header}.${payload}.${signature}`, expiresAt };
}

export function verifyLocalToken(token: string): { userId: string; email: string; user: LocalUser } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", getAuthSecret())
      .update(`${header}.${payload}`)
      .digest();
    const actualSig = Buffer.from(signature, "base64url");
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(payload)) as { sub?: string; email?: string; exp?: number };
    if (!decoded.sub || !decoded.email) return null;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;

    const db = getLocalDb();
    const row = db
      .prepare("SELECT id, email, user_metadata, created_at FROM auth_users WHERE id = ?")
      .get(decoded.sub) as { id: string; email: string; user_metadata: string; created_at: string } | undefined;
    if (!row) return null;

    let meta: LocalUser["user_metadata"] = {};
    try {
      meta = JSON.parse(row.user_metadata || "{}");
    } catch {
      meta = {};
    }
    return {
      userId: row.id,
      email: row.email,
      user: {
        id: row.id,
        email: row.email,
        user_metadata: meta,
        created_at: row.created_at,
      },
    };
  } catch {
    return null;
  }
}

function buildSession(user: LocalUser): LocalSession {
  const { token, expiresAt } = signToken(user.id, user.email);
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    expires_at: expiresAt,
    user,
  };
}

function ensureAdminBootstrap(db: DatabaseSync, userId: string, email: string) {
  if (email.trim().toLowerCase() !== ADMIN_EMAIL) return;
  const existing = db
    .prepare("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin'")
    .get(userId);
  if (!existing) {
    db.prepare("INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)").run(
      crypto.randomUUID(),
      userId,
      new Date().toISOString(),
    );
  }
}

export function signUpLocal(input: {
  email: string;
  password: string;
  options?: { data?: Record<string, unknown> };
}): { data: { user: LocalUser | null; session: LocalSession | null }; error: { message: string } | null } {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { data: { user: null, session: null }, error: { message: "Please enter a valid email address." } };
  }
  if (!input.password || input.password.length < 6) {
    return { data: { user: null, session: null }, error: { message: "Password must be at least 6 characters." } };
  }

  const db = getLocalDb();
  const existing = db.prepare("SELECT id FROM auth_users WHERE email = ?").get(email) as { id: string } | undefined;
  if (existing) {
    return {
      data: { user: null, session: null },
      error: { message: "User already registered. Please sign in instead." },
    };
  }

  const metaInput = (input.options?.data ?? {}) as Record<string, unknown>;
  const fullName = typeof metaInput.full_name === "string" && metaInput.full_name.trim()
    ? metaInput.full_name.trim()
    : email.split("@")[0];
  const university = typeof metaInput.university === "string" ? metaInput.university.trim() || null : null;
  const program = typeof metaInput.program === "string" ? metaInput.program.trim() || null : null;
  const studentNumber = typeof metaInput.student_number === "string" ? metaInput.student_number.trim() || null : null;
  const accountType = metaInput.account_type === "high_school" ? "high_school" : "university";

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const userMetadata: LocalUser["user_metadata"] = {
    full_name: fullName,
    ...(university ? { university } : {}),
    ...(program ? { program } : {}),
    account_type: accountType,
    ...(studentNumber ? { student_number: studentNumber } : {}),
  };

  db.prepare("INSERT INTO auth_users (id, email, password_hash, user_metadata, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    email,
    hashPassword(input.password),
    JSON.stringify(userMetadata),
    now,
  );

  db.prepare(
    `INSERT INTO profiles (id, display_name, university, program, subjects, student_number, account_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?)`,
  ).run(id, fullName, university, program, studentNumber, accountType, now, now);

  ensureAdminBootstrap(db, id, email);

  const user: LocalUser = { id, email, user_metadata: userMetadata, created_at: now };
  return { data: { user, session: buildSession(user) }, error: null };
}

export function signInLocal(input: {
  email: string;
  password: string;
}): { data: { user: LocalUser | null; session: LocalSession | null }; error: { message: string } | null } {
  const email = input.email.trim().toLowerCase();
  const db = getLocalDb();
  const row = db
    .prepare("SELECT id, email, password_hash, user_metadata, created_at FROM auth_users WHERE email = ?")
    .get(email) as
    | { id: string; email: string; password_hash: string; user_metadata: string; created_at: string }
    | undefined;

  if (!row || !verifyPassword(input.password, row.password_hash)) {
    return {
      data: { user: null, session: null },
      error: { message: "Invalid email or password." },
    };
  }

  ensureAdminBootstrap(db, row.id, row.email);

  let meta: LocalUser["user_metadata"] = {};
  try {
    meta = JSON.parse(row.user_metadata || "{}");
  } catch {
    meta = {};
  }
  const prof = db
    .prepare("SELECT display_name, university, program, account_type FROM profiles WHERE id = ?")
    .get(row.id) as
    | { display_name: string | null; university: string | null; program: string | null; account_type: string }
    | undefined;
  if (prof?.display_name) meta.full_name = prof.display_name;
  if (prof?.university) meta.university = prof.university;
  if (prof?.program) meta.program = prof.program;

  const user: LocalUser = {
    id: row.id,
    email: row.email,
    user_metadata: meta,
    created_at: row.created_at,
  };
  return { data: { user, session: buildSession(user) }, error: null };
}

export function getLocalUserById(userId: string): { id: string; email: string } | null {
  const db = getLocalDb();
  const row = db.prepare("SELECT id, email FROM auth_users WHERE id = ?").get(userId) as
    | { id: string; email: string }
    | undefined;
  return row ?? null;
}

function hydrateRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  if (table === "decks") {
    if ("is_public" in out) out.is_public = Boolean(out.is_public);
    if ("shared_with_program" in out) out.shared_with_program = Boolean(out.shared_with_program);
  } else if (table === "flashcards") {
    for (const jsonCol of ["options", "distractors"]) {
      if (typeof out[jsonCol] === "string") {
        try {
          out[jsonCol] = JSON.parse(out[jsonCol] as string);
        } catch {
          out[jsonCol] = null;
        }
      }
    }
  } else if (table === "profiles") {
    if (typeof out.subjects === "string") {
      try {
        out.subjects = JSON.parse(out.subjects);
      } catch {
        out.subjects = [];
      }
    }
  }
  return out;
}

function serializeValue(table: string, col: string, val: unknown): string | number | null {
  if (val === undefined || val === null) return null;
  if (table === "decks" && (col === "is_public" || col === "shared_with_program")) {
    return val ? 1 : 0;
  }
  if (table === "flashcards" && (col === "options" || col === "distractors")) {
    return typeof val === "string" ? val : JSON.stringify(val);
  }
  if (table === "profiles" && col === "subjects") {
    return typeof val === "string" ? val : JSON.stringify(Array.isArray(val) ? val : []);
  }
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function buildWhereClause(
  table: string,
  filters: FilterOp[] | undefined,
  params: (string | number | null)[],
  tableAlias?: string,
): string[] {
  const clauses: string[] = [];
  const prefix = tableAlias ? `${tableAlias}.` : "";
  for (const f of filters ?? []) {
    const col = assertCol(table, f.column);
    if (f.type === "eq") {
      if (f.value === null) {
        clauses.push(`${prefix}${col} IS NULL`);
      } else {
        clauses.push(`${prefix}${col} = ?`);
        params.push(serializeValue(table, col, f.value));
      }
    } else if (f.type === "neq") {
      if (f.value === null) {
        clauses.push(`${prefix}${col} IS NOT NULL`);
      } else {
        clauses.push(`${prefix}${col} != ?`);
        params.push(serializeValue(table, col, f.value));
      }
    } else if (f.type === "is") {
      if (f.value === null) clauses.push(`${prefix}${col} IS NULL`);
      else {
        clauses.push(`${prefix}${col} IS ?`);
        params.push(serializeValue(table, col, f.value));
      }
    } else if (f.type === "gte") {
      clauses.push(`${prefix}${col} >= ?`);
      params.push(serializeValue(table, col, f.value));
    } else if (f.type === "in") {
      if (f.values.length === 0) {
        clauses.push("1 = 0");
      } else {
        const placeholders = f.values.map(() => "?").join(", ");
        clauses.push(`${prefix}${col} IN (${placeholders})`);
        for (const v of f.values) params.push(serializeValue(table, col, v));
      }
    }
  }
  return clauses;
}

function userProgram(db: DatabaseSync, userId: string | null): string | null {
  if (!userId) return null;
  const row = db.prepare("SELECT program FROM profiles WHERE id = ?").get(userId) as
    | { program: string | null }
    | undefined;
  return row?.program?.trim() || null;
}

function accessClauseForSelect(
  db: DatabaseSync,
  table: string,
  userId: string | null,
  params: (string | number | null)[],
  alias = "t",
): string | null {
  if (table === "profiles") {
    return null;
  }
  if (table === "user_roles") {
    if (!userId) return "1 = 0";
    params.push(userId);
    return `${alias}.user_id = ?`;
  }
  if (table === "decks") {
    const prog = userProgram(db, userId);
    if (!userId) {
      return `(${alias}.is_public = 1 OR ${alias}.shared_with_program = 1)`;
    }
    if (prog) {
      params.push(userId, prog);
      return `(${alias}.user_id = ? OR ${alias}.is_public = 1 OR (${alias}.shared_with_program = 1 AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ${alias}.user_id AND LOWER(TRIM(COALESCE(p.program, ''))) = LOWER(TRIM(?)))))`;
    }
    params.push(userId);
    return `(${alias}.user_id = ? OR ${alias}.is_public = 1)`;
  }
  if (table === "flashcards") {
    const prog = userProgram(db, userId);
    if (!userId) {
      return `EXISTS (SELECT 1 FROM decks d WHERE d.id = ${alias}.deck_id AND (d.is_public = 1 OR d.shared_with_program = 1))`;
    }
    if (prog) {
      params.push(userId, prog);
      return `(${alias}.user_id = ? OR EXISTS (SELECT 1 FROM decks d LEFT JOIN profiles p ON p.id = d.user_id WHERE d.id = ${alias}.deck_id AND (d.is_public = 1 OR (d.shared_with_program = 1 AND LOWER(TRIM(COALESCE(p.program, ''))) = LOWER(TRIM(?))))))`;
    }
    params.push(userId);
    return `(${alias}.user_id = ? OR EXISTS (SELECT 1 FROM decks d WHERE d.id = ${alias}.deck_id AND d.is_public = 1))`;
  }
  if (table === "study_sessions") {
    if (!userId) return "1 = 0";
    params.push(userId);
    return `${alias}.user_id = ?`;
  }
  if (table === "program_messages") {
    if (!userId) return "1 = 0";
    const prog = userProgram(db, userId);
    if (!prog) return "1 = 0";
    params.push(prog);
    return `LOWER(TRIM(${alias}.program)) = LOWER(TRIM(?))`;
  }
  return "1 = 0";
}

function parseSelectColumns(table: string, selectStr?: string): { cols: string[]; includeFlashcardsCount: boolean } {
  const raw = (selectStr ?? "*").trim();
  if (!raw || raw === "*") {
    return { cols: Array.from(ALLOWED_COLUMNS[table]), includeFlashcardsCount: false };
  }
  let includeFlashcardsCount = false;
  const cols: string[] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part === "*") {
      return { cols: Array.from(ALLOWED_COLUMNS[table]), includeFlashcardsCount };
    }
    if (part === "flashcards(count)" && table === "decks") {
      includeFlashcardsCount = true;
      continue;
    }
    cols.push(assertCol(table, part));
  }
  return { cols: cols.length ? cols : Array.from(ALLOWED_COLUMNS[table]), includeFlashcardsCount };
}

export function executeLocalDbQuery(
  query: LocalDbQuery,
  ctx: { userId: string | null; isAdminCall?: boolean },
): { data: unknown; error: { message: string; code?: string } | null; count?: number | null } {
  const { table, action } = query;
  if (!VALID_TABLES.has(table)) {
    return { data: null, error: { message: `Unknown table: ${table}` } };
  }
  const db = getLocalDb();
  const isAdmin = Boolean(ctx.isAdminCall);

  try {
    if (action === "select") {
      const { cols, includeFlashcardsCount } = parseSelectColumns(table, query.select);
      const selectList = cols.map((c) => `t.${c}`).join(", ");
      const countSub = includeFlashcardsCount
        ? ", (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = t.id) AS __flashcard_count"
        : "";

      const params: (string | number | null)[] = [];
      const whereParts: string[] = [];
      if (!isAdmin) {
        const access = accessClauseForSelect(db, table, ctx.userId, params, "t");
        if (access) whereParts.push(access);
      }
      whereParts.push(...buildWhereClause(table, query.filters, params, "t"));
      const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

      if (query.head && query.count === "exact") {
        const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table} t ${whereSql}`).get(...params) as { cnt: number };
        return { data: null, error: null, count: Number(row?.cnt ?? 0) };
      }

      const orderSql = (query.order ?? [])
        .map((o) => `t.${assertCol(table, o.column)} ${o.ascending ? "ASC" : "DESC"}`)
        .join(", ");
      const orderClause = orderSql ? `ORDER BY ${orderSql}` : "";
      const limitClause = typeof query.limit === "number" && query.limit > 0 ? `LIMIT ${Math.floor(query.limit)}` : "";

      const rawRows = db
        .prepare(`SELECT ${selectList}${countSub} FROM ${table} t ${whereSql} ${orderClause} ${limitClause}`)
        .all(...params) as Record<string, unknown>[];

      const rows = rawRows.map((r) => {
        const hydrated = hydrateRow(table, r);
        if (includeFlashcardsCount) {
          const cnt = Number(hydrated.__flashcard_count ?? 0);
          delete hydrated.__flashcard_count;
          hydrated.flashcards = [{ count: cnt }];
        }
        return hydrated;
      });

      const exactCount = query.count === "exact" ? rows.length : null;
      if (query.single) {
        if (rows.length === 0) {
          return { data: null, error: { message: "Row not found", code: "PGRST116" }, count: exactCount };
        }
        return { data: rows[0], error: null, count: exactCount };
      }
      if (query.maybeSingle) {
        return { data: rows[0] ?? null, error: null, count: exactCount };
      }
      return { data: rows, error: null, count: exactCount };
    }

    if (!isAdmin && !ctx.userId) {
      return { data: null, error: { message: "Authentication required" } };
    }

    if (action === "insert") {
      if (!isAdmin && table === "user_roles") {
        return { data: null, error: { message: "Forbidden" } };
      }
      const list = Array.isArray(query.values) ? query.values : query.values ? [query.values] : [];
      if (list.length === 0) return { data: [], error: null };

      const now = new Date().toISOString();
      const inserted: Record<string, unknown>[] = [];

      for (const rawItem of list) {
        const item = { ...rawItem };
        if (!item.id) item.id = crypto.randomUUID();

        if (!isAdmin) {
          if (table === "profiles") {
            if (item.id !== ctx.userId) return { data: null, error: { message: "Forbidden" } };
          } else {
            item.user_id = ctx.userId;
          }
        }

        if (table === "decks") {
          if (item.created_at === undefined) item.created_at = now;
          if (item.updated_at === undefined) item.updated_at = now;
          if (item.is_public === undefined) item.is_public = false;
          if (item.shared_with_program === undefined) item.shared_with_program = false;
        } else if (table === "flashcards") {
          if (item.created_at === undefined) item.created_at = now;
          if (item.updated_at === undefined) item.updated_at = now;
          if (item.difficulty === undefined) item.difficulty = "Medium";
          if (item.status === undefined) item.status = "new";
          if (item.position === undefined) item.position = 0;
          if (item.question_type === undefined) item.question_type = "short_answer";
        } else if (table === "study_sessions") {
          if (item.completed_at === undefined) item.completed_at = now;
          if (item.mode === undefined) item.mode = "quiz";
          if (item.score === undefined) item.score = 0;
          if (item.total === undefined) item.total = 0;
        } else if (table === "program_messages") {
          if (item.created_at === undefined) item.created_at = now;
        } else if (table === "profiles") {
          if (item.created_at === undefined) item.created_at = now;
          if (item.updated_at === undefined) item.updated_at = now;
        }

        const cols = Object.keys(item).filter((k) => ALLOWED_COLUMNS[table].has(k));
        const placeholders = cols.map(() => "?").join(", ");
        const vals = cols.map((c) => serializeValue(table, c, item[c]));

        try {
          db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/UNIQUE constraint failed/i.test(msg)) {
            return { data: null, error: { message: msg, code: "23505" } };
          }
          throw err;
        }

        const saved = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(String(item.id)) as
          | Record<string, unknown>
          | undefined;
        if (saved) inserted.push(hydrateRow(table, saved));
      }

      if (!query.returningSelect) {
        return { data: null, error: null };
      }
      if (query.single) return { data: inserted[0] ?? null, error: null };
      if (query.maybeSingle) return { data: inserted[0] ?? null, error: null };
      return { data: inserted, error: null };
    }

    if (action === "update") {
      if (!isAdmin && table === "user_roles") {
        return { data: null, error: { message: "Forbidden" } };
      }
      const patch = (Array.isArray(query.values) ? query.values[0] : query.values) ?? {};
      const entries = Object.entries(patch).filter(([k]) => ALLOWED_COLUMNS[table].has(k) && k !== "id" && k !== "user_id");
      if (table === "decks" || table === "flashcards" || table === "profiles") {
        if (!patch.updated_at) entries.push(["updated_at", new Date().toISOString()]);
      }
      if (entries.length === 0) return { data: null, error: null };

      const setSql = entries.map(([k]) => `${assertCol(table, k)} = ?`).join(", ");
      const params: (string | number | null)[] = entries.map(([k, v]) => serializeValue(table, k, v));
      const whereParts: string[] = [];

      if (!isAdmin) {
        if (table === "profiles") {
          whereParts.push("id = ?");
          params.push(ctx.userId!);
        } else {
          whereParts.push("user_id = ?");
          params.push(ctx.userId!);
        }
      }
      whereParts.push(...buildWhereClause(table, query.filters, params));
      const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

      db.prepare(`UPDATE ${table} SET ${setSql} ${whereSql}`).run(...params);

      // Keep auth_users metadata display_name/university/program synced on profile updates
      if (table === "profiles" && ctx.userId) {
        const prof = db
          .prepare("SELECT display_name, university, program, account_type FROM profiles WHERE id = ?")
          .get(ctx.userId) as
          | { display_name: string | null; university: string | null; program: string | null; account_type: string }
          | undefined;
        const urow = db.prepare("SELECT user_metadata FROM auth_users WHERE id = ?").get(ctx.userId) as
          | { user_metadata: string }
          | undefined;
        if (prof && urow) {
          let meta: Record<string, unknown> = {};
          try {
            meta = JSON.parse(urow.user_metadata || "{}");
          } catch {
            meta = {};
          }
          if (prof.display_name !== null) meta.full_name = prof.display_name;
          if (prof.university !== null) meta.university = prof.university;
          if (prof.program !== null) meta.program = prof.program;
          meta.account_type = prof.account_type;
          db.prepare("UPDATE auth_users SET user_metadata = ? WHERE id = ?").run(JSON.stringify(meta), ctx.userId);
        }
      }

      return { data: null, error: null };
    }

    if (action === "delete") {
      if (!isAdmin && table === "user_roles") {
        return { data: null, error: { message: "Forbidden" } };
      }
      const params: (string | number | null)[] = [];
      const whereParts: string[] = [];
      if (!isAdmin) {
        whereParts.push(table === "profiles" ? "id = ?" : "user_id = ?");
        params.push(ctx.userId!);
      }
      whereParts.push(...buildWhereClause(table, query.filters, params));
      const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
      db.prepare(`DELETE FROM ${table} ${whereSql}`).run(...params);
      return { data: null, error: null };
    }

    return { data: null, error: { message: `Unsupported action: ${action}` } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: { message } };
  }
}

export function executeLocalRpc(
  fn: string,
  args: Record<string, unknown> | undefined,
  ctx: { userId: string | null },
): { data: unknown; error: { message: string } | null } {
  const db = getLocalDb();
  try {
    if (fn === "has_role") {
      const targetUserId = String(args?._user_id ?? "");
      const role = String(args?._role ?? "");
      if (!ctx.userId || ctx.userId !== targetUserId) {
        return { data: false, error: null };
      }
      const row = db
        .prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1")
        .get(targetUserId, role);
      return { data: Boolean(row), error: null };
    }

    if (fn === "get_user_program") {
      const targetUserId = String(args?._user_id ?? "");
      const row = db.prepare("SELECT program FROM profiles WHERE id = ? LIMIT 1").get(targetUserId) as
        | { program: string | null }
        | undefined;
      return { data: row?.program ?? null, error: null };
    }

    if (fn === "get_leaderboard") {
      const rows = db
        .prepare(
          `SELECT
            p.id AS user_id,
            COALESCE(p.display_name, 'Student') AS display_name,
            p.university AS university,
            COALESCE(s.total_correct, 0) AS mastered_count,
            COALESCE(s.avg_score, 0) AS avg_score
          FROM profiles p
          LEFT JOIN (
            SELECT
              user_id,
              SUM(score) AS total_correct,
              ROUND(AVG(CASE WHEN total > 0 THEN (CAST(score AS REAL) / total) * 100.0 ELSE 0 END), 0) AS avg_score
            FROM study_sessions
            GROUP BY user_id
          ) s ON s.user_id = p.id
          ORDER BY COALESCE(s.total_correct, 0) DESC, COALESCE(s.avg_score, 0) DESC
          LIMIT 10`,
        )
        .all();
      return { data: rows, error: null };
    }

    if (fn === "get_program_shared_decks") {
      if (!ctx.userId) return { data: [], error: null };
      const myProg = userProgram(db, ctx.userId);
      if (!myProg) return { data: [], error: null };
      const rows = db
        .prepare(
          `SELECT
            d.id,
            d.title,
            d.subject,
            d.course_name,
            d.created_at,
            d.user_id,
            COALESCE(p.display_name, 'Student') AS sharer_name,
            (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) AS card_count
          FROM decks d
          JOIN profiles p ON p.id = d.user_id
          WHERE d.archived_at IS NULL
            AND d.shared_with_program = 1
            AND d.user_id != ?
            AND LOWER(TRIM(COALESCE(p.program, ''))) = LOWER(TRIM(?))
          ORDER BY d.created_at DESC
          LIMIT 100`,
        )
        .all(ctx.userId, myProg);
      return { data: rows, error: null };
    }

    if (fn === "search_decks_by_program") {
      const q = typeof args?.p_query === "string" ? args.p_query.trim() : "";
      const pattern = `%${q}%`;
      const rows = db
        .prepare(
          `SELECT
            d.id,
            d.title,
            d.subject,
            d.course_name,
            d.created_at,
            d.user_id,
            COALESCE(p.display_name, 'Anonymous') AS sharer_name,
            p.program AS program,
            (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) AS card_count
          FROM decks d
          LEFT JOIN profiles p ON p.id = d.user_id
          WHERE d.archived_at IS NULL
            AND (d.is_public = 1 OR d.shared_with_program = 1)
            AND (
              ? = ''
              OR COALESCE(p.program, '') LIKE ? COLLATE NOCASE
              OR COALESCE(d.title, '') LIKE ? COLLATE NOCASE
              OR COALESCE(d.subject, '') LIKE ? COLLATE NOCASE
              OR COALESCE(d.course_name, '') LIKE ? COLLATE NOCASE
            )
          ORDER BY d.created_at DESC
          LIMIT 60`,
        )
        .all(q, pattern, pattern, pattern, pattern);
      return { data: rows, error: null };
    }

    return { data: null, error: { message: `Unknown RPC: ${fn}` } };
  } catch (err: unknown) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}
