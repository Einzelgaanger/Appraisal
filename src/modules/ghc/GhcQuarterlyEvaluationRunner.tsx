import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { computeGhcScore, GHC_EVAL_INDICATORS, GHC_SCALE_0_5 } from './ghcConstants';
import { ghcGetQuarterlyEvaluation, ghcUpsertQuarterlyEvaluation, type GhcTaskRow } from './ghcApi';

type Goal = { area: string; goal: string; indicator: string; timeline: string; reviewer: string };

const scoreField: Record<string, string> = {
  technical: 'score_technical',
  founders_lps: 'score_founders_lps',
  curious: 'score_curious',
  move_fast: 'score_move_fast',
  overachievement: 'score_overachievement',
  job_done: 'score_job_done',
  growth: 'score_growth',
};

const commentField: Record<string, string> = {
  technical: 'comment_technical',
  founders_lps: 'comment_founders_lps',
  curious: 'comment_curious',
  move_fast: 'comment_move_fast',
  overachievement: 'comment_overachievement',
  job_done: 'comment_job_done',
  growth: 'comment_growth',
};

export default function GhcQuarterlyEvaluationRunner({
  open,
  onOpenChange,
  task,
  managerEmployeeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: GhcTaskRow;
  managerEmployeeId: string;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(task.record_id);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [strengths, setStrengths] = useState(['', '', '', '', '']);
  const [improvements, setImprovements] = useState(['', '', '', '', '']);
  const [goals, setGoals] = useState<Goal[]>([
    { area: '', goal: '', indicator: '', timeline: '', reviewer: '' },
    { area: '', goal: '', indicator: '', timeline: '', reviewer: '' },
    { area: '', goal: '', indicator: '', timeline: '', reviewer: '' },
  ]);

  useEffect(() => {
    if (!open) return;
    setScores({});
    setComments({});
    setStrengths(['', '', '', '', '']);
    setImprovements(['', '', '', '', '']);
    setRecordId(task.record_id);
    if (!task.record_id) return;
    void ghcGetQuarterlyEvaluation(task.record_id).then((row) => {
      if (!row) return;
      const nextScores: Record<string, number> = {};
      const nextComments: Record<string, string> = {};
      for (const ind of GHC_EVAL_INDICATORS) {
        nextScores[ind.key] = row[scoreField[ind.key]] ?? 0;
        nextComments[ind.key] = row[commentField[ind.key]] ?? '';
      }
      setScores(nextScores);
      setComments(nextComments);
      setStrengths([...(row.strengths ?? []), '', '', '', '', ''].slice(0, 5));
      setImprovements([...(row.improvements ?? []), '', '', '', '', ''].slice(0, 5));
      if (Array.isArray(row.improvement_goals) && row.improvement_goals.length) {
        setGoals(row.improvement_goals as Goal[]);
      }
    });
  }, [open, task.record_id]);

  const computed = useMemo(() => {
    const cultureSum =
      (scores.founders_lps || 0) +
      (scores.curious || 0) +
      (scores.move_fast || 0) +
      (scores.overachievement || 0) +
      (scores.job_done || 0);
    return computeGhcScore({
      cultureSum,
      technical: scores.technical || 0,
      growth: scores.growth || 0,
    });
  }, [scores]);

  const save = async (status: 'draft' | 'submitted') => {
    if (status === 'submitted') {
      for (const ind of GHC_EVAL_INDICATORS) {
        if (scores[ind.key] == null) {
          toast.error(`Rate: ${ind.label}`);
          return;
        }
      }
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        id: recordId,
        manager_id: managerEmployeeId,
        employee_id: task.subject_id,
        period: task.period,
        review_type: task.period.includes('Q') ? task.period.slice(-2) : 'Q1',
        status,
        strengths: strengths.filter((s) => s.trim()),
        improvements: improvements.filter((s) => s.trim()),
        improvement_goals: goals.filter((g) => g.area || g.goal),
      };
      for (const ind of GHC_EVAL_INDICATORS) {
        payload[scoreField[ind.key]] = scores[ind.key] ?? 0;
        payload[commentField[ind.key]] = comments[ind.key] ?? '';
      }
      const id = await ghcUpsertQuarterlyEvaluation(payload);
      setRecordId(id);
      toast.success(status === 'submitted' ? 'Evaluation submitted' : 'Draft saved');
      if (status === 'submitted') onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quarterly evaluation — {task.subject_name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Formal GreenHouse Capital performance evaluation for {task.period}. Ratings 0–5 with supervisor comments.
        </p>

        <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
          Live score: <strong>{computed.total}</strong>/35 ({computed.pct}%) — {computed.band.label}
        </div>

        <div className="space-y-4 py-2">
          {GHC_EVAL_INDICATORS.map((ind) => (
            <div key={ind.key} className="space-y-2 rounded-xl border border-border/60 p-3">
              <Label className="text-sm font-medium">{ind.label}</Label>
              <p className="text-[11px] text-muted-foreground">{ind.detail}</p>
              <div className="flex flex-wrap gap-2">
                {GHC_SCALE_0_5.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    size="sm"
                    variant={scores[ind.key] === s.value ? 'default' : 'outline'}
                    className="h-8 px-2 text-[10px]"
                    title={s.label}
                    onClick={() => setScores((prev) => ({ ...prev, [ind.key]: s.value }))}
                  >
                    {s.value}
                  </Button>
                ))}
              </div>
              <Textarea
                placeholder="Supervisor comments"
                value={comments[ind.key] || ''}
                onChange={(e) => setComments((prev) => ({ ...prev, [ind.key]: e.target.value }))}
                rows={2}
              />
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Areas of strength</Label>
              {strengths.map((s, i) => (
                <Input key={i} value={s} placeholder={`${i + 1}.`} onChange={(e) => {
                  const next = [...strengths];
                  next[i] = e.target.value;
                  setStrengths(next);
                }} />
              ))}
            </div>
            <div className="space-y-2">
              <Label>Areas of improvement</Label>
              {improvements.map((s, i) => (
                <Input key={i} value={s} placeholder={`${i + 1}.`} onChange={(e) => {
                  const next = [...improvements];
                  next[i] = e.target.value;
                  setImprovements(next);
                }} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Performance improvement goals & timeline</Label>
            {goals.map((g, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border/50 p-3 sm:grid-cols-2">
                <Input placeholder="Area of improvement" value={g.area} onChange={(e) => {
                  const next = [...goals]; next[i] = { ...g, area: e.target.value }; setGoals(next);
                }} />
                <Input placeholder="Goal" value={g.goal} onChange={(e) => {
                  const next = [...goals]; next[i] = { ...g, goal: e.target.value }; setGoals(next);
                }} />
                <Input placeholder="Performance indicator" value={g.indicator} onChange={(e) => {
                  const next = [...goals]; next[i] = { ...g, indicator: e.target.value }; setGoals(next);
                }} />
                <Input placeholder="Timeline" value={g.timeline} onChange={(e) => {
                  const next = [...goals]; next[i] = { ...g, timeline: e.target.value }; setGoals(next);
                }} />
                <Input className="sm:col-span-2" placeholder="Reviewer" value={g.reviewer} onChange={(e) => {
                  const next = [...goals]; next[i] = { ...g, reviewer: e.target.value }; setGoals(next);
                }} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" disabled={busy} onClick={() => void save('draft')}>Save draft</Button>
          <Button disabled={busy} onClick={() => void save('submitted')}>Submit to employee</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
