import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ChevronDown } from '@/components/Icons';
import { Eyebrow, H1, Screen, Seg } from '@/components/ui';
import engine from '../../data/engine_all.json';
import { CITY_CELL, api, fmt, type ForecastResult } from '@/lib/api';
import { forecastWithFallback } from '@/lib/engineOffline';
import {
  derive,
  horizonRows,
  MODEL_NAMES,
  monthLabel,
  niceTicks,
  skillHorizons,
  yearSummary,
  type Derived,
  type FutureMode,
  type Series,
} from '@/lib/forecastLive';
import { EARTH_CLEAR } from '@/lib/images';
import { AR6, SCEN, interp } from '@/lib/layers';
import { fetchRealityCheck } from '@/lib/openMeteo';
import { useApi } from '@/lib/useApi';
import { colors, cssAngle, em, fonts, surfaces } from '@/theme/tokens';

type Cell = { id: string; city: boolean; lat: number; lon: number; name: string };

/** 25 POWER cells (id / name) from the handoff's engine_all.json — north to south, west to east. */
const CELLS: Cell[] = (engine.cells as Cell[]).slice().sort((a, b) => b.lat - a.lat || a.lon - b.lon);

const VARS: Record<FutureMode, { code: 'T2M' | 'PRECTOTCORR'; label: string }> = {
  air: { code: 'T2M', label: 'Air temperature' },
  rain: { code: 'PRECTOTCORR', label: 'Rainfall' },
};

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)} %`);
const signedNum = (v: number, dg: number) => (v > 0 ? `+${v.toFixed(dg)}` : v.toFixed(dg));
const HERO_GRAD = cssAngle(150);

/** Forecast — Forecast.dc.html, live from /api/prediction/forecast (lib/forecastLive.ts derivations). */
export default function ForecastScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<FutureMode>('air');
  const [cellId, setCellId] = useState<string>(CELLS.find((c) => c.city)?.id ?? CITY_CELL);
  const [open, setOpen] = useState(false);

  const V = VARS[mode];
  const cur = useApi(`forecast:${V.code}`, () =>
    forecastWithFallback(() => api.forecast(V.code), V.code),
  );
  // Warming scenarios are air-temperature only, whichever tab is open.
  const airState = useApi('forecast:T2M', () =>
    forecastWithFallback(() => api.forecast('T2M'), 'T2M'),
  );
  const fc = cur.data;
  const d = fc ? derive(fc, mode, cellId) : null;
  const dAir = airState.data ? derive(airState.data, 'air', cellId) : null;
  const place = CELLS.find((c) => c.id === cellId);
  const rows = fc ? horizonRows(fc, mode, d) : [];
  const nSkill = fc ? skillHorizons(fc) : null;
  const hero = buildHero(fc, d, mode);
  const offline = !!(fc as (ForecastResult & { offline?: boolean }) | null)?.offline;

  const hzHead = !fc
    ? cur.error
      ? 'Prediction engine unavailable'
      : 'Loading the engine’s track record…'
    : nSkill == null
      ? 'How far ahead can it be trusted?'
      : nSkill > 0
        ? `Good for ${nSkill} ${nSkill === 1 ? 'month' : 'months'}. After that, it’s the average.`
        : 'No model beats the monthly average here.';

  const status = cur.error
    ? { color: colors.amber, text: `Live data unavailable — ${cur.error}` }
    : fc
      ? {
          color: offline ? colors.amber : colors.cyan,
          text: offline
            ? `Offline bundle · ${fc.title.replace(/^Monthly forecast — /, '')} · ${fc.variable}`
            : `Live · ${fc.title.replace(/^Monthly forecast — /, '')} · ${fc.variable}`,
        }
      : { color: colors.text3, text: 'Loading forecast from the BhuVyom API…' };

  const reality = useApi(
    `era5:${mode}:${place?.lat ?? 0}:${place?.lon ?? 0}`,
    () =>
      place
        ? fetchRealityCheck(place.lat, place.lon, mode)
        : Promise.resolve({ months: [], source: 'Open-Meteo · ERA5 reality check' }),
    30 * 24 * 60 * 60 * 1000,
  );
  const lastReal = reality.data?.months[reality.data.months.length - 1];
  const fcForMonth =
    lastReal && d
      ? (() => {
          const i = d.times.indexOf(lastReal.ym);
          if (i < 0) return null;
          return {
            forecast: d.forecast[i],
            lo: d.lo80[i],
            hi: d.hi80[i],
          };
        })()
      : null;
  let realityNote: string | null = null;
  if (lastReal && fcForMonth?.forecast != null) {
    const diff = lastReal.value - fcForMonth.forecast;
    const in80 =
      fcForMonth.lo != null &&
      fcForMonth.hi != null &&
      lastReal.value >= fcForMonth.lo &&
      lastReal.value <= fcForMonth.hi;
    realityNote = `ERA5 ${lastReal.ym}: ${lastReal.value.toFixed(mode === 'rain' ? 0 : 1)} ${d?.unit ?? ''} vs forecast ${fcForMonth.forecast.toFixed(mode === 'rain' ? 0 : 1)} (${diff >= 0 ? '+' : ''}${diff.toFixed(mode === 'rain' ? 0 : 1)}; ${in80 ? 'inside' : 'outside'} 80% range)`;
  } else if (reality.error) {
    realityNote = `ERA5 reality check unavailable — ${reality.error}`;
  }

  const notes = [
    ...((fc?.findings ?? []).map((f) => ({ t: f.statement, dot: colors.cyan }))),
    ...(realityNote ? [{ t: realityNote, dot: colors.cyan }] : []),
    { t: '~50 km cells: one cell covers all of Bengaluru; no neighbourhood-scale prediction.', dot: colors.amber },
    { t: 'Not a weather forecast and not a climate projection.', dot: colors.amber },
  ];

  return (
    <Screen
      refreshing={cur.refreshing || airState.refreshing || reality.refreshing}
      onRefresh={() => {
        cur.reload();
        airState.reload();
        reality.reload();
      }}
      contentStyle={{ gap: 18, paddingHorizontal: 16, paddingTop: 4 }}
    >
      {/* Intro */}
      <View style={{ gap: 10, paddingHorizontal: 4, minHeight: 250 }}>
        <Image
          source={EARTH_CLEAR}
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', right: -120, top: -30, width: 300, height: 300, borderRadius: 150, opacity: 0.55 }}
        />
        <Eyebrow color={colors.amber}>FUTURE PREDICTIONS</Eyebrow>
        <H1>{'WHAT THE\nENGINE\nEXPECTS'}</H1>
        <Text style={{ maxWidth: 300, fontFamily: fonts.body, fontSize: 13, lineHeight: 13 * 1.6, color: colors.text2 }}>
          Forecasts from the BhuVyom prediction engine, trained on 45 years of NASA POWER monthly
          data. Every number comes with a range, and a score for how far ahead it can be trusted.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status.color }} />
          <Text style={{ flexShrink: 1, fontFamily: fonts.body, fontSize: 11, color: status.color }}>{status.text}</Text>
        </View>
        <Pressable onPress={() => router.navigate('/simulate')} accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: em(12, 0.18), color: colors.cyan }}>← BACK TO THE SIMULATION</Text>
        </Pressable>
      </View>

      {/* Variable tabs */}
      <View style={{ flexDirection: 'row' }}>
        <Seg<FutureMode>
          options={[
            { id: 'air', label: VARS.air.label },
            { id: 'rain', label: VARS.rain.label },
          ]}
          value={mode}
          onChange={setMode}
          height={42}
          radius={14}
          outerRadius={18}
          fontSize={13}
        />
      </View>

      {/* Place */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>PLACE · ~50 KM CELL</Text>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel="Place"
          accessibilityState={{ expanded: open }}
          style={styles.select}
        >
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text }}>
            {place?.name ?? cellId}
          </Text>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <ChevronDown color={colors.text4} />
          </View>
        </Pressable>
        {open ? (
          <ScrollView style={styles.list} nestedScrollEnabled>
            {CELLS.map((c) => {
              const on = c.id === cellId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setCellId(c.id);
                    setOpen(false);
                  }}
                  style={[styles.opt, on && { backgroundColor: 'rgba(127,224,240,0.08)' }]}
                >
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: on ? colors.cyan : colors.text2 }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {fc && !d ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.amber }}>The API returned no series for this place ({cellId}).</Text>
        ) : null}
      </View>

      {/* Headline */}
      <View style={{ gap: 8 }} accessibilityLabel="Headline forecast">
        <View style={styles.hero}>
          <LinearGradient colors={['rgba(233,161,90,0.20)', 'rgba(255,255,255,0.03)']} locations={[0, 0.7]} {...HERO_GRAD} style={StyleSheet.absoluteFill} />
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text2 }}>{hero.k1}</Text>
          <Text style={{ fontFamily: fonts.displayLight, fontWeight: '300', fontSize: hero.v1 === 'No record' ? 34 : 52, lineHeight: 52 * 1.05, color: colors.text }}>
            {hero.v1}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 12 * 1.4, color: colors.text2 }}>{hero.s1}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Mini k={hero.k2} v={hero.v2} s={hero.s2} />
          <Mini k="Typical error, 1 month ahead" v={hero.v3} s={hero.s3} />
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartCard} accessibilityLabel="Five years at a glance">
        <View>
          <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>FIVE YEARS AT A GLANCE</Text>
          <Text style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 20, color: colors.text }}>Observed, then forecast</Text>
        </View>
        {d ? (
          <View style={{ aspectRatio: 324 / 210 }}>
            <Chart d={d} label={`${V.label} for this cell, observed and forecast with 80 and 95 percent ranges`} />
          </View>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.18), color: colors.text4 }}>
              {cur.error ? 'FORECAST UNAVAILABLE' : fc ? 'NO SERIES FOR THIS PLACE' : 'LOADING FORECAST…'}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
          <Key swatch={<View style={{ width: 14, height: 2, backgroundColor: colors.text2 }} />} label="Observed (NASA POWER)" />
          <Key swatch={<View style={{ width: 14, height: 3, backgroundColor: colors.amber }} />} label="Engine forecast" />
          <Key swatch={<View style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: 'rgba(233,161,90,0.4)' }} />} label="80 % range" />
          <Key swatch={<View style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: 'rgba(233,161,90,0.18)' }} />} label="95 % range" />
          <Key swatch={<View style={{ width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.cyan }} />} label="Climatology" />
        </View>
      </View>

      {/* How far ahead */}
      <View style={{ gap: 10 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>HOW FAR AHEAD</Text>
          <Text style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 20, lineHeight: 20 * 1.25, color: colors.text }}>{hzHead}</Text>
        </View>
        <View style={styles.table}>
          <View style={[styles.tr, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
            <Text style={[styles.th, { width: 44, textAlign: 'left' }]}>Ahead</Text>
            <Text style={[styles.th, { flex: 1.4, textAlign: 'left' }]}>Model</Text>
            <Text style={[styles.th, { width: 40 }]}>Skill</Text>
            <Text style={[styles.th, { width: 62 }]}>Error</Text>
            <Text style={[styles.th, { width: 52 }]}>80 % hit</Text>
          </View>
          {rows.map((r) => (
            <View key={r.h} style={[styles.tr, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}>
              <Text style={[styles.td, { width: 44, textAlign: 'left', fontFamily: fonts.display, color: colors.text }]}>{r.h} mo</Text>
              <Text style={[styles.td, { flex: 1.4, textAlign: 'left' }]}>{r.model}</Text>
              <Text style={[styles.td, { width: 40, color: r.skill != null && r.skill >= 0.02 ? colors.amber : colors.text5 }]}>
                {r.skill == null ? '—' : `${Math.round(r.skill * 100)} %`}
              </Text>
              <Text style={[styles.td, { width: 62 }]}>
                {r.err != null ? `${fmt(r.err, mode === 'rain' ? 1 : 2)} ${d?.unit ?? ''}` : '—'}
              </Text>
              <Text style={[styles.td, { width: 52 }]}>{pct(r.hit)}</Text>
            </View>
          ))}
          {!rows.length ? (
            <View style={[styles.tr, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}>
              <Text style={styles.td}>{cur.error ? 'Unavailable' : 'Loading…'}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.foot}>Skill = how much better than the long-term monthly average. Error = mean absolute error on held-out years.</Text>
      </View>

      {/* Scenarios */}
      <View style={{ gap: 10 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>BEYOND 12 MONTHS</Text>
          <Text style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 20, color: colors.text }}>Warming scenarios to 2100</Text>
        </View>
        <ScenarioCards d={dAir} />
        <Text style={styles.foot}>
          Not engine output: IPCC AR6 WGI Table SPM.1 central warming estimates added to the mean of the last four observed years for this cell. Air temperature only.
        </Text>
      </View>

      {/* How it works */}
      <View style={{ gap: 10 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.22), color: colors.text4 }}>HOW IT WORKS</Text>
          <Text style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 20, color: colors.text }}>Tested on years it never saw</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Stat v={fc?.model?.training_period?.replace('–', ' – ') ?? '—'} k="Training months · NASA POWER (MERRA-2)" />
          <Stat v={fc?.model?.test_origins?.replace('–', ' – ') ?? '—'} k="Held-out test years" />
          <Stat v={`${Object.keys(MODEL_NAMES).length} models`} k="Compete per horizon; the best on held-out data wins" />
          <Stat v={fc?.quality?.cells ? `${fc.quality.cells} cells` : '—'} k="~50 km each across southern Karnataka" />
        </View>
        {notes.map((n, i) => (
          <View key={i} style={styles.note}>
            <View style={{ width: 6, height: 6, marginTop: 7, borderRadius: 3, backgroundColor: n.dot }} />
            <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 12 * 1.55, color: colors.text2 }}>{n.t}</Text>
          </View>
        ))}
        <Text style={styles.foot}>
          {`Engine run ${fc?.executed_at ? fc.executed_at.slice(0, 10) : '—'} · BhuVyom prediction engine. Not a weather forecast and not a climate projection.`}
        </Text>
      </View>
    </Screen>
  );
}

/** Headline numbers: all derived from the API response. Null fields render as "No record". */
function buildHero(fc: ForecastResult | null, d: Derived | null, mode: FutureMode) {
  const none = {
    k1: 'Next month',
    v1: 'No record',
    s1: '',
    k2: 'All of the year',
    v2: 'No record',
    s2: '',
    v3: 'No record',
    s3: '',
  };
  if (!fc || !d) return none;
  const dg = d.digits;
  const U = d.unit;
  const year = Number(d.nowYm.slice(0, 4));
  const out = { ...none };
  const i = d.nextIdx;
  if (i >= 0 && d.forecast[i] != null) {
    out.k1 = `Next month · ${monthLabel(d.times[i])}`;
    out.v1 = `${fmt(d.forecast[i], dg)} ${U}`;
    out.s1 =
      `80 % range ${fmt(d.lo80[i], dg)} – ${fmt(d.hi80[i], dg)} ${U}` +
      (d.lo95[i] != null && d.hi95[i] != null ? ` · 95 % ${fmt(d.lo95[i], dg)} – ${fmt(d.hi95[i], dg)}` : '');
  }
  out.k2 = `All of ${year} · ${mode === 'rain' ? 'total' : 'average'}`;
  const ys = yearSummary(d, mode, year);
  if (ys && ys.value != null) {
    out.v2 = `${fmt(ys.value, dg)} ${U}`;
    if (ys.clim != null) {
      const diff = ys.value - ys.clim;
      out.s2 =
        Math.abs(diff) < Math.pow(10, -dg)
          ? 'Same as the long-term average'
          : `${fmt(Math.abs(diff), dg)} ${U} ${diff > 0 ? 'above' : 'below'} the long-term average`;
    } else {
      out.s2 = `${mode === 'rain' ? 'Sum' : 'Average'} of the ${ys.n} monthly forecast${ys.n === 1 ? '' : 's'}`;
    }
  }
  const r1 = horizonRows(fc, mode, d).find((r) => r.h === 1);
  if (r1 && r1.err != null) {
    out.v3 = `±${fmt(r1.err, mode === 'rain' ? 1 : 2)} ${U}`;
    out.s3 = `Mean absolute error${fc.model?.test_origins ? ` on ${fc.model.test_origins}` : ''}, held out`;
  }
  return out;
}

function Mini({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <View style={styles.mini}>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>{k}</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: v === 'No record' ? 18 : 26, color: colors.text }}>{v}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.45, color: colors.text4 }}>{s}</Text>
    </View>
  );
}

function Key({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {swatch}
      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <View style={styles.stat}>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.cyan }}>{v}</Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.body, fontSize: 12, color: colors.text4 }}>{k}</Text>
    </View>
  );
}

/** IPCC AR6 central warming added to the cell's recent observed mean (air temperature only). */
function ScenarioCards({ d }: { d: Derived | null }) {
  const obs = d
    ? d.times
        .map((t, i) => ({ y: Number(t.slice(0, 4)), v: d.observed[i] }))
        .filter((o): o is { y: number; v: number } => o.v != null)
    : [];
  if (!d || !obs.length) {
    return (
      <View style={styles.scen}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text4 }}>No record — needs the observed air-temperature series for this cell.</Text>
      </View>
    );
  }
  const lastY = obs[obs.length - 1].y;
  const win = obs.filter((o) => o.y > lastY - 4);
  const base = win.reduce((a, o) => a + o.v, 0) / win.length;
  const mid = (win[0].y + win[win.length - 1].y + 1) / 2;
  const col: Record<string, string> = { ssp126: colors.cyan, ssp245: colors.text, ssp585: colors.amber };
  return (
    <>
      {SCEN.map((sc) => (
        <View key={sc.id} style={styles.scen}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{sc.label}</Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.1), color: colors.text4 }}>{sc.code}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[2030, 2050, 2100].map((y) => {
              const dv = interp(AR6[sc.id], y) - interp(AR6[sc.id], mid);
              return (
                <View key={y} style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text5 }}>{y}</Text>
                  <Text style={{ fontFamily: fonts.display, fontSize: 18, color: col[sc.id] }}>{(base + dv).toFixed(1)} °C</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text4 }}>{signedNum(dv, 1)} °C</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

/** Polyline path that breaks at nulls. */
function line(s: Series, x: (i: number) => number, y: (v: number) => number): string {
  let out = '';
  let pen = false;
  s.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    out += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return out.trim();
}

/** Closed band between two series over the months where both exist. */
function band(lo: Series, hi: Series, x: (i: number) => number, y: (v: number) => number): string {
  const idx = lo.map((_, i) => i).filter((i) => lo[i] != null && hi[i] != null);
  if (!idx.length) return '';
  const up = idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(hi[i] as number).toFixed(1)}`);
  const down = [...idx].reverse().map((i) => `L${x(i).toFixed(1)} ${y(lo[i] as number).toFixed(1)}`);
  return `${up.join(' ')} ${down.join(' ')} Z`;
}

