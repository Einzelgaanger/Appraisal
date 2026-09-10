import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AIChatPanel from '@/components/dashboard/AIChatPanel';
import {
  BarChart3, Users, Building2, ClipboardCheck, ArrowLeft, RefreshCw,
  TrendingUp, Clock, ChevronDown, ChevronUp, Zap, Search,
  Star, Target, Trophy, Activity, Brain, Layers, Download, Lock, Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppraisalAdminSkeleton } from '@/components/shell/LoadingShells';
import AdminMobileTabBar from '@/components/AdminMobileTabBar';
import { ENABLE_APP_AI } from '@/lib/featureFlags';
import { defaultQuarterPeriod, defaultMonthPeriod, quarterOptions } from '@/lib/boomPeriods';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import { isBoomTenant, isGhcTenant } from '@/tenants/config';
import { useTenant } from '@/tenants/TenantContext';
import GhcAdminMonitor from '@/modules/ghc/GhcAdminMonitor';

interface ResponseRow { id: string; employee_id: string; subsidiary_id: string; created_at: string; }
interface AnswerRow { id: string; response_id: string; question_id: string; score: number | null; text_answer: string | null; }
interface EmployeeRow {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  subsidiary_id: string;
  hierarchy_level: number | null;
}
interface SubsidiaryRow { id: string; name: string; }
interface CategoryRow { id: string; name: string; sort_order: number; }
interface QuestionRow { id: string; category_id: string; question_text: string; question_type: string; sort_order: number; }

interface BoomResponseRow {
  id: string;
  form_id: string;
  reviewer_id: string;
  reviewee_id: string;
  period: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
}
interface BoomAnswerRow {
  id: string;
  response_id: string;
  question_id: string;
  score: number | null;
  text_answer: string | null;
  no_opportunity: boolean;
}
interface BoomFormRow { id: string; code: string; title: string }
interface BoomQuestionRow { id: string; form_id: string; question_text: string }
interface BoomReleaseRow {
  id: string;
  form_id: string;
  period: string;
  released_at: string;
  released_by: string | null;
  note: string | null;
  assessment_forms: { code: string; title: string } | null;
}

const CHART_COLORS = [
  'hsl(145, 63%, 42%)', 'hsl(210, 72%, 45%)', 'hsl(38, 80%, 50%)',
  'hsl(262, 83%, 58%)', 'hsl(0, 65%, 50%)', 'hsl(180, 60%, 40%)',
  'hsl(320, 70%, 50%)', 'hsl(90, 50%, 45%)',
];

