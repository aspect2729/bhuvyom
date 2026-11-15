/** Design tokens from bengaluru-from-orbit-app README (website CSS) — do not invent. */
export const colors = {
  bg: '#050506',
  surface: '#050506',
  surface2: '#040405',
  surface3: '#0A0A0C',
  text: '#F2F2F2',
  text2: '#C9C9CE',
  text3: '#B4B4BC',
  text4: '#A0A0A8',
  /** Added for design export 4 (chart axes / climatology line) */
  text5: '#8A8A92',
  text6: '#6E6E76',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  amber: '#E9A15A',
  amberDeep: '#D9783F',
  cyan: '#7FE0F0',
  blue: '#5B8CFF',
  mauve: '#9A86B8',
  teal: '#5FC4D8',
  orange: '#E0905A',
  sand: '#F4C27C',
  royal: '#2F6BFF',
} as const;

export const glass = {
  // Mobile glass — slightly darker than desktop (docs/pages/mobile.md §3)
  colors: ['rgba(255,255,255,0.08)', 'rgba(10,11,14,0.66)', 'rgba(4,5,7,0.82)'] as const,
  locations: [0, 0.38, 1] as const,
  border: 'rgba(255,255,255,0.16)',
  blur: 22,
};

/** Device reference sizes from the export (preview boards). Layout stays fluid. */
export const devices = {
  iphone16Pro: { width: 402, height: 874, safeTop: 50, safeBottom: 18, label: 'iPhone 16 Pro' },
  /** Closest Android frames in export: Small Android 360×780 / Pixel 8 412×915.
   *  Galaxy S25 (~6.2″ 19.5:9) sits in the same 360–440 fluid band; use real safe-area insets. */
  samsungS25: { width: 360, height: 780, safeTop: 30, safeBottom: 10, label: 'Samsung S25 (≈ Small Android frame)' },
} as const;

export const fonts = {
  display: 'Jura_400Regular',
  displayLight: 'Jura_300Light',
  displayMedium: 'Jura_500Medium',
  displaySemi: 'Jura_600SemiBold',
  body: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodyLight: 'Poppins_300Light',
} as const;

/** Surface fills / borders used across the handoff screens. */
export const surfaces = {
  card: 'rgba(255,255,255,0.03)',
  cardStrong: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.10)',
  borderHeader: 'rgba(255,255,255,0.14)',
  navBg: 'rgba(8,8,10,0.92)',
  cyanTint: 'rgba(127,224,240,0.10)',
  cyanLine: 'rgba(127,224,240,0.45)',
  amberTint: 'rgba(233,161,90,0.16)',
  amberLine: 'rgba(233,161,90,0.30)',
} as const;

/** letter-spacing in `em` → React Native px. */
export const em = (size: number, v: number) => size * v;

/** CSS linear-gradient(<deg>) → expo-linear-gradient start/end. */
export function cssAngle(deg: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const r = (deg * Math.PI) / 180;
  const dx = Math.sin(r) / 2;
  const dy = -Math.cos(r) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}
