import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useAuth } from '../src/context/AuthContext';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => router.replace('/'), 1200);
    return () => clearTimeout(timer);
  }, [router, saved]);

  async function submit() {
    if (busy || saved) return;
    setError(null);
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const message = await updatePassword(password);
      if (message) setError(message);
      else {
        setPassword('');
        setConfirmation('');
        setSaved(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your password. Request a new reset link and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Aurora />
      <ScreenHeader title="Choose a new password" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
          <Animated.View entering={FadeInDown.duration(350)} style={styles.icon}>
            <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconGradient}>
              <Ionicons name={saved ? 'checkmark' : 'key-outline'} size={26} color={colors.onAccent} />
            </LinearGradient>
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(60).duration(350)} style={styles.title}>{saved ? 'Password updated' : 'Set a new password'}</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(110).duration(350)} style={styles.copy}>
            {saved ? 'Your password is updated. Returning to Turzam AI…' : 'Choose a new password for your Turzam AI account.'}
          </Animated.Text>
          {!saved ? (
            <Animated.View entering={FadeInDown.delay(150).duration(350)} style={styles.card}>
              <Text style={styles.label}>New password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                editable={!busy}
                returnKeyType="next"
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.accent}
                style={styles.input}
              />
              <Text style={styles.label}>Confirm new password</Text>
              <TextInput
                value={confirmation}
                onChangeText={setConfirmation}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                editable={!busy}
                onSubmitEditing={() => { void submit(); }}
                returnKeyType="done"
                placeholder="Enter it again"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.accent}
                style={styles.input}
              />
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <PressableScale onPress={() => { void submit(); }} disabled={busy} label="Save new password" style={styles.pressable}>
                <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, busy && { opacity: 0.65 }]}>
                  <Text style={styles.buttonText}>{busy ? 'Saving securely…' : 'Save new password'}</Text>
                  {!busy ? <Ionicons name="arrow-forward" size={17} color={colors.onAccent} /> : null}
                </LinearGradient>
              </PressableScale>
            </Animated.View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const make = (t: Theme) => StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 13 },
  icon: { width: 60, height: 60, borderRadius: 20, overflow: 'hidden', marginBottom: 5 },
  iconGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 32, textAlign: 'center' },
  copy: { maxWidth: 370, color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  card: { width: '100%', maxWidth: 430, padding: 18, gap: 11, borderWidth: 1, borderColor: t.colors.borderStrong, borderRadius: radius.xl, backgroundColor: withAlpha(t.colors.bgElevated, 0.94) },
  label: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 12 },
  input: { minHeight: 50, borderWidth: 1, borderColor: t.colors.borderStrong, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.bg, 0.55), paddingHorizontal: 13, color: t.colors.text, fontFamily: fonts.ui, fontSize: 15 },
  error: { color: t.colors.danger, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
  pressable: { borderRadius: radius.md, overflow: 'hidden', marginTop: 5 },
  button: { minHeight: 49, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, borderRadius: radius.md, paddingHorizontal: 14 },
  buttonText: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 14 },
});
