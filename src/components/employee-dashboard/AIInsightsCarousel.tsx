import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ENABLE_APP_AI } from '@/lib/featureFlags';

const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000; // Re-generate every 2 hours

interface AIInsightsCarouselProps {
  dataContext: string;
}

export default function AIInsightsCarousel({ dataContext }: AIInsightsCarouselProps) {
  if (!ENABLE_APP_AI) return null;

  const [insights, setInsights] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const generateInsights = useCallback(async () => {
    if (!dataContext) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('chat', {
        body: {
          dataContext,
          messages: [{
            role: 'user',
            content: `Based on this employee's performance data, generate exactly 6 short, specific, actionable insights. Each insight should be 1-2 sentences max. Focus on:
1. A key strength based on highest scoring category
2. An area needing improvement based on lowest scoring category
3. How leadership views this person vs peers
4. A pattern in the qualitative feedback
5. A specific actionable recommendation
6. An encouraging observation about their overall performance

Return ONLY a JSON array of strings, no markdown, no explanation. Example: ["Insight 1", "Insight 2", ...]`
          }],
        },
      });

      if (fnError) throw fnError;

      // Parse the streamed response
      let fullText = '';
      if (typeof data === 'string') {
        // Parse SSE stream
        const lines = data.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullText += content;
          } catch { /* skip */ }
        }
      } else if (data?.choices?.[0]?.message?.content) {
        fullText = data.choices[0].message.content;
      }

      // Extract JSON array from response
      const match = fullText.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setInsights(parsed.filter((s: any) => typeof s === 'string' && s.trim()));
          setCurrentIndex(0);
          setLoading(false);
          return;
        }
      }
      
      // Fallback: split by newlines if JSON parse fails
      const fallback = fullText.split('\n').filter(l => l.trim().length > 10).map(l => l.replace(/^\d+\.\s*/, '').replace(/^["•\-*]\s*/, '').trim());
      if (fallback.length > 0) {
        setInsights(fallback.slice(0, 6));
        setCurrentIndex(0);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('AI insights error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [dataContext]);

  // Initial generation + periodic refresh every 2 hours
  useEffect(() => {
    generateInsights();
    const interval = setInterval(() => {
      generateInsights();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [generateInsights]);

  // Rotate insights
  useEffect(() => {
    if (insights.length <= 1) return;
    const duration = Math.min(10000, Math.max(5000, (insights[currentIndex]?.length || 50) * 80));
    timerRef.current = setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % insights.length);
    }, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentIndex, insights]);

  if (error || (!loading && insights.length === 0)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4 relative overflow-hidden"
    >
      {/* Subtle shimmer background */}
      <div className="absolute inset-0 bg-primary/[0.04] pointer-events-none" />
      
      <div className="flex items-start gap-3 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {loading ? (
            <div className="flex gap-0.5">
              <span className="h-3 w-1 rounded-full bg-primary/50 skeleton-pulse-fast" />
              <span className="h-3 w-1 rounded-full bg-primary/40 skeleton-pulse-slow" />
              <span className="h-3 w-1 rounded-full bg-primary/35 skeleton-pulse-slow" />
            </div>
          ) : (
            <Sparkles className="w-4 h-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-teal-800">Insight</p>
            {insights.length > 1 && (
              <div className="flex gap-0.5">
                {insights.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? 'bg-primary' : 'bg-muted'}`} />
                ))}
              </div>
            )}
          </div>
          <div className="h-[40px] flex items-center w-full">
            {loading ? (
              <div className="space-y-2 w-full pr-4">
                <div className="h-2 rounded-full bg-muted skeleton-pulse-fast w-full max-w-[min(100%,22rem)]" />
                <div className="h-2 rounded-full bg-muted skeleton-pulse-slow w-[88%] max-w-[min(100%,20rem)]" />
                <p className="text-[11px] text-muted-foreground pt-0.5">Analyzing your performance data…</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  className="text-xs text-foreground/90 leading-relaxed"
                >
                  {insights[currentIndex]}
                </motion.p>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
