import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInLeft, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from './ActionSheet';
import { Logo } from './Logo';
import { PressableScale } from './PressableScale';
import { RenameModal } from './RenameModal';
import { Skeleton } from './Skeleton';
import { useStyles, useTheme } from '../context/ThemeContext';
import { getMode } from '../modes';
import { dayLabel } from '../lib/utils';
import { fonts, radius, Theme, withAlpha } from '../theme';
import type { Conversation, Folder } from '../types';
import type { ExportFormat } from '../lib/export';

export type MessageHit = { conversationId: string; snippet: string };

type Props = {
  open: boolean;
  loading: boolean;
  conversations: Conversation[];
  folders: Folder[];
  activeId: string | null;
  email: string;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMove: (id: string, folderId: string | null) => void;
  onExport: (id: string, format: ExportFormat) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onSearchMessages: (query: string) => Promise<MessageHit[]>;
  onOpenMemory: () => void;
  onOpenProjects: () => void;
  onOpenSettings: () => void;
};

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'folder'; key: string; folder: Folder; count: number; open: boolean }
  | { kind: 'toggle'; key: string; label: string; count: number; open: boolean }
  | { kind: 'chat'; key: string; chat: Conversation }
  | { kind: 'hit'; key: string; chat: Conversation; snippet: string };

