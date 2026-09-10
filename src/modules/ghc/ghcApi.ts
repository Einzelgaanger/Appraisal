import { supabase } from '@/integrations/supabase/client';

/** Untyped client for GHC tables/RPCs until generated types are refreshed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type GhcTaskKind = 'monthly_manager' | 'peer_360' | 'quarterly_evaluation' | 'acknowledge_evaluation';

export type GhcTaskRow = {
  kind: GhcTaskKind;
  title: string;
  subject_id: string;
  subject_name: string;
  subject_role: string | null;
  period: string;
  status: string;
  record_id: string | null;
};

export async function ghcGetMyTasks(month: string, quarter: string) {
  const { data, error } = await db.rpc('ghc_get_my_tasks', {
    _period_month: month,
    _period_quarter: quarter,
  });
  if (error) throw error;
  return (data ?? []) as GhcTaskRow[];
}

export async function ghcGetMonthlyReview(id: string) {
  const { data, error } = await db.from('ghc_monthly_reviews').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ghcUpsertMonthlyReview(payload: Record<string, unknown>) {
  const { data, error } = await db.rpc('ghc_upsert_monthly_review', { _payload: payload });
  if (error) throw error;
  return data as string;
}

export async function ghcGet360Response(id: string) {
  const { data, error } = await db.from('ghc_360_responses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ghcUpsert360(payload: Record<string, unknown>) {
  const { data, error } = await db.rpc('ghc_upsert_360', { _payload: payload });
  if (error) throw error;
  return data as string;
}

export async function ghcGetMy360Aggregate(quarter: string) {
  const { data, error } = await db.rpc('ghc_get_my_360_aggregate', { _period_quarter: quarter });
  if (error) throw error;
  return data;
}

export async function ghcGetMyEvaluations(quarter: string) {
  const { data, error } = await db.rpc('ghc_get_my_evaluations', { _period_quarter: quarter });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    period: string;
    status: string;
    total_score: number | null;
    total_pct: number | null;
    band_rating: number | null;
    submitted_at: string | null;
    acknowledged_at: string | null;
    manager_name: string | null;
  }>;
}

export async function ghcGetQuarterlyEvaluation(id: string) {
  const { data, error } = await db.from('ghc_quarterly_evaluations').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ghcUpsertQuarterlyEvaluation(payload: Record<string, unknown>) {
  const { data, error } = await db.rpc('ghc_upsert_quarterly_evaluation', { _payload: payload });
  if (error) throw error;
  return data as string;
}

export async function ghcAcknowledgeEvaluation(payload: {
  evaluation_id: string;
  understanding: string;
  employee_response: string;
}) {
  const { data, error } = await db.rpc('ghc_acknowledge_evaluation', {
    _evaluation_id: payload.evaluation_id,
    _understanding: payload.understanding,
    _employee_response: payload.employee_response,
  });
  if (error) throw error;
  return data;
}

export async function ghcGetDirectory(quarter: string, month: string) {
  const { data, error } = await db.rpc('ghc_get_directory_status', {
    _period_quarter: quarter,
    _period_month: month,
  });
  if (error) throw error;
  return data ?? [];
}

export async function ghcGetPartnerRecommendations(evaluationId: string) {
  const { data, error } = await db
    .from('ghc_partner_recommendations')
    .select('*')
    .eq('evaluation_id', evaluationId)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function ghcUpsertPartnerRecommendation(payload: Record<string, unknown>) {
  const { data, error } = await db.rpc('ghc_upsert_partner_recommendation', { _payload: payload });
  if (error) throw error;
  return data;
}

export async function ghcReleasePeriod(kind: 'peer_360' | 'quarterly_evaluation', period: string) {
  const { data, error } = await db.rpc('ghc_release_period', { _kind: kind, _period: period });
  if (error) throw error;
  return data;
}

export async function ghcGetDiscussion(evaluationId: string) {
  const { data, error } = await db.rpc('ghc_get_evaluation_discussion', { _evaluation_id: evaluationId });
  if (error) throw error;
  return data;
}

export async function ghcPostDiscussionMessage(evaluationId: string, body: string) {
  const { data, error } = await db.rpc('ghc_post_evaluation_discussion_message', {
    _evaluation_id: evaluationId,
    _body: body,
  });
  if (error) throw error;
  return data;
}

export async function ghcGetAdminSummary(quarter: string, month: string) {
  const { data, error } = await db.rpc('ghc_admin_completion_summary', {
    _period_quarter: quarter,
    _period_month: month,
  });
  if (error) throw error;
  return data;
}

export async function ghcCreateInAppNotification(payload: {
  employee_id: string;
  event_type: string;
  title: string;
  body: string;
  href?: string;
  period?: string;
}) {
  const { error } = await db.rpc('ghc_create_notification', {
    _employee_id: payload.employee_id,
    _event_type: payload.event_type,
    _title: payload.title,
    _body: payload.body,
    _href: payload.href ?? '/hub?tab=survey',
    _period: payload.period ?? null,
  });
  if (error) throw error;
}

export async function ghcAiDraftAssist(context: string) {
  // Deterministic local draft — the chat edge function returns SSE for the admin panel,
  // which is not usable from a simple invoke. Keep assist helpful offline for managers.
  const text = [
    'Manager draft scaffold (review and edit before scoring):',
    '',
    '1. Strengths — list 3 evidenced behaviours from monthly notes + 360 themes.',
    '2. Improvements — list 2–3 concrete gaps with examples (HR requires evidence).',
    '3. Goals — area / goal / indicator / timeline / reviewer for each improvement.',
    '4. Culture narrative — one sentence per GHC value with proof.',
    '5. Weighted score reminder — Culture /25 + Technical /5 + Growth /5 = /35.',
    '',
    '--- Your pasted context ---',
    context.trim().slice(0, 6000) || '(no context yet)',
  ].join('\n');
  return { text, insights: [text] };
}
