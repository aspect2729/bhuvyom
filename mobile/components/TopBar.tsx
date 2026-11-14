import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassPill } from '@/components/GlassPill';
import { colors, fonts } from '@/theme/tokens';

type Props = {
  variant?: 'sound' | 'sample';
  soundOn?: boolean;
  onToggleSound?: () => void;
};

export function TopBar({ variant = 'sound', soundOn = false, onToggleSound }: Props) {
  const insets = useSafeAreaInsets();
  const top = 10 + insets.top;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top }]}>
      <GlassPill style={styles.pill}>
        <View style={styles.row}>
          <Link href="/" asChild>
            <Pressable style={styles.brand} accessibilityRole="link" accessibilityLabel="Home">
              <Text style={styles.brandText}>BENGALURU FROM ORBIT</Text>
              <View style={styles.dot} />
            </Pressable>
          </Link>

          {variant === 'sample' ? (
            <View style={styles.sample} accessibilityLabel="Sample data">
              <View style={styles.sampleDot} />
              <Text style={styles.sampleText}>SAMPLE</Text>
            </View>
          ) : (
            <Pressable
              onPress={onToggleSound}
              accessibilityRole="button"
              accessibilityState={{ selected: soundOn }}
              accessibilityLabel={soundOn ? 'Sound on' : 'Sound off'}
              style={styles.sound}
            >
              {(soundOn ? [10, 16, 8, 13] : [4, 4, 4, 4]).map((h, i) => (
                <View key={i} style={[styles.bar, { height: h }]} />
              ))}
            </Pressable>
          )}
        </View>
      </GlassPill>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 56,
    zIndex: 30,
  },
  pill: {
    flex: 1,
    borderRadius: 28,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 6,
    gap: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
    minWidth: 0,
  },
  brandText: {
    fontFamily: fonts.display,
    fontSize: 12,
    letterSpacing: 0.18 * 12,
    color: colors.text,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.amber,
  },
  sound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.amber,
  },
  sample: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(233,161,90,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sampleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.amber,
  },
  sampleText: {
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    color: colors.amber,
  },
});
