import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Section = {
  id: string;
  num: string;
  title: string;
  body: JSX.Element;
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    num: "01",
    title: "System Overview",
    body: (
      <>
        <p>
          The BOOM Appraisal Platform is a private, invite-only performance and 360 feedback system for the
          Executive Office of the GCEO at Venture Garden Group (VGG). It is the production application behind{" "}
          <code>executive.vgg.tools</code>: each user is routed to the reviews they must complete based on their place
          in the EO org chart, and recipients of peer 360 feedback see only anonymous aggregates.
        </p>
        <h3>Core capabilities</h3>
        <ul>
          <li>Assessment forms — Monthly Self-Assessment, Quarterly 360 Peer Review (anonymous to the recipient), EA quarterly manager evaluation, and Executive Performance Assessment where assigned.</li>
          <li>Automatic routing — Postgres functions decide who reviews whom, per form, per period, from the EO org chart and explicit pairings (e.g. EA quarterly).</li>
          <li>Anonymity enforcement — 360 results are read only through security-definer RPCs that never return reviewer identity; recipients see aggregated scores and themes only.</li>
          <li>Discussions — routed threads between subjects and facilitators after submissions (monthly self, EA quarterly, peer 360 oversight).</li>
          <li>Admin monitoring — roster, period control, completion tracking, and export.</li>
          <li>Optional AI assistants — admin analytics assistant and employee Growth Hub resource recommendations (server-side only; advisory; never writes assessment scores).</li>
          <li>Branded auth flow — VGG-branded transactional emails via a queued edge-function pipeline.</li>
        </ul>
        <h3>Product principles</h3>
        <ul>
          <li>Invite-only EO pilot: each signed-in user sees only the tasks and results their role allows.</li>
          <li>Light, readable UI oriented to completing assessments on desktop and mobile.</li>
          <li>Mobile-friendly surveys: clear progress, draft auto-save, explicit submit.</li>
        </ul>
      </>
    ),
  },
  {
    id: "architecture",
    num: "02",
    title: "Architecture",
    body: (
      <>
        <h3>High-level topology</h3>
        <p>
          Browser (React 18 SPA over HTTPS) → static host at <code>executive.vgg.tools</code> → Supabase
          (Postgres, Auth, Storage, Edge Functions). The backend uses an RLS-locked <code>public</code> schema,
          invite-only email/password auth, a public <code>email-assets</code> storage bucket, and Deno edge
          functions for provisioning, email dispatch (<code>pgmq</code> + <code>pg_cron</code>), and optional AI
          helpers. Outbound integrations: Anthropic Claude and Perplexity (when AI features are enabled), and an
          SMTP relay on <code>notify.vgg.tools</code>.
        </p>
        <h3>Frontend stack</h3>
        <table>
          <thead><tr><th>Layer</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Framework</td><td>React 18 + Vite 5 + TypeScript 5</td></tr>
            <tr><td>Styling</td><td>Tailwind CSS v3 (design tokens in <code>index.css</code>)</td></tr>
            <tr><td>Components</td><td>Accessible UI primitives (Radix-based)</td></tr>
            <tr><td>Routing</td><td>react-router-dom</td></tr>
            <tr><td>State / data</td><td>@tanstack/react-query + Supabase JS client</td></tr>
            <tr><td>Forms</td><td>react-hook-form + zod</td></tr>
            <tr><td>Charts</td><td>Recharts</td></tr>
            <tr><td>Auth client</td><td>@supabase/supabase-js</td></tr>
          </tbody>
        </table>
        <h3>Backend stack</h3>
        <table>
          <thead><tr><th>Layer</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Database</td><td>PostgreSQL (Supabase-hosted)</td></tr>
            <tr><td>Auth</td><td>Email/password (invite-only; no public signup)</td></tr>
            <tr><td>Server logic</td><td>Edge Functions (Deno + TypeScript)</td></tr>
            <tr><td>Queue</td><td>pgmq (auth + transactional email queues)</td></tr>
            <tr><td>Scheduler</td><td>pg_cron (dispatcher when the email queue is armed)</td></tr>
            <tr><td>Storage</td><td>Bucket <code>email-assets</code> (public imagery only)</td></tr>
            <tr><td>Access control</td><td>Row Level Security + <code>user_roles</code> + <code>has_role()</code></td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "data-access",
    num: "03",
    title: "Data Access & Usage",
    body: (
      <>
        <p>
          All application data lives in a single Postgres 15 database, in the RLS-locked <code>public</code> schema.
          The only other store is the public <code>email-assets</code> bucket for email imagery — no personal data.
          The frontend is a static SPA and stores nothing itself; a browser only ever receives what RLS and the
          security-definer RPCs permit for the signed-in user. Transactional email bodies are never stored — only
          send-log metadata. Backups use point-in-time recovery.
        </p>
        <h3>How data gets there</h3>
        <table>
          <thead><tr><th>Data class</th><th>Source</th><th>Cadence</th><th>Access</th></tr></thead>
          <tbody>
            <tr><td>Employee roster <code>employees</code></td><td>Admin import by the EO</td><td>Ad hoc; deactivated, not deleted</td><td>Read: authenticated EO. Write: admin only.</td></tr>
            <tr><td>Auth accounts <code>profiles</code></td><td><code>bulk-create-users</code> + first-login completion</td><td>Ad hoc</td><td>Self + admin.</td></tr>
            <tr><td>Assessments <code>assessment_responses / _answers</code></td><td>Reviewer in-app (draft → submit)</td><td>Monthly (self), Quarterly (360, EPA, EA)</td><td>Reviewer: own rows. Reviewee: aggregated / anonymised via RPCs only (no reviewer names). Admin: monitoring + export.</td></tr>
            <tr><td>Peer comments <code>assessment_peer_comments</code></td><td>Entered in-app</td><td>Quarterly</td><td>Reviewer: own rows. Reviewee: anonymised RPC, text only.</td></tr>
            <tr><td>Email metadata <code>email_send_log</code></td><td>Queue pipeline at send time</td><td>Per send (5s dispatcher)</td><td>Service role (pipeline); bodies never stored.</td></tr>
            <tr><td>AI context</td><td>Assembled server-side per request</td><td>On demand</td><td>Sent to Anthropic / Perplexity APIs; transient; advisory only.</td></tr>
          </tbody>
        </table>
        <h3>No inbound integrations</h3>
        <ul>
          <li>The platform pulls nothing from VGG systems — no Microsoft 365, HRIS, or automated feeds. All external calls are outbound only (Claude, Perplexity, SMTP relay).</li>
          <li>Every write originates from an authenticated EO user acting in the app, or from an explicit admin action.</li>
          <li>AI is advisory only: context is assembled server-side per request, sent to the provider APIs, and never written back to <code>assessment_*</code> tables. Reviewer identity is never included for <code>peer_360</code>.</li>
        </ul>
        <h3>Data received from VGG to date</h3>
        <p>
          The only VGG data received to date is the set of Microsoft 365 usage exports (Excel workbooks) shared by
          the GCEO from the Microsoft 365 admin centre for the Group productivity and digital engagement review:
          Email activity, Teams activity, OneDrive activity and usage, SharePoint activity and site usage, Microsoft 365
          readiness exports, and the VGG user roster. Those files are held and processed separately for that review and are
          not loaded into this platform. No other VGG data has been received — no HRIS extracts, no direct access to
          VGG systems, no automated feeds. The EO roster used by this platform (name, work email, role, vertical,
          hierarchy level) was supplied by the Executive Office for provisioning.
        </p>
      </>
    ),
  },
  {
    id: "domain-model",
    num: "04",
    title: "Domain Model",
    body: (
      <>
        <h3>Organisational entities</h3>
        <table>
          <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>subsidiaries</code></td><td>Single row: “Executive Office of the GCEO”.</td></tr>
            <tr><td><code>employees</code></td><td>18+ people in the EO. Name, email, role, vertical, hierarchy_level, manager linkage.</td></tr>
            <tr><td><code>profiles</code></td><td>1:1 with <code>auth.users</code>. Linked to employees by <code>lower(email)</code>.</td></tr>
            <tr><td><code>user_roles</code></td><td>Separate role assignments (<code>admin</code>, <code>moderator</code>, <code>user</code>). Checked via <code>has_role(uid, role)</code>.</td></tr>
          </tbody>
        </table>
        <h3>Hierarchy convention (EO)</h3>
        <p>
          Lower <code>hierarchy_level</code> = more senior (0 = GCEO, 1 = Executive, 2 = Manager, 3 = Employee). This
          is the opposite of the legacy VGG dataset; the <code>subsidiaries.hierarchy_lower_is_senior</code> flag
          selects the convention at runtime (see <code>src/lib/hierarchyConvention.ts</code>).
        </p>
        <h3>Assessment entities</h3>
        <table>
          <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>assessment_forms</code></td><td>Form definitions: <code>executive</code>, <code>peer_360</code>, <code>monthly_self</code>, <code>ea_quarterly</code>, <code>epa_gceo_assessor</code>.</td></tr>
            <tr><td><code>assessment_questions</code></td><td>Question bank per form: section, text, type (<code>scored | written | values</code>), min word counts.</td></tr>
            <tr><td><code>assessment_responses</code></td><td>One row per (form, reviewer, reviewee, period). Status: <code>todo | draft | submitted</code>.</td></tr>
            <tr><td><code>assessment_answers</code></td><td>One row per (response, question) with score (1–5) and/or text, plus a no-opportunity flag.</td></tr>
            <tr><td><code>assessment_peer_comments</code></td><td>Anonymous downward narrative comments.</td></tr>
            <tr><td><code>review_completions</code></td><td>Marks a reviewer’s pass through a form as complete for a period.</td></tr>
          </tbody>
        </table>
        <h3>Legacy tables kept for read-only demo / analytics</h3>
        <ul>
          <li><code>appraisal_responses</code> / <code>manager_summaries</code> — power original VGG dashboards.</li>
          <li><code>demo_appraisal_responses</code> / <code>demo_manager_summaries</code> — <code>/demo</code> mock dataset.</li>
          <li><code>survey_*</code> — original anonymous 360 (superseded by <code>assessment_*</code>).</li>
        </ul>
      </>
    ),
  },
  {
    id: "routing",
    num: "05",
    title: "Routing Logic · Who Reviews Whom",
    body: (
      <>
        <p>
          The single source of truth is the Postgres function{" "}
          <code>public.get_review_assignments(_period text)</code>. It joins the caller’s <code>employees</code> row
          to the target set defined by the rules below, then left-joins existing{" "}
          <code>assessment_responses</code> to report each row’s status.
        </p>
        <table>
          <thead><tr><th>Caller</th><th>Form</th><th>Reviewees / behaviour</th></tr></thead>
          <tbody>
            <tr><td>Everyone (active EO)</td><td><code>monthly_self</code></td><td>Self (monthly period)</td></tr>
            <tr><td>Everyone (active EO)</td><td><code>peer_360</code></td><td>Every other active EO colleague (full roster; not self)</td></tr>
            <tr><td>Flagged L0/L1</td><td><code>executive</code></td><td>Self performance assessment where <code>appraisal_self_performance</code> is set</td></tr>
            <tr><td>Configured managers</td><td><code>ea_quarterly</code></td><td>Explicit pairs in <code>eo_ea_quarterly_pairs</code> (line manager → report)</td></tr>
            <tr><td>EPA assessors</td><td><code>epa_gceo_assessor</code></td><td>Assigned executive self reviews (where enabled)</td></tr>
          </tbody>
        </table>
        <p>
          L2+ team members typically see Tasks only (monthly self, peer 360, and EA quarterly if they are a configured
          manager). L0/L1 additionally get oversight surfaces (Directory, Insights, Discussions facilitation) scoped by
          hierarchy and pod rules.
        </p>
        <h3>360 anonymity for recipients</h3>
        <p>
          Aggregated peer 360 scores and written themes are available to the reviewee as soon as at least one peer has
          submitted. Individual reviewer names are never shown to the recipient — neither in My Dashboard, My 360
          feedback, nor Discussions. Discussion inbox labels for subjects use “Anonymous 360 feedback”; facilitator
          chat messages appear as “Leadership”. Per-peer answer blocks are available only to authorised facilitators /
          oversight viewers, labelled Peer 1, Peer 2, etc. (no real names).
        </p>
        <h3>Reviewer identity (storage vs display)</h3>
        <ul>
          <li><code>peer_360</code> rows store <code>reviewer_id</code> (needed for draft ownership, dedupe, and RLS).</li>
          <li>All reads that surface answers to a reviewee go through security-definer functions that never project <code>reviewer_id</code>.</li>
          <li>Narrative peer comments are surfaced via <code>get_my_anonymous_peer_comments(_period)</code>, returning <code>comment_text</code> only.</li>
        </ul>
      </>
    ),
  },
  {
    id: "auth",
    num: "06",
    title: "Authentication & Access Control",
    body: (
      <>
        <h3>Sign-in model</h3>
        <ul>
          <li>Invite-only: no public signup. Only imported employees can sign in.</li>
          <li>Email + password. Default first-time password issued via bulk provisioning edge function.</li>
          <li>First login triggers <code>ProfileCompletionGate</code> → forces password reset + profile fields.</li>
          <li>Password reset uses branded VGG email templates via the <code>auth-email-hook</code> edge function.</li>
        </ul>
        <h3>Role model</h3>
        <p>
          Roles live in <code>public.user_roles</code> (never on <code>profiles</code>). Enum{" "}
          <code>app_role = &#123;admin, moderator, user&#125;</code>. All admin-scoped RLS policies use the
          security-definer helper <code>public.has_role(auth.uid(), 'admin'::app_role)</code> to avoid recursive
          policy evaluation.
        </p>
        <h3>Employee ↔ Auth linkage</h3>
        <pre><code>{`current_employee_id() → uuid
SELECT e.id FROM employees e
JOIN profiles p ON lower(p.email) = lower(e.email)
WHERE p.id = auth.uid()
LIMIT 1`}</code></pre>
        <p>
          This function is the bridge between an authenticated user and their assessment permissions. All{" "}
          <code>assessment_*</code> RLS policies use it to scope reads and writes.
        </p>
      </>
    ),
  },
  {
    id: "rls",
    num: "07",
    title: "Row-Level Security",
    body: (
      <>
        <p>
          Every public table has RLS enabled and explicit GRANTs. The Data API does not grant default privileges on{" "}
          <code>public</code>, so each migration follows the sequence: CREATE TABLE → GRANT → ENABLE RLS → CREATE
          POLICY.
        </p>
        <h3>Canonical policy shapes</h3>
        <table>
          <thead><tr><th>Table</th><th>Read</th><th>Write</th></tr></thead>
          <tbody>
            <tr><td><code>assessment_forms / _questions</code></td><td>authenticated (all)</td><td>admin only</td></tr>
            <tr><td><code>assessment_responses</code></td><td>reviewer = self OR reviewee = self (via RPC) OR admin</td><td>reviewer = self (upsert draft/submit) OR admin</td></tr>
            <tr><td><code>assessment_answers</code></td><td>via response ownership</td><td>reviewer = self while status = draft</td></tr>
            <tr><td><code>assessment_peer_comments</code></td><td>reviewer = self OR anonymised RPC for reviewee</td><td>reviewer = self</td></tr>
            <tr><td><code>employees</code></td><td>authenticated (roster is not secret in EO)</td><td>admin only</td></tr>
            <tr><td><code>user_roles</code></td><td>self OR admin</td><td>admin only</td></tr>
          </tbody>
        </table>
        <h3>Grant template</h3>
        <pre><code>{`GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
-- add: GRANT SELECT ON public.<table> TO anon;  -- ONLY when a policy allows anon reads.`}</code></pre>
      </>
    ),
  },
  {
    id: "edge-functions",
    num: "08",
    title: "Edge Functions",
    body: (
      <>
        <table>
          <thead><tr><th>Function</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>bulk-create-users</code></td><td>Admin: create auth users for every <code>employees</code> row; assign default first-login password.</td></tr>
            <tr><td><code>complete-profile</code></td><td>First-login handler: sets password, writes profile fields, marks onboarding complete.</td></tr>
            <tr><td><code>create-admin-user</code></td><td>Bootstrap: elevates a specific email to admin in <code>user_roles</code>.</td></tr>
            <tr><td><code>auth-email-hook</code></td><td>Signed webhook from Auth. Renders React email templates and enqueues them.</td></tr>
            <tr><td><code>process-email-queue</code></td><td>Woken by <code>pg_cron</code> (5s). Drains <code>q_auth_emails</code> and <code>q_transactional_emails</code> via the SMTP relay.</td></tr>
            <tr><td><code>chat</code></td><td>Admin analytics assistant on <code>/admin</code> (search + reasoning providers when enabled).</td></tr>
            <tr><td><code>adaptive-resources</code></td><td>Employee growth hub: personalised learning resource generation.</td></tr>
            <tr><td><code>research-resources</code></td><td>Perplexity-backed research to enrich resource metadata.</td></tr>
            <tr><td><code>learning-path-generate</code></td><td>Builds structured learning paths from an employee’s 360 growth areas.</td></tr>
            <tr><td><code>recommendation-*</code> (5)</td><td>Multi-stage recommender: candidates → rank → evaluate → personalize → run.</td></tr>
            <tr><td><code>idp-check-in</code></td><td>Individual Development Plan check-ins (weekly reflection cadence).</td></tr>
          </tbody>
        </table>
        <h3>Deployment</h3>
        <pre><code>{`npm run functions:deploy   # deploy all edge functions
npm run db:apply           # apply pending SQL migrations
npm run supabase:deploy    # migrations + functions + secrets sync`}</code></pre>
      </>
    ),
  },
  {
    id: "email",
    num: "09",
    title: "Email Pipeline",
    body: (
      <>
        <h3>Sender identity</h3>
        <ul>
          <li>Sending domain: <code>notify.vgg.tools</code></li>
          <li>From: <code>VGG People Office &lt;no-reply@notify.vgg.tools&gt;</code></li>
          <li>Templates: React (JSX) rendered server-side in <code>_shared/email-templates/*</code></li>
          <li>Categories: signup, invite, magic-link, recovery, email-change, reauthentication.</li>
        </ul>
        <h3>Queue mechanics</h3>
        <p>
          <code>auth-email-hook</code> enqueues to <code>pgmq.q_auth_emails</code> (or{" "}
          <code>q_transactional_emails</code>). A row-level trigger calls <code>email_queue_wake()</code> which arms
          the <code>pg_cron</code> job <code>process-email-queue</code> to run every 5 seconds. The dispatcher POSTs
          to the edge function; when both queues drain, it unschedules the cron under a shared advisory lock so idle
          periods cost nothing.
        </p>
        <h3>Retry & suppression</h3>
        <ul>
          <li><code>email_send_state.retry_after_until</code> — global backoff after SMTP throttling.</li>
          <li><code>email_send_log</code> — per-message audit trail.</li>
          <li><code>suppressed_emails</code> — hard-bounce / unsubscribe list; checked before sending.</li>
          <li><code>email_unsubscribe_tokens</code> — signed one-click unsubscribe.</li>
          <li><code>move_to_dlq(source, dlq, msg_id, payload)</code> — DLQ helper for poisoned messages.</li>
        </ul>
      </>
    ),
  },
  {
    id: "routes",
    num: "10",
    title: "Frontend Routes & Screens",
    body: (
      <>
        <table>
          <thead><tr><th>Route</th><th>Component</th><th>Access</th></tr></thead>
          <tbody>
            <tr><td><code>/</code></td><td>Onboarding / Index</td><td>Public — landing</td></tr>
            <tr><td><code>/login</code></td><td>EmployeeLogin</td><td>Public</td></tr>
            <tr><td><code>/find-account</code></td><td>FindAccount</td><td>Public</td></tr>
            <tr><td><code>/reset-password</code></td><td>ResetPassword</td><td>Signed link</td></tr>
            <tr><td><code>/hub</code></td><td>EmployeeHub (Appraisal / Dashboard / Growth Hub)</td><td>Authenticated employee</td></tr>
            <tr><td><code>/appraisal</code></td><td>AppraisalAdmin</td><td>Authenticated admin</td></tr>
            <tr><td><code>/docs</code></td><td>This technical documentation</td><td>Public</td></tr>
          </tbody>
        </table>
        <h3>Survey UX</h3>
        <ul>
          <li>Clear progress and draft auto-save on answer changes; Submit marks the response <code>submitted</code>.</li>
          <li>Peer 360 supports per-question “no opportunity to observe” where applicable.</li>
          <li>EA quarterly and executive forms collect scored ratings plus narrative answers as defined in the question bank.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    num: "11",
    title: "AI Integrations",
    body: (
      <>
        <h3>Analytics assistant (/admin)</h3>
        <ul>
          <li>Reasoning: Anthropic Claude via <code>CLAUDE_API_KEY</code>.</li>
          <li>Web search: Perplexity via <code>PERPLEXITY_API_KEY</code>.</li>
          <li>Context: roster, hierarchy, aggregated scores, and qualitative themes assembled server-side.</li>
          <li>Output: markdown for admins only. Never exposes reviewer identity for <code>peer_360</code>.</li>
        </ul>
        <h3>Growth Hub (employee)</h3>
        <ul>
          <li><code>adaptive-resources</code> — personalised learning resource suggestions.</li>
          <li><code>research-resources</code> — research enrichment for resource metadata.</li>
          <li><code>learning-path-generate</code> — structured learning paths from growth areas.</li>
          <li><code>recommendation-*</code> — multi-stage recommender pipeline when Growth Hub v2 is enabled.</li>
        </ul>
        <h3>Model governance</h3>
        <ul>
          <li>All AI calls are server-side (edge functions). No API keys reach the browser.</li>
          <li>AI is feature-flagged via <code>VITE_ENABLE_APP_AI</code> (default true).</li>
          <li>AI does not write to <code>assessment_*</code> tables — advisory only.</li>
        </ul>
      </>
    ),
  },
  {
    id: "config",
    num: "12",
    title: "Configuration & Secrets",
    body: (
      <>
        <h3>Environment variables (frontend, .env)</h3>
        <table>
          <thead><tr><th>Key</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>VITE_SUPABASE_URL</code></td><td>Supabase project URL</td></tr>
            <tr><td><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></td><td>Anon (publishable) key — safe for the browser; RLS still applies</td></tr>
            <tr><td><code>VITE_ENABLE_APP_AI</code></td><td>Toggle AI features (default true)</td></tr>
            <tr><td><code>VITE_ENABLE_GROWTH_HUB_V2</code></td><td>Beta growth hub UI</td></tr>
          </tbody>
        </table>
        <h3>Server-side secrets</h3>
        <table>
          <thead><tr><th>Secret</th><th>Used by</th></tr></thead>
          <tbody>
            <tr><td><code>SUPABASE_URL</code> / <code>SERVICE_ROLE_KEY</code> / <code>ANON_KEY</code> / <code>JWKS</code></td><td>All edge functions</td></tr>
            <tr><td><code>CLAUDE_API_KEY</code></td><td><code>chat</code>, <code>adaptive-resources</code>, <code>learning-path-generate</code></td></tr>
            <tr><td><code>PERPLEXITY_API_KEY</code></td><td><code>chat</code>, <code>research-resources</code></td></tr>
            <tr><td><code>email_queue_service_role_key</code> (vault)</td><td>Cron-triggered dispatcher</td></tr>
          </tbody>
        </table>
        <h3>Custom domain</h3>
        <ul>
          <li>App: <code>executive.vgg.tools</code> (CNAME to the static host).</li>
          <li>Email: <code>notify.vgg.tools</code> (SPF, DKIM, DMARC configured).</li>
        </ul>
      </>
    ),
  },
  {
    id: "ops",
    num: "13",
    title: "Operations & Runbooks",
    body: (
      <>
        <h3>Common tasks</h3>
        <table>
          <thead><tr><th>Task</th><th>Command</th></tr></thead>
          <tbody>
            <tr><td>Apply DB migrations</td><td><code>npm run db:apply</code></td></tr>
            <tr><td>Deploy edge functions</td><td><code>npm run functions:deploy</code></td></tr>
            <tr><td>Sync secrets</td><td><code>npm run secrets:sync</code></td></tr>
            <tr><td>Full deploy</td><td><code>npm run supabase:deploy</code></td></tr>
            <tr><td>Seed demo auth users</td><td><code>npm run seed:demo-auth</code></td></tr>
            <tr><td>Check EO roster</td><td><code>npm run check:eo-roster</code></td></tr>
            <tr><td>Export EO roster</td><td><code>npm run export:eo-roster</code></td></tr>
            <tr><td>Reset a user password</td><td><code>node scripts/reset-user-password.mjs &lt;email&gt;</code></td></tr>
            <tr><td>Run tests</td><td><code>npm test</code></td></tr>
          </tbody>
        </table>
        <h3>Incident · Emails not sending</h3>
        <ol>
          <li>Check <code>email_send_state.retry_after_until</code> — if in the future, SMTP is rate-limited; wait or clear.</li>
          <li>Query <code>pgmq.q_auth_emails</code> for stuck messages.</li>
          <li>Inspect edge function logs for <code>process-email-queue</code>.</li>
          <li>Verify the <code>pg_cron</code> job <code>process-email-queue</code> exists; an enqueue with an armed trigger will recreate it.</li>
        </ol>
        <h3>Incident · User cannot log in</h3>
        <ol>
          <li>Confirm the email exists in <code>public.employees</code> (case-insensitive).</li>
          <li>Confirm the <code>public.profiles</code> row is linked to an auth user.</li>
          <li>If missing, run <code>bulk-create-users</code> for that email, or trigger a password reset.</li>
          <li>Check <code>suppressed_emails</code> for hard bounces.</li>
        </ol>
        <h3>Incident · Results screen empty</h3>
        <p>
          Confirm the correct quarter is selected, then check that at least one submitted{" "}
          <code>peer_360</code> response exists for that reviewee and period in{" "}
          <code>assessment_responses</code>. If scores exist for facilitators but not the subject, verify the subject
          is calling <code>get_my_360_dashboard</code> / <code>get_my_360_results</code> (not oversight detail).
        </p>
      </>
    ),
  },
  {
    id: "security",
    num: "14",
    title: "Security Posture",
    body: (
      <>
        <ul>
          <li>All public tables have RLS enabled with explicit policies and GRANTs.</li>
          <li>Roles live in a separate <code>user_roles</code> table (never on <code>profiles</code>) to prevent privilege escalation.</li>
          <li>Role checks use SECURITY DEFINER function <code>has_role()</code> with a fixed <code>search_path</code>.</li>
          <li>Reviewer identity is never returned to a reviewee — enforced by security-definer RPCs.</li>
          <li>AI providers are only reached from server-side edge functions with secrets from the Vault.</li>
          <li>Emails are queued through <code>pgmq</code>; the auth webhook is signature-verified.</li>
          <li>No anonymous signups. No auto-confirm. No self-service role changes.</li>
          <li>Custom domain uses HTTPS end-to-end.</li>
        </ul>
        <h3>Data lifecycle</h3>
        <ul>
          <li>Employees: created via admin import; deactivated (not deleted) when they leave.</li>
          <li>Responses: retained per period; historical periods remain readable to admins and the individual reviewee (aggregated only).</li>
          <li>Emails: transactional; body not stored, only send-log metadata.</li>
          <li>Backups: managed with point-in-time recovery.</li>
        </ul>
      </>
    ),
  },
  {
    id: "glossary",
    num: "A",
    title: "Appendix · Glossary",
    body: (
      <table>
        <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>BOOM</td><td>Internal name for the EO performance system (Bunmi’s Operating Model).</td></tr>
          <tr><td>EO</td><td>Executive Office of the GCEO.</td></tr>
          <tr><td>GCEO</td><td>Group CEO — Bunmi Akinyemiju.</td></tr>
          <tr><td>Vertical</td><td>A functional department in the EO (Central Ops, Brand & Comms, Technical, Calendar/Travel, and others).</td></tr>
          <tr><td>360</td><td>Multi-rater anonymous peer review.</td></tr>
          <tr><td>EPA</td><td>Executive Performance Assessment (BOOM v2).</td></tr>
          <tr><td>EA</td><td>Executive Assistant.</td></tr>
          <tr><td>N/O</td><td>No opportunity to observe — valid non-answer for 360 items.</td></tr>
          <tr><td>Anonymous 360</td><td>Recipient sees aggregates only; reviewer identity is never disclosed in UI or recipient RPCs.</td></tr>
          <tr><td>Period</td><td>A cadence bucket: <code>YYYY-Qn</code> (quarterly) or <code>YYYY-MM</code> (monthly).</td></tr>
        </tbody>
      </table>
    ),
  },
];

export default function Docs() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const meta = useMemo(
    () => [
      { label: "Audience", value: "Engineers, admins, auditors" },
      { label: "Stack", value: "React · TypeScript · Supabase (Postgres + Auth + Edge)" },
      { label: "Deploy", value: "executive.vgg.tools" },
      { label: "Owner", value: "Executive Office of the GCEO" },
      { label: "Date", value: "July 2026 · v1.1" },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Masthead */}
      <header className="border-b border-foreground/15">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
              VGG · Executive Office of the GCEO
            </span>
          </div>
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/70 hover:text-foreground"
          >
            ← Back to app
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/60">
            № v1.1 · Technical Documentation
          </p>
          <h1 className="mt-3 font-serif text-5xl md:text-7xl leading-[0.95] tracking-tight">
            BOOM Appraisal Platform
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-foreground/70">
            Private, invite-only performance and 360 feedback system for the Executive Office of the GCEO.
            This document explains what the system does, how data is stored and accessed, how reviews are routed,
            and how anonymity and access control are enforced.
          </p>
          <dl className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4 border-t border-foreground/15 pt-6">
            {meta.map((m) => (
              <div key={m.label}>
                <dt className="font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/60">{m.label}</dt>
                <dd className="mt-1 text-sm">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-6 py-12 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/60 mb-3">Contents</p>
          <nav className="border-l border-foreground/15">
            {SECTIONS.map((s) => {
              const isActive = active === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`group block pl-4 -ml-px py-1.5 border-l text-sm transition-colors ${
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-foreground/60 hover:text-foreground"
                  }`}
                >
                  <span className="font-mono text-[10px] tracking-[0.14em] mr-2 text-foreground/50 group-hover:text-foreground/70">
                    {s.num}
                  </span>
                  {s.title}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="docs-prose min-w-0">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-6 mb-16">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
                Section {s.num}
              </p>
              <h2 className="mt-2 font-serif text-3xl md:text-4xl tracking-tight border-b border-foreground/15 pb-3">
                {s.title}
              </h2>
              <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-foreground/85">
                {s.body}
              </div>
            </section>
          ))}
          <footer className="border-t border-foreground/15 pt-6 mt-16 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60 font-mono uppercase tracking-[0.18em]">
            <span>End of document</span>
            <span>VGG · Executive Office · July 2026</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
