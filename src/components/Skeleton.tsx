import React, { useEffect } from 'react';
import { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

/** A softly pulsing placeholder shown while something loads. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })), -1, false);
  }, [v]);
  const s = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.5 }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceHi }, s, style]} />;
}
