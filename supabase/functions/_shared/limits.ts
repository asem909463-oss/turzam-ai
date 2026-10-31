// Limits, input validation and small pure helpers shared by the Edge Functions.
// No Deno or network APIs in here, so it is easy to test (see ../tests).

/** Keep these in sync with src/lib/attachments.ts (a test checks that they match). */
export const LIMITS = {
  maxMessages: 40,
  /** Longest message a user may send. */
  maxUserChars: 12_000,
  /** Older assistant answers are trimmed to this when sent back as history. */
  maxModelChars: 24_000,
  /** Whole conversation sent to the model, newest messages win. */
  maxTotalChars: 120_000,
  maxFilesPerMessage: 4,
  maxFileBytes: 10 * 1024 * 1024,
  maxBytesPerMessage: 18 * 1024 * 1024,
  /** Across the whole history sent in one request. */
  maxRequestFiles: 8,
  maxRequestBytes: 24 * 1024 * 1024,
  maxTextFileChars: 80_000,
  maxAudioBase64: 7_000_000,
  maxHttpBodyBytes: 9_000_000,
  maxInstructionChars: 1500,
} as const;

export const MODE_IDS = ["founder", "balanced", "think", "create", "code", "tutor"] as const;
export const PERSONA_IDS = ["none", "professional", "analyst", "creative", "teacher", "entrepreneur"] as const;
export const PROVIDER_IDS = ["gemini", "openai", "anthropic"] as const;

export type InFile = { name: string; mime: string; path: string };
export type InMessage = { role: "user" | "model"; text: string; files: InFile[] };
export type ChatInput = {
  mode: string;
  persona: string;
  /** "auto" or a specific provider id. */
  provider: string;
  search: boolean;
  /** Workspace the chat belongs to, or null. */
  projectId: string | null;
  messages: InMessage[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export type LimitedJsonResult = { ok: true; value: unknown } | { ok: false; error: "too_large" | "invalid" };

/** Parse JSON while counting streamed bytes, even when Content-Length is absent or inaccurate. */
export async function readJsonLimited(request: Request, maxBytes: number): Promise<LimitedJsonResult> {
  const reader = request.body?.getReader();
  if (!reader || !Number.isSafeInteger(maxBytes) || maxBytes < 0) return { ok: false, error: "invalid" };

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid" };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

// deno-lint-ignore no-explicit-any
export function validateChat(body: any): Result<ChatInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "Bad request." };
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false, error: "No messages." };

  const mode = (MODE_IDS as readonly string[]).includes(body.mode) ? body.mode : "founder";
  const persona = (PERSONA_IDS as readonly string[]).includes(body.persona) ? body.persona : "none";
  const provider = (PROVIDER_IDS as readonly string[]).includes(body.provider) ? body.provider : "auto";

  let projectId: string | null = null;
  if (body.projectId !== undefined && body.projectId !== null) {
    if (typeof body.projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.projectId)) {
      return { ok: false, error: "This project is unavailable." };
    }
    projectId = body.projectId;
  }

  const raw = body.messages.slice(-LIMITS.maxMessages);
  const messages: InMessage[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    if (!m || typeof m !== "object") return { ok: false, error: "Bad message." };
    const role = m.role === "model" ? "model" : "user";
    const isLast = i === raw.length - 1;
    const text = typeof m.text === "string" ? m.text : "";
    if (role === "user" && text.length > LIMITS.maxUserChars) {
      return { ok: false, error: `That message is too long (limit ${LIMITS.maxUserChars.toLocaleString("en-US")} characters).` };
    }
    const rawFiles = Array.isArray(m.files) ? m.files : [];
    if (isLast && rawFiles.length > LIMITS.maxFilesPerMessage) {
      return { ok: false, error: `You can attach up to ${LIMITS.maxFilesPerMessage} files per message.` };
    }
    const files: InFile[] = [];
    for (const f of rawFiles.slice(0, LIMITS.maxFilesPerMessage)) {
      if (!f || typeof f !== "object" || typeof f.path !== "string" || !f.path) continue;
      files.push({ name: str(f.name, 120) || "file", mime: str(f.mime, 100), path: str(f.path, 300) });
    }
    messages.push({ role, text: role === "model" ? text.slice(0, LIMITS.maxModelChars) : text, files });
  }

  const last = messages[messages.length - 1];
  if (last.role !== "user") return { ok: false, error: "The last message must come from you." };
  if (!last.text.trim() && !last.files.length) return { ok: false, error: "The message is empty." };

  // Whole-conversation size: drop the oldest messages first.
  let total = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    total += messages[i].text.length;
    if (total > LIMITS.maxTotalChars && i < messages.length - 1) break;
    start = i;
  }
  return { ok: true, value: { mode, persona, provider, search: body.search === true, projectId, messages: messages.slice(start) } };
}

