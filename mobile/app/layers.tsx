import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, PathIcon } from '@/components/Icons';
import { H1, P, Screen, SectionLabel, WhiteButton } from '@/components/ui';
import { colors, cssAngle, em, fonts, surfaces } from '@/theme/tokens';

type LayerRow = {
  name: string;
  desc: string;
  src: string;
  unit: string;
  sys: string;
  icon: string;
  /** Simulate layer key this signal maps to (none for solar / cloud). */
  sim?: string;
};

/** 7 primary layers — Layers.dc.html. */
const L: LayerRow[] = [
  { name: 'Air temperature', desc: 'How warm ambient air is two metres above the Mysore Plateau.', src: 'NASA POWER · T2M', unit: '°C', sys: 'SYSTEM 01 · TEMPERATURE', icon: 'M10 13.5V4a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z M12 9v6', sim: 'air' },
  { name: 'Land surface temperature', desc: 'How hot asphalt, rooftops, and concrete corridors get under the tropical sun.', src: 'MODIS · MOD11A2', unit: '°C', sys: 'SYSTEM 01 · TEMPERATURE', icon: 'M3 15l9 5 9-5 M3 10l9 5 9-5-9-5z', sim: 'surf' },
  { name: 'Precipitation', desc: 'Monsoon accumulation and high-intensity localized cloudbursts.', src: 'GPM IMERG', unit: 'mm', sys: 'SYSTEM 02 · PRECIPITATION & WATER', icon: 'M7 14a5 5 0 1 1 9.6-2A4 4 0 1 1 17 20H8a4 4 0 0 1-1-6z M9 22l1-2 M13 22l1-2', sim: 'rain' },
  { name: 'Relative humidity', desc: 'Water vapor fraction governing thermal comfort and convective storm readiness.', src: 'NASA POWER · RH2M', unit: '%', sys: 'SYSTEM 04 · ATMOSPHERIC ACTIVITY', icon: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z M9.5 16l5-5', sim: 'rh' },
  { name: 'Wind speed', desc: 'Air velocity dispersing heat and industrial plumes across plateau valleys.', src: 'NASA POWER · WS2M', unit: 'm/s', sys: 'SYSTEM 04 · ATMOSPHERIC ACTIVITY', icon: 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8', sim: 'wind' },
  { name: 'Solar radiation', desc: 'All-sky direct and diffuse irradiance driving urban rooftop solar potential.', src: 'NASA POWER · ALLSKY', unit: 'kWh/m²', sys: 'SYSTEM 10 · SOLAR & SPACE', icon: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2' },
  { name: 'Cloud cover', desc: 'Share of the celestial dome occluded by tropospheric clouds.', src: 'NASA POWER · CLOUD_AMT', unit: '%', sys: 'SYSTEM 04 · ATMOSPHERIC ACTIVITY', icon: 'M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18z' },
];

const SEL_GRAD = cssAngle(150);

/** Data layers — Layers.dc.html (pushed from Home). */
export default function LayersScreen() {
  const router = useRouter();
  const [picked, setPicked] = useState(0);
  const sel = L[picked];

  return (
    <Screen back title="DATA LAYERS" contentStyle={{ gap: 22, paddingHorizontal: 20, paddingTop: 4 }}>
      <View style={{ gap: 10 }}>
        <H1>{'PRIMARY SIGNALS.\nONE MAP.'}</H1>
        <P>
          Each layer keeps its own source, unit, and physical meaning. Air temperature and land
          surface temperature stay separate — they measure fundamentally different phenomena.
        </P>
      </View>

      {/* Selected layer */}
      <View style={styles.sel} accessibilityLiveRegion="polite">
        <LinearGradient
          colors={['rgba(91,140,255,0.22)', 'rgba(127,224,240,0.06)', 'rgba(255,255,255,0.02)']}
          locations={[0, 0.55, 1]}
          {...SEL_GRAD}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.selIcon}>
            <PathIcon d={sel.icon} size={24} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.24), color: colors.cyan }}>
              {sel.sys}
            </Text>
            <Text style={{ fontFamily: fonts.displayMedium, fontSize: 22, letterSpacing: em(22, 0.03), color: colors.text }}>
              {sel.name}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 14 * 1.55, color: colors.text2 }}>{sel.desc}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            ['Source', sel.src],
            ['Unit', sel.unit],
          ].map(([k, v]) => (
            <View key={k} style={styles.kv}>
              <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>{k}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text, marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>
        <WhiteButton
          label="VIEW ON THE MAP"
          onPress={() => router.navigate(sel.sim ? { pathname: '/simulate', params: { layer: sel.sim } } : '/simulate')}
          icon={<ChevronRight color={colors.bg} size={16} />}
        />
      </View>

      {/* List */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SectionLabel>7 LAYERS</SectionLabel>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text5 }}>Tap to inspect</Text>
        </View>
        {L.map((l, i) => {
          const on = i === picked;
          return (
            <Pressable
              key={l.name}
              onPress={() => setPicked(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.row,
                on
                  ? { backgroundColor: 'rgba(127,224,240,0.08)', borderColor: surfaces.cyanLine }
                  : { backgroundColor: surfaces.card, borderColor: surfaces.border },
              ]}
            >
              <View style={styles.rowIcon}>
                <PathIcon d={l.icon} size={22} color={on ? colors.cyan : colors.text2} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{l.name}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>{l.src}</Text>
              </View>
              <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.text2 }}>{l.unit}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 16 systems link */}
      <Pressable onPress={() => router.navigate('/systems')} accessibilityRole="link" style={styles.link}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fonts.displayMedium, fontSize: 18, letterSpacing: em(18, 0.04), color: colors.text }}>
            Complete 16 Systems
          </Text>
          <Text style={styles.varsPill}>100+ VARS</Text>
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.55, color: colors.text4 }}>
          Vegetation, air quality PM2.5, carbon flux, solar space Kp, cryosphere, and 2100 climate forecasts.
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: em(12, 0.18), color: colors.cyan }}>
          EXPLORE 16 SYSTEMS →
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sel: {
    gap: 14,
    padding: 20,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(127,224,240,0.28)',
  },
  selIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(5,5,6,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kv: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(5,5,6,0.45)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 76,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    gap: 10,
    padding: 20,
    borderRadius: 22,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  varsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: surfaces.amberTint,
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: em(11, 0.12),
    color: colors.amber,
  },
});
