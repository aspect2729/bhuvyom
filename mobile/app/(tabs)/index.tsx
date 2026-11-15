import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronRight, ExploreIcon, type ExploreKind } from '@/components/Icons';
import { CtaPill, Screen, SectionLabel } from '@/components/ui';
import { api, fmt } from '@/lib/api';
import { EARTH_CLOUDS } from '@/lib/images';
import { fetchHomeStamp } from '@/lib/openMeteo';
import { refValue } from '@/lib/systems';
import { useApi } from '@/lib/useApi';
import { colors, cssAngle, em, fonts, surfaces } from '@/theme/tokens';

type Probe = {
  /** key in /api/site/summary readings (undefined = API has no such reading) */
  key?: 'air' | 'lst' | 'rh' | 'pm25';
  label: string;
  digits: number;
  accent?: string;
  /** systems.json reference fallback */
  ref: [string, string];
  unit?: string;
};

const PROBES: Probe[] = [
  { key: 'air', label: 'Air temperature', digits: 1, ref: ['sys-01', 'Air temperature'], unit: '°C' },
  { key: 'lst', label: 'Land surface', digits: 1, accent: colors.amber, ref: ['sys-01', 'Land surface temperature'], unit: '°C' },
  { key: 'rh', label: 'Relative humidity', digits: 0, ref: ['sys-04', 'Relative humidity'], unit: '%' },
  { key: 'pm25', label: 'PM2.5', digits: 0, ref: ['sys-11', 'PM2.5 Particulate'], unit: 'µg/m³' },
];

const TILE_GRAD = cssAngle(160);
const SIM_GRAD = cssAngle(120);

/** Home — Main.dc.html. */
export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const go = (href: Href) => () => router.push(href);

  const hero = Math.min(350, width - 40);
  const k = hero / 350;

  // Live: BhuVyom site summary → Open-Meteo stamp → systems.json reference.
  const site = useApi('site', () => api.site());
  const stamp = useApi('omHome', () => fetchHomeStamp(), 20 * 60 * 1000);
  const readings = site.data?.readings;
  const stampMap: Record<string, number | null | undefined> = {
    air: stamp.data?.air,
    lst: stamp.data?.surf,
    rh: stamp.data?.rh,
    pm25: stamp.data?.pm25,
  };
  const probes = PROBES.map((p) => {
    const r = p.key && p.key !== 'pm25' ? readings?.[p.key] : undefined;
    const fromSite = r && r.value != null && Number.isFinite(r.value) ? r : null;
    const fromOm =
      !fromSite && p.key && stampMap[p.key] != null && Number.isFinite(stampMap[p.key]!)
        ? { value: stampMap[p.key]!, unit: p.unit ?? '', period: stamp.data?.time ?? 'Open-Meteo' }
        : null;
    const live = fromSite ?? fromOm;
    const ref = refValue(p.ref[0], p.ref[1]);
    return {
      ...p,
      live,
      via: fromSite ? ('api' as const) : fromOm ? ('om' as const) : ('ref' as const),
      text: live ? `${fmt(live.value, p.digits)} ${live.unit}` : ref ?? 'No record',
    };
  });
  const nLive = probes.filter((p) => p.live).length;
  const nOm = probes.filter((p) => p.via === 'om').length;
  const badge =
    nLive === probes.length
      ? nOm === probes.length
        ? 'Live · Open-Meteo'
        : nOm > 0
          ? 'Live'
          : 'Live'
      : nLive === 0
        ? 'Reference'
        : 'Live + reference';
  const refNames = probes.filter((p) => !p.live).map((p) => p.label);
  const liveNames = probes.filter((p) => p.live).map((p) => `${p.label} (${p.live!.period})`);
  const footnote =
    nLive === 0
      ? `Reference values from the 16-systems catalogue · live values on Simulate${site.error ? ` · API: ${site.error}` : ''}`
      : nOm > 0 && nOm === nLive
        ? `Live from Open-Meteo (${stamp.data?.time ?? 'now'}): ${liveNames.join(', ')}.${refNames.length ? ` Reference: ${refNames.join(', ')}.` : ''} Full map on Simulate.`
        : `Live: ${liveNames.join(', ')}.${refNames.length ? ` Reference (16-systems catalogue): ${refNames.join(', ')}.` : ''} Live map values on Simulate.`;

  return (
    <Screen
      glow
      refreshing={site.refreshing || stamp.refreshing}
      onRefresh={() => {
        site.reload();
        stamp.reload();
      }}
      contentStyle={{ gap: 28, paddingHorizontal: 20 }}
    >
      {/* Hero */}
      <View style={{ gap: 14, paddingTop: 8 }}>
        <Text style={styles.eyebrow}>NASA EARTH DATA</Text>
        <Text style={styles.h1}>{'READ\nTHE CITY\nFROM SPACE'}</Text>
        <View style={{ width: hero, height: 330 * k, marginTop: 4 }}>
          <Image
            source={EARTH_CLOUDS}
            accessibilityLabel="Earth from orbit with Bengaluru marked"
            style={{ position: 'absolute', left: 10 * k, top: -10 * k, width: hero, height: hero, borderRadius: hero / 2 }}
            resizeMode="cover"
          />
          <View style={styles.chips}>
            {['12.97° N', '77.59° E', '≈ 920 M'].map((c) => (
              <Text key={c} style={styles.chip}>
                {c}
              </Text>
            ))}
          </View>
        </View>
        <Text style={styles.lede}>
          All 16 environmental systems over Bengaluru and Karnataka — from NASA satellites and
          climatological models, on one map you can explore, analyse, and simulate to 2100.
        </Text>
        <CtaPill label="GET STARTED" fullWidth onPress={go('/layers')} />
      </View>

      {/* At a glance */}
      <View style={styles.stats} accessibilityLabel="At a glance">
        {[
          ['16', 'Systems'],
          ['100+', 'Variables'],
          ['2100', 'Simulate to'],
        ].map(([n, l]) => (
          <View key={l} style={styles.stat}>
            <Text style={styles.statN}>{n}</Text>
            <Text style={styles.statL}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Explore */}
      <View style={{ gap: 12 }}>
        <View style={styles.row}>
          <SectionLabel size={13}>EXPLORE</SectionLabel>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text5 }}>7 sections</Text>
        </View>
        <View style={styles.grid}>
          <Tile
            kind="layers"
            title="Data layers"
            sub="Seven primary signals, one map"
            onPress={go('/layers')}
            gradient={['rgba(91,140,255,0.16)', 'rgba(255,255,255,0.03)']}
          />
          <Tile kind="systems" title="16 Systems" sub="Every variable, sensor and unit" onPress={go('/systems')} />

          <Pressable onPress={go('/simulate')} accessibilityRole="link" style={styles.simTile}>
            <LinearGradient
              colors={['rgba(233,161,90,0.20)', 'rgba(255,255,255,0.03)']}
              locations={[0, 0.7]}
              {...SIM_GRAD}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.24), color: colors.amber }}>
                SIMULATION
              </Text>
              <Text style={{ fontFamily: fonts.displayMedium, fontSize: 18, letterSpacing: em(18, 0.06), color: colors.text }}>
                Ask the city “what if?”
              </Text>
              <Text style={styles.tileSub}>Live map · 1980 → 2100 timeline</Text>
            </View>
            <View style={styles.simGo}>
              <ChevronRight color={colors.bg} />
            </View>
          </Pressable>

          <Tile kind="compare" title="Then vs now" sub="A past day beside live conditions" onPress={go('/compare')} />
          <Tile kind="forecast" title="Forecast" sub="12 months from the BhuVyom engine" onPress={go('/forecast')} />
          <Tile kind="data" title="Data sources" sub="Built on NASA" onPress={go('/data')} short />
          <Tile kind="pipeline" title="Pipeline" sub="From orbit to street" onPress={go('/pipeline')} short />
        </View>
      </View>

      {/* Bengaluru probe */}
      <View style={styles.probe} accessibilityLabel="Bengaluru now">
        <View style={styles.row}>
          <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.24), color: colors.text5 }}>
            BENGALURU LOCAL PROBE
          </Text>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.cyan }}>
              {site.loading ? 'Loading…' : badge}
            </Text>
          </View>
        </View>
        <View style={styles.probeGrid}>
          {probes.map((p) => (
            <View key={p.label} style={styles.probeCell}>
              <Text style={[styles.probeV, p.accent ? { color: p.accent } : null]}>{p.text}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>{p.label}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.45, color: colors.text5 }}>{footnote}</Text>
      </View>
    </Screen>
  );
}

