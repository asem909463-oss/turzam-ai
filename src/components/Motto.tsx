import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useStyles } from '../context/ThemeContext';
import { fonts, Theme } from '../theme';

export const MOTTO = 'The AI for business & founders';

const LINES = [
  'Draft the investor pitch.',
  'Pressure-test your plan.',
  'Write the cold email.',
  'Name the brand.',
  'Create something bold.',
];

/** The brand line, with a rotating sub-line that shows what Turzam is for. */
export function Motto({ size = 30, rotate = true }: { size?: number; rotate?: boolean }) {
  const styles = useStyles(make);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!rotate) return;
    const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 2800);
    return () => clearInterval(t);
  }, [rotate]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.head, { fontSize: size, lineHeight: size * 1.18 }]}>
        The AI for <Text style={styles.italic}>business & founders</Text>
      </Text>
      {rotate ? (
        <View style={styles.lineBox}>
          <Animated.Text key={i} entering={FadeInDown.duration(380)} exiting={FadeOutUp.duration(220)} style={styles.line}>
            {LINES[i]}
          </Animated.Text>
        </View>
      ) : null}
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: 6 },
    head: { color: t.colors.text, fontFamily: fonts.display, textAlign: 'center' },
    italic: { fontFamily: fonts.displayItalic, color: t.colors.accentInk },
    lineBox: { height: 24, overflow: 'hidden', justifyContent: 'center' },
    line: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 15, textAlign: 'center', position: 'absolute', left: 0, right: 0 },
  });
