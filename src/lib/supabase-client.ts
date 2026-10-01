import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Default project (supabase/config.toml). Anon key is public (client bundle); override with VITE_* for another env. */
const DEFAULT_SUPABASE_URL = 'https://qnorggoycwbbxdlvbcvq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFub3JnZ295Y3diYnhkbHZiY3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0Njc2MzIsImV4cCI6MjEwNTA0MzYzMn0.p5u-b8QH1PIuiS1QWs716K-nporm3gnM4P1QDe-eQZg';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const localMode =
  import.meta.env.MODE === 'docker' || import.meta.env.VITE_LOCAL_DEV === 'true';
if (localMode) {
  const host = (() => {
    try {
      return new URL(configuredUrl).hostname;
    } catch {
      return '';
    }
  })();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      'dev:local must use the Docker Supabase URL in .env.docker (127.0.0.1). Run npm run db:local first.',
    );
  }
}

const supabaseUrl = configuredUrl || DEFAULT_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;
const localStack = /127\.0\.0\.1|localhost/.test(supabaseUrl);

export { supabaseUrl, supabasePublishableKey };

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: localStack ? 'sb-local-docker-auth' : undefined,
  },
});

export const getFunctionUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
