import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from './Aurora';
import { Logo } from './Logo';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { cleanForSpeech } from '../lib/speech';
import { fonts, Theme, withAlpha } from '../theme';

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

type Props = {
  visible: boolean;
  /** The chat is generating an answer. */
  busy: boolean;
  /** Latest finished answer; `nonce` changes for every new answer. */
  answer: { text: string; nonce: number } | null;
  lang?: string;
  speakReplies: boolean;
  accent: string;
  onUtterance: (text: string) => void;
  onStopGenerating: () => void;
  onClose: () => void;
};

const LABEL: Record<Phase, string> = {
  idle: 'Tap the mic to talk',
  listening: 'Listening…',
  transcribing: 'Understanding…',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to interrupt',
};

/** Hands-free voice conversation: listen, answer out loud, listen again. */
export function VoiceOverlay({ visible, busy, answer, lang, speakReplies, accent, onUtterance, onStopGenerating, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(make);
  const { colors } = useTheme();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const openRef = useRef(visible);
  const lastNonce = useRef<number | null>(null);
  const waitingRef = useRef(false);

  const mic = useVoiceInput({
    lang,
    onText: (text) => {
      if (!openRef.current) return;
      if (!text) {
        setPhase('idle');
        return;
      }
      setHeard(text);
      setReply('');
      waitingRef.current = true;
      setPhase('thinking');
      onUtterance(text);
    },
    onError: (m) => {
      toast.show(m, 'error');
      setPhase('idle');
    },
  });

  const listen = useCallback(async () => {
    Speech.stop();
    setPhase('listening');
    await mic.start();
  }, [mic]);

  // Overlay opens: start listening. Closes: stop everything.
  useEffect(() => {
    openRef.current = visible;
    if (visible) {
      lastNonce.current = answer?.nonce ?? null;
      setHeard('');
      setReply('');
      void listen();
    } else {
      Speech.stop();
      void mic.cancel();
      setPhase('idle');
      waitingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (mic.transcribing) setPhase('transcribing');
  }, [mic.transcribing]);

  // A new answer arrived: show it and read it aloud, then listen again.
  useEffect(() => {
    if (!visible || !answer || answer.nonce === lastNonce.current || !waitingRef.current) return;
    lastNonce.current = answer.nonce;
    waitingRef.current = false;
    setReply(answer.text);
    const spoken = cleanForSpeech(answer.text);
    if (!speakReplies || !spoken) {
      setPhase('idle');
      return;
    }
    setPhase('speaking');
    Speech.speak(spoken, {
      language: lang || undefined,
      rate: 1.0,
      onDone: () => {
        if (openRef.current) void listen();
      },
      onStopped: () => {},
      onError: () => setPhase('idle'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer?.nonce, visible]);

  // If generation fails or is stopped, don't hang on "Thinking…".
  useEffect(() => {
    if (visible && phase === 'thinking' && !busy && waitingRef.current) {
      const t = setTimeout(() => {
        if (waitingRef.current && openRef.current) {
          waitingRef.current = false;
          setPhase('idle');
        }
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [busy, phase, visible]);

  const scale = useSharedValue(1);
  useEffect(() => {
    const target = phase === 'listening' ? 1 + mic.level * 0.35 : phase === 'speaking' ? 1.12 : 1;
    scale.value = withSpring(target, { damping: 12, stiffness: 140 });
  }, [mic.level, phase, scale]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + (scale.value - 1) * 2.2 }], opacity: 0.18 + (scale.value - 1) * 1.2 }));

  function main() {
    if (phase === 'listening') void mic.stopAndTranscribe();
    else if (phase === 'speaking') void listen();
    else if (phase === 'thinking') {
      onStopGenerating();
      waitingRef.current = false;
      setPhase('idle');
    } else if (phase === 'idle') void listen();
  }

  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    phase === 'listening' ? 'checkmark' : phase === 'thinking' ? 'stop' : phase === 'speaking' ? 'mic' : 'mic';

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Aurora />
        <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
          <Text style={styles.title}>Voice</Text>
          <PressableScale onPress={onClose} style={styles.close} label="End voice conversation">
            <Ionicons name="close" size={22} color={colors.text} />
          </PressableScale>
        </View>

        <View style={styles.center}>
          <View style={styles.orbWrap}>
            <Animated.View style={[styles.ring, { backgroundColor: withAlpha(accent, 0.5) }, ring]} />
            <Animated.View style={pulse}>
              <Logo size={150} />
            </Animated.View>
          </View>
          <Animated.Text key={phase} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={styles.status}>
            {LABEL[phase]}
          </Animated.Text>
          {heard ? (
            <Text numberOfLines={3} style={styles.heard}>
              “{heard}”
            </Text>
          ) : null}
          {reply ? (
            <Text numberOfLines={5} style={styles.reply}>
              {reply.replace(/[*#`>_]/g, '')}
            </Text>
          ) : null}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
          <PressableScale onPress={main} label="Microphone" style={[styles.mainBtn, { backgroundColor: phase === 'thinking' ? colors.danger : accent }]}>
            <Ionicons name={icon} size={34} color={phase === 'thinking' ? '#fff' : colors.onAccent} />
          </PressableScale>
          <Text style={styles.hint}>Turzam answers out loud and listens again. Close to go back to the chat.</Text>
        </View>
      </View>
    </Modal>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
    title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 30 },
    close: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: withAlpha(t.colors.surface, 0.92),
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
    orbWrap: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute', width: 210, height: 210, borderRadius: 105 },
    status: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 18, marginTop: 6 },
    heard: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 16, textAlign: 'center', lineHeight: 23 },
    reply: { color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 15, textAlign: 'center', lineHeight: 22 },
    bottom: { alignItems: 'center', gap: 14, paddingHorizontal: 30 },
    mainBtn: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
    hint: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12.5, textAlign: 'center' },
  });
