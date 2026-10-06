import { useEffect, useState } from 'react';
import { Brain, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props { userId: string; }

interface Profile {
  preferredFormats: string[];
  topFocus: { area: string; weight: number }[];
  totals: { interactions: number; feedback: number; reflections: number };
  positivity: number; // 0..1
}

export default function LearningProfilePanel({ userId }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [interactions, feedback, reflections] = await Promise.all([
        supabase.from('learning_interactions').select('resource_format, focus_area, action').eq('user_id', userId).limit(500),
        supabase.from('resource_feedback').select('relevance_score, focus_area').eq('user_id', userId).limit(200),
        supabase.from('learning_reflections').select('id').eq('user_id', userId).limit(50),
      ]);
      if (!active) return;

      const fmt: Record<string, number> = {};
      const focus: Record<string, number> = {};
      (interactions.data || []).forEach((i: any) => {
        const w = i.action === 'completed' ? 3 : i.action === 'opened' ? 2 : i.action === 'saved' ? 2 : i.action === 'dismissed' ? -1 : 0.5;
        if (i.resource_format) fmt[i.resource_format] = (fmt[i.resource_format] || 0) + w;
        if (i.focus_area) focus[i.focus_area] = (focus[i.focus_area] || 0) + w;
      });
      (feedback.data || []).forEach((f: any) => {
        if (f.focus_area) focus[f.focus_area] = (focus[f.focus_area] || 0) + (f.relevance_score - 3);
      });

      const preferredFormats = Object.entries(fmt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      const maxFocus = Math.max(1, ...Object.values(focus));
      const topFocus = Object.entries(focus)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([area, w]) => ({ area, weight: Math.max(0, w / maxFocus) }));

      const fbAvg = (feedback.data || []).length
        ? (feedback.data || []).reduce((s: number, f: any) => s + f.relevance_score, 0) / (feedback.data || []).length
        : 0;
      const positivity = fbAvg ? Math.min(1, Math.max(0, (fbAvg - 1) / 4)) : 0;

      setProfile({
        preferredFormats,
        topFocus,
        totals: { interactions: interactions.data?.length || 0, feedback: feedback.data?.length || 0, reflections: reflections.data?.length || 0 },
        positivity,
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  if (loading) return null;

  if (!profile || profile.totals.interactions + profile.totals.feedback + profile.totals.reflections === 0) {
    return (
      <div className="brutal p-5 bg-card">
        <div className="eyebrow mb-2 flex items-center gap-2"><Brain className="w-3 h-3" /> Your learning profile</div>
        <p className="text-sm text-foreground/70">
          Empty for now. Once you rate a few resources or check in on a reflection, the recommender will start adapting to you.
        </p>
      </div>
    );
  }

  return (
    <div className="brutal p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="eyebrow mb-1 flex items-center gap-2"><Brain className="w-3 h-3" /> Your learning profile</div>
          <h3 className="font-serif text-lg font-bold leading-tight">What the algorithm has learned</h3>
        </div>
        <Sparkles className="w-5 h-5" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="mb-2 text-sm font-medium text-foreground/70">Preferred formats</div>
          {profile.preferredFormats.length ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.preferredFormats.map(f => <span key={f} className="tag-solid">{f}</span>)}
            </div>
          ) : <p className="text-xs text-foreground/60">Not enough data yet.</p>}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground/70">Focus area weights</div>
          {profile.topFocus.length ? (
            <div className="space-y-1.5">
              {profile.topFocus.map(t => (
                <div key={t.area}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="truncate pr-2">{t.area}</span>
                    <span className="mono">{Math.round(t.weight * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary border border-foreground rounded-sm overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${t.weight * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-foreground/60">No focus signals yet.</p>}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground/70">Signal volume</div>
          <ul className="text-sm space-y-1">
            <li><span className="mono font-bold">{profile.totals.interactions}</span> interactions logged</li>
            <li><span className="mono font-bold">{profile.totals.feedback}</span> resources rated</li>
            <li><span className="mono font-bold">{profile.totals.reflections}</span> weekly reflections</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
