import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/theme/tokens';

type Props = {
  href: Href;
  children: string;
  underline?: 'solid' | 'gradient';
  underlineWidth?: number;
};

export function CtaLink({ href, children, underline = 'solid', underlineWidth = 52 }: Props) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.row} accessibilityRole="link">
        <View>
          <Text style={styles.label}>{children}</Text>
          {underline === 'gradient' ? (
            <LinearGradient
              colors={[colors.amber, colors.amberDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.rule, { width: underlineWidth }]}
            />
          ) : (
            <View style={[styles.rule, { width: underlineWidth, backgroundColor: colors.amber }]} />
          )}
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
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
    paddingBottom: 7,
  },
  rule: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
  },
});
