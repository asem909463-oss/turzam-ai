import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useToast } from '../context/ToastContext';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme, withAlpha } from '../theme';
import type { Source } from '../types';

function host(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return (m?.[1] ?? url).replace(/^www\./, '');
}

/** Clickable citations under an answer that used web search. */
export function Sources({ sources }: { sources: Source[] }) {
  const styles = useStyles(make);
  const { colors } = useTheme();
  const toast = useToast();
  if (!sources.length) return null;

  async function open(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show('Could not open that link.', 'error');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="globe-outline" size={14} color={colors.accentInk} />
        <Text style={styles.headText}>Sources</Text>
      </View>
      <View style={styles.list}>
        {sources.map((s, i) => (
          <Animated.View key={s.url} entering={FadeInDown.delay(i * 50).duration(240)}>
            <PressableScale scaleTo={0.97} label={`Open source ${i + 1}: ${s.title}`} style={styles.chip} onPress={() => open(s.url)}>
              <View style={styles.num}>
                <Text style={styles.numText}>{i + 1}</Text>
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text numberOfLines={1} style={styles.title}>
                  {s.title}
                </Text>
                {s.title !== host(s.url) && !/vertexaisearch|grounding-api/.test(s.url) ? (
                  <Text numberOfLines={1} style={styles.host}>
                    {host(s.url)}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="open-outline" size={13} color={colors.textFaint} />
            </PressableScale>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 10, gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headText: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 12.5, letterSpacing: 0.4 },
    list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: 260,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    num: { width: 20, height: 20, borderRadius: 10, backgroundColor: withAlpha(t.colors.accent, 0.2), alignItems: 'center', justifyContent: 'center' },
    numText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 11.5 },
    title: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 13 },
    host: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11 },
  });
