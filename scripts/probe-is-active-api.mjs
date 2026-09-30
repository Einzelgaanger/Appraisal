import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: f } = await sb.from('assessment_forms').select('id').eq('code', 'peer_360').single();
const r1 = await sb.from('assessment_questions').select('id,is_active').eq('form_id', f.id).limit(3);
console.log('select is_active:', r1.error?.message || JSON.stringify(r1.data));
const r2 = await sb.from('assessment_questions').select('id').eq('form_id', f.id).eq('is_active', true);
console.log('filter is_active=true:', r2.error?.message || `count=${r2.data?.length}`);
