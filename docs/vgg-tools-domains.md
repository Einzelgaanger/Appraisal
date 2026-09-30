# Production hosts on `vgg.tools`

One Render web service hosts the app. Three custom domains pin the tenant:

| Host | Tenant | Mode today |
|------|--------|------------|
| `executive.vgg.tools` | Executive Team (BOOM) | Live |
| `ghc.vgg.tools` | GreenHouse Capital | Live |
| `vigipay.vgg.tools` | VigiPay | Coming soon (host + branding ready) |

Local: `http://localhost:8080/?tenant=ghc` (or `vigipay` / `executiveteam`).

---

## 1) DNS (wherever `vgg.tools` is managed)

Create **three CNAME** records pointing at your Render service hostname (e.g. `vggtools.onrender.com`):

| Type | Name / host | Value / target |
|------|-------------|----------------|
| CNAME | `executive` | `vggtools.onrender.com` |
| CNAME | `ghc` | `vggtools.onrender.com` |
| CNAME | `vigipay` | `vggtools.onrender.com` |

(If Render shows a different target for custom domains, use that exact value.)

---

## 2) Render → Custom domains

On the **same** Web Service that serves `vggtools.onrender.com`:

1. **Settings → Custom Domains → Add**
2. Add each:
   - `executive.vgg.tools`
   - `ghc.vgg.tools`
   - `vigipay.vgg.tools`
3. Wait until each shows **Verified / Certificate issued**

Env vars stay the same (one Supabase project). Tenant is chosen from the **subdomain**, not from separate deploys.

---

## 3) Supabase Auth redirect URLs

**Company Appraisals** project → **Authentication → URL configuration**

**Site URL** (product apex — fallback only when a redirect is not allow-listed; tenant apps live on subdomains):

```text
https://vgg.tools
```

Automated patch (same values as above): `node scripts/configure-auth-redirects.mjs --apply` with `SUPABASE_ACCESS_TOKEN` in `.env`.

**Redirect URLs** (add all — include wildcards if your plan allows):

```text
https://executive.vgg.tools/**
https://ghc.vgg.tools/**
https://vigipay.vgg.tools/**
https://vgg.tools/**
https://*.vgg.tools/**
https://three60appraisal.onrender.com/**
http://localhost:8080/**
```

Or from the repo (needs `SUPABASE_ACCESS_TOKEN` in `.env`):

```bash
npm run setup:production-hosts -- --apply
```

---

## 4) Apply DB migration (domains + VigiPay subsidiary)

From the repo (linked to the new project):

```bash
npx supabase db push --db-url "postgresql://postgres.qnorggoycwbbxdlvbcvq:NEW_DB_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" --yes
```

Or run `supabase/migrations/20260916160000_vgg_tools_domains_and_vigipay.sql` in the SQL editor.

---

## 5) Smoke test

1. `https://executive.vgg.tools` → Executive Team onboarding / BOOM hub  
2. `https://ghc.vgg.tools` → GHC branding + GHC hub  
3. `https://vigipay.vgg.tools` → VigiPay coming-soon workspace  

Password recovery / magic links must land back on the same host the user started from (covered by redirect allow-list above).
