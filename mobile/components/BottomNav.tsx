import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompareIcon, ForecastIcon, HomeIcon, SimulateIcon, SystemsIcon, type IconProps } from '@/components/Icons';
import { colors, fonts, surfaces } from '@/theme/tokens';

export type TabKey = 'index' | 'systems' | 'simulate' | 'compare' | 'forecast';

export const TABS: { key: TabKey; label: string; Icon: (p: IconProps) => React.JSX.Element }[] = [
  { key: 'index', label: 'Home', Icon: HomeIcon },
  { key: 'systems', label: 'Systems', Icon: SystemsIcon },
  { key: 'simulate', label: 'Simulate', Icon: SimulateIcon },
  { key: 'compare', label: 'Compare', Icon: CompareIcon },
  { key: 'forecast', label: 'Forecast', Icon: ForecastIcon },
];

/** Bottom nav from Main.dc.html: active tab = cyan icon on a rgba(127,224,240,0.10) pill. */
export function BottomNav({ active, onSelect }: { active: TabKey; onSelect: (key: TabKey) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}
    >
      {TABS.map(({ key, label, Icon }) => {
        const on = key === active;
        const color = on ? colors.cyan : colors.text4;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={styles.item}
          >
            <View style={[styles.pill, on && { backgroundColor: surfaces.cyanTint }]}>
              <Icon color={color} />
            </View>
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 8,
    backgroundColor: surfaces.navBg,
    borderTopWidth: 1,
    borderTopColor: surfaces.border,
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  pill: {
    width: 46,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.body, fontSize: 11, letterSpacing: 0.02 * 11 },
});
