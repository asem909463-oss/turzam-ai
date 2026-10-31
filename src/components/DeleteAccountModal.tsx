import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme } from '../theme';

/** Asks for the password and the word DELETE before the account is permanently removed. */
export function DeleteAccountModal({
  visible,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const styles = useStyles(make);
  const { colors } = useTheme();
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (visible) {
      setWord('');
      setPassword('');
    }
  }, [visible]);

  const ready = word.trim() === 'DELETE' && password.length > 0 && !busy;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={busy ? undefined : onCancel} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <Animated.View entering={ZoomIn.springify().damping(18)} style={styles.card}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>
            This permanently deletes your account, all chats, uploaded files, folders and memories. It cannot be undone.
          </Text>
          <TextInput
            value={word}
            onChangeText={setWord}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Type DELETE"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Your password"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            onSubmitEditing={() => ready && onConfirm(password)}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <PressableScale label="Cancel" onPress={onCancel} disabled={busy} style={[styles.btn, styles.ghost]}>
              <Text style={styles.ghostText}>Cancel</Text>
            </PressableScale>
            <PressableScale
              label="Delete my account"
              disabled={!ready}
              onPress={() => onConfirm(password)}
              style={[styles.btn, { backgroundColor: colors.danger, opacity: ready ? 1 : 0.45 }]}
            >
              <Text style={styles.deleteText}>{busy ? 'Deleting…' : 'Delete forever'}</Text>
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
      gap: 12,
    },
    title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 28 },
    body: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21 },
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
    error: { color: t.colors.danger, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: { flex: 1, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    ghost: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
    ghostText: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 15 },
    deleteText: { color: '#fff', fontFamily: fonts.uiBold, fontSize: 15 },
  });
