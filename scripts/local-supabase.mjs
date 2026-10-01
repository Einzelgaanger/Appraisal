/**
 * Shared helpers for the local Docker Supabase stack.
 * Production credentials stay in `.env`. Local keys live in `.env.docker` (gitignored).
 */
import pg from 'pg';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv, readEnvFile, projectRoot } from './load-env.mjs';

const { Client } = pg;

export const EXECUTIVE_TEAM_SUBSIDIARY_ID = '11111111-1111-1111-1111-111111111111';
export const GHC_SUBSIDIARY_ID = '22222222-2222-2222-2222-222222222222';
export const VIGIPAY_SUBSIDIARY_ID = '33333333-3333-3333-3333-333333333333';

export const LOCAL_PASSWORDS = {
  [EXECUTIVE_TEAM_SUBSIDIARY_ID]: 'BoomEoDemo2026!',
  [GHC_SUBSIDIARY_ID]: 'GhcDemo2026!',
  [VIGIPAY_SUBSIDIARY_ID]: 'VigiPayDemo2026!',
};

export function isLocalSupabaseUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  } catch {
    return /127\.0\.0\.1|localhost/i.test(url);
  }
}

export function assertLocalSupabaseUrl(url, label = 'target') {
  if (!isLocalSupabaseUrl(url)) {
    console.error(
      `${label} is not a local Docker Supabase URL.\n` +
        `Refusing to continue so production data is not overwritten.\n` +
        `Got: ${url || '(empty)'}\n` +
        `Start the stack with: npm run db:local`,
    );
    process.exit(1);
  }
}

export function passwordForSubsidiary(subsidiaryId) {
  return LOCAL_PASSWORDS[subsidiaryId] || 'BoomEoDemo2026!';
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot(),
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: true,
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    if (options.silent) {
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else {
        const err = new Error(`${command} ${args.join(' ')} exited ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        err.code = code;
        reject(err);
      }
    });
  });
}

export function prodEnv() {
  return readEnvFile('.env');
}

export function localEnv() {
  return readEnvFile('.env.docker');
}

export function prodDatabaseUrls() {
  loadDotEnv({ files: ['.env'] });
  const env = prodEnv();
  if (env.DATABASE_URL?.trim()) return [env.DATABASE_URL.trim()];
  const password = env.SUPABASE_DB_PASSWORD?.trim();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!password || !m) return [];
  const ref = m[1];
  const encoded = encodeURIComponent(password);
  return [
    `postgresql://postgres.${ref}:${encoded}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`,
  ];
}

export async function connectPostgres(urls, { ssl = true } = {}) {
  let lastError = null;
  for (const url of urls) {
    const client = new Client({
      connectionString: url,
      ssl: ssl ? { rejectUnauthorized: false } : false,
    });
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastError = e;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError || new Error('Could not connect to Postgres');
}

export async function connectProdPostgres() {
  const urls = prodDatabaseUrls();
  if (!urls.length) {
    throw new Error('Production DB URL missing. Need SUPABASE_DB_PASSWORD (or DATABASE_URL) in .env');
  }
  return connectPostgres(urls, { ssl: true });
}

export function localDatabaseUrl() {
  const env = localEnv();
  return (
    env.LOCAL_DATABASE_URL ||
    env.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54332/postgres'
  );
}

export async function connectLocalPostgres() {
  const url = localDatabaseUrl();
  assertLocalSupabaseUrl(url, 'LOCAL_DATABASE_URL');
  return connectPostgres([url], { ssl: false });
}

export function localSupabaseAdmin() {
  const env = localEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  assertLocalSupabaseUrl(url, 'local VITE_SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.docker — run npm run db:local');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function tableColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

export async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.length > 0;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function pgValue(value) {
  if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export async function copyTable(prod, local, table, { truncate = false } = {}) {
  if (!(await tableExists(prod, table)) || !(await tableExists(local, table))) {
    console.log(`  skip ${table} (missing on prod or local)`);
    return 0;
  }
  const prodCols = await tableColumns(prod, table);
  const localCols = new Set(await tableColumns(local, table));
  const cols = prodCols.filter((c) => localCols.has(c));
  if (!cols.length) {
    console.log(`  skip ${table} (no shared columns)`);
    return 0;
  }
  const ident = cols.map(quoteIdent).join(', ');
  const { rows } = await prod.query(`SELECT ${ident} FROM public.${quoteIdent(table)}`);
  if (truncate) {
    await local.query(`TRUNCATE TABLE public.${quoteIdent(table)} CASCADE`);
  }
  if (!rows.length) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const hasId = cols.includes('id');
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
    .join(', ');
  const sql = hasId
    ? updates
      ? `INSERT INTO public.${quoteIdent(table)} (${ident}) VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${updates}`
      : `INSERT INTO public.${quoteIdent(table)} (${ident}) VALUES (${placeholders})
         ON CONFLICT (id) DO NOTHING`
    : `INSERT INTO public.${quoteIdent(table)} (${ident}) VALUES (${placeholders})`;
  let copied = 0;
  for (const row of rows) {
    try {
      await local.query(
        sql,
        cols.map((c) => pgValue(row[c])),
      );
      copied += 1;
    } catch (e) {
      if (e.code === '23505' && hasId) {
        await local.query(`DELETE FROM public.${quoteIdent(table)} WHERE id = $1`, [row.id]);
        await local.query(
          `INSERT INTO public.${quoteIdent(table)} (${ident}) VALUES (${placeholders})`,
          cols.map((c) => pgValue(row[c])),
        );
        copied += 1;
        continue;
      }
      throw e;
    }
  }
  console.log(`  ${table}: ${copied} rows`);
  return copied;
}

export function writeLocalEnv(values) {
  const lines = [
    '# Generated by npm run db:local — gitignored. Do not commit.',
    '# Vite --mode docker reads this file. Production keys stay in .env.',
    `VITE_SUPABASE_URL=${values.apiUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${values.anonKey}`,
    `VITE_LOCAL_DEV=true`,
    `VITE_ACTIVE_APPRAISAL_QUARTER=${values.quarter || '2026-Q3'}`,
    `SUPABASE_URL=${values.apiUrl}`,
    `SUPABASE_SERVICE_ROLE_KEY=${values.serviceRoleKey}`,
    `LOCAL_DATABASE_URL=${values.dbUrl}`,
    `DATABASE_URL=${values.dbUrl}`,
    '',
  ];
  writeFileSync(join(projectRoot(), '.env.docker'), lines.join('\n'), 'utf8');
}

export function parseSupabaseStatusEnv(text) {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const json = JSON.parse(trimmed.slice(jsonStart));
      if (json && typeof json === 'object') return json;
    } catch {
      /* fall through to KEY=value */
    }
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
