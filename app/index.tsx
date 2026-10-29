import React, { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { Composer } from '../src/components/Composer';
import { HistoryDrawer } from '../src/components/HistoryDrawer';
import { MessageBubble } from '../src/components/MessageBubble';
import { ModeSheet } from '../src/components/ModeSheet';
import { Orb } from '../src/components/Orb';
import { PressableScale } from '../src/components/PressableScale';
import { useAuth } from '../src/context/AuthContext';
import { useChat } from '../src/hooks/useChat';
import { getMode } from '../src/modes';
import { greeting } from '../src/lib/utils';
import { colors, fonts, radius, withAlpha } from '../src/theme';
import type { ChatMessage } from '../src/types';

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const chat = useChat();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);

  const mode = getMode(chat.mode);
  const name = profile?.display_name?.trim();
  const empty = chat.messages.length === 0 && !chat.loadingConv;

  // The list is inverted (newest at the bottom, sticks there while streaming), so we reverse the data.
  const data = [...chat.messages].reverse();

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <MessageBubble
        message={item}
        isLast={index === 0}
        busy={chat.busy}
        accent={mode.color}
        onRegenerate={chat.regenerate}
      />
    ),
    [chat.busy, chat.regenerate, mode.color],
  );

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
            style={[styles.modePill, { borderColor: withAlpha(mode.color, 0.5), backgroundColor: withAlpha(mode.color, 0.1) }]}
            label="Change mode"
          >
            <Ionicons name={mode.icon} size={16} color={mode.color} />
            <Text style={styles.modeText}>{mode.name}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textDim} />
          </PressableScale>

          <PressableScale onPress={chat.newChat} style={styles.roundBtn} label="New chat">
            <Ionicons name="create-outline" size={21} color={colors.text} />
          </PressableScale>
        </View>

        {/* Body */}
        <View style={{ flex: 1 }}>
          {empty ? (
            <Animated.View key={mode.id} entering={FadeIn.duration(300)} style={styles.empty}>
              <Orb size={78} />
              <Text style={styles.hello}>
                {greeting()}
                {name ? <Text style={styles.helloName}>{`, ${name}`}</Text> : null}
              </Text>
              <Text style={styles.helloSub}>{mode.tagline}</Text>
              <View style={styles.cards}>
                {mode.suggestions.map((s, i) => (
                  <Animated.View key={s.title} entering={FadeInDown.delay(120 + i * 70).duration(380)} style={styles.cardWrap}>
                    <PressableScale
                      onPress={() => setPrefill({ text: s.prompt, nonce: Date.now() })}
                      scaleTo={0.96}
                      style={[styles.card, { borderColor: withAlpha(mode.color, 0.28) }]}
                      label={s.title}
                    >
                      <Ionicons name="arrow-up-outline" size={15} color={mode.color} style={{ transform: [{ rotate: '45deg' }] }} />
                      <Text style={styles.cardTitle}>{s.title}</Text>
                      <Text numberOfLines={2} style={styles.cardPrompt}>
                        {s.prompt}
                      </Text>
                    </PressableScale>
                  </Animated.View>
                ))}
              </View>
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
              ListEmptyComponent={chat.loadingConv ? <Text style={styles.loading}>Loading chat…</Text> : null}
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
        onDelete={chat.deleteConversation}
        onOpenMemory={() => {
          setDrawerOpen(false);
          router.push('/memory');
        }}
        onOpenSettings={() => {
          setDrawerOpen(false);
          router.push('/settings');
        }}
      />

      <ModeSheet visible={modeOpen} current={chat.mode} onSelect={chat.setMode} onClose={() => setModeOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: withAlpha(colors.surface, 0.9),
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    borderWidth: 1,
  },
  modeText: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  hello: { color: colors.text, fontFamily: fonts.display, fontSize: 42, marginTop: 22, textAlign: 'center' },
  helloName: { fontFamily: fonts.displayItalic, color: colors.cyan },
  helloSub: { color: colors.textDim, fontFamily: fonts.uiRegular, fontSize: 16, marginTop: 6, marginBottom: 26, textAlign: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch' },
  cardWrap: { width: '48.4%' },
  card: {
    backgroundColor: withAlpha(colors.surface, 0.92),
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    minHeight: 112,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
  cardPrompt: { color: colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 18 },
  loading: { color: colors.textFaint, fontFamily: fonts.ui, textAlign: 'center', marginTop: 40, transform: [{ scaleY: -1 }] },
  disclaimer: { color: colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, textAlign: 'center', marginTop: 6 },
});
