import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme } from '../theme';

/** Small dialog for renaming a chat (works the same on iOS and Android). */
export function RenameModal({
  visible,
  initial,
  title = 'Rename chat',
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  title?: string;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const styles = useStyles(make);
  const { colors } = useTheme();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  const clean = value.trim().slice(0, 60);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <Animated.View entering={ZoomIn.springify().damping(18)} style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            maxLength={60}
            selectTextOnFocus
            placeholder="Chat name"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            onSubmitEditing={() => clean && onSave(clean)}
            returnKeyType="done"
            style={styles.input}
          />
          <View style={styles.row}>
            <PressableScale label="Cancel" onPress={onCancel} style={[styles.btn, styles.ghost]}>
              <Text style={styles.ghostText}>Cancel</Text>
            </PressableScale>
            <PressableScale
              label="Save name"
              disabled={!clean}
              onPress={() => onSave(clean)}
              style={[styles.btn, { backgroundColor: colors.accent, opacity: clean ? 1 : 0.45 }]}
            >
              <Text style={styles.saveText}>Save</Text>
            </PressableScale>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.colors.overlay },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: t.colors.bgElevated,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      padding: 20,
      gap: 14,
    },
    title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 28 },
    input: {
      height: 50,
      color: t.colors.text,
      fontFamily: fonts.ui,
      fontSize: 16,
      backgroundColor: t.colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    row: { flexDirection: 'row', gap: 10 },
    btn: { flex: 1, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    ghost: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
    ghostText: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 16 },
    saveText: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 16 },
  });
