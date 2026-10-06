import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Plus, Check, Trash2, Calendar, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
const sb = supabase as any;
import { toast } from 'sonner';

interface Plan {
  id: string;
  focus_area: string;
  goal: string;
  why_it_matters: string | null;
  target_date: string | null;
  status: string;
  progress_notes: string | null;
  created_at: string;
}

interface LearningPath {
  id: string;
  focus_area: string;
  title: string;
  status: string;
  goal_horizon_days: number;
  created_at: string;
}

interface Props {
  userId: string;
  growthAreas: string[];
  prefilledFocus?: string;
  prefilledGoal?: string;
  onClearPrefill?: () => void;
}

export default function DevelopmentPlans({ userId, growthAreas, prefilledFocus, prefilledGoal, onClearPrefill }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ focus_area: '', goal: '', why_it_matters: '', target_date: '' });

  useEffect(() => {
    void load();
  }, [userId]);

  useEffect(() => {
    if (prefilledFocus || prefilledGoal) {
      setForm(f => ({ ...f, focus_area: prefilledFocus || f.focus_area, goal: prefilledGoal || f.goal }));
      setShowForm(true);
    }
  }, [prefilledFocus, prefilledGoal]);

  const load = async () => {
    setLoading(true);
    const [{ data: plansData }, { data: pathsData }] = await Promise.all([
      supabase.from('development_plans').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      sb.from('learning_paths').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    setPlans((plansData as Plan[] | null) || []);
    setPaths(((pathsData as unknown) as LearningPath[]) || []);
    setLoading(false);
  };

  const reset = () => {
    setForm({ focus_area: '', goal: '', why_it_matters: '', target_date: '' });
    setShowForm(false);
    onClearPrefill?.();
  };

  const create = async () => {
    if (!form.focus_area.trim() || !form.goal.trim()) {
      toast.error('Pick a focus area and write a goal.');
      return;
    }
    const activeCount = plans.filter(p => p.status === 'active').length;
    if (activeCount >= 2) {
      toast.error('Limit yourself to 2 active goals — research shows more dilutes follow-through.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('development_plans').insert({
      user_id: userId,
      focus_area: form.focus_area.trim().slice(0, 100),
      goal: form.goal.trim().slice(0, 500),
      why_it_matters: form.why_it_matters.trim().slice(0, 500) || null,
      target_date: form.target_date || null,
    });
    if (!error) {
      await sb.from('learning_paths').insert({
        user_id: userId,
        focus_area: form.focus_area.trim().slice(0, 100),
        title: form.goal.trim().slice(0, 180),
        goal_horizon_days: 28,
        status: 'active',
        pipeline_version: 'v2',
      });
    }
    setSubmitting(false);
    if (error) { toast.error('Could not create plan'); return; }
    toast.success('Goal saved and synced to your learning path.');
    reset();
    void load();
  };

  const complete = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    await supabase.from('development_plans').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    if (plan?.focus_area) {
      await sb
        .from('learning_paths')
        .update({ status: 'completed' })
        .eq('user_id', userId)
        .eq('focus_area', plan.focus_area)
        .eq('status', 'active');
    }
    toast.success('Goal marked complete 🎉');
    void load();
  };

  const archive = async (id: string) => {
    await supabase.from('development_plans').delete().eq('id', id);
    void load();
  };

  const active = plans.filter(p => p.status === 'active');
  const done = plans.filter(p => p.status === 'completed');

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> My Growth Goals</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Commit to 1–2 goals at a time. We'll nudge you in 60 days.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(s => !s)} disabled={active.length >= 2 && !showForm} className="h-7 text-[11px]">
          <Plus className="w-3 h-3 mr-1" /> Add goal
        </Button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
            <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium">New goal</span>
                <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
              <select
                value={form.focus_area}
                onChange={(e) => setForm(f => ({ ...f, focus_area: e.target.value }))}
                className="w-full text-xs px-2.5 py-2 rounded-md border border-border bg-background"
              >
                <option value="">Pick a focus area…</option>
                {growthAreas.map(a => <option key={a} value={a}>{a}</option>)}
                {form.focus_area && !growthAreas.includes(form.focus_area) && <option value={form.focus_area}>{form.focus_area}</option>}
              </select>
              <Textarea placeholder="What specifically will you do? (e.g. 'Run a 1:1 with each report monthly to give direct feedback')" value={form.goal} onChange={(e) => setForm(f => ({ ...f, goal: e.target.value }))} className="min-h-[60px] text-xs resize-none" />
              <Textarea placeholder="Why does this matter to you? (optional)" value={form.why_it_matters} onChange={(e) => setForm(f => ({ ...f, why_it_matters: e.target.value }))} className="min-h-[44px] text-xs resize-none" />
              <Input type="date" value={form.target_date} onChange={(e) => setForm(f => ({ ...f, target_date: e.target.value }))} className="h-8 text-xs" />
              <Button size="sm" onClick={create} disabled={submitting} className="w-full h-7 text-[11px]">
                {submitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />} Commit
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : active.length === 0 && done.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No goals yet. Pick your weakest area above and turn it into one specific commitment.
        </div>
      ) : (
        <div className="space-y-2">
          {paths.filter((p) => p.status === 'active').length > 0 && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
              <p className="mb-2 text-sm font-medium text-teal-800">Active learning paths</p>
              <div className="space-y-1.5">
                {paths
                  .filter((p) => p.status === 'active')
                  .slice(0, 3)
                  .map((path) => (
                    <div key={path.id} className="flex items-center justify-between rounded-lg bg-card/60 px-2 py-1.5">
                      <span className="text-[11px]">{path.focus_area}: {path.title}</span>
                      <Badge variant="outline" className="h-5 text-[9px]">{path.goal_horizon_days}d</Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <AnimatePresence>
            {active.map(p => (
              <motion.div key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-3 rounded-xl border-l-4 border-l-primary bg-card/40 border border-border/40">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-teal-800">{p.focus_area}</span>
                  <div className="flex gap-1">
                    <button onClick={() => complete(p.id)} className="text-emerald-600 hover:bg-emerald-500/10 p-1 rounded" title="Mark complete"><Check className="w-3 h-3" /></button>
                    <button onClick={() => archive(p.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded" title="Archive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <p className="text-xs font-medium text-foreground leading-snug">{p.goal}</p>
                {p.why_it_matters && <p className="text-[10px] text-muted-foreground italic mt-1">"{p.why_it_matters}"</p>}
                {p.target_date && <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> Target: {new Date(p.target_date).toLocaleDateString()}</p>}
              </motion.div>
            ))}
          </AnimatePresence>
          {done.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">Completed ({done.length})</summary>
              <div className="space-y-1.5 mt-2">
                {done.map(p => (
                  <div key={p.id} className="p-2 rounded-lg bg-muted/30 text-[11px] text-muted-foreground line-through">
                    {p.focus_area}: {p.goal}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
