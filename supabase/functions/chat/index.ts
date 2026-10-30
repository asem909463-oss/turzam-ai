// Turzam AI backend: the ONLY place that knows the AI provider keys.
// Runs as a Supabase Edge Function (Deno). The app never sees any key.
//
// Providers (each one is "connected" only if its key is set as a Supabase secret):
//   gemini    -> GEMINI_API_KEY     (+ optional GEMINI_MODEL)
//   openai    -> OPENAI_API_KEY     (+ optional OPENAI_MODEL)     shown in the app as "ChatGPT"
//   anthropic -> ANTHROPIC_API_KEY  (+ optional ANTHROPIC_MODEL)  shown in the app as "Claude"
//
// Actions (POST JSON, with the signed-in user's token):
//   { action: "models" }                          -> which providers are connected
//   { action: "chat", mode, provider, messages }  -> streams the answer (Server-Sent Events)
//   { action: "title", text }                     -> { title }
//   { action: "remember", user, assistant }       -> { added }
//   { action: "suggest", user, assistant, mode }  -> { suggestions }
//
// Files: the app uploads attachments to the private "attachments" storage bucket and sends only
// their paths. This function downloads them with the user's own token (Row Level Security applies)
// and passes images / PDFs / text to the chosen model.

import { createClient } from "npm:@supabase/supabase-js@2";

type Provider = "gemini" | "openai" | "anthropic";

const env = (k: string) => Deno.env.get(k) ?? "";

const PROVIDERS: Record<Provider, { name: string; vendor: string; key: () => string; model: () => string }> = {
  gemini: {
    name: "Gemini",
    vendor: "Google",
    key: () => env("GEMINI_API_KEY"),
    model: () => env("GEMINI_MODEL") || "gemini-3.8-flash",
  },
  openai: {
    name: "ChatGPT",
    vendor: "OpenAI",
    key: () => env("OPENAI_API_KEY"),
    model: () => env("OPENAI_MODEL") || "gpt-5.5",
  },
  anthropic: {
    name: "Claude",
    vendor: "Anthropic",
    key: () => env("ANTHROPIC_API_KEY"),
    model: () => env("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
  },
};
const ORDER: Provider[] = ["gemini", "openai", "anthropic"];

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const BUCKET = "attachments";
const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_CHARS = 80_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_PROMPT = `You are Turzam, the AI for business and founders (and for creativity), inside the Turzam AI app.
- Reply in the same language the user writes in.
- Be direct and useful. Lead with the answer, then add detail only if it helps.
- Use Markdown sparingly: short paragraphs, bullet lists for steps, fenced code blocks with a language for code.
- If you are unsure, say so instead of guessing. Never invent sources, quotes, statistics or facts.
- When the user attaches images, PDFs or text files, read them carefully and base your answer on what they actually contain. If a file could not be read, say so.`;

const MODES: Record<string, { prompt: string; temperature: number }> = {
  founder: {
    temperature: 0.6,
    prompt:
      "Mode: Founder. You are a sharp, experienced operator and advisor to founders and business owners. Be concrete: give frameworks, real numbers to test, templates, and the single best next action. Challenge weak assumptions politely. Cover strategy, product, pricing, go-to-market, fundraising, hiring, finance basics and operations. Ask at most one clarifying question, and only if it changes the answer.",
  },
  balanced: {
    temperature: 0.7,
    prompt: "Mode: Balanced. Be a helpful all-round assistant. Keep answers concise unless the user wants depth.",
  },
  think: {
    temperature: 0.4,
    prompt:
      "Mode: Deep Think. Work through the problem carefully and step by step before concluding. Check your own reasoning, consider edge cases, and show the key steps. End with a clear final answer.",
  },
  create: {
    temperature: 1.0,
    prompt:
      "Mode: Creative. Write vividly and with a distinct voice. Offer fresh angles instead of clichés. For writing tasks, deliver the piece first, then optionally one line offering a variation.",
  },
  code: {
    temperature: 0.2,
    prompt:
      "Mode: Coder. You are a senior software engineer. Give correct, minimal, runnable code with the language tagged in fenced blocks. Explain what matters in a few lines. For beginners, give exact steps. Point out bugs and risks you notice.",
  },
  tutor: {
    temperature: 0.5,
    prompt:
      "Mode: Tutor. Teach patiently. Explain with simple language and a concrete example, then check understanding with one short question. Break hard topics into small steps.",
  },
};

type InFile = { name: string; mime: string; path: string };
type InMessage = { role: "user" | "model"; text: string; files?: InFile[] };

type Media = { kind: "image" | "pdf"; mime: string; name: string; b64: string };
type Resolved = { role: "user" | "model"; text: string; media: Media[] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function available(): Provider[] {
  return ORDER.filter((p) => PROVIDERS[p].key().length > 0);
}

function pickProvider(requested?: string): Provider | null {
  const ok = available();
  if (requested && (ok as string[]).includes(requested)) return requested as Provider;
  return ok[0] ?? null;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "jsx", "ts", "tsx", "py",
  "java", "c", "h", "cpp", "cs", "go", "rs", "rb", "php", "swift", "kt", "sql", "sh", "ps1", "yml", "yaml",
  "toml", "ini", "log", "env", "srt", "vtt", "rtf",
]);

function classify(mime: string, name: string): "image" | "pdf" | "text" | null {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/xml" ||
    m === "application/javascript" ||
    TEXT_EXT.has(ext)
  ) {
    return "text";
  }
  return null;
}

