import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useSkeletonPhase, skeletonPhaseClass } from '@/hooks/useSkeletonPhase';

function PhaseSkeleton({ className, isActive, ...props }: React.ComponentProps<typeof Skeleton> & { isActive: boolean }) {
  const phase = useSkeletonPhase(isActive);
  return (
    <Skeleton
      className={cn('!animate-none', skeletonPhaseClass(phase), className)}
      {...props}
    />
  );
}

/** Full-screen while auth session resolves */
export function AppBootstrapSkeleton() {
  return (
    <div className="app-page min-h-screen flex">
      <div className="hidden lg:flex w-[var(--app-sidebar-w)] shrink-0 flex-col gap-4 border-r border-border/60 bg-sidebar p-5 text-sidebar-foreground">
        <PhaseSkeleton isActive className="h-9 w-28 bg-sidebar-accent/40" />
        <div className="space-y-2 pt-4">
          <PhaseSkeleton isActive className="h-10 w-full bg-sidebar-accent/35" />
          <PhaseSkeleton isActive className="h-10 w-full bg-sidebar-accent/35" />
          <PhaseSkeleton isActive className="h-10 w-full bg-sidebar-accent/35" />
        </div>
        <div className="mt-auto space-y-2">
          <PhaseSkeleton isActive className="h-8 w-full bg-sidebar-accent/30" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="flex w-full max-w-md flex-col gap-4">
          <PhaseSkeleton isActive className="mx-auto h-12 w-48" />
          <PhaseSkeleton isActive className="mx-auto h-4 w-full max-w-xs" />
          <PhaseSkeleton isActive className="h-52 w-full rounded-2xl" />
          <div className="flex justify-center gap-2 pt-2">
            <PhaseSkeleton isActive className="h-10 w-28" />
            <PhaseSkeleton isActive className="h-10 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarStrip({ isActive }: { isActive: boolean }) {
  return (
    <div className="hidden lg:flex w-[var(--app-sidebar-w)] shrink-0 flex-col gap-4 border-r border-border/60 bg-sidebar p-5">
      <PhaseSkeleton isActive={isActive} className="h-8 w-32 bg-sidebar-accent/40" />
      <div className="space-y-2 pt-2">
        <PhaseSkeleton isActive={isActive} className="h-10 w-full bg-sidebar-accent/35" />
        <PhaseSkeleton isActive={isActive} className="h-10 w-full bg-sidebar-accent/35" />
        <PhaseSkeleton isActive={isActive} className="h-10 w-full bg-sidebar-accent/35" />
      </div>
    </div>
  );
}

/** Employee hub / survey initial data load */
export function PlatformHubSkeleton() {
  return (
    <div className="app-page flex min-h-screen">
      <div className="app-page-grid" />
      <SidebarStrip isActive />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="platform-content section-stack p-6 space-y-6">
          <PhaseSkeleton isActive className="h-10 w-full max-w-md" />
          <div className="grid gap-3 sm:grid-cols-2">
            <PhaseSkeleton isActive className="h-24 rounded-2xl" />
            <PhaseSkeleton isActive className="h-24 rounded-2xl" />
            <PhaseSkeleton isActive className="h-24 rounded-2xl sm:col-span-2" />
          </div>
          <PhaseSkeleton isActive className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Admin analytics dashboard (stats + charts) */
export function AdminDashboardSkeleton() {
  return (
    <div className="app-page flex min-h-screen">
      <div className="app-page-grid" />
      <SidebarStrip isActive />
      <div className="flex flex-1 flex-col min-w-0">
        <main className="platform-content section-stack p-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <PhaseSkeleton isActive className="h-12 flex-1 max-w-xl rounded-xl" />
            <PhaseSkeleton isActive className="h-10 w-36 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <PhaseSkeleton key={i} isActive className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PhaseSkeleton isActive className="h-80 rounded-2xl" />
            <PhaseSkeleton isActive className="h-80 rounded-2xl" />
          </div>
          <PhaseSkeleton isActive className="h-48 rounded-2xl" />
        </main>
      </div>
    </div>
  );
}

/** Demo dashboard — same grid, no sidebar */
export function DemoDashboardSkeleton() {
  return (
    <div className="app-page min-h-screen p-6 space-y-6">
      <PhaseSkeleton isActive className="h-8 w-64 mx-auto rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PhaseSkeleton key={i} isActive className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PhaseSkeleton isActive className="h-80 rounded-2xl" />
        <PhaseSkeleton isActive className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

/** Employee hub “My dashboard” tab */
export function EmployeeDashboardTabSkeleton() {
  return (
    <div className="space-y-6">
      <PhaseSkeleton isActive className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <PhaseSkeleton key={i} isActive className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PhaseSkeleton isActive className="h-72 rounded-2xl" />
        <PhaseSkeleton isActive className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

/** Rankings / wall of fame */
export function RankingsTabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <PhaseSkeleton isActive className="mx-auto h-8 w-56" />
        <PhaseSkeleton isActive className="mx-auto h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <PhaseSkeleton key={i} isActive className="h-40 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <PhaseSkeleton key={i} isActive className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Standalone employee dashboard page */
export function EmployeeDashboardPageSkeleton() {
  return (
    <div className="app-page flex min-h-screen">
      <div className="app-page-grid" />
      <SidebarStrip isActive />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="platform-content section-stack p-6">
          <EmployeeDashboardTabSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Wall of Fame standalone page */
export function WallOfFamePageSkeleton() {
  return (
    <div className="app-page flex min-h-screen">
      <div className="app-page-grid" />
      <SidebarStrip isActive />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="platform-content section-stack p-6">
          <RankingsTabSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Appraisal admin heavy tables + charts */
export function AppraisalAdminSkeleton() {
  return (
    <div className="app-page min-h-screen space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <PhaseSkeleton isActive className="h-9 w-28" />
        <PhaseSkeleton isActive className="h-9 flex-1 min-w-[200px] max-w-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PhaseSkeleton key={i} isActive className="h-24 rounded-xl" />
        ))}
      </div>
      <PhaseSkeleton isActive className="h-64 w-full rounded-2xl" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <PhaseSkeleton key={i} isActive className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
