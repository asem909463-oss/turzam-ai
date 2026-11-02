import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Aurora } from '../src/components/Aurora';
import { GradientButton } from '../src/components/GradientButton';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { supabase } from '../src/lib/supabase';
import { fonts, Theme } from '../src/theme';

/**
 * Where Google / Apple sign-in returns to (turzam://auth-callback?code=...).
 * It swaps the one-time code for a session, then the app moves on by itself.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const router = useRouter();
  const styles = useStyles(make);
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const code = typeof params.code === 'string' ? params.code : '';
  const providerError =
    (typeof params.error_description === 'string' && params.error_description) || (typeof params.error === 'string' && params.error) || '';

  useEffect(() => {
    if (started.current) return;
    if (providerError) {
      started.current = true;
      setError(providerError.replace(/\+/g, ' '));
      return;
    }
    if (!code) return; // wait until the link parameters arrive
    started.current = true;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: e }) => {
        if (e) setError(e.message);
        else router.replace('/');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not finish signing in.'));
  }, [code, providerError, router]);

  return (
    <View style={styles.root}>
      <Aurora />
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.title}>Sign-in did not finish</Text>
            <Text style={styles.msg}>{error}</Text>
            <View style={{ alignSelf: 'stretch', maxWidth: 320 }}>
              <GradientButton title="Back to sign in" onPress={() => router.replace('/')} />
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.msg}>Signing you in…</Text>
          </>
        )}
      </View>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28 },
    title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 30, textAlign: 'center' },
    msg: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  });
