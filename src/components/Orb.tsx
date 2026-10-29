import React, { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme';

/** Turzam's signature mark: a slowly turning gradient orb with a pulsing ring. */
export function Orb({ size = 64, animated = true }: { size?: number; animated?: boolean }) {
  const rot = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    rot.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [animated, rot, pulse]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const ring = useAnimatedStyle(() => ({
    opacity: animated ? 0.55 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 0.55 }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: colors.cyan,
          },
          ring,
        ]}
      />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, spin]}>
        <LinearGradient
          colors={[colors.violet, colors.cyan, colors.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      {/* dark core makes it a "lens" rather than a flat disc */}
      <View
        style={{
          position: 'absolute',
          width: size * 0.46,
          height: size * 0.46,
          borderRadius: size * 0.23,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.35)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.14,
          height: size * 0.14,
          borderRadius: size * 0.07,
          backgroundColor: '#fff',
          top: size * 0.27,
          left: size * 0.3,
          opacity: 0.9,
        }}
      />
    </View>
  );
}
