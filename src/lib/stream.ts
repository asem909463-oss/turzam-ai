import { fetch } from 'expo/fetch';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { ProviderId } from '../types';

export type ApiFile = { name: string; mime: string; path: string };

export type ApiMessage = {
  role: 'user' | 'model';
  text: string;
  files?: ApiFile[];
};

const FN_URL = `${SUPABASE_URL}/functions/v1/chat`;

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {
    // ignore
  }
  if (res.status === 404) return 'The chat backend is not deployed yet. Run the "functions deploy chat" step in the README.';
  if (res.status === 401) return 'Please sign in again.';
  return `Request failed (${res.status})`;
}

/** Streams the assistant's answer. Calls onText with each new piece of text. */
export async function streamChat(opts: {
  token: string;
  mode: string;
  provider: string;
  messages: ApiMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onMeta?: (meta: { provider?: ProviderId }) => void;
}): Promise<void> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    signal: opts.signal,
    headers: headers(opts.token),
    body: JSON.stringify({ action: 'chat', mode: opts.mode, provider: opts.provider, messages: opts.messages }),
  });

  if (!res.ok) throw new Error(await readError(res as unknown as Response));
  if (!res.body) throw new Error('The server did not send a streaming response.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let evt: { t?: string; error?: string; done?: boolean; meta?: { provider?: ProviderId } };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.error) throw new Error(evt.error);
      if (evt.meta) opts.onMeta?.(evt.meta);
      if (evt.t) opts.onText(evt.t);
      if (evt.done) return;
    }
  }
}

/** Normal (non-streaming) calls: "models", "title", "remember", "suggest". */
export async function callFunction<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res as unknown as Response));
  return (await res.json()) as T;
}
