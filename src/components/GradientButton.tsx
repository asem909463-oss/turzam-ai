import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from './PressableScale';
import { colors, fonts, gradients, radius } from '../theme';

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
  const off = disabled || loading;
  return (
    <PressableScale onPress={onPress} disabled={off} scaleTo={0.96} style={{ opacity: off ? 0.55 : 1 }} label={title}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        {loading ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <View>
            <Text style={styles.text}>{title}</Text>
          </View>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.bg, fontFamily: fonts.uiBold, fontSize: 16, letterSpacing: 0.3 },
});
