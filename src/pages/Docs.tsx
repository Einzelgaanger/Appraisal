import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
          The VGG Workspace is the private, invite-only operating system for Venture Garden Group companies that
          share this platform. One React application, one Postgres database, and one Render web service serve every
          company. The hostname (or a local <code>?tenant=</code> query) decides which company the visitor is in.
          A signed-in person only ever acts as one roster row at a time.
        </p>
        <p>
          Three companies are live on <code>vgg.tools</code>: the Executive Team (BOOM), GreenHouse Capital (GHC),
          and VigiPay. Each company has its own roster, branding, reporting lines, and performance instruments.
          Projects, the leave planner, and the profile page are shared tools, always scoped to the active company
          so one company never sees another company’s tasks or leave.
        </p>
        <h3>What the platform does</h3>
        <ul>
          <li>
            <strong>Performance.</strong> Company-specific review cycles. Executive Team uses BOOM (monthly self,
            full-roster anonymous 360, Executive Office Quarterly Evaluation, executive self-assessment, EPA assessors).
            GreenHouse Capital and VigiPay use the GHC-style cycle (monthly self check-in, monthly manager review,
            quarterly peer 360, formal quarterly evaluation, acknowledgement, and discussion).
          </li>
          <li>
            <strong>Projects.</strong> Company-private projects. An owner invites colleagues, members accept or
            decline, tasks carry an assignee, a due date, and a progress percentage, and a task can be delegated
            only after the recipient accepts.
          </li>
          <li>
            <strong>Leave planner.</strong> Each leave type has its own balance. Annual leave is 10 working days a
            quarter. Any working day in the quarter can be chosen, and the request has to be in by the end of week 2. One person per
            department can be on leave at a time. A person cannot apply while their 360 feedback or quarterly
            appraisal for the current quarter is still open. That rule is the same in every company. Every request
            goes to HR first, then to the line manager.
          </li>
          <li>
            <strong>Profile.</strong> A person can update their name, role, department, and photo. Email and company
            stay fixed. The same page lists teammates in the active company.
          </li>
          <li>
            <strong>Multi-company access.</strong> A few people hold more than one roster row under one login.
            They switch company from the hub. Switching changes the active employee and sends them to that
            company’s host. People with two or more companies also see a group overview of appraisal progress.
          </li>
          <li>
            <strong>Admin and People Ops.</strong> Company admins monitor completion, release 360 results where
            that company requires a release, and export. Platform admins can open the appraisal console.
          </li>
          <li>
            <strong>Optional AI.</strong> An admin analytics assistant and employee Growth Hub recommendations run
            only on the server. They are advisory and never write assessment scores. Reviewer identity is never
            sent for anonymous 360.
          </li>
        </ul>
        <h3>Product principles</h3>
        <ul>
          <li>Invite-only. There is no public signup. Accounts are created for people already on a company roster.</li>
          <li>One active company at a time. Every read and write resolves through <code>current_employee_id()</code>.</li>
          <li>Anonymity is enforced in the database, not only in the interface. Recipient-facing 360 reads go through security-definer functions that never return the reviewer.</li>
          <li>Company data stays inside that company. Workspace rows carry <code>subsidiary_id</code> and are filtered to the caller’s company.</li>
          <li>The interface is meant to be finished on a phone as well as a desktop: clear progress, drafts, and an explicit submit.</li>
        </ul>
      </>
    ),
  },
  {
    id: "companies",
    num: "02",
    title: "Companies, Hosts, and Entry",
    body: (
      <>
        <p>
          Production is one static site. The first label of the hostname selects the company. The apex host is a
          picker, not a workspace. Local development uses the same app on <code>localhost</code> and passes the
          company in the query string.
        </p>
        <table>
          <thead>
            <tr><th>Host</th><th>Company</th><th>Slug</th><th>Performance mode</th></tr>
          </thead>
          <tbody>
            <tr><td><code>vgg.tools</code></td><td>Group portal (picker)</td><td>—</td><td>None. Cards link to each company host.</td></tr>
            <tr><td><code>executive.vgg.tools</code></td><td>VGG Executive Team</td><td><code>executiveteam</code></td><td>BOOM</td></tr>
            <tr><td><code>ghc.vgg.tools</code></td><td>GreenHouse Capital</td><td><code>ghc</code></td><td>GHC cycle</td></tr>
            <tr><td><code>vigipay.vgg.tools</code></td><td>VigiPay</td><td><code>vigipay</code></td><td>GHC-style cycle on the VigiPay roster</td></tr>
          </tbody>
        </table>
        <h3>How a visitor gets in</h3>
        <ol>
          <li>Open <code>https://vgg.tools</code>. The portal shows three company cards: Executive Team, GHC, and VigiPay. Each card names the host and the modules on that workspace (Performance, Projects, Leave).</li>
          <li>Choosing a card opens that company’s host. On localhost the same cards go to <code>/?tenant=executiveteam</code>, <code>?tenant=ghc</code>, or <code>?tenant=vigipay</code>.</li>
          <li>The company entry page is branded for that company and offers sign-in. There is no Docs button on the portal; this page is reached by typing <code>/docs</code>.</li>
          <li>After sign-in the person lands in the hub. If they are already signed in, <code>/</code> sends them straight to <code>/hub?tab=survey</code>.</li>
        </ol>
        <h3>How the app chooses the company</h3>
        <p>
          Resolution order, implemented in <code>resolveTenantFromHostname</code>:
        </p>
        <ol>
          <li>The signed-in person’s locked company. The lock comes from the active roster row, never from the email domain. Venture Garden Group addresses exist on more than one company, so the domain is not a safe signal.</li>
          <li><code>?tenant=</code> when present (local development and explicit overrides).</li>
          <li>The hostname subdomain (<code>executive</code>, <code>ghc</code>, <code>vigipay</code>, plus aliases such as <code>appraisal</code> and <code>greenhousecapital</code>).</li>
          <li>The signed-in profile’s subsidiary, if no host match exists.</li>
          <li><code>VITE_DEFAULT_TENANT</code>, then Executive Team.</li>
        </ol>
        <p>
          <code>TenantLockEnforcer</code> keeps a signed-in person on their active company. On a production host
          that does not match, the browser is sent to that company’s host. On localhost it rewrites the{" "}
          <code>tenant</code> query so a refresh cannot silently open the wrong company.
        </p>
        <h3>Fixed subsidiary ids</h3>
        <table>
          <thead><tr><th>Company</th><th><code>subsidiaries.id</code></th></tr></thead>
          <tbody>
            <tr><td>Executive Team</td><td><code>11111111-1111-1111-1111-111111111111</code></td></tr>
            <tr><td>GreenHouse Capital</td><td><code>22222222-2222-2222-2222-222222222222</code></td></tr>
            <tr><td>VigiPay</td><td><code>33333333-3333-3333-3333-333333333333</code></td></tr>
          </tbody>
        </table>
        <p>
          The same mapping lives in <code>public.tenants</code> (<code>slug</code>, <code>subsidiary_id</code>,{" "}
          <code>appraisal_mode</code>) so SQL can answer “which company is this employee in” without relying only
          on the frontend list.
        </p>
      </>
    ),
  },
  {
    id: "hub",
    num: "03",
    title: "The Hub",
    body: (
      <>
        <p>
          <code>/hub</code> is the signed-in home. The active tab is stored in the query (<code>?tab=</code>) so a
          link can open a specific surface. Profile completion runs before the hub: the first login must set a
          password and finish the profile fields for that company.
        </p>
        <table>
          <thead><tr><th>Tab</th><th>Query</th><th>Who sees it</th><th>What it is</th></tr></thead>
          <tbody>
            <tr><td>Reviews</td><td><code>tab=survey</code></td><td>Everyone</td><td>The company’s review hub: tasks to complete, and oversight tools where the role allows them.</td></tr>
            <tr><td>My Dashboard</td><td><code>tab=dashboard</code></td><td>Everyone</td><td>The person’s own results. 360 content is aggregated. Reviewer names are not shown.</td></tr>
            <tr><td>Growth Hub</td><td><code>tab=growth</code></td><td>When the company has Growth Hub on (all three do)</td><td>Learning resources and, when enabled, structured paths from growth areas. Advisory only.</td></tr>
            <tr><td>Rankings</td><td><code>tab=rankings</code></td><td>Off for all three live companies</td><td>Legacy wall of fame. The route redirects away when the capability is off.</td></tr>
            <tr><td>Group overview</td><td><code>tab=group</code></td><td>People with access to two or more companies</td><td>Appraisal progress across those companies, with a way to open each one.</td></tr>
            <tr><td>Projects</td><td><code>tab=projects</code></td><td>Everyone</td><td>Projects the person owns or has been invited to, inside the active company.</td></tr>
            <tr><td>Leave planner</td><td><code>tab=leave</code></td><td>Everyone</td><td>Balance, request form, department calendar, and the approval queue for managers and HR. Applying is closed while that person’s 360 or quarterly appraisal is still open.</td></tr>
            <tr><td>My profile</td><td><code>tab=profile</code></td><td>Everyone</td><td>Name, role, department, photo, and the company directory.</td></tr>
          </tbody>
        </table>
        <h3>Reviews hub, by company</h3>
        <p>
          Executive Team renders <code>BoomReviewHub</code>. GreenHouse Capital and VigiPay render{" "}
          <code>GhcReviewHub</code> because <code>isGhcStyleAppraisal</code> is true for both. VigiPay uses the GHC
          instruments on its own roster, teams, and branding until a VigiPay-specific form pack replaces them.
        </p>
        <table>
          <thead><tr><th>Surface</th><th>Executive Team</th><th>GHC and VigiPay</th></tr></thead>
          <tbody>
            <tr><td>Tasks</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Discussions</td><td>Yes</td><td>Yes, after evaluations are in play</td></tr>
            <tr><td>My 360 / feedback</td><td>Yes, anonymous aggregates</td><td>Results live on My Dashboard and, for HR, in the monitor after release</td></tr>
            <tr><td>Comments</td><td>Yes</td><td>No</td></tr>
            <tr><td>Directory</td><td>L0/L1 oversight</td><td>Yes</td></tr>
            <tr><td>Insights</td><td>L0/L1 oversight</td><td>Covered by directory and HR monitor</td></tr>
            <tr><td>HR / admin monitor</td><td>Appraisal console at <code>/appraisal</code> for platform admins</td><td>In-hub Monitor for platform admins; HR Monitor for company admins</td></tr>
          </tbody>
        </table>
        <p>
          Company admins on GHC-style workspaces see an HR Monitor tab (completion, 360 release, named feedback
          for HR). Platform admins see the same monitor plus a link into the appraisal console. A company switcher
          appears in the sidebar only when the login has two or more companies.
        </p>
        <h3>Mobile</h3>
        <p>
          The hub has a bottom tab bar on small screens for the primary destinations (reviews, dashboard, projects,
          leave, profile). Oversight tools stay inside the reviews hub rather than becoming extra top-level tabs.
        </p>
      </>
    ),
  },
  {
    id: "boom",
    num: "04",
    title: "Executive Team Performance (BOOM)",
    body: (
      <>
        <p>
          BOOM is the Executive Office performance system. It is the only mode on <code>executive.vgg.tools</code>.
          Each person is routed to the reviews their place in the org chart requires. Recipients of peer 360
          feedback see anonymous aggregates only.
        </p>
        <h3>Forms</h3>
        <table>
          <thead><tr><th>Code</th><th>Who completes it</th><th>About whom</th><th>Cadence</th></tr></thead>
          <tbody>
            <tr><td><code>monthly_self</code></td><td>Every active EO person</td><td>Themselves</td><td>Month (<code>YYYY-MM</code>)</td></tr>
            <tr><td><code>peer_360</code></td><td>Every active EO person</td><td>Every other active EO colleague</td><td>Quarter (<code>YYYY-Qn</code>)</td></tr>
            <tr><td><code>ea_quarterly</code></td><td>Configured line managers</td><td>The report named in <code>eo_ea_quarterly_pairs</code></td><td>Quarter</td></tr>
            <tr><td><code>executive</code></td><td>People flagged <code>appraisal_self_performance</code> (L0/L1 allow-list)</td><td>Themselves</td><td>Quarter</td></tr>
            <tr><td><code>epa_gceo_assessor</code></td><td>Assigned EPA assessors</td><td>An executive self review, where that add-on is enabled</td><td>Quarter</td></tr>
          </tbody>
        </table>
        <h3>What each level sees</h3>
        <ul>
          <li>Hierarchy uses lower-is-senior: 0 is top leadership, 1 is a functional lead, 2 and above are team. <code>subsidiaries.hierarchy_lower_is_senior</code> selects this convention.</li>
          <li>Team members (level 2 and above) primarily see Tasks: monthly self, peer 360 on the full roster, and the Executive Office Quarterly Evaluation only if they are a configured line manager.</li>
          <li>Level 0 and 1 also get Directory, Insights, and discussion facilitation, scoped by hierarchy and pod rules.</li>
          <li>Peer forms hide executive-only question sections from people below that lens. Manager and executive reviewers see those extra sections.</li>
        </ul>
        <h3>360 anonymity</h3>
        <ul>
          <li>Aggregated scores and written themes are available to the reviewee once at least one peer has submitted.</li>
          <li>The recipient never sees reviewer names — not on My Dashboard, not in My 360 feedback, and not in Discussions. The subject’s inbox label is “Anonymous 360 feedback”. Facilitator messages appear as “Leadership”.</li>
          <li>Facilitators and oversight viewers can open per-peer answer blocks labelled Peer 1, Peer 2, and so on. Those labels are not real names.</li>
          <li><code>peer_360</code> rows do store <code>reviewer_id</code>. That column is required for draft ownership, deduplication, and row-level security. Every read that reaches the reviewee goes through a security-definer function that does not project it.</li>
          <li>Narrative peer comments are returned by <code>get_my_anonymous_peer_comments(_period)</code> as <code>comment_text</code> only.</li>
          <li>A direction label (upward, peer, downward) is dropped when fewer than three reviewers sit in that group, so a small group cannot identify the writer.</li>
        </ul>
        <h3>Discussions</h3>
        <p>
          After a submission, a thread can open between the subject and a facilitator. Monthly self, the Executive Office Quarterly Evaluation,
          and peer 360 oversight each have their own discussion path. The subject never receives a name for a 360
          reviewer through that thread.
        </p>
        <h3>Survey behaviour</h3>
        <ul>
          <li>Answers auto-save as a draft. Submit is explicit and moves the response to <code>submitted</code>.</li>
          <li>Peer 360 allows “no opportunity to observe” on items where that is valid. Those answers are excluded from aggregates.</li>
          <li>The Executive Office Quarterly Evaluation (<code>ea_quarterly</code>) uses a performance scale and does not impose a minimum word count.</li>
          <li>Status for a reviewer’s pass through a form in a period is also recorded on <code>review_completions</code>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ghc-vigipay",
    num: "05",
    title: "GHC and VigiPay Performance",
    body: (
      <>
        <p>
          GreenHouse Capital runs the GHC cycle on <code>ghc.vgg.tools</code>. VigiPay runs the same cycle on{" "}
          <code>vigipay.vgg.tools</code>, with VigiPay branding, teams, and roster. The shared engine is{" "}
          <code>GhcReviewHub</code> and the <code>ghc_*</code> SQL functions. A later VigiPay form pack can diverge
          without changing Executive Team.
        </p>
        <h3>The five task kinds</h3>
        <table>
          <thead><tr><th>Kind</th><th>Who writes it</th><th>About whom</th><th>When</th></tr></thead>
          <tbody>
            <tr><td><code>monthly_self</code></td><td>Every active person</td><td>Themselves</td><td>Each month</td></tr>
            <tr><td><code>monthly_manager</code></td><td>The line manager</td><td>Each direct report</td><td>Each month</td></tr>
            <tr><td><code>peer_360</code></td><td>Every active person</td><td>Every other active colleague (not self)</td><td>Each quarter</td></tr>
            <tr><td><code>quarterly_evaluation</code></td><td>The line manager</td><td>Each direct report</td><td>Each quarter</td></tr>
            <tr><td><code>acknowledge_evaluation</code></td><td>The employee</td><td>Their own released evaluation</td><td>After the manager submits</td></tr>
          </tbody>
        </table>
        <p>
          Reporting uses <code>ghc_manager_id</code> (falling back to <code>manager_id</code> where the workspace
          needs a single line manager, as leave does). A vacant or inactive seat does not receive tasks. People at
          team-member level (3 and above; GHC <code>teamMemberMinLevel</code> is 3) do not receive a manager-review
          queue unless they actually have directs.
        </p>
        <h3>Quarterly evaluation score</h3>
        <p>
          The formal evaluation is scored out of 35:
        </p>
        <ul>
          <li>Culture — 25 points, across the five culture values below.</li>
          <li>Technical assessment — 5 points. OKRs closed in the period, judged on completion, quality, creativity, timeliness, and impact.</li>
          <li>Potential for growth — 5 points, in the current role.</li>
        </ul>
        <p>The percentage of 35 maps to a band:</p>
        <table>
          <thead><tr><th>Rating</th><th>Band</th><th>Percent of 35</th></tr></thead>
          <tbody>
            <tr><td>5</td><td>Exceptional Execution</td><td>85–100</td></tr>
            <tr><td>4</td><td>Exceed Expectations</td><td>71–84</td></tr>
            <tr><td>3</td><td>Meet Expectations</td><td>61–70</td></tr>
            <tr><td>2</td><td>Needs Improvement</td><td>50–60</td></tr>
            <tr><td>1</td><td>Unacceptable</td><td>0–49</td></tr>
          </tbody>
        </table>
        <p>
          Item scores on the 0–5 scale run from “Did not perform / unrated” through “Exceptional performance”.
          Culture values, each with the attributes reviewers are asked to look for:
        </p>
        <ul>
          <li>We only succeed when our founders and LPs succeed — drive value, proactive, over-communicate, expertise, partnership.</li>
          <li>Be voraciously curious — innovative, courageous, limitless, unsatisfied, passion.</li>
          <li>Move fast and be detail oriented — speed, agile, iterative, resourceful, creative.</li>
          <li>We only settle for overachievement — output excellence, quality, discipline, leadership, focused.</li>
          <li>Your job isn’t done until the job is done — ownership, responsibility, collaboration, accountability, reliability.</li>
        </ul>
        <h3>Partner actions</h3>
        <p>
          After a quarterly evaluation, HR or leadership can record one of: Promote to new level, Salary Review,
          Reward with Spot Bonus, Confirm Resource, Growth Coaching, Performance Improvement Plan, Demotion, or No
          Action Required. These are decisions recorded on the evaluation. They do not by themselves change pay or
          the roster.
        </p>
        <h3>360 release and anonymity</h3>
        <ul>
          <li>Peers write named rows in the database (the system must know who drafted and who submitted).</li>
          <li>The employee sees aggregates, not names.</li>
          <li>There is no HR release step. Anonymous aggregates open for every employee at the same time, as soon as peers have submitted.</li>
          <li>HR Monitor can show named feedback to People Ops. That view is not the employee view.</li>
          <li>Small groups still suppress direction labels when fewer than three reviewers share a direction, for the same reason as BOOM.</li>
        </ul>
        <h3>After the evaluation</h3>
        <p>
          The employee acknowledges the evaluation. A discussion thread can then run between the employee and the
          manager (and HR where the thread allows it). AI draft assist, when enabled, can suggest wording for a
          manager or HR writer. It does not submit the form and does not change the score.
        </p>
        <h3>Teams and seniority</h3>
        <p>GHC teams used on profile completion: Investment, Legal, People Ops, Comms, Operations, Finance.</p>
        <p>
          GHC job titles used on profile completion: Intern, Analyst, Associate, Senior Associate, Manager,
          Investment Lead, Finance Lead, People Manager, Head of Legal, Head of Operations, Head of Legal
          &amp; Operations, Partner, Managing Partner. A person can also cover more than one team.
        </p>
        <p>
          GHC seniority labels: 1 Manager, 2 Line manager, 3 Team member. Lower numbers are more senior. VigiPay
          uses the same three seniority labels and its own team list: Compliance, Fidesic, Finance, General
          Manager, Growth, People Operations, Product, Strategy, Technology, Treasury Operations.
        </p>
        <h3>Notifications</h3>
        <p>
          The bell in the GHC-style hub lists review events for the active company (tasks due, submissions,
          discussions). It is scoped to that tenant slug (<code>ghc</code> or <code>vigipay</code>).
        </p>
      </>
    ),
  },
  {
    id: "leave",
    num: "06",
    title: "Leave Planner",
    body: (
      <>
        <p>
          Leave is a company workspace module, not an appraisal form. It is available on every company hub under{" "}
          <code>/hub?tab=leave</code>. Rows live in <code>workspace_leave_requests</code> and are always filtered to
          the caller’s subsidiary. The rules below are enforced in <code>workspace_assert_leave_ok</code>, so the
          browser cannot bypass them.
        </p>
        <h3>Allowance</h3>
        <ul>
          <li>Each type stands alone. Annual 10, sick 10, compassionate 5, parental 10, study 10, unpaid 15, and other 5 working days per quarter. Maternity is 90 working days in the calendar year and may cross a quarter.</li>
          <li>Monday to Friday count. Saturday and Sunday do not.</li>
          <li>Except maternity, a block must start and end inside the same quarter. A holiday that crosses a quarter boundary is two requests.</li>
          <li>Pending, HR-cleared, older manager-approved, and approved days all count against that type’s balance.</li>
          <li>Declined and cancelled requests do not count. Using annual leave does not reduce sick, compassionate, or any other type.</li>
          <li>The balance card shows the selected type’s allowance, used days, and remaining days.</li>
        </ul>
        <h3>When annual leave may fall</h3>
        <ul>
          <li>Annual leave can fall on any working day inside the quarter, including the first two weeks and the last two weeks. The start-and-end blackout is not in force.</li>
          <li>Annual leave for the quarter must be submitted by the end of week 2, which is Q+13. After that date an employee cannot submit annual leave. Sick and the other types stay open.</li>
          <li>HR can still place or reschedule after the annual deadline. HR chooses the person, or uses Move on an existing request. A new placement is cleared by HR and then waits for the line manager, unless HR is also that manager or there is no separate manager. The date, quarter, and department checks still run. The week-2 deadline is the only date rule HR can pass, and only for annual leave.</li>
        </ul>
        <h3>360 feedback and quarterly appraisal</h3>
        <p>
          An employee cannot apply for any leave type while they still owe 360 feedback or a quarterly appraisal
          for the current quarter. The check lives in <code>workspace_appraisal_leave_block</code> and <code>workspace_request_leave</code>,
          which rejects the request with the same reason the planner shows.
          The rule is identical for Executive Team, GreenHouse Capital, and VigiPay. Each company uses its own forms.
        </p>
        <ul>
          <li>Executive Team: every other active colleague’s peer 360, plus any Executive Office Quarterly Evaluation assigned to that person, plus the executive self-assessment where that person is on the allow-list.</li>
          <li>GreenHouse Capital and VigiPay: every other active colleague’s peer 360, any quarterly evaluation that person owes as a line manager, and a quarterly evaluation that has been submitted and is waiting for their acknowledgement.</li>
          <li>A draft does not count. Someone with no appraisal duties for that company is not blocked.</li>
          <li>HR can still place or move leave for someone who is behind. The block applies when that person applies themselves.</li>
        </ul>
        <h3>Department rule</h3>
        <p>
          Only one person in a department may hold active leave on a given date. “Active” means waiting for HR,
          waiting for the manager, older manager-approved, or approved. The check compares <code>employees.department</code> case-insensitively
          inside the same subsidiary. If someone else in the department already covers any day of the requested
          range, the request is rejected and names that person. People with a blank department are treated as the
          same unnamed department, so an empty team still cannot double-book.
        </p>
        <p>
          A person also cannot overlap their own active leave. The planner shows the department’s other bookings
          so the requester can pick a clear week before submitting.
        </p>
        <h3>Leave types</h3>
        <p>
          Annual, compassionate, maternity, study, sick, unpaid, parental, and other. Each type has its own allowance.
          Annual leave is 10 working days a quarter, on any working day in that quarter, with the week-2 deadline. The other types
          do not draw from that annual balance.
        </p>
        <h3>Approval chain</h3>
        <table>
          <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><code>pending</code></td><td>Waiting for HR. HR is told by email and the request is on the leave planner.</td></tr>
            <tr><td><code>hr_approved</code></td><td>HR has cleared it. Waiting for the line manager.</td></tr>
            <tr><td><code>manager_approved</code></td><td>Older requests that the line manager already approved. HR can still finish these.</td></tr>
            <tr><td><code>approved</code></td><td>HR cleared it and the line manager approved it. If there is no separate line manager, HR approval is final.</td></tr>
            <tr><td><code>declined</code></td><td>Line manager or HR declined. Terminal.</td></tr>
            <tr><td><code>cancelled</code></td><td>The employee cancelled their own request. Hidden from the shared list.</td></tr>
          </tbody>
        </table>
        <ul>
          <li>The line manager is <code>ghc_manager_id</code> if set, otherwise <code>manager_id</code>.</li>
          <li>HR acts first. The line manager acts only after HR has cleared the request. A pending request does not go to the manager before that.</li>
          <li>HR is anyone with <code>employees.company_admin</code> on the active row, or a platform <code>admin</code> role.</li>
          <li>Final approval re-checks the date rules (including department conflicts) so a request that became invalid while it waited cannot be approved.</li>
          <li>The employee may cancel their own request while it is with HR, with the manager, or already approved. They cannot cancel someone else’s.</li>
        </ul>
        <h3>Who sees which rows</h3>
        <p>
          <code>workspace_list_leave</code> returns the active company’s non-cancelled requests, with employee name,
          department, type, dates, working-day count, status, note, and manager name. The planner splits that list
          into “mine”, “awaiting my decision” (when the caller is the line manager or HR), and the department
          calendar used to avoid clashes.
        </p>
      </>
    ),
  },
  {
    id: "projects",
    num: "07",
    title: "Projects",
    body: (
      <>
        <p>
          Projects are an internal delivery board for the active company, opened at <code>/hub?tab=projects</code>.
          They are not OKR appraisals and they are not visible across companies. Every project row has a{" "}
          <code>subsidiary_id</code>. A person sees a project only when they are a member of it and that project
          belongs to their active company.
        </p>
        <h3>Projects</h3>
        <ul>
          <li>Any employee in the company can create a project: name (1–160 characters), optional description, optional due date.</li>
          <li>The creator becomes the owner and is an active member immediately.</li>
          <li>The owner invites colleagues from the company directory. An invite starts as <code>invited</code>. The colleague accepts (<code>active</code>) or declines (<code>declined</code>).</li>
          <li>Roles on a project are <code>owner</code> or <code>member</code>. There is one owner membership; members do the work they are assigned.</li>
          <li>The list card shows progress percent, task count, done count, and member count. Progress is derived from task progress, not typed in by hand on the project.</li>
        </ul>
        <h3>Tasks</h3>
        <ul>
          <li>Title (1–200 characters), optional notes, assignee, optional due date.</li>
          <li>If no assignee is chosen, the task is assigned to the person who created it.</li>
          <li>Status is <code>todo</code>, <code>in_progress</code>, or <code>done</code>.</li>
          <li>Progress is an integer from 0 to 100. The assignee updates it. Reaching 100 marks the task done; dropping below 100 moves a done task back to in progress.</li>
          <li>Only people who can see the project can create tasks. Assignment stays inside the project’s active members.</li>
        </ul>
        <h3>Delegation</h3>
        <p>
          The current assignee can offer a task to another active member. That creates a pending delegation. The
          task does not change hands until the recipient accepts. A decline leaves the original assignee in place.
          Only one pending delegation sits on a task at a time. The recipient, and the person who offered it, can
          see the pending handoff on the task.
        </p>
        <h3>Activity</h3>
        <p>
          <code>workspace_activity_logs</code> records project and task events (created, invited, accepted,
          progress changed, delegated, and so on) with the actor’s employee id, a short action name, and a JSON
          detail payload. The project page shows the recent log to members. It is an audit trail for the team, not
          a substitute for appraisal evidence.
        </p>
        <h3>Tables</h3>
        <table>
          <thead><tr><th>Table</th><th>Holds</th></tr></thead>
          <tbody>
            <tr><td><code>workspace_projects</code></td><td>Name, description, due date, creator, company.</td></tr>
            <tr><td><code>workspace_project_members</code></td><td>Employee, role, invite status, who invited them, when they responded.</td></tr>
            <tr><td><code>workspace_tasks</code></td><td>Title, notes, creator, assignee, due date, progress, status.</td></tr>
            <tr><td><code>workspace_task_delegations</code></td><td>From, to, pending / accepted / declined, optional note.</td></tr>
            <tr><td><code>workspace_activity_logs</code></td><td>Company, project, optional task, actor, action, detail, time.</td></tr>
          </tbody>
        </table>
        <p>
          The browser never writes these tables directly. It calls <code>workspace_list_projects</code>,{" "}
          <code>workspace_get_project</code>, <code>workspace_create_project</code>,{" "}
          <code>workspace_invite_member</code>, <code>workspace_respond_invite</code>,{" "}
          <code>workspace_create_task</code>, <code>workspace_set_task_progress</code>,{" "}
          <code>workspace_delegate_task</code>, and <code>workspace_respond_delegation</code>.{" "}
          <code>workspace_company_directory</code> supplies the people picker (name, role, email, department, photo)
          for the active company only.
        </p>
      </>
    ),
  },
  {
    id: "profile",
    num: "08",
    title: "Profile and Directory",
    body: (
      <>
        <p>
          My profile (<code>/hub?tab=profile</code>) lets a signed-in person correct how they appear to colleagues.
          The first-login gate (<code>ProfileCompletionGate</code>) collects the same kind of fields before the hub
          unlocks, and also forces a password change off the temporary password.
        </p>
        <h3>What can change</h3>
        <ul>
          <li><strong>Name.</strong> 2–120 characters. Written to <code>profiles</code> and to the active <code>employees</code> row.</li>
          <li><strong>Role.</strong> 2–160 characters. On GHC this is a fixed title list. On VigiPay and Executive Team it is the role text for that roster.</li>
          <li><strong>Department.</strong> Optional. GHC and VigiPay use their official team lists (see the performance section). A blank value does not wipe an existing department.</li>
          <li><strong>Photo.</strong> JPEG, PNG, or WebP, up to 2 MB. Stored in the public <code>avatars</code> bucket under a path that starts with the auth user id. The URL is saved on both <code>profiles.avatar_url</code> and <code>employees.avatar_url</code>.</li>
        </ul>
        <h3>What cannot change here</h3>
        <ul>
          <li>Email. It is the join between the login and the roster. Changing it in the profile form is not offered.</li>
          <li>Company. Subsidiary is an administrative assignment. Switching company, for people who have more than one, is a separate control and does not edit the roster.</li>
          <li>Hierarchy level, manager, and admin flags. Those stay on the employee row and are set by provisioning, not by self-service.</li>
        </ul>
        <p>
          The write path is <code>update_my_profile(name, role, department, avatar_url)</code>. Storage policies
          allow a user to upload, replace, and delete only objects whose first path segment is their own{" "}
          <code>auth.uid()</code>. Avatar images are publicly readable so the directory and project member lists
          can show them without a signed URL.
        </p>
        <h3>Teammates</h3>
        <p>
          The profile page lists the active company’s directory from <code>workspace_company_directory</code>.
          That is the same people picker projects use. It is not the appraisal oversight directory: it does not
          include scores, and it does not include people from other companies.
        </p>
      </>
    ),
  },
  {
    id: "multi-company",
    num: "09",
    title: "Company Switching and Group Overview",
    body: (
      <>
        <p>
          Most people belong to one company and never see a switcher. A small number of group roles hold several
          roster rows under one login — the same human, different <code>employees.id</code>, sometimes a different
          email on each roster. Membership is an explicit grant. The system does not guess by matching names.
        </p>
        <h3>How access is stored</h3>
        <ul>
          <li><code>employee_access</code> is the allow-list: <code>(profile_id, employee_id)</code>. There is no client insert policy. Grants are made by migrations or service-role scripts.</li>
          <li><code>profiles.active_employee_id</code> is the person’s current choice.</li>
          <li><code>current_employee_id()</code> returns that active id only when the pair exists in <code>employee_access</code>. A stale or edited value cannot widen access. If nothing valid is selected, it falls back to <code>profiles.employee_id</code>, which preserves every single-company login.</li>
          <li>Because policies and RPCs already call <code>current_employee_id()</code>, switching company moves appraisals, projects, leave, and profile together.</li>
        </ul>
        <h3>Switcher</h3>
        <p>
          <code>CompanySwitcher</code> renders only when <code>companies.length</code> is at least 2. Choosing a
          company calls the switch RPC, then the tenant lock sends the browser to that company’s host (or rewrites{" "}
          <code>?tenant=</code> on localhost). The menu shows the company name and the role on that roster.
        </p>
        <h3>Group overview</h3>
        <p>
          People with two or more companies get a Group overview tab. It calls{" "}
          <code>groupCompaniesAppraisalOverview</code> for the selected quarter and month and shows, per company
          the person can act as:
        </p>
        <ul>
          <li>GHC-style companies: roster size, monthly self submitted versus still open, peer 360 submitted versus expected, evaluations submitted, and evaluations acknowledged. Peer 360 results are visible to everyone together.</li>
          <li>Executive Team: roster size and peer 360 submitted versus expected. Aggregates are visible as soon as peers submit.</li>
        </ul>
        <p>
          Opening a company from that list switches the active employee if needed, then navigates to that
          company’s hub. It is a snapshot for people who already have access. It does not grant access to a
          company they are not on.
        </p>
      </>
    ),
  },
  {
    id: "domain-model",
    num: "10",
    title: "Domain Model",
    body: (
      <>
        <h3>Organisation</h3>
        <table>
          <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>subsidiaries</code></td><td>One row per company. Holds the hierarchy convention flag.</td></tr>
            <tr><td><code>tenants</code></td><td>Slug, appraisal mode, and subsidiary id. Mirrors the frontend tenant list.</td></tr>
            <tr><td><code>tenant_domains</code></td><td>Hostnames that belong to a tenant.</td></tr>
            <tr><td><code>employees</code></td><td>The roster. Name, email, role, department, hierarchy level, manager links, company admin flag, avatar, active flags. Deactivated rather than deleted.</td></tr>
            <tr><td><code>profiles</code></td><td>1:1 with <code>auth.users</code>. Name, role, department, avatar, default employee, active employee.</td></tr>
            <tr><td><code>employee_access</code></td><td>Which roster rows a login may act as.</td></tr>
            <tr><td><code>user_roles</code></td><td>Platform roles <code>admin</code>, <code>moderator</code>, <code>user</code>. Never stored on <code>profiles</code>.</td></tr>
          </tbody>
        </table>
        <h3>Executive Team assessments</h3>
        <table>
          <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>assessment_forms</code></td><td>Definitions: <code>executive</code>, <code>peer_360</code>, <code>monthly_self</code>, <code>ea_quarterly</code>, <code>epa_gceo_assessor</code>.</td></tr>
            <tr><td><code>assessment_questions</code></td><td>Question bank: section, text, type (<code>scored</code>, <code>written</code>, <code>values</code>), word-count rules.</td></tr>
            <tr><td><code>assessment_responses</code></td><td>One row per form, reviewer, reviewee, and period. Status <code>todo</code>, <code>draft</code>, or <code>submitted</code>.</td></tr>
            <tr><td><code>assessment_answers</code></td><td>Score (typically 1–5) and/or text, plus a no-opportunity flag.</td></tr>
            <tr><td><code>assessment_peer_comments</code></td><td>Anonymous downward narrative comments.</td></tr>
            <tr><td><code>eo_ea_quarterly_pairs</code></td><td>Explicit line-manager to report pairs for the Executive Office Quarterly Evaluation (<code>ea_quarterly</code>).</td></tr>
            <tr><td><code>review_completions</code></td><td>Marks a reviewer’s pass through a form as complete for a period.</td></tr>
          </tbody>
        </table>
        <h3>GHC-style reviews</h3>
        <p>
          GHC and VigiPay tasks, 360 responses, quarterly evaluations, acknowledgements, and discussions
          live in the <code>ghc_*</code> tables and are read through <code>ghc_*</code> RPCs. The employee
          never selects those tables for a scored result. Anonymous 360 aggregates are visible to every employee
          at the same time. Reviewer names stay with People Ops.
        </p>
        <h3>Workspace</h3>
        <p>
          Projects, memberships, tasks, delegations, activity logs, and leave requests are the{" "}
          <code>workspace_*</code> tables documented in the Projects and Leave sections. All of them carry the
          company id and are reached through RPCs that call <code>workspace_my_subsidiary_id()</code>.
        </p>
        <h3>Legacy tables kept for older dashboards</h3>
        <ul>
          <li><code>appraisal_responses</code> and <code>manager_summaries</code> — original VGG survey analytics. The live companies do not use the legacy dashboard.</li>
          <li><code>demo_appraisal_responses</code> and <code>demo_manager_summaries</code> — mock data for <code>/demo</code>, which is disabled on the three live companies.</li>
          <li><code>survey_*</code> — the original anonymous 360, superseded by <code>assessment_*</code> and the GHC cycle.</li>
        </ul>
      </>
    ),
  },
  {
    id: "routing",
    num: "11",
    title: "Who Is Asked to Review Whom",
    body: (
      <>
        <h3>Executive Team</h3>
        <p>
          The source of truth is <code>public.get_review_assignments(_period text)</code>. It loads the caller’s
          employee row, builds the target set from the rules below, and left-joins <code>assessment_responses</code>{" "}
          so each card can show todo, draft, or submitted.
        </p>
        <table>
          <thead><tr><th>Caller</th><th>Form</th><th>Reviewees</th></tr></thead>
          <tbody>
            <tr><td>Every active EO person</td><td><code>monthly_self</code></td><td>Self, for the monthly period</td></tr>
            <tr><td>Every active EO person</td><td><code>peer_360</code></td><td>Every other active EO colleague</td></tr>
            <tr><td>Flagged L0/L1</td><td><code>executive</code></td><td>Self, when <code>appraisal_self_performance</code> is set</td></tr>
            <tr><td>Configured managers</td><td><code>ea_quarterly</code></td><td>The reports listed in <code>eo_ea_quarterly_pairs</code></td></tr>
            <tr><td>EPA assessors</td><td><code>epa_gceo_assessor</code></td><td>Assigned executive self reviews, where the add-on is on</td></tr>
          </tbody>
        </table>
        <h3>GHC and VigiPay</h3>
        <p>
          <code>ghc_get_my_tasks</code> (and the directory/admin companions) build the queue for the active
          employee and the requested month and quarter:
        </p>
        <ul>
          <li>Monthly self for yourself.</li>
          <li>Monthly manager review for each active direct report.</li>
          <li>Peer 360 for every other active person on that company’s roster.</li>
          <li>Quarterly evaluation for each active direct report.</li>
          <li>Acknowledgement when a quarterly evaluation about you is ready for you to confirm.</li>
        </ul>
        <p>
          Direct reports are people whose manager link points at the caller, on the same subsidiary, and who are
          active for that company’s appraisal. Inactive seats are skipped. The HR Monitor uses a separate stats
          function (<code>ghc_pool_completion_stats</code> and the company admin queries) so People Ops can see
          completion without being the reviewer.
        </p>
      </>
    ),
  },
  {
    id: "auth",
    num: "12",
    title: "Authentication and Access Control",
    body: (
      <>
        <h3>Sign-in</h3>
        <ul>
          <li>Email and password. There is no public signup, no anonymous sign-in, and no self-service role change.</li>
          <li>Accounts are created for roster emails (bulk provisioning, or a targeted admin create). A temporary first password is issued; the profile gate requires a new one.</li>
          <li>Password reset emails are branded and sent through the auth email hook. The link must return to the host the person started on. Production redirect allow-list includes <code>executive.vgg.tools</code>, <code>ghc.vgg.tools</code>, <code>vigipay.vgg.tools</code>, <code>vgg.tools</code>, and localhost.</li>
          <li>Find-account (<code>/find-account</code>) helps a person locate the email their roster row uses. It does not create an account.</li>
        </ul>
        <h3>Two different “admin” ideas</h3>
        <table>
          <thead><tr><th>Flag</th><th>Where it lives</th><th>What it unlocks</th></tr></thead>
          <tbody>
            <tr><td>Platform <code>admin</code></td><td><code>user_roles</code></td><td>Appraisal console (<code>/appraisal</code>), cross-company tools, and the admin side of <code>has_role</code>. Checked with <code>has_role(auth.uid(), 'admin')</code>.</td></tr>
            <tr><td>Company admin</td><td><code>employees.company_admin</code></td><td>HR Monitor on a GHC-style hub, final leave approval, and HR-only leave edits. Scoped to the active roster row.</td></tr>
          </tbody>
        </table>
        <p>
          A People Ops lead can be a company admin without being a platform admin. A platform admin is not
          automatically a member of every company; they still need an <code>employee_access</code> row to act as
          someone on that roster. Group overview only lists companies that grant already exists for.
        </p>
        <h3>Employee bridge</h3>
        <pre><code>{`current_employee_id()
-- active_employee_id if that pair is in employee_access
-- otherwise profiles.employee_id
-- joined to employees for the signed-in profile`}</code></pre>
        <p>
          <code>workspace_my_subsidiary_id()</code> reads <code>employees.subsidiary_id</code> for that id. Leave,
          projects, and company directory all start from there. <code>workspace_is_hr()</code> is true when the
          active employee has <code>company_admin</code> or the login has platform admin.
        </p>
      </>
    ),
  },
  {
    id: "rls",
    num: "13",
    title: "Row-Level Security",
    body: (
      <>
        <p>
          Every application table in <code>public</code> has RLS enabled and explicit grants. The Data API does not
          assume default privileges, so migrations follow: create table, grant, enable RLS, create policy. Workspace
          and profile features add a second rule: the browser is granted execute on specific RPCs, and those
          functions are <code>SECURITY DEFINER</code> with a fixed <code>search_path</code>. The function, not a
          wide table policy, decides what the caller may see.
        </p>
        <h3>Assessment policies</h3>
        <table>
          <thead><tr><th>Table</th><th>Read</th><th>Write</th></tr></thead>
          <tbody>
            <tr><td><code>assessment_forms</code> / <code>_questions</code></td><td>Authenticated</td><td>Platform admin</td></tr>
            <tr><td><code>assessment_responses</code></td><td>Reviewer is self, or a reviewee RPC, or admin</td><td>Reviewer is self (draft and submit), or admin</td></tr>
            <tr><td><code>assessment_answers</code></td><td>Through response ownership</td><td>Reviewer is self while the response is still a draft</td></tr>
            <tr><td><code>assessment_peer_comments</code></td><td>Reviewer is self, or the anonymised RPC for the reviewee</td><td>Reviewer is self</td></tr>
            <tr><td><code>employees</code></td><td>Authenticated, inside the product’s own filters</td><td>Admin / provisioning, plus <code>update_my_profile</code> for the caller’s own name, role, department, and avatar</td></tr>
            <tr><td><code>user_roles</code></td><td>Self or admin</td><td>Admin</td></tr>
            <tr><td><code>employee_access</code></td><td>Own rows</td><td>No client policy</td></tr>
          </tbody>
        </table>
        <h3>Workspace policies</h3>
        <ul>
          <li>Project, task, member, delegation, and activity tables have RLS on. Visibility helpers (<code>workspace_project_visible</code> and the subsidiary check) are what member policies call.</li>
          <li>Leave requests are not updated from the client with a generic update. Request, cancel, and decide are separate functions with their own checks.</li>
          <li>Avatar objects: public read; insert, update, and delete only when the object name starts with the caller’s user id.</li>
        </ul>
        <h3>Grant shape</h3>
        <pre><code>{`GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
GRANT EXECUTE ON FUNCTION public.<rpc>(...) TO authenticated;`}</code></pre>
      </>
    ),
  },
  {
    id: "routes",
    num: "14",
    title: "Routes and Screens",
    body: (
      <>
        <table>
          <thead><tr><th>Route</th><th>Screen</th><th>Access</th></tr></thead>
          <tbody>
            <tr><td><code>/</code></td><td>Group portal on the apex host. Company entry page on a company host or when <code>?tenant=</code> is set. Signed-in users go to the hub.</td><td>Public entry</td></tr>
            <tr><td><code>/login</code></td><td>Company sign-in. Already signed-in users continue to the page they were trying to open, or the reviews tab.</td><td>Public</td></tr>
            <tr><td><code>/find-account</code></td><td>Find the roster email</td><td>Public</td></tr>
            <tr><td><code>/reset-password</code></td><td>Set a new password from the email link</td><td>Signed link</td></tr>
            <tr><td><code>/hub</code></td><td>Reviews, dashboard, growth, group, projects, leave, profile</td><td>Signed in, profile complete</td></tr>
            <tr><td><code>/appraisal</code></td><td>Appraisal admin console</td><td>Platform admin (or the legacy admin session)</td></tr>
            <tr><td><code>/admin</code></td><td>Admin sign-in gate. Admins are sent to <code>/appraisal</code>.</td><td>Public form; console is protected</td></tr>
            <tr><td><code>/docs</code> and <code>/docs/:section</code></td><td>This document. A section slug scrolls to that heading.</td><td>Public. Not linked from the portal.</td></tr>
            <tr><td><code>/mvp</code></td><td>Static product walkthrough with mock data</td><td>Public</td></tr>
          </tbody>
        </table>
        <h3>Redirects kept so old links still land</h3>
        <ul>
          <li><code>/survey</code> → <code>/hub?tab=survey</code></li>
          <li><code>/my-dashboard</code> → <code>/hub?tab=dashboard</code></li>
          <li><code>/wall-of-fame</code> → rankings only if that capability is on; otherwise the reviews tab</li>
          <li><code>/landing</code> and <code>/onboarding</code> → <code>/</code></li>
          <li><code>/omotola</code> → reviews tab</li>
          <li><code>/dashboard</code> and <code>/demo</code> are off for the three live companies and redirect into the current admin or login flow</li>
        </ul>
        <h3>Useful hub links</h3>
        <ul>
          <li><code>/hub?tab=survey</code> — reviews</li>
          <li><code>/hub?tab=projects</code> — projects</li>
          <li><code>/hub?tab=leave</code> — leave planner</li>
          <li><code>/hub?tab=profile</code> — profile</li>
          <li><code>/hub?tab=group</code> — group overview, when the person has more than one company</li>
          <li><code>/hub?tab=survey&amp;ghcTab=admin</code> — HR Monitor on a GHC-style company, for a company admin</li>
        </ul>
        <p>
          Local examples: <code>http://localhost:8080/?tenant=ghc</code>,{" "}
          <code>http://localhost:8080/login?tenant=vigipay</code>,{" "}
          <code>http://localhost:8080/hub?tab=leave&amp;tenant=executiveteam</code>.
        </p>
      </>
    ),
  },
  {
    id: "data-access",
    num: "15",
    title: "Data Access and Usage",
    body: (
      <>
        <p>
          Application data lives in one Postgres database, in the RLS-locked <code>public</code> schema. The
          frontend is a static SPA. A browser receives only what RLS and the security-definer RPCs allow for the
          signed-in user, for the active employee. Email bodies are not stored — only send-log metadata. Backups
          use point-in-time recovery.
        </p>
        <table>
          <thead><tr><th>Data</th><th>Source</th><th>Cadence</th><th>Who can see it</th></tr></thead>
          <tbody>
            <tr><td>Roster <code>employees</code></td><td>Admin import and provisioning for that company</td><td>Ad hoc. Leavers are deactivated.</td><td>Reads needed to run the company. Writes: admin, plus self-service profile fields.</td></tr>
            <tr><td>Logins <code>profiles</code> / <code>employee_access</code></td><td>Provisioning, first-login completion, company switch</td><td>Ad hoc</td><td>Self. Grants are not client-writable.</td></tr>
            <tr><td>BOOM assessments</td><td>Reviewer in the hub (draft, then submit)</td><td>Monthly self; quarterly 360, EPA, EA, executive</td><td>Reviewer: own rows. Reviewee: aggregated RPCs only. Admin: monitor and export.</td></tr>
            <tr><td>GHC-style reviews</td><td>Same pattern, GHC task runners</td><td>Monthly self and manager review; quarterly 360 and evaluation</td><td>Reviewer: own tasks. Employee: own results, including anonymous 360 as soon as peers submit. HR: monitor, including named 360.</td></tr>
            <tr><td>Projects and tasks</td><td>Members in the projects tab</td><td>As work happens</td><td>Members of that project, in that company.</td></tr>
            <tr><td>Leave</td><td>Employee request; HR, then the line manager</td><td>Each type has its own balance. Annual leave uses the quarterly window.</td><td>Company leave list for signed-in colleagues of that company. HR decides first. The line manager decides after HR.</td></tr>
            <tr><td>Avatars</td><td>Profile upload</td><td>Ad hoc</td><td>Public read of the image file. Path is tied to the auth user.</td></tr>
            <tr><td>Email metadata</td><td>Queue at send time</td><td>Per message</td><td>Service role. Bodies are not stored.</td></tr>
            <tr><td>AI context</td><td>Assembled per request on the server</td><td>On demand</td><td>Sent to Anthropic or Perplexity. Not written back to assessment tables. No reviewer identity for peer 360.</td></tr>
          </tbody>
        </table>
        <h3>What this platform does not ingest</h3>
        <ul>
          <li>It does not pull from Microsoft 365, an HRIS, or any other VGG system of record. Writes come from a signed-in person, or from an explicit admin action.</li>
          <li>Outbound calls are the AI providers (when AI is on) and the SMTP relay for transactional mail.</li>
          <li>Microsoft 365 usage workbooks previously shared for a separate productivity review were processed outside this database. They are not loaded here.</li>
        </ul>
      </>
    ),
  },
  {
    id: "architecture",
    num: "16",
    title: "Architecture",
    body: (
      <>
        <h3>Topology</h3>
        <p>
          Browser (React 18 SPA) → one static host on Render, custom domains for <code>vgg.tools</code>,{" "}
          <code>executive.vgg.tools</code>, <code>ghc.vgg.tools</code>, and <code>vigipay.vgg.tools</code> → one
          Supabase project (Postgres, Auth, Storage, Edge Functions). Tenant selection is a frontend and SQL
          concern. It is not a separate deploy per company.
        </p>
        <h3>Frontend</h3>
        <table>
          <thead><tr><th>Layer</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Framework</td><td>React 18, Vite 5, TypeScript 5</td></tr>
            <tr><td>Styling</td><td>Tailwind CSS v3, tokens in <code>index.css</code></td></tr>
            <tr><td>Components</td><td>Radix-based UI primitives</td></tr>
            <tr><td>Routing</td><td>react-router-dom. Company from host, query, and the tenant lock.</td></tr>
            <tr><td>Server data</td><td>Supabase JS client. Review flows use React Query where the older dashboards do.</td></tr>
            <tr><td>Forms</td><td>react-hook-form and zod on the flows that use them; review runners keep their own draft state</td></tr>
            <tr><td>Charts</td><td>Recharts on dashboards and insights</td></tr>
          </tbody>
        </table>
        <h3>Backend</h3>
        <table>
          <thead><tr><th>Layer</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Database</td><td>PostgreSQL on Supabase</td></tr>
            <tr><td>Auth</td><td>Email and password, invite-only</td></tr>
            <tr><td>Business rules</td><td>SQL functions for routing, anonymity, leave, projects, profile updates, and company switching. Edge Functions for provisioning, email, and AI.</td></tr>
            <tr><td>Queue</td><td>pgmq for auth and transactional email</td></tr>
            <tr><td>Scheduler</td><td>pg_cron wakes the email dispatcher when a queue is armed</td></tr>
            <tr><td>Storage</td><td><code>email-assets</code> (public email imagery) and <code>avatars</code> (profile photos)</td></tr>
            <tr><td>Access</td><td>RLS, <code>user_roles</code>, <code>has_role()</code>, <code>employee_access</code>, <code>current_employee_id()</code></td></tr>
          </tbody>
        </table>
        <h3>Code layout</h3>
        <ul>
          <li><code>src/tenants</code> — company list, host resolution, branding, lock.</li>
          <li><code>src/pages/EmployeeHub.tsx</code> — signed-in shell and tabs.</li>
          <li><code>src/components/boom</code> — Executive Team review hub.</li>
          <li><code>src/modules/ghc</code> — GHC and VigiPay review hub, runners, HR monitor, discussions.</li>
          <li><code>src/modules/workspace</code> — projects and leave.</li>
          <li><code>supabase/migrations</code> — schema. New behaviour ships as a migration, not as a manual edit on production.</li>
        </ul>
      </>
    ),
  },
  {
    id: "edge-functions",
    num: "17",
    title: "Edge Functions",
    body: (
      <>
        <table>
          <thead><tr><th>Function</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>bulk-create-users</code></td><td>Create auth users for employee rows and issue the first-login password.</td></tr>
            <tr><td><code>complete-profile</code></td><td>First-login handler: password, profile fields, onboarding complete.</td></tr>
            <tr><td><code>create-admin-user</code></td><td>Bootstrap a platform admin into <code>user_roles</code>.</td></tr>
            <tr><td><code>auth-email-hook</code></td><td>Signed Auth webhook. Renders the React email template and enqueues it.</td></tr>
            <tr><td><code>process-email-queue</code></td><td>Drains the auth and transactional queues through the SMTP relay. Woken by pg_cron about every 5 seconds while mail is waiting.</td></tr>
            <tr><td><code>chat</code></td><td>Admin analytics assistant. Search and reasoning providers, when AI is enabled.</td></tr>
            <tr><td><code>adaptive-resources</code></td><td>Growth Hub: personalised learning suggestions.</td></tr>
            <tr><td><code>research-resources</code></td><td>Perplexity-backed enrichment of resource metadata.</td></tr>
            <tr><td><code>learning-path-generate</code></td><td>A structured path from an employee’s growth areas.</td></tr>
            <tr><td><code>recommendation-*</code></td><td>Multi-stage recommender used when Growth Hub v2 is on: candidates, rank, evaluate, personalize, run.</td></tr>
            <tr><td><code>idp-check-in</code></td><td>Individual development plan check-ins on the weekly reflection cadence.</td></tr>
          </tbody>
        </table>
        <p>
          Leave, projects, profile edits, company switching, and review submission do not go through an edge
          function. They are Postgres RPCs so the same permission checks apply no matter which screen calls them.
        </p>
        <h3>Deploy</h3>
        <pre><code>{`npm run functions:deploy   # all edge functions
npm run db:apply           # pending SQL migrations
npm run supabase:deploy    # migrations, functions, and secrets`}</code></pre>
      </>
    ),
  },
  {
    id: "email",
    num: "18",
    title: "Email Pipeline",
    body: (
      <>
        <h3>Sender</h3>
        <ul>
          <li>Sending domain: <code>notify.vgg.tools</code></li>
          <li>From: <code>VGG People Office &lt;no-reply@notify.vgg.tools&gt;</code></li>
          <li>Templates are React, rendered in the edge function under <code>_shared/email-templates</code>.</li>
          <li>Auth categories: signup, invite, magic link, recovery, email change, reauthentication. Transactional notices (for example a submitted review) use the same queue.</li>
        </ul>
        <h3>Queue</h3>
        <p>
          <code>auth-email-hook</code> enqueues onto <code>pgmq.q_auth_emails</code> or{" "}
          <code>q_transactional_emails</code>. A trigger calls <code>email_queue_wake()</code>, which arms the{" "}
          <code>process-email-queue</code> cron job. The dispatcher posts to the edge function. When both queues
          are empty it removes the cron job under an advisory lock, so idle time does not keep polling.
        </p>
        <h3>Retry and suppression</h3>
        <ul>
          <li><code>email_send_state.retry_after_until</code> — global backoff after SMTP throttling.</li>
          <li><code>email_send_log</code> — per-message metadata. Not the body.</li>
          <li><code>suppressed_emails</code> — hard bounces and unsubscribes, checked before send.</li>
          <li><code>email_unsubscribe_tokens</code> — signed one-click unsubscribe.</li>
          <li><code>move_to_dlq</code> — dead-letter helper for messages that cannot be delivered.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    num: "19",
    title: "AI",
    body: (
      <>
        <h3>Where it appears</h3>
        <ul>
          <li><strong>Admin assistant.</strong> On the appraisal console. Context is roster, hierarchy, aggregated scores, and qualitative themes, assembled on the server. Output is markdown for admins. Peer 360 reviewer identity is not included.</li>
          <li><strong>Growth Hub.</strong> Resource suggestions, research enrichment, and learning paths from growth areas. Growth Hub v2 (the multi-stage recommender) is off unless <code>VITE_ENABLE_GROWTH_HUB_V2</code> is true.</li>
          <li><strong>GHC draft assist.</strong> Managers and HR can ask for wording help on an evaluation or discussion. The suggestion is editable. Submitting still requires the human to save the form. Scores are not generated into the record.</li>
        </ul>
        <h3>Governance</h3>
        <ul>
          <li>Calls leave the browser only via edge functions. API keys are server secrets.</li>
          <li><code>VITE_ENABLE_APP_AI</code> defaults on. Set it to <code>false</code> to hide the assistants.</li>
          <li>Providers are Anthropic Claude (<code>CLAUDE_API_KEY</code>) for reasoning and Perplexity (<code>PERPLEXITY_API_KEY</code>) for web search.</li>
          <li>Nothing from these calls is written into <code>assessment_*</code> or the GHC score columns.</li>
        </ul>
      </>
    ),
  },
  {
    id: "config",
    num: "20",
    title: "Configuration and Secrets",
    body: (
      <>
        <h3>Frontend environment</h3>
        <table>
          <thead><tr><th>Key</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>VITE_SUPABASE_URL</code></td><td>Supabase project URL</td></tr>
            <tr><td><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></td><td>Anon key. Safe in the browser because RLS and RPCs still apply.</td></tr>
            <tr><td><code>VITE_ENABLE_APP_AI</code></td><td>AI features. On unless set to <code>false</code>.</td></tr>
            <tr><td><code>VITE_ENABLE_GROWTH_HUB_V2</code></td><td>Beta Growth Hub recommender. Off unless set to <code>true</code>.</td></tr>
            <tr><td><code>VITE_DEFAULT_TENANT</code></td><td>Fallback slug when host and query do not resolve a company.</td></tr>
          </tbody>
        </table>
        <h3>Server secrets</h3>
        <table>
          <thead><tr><th>Secret</th><th>Used by</th></tr></thead>
          <tbody>
            <tr><td><code>SUPABASE_URL</code>, service role key, anon key, JWKS</td><td>Edge functions</td></tr>
            <tr><td><code>CLAUDE_API_KEY</code></td><td><code>chat</code>, <code>adaptive-resources</code>, <code>learning-path-generate</code></td></tr>
            <tr><td><code>PERPLEXITY_API_KEY</code></td><td><code>chat</code>, <code>research-resources</code></td></tr>
            <tr><td><code>email_queue_service_role_key</code> in Vault</td><td>Cron-triggered mail dispatcher</td></tr>
          </tbody>
        </table>
        <h3>Domains</h3>
        <ul>
          <li>App: <code>vgg.tools</code> plus <code>executive</code>, <code>ghc</code>, and <code>vigipay</code> as CNAMEs onto the same Render service.</li>
          <li>Email: <code>notify.vgg.tools</code> with SPF, DKIM, and DMARC.</li>
          <li>Auth redirect URLs must include every host above, or reset links fall back to the Site URL. <code>npm run setup:production-hosts</code> patches the allow-list when <code>SUPABASE_ACCESS_TOKEN</code> is available.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ops",
    num: "21",
    title: "Operations",
    body: (
      <>
        <h3>Routine commands</h3>
        <table>
          <thead><tr><th>Task</th><th>Command</th></tr></thead>
          <tbody>
            <tr><td>Apply migrations</td><td><code>npm run db:apply</code></td></tr>
            <tr><td>Deploy edge functions</td><td><code>npm run functions:deploy</code></td></tr>
            <tr><td>Sync secrets</td><td><code>npm run secrets:sync</code></td></tr>
            <tr><td>Full Supabase deploy</td><td><code>npm run supabase:deploy</code></td></tr>
            <tr><td>Seed demo auth users</td><td><code>npm run seed:demo-auth</code></td></tr>
            <tr><td>Check the EO roster</td><td><code>npm run check:eo-roster</code></td></tr>
            <tr><td>Export the EO roster</td><td><code>npm run export:eo-roster</code></td></tr>
            <tr><td>Reset a password</td><td><code>node scripts/reset-user-password.mjs &lt;email&gt;</code></td></tr>
            <tr><td>Tests</td><td><code>npm test</code></td></tr>
          </tbody>
        </table>
        <h3>Emails are not sending</h3>
        <ol>
          <li>Read <code>email_send_state.retry_after_until</code>. If it is in the future, SMTP asked for a backoff.</li>
          <li>Look in <code>pgmq.q_auth_emails</code> and <code>q_transactional_emails</code> for stuck messages.</li>
          <li>Read the <code>process-email-queue</code> edge logs.</li>
          <li>Confirm the cron job exists. The next successful enqueue recreates it if the wake trigger is in place.</li>
          <li>Check <code>suppressed_emails</code> if one recipient never gets mail.</li>
        </ol>
        <h3>A person cannot sign in</h3>
        <ol>
          <li>Confirm the email exists on <code>employees</code> for the company they are opening (match is case-insensitive).</li>
          <li>Confirm a <code>profiles</code> row exists for the auth user, and that <code>employee_access</code> contains the roster row they should act as.</li>
          <li>If the auth user is missing, run bulk create for that email or send a password reset after the user exists.</li>
          <li>If they land on the wrong company, check <code>active_employee_id</code> and the tenant lock rather than the email domain.</li>
        </ol>
        <h3>Executive Team 360 looks empty</h3>
        <p>
          Confirm the quarter, then confirm at least one submitted <code>peer_360</code> response exists for that
          reviewee and period. If facilitators can see scores and the subject cannot, the subject should be calling{" "}
          <code>get_my_360_dashboard</code> / <code>get_my_360_results</code>, not the oversight detail RPC.
        </p>
        <h3>GHC or VigiPay 360 looks empty for the employee</h3>
        <p>
          Confirm at least one submitted peer 360 exists for that person and quarter. Results are not held for an HR
          release. Also confirm the employee’s active company is the one the reviews were written in.
        </p>
        <h3>Leave request is rejected</h3>
        <ul>
          <li>The dates include a weekend only, or the end is before the start.</li>
          <li>For annual leave, the block crosses a quarter, or it touches the first or last two weeks.</li>
          <li>For annual leave, today is after the week-2 deadline and the caller is not HR. Other types stay open.</li>
          <li>The person, or someone else in the same department, already has active leave on those dates.</li>
          <li>The block would push that leave type over its own allowance, counting requests that are with HR, with the manager, or approved.</li>
        </ul>
        <h3>Adding a person to a second company</h3>
        <p>
          Create or reuse the roster row on that subsidiary, then insert <code>employee_access</code> for their
          existing <code>profiles.id</code>. Do not match by name in an ad hoc query and grant it. After the grant,
          the switcher appears on next load. They still need a password only for the one auth user.
        </p>
      </>
    ),
  },
  {
    id: "security",
    num: "22",
    title: "Security Posture",
    body: (
      <>
        <ul>
          <li>RLS is on for application tables, with explicit policies and grants.</li>
          <li>Platform roles live in <code>user_roles</code>, not on <code>profiles</code>, so a profile edit cannot escalate privilege.</li>
          <li><code>has_role()</code> is security definer with a fixed search path, which avoids recursive policy checks.</li>
          <li>Company membership is an allow-list. <code>current_employee_id()</code> ignores an active employee id that was not granted.</li>
          <li>Reviewer identity for peer 360 is stored for integrity and hidden from the reviewee by the RPCs that serve them. HR named views are a separate, role-gated path.</li>
          <li>Leave rules (quota, quarter window, department exclusivity, approval order) run inside the database. The UI mirrors them; it is not the enforcement layer.</li>
          <li>Project visibility is membership plus subsidiary. A crafted project id from another company does not resolve.</li>
          <li>Profile self-service cannot change email, company, manager, or admin flags.</li>
          <li>Avatar writes are limited to the caller’s own prefix in the bucket.</li>
          <li>AI providers are reached only from edge functions. Keys stay in Vault.</li>
          <li>Auth email webhooks are signature-checked. Mail is queued, not sent inline from the browser.</li>
          <li>No anonymous signup, no auto-confirm, no client role changes.</li>
          <li>Production hosts are HTTPS.</li>
        </ul>
        <h3>Retention</h3>
        <ul>
          <li>Employees are deactivated, not deleted, when they leave. Historical reviews stay attached to the period.</li>
          <li>The person can still read their own aggregated results for past periods. Admins can monitor those periods.</li>
          <li>Cancelled leave is kept but omitted from the shared list. Declined leave stays visible as declined.</li>
          <li>Email bodies are not retained. Send-log rows are.</li>
          <li>Database backups are point-in-time recovery on the Supabase project.</li>
        </ul>
      </>
    ),
  },
  {
    id: "glossary",
    num: "A",
    title: "Glossary",
    body: (
      <table>
        <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Workspace</td><td>The signed-in product: performance, projects, and leave for one company.</td></tr>
          <tr><td>Portal</td><td>The apex page on <code>vgg.tools</code> where a visitor picks a company.</td></tr>
          <tr><td>BOOM</td><td>Executive Team performance system.</td></tr>
          <tr><td>EO</td><td>Executive Office. The Executive Team roster.</td></tr>
          <tr><td>GHC</td><td>GreenHouse Capital, and also the name of the review cycle VigiPay currently shares.</td></tr>
          <tr><td>Subsidiary</td><td>The database company row. The product calls it a company in the interface.</td></tr>
          <tr><td>Active employee</td><td>The roster row the login is acting as right now.</td></tr>
          <tr><td>Company admin</td><td><code>employees.company_admin</code>. HR Monitor and final leave approval for that company.</td></tr>
          <tr><td>Platform admin</td><td><code>user_roles.admin</code>. Appraisal console and cross-company operator tools.</td></tr>
          <tr><td>360</td><td>Multi-rater peer review. Recipients see aggregates. Names stay off the recipient views.</td></tr>
          <tr><td>Release</td><td>On GHC and VigiPay, the HR action that opens quarterly 360 results to employees.</td></tr>
          <tr><td>EPA</td><td>Executive Performance Assessment add-on on Executive Team.</td></tr>
          <tr><td>Executive Office Quarterly Evaluation</td><td>Executive Team manager review of a named report, driven by an explicit pair list. The form code remains <code>ea_quarterly</code>.</td></tr>
          <tr><td>N/O</td><td>No opportunity to observe. A valid non-score on 360 items.</td></tr>
          <tr><td>Period</td><td><code>YYYY-Qn</code> for a quarter, <code>YYYY-MM</code> for a month.</td></tr>
          <tr><td>Working day</td><td>Monday to Friday. Leave allowance and department clashes use this count.</td></tr>
          <tr><td>Line manager</td><td>For leave and GHC-style reviews, <code>ghc_manager_id</code> if set, otherwise <code>manager_id</code>.</td></tr>
          <tr><td>Blackout</td><td>The first 14 and last 14 days of a quarter, when leave cannot be booked.</td></tr>
          <tr><td>Delegation</td><td>A pending handoff of a project task. The assignee changes only after acceptance.</td></tr>
        </tbody>
      </table>
    ),
  },
];

export default function Docs() {
  const { section: sectionParam } = useParams();
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    if (!sectionParam) return;
    const match = SECTIONS.find((s) => s.id === sectionParam);
    if (!match) return;
    const el = document.getElementById(match.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(match.id);
  }, [sectionParam]);

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
      { label: "Audience", value: "Engineers, admins, People Ops" },
      { label: "Stack", value: "React · TypeScript · Supabase" },
      { label: "Hosts", value: "vgg.tools · executive · ghc · vigipay" },
      { label: "Companies", value: "Executive Team · GHC · VigiPay" },
      { label: "Updated", value: "October 2026 · v2" },
    ],
    [],
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <span className="inline-flex rounded-full bg-teal-100 px-3 py-1 text-[13px] font-medium text-teal-800">
            Venture Garden Group
          </span>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ← Back to portal
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <p className="text-sm text-muted-foreground">Product and technical documentation</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight md:text-5xl">
            VGG workspace
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-foreground/70">
            How the group portal, the three company workspaces, and the shared tools behave: performance
            cycles, projects, leave, profiles, anonymity, and access control.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-foreground/10 pt-6 md:grid-cols-5">
            {meta.map((m) => (
              <div key={m.label}>
                <dt className="text-sm text-muted-foreground">{m.label}</dt>
                <dd className="mt-1 text-sm font-medium">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[240px_1fr]">
        <aside className="app-sticky-subnav lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          <p className="mb-3 text-sm font-medium text-foreground/70">Contents</p>
          <nav className="space-y-1">
            {SECTIONS.map((s) => {
              const isActive = active === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`flex items-start gap-2 rounded-2xl px-2.5 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-teal-100 font-medium text-teal-900"
                      : "text-foreground/60 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="mt-0.5 tabular-nums text-muted-foreground">{s.num}</span>
                  {s.title}
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="docs-prose min-w-0">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="mb-16 scroll-mt-24">
              <p className="text-sm font-medium text-teal-800">Section {s.num}</p>
              <h2 className="mt-2 border-b border-foreground/10 pb-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                {s.title}
              </h2>
              <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-foreground/85">
                {s.body}
              </div>
            </section>
          ))}
          <footer className="mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-6 text-sm text-muted-foreground">
            <span>End of document</span>
            <span>VGG · October 2026</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
