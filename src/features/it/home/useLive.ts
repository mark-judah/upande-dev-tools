import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { mapAxiosError } from '@/core/api/client';

/**
 * Loads data for an IT screen and keeps it fresh: pull to refresh, an optional foreground poll
 * that runs only while the screen is focused and the app is active, and "updated Xs ago".
 * Polls are silent (no spinner); `loading` is true only until the first answer.
 */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[], pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  const seq = useRef(0);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (silent: boolean) => {
    const mine = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const r = await fnRef.current();
      if (mine !== seq.current) return;
      setData(r);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (mine !== seq.current) return;
      // A failed poll keeps what is on screen; only a user-driven load shows the error.
      if (!silent) setError(mapAxiosError(e).message);
    } finally {
      if (mine === seq.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so the load's first state change is not made synchronously inside the effect.
    queueMicrotask(() => run(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      if (!pollMs) return;
      const id = setInterval(() => {
        if (AppState.currentState === 'active') run(true);
      }, pollMs);
      return () => clearInterval(id);
    }, [pollMs, run]),
  );

  return { data, loading, error, updatedAt, reload: () => run(false), refresh: () => run(true), setData };
}

/** Re-renders every few seconds so "updated Xs ago" stays true. */
export function useTick(ms = 5000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function ago(ts: number | null): string {
  if (!ts) return 'not yet';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

/** Seconds left until `until` (epoch ms), ticking each second; 0 when done. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until || until <= Date.now()) return;
    queueMicrotask(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}
