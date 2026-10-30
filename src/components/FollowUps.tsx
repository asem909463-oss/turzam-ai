import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, Theme, withAlpha } from '../theme';

/** Tappable follow-up ideas shown under the latest answer. */
export function FollowUps({ items, accent, onPick }: { items: string[]; accent: string; onPick: (text: string) => void }) {
  const styles = useStyles(make);
  const { colors } = useTheme();
  if (!items.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {items.map((s, i) => (
        <Animated.View key={s} entering={FadeInRight.delay(i * 90).duration(320)}>
          <PressableScale
            label={s}
            onPress={() => onPick(s)}
            scaleTo={0.95}
            style={[styles.chip, { borderColor: withAlpha(accent, 0.5) }]}
          >
            <Ionicons name="sparkles-outline" size={14} color={accent} />
            <Text style={[styles.text, { color: colors.text }]}>{s}</Text>
          </PressableScale>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    row: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 38,
      paddingHorizontal: 14,
      borderRadius: 19,
      borderWidth: 1,
      backgroundColor: t.colors.surface,
    },
    text: { fontFamily: fonts.ui, fontSize: 14 },
  });
