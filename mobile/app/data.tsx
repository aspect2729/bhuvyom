import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from '@/components/Icons';
import { Eyebrow, H1, P, Screen, SectionLabel, Tag } from '@/components/ui';
import { colors, cssAngle, em, fonts, surfaces } from '@/theme/tokens';

/** NASA sources — Data.dc.html. */
const NASA = [
  { badge: 'PWR', name: 'NASA POWER', desc: 'Air temperature, humidity, wind, solar radiation, cloud amount and corrected precipitation from MERRA-2 and CERES.', cad: 'Daily · monthly', res: '0.5° × 0.625°', feeds: ['T2M', 'RH2M', 'WS2M', 'ALLSKY', 'CLOUD_AMT', 'PRECTOTCORR'] },
  { badge: 'MOD', name: 'MODIS · MOD11A2', desc: 'Land surface temperature and surface emissivity from the Terra satellite, day and night passes.', cad: '8-day composite', res: '1 km', feeds: ['Land surface temperature', 'Emissivity', 'Day / night'] },
  { badge: 'GPM', name: 'GPM IMERG', desc: 'Merged satellite precipitation estimates from the Global Precipitation Measurement constellation.', cad: '30 minutes', res: '0.1°', feeds: ['Rainfall', 'Rainfall intensity', 'Extreme rainfall'] },
];

const ALSO = [
  ['Open-Meteo', 'Live · ECMWF / GFS models'],
  ['ERA5 reanalysis', 'Record 1980–2025'],
  ['Copernicus CAMS', 'PM2.5 air quality'],
  ['IPCC AR6 WGI', 'Warming scenarios to 2100'],
  ['BhuVyom engine', '12-month forecasts'],
  ['NASA Black Marble', 'Night basemap (VIIRS)'],
  ['geoBoundaries', 'State & district outlines'],
];

const OPEN_GRAD = cssAngle(150);

/** Data sources — Data.dc.html (pushed from Home). */
export default function DataScreen() {
  const [open, setOpen] = useState(0);

  return (
    <Screen back title="DATA SOURCES" contentStyle={{ gap: 20, paddingHorizontal: 20, paddingTop: 4 }}>
      <View style={{ gap: 10 }}>
        <Eyebrow>DATA SOURCES</Eyebrow>
        <H1>BUILT ON NASA</H1>
        <P>Every layer names where it came from, how often it updates, and how fine its grid is.</P>
      </View>

      <View style={{ gap: 10 }} accessibilityLabel="NASA sources">
        {NASA.map((d, i) => {
          const on = i === open;
          return (
            <Pressable
              key={d.name}
              onPress={() => setOpen(on ? -1 : i)}
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              style={[
                styles.card,
                on
                  ? { borderColor: 'rgba(127,224,240,0.32)' }
                  : { backgroundColor: surfaces.card, borderColor: surfaces.border },
              ]}
            >
              {on ? (
                <LinearGradient
                  colors={['rgba(91,140,255,0.16)', 'rgba(255,255,255,0.02)']}
                  {...OPEN_GRAD}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.badge}>
                  <Text style={{ fontFamily: fonts.displaySemi, fontSize: 13, color: colors.cyan }}>{d.badge}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: fonts.displayMedium, fontSize: 18, letterSpacing: em(18, 0.03), color: colors.text }}>
                  {d.name}
                </Text>
                <View style={{ transform: [{ rotate: on ? '180deg' : '0deg' }] }}>
                  <ChevronDown color={colors.text4} />
                </View>
              </View>
              <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.55, color: colors.text4 }}>{d.desc}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  ['Cadence', d.cad],
                  ['Resolution', d.res],
                ].map(([k, v]) => (
                  <View key={k} style={styles.kv}>
                    <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>{k}</Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text }}>{v}</Text>
                  </View>
                ))}
              </View>
              {on ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {d.feeds.map((f) => (
                    <Tag key={f}>{f}</Tag>
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <SectionLabel>ALSO IN THE APP</SectionLabel>
        <View style={styles.also}>
          {ALSO.map(([n, u], i) => (
            <View key={n} style={[styles.alsoRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}>
              <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text }}>{n}</Text>
              <Text style={{ flexShrink: 1, fontFamily: fonts.body, fontSize: 11, color: colors.text4, textAlign: 'right' }}>{u}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.honest}>
        <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.amber }}>HONEST DATA</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.55, color: colors.text2 }}>
          Air temperature and land surface temperature are never mixed. Missing records show as “No record”, never as zero.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 18, borderRadius: 22, overflow: 'hidden', borderWidth: 1 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(127,224,240,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kv: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: surfaces.cardStrong },
  also: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: surfaces.border },
  alsoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  honest: {
    gap: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(233,161,90,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233,161,90,0.25)',
  },
});
