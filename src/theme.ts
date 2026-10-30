// Turzam design tokens. Two base palettes (dark / light) x six accent palettes.

export type Colors = {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceHi: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  overlay: string;
  danger: string;
  success: string;
  /** Brand colour 1 / 2 (the current accent's gradient). */
  accent: string;
  accent2: string;
  /** Accent used for small text/icons: darkened in light mode so it stays readable. */
  accentInk: string;
  /** Text colour that sits on top of a filled accent. */
  onAccent: string;
  codeBg: string;
  codeText: string;
};

export type AccentId = 'cobalt' | 'aurora' | 'sunset' | 'emerald' | 'gold' | 'orchid';
export type Scheme = 'system' | 'light' | 'dark';

export type Accent = { id: AccentId; name: string; a: string; b: string };

export const ACCENTS: Accent[] = [
  { id: 'cobalt', name: 'Cobalt', a: '#3D8BFF', b: '#8F6BFF' }, // the logo's own colours
  { id: 'aurora', name: 'Aurora', a: '#38E0F0', b: '#8B6CFF' },
  { id: 'sunset', name: 'Sunset', a: '#FF8A5B', b: '#FF4D8D' },
  { id: 'emerald', name: 'Emerald', a: '#2EE6A6', b: '#3BA3FF' },
  { id: 'gold', name: 'Gold', a: '#FFC857', b: '#FF8A3D' },
  { id: 'orchid', name: 'Orchid', a: '#FF6BA8', b: '#B26BFF' },
];

export type Theme = {
  isDark: boolean;
  colors: Colors;
  /** Two-colour brand gradient for the current accent. */
  gradient: readonly [string, string];
  accentId: AccentId;
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  ui: 'SpaceGrotesk_500Medium',
  uiBold: 'SpaceGrotesk_700Bold',
  uiRegular: 'SpaceGrotesk_400Regular',
};

/** "#RRGGBB" + alpha (0..1) -> rgba() string */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mix a colour with black (amount 0..1). */
export function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const f = (i: number) =>
    Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${f(0)}${f(2)}${f(4)}`;
}

export function buildTheme(isDark: boolean, accentId: AccentId): Theme {
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];
  const base = isDark
    ? {
        bg: '#060914',
        bgElevated: '#0B1127',
        surface: '#111A38',
        surfaceHi: '#192448',
        border: 'rgba(255,255,255,0.08)',
        borderStrong: 'rgba(255,255,255,0.18)',
        text: '#F1F3FF',
        textDim: '#A0A9CC',
        textFaint: '#6A7499',
        overlay: 'rgba(3,5,12,0.72)',
        danger: '#FF6B7D',
        success: '#4ADE9A',
        codeBg: '#070B1C',
        codeText: '#D6DBFF',
      }
    : {
        bg: '#F3F5FF',
        bgElevated: '#FFFFFF',
        surface: '#FFFFFF',
        surfaceHi: '#E9EDFF',
        border: 'rgba(14,24,70,0.10)',
        borderStrong: 'rgba(14,24,70,0.22)',
        text: '#0B1030',
        textDim: '#4A5380',
        textFaint: '#7C84A8',
        overlay: 'rgba(10,14,40,0.45)',
        danger: '#E5304A',
        success: '#0E9F66',
        codeBg: '#EEF1FF',
        codeText: '#1B2252',
      };
  return {
    isDark,
    gradient: [accent.a, accent.b],
    accentId: accent.id,
    colors: {
      ...base,
      accent: accent.a,
      accent2: accent.b,
      accentInk: isDark ? accent.a : darken(accent.a, 0.32),
      onAccent: '#050816',
    },
  };
}
