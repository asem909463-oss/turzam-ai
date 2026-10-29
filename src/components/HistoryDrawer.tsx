import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { Orb } from './Orb';
import { getMode } from '../modes';
import { dayLabel } from '../lib/utils';
import { colors, fonts, radius, withAlpha } from '../theme';
import type { Conversation } from '../types';

type Props = {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  email: string;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
};

type Row = { kind: 'header'; key: string; label: string } | { kind: 'chat'; key: string; chat: Conversation };

export function HistoryDrawer(p: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerW = Math.min(width * 0.86, 360);
  const progress = useSharedValue(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    progress.value = withTiming(p.open ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    if (!p.open) setQuery('');
  }, [p.open, progress]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * drawerW }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const swipeClose = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .onEnd((e) => {
      if (e.translationX < -50) p.onClose();
    });

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const list = q ? p.conversations.filter((c) => c.title.toLowerCase().includes(q)) : p.conversations;
    const out: Row[] = [];
    let last = '';
    for (const c of list) {
      const label = dayLabel(c.updated_at);
      if (label !== last) {
        out.push({ kind: 'header', key: `h-${label}`, label });
        last = label;
      }
      out.push({ kind: 'chat', key: c.id, chat: c });
    }
    return out;
  }, [p.conversations, query]);

  function confirmDelete(c: Conversation) {
    Alert.alert('Delete this chat?', `"${c.title}" and its messages will be removed for good.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => p.onDelete(c.id) },
    ]);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={p.open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, shadeStyle]}>
        <Pressable style={{ flex: 1 }} onPress={p.onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <GestureDetector gesture={swipeClose}>
        <Animated.View
          style={[
            styles.panel,
            { width: drawerW, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 },
            panelStyle,
          ]}
        >
          <View style={styles.brandRow}>
            <Orb size={34} animated={p.open} />
            <Text style={styles.brand}>Turzam</Text>
          </View>

          <PressableScale onPress={p.onNewChat} style={styles.newBtn} label="New chat">
            <Ionicons name="add" size={20} color={colors.bg} />
            <Text style={styles.newText}>New chat</Text>
          </PressableScale>

          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.cyan}
              style={styles.searchInput}
            />
          </View>

          <FlatList
            data={rows}
            keyExtractor={(r) => r.key}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 6 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.empty}>{query ? 'No chats match.' : 'Your chats will appear here.'}</Text>
            }
            renderItem={({ item, index }) => {
              if (item.kind === 'header') return <Text style={styles.header}>{item.label}</Text>;
              const c = item.chat;
              const mode = getMode(c.mode);
              const active = c.id === p.activeId;
              return (
                <Animated.View entering={FadeInLeft.delay(Math.min(index, 8) * 30).duration(240)}>
                  <PressableScale
                    onPress={() => p.onSelect(c.id)}
                    onLongPress={() => confirmDelete(c)}
                    scaleTo={0.97}
                    haptic={false}
                    style={[styles.item, active && { backgroundColor: withAlpha(mode.color, 0.12) }]}
                  >
                    <View style={[styles.itemDot, { backgroundColor: mode.color }]} />
                    <Text numberOfLines={1} style={[styles.itemText, active && { color: colors.text }]}>
                      {c.title}
                    </Text>
                    <PressableScale onPress={() => confirmDelete(c)} label="Delete chat" hitSlop={10}>
                      <Ionicons name="trash-outline" size={17} color={colors.textFaint} />
                    </PressableScale>
                  </PressableScale>
                </Animated.View>
              );
            }}
          />

          <View style={styles.footer}>
            <Text numberOfLines={1} style={styles.email}>
              {p.email}
            </Text>
            <View style={styles.footerBtns}>
              <PressableScale onPress={p.onOpenMemory} style={styles.footerBtn} label="Memory">
                <Ionicons name="albums-outline" size={19} color={colors.text} />
                <Text style={styles.footerText}>Memory</Text>
              </PressableScale>
              <PressableScale onPress={p.onOpenSettings} style={styles.footerBtn} label="Settings">
                <Ionicons name="settings-outline" size={19} color={colors.text} />
                <Text style={styles.footerText}>Settings</Text>
              </PressableScale>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderRightWidth: 1,
    borderRightColor: colors.borderStrong,
    paddingHorizontal: 14,
    gap: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: 32 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.cyan,
  },
  newText: { color: colors.bg, fontFamily: fonts.uiBold, fontSize: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.uiRegular, fontSize: 15, height: '100%' },
  header: {
    color: colors.textFaint,
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  itemDot: { width: 8, height: 8, borderRadius: 4 },
  itemText: { flex: 1, color: colors.textDim, fontFamily: fonts.ui, fontSize: 15 },
  empty: { color: colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 14, textAlign: 'center', marginTop: 30 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10 },
  email: { color: colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13, paddingHorizontal: 4 },
  footerBtns: { flexDirection: 'row', gap: 10 },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerText: { color: colors.text, fontFamily: fonts.ui, fontSize: 14 },
});
