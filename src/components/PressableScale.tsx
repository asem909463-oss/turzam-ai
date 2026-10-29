import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  scaleTo?: number;
  haptic?: boolean;
  hitSlop?: number;
  label?: string;
};

/** Every button in Turzam uses this: springy press-down, light haptic tap. */
export function PressableScale({
  onPress,
  onLongPress,
  disabled,
  style,
  children,
  scaleTo = 0.93,
  haptic = true,
  hitSlop = 6,
  label,
}: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 16, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 11, stiffness: 260 });
      }}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
