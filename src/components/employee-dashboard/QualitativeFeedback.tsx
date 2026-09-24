import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowUp, ArrowLeftRight, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FeedbackItem {
  text: string;
  direction: string;
}

type BucketKey = 'continueDoing' | 'startDoing' | 'stopDoing';

interface QualitativeFeedbackProps {
  startDoing: FeedbackItem[];
  stopDoing: FeedbackItem[];
  continueDoing: FeedbackItem[];
  /** Override headings when the source prompts don't map 1:1 to start / stop / continue. */
  labels?: Partial<Record<BucketKey, { label: string; desc: string }>>;
}

const DIRECTION_META = {
  above: { label: 'Leadership', icon: <ArrowUp className="w-3 h-3" />, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  peer: { label: 'Peers', icon: <ArrowLeftRight className="w-3 h-3" />, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  below: { label: 'Reports', icon: <ArrowDown className="w-3 h-3" />, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

const SECTIONS = [
  { key: 'continueDoing' as const, label: 'Continue Doing', emoji: '✅', desc: 'Strengths to maintain', color: 'border-l-emerald-500' },
  { key: 'startDoing' as const, label: 'Start Doing', emoji: '🚀', desc: 'Recommendations to adopt', color: 'border-l-blue-500' },
  { key: 'stopDoing' as const, label: 'Stop Doing', emoji: '🛑', desc: 'Areas for improvement', color: 'border-l-red-500' },
];

/** Headings for the Q3 2026 streamlined 360, whose prompts merge start/stop and lead with "improve". */
export const BOOM_360_FEEDBACK_LABELS: Partial<Record<BucketKey, { label: string; desc: string }>> = {
  continueDoing: { label: 'Continue Doing', desc: 'Creates meaningful value for the team' },
  startDoing: { label: 'Start or Stop', desc: 'Behaviour changes that raise effectiveness' },
  stopDoing: { label: 'Improve', desc: 'Specific gaps and what better looks like' },
};

function FeedbackSection({ items, label, emoji, desc, color }: { items: FeedbackItem[]; label: string; emoji: string; desc: string; color: string }) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'above' | 'peer' | 'below'>('all');

  const filtered = filter === 'all' ? items : items.filter(i => i.direction === filter);
  const countByDir = {
    above: items.filter(i => i.direction === 'above').length,
    peer: items.filter(i => i.direction === 'peer').length,
    below: items.filter(i => i.direction === 'below').length,
  };

  return (
    <div className={`glass-panel border-l-4 ${color} overflow-hidden`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-lg">{emoji}</span>
          <div className="text-left">
            <h3 className="text-sm font-bold">{label}</h3>
            <p className="text-[10px] text-muted-foreground">{desc} • {items.length} responses</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
              {(['all', 'above', 'peer', 'below'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setFilter(d)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                    filter === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  {d === 'all' ? `All (${items.length})` : `${DIRECTION_META[d].label} (${countByDir[d]})`}
                </button>
              ))}
            </div>
            <div className="px-4 pb-4 space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
              {filtered.length > 0 ? filtered.map((item, i) => {
                const meta = DIRECTION_META[item.direction as keyof typeof DIRECTION_META] || DIRECTION_META.peer;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30 border border-border/50"
                  >
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 mt-0.5 gap-1 ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </Badge>
                    <p className="text-xs text-foreground/90 leading-relaxed">{item.text}</p>
                  </motion.div>
                );
              }) : (
                <p className="text-xs text-muted-foreground text-center py-4">No feedback from this source yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QualitativeFeedback({ startDoing, stopDoing, continueDoing, labels }: QualitativeFeedbackProps) {
  const data = { startDoing, stopDoing, continueDoing };
  const total = startDoing.length + stopDoing.length + continueDoing.length;

  if (total === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        Qualitative Feedback
        <Badge variant="secondary" className="text-[10px]">{total} responses</Badge>
      </h2>
      <div className="space-y-3">
        {SECTIONS.map(s => (
          <FeedbackSection key={s.key} items={data[s.key]} {...s} {...labels?.[s.key]} />
        ))}
      </div>
    </div>
  );
}
