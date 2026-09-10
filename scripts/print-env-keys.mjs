import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

for (const k of Object.keys(env).filter((x) => /SUPABASE|DATABASE|DB_/i.test(x)).sort()) {
  const v = env[k] || '';
  const redact = /KEY|TOKEN|PASSWORD|SECRET/i.test(k);
  console.log(`${k}: ${redact ? `${v.slice(0, 10)}...len${v.length}` : v || 'EMPTY'}`);
}
