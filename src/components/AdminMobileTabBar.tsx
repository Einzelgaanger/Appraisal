import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, ClipboardList, Brain, MoreHorizontal, RefreshCw, LogOut, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useTenant } from '@/tenants/TenantContext';

type AdminMobileTabBarProps = {
  onOpenCopilot: () => void;
  onSignOut: () => void | Promise<void>;
  /** When set, shows Refresh in the More sheet (e.g. Appraisal monitor). */
  onRefresh?: () => void;
};

const tabInner = 'relative flex w-full flex-col items-center justify-center gap-1 py-2.5';

/**
 * Bottom navigation for admin routes — mirrors employee MobileTabBar pattern.
 */
export default function AdminMobileTabBar({ onOpenCopilot, onSignOut, onRefresh }: AdminMobileTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const showLegacyDashboard = tenant.capabilities.showLegacyDashboard;

  return (
    <nav
      aria-label="Admin navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        <li>
          <NavLink
            to={showLegacyDashboard ? '/dashboard' : '/hub?tab=survey'}
            end
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              cn('block w-full text-muted-foreground transition-colors', isActive && 'text-primary')
            }
          >
            {({ isActive }) => (
              <span className={tabInner}>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 bg-primary"
                  />
                )}
                <BarChart3 className={cn('h-5 w-5', isActive && 'stroke-[2.25]')} />
                <span className="text-[10px] font-medium tracking-wide font-mono uppercase">
                  {showLegacyDashboard ? 'Overview' : 'Hub'}
                </span>
              </span>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/appraisal"
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              cn('block w-full text-muted-foreground transition-colors', isActive && 'text-primary')
            }
          >
            {({ isActive }) => (
              <span className={tabInner}>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 bg-primary"
                  />
                )}
                <ClipboardList className={cn('h-5 w-5', isActive && 'stroke-[2.25]')} />
                <span className="text-[10px] font-medium tracking-wide font-mono uppercase">360°</span>
              </span>
            )}
          </NavLink>
        </li>
        <li>
          <button
            type="button"
            className="block w-full text-muted-foreground active:text-foreground"
            onClick={() => {
              setMoreOpen(false);
              onOpenCopilot();
            }}
          >
            <span className={tabInner}>
              <Brain className="h-5 w-5" />
              <span className="text-[10px] font-medium tracking-wide font-mono uppercase">AI</span>
            </span>
          </button>
        </li>
        <li>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button type="button" className="block w-full text-muted-foreground active:text-foreground">
                <span className={tabInner}>
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="text-[10px] font-medium tracking-wide font-mono uppercase">More</span>
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader className="text-left pb-2">
                <SheetTitle className="font-display text-lg">Admin</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 pb-6">
                {onRefresh && (
                  <Button
                    variant="outline"
                    className="h-12 w-full justify-start gap-3 rounded-xl"
                    onClick={() => {
                      onRefresh();
                      setMoreOpen(false);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" /> Refresh data
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-12 w-full justify-start gap-3 rounded-xl"
                  onClick={() => {
                    setMoreOpen(false);
                    void navigate('/');
                  }}
                >
                  <Home className="h-4 w-4" /> Home
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full justify-start gap-3 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => {
                    setMoreOpen(false);
                    void onSignOut();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
