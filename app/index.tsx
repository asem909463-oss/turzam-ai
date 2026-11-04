import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import * as StoreReview from 'expo-store-review';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { ActionSheet } from '../src/components/ActionSheet';
import { Composer } from '../src/components/Composer';
import { FollowUps } from '../src/components/FollowUps';
import { HistoryDrawer } from '../src/components/HistoryDrawer';
import { ImageViewer } from '../src/components/ImageViewer';
import { VoiceOverlay } from '../src/components/VoiceOverlay';
import { StarSpinner } from '../src/components/Logo';
import { MessageBubble } from '../src/components/MessageBubble';
import { ModeSheet } from '../src/components/ModeSheet';
import { PressableScale } from '../src/components/PressableScale';
import { ReviewPrompt } from '../src/components/ReviewPrompt';
import { Skeleton } from '../src/components/Skeleton';
import { WordReveal } from '../src/components/WordReveal';
import { useAuth } from '../src/context/AuthContext';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { useChat } from '../src/hooks/useChat';
import { useProviders } from '../src/hooks/useProviders';
import { getMode, getPersona } from '../src/modes';
import { exportChat, type ExportFormat } from '../src/lib/export';
import { cleanForSpeech } from '../src/lib/speech';
import { getAiProcessingConsent, setAiProcessingConsent } from '../src/lib/aiConsent';
import { dismissReviewPrompt, recordSuccessfulAnswer, snoozeReviewPrompt } from '../src/lib/reviews';
import { greeting } from '../src/lib/utils';
import { darken, fonts, radius, Theme, withAlpha } from '../src/theme';
import type { ChatMessage, ModeId, PickedFile } from '../src/types';

const MODEL_LABEL: Record<string, string> = { auto: 'Auto', gemini: 'Gemini', openai: 'ChatGPT', anthropic: 'Claude' };
const QUICK_TOOLS: { id: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; mode: ModeId; prompt: string; research?: boolean }[] = [
  { id: 'research', label: 'Research', icon: 'globe-outline', mode: 'think', prompt: 'Deeply research this topic using reliable, current sources. Separate verified facts from analysis, cite sources, and end with the most useful next step: [describe the topic].', research: true },
  { id: 'study', label: 'Study', icon: 'school-outline', mode: 'tutor', prompt: 'Teach me this topic in clear, manageable steps. Use a concrete example, then check my understanding: [topic].' },
  { id: 'write', label: 'Write', icon: 'create-outline', mode: 'create', prompt: 'Help me write a polished, original draft for this purpose. Ask only if essential details are missing: [what I need to write].' },
  { id: 'code', label: 'Code', icon: 'code-slash-outline', mode: 'code', prompt: 'Help me solve this coding task. Give runnable code, explain key choices, and point out edge cases: [describe the task and language].' },
];

