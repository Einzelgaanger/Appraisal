/**
 * One command: Docker Supabase + schema + production people + local demo data.
 *
 *   npm run db:local:bootstrap
 */
import { runCommand } from './local-supabase.mjs';

async function main() {
  await runCommand('node', ['scripts/local-db-start.mjs']);
  console.log('\n--- copying production people + roles ---\n');
  await runCommand('node', ['scripts/sync-prod-roster-to-local.mjs']);
  console.log('\n--- seeding local-only demo data ---\n');
  await runCommand('node', ['scripts/seed-local-demo.mjs']);
  console.log('\nLocal stack is ready. Run: npm run dev:local');
  console.log('Open http://localhost:8080/login?tenant=ghc  (or executiveteam / vigipay)');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
