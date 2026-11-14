import { Link } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { CtaLink } from '@/components/CtaLink';
import { EarthCanvas } from '@/components/EarthCanvas';
import { TopBar } from '@/components/TopBar';
import { mobileHomeLayout } from '@/lib/earthLayouts';
import { useDeviceLayout } from '@/lib/useDeviceLayout';
import { colors, fonts } from '@/theme/tokens';

/**
 * Mobile Home — port of design-source/mobile/MobileHome.dc.html
 * Pixel values match the export.
 */
export default function HomeScreen() {
  const layout = useDeviceLayout();
  const [soundOn, setSoundOn] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const explorerY = useRef(0);
  const earthLayout = useMemo(
    () =>
      mobileHomeLayout({
        screenH: layout.screenH,
        safeTop: layout.safeTop,
        compact: layout.compact,
      }),
    [layout.screenH, layout.safeTop, layout.compact],
  );

  const scrollToExplorer = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, explorerY.current - 20), animated: true });
  };

  const onExplorerLayout = (e: LayoutChangeEvent) => {
    explorerY.current = e.nativeEvent.layout.y;
  };

  return (
    <View style={styles.root}>
      <TopBar soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)} />

      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={{ paddingBottom: layout.endPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <View style={[styles.hero, { height: layout.screenH }]}>
          <EarthCanvas width={layout.width} height={layout.screenH} layout={earthLayout} />
          <View style={[styles.heroCopy, { paddingTop: layout.heroPad }]} pointerEvents="box-none">
            <Text style={styles.eyebrow}>NASA EARTH DATA</Text>
            <Text style={[styles.h1, { fontSize: layout.compact ? 42 : 50 }]}>
              {'READ\nTHE CITY\nFROM SPACE'}
            </Text>
            <View style={styles.amberRule} />
            {!layout.compact ? (
              <Text style={styles.heroBody}>
                Temperature, rainfall, humidity and wind over Bengaluru — from NASA satellites and
                models.
              </Text>
            ) : null}
            <View style={styles.ctaRow}>
              <Pressable onPress={scrollToExplorer} style={styles.getStarted}>
                <View>
                  <Text style={styles.getStartedLabel}>Get Started</Text>
                  <View style={styles.getStartedRule} />
                </View>
                <Svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                  <Path
                    d="M4 2l4 4-4 4"
                    stroke={colors.amber}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>

              <Link href="/lab" asChild>
                <Pressable style={styles.labPill}>
                  <View style={styles.playDisc}>
                    <Svg width={9} height={11} viewBox="0 0 12 14">
                      <Path d="M2 1.5l9 5.5-9 5.5z" fill="#000" />
                    </Svg>
                  </View>
                  <Text style={styles.labPillText}>Simulation Lab</Text>
                </Pressable>
              </Link>
            </View>
          </View>
          <View style={[styles.coords, { bottom: layout.coordY }]}>
            <Text style={styles.coordText}>12.97° N · 77.59° E</Text>
            <Text style={[styles.coordText, { color: colors.amber }]}>DRAG TO SPIN</Text>
          </View>
        </View>

        {/* LABS */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>TWO LABS</Text>
          <Text style={styles.sectionH2}>{'TEST TODAY.\nSEE TOMORROW.'}</Text>

          <View style={styles.labCards}>
            <LinearGradient
              colors={['#7FE0F0', '#5B8CFF', '#9A86B8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradBorder}
            >
              <View style={styles.labCardInner}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>SIMULATION LAB</Text>
                  <Text style={styles.badge}>SAMPLE</Text>
                </View>
                <Text style={styles.cardBody}>
                  Change trees, roofs, rain and wind — then compare before and after.
                </Text>
                <CtaLink href="/lab" underline="gradient" underlineWidth={58}>
                  Open Simulation Lab
                </CtaLink>
              </View>
            </LinearGradient>

            <LinearGradient
              colors={['#9A86B8', '#E0905A', '#F4C27C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradBorder}
            >
              <View style={styles.labCardInner}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>FUTURE EARTH</Text>
                  <Text style={styles.badge}>ILLUSTRATIVE</Text>
                </View>
                <Text style={styles.cardBody}>
                  How today’s choices and nature’s cycles could change heat, rain, water and air by
                  2100.
                </Text>
                <CtaLink href="/future" underline="gradient" underlineWidth={58}>
                  Explore Future Earth
                </CtaLink>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* EXPLORER anchor target */}
        <View style={[styles.section, { paddingTop: 80 }]} onLayout={onExplorerLayout}>
          <Text style={styles.sectionEyebrow}>THE EXPLORER</Text>
          <Text style={styles.sectionH2}>{'READ THE HEAT,\nSTREET BY STREET'}</Text>
          <Text style={[styles.cardBody, { marginTop: 14 }]}>
            Full explorer grid, layer cards, honest-data chart and sources continue here — matching
            MobileHome.dc.html section-for-section.
          </Text>
        </View>
      </ScrollView>
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
    fontWeight: '300',
    lineHeight: undefined,
    letterSpacing: 0.04 * 50,
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
    maxWidth: 330,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 14 * 1.65,
    color: 'rgba(242,242,242,0.78)',
  },
  ctaRow: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
  },
  getStarted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  getStartedLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
    paddingBottom: 7,
  },
  getStartedRule: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 52,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.amber,
  },
  labPill: {
    height: 44,
    paddingLeft: 6,
    paddingRight: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(242,242,242,0.22)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labPillText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  coords: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coordText: {
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: 0.22 * 11,
    color: 'rgba(242,242,242,0.9)',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
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
  labCards: { marginTop: 28, gap: 14 },
  gradBorder: { borderRadius: 24, padding: 1 },
  labCardInner: {
    borderRadius: 23,
    backgroundColor: colors.surface,
    padding: 22,
    gap: 14,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 0.06 * 22,
    color: colors.text,
  },
  badge: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    color: colors.amber,
  },
  cardBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 13 * 1.6,
    color: colors.text3,
  },
});
