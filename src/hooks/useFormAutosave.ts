import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Writes a form shortly after the person changes it, and again when they leave.
 * The snapshot already loaded from the database is not written back.
 */
export function useFormAutosave(enabled: boolean, value: unknown, save: () => Promise<void>) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const skipLoaded = useRef(true);
  const edited = useRef(false);
  const warned = useRef(false);
  const token = JSON.stringify(value);

  const run = () => {
    if (!enabledRef.current || !edited.current) return;
    void saveRef.current().catch((error: unknown) => {
      if (warned.current) return;
      warned.current = true;
      const message = error instanceof Error ? error.message : '';
      toast.error(message || 'Could not save the draft');
    });
  };

  useEffect(() => {
    if (!enabled) {
      skipLoaded.current = true;
      edited.current = false;
      return;
    }
    if (skipLoaded.current) {
      skipLoaded.current = false;
      return;
    }
    edited.current = true;
    warned.current = false;
    const timer = window.setTimeout(run, 700);
    return () => window.clearTimeout(timer);
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) return;
    const onLeave = () => run();
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      run();
    };
  }, [enabled]);
}
