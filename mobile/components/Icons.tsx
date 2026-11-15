import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

export type IconProps = { color?: string; size?: number; strokeWidth?: number };

type Common = {
  color: string;
  size: number;
  sw: number;
};

function base({ color = '#F2F2F2', size = 22, strokeWidth = 1.6 }: IconProps): Common {
  return { color, size, sw: strokeWidth };
}

function Frame({ c, children }: { c: Common; children: ReactNode }) {
  return (
    <Svg
      width={c.size}
      height={c.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c.color}
      strokeWidth={c.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** Generic icon from one or more SVG path `d` strings (Layers / Systems lists). */
export function PathIcon({ d, ...p }: IconProps & { d: string }) {
  const c = base({ strokeWidth: 1.8, ...p });
  return (
    <Frame c={c}>
      <Path d={d} />
    </Frame>
  );
}

/* ---- Bottom tabs (Main.dc.html nav) ---- */
export function HomeIcon(p: IconProps) {
  const c = base({ size: 21, ...p });
  return (
    <Frame c={c}>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5 9.5V21h14V9.5" />
      <Path d="M10 21v-6h4v6" />
    </Frame>
  );
}
export function SystemsIcon(p: IconProps) {
  const c = base({ size: 21, ...p });
  return (
    <Frame c={c}>
      <Rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <Rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <Rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <Rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Frame>
  );
}
export function SimulateIcon(p: IconProps) {
  const c = base({ size: 21, ...p });
  return (
    <Frame c={c}>
      <Path d="M4 6h10" />
      <Path d="M18 6h2" />
      <Circle cx="16" cy="6" r="2" />
      <Path d="M4 12h3" />
      <Path d="M11 12h9" />
      <Circle cx="9" cy="12" r="2" />
      <Path d="M4 18h12" />
      <Circle cx="18" cy="18" r="2" />
    </Frame>
  );
}
export function CompareIcon(p: IconProps) {
  const c = base({ size: 21, ...p });
  return (
    <Frame c={c}>
      <Rect x="3" y="4" width="18" height="16" rx="2.5" />
      <Path d="M12 4v16" />
      <Path d="M7 10l-2 2 2 2" />
      <Path d="M17 10l2 2-2 2" />
    </Frame>
  );
}
export function ForecastIcon(p: IconProps) {
  const c = base({ size: 21, ...p });
  return (
    <Frame c={c}>
      <Path d="M3 17l5-5 4 3 8-8" />
      <Path d="M15 7h5v5" />
      <Path d="M3 21h18" />
    </Frame>
  );
}

/* ---- Header ---- */
export function OrbitMark({ color = '#7FE0F0', size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4}>
      <Circle cx="12" cy="12" r="8" />
      <Ellipse cx="12" cy="12" rx="11" ry="3.6" transform="rotate(-20 12 12)" />
    </Svg>
  );
}
export function BackIcon(p: IconProps) {
  const c = base({ size: 22, ...p });
  return (
    <Frame c={c}>
      <Path d="M15 5l-7 7 7 7" />
    </Frame>
  );
}
/** Sound off = speaker with a cross; on = speaker with waves. */
export function SoundIcon({ on, ...p }: IconProps & { on: boolean }) {
  const c = base({ size: 14, ...p });
  return (
    <Frame c={c}>
      <Path d="M4 9v6h4l5 4V5L8 9H4z" />
      {on ? (
        <>
          <Path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <Path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </>
      ) : (
        <>
          <Path d="M17 9l4 6" />
          <Path d="M21 9l-4 6" />
        </>
      )}
    </Frame>
  );
}

/* ---- Generic UI ---- */
export function ChevronRight(p: IconProps) {
  const c = base({ size: 18, strokeWidth: 1.8, ...p });
  return (
    <Frame c={c}>
      <Path d="M9 6l6 6-6 6" />
    </Frame>
  );
}
export function ChevronLeft(p: IconProps) {
  const c = base({ size: 18, strokeWidth: 1.8, ...p });
  return (
    <Frame c={c}>
      <Path d="M15 5l-7 7 7 7" />
    </Frame>
  );
}
export function ChevronDown(p: IconProps) {
  const c = base({ size: 18, strokeWidth: 1.8, ...p });
  return (
    <Frame c={c}>
      <Path d="M6 9l6 6 6-6" />
    </Frame>
  );
}
export function CalendarIcon(p: IconProps) {
  const c = base({ size: 14, strokeWidth: 1.7, ...p });
  return (
    <Frame c={c}>
      <Rect x="3.5" y="5" width="17" height="15" rx="2" />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </Frame>
  );
}
export function PlayIcon({ color = '#050506', size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}
export function PauseIcon({ color = '#050506', size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x="6" y="5" width="4" height="14" rx="1" />
      <Rect x="14" y="5" width="4" height="14" rx="1" />
    </Svg>
  );
}

/* ---- Home "Explore" tiles ---- */
export type ExploreKind = 'layers' | 'systems' | 'compare' | 'forecast' | 'data' | 'pipeline';

export function ExploreIcon({ kind, color = '#7FE0F0' }: { kind: ExploreKind; color?: string }) {
  const c = base({ size: 24, strokeWidth: 1.5, color });
  switch (kind) {
    case 'layers':
      return (
        <Frame c={c}>
          <Path d="M12 3l9 5-9 5-9-5 9-5z" />
          <Path d="M3 13l9 5 9-5" />
        </Frame>
      );
    case 'systems':
      return <SystemsIcon color={color} size={24} strokeWidth={1.5} />;
    case 'compare':
      return (
        <Frame c={c}>
          <Rect x="3" y="4" width="18" height="16" rx="2.5" />
          <Path d="M12 4v16" />
        </Frame>
      );
    case 'forecast':
      return (
        <Frame c={c}>
          <Path d="M3 17l5-5 4 3 8-8" />
          <Path d="M15 7h5v5" />
        </Frame>
      );
    case 'data':
      return (
        <Frame c={c}>
          <Ellipse cx="12" cy="6" rx="8" ry="3" />
          <Path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
          <Path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </Frame>
      );
    case 'pipeline':
      return (
        <Frame c={c}>
          <Circle cx="5" cy="6" r="2" />
          <Circle cx="19" cy="18" r="2" />
          <Path d="M7 6h6a4 4 0 0 1 0 8h-2a4 4 0 0 0 0 8" />
        </Frame>
      );
  }
}
