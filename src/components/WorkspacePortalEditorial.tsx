import heroHub from '@/assets/hero-hub.jpg';
import heroFeedbackSession from '@/assets/hero-feedback-session.jpg';
import heroReflectionData from '@/assets/hero-reflection-data.jpg';

const IMAGES = {
  apex: heroHub,
  executive: heroFeedbackSession,
  ghc: heroHub,
  vigipay: heroReflectionData,
} as const;

export default function WorkspacePortalEditorial({
  variant = 'apex',
  figure,
  title,
  body,
}: {
  variant?: keyof typeof IMAGES;
  figure: string;
  title: string;
  body: string;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-3 xl:px-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ VGG Platform</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Vol. 02 · Workspace</span>
      </div>
      <div className="workspace-portal-photo-frame">
        <img src={IMAGES[variant]} alt="" decoding="async" />
      </div>
      <div className="shrink-0 border-t border-border/60 bg-card/60 px-6 py-5 backdrop-blur-sm xl:px-8 xl:py-6">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{figure}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <h2 className="font-display mt-3 text-xl font-medium leading-tight tracking-tight text-foreground xl:text-2xl">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground xl:text-sm">{body}</p>
      </div>
    </>
  );
}