function pickFour<T>(list: T[], seed: number): T[] {
  // small deterministic shuffle so "Shuffle" gives a new set each tap
  const a = [...list];
  let s = seed * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, 4);
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const { user, profile } = useAuth();
  const routeParams = useLocalSearchParams<{ projectId?: string; conversationId?: string; outcomePrompt?: string }>();
  const [answer, setAnswer] = useState<{ text: string; nonce: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [aiConsentAllowed, setAiConsentAllowed] = useState(false);
  const [aiConsentLoading, setAiConsentLoading] = useState(true);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const handledRouteRef = useRef('');
  const chat = useChat({ onAnswer: (text) => {
    setAnswer({ text, nonce: Date.now() });
    recordSuccessfulAnswer().then((eligible) => { if (eligible) setReviewOpen(true); }).catch(() => {});
  } });
  const { providers, caps, error: providersError } = useProviders();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [seed, setSeed] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);

  const { syncList } = chat;
  useFocusEffect(
    useCallback(() => {
      syncList();
    }, [syncList]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setAiConsentLoading(true);
      if (!user?.id) {
        setAiConsentAllowed(false);
        setAiConsentOpen(false);
        setAiConsentLoading(false);
        return () => { cancelled = true; };
      }
      getAiProcessingConsent(user.id)
        .then((accepted) => {
          if (cancelled) return;
          setAiConsentAllowed(accepted);
          setAiConsentOpen(!accepted);
          if (!accepted) setVoiceOpen(false);
        })
        .catch(() => {
          if (cancelled) return;
          setAiConsentAllowed(false);
          setAiConsentOpen(true);
          setVoiceOpen(false);
        })
        .finally(() => {
          if (!cancelled) setAiConsentLoading(false);
        });
      return () => { cancelled = true; };
    }, [user?.id]),
  );

  useEffect(() => {
    const projectId = typeof routeParams.projectId === 'string' ? routeParams.projectId : '';
    const conversationId = typeof routeParams.conversationId === 'string' ? routeParams.conversationId : '';
    const outcomePrompt = typeof routeParams.outcomePrompt === 'string' ? routeParams.outcomePrompt : '';
    if (!projectId && !conversationId && !outcomePrompt) {
      handledRouteRef.current = '';
      return;
    }
    const key = outcomePrompt ? `outcome:${projectId}:${outcomePrompt}` : conversationId ? `chat:${conversationId}` : `project:${projectId}`;
    if (handledRouteRef.current === key) return;
    handledRouteRef.current = key;
    if (outcomePrompt) {
      chat.newChat(projectId || null);
      chat.setMode('founder');
      setPrefill({ text: outcomePrompt, nonce: Date.now() });
    } else if (conversationId) chat.openConversation(conversationId);
    else chat.newChat(projectId);
    router.setParams({ projectId: undefined, conversationId: undefined, outcomePrompt: undefined });
  }, [routeParams.projectId, routeParams.conversationId, routeParams.outcomePrompt, chat.openConversation, chat.newChat, chat.setMode, router]);

  const mode = getMode(chat.mode);
  const persona = getPersona(chat.persona);

  const sendWithConsent = useCallback((text: string, files: PickedFile[]) => {
    if (!aiConsentAllowed || aiConsentLoading) {
      setAiConsentOpen(true);
      return false;
    }
    chat.send(text, files);
    return true;
  }, [aiConsentAllowed, aiConsentLoading, chat.send]);

  const regenerateWithConsent = useCallback(() => {
    if (!aiConsentAllowed || aiConsentLoading) {
      setAiConsentOpen(true);
      return;
    }
    chat.regenerate();
  }, [aiConsentAllowed, aiConsentLoading, chat.regenerate]);

  const openVoice = useCallback(() => {
    if (!aiConsentAllowed || aiConsentLoading) {
      setAiConsentOpen(true);
      return;
    }
    if (caps?.voiceInput !== true) {
      toast.show(caps ? 'Voice input needs the Gemini key on the server.' : 'Could not confirm voice availability. Check your connection and try again.', 'info');
      return;
    }
    setVoiceOpen(true);
  }, [aiConsentAllowed, aiConsentLoading, caps, toast]);

  async function acceptAiConsent() {
    if (!user?.id || aiConsentSaving) return;
    setAiConsentSaving(true);
    try {
      await setAiProcessingConsent(user.id, true);
      setAiConsentAllowed(true);
      setAiConsentOpen(false);
      toast.show('Choice saved. Tap Send again when you are ready.', 'success');
    } catch {
      toast.show('Could not save your privacy choice on this device. Your draft has not been sent.', 'error');
    } finally {
      setAiConsentSaving(false);
    }
  }

  async function doExport(id: string, format: ExportFormat) {
    const title = chat.conversations.find((c) => c.id === id)?.title ?? 'Turzam chat';
    toast.show('Preparing your file…', 'info');
    try {
      const rows = await chat.loadForExport(id);
      await exportChat(title, rows, format);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not export this chat.', 'error');
    }
  }

  async function speak(text: string) {
    if (await Speech.isSpeakingAsync()) {
      Speech.stop();
      return;
    }
    Speech.speak(cleanForSpeech(text), { language: profile?.voice_lang || undefined });
  }
  const name = profile?.display_name?.trim();
  const empty = chat.messages.length === 0 && !chat.loadingConv;
  const ideas = useMemo(() => pickFour(mode.suggestions, seed), [mode.suggestions, seed]);

  // The list is inverted (newest at the bottom, sticks there while streaming), so we reverse the data.
  const data = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <MessageBubble
        message={item}
        isLast={index === 0}
        busy={chat.busy}
        accent={mode.color}
        onRegenerate={item.loadError && chat.activeId ? () => { void chat.openConversation(chat.activeId as string); } : regenerateWithConsent}
        onSpeak={speak}
        onOpenImage={setViewImage}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.busy, regenerateWithConsent, mode.color, profile?.voice_lang],
  );

  const greetWords = [{ text: greeting() + (name ? ',' : '') }, ...(name ? [{ text: name, italic: true }] : [])];

  return (
    <View style={{ flex: 1 }}>
      <Aurora />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <PressableScale onPress={() => setDrawerOpen(true)} style={styles.roundBtn} label="Open chat history">
            <Ionicons name="menu" size={22} color={colors.text} />
          </PressableScale>

          <PressableScale
            onPress={() => setModeOpen(true)}
            style={[styles.modePill, { borderColor: withAlpha(mode.color, 0.55), backgroundColor: withAlpha(mode.color, 0.12) }]}
            label="Change mode and AI"
          >
            <Ionicons name={mode.icon} size={16} color={mode.color} />
            <Text style={styles.modeText}>{mode.name}</Text>
            <Text style={styles.modelText}>· {chat.persona !== 'none' ? persona.name : MODEL_LABEL[chat.model] ?? 'Auto'}</Text>
            {chat.searchOn && caps?.search ? <Ionicons name="globe" size={13} color={mode.color} /> : null}
            <Ionicons name="chevron-down" size={14} color={colors.textDim} />
          </PressableScale>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {chat.activeId && chat.messages.length ? (
              <PressableScale onPress={() => setExportOpen(true)} style={styles.roundBtn} label="Export this chat">
                <Ionicons name="share-outline" size={20} color={colors.text} />
              </PressableScale>
            ) : null}
            <PressableScale onPress={() => chat.newChat()} style={styles.roundBtn} label="New chat">
              <Ionicons name="create-outline" size={21} color={colors.text} />
            </PressableScale>
          </View>
        </View>

        {chat.projectId ? (
          <PressableScale
            onPress={() => router.push({ pathname: '/project', params: { id: chat.projectId as string } })}
            style={styles.projectBanner}
            label="Open current project workspace"
          >
            <Ionicons name="layers-outline" size={15} color={colors.accentInk} />
            <Text style={styles.projectBannerText}>Project context is on</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
          </PressableScale>
        ) : null}

        {/* Body */}
        <View style={styles.column}>
          {chat.loadingConv ? (
            <View style={styles.skeletons}>
              <Skeleton width="55%" height={44} radius={18} style={{ alignSelf: 'flex-end' }} />
              <Skeleton width="90%" height={14} />
              <Skeleton width="80%" height={14} />
              <Skeleton width="60%" height={14} />
              <Skeleton width="45%" height={40} radius={18} style={{ alignSelf: 'flex-end', marginTop: 12 }} />
              <Skeleton width="85%" height={14} />
            </View>
          ) : empty ? (
            <Animated.ScrollView key={mode.id} entering={FadeIn.duration(300)} contentContainerStyle={styles.empty} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.homeIntro}>
                <View style={styles.homeEyebrow}>
                  <View style={styles.homeStar}><StarSpinner size={8} speed={4300} /></View>
                  <Text style={styles.homeEyebrowText}>TURZAM AI · YOUR THOUGHT PARTNER</Text>
                </View>
                <WordReveal words={greetWords} size={36} />
                <Text style={styles.homeSubtitle}>Powerful underneath. Effortless on the surface.</Text>
              </View>

              <PressableScale onPress={() => router.push('/outcome')} style={styles.outcomeCard} scaleTo={0.985} label="Open Outcome Engine">
                <LinearGradient colors={[darken(gradient[0], 0.18), darken(gradient[1], 0.14)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.outcomeGradient}>
                  <View style={styles.outcomeTop}>
                    <View style={styles.outcomeIcon}><StarSpinner size={13} speed={3600} /></View>
                    <View style={styles.outcomeText}>
                      <Text style={styles.outcomeEyebrow}>OUTCOME ENGINE</Text>
                      <Text style={styles.outcomeTitle}>Make progress you can point to.</Text>
                      <Text style={styles.outcomeCopy}>Turn a goal into a measured result and one clear first move.</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.outcomeBottom}>
                    <Text style={styles.outcomeTag}>PLAN  ·  DECIDE  ·  LAUNCH  ·  GROW</Text>
                    <Text style={styles.outcomeAction}>Build an outcome <Ionicons name="arrow-forward" size={13} color="#FFFFFF" /></Text>
                  </View>
                </LinearGradient>
              </PressableScale>

              <View style={styles.sectionHeading}>
                <View><Text style={styles.sectionTitle}>Jump straight in</Text><Text style={styles.sectionHint}>Choose a tool, then make it yours.</Text></View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickTools} style={styles.quickToolsScroll}>
                {QUICK_TOOLS.map((tool) => (
                  <PressableScale
                    key={tool.id}
                    onPress={() => {
                      chat.setMode(tool.mode);
                      if (tool.research) {
                        if (caps?.search === true) chat.setSearchOn(true);
                        else {
                          chat.setSearchOn(false);
                          toast.show('Live-source research needs the Gemini key on the server.', 'info');
                        }
                      }
                      setPrefill({ text: tool.prompt, nonce: Date.now() });
                    }}
                    style={[styles.quickTool, { borderColor: withAlpha(mode.color, 0.28), backgroundColor: withAlpha(mode.color, 0.07) }]}
                    label={`${tool.label} assistant`}
                  >
                    <Ionicons name={tool.icon} size={15} color={mode.color} />
                    <Text style={[styles.quickToolText, { color: colors.text }]}>{tool.label}</Text>
                  </PressableScale>
                ))}
              </ScrollView>
              <View style={styles.cardsHeading}>
                <Text style={styles.sectionTitle}>Try a quick start</Text>
                <PressableScale onPress={() => setSeed((x) => x + 1)} style={styles.shuffle} label="Shuffle ideas">
                  <Ionicons name="shuffle" size={15} color={colors.accentInk} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </PressableScale>
              </View>
              <View style={styles.cards}>
                {ideas.map((s, i) => (
                  <Animated.View key={`${seed}-${s.title}`} entering={FadeInDown.delay(180 + i * 55).duration(300)} style={styles.cardWrap}>
                    <PressableScale
                      onPress={() => setPrefill({ text: s.prompt, nonce: Date.now() })}
                      scaleTo={0.97}
                      style={[styles.card, { borderColor: withAlpha(mode.color, 0.24) }]}
                      label={s.title}
                    >
                      <View style={[styles.cardIcon, { backgroundColor: withAlpha(mode.color, 0.14) }]}>
                        <Ionicons name={mode.icon} size={14} color={mode.color} />
                      </View>
                      <Text style={styles.cardTitle}>{s.title}</Text>
                      <Text numberOfLines={2} style={styles.cardPrompt}>{s.prompt}</Text>
                    </PressableScale>
                  </Animated.View>
                ))}
              </View>
            </Animated.ScrollView>
          ) : (
            <FlatList
              inverted
              data={data}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingVertical: 12 }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                !chat.busy && chat.suggestions.length ? (
                  <FollowUps items={chat.suggestions} accent={mode.color} onPick={(t) => { sendWithConsent(t, []); }} />
                ) : undefined
              }
            />
          )}
        </View>

        {/* Composer */}
        <View style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
          <Composer
            busy={chat.busy}
            accent={mode.color}
            placeholder={`Message Turzam · ${chat.projectId ? 'Project' : mode.name}`}
            onSend={sendWithConsent}
            onStop={chat.stop}
            prefill={prefill}
            onVoice={openVoice}
            searchOn={chat.searchOn && caps?.search === true}
            onToggleSearch={() => {
              if (caps?.search !== true) {
                toast.show(providersError ? 'Could not confirm web search availability. Check your connection and retry.' : caps ? 'Web search needs the Gemini key on the server.' : 'Checking secure provider access. Try again in a moment.', 'info');
                return;
              }
              chat.setSearchOn(!chat.searchOn);
              toast.show(chat.searchOn ? 'Web search off' : 'Web search on: answers will cite sources', 'info');
            }}
          />
          <Text style={styles.disclaimer}>Turzam can make mistakes. Check important facts.</Text>
        </View>
      </KeyboardAvoidingView>

      <HistoryDrawer
        open={drawerOpen}
        loading={chat.listLoading}
        historyError={chat.historyError}
        onRetryHistory={() => { void chat.syncList(); }}
        conversations={chat.conversations}
        folders={chat.folders}
        activeId={chat.activeId}
        email={user?.email ?? ''}
        onClose={() => setDrawerOpen(false)}
        onNewChat={() => {
          chat.newChat();
          setDrawerOpen(false);
        }}
        onSelect={(id) => {
          chat.openConversation(id);
          setDrawerOpen(false);
        }}
        onRename={async (id, title) => {
          const ok = await chat.renameConversation(id, title);
          toast.show(ok ? 'Chat renamed' : 'Could not rename the chat', ok ? 'success' : 'error');
        }}
        onDelete={async (id) => {
          const ok = await chat.deleteConversation(id);
          toast.show(ok ? 'Chat deleted' : 'Could not delete the chat', ok ? 'success' : 'error');
        }}
        onPin={async (id, pinned) => {
          const ok = await chat.togglePin(id, pinned);
          toast.show(ok ? (pinned ? 'Pinned' : 'Unpinned') : 'Could not update the chat', ok ? 'success' : 'error');
        }}
        onArchive={async (id, archived) => {
          const ok = await chat.setArchived(id, archived);
          toast.show(ok ? (archived ? 'Chat archived' : 'Chat restored') : 'Could not update the chat', ok ? 'success' : 'error');
        }}
        onMove={async (id, folderId) => {
          const ok = await chat.moveToFolder(id, folderId);
          toast.show(ok ? 'Chat moved' : 'Could not move the chat', ok ? 'success' : 'error');
        }}
        onExport={doExport}
        onCreateFolder={async (name) => {
          const f = await chat.createFolder(name, mode.color);
          toast.show(f ? `Folder “${f.name}” created` : 'Could not create the folder', f ? 'success' : 'error');
        }}
        onRenameFolder={async (id, name) => {
          const ok = await chat.renameFolder(id, name);
          toast.show(ok ? 'Folder renamed' : 'Could not rename the folder', ok ? 'success' : 'error');
        }}
        onDeleteFolder={async (id) => {
          const ok = await chat.deleteFolder(id);
          toast.show(ok ? 'Folder deleted. Its chats are kept.' : 'Could not delete the folder', ok ? 'success' : 'error');
        }}
        onSearchMessages={chat.searchMessages}
        onOpenMemory={() => {
          setDrawerOpen(false);
          router.push('/memory');
        }}
        onOpenProjects={() => {
          setDrawerOpen(false);
          router.push('/projects');
        }}
        onOpenOutcome={() => {
          setDrawerOpen(false);
          router.push('/outcome');
        }}
        onOpenSettings={() => {
          setDrawerOpen(false);
          router.push('/settings');
        }}
      />

      <ActionSheet
        visible={exportOpen}
        title="Export this chat"
        onClose={() => setExportOpen(false)}
        actions={[
          { label: 'PDF document', icon: 'document-text-outline', onPress: () => chat.activeId && doExport(chat.activeId, 'pdf') },
          { label: 'Markdown (.md)', icon: 'logo-markdown', onPress: () => chat.activeId && doExport(chat.activeId, 'md') },
          { label: 'Plain text (.txt)', icon: 'reader-outline', onPress: () => chat.activeId && doExport(chat.activeId, 'txt') },
        ]}
      />

      <VoiceOverlay
        visible={voiceOpen}
        busy={chat.busy}
        answer={answer}
        lang={profile?.voice_lang || undefined}
        speakReplies={profile?.voice_reply !== false}
        accent={mode.color}
        onUtterance={(t) => { sendWithConsent(t, []); }}
        onStopGenerating={chat.stop}
        onClose={() => setVoiceOpen(false)}
      />

      <ImageViewer uri={viewImage} onClose={() => setViewImage(null)} />

      <Modal transparent animationType="fade" visible={aiConsentOpen} onRequestClose={() => setAiConsentOpen(false)}>
        <View style={styles.consentBackdrop}>
          <ScrollView
            accessibilityViewIsModal
            style={styles.consentCard}
            contentContainerStyle={styles.consentContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.consentStar}><StarSpinner size={11} speed={3200} /></View>
            <Text style={styles.consentEyebrow}>YOUR DATA · YOUR CHOICE</Text>
            <Text style={styles.consentTitle}>Before your first AI answer</Text>
            <Text style={styles.consentBody}>
              When you tap Send, your prompt, relevant chat context, and any attached files are sent to the AI provider selected for your answer (such as Gemini, OpenAI, or Anthropic when connected). The provider processes them under its own privacy policy. Voice audio is sent for transcription only if you start voice input.
            </Text>
            <Text style={styles.consentNotice}>
              Do not include passwords or access tokens. You can turn off future AI sharing in Settings. Your unsent draft and files stay in the composer; nothing is uploaded until you accept and tap Send again.
            </Text>
            <PressableScale
              label="Read the Privacy Policy"
              style={styles.consentPrivacy}
              onPress={() => {
                setAiConsentOpen(false);
                router.push({ pathname: '/legal', params: { doc: 'privacy' } });
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.accentInk} />
              <Text style={styles.consentPrivacyText}>Read the Privacy Policy</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accentInk} />
            </PressableScale>
            <PressableScale
              label="Agree to AI processing and continue"
              disabled={aiConsentSaving}
              style={[styles.consentPrimary, aiConsentSaving && { opacity: 0.65 }]}
              onPress={acceptAiConsent}
            >
              <Text style={styles.consentPrimaryText}>{aiConsentSaving ? 'Saving choice…' : 'Agree & continue'}</Text>
              {!aiConsentSaving ? <Ionicons name="arrow-forward" size={17} color={colors.onAccent} /> : null}
            </PressableScale>
            <PressableScale label="Not now; keep my draft unsent" style={styles.consentLater} onPress={() => setAiConsentOpen(false)}>
              <Text style={styles.consentLaterText}>Not now</Text>
            </PressableScale>
          </ScrollView>
        </View>
      </Modal>

      <ReviewPrompt
        visible={reviewOpen}
        onRate={async () => {
          setReviewOpen(false);
          await dismissReviewPrompt();
          try {
            if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
            else toast.show('The official rating prompt is available from an app-store installation.', 'info');
          } catch {
            toast.show('Could not open the rating prompt right now.', 'info');
          }
        }}
        onLater={async () => { setReviewOpen(false); await snoozeReviewPrompt(); }}
        onDismiss={async () => { setReviewOpen(false); await dismissReviewPrompt(); }}
      />

      <ModeSheet
        visible={modeOpen}
        current={chat.mode}
        model={chat.model}
        providers={providers}
        onSelect={chat.setMode}
        persona={chat.persona}
        onSelectPersona={(p) => {
          chat.setPersona(p);
          toast.show(p === 'none' ? 'Default personality' : `${getPersona(p).name} personality`, 'info');
        }}
        searchOn={chat.searchOn}
        searchAvailable={caps?.search === true}
        searchStatus={providersError ? 'error' : caps === null ? 'checking' : undefined}
        onToggleSearch={chat.setSearchOn}
        onSelectModel={(m) => {
          chat.setModel(m);
          toast.show(`Answers by ${MODEL_LABEL[m] ?? 'Auto'}`, 'info');
        }}
        onClose={() => setModeOpen(false)}
      />
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
    roundBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: withAlpha(t.colors.surface, 0.92),
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modePill: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1 },
    modeText: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
    modelText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 13 },
    projectBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', width: '100%', maxWidth: 760, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.colors.border, backgroundColor: withAlpha(t.colors.surface, 0.72) },
    projectBannerText: { flex: 1, color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 12 },
    column: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
    skeletons: { padding: 20, gap: 12, paddingTop: 30 },
    empty: { flexGrow: 1, alignItems: 'stretch', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
    homeIntro: { alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 },
    homeEyebrow: { height: 24, flexDirection: 'row', alignItems: 'center', gap: 7 },
    homeStar: { width: 20, height: 20, borderRadius: 10, backgroundColor: withAlpha(t.colors.accent, 0.15), alignItems: 'center', justifyContent: 'center' },
    homeEyebrowText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 9.5, letterSpacing: 1.2 },
    homeSubtitle: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13.5, lineHeight: 19 },
    outcomeCard: { borderRadius: radius.xl, overflow: 'hidden', shadowColor: t.colors.accent2, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    outcomeGradient: { padding: 15, gap: 14 },
    outcomeTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    outcomeIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', alignItems: 'center', justifyContent: 'center' },
    outcomeText: { flex: 1, gap: 3 },
    outcomeEyebrow: { color: 'rgba(255,255,255,0.82)', fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 1.3 },
    outcomeTitle: { color: '#FFFFFF', fontFamily: fonts.uiBold, fontSize: 17, lineHeight: 21 },
    outcomeCopy: { color: 'rgba(255,255,255,0.88)', fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 17 },
    outcomeBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.24)' },
    outcomeTag: { color: 'rgba(255,255,255,0.83)', fontFamily: fonts.uiBold, fontSize: 8.5, letterSpacing: 0.7 },
    outcomeAction: { color: '#FFFFFF', fontFamily: fonts.uiBold, fontSize: 11, flexDirection: 'row', alignItems: 'center' },
    sectionHeading: { marginTop: 1 },
    sectionTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
    sectionHint: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 17, marginTop: 2 },
    cardsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -2 },
    cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignSelf: 'stretch' },
    cardWrap: { width: '48.6%', flexGrow: 1 },
    card: {
      backgroundColor: withAlpha(t.colors.surface, 0.94),
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: 14,
      gap: 6,
      minHeight: 110,
    },
    cardIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
    cardPrompt: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 18 },
    shuffle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: withAlpha(t.colors.accent, 0.1) },
    shuffleText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 11 },
    quickToolsScroll: { alignSelf: 'stretch', flexGrow: 0, marginTop: -5, marginBottom: 1 },
    quickTools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
    quickTool: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1 },
    quickToolText: { fontFamily: fonts.ui, fontSize: 12 },
    disclaimer: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, textAlign: 'center', marginTop: 6 },
    consentBackdrop: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
    consentCard: { width: '100%', maxWidth: 480, maxHeight: '86%', borderRadius: radius.xl, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, overflow: 'hidden' },
    consentContent: { padding: 22, gap: 12, alignItems: 'stretch' },
    consentStar: { width: 46, height: 46, borderRadius: 16, backgroundColor: withAlpha(t.colors.accent, 0.14), alignItems: 'center', justifyContent: 'center' },
    consentEyebrow: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1.2 },
    consentTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
    consentBody: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21 },
    consentNotice: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 12.5, lineHeight: 19, padding: 12, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.accent, 0.08), borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.18) },
    consentPrivacy: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.bgElevated },
    consentPrivacyText: { flex: 1, color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 13 },
    consentPrimary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: t.colors.accent },
    consentPrimaryText: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 15 },
    consentLater: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
    consentLaterText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 13 },
  });
