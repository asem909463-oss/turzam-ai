import React, { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { colors, fonts, radius, withAlpha } from '../theme';
import type { PickedImage } from '../types';

type Props = {
  busy: boolean;
  accent: string;
  placeholder: string;
  onSend: (text: string, image: PickedImage | null) => void;
  onStop: () => void;
  /** Set this to put text into the box (used by the suggestion cards). */
  prefill?: { text: string; nonce: number } | null;
};

const PICK_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.5,
  base64: true,
  allowsEditing: false,
};

function toPicked(res: ImagePicker.ImagePickerResult): PickedImage | null {
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (!a.base64) return null;
  return { uri: a.uri, base64: a.base64, mime: a.mimeType ?? 'image/jpeg' };
}

export function Composer({ busy, accent, placeholder, onSend, onStop, prefill }: Props) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const inputRef = useRef<TextInput>(null);
  const focus = useSharedValue(0);

  useEffect(() => {
    if (prefill) {
      setText(prefill.text);
      inputRef.current?.focus();
    }
  }, [prefill]);

  const canSend = !busy && (text.trim().length > 0 || !!image);
  const sendReady = useSharedValue(0);
  useEffect(() => {
    sendReady.value = withSpring(canSend || busy ? 1 : 0, { damping: 14, stiffness: 240 });
  }, [canSend, busy, sendReady]);

  const focusColor = withAlpha(accent, 0.8);
  const box = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.border, focusColor]),
  }));
  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.88 + sendReady.value * 0.12 }],
    opacity: 0.4 + sendReady.value * 0.6,
  }));

  async function pick(source: 'camera' | 'library') {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera blocked', 'Allow camera access for Turzam AI in your phone settings.');
          return;
        }
        const p = toPicked(await ImagePicker.launchCameraAsync(PICK_OPTS));
        if (p) setImage(p);
      } else {
        const p = toPicked(await ImagePicker.launchImageLibraryAsync(PICK_OPTS));
        if (p) setImage(p);
      }
    } catch {
      Alert.alert('Could not open that', 'Please try again.');
    }
  }

  function attach() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2, userInterfaceStyle: 'dark' },
        (i) => {
          if (i === 0) pick('camera');
          if (i === 1) pick('library');
        },
      );
    } else {
      Alert.alert('Add an image', undefined, [
        { text: 'Take photo', onPress: () => pick('camera') },
        { text: 'Choose from library', onPress: () => pick('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function submit() {
    if (!canSend) return;
    onSend(text, image);
    setText('');
    setImage(null);
  }

  return (
    <View style={styles.wrap}>
      {image ? (
        <Animated.View entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(150)} style={styles.previewRow}>
          <View>
            <Image source={{ uri: image.uri }} style={styles.preview} />
            <PressableScale label="Remove image" style={styles.removeBtn} onPress={() => setImage(null)}>
              <Ionicons name="close" size={14} color="#fff" />
            </PressableScale>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.box, box]}>
        <PressableScale label="Add image" style={styles.attach} onPress={attach} disabled={busy}>
          <Ionicons name="image-outline" size={22} color={colors.textDim} />
        </PressableScale>

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          selectionColor={accent}
          multiline
          maxLength={8000}
          onFocus={() => (focus.value = withSpring(1))}
          onBlur={() => (focus.value = withSpring(0))}
          style={styles.input}
        />

        <Animated.View style={sendStyle}>
          {busy ? (
            <Animated.View key="stop" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <PressableScale label="Stop" onPress={onStop} style={[styles.send, { backgroundColor: colors.danger }]}>
                <Ionicons name="stop" size={18} color={colors.bg} />
              </PressableScale>
            </Animated.View>
          ) : (
            <Animated.View key="send" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <PressableScale
                label="Send"
                onPress={submit}
                disabled={!canSend}
                style={[styles.send, { backgroundColor: accent }]}
              >
                <Ionicons name="arrow-up" size={21} color={colors.bg} />
              </PressableScale>
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6, gap: 8 },
  previewRow: { flexDirection: 'row', paddingLeft: 6 },
  preview: { width: 74, height: 74, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  removeBtn: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  attach: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 40,
    color: colors.text,
    fontFamily: fonts.uiRegular,
    fontSize: 16,
    paddingTop: Platform.OS === 'ios' ? 11 : 8,
    paddingBottom: Platform.OS === 'ios' ? 11 : 8,
    textAlignVertical: 'center',
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
