export const GHC_CULTURE_VALUES = [
  {
    key: 'founders_lps',
    label: 'We only succeed when our founders and LPs succeed',
    attributes: ['Drive value', 'Proactive', 'Over communicate', 'Expertise', 'Partnership'],
  },
  {
    key: 'curious',
    label: 'Be voraciously curious',
    attributes: ['Innovative', 'Courageous', 'Limitless', 'Unsatisfied', 'Passion'],
  },
  {
    key: 'move_fast',
    label: 'Move fast and be detail oriented',
    attributes: ['Speed', 'Agile', 'Iterative', 'Resourceful', 'Creative'],
  },
  {
    key: 'overachievement',
    label: 'We only settle for overachievement',
    attributes: ['Output excellence', 'Quality', 'Discipline', 'Leadership', 'Focused'],
  },
  {
    key: 'job_done',
    label: "Your job isn't done, until the job is done",
    attributes: ['Ownership', 'Responsibility', 'Collaboration', 'Accountability', 'Reliability'],
  },
] as const;

export type GhcCultureKey = (typeof GHC_CULTURE_VALUES)[number]['key'];

export const GHC_EVAL_INDICATORS = [
  {
    key: 'technical',
    label: 'Technical Assessment',
    detail:
      'Objective and Key Results closed within assessment period. Assessment is based on completion, quality & depth of output, creativity, timely delivery, and impact of activity.',
    bucket: 'technical' as const,
  },
  {
    key: 'founders_lps',
    label: 'We only succeed when our Founders and LPs succeed',
    detail: 'Driving value by being proactive. Communicating properly in a manner of expertise to foster partnership.',
    bucket: 'culture' as const,
  },
  {
    key: 'curious',
    label: 'Be voraciously curious',
    detail:
      'Having an innovative mindset & strong passion that allows you to be limitless & unsatisfied in the quest for more. Being courageous yet reflecting humility.',
    bucket: 'culture' as const,
  },
  {
    key: 'move_fast',
    label: 'Move fast and be detail oriented',
    detail: 'Exhibiting speed & agility as well as constantly being iterative in the area of resourcefulness and creativity.',
    bucket: 'culture' as const,
  },
  {
    key: 'overachievement',
    label: 'We only settle for overachievement',
    detail: 'Taking up leadership, staying focused and disciplined to continuously deliver quality and excellent output.',
    bucket: 'culture' as const,
  },
  {
    key: 'job_done',
    label: "Your job isn't done until the job is done",
    detail:
      'Taking ownership of the work and collaborating with others. Being responsible for producing deliverables and staying accountable and reliable while at it.',
    bucket: 'culture' as const,
  },
  {
    key: 'growth',
    label: 'Potential for growth shown in this field & your current Role',
    detail: 'Evidence of growth in the current role and readiness for the next milestone.',
    bucket: 'growth' as const,
  },
] as const;

export const GHC_SCORE_WEIGHTS = {
  culture: 25,
  technical: 5,
  growth: 5,
  total: 35,
} as const;

export const GHC_RATING_BANDS = [
  { rating: 5, label: 'Exceptional Execution', minPct: 85, maxPct: 100, tone: 'exceptional' },
  { rating: 4, label: 'Exceed Expectations', minPct: 71, maxPct: 84, tone: 'exceed' },
  { rating: 3, label: 'Meet Expectations', minPct: 61, maxPct: 70, tone: 'meet' },
  { rating: 2, label: 'Needs Improvement', minPct: 50, maxPct: 60, tone: 'needs' },
  { rating: 1, label: 'Unacceptable', minPct: 0, maxPct: 49, tone: 'unacceptable' },
] as const;

export const GHC_PARTNER_ACTIONS = [
  'Promote to new level',
  'Salary Review',
  'Reward with Spot Bonus',
  'Confirm Resource?',
  'Growth Coaching',
  'Performance Improvement Plan',
  'Demotion',
  'No Action Required',
] as const;

export const GHC_SCALE_0_5 = [
  { value: 0, label: 'Did not perform / unrated' },
  { value: 1, label: 'Unsatisfactory' },
  { value: 2, label: 'Met some expectations' },
  { value: 3, label: 'Met all expectations' },
  { value: 4, label: 'Exceeded expectations' },
  { value: 5, label: 'Exceptional performance' },
] as const;

export function computeGhcScore(scores: {
  cultureSum: number;
  technical: number;
  growth: number;
}) {
  const culture = Math.min(GHC_SCORE_WEIGHTS.culture, scores.cultureSum);
  const technical = Math.min(GHC_SCORE_WEIGHTS.technical, scores.technical);
  const growth = Math.min(GHC_SCORE_WEIGHTS.growth, scores.growth);
  const total = culture + technical + growth;
  const pct = Number(((total / GHC_SCORE_WEIGHTS.total) * 100).toFixed(2));
  const band = GHC_RATING_BANDS.find((b) => pct >= b.minPct && pct <= b.maxPct) ?? GHC_RATING_BANDS[GHC_RATING_BANDS.length - 1];
  return { culture, technical, growth, total, pct, band };
}
