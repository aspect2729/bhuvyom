import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { CalendarIcon } from '@/components/Icons';
import { LiveHeatMap, type Basemap } from '@/components/LiveHeatMap';
import { Eyebrow, H1, LayerChips, P, RampBar, Screen, SectionLabel, Seg } from '@/components/ui';
import { api, type SimRecord } from '@/lib/api';
import { CMP_FRAME, focalValue, gridValues, type Region } from '@/lib/geo';
import { FX_NOTE, fitRange, niceStep } from '@/lib/interpolate';
import { LAYERS, fmtVal, layerByKey, layerColor, signed, type SimLayer } from '@/lib/layers';
import { useApi } from '@/lib/useApi';
import { pastDateYearsAgo, weather } from '@/lib/weather';
import { colors, em, fonts, surfaces } from '@/theme/tokens';

type Mode = 'split' | 'all';

const AGOS: [number, string][] = [
  [1, '1 year ago'],
  [5, '5 years'],
  [10, '10 years'],
  [20, '20 years'],
  [40, '40 years'],
];

type Tile = { n: number; name: string; k?: SimLayer['key']; need?: string; fwd?: boolean };

/** 16-system tiles — Compare.dc.html SYS16. */
const SYS16: Tile[] = [
  { n: 1, name: 'Temperature', k: 'air' },
  { n: 2, name: 'Precipitation & Water', k: 'rain' },
  { n: 3, name: 'Extreme Weather', need: 'Needs IMD / NASA event records.' },
  { n: 4, name: 'Atmospheric Activity', k: 'rh' },
  { n: 5, name: 'Ocean Systems', need: 'Needs Argo floats · OSCAR · Sentinel-6.' },
  { n: 6, name: 'Vegetation & Greenery', need: 'Needs MODIS / Sentinel-2 NDVI.' },
  { n: 7, name: 'Land & Soil', need: 'Needs SRTM · ESA WorldCover.' },
  { n: 8, name: 'Wildfires', need: 'Needs VIIRS 375 m active fires.' },
  { n: 9, name: 'Cryosphere', need: 'Needs MODIS snow and glacier products.' },
  { n: 10, name: 'Solar & Space Activity', need: 'Needs NOAA SWPC · GOES.' },
  { n: 11, name: 'Air Quality', k: 'pm25' },
  { n: 12, name: 'Carbon & Ecosystems', need: 'Needs MODIS GPP / NPP · OCO-2.' },
  { n: 13, name: 'Geological Activity', need: 'Needs USGS · GSI seismic catalogues.' },
  { n: 14, name: 'Human Impact', need: 'Needs VIIRS night lights · WorldPop.' },
  { n: 15, name: 'Derived Intelligence', need: 'Will be built from the layers above, once more of them are connected.' },
  { n: 16, name: 'Predictions & Simulations', fwd: true },
];

