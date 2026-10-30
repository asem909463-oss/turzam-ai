import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutRight, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Skeleton } from '../src/components/Skeleton';
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
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('memories').select('id,content,created_at').order('created_at', { ascending: false });
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
    const { data, error } = await supabase.from('memories').insert({ content }).select('id,content,created_at').single();
    if (error) toast.show(`Could not save: ${error.message}`, 'error');
    else if (data) {
      setItems((prev) => [data as Memory, ...prev]);
      toast.show('Remembered', 'success');
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
          Lasting facts Turzam remembers about you, like your company or goals. It picks them up from your chats, and you can add or
          remove any of them.
        </Text>

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
                <Text style={styles.itemText}>{item.content}</Text>
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
    itemText: { flex: 1, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 15, lineHeight: 21 },
    emptyBox: { alignItems: 'center', gap: 12, marginTop: 50, paddingHorizontal: 30 },
    emptyText: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  });
