/**
 * Extensive local-only demo data: projects, leave, reviews.
 * Refuses to run unless `.env.docker` points at 127.0.0.1 / localhost.
 * Re-runnable: wipes previous demo rows in Docker, then refills.
 *
 *   npm run seed:local
 */
import {
  GHC_SUBSIDIARY_ID,
  VIGIPAY_SUBSIDIARY_ID,
  assertLocalSupabaseUrl,
  connectLocalPostgres,
  localEnv,
  tableExists,
} from './local-supabase.mjs';

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function pick(arr, index) {
  return arr[index % arr.length];
}

function monthPeriod(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function quarterPeriod(d = new Date()) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

const PROJECTS = {
  '11111111-1111-1111-1111-111111111111': [
    ['Q4 Board pack', 'Numbers, narrative, and appendix for the October board.'],
    ['Group OKR refresh', 'Rewrite company OKRs so subsidiaries can cascade them.'],
    ['vgg.tools workspace rollout', 'Projects + leave live on every company hub.'],
    ['People Ops policy review', 'Leave, delegation, and access rules in one pass.'],
    ['Subsidiary pulse interviews', 'Structured conversations ahead of year-end reviews.'],
  ],
  [GHC_SUBSIDIARY_ID]: [
    ['Fund pipeline Q4', 'Active deals, passes, and IC notes in one place.'],
    ['LP quarterly letter', 'Draft, review, and send the investor update.'],
    ['Portfolio support sprint', 'Hands-on help for two companies this month.'],
    ['Talent review board', 'Who is ready, who needs a plan, who we hire next.'],
    ['Deal desk hygiene', 'Clean CRM, owners, and next actions.'],
  ],
  [VIGIPAY_SUBSIDIARY_ID]: [
    ['Agent network expansion', 'New corridors and agent onboarding this quarter.'],
    ['Compliance evidence pack', 'What audit will ask for — gather it now.'],
    ['Settlement ops playbook', 'Break-glass steps when a settlement stalls.'],
    ['Merchant onboarding sweep', 'Stuck applications, missing KYC, owners.'],
    ['Q4 collections push', 'Aging balances and who is chasing them.'],
  ],
};

const TASK_TITLES = [
  'Draft the first cut',
  'Collect source numbers',
  'Review with the owner',
  'Share for comments',
  'Close open questions',
  'Prepare the appendix',
  'Schedule the readout',
  'File the final version',
];

const LEAVE_TYPES = ['annual', 'compassionate', 'maternity', 'study'];
const LEAVE_NOTES = [
  'Family visit',
  'Clinic appointment',
  'School run overlap',
  'Travel already booked',
  'Recovery day',
  null,
];

async function seedProjects(local, bySub) {
  await local.query(`
    TRUNCATE TABLE
      public.workspace_activity_logs,
      public.workspace_task_delegations,
      public.workspace_tasks,
      public.workspace_project_members,
      public.workspace_projects
    CASCADE
  `);

  let projects = 0;
  let tasks = 0;
  for (const [sid, catalog] of Object.entries(PROJECTS)) {
    const people = bySub.get(sid) || [];
    if (people.length < 2) continue;
    const owner = [...people].sort((a, b) => (a.hierarchy_level ?? 99) - (b.hierarchy_level ?? 99))[0];

    for (let i = 0; i < catalog.length; i += 1) {
      const [name, description] = catalog[i];
      const due = iso(addDays(new Date(), 14 + i * 7));
      const { rows } = await local.query(
        `INSERT INTO public.workspace_projects (subsidiary_id, name, description, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [sid, name, description, due, owner.id],
      );
      const projectId = rows[0].id;
      projects += 1;

      const members = people;
      for (const member of members) {
        await local.query(
          `INSERT INTO public.workspace_project_members
             (project_id, employee_id, role, status, invited_by, responded_at)
           VALUES ($1, $2, $3, 'active', $4, now())`,
          [projectId, member.id, member.id === owner.id ? 'owner' : 'member', owner.id],
        );
      }

      const taskN = 5 + (i % 3);
      const createdTasks = [];
      for (let t = 0; t < taskN; t += 1) {
        const assignee = pick(members, t + i);
        const progress = [0, 20, 45, 70, 100][t % 5];
        const status = progress === 0 ? 'todo' : progress === 100 ? 'done' : 'in_progress';
        const { rows: taskRows } = await local.query(
          `INSERT INTO public.workspace_tasks
             (project_id, title, notes, created_by, assignee_id, due_date, progress, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            projectId,
            pick(TASK_TITLES, t + i),
            t % 2 === 0 ? 'Local demo task — safe to edit or delete.' : null,
            owner.id,
            assignee.id,
            iso(addDays(new Date(), 5 + t * 3)),
            progress,
            status,
          ],
        );
        createdTasks.push({ id: taskRows[0].id, assignee });
        tasks += 1;
      }

      if (members.length > 2 && createdTasks[1]) {
        const from = createdTasks[1].assignee;
        const to = members.find((m) => m.id !== from.id && m.id !== owner.id) || members[1];
        await local.query(
          `INSERT INTO public.workspace_task_delegations
             (task_id, from_employee_id, to_employee_id, status, note, created_at)
           VALUES ($1, $2, $3, 'pending', 'Can you take this while I am on the other thread?', now())`,
          [createdTasks[1].id, from.id, to.id],
        );
      }

      await local.query(
        `INSERT INTO public.workspace_activity_logs
           (subsidiary_id, project_id, actor_id, action, detail)
         VALUES
           ($1, $2, $3, 'project.created', jsonb_build_object('name', $4::text)),
           ($1, $2, $3, 'member.invited', jsonb_build_object('count', $5::int)),
           ($1, $2, $3, 'task.created', jsonb_build_object('count', $6::int))`,
        [sid, projectId, owner.id, name, members.length, taskN],
      );
    }
  }
  console.log(`  projects: ${projects}, tasks: ${tasks}`);
}

