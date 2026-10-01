import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function applyEnvText(text, { override = false } = {}) {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (override || process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

/** Parse a dotenv file into an object. Missing files return {}. */
export function readEnvFile(filename) {
  const p = join(root, filename);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load env files into process.env.
 * Default: `.env` only, does not overwrite existing vars (legacy behaviour).
 */
export function loadDotEnv(options = {}) {
  const files = options.files ?? ['.env'];
  const override = options.override === true;
  for (const file of files) {
    const p = join(root, file);
    if (!existsSync(p)) continue;
    applyEnvText(readFileSync(p, 'utf8'), { override });
  }
}

export function projectRoot() {
  return root;
}
