import { useCallback, useRef } from 'react';

/**
 * The first load may show a spinner. Later saves and tab changes update the
 * data that is already on screen.
 */
export function useQuietLoader(setLoading: (loading: boolean) => void) {
  const shown = useRef(false);
  const start = useCallback(() => {
    if (!shown.current) setLoading(true);
  }, [setLoading]);
  const finish = useCallback(() => {
    shown.current = true;
    setLoading(false);
  }, [setLoading]);
  return { start, finish };
}