// Read every attachment of the latest messages and turn it into model-ready content.
// deno-lint-ignore no-explicit-any
async function resolveMessages(supabase: any, userId: string, messages: InMessage[]): Promise<Resolved[]> {
  let count = 0;
  let bytesLeft = MAX_TOTAL_BYTES;
  const out: Resolved[] = new Array(messages.length);

  // Newest messages first, so the freshest files win when there are many.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const media: Media[] = [];
    const notes: string[] = [];
    for (const f of m.files ?? []) {
      const kind = classify(f.mime, f.name);
      const safeName = String(f.name ?? "file").slice(0, 120);
      if (!kind) {
        notes.push(`[Attachment "${safeName}" is a type Turzam cannot read yet.]`);
        continue;
      }
      if (typeof f.path !== "string" || !f.path.startsWith(`${userId}/`) || f.path.includes("..")) {
        notes.push(`[Attachment "${safeName}" could not be read.]`);
        continue;
      }
      if (count >= MAX_FILES || bytesLeft <= 0) {
        notes.push(`[Attachment "${safeName}" was left out because it is older or too large.]`);
        continue;
      }
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(f.path);
        if (error || !data) throw new Error(error?.message ?? "download failed");
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (bytes.length > bytesLeft) {
          notes.push(`[Attachment "${safeName}" is too large to include.]`);
          continue;
        }
        bytesLeft -= bytes.length;
        count++;
        if (kind === "text") {
          let text = new TextDecoder().decode(bytes);
          let cut = "";
          if (text.length > MAX_TEXT_CHARS) {
            text = text.slice(0, MAX_TEXT_CHARS);
            cut = "\n[…file continues; only the first part is shown]";
          }
          notes.push(`--- File: ${safeName} ---\n${text}${cut}\n--- End of file ---`);
        } else {
          media.push({
            kind,
            mime: kind === "pdf" ? "application/pdf" : f.mime || "image/jpeg",
            name: safeName,
            b64: toBase64(bytes),
          });
        }
      } catch (e) {
        console.error("attachment read failed", f.path, String(e));
        notes.push(`[Attachment "${safeName}" could not be read.]`);
      }
    }
    const text = [...notes, m.text ?? ""].filter((s) => s && s.length).join("\n\n");
    out[i] = { role: m.role === "model" ? "model" : "user", text, media };
  }
  return out;
}

// ---------- streaming helpers ----------

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload) yield payload;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trim();
  } finally {
    reader.cancel().catch(() => {});
  }
}

type Sink = { text: (t: string) => void; error: (m: string) => void };

// ---------- provider adapters ----------

function geminiBody(system: string, msgs: Resolved[], temperature: number) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: msgs.map((m) => ({
      role: m.role,
      parts: [
        ...m.media.map((x) => ({ inlineData: { mimeType: x.mime, data: x.b64 } })),
        { text: m.text.length ? m.text : " " },
      ],
    })),
    generationConfig: { temperature },
  };
}

function openaiMessages(system: string, msgs: Resolved[]) {
  return [
    { role: "system", content: system },
    ...msgs.map((m) => {
      if (m.role === "model") return { role: "assistant", content: m.text || " " };
      const parts: unknown[] = [{ type: "text", text: m.text.length ? m.text : " " }];
      for (const x of m.media) {
        if (x.kind === "image") {
          parts.push({ type: "image_url", image_url: { url: `data:${x.mime};base64,${x.b64}` } });
        } else {
          parts.push({ type: "file", file: { filename: x.name, file_data: `data:application/pdf;base64,${x.b64}` } });
        }
      }
      return { role: "user", content: parts };
    }),
  ];
}

