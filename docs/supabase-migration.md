# Supabase Migration (Old → New) — completed runbook

## Projects

| Role | Name | Ref |
|------|------|-----|
| OLD (source) | VGG 360 Appraisal Project | `sgttsotrvemmgmujcuay` |
| NEW (target) | Company Appraisals Project | `qnorggoycwbbxdlvbcvq` |

## What was migrated (2026-09-16)

1. **Schema** — all local SQL migrations pushed to NEW (including multi-tenant + GHC).
2. **Auth data** — `auth.*` dump restored (~47 users).
3. **Public data** — truncated seed rows, then full public dump restored (`employees` 35, `profiles` 47, `assessment_responses` 115, `subsidiaries` 2).
4. **App config** — `.env`, `supabase/config.toml`, and client defaults point at NEW.

## Still needed: edge functions

CLI must be logged into the **VGG Tools** account that owns Company Appraisals:

```bash
npx supabase logout --yes
npx supabase login
npx supabase link --project-ref qnorggoycwbbxdlvbcvq
node scripts/migrate-old-to-new-supabase.mjs functions
```

Then set function secrets (from `.env`):

```bash
npx supabase secrets set --project-ref qnorggoycwbbxdlvbcvq CLAUDE_API_KEY=... CLAUDE_MODEL=... PERPLEXITY_API_KEY=... PERPLEXITY_MODEL=... RECOMMENDATION_EVALUATE_TOKEN=...
```

## Scripts

- `scripts/migrate-old-to-new-supabase.mjs` — `push` | `dump` | `restore` | `functions` | `switch-env` | `all`
- `scripts/fix-public-restore.mjs` — truncate + reload public data

## Auth note

User passwords migrated with `auth.users`. After switching, restart `npm run dev` and smoke-test login. Clear site localStorage if an old-project session sticks.
