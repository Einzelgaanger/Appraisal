import { ClipboardList, BarChart3, User } from 'lucide-react';
import { useTenant } from '@/tenants/TenantContext';

export type MobileTab = 'survey' | 'dashboard' | 'growth' | 'rankings' | 'profile';

interface MobileTabBarProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const ALL_TABS: { key: MobileTab; label: string; icon: React.ComponentType<{ className?: string }>; pilot?: boolean }[] = [
  { key: 'survey', label: 'Appraisal', icon: ClipboardList, pilot: true },
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3, pilot: true },
  { key: 'growth', label: 'Growth', icon: BarChart3, pilot: true },
  { key: 'rankings', label: 'Rankings', icon: ClipboardList, pilot: false },
  { key: 'profile', label: 'Profile', icon: User, pilot: true },
];

/**
 * WhatsApp-style fixed bottom tab bar — mobile only (hidden on lg+).
 */
export default function MobileTabBar({ active, onChange }: MobileTabBarProps) {
  const { tenant } = useTenant();
  const tabs = tenant.capabilities.showRankings ? ALL_TABS : ALL_TABS.filter((t) => t.pilot);
  const cols = tabs.length;
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className={`grid grid-cols-${cols}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChange(key)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 bg-primary"
                  />
                )}
                {key === 'growth' ? (
                  <img
                    src="/favicon.png"
                    alt="Growth"
                    className="w-5 h-5 rounded-sm object-contain"
                  />
                ) : (
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : ''}`} />
                )}
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
      </ul>
    </nav>
  );
}
