/**
 * Design tokens — mirrors the CSS custom properties in frontend/src/index.css
 * Supports light and dark mode via ThemeContext.
 */

export const Colors = {
  primary:    '#FF6B35',
  primaryDim: 'rgba(255,107,53,0.12)',
  gold:       '#FFCC00',
  goldDim:    'rgba(255,204,0,0.15)',
  red:        '#e53e3e',
  redDim:     'rgba(229,62,62,0.12)',
  green:      '#22c55e',
  greenDim:   'rgba(34,197,94,0.12)',

  // Sport accent colours — matches web SPORT_COLORS exactly
  sport: {
    football:     '#22c55e',
    cricket:      '#D97706',
    table_tennis: '#FF6B35',
    badminton:    '#38bdf8',
  },

  light: {
    bg:         '#FAFAFA',
    surface:    '#FFFFFF',
    elevated:   '#F0F0F0',
    border:     '#E5E5E5',
    borderMid:  '#CCCCCC',
    ink:        '#1a1a1a',
    muted:      '#666666',
    subtle:     '#888888',
    inputBg:    '#FFFFFF',
    cardBg:     '#FFFFFF',
  },
  dark: {
    bg:         '#0d0d0d',
    surface:    '#1a1a1a',
    elevated:   '#222222',
    border:     '#333333',
    borderMid:  '#444444',
    ink:        '#FFFFFF',
    muted:      '#888888',
    subtle:     '#666666',
    inputBg:    '#1a1a1a',
    cardBg:     '#1a1a1a',
  },
} as const;

export const Typography = {
  display:  'Unbounded_900Black',
  bodyBold: 'SpaceGrotesk_700Bold',
  body:     'SpaceGrotesk_400Regular',
  bodySemi: 'SpaceGrotesk_600SemiBold',
} as const;

/**
 * Font shorthand — import F and use fontFamily: F.display / F.bold / F.semi / F.body
 * Mirrors --font-display (Unbounded) and --font-body (Space Grotesk) from index.css
 */
export const F = {
  display: 'Unbounded_900Black'     as const,
  bold:    'SpaceGrotesk_700Bold'   as const,
  semi:    'SpaceGrotesk_600SemiBold' as const,
  body:    'SpaceGrotesk_400Regular' as const,
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
  xxxl:40,
} as const;

export const Radii = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  xxl:  20,
  full: 999,
} as const;

export type ThemeMode = 'light' | 'dark';

export function getTheme(mode: ThemeMode) {
  const c = mode === 'dark' ? Colors.dark : Colors.light;
  return {
    mode,
    isDark: mode === 'dark',
    colors: { ...c, ...Colors },
  };
}

export type Theme = ReturnType<typeof getTheme>;

/** Sport badge/pill tint colours for public display */
export const SPORT_COLORS: Record<string, string> = {
  football:     '#22c55e',
  cricket:      '#D97706',
  table_tennis: '#FF6B35',
  badminton:    '#38bdf8',
};

export const SPORT_LABELS: Record<string, string> = {
  football:     'Football',
  cricket:      'Cricket',
  table_tennis: 'Table Tennis',
  badminton:    'Badminton',
};

export const SPORT_ICONS: Record<string, string> = {
  football:     'FB',
  cricket:      'CR',
  table_tennis: 'TT',
  badminton:    'BD',
};

export const STATUS_LABELS: Record<string, string> = {
  draft:        'Draft',
  registration: 'Registration Open',
  fixtures:     'Fixtures Set',
  live:         'Live',
  completed:    'Completed',
};

export const STATUS_COLORS: Record<string, string> = {
  draft:        '#888',
  registration: '#22c55e',
  fixtures:     '#3b82f6',
  live:         '#FF6B35',
  completed:    '#888',
};
