import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { fonts } from '../theme';

export type Word = { text: string; italic?: boolean };

/** Headline whose words fade in one after another. */
export function WordReveal({ words, size = 40, delay = 0 }: { words: Word[]; size?: number; delay?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {words.map((w, i) => (
        <Animated.Text
          key={`${w.text}-${i}`}
          entering={FadeInDown.delay(delay + i * 110).duration(560)}
          style={{
            color: w.italic ? colors.accentInk : colors.text,
            fontFamily: w.italic ? fonts.displayItalic : fonts.display,
            fontSize: size,
            lineHeight: size * 1.15,
          }}
        >
          {w.text}
          {i < words.length - 1 ? ' ' : ''}
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
