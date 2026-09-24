import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Send, Save, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  EPA_ASSESSOR_SCALE,
  epaAnchorForSortOrder,
  epaQuestionNumFromSortOrder,
} from '@/lib/epaAssessorAnchors';
import BoomRatingScaleTable from './BoomRatingScaleTable';

type QuestionRow = {
  id: string;
  section: string;
  section_order: number;
  sort_order: number;
  question_text: string;
  question_type: string;
  min_words: number | null;
  helper_text: string | null;
  audience: string | null;
};

type FormRow = {
  id: string;
  code: string;
  title: string;
  scale_min: number;
  scale_max: number;
  allows_no_opportunity: boolean;
};

const SCALE = [
  { value: 5, label: 'Strongly agree / Most likely' },
  { value: 4, label: 'Agree / Likely' },
  { value: 3, label: 'Neutral' },
  { value: 2, label: 'Disagree / Unlikely' },
  { value: 1, label: 'Strongly disagree / Least likely' },
];

export interface ExecutiveAssessorRunnerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Submitted executive self assessment_responses.id */
  selfResponseId: string;
  revieweeName: string;
  period: string;
  reviewerEmployeeId: string;
  reviewerHierarchyLevel: number | null;
  /** GCEO assessor layer (EPA v2) vs legacy assessor UI */
  variant?: 'default' | 'gceo';
  onCompleted?: () => void;
}

