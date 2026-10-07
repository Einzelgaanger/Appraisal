import { supabase } from '@/integrations/supabase/client';
import { defaultQuarterPeriod } from '@/lib/boomPeriods';
import { BOOM_RATING_SCALE } from '@/lib/boomRatingScale';

export type EaQuarterlyAnswer = {
  section?: string;
  question?: string;
  question_type?: string;
  score?: number | null;
  text_answer?: string | null;
  no_opportunity?: boolean;
};

export type EaQuarterlySubmission = {
  response_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_role?: string | null;
  period: string;
  status: string;
  submitted_at: string | null;
  avg_score: number | null;
  score_pct: number | null;
  scored_count: number;
  sections: { section: string; avg_score: number; response_count: number }[];
  answers: EaQuarterlyAnswer[];
};

export type EaQuarterlyResults = {
  period: string;
  submissionCount: number;
  submissions: EaQuarterlySubmission[];
};

export type EaQuarterlyStatusRow = {
  employee_id: string;
  employee_name: string;
  employee_role: string | null;
  expected_reviewers: number;
  submitted_count: number;
  draft_count: number;
  status: 'complete' | 'partial' | 'in_progress' | 'todo' | string;
  submissions: {
    reviewer_id: string;
    reviewer_name: string;
    status: string;
    submitted_at: string | null;
    avg_score: number | null;
    score_pct: number | null;
  }[];
};

export function boomScoreBand(avg: number | null | undefined): string {
  if (avg == null || Number.isNaN(avg)) return '—';
  const row = BOOM_RATING_SCALE.find((r) => avg >= r.value - 0.5 && avg < r.value + 0.5)
    ?? BOOM_RATING_SCALE.reduce((best, r) =>
      Math.abs(r.value - avg) < Math.abs(best.value - avg) ? r : best,
    );
  return row.label;
}

export async function fetchMyEaQuarterlyResults(
  period: string = defaultQuarterPeriod(),
): Promise<EaQuarterlyResults | null> {
  const { data, error } = await supabase.rpc('get_my_ea_quarterly_results', { _period: period });
  if (error || !data || typeof data !== 'object') return null;

  const row = data as {
    period?: string;
    submission_count?: number;
    submissions?: EaQuarterlySubmission[];
  };

  return {
    period: row.period ?? period,
    submissionCount: row.submission_count ?? 0,
    submissions: Array.isArray(row.submissions) ? row.submissions : [],
  };
}

export type SharedEaQuarterlyRow = {
  reviewee_id: string;
  reviewee_name: string;
  reviewee_role: string | null;
  reviewee_department: string | null;
  status: 'todo' | 'submitted' | string;
  response_id: string | null;
  reviewer_name: string | null;
  submitted_at: string | null;
  avg_score: number | null;
  score_pct: number | null;
};

export async function fetchSharedEaQuarterly(
  period: string = defaultQuarterPeriod(),
): Promise<SharedEaQuarterlyRow[]> {
  const { data, error } = await supabase.rpc('get_shared_ea_quarterly', { _period: period });
  if (error || !Array.isArray(data)) return [];
  return data as SharedEaQuarterlyRow[];
}

export async function fetchEaQuarterlyStatusRoster(
  period: string = defaultQuarterPeriod(),
): Promise<EaQuarterlyStatusRow[]> {
  const { data, error } = await supabase.rpc('get_eo_ea_quarterly_status_roster', {
    _period: period,
  });
  if (error || !data) return [];
  return data as EaQuarterlyStatusRow[];
}