function anthropicMessages(msgs: Resolved[]) {
  // Claude needs: starts with a user turn, roles strictly alternate.
  const out: { role: "user" | "assistant"; content: unknown[] }[] = [];
  for (const m of msgs) {
    const role = m.role === "model" ? "assistant" : "user";
    const blocks: unknown[] = [];
    if (role === "user") {
      for (const x of m.media) {
        blocks.push(
          x.kind === "image"
            ? { type: "image", source: { type: "base64", media_type: x.mime, data: x.b64 } }
            : { type: "document", source: { type: "base64", media_type: "application/pdf", data: x.b64 } },
        );
      }
    }
    blocks.push({ type: "text", text: m.text.length ? m.text : " " });
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function streamProvider(provider: Provider, system: string, msgs: Resolved[], temperature: number, sink: Sink) {
  const key = PROVIDERS[provider].key();
  const model = PROVIDERS[provider].model();

  let res: Response;
  if (provider === "gemini") {
    res = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(geminiBody(system, msgs, temperature)),
    });
  } else if (provider === "openai") {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, stream: true, messages: openaiMessages(system, msgs) }),
    });
  } else {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        stream: true,
        system,
        messages: anthropicMessages(msgs),
      }),
    });
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error(`${provider} failed`, res.status, detail.slice(0, 600));
    sink.error(`${PROVIDERS[provider].name} returned an error (${res.status}). Check the key and model name on the server.`);
    return;
  }

  for await (const payload of sseData(res.body)) {
    if (payload === "[DONE]") break;
    let j;
    try {
      j = JSON.parse(payload);
    } catch (_) {
      continue;
    }
    if (provider === "gemini") {
      if (j.promptFeedback?.blockReason) sink.error("That request was blocked by the AI safety filter.");
      for (const p of j.candidates?.[0]?.content?.parts ?? []) {
        if (typeof p.text === "string" && !p.thought) sink.text(p.text);
      }
    } else if (provider === "openai") {
      const t = j.choices?.[0]?.delta?.content;
      if (typeof t === "string" && t) sink.text(t);
      if (j.error) sink.error(String(j.error.message ?? "OpenAI error"));
    } else {
      if (j.type === "content_block_delta" && j.delta?.type === "text_delta") sink.text(j.delta.text ?? "");
      if (j.type === "error") sink.error(String(j.error?.message ?? "Claude error"));
    }
  }
}