export default function ExecutiveAssessorRunner({
  open,
  onOpenChange,
  selfResponseId,
  revieweeName,
  period,
  reviewerEmployeeId,
  reviewerHierarchyLevel,
  variant = 'gceo',
  onCompleted,
}: ExecutiveAssessorRunnerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selfByQuestion, setSelfByQuestion] = useState<Record<string, { score?: number; text?: string }>>({});
  const [assessorReviewId, setAssessorReviewId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>('draft');
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [draftCommentary, setDraftCommentary] = useState<Record<string, string>>({});

  const activeScale = variant === 'gceo' ? EPA_ASSESSOR_SCALE : SCALE;

  const visibleQuestions = useMemo(() => {
    const level = reviewerHierarchyLevel ?? 99;
    return questions.filter((q) => {
      if (q.audience === 'manager_only') return level <= 2;
      return true;
    });
  }, [questions, reviewerHierarchyLevel]);

  const sections = useMemo(() => {
    const map = new Map<number, { title: string; order: number; qs: QuestionRow[] }>();
    for (const q of visibleQuestions) {
      const o = q.section_order;
      if (!map.has(o)) map.set(o, { title: q.section, order: o, qs: [] });
      map.get(o)!.qs.push(q);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [visibleQuestions]);

  const scoredQuestions = useMemo(
    () => visibleQuestions.filter((q) => q.question_type === 'scored'),
    [visibleQuestions],
  );

  const load = useCallback(async () => {
    if (!open || !reviewerEmployeeId || !selfResponseId) return;
    setLoading(true);
    try {
      const { data: formRow, error: fe } = await supabase
        .from('assessment_forms')
        .select('id, code, title, scale_min, scale_max, allows_no_opportunity')
        .eq('code', 'executive')
        .maybeSingle();
      if (fe || !formRow) {
        toast.error('Could not load executive form');
        return;
      }
      setForm(formRow as FormRow);

      const { data: qRows, error: qe } = await supabase
        .from('assessment_questions')
        .select('*')
        .eq('form_id', formRow.id)
        .eq('is_active', true)
        .order('section_order', { ascending: true })
        .order('sort_order', { ascending: true });
      if (qe) {
        toast.error('Could not load questions');
        return;
      }
      setQuestions((qRows ?? []) as QuestionRow[]);

      const { data: selfAns, error: sae } = await supabase
        .from('assessment_answers')
        .select('question_id, score, text_answer')
        .eq('response_id', selfResponseId);
      if (sae) {
        toast.error('Could not load executive self responses');
        return;
      }
      const selfMap: Record<string, { score?: number; text?: string }> = {};
      (selfAns ?? []).forEach((a) => {
        selfMap[a.question_id] = {
          score: a.score ?? undefined,
          text: a.text_answer ?? undefined,
        };
      });
      setSelfByQuestion(selfMap);

      let { data: rev, error: re } = await supabase
        .from('assessment_assessor_reviews')
        .select('id, status')
        .eq('self_response_id', selfResponseId)
        .eq('assessor_employee_id', reviewerEmployeeId)
        .maybeSingle();

      if (re) {
        toast.error(re.message || 'Could not load assessor review');
        return;
      }

      if (!rev) {
        const { data: ins, error: ie } = await supabase
          .from('assessment_assessor_reviews')
          .insert({
            self_response_id: selfResponseId,
            assessor_employee_id: reviewerEmployeeId,
            status: 'draft',
          })
          .select('id, status')
          .single();
        if (ie) {
          toast.error(ie.message || 'Could not start assessor review');
          return;
        }
        rev = ins;
      }

      setAssessorReviewId(rev.id);
      setReviewStatus(rev.status);

      const { data: ratings, error: rte } = await supabase
        .from('assessment_assessor_ratings')
        .select('question_id, score, commentary')
        .eq('assessor_review_id', rev.id);
      if (rte) {
        toast.error('Could not load your scores');
        return;
      }
      const sc: Record<string, number> = {};
      const cm: Record<string, string> = {};
      (ratings ?? []).forEach((r) => {
        sc[r.question_id] = r.score;
        if (r.commentary) cm[r.question_id] = r.commentary;
      });
      setDraftScores(sc);
      setDraftCommentary(cm);
    } finally {
      setLoading(false);
    }
  }, [open, reviewerEmployeeId, selfResponseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = reviewStatus === 'submitted';

  const persistRatings = async (
    rows: { question_id: string; score: number; commentary?: string | null }[],
  ) => {
    if (!assessorReviewId || !rows.length) return;
    const { error } = await supabase.from('assessment_assessor_ratings').upsert(
      rows.map((r) => ({
        assessor_review_id: assessorReviewId,
        question_id: r.question_id,
        score: r.score,
        commentary: r.commentary?.trim() || null,
      })),
      { onConflict: 'assessor_review_id,question_id' },
    );
    if (error) throw error;
  };

  const handleSaveDraft = async () => {
    if (!assessorReviewId || readOnly) return;
    const rows = scoredQuestions
      .map((q) => {
        const s = draftScores[q.id];
        return s !== undefined
          ? {
              question_id: q.id,
              score: s,
              commentary: draftCommentary[q.id] ?? null,
            }
          : null;
      })
      .filter((x): x is { question_id: string; score: number; commentary: string | null } => x !== null);
    if (!rows.length) {
      toast.message('No scores to save yet');
      return;
    }
    setSaving(true);
    try {
      await persistRatings(rows);
      toast.success('Saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const validate = (): string | null => {
    for (const q of scoredQuestions) {
      const s = draftScores[q.id];
      if (s === undefined || s === null) {
        return `Please score: ${q.question_text.slice(0, 60)}…`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!assessorReviewId || readOnly) return;
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const rows = scoredQuestions.map((q) => ({
        question_id: q.id,
        score: draftScores[q.id]!,
        commentary: draftCommentary[q.id] ?? null,
      }));
      await persistRatings(rows);
      const { error } = await supabase
        .from('assessment_assessor_reviews')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', assessorReviewId)
        .eq('status', 'draft');
      if (error) throw error;
      setReviewStatus('submitted');
      toast.success('Assessor scores submitted');
      onCompleted?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const answeredScored = useMemo(() => {
    let n = 0;
    for (const q of scoredQuestions) {
      if (draftScores[q.id] !== undefined && draftScores[q.id] !== null) n++;
    }
    return n;
  }, [draftScores, scoredQuestions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-3xl max-h-[92vh] overflow-y-auto gap-0 p-0 sm:rounded-xl',
          'translate-y-[-48%] top-[48%]',
        )}
      >
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/30">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
            <DialogTitle className="text-lg">
              {variant === 'gceo'
                ? 'Executive Performance Assessment — GCEO assessor'
                : 'EPA assessor scores'}
            </DialogTitle>
            <Badge variant="outline" className="text-[10px] font-normal shrink-0">
              Independent rating
            </Badge>
          </div>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground pt-1">
              <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
                <span>Executive self from</span>
                <strong className="text-foreground">{revieweeName}</strong>
                <span className="text-muted-foreground">· {period}</span>
              </span>
              <p className="text-[11px] mt-2 leading-relaxed">
                {variant === 'gceo' ? (
                  <>
                    BOOM-EPA v2 assessor layer. Read the executive&apos;s narratives (white sections), then use the
                    behavioural anchors below to score each item. Your scores and commentary are stored separately and
                    are not shown to the reviewee.
                  </>
                ) : (
                  <>
                    Narratives below are the executive’s submission (read only). Enter your 1–5 scores on each scored
                    item; they are stored separately from the self assessment.
                  </>
                )}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !form ? (
          <p className="p-6 text-sm text-muted-foreground">Form unavailable.</p>
        ) : (
          <div className="p-6 space-y-8">
            {variant === 'gceo' && (
              <BoomRatingScaleTable title="Rating scale — applies to all GCEO assessor ratings" />
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{answeredScored}</span> / {scoredQuestions.length}{' '}
                scored items
                {!readOnly && scoredQuestions.length > 0 && (
                  <span className="hidden sm:inline"> · Complete all before submitting</span>
                )}
              </p>
              {!readOnly && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">Scale:</span>
                  {activeScale.slice(0, 3).map((s) => (
                    <span key={s.value}>
                      <strong className="text-foreground">{s.value}</strong> {s.short ?? s.label}
                    </span>
                  ))}
                  <span>…</span>
                </div>
              )}
            </div>
            {readOnly && (
              <p className="text-xs text-muted-foreground -mt-2">Submitted — read only</p>
            )}

            {sections.map((sec) => (
              <div key={sec.order}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-primary">{sec.title}</h3>
                  {sec.qs.some((q) => q.audience === 'manager_only') && (
                    <Badge variant="secondary" className="text-[9px] gap-1 font-normal">
                      <Shield className="h-3 w-3" />
                      Managers / executives
                    </Badge>
                  )}
                </div>
                <div className="space-y-6">
                  {sec.qs.map((q) => {
                    const self = selfByQuestion[q.id];
                    if (q.question_type === 'scored') {
                      const writtenQ = sec.qs.find(
                        (w) => w.question_type === 'written' && w.sort_order === q.sort_order + 1,
                      );
                      const narrative = writtenQ ? (selfByQuestion[writtenQ.id]?.text ?? '').trim() : '';
                      const anchor =
                        variant === 'gceo' ? epaAnchorForSortOrder(q.sort_order) : undefined;
                      const qNum =
                        variant === 'gceo' ? epaQuestionNumFromSortOrder(q.sort_order) : null;
                      return (
                        <div
                          key={q.id}
                          className="rounded-2xl border border-border/70 bg-card/50 p-4 space-y-3"
                        >
                          {qNum != null && (
                            <Badge variant="outline" className="text-[9px] font-mono">
                              Q{qNum}
                            </Badge>
                          )}
                          <p className="text-sm font-medium leading-relaxed">{q.question_text}</p>
                          {writtenQ && (
                            <p className="text-sm text-foreground/90 leading-relaxed border-l-2 border-border pl-3">
                              {writtenQ.question_text}
                            </p>
                          )}
                          {narrative ? (
                            <Textarea
                              readOnly
                              value={narrative}
                              className="min-h-[100px] text-sm bg-background/50"
                            />
                          ) : (
                            <p className="text-[11px] text-amber-700 bg-amber-500/10 rounded-lg px-3 py-2">
                              Executive narrative not submitted yet for this question.
                            </p>
                          )}
                          {q.helper_text && (
                            <p className="text-[11px] text-muted-foreground">{q.helper_text}</p>
                          )}
                          {self?.score != null && (
                            <p className="text-[11px] text-muted-foreground">
                              Executive self-rating:{' '}
                              <strong className="text-foreground">{self.score}</strong>
                              {draftScores[q.id] != null && (
                                <>
                                  {' '}
                                  · Gap:{' '}
                                  <strong
                                    className={
                                      draftScores[q.id]! - self.score < 0
                                        ? 'text-amber-700'
                                        : 'text-foreground'
                                    }
                                  >
                                    {(draftScores[q.id]! - self.score).toFixed(0)}
                                  </strong>
                                </>
                              )}
                            </p>
                          )}
                          {anchor && (
                            <div className="rounded-xl border-2 border-emerald-600/30 bg-emerald-500/5 p-3 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                Assessor view — behavioural anchors
                              </p>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {anchor.measuring}
                              </p>
                              <div className="space-y-1.5">
                                {anchor.anchors.map((a) => (
                                  <p key={a.score} className="text-[10px] leading-snug">
                                    <strong>
                                      {a.score} — {a.label}:
                                    </strong>{' '}
                                    {a.lookFor}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {activeScale.map((s) => (
                              <button
                                key={s.value}
                                type="button"
                                disabled={readOnly}
                                onClick={() => {
                                  if (readOnly) return;
                                  setDraftScores((prev) => ({ ...prev, [q.id]: s.value }));
                                }}
                                className={cn(
                                  'flex-1 min-w-[52px] rounded-xl border-2 py-2 px-1 text-center transition-all text-xs flex flex-col items-center justify-center gap-0.5',
                                  draftScores[q.id] === s.value
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background hover:border-primary/40',
                                )}
                              >
                                <span className="font-bold">{s.value}</span>
                                <span className="hidden sm:block text-[8px] opacity-80 leading-tight max-w-[4.5rem] line-clamp-2">
                                  {'short' in s && s.short ? s.short : s.label}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">
                            GCEO comment and rating
                          </p>
                          {variant === 'gceo' && (
                            <Textarea
                              placeholder="GCEO comment — engage with what the executive wrote; note inflation or underestimation."
                              value={draftCommentary[q.id] ?? ''}
                              readOnly={readOnly}
                              onChange={(e) =>
                                setDraftCommentary((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              className="min-h-[72px] text-sm"
                            />
                          )}
                        </div>
                      );
                    }
                    if (q.question_type === 'written') {
                      const prevScored = sec.qs.find(
                        (s) => s.question_type === 'scored' && s.sort_order === q.sort_order - 1,
                      );
                      if (prevScored) return null;
                    }
                    const narrative = (self?.text ?? '').trim();
                    if (!narrative) return null;
                    return (
                      <div
                        key={q.id}
                        className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-4 space-y-2"
                      >
                        <p className="text-sm font-medium leading-relaxed">{q.question_text}</p>
                        <Textarea
                          readOnly
                          value={narrative}
                          className="min-h-[80px] text-sm bg-background/50"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {!readOnly && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void handleSaveDraft()}
                    className="gap-1.5"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSubmit()}
                    className="gap-1.5"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
