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
import { colors, withAlpha } from '../theme';

function Blob({
  size,
  color,
  top,
  left,
  dx,
  dy,
  duration,
}: {
  size: number;
  color: string;
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
        colors={[withAlpha(color, 0.34), withAlpha(color, 0.0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1, borderRadius: size / 2 }}
      />
    </Animated.View>
  );
}

/** Soft, slowly drifting colour clouds behind the whole app. */
export function Aurora() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Blob size={width * 1.3} color={colors.violet} top={-width * 0.55} left={-width * 0.35} dx={50} dy={40} duration={7000} />
      <Blob size={width * 1.1} color={colors.cyan} top={height * 0.45} left={width * 0.3} dx={-60} dy={-50} duration={9000} />
    </View>
  );
}
