import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  AlphaType,
  Canvas,
  Circle,
  ColorType,
  Group,
  Image as SkiaImage,
  Skia,
} from '@shopify/react-native-skia';
import Svg, { Circle as SvgCircle, G, Path, Text as SvgText } from 'react-native-svg';
import { gridValues, hasAnyValue, type GeoFrame, type Region } from '@/lib/geo';
import { basemapTiles } from '@/lib/googleBasemap';
import {
  FIELD_OPACITY,
  buildRaster,
  fitRange,
  gridAt,
  inBounds,
  latLonFromFrame,
  rasterToPixels,
} from '@/lib/interpolate';
import { layerColor, type SimLayer } from '@/lib/layers';
import { ensureOutlines } from '@/lib/outlines';
import { nearestPlace } from '@/lib/places';
import { colors, fonts } from '@/theme/tokens';

ensureOutlines();

export { gridShape } from '@/lib/geo';

export type Basemap = 'day' | 'night';

export type Probe = {
  lat: number;
  lon: number;
  value: number | null;
  place: string | null;
};

type Props = {
  region: Region;
  frame: GeoFrame;
  layer: SimLayer;
  values: (number | null)[];
  basemap?: Basemap;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  veilMessage?: string;
  shift?: number;
  scale?: number;
  zoom?: number;
  showPlaces?: boolean;
  showPin?: boolean;
  pinLabel?: string | null;
  children?: ReactNode;
  stroke?: number;
  veilSize?: number;
  lo?: number;
  hi?: number;
  interactive?: boolean;
  onProbe?: (p: Probe | null) => void;
  /** Cap map height on short phones; width scales to keep the geo frame aspect. */
  maxHeight?: number;
  onRetry?: () => void;
};

/**
 * Map stack matching the URANUS site: basemap imagery → bicubic colour field →
 * layer effects (isotherms / thermal dots) → outline → tap probe.
 */
