# GHC appraisal — live demo script (local)

Use this as a click-path + what to say. No timings. Stay on GHC the whole time.

**Base URL:** `http://localhost:8080`  
**Always append:** `?tenant=ghc` (or open hub as below) so you are not in Executive Team / BOOM.

**Accounts**

| Who | Email | Password | What they show |
|-----|--------|----------|----------------|
| Uloma (manager) | `uloma.herrington@greenhouse.capital` | `GhcDemo2026!` | Full manager workload |
| Faith (IC) | `faith.aminaho@greenhouse.capital` | `GhcDemo2026!` | Peer 360 only |
| Bunmi (top + admin) | `bunmi.akinyemiju@peopleos.co` | your normal password | Uloma as report + Monitor if admin |
| Busayo / Omotola / others | `@greenhouse.capital` / Fiyin `@venturegardengroup.com` | `GhcDemo2026!` | Same pattern as Uloma/Faith by line |

**Hub:** `http://localhost:8080/hub?tenant=ghc&tab=survey`

---

## PAGE: Login

`http://localhost:8080/login?tenant=ghc`  
Sign in as **Uloma**.

**SAY:**  
This is GreenHouse Capital’s appraisal. Same platform and auth as Executive Team, different product once you’re in GHC — different forms, scoring, and cadence. Live host is `ghc.vgg.tools`. Locally `tenant=ghc` (or a `@greenhouse.capital` login) forces that mode so we are not looking at BOOM.

---

## PAGE: Appraisal → Tasks (Uloma)

`http://localhost:8080/hub?tenant=ghc&tab=survey`  
Stay on **Tasks**. Point at month/quarter pickers, Refresh, and the managing / peer-reviewer badge if shown.

**SAY:**  
Assignments follow the real GHC line, not a generic manager flag.

- Bunmi (L1) → Uloma (L2) → Busayo, Omotola, Phebean, Fiyin (L3).  
- Mariam: Busayo primary, Omotola secondary — both get her monthly and quarterly write work.  
- Faith → Phebean; Anjola → Omotola.  
- Vacant roles are inactive — no tasks, no 360 targets.

Uloma manages four people, so Tasks shows:

1. **Monthly manager reviews** — one per direct (and secondary where dual).  
2. **Quarterly performance evaluations** — same people; formal scored report.  
3. **Quarterly 360** — every other active roster person (eight peers).  
4. **Acknowledge** — only if someone submitted an evaluation *on you* (employees, not managers writing).

Same hub for everyone. More reports → more write tasks. No directs → mostly 360s (and acknowledge when your eval is in). Periods are controlled by the month/quarter selectors; Refresh reloads status (todo / draft / submitted / acknowledged).

---

## PAGE: Monthly manager review (dialog)

From Tasks → **Start/Continue** on any monthly row (e.g. Busayo or Phebean). Scroll the form; no need to submit unless you want a live notification.

**SAY:**  
Monthly is the manager–report 1:1 layer. Capture how they’re doing: pride, personal issues, whether the company can help, motivation, fulfilment, time off, looking ahead, OKRs, growth, relationship strength, policy feedback. Then rate the five GHC culture values (1–5): founders & LPs, voraciously curious, move fast & detail-oriented, overachievement, job isn’t done until it’s done — with room for feedback to/from the report and extra comments.

Save draft anytime; submit notifies the report (in-app bell; email uses the same transactional queue as EO). Close when you’ve shown the shape.

---

## PAGE: Quarterly performance evaluation (dialog)

Tasks → open a **Quarterly performance evaluation** for a direct. Scroll scores, strengths/improvements, goals, partner notes.

**SAY:**  
This is the formal quarterly report. Indicators: technical (OKRs / quality / impact), the five culture values, and growth potential. Scoring:

- Culture: sum of five culture scores → **/25**  
- Technical: **/5**  
- Growth: **/5**  
- Total **/35** → % → band (exceptional / exceeds / meets / needs improvement / unacceptable)

You add strengths, improvements, improvement goals (area, goal, indicator, timeline, reviewer), and optional **manager recommendations** against partner actions (promote, salary review, spot bonus, confirm resource, growth coaching, PIP, demotion, no action). Managers recommend; HR/partners finalise decisions on Monitor.

