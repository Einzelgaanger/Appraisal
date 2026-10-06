import { useLayoutEffect, useRef } from 'react';
import { supabaseUrl } from '@/lib/supabase-client';

function isLocalStack() {
  try {
    const host = new URL(supabaseUrl).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

export default function LocalDevBanner() {
  const local = isLocalStack();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) {
      root.style.setProperty('--app-banner-h', '0px');
      return;
    }
    const apply = () => root.style.setProperty('--app-banner-h', `${el.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--app-banner-h', '0px');
    };
  }, [local]);

  if (!local) return null;
  return (
    <div ref={ref} className="z-[80] shrink-0 bg-amber-400 px-3 py-1.5 text-center text-[11px] font-medium tracking-wide text-amber-950 sm:text-xs">
      Local Docker database — create and delete freely. A push to main does not send this data.
    </div>
  );
}
