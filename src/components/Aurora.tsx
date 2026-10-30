import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { withAlpha } from '../theme';

function Blob({
  size,
  color,
  alpha,
  top,
  left,
  dx,
  dy,
  duration,
}: {
  size: number;
  color: string;
  alpha: number;
  top: number;
  left: number;
  dx: number;
  dy: number;
  duration: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [t, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * dx }, { translateY: t.value * dy }, { scale: 1 + t.value * 0.12 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top, left, width: size, height: size }, style]}>
      <LinearGradient
        colors={[withAlpha(color, alpha), withAlpha(color, 0.0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1, borderRadius: size / 2 }}
      />
    </Animated.View>
  );
}

/** Soft, slowly drifting colour clouds behind the whole app. Follows the accent colour. */
export function Aurora() {
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const a = isDark ? 0.34 : 0.22;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Blob size={width * 1.3} color={colors.accent2} alpha={a} top={-width * 0.55} left={-width * 0.35} dx={50} dy={40} duration={7000} />
      <Blob size={width * 1.1} color={colors.accent} alpha={a} top={height * 0.45} left={width * 0.3} dx={-60} dy={-50} duration={9000} />
    </View>
  );
}
