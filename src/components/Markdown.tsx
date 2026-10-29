import React, { memo, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { PressableScale } from './PressableScale';
import { colors, fonts, radius, withAlpha } from '../theme';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'h'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[]; start: number }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'p'; text: string };

const UL = /^\s*[-*•]\s+/;
const OL = /^\s*(\d+)[.)]\s+/;
const FENCE = /^\s*```([\w+#.-]*)\s*$/;

function isBlockStart(l: string) {
  return FENCE.test(l) || /^(#{1,4})\s+/.test(l) || UL.test(l) || OL.test(l) || /^\s*>/.test(l);
}

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence (or end of text while still streaming)
      out.push({ type: 'code', lang: fence[1] ?? '', text: buf.join('\n') });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push({ type: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push({ type: 'hr' });
      i++;
      continue;
    }
    if (UL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i])) {
        items.push(lines[i].replace(UL, ''));
        i++;
      }
      out.push({ type: 'ul', items });
      continue;
    }
    const ol = line.match(OL);
    if (ol) {
      const items: string[] = [];
      const start = parseInt(ol[1], 10);
      while (i < lines.length && OL.test(lines[i])) {
        items.push(lines[i].replace(OL, ''));
        i++;
      }
      out.push({ type: 'ol', items, start });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    if (!buf.length) {
      buf.push(line);
      i++;
    }
    out.push({ type: 'p', text: buf.join('\n') });
  }
  return out;
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;

function Inline({ text, style }: { text: string; style?: TextStyle }) {
  const parts = text.split(INLINE);
  return (
    <Text style={style}>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <Text key={idx} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <Text key={idx} style={styles.inlineCode}>
              {` ${part.slice(1, -1)} `}
            </Text>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <Text key={idx} style={styles.italic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link) {
          return (
            <Text key={idx} style={styles.link} onPress={() => Linking.openURL(link[2]).catch(() => {})}>
              {link[1]}
            </Text>
          );
        }
        return <Text key={idx}>{part}</Text>;
      })}
    </Text>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.codeBox}>
      <View style={styles.codeHead}>
        <Text style={styles.codeLang}>{lang || 'code'}</Text>
        <PressableScale
          label="Copy code"
          onPress={async () => {
            await Clipboard.setStringAsync(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          style={styles.copyBtn}
        >
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.success : colors.textDim} />
          <Text style={[styles.copyText, copied && { color: colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
        </PressableScale>
      </View>
      <Text selectable style={styles.codeText}>
        {text}
      </Text>
    </View>
  );
}

function MarkdownBase({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'code':
            return <CodeBlock key={i} lang={b.lang} text={b.text} />;
          case 'h':
            return (
              <Text key={i} selectable style={[styles.h, b.level === 1 ? styles.h1 : b.level === 2 ? styles.h2 : styles.h3]}>
                {b.text.replace(/\*\*/g, '')}
              </Text>
            );
          case 'ul':
            return (
              <View key={i} style={{ gap: 6 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.li}>
                    <View style={styles.dot} />
                    <View style={{ flex: 1 }}>
                      <Inline text={it} style={styles.p} />
                    </View>
                  </View>
                ))}
              </View>
            );
          case 'ol':
            return (
              <View key={i} style={{ gap: 6 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.li}>
                    <Text style={styles.num}>{b.start + j}.</Text>
                    <View style={{ flex: 1 }}>
                      <Inline text={it} style={styles.p} />
                    </View>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={styles.quote}>
                <Inline text={b.text} style={[styles.p, { color: colors.textDim }]} />
              </View>
            );
          case 'hr':
            return <View key={i} style={styles.hr} />;
          default:
            return (
              <View key={i}>
                <Inline text={b.text} style={styles.p} />
              </View>
            );
        }
      })}
    </View>
  );
}

export const Markdown = memo(MarkdownBase);

const styles = StyleSheet.create({
  p: { color: colors.text, fontFamily: fonts.uiRegular, fontSize: 16, lineHeight: 25 },
  bold: { fontFamily: fonts.uiBold },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: MONO,
    fontSize: 14,
    color: colors.cyan,
    backgroundColor: withAlpha(colors.cyan, 0.1),
  },
  link: { color: colors.cyan, textDecorationLine: 'underline' },
  h: { color: colors.text, fontFamily: fonts.display, marginTop: 4 },
  h1: { fontSize: 30, lineHeight: 36 },
  h2: { fontSize: 25, lineHeight: 31 },
  h3: { fontSize: 20, lineHeight: 26 },
  li: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.violet, marginTop: 10 },
  num: { color: colors.violet, fontFamily: fonts.uiBold, fontSize: 16, lineHeight: 25, minWidth: 22 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.violet, paddingLeft: 12, paddingVertical: 2 },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  codeBox: {
    backgroundColor: '#070B1C',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  codeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  codeLang: { color: colors.textDim, fontFamily: fonts.ui, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  copyText: { color: colors.textDim, fontFamily: fonts.ui, fontSize: 12 },
  codeText: { color: '#D6DBFF', fontFamily: MONO, fontSize: 13.5, lineHeight: 20, padding: 14 },
});
