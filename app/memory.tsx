import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutRight, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Skeleton } from '../src/components/Skeleton';
import { Toggle } from '../src/components/Toggle';
import { useAuth } from '../src/context/AuthContext';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { supabase } from '../src/lib/supabase';
import { fonts, radius, Theme, withAlpha } from '../src/theme';
import type { Memory } from '../src/types';

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const { profile, updateProfile } = useAuth();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('memories').select('id,content,pinned,created_at').order('pinned', { ascending: false }).order('created_at', { ascending: false });
    setItems((data ?? []) as Memory[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const content = draft.trim().slice(0, 280);
    if (!content) return;
    setDraft('');
    const { data, error } = await supabase.from('memories').insert({ content }).select('id,content,pinned,created_at').single();
    if (error) toast.show(`Could not save: ${error.message}`, 'error');
    else if (data) {
      setItems((prev) => [data as Memory, ...prev]);
      toast.show('Remembered', 'success');
    }
  }

  async function togglePin(m: Memory) {
    const pinned = !m.pinned;
    setItems((prev) => {
      const next = prev.map((x) => (x.id === m.id ? { ...x, pinned } : x));
      return [...next.filter((x) => x.pinned), ...next.filter((x) => !x.pinned)];
    });
    const { error } = await supabase.from('memories').update({ pinned }).eq('id', m.id);
    if (error) {
      toast.show('Could not update that memory', 'error');
      load();
    } else toast.show(pinned ? 'Pinned: Turzam keeps this in mind first' : 'Unpinned', 'info');
  }

  async function saveEdit() {
    if (!editing) return;
    const text = editing.text.trim().slice(0, 280);
    const id = editing.id;
    setEditing(null);
    if (!text) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, content: text } : x)));
    const { error } = await supabase.from('memories').update({ content: text }).eq('id', id);
    if (error) {
      toast.show('Could not save the change', 'error');
      load();
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (error) {
      toast.show('Could not delete that memory', 'error');
      load();
    } else toast.show('Forgotten', 'info');
  }

  function clearAll() {
    Alert.alert('Forget everything?', 'Turzam will no longer remember anything about you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget all',
        style: 'destructive',
        onPress: async () => {
          const ids = items.map((m) => m.id);
          setItems([]);
          if (ids.length) await supabase.from('memories').delete().in('id', ids);
          toast.show('Memory cleared', 'success');
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader
        title="Memory"
        right={
          items.length ? (
            <PressableScale onPress={clearAll} label="Forget everything">
              <Text style={styles.clear}>Clear all</Text>
            </PressableScale>
          ) : null
        }
      />
      <View style={styles.column}>
        <Text style={styles.intro}>
          Lasting facts Turzam remembers about you, like your company or goals. It picks them up from your chats. Tap a note to edit it, pin the ones that matter most, or remove any of them. Sensitive details (health, money, passwords) are never saved automatically.
        </Text>

        <View style={styles.pauseRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemText}>Use and learn memories</Text>
            <Text style={styles.pauseHint}>{profile?.memory_enabled !== false ? 'On: Turzam uses these and picks up new facts.' : 'Off: nothing is used or saved.'}</Text>
          </View>
          <Toggle value={profile?.memory_enabled !== false} onChange={(v) => updateProfile({ memory_enabled: v })} />
        </View>

        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder="Add something to remember…"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            maxLength={280}
            style={styles.input}
            returnKeyType="done"
          />
          <PressableScale
            onPress={add}
            disabled={!draft.trim()}
            style={[styles.addBtn, { opacity: draft.trim() ? 1 : 0.4 }]}
            label="Add memory"
          >
            <Ionicons name="add" size={24} color={colors.onAccent} />
          </PressableScale>
        </View>

        {loading ? (
          <View style={{ padding: 16, gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={52} radius={16} />
            ))}
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 30 }}
            ListEmptyComponent={
              <Animated.View entering={FadeInDown.duration(300)} style={styles.emptyBox}>
                <Ionicons name="albums-outline" size={34} color={colors.textFaint} />
                <Text style={styles.emptyText}>Nothing remembered yet. Tell Turzam about yourself in a chat, or add a note above.</Text>
              </Animated.View>
            }
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(280)}
                exiting={FadeOutRight.duration(200)}
                layout={LinearTransition.springify().damping(18)}
                style={styles.item}
              >
                <View style={styles.bullet} />
                {editing?.id === item.id ? (
                  <TextInput
                    autoFocus
                    multiline
                    value={editing.text}
                    onChangeText={(t) => setEditing({ id: item.id, text: t })}
                    onBlur={saveEdit}
                    onSubmitEditing={saveEdit}
                    blurOnSubmit
                    maxLength={280}
                    selectionColor={colors.accent}
                    style={[styles.itemText, styles.editBox]}
                  />
                ) : (
                  <PressableScale style={{ flex: 1 }} haptic={false} scaleTo={0.99} label="Edit this memory" onPress={() => setEditing({ id: item.id, text: item.content })}>
                    <Text style={styles.itemText}>{item.content}</Text>
                  </PressableScale>
                )}
                <PressableScale onPress={() => togglePin(item)} label={item.pinned ? 'Unpin memory' : 'Pin memory'}>
                  <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={19} color={item.pinned ? colors.accentInk : colors.textFaint} />
                </PressableScale>
                <PressableScale onPress={() => remove(item.id)} label="Forget this">
                  <Ionicons name="close-circle" size={22} color={colors.textFaint} />
                </PressableScale>
              </Animated.View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    column: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
    clear: { color: t.colors.danger, fontFamily: fonts.uiBold, fontSize: 14 },
    intro: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, paddingHorizontal: 20, marginBottom: 12 },
    addRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
    input: {
      flex: 1,
      height: 50,
      color: t.colors.text,
      fontFamily: fonts.ui,
      fontSize: 15,
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    addBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: t.colors.accent, alignItems: 'center', justifyContent: 'center' },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: withAlpha(t.colors.surface, 0.95),
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 14,
    },
    bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
    pauseRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 14 },
    pauseHint: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12.5, marginTop: 2 },
    editBox: { borderBottomWidth: 1, borderBottomColor: t.colors.accent, paddingBottom: 4 },
    itemText: { flex: 1, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 15, lineHeight: 21 },
    emptyBox: { alignItems: 'center', gap: 12, marginTop: 50, paddingHorizontal: 30 },
    emptyText: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  });
