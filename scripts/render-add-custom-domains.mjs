/**
 * Register custom domains on the Render web service (executive + vigipay on vgg.tools).
 *
 * Requires:
 *   RENDER_API_KEY  — Render Dashboard → Account Settings → API Keys
 *   RENDER_SERVICE_ID — optional; if omitted, resolves by RENDER_SERVICE_NAME (default three60appraisal)
 *
 * Usage:
 *   node scripts/render-add-custom-domains.mjs
 *   node scripts/render-add-custom-domains.mjs --apply
 */
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const APPLY = process.argv.includes('--apply');
const API_KEY = process.env.RENDER_API_KEY?.trim();
const SERVICE_ID = process.env.RENDER_SERVICE_ID?.trim();
const SERVICE_NAME = (process.env.RENDER_SERVICE_NAME || 'three60appraisal').trim();

/** Hostnames to attach to the same static site / web service as ghc.vgg.tools */
const CUSTOM_DOMAINS = ['executive.vgg.tools', 'vigipay.vgg.tools'];

if (!API_KEY) {
  console.error('Missing RENDER_API_KEY in .env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function api(path, options = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, { ...options, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function resolveServiceId() {
  if (SERVICE_ID) return SERVICE_ID;
  let cursor;
  do {
    const q = new URLSearchParams({ limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const res = await fetch(`https://api.render.com/v1/services?${q}`, { headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} list services: ${text}`);
    const body = JSON.parse(text);
    for (const row of body) {
      const svc = row.service ?? row;
      const name = svc.name ?? svc.slug;
      if (name === SERVICE_NAME) return svc.id;
    }
    cursor = body.length ? body[body.length - 1]?.cursor : undefined;
  } while (cursor);
  throw new Error(`Service not found: ${SERVICE_NAME}. Set RENDER_SERVICE_ID in .env.`);
}

const serviceId = await resolveServiceId();
console.log(`Render service: ${SERVICE_NAME} (${serviceId})`);

const existing = await api(`/services/${serviceId}/custom-domains`);
const names = new Set(
  (existing ?? []).map((row) => (row.customDomain ?? row).name ?? row.hostname).filter(Boolean),
);

console.log('\nCurrent custom domains on service:');
for (const n of [...names].sort()) console.log(`  • ${n}`);

console.log('\nTarget domains:');
for (const domain of CUSTOM_DOMAINS) {
  const ok = names.has(domain);
  console.log(`  ${ok ? 'OK   ' : 'MISS '} ${domain}`);
  if (!ok && APPLY) {
    await api(`/services/${serviceId}/custom-domains`, {
      method: 'POST',
      body: JSON.stringify({ name: domain }),
    });
    console.log(`       → added ${domain} (DNS CNAME must point at Render — see docs/vgg-tools-domains.md)`);
  }
}

if (!APPLY) {
  console.log('\nRead-only. Re-run with --apply to POST missing domains to Render.');
}
