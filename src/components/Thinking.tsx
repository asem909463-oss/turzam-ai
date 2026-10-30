import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StarSpinner } from './Logo';
import { useStyles } from '../context/ThemeContext';
import { fonts, Theme } from '../theme';

function Letter({ ch, index }: { ch: string; index: number }) {
  const v = useSharedValue(0.35);
  useEffect(() => {
    v.value = withDelay(
      index * 70,
      withRepeat(withSequence(withTiming(1, { duration: 520 }), withTiming(0.35, { duration: 700 })), -1, false),
    );
  }, [v, index]);
  const s = useAnimatedStyle(() => ({ opacity: v.value }));
  const styles = useStyles(make);
  return <Animated.Text style={[styles.letter, s]}>{ch === ' ' ? ' ' : ch}</Animated.Text>;
}

const PHRASES = ['Thinking', 'Working on it', 'Almost there'];

/** Claude-style "working" indicator: a spinning star and a shimmering word. */
export function Thinking({ label }: { label?: string }) {
  const styles = useStyles(make);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (label) return;
    const t = setInterval(() => setI((x) => (x + 1) % PHRASES.length), 2600);
    return () => clearInterval(t);
  }, [label]);

  const text = (label ?? PHRASES[i]) + '…';
  return (
    <View style={styles.row}>
      <StarSpinner size={20} />
      <Animated.View key={text} entering={FadeIn.duration(250)} exiting={FadeOut.duration(120)} style={styles.word}>
        {text.split('').map((ch, idx) => (
          <Letter key={`${text}-${idx}`} ch={ch} index={idx} />
        ))}
      </Animated.View>
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
    word: { flexDirection: 'row' },
    letter: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 15 },
  });
