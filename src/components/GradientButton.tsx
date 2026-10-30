import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme } from '../theme';

export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { gradient, colors } = useTheme();
  const styles = useStyles(make);
  const off = disabled || loading;
  const [w, setW] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(
      withSequence(withDelay(1800, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), withTiming(0, { duration: 0 })),
      -1,
      false,
    );
  }, [sweep]);
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: -80 + sweep.value * (w + 160) }, { rotate: '18deg' }] }));

  return (
    <PressableScale onPress={onPress} disabled={off} scaleTo={0.96} style={{ opacity: off ? 0.55 : 1 }} label={title}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btn}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        <Animated.View pointerEvents="none" style={[styles.shine, shine]} />
        {loading ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <View>
            <Text style={styles.text}>{title}</Text>
          </View>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    btn: { height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    shine: { position: 'absolute', top: -20, bottom: -20, width: 46, backgroundColor: 'rgba(255,255,255,0.32)' },
    text: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 16, letterSpacing: 0.3 },
  });
