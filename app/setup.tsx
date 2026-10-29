import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { Orb } from '../src/components/Orb';
import { colors, fonts, radius } from '../src/theme';

/** Shown only until the two Supabase values are put in the ".env" file. */
export default function Setup() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}
      >
        <Orb size={72} />
        <Animated.Text entering={FadeInDown.delay(100)} style={styles.title}>
          Almost ready
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(180)} style={styles.sub}>
          Turzam AI needs your Supabase keys before it can start.
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(260)} style={styles.card}>
          <Text style={styles.step}>1. In the project folder, copy the file</Text>
          <Text style={styles.code}>.env.example</Text>
          <Text style={styles.step}>and name the copy</Text>
          <Text style={styles.code}>.env</Text>
          <Text style={styles.step}>2. Open .env and paste your Supabase Project URL and anon key.</Text>
          <Text style={styles.step}>3. Stop the app (Ctrl + C) and start it again with</Text>
          <Text style={styles.code}>npx expo start -c</Text>
          <Text style={styles.hint}>The full guide is in README.md.</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingHorizontal: 24, gap: 14 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 44, marginTop: 18 },
  sub: { color: colors.textDim, fontFamily: fonts.uiRegular, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  card: {
    alignSelf: 'stretch',
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  step: { color: colors.text, fontFamily: fonts.ui, fontSize: 15, lineHeight: 22 },
  code: {
    color: colors.cyan,
    fontFamily: fonts.uiBold,
    fontSize: 15,
    backgroundColor: 'rgba(56,224,240,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  hint: { color: colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13, marginTop: 6 },
});
