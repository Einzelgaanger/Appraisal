import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClipboardList, ClipboardPen, Loader2, Mail, MessageSquare, MessageSquareText, MessagesSquare, NotebookPen, ShieldCheck, Sparkles, TrendingUp, UserCircle, Users, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BoomCommentsPanel from './BoomCommentsPanel';
import BoomDirectoryPanel from './BoomDirectoryPanel';
import BoomInsightsPanel from './BoomInsightsPanel';
import BoomDiscussionsPanel from './BoomDiscussionsPanel';
import { toast } from 'sonner';
import { boomFormPurpose, boomHierarchyLabel, boomPeerFormHint, boomTasksIntro } from '@/lib/boomRoleLabels';
import {
  quarterOptions,
  monthOptions,
  resolveQuarterPeriod,
  resolveMonthPeriod,
} from '@/lib/boomPeriods';
import { fetchMy360Dashboard, type Boom360DashboardState } from '@/lib/boomDashboard360';
import QualitativeFeedback from '@/components/employee-dashboard/QualitativeFeedback';
import AssessmentRunner from './AssessmentRunner';
import ExecutiveAssessorRunner from './ExecutiveAssessorRunner';
import { isTenantTeamMember } from '@/tenants/config';
import { useTenant } from '@/tenants/TenantContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export type AssignmentRow = {
  form_code: string;
  form_title: string;
  reviewee_id: string;
  reviewee_name: string;
  reviewee_role: string | null;
  reviewee_department: string | null;
  anonymous: boolean;
  response_id: string | null;
  status: string;
};

export type AssessorTaskRow = {
  reviewee_id: string;
  reviewee_name: string;
  reviewee_role: string | null;
  self_response_id: string;
  assessor_review_id: string | null;
  assessor_status: string;
};

const FORM_LABELS: Record<string, string> = {
  executive: 'Executive assessment',
  peer_360: '360 Peer review',
  monthly_self: 'Monthly self-assessment',
  ea_quarterly: 'Executive Office Quarterly Evaluation',
  epa_gceo_assessor: 'Executive Performance Assessment (GCEO)',
};

/** Stable card order so every role sees the same structure */
const softButton = 'h-9 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal';
const pillTab = 'gap-1.5 rounded-full px-3.5 py-2 font-sans text-[13.5px] font-medium normal-case tracking-normal data-[state=active]:bg-teal-500 data-[state=active]:text-white';

const FORM_LOOK: Record<string, { icon: typeof ClipboardList; chip: string }> = {
  executive: { icon: ClipboardPen, chip: 'bg-rose-100 text-rose-800' },
  epa_gceo_assessor: { icon: ShieldCheck, chip: 'bg-sky-100 text-sky-800' },
  ea_quarterly: { icon: ClipboardList, chip: 'bg-amber-100 text-amber-900' },
  peer_360: { icon: MessageSquareText, chip: 'bg-violet-100 text-violet-800' },
  monthly_self: { icon: NotebookPen, chip: 'bg-teal-100 text-teal-800' },
};

const FORM_ORDER = ['executive', 'epa_gceo_assessor', 'ea_quarterly', 'peer_360', 'monthly_self'];
const TEAM_MEMBER_FORM_ORDER = ['monthly_self', 'ea_quarterly', 'peer_360'];
/** L2+ team members never receive executive self-assessment via assignments */
const TEAM_MEMBER_BLOCKED_FORMS = new Set(['executive']);

function statusBadge(status: string) {
  if (status === 'submitted') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[12px] font-medium text-emerald-800">Done</span>;
  if (status === 'draft' || status === 'in_progress') return <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[12px] font-medium text-sky-800">In progress</span>;
  if (status === 'waiting_self') return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-medium text-amber-900">Awaiting self</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-medium text-amber-900">To do</span>;
}

interface BoomReviewHubProps {
  reviewerEmployeeId: string | null;
  reviewerHierarchyLevel: number | null;
  reviewerName?: string | null;
  reviewerRole?: string | null;
  reviewerDepartment?: string | null;
  reviewerEmail?: string | null;
  isPlatformAdmin?: boolean;
}

