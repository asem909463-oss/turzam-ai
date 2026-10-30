import React, { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme } from '../theme';

type Props = TextInputProps & {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  secureToggle?: boolean;
};

/** Text field whose border glows while focused. */
export function Field({ icon, secureToggle, style, onFocus, onBlur, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(make);
  const focus = useSharedValue(0);
  const [hidden, setHidden] = useState(!!secureToggle);

  const from = colors.border;
  const to = colors.accent;
  const bgFrom = colors.surface;
  const bgTo = colors.surfaceHi;
  const box = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [from, to]),
    backgroundColor: interpolateColor(focus.value, [0, 1], [bgFrom, bgTo]),
  }));

  return (
    <Animated.View style={[styles.box, box]}>
      <Ionicons name={icon} size={19} color={colors.textDim} />
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        {...rest}
        secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
        onFocus={(e) => {
          focus.value = withTiming(1, { duration: 180 });
          onFocus?.(e);
        }}
        onBlur={(e) => {
          focus.value = withTiming(0, { duration: 180 });
          onBlur?.(e);
        }}
        style={[styles.input, style]}
      />
      {secureToggle ? (
        <PressableScale onPress={() => setHidden((h) => !h)} label={hidden ? 'Show password' : 'Hide password'}>
          <View>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textDim} />
          </View>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      height: 54,
      paddingHorizontal: 16,
      borderRadius: radius.lg,
      borderWidth: 1,
    },
    input: { flex: 1, color: t.colors.text, fontFamily: fonts.ui, fontSize: 16, height: '100%' },
  });
