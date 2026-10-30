import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { useStyles, useTheme } from '../context/ThemeContext';
import { fileKind, formatSize, kindIcon } from '../lib/attachments';
import { fonts, radius, Theme } from '../theme';

type Props = {
  name: string;
  mime: string;
  size: number;
  uri?: string;
  /** Large thumbnail (used inside chat bubbles) vs. compact (composer). */
  large?: boolean;
  onRemove?: () => void;
};

/** One attached file: a picture thumbnail for images, an icon chip for PDFs and text files. */
export function AttachmentChip({ name, mime, size, uri, large, onRemove }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(make);
  const kind = fileKind(mime, name);

  if (kind === 'image' && uri) {
    const dim = large ? 200 : 68;
    return (
      <View>
        <Image source={{ uri }} style={{ width: dim, height: dim, borderRadius: radius.md, backgroundColor: colors.surfaceHi }} />
        {onRemove ? (
          <PressableScale label={`Remove ${name}`} style={styles.remove} onPress={onRemove}>
            <Ionicons name="close" size={14} color="#fff" />
          </PressableScale>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.file, large && { maxWidth: 240 }]}>
      <View style={styles.fileIcon}>
        <Ionicons name={kindIcon(kind)} size={20} color={colors.accentInk} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={styles.fileName}>
          {name}
        </Text>
        <Text style={styles.fileMeta}>{size ? formatSize(size) : kind === 'pdf' ? 'PDF' : 'File'}</Text>
      </View>
      {onRemove ? (
        <PressableScale label={`Remove ${name}`} onPress={onRemove}>
          <Ionicons name="close-circle" size={20} color={colors.textFaint} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const make = (t: Theme) =>
  StyleSheet.create({
    remove: {
      position: 'absolute',
      top: -7,
      right: -7,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    file: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: 220,
      height: 56,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    fileIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceHi,
    },
    fileName: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 13, maxWidth: 130 },
    fileMeta: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, marginTop: 1 },
  });
