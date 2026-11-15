import { useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { PauseIcon, PlayIcon } from '@/components/Icons';
import { SCEN } from '@/lib/layers';
import { colors, em, fonts, surfaces } from '@/theme/tokens';

export const YEAR_MIN = 1980;
export const YEAR_MAX = 2100;

type Props = {
  year: number;
  now: number;
  onYear: (y: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  scen: (typeof SCEN)[number]['id'];
  onScen: (s: (typeof SCEN)[number]['id']) => void;
  yearKind: string;
  scenNote: string;
};

const pct = (y: number) => ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;

/** Timeline card from Simulate.dc.html: play, year, 1980–2100 slider, scenario picker. */
export function TimelineCard({ year, now, onYear, playing, onTogglePlay, scen, onScen, yearKind, scenNote }: Props) {
  const future = year > now;
  const left = useRef(0);
  const width = useRef(0);
  const track = useRef<ComponentRef<typeof View>>(null);
  const [, force] = useState(0);
  const cb = useRef(onYear);
  cb.current = onYear;

  const setFromPageX = (pageX: number) => {
    if (!width.current) return;
    const t = Math.min(1, Math.max(0, (pageX - left.current) / width.current));
    cb.current(Math.round(YEAR_MIN + t * (YEAR_MAX - YEAR_MIN)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        track.current?.measureInWindow((x, _y, w) => {
          left.current = x;
          width.current = w;
          setFromPageX(pageX);
        });
      },
      onPanResponderMove: (e) => setFromPageX(e.nativeEvent.pageX),
    }),
  ).current;

  return (
    <View style={styles.card} accessibilityLabel="Timeline">
      <View style={styles.top}>
        <Pressable
          onPress={onTogglePlay}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause timeline' : 'Play timeline'}
          style={styles.play}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.year}>{year}</Text>
          <Text style={styles.kind}>{yearKind}</Text>
        </View>
      </View>

      <View
        ref={track}
        onLayout={() => force((n) => n + 1)}
        {...pan.panHandlers}
        style={styles.railHit}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Year"
        accessibilityValue={{ min: YEAR_MIN, max: YEAR_MAX, now: year }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onYear(Math.max(YEAR_MIN, Math.min(YEAR_MAX, year + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
      >
        <View style={styles.track} />
        <View style={[styles.fill, { width: `${pct(year)}%` }]} />
        <View style={[styles.nowTick, { left: `${pct(now)}%` }]} />
        <View style={[styles.thumb, { left: `${pct(year)}%` }]} />
      </View>

      <View style={styles.marks}>
        <Text style={styles.mark}>1980 · RECORD</Text>
        <Text style={[styles.mark, { color: colors.cyan }]}>LIVE</Text>
        <Text style={styles.mark}>2050</Text>
        <Text style={styles.mark}>2100</Text>
      </View>

      <View style={[styles.scenRow, { opacity: future ? 1 : 0.45 }]} accessibilityRole="radiogroup">
        {SCEN.map((s) => {
          const on = s.id === scen;
          return (
            <Pressable
              key={s.id}
              onPress={() => onScen(s.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !future }}
              style={[styles.scen, on && styles.scenOn]}
            >
              <Text style={{ fontFamily: fonts.body, fontSize: 12, color: on ? colors.text : colors.text2 }}>{s.label}</Text>
              <Text style={styles.scenCode}>{s.code}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.scenNote}>{scenNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 18,
    borderRadius: 22,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  play: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  year: { fontFamily: fonts.displayLight, fontWeight: '300', fontSize: 34, lineHeight: 34, color: colors.text },
  kind: { marginTop: 4, fontFamily: fonts.body, fontSize: 12, color: colors.text4 },
  railHit: { height: 28, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.cyan },
  nowTick: { position: 'absolute', width: 2, height: 12, marginLeft: -1, backgroundColor: colors.amber },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: colors.cyan,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  marks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  mark: { fontFamily: fonts.display, fontSize: 10, letterSpacing: em(10, 0.14), color: colors.text5 },
  scenRow: { flexDirection: 'row', gap: 6 },
  scen: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  scenOn: { backgroundColor: 'rgba(233,161,90,0.14)', borderColor: 'rgba(233,161,90,0.6)' },
  scenCode: { fontFamily: fonts.display, fontSize: 10, letterSpacing: em(10, 0.08), color: colors.text4 },
  scenNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.5, color: colors.text5 },
});
