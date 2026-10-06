import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Minus, Users, Building2, Layers, Globe2, Info } from 'lucide-react';

export interface CohortScore {
  category: string;
  you: number;
  department: number;
  level: number;
  subsidiary: number;
  organisation: number;
}

export interface CohortMeta {
  departmentName: string | null;
  subsidiaryName: string | null;
  levelLabel: string;
  departmentSize: number; // people in dept (excl. you) with ≥1 review
  levelSize: number;
  subsidiarySize: number;
  organisationSize: number;
}

export interface RankInfo {
  rank: number; // 1-based
  total: number;
  percentile: number; // 0-100, higher = better
  scope: 'organisation' | 'subsidiary' | 'department' | 'level';
}

interface Props {
  scores: CohortScore[];
  meta: CohortMeta;
  yourOverall: number;
  ranks: RankInfo[];
}

function plainLanguage(percentile: number) {
  if (percentile >= 90) return { label: 'Top 10%', tone: 'text-emerald-600', bg: 'bg-emerald-500/10' };
  if (percentile >= 75) return { label: 'Top 25%', tone: 'text-emerald-600', bg: 'bg-emerald-500/10' };
  if (percentile >= 50) return { label: 'Above middle', tone: 'text-primary', bg: 'bg-primary/10' };
  if (percentile >= 25) return { label: 'Below middle', tone: 'text-amber-600', bg: 'bg-amber-500/10' };
  return { label: 'Bottom 25%', tone: 'text-red-500', bg: 'bg-red-500/10' };
}

function diffBadge(you: number, vs: number) {
  if (vs <= 0) return null;
  const diff = you - vs;
  if (Math.abs(diff) < 0.1) return { tone: 'text-muted-foreground', icon: <Minus className="w-2.5 h-2.5" />, text: 'on par' };
  if (diff > 0) return { tone: 'text-emerald-600', icon: <TrendingUp className="w-2.5 h-2.5" />, text: `+${diff.toFixed(2)}` };
  return { tone: 'text-red-500', icon: <TrendingDown className="w-2.5 h-2.5" />, text: diff.toFixed(2) };
}

const SCOPE_META: Record<RankInfo['scope'], { label: string; icon: any }> = {
  organisation: { label: 'Whole VGG', icon: Globe2 },
  subsidiary: { label: 'Your subsidiary', icon: Building2 },
  department: { label: 'Your department', icon: Users },
  level: { label: 'Your level', icon: Layers },
};

export default function PerformanceContext({ scores, meta, yourOverall, ranks }: Props) {
  if (!scores.length) return null;

  return (
    <div className="space-y-6">
      {/* Where You Stand */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold">Where You Stand</h2>
            <p className="text-[11px] text-muted-foreground">
              How your overall score (<span className="font-semibold text-foreground">{yourOverall.toFixed(2)}/5</span>) ranks across different groups. Higher percentile means you scored higher than more people.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ranks.map((r) => {
            const Icon = SCOPE_META[r.scope].icon;
            const pl = plainLanguage(r.percentile);
            return (
              <div key={r.scope} className={`p-3 rounded-xl border border-border ${pl.bg}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">{SCOPE_META[r.scope].label}</span>
                </div>
                {r.total > 0 ? (
                  <>
                    <p className="text-lg font-bold text-foreground">#{r.rank}<span className="text-xs font-normal text-muted-foreground"> of {r.total}</span></p>
                    <p className={`text-[11px] font-semibold ${pl.tone}`}>{pl.label} ({r.percentile}th pct)</p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Not enough peers reviewed yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Comparison Bars */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold">You vs Your Cohorts</h2>
            <p className="text-[11px] text-muted-foreground">
              Each row shows your average and the average of three groups you belong to. All averages exclude your own scores so you're being compared fairly.
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground mb-4">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-primary" /> You</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-500/70" /> Department{meta.departmentName ? ` (${meta.departmentName}, ${meta.departmentSize})` : ''}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-emerald-500/70" /> Same Level ({meta.levelLabel}, {meta.levelSize})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-amber-500/70" /> Subsidiary{meta.subsidiaryName ? ` (${meta.subsidiaryName}, ${meta.subsidiarySize})` : ''}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-muted-foreground/50" /> Whole VGG ({meta.organisationSize})</span>
        </div>

        <div className="space-y-5">
          {scores.map((row) => (
            <div key={row.category}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-foreground">{row.category}</span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold text-foreground">{row.you.toFixed(2)}</span>
                  {(['department', 'level', 'subsidiary', 'organisation'] as const).map((k) => {
                    const b = diffBadge(row.you, row[k] as number);
                    if (!b) return null;
                    return (
                      <span key={k} className={`flex items-center gap-0.5 ${b.tone}`} title={`vs ${SCOPE_META[k as RankInfo['scope']].label}: ${(row[k] as number).toFixed(2)}`}>
                        {b.icon}{b.text}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                {[
                  { key: 'you', label: 'You', value: row.you, color: 'bg-primary' },
                  { key: 'department', label: 'Dept', value: row.department, color: 'bg-blue-500/70' },
                  { key: 'level', label: 'Level', value: row.level, color: 'bg-emerald-500/70' },
                  { key: 'subsidiary', label: 'Sub', value: row.subsidiary, color: 'bg-amber-500/70' },
                  { key: 'organisation', label: 'Org', value: row.organisation, color: 'bg-muted-foreground/50' },
                ].map((bar) => (
                  <div key={bar.key} className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground w-9">{bar.label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      {bar.value > 0 && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(bar.value / 5) * 100}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-full rounded-full ${bar.color}`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-medium w-8 text-right text-muted-foreground">
                      {bar.value > 0 ? bar.value.toFixed(2) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">How to read this:</span> A green arrow next to your score means you're scoring higher than that group's average; a red one means below. A dash (—) means we don't have enough reviews in that group yet to compute a reliable average.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
