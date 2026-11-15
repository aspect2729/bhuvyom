import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CtaPill, Eyebrow, H1, Screen, Tag } from '@/components/ui';
import { EARTH_CLOUDS } from '@/lib/images';
import { colors, em, fonts } from '@/theme/tokens';

/** 5 steps — Pipeline.dc.html. */
const STEPS = [
  { t: 'Retrieve', d: 'Pull each environmental variable from NASA APIs across Karnataka’s geographic bounding box.', tags: ['NASA POWER', 'MODIS', 'GPM IMERG'] },
  { t: 'Process', d: 'Normalize coordinates, clean gaps, calibrate against IMD stations, and preserve physical units.', tags: ['Gap filling', 'IMD calibration', 'Units kept'] },
  { t: 'Visualise', d: 'Ray-trace the 8K planet in WebGL2 and map street-level gradients across urban wards.', tags: ['WebGL2 globe', 'Ward gradients'] },
  { t: 'Simulate', d: 'Run what-if scenarios for cool roofs, lake restoration, and CMIP6 climate warming to 2100.', tags: ['Cool roofs', 'Lake restoration', 'CMIP6 · 2100'] },
  { t: 'Validate', d: 'Audit ground truth sensors, uncertainty margins, and policy decision metrics.', tags: ['Ground truth', 'Uncertainty', 'Policy metrics'] },
];

/** Pipeline — Pipeline.dc.html (pushed from Home). */
export default function PipelineScreen() {
  const router = useRouter();
  const [open, setOpen] = useState(0);

  return (
    <Screen back title="PIPELINE" contentStyle={{ gap: 22, paddingHorizontal: 20, paddingTop: 4 }}>
      <View style={{ gap: 10 }}>
        <Eyebrow>HOW IT WORKS</Eyebrow>
        <H1>{'FROM ORBIT\nTO STREET'}</H1>
      </View>

      <View>
        {STEPS.map((s, i) => {
          const on = i === open;
          const done = i < open;
          const last = i === STEPS.length - 1;
          return (
            <View key={s.t} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ width: 44, alignItems: 'center' }}>
                <View
                  style={[
                    styles.dot,
                    on
                      ? { backgroundColor: colors.cyan }
                      : done
                        ? { backgroundColor: 'rgba(127,224,240,0.18)' }
                        : { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: fonts.displaySemi,
                      fontSize: 14,
                      color: on ? colors.bg : done ? colors.cyan : colors.text2,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    width: 1,
                    minHeight: 20,
                    backgroundColor: last ? 'transparent' : done ? 'rgba(127,224,240,0.5)' : 'rgba(255,255,255,0.12)',
                  }}
                />
              </View>
              <Pressable
                onPress={() => setOpen(i)}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                style={[
                  styles.step,
                  on
                    ? { backgroundColor: 'rgba(127,224,240,0.06)', borderColor: 'rgba(127,224,240,0.30)' }
                    : { borderColor: 'transparent' },
                ]}
              >
                <Text style={{ fontFamily: fonts.displayMedium, fontSize: 18, letterSpacing: em(18, 0.04), color: colors.text }}>{s.t}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.55, color: colors.text4 }}>{s.d}</Text>
                {on ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {s.tags.map((g) => (
                      <Tag key={g}>{g}</Tag>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Edge of the city CTA */}
      <View style={styles.cta}>
        <Image
          source={EARTH_CLOUDS}
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', left: 40, top: 120, width: 420, height: 420, borderRadius: 210, opacity: 0.9 }}
        />
        <LinearGradient
          colors={['#07080C', 'rgba(7,8,12,0)']}
          locations={[0.22, 0.6]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={styles.ctaH}>{'EDGE\nOF THE\nCITY'}</Text>
        <Text style={{ maxWidth: 240, fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.6, color: colors.text2 }}>
          Explore Bengaluru’s atmospheric signals, microclimates, and satellite telemetry from orbit.
        </Text>
        <CtaPill label="GET STARTED" size="md" onPress={() => router.push('/layers')} />
      </View>

      <View style={{ gap: 6, paddingHorizontal: 2 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.16), color: colors.text4 }}>
          BhuVyom
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.6, color: colors.text5 }}>
          Planetary &amp; Regional Environmental Engine · NASA POWER, MODIS, GPM · Open-Meteo · ECMWF · IPCC AR6
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  step: { flex: 1, gap: 6, marginBottom: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  cta: {
    minHeight: 420,
    gap: 12,
    padding: 24,
    paddingHorizontal: 22,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#07080C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ctaH: {
    fontFamily: fonts.displayLight,
    fontWeight: '300',
    fontSize: 38,
    lineHeight: 38 * 1.02,
    letterSpacing: em(38, 0.06),
    color: colors.text,
  },
});
