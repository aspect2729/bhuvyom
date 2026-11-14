import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { EarthGlobe } from '@/lib/earthGlobe';
import type { LayoutFn } from '@/lib/earthLayouts';

const TEXTURES = {
  day: require('../assets/textures/earth_day_4k.jpg'),
  lights: require('../assets/textures/earth_lights_4k.jpg'),
  clouds: require('../assets/textures/earth_clouds_4k.jpg'),
  ocean: require('../assets/textures/earth_ocean_mask_4k.jpg'),
  bump: require('../assets/textures/earth_bump_4k.jpg'),
};

type Props = {
  width: number;
  height: number;
  layout: LayoutFn;
  style?: StyleProp<ViewStyle>;
  /** When false, vertical pans fall through to the parent ScrollView. */
  interactive?: boolean;
};

/**
 * Mobile Earth hero — design package WebGL2 ray-traced sphere via expo-gl.
 * Horizontal drag spins; vertical drag stays with the ScrollView.
 */
export function EarthCanvas({ width, height, layout, style, interactive = true }: Props) {
  const globeRef = useRef<EarthGlobe | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const reduceMotion = useRef(false);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion.current = v;
      globeRef.current?.setSpin(v ? 0 : 1);
    });
    sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      reduceMotion.current = v;
      globeRef.current?.setSpin(v ? 0 : 1);
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    globeRef.current?.setSize(width, height);
    globeRef.current?.setLayout((cw, ch) => layoutRef.current(cw, ch));
  }, [width, height, layout]);

  useEffect(() => {
    return () => {
      globeRef.current?.destroy();
      globeRef.current = null;
    };
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          interactive && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6,
        onPanResponderGrant: (e) => {
          globeRef.current?.beginDrag(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => {
          globeRef.current?.moveDrag(e.nativeEvent.locationX);
        },
        onPanResponderRelease: () => globeRef.current?.endDrag(),
        onPanResponderTerminate: () => globeRef.current?.endDrag(),
      }),
    [interactive],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    try {
      globeRef.current?.destroy();
      globeRef.current = new EarthGlobe(gl, {
        textures: TEXTURES,
        layout: (cw, ch) => layoutRef.current(cw, ch),
        cssWidth: sizeRef.current.width,
        cssHeight: sizeRef.current.height,
        spin: reduceMotion.current ? 0 : 1,
        startLon: 1.3542 + 0.5,
        atmosphere: [0.36, 0.56, 0.95],
        markerColor: [0.92, 0.63, 0.35],
      });
    } catch (e) {
      console.warn('Earth WebGL unavailable', e);
    }
  };

  const onLayout = (_e: LayoutChangeEvent) => {
    // size comes from props (hero uses measured window); keep for safety
  };

  if (width < 1 || height < 1) return null;

  return (
    <View
      style={[styles.host, { width, height }, style]}
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel="Rotating Earth rendered from NASA Blue Marble, Black Marble and cloud imagery"
      {...(interactive ? pan.panHandlers : null)}
    >
      <GLView
        style={StyleSheet.absoluteFill}
        onContextCreate={onContextCreate}
        msaaSamples={0}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#000',
  },
});
