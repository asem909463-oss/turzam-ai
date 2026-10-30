import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { Composer } from '../src/components/Composer';
import { FollowUps } from '../src/components/FollowUps';
import { HistoryDrawer } from '../src/components/HistoryDrawer';
import { Logo } from '../src/components/Logo';
import { MessageBubble } from '../src/components/MessageBubble';
import { ModeSheet } from '../src/components/ModeSheet';
import { Motto } from '../src/components/Motto';
import { PressableScale } from '../src/components/PressableScale';
import { Skeleton } from '../src/components/Skeleton';
import { WordReveal } from '../src/components/WordReveal';
import { useAuth } from '../src/context/AuthContext';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { useChat } from '../src/hooks/useChat';
import { useProviders } from '../src/hooks/useProviders';
import { getMode } from '../src/modes';
import { greeting } from '../src/lib/utils';
import { fonts, radius, Theme, withAlpha } from '../src/theme';
import type { ChatMessage } from '../src/types';

const MODEL_LABEL: Record<string, string> = { auto: 'Auto', gemini: 'Gemini', openai: 'ChatGPT', anthropic: 'Claude' };

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
  const { colors } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const { user, profile } = useAuth();
  const chat = useChat();
  const { providers } = useProviders();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [seed, setSeed] = useState(1);

  const { syncList } = chat;
  useFocusEffect(
    useCallback(() => {
      syncList();
    }, [syncList]),
  );

  const mode = getMode(chat.mode);
  const name = profile?.display_name?.trim();
  const empty = chat.messages.length === 0 && !chat.loadingConv;
  const ideas = useMemo(() => pickFour(mode.suggestions, seed), [mode.suggestions, seed]);

  // The list is inverted (newest at the bottom, sticks there while streaming), so we reverse the data.
  const data = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <MessageBubble message={item} isLast={index === 0} busy={chat.busy} accent={mode.color} onRegenerate={chat.regenerate} />
    ),
    [chat.busy, chat.regenerate, mode.color],
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
            <Text style={styles.modelText}>· {MODEL_LABEL[chat.model] ?? 'Auto'}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textDim} />
          </PressableScale>

          <PressableScale
            onPress={() => {
              chat.newChat();
            }}
            style={styles.roundBtn}
            label="New chat"
          >
            <Ionicons name="create-outline" size={21} color={colors.text} />
          </PressableScale>
        </View>

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
            <Animated.View key={mode.id} entering={FadeIn.duration(300)} style={styles.empty}>
              <Logo size={112} />
              <View style={{ marginTop: 14 }}>
                <WordReveal words={greetWords} size={38} />
              </View>
              <Animated.View entering={FadeInDown.delay(500).duration(500)} style={{ marginTop: 6, marginBottom: 20 }}>
                <Motto size={19} />
              </Animated.View>
              <View style={styles.cards}>
                {ideas.map((s, i) => (
                  <Animated.View key={`${seed}-${s.title}`} entering={FadeInDown.delay(260 + i * 70).duration(380)} style={styles.cardWrap}>
                    <PressableScale
                      onPress={() => setPrefill({ text: s.prompt, nonce: Date.now() })}
                      scaleTo={0.96}
                      style={[styles.card, { borderColor: withAlpha(mode.color, 0.32) }]}
                      label={s.title}
                    >
                      <View style={[styles.cardIcon, { backgroundColor: withAlpha(mode.color, 0.16) }]}>
                        <Ionicons name={mode.icon} size={14} color={mode.color} />
                      </View>
                      <Text style={styles.cardTitle}>{s.title}</Text>
                      <Text numberOfLines={2} style={styles.cardPrompt}>
                        {s.prompt}
                      </Text>
                    </PressableScale>
                  </Animated.View>
                ))}
              </View>
              <PressableScale onPress={() => setSeed((x) => x + 1)} style={styles.shuffle} label="Shuffle ideas">
                <Ionicons name="shuffle" size={16} color={colors.textDim} />
                <Text style={styles.shuffleText}>Shuffle ideas</Text>
              </PressableScale>
            </Animated.View>
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
                  <FollowUps items={chat.suggestions} accent={mode.color} onPick={(t) => chat.send(t, [])} />
                ) : null
              }
            />
          )}
        </View>

        {/* Composer */}
        <View style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
          <Composer
            busy={chat.busy}
            accent={mode.color}
            placeholder={`Message Turzam · ${mode.name}`}
            onSend={chat.send}
            onStop={chat.stop}
            prefill={prefill}
          />
          <Text style={styles.disclaimer}>Turzam can make mistakes. Check important facts.</Text>
        </View>
      </KeyboardAvoidingView>

      <HistoryDrawer
        open={drawerOpen}
        loading={chat.listLoading}
        conversations={chat.conversations}
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
        onSearchMessages={chat.searchMessages}
        onOpenMemory={() => {
          setDrawerOpen(false);
          router.push('/memory');
        }}
        onOpenSettings={() => {
          setDrawerOpen(false);
          router.push('/settings');
        }}
      />

      <ModeSheet
        visible={modeOpen}
        current={chat.mode}
        model={chat.model}
        providers={providers}
        onSelect={chat.setMode}
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
    column: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
    skeletons: { padding: 20, gap: 12, paddingTop: 30 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch' },
    cardWrap: { width: '48.6%', flexGrow: 1 },
    card: {
      backgroundColor: withAlpha(t.colors.surface, 0.94),
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: 14,
      gap: 6,
      minHeight: 118,
    },
    cardIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
    cardPrompt: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 18 },
    shuffle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12 },
    shuffleText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 13 },
    disclaimer: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, textAlign: 'center', marginTop: 6 },
  });
