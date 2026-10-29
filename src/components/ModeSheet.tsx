import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { MODES } from '../modes';
import { colors, fonts, radius, withAlpha } from '../theme';
import type { ModeId } from '../types';

type Props = {
  visible: boolean;
  current: ModeId;
  onSelect: (m: ModeId) => void;
  onClose: () => void;
};

export function ModeSheet({ visible, current, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(190)}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.grab} />
          <Text style={styles.title}>How should Turzam think?</Text>
          {MODES.map((m, i) => {
            const on = m.id === current;
            return (
              <Animated.View key={m.id} entering={FadeInDown.delay(60 + i * 45).duration(260)}>
                <PressableScale
                  label={m.name}
                  onPress={() => {
                    onSelect(m.id);
                    onClose();
                  }}
                  scaleTo={0.97}
                  style={[
                    styles.row,
                    on && { borderColor: withAlpha(m.color, 0.7), backgroundColor: withAlpha(m.color, 0.1) },
                  ]}
                >
                  <View style={[styles.icon, { backgroundColor: withAlpha(m.color, 0.16) }]}>
                    <Ionicons name={m.icon} size={20} color={m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{m.name}</Text>
                    <Text style={styles.tag}>{m.tagline}</Text>
                  </View>
                  {on ? <Ionicons name="checkmark-circle" size={22} color={m.color} /> : null}
                </PressableScale>
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: 8 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 28, marginBottom: 6, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
  tag: { color: colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, marginTop: 2 },
});
