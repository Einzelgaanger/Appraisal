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
import { toast } from 'sonner';
import { GHC_CULTURE_VALUES } from './ghcConstants';
import { ghcGet360Response, ghcUpsert360, type GhcTaskRow } from './ghcApi';

const empty = {
  score_founders_lps: 0,
  example_founders_lps: '',
  score_curious: 0,
  example_curious: '',
  score_move_fast: 0,
  example_move_fast: '',
  score_overachievement: 0,
  example_overachievement: '',
  score_job_done: 0,
  example_job_done: '',
  did_well: '',
  additional_comments: '',
};

export default function Ghc360Runner({
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
    void ghcGet360Response(task.record_id).then((row) => {
      if (!row) return;
      setLocked(row.status === 'submitted');
      setForm({
        score_founders_lps: row.score_founders_lps ?? 0,
        example_founders_lps: row.example_founders_lps ?? '',
        score_curious: row.score_curious ?? 0,
        example_curious: row.example_curious ?? '',
        score_move_fast: row.score_move_fast ?? 0,
        example_move_fast: row.example_move_fast ?? '',
        score_overachievement: row.score_overachievement ?? 0,
        example_overachievement: row.example_overachievement ?? '',
        score_job_done: row.score_job_done ?? 0,
        example_job_done: row.example_job_done ?? '',
        did_well: row.did_well ?? '',
        additional_comments: row.additional_comments ?? '',
      });
    });
  }, [open, task.record_id, task.status]);

  const scoreKey = (key: string) => `score_${key}` as keyof typeof empty;
  const exampleKey = (key: string) => `example_${key}` as keyof typeof empty;

  const save = async (status: 'draft' | 'submitted') => {
    if (status === 'submitted') {
      for (const c of GHC_CULTURE_VALUES) {
        if (!form[scoreKey(c.key)]) {
          toast.error(`Rate: ${c.label}`);
          return;
        }
        if (!String(form[exampleKey(c.key)] || '').trim()) {
          toast.error(`Give an example for: ${c.label}`);
          return;
        }
      }
      if (!form.did_well.trim()) {
        toast.error('Share what they did well.');
        return;
      }
    }
    setBusy(true);
    try {
      const id = await ghcUpsert360({
        id: recordId,
        reviewee_id: task.subject_id,
        period: task.period,
        status,
        ...form,
      });
      setRecordId(id);
      toast.success(
        status === 'submitted'
          ? '360 submitted — anonymous to peers; People Ops can see your name in Monitor'
          : 'Draft saved',
      );
      if (status === 'submitted') onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>360 feedback — {task.subject_name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          End-of-quarter praise or constructive feedback. Be constructive and truthful. Your name is stored for HR evidence
          but stays anonymous to {task.subject_name}. Period {task.period}.
        </p>
        <div className={`space-y-6 py-2 ${locked ? 'pointer-events-none opacity-90' : ''}`}>
          {GHC_CULTURE_VALUES.map((c) => (
            <div key={c.key} className="space-y-2 rounded-xl border border-border/60 p-3">
              <Label className="text-sm font-medium leading-snug">{c.label}</Label>
              <p className="text-[11px] text-muted-foreground">Look for: {c.attributes.join(' · ')}</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={form[scoreKey(c.key)] === n ? 'default' : 'outline'}
                    className="h-8 w-8 p-0"
                    onClick={() => setForm((f) => ({ ...f, [scoreKey(c.key)]: n }))}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <Textarea
                placeholder={`Examples for why you gave this rating`}
                value={String(form[exampleKey(c.key)] || '')}
                onChange={(e) => setForm((f) => ({ ...f, [exampleKey(c.key)]: e.target.value }))}
                rows={2}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label>What did they do well?</Label>
            <Textarea value={form.did_well} onChange={(e) => setForm((f) => ({ ...f, did_well: e.target.value }))} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Any additional comments?</Label>
            <Textarea value={form.additional_comments} onChange={(e) => setForm((f) => ({ ...f, additional_comments: e.target.value }))} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          {locked ? (
            <p className="mr-auto self-center text-[11px] text-muted-foreground">Submitted — read only.</p>
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