export default function BoomReviewHub({
  reviewerEmployeeId,
  reviewerHierarchyLevel,
  reviewerName,
  reviewerRole,
  reviewerDepartment,
  reviewerEmail,
  isPlatformAdmin = false,
}: BoomReviewHubProps) {
  const { tenant } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBoomTab = searchParams.get('boomTab');
  const periodQuarter = resolveQuarterPeriod(searchParams.get('boomQuarter'));
  const periodMonth = resolveMonthPeriod(searchParams.get('boomMonth'));

  const setPeriodQuarter = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('boomQuarter', q);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPeriodMonth = useCallback(
    (m: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('boomMonth', m);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [givesComments, setGivesComments] = useState(false);
  const [receivesComments, setReceivesComments] = useState(false);
  const [boomTab, setBoomTab] = useState(
    () => (initialBoomTab === 'discussions' ? 'discussions' : 'tasks'),
  );
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const teamMemberView = isTenantTeamMember(tenant, reviewerHierarchyLevel);
  const [dashboard360, setDashboard360] = useState<Boom360DashboardState | null>(null);
  const [loading360, setLoading360] = useState(false);

  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runner, setRunner] = useState<{
    formCode: string;
    formTitle: string;
    revieweeId: string;
    revieweeName: string;
    period: string;
    anonymous: boolean;
  } | null>(null);

  const [assessorTasks, setAssessorTasks] = useState<AssessorTaskRow[]>([]);
  const [assessorRunnerOpen, setAssessorRunnerOpen] = useState(false);
  const [assessorRunner, setAssessorRunner] = useState<{
    selfResponseId: string;
    revieweeName: string;
  } | null>(null);

  const loadAssignments = useCallback(async () => {
    if (!reviewerEmployeeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_review_assignments', {
        _period_quarter: periodQuarter,
        _period_month: periodMonth,
      });
      if (error) {
        toast.error(error.message || 'Could not load BOOM assignments');
        setRows([]);
        return;
      }
      setRows((data ?? []) as AssignmentRow[]);
    } finally {
      setLoading(false);
    }
  }, [reviewerEmployeeId, periodQuarter, periodMonth]);

  const loadAssessorTasks = useCallback(async () => {
    if (!reviewerEmployeeId || teamMemberView) return;
    try {
      const { data, error } = await supabase.rpc('get_epa_assessor_tasks', { _period: periodQuarter });
      if (error) {
        setAssessorTasks([]);
        return;
      }
      setAssessorTasks((data ?? []) as AssessorTaskRow[]);
    } catch {
      setAssessorTasks([]);
    }
  }, [reviewerEmployeeId, periodQuarter, teamMemberView]);

  useEffect(() => {
    if (teamMemberView && boomTab !== 'tasks' && boomTab !== 'discussions' && boomTab !== 'feedback') {
      setBoomTab('tasks');
    }
  }, [teamMemberView, boomTab]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!reviewerEmployeeId) return;
    void supabase
      .from('employees')
      .select('appraisal_gives_comments, appraisal_receives_comments, hierarchy_level')
      .eq('id', reviewerEmployeeId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setGivesComments(!!data.appraisal_gives_comments);
          setReceivesComments(!!data.appraisal_receives_comments);
        }
      });
  }, [reviewerEmployeeId]);

  useEffect(() => {
    void loadAssessorTasks();
  }, [loadAssessorTasks]);

  const load360 = useCallback(async () => {
    if (!reviewerEmployeeId) return;
    setLoading360(true);
    try {
      const dash = await fetchMy360Dashboard(periodQuarter);
      setDashboard360(dash);
    } finally {
      setLoading360(false);
    }
  }, [reviewerEmployeeId, periodQuarter]);

  useEffect(() => {
    void load360();
  }, [load360]);

  const grouped = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>();
    for (const r of rows) {
      const k = r.form_code;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows]);

  const showCommentsTab = tenant.capabilities.showComments && (givesComments || receivesComments);
  const canViewDirectory = tenant.capabilities.showDirectoryInsights && (isPlatformAdmin || (reviewerHierarchyLevel !== null && reviewerHierarchyLevel <= 1));
  const canViewInsights = tenant.capabilities.showDirectoryInsights && (isPlatformAdmin || reviewerHierarchyLevel === 0);

  const hasOwnMonthlySelf = useMemo(
    () =>
      !!reviewerEmployeeId &&
      rows.some((r) => r.form_code === 'monthly_self' && r.reviewee_id === reviewerEmployeeId),
    [rows, reviewerEmployeeId],
  );

  /** Month picker filters own monthly self (Tasks) or L2 monthly threads (Discussions). */
  const showMonthFilter = hasOwnMonthlySelf || boomTab === 'discussions';

  useEffect(() => {
    if (!showCommentsTab && boomTab === 'comments') {
      setBoomTab('tasks');
    }
  }, [showCommentsTab, boomTab]);

  const sortedFormGroups = useMemo(() => {
    const order = teamMemberView ? TEAM_MEMBER_FORM_ORDER : FORM_ORDER;
    const entries = teamMemberView
      ? [...grouped.entries()].filter(([code]) => !TEAM_MEMBER_BLOCKED_FORMS.has(code))
      : [...grouped.entries()];
    return entries.sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [grouped, teamMemberView]);

  const epaGceoRevieweeIds = useMemo(
    () => new Set(rows.filter((r) => r.form_code === 'epa_gceo_assessor').map((r) => r.reviewee_id)),
    [rows],
  );

  const filteredAssessorTasks = useMemo(
    () => assessorTasks.filter((t) => !epaGceoRevieweeIds.has(t.reviewee_id)),
    [assessorTasks, epaGceoRevieweeIds],
  );

  const assignmentStats = useMemo(() => {
    let todo = 0;
    let draft = 0;
    let done = 0;
    for (const r of rows) {
      if (r.status === 'submitted') done++;
      else if (r.status === 'draft') draft++;
      else todo++;
    }
    return { todo, draft, done, total: rows.length };
  }, [rows]);

  const openRunner = async (a: AssignmentRow) => {
    if (a.form_code === 'epa_gceo_assessor') {
      if (a.status === 'waiting_self') {
        toast.message(`${a.reviewee_name} has not submitted their Executive Performance self-assessment yet.`);
        return;
      }
      const { data, error } = await supabase.rpc('resolve_epa_self_response', {
        _reviewee: a.reviewee_id,
        _period: periodQuarter,
      });
      if (error) {
        toast.error(error.message || 'Could not load executive self assessment');
        return;
      }
      const row = (data as { self_response_id: string; self_status: string }[] | null)?.[0];
      if (!row?.self_response_id) {
        toast.message(`${a.reviewee_name} has not started their Executive Performance self-assessment for ${periodQuarter}.`);
        return;
      }
      setAssessorRunner({
        selfResponseId: row.self_response_id,
        revieweeName: a.reviewee_name,
      });
      setAssessorRunnerOpen(true);
      return;
    }
    const period = a.form_code === 'monthly_self' ? periodMonth : periodQuarter;
    setRunner({
      formCode: a.form_code,
      formTitle: a.form_title,
      revieweeId: a.reviewee_id,
      revieweeName: a.reviewee_name,
      period,
      anonymous: a.anonymous,
    });
    setRunnerOpen(true);
  };

  const openAssessorRunner = (t: AssessorTaskRow) => {
    setAssessorRunner({
      selfResponseId: t.self_response_id,
      revieweeName: t.reviewee_name,
    });
    setAssessorRunnerOpen(true);
  };

  function assessorStatusBadge(status: string) {
    return statusBadge(status);
  }

  if (!reviewerEmployeeId) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-6 space-y-2">
        <p className="text-sm font-medium text-foreground">No Executive Office employee linked to this login</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Assignments are resolved from your profile email matching an <code className="text-[10px] px-1 rounded bg-muted">employees</code> row.
          Ask an admin to confirm your account email matches your EO record, or complete your profile if your app supports it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-8">
      {/* Reviewer context — each login/email maps to one employee; RPC returns only their assignments */}
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-5 ring-1 ring-sky-100 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-800">
          <UserCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold">Your reviews</h2>
            <span className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-foreground/80 ring-1 ring-black/5">
              {boomHierarchyLabel(reviewerHierarchyLevel)}
            </span>
          </div>
          <p className="text-sm text-foreground/90">
            <span className="font-semibold">{reviewerName ?? 'Signed-in user'}</span>
            {reviewerRole && <span className="text-muted-foreground"> · {reviewerRole}</span>}
            {reviewerDepartment && <span className="text-muted-foreground"> · {reviewerDepartment}</span>}
          </p>
          {reviewerEmail && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{reviewerEmail}</span>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/50 pt-2 mt-1">
            {boomPeerFormHint(reviewerHierarchyLevel)} Forms and questions below are only those assigned to{' '}
            <strong>your</strong> role for the selected periods.
          </p>
        </div>
        {assignmentStats.total > 0 && (
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end sm:text-right shrink-0">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[12px] font-medium text-amber-900">{assignmentStats.todo} to do</span>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-[12px] font-medium text-sky-800">{assignmentStats.draft} in progress</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-medium text-emerald-800">{assignmentStats.done} submitted</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground/80">Quarter</label>
          <Select value={periodQuarter} onValueChange={setPeriodQuarter}>
            <SelectTrigger className="h-10 w-[140px] rounded-2xl text-sm">
              <SelectValue>{periodQuarter}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {quarterOptions().map((q) => (
                <SelectItem key={q} value={q} className="text-xs">
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showMonthFilter && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground/80">
            {hasOwnMonthlySelf ? 'Month' : 'Month for discussions'}
          </label>
          <Select value={periodMonth} onValueChange={setPeriodMonth}>
            <SelectTrigger className="h-10 w-[140px] rounded-2xl text-sm">
              <SelectValue>{periodMonth}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {monthOptions().map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className={softButton}
          disabled={loading}
          onClick={() => {
            void loadAssignments();
            void loadAssessorTasks();
            void load360();
          }}
        >
          Refresh
        </Button>
        <span className="inline-flex h-10 items-center rounded-full bg-white px-3 text-sm font-medium text-foreground/80 ring-1 ring-black/5">
          Viewing {periodQuarter}
          {showMonthFilter ? ` · ${periodMonth}` : ''}
        </span>
      </div>

      <Tabs value={boomTab} onValueChange={setBoomTab} className="space-y-4">
        <div className="app-sticky-subnav -mx-4 bg-background/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <TabsList className="flex h-auto flex-wrap gap-2 border-0 bg-transparent p-0">
          <TabsTrigger value="tasks" className={pillTab}>
            <ClipboardList className="h-4 w-4" /> Tasks
          </TabsTrigger>
          <TabsTrigger value="discussions" className={pillTab}>
            <MessagesSquare className="h-4 w-4" /> Discussions
          </TabsTrigger>
          <TabsTrigger value="feedback" className={pillTab}>
            <TrendingUp className="h-4 w-4" /> My 360 feedback
          </TabsTrigger>
          {!teamMemberView && showCommentsTab && (
            <TabsTrigger value="comments" className={pillTab}>
              <MessageSquare className="h-4 w-4" /> Comments
            </TabsTrigger>
          )}
          {canViewDirectory && (
            <TabsTrigger value="directory" className={pillTab}>
              <Users className="h-4 w-4" /> Directory
            </TabsTrigger>
          )}
          {canViewInsights && (
            <TabsTrigger value="insights" className={pillTab}>
              <LayoutDashboard className="h-4 w-4" /> Insights
            </TabsTrigger>
          )}
        </TabsList>
        </div>

        <TabsContent value="tasks" className="mt-0 space-y-6">
      <p className="text-xs text-muted-foreground max-w-xl">
        {boomTasksIntro(reviewerHierarchyLevel)}
      </p>

      {!teamMemberView && filteredAssessorTasks.length > 0 && (
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-800">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Assessor tasks</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Independent ratings on executives who have sent their self assessment for {periodQuarter}. These stay separate from their own scores.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredAssessorTasks.map((t) => (
              <article key={t.self_response_id} className="flex flex-col justify-between gap-3 rounded-2xl bg-muted/40 p-4">
                <div>
                  <p className="text-[15px] font-medium">{t.reviewee_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.reviewee_role ?? 'Executive'}</p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {assessorStatusBadge(t.assessor_status)}
                  <Button
                    size="sm"
                    variant={t.assessor_status === 'submitted' ? 'outline' : 'default'}
                    className={cn(softButton, t.assessor_status === 'submitted' ? '' : 'bg-teal-500 text-white hover:bg-teal-600')}
                    onClick={() => openAssessorRunner(t)}
                  >
                    {t.assessor_status === 'submitted' ? 'View' : t.assessor_status === 'draft' ? 'Continue' : 'Start'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading assignments…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 p-6 space-y-2 text-sm text-muted-foreground">
          <p>No assignments for these periods.</p>
          <p className="text-xs leading-relaxed">
            {teamMemberView
              ? 'You should see a monthly self-assessment and 360 peer reviews for each colleague. Try changing the month or quarter above, or refresh.'
              : 'That often means this quarter/month has no open tasks for your role, or periods need changing. Executives, managers, and team members each receive different forms.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedFormGroups.map(([code, list]) => (
            <section key={code} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                {(() => {
                  const look = FORM_LOOK[code] ?? { icon: ClipboardList, chip: 'bg-muted text-foreground' };
                  const Icon = look.icon;
                  return (
                    <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', look.chip)}>
                      <Icon className="h-5 w-5" />
                    </span>
                  );
                })()}
                <div>
                  <h3 className="font-display text-lg font-semibold">{FORM_LABELS[code] ?? code}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{boomFormPurpose(code)}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((a) => (
                  <article key={`${a.form_code}-${a.reviewee_id}`} className="flex flex-col justify-between gap-3 rounded-2xl bg-muted/40 p-4">
                    <div>
                      <p className="text-[15px] font-medium">
                        {a.reviewee_name}
                        {a.form_code === 'monthly_self' && a.reviewee_id === reviewerEmployeeId ? (
                          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-100">You</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {a.reviewee_role ?? 'Role not set'}
                        {a.reviewee_department ? ` · ${a.reviewee_department}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {statusBadge(a.status)}
                      <Button
                        size="sm"
                        variant={a.status === 'submitted' || a.status === 'waiting_self' ? 'outline' : 'default'}
                        className={cn(softButton, a.status === 'submitted' || a.status === 'waiting_self' ? '' : 'bg-teal-500 text-white hover:bg-teal-600')}
                        disabled={a.status === 'waiting_self'}
                        onClick={() => void openRunner(a)}
                      >
                        {a.status === 'waiting_self'
                          ? 'Awaiting self'
                          : a.status === 'submitted'
                            ? 'View'
                            : a.status === 'draft'
                              ? 'Continue'
                              : 'Start'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

        </TabsContent>

        <TabsContent value="discussions" className="mt-0">
          <BoomDiscussionsPanel
            reviewerEmployeeId={reviewerEmployeeId}
            reviewerEmail={reviewerEmail}
            reviewerHierarchyLevel={reviewerHierarchyLevel}
            isPlatformAdmin={isPlatformAdmin}
            periodQuarter={periodQuarter}
            periodMonth={periodMonth}
          />
        </TabsContent>

        <TabsContent value="feedback" className="mt-0">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-800">
            <TrendingUp className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg font-semibold">My 360 results</h3>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">
            {periodQuarter}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
          Anonymous aggregated peer scores by behaviour section — updates as each colleague submits their 360 about you.
          Individual reviewers are never shown.
        </p>
        {loading360 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </p>
        ) : !dashboard360?.scores.length ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            No peer 360 about you for <span className="font-mono">{periodQuarter}</span> yet. Scores and comments appear
            here automatically as colleagues submit — refresh after more reviews come in.
            {dashboard360 && dashboard360.peerCount > 0 && (
              <span className="block mt-1">
                {dashboard360.peerCount} peer review{dashboard360.peerCount === 1 ? '' : 's'} received so far.
              </span>
            )}
          </p>
        ) : (
          <div className="space-y-6">
            {dashboard360.peerCount > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Based on <strong className="text-foreground">{dashboard360.peerCount}</strong> anonymous peer review
                {dashboard360.peerCount === 1 ? '' : 's'} — updates as more colleagues submit.
              </p>
            )}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboard360.scores.map((r) => ({
                    name: r.category.slice(0, 22),
                    score: r.myScore,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11 }}
                    formatter={(v: number) => [v.toFixed(2), 'Avg']}
                  />
                  <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {(dashboard360.qualitative.startDoing.length > 0 ||
              dashboard360.qualitative.stopDoing.length > 0 ||
              dashboard360.qualitative.continueDoing.length > 0) && (
              <QualitativeFeedback
                startDoing={dashboard360.qualitative.startDoing}
                stopDoing={dashboard360.qualitative.stopDoing}
                continueDoing={dashboard360.qualitative.continueDoing}
              />
            )}
            {dashboard360.themes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Anonymous peer comments</p>
                <ul className="space-y-2">
                  {dashboard360.themes.map((t, i) => (
                    <li
                      key={i}
                      className="text-xs text-muted-foreground leading-relaxed rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                    >
                      {t.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
        </TabsContent>

        {!teamMemberView && showCommentsTab && (
        <TabsContent value="comments" className="mt-0">
          <BoomCommentsPanel
            reviewerEmployeeId={reviewerEmployeeId}
            periodQuarter={periodQuarter}
            givesComments={givesComments}
            receivesComments={receivesComments}
          />
        </TabsContent>
        )}

        {canViewDirectory && (
        <TabsContent value="directory" className="mt-0">
          <BoomDirectoryPanel
            viewerEmployeeId={reviewerEmployeeId}
            viewerHierarchyLevel={reviewerHierarchyLevel}
            isAdmin={isPlatformAdmin}
            periodQuarter={periodQuarter}
            periodMonth={periodMonth}
          />
        </TabsContent>
        )}

        {canViewInsights && (
        <TabsContent value="insights" className="mt-0">
          <BoomInsightsPanel
            viewerHierarchyLevel={reviewerHierarchyLevel}
            isAdmin={isPlatformAdmin}
            periodQuarter={periodQuarter}
            onPeriodQuarterChange={setPeriodQuarter}
          />
        </TabsContent>
        )}
      </Tabs>

      {runner && (
        <AssessmentRunner
          key={`${runner.formCode}-${runner.revieweeId}-${runner.period}`}
          open={runnerOpen}
          onOpenChange={setRunnerOpen}
          formCode={runner.formCode}
          formTitle={runner.formTitle}
          revieweeId={runner.revieweeId}
          revieweeName={runner.revieweeName}
          period={runner.period}
          reviewerEmployeeId={reviewerEmployeeId}
          reviewerHierarchyLevel={reviewerHierarchyLevel}
          reviewerRoleSummary={boomHierarchyLabel(reviewerHierarchyLevel)}
          anonymous={runner.anonymous}
          onCompleted={() => {
            void loadAssignments();
            void loadAssessorTasks();
            void load360();
          }}
        />
      )}

      {assessorRunner && (
        <ExecutiveAssessorRunner
          key={assessorRunner.selfResponseId}
          open={assessorRunnerOpen}
          onOpenChange={setAssessorRunnerOpen}
          selfResponseId={assessorRunner.selfResponseId}
          revieweeName={assessorRunner.revieweeName}
          period={periodQuarter}
          reviewerEmployeeId={reviewerEmployeeId}
          reviewerHierarchyLevel={reviewerHierarchyLevel}
          variant="gceo"
          onCompleted={() => {
            void loadAssignments();
            void loadAssessorTasks();
          }}
        />
      )}
    </div>
  );
}
