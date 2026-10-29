import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Aurora } from '../src/components/Aurora';
import { Orb } from '../src/components/Orb';
import { Field } from '../src/components/Field';
import { GradientButton } from '../src/components/GradientButton';
import { PressableScale } from '../src/components/PressableScale';
import { useAuth } from '../src/context/AuthContext';
import { colors, fonts, radius, withAlpha } from '../src/theme';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
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

  async function submit() {
    if (busy) return;
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail('Enter a valid email address.');
    if (password.length < 6) return fail('Your password needs at least 6 characters.');
    setBusy(true);
    try {
      if (isSignUp) {
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
          contentContainerStyle={[styles.body, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 30 }]}
        >
          <Orb size={84} />
          <Animated.Text entering={FadeInDown.delay(120).duration(500)} style={styles.brand}>
            Turzam
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220).duration(500)} style={styles.tag}>
            An assistant that <Text style={styles.tagItalic}>remembers</Text> what matters.
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(320).duration(500)} style={[styles.card, shakeStyle]}>
            <Text style={styles.cardTitle}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>
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
            <Field
              icon="lock-closed-outline"
              placeholder="Password"
              secureToggle
              autoCapitalize="none"
              textContentType={isSignUp ? 'newPassword' : 'password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
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
            <GradientButton title={isSignUp ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(420).duration(500)}>
            <PressableScale
              onPress={() => {
                setIsSignUp((v) => !v);
                setError(null);
                setInfo(null);
              }}
              style={styles.switch}
              label="Switch between sign in and sign up"
            >
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account? ' : 'New to Turzam? '}
                <Text style={{ color: colors.cyan, fontFamily: fonts.uiBold }}>{isSignUp ? 'Sign in' : 'Create an account'}</Text>
              </Text>
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingHorizontal: 22, gap: 12 },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: 56, marginTop: 14 },
  tag: { color: colors.textDim, fontFamily: fonts.uiRegular, fontSize: 16, marginBottom: 18 },
  tagItalic: { fontFamily: fonts.displayItalic, fontSize: 19, color: colors.text },
  card: {
    alignSelf: 'stretch',
    backgroundColor: withAlpha(colors.bgElevated, 0.9),
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 20,
    gap: 14,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 28 },
  error: { color: colors.danger, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
  info: { color: colors.success, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
  switch: { paddingVertical: 12 },
  switchText: { color: colors.textDim, fontFamily: fonts.uiRegular, fontSize: 15 },
});