On submit: employee gets an acknowledge task + notification; discussion thread can open between manager and report. Partner recommendation rows are created for HR. Close the dialog.

---

## PAGE: Quarterly 360 (dialog)

Tasks → open any **Quarterly 360**. Show culture scores + example fields + free text.

**SAY:**  
Peer 360 is quarterly and **hybrid**: HR can see reviewer identity for integrity; the subject only sees **anonymous aggregates** after People Ops releases the period (averages and themes — not names). Rate all five culture values with examples; optional “did well” / comments. Everyone active reviews everyone else (minus yourself / duplicate identity). Managers do 360s in addition to monthly and eval write work. Close.

---

## PAGE: Directory

Still Uloma (or after Faith — either works). Hub → **Directory**.

**SAY:**  
Completion view for the active roster: monthly done or open, how many 360s are in per person, whether a quarterly eval is submitted/acknowledged. Managers can filter to **Your reports** so the line is obvious. Useful for chasing completion without leaving the hub.

---

## PAGE: My results

Hub → **My results**.

**SAY:**  
Your own outcomes: anonymous 360 block (held until release — you’ll see peer count before release, charts/themes after). Submitted evaluations on you — score /35, %, band, acknowledge if still open, and the discussion thread with your manager. Dashboard tab in the main shell also surfaces My results for GHC.

---

## PAGE: AI assist (if the tab is on)

Hub → **AI assist**.

**SAY:**  
Optional draft help for managers — paste monthly notes or 360 themes and get a scaffold for strengths, gaps, goals, culture narrative. Humans still own every score; HR expects evidence. Skip if the flag is off.

---

## PAGE: Switch to Faith (IC contrast)

Sign out → Faith → `http://localhost:8080/hub?tenant=ghc&tab=survey`

**SAY:**  
Same product, different seat. No directs → no monthly/eval write sections — peer 360s only (plus acknowledge if her manager already submitted). That contrast is the manager-access story without a separate manager app.

Quick peek: Directory (no “your reports” unless she manages someone), My results (her 360 / eval state).

---

## PAGE: Bunmi + Monitor (optional)

Sign out → Bunmi → same GHC hub. If **Monitor** appears (platform admin):

**SAY:**  
People Ops layer: roster and completion counts, **release peer 360** (subjects then see aggregates), mark eval period released, pick a submitted evaluation and fill **partners decision** notes on the action board. Managers already left recommendations on the eval form; this is where partners/HR decide.

If Monitor is missing, skip — don’t stop the flow.

---

## PAGE: Close (any GHC hub screen)

**SAY:**  
Recap: one codebase, two subsidiaries. EO keeps BOOM. GHC gets monthly manager reviews, quarterly hybrid 360, formal eval weighted culture/technical/growth out of 35 with acknowledge + discussion, partner actions for HR, directory completion, notifications (bell + email), and optional AI draft assist. Org chart — including Mariam’s dual line — drives who sees what. Local `tenant=ghc` is the same product as `ghc.vgg.tools`. Happy to take process questions.

---

## Feature checklist (don’t re-narrate; use if asked)

| Feature | Where |
|--------|--------|
| Tenant / host split | `?tenant=ghc` locally; `ghc.vgg.tools` in prod; EO stays `executive.vgg.tools` |
| Hierarchy + dual reports | Tasks + Directory; Mariam → Busayo + Omotola |
| Monthly 1:1 | Tasks → monthly dialog |
| Quarterly eval + /35 bands | Tasks → eval dialog |
| Manager partner recommendations | Bottom of eval form |
| Acknowledge + discussion | Tasks / My results after submit |
| Hybrid 360 + release gate | 360 dialog; Monitor release; My results aggregate |
| Directory / your reports | Directory tab |
| Notifications | Bell (top); email on submit/ack/release/discussion |
| AI draft assist | AI assist tab (if enabled) |
| Admin completion + partners board | Monitor (admin) |
| Periods | Month + quarter selectors on hub |
| Draft vs submit | Status badges on Tasks |
| Growth tab (GHC) | Light pointer to eval goals / culture — not full EO Growth Hub |

---

## If something breaks mid-demo

Stay on **Uloma → Tasks**. Talk the three cadences (monthly / eval / 360) from the list alone. Faith contrast is the backup beat. Monitor is optional.
