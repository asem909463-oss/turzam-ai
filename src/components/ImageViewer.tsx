import React from 'react';
import { Image, Modal, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';

/** Full-screen image with pinch to zoom, drag, and double tap to zoom in/out. */
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withSpring(1);
    saved.value = 1;
    x.value = withSpring(0);
    y.value = withSpring(0);
    sx.value = 0;
    sy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.02) reset();
    });
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        x.value = sx.value + e.translationX;
        y.value = sy.value + e.translationY;
      }
    })
    .onEnd(() => {
      sx.value = x.value;
      sy.value = y.value;
    });
  const dbl = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) reset();
      else {
        scale.value = withSpring(2.5);
        saved.value = 2.5;
      }
    });
  const gesture = Gesture.Simultaneous(pinch, pan, dbl);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {uri ? (
          <GestureDetector gesture={gesture}>
            <Animated.View entering={FadeIn.duration(200)} style={[styles.fill, style]}>
              <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
            </Animated.View>
          </GestureDetector>
        ) : null}
        <PressableScale onPress={onClose} label="Close image" style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={24} color="#fff" />
        </PressableScale>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  fill: { flex: 1, width: '100%' },
  close: {
    position: 'absolute',
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
