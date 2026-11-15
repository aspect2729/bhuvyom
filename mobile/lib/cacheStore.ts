/**
 * Persistent cache for Open-Meteo responses (AsyncStorage).
 * TTLs follow android-handoff docs/04-data-and-apis.md §7.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@bfo/cache/';

export const TTL = {
  liveMs: 20 * 60 * 1000,
  /** Past days are immutable once written. */
  pastMs: Number.POSITIVE_INFINITY,
  recordMs: 365 * 24 * 60 * 60 * 1000,
  era5MonthMs: 30 * 24 * 60 * 60 * 1000,
} as const;

type Entry<T> = { at: number; data: T };

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.at !== 'number') return null;
    if (Number.isFinite(ttlMs) && Date.now() - entry.at > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const entry: Entry<T> = { at: Date.now(), data };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full / unavailable — keep going with memory-only path.
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
