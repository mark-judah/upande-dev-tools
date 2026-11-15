import { useCallback, useEffect, useRef, useState } from 'react';
import { mapAxiosError } from '@/core/api/client';

/** Latest-wins loader for a screen's data: { data, loading, error, reload }. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  const fetchOnce = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const result = await fnRef.current();
      if (mine === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(mapAxiosError(e).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await fetchOnce();
  }, [fetchOnce]);

  // First load: `loading` already starts true, so no state is set before the request resolves.
  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { data, loading, error, reload };
}
