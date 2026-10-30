import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { useToast } from '../context/ToastContext';
import { useStyles, useTheme } from '../context/ThemeContext';
import { MODES, PERSONAS } from '../modes';
import { fonts, radius, Theme, withAlpha } from '../theme';
import { Toggle } from './Toggle';
import type { ModeId, ModelChoice, PersonaId, ProviderInfo } from '../types';

type Props = {
  visible: boolean;
  current: ModeId;
  model: ModelChoice;
  providers: ProviderInfo[] | null;
  onSelect: (m: ModeId) => void;
  onSelectModel: (m: ModelChoice) => void;
  persona: PersonaId;
  onSelectPersona: (p: PersonaId) => void;
  searchOn: boolean;
  searchAvailable: boolean;
  onToggleSearch: (v: boolean) => void;
  onClose: () => void;
};

export function ModeSheet({ visible, current, model, providers, onSelect, onSelectModel, persona, onSelectPersona, searchOn, searchAvailable, onToggleSearch, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles(make);
  const { colors } = useTheme();
  const toast = useToast();

  const choices: { id: ModelChoice; name: string; available: boolean }[] = [
    { id: 'auto', name: 'Auto', available: true },
    ...(providers ?? [
      { id: 'gemini' as const, name: 'Gemini', available: true },
      { id: 'openai' as const, name: 'ChatGPT', available: false },
      { id: 'anthropic' as const, name: 'Claude', available: false },
    ]).map((p) => ({ id: p.id as ModelChoice, name: p.name, available: p.available })),
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(190)}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: height * 0.88 }]}
        >
          <View style={styles.grab} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Text style={styles.title}>How should Turzam think?</Text>
            {MODES.map((m, i) => {
              const on = m.id === current;
              return (
                <Animated.View key={m.id} entering={FadeInDown.delay(50 + i * 40).duration(260)}>
                  <PressableScale
                    label={m.name}
                    onPress={() => {
                      onSelect(m.id);
                      onClose();
                    }}
                    scaleTo={0.97}
                    style={[
                      styles.row,
                      on && { borderColor: withAlpha(m.color, 0.8), backgroundColor: withAlpha(m.color, 0.12) },
                    ]}
                  >
                    <View style={[styles.icon, { backgroundColor: withAlpha(m.color, 0.18) }]}>
                      <Ionicons name={m.icon} size={19} color={m.color} />
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

            <Text style={[styles.title, { fontSize: 22, marginTop: 10 }]}>Personality</Text>
            <View style={styles.chips}>
              {PERSONAS.map((p) => {
                const on = p.id === persona;
                return (
                  <PressableScale
                    key={p.id}
                    label={`${p.name} personality`}
                    scaleTo={0.94}
                    style={[styles.chip, on && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.14) }]}
                    onPress={() => onSelectPersona(p.id)}
                  >
                    <Ionicons name={p.icon} size={14} color={on ? colors.accentInk : colors.textFaint} />
                    <Text style={[styles.chipText, on && { color: colors.text }]}>{p.name}</Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={styles.note}>{PERSONAS.find((p) => p.id === persona)?.tagline}</Text>

            <Text style={[styles.title, { fontSize: 22, marginTop: 10 }]}>Web search</Text>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>Search the web</Text>
                <Text style={styles.tag}>
                  {searchAvailable ? 'Answers with live sources you can open' : 'Needs the Gemini key on the server'}
                </Text>
              </View>
              <Toggle
                value={searchOn && searchAvailable}
                onChange={(v) => {
                  if (!searchAvailable) {
                    toast.show('Web search needs the Gemini key on the server.', 'info');
                    return;
                  }
                  onToggleSearch(v);
                }}
              />
            </View>

            <Text style={[styles.title, { fontSize: 22, marginTop: 10 }]}>Which AI answers?</Text>
            <View style={styles.chips}>
              {choices.map((c) => {
                const on = c.id === model;
                return (
                  <PressableScale
                    key={c.id}
                    label={c.name}
                    scaleTo={0.94}
                    style={[
                      styles.chip,
                      on && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.14) },
                      !c.available && { opacity: 0.55 },
                    ]}
                    onPress={() => {
                      if (!c.available) {
                        toast.show(`${c.name} is not connected on the server yet. See the README to add its key.`, 'info');
                        return;
                      }
                      onSelectModel(c.id);
                    }}
                  >
                    {!c.available ? <Ionicons name="lock-closed" size={13} color={colors.textFaint} /> : null}
                    <Text style={[styles.chipText, on && { color: colors.text }]}>{c.name}</Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={styles.note}>
              Auto uses the first connected AI. Locked ones turn on when their key is added on the server.
            </Text>
          </ScrollView>
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
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: t.colors.borderStrong, marginBottom: 8 },
    title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 28, marginBottom: 4, paddingHorizontal: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 10,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    name: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
    tag: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, marginTop: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    chipText: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 14 },
    note: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 4, marginTop: 2 },
  });
