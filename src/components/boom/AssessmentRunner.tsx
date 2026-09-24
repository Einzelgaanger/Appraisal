import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { BOOM_RATING_SCALE } from '@/lib/boomRatingScale';
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

export interface AssessmentRunnerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formCode: string;
  formTitle: string;
  revieweeId: string;
  revieweeName: string;
  /** Period stored on assessment_responses — quarterly key or monthly key depending on form */
  period: string;
  reviewerEmployeeId: string;
  /** Hide manager_only peer questions when viewer is IC (hierarchy_level > 2) */
  reviewerHierarchyLevel: number | null;
  /** Shown under the title, e.g. "Executive leadership" */
  reviewerRoleSummary?: string | null;
  anonymous?: boolean;
  onCompleted?: () => void;
}

/** Legacy Likert — monthly self only. */
const MONTHLY_LIKERT_SCALE = [
  { value: 5, label: 'Strongly agree / Most likely' },
  { value: 4, label: 'Agree / Likely' },
  { value: 3, label: 'Neutral' },
  { value: 2, label: 'Disagree / Unlikely' },
  { value: 1, label: 'Strongly disagree / Least likely' },
];

const BOOM_SCALE_BUTTONS = BOOM_RATING_SCALE.map((r) => ({
  value: r.value,
  label: r.label,
  short: r.short,
}));

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Executive form pairs: narrative (written) then self-rating (scored). */
function sortExecutiveSectionQuestions(qs: QuestionRow[]): QuestionRow[] {
  return [...qs].sort((a, b) => {
    const pairA = Math.floor((a.sort_order - 1) / 2);
    const pairB = Math.floor((b.sort_order - 1) / 2);
    if (pairA !== pairB) return pairA - pairB;
    const typeRank = (q: QuestionRow) =>
      q.question_type === 'written' || q.question_type === 'value_example' ? 0 : 1;
    const byType = typeRank(a) - typeRank(b);
    if (byType !== 0) return byType;
    return a.sort_order - b.sort_order;
  });
}

