import { Dimensions } from 'react-native';

// Design tokens for FGlutenApp React Native
export const DarkColors = {
  primary: '#1DB954',
  primaryDark: '#17A347',
  primaryLight: '#E8F9EE',
  background: '#0D1117',
  surface: '#161B22',
  surfaceElevated: '#1C2128',
  border: '#30363D',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  textInverse: '#0D1117',
  success: '#3FB950',
  successBg: '#0D2A1A',
  warning: '#D29922',
  warningBg: '#2B1D0B',
  error: '#F85149',
  errorBg: '#2B0F0E',
  info: '#58A6FF',
  infoBg: '#0C2A4A',
  gfGreen: '#1DB954',
  gfGold: '#E3B341',
  gfRed: '#F85149',
  favSafe: '#1DB954',
  favTry: '#E3B341',
  favAvoid: '#F85149',
  tabActive: '#1DB954',
  tabInactive: '#484F58',
  overlay: 'rgba(0,0,0,0.6)',
  shimmer1: '#1C2128',
  shimmer2: '#21262D',
};

export const LightColors: typeof DarkColors = {
  primary: '#1DB954',
  primaryDark: '#17A347',
  primaryLight: '#E8F9EE',
  background: '#F6F8FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#D0D7DE',
  textPrimary: '#24292F',
  textSecondary: '#57606A',
  textMuted: '#8C959F',
  textInverse: '#FFFFFF',
  success: '#2DA44E',
  successBg: '#DAFBE1',
  warning: '#BF8700',
  warningBg: '#FFF8C5',
  error: '#CF222E',
  errorBg: '#FFEBE9',
  info: '#0969DA',
  infoBg: '#DDF4FF',
  gfGreen: '#1DB954',
  gfGold: '#BF8700',
  gfRed: '#CF222E',
  favSafe: '#1DB954',
  favTry: '#BF8700',
  favAvoid: '#CF222E',
  tabActive: '#1DB954',
  tabInactive: '#6E7781',
  overlay: 'rgba(0,0,0,0.4)',
  shimmer1: '#EAECEF',
  shimmer2: '#D0D7DE',
};

// Mutable runtime object. Starts as Dark.
export const Colors = { ...DarkColors };

export function applyTheme(isDark: boolean) {
  Object.assign(Colors, isDark ? DarkColors : LightColors);
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

// ─── Responsive Font Scaling ──────────────────────────────────────────────────
// Baseline design width is 375px (iPhone SE / standard RN target).
// Fonts scale proportionally to the actual device width, clamped to safe bounds.
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DESIGN_WIDTH = 375;

// Scale factor: how much larger/smaller the device is vs our design baseline
const fontScale = SCREEN_WIDTH / DESIGN_WIDTH;

/**
 * Returns a font size scaled to the current device width.
 * @param size - Base size in points (as designed for 375px width)
 * @param min  - Minimum allowed size (prevents tiny text on small devices)
 * @param max  - Maximum allowed size (prevents oversized text on tablets)
 */
function rf(size: number, min?: number, max?: number): number {
  const scaled = Math.round(size * fontScale);
  if (min !== undefined && scaled < min) return min;
  if (max !== undefined && scaled > max) return max;
  return scaled;
}

export const FontSize = {
  xs:      rf(11,  10, 13),
  sm:      rf(13,  12, 15),
  md:      rf(15,  14, 18),
  lg:      rf(17,  16, 20),
  xl:      rf(20,  18, 24),
  xxl:     rf(26,  22, 30),
  display: rf(34,  28, 40),
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
};
