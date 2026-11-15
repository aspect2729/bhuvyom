import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LiveHeatMap, type Basemap, type Probe } from '@/components/LiveHeatMap';
import { Eyebrow, H1, LayerChips, P, RampBar, Screen, TextLink } from '@/components/ui';
import { TimelineCard } from '@/components/Timeline';
import { SIM_FRAME, focalValue, gridValues, type Region } from '@/lib/geo';
import { FX_NOTE, fitRange } from '@/lib/interpolate';
import {
  AR6,
  LAYERS,
  SCEN,
  fmtVal,
  interp,
  layerByKey,
  signed,
} from '@/lib/layers';
import { windOctant } from '@/lib/places';
import { SYSTEMS } from '@/lib/systems';
import { useApi } from '@/lib/useApi';
import { climateMean, recordAnomaly, weather } from '@/lib/weather';
import { colors, em, fonts, surfaces } from '@/theme/tokens';

const NOW = new Date().getUTCFullYear();

/** System block copy — Simulate.dc.html SYSI. Variable lists come from data/systems.json. */
const SYSI = {
  temp: { id: 'sys-01', n: '01', name: 'Temperature', desc: 'How warm the air and the ground get, and how that is shifting decade by decade.' },
  precip: { id: 'sys-02', n: '02', name: 'Precipitation & Water', desc: 'Southwest-monsoon rain, where it falls across the Ghats and plateau, and what it leaves behind in soil and lakes.' },
  atmos: { id: 'sys-04', n: '04', name: 'Atmospheric Activity', desc: 'Moisture, wind and pressure over the Deccan plateau — the conditions that move heat and pollution around.' },
  chem: { id: 'sys-11', n: '11', name: 'Atmospheric Chemistry & Air Quality', desc: 'Fine particulates and trace gases from traffic, industry and burning, modelled by Copernicus CAMS.' },
} as const;

const FACTS = [
  { num: '~70', unit: '%', inline: true, color: colors.cyan, title: 'Monsoon sensitivity', body: 'The southwest monsoon delivers about 70% of Karnataka’s annual rainfall.' },
  { num: '3,000', unit: 'vs 600 mm', inline: false, color: colors.cyan, title: 'Western Ghats ridge', body: 'A sharp rain divide between the coast and the eastern plains. Switch to Rainfall to see it.' },
  { num: '1.4', unit: 'cm / yr', inline: false, color: colors.amber, title: 'Groundwater stress', body: 'Urban aquifers are estimated to be falling about this much every year.' },
];

const REGION_STRIP: Record<Region, string> = {
  ka: 'Karnataka · 191,791 km²',
  blr: 'Bengaluru Urban · 12.7–13.2° N',
};

