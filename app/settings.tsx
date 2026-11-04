import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as StoreReview from 'expo-store-review';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { Logo } from '../src/components/Logo';
import { MOTTO } from '../src/components/Motto';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';
import { Toggle } from '../src/components/Toggle';
import { useAuth } from '../src/context/AuthContext';
import { usePrefs, useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { useProviders } from '../src/hooks/useProviders';
import { deleteAllChats } from '../src/lib/chats';
import { deleteAccountRequest } from '../src/lib/stream';
import { supabase } from '../src/lib/supabase';
import { getAiProcessingConsent, setAiProcessingConsent } from '../src/lib/aiConsent';
import { MODES, PERSONAS } from '../src/modes';
import { ACCENTS, fonts, radius, Scheme, Theme, withAlpha } from '../src/theme';
import type { ModelChoice } from '../src/types';

const APP_VERSION = '1.3.0';

const VOICE_LANGS: { id: string; label: string }[] = [
  { id: '', label: 'Auto' },
  { id: 'en-US', label: 'English' },
  { id: 'ru-RU', label: 'Русский' },
  { id: 'uz-UZ', label: "O'zbek" },
  { id: 'es-ES', label: 'Español' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'tr-TR', label: 'Türkçe' },
  { id: 'ar-SA', label: 'العربية' },
];

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
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const { prefs, setScheme, setAccent, setFollowUps } = usePrefs();
  const { user, profile, profileLoading, profileError, updateProfile, signOut } = useAuth();
  const { providers, error: providersError, refresh } = useProviders();
  const [name, setName] = useState(profile?.display_name ?? '');
  const nameDirty = useRef(false);
  // People who signed up with Google or Apple have no Turzam password.
  const signInMethods = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword = signInMethods.length === 0 || signInMethods.includes('email');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState(profile?.custom_instructions ?? '');
  const instructionsDirty = useRef(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [aiConsentReady, setAiConsentReady] = useState(false);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const [aiConsentLoadError, setAiConsentLoadError] = useState(false);
  const settingsScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const modelChoicesY = useRef(0);

  useEffect(() => {
    if (!profile) return;
    if (!nameDirty.current) setName(profile.display_name ?? '');
    if (!instructionsDirty.current) setInstructions(profile.custom_instructions ?? '');
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    setAiConsentReady(false);
    setAiConsentLoadError(false);
    if (!user?.id) {
      setAiConsent(false);
      setAiConsentReady(true);
      return () => { cancelled = true; };
    }
    getAiProcessingConsent(user.id)
      .then((accepted) => {
        if (!cancelled) setAiConsent(accepted);
      })
      .catch(() => {
        if (!cancelled) {
          setAiConsent(false);
          setAiConsentLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setAiConsentReady(true);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  async function save(patch: Parameters<typeof updateProfile>[0], okText?: string): Promise<boolean> {
    const err = await updateProfile(patch);
    if (err) {
      toast.show(/network|fetch|connection/i.test(err) ? 'Could not save while offline. Check your connection and try again.' : 'Could not save this setting. Your previous value is unchanged.', 'error');
      return false;
    }
    if (okText) toast.show(okText, 'success');
    return true;
  }

  async function saveName() {
    if (profileLoading || !nameDirty.current) return;
    const clean = name.trim().slice(0, 40);
    if (clean === (profile?.display_name ?? '')) {
      nameDirty.current = false;
      return;
    }
    if (await save({ display_name: clean || null }, 'Name saved')) {
      nameDirty.current = false;
      setName(clean);
    }
  }

  async function changeAiConsent(accepted: boolean) {
    if (!user?.id || aiConsentSaving) return;
    setAiConsentSaving(true);
    try {
      await setAiProcessingConsent(user.id, accepted);
      setAiConsent(accepted);
      setAiConsentLoadError(false);
      toast.show(accepted ? 'AI sharing is enabled for future requests.' : 'AI sharing is paused for future requests.', 'success');
    } catch {
      toast.show('Could not save this privacy choice on your device. Your current choice is unchanged.', 'error');
    } finally {
      setAiConsentSaving(false);
    }
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

  async function deleteAccount(password: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      await deleteAccountRequest(token, hasPassword ? password : null);
      setDeleteOpen(false);
      toast.show('Your account was deleted', 'success');
      await signOut(); // clears the local session; the sign-in screen appears
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete the account.');
    } finally {
      setDeleting(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  async function rateUs() {
    try {
      if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
      else toast.show('The official rating prompt is available from an app-store installation.', 'info');
    } catch {
      toast.show('Could not open the rating prompt right now.', 'info');
    }
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
      <ScrollView ref={settingsScroll} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(300)} style={styles.accessCard}>
          <View style={styles.accessHeader}>
            <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.accessMark}><Ionicons name="sparkles" size={20} color={colors.onAccent} /></LinearGradient>
            <View style={{ flex: 1 }}><Text style={styles.accessEyebrow}>AI ACCESS · PLAN CLARITY</Text><Text style={styles.accessTitle}>Know what’s connected.</Text></View>
          </View>
          <Text style={styles.accessCopy}>
            {providers === null ? 'Checking secure AI access…' : connected.length ? `${connected.length} AI provider${connected.length === 1 ? '' : 's'} available: ${connected.map((p) => p.name).join(', ')}.` : 'No AI provider is connected yet. Available models are managed securely on the Turzam server.'}
          </Text>
          <View style={styles.accessStatus}>
            <View style={[styles.statusDot, { backgroundColor: connected.length ? colors.success : providers === null ? colors.accent : colors.textFaint }]} />
            <Text style={styles.accessStatusText}>{providers === null ? (providersError ? 'Could not check access' : 'Checking provider access') : connected.length ? 'Provider access is ready' : 'Waiting for a provider connection'}</Text>
          </View>
          <Text style={styles.accessNote}>Subscriptions and in-app checkout aren’t configured in this build. Provider keys stay server-side; nothing here asks you to pay.</Text>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>AI data sharing</Text>
              <Text style={styles.hint}>Allow future prompts, relevant chat context, and attached files to be processed by the selected AI provider. Turning this off keeps future requests on hold; it does not remove existing chat history.</Text>
              {aiConsentLoadError ? <Text style={styles.hint}>Could not read the saved choice. Review it again before sending a new AI request.</Text> : null}
            </View>
            <Toggle
              value={aiConsent}
              label="Allow future prompts to be sent to third-party AI providers"
              hint="You can change this choice at any time. Earlier chat history is not deleted."
              disabled={!aiConsentReady || aiConsentSaving || !user?.id}
              onChange={changeAiConsent}
            />
          </View>
          <PressableScale onPress={() => settingsScroll.current?.scrollTo({ y: modelChoicesY.current, animated: true })} style={styles.accessButton} label="Review available AI choices">
            <Text style={styles.accessButtonText}>Review AI choices</Text><Ionicons name="arrow-down" size={15} color={colors.accentInk} />
          </PressableScale>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300)} style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            value={name}
            editable={!profileLoading && !!profile}
            onChangeText={(value) => { nameDirty.current = true; setName(value); }}
            onBlur={() => { void saveName(); }}
            onSubmitEditing={() => { void saveName(); }}
            placeholder="What should Turzam call you?"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            maxLength={40}
            style={styles.input}
          />
          <Text style={styles.hint}>{profileLoading ? 'Loading account settings…' : profileError ? `Could not load profile settings. Check your connection and reopen Settings. ${user?.email ?? ''}` : user?.email}</Text>
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

        <Animated.View entering={FadeInDown.delay(120).duration(300)} style={styles.card} onLayout={(e) => { modelChoicesY.current = e.nativeEvent.layout.y; }}>
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
            <Toggle value={profile?.memory_enabled !== false} label="Use and learn memories" disabled={profileLoading || !profile} onChange={(v) => { void save({ memory_enabled: v }); }} />
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
            <Toggle value={prefs.followUps} label="Suggest follow-up questions" onChange={setFollowUps} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.card}>
          <Text style={styles.label}>Custom instructions</Text>
          <Text style={styles.hint}>
            Tell Turzam how to answer you, every time. For example: "I run a 5-person design agency. Be brief and give me numbers."
          </Text>
          <TextInput
            value={instructions}
            onChangeText={(value) => { instructionsDirty.current = true; setInstructions(value); }}
            placeholder="How should Turzam answer you?"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            multiline
            maxLength={1500}
            style={[styles.input, { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' }]}
          />
          <View style={styles.switchRow}>
            <Text style={[styles.hint, { flex: 1 }]}>{instructions.length}/1500</Text>
            <PressableScale
              label="Save instructions"
              disabled={profileLoading || instructions.trim() === (profile?.custom_instructions ?? '').trim()}
              onPress={async () => {
                if (await save({ custom_instructions: instructions.trim() }, instructions.trim() ? 'Instructions saved' : 'Instructions cleared')) {
                  instructionsDirty.current = false;
                }
              }}
              style={[styles.chip, { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.16), opacity: instructions.trim() === (profile?.custom_instructions ?? '').trim() ? 0.45 : 1 }]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Save</Text>
            </PressableScale>
          </View>
          <Text style={[styles.label, { marginTop: 6 }]}>Default personality</Text>
          <View style={styles.chips}>
            {PERSONAS.map((p) => {
              const on = (profile?.default_persona ?? 'none') === p.id;
              return (
                <PressableScale
                  key={p.id}
                  label={`${p.name} personality`}
                  onPress={() => save({ default_persona: p.id })}
                  style={[styles.chip, on && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.16) }]}
                >
                  <Ionicons name={p.icon} size={15} color={on ? colors.accentInk : colors.textDim} />
                  <Text style={[styles.chipText, on && { color: colors.text }]}>{p.name}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(300)} style={styles.card}>
          <Text style={styles.label}>Voice</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Speak answers aloud</Text>
              <Text style={styles.hint}>In voice conversations Turzam reads its answers using your phone's built-in voice.</Text>
            </View>
            <Toggle value={profile?.voice_reply !== false} label="Speak answers aloud" disabled={profileLoading || !profile} onChange={(v) => { void save({ voice_reply: v }); }} />
          </View>
          <Text style={[styles.label, { marginTop: 6 }]}>Voice language</Text>
          <View style={styles.chips}>
            {VOICE_LANGS.map((l) => {
              const on = (profile?.voice_lang ?? '') === l.id;
              return (
                <PressableScale
                  key={l.id || 'auto'}
                  label={`Voice language ${l.label}`}
                  onPress={() => save({ voice_lang: l.id })}
                  style={[styles.chip, on && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.16) }]}
                >
                  <Text style={[styles.chipText, on && { color: colors.text }]}>{l.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={styles.hint}>This sets the reading voice and helps with understanding your speech. Auto uses your phone's language.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(300)} style={styles.card}>
          <PressableScale onPress={deleteChats} style={styles.linkRow} label="Delete all chats">
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
            <Text style={[styles.linkText, { color: colors.danger }]}>Delete all chats</Text>
          </PressableScale>
          <PressableScale
            onPress={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            style={styles.linkRow}
            label="Delete account"
          >
            <Ionicons name="person-remove-outline" size={19} color={colors.danger} />
            <Text style={[styles.linkText, { color: colors.danger }]}>Delete account</Text>
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
          <PressableScale onPress={rateUs} style={styles.linkRow} label="Rate Turzam AI">
            <Ionicons name="star-outline" size={19} color={colors.accentInk} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkText}>Rate Turzam AI</Text>
              <Text style={styles.hint}>Opens Apple’s or Google’s official in-app review prompt.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </PressableScale>
          <View style={styles.divider} />
          {([
            ['terms', 'document-text-outline', 'Terms and Conditions'],
            ['privacy', 'shield-checkmark-outline', 'Privacy Policy'],
            ['cookies', 'finger-print-outline', 'Cookie Policy'],
          ] as const).map(([doc, icon, label]) => (
            <PressableScale
              key={doc}
              onPress={() => router.push({ pathname: '/legal', params: { doc } })}
              style={styles.linkRow}
              label={label}
            >
              <Ionicons name={icon} size={19} color={colors.accentInk} />
              <Text style={styles.linkText}>{label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </PressableScale>
          ))}
          <View style={styles.divider} />
          <Text style={styles.version}>Version {APP_VERSION}</Text>
        </Animated.View>
      </ScrollView>
      <DeleteAccountModal
        visible={deleteOpen}
        busy={deleting}
        needsPassword={hasPassword}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteAccount}
      />
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    body: { paddingHorizontal: 16, gap: 14, paddingTop: 6, width: '100%', maxWidth: 720, alignSelf: 'center' },
    accessCard: { backgroundColor: withAlpha(t.colors.surface, 0.96), borderRadius: radius.xl, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.3), padding: 17, gap: 10 },
    accessHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    accessMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    accessEyebrow: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 9.5, letterSpacing: 1 },
    accessTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 25, marginTop: 1 },
    accessCopy: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
    accessStatus: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: t.colors.bgElevated, borderWidth: 1, borderColor: t.colors.border },
    accessStatusText: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 12 },
    accessNote: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, lineHeight: 17 },
    accessButton: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.accent, 0.1) },
    accessButtonText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 12 },
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
