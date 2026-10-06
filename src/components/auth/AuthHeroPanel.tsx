import type { ReactNode } from 'react';
import heroReflectionData from '@/assets/hero-reflection-data.jpg';
import heroFeedbackSession from '@/assets/hero-feedback-session.jpg';

type AuthHeroPanelProps = {
  eyebrow?: string;
  title: string;
  description: string;
  variant?: 'login' | 'hub';
  children?: ReactNode;
};

/**
 * Editorial split-screen left panel: photo + magazine masthead + caption.
 * Hairline rules, cream paper, ink frame around image. STRICT FLAT.
 */
export function AuthHeroPanel({
  eyebrow = 'VGG / 360°',
  title,
  description,
  variant = 'login',
  children,
}: AuthHeroPanelProps) {
  const art = variant === 'hub' ? heroReflectionData : heroFeedbackSession;
  const caption = variant === 'hub' ? 'Fig. 03 — Reflection with analytics' : 'Fig. 01 — Feedback with data';

  return (
    <aside className="relative hidden min-h-0 w-[48%] flex-col bg-paper-deep/40 lg:flex">
      {/* Top metadata bar */}
      <div className="flex items-center justify-between border-b border-border px-8 py-4">
        <span className="text-sm text-muted-foreground">{eyebrow}</span>
        <span className="text-sm text-muted-foreground">Issue 03</span>
      </div>

      {/* Editorial photo */}
      <div className="relative flex-1 p-8 xl:p-12">
        <div className="ink-frame relative h-full w-full overflow-hidden">
          <img
            src={art}
            alt={caption}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Caption block */}
      <div className="border-t border-border bg-card px-8 py-8 xl:px-12">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-muted-foreground">360</span>
          <div className="h-px flex-1 bg-border" />
          <span className="text-sm text-muted-foreground">{caption}</span>
        </div>
        <h2 className="font-display mt-4 text-3xl font-medium leading-[0.98] tracking-[-0.03em] text-foreground xl:text-[2.5rem]">
          {title}
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
        {children}
      </div>
    </aside>
  );
}