function Tile({
  kind,
  title,
  sub,
  onPress,
  gradient,
  short,
}: {
  kind: ExploreKind;
  title: string;
  sub: string;
  onPress: () => void;
  gradient?: [string, string];
  short?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={[styles.tile, { minHeight: short ? 130 : 150, backgroundColor: gradient ? undefined : surfaces.cardStrong }]}
    >
      {gradient ? <LinearGradient colors={gradient} {...TILE_GRAD} style={StyleSheet.absoluteFill} /> : null}
      <ExploreIcon kind={kind} />
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.28), color: colors.cyan },
  h1: {
    fontFamily: fonts.displayLight,
    fontWeight: '300',
    fontSize: 42,
    lineHeight: 42 * 1.02,
    letterSpacing: em(42, 0.05),
    color: colors.text,
  },
  chips: { position: 'absolute', left: 0, bottom: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,5,6,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: em(11, 0.12),
    color: colors.text2,
  },
  lede: { fontFamily: fonts.body, fontSize: 14, lineHeight: 14 * 1.6, color: colors.text4 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: surfaces.cardStrong,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  statN: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  statL: { marginTop: 2, fontFamily: fonts.body, fontSize: 11, color: colors.text4 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.4%',
    flexGrow: 1,
    gap: 10,
    padding: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
  },
  tileTitle: {
    marginTop: 'auto',
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    letterSpacing: em(15, 0.06),
    color: colors.text,
  },
  tileSub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 12 * 1.45, color: colors.text4 },
  simTile: {
    width: '100%',
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: surfaces.amberLine,
  },
  simGo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  probe: {
    gap: 10,
    padding: 18,
    borderRadius: 20,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan },
  probeGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 12 },
  probeCell: { width: '47%' },
  probeV: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
});
