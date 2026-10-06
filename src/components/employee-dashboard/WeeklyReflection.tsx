import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
interface Props { userId: string; }

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 sun
  const diff = (day + 6) % 7; // back to monday
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function WeeklyReflection({ userId }: Props) {
  const weekStart = startOfWeek();
  const weekISO = weekStart.toISOString().slice(0, 10);

  const [learned, setLearned] = useState('');
  const [changed, setChanged] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasEntry, setHasEntry] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('learning_reflections')
        .select('what_i_learned, what_changed, what_next')
        .eq('user_id', userId)
        .eq('week_starting', weekISO)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setLearned(data.what_i_learned || '');
        setChanged(data.what_changed || '');
        setNext(data.what_next || '');
        setHasEntry(true);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId, weekISO]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('learning_reflections').upsert({
        user_id: userId,
        week_starting: weekISO,
        what_i_learned: learned.slice(0, 1500),
        what_changed: changed.slice(0, 1500),
        what_next: next.slice(0, 1500),
      }, { onConflict: 'user_id,week_starting' });
      if (error) throw error;
      setHasEntry(true);
      toast.success('Reflection saved. The recommender will use it.');
    } catch (e) {
      console.error(e);
      toast.error('Could not save reflection');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const weekLabel = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="brutal p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="eyebrow mb-1">◉ Weekly Reflection · Week of {weekLabel}</div>
          <h3 className="font-display text-lg font-medium leading-tight">
            {hasEntry ? 'Edit this week\'s notes' : 'Three quick prompts. Two minutes.'}
          </h3>
        </div>
        {hasEntry && <span className="tag-green">Saved</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="What did you learn?" value={learned} onChange={setLearned} placeholder="One thing that stuck." />
        <Field label="What changed in how you work?" value={changed} onChange={setChanged} placeholder="Even something small." />
        <Field label="What do you want to learn next?" value={next} onChange={setNext} placeholder="The recommender will adapt." />
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving} variant="green" size="sm">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          <span className="ml-2">Save reflection</span>
        </Button>
      </div>
    </motion.div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-foreground">{label}</div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[88px] border-2 border-foreground rounded-sm text-sm resize-none focus-visible:ring-0 focus-visible:shadow-[3px_3px_0_0_hsl(var(--foreground))] focus-visible:-translate-x-[1px] focus-visible:-translate-y-[1px] transition-all"
      />
    </label>
  );
}
