import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-fetch without clearing what is already on screen. */
  reload: () => Promise<void>;
  /** Optimistic local update; the next reload overwrites it. */
  set: (updater: (prev: T) => T) => void;
}

/**
 * Small data hook: fetch on mount, refetch when `path` changes, and reload on
 * demand after a mutation. Deliberately not a cache — this is a single-user
 * app where fresh-on-navigate is the correct default.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    const id = ++requestId.current;
    try {
      const res = await api.get<T>(path);
      if (id !== requestId.current) return;   // a newer request already won
      setData(res);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const set = useCallback((updater: (prev: T) => T) => {
    setData((prev) => (prev == null ? prev : updater(prev)));
  }, []);

  return { data, error, loading, reload: load, set };
}
