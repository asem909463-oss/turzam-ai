import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
};

export function Toggle({ value, onChange, label, hint, disabled = false }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = reduceMotion ? (value ? 1 : 0) : withSpring(value ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [value, reduceMotion, p]);

  const off = colors.surfaceHi;
  const on = colors.accent;
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [off, on]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 22 }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(!value);
      }}
    >
      <Animated.View style={[styles.track, { borderColor: colors.borderStrong }, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center', borderWidth: 1 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
});
