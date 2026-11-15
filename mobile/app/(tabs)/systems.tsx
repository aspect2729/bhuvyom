import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, PathIcon } from '@/components/Icons';
import { Eyebrow, H1, P, Screen, SectionLabel, Tag, WhiteButton } from '@/components/ui';
import { SYSTEMS, TOTAL_VARS, splitProbe } from '@/lib/systems';
import { colors, cssAngle, em, fonts, surfaces } from '@/theme/tokens';

/** Icon paths — Systems.dc.html ICONS. */
const ICONS = [
  'M10 13.5V4a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z M12 9v6',
  'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8',
  'M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  'M5 19c0-8 6-14 15-14 0 9-6 15-14 15 M5 19l7-7',
  'M2 20l7-11 4 6 3-4 6 9z',
  'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 1 4 3 4 0-4-1-7 0-10z',
  'M12 2v20 M4.9 6.5l14.2 11 M4.9 17.5l14.2-11 M9 4l3 2 3-2 M9 20l3-2 3 2',
  'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2',
  'M7 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M17 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M9 9l2 5 M15 9l-2 5',
  'M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5',
  'M2 12h4l2-5 3 10 3-8 2 3h6',
  'M3 21h18 M5 21V9l5-3v15 M10 21V4l6 3v14 M16 21v-9l4 2v7',
  'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 8v4l3 2 M4 12H2 M22 12h-2 M12 2v2 M12 20v2',
  'M3 17l5-5 4 3 8-8 M15 7h5v5',
];

const WARM = [0, 2, 7, 9, 13, 15];
const title = (name: string) => name.replace(/^\d+\.\s*/, '');
const DETAIL_GRAD = cssAngle(150);

/** Systems — Systems.dc.html (list → detail with prev / next). Values are catalogue references. */
export default function SystemsScreen() {
  const router = useRouter();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [open, setOpen] = useState(-1);
  const n = SYSTEMS.length;

  const show = (i: number) => {
    setOpen(i);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  if (open < 0) {
    return (
      <Screen ref={scroll} contentStyle={{ gap: 20, paddingHorizontal: 20, paddingTop: 4 }}>
        <View style={{ gap: 10 }}>
          <Eyebrow>VISUALIZATION ENGINE</Eyebrow>
          <H1>{'16 SYSTEMS.\nCOMPLETE LIST.'}</H1>
          <P>
            Pick any environmental category to inspect its variables, sensor networks, units, and
            localized readouts for Bengaluru and Karnataka.
          </P>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={[styles.pill, { backgroundColor: 'rgba(127,224,240,0.10)', borderColor: 'rgba(127,224,240,0.35)', color: colors.cyan }]}>
            16 systems
          </Text>
          <Text style={[styles.pill, { backgroundColor: surfaces.cardStrong, borderColor: surfaces.borderStrong, color: colors.text2 }]}>
            {TOTAL_VARS} variables
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          {SYSTEMS.map((s, i) => {
            const warm = WARM.includes(i);
            return (
              <Pressable key={s.id} onPress={() => show(i)} accessibilityRole="button" style={styles.row}>
                <View style={[styles.icon, { backgroundColor: warm ? 'rgba(233,161,90,0.14)' : 'rgba(127,224,240,0.10)' }]}>
                  <PathIcon d={ICONS[i]} size={22} strokeWidth={1.7} color={warm ? colors.amber : colors.cyan} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 10, letterSpacing: em(10, 0.22), color: colors.text5 }}>
                    {s.eyebrow} · {s.vars.length} VARS
                  </Text>
                  <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{title(s.name)}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>
                    {splitProbe(s.probe)[0]}
                  </Text>
                </View>
                <ChevronRight color={colors.text5} />
              </Pressable>
            );
          })}
        </View>
      </Screen>
    );
  }

  const cur = SYSTEMS[open];
  const [probeMain, probeSub] = splitProbe(cur.probe);
  const prev = SYSTEMS[(open + n - 1) % n];
  const next = SYSTEMS[(open + 1) % n];

  return (
    <Screen ref={scroll} contentStyle={{ gap: 18, paddingHorizontal: 20 }}>
      <Pressable onPress={() => show(-1)} accessibilityRole="button" style={styles.backBtn}>
        <ChevronLeft color={colors.text2} />
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text2 }}>All 16 systems</Text>
      </Pressable>

      <View style={{ gap: 10 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: em(12, 0.24), color: colors.cyan }}>{cur.eyebrow}</Text>
        <H1 size={32} style={{ lineHeight: 32 * 1.08, letterSpacing: em(32, 0.04) }}>
          {title(cur.name)}
        </H1>
      </View>

      <View style={styles.probe}>
        <LinearGradient colors={['rgba(91,140,255,0.20)', 'rgba(255,255,255,0.03)']} {...DETAIL_GRAD} style={StyleSheet.absoluteFill} />
        <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.24), color: colors.text4 }}>BENGALURU LOCAL PROBE</Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, letterSpacing: em(30, 0.02), color: colors.text }}>{probeMain}</Text>
        {probeSub ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text2 }}>{probeSub}</Text> : null}
        <Text style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 10, letterSpacing: em(10, 0.22), color: colors.text5 }}>
          REFERENCE VALUE
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabel>VARIABLES IN THIS SYSTEM</SectionLabel>
        <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.cyan }}>{cur.vars.length}</Text>
      </View>
      <View style={{ gap: 8 }}>
        {cur.vars.map((v) => (
          <View key={v.name} style={styles.varCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>{v.name}</Text>
              <Text style={{ maxWidth: 150, fontFamily: fonts.displayMedium, fontSize: 14, color: colors.amber, textAlign: 'right' }}>
                {v.val}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 12 * 1.5, color: colors.text4 }}>{v.desc}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Tag>{v.src}</Tag>
              <Tag color={colors.text2} bg="rgba(255,255,255,0.05)">
                {v.unit}
              </Tag>
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => show((open + n - 1) % n)} accessibilityRole="button" style={[styles.pn, { alignItems: 'flex-start' }]}>
          <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>← Previous</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text }}>{title(prev.name)}</Text>
        </Pressable>
        <Pressable onPress={() => show((open + 1) % n)} accessibilityRole="button" style={[styles.pn, { alignItems: 'flex-end' }]}>
          <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>Next →</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text, textAlign: 'right' }}>{title(next.name)}</Text>
        </Pressable>
      </View>
      <WhiteButton label="SIMULATE THIS SYSTEM" onPress={() => router.navigate('/simulate')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 78,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    height: 40,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
  },
  probe: {
    gap: 6,
    padding: 18,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(127,224,240,0.25)',
  },
  varCard: {
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  pn: {
    flex: 1,
    minHeight: 64,
    gap: 2,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: surfaces.cardStrong,
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
  },
});
