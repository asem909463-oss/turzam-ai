import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MAIN = require('../../assets/logo-main.png');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STAR = require('../../assets/logo-star.png');

// Where the star sits inside the (square) logo image, as a fraction of its size.
const STAR_X = 0.90875;
const STAR_Y = 0.22875;
const STAR_SIZE = 0.2;

/** The star on its own: it spins and pulses. Also used as the "thinking" spinner. */
export function StarSpinner({ size = 22, speed = 3200 }: { size?: number; speed?: number }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: speed, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })),
      -1,
      false,
    );
  }, [spin, pulse, speed]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }, { scale: 0.85 + pulse.value * 0.3 }],
    opacity: 0.75 + pulse.value * 0.25,
  }));
  return <Animated.Image source={STAR} style={[{ width: size * 1.9, height: size * 1.9, marginHorizontal: -size * 0.45 }, style]} />;
}

/** Turzam's official logo. The star twinkles, the whole mark floats and breathes. */
export function Logo({ size = 120, animated = true }: { size?: number; animated?: boolean }) {
  const { isDark, colors } = useTheme();
  const float = useSharedValue(0);
  const glow = useSharedValue(0);
  const star = useSharedValue(0);
  const twinkle = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    float.value = withRepeat(
      withSequence(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 3200, easing: Easing.inOut(Easing.sin) })),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.quad) })),
      -1,
      false,
    );
    star.value = withRepeat(withTiming(90, { duration: 5200, easing: Easing.linear }), -1, false);
    twinkle.value = withRepeat(
      withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })),
      -1,
      false,
    );
  }, [animated, float, glow, star, twinkle]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (float.value - 0.5) * size * 0.05 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.45, transform: [{ scale: 0.92 + glow.value * 0.16 }] }));
  const starStyle = useAnimatedStyle(() => ({
    opacity: 0.8 + twinkle.value * 0.2,
    transform: [{ rotate: `${star.value}deg` }, { scale: 0.88 + twinkle.value * 0.4 }],
  }));

  const inner = isDark ? size : size * 0.84;
  const starPx = inner * STAR_SIZE;

  const mark = (
    <Animated.View style={[{ width: inner, height: inner }, floatStyle]}>
      <Image source={MAIN} style={{ width: inner, height: inner }} resizeMode="contain" />
      <Animated.Image
        source={STAR}
        style={[
          {
            position: 'absolute',
            width: starPx,
            height: starPx,
            left: inner * STAR_X - starPx / 2,
            top: inner * STAR_Y - starPx / 2,
          },
          starStyle,
        ]}
      />
    </Animated.View>
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {isDark ? (
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none">
          <LinearGradient
            colors={[withAlpha(colors.accent, 0.3), withAlpha(colors.accent2, 0.0)]}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 1 }}
            style={{ flex: 1, borderRadius: size / 2, transform: [{ scale: 1.15 }] }}
          />
        </Animated.View>
      ) : (
        // The logo is made of light on black, so on a light theme it sits on a dark tile.
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size * 0.26,
            backgroundColor: '#04060F',
            shadowColor: colors.accent,
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        />
      )}
      {mark}
    </View>
  );
}