export function LiveHeatMap({
  region,
  frame,
  layer,
  values,
  basemap = 'day',
  loading,
  error,
  emptyMessage = 'No live coverage for this layer',
  veilMessage,
  shift = 0,
  scale = 1,
  zoom = 1,
  showPlaces = false,
  showPin = true,
  pinLabel,
  children,
  stroke = 1.2,
  veilSize = 12,
  lo: loProp,
  hi: hiProp,
  interactive = true,
  onProbe,
  maxHeight,
  onRetry,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const grid = gridValues(region, values);
  const has = hasAnyValue(grid);
  const fitted = useMemo(() => fitRange(layer, grid, layer.sys === 'temp' ? 3.5 : 0), [layer, grid]);
  const lo = loProp ?? fitted.lo;
  const hi = hiProp ?? fitted.hi;
  const fieldA = FIELD_OPACITY[layer.key];

  const raster = useMemo(() => {
    if (loading || error || veilMessage || !has) return null;
    return buildRaster(grid, region, shift, scale);
  }, [grid, region, shift, scale, loading, error, veilMessage, has]);

  const skImage = useMemo(() => {
    if (!raster || fieldA <= 0) return null;
    try {
      const pixels = rasterToPixels(raster.data, raster.rw, raster.rh, lo, hi, layer.stops, fieldA);
      return Skia.Image.MakeImage(
        { width: raster.rw, height: raster.rh, alphaType: AlphaType.Unpremul, colorType: ColorType.RGBA_8888 },
        Skia.Data.fromBytes(pixels),
        raster.rw * 4,
      );
    } catch {
      return null;
    }
  }, [raster, lo, hi, layer.stops, fieldA]);

  const dots = useMemo(() => {
    if (layer.key !== 'surf' || !raster) return [] as { x: number; y: number; r: number; c: string }[];
    const { data, rw, rh } = raster;
    const out: { x: number; y: number; r: number; c: string }[] = [];
    const step = 5;
    const L = { ...layer, lo, hi };
    for (let r = 0; r < rh; r += step) {
      for (let c = 0; c < rw; c += step) {
        const v = data[r * rw + c];
        if (!Number.isFinite(v)) continue;
        const t = Math.max(0, Math.min(1, (v! - lo) / (hi - lo || 1)));
        out.push({
          x: ((c + 0.5) / rw) * frame.vw,
          y: ((r + 0.5) / rh) * frame.vh,
          r: 0.9 + 3.1 * t,
          c: layerColor(v, L),
        });
      }
    }
    return out;
  }, [layer, raster, lo, hi, frame.vw, frame.vh]);

  const [probe, setProbe] = useState<Probe | null>(null);
  const [outerW, setOuterW] = useState(0);
  const [layout, setLayout] = useState({ w: 1, h: 1 });

  const veil = veilMessage
    ? veilMessage
    : loading
      ? 'Loading live data…'
      : error
        ? 'Live data unavailable'
        : !has
          ? emptyMessage
          : null;

  const { vw, vh } = frame;
  const aspect = vw / vh;
  // Fit inside the parent width; optionally shrink so short phones keep the readout in view.
  const parentW = outerW > 1 ? outerW : Math.max(1, winW - 32);
  const naturalH = parentW / aspect;
  const cappedH = maxHeight != null ? Math.min(naturalH, maxHeight) : naturalH;
  const mapW = Math.round(cappedH * aspect);
  const mapH = Math.round(cappedH);

  const cx = vw / 2;
  const cy = vh / 2;
  const tx = cx * (1 - zoom);
  const ty = cy * (1 - zoom);
  const [pinFx, pinFy] = frame.pin;
  const pinX = cx + (pinFx - cx) * zoom;
  const pinY = cy + (pinFy - cy) * zoom;
  const day = basemap === 'day';
  const tiles = useMemo(() => basemapTiles(region, frame, basemap), [region, frame, basemap]);
  const places = useMemo(() => {
    if (!showPlaces) return [] as typeof frame.places;
    const major =
      region === 'ka'
        ? new Set(['Belagavi', 'Hubballi', 'Kalaburagi', 'Mangaluru', 'Mysuru'])
        : new Set(['Majestic', 'Whitefield', 'Yelahanka', 'Electronic City']);
    return frame.places.filter((p) => major.has(p.n));
  }, [showPlaces, region, frame.places]);

  const sx = layout.w / vw;
  const sy = layout.h / vh;

  const onPress = (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (!interactive || !has || veil) {
      setProbe(null);
      onProbe?.(null);
      return;
    }
    const { locationX, locationY } = evt.nativeEvent;
    const fx = (locationX / layout.w) * vw;
    const fy = (locationY / layout.h) * vh;
    const x = (fx - tx) / zoom;
    const y = (fy - ty) / zoom;
    const { lat, lon } = latLonFromFrame(region, frame, x, y);
    if (!inBounds(region, lat, lon)) {
      setProbe(null);
      onProbe?.(null);
      return;
    }
    const raw = gridAt(grid, region, lat, lon);
    const value = Number.isFinite(raw) ? raw * scale + shift : null;
    const place = nearestPlace(region, lat, lon);
    const next: Probe = { lat, lon, value, place: place?.name ?? null };
    setProbe(next);
    onProbe?.(next);
  };

  useEffect(() => {
    setProbe(null);
    onProbe?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, layer.key]);

  return (
    <View
      style={{ width: '100%', alignItems: 'center', backgroundColor: '#070B12' }}
      onLayout={(e) => setOuterW(e.nativeEvent.layout.width)}
    >
      <View
        style={{ width: mapW, height: mapH, overflow: 'hidden', backgroundColor: '#070B12' }}
        onLayout={(e) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        {/* Google Earth satellite (day) / NASA Black Marble (night) — tiled to the geo frame */}
        <View style={[StyleSheet.absoluteFill, { opacity: day ? 0.95 : 0.55 }]} pointerEvents="none">
          {tiles.map((t) => (
            <Image
              key={t.key}
              source={{ uri: t.uri }}
              style={{
                position: 'absolute',
                left: (tx + t.x * zoom) * sx,
                top: (ty + t.y * zoom) * sy,
                width: Math.max(1, t.w * zoom * sx),
                height: Math.max(1, t.h * zoom * sy),
              }}
              resizeMode="cover"
            />
          ))}
        </View>
        {!day ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,4,0.45)' }]} /> : null}

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Canvas style={{ flex: 1 }}>
            <Group
              transform={[
                { translateX: tx * sx },
                { translateY: ty * sy },
                { scaleX: zoom },
                { scaleY: zoom },
              ]}
            >
              {skImage ? <SkiaImage image={skImage} x={0} y={0} width={vw * sx} height={vh * sy} fit="fill" /> : null}
              {dots.map((d, i) => (
                <Circle key={i} cx={d.x * sx} cy={d.y * sy} r={d.r * sx} color={d.c} opacity={0.9} />
              ))}
            </Group>
          </Canvas>
        </View>

        <Svg width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`} style={StyleSheet.absoluteFill} pointerEvents="none">
          <G transform={`translate(${tx} ${ty}) scale(${zoom})`}>
            <Path d={frame.d} fill="none" stroke="rgba(242,242,242,0.85)" strokeWidth={stroke / zoom} strokeLinejoin="round" />
            {places.map((p) => (
              <G key={p.n}>
                <SvgCircle cx={p.x} cy={p.y} r={2 / zoom} fill="rgba(242,242,242,0.7)" />
                <SvgText
                  x={p.x + 5 / zoom}
                  y={p.y + 3 / zoom}
                  fontSize={9 / zoom}
                  fontFamily={fonts.display}
                  fill="rgba(242,242,242,0.72)"
                  stroke="#000"
                  strokeWidth={0.35 / zoom}
                >
                  {p.n}
                </SvgText>
              </G>
            ))}
            {showPin && !probe ? (
              <G>
                <SvgCircle
                  cx={pinFx}
                  cy={pinFy}
                  r={(frame.vw > 200 ? 12 : 7) / zoom}
                  fill="none"
                  stroke={colors.amber}
                  strokeWidth={1.2 / zoom}
                  opacity={0.85}
                />
                <SvgCircle cx={pinFx} cy={pinFy} r={(frame.vw > 200 ? 3 : 2.5) / zoom} fill={colors.amber} />
              </G>
            ) : null}
          </G>
        </Svg>

        {probe ? <ProbeMark frame={frame} probe={probe} zoom={zoom} tx={tx} ty={ty} vw={vw} vh={vh} /> : null}
      </Pressable>

      {showPin && pinLabel && !probe ? (
        <View pointerEvents="none" style={[styles.pinBubble, { left: `${(pinX / vw) * 100}%`, top: `${(pinY / vh) * 100}%` }]}>
          <Text style={styles.pinText}>{pinLabel}</Text>
        </View>
      ) : null}

      {probe?.value != null ? (
        <View pointerEvents="none" style={styles.tipTop}>
          <Text style={styles.tipTitle}>{probe.place ? `NEAR ${probe.place.toUpperCase()}` : 'MAP POINT'}</Text>
          <Text style={styles.tipVal}>
            {probe.value.toFixed(layer.dec)} {layer.unit}
          </Text>
          <Text style={styles.tipSub}>
            {probe.lat.toFixed(2)}° N · {probe.lon.toFixed(2)}° E
          </Text>
        </View>
      ) : null}

      {veil ? (
        <View style={styles.veil}>
          <Text style={[styles.veilText, { fontSize: veilSize, letterSpacing: veilSize * 0.16 }]}>{veil.toUpperCase()}</Text>
          {error && !veilMessage ? <Text style={styles.veilSub}>{error}</Text> : null}
          {onRetry && (error || (!loading && !has)) ? (
            <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
      </View>
    </View>
  );
}

function ProbeMark({
  frame,
  probe,
  zoom,
  tx,
  ty,
  vw,
  vh,
}: {
  frame: GeoFrame;
  probe: Probe;
  zoom: number;
  tx: number;
  ty: number;
  vw: number;
  vh: number;
}) {
  const x = frame.proj.ax * probe.lon + frame.proj.bx;
  const y = frame.proj.ay * probe.lat + frame.proj.by;
  const sx = ((tx + x * zoom) / vw) * 100;
  const sy = ((ty + y * zoom) / vh) * 100;
  return (
    <View pointerEvents="none" style={[styles.cross, { left: `${sx}%`, top: `${sy}%` }]}>
      <View style={styles.crossH} />
      <View style={styles.crossV} />
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(5,5,6,0.55)',
  },
  veilText: { fontFamily: fonts.display, color: colors.text2, textAlign: 'center', lineHeight: 18 },
  veilSub: { marginTop: 8, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.text4, textAlign: 'center' },
  retry: {
    marginTop: 14,
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(127,224,240,0.45)',
    backgroundColor: 'rgba(127,224,240,0.12)',
  },
  retryText: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 1.8, color: colors.cyan },
  pinBubble: {
    position: 'absolute',
    marginLeft: 20,
    marginTop: -30,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(5,5,6,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pinText: { fontFamily: fonts.display, fontSize: 12, color: colors.text },
  tipTop: {
    position: 'absolute',
    left: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(5,5,6,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    maxWidth: '70%',
  },
  tipTitle: { fontFamily: fonts.display, fontSize: 10, letterSpacing: 1.5, color: colors.text4 },
  tipVal: { marginTop: 2, fontFamily: fonts.display, fontSize: 18, color: colors.text },
  tipSub: { marginTop: 2, fontFamily: fonts.body, fontSize: 11, color: colors.text3 },
  cross: { position: 'absolute', width: 18, height: 18, marginLeft: -9, marginTop: -9 },
  crossH: { position: 'absolute', left: 0, right: 0, top: 8, height: 2, backgroundColor: colors.amber },
  crossV: { position: 'absolute', top: 0, bottom: 0, left: 8, width: 2, backgroundColor: colors.amber },
});
