import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineError } from '@/lib/api';

/**
 * Tiny fetch hook with an in-memory cache shared across screens
 * (Simulation and Compare both need /api/site/sim/live, which can take a while upstream).
 */
type Entry<T> = { at: number; data: T };
const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function errorText(e: unknown): string {
  if (e instanceof EngineError) return e.detail.reason;
  if (e instanceof Error) return e.message;
  return String(e);
}

type State<T> = { key: string; data: T | null; error: string | null; loading: boolean };

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  /** true only while there is nothing to show yet */
  loading: boolean;
  /** true while a manual reload is running (previous data stays visible) */
  refreshing: boolean;
  reload: () => void;
};

export type FetchOpts = { force?: boolean };

export function useApi<T>(
  key: string,
  fn: (opts?: FetchOpts) => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): ApiState<T> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const forceRef = useRef(false);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<State<T>>(() => {
    const hit = cache.get(key) as Entry<T> | undefined;
    return { key, data: hit?.data ?? null, error: null, loading: !hit };
  });

  useEffect(() => {
    let alive = true;
    const force = forceRef.current;
    forceRef.current = false;
    const hit = cache.get(key) as Entry<T> | undefined;

    if (hit && !force && Date.now() - hit.at < ttlMs) {
      setState({ key, data: hit.data, error: null, loading: false });
      return;
    }

    setState((s) =>
      s.key === key && s.data ? { ...s, error: null } : { key, data: hit?.data ?? null, error: null, loading: !hit },
    );
    if (force) setRefreshing(true);

    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p || force) {
      p = fnRef.current({ force });
      inflight.set(key, p);
    }
    p.then(
      (data) => {
        cache.set(key, { at: Date.now(), data });
        if (inflight.get(key) === p) inflight.delete(key);
        if (alive) {
          setState({ key, data, error: null, loading: false });
          setRefreshing(false);
        }
      },
      (e) => {
        if (inflight.get(key) === p) inflight.delete(key);
        if (alive) {
          setState((s) => ({
            key,
            data: s.key === key ? s.data : null,
            error: errorText(e),
            loading: false,
          }));
          setRefreshing(false);
        }
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const reload = useCallback(() => {
    forceRef.current = true;
    setTick((t) => t + 1);
  }, []);

  if (state.key !== key) {
    const hit = cache.get(key) as Entry<T> | undefined;
    return { data: hit?.data ?? null, error: null, loading: !hit, refreshing, reload };
  }
  return { data: state.data, error: state.error, loading: state.loading, refreshing, reload };
}
