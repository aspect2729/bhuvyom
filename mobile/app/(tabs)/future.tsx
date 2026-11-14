import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EarthCanvas } from '@/components/EarthCanvas';
import { GlassPill } from '@/components/GlassPill';
import { TopBar } from '@/components/TopBar';
import { mobileFutureLayout } from '@/lib/earthLayouts';
import { useDeviceLayout } from '@/lib/useDeviceLayout';
import { colors, fonts } from '@/theme/tokens';

type Pathway = 'ssp1' | 'ssp2' | 'ssp5';
type Year = 2030 | 2050 | 2070 | 2100;
type Scale = 'city' | 'planet';

const PATHWAYS: { id: Pathway; label: string; code: string; dot: string }[] = [
  { id: 'ssp1', label: 'Sustainable', code: 'SSP1-2.6', dot: colors.cyan },
  { id: 'ssp2', label: 'Middle road', code: 'SSP2-4.5', dot: colors.mauve },
  { id: 'ssp5', label: 'Fossil-fueled', code: 'SSP5-8.5', dot: colors.orange },
];

const YEARS: Year[] = [2030, 2050, 2070, 2100];

/** Mobile Future Earth — design-source/mobile/MobileFutureEarth.dc.html */
export default function FutureScreen() {
  const layout = useDeviceLayout();
  const [soundOn, setSoundOn] = useState(false);
  const [pathway, setPathway] = useState<Pathway>('ssp2');
  const [year, setYear] = useState<Year>(2050);
  const [scale, setScale] = useState<Scale>('city');

  const place = scale === 'city' ? 'BENGALURU' : 'EARTH';
  const earthLayout = useMemo(
    () =>
      mobileFutureLayout({
        screenH: layout.screenH,
        safeTop: layout.safeTop,
        safeBottom: layout.safeBottom,
        compact: layout.compact,
      }),
    [layout.screenH, layout.safeTop, layout.safeBottom, layout.compact],
  );

  return (
    <View style={styles.root}>
      <TopBar soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ paddingBottom: layout.endPad }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { height: layout.screenH }]}>
          <EarthCanvas width={layout.width} height={layout.screenH} layout={earthLayout} />
          <View style={[styles.heroCopy, { paddingTop: layout.heroPad }]} pointerEvents="box-none">
            <Text style={styles.eyebrow}>FUTURE EARTH</Text>
            <Text style={[styles.h1, { fontSize: layout.compact ? 40 : 46 }]}>
              {`${place}\nIN ${year}`}
            </Text>
            <View style={styles.amberRule} />
            {!layout.compact ? (
              <Text style={styles.heroBody}>
                How what we build, burn and protect — and what nature does — could change the decades
                ahead.
              </Text>
            ) : null}
          </View>

          <View style={[styles.dockHost, { bottom: layout.dockY }]} pointerEvents="box-none">
            <GlassPill style={styles.dock}>
              <View style={styles.dockInner}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pathRow}>
                  {PATHWAYS.map((p) => {
                    const on = p.id === pathway;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPathway(p.id)}
                        style={[styles.pathPill, on && styles.pathPillOn]}
                      >
                        <View style={[styles.pathDot, { backgroundColor: p.dot }]} />
                        <Text style={[styles.pathText, on && styles.pathTextOn]}>
                          {p.label} ({p.code})
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.controlsRow}>
                  <Text style={styles.ctrlLabel}>Year</Text>
                  <View style={styles.track}>
                    {YEARS.map((y) => {
                      const on = y === year;
                      return (
                        <Pressable
                          key={y}
                          onPress={() => setYear(y)}
                          style={[styles.trackOpt, on && styles.trackOptOn]}
                        >
                          <Text style={[styles.trackText, on && styles.trackTextOn]}>{y}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.controlsRow}>
                  <Text style={styles.ctrlLabel}>Scale</Text>
                  <View style={[styles.track, { flex: 0, width: 140 }]}>
                    {(['city', 'planet'] as Scale[]).map((s) => {
                      const on = s === scale;
                      const label = s === 'city' ? 'City' : 'Planet';
                      return (
                        <Pressable
                          key={s}
                          onPress={() => setScale(s)}
                          style={[styles.trackOpt, on && styles.trackOptOn]}
                        >
                          <Text style={[styles.trackText, on && styles.trackTextOn]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.metrics}>
                  <Metric label="Mean air temperature" value="24.6" unit="°C" />
                  <Metric label="Heatwave days a year" value="9" unit="days" />
                  <Metric label="Lake water area" value="97" unit="%" />
                </View>
              </View>
            </GlassPill>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>MANMADE & NATURAL</Text>
          <Text style={styles.sectionH2}>{'MANMADE\n& NATURAL'}</Text>
          <Text style={[styles.heroBody, { maxWidth: undefined, marginTop: 14 }]}>
            Drivers, metrics grid and cause→effect chains continue here — matching
            MobileFutureEarth.dc.html exactly.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {value} <Text style={styles.metricUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { position: 'relative' },
  heroCopy: { paddingHorizontal: 20, zIndex: 2 },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 12,
    letterSpacing: 0.38 * 12,
    color: 'rgba(242,242,242,0.8)',
  },
  h1: {
    marginTop: 14,
    fontFamily: fonts.displayLight,
    letterSpacing: 0.04 * 46,
    color: colors.text,
  },
  amberRule: {
    width: 56,
    height: 2,
    marginTop: 20,
    backgroundColor: colors.amber,
  },
  heroBody: {
    marginTop: 18,
    maxWidth: 250,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 14 * 1.65,
    color: 'rgba(242,242,242,0.78)',
  },
  dockHost: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 3,
  },
  dock: { borderRadius: 24, minHeight: 190 },
  dockInner: { padding: 14, gap: 12 },
  pathRow: { gap: 8, paddingRight: 8 },
  pathPill: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(242,242,242,0.2)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pathPillOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  pathDot: { width: 8, height: 8, borderRadius: 4 },
  pathText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.text,
  },
  pathTextOn: { color: '#000' },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctrlLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.text4,
    width: 40,
  },
  track: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0C0C0F',
    flexDirection: 'row',
    padding: 2,
  },
  trackOpt: {
    flex: 1,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackOptOn: { backgroundColor: colors.text },
  trackText: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.text2,
  },
  trackTextOn: { color: '#000' },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 4,
  },
  metric: { flex: 1 },
  metricLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.text4,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.text,
  },
  metricUnit: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.text3,
  },
  section: { paddingTop: 72, paddingHorizontal: 20 },
  sectionEyebrow: {
    fontFamily: fonts.display,
    fontSize: 12,
    letterSpacing: 0.34 * 12,
    color: colors.cyan,
  },
  sectionH2: {
    marginTop: 12,
    fontFamily: fonts.displayLight,
    fontSize: 34,
    letterSpacing: 0.04 * 34,
    lineHeight: 34 * 1.02,
    color: colors.text,
  },
});
