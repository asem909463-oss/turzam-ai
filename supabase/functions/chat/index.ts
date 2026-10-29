// Turzam AI backend: the ONLY place that knows the Gemini API key.
// Runs as a Supabase Edge Function (Deno). The app never sees the key.
//
// Actions (POST JSON, with the signed-in user's token):
//   { action: "chat", mode, messages }   -> streams the answer (Server-Sent Events)
//   { action: "title", text }            -> { title }
//   { action: "remember", user, assistant } -> { added }
//
// It uses only the public anon key + the user's own token, so database access is
// always limited by Row Level Security. No service-role key is needed.

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_PROMPT = `You are Turzam, a warm, sharp and honest AI assistant inside the Turzam AI app.
- Reply in the same language the user writes in.
- Be direct. Lead with the answer, then add detail only if it helps.
- Use Markdown sparingly: short paragraphs, bullet lists for steps, fenced code blocks with a language for code.
- If you are unsure, say so instead of guessing. Never invent sources, quotes or facts.
- If the user shares an image, describe and use only what is actually visible.`;

const MODES: Record<string, { prompt: string; temperature: number }> = {
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

type ImagePart = { mime: string; data: string };
type InMessage = { role: "user" | "model"; text: string; images?: ImagePart[] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function generate(prompt: string, asJson = false): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        ...(asJson ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
}

// deno-lint-ignore no-explicit-any
async function handleChat(supabase: any, userId: string, body: any) {
  const mode = MODES[body.mode] ?? MODES.balanced;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, memory_enabled")
    .eq("id", userId)
    .maybeSingle();

  let extra = "";
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

  const messages: InMessage[] = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
  const contents = messages.map((m) => ({
    role: m.role === "model" ? "model" : "user",
    parts: [
      ...(m.images ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })),
      { text: m.text && m.text.length ? m.text : " " },
    ],
  }));
  if (!contents.length) return json({ error: "No messages." }, 400);

  const upstream = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${BASE_PROMPT}${extra}\n\n${mode.prompt}` }] },
      contents,
      generationConfig: { temperature: mode.temperature },
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("Gemini failed", upstream.status, detail.slice(0, 500));
    return json({ error: `The AI service returned an error (${upstream.status}).` }, 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
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
            if (!payload) continue;
            try {
              const j = JSON.parse(payload);
              if (j.promptFeedback?.blockReason) {
                send({ error: "That request was blocked by the AI safety filter." });
              }
              const parts = j.candidates?.[0]?.content?.parts ?? [];
              for (const p of parts) {
                if (typeof p.text === "string" && !p.thought) send({ t: p.text });
              }
            } catch (_) {
              // ignore a malformed fragment
            }
          }
        }
        send({ done: true });
      } catch (e) {
        send({ error: String(e) });
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
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

Return a JSON array (max 3 strings) of NEW, durable facts the USER stated about themselves: name, job, location, projects, goals, tools they use, stable preferences.
Rules:
- Only facts the user clearly said. Never guess or infer.
- Skip anything already stored, anything temporary, and anything about the assistant.
- Skip sensitive data: health, finances, passwords, ID numbers, precise addresses, political or religious views.
- Each fact is one short sentence under 140 characters, written like "Works as a Flutter developer".
- If there is nothing worth storing, return [].`;

  let facts: string[] = [];
  try {
    const raw = await generate(prompt, true);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      facts = parsed
        .filter((f) => typeof f === "string")
        .map((f: string) => f.trim())
        .filter((f: string) => f.length > 2 && f.length <= 200)
        .slice(0, 3);
    }
  } catch (e) {
    console.error("remember failed", e);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!GEMINI_API_KEY) {
    return json({ error: "The server has no GEMINI_API_KEY yet. See the README, step 4." }, 500);
  }

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
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong on the server." }, 500);
  }
});
