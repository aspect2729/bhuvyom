import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TopBar } from '@/components/TopBar';
import { useDeviceLayout } from '@/lib/useDeviceLayout';
import { colors, fonts } from '@/theme/tokens';

type Scenario = 'heat' | 'runoff' | 'air';

const SCENARIOS: { id: Scenario; label: string; title: string; season: string }[] = [
  { id: 'heat', label: 'Heat', title: 'URBAN HEAT', season: 'Summer · Mar–May' },
  { id: 'runoff', label: 'Runoff', title: 'RAIN RUNOFF', season: 'Monsoon · Jun–Sep' },
  { id: 'air', label: 'Air flow', title: 'AIR FLOW', season: 'Dry · Dec–Feb' },
];

/** Mobile Simulation Lab — design-source/mobile/MobileSimulationLab.dc.html */
export default function LabScreen() {
  const layout = useDeviceLayout();
  const [scenario, setScenario] = useState<Scenario>('heat');
  const [split, setSplit] = useState(50);
  const active = SCENARIOS.find((s) => s.id === scenario)!;

  const cells = useMemo(() => {
    const out: string[] = [];
    const C = 20;
    const R = 20;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const x = (c - 9.5) / 9.3;
        const y = (r - 9.5) / 9.3;
        const dd = Math.sqrt(x * x + y * y);
        let t =
          0.55 -
          0.35 * dd +
          0.2 * Math.exp(-((c - 15) ** 2 + (r - 7) ** 2) / 7) -
          0.22 * Math.exp(-((c - 12) ** 2 + (r - 13) ** 2) / 3.5);
        t = Math.max(0, Math.min(1, t));
        const afterBoost = c >= Math.round((split / 100) * C) ? 0.12 : 0;
        const v = Math.max(0, Math.min(1, t + afterBoost));
        out.push(heatColor(v));
      }
    }
    return out;
  }, [split]);

  return (
    <View style={styles.root}>
      <TopBar variant="sample" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: layout.endPad, paddingTop: layout.topY + 56 + 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pad}>
          <Text style={styles.eyebrow}>SIMULATION LAB</Text>
          <Text style={styles.h1}>{'ASK THE CITY\n“WHAT IF?”'}</Text>
          <Text style={styles.body}>
            Move the levers, then drag the divider to compare before and after. Numbers are
            placeholders until the engine is connected.
          </Text>

          <View style={styles.segment} accessibilityRole="tablist">
            {SCENARIOS.map((s) => {
              const on = s.id === scenario;
              if (on) {
                return (
                  <LinearGradient
                    key={s.id}
                    colors={['#7FE0F0', '#5B8CFF', '#9A86B8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.segActive}
                  >
                    <Pressable onPress={() => setScenario(s.id)} style={styles.segPress}>
                      <Text style={styles.segActiveText}>{s.label}</Text>
                    </Pressable>
                  </LinearGradient>
                );
              }
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setScenario(s.id)}
                  style={styles.segIdle}
                  accessibilityState={{ selected: false }}
                >
                  <Text style={styles.segIdleText}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.mapCard}>
            <View style={styles.mapHead}>
              <Text style={styles.mapTitle}>{active.title}</Text>
              <Text style={styles.mapSeason}>{active.season}</Text>
            </View>
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                {cells.map((bg, i) => (
                  <View key={i} style={[styles.cell, { backgroundColor: bg }]} />
                ))}
              </View>
              <View
                style={[styles.divider, { left: `${Math.max(5, Math.min(95, split))}%` }]}
                pointerEvents="none"
              >
                <View style={styles.beforeTag}>
                  <Text style={styles.tagText}>BEFORE</Text>
                </View>
                <View style={styles.handle}>
                  <Text style={styles.handleText}>{'‹ ›'}</Text>
                </View>
                <View style={styles.afterTag}>
                  <Text style={styles.tagText}>AFTER</Text>
                </View>
              </View>
              <View
                style={styles.splitHit}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderMove={(e) => {
                  const w = e.nativeEvent.target ? 320 : 320;
                  const pct = Math.max(5, Math.min(95, (e.nativeEvent.locationX / w) * 100));
                  setSplit(Math.round(pct));
                }}
                onLayout={(e) => {
                  // store measured width on the view via closure replacement below if needed
                  (e.target as unknown as { __w?: number }).__w = e.nativeEvent.layout.width;
                }}
              />
            </View>
            <View style={styles.legend}>
              <LinearGradient
                colors={['#5B8CFF', '#7FE0F0', '#F4C27C', '#E0905A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ramp}
              />
              <View style={styles.legendRow}>
                <Text style={styles.legendEdge}>20 °C</Text>
                <Text style={styles.legendMid}>Land surface temperature</Text>
                <Text style={styles.legendEdge}>36 °C</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function heatColor(t: number) {
  const stops = [
    [0.36, 0.55, 1],
    [0.5, 0.88, 0.94],
    [0.95, 0.76, 0.49],
    [0.88, 0.56, 0.35],
  ];
  const i = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const f = t * (stops.length - 1) - i;
  const a = stops[i];
  const b = stops[i + 1];
  const r = Math.round((a[0] + (b[0] - a[0]) * f) * 255);
  const g = Math.round((a[1] + (b[1] - a[1]) * f) * 255);
  const bl = Math.round((a[2] + (b[2] - a[2]) * f) * 255);
  return `rgb(${r},${g},${bl})`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 12,
    letterSpacing: 0.34 * 12,
    color: colors.cyan,
  },
  h1: {
    marginTop: 12,
    fontFamily: fonts.displayLight,
    fontSize: 42,
    letterSpacing: 0.05 * 42,
    lineHeight: 42 * 0.98,
    color: colors.text,
  },
  body: {
    marginTop: 14,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 13 * 1.65,
    color: colors.text3,
  },
  segment: {
    marginTop: 22,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    padding: 3,
    gap: 4,
  },
  segActive: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  segPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segActiveText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: '#000',
  },
  segIdle: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segIdleText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  mapCard: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  mapHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  mapTitle: { fontFamily: fonts.body, fontSize: 11, color: colors.text3 },
  mapSeason: { fontFamily: fonts.body, fontSize: 11, color: colors.text4 },
  gridWrap: { position: 'relative', padding: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  cell: {
    width: '4.7%',
    aspectRatio: 1,
    borderRadius: 2,
  },
  divider: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: { color: '#000', fontSize: 14, fontWeight: '600' },
  beforeTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  afterTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tagText: { fontSize: 9, letterSpacing: 1, color: colors.text },
  splitHit: { ...StyleSheet.absoluteFill },
  legend: { paddingHorizontal: 16, paddingBottom: 16 },
  ramp: { height: 6, borderRadius: 3, marginTop: 4 },
  legendRow: {
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendEdge: { fontSize: 10, color: colors.text4, fontFamily: fonts.body },
  legendMid: { fontSize: 10, color: colors.text4, fontFamily: fonts.body },
});
