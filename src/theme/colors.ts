import { Dimensions } from 'react-native';

// Design tokens for FGlutenApp React Native
export const Colors = {
  // Primary brand palette - deep green gluten-free theme
  primary: '#1DB954',       // Vivid green - brand accent
  primaryDark: '#17A347',
  primaryLight: '#E8F9EE',

  // Backgrounds
  background: '#0D1117',    // Rich dark
  surface: '#161B22',       // Card/sheet bg
  surfaceElevated: '#1C2128', // Elevated card
  border: '#30363D',

  // Text hierarchy
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  textInverse: '#0D1117',

  // Status colors
  success: '#3FB950',
  successBg: '#0D2A1A',
  warning: '#D29922',
  warningBg: '#2B1D0B',
  error: '#F85149',
  errorBg: '#2B0F0E',
  info: '#58A6FF',
  infoBg: '#0C2A4A',

  // Gluten-free specific
  gfGreen: '#1DB954',
  gfGold: '#E3B341',
  gfRed: '#F85149',

  // Favorite statuses
  favSafe: '#1DB954',
  favTry: '#E3B341',
  favAvoid: '#F85149',

  // Tab / Navigation
  tabActive: '#1DB954',
  tabInactive: '#484F58',

  // Overlay
  overlay: 'rgba(0,0,0,0.6)',
  shimmer1: '#1C2128',
  shimmer2: '#21262D',
};

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
