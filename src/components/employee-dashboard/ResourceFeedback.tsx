import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ReasonTag =
  | 'great_fit' | 'perfect_timing' | 'already_knew'
  | 'too_basic' | 'too_advanced' | 'off_topic' | 'wrong_format';

const POSITIVE: { tag: ReasonTag; label: string }[] = [
  { tag: 'great_fit', label: 'Great fit' },
  { tag: 'perfect_timing', label: 'Perfect timing' },
];
const NEGATIVE: { tag: ReasonTag; label: string }[] = [
  { tag: 'too_basic', label: 'Too basic' },
  { tag: 'too_advanced', label: 'Too advanced' },
  { tag: 'off_topic', label: 'Off topic' },
  { tag: 'wrong_format', label: 'Wrong format' },
  { tag: 'already_knew', label: 'Already knew' },
];

interface Props {
  userId: string;
  resourceId: string;
  resourceTitle: string;
  focusArea: string;
  runId?: string;
  itemId?: string;
  rankPosition?: number;
  initialScore?: number | null;
  onSubmitted?: (score: number, tag: ReasonTag | null) => void;
}

export default function ResourceFeedback({ userId, resourceId, resourceTitle, focusArea, runId, itemId, rankPosition, initialScore, onSubmitted }: Props) {
  const [score, setScore] = useState<number | null>(initialScore ?? null);
  const [showReasons, setShowReasons] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (relevance: number, reasonTag: ReasonTag | null) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('resource_feedback').upsert({
        user_id: userId,
        resource_id: resourceId,
        resource_title: resourceTitle,
        focus_area: focusArea,
        relevance_score: relevance,
        reason_tag: reasonTag,
      }, { onConflict: 'user_id,resource_id' });
      if (error) throw error;
      if (runId && itemId) {
        await (supabase as any).from('recommendation_events').insert({
          user_id: userId,
          run_id: runId,
          item_id: itemId,
          event_type: relevance >= 4 ? 'feedback_up' : 'feedback_down',
          position: rankPosition || null,
          focus_area: focusArea,
          metadata: { reason_tag: reasonTag, resource_title: resourceTitle } as any,
        });
      }
      setScore(relevance);
      setShowReasons(false);
      toast.success(relevance >= 4 ? "Got it — more like this." : "Got it — we'll adjust.", { duration: 1800 });
      onSubmitted?.(relevance, reasonTag);
    } catch (e) {
      console.error(e);
      toast.error('Could not save feedback');
    } finally {
      setSaving(false);
    }
  };

  const submitted = score !== null;

  if (submitted && !showReasons) {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground/70">
        <Badge variant={score >= 4 ? 'green' : 'outline'} className="px-1.5">
          {score >= 4 ? '👍 Logged' : '👎 Logged'}
        </Badge>
        <button onClick={() => setShowReasons(true)} className="underline">Edit</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground/70">Relevant?</span>
        <Button
          variant={score === 5 ? 'green' : 'outline'}
          size="sm"
          className="h-7 px-2"
          onClick={() => { setShowReasons(true); submit(5, 'great_fit'); }}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
        </Button>
        <Button
          variant={score === 1 ? 'destructive' : 'outline'}
          size="sm"
          className="h-7 px-2"
          onClick={() => setShowReasons(s => !s)}
          disabled={saving}
        >
          <ThumbsDown className="w-3 h-3" />
        </Button>
      </div>

      {showReasons && (
        <div className="flex flex-wrap gap-1 pt-1">
          {(score === 5 ? POSITIVE : NEGATIVE).map(r => (
            <button
              key={r.tag}
              onClick={() => submit(score === 5 ? 5 : 2, r.tag)}
              className="tag hover:bg-foreground hover:text-background transition-colors"
              disabled={saving}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
