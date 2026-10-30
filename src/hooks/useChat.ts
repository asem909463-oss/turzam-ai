import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePrefs } from '../context/ThemeContext';
import { fileKind, purgeConversationFiles, uploadAttachment } from '../lib/attachments';
import { supabase } from '../lib/supabase';
import { ApiMessage, callFunction, streamChat } from '../lib/stream';
import { uuid } from '../lib/utils';
import type { MessageHit } from '../components/HistoryDrawer';
import type { Attachment, ChatMessage, Conversation, ModeId, ModelChoice, PickedFile, ProviderId } from '../types';

const BUCKET = 'attachments';

type DbMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  attachments: Attachment[] | null;
  provider: string | null;
};

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed|failed to fetch|network error/i.test(msg)) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  return msg;
}

function toApi(m: ChatMessage): ApiMessage {
  return {
    role: m.role,
    text: m.content,
    files: (m.attachments ?? [])
      .filter((a) => !!a.path)
      .map((a) => ({ name: a.name, mime: a.mime, path: a.path as string })),
  };
}

function usable(m: ChatMessage): boolean {
  return !m.error && (!!m.content || !!m.attachments?.length);
}

export function useChat() {
  const { profile } = useAuth();
  const { prefs } = usePrefs();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setModeState] = useState<ModeId>('founder');
  const [model, setModelState] = useState<ModelChoice>('auto');
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Refs hold the "latest" values so async code never reads stale state.
  const activeRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const modeRef = useRef<ModeId>('founder');
  const modelRef = useRef<ModelChoice>('auto');
  const abortRef = useRef<AbortController | null>(null);
  const memoryOnRef = useRef(true);
  const followRef = useRef(true);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    memoryOnRef.current = profile?.memory_enabled !== false;
  }, [profile?.memory_enabled]);
  useEffect(() => {
    followRef.current = prefs.followUps;
  }, [prefs.followUps]);

  // New chats start in the user's favourite mode / model.
  const defaultMode = profile?.default_mode;
  const defaultModel = profile?.default_model;
  useEffect(() => {
    if (activeRef.current) return;
    if (defaultMode) {
      setModeState(defaultMode);
      modeRef.current = defaultMode;
    }
    if (defaultModel) {
      setModelState(defaultModel);
      modelRef.current = defaultModel;
    }
  }, [defaultMode, defaultModel]);

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    const { data } = await supabase
      .from('conversations')
      .select('id,title,mode,model,updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    const list = (data ?? []) as Conversation[];
    if (data) setConversations(list);
    setListLoading(false);
    return list;
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    activeRef.current = null;
    setActiveId(null);
    setMessages([]);
    setSuggestions([]);
    const m = (profile?.default_mode as ModeId | undefined) ?? 'founder';
    const k = (profile?.default_model as ModelChoice | undefined) ?? 'auto';
    modeRef.current = m;
    modelRef.current = k;
    setModeState(m);
    setModelState(k);
  }, [profile?.default_mode, profile?.default_model]);

  /** Refreshes the list; if the open chat was deleted elsewhere (Settings), leaves it. */
  const syncList = useCallback(async () => {
    const list = await loadConversations();
    if (activeRef.current && !list.some((c) => c.id === activeRef.current)) newChat();
  }, [loadConversations, newChat]);

  const setMode = useCallback(async (m: ModeId) => {
    setModeState(m);
    modeRef.current = m;
    const id = activeRef.current;
    if (id) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, mode: m } : c)));
      await supabase.from('conversations').update({ mode: m }).eq('id', id);
    }
  }, []);

  const setModel = useCallback(async (k: ModelChoice) => {
    setModelState(k);
    modelRef.current = k;
    const id = activeRef.current;
    if (id) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, model: k } : c)));
      await supabase.from('conversations').update({ model: k }).eq('id', id);
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    activeRef.current = id;
    setActiveId(id);
    setMessages([]);
    setSuggestions([]);
    setLoadingConv(true);
    try {
      const { data: convo } = await supabase.from('conversations').select('mode,model').eq('id', id).maybeSingle();
      if (convo?.mode) {
        modeRef.current = convo.mode as ModeId;
        setModeState(convo.mode as ModeId);
      }
      if (convo?.model) {
        modelRef.current = convo.model as ModelChoice;
        setModelState(convo.model as ModelChoice);
      }
      const { data, error } = await supabase
        .from('messages')
        .select('id,role,content,attachments,provider')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (activeRef.current !== id) return;

      const rows = (data ?? []) as DbMessage[];
      const imagePaths: string[] = [];
      for (const r of rows) {
        for (const a of r.attachments ?? []) {
          if (a.path && fileKind(a.mime, a.name) === 'image') imagePaths.push(a.path);
        }
      }
      const urlByPath: Record<string, string> = {};
      if (imagePaths.length) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(imagePaths, 3600);
        signed?.forEach((s) => {
          if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl;
        });
      }
      if (activeRef.current !== id) return;
      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          provider: (r.provider as ProviderId | null) ?? null,
          attachments: (r.attachments ?? []).map((a) => ({ ...a, uri: a.path ? urlByPath[a.path] : undefined })),
        })),
      );
    } catch (e) {
      if (activeRef.current === id) {
        setMessages([{ id: uuid(), role: 'model', content: '', error: `Could not load this chat. ${friendly(e)}` }]);
      }
    } finally {
      if (activeRef.current === id) setLoadingConv(false);
    }
  }, []);

  /** Streams one answer into the message `modelId`, then saves it. */
  const runStream = useCallback(
    async (convId: string, history: ApiMessage[], modelId: string, extra?: { title: boolean; userText: string }) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let acc = '';
      let dirty = false;
      let error: string | undefined;
      let provider: ProviderId | null = null;

      // Update the screen ~20 times a second instead of for every tiny chunk: smoother and cheaper.
      const timer = setInterval(() => {
        if (!dirty) return;
        dirty = false;
        if (activeRef.current === convId) patchMessage(modelId, { content: acc });
      }, 50);

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Please sign in again.');
        await streamChat({
          token,
          mode: modeRef.current,
          provider: modelRef.current,
          messages: history,
          signal: ctrl.signal,
          onMeta: (meta) => {
            if (meta.provider) {
              provider = meta.provider;
              if (activeRef.current === convId) patchMessage(modelId, { provider: meta.provider });
            }
          },
          onText: (t) => {
            acc += t;
            dirty = true;
          },
        });
      } catch (e) {
        if (!ctrl.signal.aborted) error = friendly(e);
      } finally {
        clearInterval(timer);
      }

      if (activeRef.current === convId) {
        patchMessage(modelId, { content: acc, streaming: false, working: undefined, error, provider });
      }

      if (acc.trim()) {
        const { error: dbErr } = await supabase
          .from('messages')
          .insert({ id: modelId, conversation_id: convId, role: 'model', content: acc, provider });
        if (dbErr && activeRef.current === convId) {
          patchMessage(modelId, { error: 'This answer could not be saved to your history.' });
        }

        // Title, memory and follow-up ideas run in the background; they never block the chat.
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const lastUser = extra?.userText || [...messagesRef.current].reverse().find((m) => m.role === 'user')?.content || '';
        if (token && extra?.title) {
          callFunction<{ title: string }>(token, { action: 'title', text: lastUser || 'Files' })
            .then(async ({ title }) => {
              if (!title) return;
              setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title } : c)));
              await supabase.from('conversations').update({ title }).eq('id', convId);
            })
            .catch(() => {});
        }
        if (token && memoryOnRef.current && lastUser) {
          callFunction(token, { action: 'remember', user: lastUser, assistant: acc }).catch(() => {});
        }
        if (token && followRef.current && !error) {
          callFunction<{ suggestions: string[] }>(token, {
            action: 'suggest',
            user: lastUser,
            assistant: acc,
            mode: modeRef.current,
          })
            .then((r) => {
              if (activeRef.current === convId && !abortRef.current) setSuggestions(r.suggestions ?? []);
            })
            .catch(() => {});
        }
      }

      loadConversations();
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    },
    [loadConversations, patchMessage],
  );

  const send = useCallback(
    async (text: string, files: PickedFile[]) => {
      const trimmed = text.trim();
      if (busy || (!trimmed && !files.length)) return;
      setBusy(true);
      setSuggestions([]);

      const userId = (await supabase.auth.getSession()).data.session?.user.id;
      if (!userId) {
        setBusy(false);
        return;
      }

      let convId = activeRef.current;
      let isNew = false;
      const modelMsg: ChatMessage = {
        id: uuid(),
        role: 'model',
        content: '',
        streaming: true,
        working: files.length ? 'Reading your files' : undefined,
      };

      try {
        if (!convId) {
          const { data, error } = await supabase
            .from('conversations')
            .insert({ mode: modeRef.current, model: modelRef.current, title: trimmed.slice(0, 40) || files[0]?.name || 'New chat' })
            .select('id,title,mode,model,updated_at')
            .single();
          if (error || !data) throw new Error(error?.message ?? 'Could not start a chat.');
          convId = data.id as string;
          isNew = true;
          activeRef.current = convId;
          setActiveId(convId);
          setConversations((prev) => [data as Conversation, ...prev]);
        }

        const prior = messagesRef.current.filter(usable);
        const localAtts: Attachment[] = files.map((f) => ({
          id: uuid(),
          name: f.name,
          mime: f.mime,
          size: f.size,
          uri: f.uri,
          path: null,
        }));
        const userMsg: ChatMessage = { id: uuid(), role: 'user', content: trimmed, attachments: localAtts };

        // Show the message straight away, then upload the files.
        setMessages((prev) => [...prev, userMsg, modelMsg]);

        let attachments: Attachment[] = [];
        if (files.length) {
          attachments = await Promise.all(files.map((f) => uploadAttachment(userId, convId as string, f)));
          userMsg.attachments = attachments;
          patchMessage(userMsg.id, { attachments });
        }

        const { error: msgErr } = await supabase.from('messages').insert({
          id: userMsg.id,
          conversation_id: convId,
          role: 'user',
          content: trimmed,
          attachments: attachments.map(({ id, name, mime, size, path }) => ({ id, name, mime, size, path })),
        });
        if (msgErr) throw new Error(msgErr.message);

        const history = [...prior, userMsg].map(toApi);
        await runStream(convId, history, modelMsg.id, { title: isNew, userText: trimmed });
      } catch (e) {
        setMessages((prev) => {
          const withoutPending = prev.filter((m) => m.id !== modelMsg.id);
          return [...withoutPending, { id: uuid(), role: 'model', content: '', error: friendly(e) }];
        });
        setBusy(false);
      }
    },
    [busy, runStream, patchMessage],
  );

  const regenerate = useCallback(async () => {
    const convId = activeRef.current;
    if (!convId || busy) return;
    const current = messagesRef.current;
    const last = current[current.length - 1];
    if (!last || last.role !== 'model') return;

    const base = current.slice(0, -1);
    if (!base.length || base[base.length - 1].role !== 'user') return;

    setBusy(true);
    setSuggestions([]);
    // Remove the old answer from the history, then ask again.
    await supabase.from('messages').delete().eq('id', last.id);
    const modelMsg: ChatMessage = { id: uuid(), role: 'model', content: '', streaming: true };
    setMessages([...base, modelMsg]);
    const history = base.filter(usable).map(toApi);
    await runStream(convId, history, modelMsg.id);
  }, [busy, runStream]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    const { error } = await supabase.from('conversations').update({ title }).eq('id', id);
    return !error;
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const userId = (await supabase.auth.getSession()).data.session?.user.id;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeRef.current === id) newChat();
      if (userId) await purgeConversationFiles(userId, id);
      const { error } = await supabase.from('conversations').delete().eq('id', id);
      return !error;
    },
    [newChat],
  );

  const searchMessages = useCallback(async (query: string): Promise<MessageHit[]> => {
    const q = query.trim();
    if (q.length < 2) return [];
    const esc = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const { data, error } = await supabase
      .from('messages')
      .select('conversation_id,content')
      .ilike('content', `%${esc}%`)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error || !data) return [];
    const lower = q.toLowerCase();
    return (data as { conversation_id: string; content: string }[]).map((r) => {
      const i = Math.max(0, r.content.toLowerCase().indexOf(lower));
      const start = Math.max(0, i - 24);
      const piece = r.content.slice(start, start + 90).replace(/\s+/g, ' ');
      return { conversationId: r.conversation_id, snippet: `${start > 0 ? '…' : ''}${piece}` };
    });
  }, []);

  return {
    conversations,
    listLoading,
    activeId,
    messages,
    mode,
    model,
    busy,
    loadingConv,
    suggestions,
    send,
    stop,
    regenerate,
    newChat,
    setMode,
    setModel,
    openConversation,
    renameConversation,
    deleteConversation,
    searchMessages,
    syncList,
  };
}
