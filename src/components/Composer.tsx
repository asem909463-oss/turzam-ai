import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { ActionSheet } from './ActionSheet';
import { AttachmentChip } from './AttachmentChip';
import { PressableScale } from './PressableScale';
import { useToast } from '../context/ToastContext';
import { useStyles, useTheme } from '../context/ThemeContext';
import { MAX_FILES, pickDocuments, pickPhotoFromLibrary, takePhoto, validateFile } from '../lib/attachments';
import { fonts, Theme, withAlpha } from '../theme';
import type { PickedFile } from '../types';

type Props = {
  busy: boolean;
  accent: string;
  placeholder: string;
  onSend: (text: string, files: PickedFile[]) => void;
  onStop: () => void;
  /** Set this to put text into the box (used by the suggestion cards). */
  prefill?: { text: string; nonce: number } | null;
  /** Opens the voice conversation. */
  onVoice?: () => void;
  /** Web search is on for the next answer. */
  searchOn?: boolean;
  onToggleSearch?: () => void;
  locked?: boolean;
  lockMessage?: string;
  onUpgrade?: () => void;
};

export function Composer({ busy, accent, placeholder, onSend, onStop, prefill, onVoice, searchOn, onToggleSearch, locked = false, lockMessage, onUpgrade }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [menu, setMenu] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const focus = useSharedValue(0);

  useEffect(() => {
    if (prefill) {
      setText(prefill.text);
      (inputRef.current as (React.ComponentRef<typeof TextInput> & { focus?: () => void }) | null)?.focus?.();
    }
  }, [prefill]);

  const hasImage = files.some((f) => f.mime.startsWith('image/'));
  const lenses: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; prompt: string }[] = [
    { label: 'Describe', icon: 'eye-outline', prompt: 'Describe this image in detail: what it shows, the key objects and context.' },
    { label: 'Extract text', icon: 'text-outline', prompt: 'Extract all the text in this image exactly as written, keeping the structure.' },
    { label: 'Explain chart', icon: 'bar-chart-outline', prompt: 'Explain this chart: what it measures, the key numbers, the trend, and what I should conclude.' },
    { label: 'Review design', icon: 'color-palette-outline', prompt: 'Review this design or screenshot like a senior designer: what works, what does not, and the 5 most important fixes.' },
    { label: 'Compare', icon: 'git-compare-outline', prompt: 'Compare these images: key differences and similarities, and which is better for my goal.' },
  ];
  const canSend = !busy && !locked && (text.trim().length > 0 || files.length > 0);
  const ready = useSharedValue(0);
  useEffect(() => {
    ready.value = withSpring(canSend || busy ? 1 : 0, { damping: 14, stiffness: 240 });
  }, [canSend, busy, ready]);

  const idle = colors.border;
  const focusColor = withAlpha(accent, 0.85);
  const box = useAnimatedStyle(() => ({ borderColor: interpolateColor(focus.value, [0, 1], [idle, focusColor]) }));
  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.88 + ready.value * 0.12 }],
    opacity: 0.4 + ready.value * 0.6,
  }));

  function add(picked: PickedFile[], error?: string) {
    if (error) toast.show(error, 'error');
    if (!picked.length) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const f of picked) {
        const problem = validateFile(f, next);
        if (problem) {
          toast.show(problem, 'error');
          continue;
        }
        next.push(f);
      }
      return next;
    });
  }

  function submit() {
    if (!canSend) return;
    onSend(text, files);
    setText('');
    setFiles([]);
  }

  return (
    <View style={styles.wrap}>
      {locked ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.lockedRow}>
          <Ionicons name="time-outline" size={16} color={accent} />
          <Text style={styles.lockedText}>{lockMessage ?? 'Free messages are temporarily paused.'}</Text>
          {onUpgrade ? (
            <PressableScale label="Explore premium plans" onPress={onUpgrade} style={styles.upgradeLink}>
              <Text style={[styles.lockedText, { color: accent, fontFamily: fonts.uiBold }]}>Upgrade</Text>
            </PressableScale>
          ) : null}
        </Animated.View>
      ) : null}
      {files.length ? (
        <Animated.View entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(150)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
            {files.map((f, i) => (
              <AttachmentChip
                key={`${f.uri}-${i}`}
                name={f.name}
                mime={f.mime}
                size={f.size}
                uri={f.uri}
                onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      {hasImage && !text.trim() ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lensRow} keyboardShouldPersistTaps="handled">
            {lenses
              .filter((l) => l.label !== 'Compare' || files.filter((f) => f.mime.startsWith('image/')).length > 1)
              .map((l) => (
                <PressableScale key={l.label} label={l.label} scaleTo={0.94} style={styles.lens} onPress={() => setText(l.prompt)}>
                  <Ionicons name={l.icon} size={14} color={accent} />
                  <Text style={styles.lensText}>{l.label}</Text>
                </PressableScale>
              ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.box, box]}>
        <PressableScale
          label={`Attach files (${files.length}/${MAX_FILES})`}
          style={styles.attach}
          onPress={() => setMenu(true)}
          disabled={busy || locked}
        >
          <Ionicons name="add" size={26} color={colors.textDim} />
        </PressableScale>

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={locked ? 'Free chat is temporarily paused' : placeholder}
          placeholderTextColor={colors.textFaint}
          selectionColor={accent}
          multiline
          editable={!locked}
          maxLength={8000}
          onFocus={() => (focus.value = withSpring(1))}
          onBlur={() => (focus.value = withSpring(0))}
          style={styles.input}
        />

        {onToggleSearch ? (
          <PressableScale
            label={searchOn ? 'Turn web search off' : 'Turn web search on'}
            onPress={onToggleSearch}
            disabled={busy || locked}
            style={[styles.attach, searchOn && { backgroundColor: withAlpha(accent, 0.2), borderRadius: 20 }]}
          >
            <Ionicons name="globe-outline" size={21} color={searchOn ? accent : colors.textDim} />
          </PressableScale>
        ) : null}

        {onVoice && !locked && !busy && !canSend ? (
          <PressableScale label="Voice conversation" onPress={onVoice} style={[styles.send, { backgroundColor: withAlpha(accent, 0.18) }]}>
            <Ionicons name="mic" size={20} color={accent} />
          </PressableScale>
        ) : (
        <Animated.View style={sendStyle}>
          {busy ? (
            <Animated.View key="stop" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <PressableScale label="Stop generating" onPress={onStop} style={[styles.send, { backgroundColor: colors.danger }]}>
                <Ionicons name="stop" size={18} color="#fff" />
              </PressableScale>
            </Animated.View>
          ) : (
            <Animated.View key="send" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <PressableScale
                label="Send message"
                onPress={submit}
                disabled={!canSend}
                style={[styles.send, { backgroundColor: accent }]}
              >
                <Ionicons name="arrow-up" size={21} color={colors.onAccent} />
              </PressableScale>
            </Animated.View>
          )}
        </Animated.View>
        )}
      </Animated.View>

      <ActionSheet
        visible={menu && !locked}
        title="Attach to your message"
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Photo library', icon: 'images-outline', onPress: async () => { const r = await pickPhotoFromLibrary(); add(r.files, r.error); } },
          { label: 'Take a photo', icon: 'camera-outline', onPress: async () => { const r = await takePhoto(); add(r.files, r.error); } },
          { label: 'PDF or file', icon: 'document-attach-outline', onPress: async () => { const r = await pickDocuments(); add(r.files, r.error); } },
        ]}
      />
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: 12, paddingTop: 6, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center' },
    lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.35), backgroundColor: withAlpha(t.colors.accent, 0.08) },
    lockedText: { flex: 1, color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 12.5 },
    upgradeLink: { paddingHorizontal: 4, paddingVertical: 2 },
    previewRow: { gap: 10, paddingLeft: 6, paddingRight: 6, paddingTop: 8, alignItems: 'center' },
    lensRow: { gap: 8, paddingHorizontal: 6 },
    lens: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface },
    lensText: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 13 },
    box: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      backgroundColor: t.colors.surface,
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
      color: t.colors.text,
      fontFamily: fonts.uiRegular,
      fontSize: 16,
      paddingTop: Platform.OS === 'ios' ? 11 : 8,
      paddingBottom: Platform.OS === 'ios' ? 11 : 8,
      textAlignVertical: 'center',
    },
    send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  });
