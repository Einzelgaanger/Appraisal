import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type WorkspacePortalAccent = 'apex' | 'executive' | 'ghc' | 'vigipay';

/** Full-viewport shell for vgg.tools / company entry — no page scroll. */
export default function WorkspacePortalShell({
  header,
  footer,
  children,
  editorialPanel,
  mobileHero,
  className,
  accent = 'apex',
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Desktop right column — photo + caption (lg+). */
  editorialPanel?: ReactNode;
  /** Mobile top photo strip (optional). */
  mobileHero?: ReactNode;
  className?: string;
  accent?: WorkspacePortalAccent;
}) {
  const accentClass =
    accent === 'executive'
      ? 'workspace-portal-shell--executive'
      : accent === 'ghc'
        ? 'workspace-portal-shell--ghc'
        : accent === 'vigipay'
          ? 'workspace-portal-shell--vigipay'
          : '';

  return (
    <div className={cn('workspace-portal-shell text-foreground', accentClass, className)}>
      <div className="workspace-portal-rail" aria-hidden />
      <div className="workspace-portal-bg" aria-hidden />
      <div className="workspace-portal-glow" aria-hidden />
      <div className="workspace-portal-orb workspace-portal-orb-a" aria-hidden />
      <div className="workspace-portal-orb workspace-portal-orb-b" aria-hidden />
      {header}
      <main className="relative z-[1] grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-h-0 flex-col overflow-hidden">
          {mobileHero}
          <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-3 sm:px-8 sm:py-4">
            {children}
          </div>
        </div>
        {editorialPanel && (
          <div className="workspace-portal-editorial-panel hidden min-h-0 lg:flex">{editorialPanel}</div>
        )}
      </main>
      {footer}
    </div>
  );
}
