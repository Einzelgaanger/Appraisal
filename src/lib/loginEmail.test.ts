import { describe, expect, it } from 'vitest';
import { loginEmailToTry } from './loginEmail';
import { formatQuarterScore, normalizeQuarterScore, type QuarterScoreRow } from './quarterScores';

describe('loginEmailToTry', () => {
  it('keeps a typed address when lookup finds nothing', () => {
    expect(loginEmailToTry('  Udeme.Inyang@venturegardengroup.com ', null)).toBe(
      'Udeme.Inyang@venturegardengroup.com',
    );
  });

  it('uses the live mailbox when an old address resolves', () => {
    expect(
      loginEmailToTry('udeme.inyang@peopleos.co', 'ekemudeme.inyang@venturegardengroup.com'),
    ).toBe('ekemudeme.inyang@venturegardengroup.com');
  });
});

describe('quarter scores', () => {
  const q2: QuarterScoreRow = {
    period: '2026-Q2',
    ea_avg: 3.45,
    ea_pct: 69,
    ea_submissions: 1,
    peer_avg: 3.08,
    peer_reviews: 3,
    eval_pct: null,
  };

  it('shows the manager score for a past quarter', () => {
    expect(formatQuarterScore(q2)).toEqual({ value: '69%', caption: 'Manager score' });
  });

  it('drops rows that are not a quarter key', () => {
    expect(normalizeQuarterScore({ period: '2026-Q3-legacy', ea_pct: 80 })).toBeNull();
  });

  it('falls through to peer 360 when there is no manager score', () => {
    expect(
      formatQuarterScore({
        ...q2,
        ea_avg: null,
        ea_pct: null,
        ea_submissions: 0,
      }),
    ).toEqual({ value: '3.08/5', caption: 'Peer 360' });
  });
});