/** Annual record at Bengaluru for one layer/year (null = no record). */
function recordFor(layer: SimLayer, year: number, rec: SimRecord | null): number | null {
  if (!layer.record || !rec) return null;
  const v = rec[layer.record]?.[String(year)];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

type Delta = { text: string; word: string; col: string; bg: string };

/** Day-vs-day: all six layers share the same window, including rainfall (30-day totals). */
function deltaForDay(l: SimLayer, past: number | null, now: number | null, ok: boolean): Delta {
  const none = { col: colors.text4, bg: 'rgba(255,255,255,0.04)' };
  if (past == null) return { ...none, text: 'No record', word: ok ? 'for this day' : 'to compare' };
  if (now == null) return { ...none, text: 'No record', word: 'No valid live value' };
  const d = now - past;
  const up = d > 0;
  return {
    text: `${signed(d, l.dec)} ${l.unit}`,
    word: `${up ? l.word[0] : l.word[1]} than then`,
    col: up ? colors.amber : colors.cyan,
    bg: up ? 'rgba(233,161,90,0.16)' : 'rgba(127,224,240,0.14)',
  };
}

/** Compare — Compare.dc.html. Now = Open-Meteo live; past = same IST hour N years ago (ERA5). */
export default function CompareScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('split');
  const [layerKey, setLayerKey] = useState<SimLayer['key']>('air');
  const [region, setRegion] = useState<Region>('ka');
  const [base, setBase] = useState<Basemap>('day');
  const [ago, setAgo] = useState(10);

  const layer = layerByKey(layerKey);
  const live = useApi(`omLive:${region}`, (opts) => weather.live(region, opts), 20 * 60 * 1000);
  const pastDay = useApi(
    `omPast:${region}:${ago}`,
    () => weather.pastDay(region, ago),
    Number.POSITIVE_INFINITY,
  );
  const rec = useApi('omRecord', () => weather.record(), 365 * 24 * 60 * 60 * 1000);
  const record = rec.data;

  const nowYear = new Date().getUTCFullYear();
  const thenYear = nowYear - ago;
  const pastIso = pastDateYearsAgo(ago);
  const values = live.data?.values[layer.key] ?? [];
  const pastValues = pastDay.data?.values[layer.key] ?? [];
  const sharedRange = useMemo(() => {
    const a = gridValues(region, values);
    const b = gridValues(region, pastValues);
    return fitRange(layer, [...a, ...b], 0);
  }, [layer, region, values, pastValues]);
  const fxNote = FX_NOTE[layer.key](niceStep(sharedRange.lo, sharedRange.hi));
  const nowOf = (l: SimLayer) => focalValue(region, live.data?.values[l.key]);
  const pastOf = (l: SimLayer) => focalValue(region, pastDay.data?.values[l.key]);
  const nowV = nowOf(layer);
  // Prefer same-hour past-day grid; annual record remains for layers/years without past coverage.
  const pastFromDay = pastOf(layer);
  const pastFromRec = recordFor(layer, thenYear, record);
  const pastV =
    pastFromDay != null
      ? pastFromDay
      : layer.key === 'pm25' && pastIso < '2022-09-01'
        ? null
        : pastFromRec;
  const dl = deltaForDay(layer, pastV, nowV, !pastDay.loading && !pastDay.error);
  const text = (l: SimLayer, v: number | null) => (v == null ? 'No record' : `${fmtVal(v, l.dec)} ${l.unit}`);

  const pastNote = pastDay.error
    ? `Past day unavailable — ${pastDay.error}`
    : pastDay.loading
      ? 'Loading past day…'
      : layer.key === 'pm25' && pastIso < '2022-09-01'
        ? 'No PM2.5 record before September 2022'
        : pastV == null
          ? `No record for ${pastIso}`
          : `${pastIso} · ${pastDay.data?.time ?? `${thenYear}`} · ${pastDay.data?.source ?? 'ERA5'}`;

  const strip = region === 'ka' ? 'Karnataka · 191,791 km²' : 'Bengaluru Urban · 12.7–13.2° N';

  return (
    <Screen
      refreshing={live.refreshing || pastDay.refreshing || rec.refreshing}
      onRefresh={() => {
        live.reload();
        pastDay.reload();
        rec.reload();
      }}
      contentStyle={{ gap: 18, paddingHorizontal: 16, paddingTop: 4 }}
    >
      <View style={{ gap: 10, paddingHorizontal: 4 }}>
        <Eyebrow>COMPARE</Eyebrow>
        <H1>{'THEN\nAGAINST NOW'}</H1>
        <P>
          The same place on the same colour scale, pulled apart in time. Pick a day in the past and
          set it beside the live conditions.
        </P>
      </View>

      <View style={{ flexDirection: 'row' }}>
        <Seg<Mode>
          options={[
            { id: 'split', label: 'Split view' },
            { id: 'all', label: 'All 16 systems' },
          ]}
          value={mode}
          onChange={setMode}
          height={40}
          radius={14}
          outerRadius={18}
          fontSize={13}
        />
      </View>

      <LayerChips
        items={LAYERS.map((l) => ({ key: l.key, label: l.short, stops: l.stops }))}
        value={layerKey}
        onChange={(k) => setLayerKey(k as SimLayer['key'])}
        height={38}
        fontSize={12}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Seg<Region>
          options={[
            { id: 'ka', label: 'Karnataka' },
            { id: 'blr', label: 'Bengaluru' },
          ]}
          value={region}
          onChange={setRegion}
        />
        <Seg<Basemap>
          flex={false}
          options={[
            { id: 'day', label: 'Day' },
            { id: 'night', label: 'Night' },
          ]}
          value={base}
          onChange={setBase}
        />
      </View>

      {/* Past date */}
      <View style={styles.dateCard} accessibilityLabel="Left map date">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>PAST DATE</Text>
          <View style={styles.dateBtn}>
            <CalendarIcon color={colors.text} />
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text }}>{thenYear}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {AGOS.map(([n, label]) => {
            const on = n === ago;
            return (
              <Pressable
                key={n}
                onPress={() => setAgo(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.ago, on && { backgroundColor: colors.text, borderColor: colors.text }]}
              >
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: on ? colors.bg : colors.text2 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.5, color: colors.text5 }}>
          Past map is the same IST hour on this calendar day {ago === 1 ? 'one year' : `${ago} years`} ago (ERA5). A single day against another day is weather, not climate.
        </Text>
      </View>

      {mode === 'split' ? (
        <View style={{ gap: 12 }} accessibilityLabel="Split view">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live.error ? colors.amber : colors.cyan }} />
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text2 }}>{strip}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pane
              tag="PAST"
              tagColor={colors.text2}
              border={surfaces.borderStrong}
              when={pastNote}
              value={text(layer, pastV)}
              map={
                <LiveHeatMap
                  region={region}
                  frame={CMP_FRAME[region]}
                  layer={layer}
                  values={pastValues}
                  basemap={base}
                  stroke={1}
                  veilSize={8}
                  loading={pastDay.loading}
                  error={pastDay.error}
                  lo={sharedRange.lo}
                  hi={sharedRange.hi}
                  showPin={false}
                  emptyMessage={
                    layer.key === 'pm25' && pastIso < '2022-09-01'
                      ? 'No PM2.5 record before September 2022'
                      : 'No past coverage'
                  }
                />
              }
            />
            <Pane
              tag="NOW"
              tagColor={colors.cyan}
              border="rgba(127,224,240,0.35)"
              when={live.data ? `Live · ${live.data.time ?? live.data.valid_time ?? 'now'}` : live.error ? 'Live data unavailable' : 'Loading…'}
              value={text(layer, nowV)}
              map={
                <LiveHeatMap
                  region={region}
                  frame={CMP_FRAME[region]}
                  layer={layer}
                  values={values}
                  basemap={base}
                  stroke={1}
                  veilSize={8}
                  loading={live.loading}
                  error={live.error}
                  lo={sharedRange.lo}
                  hi={sharedRange.hi}
                  showPin={false}
                  emptyMessage="No live coverage"
                />
              }
            />
          </View>

          <View style={styles.deltaCard}>
            <LinearGradient
              colors={[dl.bg, 'rgba(255,255,255,0.02)']}
              locations={[0, 0.7]}
              start={{ x: 0, y: 0.3 }}
              end={{ x: 1, y: 0.7 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>WHAT CHANGED</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: fonts.displayLight, fontWeight: '300', fontSize: 32, color: dl.col }}>{dl.text}</Text>
              <Text style={{ flexShrink: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text2 }}>{dl.word}</Text>
            </View>
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>
              Bengaluru, {pastIso} → today · weather vs weather
            </Text>
          </View>

          <View style={{ gap: 6, paddingHorizontal: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }}>
                {layer.cmpLabel} ({layer.unit})
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }}>
                {layer.lo} – {layer.hi}
              </Text>
            </View>
            <RampBar stops={layer.stops} />
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>
              Shared scale {sharedRange.lo}–{sharedRange.hi} {layer.unit} · {fxNote}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>
              The same colour scale on both sides, so equal colours mean equal values. Tap either map to read a point.
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }} accessibilityLabel="All 16 systems">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ flexShrink: 1, fontFamily: fonts.body, fontSize: 12, color: colors.text2 }}>
              All 16 systems · {thenYear} against now
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text5 }}>
              {live.data ? 'Live + past day' : live.error ? 'Live unavailable' : 'Loading…'}
            </Text>
          </View>
          {SYS16.map((t) => {
            const nn = String(t.n).padStart(2, '0');
            const l = t.k ? layerByKey(t.k) : null;
            if (!l) {
              return (
                <View key={nn} style={[styles.tile, { opacity: t.fwd ? 1 : 0.7 }]}>
                  <TileHead nn={nn} name={t.name} />
                  {t.fwd ? (
                    <Pressable onPress={() => router.navigate('/forecast')} accessibilityRole="link" style={{ minHeight: 32, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.cyan }}>
                        Forecast engine looks forward, not back · Open future predictions →
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 12 * 1.5, color: colors.text4 }}>
                      <Text style={{ color: colors.text2 }}>Not connected yet · </Text>
                      {t.need}
                    </Text>
                  )}
                </View>
              );
            }
            const a = pastOf(l) ?? recordFor(l, thenYear, record);
            const b = nowOf(l);
            const d = deltaForDay(l, a, b, !pastDay.loading && !pastDay.error);
            return (
              <View key={nn} style={styles.tile}>
                <TileHead nn={nn} name={t.name} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(
                    [
                      ['PAST', a],
                      ['NOW', b],
                    ] as const
                  ).map(([k, v]) => (
                    <View key={k} style={{ flex: 1, gap: 4 }}>
                      <View style={{ height: 10, borderRadius: 5, backgroundColor: layerColor(v, l) }} />
                      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }}>
                        {k} <Text style={{ color: colors.text }}>{text(l, v)}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text2 }}>
                  <Text style={{ fontFamily: fonts.display, color: d.col }}>{d.text}</Text> {d.word} · {l.cmpLabel}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Every layer */}
      <View style={{ gap: 10 }}>
        <View>
          <SectionLabel>EVERY LAYER</SectionLabel>
          <Text style={{ marginTop: 4, fontFamily: fonts.body, fontSize: 12, color: colors.text5 }}>
            Bengaluru: {pastIso} against the live reading
          </Text>
        </View>
        <View style={styles.table}>
          <View style={[styles.tr, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
            <Text style={[styles.th, { flex: 1.5, textAlign: 'left' }]}>Layer</Text>
            <Text style={styles.th}>Past</Text>
            <Text style={styles.th}>Now</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>Change</Text>
          </View>
          {LAYERS.map((l) => {
            const a = pastOf(l) ?? recordFor(l, thenYear, record);
            const b = nowOf(l);
            const d = deltaForDay(l, a, b, !pastDay.loading && !pastDay.error);
            const change = a == null || b == null ? '—' : `${signed(b - a, l.dec)} ${l.unit}`;
            return (
              <View key={l.key} style={[styles.tr, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={[styles.td, { flex: 1.5, textAlign: 'left', color: colors.text }]}>{l.short}</Text>
                <Text style={[styles.td, a == null && { color: colors.text5 }]}>{a == null ? 'No record' : `${fmtVal(a, l.dec)}`}</Text>
                <Text style={[styles.td, { color: b == null ? colors.text5 : colors.text }]}>{b == null ? 'No record' : `${fmtVal(b, l.dec)}`}</Text>
                <Text style={[styles.td, { flex: 1.2, fontFamily: fonts.display, color: change === '—' ? colors.text5 : d.col }]}>{change}</Text>
              </View>
            );
          })}
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.6, color: colors.text5 }}>
          {`Past: ${pastDay.data?.source ?? 'ERA5'} at ${pastIso}, same IST hour as now. Now: ${live.data?.source ?? 'Open-Meteo'}, Bengaluru point. A day compared with a day is weather, not climate. Missing values show as “No record”.`}
        </Text>
      </View>

      <HonestData />
    </Screen>
  );
}

