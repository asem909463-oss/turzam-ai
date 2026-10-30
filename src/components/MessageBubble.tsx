import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AttachmentChip } from './AttachmentChip';
import { Markdown } from './Markdown';
import { PressableScale } from './PressableScale';
import { StarSpinner } from './Logo';
import { Thinking } from './Thinking';
import { useToast } from '../context/ToastContext';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme, withAlpha } from '../theme';
import type { ChatMessage } from '../types';

const PROVIDER_LABEL: Record<string, string> = { gemini: 'Gemini', openai: 'ChatGPT', anthropic: 'Claude' };

function Caret() {
  const { colors } = useTheme();
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(0.1, { duration: 450 }), withTiming(1, { duration: 450 })), -1, false);
  }, [v]);
  const s = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[{ width: 8, height: 16, borderRadius: 2, backgroundColor: colors.accent, marginTop: 4 }, s]} />;
}

type Props = {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  accent: string;
  onRegenerate: () => void;
};

function BubbleBase({ message, isLast, busy, accent, onRegenerate }: Props) {
  const styles = useStyles(make);
  const { colors } = useTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    toast.show('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 1600);
  }

  if (message.role === 'user') {
    const atts = message.attachments ?? [];
    return (
      <Animated.View entering={FadeInDown.duration(260)} style={styles.userRow}>
        <PressableScale
          scaleTo={0.985}
          haptic={false}
          onLongPress={() => message.content && copy(message.content)}
          style={[styles.userBubble, { borderColor: withAlpha(accent, 0.4) }]}
        >
          {atts.length ? (
            <View style={styles.attRow}>
              {atts.map((a) => (
                <AttachmentChip key={a.id} name={a.name} mime={a.mime} size={a.size} uri={a.uri} large />
              ))}
            </View>
          ) : null}
          {message.content ? (
            <Text selectable style={styles.userText}>
              {message.content}
            </Text>
          ) : null}
        </PressableScale>
      </Animated.View>
    );
  }

  const waiting = message.streaming && !message.content;
  const provider = message.provider ? PROVIDER_LABEL[message.provider] : null;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={styles.modelRow}>
      <View style={styles.avatar}>
        <StarSpinner size={9} speed={message.streaming ? 1800 : 9000} />
      </View>
      <View style={{ flex: 1 }}>
        {waiting ? <Thinking label={message.working} /> : <Markdown text={message.content} />}
        {message.streaming && message.content ? <Caret /> : null}
        {message.error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{message.error}</Text>
          </View>
        ) : null}
        {!message.streaming && (message.content || message.error) ? (
          <View style={styles.actions}>
            {message.content ? (
              <PressableScale label="Copy answer" style={styles.actionBtn} onPress={() => copy(message.content)}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? colors.success : colors.textDim} />
              </PressableScale>
            ) : null}
            {isLast && !busy ? (
              <PressableScale label="Regenerate answer" style={styles.actionBtn} onPress={onRegenerate}>
                <Ionicons name="refresh" size={16} color={colors.textDim} />
              </PressableScale>
            ) : null}
            {provider ? <Text style={styles.provider}>{provider}</Text> : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export const MessageBubble = memo(BubbleBase);

const make = (t: Theme) =>
  StyleSheet.create({
    userRow: { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 6 },
    userBubble: {
      maxWidth: '86%',
      backgroundColor: t.colors.surfaceHi,
      borderRadius: radius.lg,
      borderBottomRightRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 15,
      paddingVertical: 11,
      gap: 8,
    },
    attRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    userText: { color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 16, lineHeight: 23 },
    modelRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      overflow: 'hidden',
    },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    actionBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    provider: { color: t.colors.textFaint, fontFamily: fonts.ui, fontSize: 12, marginLeft: 6 },
    errorBox: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      backgroundColor: withAlpha(t.colors.danger, 0.1),
      borderColor: withAlpha(t.colors.danger, 0.4),
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 12,
      marginTop: 8,
    },
    errorText: { flex: 1, color: t.colors.danger, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
  });