// Short, non-streaming helper used for titles, memory and follow-up ideas.
async function generate(prompt: string): Promise<string> {
  const provider = pickProvider();
  if (!provider) throw new Error("no provider");
  const key = PROVIDERS[provider].key();
  const model = PROVIDERS[provider].model();

  if (provider === "gemini") {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
  }
  if (provider === "openai") {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const data = await res.json();
    return String(data.choices?.[0]?.message?.content ?? "").trim();
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  return String(data.content?.[0]?.text ?? "").trim();
}

function parseStringArray(raw: string): string[] {
  const a = raw.indexOf("[");
  const b = raw.lastIndexOf("]");
  if (a < 0 || b <= a) return [];
  try {
    const parsed = JSON.parse(raw.slice(a, b + 1));
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch (_) {
    return [];
  }
}

// ---------- action handlers ----------

// deno-lint-ignore no-explicit-any
async function handleChat(supabase: any, userId: string, body: any) {
  const provider = pickProvider(body.provider);
  if (!provider) return json({ error: "No AI provider is connected on the server yet. See the README, step 5." }, 500);

  const mode = MODES[body.mode] ?? MODES.founder;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, memory_enabled")
    .eq("id", userId)
    .maybeSingle();

  let extra = `\nYou are currently answering through ${PROVIDERS[provider].name} (${PROVIDERS[provider].vendor}). If the user asks which model powers you, say that.`;
  if (profile?.display_name) extra += `\nThe user's name is ${profile.display_name}.`;

  if (profile?.memory_enabled !== false) {
    const { data: mems } = await supabase
      .from("memories")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(40);
    if (mems?.length) {
      extra +=
        "\n\nThings you remember about this user (use them only when relevant, and never say you have a memory list):\n" +
        mems.map((m: { content: string }) => `- ${m.content}`).join("\n");
    }
  }

  const input: InMessage[] = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
  if (!input.length) return json({ error: "No messages." }, 400);
  const resolved = await resolveMessages(supabase, userId, input);

  const system = `${BASE_PROMPT}${extra}\n\n${mode.prompt}`;
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      };
      let failed = false;
      try {
        send({ meta: { provider } });
        await streamProvider(provider, system, resolved, mode.temperature, {
          text: (t) => send({ t }),
          error: (m) => {
            failed = true;
            send({ error: m });
          },
        });
        if (!failed) send({ done: true });
      } catch (e) {
        console.error("stream failed", String(e));
        send({ error: "The connection to the AI service was interrupted." });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

// deno-lint-ignore no-explicit-any
async function handleRemember(supabase: any, userId: string, body: any) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("memory_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.memory_enabled === false) return json({ added: 0 });

  const { data: existing } = await supabase
    .from("memories")
    .select("content")
    .order("created_at", { ascending: false })
    .limit(200);
  if ((existing?.length ?? 0) >= 200) return json({ added: 0 });

  const known = (existing ?? []).map((m: { content: string }) => `- ${m.content}`).join("\n") || "(none)";
  const prompt = `You maintain a short list of lasting facts about a user so an assistant can personalise future chats.

Already stored:
${known}

Latest exchange:
User: ${String(body.user ?? "").slice(0, 1500)}
Assistant: ${String(body.assistant ?? "").slice(0, 1500)}

Return ONLY a JSON array (max 3 strings) of NEW, durable facts the USER stated about themselves: name, job, company or startup, location, projects, goals, tools they use, stable preferences.
Rules:
- Only facts the user clearly said. Never guess or infer.
- Skip anything already stored, anything temporary, and anything about the assistant.
- Skip sensitive data: health, personal finances, passwords, ID numbers, precise addresses, political or religious views.
- Each fact is one short sentence under 140 characters, written like "Founder of a logistics startup".
- If there is nothing worth storing, return [].`;

  let facts: string[] = [];
  try {
    facts = parseStringArray(await generate(prompt))
      .map((f) => f.trim())
      .filter((f) => f.length > 2 && f.length <= 200)
      .slice(0, 3);
  } catch (e) {
    console.error("remember failed", String(e));
    return json({ added: 0 });
  }
  if (!facts.length) return json({ added: 0 });

  const { error } = await supabase.from("memories").insert(facts.map((content) => ({ content, user_id: userId })));
  if (error) {
    console.error("memory insert failed", error.message);
    return json({ added: 0 });
  }
  return json({ added: facts.length });
}

async function handleSuggest(body: { user?: string; assistant?: string; mode?: string }) {
  const prompt = `Suggest 3 short follow-up messages the user might send next in this chat.

User said: ${String(body.user ?? "").slice(0, 800)}
Assistant answered: ${String(body.assistant ?? "").slice(0, 1800)}

Rules:
- Written from the user's point of view, as a request or question (max 9 words each).
- Specific to the conversation, useful, and different from each other.
- Same language as the user.
- Return ONLY a JSON array of 3 strings.`;
  try {
    const list = parseStringArray(await generate(prompt))
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 2 && s.length <= 90)
      .slice(0, 3);
    return json({ suggestions: list });
  } catch (e) {
    console.error("suggest failed", String(e));
    return json({ suggestions: [] });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: "Please sign in again." }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "Bad request." }, 400);
  }

  if (body.action === "models") {
    return json({
      providers: ORDER.map((id) => ({
        id,
        name: PROVIDERS[id].name,
        vendor: PROVIDERS[id].vendor,
        model: PROVIDERS[id].model(),
        available: PROVIDERS[id].key().length > 0,
      })),
    });
  }

  if (!available().length) {
    return json({ error: "The server has no AI key yet. Add GEMINI_API_KEY (see the README, step 5)." }, 500);
  }

  try {
    switch (body.action) {
      case "chat":
        return await handleChat(supabase, auth.user.id, body);
      case "title": {
        const text = String(body.text ?? "").slice(0, 600);
        const title = await generate(
          `Write a title of 2 to 5 words for a chat that starts with the message below. Same language as the message. No quotes, no ending punctuation. Reply with the title only.\n\nMessage:\n${text}`,
        );
        return json({ title: title.replace(/["'.\n]/g, "").slice(0, 60) || "New chat" });
      }
      case "remember":
        return await handleRemember(supabase, auth.user.id, body);
      case "suggest":
        return await handleSuggest(body);
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong on the server." }, 500);
  }
});