/** 324 × 210 chart from the handoff, driven by the live series of one cell. */
function Chart({ d, label }: { d: Derived; label: string }) {
  const g = useMemo(() => {
    const n = d.times.length;
    const all = [d.observed, d.hi95, d.lo95, d.clim, d.forecast].flat().filter((v): v is number => v != null);
    if (!all.length || n < 2) return null;
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.08;
    lo = d.unit === 'mm' ? 0 : Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);
    const ticks = niceTicks(lo, hi, 4);
    const X0 = 30;
    const X1 = 322;
    const Y0 = 180;
    const Y1 = 8;
    const x = (i: number) => X0 + ((X1 - X0) * i) / (n - 1);
    const y = (v: number) => Y0 - ((Y0 - Y1) * (v - lo)) / (hi - lo || 1);
    const ff = d.startIdx;
    const obsJoin = d.observed.slice();
    if (ff > 0) obsJoin[ff] = null;
    const fcJoin = d.forecast.slice();
    if (ff > 0 && d.observed[ff - 1] != null) fcJoin[ff - 1] = d.observed[ff - 1];
    return {
      x,
      y,
      ticks,
      ff,
      X1,
      p95: band(d.lo95, d.hi95, x, y),
      p80: band(d.lo80, d.hi80, x, y),
      pcl: line(d.clim, x, y),
      pobs: line(obsJoin, x, y),
      pfc: line(fcJoin, x, y),
      years: d.times.map((t, i) => [i, t] as const).filter(([, t]) => t.endsWith('-01')),
    };
  }, [d]);
  if (!g) return null;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 324 210" accessibilityLabel={label}>
      {g.ticks.map((t) => (
        <Line key={`l${t}`} x1={30} x2={324} y1={g.y(t)} y2={g.y(t)} stroke="#1A1A20" />
      ))}
      {g.ticks.map((t) => (
        <SvgText key={`t${t}`} x={0} y={g.y(t) + 3} fill="#8A8A92" fontSize={10} fontFamily={fonts.display}>
          {t}
        </SvgText>
      ))}
      {g.ff >= 0 ? <Rect x={g.x(g.ff)} y={6} width={g.X1 - g.x(g.ff)} height={174} fill="rgba(233,161,90,0.05)" /> : null}
      <Path d={g.p95} fill="rgba(233,161,90,0.14)" />
      <Path d={g.p80} fill="rgba(233,161,90,0.26)" />
      <Path d={g.pcl} fill="none" stroke="#7FE0F0" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} />
      <Path d={g.pobs} fill="none" stroke="#C9C9CE" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d={g.pfc} fill="none" stroke="#E9A15A" strokeWidth={2.2} strokeLinejoin="round" />
      {g.years.map(([i, t]) => (
        <SvgText key={t} x={g.x(i) - 2} y={200} fill="#8A8A92" fontSize={10} fontFamily={fonts.display}>
          {t.slice(0, 4)}
        </SvgText>
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  list: {
    maxHeight: 280,
    borderRadius: 14,
    backgroundColor: '#0B0B0E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  opt: { paddingVertical: 12, paddingHorizontal: 14 },
  hero: {
    gap: 4,
    padding: 20,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(233,161,90,0.32)',
  },
  mini: {
    flex: 1,
    gap: 4,
    padding: 16,
    borderRadius: 20,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  chartCard: {
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  chartEmpty: { height: 160, alignItems: 'center', justifyContent: 'center' },
  table: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: surfaces.border },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10 },
  th: { textAlign: 'right', fontFamily: fonts.body, fontSize: 11, color: colors.text4 },
  td: { textAlign: 'right', fontFamily: fonts.body, fontSize: 11, color: colors.text2 },
  foot: { paddingHorizontal: 4, fontFamily: fonts.body, fontSize: 11, lineHeight: 11 * 1.6, color: colors.text5 },
  scen: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  stat: {
    width: '48.5%',
    flexGrow: 1,
    padding: 14,
    borderRadius: 16,
    backgroundColor: surfaces.card,
    borderWidth: 1,
    borderColor: surfaces.border,
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
});
