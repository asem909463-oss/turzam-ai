import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme } from '../theme';

export type SheetAction = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  destructive?: boolean;
};

/** Bottom sheet with a short list of actions (attach menu, chat menu). */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(make);
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(200)}
          style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}
        >
          <View style={styles.grab} />
          {title ? (
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          ) : null}
          {actions.map((a, i) => {
            const tint = a.destructive ? colors.danger : colors.text;
            return (
              <Animated.View key={a.label} entering={FadeInDown.delay(40 + i * 40).duration(240)}>
                <PressableScale
                  label={a.label}
                  scaleTo={0.97}
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    // let the sheet close first so pickers / alerts open cleanly
                    setTimeout(a.onPress, 220);
                  }}
                >
                  <View style={styles.icon}>
                    <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.accentInk} />
                  </View>
                  <Text style={[styles.label, { color: tint }]}>{a.label}</Text>
                </PressableScale>
              </Animated.View>
            );
          })}
          <PressableScale label="Cancel" onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
        </Animated.View>
      </View>
    </Modal>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.colors.overlay },
    bottom: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.colors.bgElevated,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: t.colors.borderStrong,
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 8,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: t.colors.borderStrong, marginBottom: 6 },
    title: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 14, textAlign: 'center', marginBottom: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceHi },
    label: { fontFamily: fonts.uiBold, fontSize: 16 },
    cancel: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    cancelText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 16 },
  });
