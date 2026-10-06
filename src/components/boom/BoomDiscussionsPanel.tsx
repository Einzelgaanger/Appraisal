import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuietLoader } from '@/hooks/useQuietLoader';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DISCUSSION_FORM_LABELS,
  discussionThreadTitle,
  isBoomOversightViewer,
  canViewPeer360Oversight,
} from '@/lib/boomDiscussionLabels';

type InboxRow = {
  discussion_id: string;
  form_code: string;
  period: string;
  subject_id: string;
  subject_name: string;
  facilitator_id: string;
  facilitator_name: string;
  source_response_id: string | null;
  message_count: number;
  last_message_at: string | null;
  viewer_role: 'subject' | 'facilitator';
};

type ThreadMessage = {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  is_me: boolean;
};

type ResultItem = {
  section?: string;
  question?: string;
  question_type?: string;
  score?: number | null;
  text_answer?: string | null;
  no_opportunity?: boolean;
};

type Peer360Results = {
  sections?: { section: string; avg_score: number; response_count: number }[];
  peer_feedback?: {
    peer_label: string;
    answers: ResultItem[];
  }[];
  subject_view?: boolean;
  message?: string;
};

type ThreadData = {
  discussion_id: string;
  form_code: string;
  period: string;
  subject_id: string;
  subject_name: string;
  facilitator_id: string;
  facilitator_name: string;
  viewer_role: 'subject' | 'facilitator';
  results: ResultItem[] | Peer360Results;
  messages: ThreadMessage[];
};

type OversightRow = {
  employee_id: string;
  employee_name: string;
  employee_role: string | null;
  peer_response_count: number;
  discussion_id: string | null;
};

