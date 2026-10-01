import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { groupCompaniesAppraisalOverview } from '@/modules/ghc/ghcApi';
import { getTenantBySlug, getTenantProductionHost } from '@/tenants/config';
import { defaultMonthPeriod, defaultQuarterPeriod } from '@/lib/boomPeriods';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';

type GhcStats = {
  roster?: number;
  monthlySelfSubmitted?: number;
  monthlySelfOpen?: number;
  peer360Submitted?: number;
  peer360Expected?: number;
  evaluationsSubmitted?: number;
  evaluationsAcknowledged?: number;
  peer360ReleasedAt?: string | null;
};

type ExecutiveStats = {
  roster?: number;
  peer360Submitted?: number;
  peer360Expected?: number;
  peer360Released?: boolean;
};

type CompanyRow = {
  employee_id: string;
  company_name: string;
  tenant_slug: string | null;
  appraisal_mode: string | null;
  employee_role: string | null;
  ghc_stats: GhcStats | null;
  executive_stats: ExecutiveStats | null;
};

export default function GroupCompaniesOverview({
  periodQuarter = defaultQuarterPeriod(),
  periodMonth = defaultMonthPeriod(),
}: {
  periodQuarter?: string;
  periodMonth?: string;
}) {
  const { companies, switchCompany } = useEmployeeAuth();
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await groupCompaniesAppraisalOverview(periodQuarter, periodMonth);
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load group overview');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periodMonth, periodQuarter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCompany = async (row: CompanyRow) => {
    const slug = row.tenant_slug;
    if (!slug) return;
    const active = companies.find((c) => c.is_active);
    if (active?.employee_id !== row.employee_id) {
      const { error } = await switchCompany(row.employee_id);
      if (error) {
        toast.error(error);
        return;
      }
    }
    const tenantConfig = getTenantBySlug(slug);
    if (!tenantConfig) return;
    const host = getTenantProductionHost(tenantConfig);
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const base = isLocal ? window.location.origin : `https://${host}`;
    const path =
      row.appraisal_mode === 'boom'
        ? `${base}/hub?tab=survey&boomQuarter=${encodeURIComponent(periodQuarter)}`
        : `${base}/hub?tab=survey&tenant=${encodeURIComponent(slug)}&ghcQuarter=${encodeURIComponent(periodQuarter)}&ghcMonth=${encodeURIComponent(periodMonth)}`;
    window.location.assign(path);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading group overview…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="glass-panel p-6 text-sm text-muted-foreground">
        No cross-company data yet. If you lead multiple companies, ask People Ops to link your login to each roster row.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-medium tracking-tight">Group appraisal overview</h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Q3 progress across every company your login can access. Switch companies with the menu in the sidebar, or open a
          workspace directly below.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {periodMonth} · {periodQuarter}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const g = row.ghc_stats;
          const x = row.executive_stats;
          const isGhc = !!g;
          return (
            <div key={row.employee_id} className="glass-panel p-5 flex flex-col gap-3">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{row.tenant_slug ?? '—'}</p>
                <h3 className="text-lg font-semibold">{row.company_name}</h3>
                {row.employee_role && (
                  <p className="text-xs text-muted-foreground mt-0.5">Your role: {row.employee_role}</p>
                )}
              </div>

              {isGhc && g && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-lg font-bold">{g.monthlySelfSubmitted ?? 0}/{g.roster ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Self check-in</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">
                      {g.peer360Submitted ?? 0}/{g.peer360Expected ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">360 submitted</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{g.evaluationsSubmitted ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Evaluations in</p>
                  </div>
                  <div className="flex items-start">
                    {g.peer360ReleasedAt ? (
                      <Badge className="text-[10px]">360 released</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">360 not released</Badge>
                    )}
                  </div>
                </div>
              )}

              {!isGhc && x && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-lg font-bold">{x.peer360Submitted ?? 0}/{x.peer360Expected ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Peer 360 submitted</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{x.roster ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Executive roster</p>
                  </div>
                  <div className="col-span-2">
                    {x.peer360Released ? (
                      <Badge className="text-[10px]">Results released to team</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">360 results gated</Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Button size="sm" className="h-8 text-xs gap-1" onClick={() => void openCompany(row)}>
                  Open workspace <ExternalLink className="h-3 w-3" />
                </Button>
                {row.tenant_slug && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                    <Link
                      to={
                        row.appraisal_mode === 'boom'
                          ? `/hub?tab=survey&boomQuarter=${periodQuarter}`
                          : `/hub?tab=survey&tenant=${row.tenant_slug}&ghcQuarter=${periodQuarter}&ghcMonth=${periodMonth}&ghcTab=${row.appraisal_mode === 'ghc' || row.appraisal_mode === 'vigipay' ? 'admin' : 'tasks'}`
                      }
                    >
                      Monitor / tasks
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="ghost" size="sm" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );
}