export function searchConfigurationError(search: boolean, provider: string, geminiAvailable: boolean): string | null {
  if (!search) return null;
  if (!geminiAvailable) return "Web search needs a Gemini key on the server.";
  if (provider !== "auto" && provider !== "gemini") return "Web search is available with Gemini or Auto. Choose one before searching.";
  return null;
}

// ---------- usage quotas (enforced in the database, see consume_quota in schema.sql) ----------

export type QuotaKind = "chat" | "search" | "aux" | "transcribe" | "delete";
export type Quota = { perMinute: number; perDay: number };

const DEFAULT_QUOTAS: Record<QuotaKind, Quota> = {
  chat: { perMinute: 12, perDay: 150 },
  search: { perMinute: 6, perDay: 40 },
  aux: { perMinute: 30, perDay: 400 },
  transcribe: { perMinute: 10, perDay: 100 },
  delete: { perMinute: 3, perDay: 5 },
};

function intEnv(get: (k: string) => string, key: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(get(key), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Defaults can be changed with secrets such as LIMIT_CHAT_PER_DAY or LIMIT_CHAT_PER_MINUTE. */
export function quotaFor(kind: QuotaKind, get: (k: string) => string): Quota {
  const d = DEFAULT_QUOTAS[kind];
  const k = kind.toUpperCase();
  return {
    perMinute: intEnv(get, `LIMIT_${k}_PER_MINUTE`, d.perMinute, 1, 120),
    perDay: intEnv(get, `LIMIT_${k}_PER_DAY`, d.perDay, 1, 5000),
  };
}

/**
 * Optional cap on calls per day across ALL users (secret GLOBAL_CHAT_PER_DAY and so on).
 * Returns null (off) when the secret is not set, so a launch is never throttled by surprise.
 */
export function globalPerDay(kind: QuotaKind, get: (k: string) => string): number | null {
  const n = Number.parseInt(get(`GLOBAL_${kind.toUpperCase()}_PER_DAY`), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : null;
}

// ---------- output size and Gemini settings ----------

/** Visible answer size cap in tokens (MAX_OUTPUT_TOKENS secret). */
export function maxOutputTokens(get: (k: string) => string): number {
  return intEnv(get, "MAX_OUTPUT_TOKENS", 4096, 256, 16000);
}

export function geminiMajor(model: string): number {
  const m = /^gemini-(\d+)/.exec(model);
  return m ? Number(m[1]) : 0;
}

export type ThinkingLevel = "low" | "medium" | "high";

/**
 * Gemini 3.x models think by default and count thinking inside the output token limit.
 * Returns the level to request, or null for models that do not take one (older ones).
 */
export function geminiThinkingLevel(model: string, mode: string, get: (k: string) => string): ThinkingLevel | null {
  if (geminiMajor(model) < 3) return null;
  if (mode === "think") return "high";
  const v = get("GEMINI_THINKING_LEVEL").toLowerCase();
  return v === "medium" || v === "high" || v === "low" ? v : "low";
}

/** Gemini 3.x is meant to run at its default temperature; only send ours to older models. */
export function geminiAcceptsTemperature(model: string): boolean {
  return geminiMajor(model) < 3;
}

/** Room for thinking on top of the visible answer, because both share maxOutputTokens. */
export function thinkingHeadroom(level: ThinkingLevel | null): number {
  return level === "high" ? 8192 : level === "medium" ? 4096 : level === "low" ? 2048 : 0;
}

// ---------- provider errors ----------

/** Friendly text for the app. The raw provider error is only written to the server log. */
export function providerErrorMessage(name: string, status: number): string {
  if (status === 401 || status === 403) return `${name} rejected the server's key. Check the key in the Supabase secrets.`;
  if (status === 404) return `${name} could not find that model. Check the model name in the Supabase secrets.`;
  if (status === 400) return `${name} could not process this request. Try shorter text or fewer files.`;
  if (status === 408 || status === 504) return `${name} took too long to answer. Please try again.`;
  if (status === 429) return `${name} is busy or its quota is used up. Try again in a minute.`;
  if (status >= 500) return `${name} is having problems right now. Please try again.`;
  return `${name} returned an error (${status}).`;
}

export const isTransient = (status: number) => status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529;
