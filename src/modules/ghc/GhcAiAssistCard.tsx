import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ENABLE_APP_AI } from '@/lib/featureFlags';
import { ghcAiDraftAssist } from './ghcApi';

export default function GhcAiAssistCard({
  employeeName,
  periodMonth,
  periodQuarter,
}: {
  employeeName?: string | null;
  periodMonth: string;
  periodQuarter: string;
}) {
  const [context, setContext] = useState(
    `Manager briefing for GreenHouse Capital.\nReviewer: ${employeeName ?? 'Manager'}\nMonth: ${periodMonth}\nQuarter: ${periodQuarter}\n\nPaste monthly notes, 360 themes, or OKR evidence here. Ask for strengths, improvements, and a draft supervisor narrative.`,
  );
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ENABLE_APP_AI) {
    return (
      <div className="glass-panel p-5 text-sm text-muted-foreground">
        AI assist is disabled for this environment.
      </div>
    );
  }

  const run = async () => {
    setBusy(true);
    try {
      const data = await ghcAiDraftAssist(context);
      const text =
        data?.text ||
        (Array.isArray(data?.insights) ? data.insights.join('\n') : null) ||
        'No draft returned. Check the ai-insights function is deployed, or paste this context into your notes manually.';
      setOutput(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI assist unavailable';
      toast.error(msg);
      setOutput(
        [
          'Draft scaffold (offline fallback):',
          '1. Strengths — list 3 evidenced behaviours from monthly + 360.',
          '2. Improvements — list 2–3 concrete gaps with examples.',
          '3. Goals — attach timeline + reviewer for each improvement.',
          '4. Culture narrative — one sentence per GHC value with proof.',
        ].join('\n'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">AI draft assist</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        AI can draft strengths, improvements, and evaluation narrative from evidence you paste. Humans still confirm every score —
        HR requires evidence in all cases.
      </p>
      <Textarea value={context} onChange={(e) => setContext(e.target.value)} rows={8} />
      <Button disabled={busy} onClick={() => void run()} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Draft assist
      </Button>
      {output && (
        <pre className="whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed">
          {output}
        </pre>
      )}
    </div>
  );
}
