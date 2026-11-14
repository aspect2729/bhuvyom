import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Maps design props (screenH / safeTop / safeBottom / compact) to live device values.
 * Primary design target: iPhone 16 Pro 402×874. Fluid across 360–440 width (Samsung S25 included).
 */
export function useDeviceLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenH = Math.min(1000, Math.max(560, height));
  const compact = screenH < 720;
  const safeTop = insets.top;
  const safeBottom = insets.bottom;

  return {
    width,
    height,
    screenH,
    compact,
    safeTop,
    safeBottom,
    topY: 10 + safeTop,
    tabY: 12 + safeBottom,
    heroPad: 82 + safeTop + (compact ? 0 : 12),
    coordY: 92 + safeBottom,
    endPad: 110 + safeBottom,
    dockY: 88 + safeBottom,
  };
}
