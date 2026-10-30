import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { Logo } from '../src/components/Logo';
import { MOTTO } from '../src/components/Motto';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Toggle } from '../src/components/Toggle';
import { useAuth } from '../src/context/AuthContext';
import { usePrefs, useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { useProviders } from '../src/hooks/useProviders';
import { deleteAllChats } from '../src/lib/chats';
import { MODES } from '../src/modes';
import { ACCENTS, fonts, radius, Scheme, Theme, withAlpha } from '../src/theme';
import type { ModelChoice } from '../src/types';

const APP_VERSION = '1.1.0';

const SCHEMES: { id: Scheme; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function Segmented({ value, onChange }: { value: Scheme; onChange: (s: Scheme) => void }) {
  const styles = useStyles(make);
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const idx = SCHEMES.findIndex((s) => s.id === value);
  const seg = Math.max(0, (w - 8) / SCHEMES.length);

  useEffect(() => {
    x.value = withSpring(idx * seg, { damping: 16, stiffness: 220 });
  }, [idx, seg, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.segment} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? <Animated.View style={[styles.segIndicator, { width: seg }, indicator]} /> : null}
      {SCHEMES.map((s) => {
        const on = s.id === value;
        return (
          <PressableScale key={s.id} label={`${s.label} theme`} onPress={() => onChange(s.id)} style={styles.segItem} scaleTo={0.95}>
            <Ionicons name={s.icon} size={16} color={on ? colors.onAccent : colors.textDim} />
            <Text style={[styles.segText, on && { color: colors.onAccent }]}>{s.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const { prefs, setScheme, setAccent, setFollowUps } = usePrefs();
  const { user, profile, updateProfile, signOut } = useAuth();
  const { providers, error: providersError, refresh } = useProviders();
  const [name, setName] = useState(profile?.display_name ?? '');

  async function save(patch: Parameters<typeof updateProfile>[0], okText?: string) {
    const err = await updateProfile(patch);
    if (err) toast.show('Could not save. Run the latest supabase/schema.sql (README, step 2).', 'error');
    else if (okText) toast.show(okText, 'success');
  }

  async function saveName() {
    const clean = name.trim().slice(0, 40);
    if (clean === (profile?.display_name ?? '')) return;
    await save({ display_name: clean || null }, 'Name saved');
  }

  function deleteChats() {
    Alert.alert('Delete all chats?', 'Every conversation, message and uploaded file will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAllChats(user?.id ?? '');
            toast.show('All chats deleted', 'success');
            router.replace('/');
          } catch (e) {
            toast.show(e instanceof Error ? e.message : 'Could not delete chats', 'error');
          }
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

  const connected = (providers ?? []).filter((p) => p.available);
  const poweredBy = connected.length ? connected.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1') : null;
  const modelChoices: { id: ModelChoice; label: string; available: boolean }[] = [
    { id: 'auto', label: 'Auto', available: true },
    ...(providers ?? []).map((p) => ({ id: p.id as ModelChoice, label: p.name, available: p.available })),
  ];

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(300)} style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={saveName}
            onSubmitEditing={saveName}
            placeholder="What should Turzam call you?"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            maxLength={40}
            style={styles.input}
          />
          <Text style={styles.hint}>{user?.email}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(300)} style={styles.card}>
          <Text style={styles.label}>Appearance</Text>
          <Segmented value={prefs.scheme} onChange={setScheme} />
          <Text style={[styles.label, { marginTop: 6 }]}>Accent colour</Text>
          <View style={styles.swatches}>
            {ACCENTS.map((a) => {
              const on = prefs.accent === a.id;
              return (
                <PressableScale key={a.id} label={`${a.name} accent`} onPress={() => setAccent(a.id)} scaleTo={0.9} style={styles.swatchWrap}>
                  <View style={[styles.swatchRing, on && { borderColor: a.a }]}>
                    <LinearGradient colors={[a.a, a.b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch}>
                      {on ? <Ionicons name="checkmark" size={20} color="#050816" /> : null}
                    </LinearGradient>
                  </View>
                  <Text style={[styles.swatchName, on && { color: colors.text }]}>{a.name}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(300)} style={styles.card}>
          <Text style={styles.label}>Default mode for new chats</Text>
          <View style={styles.chips}>
            {MODES.map((m) => {
              const on = profile?.default_mode === m.id;
              return (
                <PressableScale
                  key={m.id}
                  label={m.name}
                  onPress={() => save({ default_mode: m.id })}
                  style={[styles.chip, on && { borderColor: m.color, backgroundColor: withAlpha(m.color, 0.16) }]}
                >
                  <Ionicons name={m.icon} size={15} color={on ? m.color : colors.textDim} />
                  <Text style={[styles.chipText, on && { color: colors.text }]}>{m.name}</Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={[styles.label, { marginTop: 6 }]}>Default AI</Text>
          <View style={styles.chips}>
            {modelChoices.map((c) => {
              const on = (profile?.default_model ?? 'auto') === c.id;
              return (
                <PressableScale
                  key={c.id}
                  label={c.label}
                  style={[
                    styles.chip,
                    on && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.16) },
                    !c.available && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    if (!c.available) {
                      toast.show(`${c.label} is not connected on the server yet.`, 'info');
                      return;
                    }
                    save({ default_model: c.id }, `New chats will use ${c.label}`);
                  }}
                >
                  {!c.available ? <Ionicons name="lock-closed" size={13} color={colors.textFaint} /> : null}
                  <Text style={[styles.chipText, on && { color: colors.text }]}>{c.label}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(300)} style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Memory</Text>
              <Text style={styles.hint}>Remember lasting facts you share, like your company or goals, to personalise future chats.</Text>
            </View>
            <Toggle value={profile?.memory_enabled !== false} onChange={(v) => save({ memory_enabled: v })} />
          </View>
          <PressableScale onPress={() => router.push('/memory')} style={styles.linkRow} label="Manage memories">
            <Ionicons name="albums-outline" size={19} color={colors.accentInk} />
            <Text style={styles.linkText}>Manage memories</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </PressableScale>
          <View style={[styles.switchRow, { marginTop: 4 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Suggest follow-ups</Text>
              <Text style={styles.hint}>Show tappable ideas for what to ask next. Uses one extra short AI call per answer.</Text>
            </View>
            <Toggle value={prefs.followUps} onChange={setFollowUps} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(300)} style={styles.card}>
          <PressableScale onPress={deleteChats} style={styles.linkRow} label="Delete all chats">
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
            <Text style={[styles.linkText, { color: colors.danger }]}>Delete all chats</Text>
          </PressableScale>
          <PressableScale onPress={confirmSignOut} style={styles.linkRow} label="Sign out">
            <Ionicons name="log-out-outline" size={19} color={colors.text} />
            <Text style={styles.linkText}>Sign out</Text>
          </PressableScale>
        </Animated.View>

        {/* About */}
        <Animated.View entering={FadeInDown.delay(300).duration(300)} style={[styles.card, styles.about]}>
          <Logo size={92} />
          <Text style={styles.aboutName}>Turzam AI</Text>
          <Text style={styles.aboutMotto}>{MOTTO}</Text>
          <Text style={styles.aboutText}>
            Strategy, pitches, pricing, outreach and operations for founders and business owners, plus a creative mode for brand,
            stories and ideas.
          </Text>

          <View style={styles.divider} />

          <Text style={styles.label}>Powered by</Text>
          <Text style={styles.poweredLine}>
            {providers ? (poweredBy ? poweredBy : 'No AI connected yet') : providersError ? 'Could not check the server' : 'Checking…'}
          </Text>
          <View style={{ gap: 8, alignSelf: 'stretch' }}>
            {(providers ?? []).map((p) => (
              <View key={p.id} style={styles.provRow}>
                <View style={[styles.statusDot, { backgroundColor: p.available ? colors.success : colors.textFaint }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.provName}>
                    {p.name} <Text style={styles.provVendor}>by {p.vendor}</Text>
                  </Text>
                  <Text style={styles.provStatus}>{p.available ? `Connected · ${p.model}` : 'Not connected yet'}</Text>
                </View>
              </View>
            ))}
          </View>
          {providersError ? (
            <PressableScale onPress={refresh} style={styles.retry} label="Check again">
              <Ionicons name="refresh" size={15} color={colors.accentInk} />
              <Text style={[styles.linkText, { flex: 0, fontSize: 14, color: colors.accentInk }]}>Check again</Text>
            </PressableScale>
          ) : null}
          <Text style={styles.hint}>
            A name shows as Connected only when its key is set on the Turzam server. Keys never live in the app.
          </Text>

          <View style={styles.divider} />
          <Text style={styles.version}>Version {APP_VERSION}</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    body: { paddingHorizontal: 16, gap: 14, paddingTop: 6, width: '100%', maxWidth: 720, alignSelf: 'center' },
    card: {
      backgroundColor: withAlpha(t.colors.surface, 0.96),
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 18,
      gap: 12,
    },
    label: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 12.5, letterSpacing: 0.8, textTransform: 'uppercase' },
    input: {
      height: 48,
      color: t.colors.text,
      fontFamily: fonts.ui,
      fontSize: 16,
      backgroundColor: t.colors.bgElevated,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    hint: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
    segment: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: radius.lg,
      backgroundColor: t.colors.bgElevated,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    segIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.md, backgroundColor: t.colors.accent },
    segItem: { flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    segText: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 14 },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    swatchWrap: { alignItems: 'center', gap: 6, width: 64 },
    swatchRing: { padding: 3, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
    swatch: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    swatchName: { color: t.colors.textFaint, fontFamily: fonts.ui, fontSize: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 13,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bgElevated,
    },
    chipText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 14 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    rowTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16, marginBottom: 2 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    linkText: { flex: 1, color: t.colors.text, fontFamily: fonts.ui, fontSize: 16 },
    about: { alignItems: 'center' },
    aboutName: { color: t.colors.text, fontFamily: fonts.display, fontSize: 34, marginTop: 4 },
    aboutMotto: { color: t.colors.accentInk, fontFamily: fonts.displayItalic, fontSize: 20, textAlign: 'center' },
    aboutText: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
    divider: { alignSelf: 'stretch', height: 1, backgroundColor: t.colors.border, marginVertical: 4 },
    poweredLine: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 17, textAlign: 'center' },
    provRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: t.colors.bgElevated,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    provName: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
    provVendor: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13 },
    provStatus: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 12.5, marginTop: 1 },
    retry: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    version: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12 },
  });
