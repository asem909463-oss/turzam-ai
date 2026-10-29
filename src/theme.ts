export const colors = {
  bg: '#060914',
  bgElevated: '#0B1127',
  surface: '#111A38',
  surfaceHi: '#192448',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F1F3FF',
  textDim: '#A0A9CC',
  textFaint: '#5E698F',
  violet: '#8B6CFF',
  cyan: '#38E0F0',
  ember: '#FFB86B',
  danger: '#FF6B7D',
  success: '#4ADE9A',
  overlay: 'rgba(3,5,12,0.72)',
};

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  ui: 'SpaceGrotesk_500Medium',
  uiBold: 'SpaceGrotesk_700Bold',
  uiRegular: 'SpaceGrotesk_400Regular',
};

export const gradients = {
  brand: [colors.violet, colors.cyan] as const,
  brandSoft: ['rgba(139,108,255,0.35)', 'rgba(56,224,240,0.22)'] as const,
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

/** "#RRGGBB" + alpha (0..1) -> rgba() string */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
