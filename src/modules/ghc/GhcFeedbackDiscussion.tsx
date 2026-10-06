import { useCallback, useEffect, useState } from 'react';
import { useQuietLoader } from '@/hooks/useQuietLoader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, MessageSquare } from 'lucide-react';
import {
  ghcGetFeedbackDiscussion,
  ghcPostFeedbackDiscussionMessage,
} from './ghcApi';

type Msg = {
  id: string;
  author_employee_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export default function GhcFeedbackDiscussion({
  kind,
  subjectId,
  period,
  title,
  facilitatorId,
}: {
  kind: 'monthly_self' | 'peer_360';
  subjectId: string;
  period: string;
  title: string;
  facilitatorId?: string | null;
}) {
  const [discussionId, setDiscussionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const { start: startLoading, finish: finishLoading } = useQuietLoader(setLoading);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    startLoading();
    try {
      const data = await ghcGetFeedbackDiscussion(kind, subjectId, period, facilitatorId ?? null);
      setDiscussionId((data?.discussion_id as string) ?? null);
      setMessages((data?.messages as Msg[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load discussion');
      setMessages([]);
    } finally {
      finishLoading();
    }
  }, [facilitatorId, finishLoading, kind, period, startLoading, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!discussionId) {
      toast.error('Discussion is not open yet');
      return;
    }
    if (!body.trim()) return;
    setSending(true);
    try {
      await ghcPostFeedbackDiscussionMessage(discussionId, body.trim());
      setBody('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No messages yet — start the conversation with your manager.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="rounded-lg border border-border/40 bg-background/60 px-3 py-2">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {m.author_name} · {new Date(m.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Write a message…"
              className="min-h-[2.5rem] text-sm"
            />
            <Button disabled={sending || !discussionId} onClick={() => void send()} className="sm:self-end">
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