function Pane({
  tag,
  tagColor,
  border,
  when,
  value,
  map,
}: {
  tag: string;
  tagColor: string;
  border: string;
  when: string;
  value: string;
  map: React.ReactNode;
}) {
  return (
    <View style={[styles.pane, { borderColor: border }]}>
      <View>
        {map}
        <Text style={[styles.paneTag, { color: tagColor }]}>{tag}</Text>
      </View>
      <View style={{ gap: 2, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }} numberOfLines={3}>
          {when}
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>{value}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>Bengaluru</Text>
      </View>
    </View>
  );
}

function TileHead({ nn, name }: { nn: string; name: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 12, color: colors.cyan }}>{nn}</Text>
      <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{name}</Text>
    </View>
  );
}

/** "Two temperatures, never mixed" — drawn from the API's real monthly series (NASA POWER T2M vs MODIS LST). */
function HonestData() {
  const site = useApi('site', () => api.site());
  const c = site.data?.compare;
  const air = c?.air ?? [];
  const lst = c?.lst ?? [];
  const nums = [...air, ...lst].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const has = nums.length > 0;
  const lo = Math.floor(Math.min(...nums, Infinity) - 1);
  const hi = Math.ceil(Math.max(...nums, -Infinity) + 1);
  const x = (i: number) => 24 + (512 * i) / 11;
  const y = (v: number) => 216 - (192 * (v - lo)) / (hi - lo || 1);
  const line = (s: (number | null)[]) => {
    let d = '';
    let pen = false;
    s.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const lstPath = line(lst);
  return (
    <View style={styles.honest}>
      <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.26), color: colors.amber }}>HONEST DATA</Text>
      <Text style={{ fontFamily: fonts.displayLight, fontWeight: '300', fontSize: 26, lineHeight: 26 * 1.1, letterSpacing: em(26, 0.04), color: colors.text }}>
        {'TWO TEMPERATURES.\nNEVER MIXED.'}
      </Text>
      <P>
        Air temperature is measured two metres above the ground. Land surface temperature is how hot
        the ground itself gets — roofs, roads, and open soils. They always appear as separate series.
      </P>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Legend color={colors.cyan} label="Air temperature · 2 m" />
        <Legend color={colors.amber} label="Land surface" />
      </View>
      {has ? (
        <>
          <View style={{ aspectRatio: 560 / 240 }}>
            <Svg width="100%" height="100%" viewBox="0 0 560 240">
              <Defs>
                <SvgGradient id="hdF" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#E9A15A" stopOpacity={0.28} />
                  <Stop offset="1" stopColor="#E9A15A" stopOpacity={0} />
                </SvgGradient>
              </Defs>
              <Path d="M24 24H540M24 84H540M24 144H540M24 204H540" stroke="#1A1A20" />
              {lst.every((v: number | null) => typeof v === 'number') && lstPath ? (
                <Path d={`${lstPath} L${x(11)} 216 L${x(0)} 216 Z`} fill="url(#hdF)" />
              ) : null}
              <Path d={lstPath} stroke="#E9A15A" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={line(air)} stroke="#7FE0F0" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 10, color: colors.text5 }}>
                {m}
              </Text>
            ))}
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 10, letterSpacing: em(10, 0.14), color: colors.text5 }}>
            {`${lo}–${hi} °C · ${c?.year} · ${c?.air_source} · ${c?.lst_source}`.toUpperCase()}
          </Text>
        </>
      ) : (
        <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.18), color: colors.text4 }}>
          {site.error ? 'NO RECORD — LIVE DATA UNAVAILABLE' : site.loading ? 'LOADING MONTHLY SERIES…' : 'NO RECORD'}
        </Text>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateCard: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
  },
  ago: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pane: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0A0B0F',
    borderWidth: 1,
  },
  paneTag: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,5,6,0.82)',
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: em(10, 0.18),
  },
  deltaCard: {
    gap: 4,
    padding: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
  },
  tile: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  table: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: surfaces.border },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, gap: 6 },
  th: { flex: 1, textAlign: 'right', fontFamily: fonts.body, fontSize: 12, color: colors.text4 },
  td: { flex: 1, textAlign: 'right', fontFamily: fonts.body, fontSize: 12, color: colors.text2 },
  honest: {
    gap: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
});
