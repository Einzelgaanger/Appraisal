import { Button } from '@/components/ui/button';
import {
  LogOut,
  ClipboardList,
  BarChart3,
  MessageSquare,
  Sparkles,
  Users,
  FileText,
  LayoutDashboard,
  Building2,
  UserCheck,
  AlertTriangle,
  Layers,
  CalendarRange,
  Lightbulb,
  ListChecks,
  UserCog,
  Percent,
  Scale,
  Bell,
  Settings,
  FormInput,
  Download,
  EyeOff,
} from 'lucide-react';
import vggLogo from '@/assets/vgg-logo.webp';
import type { MvpRoleMeta } from './mvpTypes';
import { MVP_PERIOD } from './mvpMockData';

type Props = {
  role: MvpRoleMeta;
  activeNav: string;
  onNav: (key: string) => void;
  children: React.ReactNode;
};

const NAV_ICONS: Record<string, React.ReactNode> = {
  tasks: <ClipboardList className="w-4 h-4" />,
  dashboard: <BarChart3 className="w-4 h-4" />,
  feedback: <MessageSquare className="w-4 h-4" />,
  growth: <Sparkles className="w-4 h-4" />,
  discussions: <MessageSquare className="w-4 h-4" />,
  team: <Users className="w-4 h-4" />,
  reviews: <FileText className="w-4 h-4" />,
  comments: <MessageSquare className="w-4 h-4" />,
  assignments: <ListChecks className="w-4 h-4" />,
  guide: <EyeOff className="w-4 h-4" />,
  command: <LayoutDashboard className="w-4 h-4" />,
  units: <Building2 className="w-4 h-4" />,
  reports: <UserCheck className="w-4 h-4" />,
  talent: <AlertTriangle className="w-4 h-4" />,
  themes: <Layers className="w-4 h-4" />,
  cycle: <CalendarRange className="w-4 h-4" />,
  insights: <Lightbulb className="w-4 h-4" />,
  roster: <UserCog className="w-4 h-4" />,
  completion: <Percent className="w-4 h-4" />,
  fairness: <Scale className="w-4 h-4" />,
  comms: <Bell className="w-4 h-4" />,
  overview: <LayoutDashboard className="w-4 h-4" />,
  config: <Settings className="w-4 h-4" />,
  forms: <FormInput className="w-4 h-4" />,
  analytics: <BarChart3 className="w-4 h-4" />,
  export: <Download className="w-4 h-4" />,
};

function navIcon(key: string) {
  return NAV_ICONS[key] ?? <ClipboardList className="w-4 h-4" />;
}

export default function MvpRoleShell({ role, activeNav, onNav, children }: Props) {
  const meta = [
    { label: 'Role', value: role.tabLabel },
    { label: 'Unit', value: role.personaUnit },
    { label: 'Period', value: MVP_PERIOD },
  ];

  return (
    <div className="relative min-h-[calc(100vh-4.5rem)]">
      <aside className="hidden lg:flex fixed left-0 top-[4.25rem] bottom-0 z-30 w-[var(--app-sidebar-w)] flex-col border-r border-border bg-background">
        <div className="px-6 pt-6 pb-5 border-b border-border shrink-0">
          <img src={vggLogo} alt="Venture Garden Group" className="h-8 w-auto" />
          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              ◉ Workspace
            </p>
            <h2 className="font-display mt-1.5 text-base font-medium text-foreground">{role.personaName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{role.personaTitle}</p>
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {meta.map((entry) => (
              <div key={entry.label} className="flex items-start justify-between gap-2 text-[11px] leading-tight">
                <span className="font-mono uppercase tracking-[0.16em] text-muted-foreground">{entry.label}</span>
                <span className="font-medium text-foreground text-right">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="MVP role navigation">
          {role.nav.map((item) => {
            const active = item.key === activeNav;
            return (
              <Button
                key={item.key}
                variant="ghost"
                size="sm"
                onClick={() => onNav(item.key)}
                className={`relative w-full justify-start gap-2.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.16em] ${
                  active
                    ? 'bg-foreground text-background hover:bg-foreground hover:text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-paper-deep/60'
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 bg-primary" />}
                {navIcon(item.key)}
                {item.label}
              </Button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" className="w-full gap-2" disabled>
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </aside>

      <div className="app-sidebar-offset min-w-0 bg-[hsl(var(--paper))]">
        <header
          className="lg:hidden sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-md"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex h-14 items-center gap-3 px-4">
            <img src={vggLogo} alt="Venture Garden Group" className="h-6 w-auto flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-medium text-foreground">{role.personaName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{role.personaTitle}</p>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-3">
            {role.nav.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNav(item.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] border ${
                  item.key === activeNav
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-muted-foreground border-border'
                }`}
              >
                {navIcon(item.key)}
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
