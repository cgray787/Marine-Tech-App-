// Marine Tech App — Design Scheme
export const colors = {
  // Backgrounds
  bgPrimary: '#060a12',
  bgSecondary: '#0c1220',
  bgCard: '#111827',

  // Gold accent
  gold: '#C9A96E',
  goldHover: '#d4b87e',
  goldMuted: 'rgba(201,169,110,0.15)',

  // Borders
  border: '#1e293b',
  borderLight: '#334155',

  // Text
  textPrimary: '#f1f5f9',
  textSecondary: '#8892A5',

  // Status
  good: '#22c55e',
  bad: '#ef4444',
  statusNew: '#3b82f6',
  statusInProgress: '#f59e0b',
  statusComplete: '#22c55e',

  // Misc
  white: '#ffffff',
  transparent: 'transparent',
};

// Keep default export for compatibility with Expo template
export default {
  light: {
    text: colors.textPrimary,
    background: colors.bgPrimary,
    tint: colors.gold,
    tabIconDefault: colors.textSecondary,
    tabIconSelected: colors.gold,
  },
  dark: {
    text: colors.textPrimary,
    background: colors.bgPrimary,
    tint: colors.gold,
    tabIconDefault: colors.textSecondary,
    tabIconSelected: colors.gold,
  },
};
