import { useState } from 'react';
import { BarChart3, CalendarRange, ClipboardList, FolderKanban, MoreHorizontal, Trophy, User } from 'lucide-react';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export type MobileTab = 'survey' | 'dashboard' | 'growth' | 'rankings' | 'profile' | 'projects' | 'leave';

interface MobileTabBarProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const PRIMARY: { key: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'survey', label: 'Appraisal', icon: ClipboardList },
  { key: 'projects', label: 'Planner', icon: FolderKanban },
  { key: 'leave', label: 'Leave', icon: CalendarRange },
];

/**
 * WhatsApp-style fixed bottom tab bar — mobile only (hidden on lg+).
 */
export default function MobileTabBar({ active, onChange }: MobileTabBarProps) {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = active === 'dashboard' || active === 'growth' || active === 'rankings' || active === 'profile';

  const go = (tab: MobileTab) => {
    setMoreOpen(false);
    onChange(tab);
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {PRIMARY.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => go(key)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'
                }`}
              >
                {isActive && (
                  <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 bg-primary" />
                )}
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : ''}`} />
                <span
                  className="text-[10px] font-medium tracking-wide"
                  style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`relative w-full flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                  moreActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'
                }`}
              >
                {moreActive && (
                  <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 bg-primary" />
                )}
                <MoreHorizontal className={`w-5 h-5 ${moreActive ? 'stroke-[2.25]' : ''}`} />
                <span
                  className="text-[10px] font-medium tracking-wide"
                  style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader className="text-left pb-2">
                <SheetTitle className="font-display text-lg">Appraisal</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 pb-6">
                <Button variant="outline" className="h-12 w-full justify-start gap-3 rounded-xl" onClick={() => go('dashboard')}>
                  <BarChart3 className="h-4 w-4" /> My Dashboard
                </Button>
                <Button variant="outline" className="h-12 w-full justify-start gap-3 rounded-xl" onClick={() => go('growth')}>
                  <img src={brand.faviconHref} alt="" className="h-4 w-4 rounded-sm object-contain" /> Growth Hub
                </Button>
                {tenant.capabilities.showRankings && (
                  <Button variant="outline" className="h-12 w-full justify-start gap-3 rounded-xl" onClick={() => go('rankings')}>
                    <Trophy className="h-4 w-4" /> Rankings
                  </Button>
                )}
                <Button variant="outline" className="h-12 w-full justify-start gap-3 rounded-xl" onClick={() => go('profile')}>
                  <User className="h-4 w-4" /> Profile
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
