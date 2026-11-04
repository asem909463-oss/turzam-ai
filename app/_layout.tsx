import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { ToastProvider } from '../src/context/ToastContext';
import { isConfigured } from '../src/lib/config';
import { supabase } from '../src/lib/supabase';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { session, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const userId = session?.user.id;
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  const ready = fontsLoaded && !loading;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (!userId || !isConfigured) return;
    const recordActivity = async () => {
      if (AppState.currentState !== 'active') return;
      const now = new Date();
      // One aggregate activity row per user per UTC day; no behavioral or conversation data.
      await supabase.from('user_activity').upsert({
        user_id: userId,
        activity_date: now.toISOString().slice(0, 10),
        last_active_at: now.toISOString(),
      });
    };
    void recordActivity();
    const timer = setInterval(() => void recordActivity(), 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recordActivity();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId]);

  if (!ready) return null;

  const signedIn = isConfigured && !!session;
  const needsSetup = !isConfigured;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        {/* Reachable signed in or out: legal texts and the Google / Apple sign-in return link */}
        <Stack.Screen name="legal" />
        <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
        <Stack.Protected guard={needsSetup}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={isConfigured && !session}>
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="memory" />
          <Stack.Screen name="projects" />
          <Stack.Screen name="project" />
          <Stack.Screen name="founder-admin" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
