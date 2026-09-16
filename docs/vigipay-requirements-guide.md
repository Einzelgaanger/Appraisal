# VigiPay appraisal — requirements intake guide

Give VigiPay the Excel workbook **`docs/vigipay-appraisal-requirements-pack.xlsx`** plus this guide. They fill the workbook once; we build from the return pack without re-discovery.

## What to send them

1. `vigipay-appraisal-requirements-pack.xlsx` (27 sheets)
2. This markdown (optional for their coordinator)
3. Ask them to return one zip: filled workbook + logos + original form PDFs/Docs

## Why Excel (not a meeting)

Every sheet maps to a concrete build input: tenant config, profile dropdowns, reporting graph, assignment engine, form schemas, scoring, privacy, admin release, notifications, branding. Blank cells = blocked build.

## Must-complete sheets (blockers)

| Sheet | Why it blocks |
|-------|----------------|
| `03_Org_Roster` | Accounts, hierarchy seed, who is active |
| `07_Reporting_Lines` | Who gets monthly / eval write tasks |
| `08_Appraisal_Products` | Which modules we ship |
| `10_Assignment_Rules` | Task generation logic |
| `11_Form_Monthly` / `12_Form_360` / `13_Form_Quarterly_Eval` | Exact UI + DB fields |
| `16_Scoring_Bands` | Totals, labels, HR implications |
| `01_Company_Identity` + `23_Branding_Assets` | Hostname, colours, logos |

## How GHC worked (reference for “same / different”)

VigiPay should mark `24_Unique_vs_GHC` clearly. For awareness only:

- **Company** (not “Subsidiary”) in profile
- **Teams** and **Roles** and **Seniority / Level** are three separate lists
- **Monthly**: manager → each direct
- **Peer 360**: everyone ↔ everyone (exclude self); anonymous aggregates; HR release
- **Quarterly eval**: manager → directs only; Culture + Technical + Growth → /35; acknowledge + discussion
- **Partner board**: promote / salary / bonus / PIP-style actions after eval
- **Dual managers**: possible (primary + secondary both write in some cases)
- **Vacant seats**: inactive, no tasks
- Tenant URL pattern: `*.vgg.app` + `?tenant=` for local

If VigiPay says “same as GHC” on a row, we reuse that rule. If different, they must spell the rule in full on that sheet.

## Coordinator checklist before they send back

- [ ] Every active person is on `03_Org_Roster` with login email
- [ ] Every reporting line is on `07` (or covered by roster manager columns)
- [ ] Official Teams / Roles / Levels lists filled (not free-text chaos)
- [ ] Each appraisal product Y/N on `08`
- [ ] Every form question pasted into Form sheets (attachments alone are not enough)
- [ ] Scoring total + band table filled
- [ ] Anonymity + release owners named
- [ ] Logos + hex colours provided
- [ ] `26_Open_Decisions` empty or every row has a final answer
- [ ] `25_Scenarios` filled for at least the default cases

## After they return

We will:

1. Diff against GHC (sheet 24 + forms)
2. Design VigiPay tenant config + branding
3. Seed org + reporting
4. Implement forms / assignment / scoring only where they diverge
5. Smoke the scenarios on sheet 25

## Contact for questions while filling

Route clarifying questions through the day-to-day coordinator listed on sheet `02_Contacts` so answers land in the workbook, not chat history.