export default function AppraisalAdmin() {
  const { logout: legacyLogout } = useAuth();
  const { logout: employeeLogout } = useEmployeeAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<SubsidiaryRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const boomMode = isBoomTenant(tenant);
  const ghcMode = isGhcTenant(tenant);
  const [adminTab, setAdminTab] = useState(boomMode || ghcMode ? 'boom' : 'overview');
  const [boomResponses, setBoomResponses] = useState<BoomResponseRow[]>([]);
  const [boomAnswers, setBoomAnswers] = useState<BoomAnswerRow[]>([]);
  const [boomForms, setBoomForms] = useState<BoomFormRow[]>([]);
  const [boomQuestions, setBoomQuestions] = useState<BoomQuestionRow[]>([]);
  const [boomPeriodFilter, setBoomPeriodFilter] = useState<string>('all');
  const [boomReleases, setBoomReleases] = useState<BoomReleaseRow[]>([]);
  const [releasePeriodInput, setReleasePeriodInput] = useState('');
  const [releaseNoteInput, setReleaseNoteInput] = useState('');
  const [releaseBusy, setReleaseBusy] = useState(false);

  const [epaOkrEmployeeId, setEpaOkrEmployeeId] = useState<string>('');
  const [epaOkrPeriod, setEpaOkrPeriod] = useState(defaultQuarterPeriod);
  const [epaOkrSlots, setEpaOkrSlots] = useState(() =>
    Array.from({ length: 4 }, () => ({ objective_text: '', key_result_text: '' })),
  );
  const [epaOkrBusy, setEpaOkrBusy] = useState(false);

  const [gateEmployeeId, setGateEmployeeId] = useState<string>('');
  const [gatePeriod, setGatePeriod] = useState(defaultQuarterPeriod);
  const [gateDecision, setGateDecision] = useState<string>('pass');
  const [gateRationale, setGateRationale] = useState('');
  const [gateBusy, setGateBusy] = useState(false);

  const executiveEmployees = useMemo(
    () => employees.filter((e) => e.hierarchy_level != null && e.hierarchy_level <= 1).sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );

  useEffect(() => {
    if (!epaOkrEmployeeId || !epaOkrPeriod) return;
    void (async () => {
      const { data, error } = await supabase
        .from('executive_period_okrs')
        .select('slot_index, objective_text, key_result_text')
        .eq('employee_id', epaOkrEmployeeId)
        .eq('period', epaOkrPeriod);
      if (error) return;
      const next = Array.from({ length: 4 }, () => ({ objective_text: '', key_result_text: '' }));
      (data ?? []).forEach((row) => {
        const i = row.slot_index - 1;
        if (i >= 0 && i < 4) {
          next[i] = {
            objective_text: row.objective_text ?? '',
            key_result_text: row.key_result_text ?? '',
          };
        }
      });
      setEpaOkrSlots(next);
    })();
  }, [epaOkrEmployeeId, epaOkrPeriod]);

  useEffect(() => {
    if (!gateEmployeeId || !gatePeriod) return;
    void (async () => {
      const { data, error } = await supabase
        .from('assessment_gate_decisions')
        .select('decision, rationale')
        .eq('employee_id', gateEmployeeId)
        .eq('period', gatePeriod)
        .maybeSingle();
      if (error) return;
      if (data) {
        setGateDecision(data.decision);
        setGateRationale(data.rationale ?? '');
      } else {
        setGateDecision('pass');
        setGateRationale('');
      }
    })();
  }, [gateEmployeeId, gatePeriod]);

  const saveEpaOkrs = async () => {
    if (!epaOkrEmployeeId) {
      toast.error('Select an executive');
      return;
    }
    setEpaOkrBusy(true);
    try {
      for (let i = 0; i < 4; i++) {
        const slot = i + 1;
        const obj = epaOkrSlots[i].objective_text.trim();
        const kr = epaOkrSlots[i].key_result_text.trim();
        if (!obj && !kr) {
          await supabase
            .from('executive_period_okrs')
            .delete()
            .eq('employee_id', epaOkrEmployeeId)
            .eq('period', epaOkrPeriod)
            .eq('slot_index', slot);
          continue;
        }
        const { error } = await supabase.from('executive_period_okrs').upsert(
          {
            employee_id: epaOkrEmployeeId,
            period: epaOkrPeriod,
            slot_index: slot,
            objective_text: obj || '—',
            key_result_text: kr || null,
          },
          { onConflict: 'employee_id,period,slot_index' },
        );
        if (error) throw error;
      }
      toast.success('OKR wording saved for this executive and quarter');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not save OKRs');
    } finally {
      setEpaOkrBusy(false);
    }
  };

  const saveGateDecision = async () => {
    if (!gateEmployeeId) {
      toast.error('Select an executive');
      return;
    }
    const rationale = gateRationale.trim();
    if (rationale.length < 20) {
      toast.error('Rationale must be at least 20 characters (formal record).');
      return;
    }
    setGateBusy(true);
    try {
      const { error } = await supabase.rpc('upsert_assessment_gate_decision', {
        _employee_id: gateEmployeeId,
        _period: gatePeriod,
        _decision: gateDecision,
        _rationale: rationale,
      });
      if (error) throw error;
      toast.success('Gate decision recorded');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not save gate decision');
    } finally {
      setGateBusy(false);
    }
  };

  useEffect(() => {
    loadAllData();
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_responses' }, (payload) => {
        setResponses(prev => [payload.new as ResponseRow, ...prev]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_answers' }, (payload) => {
        setAnswers(prev => [...prev, payload.new as AnswerRow]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [resRes, ansRes, empRes, subRes, catRes, qRes, brRes, baRes, bfRes, bqRes, brelRes] = await Promise.all([
        supabase.from('survey_responses').select('*').order('created_at', { ascending: false }),
        supabase.from('survey_answers').select('*'),
        supabase.from('employees').select('*').order('name'),
        supabase.from('subsidiaries').select('*').order('name'),
        supabase.from('survey_categories').select('*').order('sort_order'),
        supabase.from('survey_questions').select('*').order('sort_order'),
        supabase.from('assessment_responses').select('*').order('created_at', { ascending: false }),
        supabase.from('assessment_answers').select('*'),
        supabase.from('assessment_forms').select('id, code, title'),
        supabase.from('assessment_questions').select('id, form_id, question_text'),
        supabase
          .from('assessment_period_releases')
          .select('id, form_id, period, released_at, released_by, note, assessment_forms(code, title)')
          .order('released_at', { ascending: false }),
      ]);
      if (resRes.data) setResponses(resRes.data);
      if (ansRes.data) setAnswers(ansRes.data);
      if (empRes.data) setEmployees(empRes.data);
      if (subRes.data) setSubsidiaries(subRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (qRes.data) setQuestions(qRes.data);
      if (brRes.data) setBoomResponses(brRes.data as BoomResponseRow[]);
      if (baRes.data) setBoomAnswers(baRes.data as BoomAnswerRow[]);
      if (bfRes.data) setBoomForms(bfRes.data as BoomFormRow[]);
      if (bqRes.data) setBoomQuestions(bqRes.data as BoomQuestionRow[]);
      if (brelRes.data) setBoomReleases(brelRes.data as BoomReleaseRow[]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.name || 'Unknown';
  const getSubsidiaryName = (id: string) => subsidiaries.find(s => s.id === id)?.name || 'Unknown';
  const getQuestionText = (id: string) => questions.find(q => q.id === id)?.question_text || '';
  const getBoomFormCode = (formId: string) => boomForms.find(f => f.id === formId)?.code ?? formId;
  const getBoomQuestionText = (questionId: string) => boomQuestions.find(q => q.id === questionId)?.question_text ?? '';

  const boomPeriods = useMemo(() => {
    const s = new Set(boomResponses.map(r => r.period));
    return [...s].sort().reverse();
  }, [boomResponses]);

  const filteredBoomResponses = useMemo(() => {
    if (boomPeriodFilter === 'all') return boomResponses;
    return boomResponses.filter(r => r.period === boomPeriodFilter);
  }, [boomResponses, boomPeriodFilter]);

  const exportBoomCsv = () => {
    const escapeCell = (v: string | number | boolean | null | undefined) => {
      const s = v === null || v === undefined ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ['period', 'form_code', 'status', 'reviewer_name', 'reviewee_name', 'question_text', 'score', 'no_opportunity', 'text_answer'].join(',');
    const lines = [header];
    for (const r of filteredBoomResponses) {
      const formCode = getBoomFormCode(r.form_id);
      const reviewer = getEmployeeName(r.reviewer_id);
      const reviewee = getEmployeeName(r.reviewee_id);
      const ansFor = boomAnswers.filter(a => a.response_id === r.id);
      if (ansFor.length === 0) {
        lines.push([r.period, formCode, r.status, reviewer, reviewee, '', '', '', ''].map(escapeCell).join(','));
      } else {
        for (const a of ansFor) {
          lines.push([
            r.period,
            formCode,
            r.status,
            reviewer,
            reviewee,
            getBoomQuestionText(a.question_id),
            a.score ?? '',
            a.no_opportunity ? 'yes' : 'no',
            a.text_answer ?? '',
          ].map(escapeCell).join(','));
        }
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `boom-assessments-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const peer360Periods = useMemo(() => {
    const s = new Set<string>();
    for (const r of boomResponses) {
      if (getBoomFormCode(r.form_id) === 'peer_360') s.add(r.period);
    }
    return [...s].sort().reverse();
  }, [boomResponses, boomForms]);

  const releasePeer360Results = async () => {
    const p = releasePeriodInput.trim();
    if (!p) {
      toast.error('Enter a period key (e.g. 2026-Q1) matching responses.');
      return;
    }
    setReleaseBusy(true);
    try {
      const { error } = await supabase.rpc('release_assessment_period', {
        _form_code: 'peer_360',
        _period: p,
        _note: releaseNoteInput.trim() || null,
      });
      if (error) throw error;
      toast.success(`Employees can now see aggregated 360 for ${p} (subject to minimum reviews).`);
      setReleaseNoteInput('');
      await loadAllData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Release failed');
    } finally {
      setReleaseBusy(false);
    }
  };

  const unreleasePeer360 = async (period: string) => {
    setReleaseBusy(true);
    try {
      const { error } = await supabase.rpc('unrelease_assessment_period', {
        _form_code: 'peer_360',
        _period: period,
      });
      if (error) throw error;
      toast.success(`Aggregate 360 hidden again for ${period}.`);
      await loadAllData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setReleaseBusy(false);
    }
  };

  const filteredResponses = useMemo(() => {
    let filtered = responses;
    if (selectedSubsidiary !== 'all') filtered = filtered.filter(r => r.subsidiary_id === selectedSubsidiary);
    if (selectedEmployee) filtered = filtered.filter(r => r.employee_id === selectedEmployee);
    return filtered;
  }, [responses, selectedSubsidiary, selectedEmployee]);

  const filteredResponseIds = useMemo(() => new Set(filteredResponses.map(r => r.id)), [filteredResponses]);
  const filteredAnswers = useMemo(() => answers.filter(a => filteredResponseIds.has(a.response_id)), [answers, filteredResponseIds]);

  const totalResponses = filteredResponses.length;
  const uniqueReviewees = new Set(filteredResponses.map(r => r.employee_id)).size;
  const totalEmployees = employees.length;
  const participationRate = totalEmployees > 0 ? Math.round((uniqueReviewees / totalEmployees) * 100) : 0;

  const avgOverallScore = useMemo(() => {
    const scored = filteredAnswers.filter(a => a.score !== null);
    if (scored.length === 0) return 0;
    return scored.reduce((sum, a) => sum + (a.score || 0), 0) / scored.length;
  }, [filteredAnswers]);

  // Subsidiary breakdown
  const subsidiaryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredResponses.forEach(r => {
      const name = getSubsidiaryName(r.subsidiary_id);
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filteredResponses, subsidiaries]);

  // Category averages
  const categoryAverages = useMemo(() => {
    const scoredCategories = categories.filter(c => c.sort_order < 8);
    return scoredCategories.map(cat => {
      const catQuestionIds = new Set(questions.filter(q => q.category_id === cat.id).map(q => q.id));
      const catAnswers = filteredAnswers.filter(a => catQuestionIds.has(a.question_id) && a.score !== null);
      const avg = catAnswers.length > 0 ? catAnswers.reduce((sum, a) => sum + (a.score || 0), 0) / catAnswers.length : 0;
      return { name: cat.name.split('&')[0].trim().substring(0, 18), fullName: cat.name, avg: parseFloat(avg.toFixed(2)), fullMark: 5 };
    });
  }, [filteredAnswers, categories, questions]);

  // Top employees
  const employeeLeaderboard = useMemo(() => {
    const counts: Record<string, { name: string; role: string; department: string; subsidiary: string; count: number; avgScore: number }> = {};
    filteredResponses.forEach(r => {
      const emp = employees.find(e => e.id === r.employee_id);
      if (!emp) return;
      if (!counts[r.employee_id]) {
        counts[r.employee_id] = {
          name: emp.name, role: emp.role || '', department: emp.department || '',
          subsidiary: getSubsidiaryName(emp.subsidiary_id), count: 0, avgScore: 0,
        };
      }
      counts[r.employee_id].count++;
    });
    Object.keys(counts).forEach(empId => {
      const empResponseIds = new Set(filteredResponses.filter(r => r.employee_id === empId).map(r => r.id));
      const empAnswers = answers.filter(a => empResponseIds.has(a.response_id) && a.score !== null);
      counts[empId].avgScore = empAnswers.length > 0
        ? parseFloat((empAnswers.reduce((s, a) => s + (a.score || 0), 0) / empAnswers.length).toFixed(2)) : 0;
    });
    let results = Object.values(counts).sort((a, b) => b.avgScore - a.avgScore);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(e => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q));
    }
    return results;
  }, [filteredResponses, employees, answers, searchQuery]);

  // Response timeline (last 7 days)
  const responseTimeline = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days[d.toISOString().split('T')[0]] = 0;
    }
    responses.forEach(r => {
      const day = r.created_at.split('T')[0];
      if (days[day] !== undefined) days[day]++;
    });
    return Object.entries(days).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
      responses: count,
    }));
  }, [responses]);

  // Score distribution
  const scoreDistribution = useMemo(() => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    filteredAnswers.forEach(a => { if (a.score && dist[a.score] !== undefined) dist[a.score]++; });
    return Object.entries(dist).map(([score, count]) => ({ score: `Score ${score}`, count }));
  }, [filteredAnswers]);

  // Department breakdown
  const departmentBreakdown = useMemo(() => {
    const deptCounts: Record<string, { responses: number; avgScore: number; scores: number[] }> = {};
    filteredResponses.forEach(r => {
      const emp = employees.find(e => e.id === r.employee_id);
      const dept = emp?.department || 'Unassigned';
      if (!deptCounts[dept]) deptCounts[dept] = { responses: 0, avgScore: 0, scores: [] };
      deptCounts[dept].responses++;
      const respAnswers = answers.filter(a => a.response_id === r.id && a.score !== null);
      respAnswers.forEach(a => deptCounts[dept].scores.push(a.score!));
    });
    return Object.entries(deptCounts).map(([dept, data]) => ({
      department: dept.substring(0, 20),
      responses: data.responses,
      avgScore: data.scores.length > 0 ? parseFloat((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(2)) : 0,
    })).sort((a, b) => b.responses - a.responses).slice(0, 12);
  }, [filteredResponses, employees, answers]);

  // AI data context
  const dataContext = useMemo(() => {
    if (boomMode) {
      const submitted = boomResponses.filter((r) => r.status === 'submitted');
      const byForm: Record<string, number> = {};
      for (const r of submitted) {
        const code = getBoomFormCode(r.form_id);
        byForm[code] = (byForm[code] ?? 0) + 1;
      }
      const formLines = Object.entries(byForm)
        .map(([code, n]) => `• ${code}: ${n} submitted`)
        .join('\n');
      const sample = submitted.slice(0, 30).map((r) =>
        `• ${r.period} | ${getBoomFormCode(r.form_id)} | ${getEmployeeName(r.reviewer_id)} → ${getEmployeeName(r.reviewee_id)}`,
      ).join('\n');
      const scored = boomAnswers.filter((a) => a.score != null && !a.no_opportunity);
      const avg =
        scored.length > 0
          ? (scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length).toFixed(2)
          : 'n/a';
      return `=== VGG EO BOOM APPRAISAL (PILOT) ===

SUMMARY:
• Assessment responses (all statuses): ${boomResponses.length}
• Submitted: ${submitted.length}
• Unique reviewees (submitted): ${new Set(submitted.map((r) => r.reviewee_id)).size}
• Average scored answer: ${avg}/5

BY FORM (submitted):
${formLines || '• None yet'}

SAMPLE SUBMISSIONS:
${sample || '• No submissions yet'}

NOTES:
• Peer 360 results are anonymous aggregates for recipients (no reviewer names).
• Forms: monthly_self, peer_360, ea_quarterly, executive (and related).`;
    }

    if (!responses.length) return '';
    const topEmployees = employeeLeaderboard.slice(0, 20).map(e =>
      `• ${e.name} (${e.subsidiary}${e.department ? ', ' + e.department : ''}): Score ${e.avgScore}/5, ${e.count} reviews`
    ).join('\n');

    const catData = categoryAverages.map(c => `• ${c.fullName}: ${c.avg}/5`).join('\n');
    const subData = subsidiaryBreakdown.map(s => `• ${s.name}: ${s.count} responses`).join('\n');
    const deptData = departmentBreakdown.map(d => `• ${d.department}: ${d.responses} responses, avg ${d.avgScore}/5`).join('\n');

    // Get open-ended feedback
    const textAnswers = answers.filter(a => a.text_answer).slice(0, 30);
    const feedbackSample = textAnswers.map(a => {
      const qText = getQuestionText(a.question_id);
      return `• [${qText}]: "${a.text_answer}"`;
    }).join('\n');

    return `=== VGG 360° APPRAISAL ANALYTICS ===

SUMMARY:
• Total Responses: ${totalResponses}
• People Reviewed: ${uniqueReviewees} of ${totalEmployees} employees
• Participation Rate: ${participationRate}%
• Organisation Average Score: ${avgOverallScore.toFixed(2)}/5.0

CATEGORY SCORES:
${catData}

TOP PERFORMERS:
${topEmployees}

RESPONSES BY SUBSIDIARY:
${subData}

RESPONSES BY DEPARTMENT:
${deptData}

SAMPLE QUALITATIVE FEEDBACK:
${feedbackSample || '• No text feedback yet'}`;
  }, [boomMode, boomResponses, boomAnswers, boomForms, employees, responses, employeeLeaderboard, categoryAverages, subsidiaryBreakdown, departmentBreakdown, answers, totalResponses, uniqueReviewees, totalEmployees, participationRate, avgOverallScore]);

  const boomSubmittedCount = useMemo(
    () => filteredBoomResponses.filter((r) => r.status === 'submitted').length,
    [filteredBoomResponses],
  );
  const boomUniqueReviewees = useMemo(
    () => new Set(filteredBoomResponses.filter((r) => r.status === 'submitted').map((r) => r.reviewee_id)).size,
    [filteredBoomResponses],
  );
  const boomUniqueReviewers = useMemo(
    () => new Set(filteredBoomResponses.filter((r) => r.status === 'submitted').map((r) => r.reviewer_id)).size,
    [filteredBoomResponses],
  );

  const filteredEmployees = useMemo(() => {
    if (selectedSubsidiary === 'all') return employees;
    return employees.filter(e => e.subsidiary_id === selectedSubsidiary);
  }, [employees, selectedSubsidiary]);

  const getResponseAnswers = (responseId: string) => answers.filter(a => a.response_id === responseId);

  const handleLogout = async () => {
    legacyLogout();
    await employeeLogout();
    navigate('/');
  };

  if (loading) {
    return <AppraisalAdminSkeleton />;
  }

  if (ghcMode) {
    return (
      <div className="app-page">
        <div className="app-page-grid" />
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="platform-canvas py-3 sm:py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
              <Button variant="ghost" size="sm" onClick={() => navigate('/hub?tab=survey')} className="gap-1 flex-shrink-0 self-start sm:self-auto">
                <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Hub</span>
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-primary">GHC Appraisal Monitor</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">GreenHouse Capital completion, releases, and partner actions</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
              <span className="text-xs">Sign Out</span>
            </Button>
          </div>
        </header>
        <main className="platform-content section-stack has-admin-mobile-nav">
          <GhcAdminMonitor periodQuarter={defaultQuarterPeriod()} periodMonth={defaultMonthPeriod()} />
        </main>
        <AdminMobileTabBar
          onOpenCopilot={() => setChatOpen(true)}
          onSignOut={() => void handleLogout()}
          onRefresh={() => loadAllData()}
        />
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-grid" />
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/85">
        <div className="platform-canvas py-3 sm:py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate(boomMode ? '/hub?tab=survey' : '/dashboard')} className="gap-1 flex-shrink-0 self-start sm:self-auto">
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">{boomMode ? 'Hub' : 'Dashboard'}</span><span className="sm:hidden">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-primary flex flex-wrap items-center gap-2">
                <span className="truncate">{boomMode ? `${tenant.branding.shortName} Appraisal Monitor` : '360° Appraisal Monitor'}</span>
                {(boomMode ? boomSubmittedCount > 0 : totalResponses > 0) && (
                  <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Live
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {boomMode
                  ? `${tenant.branding.fullName} completion tracking & analytics`
                  : 'Real-time response tracking & analytics'}
              </p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={loadAllData} className="gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
            {ENABLE_APP_AI && (
              <Button onClick={() => setChatOpen(true)} size="sm" className="gap-2 h-8 text-xs">
                <Brain className="w-3.5 h-3.5" /> Analytics assistant
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
              <span className="text-xs">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="platform-content section-stack has-admin-mobile-nav">
        {/* Filters — legacy multi-subsidiary only */}
        {!boomMode && (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center">
          <Select value={selectedSubsidiary} onValueChange={v => { setSelectedSubsidiary(v); setSelectedEmployee(null); }}>
            <SelectTrigger className="w-full sm:w-[200px] bg-secondary/50">
              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Subsidiaries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subsidiaries</SelectItem>
              {subsidiaries.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedEmployee || 'all'} onValueChange={v => setSelectedEmployee(v === 'all' ? null : v)}>
            <SelectTrigger className="w-full sm:w-[220px] bg-secondary/50">
              <Users className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {filteredEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(boomMode
            ? [
                { label: 'Submitted', value: boomSubmittedCount, icon: ClipboardCheck, color: 'bg-primary/10 text-primary' },
                { label: 'People reviewed', value: boomUniqueReviewees, icon: Users, color: 'bg-accent/10 text-accent' },
                { label: 'Reviewers active', value: boomUniqueReviewers, icon: Target, color: 'bg-muted text-foreground' },
                { label: `${tenant.branding.shortName} roster`, value: tenant.subsidiaryId ? employees.filter((e) => e.subsidiary_id === tenant.subsidiaryId).length || employees.length : employees.length, icon: Activity, color: 'bg-success/10 text-success' },
              ]
            : [
                { label: 'Total Responses', value: totalResponses, icon: ClipboardCheck, color: 'bg-primary/10 text-primary' },
                { label: 'People Reviewed', value: uniqueReviewees, icon: Users, color: 'bg-accent/10 text-accent' },
                { label: 'Total Employees', value: totalEmployees, icon: Target, color: 'bg-muted text-foreground' },
                { label: 'Participation', value: `${participationRate}%`, icon: Activity, color: 'bg-success/10 text-success' },
                { label: 'Avg Score', value: `${avgOverallScore.toFixed(2)}/5`, icon: TrendingUp, color: 'bg-primary/10 text-primary' },
              ]
          ).map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-panel p-4">
              <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-2`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {(boomMode ? boomResponses.length === 0 : totalResponses === 0 && boomResponses.length === 0) ? (
          <div className="glass-panel p-12 text-center">
            <ClipboardCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No responses yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {boomMode
                ? `${tenant.branding.shortName} assessments appear here as people submit monthly self, peer 360, and manager/leadership forms.`
                : 'Share the hub link for legacy subsidiary surveys, or complete BOOM assessments from the employee hub.'}
            </p>
            <Button onClick={() => { navigator.clipboard.writeText(window.location.origin + '/hub'); }} className="bg-primary hover:bg-primary/90">
              Copy hub link
            </Button>
          </div>
        ) : (
          <Tabs value={adminTab} onValueChange={setAdminTab}>
            {!boomMode && (
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 min-h-11 h-auto gap-1 py-1">
                  <TabsTrigger value="overview" className="text-xs gap-1.5"><BarChart3 className="w-3 h-3" /> Overview</TabsTrigger>
                  <TabsTrigger value="people" className="text-xs gap-1.5"><Users className="w-3 h-3" /> People</TabsTrigger>
                  <TabsTrigger value="trends" className="text-xs gap-1.5"><TrendingUp className="w-3 h-3" /> Trends</TabsTrigger>
                  <TabsTrigger value="feed" className="text-xs gap-1.5"><Clock className="w-3 h-3" /> Live Feed</TabsTrigger>
              <TabsTrigger value="boom" className="text-xs gap-1.5"><Layers className="w-3 h-3" /> BOOM</TabsTrigger>
            </TabsList>
            )}

            {/* ===== OVERVIEW TAB ===== */}
            <TabsContent value="overview" className="mt-4 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Subsidiary pie */}
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" /> Responses by Subsidiary
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={subsidiaryBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, count }) => `${name}: ${count}`} labelLine>
                        {subsidiaryBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Category radar */}
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-accent" /> Category Averages
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={categoryAverages}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 5]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Radar name="Average" dataKey="avg" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Score distribution */}
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> Score Distribution
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="score" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Department performance */}
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-accent" /> Department Performance
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={departmentBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis dataKey="department" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="avgScore" name="Avg Score" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            {/* ===== PEOPLE TAB ===== */}
            <TabsContent value="people" className="mt-4">
              <div className="glass-panel p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-primary" /> Employee Leaderboard
                  </h3>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search employees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 h-9 text-sm" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs">#</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs">Name</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs">Department</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs">Subsidiary</th>
                        <th className="text-center py-2 px-3 text-muted-foreground font-medium text-xs">Reviews</th>
                        <th className="text-center py-2 px-3 text-muted-foreground font-medium text-xs">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeLeaderboard.map((emp, i) => (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="border-b border-border/20 hover:bg-secondary/30 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            {i < 3 ? (
                              <span className={`text-sm ${i === 0 ? 'text-warning' : i === 1 ? 'text-muted-foreground' : 'text-primary'}`}>
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{i + 1}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div>
                              <span className="font-medium text-sm">{emp.name}</span>
                              {emp.role && <span className="block text-[10px] text-muted-foreground">{emp.role}</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground text-xs">{emp.department || '—'}</td>
                          <td className="py-2.5 px-3 text-muted-foreground text-xs">{emp.subsidiary}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge variant="secondary" className="text-[10px]">{emp.count}</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Star className="w-3 h-3 text-primary" />
                              <span className={`font-semibold text-sm ${
                                emp.avgScore >= 4 ? 'text-success' : emp.avgScore >= 3 ? 'text-primary' : emp.avgScore >= 2 ? 'text-warning' : 'text-destructive'
                              }`}>{emp.avgScore}</span>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ===== TRENDS TAB ===== */}
            <TabsContent value="trends" className="mt-4 space-y-6">
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Response Timeline (Last 7 Days)
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={responseTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="responses" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Subsidiary comparison bar */}
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold mb-4">Subsidiary Response Volume</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={subsidiaryBreakdown.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Category comparison detailed */}
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold mb-4">Category Score Breakdown</h3>
                  <div className="space-y-3">
                    {categoryAverages.map((cat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-[140px] truncate">{cat.fullName}</span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(cat.avg / 5) * 100}%` }}
                            transition={{ delay: i * 0.1, duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                        </div>
                        <span className="text-xs font-bold w-10 text-right">{cat.avg}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== LIVE FEED TAB ===== */}
            <TabsContent value="feed" className="mt-4">
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-accent" /> Recent Responses
                  <Badge variant="secondary" className="text-[10px]">{filteredResponses.length} total</Badge>
                </h3>
                <div className="space-y-2 max-h-[65vh] overflow-y-auto scrollbar-thin">
                  {filteredResponses.slice(0, 50).map(r => {
                    const isExpanded = expandedResponse === r.id;
                    const responseAnswers = isExpanded ? getResponseAnswers(r.id) : [];
                    return (
                      <div key={r.id} className="border border-border/30 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedResponse(isExpanded ? null : r.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <div>
                              <span className="font-medium text-sm">{getEmployeeName(r.employee_id)}</span>
                              <span className="text-muted-foreground text-xs ml-2">{getSubsidiaryName(r.subsidiary_id)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString()}
                            </span>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="border-t border-border/30 p-3 bg-secondary/10"
                          >
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {categories.filter(c => c.sort_order < 8).map(cat => {
                                const catQuestions = questions.filter(q => q.category_id === cat.id);
                                const catAnswered = responseAnswers.filter(a => catQuestions.some(q => q.id === a.question_id));
                                if (catAnswered.length === 0) return null;
                                const scored = catAnswered.filter(a => a.score);
                                const catAvg = scored.length > 0 ? scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length : 0;
                                return (
                                  <div key={cat.id} className="flex items-center justify-between py-1 text-xs">
                                    <span className="text-muted-foreground">{cat.name}</span>
                                    <span className={`font-semibold ${
                                      catAvg >= 4 ? 'text-success' : catAvg >= 3 ? 'text-primary' : catAvg >= 2 ? 'text-warning' : 'text-destructive'
                                    }`}>{catAvg.toFixed(1)}/5</span>
                                  </div>
                                );
                              })}
                              {responseAnswers.filter(a => a.text_answer).map(a => (
                                <div key={a.id} className="mt-2 p-2 rounded bg-secondary/20 text-xs">
                                  <p className="text-muted-foreground mb-1">{getQuestionText(a.question_id)}</p>
                                  <p className="text-foreground">{a.text_answer}</p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* ===== BOOM ASSESSMENTS TAB ===== */}
            <TabsContent value="boom" className="mt-4 space-y-4">
              {!boomMode && (
              <div className="glass-panel p-5 border-amber-500/20 bg-amber-500/[0.03]">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                    <Lock className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold">HR release — peer 360 aggregates</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Until you release a quarter, employees do <strong>not</strong> see the &quot;My 360 results&quot; chart
                      (raw peer rows were already hidden). Use the same period label as in responses (e.g.{' '}
                      <span className="font-mono">2026-Q1</span>). Revoke removes the release if you need to pull results
                      back.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                  <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</span>
                    <Input
                      placeholder="e.g. 2026-Q1"
                      value={releasePeriodInput}
                      onChange={(e) => setReleasePeriodInput(e.target.value)}
                      className="h-9 text-sm font-mono"
                    />
                    {peer360Periods.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {peer360Periods.slice(0, 8).map((p) => (
                          <Button
                            key={p}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] font-mono px-2"
                            onClick={() => setReleasePeriodInput(p)}
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Note (optional)</span>
                    <Input
                      placeholder="e.g. Approved by HR — pilot"
                      value={releaseNoteInput}
                      onChange={(e) => setReleaseNoteInput(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    className="h-9 gap-1.5 shrink-0"
                    disabled={releaseBusy}
                    onClick={() => void releasePeer360Results()}
                  >
                    <Unlock className="w-3.5 h-3.5" /> Release aggregates
                  </Button>
                </div>
                {boomReleases.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-border/60">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Active releases</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border/50">
                            <th className="pb-2 pr-3 font-medium">Form</th>
                            <th className="pb-2 pr-3 font-medium">Period</th>
                            <th className="pb-2 pr-3 font-medium">Released</th>
                            <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Note</th>
                            <th className="pb-2 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boomReleases.map((row) => (
                            <tr key={row.id} className="border-b border-border/30">
                              <td className="py-2 pr-3 font-mono">{row.assessment_forms?.code ?? '—'}</td>
                              <td className="py-2 pr-3 font-mono">{row.period}</td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {new Date(row.released_at).toLocaleString()}
                              </td>
                              <td className="py-2 pr-3 hidden sm:table-cell text-muted-foreground max-w-[200px] truncate">
                                {row.note ?? '—'}
                              </td>
                              <td className="py-2 text-right">
                                {(row.assessment_forms?.code === 'peer_360') && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px] text-destructive"
                                    disabled={releaseBusy}
                                    onClick={() => void unreleasePeer360(row.period)}
                                  >
                                    Revoke
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              )}

              {!boomMode && (
              <div className="glass-panel p-5 border-primary/15 space-y-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold">EPA — OKR wording &amp; formal gate</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      OKR objective / key-result text is injected into each executive&apos;s <strong>self</strong> EPA form
                      (Role-Specific OKRs section) for the selected quarter. The gate record is the PASS / CONCERN /
                      IMPROVEMENT REQUIRED decision visible to that executive in-app.
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">OKR text (4 slots)</p>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-muted-foreground">Executive</span>
                      <Select value={epaOkrEmployeeId || '__'} onValueChange={(v) => setEpaOkrEmployeeId(v === '__' ? '' : v)}>
                        <SelectTrigger className="h-9 text-xs bg-background">
                          <SelectValue placeholder="Select executive" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__" className="text-xs text-muted-foreground">
                            Select…
                          </SelectItem>
                          {executiveEmployees.map((e) => (
                            <SelectItem key={e.id} value={e.id} className="text-xs">
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-muted-foreground">Quarter</span>
                      <Select value={epaOkrPeriod} onValueChange={setEpaOkrPeriod}>
                        <SelectTrigger className="h-9 text-xs font-mono bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {quarterOptions().map((q) => (
                            <SelectItem key={q} value={q} className="text-xs font-mono">
                              {q}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
                      {epaOkrSlots.map((slot, idx) => (
                        <div key={idx} className="space-y-2 border-b border-border/40 pb-3 last:border-0">
                          <p className="text-[11px] font-medium text-foreground">OKR {idx + 1}</p>
                          <Textarea
                            placeholder="Objective"
                            value={slot.objective_text}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEpaOkrSlots((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], objective_text: v };
                                return next;
                              });
                            }}
                            className="min-h-[56px] text-xs"
                          />
                          <Textarea
                            placeholder="Key result (optional)"
                            value={slot.key_result_text}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEpaOkrSlots((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], key_result_text: v };
                                return next;
                              });
                            }}
                            className="min-h-[56px] text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full h-9"
                      disabled={epaOkrBusy || !epaOkrEmployeeId}
                      onClick={() => void saveEpaOkrs()}
                    >
                      {epaOkrBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null} Save OKR text
                    </Button>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Formal gate decision</p>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-muted-foreground">Executive</span>
                      <Select value={gateEmployeeId || '__'} onValueChange={(v) => setGateEmployeeId(v === '__' ? '' : v)}>
                        <SelectTrigger className="h-9 text-xs bg-background">
                          <SelectValue placeholder="Select executive" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__" className="text-xs text-muted-foreground">
                            Select…
                          </SelectItem>
                          {executiveEmployees.map((e) => (
                            <SelectItem key={e.id} value={e.id} className="text-xs">
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-muted-foreground">Quarter</span>
                      <Select value={gatePeriod} onValueChange={setGatePeriod}>
                        <SelectTrigger className="h-9 text-xs font-mono bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {quarterOptions().map((q) => (
                            <SelectItem key={q} value={q} className="text-xs font-mono">
                              {q}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-muted-foreground">Decision</span>
                      <Select value={gateDecision} onValueChange={setGateDecision}>
                        <SelectTrigger className="h-9 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pass" className="text-xs">
                            Pass
                          </SelectItem>
                          <SelectItem value="concern" className="text-xs">
                            Concern
                          </SelectItem>
                          <SelectItem value="improvement_required" className="text-xs">
                            Improvement required
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-muted-foreground">Rationale (min. 20 characters)</span>
                      <Textarea
                        value={gateRationale}
                        onChange={(e) => setGateRationale(e.target.value)}
                        placeholder="Joint / HR record — concise rationale for the executive file."
                        className="min-h-[120px] text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full h-9"
                      disabled={gateBusy || !gateEmployeeId}
                      onClick={() => void saveGateDecision()}
                    >
                      {gateBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null} Save gate decision
                    </Button>
                  </div>
                </div>
              </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" /> Executive Office assessments
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Responses from <code className="text-[10px]">assessment_responses</code> /{' '}
                    <code className="text-[10px]">assessment_answers</code>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Select value={boomPeriodFilter} onValueChange={setBoomPeriodFilter}>
                    <SelectTrigger className="w-[160px] h-9 bg-secondary/50 text-xs">
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All periods</SelectItem>
                      {boomPeriods.map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportBoomCsv} disabled={filteredBoomResponses.length === 0}>
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </Button>
                </div>
              </div>

              {filteredBoomResponses.length === 0 ? (
                <div className="glass-panel p-8 text-center text-sm text-muted-foreground">
                  No BOOM assessment responses for this filter.
                </div>
              ) : (
                <div className="glass-panel overflow-hidden">
                  <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10 border-b border-border">
                        <tr className="text-left text-[11px] text-muted-foreground">
                          <th className="py-2.5 px-3 font-medium">Period</th>
                          <th className="py-2.5 px-3 font-medium">Form</th>
                          <th className="py-2.5 px-3 font-medium">Reviewer</th>
                          <th className="py-2.5 px-3 font-medium">Reviewee</th>
                          <th className="py-2.5 px-3 font-medium">Status</th>
                          <th className="py-2.5 px-3 font-medium hidden lg:table-cell">Submitted</th>
                          <th className="py-2.5 px-3 font-medium text-right">Answers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBoomResponses.map((r) => {
                          const n = boomAnswers.filter((a) => a.response_id === r.id).length;
                          return (
                            <tr key={r.id} className="border-b border-border/40 hover:bg-secondary/20">
                              <td className="py-2.5 px-3 font-mono text-xs">{r.period}</td>
                              <td className="py-2.5 px-3 text-xs">{getBoomFormCode(r.form_id)}</td>
                              <td className="py-2.5 px-3">{getEmployeeName(r.reviewer_id)}</td>
                              <td className="py-2.5 px-3">{getEmployeeName(r.reviewee_id)}</td>
                              <td className="py-2.5 px-3">
                                <Badge variant={r.status === 'submitted' ? 'default' : 'secondary'} className="text-[10px]">
                                  {r.status}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-xs text-muted-foreground hidden lg:table-cell">
                                {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground text-xs">{n}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      {ENABLE_APP_AI && (
        <AIChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} dataContext={dataContext} />
      )}

      <AdminMobileTabBar
        onOpenCopilot={() => {
          if (ENABLE_APP_AI) setChatOpen(true);
        }}
        onSignOut={handleLogout}
        onRefresh={loadAllData}
      />
    </div>
  );
}
