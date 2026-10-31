import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fonts, radius, Theme, withAlpha } from '../theme';

type Props = {
  visible: boolean;
  onRate: () => void;
  onLater: () => void;
  onDismiss: () => void;
};

export function ReviewPrompt({ visible, onRate, onLater, onDismiss }: Props) {
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onLater}>
      <Animated.View entering={FadeIn.duration(180)} style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Animated.View entering={ZoomIn.duration(260).springify()} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
          <Pressable onPress={onLater} accessibilityLabel="Close rating prompt" style={styles.close}>
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>
          <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconHalo}>
            <Ionicons name="sparkles" size={25} color={colors.onAccent} />
          </LinearGradient>
          <Text style={styles.title}>Enjoying Turzam AI?</Text>
          <Text style={styles.subtitle}>A quick rating helps more founders discover a smarter way to work.</Text>
          <View style={styles.stars} accessibilityLabel="Five star rating">
            {[0, 1, 2, 3, 4].map((i) => <Ionicons key={i} name="star" size={20} color={colors.accentInk} />)}
          </View>
          <PressableScale onPress={onRate} style={[styles.rateButton, { backgroundColor: colors.accent }]} label="Rate Turzam AI">
            <Text style={[styles.rateText, { color: colors.onAccent }]}>Rate Turzam AI</Text>
            <Ionicons name="arrow-up-right-box" size={18} color={colors.onAccent} />
          </PressableScale>
          <PressableScale onPress={onLater} style={styles.laterButton} label="Maybe later">
            <Text style={styles.laterText}>Maybe later</Text>
          </PressableScale>
          <PressableScale onPress={onDismiss} style={styles.dismissButton} label="Do not ask again">
            <Text style={styles.dismissText}>Don't ask again</Text>
          </PressableScale>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const make = (t: Theme) => StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 24, paddingTop: 30, borderRadius: radius.xl, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  close: { position: 'absolute', right: 12, top: 12, padding: 6, zIndex: 2 },
  iconHalo: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: t.colors.text, fontFamily: fonts.display, fontSize: 30, textAlign: 'center' },
  subtitle: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 285 },
  stars: { flexDirection: 'row', gap: 7, marginTop: 18, marginBottom: 20 },
  rateButton: { alignSelf: 'stretch', height: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rateText: { fontFamily: fonts.uiBold, fontSize: 15 },
  laterButton: { paddingVertical: 13, paddingHorizontal: 16 },
  laterText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 14 },
  dismissButton: { paddingVertical: 3, paddingHorizontal: 12 },
  dismissText: { color: withAlpha(t.colors.textFaint, 0.92), fontFamily: fonts.uiRegular, fontSize: 12 },
});
