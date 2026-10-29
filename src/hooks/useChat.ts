import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ApiMessage, callFunction, streamChat } from '../lib/stream';
import { base64ToBytes, uuid } from '../lib/utils';
import type { ChatMessage, Conversation, ModeId, PickedImage } from '../types';

const BUCKET = 'chat-images';

type DbMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  image_path: string | null;
};

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed|failed to fetch|network error/i.test(msg)) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  return msg;
}

export function useChat() {
  const { profile } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setModeState] = useState<ModeId>('balanced');
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  // Refs hold the "latest" values so async code never reads stale state.
  const activeRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const modeRef = useRef<ModeId>('balanced');
  const abortRef = useRef<AbortController | null>(null);
  const memoryOnRef = useRef(true);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    memoryOnRef.current = profile?.memory_enabled !== false;
  }, [profile?.memory_enabled]);

  // Start new chats in the user's favourite mode.
  const defaultMode = profile?.default_mode;
  useEffect(() => {
    if (defaultMode && !activeRef.current) {
      setModeState(defaultMode);
      modeRef.current = defaultMode;
    }
  }, [defaultMode]);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('id,title,mode,updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (data) setConversations(data as Conversation[]);
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
    const m = (profile?.default_mode as ModeId | undefined) ?? 'balanced';
    modeRef.current = m;
    setModeState(m);
  }, [profile?.default_mode]);

  const setMode = useCallback(async (m: ModeId) => {
    setModeState(m);
    modeRef.current = m;
    const id = activeRef.current;
    if (id) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, mode: m } : c)));
      await supabase.from('conversations').update({ mode: m }).eq('id', id);
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    activeRef.current = id;
    setActiveId(id);
    setMessages([]);
    setLoadingConv(true);
    try {
      const { data: convo } = await supabase.from('conversations').select('mode').eq('id', id).maybeSingle();
      if (convo?.mode) {
        modeRef.current = convo.mode as ModeId;
        setModeState(convo.mode as ModeId);
      }
      const { data, error } = await supabase
        .from('messages')
        .select('id,role,content,image_path')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (activeRef.current !== id) return;

      const rows = (data ?? []) as DbMessage[];
      const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
      const urlByPath: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
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
          imagePath: r.image_path,
          imageUri: r.image_path ? urlByPath[r.image_path] : undefined,
        })),
      );
    } catch (e) {
      if (activeRef.current === id) {
        setMessages([
          { id: uuid(), role: 'model', content: '', error: `Could not load this chat. ${friendly(e)}` },
        ]);
      }
    } finally {
      if (activeRef.current === id) setLoadingConv(false);
    }
  }, []);

  /** Streams one answer from Gemini into the message `modelId`, then saves it. */
  const runStream = useCallback(
    async (convId: string, history: ApiMessage[], modelId: string, extra?: { title: boolean; userText: string }) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let acc = '';
      let dirty = false;
      let error: string | undefined;

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
          messages: history,
          signal: ctrl.signal,
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
        patchMessage(modelId, { content: acc, streaming: false, error });
      }

      if (acc.trim()) {
        const { error: dbErr } = await supabase
          .from('messages')
          .insert({ id: modelId, conversation_id: convId, role: 'model', content: acc });
        if (dbErr && activeRef.current === convId) {
          patchMessage(modelId, { error: 'This answer could not be saved to your history.' });
        }

        // Title + memory run in the background; they never block the chat.
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token && extra?.title) {
          callFunction<{ title: string }>(token, { action: 'title', text: extra.userText || 'Image' })
            .then(async ({ title }) => {
              if (!title) return;
              setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title } : c)));
              await supabase.from('conversations').update({ title }).eq('id', convId);
            })
            .catch(() => {});
        }
        if (token && memoryOnRef.current && extra?.userText) {
          callFunction(token, { action: 'remember', user: extra.userText, assistant: acc }).catch(() => {});
        }
      }

      loadConversations();
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    },
    [loadConversations, patchMessage],
  );

  const send = useCallback(
    async (text: string, image: PickedImage | null) => {
      const trimmed = text.trim();
      if (busy || (!trimmed && !image)) return;
      setBusy(true);

      let convId = activeRef.current;
      let isNew = false;
      const userId = (await supabase.auth.getSession()).data.session?.user.id;
      if (!userId) {
        setBusy(false);
        return;
      }

      try {
        if (!convId) {
          const { data, error } = await supabase
            .from('conversations')
            .insert({ mode: modeRef.current, title: trimmed.slice(0, 40) || 'Image chat' })
            .select('id,title,mode,updated_at')
            .single();
          if (error || !data) throw new Error(error?.message ?? 'Could not start a chat.');
          convId = data.id as string;
          isNew = true;
          activeRef.current = convId;
          setActiveId(convId);
          setConversations((prev) => [data as Conversation, ...prev]);
        }

        // Upload the picture (if any) to the user's private folder.
        let imagePath: string | null = null;
        if (image) {
          const path = `${userId}/${convId}/${uuid()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, base64ToBytes(image.base64), { contentType: image.mime || 'image/jpeg' });
          if (!upErr) imagePath = path;
        }

        const userMsg: ChatMessage = {
          id: uuid(),
          role: 'user',
          content: trimmed,
          imageUri: image?.uri,
          imagePath,
          imageB64: image?.base64,
          imageMime: image?.mime,
        };
        const modelMsg: ChatMessage = { id: uuid(), role: 'model', content: '', streaming: true };

        const prior = messagesRef.current.filter((m) => !m.error && (m.content || m.imageB64));
        const history: ApiMessage[] = [...prior, userMsg].map(toApi);

        setMessages((prev) => [...prev, userMsg, modelMsg]);

        const { error: msgErr } = await supabase.from('messages').insert({
          id: userMsg.id,
          conversation_id: convId,
          role: 'user',
          content: trimmed,
          image_path: imagePath,
        });
        if (msgErr) throw new Error(msgErr.message);

        await runStream(convId, history, modelMsg.id, { title: isNew, userText: trimmed });
      } catch (e) {
        setMessages((prev) => {
          const withoutPending = prev.filter((m) => !(m.role === 'model' && m.streaming));
          return [...withoutPending, { id: uuid(), role: 'model', content: '', error: friendly(e) }];
        });
        setBusy(false);
      }
    },
    [busy, runStream],
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
    // Remove the old answer from the history, then ask again.
    await supabase.from('messages').delete().eq('id', last.id);
    const modelMsg: ChatMessage = { id: uuid(), role: 'model', content: '', streaming: true };
    setMessages([...base, modelMsg]);
    const history = base.filter((m) => !m.error && (m.content || m.imageB64)).map(toApi);
    await runStream(convId, history, modelMsg.id);
  }, [busy, runStream]);

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeRef.current === id) newChat();
      await supabase.from('conversations').delete().eq('id', id);
    },
    [newChat],
  );

  return {
    conversations,
    activeId,
    messages,
    mode,
    busy,
    loadingConv,
    send,
    stop,
    regenerate,
    newChat,
    setMode,
    openConversation,
    deleteConversation,
    reloadConversations: loadConversations,
  };
}

function toApi(m: ChatMessage): ApiMessage {
  return {
    role: m.role,
    text: m.content,
    images: m.imageB64 ? [{ mime: m.imageMime ?? 'image/jpeg', data: m.imageB64 }] : undefined,
  };
}
