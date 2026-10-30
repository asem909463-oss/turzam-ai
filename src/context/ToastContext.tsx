import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles, useTheme } from './ThemeContext';
import { fonts, radius, Theme, withAlpha } from '../theme';

type Kind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: Kind; text: string };
type Ctx = { show: (text: string, kind?: Kind) => void };

const ToastContext = createContext<Ctx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();
  const styles = useStyles(make);
  const { colors } = useTheme();

  const show = useCallback((text: string, kind: Kind = 'info') => {
    const id = nextId.current++;
    if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setToasts((prev) => [...prev.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 4200 : 2400);
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  const tint = (k: Kind) => (k === 'error' ? colors.danger : k === 'success' ? colors.success : colors.accent);
  const icon = (k: Kind) =>
    (k === 'error' ? 'alert-circle' : k === 'success' ? 'checkmark-circle' : 'information-circle') as React.ComponentProps<
      typeof Ionicons
    >['name'];

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={[styles.host, { top: insets.top + 8 }]}>
        {toasts.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeInUp.springify().damping(16)}
            exiting={FadeOutUp.duration(180)}
            layout={LinearTransition}
            style={[styles.toast, { borderColor: withAlpha(tint(t.kind), 0.55) }]}
          >
            <Ionicons name={icon(t.kind)} size={20} color={tint(t.kind)} />
            <Text style={styles.text}>{t.text}</Text>
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  return useContext(ToastContext);
}

const make = (t: Theme) =>
  StyleSheet.create({
    host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 100 },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: 460,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      backgroundColor: t.colors.bgElevated,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    text: { flexShrink: 1, color: t.colors.text, fontFamily: fonts.ui, fontSize: 14, lineHeight: 19 },
  });