async function seedLeave(local, bySub) {
  if (!(await tableExists(local, 'workspace_leave_requests'))) {
    console.log('  skip leave (table missing — apply migrations)');
    return;
  }
  await local.query(`TRUNCATE TABLE public.workspace_leave_requests CASCADE`);
  const today = new Date();
  const q = Math.floor(today.getMonth() / 3);
  const qStart = new Date(today.getFullYear(), q * 3, 1);
  const qEnd = new Date(today.getFullYear(), q * 3 + 3, 0);
  const allowedStart = addDays(qStart, 14);
  const allowedEnd = addDays(qEnd, -14);
  let n = 0;
  for (const [sid, people] of bySub.entries()) {
    if (people.length === 0) continue;
    const admin = people.find((p) => p.company_admin) || people[0];
    const byDept = new Map();
    for (const emp of people) {
      const key = String(emp.department || 'Unassigned').trim().toLowerCase() || 'unassigned';
      const list = byDept.get(key) || [];
      list.push(emp);
      byDept.set(key, list);
    }

    let deptOffset = 0;
    for (const members of byDept.values()) {
      for (let i = 0; i < Math.min(members.length, 4); i += 1) {
        const emp = members[i];
        const mgr = emp.ghc_manager_id || emp.manager_id || admin.id;
        let start = addDays(allowedStart, deptOffset * 5 + i * 12);
        if (start > allowedEnd) start = allowedStart;
        let end = addDays(start, 4);
        if (end > allowedEnd) end = allowedEnd;
        let status;
        if (i === 0) status = 'approved';
        else if (i === 1) status = 'pending';
        else if (i === 2) status = 'manager_approved';
        else status = 'declined';
        await local.query(
          `INSERT INTO public.workspace_leave_requests
             (subsidiary_id, employee_id, leave_type, start_date, end_date, status, note, manager_id, decided_by, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            sid,
            emp.id,
            pick(LEAVE_TYPES, i + deptOffset),
            iso(start),
            iso(end),
            status,
            pick(LEAVE_NOTES, i + deptOffset),
            mgr,
            status === 'pending' || status === 'manager_approved' ? null : admin.id,
            status === 'pending' || status === 'manager_approved' ? null : addDays(start, -1).toISOString(),
          ],
        );
        n += 1;
      }
      deptOffset += 1;
    }
  }
  console.log(`  leave requests: ${n}`);
}

async function upsertCycle(local, subsidiaryId, kind, period) {
  if (!(await tableExists(local, 'ghc_cycle_settings'))) return;
  await local.query(
    `INSERT INTO public.ghc_cycle_settings (subsidiary_id, kind, period, opens_at, closes_at)
     VALUES ($1, $2, $3, now() - interval '7 days', now() + interval '21 days')
     ON CONFLICT (subsidiary_id, kind, period)
     DO UPDATE SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, released_at = NULL`,
    [subsidiaryId, kind, period],
  );
}

async function seedGhcStyleReviews(local, people, subsidiaryId, month, quarter) {
  if (!people.length) return;
  await upsertCycle(local, subsidiaryId, 'monthly_manager', month);
  await upsertCycle(local, subsidiaryId, 'peer_360', quarter);
  await upsertCycle(local, subsidiaryId, 'quarterly_evaluation', quarter);

  if (await tableExists(local, 'ghc_monthly_self_checkins')) {
    await local.query(
      `DELETE FROM public.ghc_monthly_self_checkins
        WHERE employee_id = ANY($1::uuid[]) AND period = $2`,
      [people.map((p) => p.id), month],
    );
    for (const emp of people) {
      await local.query(
        `INSERT INTO public.ghc_monthly_self_checkins
           (employee_id, period, status, time_off_this_quarter, looking_forward_work,
            meeting_okrs, displaying_growth, strong_relationship, motivated, fulfilled,
            additional_comments, submitted_at)
         VALUES ($1, $2, 'submitted', $3, true, true, true, true, true, 'yes',
                 'Local demo self check-in — safe to edit.', now())`,
        [emp.id, month, emp.id.charCodeAt(0) % 2 === 0],
      );
    }
  }

  if (await tableExists(local, 'ghc_monthly_reviews')) {
    await local.query(
      `DELETE FROM public.ghc_monthly_reviews WHERE subsidiary_id = $1 AND period = $2`,
      [subsidiaryId, month],
    );
    for (const emp of people) {
      const managerId = emp.ghc_manager_id || emp.manager_id;
      if (!managerId || managerId === emp.id || !people.some((p) => p.id === managerId)) continue;
      await local.query(
        `INSERT INTO public.ghc_monthly_reviews
           (subsidiary_id, manager_id, report_id, period, status, proud_this_month,
            meeting_okrs, displaying_growth, strong_relationship, motivated, fulfilled,
            culture_founders_lps, culture_curious, culture_move_fast, culture_overachievement,
            culture_job_done, feedback_to_report, submitted_at)
         VALUES ($1, $2, $3, $4, 'submitted', true, true, true, true, true, 'yes',
                 4, 4, 5, 4, 4, 'Local demo manager review — safe to edit.', now())`,
        [subsidiaryId, managerId, emp.id, month],
      );
    }
  }

  if (await tableExists(local, 'ghc_360_responses')) {
    await local.query(
      `DELETE FROM public.ghc_360_responses WHERE subsidiary_id = $1 AND period = $2`,
      [subsidiaryId, quarter],
    );
    for (let i = 0; i < people.length; i += 1) {
      const reviewer = people[i];
      for (let k = 1; k <= 3; k += 1) {
        const reviewee = pick(people, i + k);
        if (reviewee.id === reviewer.id) continue;
        await local.query(
          `INSERT INTO public.ghc_360_responses
             (subsidiary_id, reviewer_id, reviewee_id, period, status,
              score_founders_lps, score_curious, score_move_fast, score_overachievement, score_job_done,
              did_well, additional_comments, submitted_at)
           VALUES ($1, $2, $3, $4, 'submitted', 4, 5, 4, 4, 5,
                   'Reliable on the hard days.', 'Local demo 360 — safe to edit.', now())
           ON CONFLICT (reviewer_id, reviewee_id, period) DO NOTHING`,
          [subsidiaryId, reviewer.id, reviewee.id, quarter],
        );
      }
    }
  }

  if (await tableExists(local, 'ghc_quarterly_evaluations')) {
    await local.query(
      `DELETE FROM public.ghc_quarterly_evaluations WHERE subsidiary_id = $1 AND period = $2`,
      [subsidiaryId, quarter],
    );
    for (const emp of people) {
      const managerId = emp.ghc_manager_id || emp.manager_id;
      if (!managerId || managerId === emp.id || !people.some((p) => p.id === managerId)) continue;
      const { rows } = await local.query(
        `INSERT INTO public.ghc_quarterly_evaluations
           (subsidiary_id, manager_id, employee_id, period, review_type, status,
            score_technical, score_founders_lps, score_curious, score_move_fast,
            score_overachievement, score_job_done, score_growth,
            comment_technical, strengths, improvements, total_pct, band_rating, submitted_at)
         VALUES ($1, $2, $3, $4, 'Q3', 'submitted',
                 4, 4, 5, 4, 4, 4, 4,
                 'Local demo evaluation — safe to edit.',
                 '["Owns the work"]'::jsonb, '["Close the loop faster"]'::jsonb,
                 82, 4, now())
         RETURNING id`,
        [subsidiaryId, managerId, emp.id, quarter],
      );
      if (await tableExists(local, 'ghc_partner_recommendations') && rows[0]) {
        await local.query(
          `INSERT INTO public.ghc_partner_recommendations (evaluation_id, action_option, sort_order, recommendation_by_manager)
           VALUES ($1, 'retain', 0, 'Keep growing in role.')
           ON CONFLICT DO NOTHING`,
          [rows[0].id],
        );
      }
    }
  }
}

async function seedBoomReviews(local, people, period) {
  if (!(await tableExists(local, 'assessment_responses')) || !(await tableExists(local, 'assessment_forms'))) {
    console.log('  skip boom reviews (assessment tables missing)');
    return;
  }
  const { rows: forms } = await local.query(`SELECT id, code FROM public.assessment_forms`);
  if (!forms.length || people.length < 2) {
    console.log('  skip boom reviews (no forms or people)');
    return;
  }
  const { rows: questions } = await local.query(
    `SELECT id, form_id, question_type FROM public.assessment_questions`,
  );
  if (await tableExists(local, 'boom_discussion_messages')) {
    await local.query(`DELETE FROM public.boom_discussion_messages`);
  }
  if (await tableExists(local, 'boom_result_discussions')) {
    await local.query(`DELETE FROM public.boom_result_discussions`);
  }
  await local.query(
    `DELETE FROM public.assessment_answers a
      USING public.assessment_responses r
      WHERE a.response_id = r.id AND r.period = $1`,
    [period],
  );
  await local.query(`DELETE FROM public.assessment_responses WHERE period = $1`, [period]);

  let n = 0;
  for (let i = 0; i < people.length; i += 1) {
    const reviewer = people[i];
    const reviewees = [people[(i + 1) % people.length], people[(i + 2) % people.length]];
    for (const form of forms.slice(0, 3)) {
      for (const reviewee of reviewees) {
        if (reviewee.id === reviewer.id) continue;
        const { rows } = await local.query(
          `INSERT INTO public.assessment_responses
             (form_id, reviewer_id, reviewee_id, period, status, submitted_at)
           VALUES ($1, $2, $3, $4, 'submitted', now())
           ON CONFLICT (form_id, reviewer_id, reviewee_id, period) DO UPDATE
             SET status = 'submitted', submitted_at = now()
           RETURNING id`,
          [form.id, reviewer.id, reviewee.id, period],
        );
        const responseId = rows[0]?.id;
        if (!responseId) continue;
        n += 1;
        const formQuestions = questions.filter((q) => q.form_id === form.id).slice(0, 8);
        for (const q of formQuestions) {
          const scored = q.question_type !== 'text';
          await local.query(
            `INSERT INTO public.assessment_answers (response_id, question_id, score, text_answer)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (response_id, question_id) DO NOTHING`,
            [
              responseId,
              q.id,
              scored ? 3 + (i % 3) : null,
              scored ? null : 'Local demo answer — safe to edit.',
            ],
          );
        }
      }
    }
  }
  console.log(`  boom assessment responses: ${n}`);
}

async function main() {
  const docker = localEnv();
  assertLocalSupabaseUrl(docker.VITE_SUPABASE_URL || docker.SUPABASE_URL, 'local VITE_SUPABASE_URL');

  const local = await connectLocalPostgres();
  try {
    if (!(await tableExists(local, 'employees'))) {
      throw new Error('Local schema is empty. Run npm run db:local:reset then npm run db:local:sync.');
    }
    const { rows: employees } = await local.query(`
      SELECT *
        FROM public.employees
       WHERE email IS NOT NULL AND btrim(email) <> ''
       ORDER BY name
    `);
    if (!employees.length) {
      throw new Error('No local employees. Run npm run db:local:sync first.');
    }

    const bySub = new Map();
    for (const emp of employees) {
      const list = bySub.get(emp.subsidiary_id) || [];
      list.push(emp);
      bySub.set(emp.subsidiary_id, list);
    }

    const month = monthPeriod();
    const quarter = docker.VITE_ACTIVE_APPRAISAL_QUARTER || process.env.VITE_ACTIVE_APPRAISAL_QUARTER || quarterPeriod();
    console.log(`Seeding local demo (${employees.length} people, month ${month}, quarter ${quarter})`);

    console.log('Projects');
    await seedProjects(local, bySub);
    console.log('Leave');
    await seedLeave(local, bySub);
    console.log('GHC / VigiPay reviews');
    await seedGhcStyleReviews(local, bySub.get(GHC_SUBSIDIARY_ID) || [], GHC_SUBSIDIARY_ID, month, quarter);
    await seedGhcStyleReviews(local, bySub.get(VIGIPAY_SUBSIDIARY_ID) || [], VIGIPAY_SUBSIDIARY_ID, month, quarter);
    console.log('Executive Team reviews');
    await seedBoomReviews(
      local,
      bySub.get('11111111-1111-1111-1111-111111111111') || [],
      quarter,
    );

    console.log('');
    console.log('Local demo data is ready. Create / delete anything — it stays in Docker.');
    console.log('git push sends code and schema, not this data.');
  } finally {
    await local.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