export default function AssessmentRunner({
  open,
  onOpenChange,
  formCode,
  formTitle,
  revieweeId,
  revieweeName,
  period,
  reviewerEmployeeId,
  reviewerHierarchyLevel,
  reviewerRoleSummary,
  anonymous,
  onCompleted,
}: AssessmentRunnerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<string>('draft');
  const [draft, setDraft] = useState<Record<string, { score?: number; text?: string; no_opportunity?: boolean }>>({});
  const [okrRows, setOkrRows] = useState<{ slot_index: number; objective_text: string; key_result_text: string | null }[]>(
    [],
  );

  const visibleQuestions = useMemo(() => {
    const level = reviewerHierarchyLevel ?? 99;
    return questions.filter((q) => {
      if (q.audience === 'manager_only') return level <= 2;
      return true;
    });
  }, [questions, reviewerHierarchyLevel]);

  /** Injected OKR wording for executive self only (slots maintained in admin). */
  const questionsForDisplay = useMemo(() => {
    if (formCode !== 'executive' || revieweeId !== reviewerEmployeeId || okrRows.length === 0) {
      return visibleQuestions;
    }
    const bySlot = new Map(okrRows.map((r) => [r.slot_index, r]));
    return visibleQuestions.map((q) => {
      if (q.section !== 'Role-Specific OKRs' || q.sort_order < 1 || q.sort_order > 8) return q;
      const slot = Math.ceil(q.sort_order / 2);
      const row = bySlot.get(slot);
      if (!row) return q;
      const obj = row.objective_text?.trim();
      const kr = row.key_result_text?.trim();
      if (!obj && !kr) return q;
      const extra = [obj ? `Objective (admin): ${obj}` : null, kr ? `Key result: ${kr}` : null]
        .filter(Boolean)
        .join('\n\n');
      return {
        ...q,
        helper_text: [q.helper_text, extra].filter(Boolean).join('\n\n'),
      };
    });
  }, [visibleQuestions, formCode, revieweeId, reviewerEmployeeId, okrRows]);

  const sections = useMemo(() => {
    const map = new Map<number, { title: string; order: number; qs: QuestionRow[] }>();
    for (const q of questionsForDisplay) {
      const o = q.section_order;
      if (!map.has(o)) map.set(o, { title: q.section, order: o, qs: [] });
      map.get(o)!.qs.push(q);
    }
    return [...map.values()]
      .sort((a, b) => a.order - b.order)
      .map((sec) => ({
        ...sec,
        qs:
          formCode === 'executive'
            ? sortExecutiveSectionQuestions(sec.qs)
            : sec.qs,
      }));
  }, [questionsForDisplay, formCode]);

  const load = useCallback(async () => {
    if (!open || !reviewerEmployeeId || !revieweeId || !formCode) return;
    setLoading(true);
    try {
      const { data: formRow, error: fe } = await supabase
        .from('assessment_forms')
        .select('id, code, title, scale_min, scale_max, allows_no_opportunity')
        .eq('code', formCode)
        .maybeSingle();
      if (fe || !formRow) {
        toast.error('Could not load assessment form');
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

      if (formCode === 'executive' && revieweeId === reviewerEmployeeId) {
        const { data: okrData } = await supabase
          .from('executive_period_okrs')
          .select('slot_index, objective_text, key_result_text')
          .eq('employee_id', revieweeId)
          .eq('period', period);
        setOkrRows(okrData ?? []);
      } else {
        setOkrRows([]);
      }

      const { data: existing, error: re } = await supabase
        .from('assessment_responses')
        .select('id, status')
        .eq('form_id', formRow.id)
        .eq('reviewer_id', reviewerEmployeeId)
        .eq('reviewee_id', revieweeId)
        .eq('period', period)
        .maybeSingle();

      if (re) {
        toast.error('Could not load your response');
        return;
      }

      let rid = existing?.id ?? null;
      let st = existing?.status ?? 'draft';
      if (!rid) {
        const { data: ins, error: ie } = await supabase
          .from('assessment_responses')
          .insert({
            form_id: formRow.id,
            reviewer_id: reviewerEmployeeId,
            reviewee_id: revieweeId,
            period,
            status: 'draft',
          })
          .select('id, status')
          .single();
        if (ie) {
          toast.error(ie.message || 'Could not start assessment');
          return;
        }
        rid = ins.id;
        st = ins.status;
      }
      setResponseId(rid);
      setResponseStatus(st);

      const { data: ans, error: ae } = await supabase
        .from('assessment_answers')
        .select('question_id, score, text_answer, no_opportunity')
        .eq('response_id', rid);
      if (ae) {
        toast.error('Could not load answers');
        return;
      }
      const next: Record<string, { score?: number; text?: string; no_opportunity?: boolean }> = {};
      (ans ?? []).forEach((a) => {
        next[a.question_id] = {
          score: a.score ?? undefined,
          text: a.text_answer ?? undefined,
          no_opportunity: a.no_opportunity ?? false,
        };
      });
      setDraft(next);
    } finally {
      setLoading(false);
    }
  }, [open, formCode, reviewerEmployeeId, revieweeId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistAnswers = async (rows: { question_id: string; score: number | null; text_answer: string | null; no_opportunity: boolean }[]) => {
    if (!responseId || !rows.length) return;
    const { error } = await supabase.from('assessment_answers').upsert(
      rows.map((r) => ({
        response_id: responseId,
        question_id: r.question_id,
        score: r.score,
        text_answer: r.text_answer,
        no_opportunity: r.no_opportunity,
      })),
      { onConflict: 'response_id,question_id' },
    );
    if (error) throw error;
  };

  const buildAnswerRows = useCallback(() => {
    if (!responseId) return [];
    const scoredCommentsEnabled = formCode === 'peer_360' || formCode === 'ea_quarterly';
    const out: { question_id: string; score: number | null; text_answer: string | null; no_opportunity: boolean }[] = [];
    for (const q of visibleQuestions) {
      const d = draft[q.id] ?? {};
      if (q.question_type === 'scored') {
        const no = !!d.no_opportunity;
        const score = no ? null : d.score ?? null;
        const contextComment = scoredCommentsEnabled ? (d.text ?? '').trim() || null : null;
        out.push({
          question_id: q.id,
          score,
          text_answer: contextComment,
          no_opportunity: no,
        });
      } else {
        const text = (d.text ?? '').trim() || null;
        out.push({ question_id: q.id, score: null, text_answer: text, no_opportunity: false });
      }
    }
    return out;
  }, [draft, formCode, responseId, visibleQuestions]);

  const handleSaveDraft = async () => {
    if (!responseId || responseStatus !== 'draft') return;
    setSaving(true);
    try {
      await persistAnswers(buildAnswerRows());
      toast.success('Saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const validate = (): string | null => {
    for (const q of visibleQuestions) {
      const d = draft[q.id] ?? {};
      if (q.question_type === 'scored') {
        if (!d.no_opportunity && (d.score === undefined || d.score === null)) {
          return `Please score or mark N/O: ${q.question_text.slice(0, 60)}…`;
        }
      } else {
        const text = (d.text ?? '').trim();
        const mw = q.min_words ?? null;
        const minRequired = mw !== null && mw > 0 ? mw : 0;
        const mustHaveText =
          minRequired > 0 ||
          q.question_type === 'value_example' ||
          (q.question_type === 'written' && formCode !== 'monthly_self');
        if (mustHaveText && !text) {
          return `Please answer: ${q.question_text.slice(0, 60)}…`;
        }
        if (minRequired > 0 && wordCount(text) < minRequired) {
          return `Need at least ${minRequired} words for: ${q.question_text.slice(0, 48)}…`;
        }
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!responseId || responseStatus !== 'draft') return;
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      await persistAnswers(buildAnswerRows());
      const { error } = await supabase
        .from('assessment_responses')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', responseId)
        .eq('status', 'draft');
      if (error) throw error;
      setResponseStatus('submitted');
      toast.success('Submitted');
      onCompleted?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (qid: string, patch: Partial<{ score: number; text: string; no_opportunity: boolean }>) => {
    setDraft((prev) => ({
      ...prev,
      [qid]: { ...prev[qid], ...patch },
    }));
  };

  const readOnly = responseStatus === 'submitted';

  const usesBoomScale = formCode === 'executive' || formCode === 'ea_quarterly' || formCode === 'peer_360';
  const scoredCommentsEnabled = formCode === 'peer_360' || formCode === 'ea_quarterly';
  const activeScale = usesBoomScale ? BOOM_SCALE_BUTTONS : MONTHLY_LIKERT_SCALE;

  const totalVisible = visibleQuestions.length;
  const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of visibleQuestions) {
      const d = draft[q.id] ?? {};
      if (q.question_type === 'scored') {
        if (d.no_opportunity || (d.score !== undefined && d.score !== null)) n++;
      } else if (q.question_type === 'written' && formCode === 'monthly_self' && !(q.min_words != null && q.min_words > 0)) {
        if ((d.text ?? '').trim().length > 0) n++;
      } else if ((d.text ?? '').trim().length > 0) n++;
    }
    return n;
  }, [draft, visibleQuestions]);

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
            <DialogTitle className="text-lg">{formTitle}</DialogTitle>
            {reviewerRoleSummary && (
              <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                As {reviewerRoleSummary}
              </Badge>
            )}
          </div>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground pt-1">
              {formCode === 'monthly_self' ? (
                <span>
                  Your reflection — period <strong className="text-foreground">{period}</strong>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
                  <span>About</span>
                  <strong className="text-foreground">{revieweeName}</strong>
                  {anonymous && (
                    <Badge variant="secondary" className="text-[10px]">
                      Anonymous to reviewee
                    </Badge>
                  )}
                  <span className="text-muted-foreground">· {period}</span>
                </span>
              )}
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
            {usesBoomScale && (
              <BoomRatingScaleTable showPctRange={formCode === 'ea_quarterly'} />
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{answeredCount}</span> / {totalVisible} prompts answered
                {!readOnly && totalVisible > 0 && (
                  <span className="hidden sm:inline"> · Complete all before submitting</span>
                )}
              </p>
              {!readOnly && visibleQuestions.some((q) => q.question_type === 'scored') && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">Scale:</span>
                  {activeScale.slice(0, 3).map((s) => (
                    <span key={s.value}>
                      <strong className="text-foreground">{s.value}</strong>{' '}
                      {s.label.includes('—') ? s.label.split('—')[0].trim() : s.label.split(' / ')[0]}
                    </span>
                  ))}
                  <span>…</span>
                </div>
              )}
            </div>
            {formCode === 'peer_360' && form?.allows_no_opportunity && !readOnly && (
              <p className="text-[11px] text-muted-foreground leading-relaxed rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
                <span className="font-medium text-foreground">360 guidance: </span>
                Rate what you observe — not the role. Use <strong className="text-foreground">N/O</strong> when you have
                not had enough interaction; guessing harms the assessment.
              </p>
            )}
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
                  {sec.qs.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-2xl border border-border/70 bg-card/50 p-4 space-y-3"
                    >
                      <p className="text-sm font-medium leading-relaxed">{q.question_text}</p>
                      {q.helper_text && (
                        <p className="text-[11px] text-muted-foreground">{q.helper_text}</p>
                      )}
                      {q.question_type === 'scored' && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {activeScale.map((s) => (
                              <button
                                key={s.value}
                                type="button"
                                disabled={readOnly}
                                onClick={() => {
                                  if (readOnly) return;
                                  setField(q.id, { score: s.value, no_opportunity: false });
                                }}
                                className={cn(
                                  'flex-1 min-w-[52px] rounded-xl border-2 py-2 px-1 text-center transition-all text-xs flex flex-col items-center justify-center gap-0.5',
                                  draft[q.id]?.score === s.value && !draft[q.id]?.no_opportunity
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background hover:border-primary/40',
                                )}
                              >
                                <span className="font-bold">{s.value}</span>
                                <span className="hidden sm:block text-[8px] opacity-80 leading-tight max-w-[4.5rem] line-clamp-2">
                                  {'short' in s && s.short ? s.short : s.label.split(' / ')[0]}
                                </span>
                              </button>
                            ))}
                          </div>
                          {form.allows_no_opportunity && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                              <Checkbox
                                disabled={readOnly}
                                checked={!!draft[q.id]?.no_opportunity}
                                onCheckedChange={(c) => {
                                  if (readOnly) return;
                                  setField(q.id, {
                                    no_opportunity: !!c,
                                    score: c ? undefined : draft[q.id]?.score,
                                  });
                                }}
                              />
                              Not applicable / no opportunity to observe
                            </label>
                          )}
                          {scoredCommentsEnabled && !draft[q.id]?.no_opportunity && (
                            <Textarea
                              disabled={readOnly}
                              value={draft[q.id]?.text ?? ''}
                              onChange={(e) => setField(q.id, { text: e.target.value })}
                              className="min-h-[72px] text-sm"
                              placeholder={
                                formCode === 'peer_360'
                                  ? 'Optional comment — add context for this rating (anonymous to reviewee).'
                                  : 'Optional comment — add context for this rating.'
                              }
                            />
                          )}
                        </>
                      )}
                      {(q.question_type === 'written' ||
                        q.question_type === 'value_example') && (
                        <>
                          <Textarea
                            disabled={readOnly}
                            value={draft[q.id]?.text ?? ''}
                            onChange={(e) => setField(q.id, { text: e.target.value })}
                            className="min-h-[100px] text-sm"
                            placeholder="Your response…"
                          />
                          {q.min_words != null && q.min_words > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {wordCount(draft[q.id]?.text ?? '')} / {q.min_words} words minimum
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
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
