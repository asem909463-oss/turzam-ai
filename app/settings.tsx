import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Toggle } from '../src/components/Toggle';
import { useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/lib/supabase';
import { MODES } from '../src/modes';
import { colors, fonts, radius, withAlpha } from '../src/theme';

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, updateProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saved, setSaved] = useState(false);

  async function saveName() {
    const clean = name.trim().slice(0, 40);
    if (clean === (profile?.display_name ?? '')) return;
    await updateProfile({ display_name: clean || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function deleteAllChats() {
    Alert.alert('Delete all chats?', 'Every conversation and message will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('conversations').delete().eq('user_id', user?.id ?? '');
          Alert.alert('Done', 'All chats were deleted.');
          router.replace('/');
        },
      },
    ]);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(300)} style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <View style={styles.nameRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              onSubmitEditing={saveName}
              placeholder="What should Turzam call you?"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.cyan}
              maxLength={40}
              style={styles.input}
            />
            {saved ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
          </View>
          <Text style={styles.hint}>{user?.email}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(300)} style={styles.card}>
          <Text style={styles.label}>Default mode for new chats</Text>
          <View style={styles.chips}>
            {MODES.map((m) => {
              const on = profile?.default_mode === m.id;
              return (
                <PressableScale
                  key={m.id}
                  label={m.name}
                  onPress={() => updateProfile({ default_mode: m.id })}
                  style={[styles.chip, on && { borderColor: m.color, backgroundColor: withAlpha(m.color, 0.15) }]}
                >
                  <Ionicons name={m.icon} size={15} color={on ? m.color : colors.textDim} />
                  <Text style={[styles.chipText, on && { color: colors.text }]}>{m.name}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(300)} style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Memory</Text>
              <Text style={styles.hint}>Let Turzam remember lasting facts you share, to personalise future chats.</Text>
            </View>
            <Toggle value={profile?.memory_enabled !== false} onChange={(v) => updateProfile({ memory_enabled: v })} />
          </View>
          <PressableScale onPress={() => router.push('/memory')} style={styles.linkRow} label="Manage memories">
            <Ionicons name="albums-outline" size={19} color={colors.cyan} />
            <Text style={styles.linkText}>Manage memories</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </PressableScale>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(210).duration(300)} style={styles.card}>
          <PressableScale onPress={deleteAllChats} style={styles.linkRow} label="Delete all chats">
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
            <Text style={[styles.linkText, { color: colors.danger }]}>Delete all chats</Text>
          </PressableScale>
          <PressableScale onPress={confirmSignOut} style={styles.linkRow} label="Sign out">
            <Ionicons name="log-out-outline" size={19} color={colors.text} />
            <Text style={styles.linkText}>Sign out</Text>
          </PressableScale>
        </Animated.View>

        <Text style={styles.version}>Turzam AI · version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 14, paddingTop: 6 },
  card: {
    backgroundColor: withAlpha(colors.surface, 0.95),
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  label: { color: colors.textDim, fontFamily: fonts.ui, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    height: 48,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { color: colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  chipText: { color: colors.textDim, fontFamily: fonts.ui, fontSize: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowTitle: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 16, marginBottom: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  linkText: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 16 },
  version: { color: colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
