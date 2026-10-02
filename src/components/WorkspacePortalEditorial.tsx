import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import heroHub from '@/assets/hero-hub.jpg';

export function WorkspacePortalGallery({ className }: { className?: string }) {
  return (
    <div className={cn('workspace-portal-gallery', className)} aria-hidden>
      <img src={heroHub} alt="" decoding="async" />
    </div>
  );
}

export default function WorkspacePortalEditorial({
  figure,
  title,
  body,
}: {
  figure?: string;
  title?: ReactNode;
  body: string;
}) {
  return (
    <>
      <div className="workspace-portal-photo-frame">
        <WorkspacePortalGallery />
      </div>
      <div className="shrink-0 border-t border-border/60 bg-card/60 px-6 py-5 backdrop-blur-sm xl:px-8 xl:py-6">
        {figure ? (
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{figure}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        ) : (
          <div className="h-px bg-border" />
        )}
        {title ? (
          <h2 className="font-display mt-3 text-xl font-medium leading-tight tracking-tight text-foreground xl:text-2xl">
            {title}
          </h2>
        ) : null}
        <p className={title ? 'mt-2 text-xs leading-relaxed text-muted-foreground xl:text-sm' : 'text-xs leading-relaxed text-muted-foreground xl:text-sm'}>{body}</p>
      </div>
    </>
  );
}
