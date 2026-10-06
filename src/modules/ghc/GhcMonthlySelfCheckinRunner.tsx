import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  ghcGetMonthlySelfCheckin,
  ghcUpsertMonthlySelfCheckin,
  type GhcTaskRow,
} from './ghcApi';
import { useTenant } from '@/tenants/TenantContext';

function YesNo({
  value,
  onChange,
  id,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <RadioGroup
      value={value === null ? '' : value ? 'yes' : 'no'}
      onValueChange={(v) => onChange(v === 'yes')}
      className="flex gap-4"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="yes" id={`${id}-yes`} />
        <Label htmlFor={`${id}-yes`}>Yes</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="no" id={`${id}-no`} />
        <Label htmlFor={`${id}-no`}>No</Label>
      </div>
    </RadioGroup>
  );
}

const empty = {
  time_off_this_quarter: null as boolean | null,
  looking_forward_personal: null as boolean | null,
  looking_forward_work: null as boolean | null,
  meeting_okrs: null as boolean | null,
  displaying_growth: null as boolean | null,
  strong_relationship: null as boolean | null,
  policy_feedback: '',
  proud_this_month: null as boolean | null,
  personal_issues: null as boolean | null,
  company_can_help: null as boolean | null,
  motivated: null as boolean | null,
  motivated_why: '',
  fulfilled: '' as '' | 'yes' | 'neutral' | 'no',
  fulfilled_how: '',
  additional_comments: '',
  question_comments: {} as Record<string, string>,
};

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return fallback;
}

