import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const wb = XLSX.utils.book_new();

function sheet(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const cols = Math.max(...rows.map((r) => r.length), 1);
  ws['!cols'] = Array.from({ length: cols }, (_, i) => ({
    wch: i === 0 ? 28 : i === 1 ? 42 : 36,
  }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

sheet('00_README', [
  ['VigiPay Appraisal — Requirements Intake Pack'],
  [''],
  ['Purpose'],
  [
    'Fill every sheet as completely as possible. This pack is designed so engineering can build the full VigiPay appraisal module (like GreenHouse Capital) without follow-up workshops for missing logic.',
  ],
  [''],
  ['How to use'],
  ['1. One owner coordinates. Multiple people can fill different sheets.'],
  ['2. Empty answer cells need VigiPay input. Do not leave critical sheets blank.'],
  ['3. Where options are listed, pick from the list or write CUSTOM: and explain.'],
  [
    '4. Attach original Word/PDF/Excel forms as files; ALSO paste questions into the Form_* sheets so nothing is lost.',
  ],
  [
    '5. Return this workbook + brand assets (logo PNG/SVG, colours) + any form PDFs in one folder.',
  ],
  [''],
  ['What “done” looks like'],
  [
    'We can answer: who logs in, which company/team/role/level they pick, who they review, on which form, how often, how scores are calculated, who sees results, who releases results, and what HR does after submit — with zero ambiguity.',
  ],
  [''],
  ['Platform context (do not change — for awareness)'],
  [
    'VGG parent platform hosts multiple companies (Executive Team / BOOM, GreenHouse Capital, VigiPay, …).',
  ],
  [
    'Each company gets its own workspace branding, forms, assignment rules, and scoring — shared login platform, gated by company.',
  ],
  [
    'Live URL pattern expected: vigipay.vgg.app (or similar) — confirm in Company_Identity sheet.',
  ],
  [''],
  ['Sheet index'],
  ['01_Company_Identity — legal name, domains, brand colours, parent credit'],
  ['02_Contacts — who owns HR / People / Tech answers'],
  ['03_Org_Roster — EVERY active person (email, title, team, level, managers)'],
  ['04_Departments_Teams — official team list for profile dropdowns'],
  ['05_Roles_Titles — job titles for profile dropdowns'],
  ['06_Seniority_Levels — org ladder (separate from job title)'],
  ['07_Reporting_Lines — primary + secondary managers'],
  ['08_Appraisal_Products — which review types VigiPay uses'],
  ['09_Cadence_Calendar — monthly / quarterly / annual timing'],
  ['10_Assignment_Rules — who reviews whom for each product'],
  ['11_Form_Monthly — fields, scales, required rules'],
  ['12_Form_360 — fields, anonymity, who is in the pool'],
  ['13_Form_Quarterly_Eval — indicators, weights, bands, goals'],
  ['14_Form_Other — self-assessment or any extra forms'],
  ['15_Culture_Competencies — values / behaviours / OKR logic'],
  ['16_Scoring_Bands — totals, percentages, rating labels'],
  ['17_Privacy_Anonymity — who sees names vs aggregates'],
  ['18_Release_Admin — HR release gates, Monitor actions'],
  ['19_Partner_HR_Actions — promote / salary / PIP etc.'],
  ['20_Acknowledge_Discuss — employee ack + discussion rules'],
  ['21_Notifications — in-app + email events'],
  ['22_Access_Admins — who is platform admin / People Ops'],
  ['23_Branding_Assets — logos, favicon, theme checklist'],
  ['24_Unique_vs_GHC — what must differ from GreenHouse Capital'],
  ['25_Scenarios — walkthroughs to validate the design'],
  ['26_Open_Decisions — anything still undecided (minimize these)'],
  [''],
  ['Priority order if time is short'],
  [
    'MUST: 03_Org_Roster, 07_Reporting_Lines, 08_Appraisal_Products, 10_Assignment_Rules, 11–13 Form sheets, 16_Scoring_Bands',
  ],
  ['SHOULD: 04–06 lists, 17–21 privacy/admin/notifications, 23 branding'],
  ['NICE: 25 scenarios, 24 unique notes'],
]);

sheet('01_Company_Identity', [
  ['Field', 'Answer (fill)', 'Notes / options'],
  ['Legal company name', '', 'Exact spelling for UI'],
  ['Short name / brand', '', 'e.g. VigiPay'],
  ['Workspace label', '', 'Shown in sidebar, e.g. "VigiPay appraisal workspace"'],
  [
    'Parent company credit line',
    '',
    'e.g. "A Venture Garden Group company" — yes/no + exact text',
  ],
  ['Primary email domain(s)', '', '@vigipay.com etc. — used for login routing'],
  [
    'Secondary email domains allowed',
    '',
    'List all; include VGG emails if some staff use them',
  ],
  ['Preferred live hostname', '', 'e.g. vigipay.vgg.app'],
  ['Alternate hostnames', '', ''],
  ['Subsidiary / company ID in VGG org chart', '', 'If already listed in group directories'],
  [
    'Is VigiPay a subsidiary or sister company?',
    '',
    'Affects “Company” label wording only',
  ],
  ['Primary brand colour (hex)', '', 'From logo / brand guide'],
  ['Secondary / accent colour (hex)', '', ''],
  ['Background / sidebar colour (hex)', '', ''],
  ['Logo mark file provided?', '', 'PNG/SVG white-on-dark + colour versions'],
  ['Logo wordmark / banner provided?', '', 'Wide sidebar banner preferred'],
  ['Favicon provided?', '', 'Square mark'],
  ['Tone of voice for UI copy', '', 'Formal / friendly / fintech / etc.'],
  ['Languages', '', 'English only?'],
  ['Go-live target date', '', ''],
  ['Pilot group vs full company', '', 'Who launches first'],
  [
    'Anything confidential / not to show other VGG companies',
    '',
    'Privacy expectations',
  ],
]);

sheet('02_Contacts', [
  ['Role', 'Name', 'Email', 'WhatsApp/Phone', 'Owns which sheets', 'Notes'],
  ['Executive sponsor', '', '', '', '', ''],
  ['People / HR lead', '', '', '', 'Forms, scoring, release, roster', ''],
  ['Line-manager champion', '', '', '', 'Assignment rules, monthly/eval UX', ''],
  ['IT / email / domains', '', '', '', 'Auth redirects, domains', ''],
  ['Brand / design', '', '', '', 'Logo, colours', ''],
  ['Day-to-day coordinator with build team', '', '', '', 'All returns', ''],
  ['Approver for go-live content', '', '', '', 'Final sign-off', ''],
]);

sheet('03_Org_Roster', [
  [
    'Full name',
    'Work email (login)',
    'Alternate email',
    'Job title / role (from Roles list)',
    'Team / department (from Departments list)',
    'Seniority level (from Seniority list)',
    'Primary manager email',
    'Secondary manager email (if any)',
    'Active in appraisal? (Y/N)',
    'Start date / hire date',
    'Is vacant seat? (Y/N)',
    'Notes (maternity, contractor, dual entity, etc.)',
  ],
  ...Array.from({ length: 40 }, () => Array(12).fill('')),
]);

sheet('04_Departments_Teams', [
  [
    'Team / department name (exact UI label)',
    'Description',
    'Active? (Y/N)',
    'Sort order',
    'Notes',
  ],
  ...Array.from({ length: 12 }, () => ['', '', 'Y', '', '']),
  [
    'Can people type a custom team not on this list?',
    '',
    '',
    '',
    'Y/N — recommend N for clean data',
  ],
  ['Who can change the official list later?', '', '', '', 'HR admin only?'],
]);

sheet('05_Roles_Titles', [
  [
    'Job title / role (exact UI label)',
    'Typical seniority it maps to (optional)',
    'Active? (Y/N)',
    'Sort order',
    'Notes / examples',
  ],
  ...Array.from({ length: 25 }, () => ['', '', 'Y', '', '']),
  [
    'Can people type a custom title?',
    '',
    '',
    '',
    'Y/N — GHC used select-only',
  ],
  [
    'IMPORTANT: Job title ≠ seniority',
    'Senior Associate can still be Team member',
    '',
    '',
    'Confirm VigiPay uses the same split',
  ],
]);

sheet('06_Seniority_Levels', [
  [
    'Level code / number (for system)',
    'Display label',
    'More senior = lower number? (Y/N)',
    'Who typically sits here',
    'Can manage directs? (Y/N)',
    'Notes',
  ],
  [
    '1',
    '',
    'Y',
    '',
    '',
    'Example GHC: 1=Manager, 2=Line manager, 3=Team member',
  ],
  ['2', '', '', '', '', ''],
  ['3', '', '', '', '', ''],
  ['4', '', '', '', '', ''],
  ['5', '', '', '', '', ''],
  [
    'Exact ordered list (most senior → least)',
    '',
    '',
    '',
    '',
    'Paste final ordered labels',
  ],
  [
    'Is seniority used for 360 pools / ranking?',
    '',
    '',
    '',
    '',
    'Y/N + explain',
  ],
  [
    'Is seniority used for who can see directory insights?',
    '',
    '',
    '',
    '',
    'Y/N + explain',
  ],
  ['Default seniority for new joiners', '', '', '', '', ''],
]);

sheet('07_Reporting_Lines', [
  [
    'Employee email',
    'Primary manager email',
    'Secondary manager email',
    'Both managers write monthly? (Y/N)',
    'Both managers write quarterly eval? (Y/N)',
    'Notes',
  ],
  ...Array.from({ length: 30 }, () => Array(6).fill('')),
  ['RULES (answer below)', '', '', '', '', ''],
  ['Who sits at the top (no manager)?', '', '', '', '', ''],
  ['Can someone have 2+ secondary managers?', '', '', '', '', ''],
  [
    'If primary and secondary both submit monthly, does employee see both?',
    '',
    '',
    '',
    '',
    '',
  ],
  ['Vacant manager seats — skip or reassign?', '', '', '', '', ''],
  ['Contractors / advisors in the line?', '', '', '', '', ''],
]);

sheet('08_Appraisal_Products', [
  [
    'Product / instrument',
    'Used at VigiPay? (Y/N)',
    'Who writes it',
    'Who is the subject',
    'Cadence',
    'Anonymous to subject? (Y/N)',
    'Required / optional',
    'Notes',
  ],
  [
    'Monthly manager ↔ report review',
    '',
    'Manager',
    'Direct report',
    'Monthly',
    '',
    '',
    '',
  ],
  ['Quarterly peer 360', '', 'Peers', 'Each other', 'Quarterly', '', '', ''],
  [
    'Formal quarterly / performance evaluation',
    '',
    'Manager',
    'Direct report',
    'Quarterly',
    '',
    '',
    '',
  ],
  ['Self-assessment / monthly self', '', '', '', '', '', '', ''],
  ['Manager evaluation of manager (upward)', '', '', '', '', '', '', ''],
  ['Skip-level review', '', '', '', '', '', '', ''],
  ['OKR / goals check-in (separate)', '', '', '', '', '', '', ''],
  ['Culture / values survey (org-wide)', '', '', '', '', '', '', ''],
  ['Probation review', '', '', '', '', '', '', ''],
  ['Exit / other', '', '', '', '', '', '', ''],
  [
    'Anything else unique to VigiPay',
    '',
    '',
    '',
    '',
    '',
    '',
    'Describe fully',
  ],
]);

sheet('09_Cadence_Calendar', [
  ['Question', 'Answer', 'Notes'],
  ['Appraisal year start month', '', 'e.g. January / April'],
  ['Monthly review due day', '', 'e.g. last Friday of month'],
  ['Quarter definition', '', 'Calendar Q1–Q4 or fiscal'],
  ['When does quarterly 360 open / close?', '', ''],
  ['When does formal evaluation open / close?', '', ''],
  ['Can periods be reopened by HR?', '', 'Y/N'],
  ['Late submissions allowed?', '', 'Y/N + grace days'],
  ['Lock after submit? (no further edits)', '', 'Strongly recommended Y'],
  ['Overlap: can monthly and quarterly run in same week?', '', ''],
  ['Blackout periods (audit, shutdown)', '', ''],
]);

sheet('10_Assignment_Rules', [
  ['Rule ID', 'Instrument', 'Rule (write precisely)', 'Example'],
  [
    'A1',
    'Monthly',
    '',
    'e.g. Every primary manager writes one monthly per direct each month',
  ],
  [
    'A2',
    'Monthly',
    '',
    'e.g. Secondary manager ALSO writes monthly for dual reports',
  ],
  [
    'A3',
    'Quarterly eval',
    '',
    'e.g. Only primary manager writes formal eval (or both?)',
  ],
  ['A4', 'Quarterly eval', '', ''],
  [
    'B1',
    'Peer 360',
    '',
    'e.g. Everyone active reviews everyone else (exclude self)',
  ],
  [
    'B2',
    'Peer 360',
    '',
    'e.g. Same team only / same level only / manager-selected peers',
  ],
  [
    'B3',
    'Peer 360',
    '',
    'e.g. Minimum number of peers required before release',
  ],
  [
    'C1',
    'Acknowledge',
    '',
    'e.g. After manager submits eval, subject must acknowledge',
  ],
  [
    'D1',
    'Exclusions',
    '',
    'e.g. Vacant roles inactive — no tasks, not 360 targets',
  ],
  [
    'D2',
    'Exclusions',
    '',
    'e.g. New joiners < 90 days excluded from 360',
  ],
  ['D3', 'Exclusions', '', ''],
  [
    'E1',
    'Visibility',
    '',
    'e.g. Managers see only their reports on Tasks for monthly/eval; 360 shows full pool',
  ],
  [
    'CONFIRM',
    'Same as GHC?',
    '',
    'If YES, write “Same as GHC” and we reuse; if NO, fill all rules',
  ],
]);

sheet('11_Form_Monthly', [
  [
    'Field / question label',
    'Type (Y/N, text, 1–5, multi)',
    'Required? (Y/N)',
    'Section',
    'Help text / guidance',
    'Validation rules',
    'Who sees after submit',
  ],
  ...Array.from({ length: 35 }, () => Array(7).fill('')),
  ['ATTACH original monthly form file name', '', '', '', '', '', ''],
  [
    'Scale for culture/behaviour items',
    '',
    '',
    '',
    'e.g. 1–5 with labels',
    '',
    '',
  ],
  ['Free-text minimum length?', '', '', '', '', '', ''],
  [
    'Does employee see the submitted monthly?',
    '',
    '',
    '',
    'GHC: yes after submit',
    '',
    '',
  ],
]);

sheet('12_Form_360', [
  [
    'Field / question label',
    'Type',
    'Required?',
    'Section',
    'Example / attributes to look for',
    'Notes',
  ],
  ...Array.from({ length: 30 }, () => Array(6).fill('')),
  [
    'Is 360 anonymous to the reviewee?',
    '',
    '',
    '',
    '',
    'Names to HR only?',
  ],
  [
    'Who is in the 360 pool?',
    '',
    '',
    '',
    '',
    'Everyone / team / selected',
  ],
  [
    'Minimum peers before HR can release aggregates?',
    '',
    '',
    '',
    '',
    'Number',
  ],
  ['Can someone decline a peer review?', '', '', '', '', ''],
  [
    'Do managers review peers differently?',
    '',
    '',
    '',
    '',
    'Extra questions?',
  ],
  ['ATTACH original 360 form file name', '', '', '', '', ''],
]);

sheet('13_Form_Quarterly_Eval', [
  [
    'Indicator / criterion name',
    'Bucket (Culture/Technical/Growth/Other)',
    'Max points',
    'Scale (e.g. 0–5)',
    'Definition / rubric',
    'Comment required?',
    'Notes',
  ],
  ...Array.from({ length: 20 }, () => Array(7).fill('')),
  ['TOTAL maximum score', '', '', '', '', '', 'e.g. GHC = 35'],
  [
    'How culture subtotal is computed',
    '',
    '',
    '',
    'Sum of N items? Average?',
    '',
    '',
  ],
  ['How technical subtotal is computed', '', '', '', '', '', ''],
  ['How growth subtotal is computed', '', '', '', '', '', ''],
  ['Strengths: how many slots?', '', '', '', '', '', ''],
  ['Improvements: how many slots?', '', '', '', '', '', ''],
  [
    'Improvement goals fields',
    '',
    '',
    '',
    'area / goal / indicator / timeline / reviewer?',
    '',
    '',
  ],
  ['Employee acknowledgment required?', '', '', '', '', '', ''],
  ['Discussion thread after submit?', '', '', '', '', '', ''],
  [
    'ATTACH original evaluation template file name',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
]);

sheet('14_Form_Other', [
  [
    'Form name',
    'Used? (Y/N)',
    'Cadence',
    'Writer',
    'Subject',
    'Key questions summary OR attach file',
    'Scoring?',
    'Notes',
  ],
  ['Self monthly reflection', '', '', '', '', '', '', ''],
  ['Self quarterly', '', '', '', '', '', '', ''],
  ['Upward feedback', '', '', '', '', '', '', ''],
  ['OKR sheet', '', '', '', '', '', '', ''],
  ['Other (name it)', '', '', '', '', '', '', ''],
]);

sheet('15_Culture_Competencies', [
  [
    'Value / competency name',
    'Short label',
    'Attributes / behaviours (comma list)',
    'Used in monthly? (Y/N)',
    'Used in 360? (Y/N)',
    'Used in quarterly eval? (Y/N)',
    'Weight / notes',
  ],
  ...Array.from({ length: 15 }, () => Array(7).fill('')),
  [
    'Are these the same as VGG / GHC values?',
    '',
    '',
    '',
    '',
    '',
    'If different, paste full list',
  ],
  [
    'OKR definition for VigiPay',
    '',
    '',
    '',
    '',
    '',
    'How OKRs are set and scored',
  ],
]);

sheet('16_Scoring_Bands', [
  [
    'Band rating (number)',
    'Label',
    'Min %',
    'Max %',
    'Colour / tone',
    'HR action implication',
  ],
  ['5', '', '', '', '', ''],
  ['4', '', '', '', '', ''],
  ['3', '', '', '', '', ''],
  ['2', '', '', '', '', ''],
  ['1', '', '', '', '', ''],
  ['Rounding rules', '', '', '', '', ''],
  ['Who sees the band before release?', '', '', '', '', ''],
  ['Can HR override score/band?', '', '', '', '', ''],
]);

sheet('17_Privacy_Anonymity', [
  ['Question', 'Answer', 'Notes'],
  [
    'Peer 360: does subject ever see reviewer names?',
    '',
    'Usually Never',
  ],
  [
    'Peer 360: does subject see individual scores or only averages?',
    '',
    '',
  ],
  [
    'Peer 360: who in HR can see raw named responses?',
    '',
    '',
  ],
  ['Monthly review: visible to subject after submit?', '', ''],
  [
    'Quarterly eval: visible to subject when?',
    '',
    'On submit / after HR release / after ack',
  ],
  ['Can managers see each other’s reports’ results?', '', ''],
  ['Cross-company (other VGG entities) visibility', '', 'Must be zero'],
  ['Data retention period', '', ''],
  ['Export / download allowed for whom?', '', ''],
]);

sheet('18_Release_Admin', [
  ['Capability', 'Who can do it', 'When', 'Notes'],
  ['Release peer 360 aggregates', '', '', ''],
  ['Release / mark evaluation period', '', '', ''],
  ['Reopen a submitted form', '', '', ''],
  ['Edit someone’s scores after submit', '', '', ''],
  ['Deactivate a person mid-cycle', '', '', ''],
  ['Change reporting line mid-cycle', '', '', ''],
  ['View completion dashboard / Monitor', '', '', ''],
  ['Send reminder emails', '', '', 'Manual / automatic'],
  ['Impersonate / view as user', '', '', 'Usually No'],
]);

sheet('19_Partner_HR_Actions', [
  [
    'Action option (exact label)',
    'Used? (Y/N)',
    'Manager recommends?',
    'HR / Partners decide?',
    'Notes',
  ],
  ['Promote to new level', '', '', '', ''],
  ['Salary Review', '', '', '', ''],
  ['Reward with Spot Bonus', '', '', '', ''],
  ['Confirm Resource?', '', '', '', ''],
  ['Growth Coaching', '', '', '', ''],
  ['Performance Improvement Plan', '', '', '', ''],
  ['Demotion', '', '', '', ''],
  ['No Action Required', '', '', '', ''],
  ['OTHER (add rows)', '', '', '', ''],
  ['Who is “Partners” at VigiPay?', '', '', '', 'Names / roles'],
]);

sheet('20_Acknowledge_Discuss', [
  ['Question', 'Answer', 'Notes'],
  ['Employee must acknowledge formal evaluation?', '', ''],
  [
    'Required acknowledgment fields',
    '',
    'understanding / response / signature',
  ],
  ['Can employee refuse / escalate?', '', ''],
  ['Discussion thread between manager & employee?', '', ''],
  ['Can HR join the discussion?', '', ''],
  ['Discussion opens when?', '', 'On submit / after ack'],
  ['Notifications on new discussion message?', '', ''],
]);

sheet('21_Notifications', [
  [
    'Event',
    'In-app? (Y/N)',
    'Email? (Y/N)',
    'Recipient',
    'Link should open',
    'Copy / tone notes',
  ],
  [
    'Monthly review submitted',
    '',
    '',
    'Report',
    'My results / monthly detail',
    '',
  ],
  ['360 submitted (to HR only?)', '', '', '', '', ''],
  [
    '360 aggregates released',
    '',
    '',
    'Subject',
    'Dashboard / results',
    '',
  ],
  [
    'Quarterly eval submitted',
    '',
    '',
    'Employee',
    'Acknowledge',
    '',
  ],
  [
    'Evaluation acknowledged',
    '',
    '',
    'Manager',
    'Discussion',
    '',
  ],
  [
    'Discussion message posted',
    '',
    '',
    'Other party',
    'Discussion',
    '',
  ],
  ['Reminder: incomplete tasks', '', '', 'Assignee', 'Tasks', ''],
  ['Other', '', '', '', '', ''],
]);

sheet('22_Access_Admins', [
  [
    'Person email',
    'Admin? (Y/N)',
    'People Ops role?',
    'Can release 360?',
    'Can edit partner board?',
    'Notes',
  ],
  ...Array.from({ length: 12 }, () => Array(6).fill('')),
  ['How are admins granted?', '', '', '', '', 'Manual list / VGG IT'],
]);

sheet('23_Branding_Assets', [
  ['Asset', 'Provided? (Y/N)', 'Filename', 'Specs', 'Notes'],
  [
    'Primary logo mark (PNG transparent)',
    '',
    '',
    'Square or pin mark, hi-res',
    '',
  ],
  ['Logo on dark background', '', '', 'White / light version', ''],
  [
    'Wide banner / wordmark',
    '',
    '',
    'For sidebar (~1200px wide)',
    '',
  ],
  ['Favicon', '', '', '32×32 and 180×180', ''],
  ['Brand colour palette PDF/PNG', '', '', 'Hex codes required', ''],
  ['Font guidance', '', '', 'Optional', ''],
  ['Do / don’t examples', '', '', 'Optional', ''],
]);

sheet('24_Unique_vs_GHC', [
  ['Area', 'Same as GreenHouse Capital?', 'If different — describe exactly'],
  ['Departments / teams', '', ''],
  ['Roles vs seniority split', '', ''],
  ['Reporting / dual managers', '', ''],
  ['Monthly form content', '', ''],
  ['360 pool & questions', '', ''],
  ['Quarterly eval scoring model', '', ''],
  ['Culture values', '', ''],
  ['Partner / HR actions', '', ''],
  ['Anonymity rules', '', ''],
  ['Admin Monitor features', '', ''],
  ['Branding / theme', '', ''],
  [
    'Anything VigiPay-only (payments KPIs, compliance, etc.)',
    '',
    'Describe fully — this drives redesign',
  ],
  ['Anything GHC has that VigiPay does NOT want', '', ''],
]);

sheet('25_Scenarios', [
  [
    'Scenario',
    'Expected system behaviour (write step-by-step)',
    'Pass criteria',
  ],
  [
    'New VigiPay hire first login',
    '',
    'Sees correct company branding + profile fields',
  ],
  [
    'IC with no directs opens Tasks',
    '',
    'Sees 360s (and ack if any) — not monthly write rows',
  ],
  [
    'Manager with 3 directs opens Tasks',
    '',
    'Sees 3 monthly + 3 evals + peer 360 pool',
  ],
  [
    'Dual-report person (if any)',
    '',
    'Correct managers get write tasks',
  ],
  [
    'Manager submits monthly',
    '',
    'Report notified; can read content',
  ],
  [
    'Peers submit 360; HR releases',
    '',
    'Subject sees aggregates only',
  ],
  [
    'Manager submits quarterly eval',
    '',
    'Employee acknowledges; discussion works',
  ],
  [
    'HR opens Monitor',
    '',
    'Completion counts + release + partner board',
  ],
  [
    'Someone from another company tries URL',
    '',
    'No access to VigiPay data',
  ],
  ['Custom VigiPay edge case 1', '', ''],
  ['Custom VigiPay edge case 2', '', ''],
]);

sheet('26_Open_Decisions', [
  ['Decision needed', 'Options', 'Owner', 'Due date', 'Final answer'],
  ...Array.from({ length: 15 }, () => Array(5).fill('')),
  [
    'RULE: Prefer zero open decisions before build starts',
    '',
    '',
    '',
    '',
  ],
]);

const outXlsx = join(root, 'docs', 'vigipay-appraisal-requirements-pack.xlsx');
XLSX.writeFile(wb, outXlsx);
console.log('Wrote', outXlsx);

const md = `# VigiPay appraisal — requirements intake guide

Give VigiPay the Excel workbook **\`docs/vigipay-appraisal-requirements-pack.xlsx\`** plus this guide. They fill the workbook once; we build from the return pack without re-discovery.

## What to send them

1. \`vigipay-appraisal-requirements-pack.xlsx\` (27 sheets)
2. This markdown (optional for their coordinator)
3. Ask them to return one zip: filled workbook + logos + original form PDFs/Docs

## Why Excel (not a meeting)

Every sheet maps to a concrete build input: tenant config, profile dropdowns, reporting graph, assignment engine, form schemas, scoring, privacy, admin release, notifications, branding. Blank cells = blocked build.

## Must-complete sheets (blockers)

| Sheet | Why it blocks |
|-------|----------------|
| \`03_Org_Roster\` | Accounts, hierarchy seed, who is active |
| \`07_Reporting_Lines\` | Who gets monthly / eval write tasks |
| \`08_Appraisal_Products\` | Which modules we ship |
| \`10_Assignment_Rules\` | Task generation logic |
| \`11_Form_Monthly\` / \`12_Form_360\` / \`13_Form_Quarterly_Eval\` | Exact UI + DB fields |
| \`16_Scoring_Bands\` | Totals, labels, HR implications |
| \`01_Company_Identity\` + \`23_Branding_Assets\` | Hostname, colours, logos |

## How GHC worked (reference for “same / different”)

VigiPay should mark \`24_Unique_vs_GHC\` clearly. For awareness only:

- **Company** (not “Subsidiary”) in profile
- **Teams** and **Roles** and **Seniority / Level** are three separate lists
- **Monthly**: manager → each direct
- **Peer 360**: everyone ↔ everyone (exclude self); anonymous aggregates; HR release
- **Quarterly eval**: manager → directs only; Culture + Technical + Growth → /35; acknowledge + discussion
- **Partner board**: promote / salary / bonus / PIP-style actions after eval
- **Dual managers**: possible (primary + secondary both write in some cases)
- **Vacant seats**: inactive, no tasks
- Tenant URL pattern: \`*.vgg.app\` + \`?tenant=\` for local

If VigiPay says “same as GHC” on a row, we reuse that rule. If different, they must spell the rule in full on that sheet.

## Coordinator checklist before they send back

- [ ] Every active person is on \`03_Org_Roster\` with login email
- [ ] Every reporting line is on \`07\` (or covered by roster manager columns)
- [ ] Official Teams / Roles / Levels lists filled (not free-text chaos)
- [ ] Each appraisal product Y/N on \`08\`
- [ ] Every form question pasted into Form sheets (attachments alone are not enough)
- [ ] Scoring total + band table filled
- [ ] Anonymity + release owners named
- [ ] Logos + hex colours provided
- [ ] \`26_Open_Decisions\` empty or every row has a final answer
- [ ] \`25_Scenarios\` filled for at least the default cases

## After they return

We will:

1. Diff against GHC (sheet 24 + forms)
2. Design VigiPay tenant config + branding
3. Seed org + reporting
4. Implement forms / assignment / scoring only where they diverge
5. Smoke the scenarios on sheet 25

## Contact for questions while filling

Route clarifying questions through the day-to-day coordinator listed on sheet \`02_Contacts\` so answers land in the workbook, not chat history.
`;

writeFileSync(join(root, 'docs', 'vigipay-requirements-guide.md'), md, 'utf8');
console.log('Wrote docs/vigipay-requirements-guide.md');
