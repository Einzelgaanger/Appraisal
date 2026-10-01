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
  if (!isLocalStack()) return null;
  return (
    <div className="sticky top-0 z-[80] bg-amber-400 text-amber-950 text-center text-[11px] sm:text-xs font-medium tracking-wide py-1.5 px-3">
      Local Docker database — create and delete freely. A push to main does not send this data.
    </div>
  );
}