export default function GhcMonthlySelfCheckinRunner({
  open,
  onOpenChange,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: GhcTaskRow;
  onSaved: () => void;
}) {
  const { tenant } = useTenant();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(task.record_id);
  const [locked, setLocked] = useState(task.status === 'submitted');

  useEffect(() => {
    if (!open) return;
    setForm(empty);
    setRecordId(task.record_id);
    setLocked(task.status === 'submitted');
    if (!task.record_id) return;
    void ghcGetMonthlySelfCheckin(task.record_id).then((row) => {
      if (!row) return;
      setLocked(row.status === 'submitted');
      setForm({
        time_off_this_quarter: row.time_off_this_quarter,
        looking_forward_personal: row.looking_forward_personal,
        looking_forward_work: row.looking_forward_work,
        meeting_okrs: row.meeting_okrs,
        displaying_growth: row.displaying_growth,
        strong_relationship: row.strong_relationship,
        policy_feedback: row.policy_feedback ?? '',
        proud_this_month: row.proud_this_month,
        personal_issues: row.personal_issues,
        company_can_help: row.company_can_help,
        motivated: row.motivated,
        motivated_why: row.motivated_why ?? '',
        fulfilled: row.fulfilled ?? '',
        fulfilled_how: row.fulfilled_how ?? '',
        additional_comments: row.additional_comments ?? '',
        question_comments: row.question_comments && typeof row.question_comments === 'object'
          ? row.question_comments as Record<string, string>
          : {},
      });
    });
  }, [open, task.record_id, task.status]);

  const save = async (status: 'draft' | 'submitted') => {
    if (status === 'submitted') {
      const requiredBool = [
        form.time_off_this_quarter,
        form.looking_forward_personal,
        form.looking_forward_work,
        form.meeting_okrs,
        form.displaying_growth,
        form.strong_relationship,
      ];
      if (requiredBool.some((v) => v === null)) {
        toast.error('Answer every Yes/No question before submitting.');
        return;
      }
    }
    setBusy(true);
    try {
      const id = await ghcUpsertMonthlySelfCheckin({
        id: recordId,
        period: task.period,
        status,
        ...form,
        fulfilled: form.fulfilled || null,
      });
      setRecordId(id);
      toast.success(
        status === 'submitted'
          ? 'Self check-in submitted — your manager and leadership can review it'
          : 'Draft saved',
      );
      if (status === 'submitted') onSaved();
    } catch (e) {
      toast.error(errorText(e, 'Could not save the check-in. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const comment = (key: string) => form.question_comments[key] ?? '';
  const setComment = (key: string, value: string) => {
    setForm((current) => ({
      ...current,
      question_comments: { ...current.question_comments, [key]: value },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Monthly self check-in</DialogTitle>
        </DialogHeader>
        <div className={`min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-2 ${locked ? 'pointer-events-none opacity-90' : ''}`}>
          <p className="text-xs text-muted-foreground">
            Everyone completes this each month. Add a comment under each question. After you submit, your manager can see your answers. Period {task.period}.
          </p>
          <Field label="Taken time off this quarter?">
            <YesNo id="off" value={form.time_off_this_quarter} onChange={(v) => setForm((f) => ({ ...f, time_off_this_quarter: v }))} />
            <QuestionComment value={comment('time_off_this_quarter')} onChange={(value) => setComment('time_off_this_quarter', value)} />
          </Field>
          <Field label="Looking forward to something personal next month?">
            <YesNo id="pers" value={form.looking_forward_personal} onChange={(v) => setForm((f) => ({ ...f, looking_forward_personal: v }))} />
            <QuestionComment value={comment('looking_forward_personal')} onChange={(value) => setComment('looking_forward_personal', value)} />
          </Field>
          <Field label="Excited about something at work next month?">
            <YesNo id="work" value={form.looking_forward_work} onChange={(v) => setForm((f) => ({ ...f, looking_forward_work: v }))} />
            <QuestionComment value={comment('looking_forward_work')} onChange={(value) => setComment('looking_forward_work', value)} />
          </Field>
          <Field label="Meeting OKRs? (your opinion)">
            <YesNo id="okr" value={form.meeting_okrs} onChange={(v) => setForm((f) => ({ ...f, meeting_okrs: v }))} />
            <QuestionComment value={comment('meeting_okrs')} onChange={(value) => setComment('meeting_okrs', value)} />
          </Field>
          <Field label="Displaying growth in role? (your opinion)">
            <YesNo id="grow" value={form.displaying_growth} onChange={(v) => setForm((f) => ({ ...f, displaying_growth: v }))} />
            <QuestionComment value={comment('displaying_growth')} onChange={(value) => setComment('displaying_growth', value)} />
          </Field>
          <Field label="Strong relationship with your manager?">
            <YesNo id="rel" value={form.strong_relationship} onChange={(v) => setForm((f) => ({ ...f, strong_relationship: v }))} />
            <QuestionComment value={comment('strong_relationship')} onChange={(value) => setComment('strong_relationship', value)} />
          </Field>
          <Field label="Feedback on company policies / actions / decisions">
            <Textarea value={form.policy_feedback} onChange={(e) => setForm((f) => ({ ...f, policy_feedback: e.target.value }))} rows={2} placeholder="Comment for this question" />
          </Field>
          <Field label="Proud of something this month?">
            <YesNo id="proud" value={form.proud_this_month} onChange={(v) => setForm((f) => ({ ...f, proud_this_month: v }))} />
            <QuestionComment value={comment('proud_this_month')} onChange={(value) => setComment('proud_this_month', value)} />
          </Field>
          <Field label="Personal issues affecting productivity?">
            <YesNo id="issues" value={form.personal_issues} onChange={(v) => setForm((f) => ({ ...f, personal_issues: v }))} />
            <QuestionComment value={comment('personal_issues')} onChange={(value) => setComment('personal_issues', value)} />
          </Field>
          <Field label={`Anything ${tenant.branding.fullName} can help with?`}>
            <YesNo id="help" value={form.company_can_help} onChange={(v) => setForm((f) => ({ ...f, company_can_help: v }))} />
            <QuestionComment value={comment('company_can_help')} onChange={(value) => setComment('company_can_help', value)} />
          </Field>
          <Field label="Motivated / enthused / challenged?">
            <YesNo id="mot" value={form.motivated} onChange={(v) => setForm((f) => ({ ...f, motivated: v }))} />
            <QuestionComment value={comment('motivated')} onChange={(value) => setComment('motivated', value)} />
          </Field>
          <Field label="Why? Give examples">
            <Textarea value={form.motivated_why} onChange={(e) => setForm((f) => ({ ...f, motivated_why: e.target.value }))} rows={3} placeholder="Comment for this question" />
          </Field>
          <Field label="Feeling fulfilled in role?">
            <RadioGroup
              value={form.fulfilled}
              onValueChange={(v) => setForm((f) => ({ ...f, fulfilled: v as typeof form.fulfilled }))}
              className="flex gap-4"
            >
              {(['yes', 'neutral', 'no'] as const).map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <RadioGroupItem value={v} id={`ful-${v}`} />
                  <Label htmlFor={`ful-${v}`} className="capitalize">{v}</Label>
                </div>
              ))}
            </RadioGroup>
            <QuestionComment value={comment('fulfilled')} onChange={(value) => setComment('fulfilled', value)} />
          </Field>
          <Field label="How? Provide details">
            <Textarea value={form.fulfilled_how} onChange={(e) => setForm((f) => ({ ...f, fulfilled_how: e.target.value }))} rows={2} placeholder="Comment for this question" />
          </Field>
          <Field label="Additional comments">
            <Textarea value={form.additional_comments} onChange={(e) => setForm((f) => ({ ...f, additional_comments: e.target.value }))} rows={2} placeholder="Anything else" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-background px-6 py-3">
          {locked ? (
            <p className="mr-auto self-center text-[11px] text-muted-foreground">Submitted — read only. Chat with your manager on My results.</p>
          ) : null}
          {!locked && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void save('draft')}>Save draft</Button>
              <Button disabled={busy} onClick={() => void save('submitted')}>Submit</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionComment({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={2}
      placeholder="Comment for this question"
      className="mt-2"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium leading-snug">{label}</Label>
      {children}
    </div>
  );
}
