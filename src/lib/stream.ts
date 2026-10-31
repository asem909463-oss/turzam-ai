import { fetch } from 'expo/fetch';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { ProviderId, Source } from '../types';

export type ApiFile = { name: string; mime: string; path: string };

export type ApiMessage = {
  role: 'user' | 'model';
  text: string;
  files?: ApiFile[];
};

const FN_URL = `${SUPABASE_URL}/functions/v1/chat`;
const DELETE_URL = `${SUPABASE_URL}/functions/v1/delete-account`;

/** The server gives up after 45 s of silence; the app waits a little longer, then stops waiting too. */
const STREAM_IDLE_MS = 60_000;
const STREAM_TOTAL_MS = 150_000;
const CALL_TIMEOUT_MS = 25_000;

class TimeoutError extends Error {}

/** An AbortController that also aborts when `outer` does, and after `ms`. */
function linked(outer: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (t: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, t);
  };
  arm(ms);
  return {
    signal: ctrl.signal,
    arm,
    get timedOut() {
      return timedOut;
    },
    done() {
      if (timer) clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

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
  persona?: string;
  search?: boolean;
  projectId?: string;
  messages: ApiMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onMeta?: (meta: { provider?: ProviderId; search?: boolean }) => void;
  onSources?: (sources: Source[]) => void;
}): Promise<void> {
  const t = linked(opts.signal, STREAM_TOTAL_MS);
  const tooSlow = () => new TimeoutError('The AI took too long to answer. Please try again.');
  try {
    t.arm(STREAM_IDLE_MS);
    const res = await fetch(FN_URL, {
      method: 'POST',
      signal: t.signal,
      headers: headers(opts.token),
      body: JSON.stringify({
        action: 'chat',
        mode: opts.mode,
        provider: opts.provider,
        persona: opts.persona,
        search: opts.search === true,
        projectId: opts.projectId,
        messages: opts.messages,
      }),
    });

    if (!res.ok) throw new Error(await readError(res as unknown as Response));
    if (!res.body) throw new Error('The server did not send a streaming response.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      t.arm(STREAM_IDLE_MS);
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let evt: { t?: string; error?: string; done?: boolean; meta?: { provider?: ProviderId; search?: boolean }; sources?: Source[] };
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.error) throw new Error(evt.error);
        if (evt.meta) opts.onMeta?.(evt.meta);
        if (evt.sources) opts.onSources?.(evt.sources);
        if (evt.t) opts.onText(evt.t);
        if (evt.done) return;
      }
    }
  } catch (e) {
    // Aborted by our own timer (not by the Stop button): say so in plain words.
    if (t.timedOut && !opts.signal.aborted) throw tooSlow();
    throw e;
  } finally {
    t.done();
  }
}

/** Normal (non-streaming) calls: "models", "title", "remember", "suggest", "transcribe". */
export async function callFunction<T>(token: string, body: Record<string, unknown>, timeoutMs = CALL_TIMEOUT_MS): Promise<T> {
  return post<T>(FN_URL, token, body, timeoutMs);
}

/** Permanently deletes the account (server checks the password). */
export async function deleteAccountRequest(token: string, password: string): Promise<void> {
  await post<{ deleted: boolean }>(DELETE_URL, token, { confirm: 'DELETE', password }, 60_000);
}

async function post<T>(url: string, token: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const t = linked(undefined, timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', signal: t.signal, headers: headers(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await readError(res as unknown as Response));
    return (await res.json()) as T;
  } catch (e) {
    if (t.timedOut) throw new Error('The server took too long to answer. Please try again.');
    throw e;
  } finally {
    t.done();
  }
}
