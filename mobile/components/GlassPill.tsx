import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { glass } from '@/theme/tokens';

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

/** Shared mobile glass shell — exact gradient / border from Mobile*.dc.html */
export function GlassPill({ children, style, intensity = 70 }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[...glass.colors]}
        locations={[...glass.locations]}
        style={StyleSheet.absoluteFill}
      />
      {children != null ? <View style={styles.inner}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: glass.border,
    // inset highlight + drop shadow approximated for RN
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  inner: {
    flex: 1,
  },
});