/** Simulate — Simulate.dc.html; live + record from Open-Meteo (android-handoff §2–4). */
export default function SimulateScreen() {
  const router = useRouter();
  const { height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ layer?: string }>();
  const [layerKey, setLayerKey] = useState(layerByKey(params.layer).key);
  const [region, setRegion] = useState<Region>('ka');
  const [base, setBase] = useState<Basemap>('day');
  const [year, setYear] = useState(NOW);
  const [scen, setScen] = useState<(typeof SCEN)[number]['id']>('ssp245');
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [probe, setProbe] = useState<Probe | null>(null);

  useEffect(() => {
    if (params.layer) setLayerKey(layerByKey(params.layer).key);
  }, [params.layer]);

  // Timeline playback: +2 years every 120 ms, stops at 2100.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setYear((y) => y + 2), 120);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => {
    if (playing && year >= 2100) {
      setYear(2100);
      setPlaying(false);
    }
  }, [playing, year]);

  const layer = layerByKey(layerKey);
  // Open-Meteo live grid only — never systems.json / demo reference values.
  const live = useApi(`omLive:${region}`, (opts) => weather.live(region, opts), 20 * 60 * 1000);
  const rec = useApi('omRecord', () => weather.record(), 365 * 24 * 60 * 60 * 1000);

  // Cap map so short phones keep readout + timeline reachable without a huge scroll.
  const mapMaxH = Math.round(Math.min(400, winH * 0.42));

  const liveReady = !!live.data && !live.loading;
  const values = liveReady ? live.data!.values[layer.key] ?? [] : [];
  const cloudVals = liveReady ? live.data!.values.cloud ?? [] : [];
  const wdirVals = liveReady ? live.data!.values.wdir ?? [] : [];
  const focal = focalValue(region, values);
  const cloudBlr = focalValue(region, cloudVals);
  const wdirBlr = focalValue(region, wdirVals);
  const future = year > NOW;
  const past = year < NOW;
  const scenDef = SCEN.find((s) => s.id === scen)!;
  const series = layer.record && rec.data ? rec.data[layer.record] : undefined;
  const clim = climateMean(series);
  const fitted = useMemo(
    () => fitRange(layer, gridValues(region, values), layer.sys === 'temp' ? 3.5 : 0),
    [layer, region, values],
  );
  let rainScale = 1;

  // Timeline rules — android-handoff docs/04 §4 (anomaly shift; AR6 air uses 2016–2025 base).
  let value: number | null = focal;
  let shift = 0;
  let roTitle = `${layer.label} · Live`;
  let roDelta = liveReady
    ? `Live · ${live.data!.time ?? 'now'} · Tap the map to read any point · ${live.data!.source}`
    : live.error
      ? `Live data unavailable — ${live.error}`
      : 'Loading live conditions…';
  let deltaCol: string = colors.text4;
  let veilMessage: string | undefined;

  if (future) {
    roTitle = `${layer.label} · ${year} · ${scenDef.label}`;
    if (layer.key === 'air') {
      const base = clim;
      shift = interp(AR6[scen], year) - interp(AR6[scen], 2020.5);
      value = base == null ? null : base + shift;
      roDelta =
        base == null
          ? 'No 2016–2025 base for this projection'
          : `${signed(shift, layer.dec)} ${layer.unit} vs 2016–2025 mean · IPCC AR6 central estimate — not a forecast of that day’s weather`;
      deltaCol = colors.amber;
    } else if (layer.key === 'surf') {
      shift = interp(AR6[scen], year) - interp(AR6[scen], NOW);
      value = focal == null ? null : focal + shift;
      roDelta = `${signed(shift, layer.dec)} ${layer.unit} warmer than today · IPCC AR6 central estimate — not a forecast`;
      deltaCol = colors.amber;
    } else {
      value = null;
      roDelta = `No scenario projection for ${layer.short}`;
    }
  } else if (past) {
    const raw = series?.[String(year)];
    value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    roTitle = `${layer.key === 'rain' ? 'Rainfall · annual total' : layer.label} · ${year} · Record`;
    if (!layer.record) {
      veilMessage = 'No historical series for this layer';
      roDelta = 'No historical series for this layer';
    } else if (rec.error) {
      veilMessage = 'Historical record unavailable';
      roDelta = `Record unavailable — ${rec.error}`;
    } else if (rec.loading) {
      roDelta = 'Loading the historical record…';
    } else if (value == null) {
      veilMessage = `No record for ${year}`;
      roDelta = `No record for ${year}`;
    } else if (layer.key === 'rain') {
      // Scale the live 30-day field by record(year) / 2016–2025 mean (web yearState).
      shift = 0;
      rainScale = clim && clim > 0 && value != null ? value / clim : 1;
      roDelta =
        clim != null && value != null
          ? `${Math.round(value).toLocaleString('en-IN')} mm fell on Bengaluru in ${year} · 2016–2025 average ${Math.round(clim).toLocaleString('en-IN')} mm · ERA5. Rain on the map is scaled to that year.`
          : `${rec.data?.source ?? 'Annual record'} · annual total at Bengaluru`;
    } else {
      const anom = recordAnomaly(series, year);
      shift = anom ?? 0;
      if (clim != null) {
        roDelta = `${signed(value - clim, layer.dec)} ${layer.unit} vs 2016–2025 average · ${rec.data?.source ?? 'annual mean'}`;
        deltaCol = value >= clim ? colors.amber : colors.cyan;
      } else {
        roDelta = `${rec.data?.source ?? 'Annual record'} · annual mean at Bengaluru`;
      }
    }
  }

  if (!future && !past && probe?.value != null) {
    roTitle = `${layer.label} · Near ${probe.place ?? 'map point'}`;
    value = probe.value;
    const extras: string[] = [];
    if (layer.key === 'rain' && cloudBlr != null) extras.push(`Cloud cover now ${Math.round(cloudBlr)} %`);
    if (layer.key === 'wind' && wdirBlr != null) extras.push(`From ${windOctant(wdirBlr)}`);
    roDelta = extras.length ? extras.join(' · ') : `Tap another point · ${live.data?.source ?? 'Open-Meteo'}`;
  } else if (!future && !past) {
    if (layer.key === 'rain' && cloudBlr != null) {
      roDelta = `Cloud cover at Bengaluru ${Math.round(cloudBlr)} % · ${live.data?.source ?? 'Open-Meteo'}`;
    } else if (layer.key === 'wind' && wdirBlr != null) {
      roDelta = `Wind from ${windOctant(wdirBlr)} · ${live.data?.source ?? 'Open-Meteo'}`;
    }
  }

  const readValue = value != null ? `${fmtVal(value, layer.dec)} ${layer.unit}` : 'No record';
  const yearKind = future
    ? `Projection · IPCC AR6 · ${scenDef.code}`
    : past
      ? `Record · ${rec.data?.source ?? 'annual means'}`
      : liveReady
        ? `Live · ${live.data!.time ?? 'now'}`
        : live.error
          ? 'Live unavailable'
          : 'Loading live…';
  const scenNote = future
    ? 'IPCC AR6 central estimate — a scenario, not a forecast of that day’s weather. Temperature layers only.'
    : `Drag past ${NOW} to choose an emissions scenario.`;
  const fxNote = FX_NOTE[layer.key]();

  const sys = SYSI[layer.sys];
  const sysVars = SYSTEMS.find((s) => s.id === sys.id)?.vars ?? [];
  const mapStatus = year === NOW && liveReady && !live.error ? colors.cyan : colors.amber;

  const togglePlay = () => {
    if (playing) setPlaying(false);
    else {
      if (year >= 2100) setYear(1980);
      setPlaying(true);
    }
  };

  return (
    <Screen
      refreshing={live.refreshing || rec.refreshing}
      onRefresh={() => {
        live.reload();
        rec.reload();
      }}
      contentStyle={{ gap: 18, paddingHorizontal: 16, paddingTop: 4 }}
    >
      <View style={{ gap: 10, paddingHorizontal: 4 }}>
        <Eyebrow color={colors.amber}>SIMULATION</Eyebrow>
        <H1>{'ASK THE CITY\n“WHAT IF?”'}</H1>
        <P>
          Live conditions across Karnataka or inside Bengaluru, read point by point. Move back
          through 46 years of record, or forward into a warming scenario.
        </P>
        <TextLink label="FUTURE PREDICTIONS →" onPress={() => router.navigate('/forecast')} />
      </View>

      <LayerChips
        items={LAYERS.map((l) => ({ key: l.key, label: l.short, stops: l.stops }))}
        value={layerKey}
        onChange={(k) => setLayerKey(k as typeof layerKey)}
      />

      {/* Map */}
      <View style={styles.mapCard} accessibilityLabel="Map">
        <View style={styles.mapHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: mapStatus }} />
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text2 }} numberOfLines={1}>
              {REGION_STRIP[region]}
            </Text>
          </View>
          <View style={styles.dayNight}>
            {(['day', 'night'] as const).map((b) => (
              <Pressable
                key={b}
                onPress={() => setBase(b)}
                accessibilityRole="button"
                accessibilityState={{ selected: base === b }}
                style={[styles.dnBtn, base === b && { backgroundColor: colors.text }]}
              >
                <Text style={{ fontFamily: fonts.body, fontSize: 11, color: base === b ? colors.bg : colors.text2 }}>
                  {b === 'day' ? 'Day' : 'Night'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <LiveHeatMap
          region={region}
          frame={SIM_FRAME[region]}
          layer={layer}
          values={values}
          basemap={base}
          loading={live.loading && !liveReady}
          error={liveReady ? null : live.error}
          emptyMessage={`${layer.label}: no live values from Open-Meteo for this layer`}
          veilMessage={past ? veilMessage : undefined}
          shift={shift}
          scale={rainScale}
          zoom={zoom}
          maxHeight={mapMaxH}
          showPlaces
          pinLabel={!probe && year === NOW ? readValue : null}
          lo={fitted.lo}
          hi={fitted.hi}
          onProbe={setProbe}
          onRetry={() => live.reload()}
        >
          <View style={styles.regionSeg}>
            {(['ka', 'blr'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => {
                  setRegion(r);
                  setZoom(1);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: region === r }}
                style={[styles.regBtn, region === r && { backgroundColor: colors.text }]}
              >
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: region === r ? colors.bg : colors.text2 }}>
                  {r === 'ka' ? 'Karnataka' : 'Bengaluru'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.zoom}>
            <Pressable onPress={() => setZoom((z) => Math.min(2.6, +(z + 0.4).toFixed(1)))} accessibilityRole="button" accessibilityLabel="Zoom in" style={styles.zBtn}>
              <Text style={styles.zText}>+</Text>
            </Pressable>
            <Pressable onPress={() => setZoom((z) => Math.max(1, +(z - 0.4).toFixed(1)))} accessibilityRole="button" accessibilityLabel="Zoom out" style={styles.zBtn}>
              <Text style={styles.zText}>−</Text>
            </Pressable>
          </View>
        </LiveHeatMap>

        <View style={{ gap: 6, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }}>
              {layer.label} ({layer.unit})
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }}>
              {fitted.lo} – {fitted.hi}
            </Text>
          </View>
          <RampBar stops={layer.stops} />
          <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>
            {fxNote} · Google Earth
          </Text>
        </View>
      </View>

      {/* Readout */}
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>{roTitle}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <Text
            style={{
              fontFamily: fonts.displayLight,
              fontWeight: '300',
              fontSize: value != null ? 44 : 30,
              letterSpacing: em(44, 0.01),
              color: value != null ? colors.text : colors.text4,
            }}
          >
            {readValue}
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: em(12, 0.22), color: colors.text2 }}>BENGALURU</Text>
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.45, color: deltaCol }}>{roDelta}</Text>
      </View>

      <TimelineCard
        year={year}
        now={NOW}
        onYear={setYear}
        playing={playing}
        onTogglePlay={togglePlay}
        scen={scen}
        onScen={setScen}
        yearKind={yearKind}
        scenNote={scenNote}
      />

      {/* System */}
      <View style={{ gap: 12, paddingTop: 4, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.24), color: colors.cyan }}>SYSTEM {sys.n}</Text>
            <Text style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 22, letterSpacing: em(22, 0.03), color: colors.text }}>
              {sys.name}
            </Text>
          </View>
          <Pressable onPress={() => router.navigate('/systems')} accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.cyan }}>All 16 →</Text>
          </Pressable>
        </View>
        <P>{sys.desc}</P>
        <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.2), color: colors.text5 }}>
          VARIABLES IN THIS SYSTEM · {sysVars.length}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {sysVars.map((v) => {
            const on = v.name === layer.tag;
            return (
              <Text
                key={v.name}
                style={[
                  styles.varChip,
                  on
                    ? { backgroundColor: 'rgba(127,224,240,0.12)', borderColor: 'rgba(127,224,240,0.5)', color: colors.text }
                    : { backgroundColor: surfaces.card, borderColor: 'rgba(255,255,255,0.10)', color: colors.text4 },
                ]}
              >
                {v.name}
              </Text>
            );
          })}
        </View>
      </View>

      {/* Key facts */}
      <View style={{ gap: 8 }} accessibilityLabel="Key facts">
        {FACTS.map((f) => (
          <View key={f.title} style={styles.fact}>
            <View style={{ width: 92 }}>
              <Text style={{ fontFamily: fonts.displayLight, fontWeight: '300', fontSize: 30, color: f.color }}>
                {f.num}
                {f.inline ? <Text style={{ fontSize: 14 }}> {f.unit}</Text> : null}
              </Text>
              {!f.inline ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>{f.unit}</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{f.title}</Text>
              <Text style={{ marginTop: 3, fontFamily: fonts.body, fontSize: 12, lineHeight: 12 * 1.5, color: colors.text4 }}>{f.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={{ paddingHorizontal: 4, fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.6, color: colors.text5 }}>
        {`Live: ${live.data?.source ?? 'Open-Meteo · ECMWF / GFS · CAMS'} · one cell per live grid point (${region === 'ka' ? '11 × 9' : '9 × 9'}), no smoothing. Record: ${rec.data?.source ?? 'ERA5 annual means at Bengaluru'}. Projections: IPCC AR6 WGI Table SPM.1 central estimates added to the live reading, temperature layers only. Boundary: geoBoundaries. Missing values show as “No record”, never demo zeros.`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
    backgroundColor: '#0A0B0F',
  },
  mapHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dayNight: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  dnBtn: { height: 28, paddingHorizontal: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  regionSeg: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 16,
    backgroundColor: 'rgba(5,5,6,0.82)',
    borderWidth: 1,
    borderColor: surfaces.borderStrong,
  },
  regBtn: { height: 34, paddingHorizontal: 12, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  zoom: { position: 'absolute', right: 10, top: 10, gap: 6 },
  zBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  zText: { fontFamily: fonts.body, fontSize: 18, color: colors.text },
  card: {
    gap: 4,
    padding: 18,
    borderRadius: 22,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  varChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  fact: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
});
