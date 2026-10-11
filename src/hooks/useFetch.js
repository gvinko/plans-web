import { useCallback, useEffect, useRef, useState } from 'react';

// Run an async loader on mount (and when deps change); run() reloads it.
export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, run, setData };
}
