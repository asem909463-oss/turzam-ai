import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useStyles } from '../src/context/ThemeContext';
import { LEGAL_DOCS, LEGAL_UPDATED, legalDoc } from '../src/legal';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

/** Terms, Privacy and Cookie policy. Reachable before sign-in (from the sign-in screen). */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles(make);
  const current = legalDoc(typeof doc === 'string' ? doc : undefined);

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader title="Legal" />
      <View style={styles.tabs}>
        {LEGAL_DOCS.map((d) => {
          const on = d.id === current.id;
          return (
            <PressableScale
              key={d.id}
              label={d.title}
              onPress={() => router.setParams({ doc: d.id })}
              style={[styles.tab, on && styles.tabOn]}
              scaleTo={0.96}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{d.tab}</Text>
            </PressableScale>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 30 }]}>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.updated}>Last updated {LEGAL_UPDATED}</Text>
        <Text style={styles.p}>{current.intro}</Text>
        {current.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.h}>{s.heading}</Text>
            {s.body.map((para, i) => (
              <Text key={i} style={styles.p}>
                {para}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    tabs: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
    },
    tab: {
      flex: 1,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: withAlpha(t.colors.surface, 0.9),
    },
    tabOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    tabText: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 13.5 },
    tabTextOn: { color: t.colors.onAccent },
    body: { paddingHorizontal: 20, paddingTop: 8, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
    title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 34 },
    updated: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 13 },
    section: { gap: 6, marginTop: 8 },
    h: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
    p: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 15, lineHeight: 23 },
  });