export function HistoryDrawer(p: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles(make);
  const drawerW = Math.min(width * 0.86, 360);
  const progress = useSharedValue(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MessageHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [moveFor, setMoveFor] = useState<Conversation | null>(null);
  const [exportFor, setExportFor] = useState<Conversation | null>(null);
  const [folderMenu, setFolderMenu] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState<{ id: string | null; initial: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    progress.value = withTiming(p.open ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    if (!p.open) {
      setQuery('');
      setHits([]);
    }
  }, [p.open, progress]);

  // Search inside message text too (after a short pause while typing).
  const { onSearchMessages } = p;
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await onSearchMessages(q);
        if (!cancelled) setHits(res);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, onSearchMessages]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * drawerW }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const swipeClose = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationX < -50) p.onClose();
    });

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const byId = new Map(p.conversations.map((c) => [c.id, c]));
    const out: Row[] = [];
    if (!q) {
      const live = p.conversations.filter((c) => !c.archived);
      const pinned = live.filter((c) => c.pinned);
      if (pinned.length) {
        out.push({ kind: 'header', key: 'h-pinned', label: 'Pinned' });
        for (const c of pinned) out.push({ kind: 'chat', key: c.id, chat: c });
      }
      for (const f of p.folders) {
        const inside = live.filter((c) => !c.pinned && c.folder_id === f.id);
        const open = !collapsed[f.id];
        out.push({ kind: 'folder', key: `f-${f.id}`, folder: f, count: inside.length, open });
        if (open) for (const c of inside) out.push({ kind: 'chat', key: c.id, chat: c });
      }
      const known = new Set(p.folders.map((f) => f.id));
      let last = '';
      for (const c of live) {
        if (c.pinned || (c.folder_id && known.has(c.folder_id))) continue;
        const label = dayLabel(c.updated_at);
        if (label !== last) {
          out.push({ kind: 'header', key: `h-${label}`, label });
          last = label;
        }
        out.push({ kind: 'chat', key: c.id, chat: c });
      }
      const archived = p.conversations.filter((c) => c.archived);
      if (archived.length) {
        out.push({ kind: 'toggle', key: 'arch', label: 'Archived', count: archived.length, open: showArchived });
        if (showArchived) for (const c of archived) out.push({ kind: 'chat', key: c.id, chat: c });
      }
      return out;
    }
    const titleMatches = p.conversations.filter((c) => c.title.toLowerCase().includes(q));
    if (titleMatches.length) {
      out.push({ kind: 'header', key: 'h-titles', label: 'Chats' });
      for (const c of titleMatches) out.push({ kind: 'chat', key: c.id, chat: c });
    }
    const seen = new Set<string>();
    const msgRows: Row[] = [];
    for (const h of hits) {
      const c = byId.get(h.conversationId);
      if (!c || seen.has(h.conversationId)) continue;
      seen.add(h.conversationId);
      msgRows.push({ kind: 'hit', key: `hit-${h.conversationId}`, chat: c, snippet: h.snippet });
    }
    if (msgRows.length) {
      out.push({ kind: 'header', key: 'h-msgs', label: 'In messages' });
      out.push(...msgRows);
    }
    return out;
  }, [p.conversations, p.folders, query, hits, collapsed, showArchived]);

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
            <Logo size={44} animated={p.open} />
            <Text style={styles.brand}>Turzam</Text>
          </View>

          <PressableScale onPress={p.onNewChat} style={[styles.newBtn, { backgroundColor: colors.accent }]} label="New chat">
            <Ionicons name="add" size={20} color={colors.onAccent} />
            <Text style={styles.newText}>New chat</Text>
          </PressableScale>

          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats and messages"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query ? (
              <PressableScale onPress={() => setQuery('')} label="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textFaint} />
              </PressableScale>
            ) : null}
          </View>

          {p.loading && !p.conversations.length ? (
            <View style={{ gap: 12, paddingTop: 10 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={38} radius={12} />
              ))}
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.key}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 6 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={searching ? <Skeleton height={34} radius={10} style={{ marginTop: 8 }} /> : undefined}
              ListEmptyComponent={
                searching ? undefined : (
                  <Text style={styles.empty}>{query ? 'Nothing found.' : 'Your chats will appear here.'}</Text>
                )
              }
              ListHeaderComponent={
                !query ? (
                  <PressableScale onPress={() => setFolderName({ id: null, initial: '' })} haptic={false} style={styles.addFolder} label="New folder">
                    <Ionicons name="folder-open-outline" size={16} color={colors.textDim} />
                    <Text style={styles.addFolderText}>New folder</Text>
                  </PressableScale>
                ) : undefined
              }
              renderItem={({ item, index }) => {
                if (item.kind === 'header') return <Text style={styles.header}>{item.label}</Text>;
                if (item.kind === 'toggle') {
                  return (
                    <PressableScale onPress={() => setShowArchived((v) => !v)} haptic={false} style={styles.folderRow} label="Show archived chats">
                      <Ionicons name={item.open ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.textFaint} />
                      <Ionicons name="archive-outline" size={17} color={colors.textDim} />
                      <Text style={styles.folderName}>{item.label}</Text>
                      <Text style={styles.count}>{item.count}</Text>
                    </PressableScale>
                  );
                }
                if (item.kind === 'folder') {
                  const f = item.folder;
                  return (
                    <PressableScale
                      onPress={() => setCollapsed((c) => ({ ...c, [f.id]: !c[f.id] }))}
                      onLongPress={() => setFolderMenu(f)}
                      haptic={false}
                      style={styles.folderRow}
                      label={`Folder ${f.name}`}
                    >
                      <Ionicons name={item.open ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.textFaint} />
                      <Ionicons name="folder" size={18} color={f.color} />
                      <Text numberOfLines={1} style={[styles.folderName, { flex: 1 }]}>
                        {f.name}
                      </Text>
                      <Text style={styles.count}>{item.count}</Text>
                      <PressableScale onPress={() => setFolderMenu(f)} label={`Options for folder ${f.name}`} hitSlop={10}>
                        <Ionicons name="ellipsis-horizontal" size={16} color={colors.textFaint} />
                      </PressableScale>
                    </PressableScale>
                  );
                }
                const c = item.chat;
                const mode = getMode(c.mode);
                const active = c.id === p.activeId;
                return (
                  <Animated.View entering={FadeInLeft.delay(Math.min(index, 8) * 30).duration(240)}>
                    <PressableScale
                      onPress={() => p.onSelect(c.id)}
                      onLongPress={() => setMenuFor(c)}
                      scaleTo={0.97}
                      haptic={false}
                      style={[styles.item, active && { backgroundColor: withAlpha(mode.color, 0.14) }]}
                    >
                      {c.pinned ? <Ionicons name="pin" size={13} color={mode.color} /> : <View style={[styles.itemDot, { backgroundColor: mode.color }]} />}
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.itemText, active && { color: colors.text }]}>
                          {c.title}
                        </Text>
                        {item.kind === 'hit' ? (
                          <Text numberOfLines={1} style={styles.snippet}>
                            {item.snippet}
                          </Text>
                        ) : null}
                      </View>
                      <PressableScale onPress={() => setMenuFor(c)} label={`Options for ${c.title}`} hitSlop={10}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
                      </PressableScale>
                    </PressableScale>
                  </Animated.View>
                );
              }}
            />
          )}

          <View style={styles.footer}>
            <Text numberOfLines={1} style={styles.email}>
              {p.email}
            </Text>
            <PressableScale onPress={p.onOpenProjects} style={styles.projectsBtn} label="Open project workspaces">
              <Ionicons name="layers-outline" size={18} color={colors.accentInk} />
              <Text style={styles.footerText}>Projects</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
            </PressableScale>
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

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { label: menuFor.pinned ? 'Unpin' : 'Pin to top', icon: menuFor.pinned ? 'pin-outline' : 'pin', onPress: () => p.onPin(menuFor.id, !menuFor.pinned) },
                { label: 'Rename', icon: 'create-outline', onPress: () => setRenaming(menuFor) },
                { label: 'Move to folder', icon: 'folder-outline', onPress: () => setMoveFor(menuFor) },
                { label: 'Export chat', icon: 'share-outline', onPress: () => setExportFor(menuFor) },
                { label: menuFor.archived ? 'Unarchive' : 'Archive', icon: 'archive-outline', onPress: () => p.onArchive(menuFor.id, !menuFor.archived) },
                { label: 'Delete chat', icon: 'trash-outline', destructive: true, onPress: () => p.onDelete(menuFor.id) },
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!moveFor}
        title="Move to folder"
        onClose={() => setMoveFor(null)}
        actions={
          moveFor
            ? [
                ...(moveFor.folder_id ? [{ label: 'No folder', icon: 'remove-circle-outline' as const, onPress: () => p.onMove(moveFor.id, null) }] : []),
                ...p.folders.filter((f) => f.id !== moveFor.folder_id).map((f) => ({ label: f.name, icon: 'folder' as const, onPress: () => p.onMove(moveFor.id, f.id) })),
                { label: 'New folder…', icon: 'add-circle-outline' as const, onPress: () => setFolderName({ id: null, initial: '' }) },
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!exportFor}
        title="Export chat"
        onClose={() => setExportFor(null)}
        actions={
          exportFor
            ? [
                { label: 'PDF document', icon: 'document-text-outline', onPress: () => p.onExport(exportFor.id, 'pdf') },
                { label: 'Markdown (.md)', icon: 'logo-markdown', onPress: () => p.onExport(exportFor.id, 'md') },
                { label: 'Plain text (.txt)', icon: 'reader-outline', onPress: () => p.onExport(exportFor.id, 'txt') },
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!folderMenu}
        title={folderMenu?.name}
        onClose={() => setFolderMenu(null)}
        actions={
          folderMenu
            ? [
                { label: 'Rename folder', icon: 'create-outline', onPress: () => setFolderName({ id: folderMenu.id, initial: folderMenu.name }) },
                { label: 'Delete folder (chats are kept)', icon: 'trash-outline', destructive: true, onPress: () => p.onDeleteFolder(folderMenu.id) },
              ]
            : []
        }
      />
      <RenameModal
        visible={!!folderName}
        title={folderName?.id ? 'Rename folder' : 'New folder'}
        initial={folderName?.initial ?? ''}
        onCancel={() => setFolderName(null)}
        onSave={(name) => {
          if (folderName?.id) p.onRenameFolder(folderName.id, name);
          else p.onCreateFolder(name);
          setFolderName(null);
        }}
      />
      <RenameModal
        visible={!!renaming}
        initial={renaming?.title ?? ''}
        onCancel={() => setRenaming(null)}
        onSave={(title) => {
          if (renaming) p.onRename(renaming.id, title);
          setRenaming(null);
        }}
      />
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    panel: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: t.colors.bgElevated,
      borderRightWidth: 1,
      borderRightColor: t.colors.borderStrong,
      paddingHorizontal: 14,
      gap: 12,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    brand: { color: t.colors.text, fontFamily: fonts.display, fontSize: 32 },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 48,
      borderRadius: radius.lg,
    },
    newText: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 16 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    searchInput: { flex: 1, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 15, height: '100%' },
    header: {
      color: t.colors.textFaint,
      fontFamily: fonts.ui,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 14,
      marginBottom: 6,
      paddingHorizontal: 6,
    },
    item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderRadius: radius.md },
    folderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 11, marginTop: 6 },
    folderName: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 14.5 },
    count: { color: t.colors.textFaint, fontFamily: fonts.ui, fontSize: 12.5 },
    addFolder: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
    addFolderText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 13.5 },
    itemDot: { width: 8, height: 8, borderRadius: 4 },
    itemText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 15 },
    snippet: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12.5, marginTop: 2 },
    empty: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 14, textAlign: 'center', marginTop: 30 },
    footer: { borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: 12, gap: 10 },
    email: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13, paddingHorizontal: 4 },
    projectsBtn: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
    footerBtns: { flexDirection: 'row', gap: 10 },
    footerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    footerText: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 14 },
  });
