import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { authenticateFounder } from '../src/lib/founder-admin';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

export default function FounderAdminLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const progress = useSharedValue(0);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.58, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.65, 1.9]) }],
  }));
  const sealStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 0.55, 1], [0.7, 1.12, 1]) },
      { rotate: `${interpolate(progress.value, [0, 1], [-12, 0])}deg` },
    ],
  }));

  useEffect(() => {
    if (!success) return;
    progress.value = withTiming(1, { duration: 950 });
    const timer = setTimeout(() => router.replace('/founder-admin'), 1550);
    return () => clearTimeout(timer);
  }, [progress, router, success]);

  async function verify() {
    if (busy || success || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await authenticateFounder(code.trim());
      setCode('');
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setCode('');
      setError(e instanceof Error ? e.message : 'Unable to verify administrator access.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Aurora />
      <ScreenHeader title="Secure founder access" right={null} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          {success ? (
            <Animated.View entering={FadeIn.duration(260)} style={styles.successPanel}>
              <View style={styles.sealWrap}>
                <Animated.View style={[styles.glow, glowStyle]} />
                <Animated.View style={[styles.seal, sealStyle]}>
                  <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sealGradient}>
                    <Ionicons name="checkmark" size={42} color={colors.onAccent} />
                  </LinearGradient>
                </Animated.View>
              </View>
              <Animated.Text entering={FadeInDown.delay(170).duration(420)} style={styles.successTitle}>Access granted</Animated.Text>
              <Animated.Text entering={FadeInDown.delay(280).duration(420)} style={styles.successCopy}>Founder control is unlocked. Opening your dashboard…</Animated.Text>
            </Animated.View>
          ) : (
            <>
              <Animated.View entering={FadeInDown.duration(420)} style={styles.headerIcon}>
                <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
                  <Ionicons name="shield-checkmark" size={27} color={colors.onAccent} />
                </LinearGradient>
              </Animated.View>
              <Animated.Text entering={FadeInDown.delay(80).duration(430)} style={styles.title}>Verify it’s you</Animated.Text>
              <Animated.Text entering={FadeInDown.delay(140).duration(430)} style={styles.copy}>
                Enter the founder access code. It is sent directly to the secure server and is not added to chat or saved on this device.
              </Animated.Text>
              <Animated.View entering={FadeInDown.delay(210).duration(430)} style={styles.card}>
                <Text style={styles.label}>Founder access code</Text>
                <TextInput
                  value={code}
                  onChangeText={(value) => { setCode(value); setError(null); }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={128}
                  editable={!busy}
                  onSubmitEditing={() => { void verify(); }}
                  returnKeyType="go"
                  accessibilityLabel="Secure founder access code"
                  placeholder="Enter access code"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.accent}
                  style={styles.input}
                />
                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                <PressableScale onPress={() => { void verify(); }} disabled={busy || !code.trim()} label="Verify founder access" style={styles.pressable}>
                  <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, (busy || !code.trim()) && styles.buttonDisabled]}>
                    <Ionicons name={busy ? 'hourglass-outline' : 'lock-open-outline'} size={17} color={colors.onAccent} />
                    <Text style={styles.buttonText}>{busy ? 'Verifying securely…' : 'Unlock founder dashboard'}</Text>
                  </LinearGradient>
                </PressableScale>
              </Animated.View>
              <Animated.Text entering={FadeIn.delay(340).duration(450)} style={styles.footnote}>Your standard Turzam AI account and features remain available alongside admin tools.</Animated.Text>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const make = (t: Theme) => StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  headerIcon: { width: 64, height: 64, borderRadius: 22, overflow: 'hidden', marginBottom: 5 },
  headerGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 36, textAlign: 'center' },
  copy: { maxWidth: 390, color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 5 },
  card: { width: '100%', maxWidth: 430, padding: 18, gap: 12, borderWidth: 1, borderColor: t.colors.borderStrong, borderRadius: radius.xl, backgroundColor: withAlpha(t.colors.bgElevated, 0.94) },
  label: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 12 },
  input: { minHeight: 52, borderWidth: 1, borderColor: t.colors.borderStrong, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.bg, 0.55), paddingHorizontal: 14, color: t.colors.text, fontFamily: fonts.ui, fontSize: 16 },
  error: { color: t.colors.danger, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
  pressable: { borderRadius: radius.md, overflow: 'hidden', marginTop: 3 },
  button: { minHeight: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, borderRadius: radius.md, paddingHorizontal: 14 },
  buttonDisabled: { opacity: 0.58 },
  buttonText: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 14 },
  footnote: { maxWidth: 380, color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 3 },
  successPanel: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  sealWrap: { width: 116, height: 116, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  glow: { position: 'absolute', width: 76, height: 76, borderRadius: 38, backgroundColor: t.colors.accent },
  seal: { width: 82, height: 82, borderRadius: 28, overflow: 'hidden', elevation: 8 },
  sealGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 35, textAlign: 'center' },
  successCopy: { maxWidth: 330, color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
