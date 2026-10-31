import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePrefs } from '../context/ThemeContext';
import { fileKind, purgeConversationFiles, removeStoredFiles, uploadAttachments } from '../lib/attachments';
import { supabase } from '../lib/supabase';
import { ApiMessage, callFunction, streamChat } from '../lib/stream';
import { uuid } from '../lib/utils';
import type { MessageHit } from '../components/HistoryDrawer';
import type { Attachment, ChatMessage, Conversation, Folder, ModeId, ModelChoice, PersonaId, PickedFile, ProviderId, Source } from '../types';

const BUCKET = 'attachments';

type DbMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  attachments: Attachment[] | null;
  provider: string | null;
  sources: Source[] | null;
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

export function useChat(opts?: { onAnswer?: (text: string) => void }) {
  const { profile } = useAuth();
  const { prefs } = usePrefs();
  const onAnswerRef = useRef(opts?.onAnswer);
  useEffect(() => {
    onAnswerRef.current = opts?.onAnswer;
  }, [opts?.onAnswer]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setModeState] = useState<ModeId>('founder');
  const [model, setModelState] = useState<ModelChoice>('auto');
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [persona, setPersonaState] = useState<PersonaId>('none');
  const [searchOn, setSearchOnState] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);

  // Refs hold the "latest" values so async code never reads stale state.
  const activeRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const modeRef = useRef<ModeId>('founder');
  const modelRef = useRef<ModelChoice>('auto');
  const personaRef = useRef<PersonaId>('none');
  const searchRef = useRef(false);
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
  const defaultPersona = profile?.default_persona;
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
    if (defaultPersona) {
      setPersonaState(defaultPersona);
      personaRef.current = defaultPersona;
    }
  }, [defaultMode, defaultModel, defaultPersona]);

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    const { data } = await supabase
      .from('conversations')
      .select('id,title,mode,model,persona,pinned,archived,folder_id,updated_at')
      .order('updated_at', { ascending: false })
      .limit(300);
    const list = (data ?? []) as Conversation[];
    if (data) setConversations(list);
    setListLoading(false);
    return list;
  }, []);

  const loadFolders = useCallback(async () => {
    const { data } = await supabase.from('folders').select('id,name,color').order('created_at', { ascending: true });
    if (data) setFolders(data as Folder[]);
  }, []);

  useEffect(() => {
    loadConversations();
    loadFolders();
  }, [loadConversations, loadFolders]);

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
    const p = (profile?.default_persona as PersonaId | undefined) ?? 'none';
    modeRef.current = m;
    modelRef.current = k;
    personaRef.current = p;
    setModeState(m);
    setModelState(k);
    setPersonaState(p);
  }, [profile?.default_mode, profile?.default_model, profile?.default_persona]);

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

  const setPersona = useCallback(async (p: PersonaId) => {
    setPersonaState(p);
    personaRef.current = p;
    const id = activeRef.current;
    if (id) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, persona: p } : c)));
      await supabase.from('conversations').update({ persona: p }).eq('id', id);
    }
  }, []);

  const setSearchOn = useCallback((v: boolean) => {
    searchRef.current = v;
    setSearchOnState(v);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    activeRef.current = id;
    setActiveId(id);
    setMessages([]);
    setSuggestions([]);
    setLoadingConv(true);
    try {
      const { data: convo } = await supabase.from('conversations').select('mode,model,persona').eq('id', id).maybeSingle();
      if (convo?.mode) {
        modeRef.current = convo.mode as ModeId;
        setModeState(convo.mode as ModeId);
      }
      if (convo?.model) {
        modelRef.current = convo.model as ModelChoice;
        setModelState(convo.model as ModelChoice);
      }
      if (convo?.persona) {
        personaRef.current = convo.persona as PersonaId;
        setPersonaState(convo.persona as PersonaId);
      }
      const { data, error } = await supabase
        .from('messages')
        .select('id,role,content,attachments,provider,sources')
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
          sources: r.sources ?? [],
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
      let sources: Source[] = [];
      let searched = false;

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
          persona: personaRef.current,
          search: searchRef.current,
          messages: history,
          signal: ctrl.signal,
          onSources: (list) => {
            sources = list;
            if (activeRef.current === convId) patchMessage(modelId, { sources: list });
          },
          onMeta: (meta) => {
            searched = meta.search === true;
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
        patchMessage(modelId, { content: acc, streaming: false, working: undefined, error, provider, sources, searched });
      }

      if (acc.trim()) {
        const { error: dbErr } = await supabase
          .from('messages')
          .insert({ id: modelId, conversation_id: convId, role: 'model', content: acc, provider, sources });
        if (dbErr && activeRef.current === convId) {
          patchMessage(modelId, { error: 'This answer could not be saved to your history.' });
        }

        if (!error) onAnswerRef.current?.(acc);

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
        if (token && memoryOnRef.current && lastUser && !ctrl.signal.aborted) {
          callFunction(token, { action: 'remember', user: lastUser, assistant: acc }).catch(() => {});
        }
        if (token && followRef.current && !error && !ctrl.signal.aborted) {
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
            .insert({ mode: modeRef.current, model: modelRef.current, persona: personaRef.current, title: trimmed.slice(0, 40) || files[0]?.name || 'New chat' })
            .select('id,title,mode,model,persona,pinned,archived,folder_id,updated_at')
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
          attachments = await uploadAttachments(userId, convId as string, files);
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
        if (msgErr) {
          // The message was not saved, so its files would be orphans: remove them again.
          if (attachments.length) await removeStoredFiles(attachments.map((a) => a.path as string));
          throw new Error(msgErr.message);
        }

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
      // Files first: if they cannot be removed the chat is kept (put back in the list) so nothing is orphaned.
      if (userId) {
        try {
          await purgeConversationFiles(userId, id);
        } catch {
          loadConversations();
          return false;
        }
      }
      const { error } = await supabase.from('conversations').delete().eq('id', id);
      if (error) loadConversations();
      return !error;
    },
    [newChat, loadConversations],
  );

  const patchConversation = useCallback(async (id: string, patch: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from('conversations').update(patch).eq('id', id);
    if (error) loadConversations();
    return !error;
  }, [loadConversations]);

  const togglePin = useCallback(
    (id: string, pinned: boolean) => patchConversation(id, { pinned }),
    [patchConversation],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      const ok = await patchConversation(id, archived ? { archived, pinned: false } : { archived });
      if (ok && archived && activeRef.current === id) newChat();
      return ok;
    },
    [patchConversation, newChat],
  );

  const moveToFolder = useCallback(
    (id: string, folderId: string | null) => patchConversation(id, { folder_id: folderId }),
    [patchConversation],
  );

  const createFolder = useCallback(async (name: string, color: string): Promise<Folder | null> => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return null;
    const { data, error } = await supabase.from('folders').insert({ name: clean, color }).select('id,name,color').single();
    if (error || !data) return null;
    setFolders((prev) => [...prev, data as Folder]);
    return data as Folder;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return false;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: clean } : f)));
    const { error } = await supabase.from('folders').update({ name: clean }).eq('id', id);
    return !error;
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setConversations((prev) => prev.map((c) => (c.folder_id === id ? { ...c, folder_id: null } : c)));
    const { error } = await supabase.from('folders').delete().eq('id', id);
    return !error;
  }, []);

  /** Full text of a chat for export (loads from the database, so it works for any chat in the list). */
  const loadForExport = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('messages')
      .select('role,content,attachments,sources,created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    return (data ?? []) as {
      role: 'user' | 'model';
      content: string;
      attachments: Attachment[] | null;
      sources: Source[] | null;
      created_at: string;
    }[];
  }, []);

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
    persona,
    searchOn,
    folders,
    setPersona,
    setSearchOn,
    togglePin,
    setArchived,
    moveToFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    loadForExport,
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
