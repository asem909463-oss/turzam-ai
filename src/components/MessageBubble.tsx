import React, { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Markdown } from './Markdown';
import { PressableScale } from './PressableScale';
import { colors, fonts, radius, withAlpha } from '../theme';
import type { ChatMessage } from '../types';

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1, false),
    );
  }, [v, delay]);
  const s = useAnimatedStyle(() => ({ opacity: 0.3 + v.value * 0.7, transform: [{ translateY: -v.value * 4 }] }));
  return <Animated.View style={[styles.dot, s]} />;
}

function TypingDots() {
  return (
    <View style={styles.dots}>
      <Dot delay={0} />
      <Dot delay={140} />
      <Dot delay={280} />
    </View>
  );
}

function Caret() {
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(0.1, { duration: 450 }), withTiming(1, { duration: 450 })), -1, false);
  }, [v]);
  const s = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[styles.caret, s]} />;
}

type Props = {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  accent: string;
  onRegenerate: () => void;
};

function BubbleBase({ message, isLast, busy, accent, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <Animated.View entering={FadeInDown.duration(260)} style={styles.userRow}>
        <View style={[styles.userBubble, { borderColor: withAlpha(accent, 0.35) }]}>
          {message.imageUri ? <Image source={{ uri: message.imageUri }} style={styles.image} resizeMode="cover" /> : null}
          {message.content ? (
            <Text selectable style={styles.userText}>
              {message.content}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  const waiting = message.streaming && !message.content;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={styles.modelRow}>
      <View style={[styles.avatar, { backgroundColor: withAlpha(accent, 0.18), borderColor: withAlpha(accent, 0.5) }]}>
        <Ionicons name="sparkles" size={13} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        {waiting ? <TypingDots /> : <Markdown text={message.content} />}
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
              <PressableScale
                label="Copy answer"
                style={styles.actionBtn}
                onPress={async () => {
                  await Clipboard.setStringAsync(message.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? colors.success : colors.textDim} />
              </PressableScale>
            ) : null}
            {isLast && !busy ? (
              <PressableScale label="Regenerate answer" style={styles.actionBtn} onPress={onRegenerate}>
                <Ionicons name="refresh" size={16} color={colors.textDim} />
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export const MessageBubble = memo(BubbleBase);

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 6 },
  userBubble: {
    maxWidth: '84%',
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 11,
    gap: 8,
  },
  userText: { color: colors.text, fontFamily: fonts.uiRegular, fontSize: 16, lineHeight: 23 },
  image: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.surface },
  modelRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dots: { flexDirection: 'row', gap: 6, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cyan },
  caret: { width: 8, height: 16, borderRadius: 2, backgroundColor: colors.cyan, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: withAlpha(colors.danger, 0.1),
    borderColor: withAlpha(colors.danger, 0.4),
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 8,
  },
  errorText: { flex: 1, color: colors.danger, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
});
