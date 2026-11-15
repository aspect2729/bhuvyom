import { useRouter, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav, type TabKey } from '@/components/BottomNav';
import { ChevronRight } from '@/components/Icons';
import { rampGradient, type Stop as RampStop } from '@/lib/layers';
import { colors, em, fonts, surfaces } from '@/theme/tokens';

const TAB_HREF: Record<TabKey, Href> = {
  index: '/',
  systems: '/systems',
  simulate: '/simulate',
  compare: '/compare',
  forecast: '/forecast',
};

type ScreenProps = {
  children: ReactNode;
  title?: string;
  /** Pushed screens (Layers / Data / Pipeline): back arrow + their own bottom nav with Home active. */
  back?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Main.dc.html radial glow behind the page. */
  glow?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Page frame: header + scrolling body (+ bottom nav on pushed screens; tab screens get it from the tab bar). */
export const Screen = forwardRef<ComponentRef<typeof ScrollView>, ScreenProps>(function Screen(
  { children, title, back, refreshing, onRefresh, glow, contentStyle },
  ref,
) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <AppHeader title={title} back={back} />
      <ScrollView
        ref={ref}
        style={styles.root}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />
          ) : undefined
        }
      >
        <View style={[{ paddingBottom: 28 }, contentStyle]}>
          {glow ? (
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
              <Defs>
                <RadialGradient id="glow" cx="50%" cy="18%" rx="120%" ry="60%" gradientUnits="objectBoundingBox">
                  <Stop offset="0" stopColor="#0B1224" stopOpacity={1} />
                  <Stop offset="0.62" stopColor="#050506" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
            </Svg>
          ) : null}
          {children}
        </View>
      </ScrollView>
      {back ? <BottomNav active="index" onSelect={(k) => router.navigate(TAB_HREF[k])} /> : null}
    </View>
  );
});

export function Eyebrow({
  children,
  color = colors.cyan,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.eyebrow, { color }, style]}>{children}</Text>;
}

export function H1({ children, size = 34, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.displayLight,
          fontWeight: '300',
          fontSize: size,
          lineHeight: size * 1.05,
          letterSpacing: em(size, 0.05),
          color: colors.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function P({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.p, style]}>{children}</Text>;
}

/** "EXPLORE" / "7 LAYERS" style section label. */
export function SectionLabel({ children, size = 12 }: { children: ReactNode; size?: number }) {
  return (
    <Text
      style={{
        fontFamily: fonts.displayMedium,
        fontSize: size,
        letterSpacing: em(size, 0.24),
        color: colors.text2,
      }}
    >
      {children}
    </Text>
  );
}

/** Small uppercase Jura label (11px · 0.22em). */
export function MiniLabel({ children, color = colors.text4, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.mini, { color }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** White pill CTA with a dark chevron disc ("GET STARTED"). */
export function CtaPill({
  label,
  onPress,
  size = 'lg',
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  size?: 'lg' | 'md';
  fullWidth?: boolean;
}) {
  const big = size === 'lg';
  const h = big ? 54 : 50;
  const disc = big ? 40 : 38;
  const fs = big ? 13 : 12;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={[
        {
          height: h,
          borderRadius: h / 2,
          backgroundColor: colors.text,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingLeft: big ? 22 : 20,
          paddingRight: big ? 8 : 6,
        },
        fullWidth ? null : { alignSelf: 'flex-start' },
      ]}
    >
      <Text style={{ fontFamily: fonts.displaySemi, fontSize: fs, letterSpacing: em(fs, 0.2), color: colors.bg }}>
        {label}
      </Text>
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronRight color={colors.text} size={big ? 18 : 16} />
      </View>
    </Pressable>
  );
}

/** Full-width white pill ("VIEW ON THE MAP", "SIMULATE THIS SYSTEM"). */
export function WhiteButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.whiteBtn}>
      <Text style={{ fontFamily: fonts.displaySemi, fontSize: 12, letterSpacing: em(12, 0.18), color: colors.bg }}>
        {label}
      </Text>
      {icon}
    </Pressable>
  );
}

/** Cyan Jura text link ("FUTURE PREDICTIONS →"). */
export function TextLink({ label, onPress, color = colors.cyan }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: em(12, 0.18), color }}>{label}</Text>
    </Pressable>
  );
}

/** Two/three-way segmented control (Karnataka|Bengaluru, Day|Night, Split|All). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  height = 36,
  radius = 12,
  outerRadius = 15,
  fontSize = 12,
  flex = true,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
  radius?: number;
  outerRadius?: number;
  fontSize?: number;
  flex?: boolean;
}) {
  return (
    <View style={[styles.seg, { borderRadius: outerRadius }, flex ? { flex: 1 } : null]}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              { flex: 1, height, borderRadius: radius, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
              on && { backgroundColor: colors.text },
            ]}
          >
            <Text style={{ fontFamily: fonts.body, fontSize, color: on ? colors.bg : colors.text2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ramp-swatched layer chip row (Simulate / Compare). */
export function LayerChips({
  items,
  value,
  onChange,
  height = 40,
  fontSize = 13,
}: {
  items: { key: string; label: string; stops: RampStop[] }[];
  value: string;
  onChange: (k: string) => void;
  height?: number;
  fontSize?: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginHorizontal: -16, flexGrow: 0 }}
      accessibilityRole="tablist"
    >
      {items.map((l) => {
        const on = l.key === value;
        const g = rampGradient(l.stops);
        return (
          <Pressable
            key={l.key}
            onPress={() => onChange(l.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              styles.layerChip,
              { height, borderRadius: height / 2 },
              on && { backgroundColor: 'rgba(127,224,240,0.12)', borderColor: 'rgba(127,224,240,0.5)' },
            ]}
          >
            <LinearGradient
              colors={g.colors}
              locations={g.locations}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: height > 38 ? 14 : 13, height: height > 38 ? 14 : 13, borderRadius: 7 }}
            />
            <Text style={{ fontFamily: fonts.body, fontSize, color: on ? colors.text : colors.text2 }}>{l.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Horizontal legend bar built from a layer ramp. */
export function RampBar({ stops, height = 8 }: { stops: RampStop[]; height?: number }) {
  const g = rampGradient(stops);
  return (
    <LinearGradient
      colors={g.colors}
      locations={g.locations}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ height, borderRadius: height / 2 }}
    />
  );
}

/** Pill tag (cyan source tag, grey unit tag, …). */
export function Tag({ children, color = colors.cyan, bg = 'rgba(127,224,240,0.08)' }: { children: ReactNode; color?: string; bg?: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 11, color }}>{children}</Text>
    </View>
  );
}

/** Dim footnote paragraph. */
export function Note({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.note, style]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  eyebrow: { fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.28) },
  p: { fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.6, color: colors.text4 },
  mini: { fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22) },
  card: {
    borderRadius: 22,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  note: { fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.6, color: colors.text5 },
  whiteBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  seg: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
