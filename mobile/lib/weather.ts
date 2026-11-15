/**
 * Weather facade for Simulate / Compare — Open-Meteo primary (android-handoff).
 * Shapes match existing SimLive / SimRecord so screens keep the same chrome.
 */
import type { SimLive, SimRecord } from '@/lib/api';
import type { Region } from '@/lib/geo';
import {
  climateMean,
  fetchAnnualRecord,
  fetchLive,
  fetchPastDay,
  pastDateYearsAgo,
} from '@/lib/openMeteo';

export const weather = {
  live: (region: Region, opts?: { force?: boolean }) => fetchLive(region, opts),
  record: () => fetchAnnualRecord(),
  pastDay: (region: Region, yearsAgo: number) =>
    fetchPastDay(region, pastDateYearsAgo(yearsAgo)),
};

export { climateMean, pastDateYearsAgo };

/** Anomaly for timeline map shift: record(Y) − mean(2016–2025). */
export function recordAnomaly(
  series: Record<string, number> | undefined,
  year: number,
): number | null {
  const v = series?.[String(year)];
  const base = climateMean(series);
  if (v == null || base == null || !Number.isFinite(v) || !Number.isFinite(base)) return null;
  return v - base;
}

export type { SimLive, SimRecord };
