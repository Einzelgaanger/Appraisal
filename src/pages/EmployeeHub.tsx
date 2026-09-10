import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import PlatformSidebar from '@/components/PlatformSidebar';
import MobileTabBar, { type MobileTab } from '@/components/MobileTabBar';
import vggLogo from '@/assets/vgg-logo.webp';
import {
  CheckCircle2, ChevronRight, ChevronLeft,
  Building2, User, ClipboardList, Send, Loader2, Shield,
  BarChart3, Trophy, Star, Users, Search, X, ArrowUp, ArrowDown, ArrowLeftRight, Sparkles, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import QualitativeFeedback from '@/components/employee-dashboard/QualitativeFeedback';
import AIInsightsCarousel from '@/components/employee-dashboard/AIInsightsCarousel';
import DetailedCategoryBreakdown from '@/components/employee-dashboard/DetailedCategoryBreakdown';
import AnonymityBanner from '@/components/employee-dashboard/AnonymityBanner';
import GrowthResources from '@/components/employee-dashboard/GrowthResources';
import DevelopmentPlans from '@/components/employee-dashboard/DevelopmentPlans';
import SelfDebrief from '@/components/employee-dashboard/SelfDebrief';
import WeeklyReflection from '@/components/employee-dashboard/WeeklyReflection';
import LearningProfilePanel from '@/components/employee-dashboard/LearningProfilePanel';
import PerformanceContext, { type CohortScore, type CohortMeta, type RankInfo } from '@/components/employee-dashboard/PerformanceContext';
import {
  PlatformHubSkeleton,
  EmployeeDashboardTabSkeleton,
  RankingsTabSkeleton,
} from '@/components/shell/LoadingShells';
import BoomReviewHub from '@/components/boom/BoomReviewHub';
import BoomNotificationsBell from '@/components/boom/BoomNotificationsBell';
import GhcReviewHub from '@/modules/ghc/GhcReviewHub';
import GhcNotificationsBell from '@/modules/ghc/GhcNotificationsBell';
import GhcMyResults from '@/modules/ghc/GhcMyResults';
import {
  displayHierarchyLabel,
  getSurveyFeedbackDirection,
  assignHierarchyPool,
} from '@/lib/hierarchyConvention';
import { defaultQuarterPeriod } from '@/lib/boomPeriods';
import { fetchMyAggregatedPeer360Scores, fetchMy360Dashboard, fetchOrgPerformanceRankings, fetchGrowthHubPulse, buildBoomGrowthAiContext, type GrowthHubPulseMode } from '@/lib/boomDashboard360';
import { fetchMyEaQuarterlyResults, type EaQuarterlyResults } from '@/lib/boomEaQuarterly';
import { isMeaningfulQualitativeAnswer } from '@/lib/qualitativeFeedback';
import EaQuarterlyDashboardCard from '@/components/employee-dashboard/EaQuarterlyDashboardCard';
import { isBoomTenant, isGhcTenant } from '@/tenants/config';
import { useTenant } from '@/tenants/TenantContext';

interface FeedbackItem {
  text: string;
  direction: string;
}

interface Subsidiary { id: string; name: string; hierarchy_lower_is_senior?: boolean; }
interface Employee { id: string; name: string; role: string | null; department: string | null; subsidiary_id: string; email: string | null; hierarchy_level: number | null; }
interface Category { id: string; name: string; sort_order: number; }
interface Question { id: string; category_id: string; question_text: string; question_type: string; sort_order: number; }
interface CategoryScore { category: string; myScore: number; orgAvg: number; }
interface DirectionScores { above: CategoryScore[]; peer: CategoryScore[]; below: CategoryScore[]; }

interface RankedEmployee { employee_id: string; name: string; subsidiary: string; avgScore: number; totalReviews: number; }

const SCALE_OPTIONS = [
  { value: 5, label: 'Most Likely' },
  { value: 4, label: 'Likely' },
  { value: 3, label: 'Neutral' },
  { value: 2, label: 'Unlikely' },
  { value: 1, label: 'Least Likely' },
];

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

export default function EmployeeHub() {
  const { user, profile, isAdmin, logout } = useEmployeeAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'survey';
  const showRankings = tenant.capabilities.showRankings;
  const showGrowthHub = tenant.capabilities.showGrowthHub;
  const boomMode = isBoomTenant(tenant);
  const ghcMode = isGhcTenant(tenant);

  // Survey state
  const [step, setStep] = useState<'subsidiary' | 'employee' | 'questions' | 'submitted'>('subsidiary');
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<Subsidiary | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const submitInFlight = useRef(false);
  const [completedEmployees, setCompletedEmployees] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Dashboard state
  const [myScores, setMyScores] = useState<CategoryScore[]>([]);
  const [directionScores, setDirectionScores] = useState<DirectionScores>({ above: [], peer: [], below: [] });
  const [directionCounts, setDirectionCounts] = useState<{ above: number; peer: number; below: number }>({ above: 0, peer: 0, below: 0 });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [qualitativeFeedback, setQualitativeFeedback] = useState<{ startDoing: FeedbackItem[]; stopDoing: FeedbackItem[]; continueDoing: FeedbackItem[] }>({ startDoing: [], stopDoing: [], continueDoing: [] });
  const [aiDataContext, setAiDataContext] = useState('');
  const [cohortScores, setCohortScores] = useState<CohortScore[]>([]);
  const [cohortMeta, setCohortMeta] = useState<CohortMeta | null>(null);
  const [cohortRanks, setCohortRanks] = useState<RankInfo[]>([]);
  /** legacy multi-subsidiary survey vs aggregated BOOM peer 360 */
  const [dashboardScoreSource, setDashboardScoreSource] = useState<'legacy_survey' | 'boom_peer_360' | 'none'>('none');
  const [boom360DashMeta, setBoom360DashMeta] = useState<{ period: string; maxPeerResponses: number } | null>(null);
  const [boom360Pending, setBoom360Pending] = useState<{
    released: boolean;
    peerCount: number;
    minRequired: number;
  } | null>(null);
  /** self = personal 360; team_pulse = L0/L1 aggregated L2 pulse for Growth Hub */
  const [growthHubMode, setGrowthHubMode] = useState<GrowthHubPulseMode | null>(null);
  const [pulseLabel, setPulseLabel] = useState<string | null>(null);
  const [eaQuarterlyResults, setEaQuarterlyResults] = useState<EaQuarterlyResults | null>(null);

  // Growth Hub state
  const [selectedFocusArea, setSelectedFocusArea] = useState<string | null>(null);
  const [idpPrefill, setIdpPrefill] = useState<{ focus?: string; goal?: string }>({});

  // Rankings state
  const [rankings, setRankings] = useState<RankedEmployee[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);

  // All employees for department counts
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);

  const normalizedProfileEmail = profile?.email?.trim().toLowerCase() ?? '';
  const normalizedAuthEmail = user?.email?.trim().toLowerCase() ?? '';

  const currentEmployee = useMemo(() => {
    if (profile?.employee_id) {
      const matchedById = allEmployees.find(employee => employee.id === profile.employee_id);
      if (matchedById) return matchedById;
    }

    const emailCandidates = [normalizedProfileEmail, normalizedAuthEmail].filter(Boolean);
    if (!emailCandidates.length) return null;

    return (
      allEmployees.find((employee) => {
        const employeeEmail = (employee.email ?? '').trim().toLowerCase();
        return emailCandidates.includes(employeeEmail);
      }) ?? null
    );
  }, [allEmployees, normalizedProfileEmail, normalizedAuthEmail, profile?.employee_id]);

  // Load completions from database
  useEffect(() => {
    if (user) {
      supabase
        .from('review_completions')
        .select('employee_id')
        .eq('reviewer_id', user.id)
        .then(({ data }) => {
          if (data) setCompletedEmployees(new Set(data.map(d => d.employee_id)));
        });
    }
  }, [user]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [subRes, catRes, qRes, allEmpRes] = await Promise.all([
        supabase.from('subsidiaries').select('*').order('name'),
        supabase.from('survey_categories').select('*').order('sort_order'),
        supabase.from('survey_questions').select('*').order('sort_order'),
        supabase.from('employees').select('*').order('name'),
      ]);
      if (subRes.data) setSubsidiaries(subRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (qRes.data) setQuestions(qRes.data);
      if (allEmpRes.data) setAllEmployees(allEmpRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Load dashboard data
  useEffect(() => {
    if (ghcMode) {
      setDashboardLoading(false);
      return;
    }
    if (activeTab !== 'dashboard' && activeTab !== 'growth') return;

    if (!user) {
      setDashboardLoading(false);
      return;
    }

    if (!currentEmployee?.id) {
      setMyScores([]);
      setDirectionScores({ above: [], peer: [], below: [] });
      setDirectionCounts({ above: 0, peer: 0, below: 0 });
      setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
      setAiDataContext('');
      setEaQuarterlyResults(null);
      setDashboardLoading(false);
      return;
    }

    void loadDashboardData(currentEmployee.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDashboardData closes over many hub fields
  }, [activeTab, currentEmployee?.id, user, ghcMode]);

  const loadDashboardData = async (employeeId: string) => {
    if (!user) return;
    setDashboardLoading(true);
    setBoom360DashMeta(null);
    setBoom360Pending(null);
    setDashboardScoreSource('none');
    setEaQuarterlyResults(null);
    try {
      const q = defaultQuarterPeriod();

      if (boomMode) {
        const eaResults = await fetchMyEaQuarterlyResults(q);
        if (eaResults?.submissionCount) setEaQuarterlyResults(eaResults);

        const pulse = await fetchGrowthHubPulse(q);
        if (pulse) {
          setGrowthHubMode(pulse.mode);
          setPulseLabel(pulse.pulseLabel);
          setMyScores(pulse.scores);
          setDashboardScoreSource('boom_peer_360');
          setBoom360DashMeta({ period: q, maxPeerResponses: pulse.peerCount });
          setBoom360Pending(null);
          setDirectionScores({ above: [], peer: [], below: [] });
          setDirectionCounts({ above: 0, peer: 0, below: 0 });
          setCohortScores([]);
          setCohortMeta(null);
          setCohortRanks([]);
          setQualitativeFeedback({
            startDoing: pulse.qualitative.startDoing,
            stopDoing: pulse.qualitative.stopDoing,
            continueDoing: pulse.qualitative.continueDoing,
          });
          setAiDataContext(buildBoomGrowthAiContext(pulse, q));
          return;
        }

        const dash = await fetchMy360Dashboard(q);
        if (dash) {
          setGrowthHubMode(null);
          setPulseLabel(null);
          setBoom360Pending({
            released: dash.released,
            peerCount: dash.peerCount,
            minRequired: dash.minPeersRequired,
          });
          setBoom360DashMeta({ period: q, maxPeerResponses: dash.peerCount });
          setDirectionScores({ above: [], peer: [], below: [] });
          setDirectionCounts({ above: 0, peer: 0, below: 0 });
          setCohortScores([]);
          setCohortMeta(null);
          setCohortRanks([]);

          if (dash.released && dash.scores.length > 0) {
            setMyScores(dash.scores);
            setDashboardScoreSource('boom_peer_360');
            setQualitativeFeedback({
              startDoing: dash.qualitative.startDoing,
              stopDoing: dash.qualitative.stopDoing,
              continueDoing: dash.qualitative.continueDoing,
            });
            setAiDataContext(buildBoomGrowthAiContext({
              mode: 'self',
              pulseLabel: 'Your peer 360 feedback',
              peerCount: dash.peerCount,
              subjectCount: 1,
              scores: dash.scores,
              qualitative: dash.qualitative,
              themes: dash.themes,
            }, q));
            setGrowthHubMode('self');
            setPulseLabel('Your peer 360 feedback');
            return;
          }

          setMyScores([]);
          setDashboardScoreSource('boom_peer_360');
          setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
          setAiDataContext('');
          return;
        }

        setGrowthHubMode(null);
        setPulseLabel(null);
        setMyScores([]);
        setDashboardScoreSource('none');
        setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
        setAiDataContext('');
        return;
      }

      const { data: myResponses } = await supabase
        .from('survey_responses')
        .select('id, feedback_direction')
        .eq('employee_id', employeeId);

      if (myResponses?.length) {
        const responseIds = myResponses.map(r => r.id);

        // Build direction map
        const directionMap: Record<string, string> = {};
        myResponses.forEach(r => { directionMap[r.id] = r.feedback_direction || 'peer'; });

        const counts = { above: 0, peer: 0, below: 0 };
        myResponses.forEach(r => {
          const dir = (r.feedback_direction || 'peer') as keyof typeof counts;
          if (counts[dir] !== undefined) counts[dir]++;
        });
        setDirectionCounts(counts);

        // Fetch only MY answers (not all org answers) - batch if needed
        const batchSize = 200;
        let allMyAnswers: any[] = [];
        for (let i = 0; i < responseIds.length; i += batchSize) {
          const batch = responseIds.slice(i, i + batchSize);
          const { data } = await supabase
            .from('survey_answers')
            .select('score, response_id, question_id')
            .in('response_id', batch)
            .not('score', 'is', null);
          if (data) allMyAnswers = allMyAnswers.concat(data);
        }

        // Fetch questions with categories for mapping
        const { data: questionsWithCats } = await supabase
          .from('survey_questions')
          .select('id, survey_categories(name)');

        const questionCatMap: Record<string, string> = {};
        (questionsWithCats as any[])?.forEach(q => {
          if (q.survey_categories?.name) questionCatMap[q.id] = q.survey_categories.name;
        });

        // Overall scores
        const myCatScores: Record<string, number[]> = {};
        const dirCatScores: Record<string, Record<string, number[]>> = { above: {}, peer: {}, below: {} };

        allMyAnswers.forEach(a => {
          const cat = questionCatMap[a.question_id];
          if (cat && a.score) {
            if (!myCatScores[cat]) myCatScores[cat] = [];
            myCatScores[cat].push(a.score);

            const dir = directionMap[a.response_id] || 'peer';
            if (!dirCatScores[dir]) dirCatScores[dir] = {};
            if (!dirCatScores[dir][cat]) dirCatScores[dir][cat] = [];
            dirCatScores[dir][cat].push(a.score);
          }
        });

        const cats = Object.keys(myCatScores);
        const avgArr = (arr: number[]) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;

        // For org average, use a lightweight RPC or just compute from limited sample
        // Instead of fetching ALL answers, we'll skip org avg or use a rough estimate
        // For now, set org avg to 0 and compute it in background
        const scores = cats.map(cat => ({
          category: cat,
          myScore: avgArr(myCatScores[cat]),
          orgAvg: 0,
        }));
        setMyScores(scores);

        // ANONYMITY HARDENING: hide a direction's scores entirely when fewer
        // than 3 reviewers contributed — protects identity in small groups.
        const MIN_RATERS = 3;
        const buildDirScores = (dir: string): CategoryScore[] => {
          if ((counts as any)[dir] < MIN_RATERS) return [];
          return cats.map(cat => ({
            category: cat,
            myScore: dirCatScores[dir]?.[cat] ? avgArr(dirCatScores[dir][cat]) : 0,
            orgAvg: 0,
          })).filter(s => s.myScore > 0);
        };

        setDirectionScores({
          above: buildDirScores('above'),
          peer: buildDirScores('peer'),
          below: buildDirScores('below'),
        });

        if (cats.length === 0) {
          const q = defaultQuarterPeriod();
          const boom = await fetchMyAggregatedPeer360Scores(q);
          if (boom?.scores.length) {
            setMyScores(boom.scores);
            setDashboardScoreSource('boom_peer_360');
            setBoom360DashMeta({ period: q, maxPeerResponses: boom.maxPeerResponsesHint });
            setDirectionScores({ above: [], peer: [], below: [] });
            setDirectionCounts({ above: 0, peer: 0, below: 0 });
            setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
            setAiDataContext(
              `BOOM Executive Office peer 360 (${q}): anonymous aggregated averages by behaviour section. Peer depth (max across sections): ${boom.maxPeerResponsesHint}.`,
            );
            setCohortScores([]);
            setCohortMeta(null);
            setCohortRanks([]);
          } else {
            setDashboardScoreSource('none');
            setBoom360DashMeta(null);
            setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
            setAiDataContext('');
            setCohortScores([]);
            setCohortMeta(null);
            setCohortRanks([]);
          }
        } else {
          setDashboardScoreSource('legacy_survey');
          setBoom360DashMeta(null);

        // Fetch qualitative (text) answers
        let allTextAnswers: any[] = [];
        for (let i = 0; i < responseIds.length; i += batchSize) {
          const batch = responseIds.slice(i, i + batchSize);
          const { data } = await supabase
            .from('survey_answers')
            .select('text_answer, response_id, question_id')
            .in('response_id', batch)
            .not('text_answer', 'is', null);
          if (data) allTextAnswers = allTextAnswers.concat(data);
        }

        // Map questions to their text to identify start/stop/continue
        const { data: allQs } = await supabase.from('survey_questions').select('id, question_text').eq('question_type', 'open_ended');
        const qTextMap: Record<string, string> = {};
        (allQs as any[])?.forEach(q => { qTextMap[q.id] = (q.question_text || '').toLowerCase(); });

        const fb = { startDoing: [] as FeedbackItem[], stopDoing: [] as FeedbackItem[], continueDoing: [] as FeedbackItem[] };
        allTextAnswers.forEach(a => {
          if (!isMeaningfulQualitativeAnswer(a.text_answer)) return;
          const dir = directionMap[a.response_id] || 'peer';
          // ANONYMITY: drop direction label when <3 reviewers in that group so
          // a single comment can't be tied back to one person.
          const safeDir = (counts as any)[dir] >= 3 ? dir : 'peer';
          const qText = qTextMap[a.question_id] || '';
          const item: FeedbackItem = { text: a.text_answer.trim(), direction: safeDir };
          if (qText.includes('stop')) fb.stopDoing.push(item);
          else if (qText.includes('start')) fb.startDoing.push(item);
          else if (qText.includes('continue')) fb.continueDoing.push(item);
          // else: skip — don't bucket unrelated open-ended into Continue
        });
        setQualitativeFeedback(fb);

        // Build AI context
        const contextParts = [
          `Employee Performance Data:`,
          `Overall Score: ${avgArr(Object.values(myCatScores).flat())}/5`,
          `Total Reviews: ${myResponses.length} (Above: ${counts.above}, Peer: ${counts.peer}, Below: ${counts.below})`,
          `\nCategory Scores:`,
          ...cats.map(cat => `• ${cat}: ${avgArr(myCatScores[cat])}/5`),
          `\nScores by Source:`,
          ...(['above', 'peer', 'below'] as const).map(dir => {
            const ds = dirCatScores[dir] || {};
            const entries = Object.entries(ds).map(([c, arr]) => `${c}: ${avgArr(arr)}`).join(', ');
            return `• ${dir}: ${entries || 'No data'}`;
          }),
          `\nQualitative Feedback:`,
          `Continue Doing (${fb.continueDoing.length}): ${fb.continueDoing.slice(0, 10).map(f => f.text).join(' | ')}`,
          `Start Doing (${fb.startDoing.length}): ${fb.startDoing.slice(0, 10).map(f => f.text).join(' | ')}`,
          `Stop Doing (${fb.stopDoing.length}): ${fb.stopDoing.slice(0, 10).map(f => f.text).join(' | ')}`,
        ];
        setAiDataContext(contextParts.join('\n'));

        // === COHORT ANALYSIS: compute proper Department / Level / Subsidiary / Org averages ===
        // (replaces the previous random 5,000-row sample which was statistically unsound)
        void (async () => {
          try {
            const me = currentEmployee;
            if (!me) return;

            // 1) All responses with cohort metadata, excluding self
            const { data: allResponses } = await supabase
              .from('survey_responses')
              .select('id, employee_id, subsidiary_id, reviewee_hierarchy_level')
              .neq('employee_id', me.id);
            if (!allResponses?.length) return;

            // 2) Build employee lookup (department + subsidiary + level), excluding self
            const empById: Record<string, Employee> = {};
            allEmployees.forEach(e => { if (e.id !== me.id) empById[e.id] = e; });

            // 3) Batch-fetch all answer scores for those responses
            const respIds = allResponses.map(r => r.id);
            const batch = 500;
            let allAns: Array<{ response_id: string; question_id: string; score: number }> = [];
            for (let i = 0; i < respIds.length; i += batch) {
              const slice = respIds.slice(i, i + batch);
              const { data } = await supabase
                .from('survey_answers')
                .select('response_id, question_id, score')
                .in('response_id', slice)
                .not('score', 'is', null);
              if (data) allAns = allAns.concat(data as any);
            }

            // 4) Aggregate score arrays per category, per cohort
            const catList = cats; // categories the user has data in
            const blank = () => Object.fromEntries(catList.map(c => [c, [] as number[]])) as Record<string, number[]>;
            const orgScores = blank();
            const subsidiaryScores = blank();
            const departmentScores = blank();
            const levelScores = blank();

            // Per-employee accumulator for ranking (avg of all category-means)
            const empAns: Record<string, number[]> = {};

            const respMap: Record<string, { employee_id: string; subsidiary_id: string; level: number | null }> = {};
            allResponses.forEach(r => {
              respMap[r.id] = {
                employee_id: r.employee_id,
                subsidiary_id: r.subsidiary_id,
                level: r.reviewee_hierarchy_level,
              };
            });

            allAns.forEach(a => {
              const r = respMap[a.response_id];
              if (!r) return;
              const cat = questionCatMap[a.question_id];
              if (!cat || !catList.includes(cat)) return;

              orgScores[cat].push(a.score);
              if (r.subsidiary_id === me.subsidiary_id) subsidiaryScores[cat].push(a.score);

              const emp = empById[r.employee_id];
              if (emp) {
                if (me.department && emp.department && emp.department.toLowerCase() === me.department.toLowerCase()) {
                  departmentScores[cat].push(a.score);
                }
                if ((emp.hierarchy_level ?? 3) === (me.hierarchy_level ?? 3)) {
                  levelScores[cat].push(a.score);
                }
              }

              if (!empAns[r.employee_id]) empAns[r.employee_id] = [];
              empAns[r.employee_id].push(a.score);
            });

            // 5) Build CohortScore rows (need at least 3 scores in a cohort to show, else 0 → '—')
            const MIN_COHORT_N = 3;
            const safeAvg = (arr: number[]) => arr.length >= MIN_COHORT_N ? parseFloat((arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(2)) : 0;
            const cohortRows: CohortScore[] = catList.map(c => ({
              category: c,
              you: avgArr(myCatScores[c] || []),
              department: safeAvg(departmentScores[c] || []),
              level: safeAvg(levelScores[c] || []),
              subsidiary: safeAvg(subsidiaryScores[c] || []),
              organisation: safeAvg(orgScores[c] || []),
            }));
            setCohortScores(cohortRows);

            // 6) Cohort sizes (people with ≥1 review)
            const peopleInCohort = (filter: (e: Employee) => boolean) => {
              const ids = new Set<string>();
              Object.keys(empAns).forEach(eid => {
                const emp = empById[eid];
                if (emp && filter(emp)) ids.add(eid);
              });
              return ids.size;
            };
            const meDept = me.department?.toLowerCase() || null;
            const meLvl = me.hierarchy_level ?? 3;

            const dashLowerSenior =
              subsidiaries.find(s => s.id === me.subsidiary_id)?.hierarchy_lower_is_senior ?? false;
            const meta: CohortMeta = {
              departmentName: me.department,
              subsidiaryName: subsidiaries.find(s => s.id === me.subsidiary_id)?.name ?? null,
              levelLabel: displayHierarchyLabel(meLvl, dashLowerSenior),
              departmentSize: peopleInCohort(e => !!meDept && (e.department?.toLowerCase() === meDept) && e.subsidiary_id === me.subsidiary_id),
              levelSize: peopleInCohort(e => (e.hierarchy_level ?? 3) === meLvl),
              subsidiarySize: peopleInCohort(e => e.subsidiary_id === me.subsidiary_id),
              organisationSize: Object.keys(empAns).length,
            };
            setCohortMeta(meta);

            // 7) Rankings — overall average per employee, plus self
            const myOverallScore = avgArr(Object.values(myCatScores).flat());
            const empAvg: Array<{ id: string; avg: number }> = Object.entries(empAns)
              .filter(([, arr]) => arr.length >= MIN_COHORT_N)
              .map(([id, arr]) => ({ id, avg: arr.reduce((s, n) => s + n, 0) / arr.length }));
            empAvg.push({ id: me.id, avg: myOverallScore });

            const rankIn = (filter: (e: Employee) => boolean, scope: RankInfo['scope']): RankInfo => {
              const pool = empAvg.filter(({ id }) => id === me.id || (empById[id] && filter(empById[id])));
              if (pool.length < 2) return { rank: 0, total: 0, percentile: 0, scope };
              pool.sort((a, b) => b.avg - a.avg);
              const idx = pool.findIndex(p => p.id === me.id);
              const rank = idx + 1;
              const percentile = Math.round(((pool.length - rank) / (pool.length - 1)) * 100);
              return { rank, total: pool.length, percentile, scope };
            };

            setCohortRanks([
              rankIn(e => !!meDept && (e.department?.toLowerCase() === meDept) && e.subsidiary_id === me.subsidiary_id, 'department'),
              rankIn(e => (e.hierarchy_level ?? 3) === meLvl, 'level'),
              rankIn(e => e.subsidiary_id === me.subsidiary_id, 'subsidiary'),
              rankIn(() => true, 'organisation'),
            ]);

            // Also update legacy myScores.orgAvg so existing radar/bar charts use a real average
            setMyScores(prev => prev.map(s => {
              const row = cohortRows.find(c => c.category === s.category);
              return row ? { ...s, orgAvg: row.organisation } : s;
            }));
          } catch (e) {
            console.error('Cohort analysis error:', e);
          }
        })();
        }
      } else {
        const q = defaultQuarterPeriod();
        const boom = await fetchMyAggregatedPeer360Scores(q);
        if (boom?.scores.length) {
          setMyScores(boom.scores);
          setDashboardScoreSource('boom_peer_360');
          setBoom360DashMeta({ period: q, maxPeerResponses: boom.maxPeerResponsesHint });
          setDirectionScores({ above: [], peer: [], below: [] });
          setDirectionCounts({ above: 0, peer: 0, below: 0 });
          setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
          setAiDataContext(
            `BOOM Executive Office peer 360 (${q}): anonymous aggregated averages by behaviour section. Peer depth (max across sections): ${boom.maxPeerResponsesHint}.`,
          );
          setCohortScores([]);
          setCohortMeta(null);
          setCohortRanks([]);
        } else {
          setMyScores([]);
          setDashboardScoreSource('none');
          setBoom360DashMeta(null);
          setDirectionScores({ above: [], peer: [], below: [] });
          setDirectionCounts({ above: 0, peer: 0, below: 0 });
          setQualitativeFeedback({ startDoing: [], stopDoing: [], continueDoing: [] });
          setAiDataContext('');
          setCohortScores([]);
          setCohortMeta(null);
          setCohortRanks([]);
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setDashboardLoading(false);
    }
  };

  // Load rankings
  useEffect(() => {
    if (activeTab === 'rankings') {
      loadRankings();
    }
  }, [activeTab]);

  const loadRankings = async () => {
    setRankingsLoading(true);
    try {
      const ranked = await fetchOrgPerformanceRankings();
      setRankings(ranked);
    } catch (err) {
      console.error(err);
    } finally {
      setRankingsLoading(false);
    }
  };

  // Realtime subscriptions for live data
  useEffect(() => {
    const channel = supabase
      .channel('employee-hub-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_responses' }, () => {
        if (activeTab === 'dashboard' && currentEmployee?.id) void loadDashboardData(currentEmployee.id);
        if (activeTab === 'rankings') void loadRankings();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_answers' }, () => {
        if (activeTab === 'dashboard' && currentEmployee?.id) void loadDashboardData(currentEmployee.id);
        if (activeTab === 'rankings') void loadRankings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assessment_responses' }, () => {
        if (activeTab === 'dashboard' && currentEmployee?.id) void loadDashboardData(currentEmployee.id);
        if (activeTab === 'rankings') void loadRankings();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assessment_answers' }, () => {
        if (activeTab === 'dashboard' && currentEmployee?.id) void loadDashboardData(currentEmployee.id);
        if (activeTab === 'rankings') void loadRankings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTab, currentEmployee?.id]);

  const loadEmployees = async (subsidiaryId: string) => {
    setEmployeesLoading(true);
    try {
      const { data } = await supabase.from('employees').select('*').eq('subsidiary_id', subsidiaryId).order('name');
      if (data) setEmployees(data);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleSelectSubsidiary = (sub: Subsidiary) => {
    setSelectedSubsidiary(sub);
    setEmployees([]);
    setStep('employee');
    setEmployeeSearch('');
    void loadEmployees(sub.id);
  };

  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setStep('questions');
    setCurrentCategoryIndex(0);
  };

  const currentCategory = categories[currentCategoryIndex];
  const currentQuestions = currentCategory ? questions.filter(q => q.category_id === currentCategory.id) : [];

  const isCurrentCategoryComplete = () => {
    if (!currentCategory) return false;
    return currentQuestions.every(q => q.question_type === 'open_ended' || answers[q.id] !== undefined);
  };

  const totalScoredQuestions = questions.filter(q => q.question_type === 'scored').length;
  const answeredScoredQuestions = questions.filter(q => q.question_type === 'scored' && answers[q.id] !== undefined).length;
  const progress = totalScoredQuestions > 0 ? (answeredScoredQuestions / totalScoredQuestions) * 100 : 0;

  const handleSubmit = async () => {
    if (!selectedEmployee || !selectedSubsidiary || !user || submitInFlight.current) return;
    submitInFlight.current = true;

    const emp = selectedEmployee;
    const sub = selectedSubsidiary;
    const reviewerEmp = currentEmployee;
    const reviewerLevel = reviewerEmp?.hierarchy_level ?? 3;
    const revieweeLevel = emp.hierarchy_level ?? 3;
    const direction = getSurveyFeedbackDirection(
      reviewerLevel,
      revieweeLevel,
      mySubsidiaryLowerSenior,
    );

    setCompletedEmployees(prev => {
      const next = new Set(prev);
      next.add(emp.id);
      return next;
    });
    setStep('submitted');
    toast.success('Response submitted successfully.');

    let responseId: string | null = null;
    try {
      const { data: responseData, error: responseError } = await supabase
        .from('survey_responses')
        .insert({
          employee_id: emp.id,
          subsidiary_id: sub.id,
          reviewer_hierarchy_level: reviewerLevel,
          reviewee_hierarchy_level: revieweeLevel,
          feedback_direction: direction,
        })
        .select('id')
        .single();
      if (responseError) throw responseError;
      responseId = responseData.id;

      const answerRows = Object.entries(answers).map(([questionId, value]) => ({
        response_id: responseData.id,
        question_id: questionId,
        score: typeof value === 'number' ? value : null,
        text_answer: typeof value === 'string' ? value : null,
      }));
      const { error: answersError } = await supabase.from('survey_answers').insert(answerRows);
      if (answersError) throw answersError;

      const { error: completionError } = await supabase.from('review_completions').insert({
        reviewer_id: user.id,
        employee_id: emp.id,
      });
      if (completionError) throw completionError;
    } catch (err) {
      console.error(err);
      if (responseId) {
        await supabase.from('survey_responses').delete().eq('id', responseId);
      }
      setCompletedEmployees(prev => {
        const next = new Set(prev);
        next.delete(emp.id);
        return next;
      });
      setStep('questions');
      toast.error('Failed to submit. Please try again.');
    } finally {
      submitInFlight.current = false;
    }
  };

  // Department counts for the selected subsidiary
  const departmentCounts = useMemo(() => {
    const emps = selectedSubsidiary ? allEmployees.filter(e => e.subsidiary_id === selectedSubsidiary.id) : [];
    const counts: Record<string, number> = {};
    emps.forEach(e => {
      const dept = e.department || 'Unassigned';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [selectedSubsidiary, allEmployees]);

  // Get the logged-in user's hierarchy level
  const myHierarchyLevel = useMemo(() => {
    return currentEmployee?.hierarchy_level ?? 3;
  }, [currentEmployee]);

  /** EO pilot: lower hierarchy_level = more senior. Legacy survey: higher = more senior. */
  const mySubsidiaryLowerSenior = useMemo(
    () => subsidiaries.find(s => s.id === currentEmployee?.subsidiary_id)?.hierarchy_lower_is_senior ?? false,
    [subsidiaries, currentEmployee?.subsidiary_id],
  );

  const surveyHierarchyLowerSenior = useMemo(() => {
    if (selectedSubsidiary) {
      return subsidiaries.find(s => s.id === selectedSubsidiary.id)?.hierarchy_lower_is_senior ?? false;
    }
    return mySubsidiaryLowerSenior;
  }, [subsidiaries, selectedSubsidiary, mySubsidiaryLowerSenior]);

  // Subsidiary employee counts
  const subsidiaryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allEmployees.forEach(e => { counts[e.subsidiary_id] = (counts[e.subsidiary_id] || 0) + 1; });
    return counts;
  }, [allEmployees]);

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees;
    const q = employeeSearch.toLowerCase();
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.email && e.email.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q))
    );
  }, [employees, employeeSearch]);

  // Group employees into hierarchy pools: Above, Peers, Below
  const hierarchyPools = useMemo(() => {
    const above: Employee[] = [];
    const peers: Employee[] = [];
    const below: Employee[] = [];

    filteredEmployees.forEach(emp => {
      if (emp.id === currentEmployee?.id) return;
      const level = emp.hierarchy_level ?? 3;
      const pool = assignHierarchyPool(level, myHierarchyLevel, surveyHierarchyLowerSenior);
      if (pool === 'above') above.push(emp);
      else if (pool === 'below') below.push(emp);
      else peers.push(emp);
    });

    return { above, peers, below };
  }, [currentEmployee?.id, filteredEmployees, myHierarchyLevel, surveyHierarchyLowerSenior]);

  // Pool counts across ALL employees (not just selected subsidiary)
  const globalPoolCounts = useMemo(() => {
    let above = 0, peers = 0, below = 0;
    allEmployees.forEach(emp => {
      if (emp.id === currentEmployee?.id) return;
      const level = emp.hierarchy_level ?? 3;
      const pool = assignHierarchyPool(level, myHierarchyLevel, mySubsidiaryLowerSenior);
      if (pool === 'above') above++;
      else if (pool === 'below') below++;
      else peers++;
    });
    return { above, peers, below, total: above + peers + below };
  }, [allEmployees, currentEmployee?.id, myHierarchyLevel, mySubsidiaryLowerSenior]);

  const overallScore = useMemo(() => {
    if (!myScores.length) return 0;
    return parseFloat((myScores.reduce((s, c) => s + c.myScore, 0) / myScores.length).toFixed(2));
  }, [myScores]);

  const orgOverall = useMemo(() => {
    if (!myScores.length) return 0;
    return parseFloat((myScores.reduce((s, c) => s + c.orgAvg, 0) / myScores.length).toFixed(2));
  }, [myScores]);

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (!showRankings && activeTab === 'rankings') {
      setTab('survey');
    }
  }, [activeTab, showRankings]);

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (loading) {
    return <PlatformHubSkeleton />;
  }

  const getRankIcon = (rank: number) => {
    if (rank === 0) return <Trophy className="w-5 h-5 text-warning" />;
    if (rank === 1) return <span className="text-muted-foreground font-bold">🥈</span>;
    if (rank === 2) return <span className="text-primary font-bold">🥉</span>;
    return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">{rank + 1}</span>;
  };

  const stepNumber = step === 'subsidiary' ? 1 : step === 'employee' ? 2 : step === 'questions' ? 3 : 4;
  const currentEmployeeSubsidiary = currentEmployee
    ? subsidiaries.find((s) => s.id === currentEmployee.subsidiary_id)?.name
    : null;

  return (
    <div className="app-page">
      <div className="app-page-grid" />

      {/* Desktop sidebar (hidden on mobile via component) */}
      <PlatformSidebar
        suppressMobileHeader
        title={tenant.branding.workspaceLabel}
        subtitle={profile?.name}
        meta={[
          { label: 'Subsidiary', value: currentEmployeeSubsidiary ?? 'Unlisted' },
          { label: 'Department', value: currentEmployee?.department ?? profile?.department ?? 'Unassigned' },
          { label: 'Role', value: currentEmployee?.role ?? 'Employee' },
        ]}
        onLogout={handleLogout}
        items={[
          { key: 'survey', label: 'Appraisal', icon: <ClipboardList className="w-4 h-4" />, active: activeTab === 'survey', onClick: () => setTab('survey') },
          { key: 'dashboard', label: 'My Dashboard', icon: <BarChart3 className="w-4 h-4" />, active: activeTab === 'dashboard', onClick: () => setTab('dashboard') },
          {
            key: 'growth',
            label: 'Growth Hub',
            icon: <img src="/favicon.png" alt="Growth Hub" className="w-4 h-4 rounded-sm object-contain" />,
            active: activeTab === 'growth',
            onClick: () => setTab('growth')
          },
          ...(showRankings
            ? [{ key: 'rankings', label: 'Rankings', icon: <Trophy className="w-4 h-4" />, active: activeTab === 'rankings', onClick: () => setTab('rankings') }]
            : []),
        ]}
        actions={
          <>
            {ghcMode ? <GhcNotificationsBell /> : <BoomNotificationsBell />}
            {isAdmin && (
              <Button variant="outline" size="sm" asChild className="w-full gap-2 border-primary/30 text-primary">
                <Link to="/appraisal"><Shield className="w-4 h-4" /> Admin</Link>
              </Button>
            )}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
              <Shield className="w-3.5 h-3.5" />
              <span>Anonymous</span>
            </div>
          </>
        }
      />

      {/* Mobile top bar — logo + active section label, no hamburger */}
      <header
        className="lg:hidden sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 h-14 flex items-center justify-between min-h-[3.5rem]">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={vggLogo} alt="VGG" className="h-6 w-auto flex-shrink-0" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
              ◉ {activeTab === 'survey' ? 'Appraisal'
                  : activeTab === 'dashboard' ? 'My Dashboard'
                  : activeTab === 'growth' && showGrowthHub ? 'Growth Hub'
                  : activeTab === 'rankings' ? 'Rankings'
                  : activeTab === 'profile' ? 'Profile'
                  : 'Appraisal'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {ghcMode ? <GhcNotificationsBell compact /> : <BoomNotificationsBell compact />}
            {isAdmin && (
              <Link to="/appraisal" aria-label="Admin" className="text-muted-foreground hover:text-primary p-2">
                <Shield className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="lg:pl-72">
      <div className="platform-content section-stack px-4 sm:px-6 lg:px-8 has-mobile-tabbar">
        <Tabs value={activeTab} onValueChange={setTab}>
          {/* ============ SURVEY TAB ============ */}
          <TabsContent value="survey" className="mt-4">
            {ghcMode ? (
              <GhcReviewHub
                employeeId={currentEmployee?.id ?? null}
                employeeName={currentEmployee?.name ?? profile?.name ?? null}
                isPlatformAdmin={isAdmin}
              />
            ) : (
              <BoomReviewHub
                reviewerEmployeeId={currentEmployee?.id ?? null}
                reviewerHierarchyLevel={currentEmployee?.hierarchy_level ?? profile?.hierarchy_level ?? null}
                reviewerName={currentEmployee?.name ?? profile?.name ?? null}
                reviewerRole={currentEmployee?.role ?? profile?.role ?? null}
                reviewerDepartment={currentEmployee?.department ?? profile?.department ?? null}
                reviewerEmail={profile?.email ?? user?.email ?? null}
                isPlatformAdmin={isAdmin}
              />
            )}
          </TabsContent>

          {/* ============ DASHBOARD TAB ============ */}
          <TabsContent value="dashboard" className="mt-4">
            {ghcMode ? (
              <GhcMyResults
                periodQuarter={defaultQuarterPeriod()}
                acknowledgeTask={null}
                onAcknowledged={() => undefined}
              />
            ) : (
            <motion.div {...pageTransition}>
              {dashboardLoading ? (
                <EmployeeDashboardTabSkeleton />
              ) : (
                <motion.div
                  className="space-y-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AnonymityBanner />
                  {boom360DashMeta && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-panel p-4 border border-primary/20 bg-primary/5"
                    >
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-foreground">BOOM peer 360</span> (quarter{' '}
                        <span className="font-mono">{boom360DashMeta.period}</span>): these scores are{' '}
                        <strong>aggregated anonymous peer averages</strong> by behaviour section. The legacy multi-subsidiary
                        survey &quot;feedback by source&quot; breakdown does not apply. Complete open 360 tasks under{' '}
                        <strong>Survey</strong>; HR must release the quarter before averages appear here.
                      </p>
                    </motion.div>
                  )}
                  {/* Your Level & Pool Summary */}
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold">Your Appraisal Pool</h3>
                          <p className="text-[10px] text-muted-foreground">
                            Level: {displayHierarchyLabel(myHierarchyLevel, mySubsidiaryLowerSenior)} — {globalPoolCounts.total}{' '}
                            people may be in your 360 network. BOOM quarterly forms (executive, peer 360, monthly self) are
                            assigned separately on the Survey tab.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Above You', count: globalPoolCounts.above, icon: <ArrowUp className="w-3.5 h-3.5" />, color: 'text-blue-600 bg-blue-500/10' },
                        { label: 'Your Peers', count: globalPoolCounts.peers, icon: <ArrowLeftRight className="w-3.5 h-3.5" />, color: 'text-emerald-600 bg-emerald-500/10' },
                        { label: 'Below You', count: globalPoolCounts.below, icon: <ArrowDown className="w-3.5 h-3.5" />, color: 'text-amber-600 bg-amber-500/10' },
                      ].map(p => (
                        <div key={p.label} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.color}`}>{p.icon}</span>
                          <div>
                            <p className="text-[10px] text-muted-foreground">{p.label}</p>
                            <p className="text-sm font-bold">{p.count}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Stats row */}
                  {boom360DashMeta ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Star className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Overall (360 avg.)</p>
                            <p className="text-xl font-bold">{overallScore}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                          </div>
                        </div>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                            <BarChart3 className="w-3.5 h-3.5 text-accent" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">BOOM quarter</p>
                            <p className="text-lg font-bold font-mono">{boom360DashMeta.period}</p>
                          </div>
                        </div>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Peer depth (max section)</p>
                            <p className="text-xl font-bold">{boom360DashMeta.maxPeerResponses}</p>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Star className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Overall</p>
                            <p className="text-xl font-bold">{overallScore}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                          </div>
                        </div>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                            <BarChart3 className="w-3.5 h-3.5 text-accent" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Org Avg</p>
                            <p className="text-xl font-bold">{orgOverall}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                          </div>
                        </div>
                      </motion.div>
                      {[
                        { label: 'From Above', count: directionCounts.above, icon: '↓', color: 'text-blue-500 bg-blue-500/10' },
                        { label: 'From Peers', count: directionCounts.peer, icon: '↔', color: 'text-emerald-500 bg-emerald-500/10' },
                        { label: 'From Below', count: directionCounts.below, icon: '↑', color: 'text-amber-500 bg-amber-500/10' },
                      ].map((d, i) => (
                        <motion.div key={d.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }} className="glass-panel p-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${d.color}`}>{d.icon}</div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">{d.label}</p>
                              <p className="text-xl font-bold">{d.count}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {eaQuarterlyResults && eaQuarterlyResults.submissionCount > 0 && (
                    <EaQuarterlyDashboardCard results={eaQuarterlyResults} />
                  )}

                  {myScores.length > 0 ? (
                    <>
                      {/* AI Insights Carousel */}
                      {aiDataContext && <AIInsightsCarousel dataContext={aiDataContext} />}

                      {/* Overall charts */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel p-6">
                          <h2 className="text-sm font-semibold mb-4">
                            {growthHubMode === 'team_pulse'
                              ? `${pulseLabel ?? 'Team pulse'} — behaviour sections`
                              : dashboardScoreSource === 'boom_peer_360'
                                ? 'BOOM peer 360 — behaviour sections'
                                : 'Overall Competency Overview'}
                          </h2>
                          <ResponsiveContainer width="100%" height={280}>
                            <RadarChart data={myScores}>
                              <PolarGrid stroke="hsl(var(--border))" />
                              <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                              <Radar name="You" dataKey="myScore" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                              {dashboardScoreSource !== 'boom_peer_360' && (
                                <Radar name="Org Avg" dataKey="orgAvg" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" />
                              )}
                            </RadarChart>
                          </ResponsiveContainer>
                          <div className="flex gap-4 justify-center mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary rounded" /> You</span>
                            {dashboardScoreSource !== 'boom_peer_360' && (
                              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-muted-foreground rounded" /> Org Average</span>
                            )}
                          </div>
                        </motion.div>

                        <DetailedCategoryBreakdown scores={myScores} />
                      </div>

                      {dashboardScoreSource === 'boom_peer_360' &&
                        (qualitativeFeedback.startDoing.length > 0 ||
                          qualitativeFeedback.stopDoing.length > 0 ||
                          qualitativeFeedback.continueDoing.length > 0) && (
                          <div>
                            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-primary" />
                              {growthHubMode === 'team_pulse' ? 'Anonymous team themes' : 'Anonymous peer themes'}
                            </h2>
                            <p className="text-[11px] text-muted-foreground mb-4">
                              {growthHubMode === 'team_pulse'
                                ? 'Aggregated written 360 comments from your oversight roster — no names shown.'
                                : 'Written 360 comments are shown without reviewer names to protect anonymity.'}
                            </p>
                            <QualitativeFeedback
                              startDoing={qualitativeFeedback.startDoing}
                              stopDoing={qualitativeFeedback.stopDoing}
                              continueDoing={qualitativeFeedback.continueDoing}
                            />
                          </div>
                        )}

                      {/* Cohort Comparisons: department / level / subsidiary / org */}
                      {cohortMeta && cohortScores.length > 0 && (
                        <PerformanceContext
                          scores={cohortScores}
                          meta={cohortMeta}
                          yourOverall={overallScore}
                          ranks={cohortRanks}
                        />
                      )}

                      {dashboardScoreSource === 'legacy_survey' && (
                        <>
                          <div>
                            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                              <Users className="w-4 h-4 text-primary" />
                              Feedback by Source
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {[
                                { key: 'above' as const, label: 'From Leadership Above', icon: '↓', color: 'border-blue-500/30', accent: 'hsl(210, 80%, 55%)', desc: 'Scores from people above your level' },
                                { key: 'peer' as const, label: 'From Peers', icon: '↔', color: 'border-emerald-500/30', accent: 'hsl(160, 60%, 45%)', desc: 'Scores from people at your level' },
                                { key: 'below' as const, label: 'From Reports Below', icon: '↑', color: 'border-amber-500/30', accent: 'hsl(40, 80%, 50%)', desc: 'Scores from people below your level' },
                              ].map(({ key, label, icon, color, accent, desc }) => {
                                const scores = directionScores[key];
                                const avg = scores.length
                                  ? parseFloat((scores.reduce((s, c) => s + c.myScore, 0) / scores.length).toFixed(2))
                                  : 0;
                                return (
                                  <motion.div
                                    key={key}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`glass-panel p-5 border-l-4 ${color}`}
                                  >
                                    <div className="flex items-center gap-2 mb-3">
                                      <span className="text-lg">{icon}</span>
                                      <div>
                                        <h3 className="text-xs font-bold">{label}</h3>
                                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                                      </div>
                                    </div>
                                    {scores.length > 0 ? (
                                      <>
                                        <div className="text-center mb-3">
                                          <span className="text-2xl font-bold">{avg}</span>
                                          <span className="text-xs text-muted-foreground">/5</span>
                                          <p className="text-[10px] text-muted-foreground mt-0.5">{directionCounts[key]} review{directionCounts[key] !== 1 ? 's' : ''}</p>
                                        </div>
                                        <div className="space-y-1.5">
                                          {scores.map(s => (
                                            <div key={s.category} className="flex items-center gap-2">
                                              <span className="text-[10px] text-muted-foreground w-20 truncate">{s.category}</span>
                                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${(s.myScore / 5) * 100}%`, backgroundColor: accent }} />
                                              </div>
                                              <span className="text-[10px] font-semibold w-6 text-right">{s.myScore}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-center py-4">
                                        <p className="text-xs text-muted-foreground">No reviews from this source yet</p>
                                      </div>
                                    )}
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>

                          <QualitativeFeedback
                            startDoing={qualitativeFeedback.startDoing}
                            stopDoing={qualitativeFeedback.stopDoing}
                            continueDoing={qualitativeFeedback.continueDoing}
                          />
                        </>
                      )}
                    </>
                  ) : boom360Pending && !(eaQuarterlyResults && eaQuarterlyResults.submissionCount > 0) ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel p-12 text-center space-y-3">
                      <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                      <h2 className="text-lg font-semibold">Your anonymous 360 feedback</h2>
                      {!boom360Pending.released ? (
                        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                          Loading your anonymous 360 feedback for{' '}
                          <span className="font-mono">{defaultQuarterPeriod()}</span>…
                        </p>
                      ) : boom360Pending.peerCount < boom360Pending.minRequired ? (
                        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                          No peer 360 reviews about you for{' '}
                          <span className="font-mono">{defaultQuarterPeriod()}</span> yet. Aggregated scores and themes
                          appear here automatically as colleagues submit — individual reviewers stay anonymous.
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                          Peer reviews are in, but scored sections are not ready yet. Check back shortly or complete any
                          open 360 tasks on the <strong>Survey</strong> tab.
                        </p>
                      )}
                    </motion.div>
                  ) : !(eaQuarterlyResults && eaQuarterlyResults.submissionCount > 0) ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel p-12 text-center">
                      <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                      <h2 className="text-lg font-semibold mb-2">No dashboard scores yet</h2>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                        If you use the <strong>legacy organisation-wide survey</strong>, scores appear when colleagues submit
                        reviews about you. For the <strong>Executive Office BOOM</strong> programme, open{' '}
                        <strong>Survey</strong> — complete peer 360 tasks; your anonymous aggregated 360 chart updates live
                        as colleagues rate you for <span className="font-mono">{defaultQuarterPeriod()}</span>. Your EA
                        quarterly manager evaluation also appears here once submitted.
                      </p>
                    </motion.div>
                  ) : null}
                </motion.div>
              )}
            </motion.div>
            )}
          </TabsContent>

          {/* ============ GROWTH HUB TAB ============ */}
          <TabsContent value="growth" className="mt-4">
            {ghcMode ? (
              <div className="glass-panel p-6 space-y-3">
                <h3 className="text-sm font-semibold">GHC growth focus</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Use quarterly evaluation improvement goals and culture radar from My results. Manager monthly reviews
                  capture OKR and fulfilment signals each month.
                </p>
              </div>
            ) : (
            <motion.div {...pageTransition}>
              {dashboardLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : !user ? null : myScores.length === 0 ? (
                <div className="glass-panel p-12 text-center">
                  <img src="/favicon.png" alt="Growth Hub" className="w-10 h-10 mx-auto mb-4 rounded-xl object-contain" />
                  <h2 className="text-lg font-semibold mb-2">Growth Hub Unlocks With Feedback</h2>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                    We use your <strong>dashboard competency scores</strong> (legacy survey and/or released BOOM peer 360).
                    Complete open reviews on the <strong>Survey</strong> tab; once averages show on <strong>My Dashboard</strong>,
                    pick a focus area below for resources and your IDP.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5 bg-secondary/35">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                        <img src="/favicon.png" alt="Growth Hub" className="w-5 h-5 rounded-sm object-contain" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold">Your Growth Hub</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {growthHubMode === 'team_pulse'
                            ? `Leading from team feedback: ${pulseLabel ?? 'L2 team pulse'}. Pick a focus area where your team needs the most lift — Perplexity and Claude will find resources tailored to those themes.`
                            : 'Turn feedback into action. Pick a focus area below — we\'ll find real articles, books, and exercises for you, and help you commit to a small, specific goal.'}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Focus area picker — sorted weakest-first */}
                  <div className="glass-panel p-5">
                    <h3 className="text-sm font-semibold mb-1">Pick a focus area</h3>
                    <p className="text-[10px] text-muted-foreground mb-3">
                      {growthHubMode === 'team_pulse'
                        ? 'Sorted by lowest team averages — develop your leadership response to where the pod needs the most support.'
                        : 'Sorted by your lowest scores — these are where growth will move the needle most.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[...myScores].sort((a, b) => a.myScore - b.myScore).map((s) => {
                        const isWeak = s.myScore < 3.5;
                        const active = selectedFocusArea === s.category;
                        return (
                          <button
                            key={s.category}
                            onClick={() => setSelectedFocusArea(s.category)}
                            className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                              active
                                ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                : isWeak
                                ? 'border-destructive/30 bg-destructive/5 text-foreground hover:border-destructive/50'
                                : 'border-border bg-card/50 text-foreground hover:border-primary/30'
                            }`}
                          >
                            {s.category}
                            <span className={`ml-2 text-[10px] ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{s.myScore}/5</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <LearningProfilePanel userId={user.id} />

                  <WeeklyReflection userId={user.id} />

                  {selectedFocusArea && (
                    <GrowthResources
                      userId={user.id}
                      focusArea={selectedFocusArea}
                      currentScore={myScores.find(s => s.category === selectedFocusArea)?.myScore}
                      feedbackContext={aiDataContext}
                      onAddToGoal={(r) => setIdpPrefill({ focus: selectedFocusArea, goal: `Apply "${r.title}" — ${r.why_relevant.split('.')[0]}.` })}
                    />
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DevelopmentPlans
                      userId={user.id}
                      growthAreas={myScores.map(s => s.category)}
                      prefilledFocus={idpPrefill.focus}
                      prefilledGoal={idpPrefill.goal}
                      onClearPrefill={() => setIdpPrefill({})}
                    />
                    <SelfDebrief userId={user.id} />
                  </div>
                </div>
              )}
            </motion.div>
            )}
          </TabsContent>

          {showRankings && (
          <TabsContent value="rankings" className="mt-4">
            <motion.div {...pageTransition}>
              {rankingsLoading ? (
                <RankingsTabSkeleton />
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="text-center mb-6">
                    <h1 className="text-xl font-bold mb-1">Performance Rankings</h1>
                    <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                      Legacy survey averages combined with BOOM <strong>peer 360</strong> Likert scores (submitted reviews
                      only). Executive EPA self-ratings are excluded.
                    </p>
                  </div>

                  {/* Top 3 podium */}
                  {rankings.length >= 3 && (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      {[1, 0, 2].map(idx => {
                        const person = rankings[idx];
                        const isFirst = idx === 0;
                        return (
                          <motion.div
                            key={person.employee_id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + idx * 0.1 }}
                            className={`glass-panel p-4 text-center ${isFirst ? 'sm:-mt-4 border-primary/30 bg-primary/5' : ''}`}
                          >
                            <div className="mb-2">{getRankIcon(idx)}</div>
                            <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${
                              isFirst ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}>
                              <span className="font-bold text-xs">{person.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                            </div>
                            <p className="text-sm font-semibold truncate">{person.name}</p>
                            <p className="text-[10px] text-muted-foreground mb-1">{person.subsidiary}</p>
                            <div className="flex items-center justify-center gap-1">
                              <Star className="w-3 h-3 text-primary" />
                              <span className="text-sm font-bold text-primary">{person.avgScore}</span>
                              <span className="text-[10px] text-muted-foreground">/5</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* Full list */}
                  <div className="glass-panel divide-y divide-border">
                    {rankings.map((person, i) => {
                      const isMe = person.employee_id === currentEmployee?.id;
                      return (
                        <motion.div
                          key={person.employee_id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.03 * Math.min(i, 20) }}
                          className={`flex items-center gap-4 px-4 py-3 ${isMe ? 'bg-primary/5' : ''}`}
                        >
                          <div className="w-7 flex-shrink-0 text-center">{getRankIcon(i)}</div>
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-semibold text-muted-foreground">{person.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {person.name}
                              {isMe && <span className="ml-1.5 text-xs text-primary font-normal">(You)</span>}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{person.subsidiary}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-primary" />
                              <span className="text-sm font-bold">{person.avgScore}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{person.totalReviews} reviews</p>
                          </div>
                        </motion.div>
                      );
                    })}
                    {rankings.length === 0 && (
                      <div className="p-12 text-center">
                        <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                        <h2 className="text-lg font-semibold mb-2">No Rankings Yet</h2>
                        <p className="text-muted-foreground text-sm">Rankings will appear once reviews are submitted.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </TabsContent>
          )}

          {/* ============ PROFILE TAB (mobile-only entry from bottom bar) ============ */}
          <TabsContent value="profile" className="mt-4 lg:hidden">
            <div className="surface-card p-5 space-y-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">◉ Account</p>
                <h2 className="font-display text-2xl font-medium">{profile?.name ?? 'Employee'}</h2>
                <p className="text-sm text-muted-foreground mt-1">{profile?.email}</p>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm border-t border-border pt-4">
                <div className="flex justify-between"><span className="text-muted-foreground">Subsidiary</span><span className="font-medium">{currentEmployeeSubsidiary ?? 'Unlisted'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Department</span><span className="font-medium">{currentEmployee?.department ?? profile?.department ?? 'Unassigned'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className="font-medium">{currentEmployee?.role ?? 'Employee'}</span></div>
              </div>
              {isAdmin && (
                <Button variant="outline" asChild className="w-full gap-2 border-primary/30 text-primary">
                  <Link to="/appraisal"><Shield className="w-4 h-4" /> Admin Console</Link>
                </Button>
              )}
              <Button variant="outline" onClick={handleLogout} className="w-full">Sign Out</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      </div>

      {/* Mobile bottom tab bar — WhatsApp-style */}
      <MobileTabBar
        active={(activeTab as MobileTab) || 'survey'}
        onChange={(t) => setTab(t)}
      />
    </div>
  );
}
