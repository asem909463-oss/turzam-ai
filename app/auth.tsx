import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Aurora } from '../src/components/Aurora';
import { Field } from '../src/components/Field';
import { GradientButton } from '../src/components/GradientButton';
import { Logo } from '../src/components/Logo';
import { Motto } from '../src/components/Motto';
import { PressableScale } from '../src/components/PressableScale';
import { useAuth } from '../src/context/AuthContext';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

export default function AuthScreen() {
  const { signIn, signUp, signInWithProvider, requestPasswordReset } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles(make);
  const [isSignUp, setIsSignUp] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  function fail(msg: string) {
    setError(msg);
    setInfo(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    shake.value = withSequence(
      withTiming(-10, { duration: 55 }),
      withTiming(10, { duration: 55 }),
      withTiming(-8, { duration: 55 }),
      withTiming(8, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
  }

  async function social(provider: 'google' | 'apple') {
    if (busy || socialBusy) return;
    setError(null);
    setInfo(null);
    setSocialBusy(provider);
    const err = await signInWithProvider(provider);
    setSocialBusy(null);
    if (err) fail(err);
  }

  async function submit() {
    if (busy) return;
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail('Enter a valid email address.');
    if (!resetMode && password.length < 6) return fail('Your password needs at least 6 characters.');
    setBusy(true);
    try {
      if (resetMode) {
        const err = await requestPasswordReset(email);
        if (err) fail(err);
        else setInfo('If an account exists for this email, a password reset link is on its way.');
      } else if (isSignUp) {
        const res = await signUp(email, password);
        if (res.error) fail(res.error);
        else if (res.needsConfirm) {
          setInfo('Account created. Open the confirmation email we sent you, then come back and sign in.');
          setIsSignUp(false);
          setPassword('');
        }
      } else {
        const err = await signIn(email, password);
        if (err) fail(err);
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 30 }]}
        >
          <Logo size={132} />
          <Animated.Text entering={FadeInDown.delay(120).duration(500)} style={styles.brand}>
            Turzam AI
          </Animated.Text>
          <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ marginBottom: 14 }}>
            <Motto size={24} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(340).duration(500)} style={[styles.card, shakeStyle]}>
            <Text style={styles.cardTitle}>{resetMode ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}</Text>
            <Field
              icon="mail-outline"
              placeholder="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
            />
            {!resetMode ? <Field
              icon="lock-closed-outline"
              placeholder="Password"
              secureToggle
              autoCapitalize="none"
              textContentType={isSignUp ? 'newPassword' : 'password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            /> : null}
            {error ? (
              <Animated.Text entering={FadeInDown.duration(200)} style={styles.error}>
                {error}
              </Animated.Text>
            ) : null}
            {info ? (
              <Animated.Text entering={FadeInDown.duration(200)} style={styles.info}>
                {info}
              </Animated.Text>
            ) : null}
            <GradientButton title={resetMode ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} />

            {!isSignUp && !resetMode ? (
              <PressableScale
                onPress={() => { setResetMode(true); setError(null); setInfo(null); }}
                style={{ alignSelf: 'flex-end', paddingVertical: 2 }}
                label="Reset your password"
              >
                <Text style={styles.consentLink}>Forgot password?</Text>
              </PressableScale>
            ) : null}

            {!resetMode ? <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View> : null}
            {!resetMode ? <PressableScale
              onPress={() => social('google')}
              disabled={busy || socialBusy !== null}
              style={styles.socialBtn}
              label="Continue with Google"
            >
              <Ionicons name="logo-google" size={19} color={colors.text} />
              <Text style={styles.socialText}>{socialBusy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
            </PressableScale> : null}
            {!resetMode ? <PressableScale
              onPress={() => social('apple')}
              disabled={busy || socialBusy !== null}
              style={styles.socialBtn}
              label="Continue with Apple"
            >
              <Ionicons name="logo-apple" size={21} color={colors.text} />
              <Text style={styles.socialText}>{socialBusy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}</Text>
            </PressableScale> : null}

            {!resetMode ? <Text style={styles.consent}>
              By continuing you agree to our{' '}
              <Text style={styles.consentLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}>
                Terms
              </Text>
              ,{' '}
              <Text style={styles.consentLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}>
                Privacy Policy
              </Text>{' '}
              and{' '}
              <Text style={styles.consentLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'cookies' } })}>
                Cookie Policy
              </Text>
              .
            </Text> : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(440).duration(500)}>
            <PressableScale
              onPress={() => {
                if (resetMode) {
                  setResetMode(false);
                  setIsSignUp(false);
                } else setIsSignUp((v) => !v);
                setError(null);
                setInfo(null);
              }}
              style={styles.switch}
              label="Switch between sign in and sign up"
            >
              <Text style={styles.switchText}>
                {resetMode ? 'Remembered it? ' : isSignUp ? 'Already have an account? ' : 'New to Turzam? '}
                <Text style={{ color: colors.accentInk, fontFamily: fonts.uiBold }}>{resetMode ? 'Back to sign in' : isSignUp ? 'Sign in' : 'Create an account'}</Text>
              </Text>
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    body: { alignItems: 'center', paddingHorizontal: 22, gap: 8 },
    brand: { color: t.colors.text, fontFamily: fonts.display, fontSize: 48, marginTop: 6 },
    card: {
      alignSelf: 'stretch',
      maxWidth: 460,
      backgroundColor: withAlpha(t.colors.bgElevated, 0.92),
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      padding: 20,
      gap: 14,
    },
    cardTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 28 },
    error: { color: t.colors.danger, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
    info: { color: t.colors.success, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    orLine: { flex: 1, height: 1, backgroundColor: t.colors.border },
    orText: { color: t.colors.textFaint, fontFamily: fonts.ui, fontSize: 13 },
    socialBtn: {
      height: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.bgElevated,
    },
    socialText: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
    consent: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12.5, lineHeight: 19, textAlign: 'center' },
    consentLink: { color: t.colors.accentInk, fontFamily: fonts.uiBold },
    switch: { paddingVertical: 12 },
    switchText: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 15 },
  });