interface BoomDiscussionsPanelProps {
  reviewerEmployeeId: string | null;
  reviewerEmail?: string | null;
  reviewerHierarchyLevel?: number | null;
  isPlatformAdmin?: boolean;
  periodQuarter: string;
  periodMonth: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function rpcErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function ResultsPanel({ formCode, results, viewerRole }: { formCode: string; results: ThreadData['results']; viewerRole: string }) {
  if (formCode === 'peer_360') {
    const r = results as Peer360Results;
    if (r?.subject_view && viewerRole === 'subject') {
      return (
        <p className="text-xs text-muted-foreground leading-relaxed p-3 rounded-lg bg-muted/30">
          {r.message}
        </p>
      );
    }
    const sections = r?.sections ?? [];
    // Per-peer blocks are facilitator/oversight only — never show to the recipient.
    const peers = viewerRole === 'subject' ? [] : (r?.peer_feedback ?? []);
    const themeTexts = viewerRole === 'subject'
      ? [
          ...((r as Peer360Results & { themes?: { text?: string }[] })?.themes ?? []),
          ...((r as Peer360Results & { start_doing?: { text?: string }[] })?.start_doing ?? []),
          ...((r as Peer360Results & { stop_doing?: { text?: string }[] })?.stop_doing ?? []),
          ...((r as Peer360Results & { continue_doing?: { text?: string }[] })?.continue_doing ?? []),
        ]
          .map((t) => (typeof t === 'object' && t && 'text' in t ? String(t.text ?? '').trim() : ''))
          .filter(Boolean)
      : [];
    const uniqueThemes = [...new Set(themeTexts)];
    return (
      <div className="space-y-4 text-xs">
        {viewerRole === 'subject' && (
          <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg bg-muted/30 px-3 py-2">
            Peer reviewers stay anonymous. You only see aggregated scores and themes — not who submitted.
          </p>
        )}
        {sections.length > 0 && (
          <div>
            <p className="font-semibold text-foreground mb-2">Section averages</p>
            <ul className="space-y-1.5">
              {sections.map((s) => (
                <li key={s.section} className="flex justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                  <span className="text-muted-foreground">{s.section}</span>
                  <span className="font-mono font-medium">{s.avg_score} <span className="text-muted-foreground font-normal">({s.response_count})</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {uniqueThemes.length > 0 && (
          <div>
            <p className="font-semibold text-foreground mb-2">Anonymous written themes</p>
            <ul className="space-y-1.5">
              {uniqueThemes.map((text, i) => (
                <li key={i} className="rounded-lg bg-muted/30 px-3 py-2 text-foreground/90 leading-relaxed">
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {peers.length > 0 && (
          <div>
            <p className="font-semibold text-foreground mb-2">Peer feedback (anonymous labels)</p>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {peers.map((p) => (
                <div key={p.peer_label} className="rounded-xl border border-border/60 p-3 space-y-2">
                  <Badge variant="secondary" className="text-[10px]">{p.peer_label}</Badge>
                  {p.answers.map((a, i) => (
                    <div key={i} className="space-y-0.5">
                      {a.score != null && (
                        <p className="text-[10px] text-muted-foreground">{a.section} · score {a.score}</p>
                      )}
                      {a.text_answer && (
                        <p className="text-foreground/90 leading-relaxed">{a.text_answer}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {sections.length === 0 && peers.length === 0 && uniqueThemes.length === 0 && (
          <p className="text-muted-foreground">No peer 360 submissions yet for this period.</p>
        )}
      </div>
    );
  }

  const items = (results as ResultItem[]) ?? [];
  if (!items.length) {
    return <p className="text-xs text-muted-foreground">No assessment answers to display.</p>;
  }

  const scored = items.filter((q) => q.question_type === 'scored' && q.score != null && !q.no_opportunity);
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, q) => sum + (q.score ?? 0), 0) / scored.length
      : null;
  const scorePct = avgScore != null ? Math.round((avgScore / 5) * 100) : null;

  const bySection = new Map<string, ResultItem[]>();
  for (const item of items) {
    const sec = item.section ?? 'General';
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push(item);
  }

  return (
    <div className="space-y-4 text-xs">
      {formCode === 'ea_quarterly' && scorePct != null && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Quarter score</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {avgScore!.toFixed(2)}/5 across {scored.length} ratings
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-primary">{scorePct}%</p>
        </div>
      )}
      {[...bySection.entries()].map(([section, qs]) => (
        <div key={section}>
          <p className="font-semibold text-primary mb-2">{section}</p>
          <ul className="space-y-3">
            {qs.map((q, i) => (
              <li key={i} className="rounded-lg bg-muted/25 p-3 space-y-1">
                <p className="text-foreground/90 leading-relaxed">{q.question}</p>
                {q.question_type === 'scored' && (
                  <p className="font-medium">
                    {q.no_opportunity ? 'N/O' : q.score != null ? `Score: ${q.score}` : '—'}
                  </p>
                )}
                {q.text_answer && (
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{q.text_answer}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function BoomDiscussionsPanel({
  reviewerEmployeeId,
  reviewerEmail,
  reviewerHierarchyLevel,
  isPlatformAdmin = false,
  periodQuarter,
  periodMonth,
}: BoomDiscussionsPanelProps) {
  const oversight = canViewPeer360Oversight(reviewerHierarchyLevel, isPlatformAdmin)
    || isBoomOversightViewer(reviewerEmail, reviewerHierarchyLevel);
  const [loading, setLoading] = useState(false);
  const { start: startLoading, finish: finishLoading } = useQuietLoader(setLoading);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [oversightRoster, setOversightRoster] = useState<OversightRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<'inbox' | 'peer360'>('inbox');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    if (!reviewerEmployeeId) return;
    const { data, error } = await supabase.rpc('get_boom_discussion_inbox', {
      _period_quarter: periodQuarter,
      _period_month: periodMonth,
    });
    if (error) {
      toast.error(error.message);
      setInbox([]);
      return;
    }
    setInbox((data ?? []) as InboxRow[]);
  }, [reviewerEmployeeId, periodQuarter, periodMonth]);

  const loadOversightRoster = useCallback(async () => {
    if (!reviewerEmployeeId || !oversight) return;
    const { data, error } = await supabase.rpc('get_boom_peer360_oversight_roster', {
      _period: periodQuarter,
    });
    if (error) {
      setOversightRoster([]);
      return;
    }
    setOversightRoster((data ?? []) as OversightRow[]);
  }, [reviewerEmployeeId, oversight, periodQuarter]);

  const loadThread = useCallback(async (discussionId: string) => {
    setThreadLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_boom_discussion_thread', {
        _discussion_id: discussionId,
      });
      if (error) throw error;
      const raw = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown> | null;
      const resolvedId = String(raw?.discussion_id ?? discussionId);
      if (!raw || !resolvedId || resolvedId === 'undefined') {
        toast.error('Could not load discussion — check you have access to this thread.');
        setThread(null);
        return;
      }
      setThread({
        ...(raw as unknown as ThreadData),
        discussion_id: resolvedId,
        messages: Array.isArray(raw.messages) ? (raw.messages as ThreadMessage[]) : [],
      });
    } catch (e: unknown) {
      toast.error(rpcErrorMessage(e, 'Could not load discussion'));
      setThread(null);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    startLoading();
    await Promise.all([loadInbox(), loadOversightRoster()]);
    finishLoading();
  }, [finishLoading, loadInbox, loadOversightRoster, startLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    else setThread(null);
  }, [selectedId, loadThread]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages]);

  const groupedInbox = useMemo(() => {
    const m = new Map<string, InboxRow[]>();
    for (const row of inbox) {
      if (!m.has(row.form_code)) m.set(row.form_code, []);
      m.get(row.form_code)!.push(row);
    }
    return m;
  }, [inbox]);

  const openPeerDiscussion = async (subjectId: string, existingDiscussionId?: string | null) => {
    setActiveSubjectId(subjectId);
    if (existingDiscussionId) {
      setSelectedId(existingDiscussionId);
      return;
    }
    const { data, error } = await supabase.rpc('open_boom_peer360_discussion', {
      _subject_id: subjectId,
      _period: periodQuarter,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const id = data != null ? String(data) : '';
    if (!id) {
      toast.error('Could not open discussion');
      return;
    }
    setSelectedId(id);
    await Promise.all([loadInbox(), loadOversightRoster()]);
  };

  const sendMessage = async () => {
    if (!selectedId || !message.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc('post_boom_discussion_message', {
        _discussion_id: selectedId,
        _body: message.trim(),
      });
      if (error) throw error;
      setMessage('');
      await loadThread(selectedId);
      await loadInbox();
    } catch (e: unknown) {
      toast.error(rpcErrorMessage(e, 'Could not send message'));
    } finally {
      setSending(false);
    }
  };

  if (!reviewerEmployeeId) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        After monthly self check-ins and other assessments are submitted, routed discussions appear here.
        Peer 360 subjects can open a manager thread on released results. Each facilitator has a separate thread with the
        person who owns the results — e.g. a team member may have up to three monthly self threads (line manager, Bunmi,
        Omotola). L1 line managers (Uche, Gisele, Omotola, Deyi) can review anonymous 360 results for their L2 pods;
        executives (Bunmi) see L2 only — not L1 peers.
      </p>

      {oversight && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === 'inbox' ? 'default' : 'outline'}
            className="h-9 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal"
            onClick={() => setView('inbox')}
          >
            My discussions
          </Button>
          <Button
            size="sm"
            variant={view === 'peer360' ? 'default' : 'outline'}
            className="h-9 gap-1.5 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal"
            onClick={() => setView('peer360')}
          >
            <Users className="w-3 h-3" /> Team 360 roster
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading discussions…
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr] lg:items-start min-h-[420px]">
          <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 scrollbar-thin">
            {view === 'peer360' && oversight ? (
              <>
                <h4 className="text-sm font-semibold">360 — your team</h4>
                <p className="text-[11px] text-muted-foreground">
                  Open chat to discuss anonymous peer feedback for {periodQuarter}.
                </p>
                {oversightRoster.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No team members in your 360 pod yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {oversightRoster.map((row) => (
                      <li key={row.employee_id}>
                        <button
                          type="button"
                          onClick={() => void openPeerDiscussion(row.employee_id, row.discussion_id)}
                          className={cn(
                            'w-full text-left rounded-xl border px-3 py-2.5 transition-colors text-xs',
                            selectedId && row.discussion_id === selectedId
                              ? 'border-primary bg-primary/10'
                              : activeSubjectId === row.employee_id
                                ? 'border-primary bg-primary/10'
                                : 'border-border/60 hover:border-primary/40',
                          )}
                        >
                          <p className="font-medium truncate">{row.employee_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {row.peer_response_count} peer review{row.peer_response_count === 1 ? '' : 's'}
                            {row.discussion_id ? ' · chat started' : ''}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold">Discussions</h4>
                </div>
                {inbox.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No discussions yet for the selected periods. They appear when assessments are submitted and routed.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {[...groupedInbox.entries()].map(([code, rows]) => (
                      <div key={code}>
                        <p className="mb-2 text-sm font-medium text-foreground/70">
                          {DISCUSSION_FORM_LABELS[code] ?? code}
                        </p>
                        <ul className="space-y-1">
                          {rows.map((row) => {
                            const title =
                              row.form_code === 'peer_360' && row.viewer_role === 'subject'
                                ? (row.facilitator_name?.trim() || 'Anonymous 360 feedback')
                                : row.viewer_role === 'subject'
                                  ? row.facilitator_name
                                  : row.subject_name;
                            return (
                              <li key={row.discussion_id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSubjectId(null);
                                    setSelectedId(row.discussion_id);
                                  }}
                                  className={cn(
                                    'w-full text-left rounded-xl border px-3 py-2.5 transition-colors text-xs',
                                    selectedId === row.discussion_id
                                      ? 'border-primary bg-primary/10'
                                      : 'border-border/60 hover:border-primary/40',
                                  )}
                                >
                                  <p className="font-medium truncate">{title}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {row.period}
                                    {row.message_count > 0 && ` · ${row.message_count} msg`}
                                  </p>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex min-h-[360px] max-h-[min(78vh,820px)] flex-col overflow-hidden rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            {!selectedId ? (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground text-center px-4">
                Select a person or discussion on the left to open the chat.
              </div>
            ) : threadLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading thread…
              </div>
            ) : thread ? (
              <>
                <div className="border-b border-border pb-3 mb-3 shrink-0">
                  <h4 className="text-sm font-semibold">
                    {discussionThreadTitle(
                      thread.form_code,
                      thread.viewer_role,
                      thread.subject_name,
                      thread.facilitator_name,
                    )}
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {DISCUSSION_FORM_LABELS[thread.form_code]} · {thread.period}
                  </p>
                </div>

                <div className="grid gap-4 flex-1 min-h-0 lg:grid-cols-2 overflow-y-auto lg:overflow-hidden scrollbar-thin">
                  <div className="min-h-0 lg:overflow-y-auto lg:pr-2 scrollbar-thin">
                    <p className="sticky top-0 z-10 mb-2 bg-white/95 py-0.5 text-sm font-medium text-foreground/70 backdrop-blur-sm">
                      Submitted results
                    </p>
                    <ResultsPanel
                      formCode={thread.form_code}
                      results={thread.results}
                      viewerRole={thread.viewer_role}
                    />
                  </div>

                  <div className="flex flex-col min-h-[220px] lg:min-h-0 border-t lg:border-t-0 lg:border-l border-border pt-4 lg:pt-0 lg:pl-4">
                    <p className="mb-2 shrink-0 text-sm font-medium text-foreground/70">Discussion</p>
                    <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[100px] max-h-[40vh] lg:max-h-none scrollbar-thin">
                      {thread.messages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No messages yet — start the conversation.</p>
                      ) : (
                        thread.messages.map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              'rounded-xl px-3 py-2 text-xs max-w-[95%]',
                              m.is_me ? 'bg-primary text-primary-foreground ml-auto' : 'bg-muted/50',
                            )}
                          >
                            <p className="text-[10px] opacity-80 mb-0.5">{m.is_me ? 'You' : m.author_name}</p>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                            <p className="text-[9px] opacity-60 mt-1">{formatTime(m.created_at)}</p>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Write a message…"
                        rows={2}
                        className="text-sm min-h-[60px] resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void sendMessage();
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-2xl bg-teal-500 text-white hover:bg-teal-600"
                        disabled={sending || !message.trim()}
                        onClick={() => void sendMessage()}
                      >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground text-center px-4">
                <p>Could not open this discussion.</p>
                <Button variant="outline" size="sm" className="h-9 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal" onClick={() => void loadThread(selectedId)}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" className="h-9 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal" onClick={() => void refresh()}>
        Refresh discussions
      </Button>
    </div>
  );
}
